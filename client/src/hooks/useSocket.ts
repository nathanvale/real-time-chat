import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { SESSION_STORAGE_KEY } from '../../../shared/constants'
import type {
	ClientToServerEvents,
	ServerToClientEvents,
} from '../../../shared/types'

/**
 * Connection error from Socket.IO middleware rejection.
 * Separate from room:error (post-connect domain errors).
 */
type ConnectionError = {
	code: string
	message: string
}

/**
 * Manages Socket.IO connection lifecycle.
 *
 * Creates a single socket instance with autoConnect: false.
 * The socket connects only after the client has a JWT token.
 * On page refresh with existing token, connects immediately.
 *
 * Two error channels:
 * - connect_error: auth/handshake failures (JWT middleware rejection)
 * - room:error: post-connect domain errors
 *
 * @returns Object containing socket instance, connection status, connect method, and connection error
 */
export const useSocket = () => {
	const socketRef = useRef<Socket<
		ServerToClientEvents,
		ClientToServerEvents
	> | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [connectionError, setConnectionError] =
		useState<ConnectionError | null>(null)

	// Create socket instance once on mount (autoConnect: false)
	if (!socketRef.current) {
		const serverUrl =
			import.meta.env.MODE === 'development' ? 'http://localhost:3001' : '/'

		socketRef.current = io(serverUrl, {
			autoConnect: false,
			transports: ['websocket', 'polling'],
		})
	}

	/**
	 * Connect the socket with a JWT token.
	 * Sets socket.auth and calls socket.connect().
	 * Returns a promise that resolves on connect or rejects on connect_error.
	 *
	 * @param token - JWT token from /api/auth
	 */
	const connect = useCallback((token: string): Promise<void> => {
		return new Promise((resolve, reject) => {
			const socket = socketRef.current
			if (!socket) {
				reject(new Error('Socket not initialized'))
				return
			}

			// If already connected, just update auth for next reconnect
			if (socket.connected) {
				socket.auth = { token }
				resolve()
				return
			}

			socket.auth = { token }

			const onConnect = () => {
				cleanup()
				resolve()
			}

			const onError = (err: Error & { data?: ConnectionError }) => {
				cleanup()
				const connError: ConnectionError = err.data || {
					code: 'UNKNOWN',
					message: err.message,
				}
				setConnectionError(connError)
				reject(err)
			}

			const cleanup = () => {
				socket.off('connect', onConnect)
				socket.off('connect_error', onError)
			}

			socket.on('connect', onConnect)
			socket.on('connect_error', onError)
			socket.connect()
		})
	}, [])

	/**
	 * Delayed disconnect timer ref. StrictMode unmount schedules disconnect
	 * after 100ms; if StrictMode remounts (synchronous, <1ms), the new effect
	 * clears the timer before it fires. Real unmount: timer fires, socket disconnects.
	 */
	const disconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()

	useEffect(() => {
		const socket = socketRef.current
		if (!socket) return

		// Cancel any pending disconnect from a previous StrictMode unmount cycle
		clearTimeout(disconnectTimerRef.current)

		const handleConnect = () => {
			setIsConnected(true)
			setConnectionError(null)
		}

		const handleDisconnect = () => {
			setIsConnected(false)
		}

		const handleConnectError = (err: Error & { data?: ConnectionError }) => {
			const connError: ConnectionError = err.data || {
				code: 'UNKNOWN',
				message: err.message,
			}
			setConnectionError(connError)
		}

		socket.on('connect', handleConnect)
		socket.on('disconnect', handleDisconnect)
		socket.on('connect_error', handleConnectError)

		// Set initial connection state
		setIsConnected(socket.connected)

		// Auto-connect on mount if token exists in sessionStorage
		if (!socket.connected) {
			const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
			let token: string | undefined
			if (stored) {
				try {
					token = (JSON.parse(stored) as { token?: string }).token
				} catch {
					sessionStorage.removeItem(SESSION_STORAGE_KEY)
				}
			}
			if (token) {
				socket.auth = { token }
				socket.connect()
			}
		}

		// Cleanup: remove listeners and schedule disconnect.
		// Delay disconnect so StrictMode's synchronous remount can cancel it.
		return () => {
			socket.off('connect', handleConnect)
			socket.off('disconnect', handleDisconnect)
			socket.off('connect_error', handleConnectError)

			disconnectTimerRef.current = setTimeout(() => {
				socket.disconnect()
			}, 100)
		}
	}, [])

	return {
		socket: socketRef.current,
		isConnected,
		connect,
		connectionError,
	}
}

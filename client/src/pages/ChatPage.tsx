import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ChatError, GetMessagesResponse } from '../../../shared/types'
import { ChatHeader } from '../components/ChatHeader/ChatHeader'
import { ConnectionStatus } from '../components/ConnectionStatus/ConnectionStatus'
import { MessageInput } from '../components/MessageInput/MessageInput'
import { MessageList } from '../components/MessageList/MessageList'
import { TypingIndicator } from '../components/TypingIndicator/TypingIndicator'
import { useChatContext } from '../contexts/ChatContext'
import { useSocketContext } from '../contexts/SocketContext'
import { useSession } from '../hooks/useSession'
import { apiFetch } from '../utils/apiFetch'
import styles from './ChatPage.module.scss'

type JoinState = 'idle' | 'joining' | 'joined'

/**
 * Chat page component that orchestrates the real-time chat interface.
 *
 * On mount:
 * 1. Validates session exists with matching room code
 * 2. Fetches message history via REST (GET /api/rooms/:code/messages)
 * 3. Joins room via Socket.IO for real-time events (presence, live messages)
 *
 * REST for initial data load, Socket.IO for real-time push - same hybrid pattern
 * as Ethos API + WebSocket in Ellucian Experience.
 *
 * @returns Chat page JSX with all chat components
 */
export const ChatPage = () => {
	const { code } = useParams<{ code: string }>()
	const navigate = useNavigate()
	const { socket, isConnected, connectionError } = useSocketContext()
	const { getSession, clearSession } = useSession()
	const { dispatch } = useChatContext()

	const [joinState, setJoinState] = useState<JoinState>('idle')

	/**
	 * Validate session, fetch message history via REST, then join via Socket.IO.
	 *
	 * Why isConnected is in deps: On page refresh, the socket may not be connected
	 * when the effect first runs. Including isConnected re-runs the effect when the
	 * socket connects, so the room:join emit actually fires.
	 *
	 * Why a single effect: The room:joined/room:error listeners MUST be registered
	 * before emitting room:join, otherwise StrictMode's double-mount can cause the
	 * server response to arrive between listener cleanup and re-registration.
	 */
	useEffect(() => {
		const session = getSession()

		// No session or session doesn't match URL room code - redirect to lobby
		if (!session || session.roomCode !== code) {
			navigate(`/?roomCode=${code}`, { replace: true })
			return
		}

		// Wait for socket connection before attempting to join
		if (!isConnected) return

		let cancelled = false

		const handleRoomJoined = () => {
			if (!cancelled) {
				setJoinState('joined')
			}
		}

		const handleRoomError = (data: ChatError) => {
			if (!cancelled) {
				navigate(
					`/?roomCode=${code}&error=${encodeURIComponent(data.message)}`,
					{ replace: true },
				)
			}
		}

		// Register listeners BEFORE emitting to avoid StrictMode race condition
		socket.on('room:joined', handleRoomJoined)
		socket.on('room:error', handleRoomError)

		/**
		 * Fetch messages via REST, then join room via Socket.IO.
		 * REST provides initial message history, Socket.IO handles live events.
		 */
		const initRoom = async () => {
			try {
				// Fetch message history via REST
				const { messages } = await apiFetch<GetMessagesResponse>(
					`/api/rooms/${code}/messages?limit=50`,
				)

				if (!cancelled) {
					dispatch({ type: 'SET_MESSAGES', payload: { messages } })
				}
			} catch {
				// If REST fetch fails (room doesn't exist, auth expired), let Socket.IO handle it
				// The room:error listener will redirect to lobby
			}

			// Join room via Socket.IO for presence + live messages
			if (!cancelled) {
				setJoinState('joining')
				socket.emit('room:join', {
					roomCode: session.roomCode,
					sessionId: session.sessionId,
				})
			}
		}

		initRoom()

		return () => {
			cancelled = true
			socket.off('room:joined', handleRoomJoined)
			socket.off('room:error', handleRoomError)
		}
	}, [code, socket, isConnected, getSession, navigate, dispatch])

	// Handle JWT authentication failures (expired token on page refresh)
	useEffect(() => {
		if (connectionError?.code === 'AUTH_REQUIRED') {
			clearSession()
			navigate(
				`/?roomCode=${code}&error=${encodeURIComponent(connectionError.message)}`,
				{ replace: true },
			)
		}
	}, [connectionError, clearSession, navigate, code])

	// Update document title when in a chat room
	useEffect(() => {
		if (code) {
			document.title = `Room ${code} - Real-Time Chat`
		}
		return () => {
			document.title = 'Real-Time Chat'
		}
	}, [code])

	// Show loading state while connecting or joining
	if (!isConnected) {
		return (
			<div className={styles.container}>
				<div className={styles.loadingState}>
					<div className={styles.spinner} aria-hidden="true" />
					<p className={styles.loadingText}>Connecting...</p>
				</div>
			</div>
		)
	}

	if (joinState !== 'joined') {
		return (
			<div className={styles.container}>
				<div className={styles.loadingState}>
					<div className={styles.spinner} aria-hidden="true" />
					<p className={styles.loadingText}>Joining room...</p>
				</div>
			</div>
		)
	}

	return (
		<div className={styles.container}>
			<ConnectionStatus />
			<ChatHeader />
			<MessageList />
			<TypingIndicator />
			<MessageInput />
		</div>
	)
}

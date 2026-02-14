import { createContext, type ReactNode, useContext } from 'react'
import type { Socket } from 'socket.io-client'
import type {
	ClientToServerEvents,
	ServerToClientEvents,
} from '../../../shared/types'
import { useSocket } from '../hooks/useSocket'

/**
 * Context value providing socket instance, connection state, and connect method.
 */
type SocketContextValue = {
	socket: Socket<ServerToClientEvents, ClientToServerEvents>
	isConnected: boolean
	connect: (token: string) => Promise<void>
	connectionError: { code: string; message: string } | null
}

const SocketContext = createContext<SocketContextValue | null>(null)

/**
 * Provider component that creates a single Socket.IO instance at the app root.
 *
 * Socket is created with autoConnect: false. Connection happens only after
 * authentication via the connect() method or automatic reconnection with
 * an existing token from sessionStorage.
 *
 * @param props - Component props
 * @param props.children - Child components that can access socket context
 */
export const SocketProvider = ({ children }: { children: ReactNode }) => {
	const { socket, isConnected, connect, connectionError } = useSocket()

	// Wait for socket to be created before rendering children
	if (!socket) {
		return null
	}

	return (
		<SocketContext.Provider
			value={{ socket, isConnected, connect, connectionError }}
		>
			{children}
		</SocketContext.Provider>
	)
}

/**
 * Hook to access socket context.
 *
 * Must be used within a SocketProvider component tree.
 * Throws an error if used outside the provider to catch misuse early.
 *
 * @returns Socket instance, connection state, connect method, and connection error
 * @throws Error if used outside SocketProvider
 */
export const useSocketContext = (): SocketContextValue => {
	const context = useContext(SocketContext)

	if (!context) {
		throw new Error('useSocketContext must be used within SocketProvider')
	}

	return context
}

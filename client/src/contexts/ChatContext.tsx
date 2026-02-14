import {
	createContext,
	type Dispatch,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'
import type { Message, Room, Toast, User } from '../../../shared/types'
import { type ChatAction, type ChatState, useChat } from '../hooks/useChat'
import { useSocketContext } from './SocketContext'

/**
 * Context value providing chat state, dispatch, and toast notifications.
 */
type ChatContextValue = {
	state: ChatState
	dispatch: Dispatch<ChatAction>
	toasts: Toast[]
	removeToast: (id: string) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

/**
 * Provider component that manages chat state and wires socket events to state updates.
 *
 * Listens to socket events and dispatches actions to the chat reducer:
 * - room:joined -> SET_ROOM, SET_MESSAGES, SET_USERS
 * - room:user-joined -> USER_JOINED
 * - room:user-left -> USER_LEFT
 * - message:received -> ADD_MESSAGE
 * - typing:started -> TYPING_STARTED
 * - typing:stopped -> TYPING_STOPPED
 *
 * On unmount: Emits room:leave if in a room, then clears state.
 *
 * CRITICAL: Every socket.on() must have matching socket.off() in cleanup
 * to prevent duplicate listeners when React StrictMode remounts components.
 *
 * @param props - Component props
 * @param props.children - Child components that can access chat context
 */
export const ChatProvider = ({ children }: { children: ReactNode }) => {
	const { socket } = useSocketContext()
	const { state, dispatch } = useChat()

	const [toasts, setToasts] = useState<Toast[]>([])

	/** Append a toast notification for a system message. */
	const addToast = useCallback((text: string) => {
		setToasts((prev) => [...prev, { id: crypto.randomUUID(), text }])
	}, [])

	/** Remove a toast by id (called after animation completes). */
	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id))
	}, [])

	/**
	 * Wire socket events to chat state dispatches.
	 *
	 * Why only [socket, dispatch] as deps: Including state.roomCode or state.users
	 * causes the effect to re-run on every state change. The cleanup emits room:leave,
	 * which immediately removes the user from the room -- a critical bug that results
	 * in "0 users" after joining. Instead, we use a ref for the room code so the
	 * unmount cleanup can access the latest value without triggering re-runs.
	 */
	const roomCodeRef = useRef(state.roomCode)
	roomCodeRef.current = state.roomCode

	/**
	 * Delayed leave timer ref. StrictMode unmount schedules a leave after 100ms;
	 * if StrictMode remounts (synchronous, <1ms), the new effect clears the timer
	 * before it fires. Real navigation: no remount, timer fires, leave emitted.
	 */
	const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>()

	useEffect(() => {
		// Cancel any pending leave from a previous StrictMode unmount cycle
		clearTimeout(leaveTimerRef.current)

		// Handle room:joined - set room, users, and merge messages.
		// The server snapshot is authoritative at join time. Merging with existing
		// state (from REST) via SET_MESSAGES dedup closes the message-loss window.
		const handleRoomJoined = (data: { room: Room; user: User }) => {
			dispatch({ type: 'SET_ROOM', payload: { roomCode: data.room.code } })
			dispatch({ type: 'SET_USERS', payload: { users: data.room.users } })
			dispatch({
				type: 'SET_MESSAGES',
				payload: { messages: data.room.messages },
			})
		}

		// Handle room:user-joined - add user to list
		// System message comes from server via message:received broadcast
		const handleUserJoined = (data: { user: User }) => {
			dispatch({ type: 'USER_JOINED', payload: { user: data.user } })
		}

		// Handle room:user-left - remove user from list + clear their typing indicator
		// System message comes from server via message:received broadcast
		const handleUserLeft = (data: {
			sessionId: string
			displayName: string
		}) => {
			dispatch({ type: 'USER_LEFT', payload: { sessionId: data.sessionId } })
		}

		// Handle message:received - add new message, toast for system messages.
		// Guard against cross-room messages: if the user switched rooms but the
		// server hasn't processed the leave yet, stale messages could arrive.
		const handleMessageReceived = (data: { message: Message }) => {
			if (
				roomCodeRef.current &&
				data.message.roomCode !== roomCodeRef.current
			) {
				return
			}
			dispatch({ type: 'ADD_MESSAGE', payload: { message: data.message } })
			if (data.message.type === 'system') {
				addToast(data.message.text)
			}
		}

		// Handle typing:started - add user to typing list (keyed by sessionId)
		const handleTypingStarted = (data: {
			sessionId: string
			displayName: string
			roomCode: string
		}) => {
			dispatch({
				type: 'TYPING_STARTED',
				payload: { sessionId: data.sessionId, displayName: data.displayName },
			})
		}

		// Handle typing:stopped - remove user from typing list (keyed by sessionId)
		const handleTypingStopped = (data: { sessionId: string }) => {
			dispatch({
				type: 'TYPING_STOPPED',
				payload: { sessionId: data.sessionId },
			})
		}

		// Register all event listeners
		socket.on('room:joined', handleRoomJoined)
		socket.on('room:user-joined', handleUserJoined)
		socket.on('room:user-left', handleUserLeft)
		socket.on('message:received', handleMessageReceived)
		socket.on('typing:started', handleTypingStarted)
		socket.on('typing:stopped', handleTypingStopped)

		// Cleanup: remove all listeners and leave room
		return () => {
			socket.off('room:joined', handleRoomJoined)
			socket.off('room:user-joined', handleUserJoined)
			socket.off('room:user-left', handleUserLeft)
			socket.off('message:received', handleMessageReceived)
			socket.off('typing:started', handleTypingStarted)
			socket.off('typing:stopped', handleTypingStopped)

			// Delay room:leave so StrictMode's synchronous remount can cancel it.
			// 100ms is imperceptible but gives huge margin over StrictMode's <1ms remount.
			// Server's disconnect handler is the fallback for actual connection drops.
			if (roomCodeRef.current) {
				leaveTimerRef.current = setTimeout(() => {
					socket.emit('room:leave')
				}, 100)
			}

			// Clear state
			dispatch({ type: 'CLEAR' })
		}
	}, [socket, dispatch, addToast])

	/**
	 * Clear typing indicators when room code changes.
	 * When roomCode changes, clear stale typing indicators from the old room.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally trigger on roomCode change only, dispatch is stable
	useEffect(() => {
		dispatch({ type: 'CLEAR_TYPING' })
	}, [state.roomCode])

	return (
		<ChatContext.Provider value={{ state, dispatch, toasts, removeToast }}>
			{children}
		</ChatContext.Provider>
	)
}

/**
 * Hook to access chat context.
 *
 * Must be used within a ChatProvider component tree.
 * Throws an error if used outside the provider to catch misuse early.
 *
 * @returns Chat state and dispatch function
 * @throws Error if used outside ChatProvider
 */
export const useChatContext = (): ChatContextValue => {
	const context = useContext(ChatContext)

	if (!context) {
		throw new Error('useChatContext must be used within ChatProvider')
	}

	return context
}

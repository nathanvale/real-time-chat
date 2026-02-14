import { useReducer } from 'react'
import type { Message, User } from '../../../shared/types'

/** A user currently typing, keyed by sessionId for identity-safe add/remove. */
type TypingUser = {
	sessionId: string
	displayName: string
}

/**
 * Chat state managed by the reducer.
 */
export type ChatState = {
	/** Current room code, null if not in a room */
	roomCode: string | null
	/** All messages in the current room */
	messages: Message[]
	/** Currently connected users in the room */
	users: User[]
	/** Users currently typing (keyed by sessionId, excludes current user) */
	typingUsers: TypingUser[]
}

/**
 * Actions that can be dispatched to modify chat state.
 */
export type ChatAction =
	| { type: 'SET_ROOM'; payload: { roomCode: string } }
	| { type: 'ADD_MESSAGE'; payload: { message: Message } }
	| { type: 'SET_MESSAGES'; payload: { messages: Message[] } }
	| { type: 'SET_USERS'; payload: { users: User[] } }
	| { type: 'USER_JOINED'; payload: { user: User } }
	| { type: 'USER_LEFT'; payload: { sessionId: string } }
	| {
			type: 'TYPING_STARTED'
			payload: { sessionId: string; displayName: string }
	  }
	| { type: 'TYPING_STOPPED'; payload: { sessionId: string } }
	| { type: 'CLEAR_TYPING' }
	| { type: 'CLEAR' }

const initialState: ChatState = {
	roomCode: null,
	messages: [],
	users: [],
	typingUsers: [],
}

/**
 * Reducer for managing chat state.
 * Exported separately from the hook to enable unit testing.
 *
 * @param state - Current chat state
 * @param action - Action to apply
 * @returns Updated chat state
 */
export const chatReducer = (
	state: ChatState,
	action: ChatAction,
): ChatState => {
	switch (action.type) {
		case 'SET_ROOM':
			return {
				...state,
				roomCode: action.payload.roomCode,
			}

		case 'ADD_MESSAGE':
			// Deduplicate - ignore if message already exists (handles StrictMode double-mounts)
			if (state.messages.some((m) => m.id === action.payload.message.id)) {
				return state
			}
			return {
				...state,
				messages: [...state.messages, action.payload.message],
			}

		case 'SET_MESSAGES': {
			// Merge incoming messages with existing state and dedupe by ID.
			// This closes the message-loss window between REST fetch and socket join:
			// REST may have loaded some messages, then room:joined arrives with a
			// server-side snapshot -- merging ensures no messages are dropped.
			const existingIds = new Set(state.messages.map((m) => m.id))
			const newMessages = action.payload.messages.filter(
				(m) => !existingIds.has(m.id),
			)
			if (newMessages.length === 0) {
				return { ...state, messages: action.payload.messages }
			}
			const merged = [...state.messages, ...newMessages].sort(
				(a, b) => a.timestamp - b.timestamp,
			)
			return { ...state, messages: merged }
		}

		case 'SET_USERS':
			return {
				...state,
				users: action.payload.users,
			}

		case 'USER_JOINED': {
			// Dedup by sessionId (stable across reconnects) -- replace existing entry
			// so peers get the updated socket ID after a silent rejoin
			const existingIdx = state.users.findIndex(
				(u) => u.sessionId === action.payload.user.sessionId,
			)
			if (existingIdx !== -1) {
				// Replace in-place to update socket ID
				const updatedUsers = [...state.users]
				updatedUsers[existingIdx] = action.payload.user
				return { ...state, users: updatedUsers }
			}
			return {
				...state,
				users: [...state.users, action.payload.user],
			}
		}

		case 'USER_LEFT':
			// Server sends sessionId in room:user-left events
			return {
				...state,
				users: state.users.filter(
					(user) => user.sessionId !== action.payload.sessionId,
				),
				typingUsers: state.typingUsers.filter(
					(t) => t.sessionId !== action.payload.sessionId,
				),
			}

		case 'TYPING_STARTED':
			// Only add if not already in the list (keyed by sessionId)
			if (
				state.typingUsers.some((t) => t.sessionId === action.payload.sessionId)
			) {
				return state
			}
			return {
				...state,
				typingUsers: [
					...state.typingUsers,
					{
						sessionId: action.payload.sessionId,
						displayName: action.payload.displayName,
					},
				],
			}

		case 'TYPING_STOPPED':
			return {
				...state,
				typingUsers: state.typingUsers.filter(
					(t) => t.sessionId !== action.payload.sessionId,
				),
			}

		case 'CLEAR_TYPING':
			return { ...state, typingUsers: [] }

		case 'CLEAR':
			return initialState

		default: {
			const _exhaustive: never = action
			return state
		}
	}
}

/**
 * Hook for managing chat state using a reducer.
 *
 * Provides state for messages, users, typing indicators, and the current room code.
 * The reducer is exported separately for unit testing.
 *
 * @returns Object containing chat state and dispatch function
 */
export const useChat = () => {
	const [state, dispatch] = useReducer(chatReducer, initialState)

	return {
		state,
		dispatch,
	}
}

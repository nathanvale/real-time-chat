import { describe, expect, it } from 'bun:test'
import type { Message, User } from '../../../../shared/types'
import type { ChatState } from '../useChat'
import { chatReducer } from '../useChat'

describe('chatReducer', () => {
	const initialState: ChatState = {
		roomCode: null,
		messages: [],
		users: [],
		typingUsers: [],
	}

	const mockMessage: Message = {
		id: 'msg-1',
		userId: 'user-1',
		displayName: 'Alice',
		text: 'Hello world',
		type: 'user',
		timestamp: Date.now(),
		roomCode: 'ABC123',
	}

	const mockUser: User = {
		socketId: 'user-1',
		sessionId: 'session-1',
		displayName: 'Alice',
		roomCode: 'ABC123',
		connectedAt: Date.now(),
	}

	describe('SET_ROOM', () => {
		it('should set the room code', () => {
			const state = chatReducer(initialState, {
				type: 'SET_ROOM',
				payload: { roomCode: 'ABC123' },
			})

			expect(state.roomCode).toBe('ABC123')
			expect(state.messages).toEqual([])
			expect(state.users).toEqual([])
			expect(state.typingUsers).toEqual([])
		})
	})

	describe('ADD_MESSAGE', () => {
		it('should append a message to the messages array', () => {
			const state = chatReducer(initialState, {
				type: 'ADD_MESSAGE',
				payload: { message: mockMessage },
			})

			expect(state.messages).toHaveLength(1)
			expect(state.messages[0]).toEqual(mockMessage)
		})

		it('should not add duplicate message by id', () => {
			const stateWithMessage: ChatState = {
				...initialState,
				messages: [mockMessage],
			}

			const state = chatReducer(stateWithMessage, {
				type: 'ADD_MESSAGE',
				payload: { message: mockMessage },
			})

			expect(state.messages).toHaveLength(1)
			expect(state).toBe(stateWithMessage) // Should return same reference
		})

		it('should append to existing messages', () => {
			const stateWithMessage: ChatState = {
				...initialState,
				messages: [mockMessage],
			}

			const newMessage: Message = {
				...mockMessage,
				id: 'msg-2',
				text: 'Second message',
			}

			const state = chatReducer(stateWithMessage, {
				type: 'ADD_MESSAGE',
				payload: { message: newMessage },
			})

			expect(state.messages).toHaveLength(2)
			expect(state.messages[0]).toEqual(mockMessage)
			expect(state.messages[1]).toEqual(newMessage)
		})
	})

	describe('SET_MESSAGES', () => {
		it('should replace the entire messages array', () => {
			const messages: Message[] = [mockMessage, { ...mockMessage, id: 'msg-2', text: 'Second' }]

			const state = chatReducer(initialState, {
				type: 'SET_MESSAGES',
				payload: { messages },
			})

			expect(state.messages).toEqual(messages)
		})

		it('should merge and deduplicate by ID when existing messages overlap', () => {
			const stateWithMessages: ChatState = {
				...initialState,
				messages: [mockMessage],
			}

			// Same ID as existing - should deduplicate
			const overlapping: Message[] = [{ ...mockMessage, id: 'msg-1', text: 'Same message' }]

			const state = chatReducer(stateWithMessages, {
				type: 'SET_MESSAGES',
				payload: { messages: overlapping },
			})

			// Incoming replaces when all IDs overlap (no new messages to merge)
			expect(state.messages).toEqual(overlapping)
			expect(state.messages).toHaveLength(1)
		})

		it('should merge non-overlapping messages sorted by timestamp', () => {
			const earlier: Message = {
				...mockMessage,
				id: 'msg-1',
				text: 'Earlier',
				timestamp: 1000,
			}
			const later: Message = {
				...mockMessage,
				id: 'msg-2',
				text: 'Later',
				timestamp: 2000,
			}

			const stateWithMessages: ChatState = {
				...initialState,
				messages: [later],
			}

			const state = chatReducer(stateWithMessages, {
				type: 'SET_MESSAGES',
				payload: { messages: [earlier] },
			})

			expect(state.messages).toHaveLength(2)
			expect(state.messages[0].id).toBe('msg-1')
			expect(state.messages[1].id).toBe('msg-2')
		})
	})

	describe('SET_USERS', () => {
		it('should replace the entire users array', () => {
			const users: User[] = [
				mockUser,
				{
					...mockUser,
					socketId: 'user-2',
					sessionId: 'session-2',
					displayName: 'Bob',
				},
			]

			const state = chatReducer(initialState, {
				type: 'SET_USERS',
				payload: { users },
			})

			expect(state.users).toEqual(users)
		})

		it('should replace existing users', () => {
			const stateWithUsers: ChatState = {
				...initialState,
				users: [mockUser],
			}

			const newUsers: User[] = [
				{
					...mockUser,
					socketId: 'user-2',
					sessionId: 'session-2',
					displayName: 'Bob',
				},
			]

			const state = chatReducer(stateWithUsers, {
				type: 'SET_USERS',
				payload: { users: newUsers },
			})

			expect(state.users).toEqual(newUsers)
			expect(state.users).toHaveLength(1)
		})
	})

	describe('USER_JOINED', () => {
		it('should add a user to the users array', () => {
			const state = chatReducer(initialState, {
				type: 'USER_JOINED',
				payload: { user: mockUser },
			})

			expect(state.users).toHaveLength(1)
			expect(state.users[0]).toEqual(mockUser)
		})

		it('should append to existing users', () => {
			const stateWithUser: ChatState = {
				...initialState,
				users: [mockUser],
			}

			const newUser: User = {
				...mockUser,
				socketId: 'user-2',
				sessionId: 'session-2',
				displayName: 'Bob',
			}

			const state = chatReducer(stateWithUser, {
				type: 'USER_JOINED',
				payload: { user: newUser },
			})

			expect(state.users).toHaveLength(2)
			expect(state.users[0]).toEqual(mockUser)
			expect(state.users[1]).toEqual(newUser)
		})

		it('should replace existing user with same sessionId (rejoin with new socket)', () => {
			const stateWithUser: ChatState = {
				...initialState,
				users: [mockUser],
			}

			const rejoinedUser: User = {
				...mockUser,
				socketId: 'new-socket-id',
				connectedAt: Date.now() + 1000,
			}

			const state = chatReducer(stateWithUser, {
				type: 'USER_JOINED',
				payload: { user: rejoinedUser },
			})

			expect(state.users).toHaveLength(1)
			expect(state.users[0].socketId).toBe('new-socket-id')
			expect(state.users[0].sessionId).toBe('session-1')
		})
	})

	describe('USER_LEFT', () => {
		// Server sends sessionId as userId in room:user-left events,
		// so tests must use sessionId values (not socket id) in payloads.

		it('should remove a user by sessionId', () => {
			const stateWithUser: ChatState = {
				...initialState,
				users: [mockUser],
			}

			const state = chatReducer(stateWithUser, {
				type: 'USER_LEFT',
				payload: { sessionId: 'session-1' },
			})

			expect(state.users).toHaveLength(0)
		})

		it('should only remove the matching user', () => {
			const user2: User = {
				...mockUser,
				socketId: 'user-2',
				sessionId: 'session-2',
				displayName: 'Bob',
			}
			const stateWithUsers: ChatState = {
				...initialState,
				users: [mockUser, user2],
			}

			const state = chatReducer(stateWithUsers, {
				type: 'USER_LEFT',
				payload: { sessionId: 'session-1' },
			})

			expect(state.users).toHaveLength(1)
			expect(state.users[0]).toEqual(user2)
		})

		it('should return unchanged state if user not found', () => {
			const stateWithUser: ChatState = {
				...initialState,
				users: [mockUser],
			}

			const state = chatReducer(stateWithUser, {
				type: 'USER_LEFT',
				payload: { sessionId: 'non-existent' },
			})

			expect(state.users).toEqual([mockUser])
		})

		it('should clear typing indicator for leaving user', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				users: [mockUser],
				typingUsers: [
					{ sessionId: 'session-1', displayName: 'Alice' },
					{ sessionId: 'session-2', displayName: 'Bob' },
				],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'USER_LEFT',
				payload: { sessionId: 'session-1' },
			})

			expect(state.typingUsers).toEqual([{ sessionId: 'session-2', displayName: 'Bob' }])
		})

		it('should not clear typing for other users with same displayName', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				users: [mockUser, { ...mockUser, socketId: 'user-2', sessionId: 'session-2' }],
				typingUsers: [
					{ sessionId: 'session-1', displayName: 'Alice' },
					{ sessionId: 'session-2', displayName: 'Alice' },
				],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'USER_LEFT',
				payload: { sessionId: 'session-1' },
			})

			// Only session-1's typing cleared, session-2 (same name) still typing
			expect(state.typingUsers).toEqual([{ sessionId: 'session-2', displayName: 'Alice' }])
		})
	})

	describe('TYPING_STARTED', () => {
		it('should add a typing user', () => {
			const state = chatReducer(initialState, {
				type: 'TYPING_STARTED',
				payload: { sessionId: 'user-1', displayName: 'Alice' },
			})

			expect(state.typingUsers).toEqual([{ sessionId: 'user-1', displayName: 'Alice' }])
		})

		it('should append to existing typingUsers', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'TYPING_STARTED',
				payload: { sessionId: 'user-2', displayName: 'Bob' },
			})

			expect(state.typingUsers).toEqual([
				{ sessionId: 'user-1', displayName: 'Alice' },
				{ sessionId: 'user-2', displayName: 'Bob' },
			])
		})

		it('should not add duplicate typing user by sessionId', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'TYPING_STARTED',
				payload: { sessionId: 'user-1', displayName: 'Alice' },
			})

			expect(state.typingUsers).toHaveLength(1)
			expect(state).toBe(stateWithTyping) // Should return same reference
		})
	})

	describe('TYPING_STOPPED', () => {
		it('should remove a typing user by sessionId', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'TYPING_STOPPED',
				payload: { sessionId: 'user-1' },
			})

			expect(state.typingUsers).toEqual([])
		})

		it('should only remove the matching sessionId', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				typingUsers: [
					{ sessionId: 'user-1', displayName: 'Alice' },
					{ sessionId: 'user-2', displayName: 'Bob' },
					{ sessionId: 'user-3', displayName: 'Charlie' },
				],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'TYPING_STOPPED',
				payload: { sessionId: 'user-2' },
			})

			expect(state.typingUsers).toEqual([
				{ sessionId: 'user-1', displayName: 'Alice' },
				{ sessionId: 'user-3', displayName: 'Charlie' },
			])
		})

		it('should handle removing non-existent typing user', () => {
			const stateWithTyping: ChatState = {
				...initialState,
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(stateWithTyping, {
				type: 'TYPING_STOPPED',
				payload: { sessionId: 'user-99' },
			})

			expect(state.typingUsers).toEqual([{ sessionId: 'user-1', displayName: 'Alice' }])
		})
	})

	describe('CLEAR_TYPING', () => {
		it('should clear typing users but preserve other state', () => {
			const populatedState: ChatState = {
				roomCode: 'ABC123',
				messages: [mockMessage],
				users: [mockUser],
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(populatedState, { type: 'CLEAR_TYPING' })

			expect(state.typingUsers).toEqual([])
			expect(state.roomCode).toBe('ABC123')
			expect(state.messages).toEqual([mockMessage])
			expect(state.users).toEqual([mockUser])
		})
	})

	describe('CLEAR', () => {
		it('should reset to initial state', () => {
			const populatedState: ChatState = {
				roomCode: 'ABC123',
				messages: [mockMessage],
				users: [mockUser],
				typingUsers: [{ sessionId: 'user-1', displayName: 'Alice' }],
			}

			const state = chatReducer(populatedState, { type: 'CLEAR' })

			expect(state).toEqual(initialState)
		})
	})
})

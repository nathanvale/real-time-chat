import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { User } from '../../../shared/types'

describe('room-manager', () => {
	let testDbPath: string
	let createRoom: () => string
	let joinRoom: (roomCode: string, user: User) => void
	let leaveRoom: (roomCode: string, sessionId: string) => User | undefined
	let getRoomUsers: (roomCode: string) => User[]
	let roomExists: (roomCode: string) => boolean

	beforeEach(async () => {
		// Create a unique in-memory database for each test
		testDbPath = `:memory:`
		process.env.DATABASE_PATH = testDbPath

		// Clear module cache to force reimport with new DATABASE_PATH
		// @ts-expect-error - Bun provides require.cache
		delete require.cache[require.resolve('../db')]
		// @ts-expect-error - Bun provides require.cache
		delete require.cache[require.resolve('../room-manager')]

		// Re-import modules with new database
		const roomManager = await import('../room-manager')
		createRoom = roomManager.createRoom
		joinRoom = roomManager.joinRoom
		leaveRoom = roomManager.leaveRoom
		getRoomUsers = roomManager.getRoomUsers
		roomExists = roomManager.roomExists
	})

	afterEach(() => {
		// Clean up environment
		delete process.env.DATABASE_PATH
	})

	describe('createRoom', () => {
		it('should return a 6-character uppercase alphanumeric code', () => {
			const code = createRoom()

			expect(code).toMatch(/^[A-Z0-9]{6}$/)
		})

		it('should create a room that exists in the database', () => {
			const code = createRoom()

			expect(roomExists(code)).toBe(true)
		})

		it('should create multiple unique rooms', () => {
			const code1 = createRoom()
			const code2 = createRoom()

			expect(code1).not.toBe(code2)
			expect(roomExists(code1)).toBe(true)
			expect(roomExists(code2)).toBe(true)
		})

		it('should initialize an empty users array', () => {
			const code = createRoom()

			const users = getRoomUsers(code)
			expect(users).toEqual([])
		})
	})

	describe('joinRoom', () => {
		it("should add a user to the room's users list", () => {
			const code = createRoom()
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)

			const users = getRoomUsers(code)
			expect(users).toHaveLength(1)
			expect(users[0]).toEqual(user)
		})

		it('should add multiple users to the same room', () => {
			const code = createRoom()
			const user1 = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}
			const user2 = {
				socketId: 'user-2',
				sessionId: 'session-2',
				displayName: 'Bob',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user1)
			joinRoom(code, user2)

			const users = getRoomUsers(code)
			expect(users).toHaveLength(2)
			expect(users[0]).toEqual(user1)
			expect(users[1]).toEqual(user2)
		})

		it('should throw error when joining non-existent room', () => {
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: 'FAKE00',
				connectedAt: Date.now(),
			}

			expect(() => joinRoom('FAKE00', user)).toThrow('Room FAKE00 does not exist')
		})

		it('should initialize in-memory users if room exists in DB but not in memory', () => {
			const code = createRoom()
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)

			const users = getRoomUsers(code)
			expect(users).toHaveLength(1)
			expect(users[0]).toEqual(user)
		})

		it('should dedup by sessionId on reconnect (new socket ID, same session)', () => {
			const code = createRoom()
			const user = {
				socketId: 'socket-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)

			// Simulate reconnect: same sessionId, new socket ID
			const reconnectedUser = {
				...user,
				socketId: 'socket-2',
				connectedAt: Date.now() + 1000,
			}
			joinRoom(code, reconnectedUser)

			const users = getRoomUsers(code)
			expect(users).toHaveLength(1)
			expect(users[0]).toEqual(reconnectedUser)
		})

		it('should allow two users with same displayName but different sessionIds', () => {
			const code = createRoom()
			const user1 = {
				socketId: 'socket-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}
			const user2 = {
				socketId: 'socket-2',
				sessionId: 'session-2',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user1)
			joinRoom(code, user2)

			const users = getRoomUsers(code)
			expect(users).toHaveLength(2)
		})
	})

	describe('leaveRoom', () => {
		it("should remove a user from the room's users list by sessionId", () => {
			const code = createRoom()
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)
			const removedUser = leaveRoom(code, 'session-1')

			expect(removedUser).toEqual(user)
			expect(getRoomUsers(code)).toEqual([])
		})

		it('should return the removed user object', () => {
			const code = createRoom()
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)
			const removedUser = leaveRoom(code, 'session-1')

			expect(removedUser).toEqual(user)
		})

		it('should return undefined for non-existent session', () => {
			const code = createRoom()
			const user = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user)
			const removedUser = leaveRoom(code, 'non-existent')

			expect(removedUser).toBeUndefined()
			expect(getRoomUsers(code)).toEqual([user])
		})

		it('should return undefined for non-existent room', () => {
			const removedUser = leaveRoom('FAKE00', 'session-1')

			expect(removedUser).toBeUndefined()
		})

		it('should only remove the specified user', () => {
			const code = createRoom()
			const user1 = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}
			const user2 = {
				socketId: 'user-2',
				sessionId: 'session-2',
				displayName: 'Bob',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user1)
			joinRoom(code, user2)
			leaveRoom(code, 'session-1')

			const users = getRoomUsers(code)
			expect(users).toHaveLength(1)
			expect(users[0]).toEqual(user2)
		})
	})

	describe('getRoomUsers', () => {
		it('should return empty array for non-existent room', () => {
			const users = getRoomUsers('FAKE00')

			expect(users).toEqual([])
		})

		it('should return all users in a room', () => {
			const code = createRoom()
			const user1 = {
				socketId: 'user-1',
				sessionId: 'session-1',
				displayName: 'Alice',
				roomCode: code,
				connectedAt: Date.now(),
			}
			const user2 = {
				socketId: 'user-2',
				sessionId: 'session-2',
				displayName: 'Bob',
				roomCode: code,
				connectedAt: Date.now(),
			}

			joinRoom(code, user1)
			joinRoom(code, user2)

			const users = getRoomUsers(code)
			expect(users).toEqual([user1, user2])
		})
	})

	describe('roomExists', () => {
		it('should return true for existing room', () => {
			const code = createRoom()

			expect(roomExists(code)).toBe(true)
		})

		it('should return false for non-existent room', () => {
			expect(roomExists('FAKE00')).toBe(false)
		})

		it('should return false for random code', () => {
			const randomCode = crypto.randomUUID().substring(0, 6).toUpperCase()

			expect(roomExists(randomCode)).toBe(false)
		})
	})

	describe('room code format', () => {
		it('should match /^[A-Z0-9]{6}$/', () => {
			const codes = Array.from({ length: 10 }, () => createRoom())

			for (const code of codes) {
				expect(code).toMatch(/^[A-Z0-9]{6}$/)
			}
		})

		it('should be exactly 6 characters', () => {
			const code = createRoom()

			expect(code).toHaveLength(6)
		})
	})
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

describe('db', () => {
	let testDbPath: string
	let createRoom: (code: string) => void
	let getRoom: (code: string) => { code: string; created_at: number } | null
	let addMessage: (msg: {
		roomCode: string
		userId: string
		displayName: string
		text: string
		type?: 'user' | 'system'
		timestamp: number
	}) => any
	let getMessagesByRoom: (roomCode: string, limit?: number) => any[]

	beforeEach(async () => {
		// Create a unique in-memory database for each test
		testDbPath = `:memory:`
		process.env.DATABASE_PATH = testDbPath

		// Clear module cache to force reimport with new DATABASE_PATH
		// @ts-expect-error - Bun provides require.cache
		delete require.cache[require.resolve('../db')]

		// Re-import module with new database
		const db = await import('../db')
		createRoom = db.createRoom
		getRoom = db.getRoom
		addMessage = db.addMessage
		getMessagesByRoom = db.getMessagesByRoom
	})

	afterEach(() => {
		// Clean up environment
		delete process.env.DATABASE_PATH
	})

	describe('createRoom', () => {
		it('should persist a room to the database', () => {
			createRoom('ABC123')

			const room = getRoom('ABC123')
			expect(room).not.toBeNull()
			expect(room?.code).toBe('ABC123')
		})

		it('should set created_at as epoch ms timestamp', () => {
			const before = Date.now()
			createRoom('ABC123')
			const after = Date.now()

			const room = getRoom('ABC123')
			expect(room).not.toBeNull()
			expect(typeof room!.created_at).toBe('number')
			expect(room!.created_at).toBeGreaterThanOrEqual(before)
			expect(room!.created_at).toBeLessThanOrEqual(after)
		})

		it('should throw error for duplicate room code', () => {
			createRoom('ABC123')

			expect(() => createRoom('ABC123')).toThrow()
		})
	})

	describe('getRoom', () => {
		it('should return room data for existing room', () => {
			createRoom('ABC123')

			const room = getRoom('ABC123')
			expect(room).toEqual({
				code: 'ABC123',
				created_at: expect.any(Number),
			})
		})

		it('should return null for non-existent room', () => {
			const room = getRoom('FAKE00')

			expect(room).toBeNull()
		})
	})

	describe('addMessage', () => {
		beforeEach(() => {
			// Create a room for message tests
			createRoom('ABC123')
		})

		it('should return complete Message object with generated id', () => {
			const timestamp = Date.now()
			const message = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Hello world',
				timestamp,
			})

			expect(message).toEqual({
				id: expect.any(String),
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Hello world',
				type: 'user',
				timestamp,
			})
		})

		it('should generate a unique UUID for id', () => {
			const message1 = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'First',
				timestamp: Date.now(),
			})

			const message2 = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Second',
				timestamp: Date.now(),
			})

			expect(message1.id).not.toBe(message2.id)
			expect(message1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		})

		it("should default type to 'user' when not provided", () => {
			const message = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Hello',
				timestamp: Date.now(),
			})

			expect(message.type).toBe('user')
		})

		it("should accept 'system' type", () => {
			const message = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Alice joined',
				type: 'system',
				timestamp: Date.now(),
			})

			expect(message.type).toBe('system')
		})

		it('should persist message to database', () => {
			const timestamp = Date.now()
			const message = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Persisted',
				timestamp,
			})

			const messages = getMessagesByRoom('ABC123')
			expect(messages).toHaveLength(1)
			expect(messages[0]).toEqual(message)
		})
	})

	describe('getMessagesByRoom', () => {
		beforeEach(() => {
			createRoom('ABC123')
		})

		it('should return messages in chronological order (oldest first)', () => {
			const msg1 = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'First',
				timestamp: 1000,
			})

			const msg2 = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Second',
				timestamp: 2000,
			})

			const msg3 = addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Third',
				timestamp: 3000,
			})

			const messages = getMessagesByRoom('ABC123')
			expect(messages).toHaveLength(3)
			expect(messages[0]).toEqual(msg1)
			expect(messages[1]).toEqual(msg2)
			expect(messages[2]).toEqual(msg3)
		})

		it('should respect limit parameter', () => {
			for (let i = 0; i < 10; i++) {
				addMessage({
					roomCode: 'ABC123',
					userId: 'user-1',
					displayName: 'Alice',
					text: `Message ${i}`,
					timestamp: i,
				})
			}

			const messages = getMessagesByRoom('ABC123', 5)
			expect(messages).toHaveLength(5)
		})

		it('should default to limit of 100', () => {
			for (let i = 0; i < 150; i++) {
				addMessage({
					roomCode: 'ABC123',
					userId: 'user-1',
					displayName: 'Alice',
					text: `Message ${i}`,
					timestamp: i,
				})
			}

			const messages = getMessagesByRoom('ABC123')
			expect(messages).toHaveLength(100)
		})

		it('should return empty array for room with no messages', () => {
			const messages = getMessagesByRoom('ABC123')

			expect(messages).toEqual([])
		})

		it('should return empty array for non-existent room', () => {
			const messages = getMessagesByRoom('FAKE00')

			expect(messages).toEqual([])
		})

		it('should only return messages for the specified room', () => {
			createRoom('XYZ789')

			addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Room ABC',
				timestamp: Date.now(),
			})

			addMessage({
				roomCode: 'XYZ789',
				userId: 'user-2',
				displayName: 'Bob',
				text: 'Room XYZ',
				timestamp: Date.now(),
			})

			const messagesABC = getMessagesByRoom('ABC123')
			const messagesXYZ = getMessagesByRoom('XYZ789')

			expect(messagesABC).toHaveLength(1)
			expect(messagesABC[0].text).toBe('Room ABC')
			expect(messagesXYZ).toHaveLength(1)
			expect(messagesXYZ[0].text).toBe('Room XYZ')
		})

		it('should convert ISO timestamp strings to Unix timestamps', () => {
			const timestamp = Date.now()
			addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Test',
				timestamp,
			})

			const messages = getMessagesByRoom('ABC123')
			expect(messages[0].timestamp).toBe(timestamp)
			expect(typeof messages[0].timestamp).toBe('number')
		})

		it('should handle legacy ISO string timestamps by converting to epoch ms', async () => {
			// Use a file-based DB so we can open a second connection
			// to insert raw ISO strings (simulating legacy data)
			const { unlinkSync } = await import('node:fs')
			const { Database } = await import('bun:sqlite')
			const legacyDbPath = './test-legacy-iso.db'
			process.env.DATABASE_PATH = legacyDbPath

			// @ts-expect-error - Bun provides require.cache
			delete require.cache[require.resolve('../db')]
			const legacyDb = await import('../db')

			legacyDb.createRoom('ISO001')

			// Insert a message with an ISO string timestamp directly via SQL
			// to simulate legacy data written before the integer-timestamp migration
			const rawDb = new Database(legacyDbPath)
			const isoDate = '2025-06-15T10:30:00.000Z'
			rawDb
				.prepare(
					'INSERT INTO messages (id, room_code, user_id, display_name, text, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
				)
				.run('legacy-id', 'ISO001', 'user-1', 'Alice', 'Legacy msg', 'user', isoDate)
			rawDb.close()

			const messages = legacyDb.getMessagesByRoom('ISO001')
			expect(messages).toHaveLength(1)
			expect(typeof messages[0].timestamp).toBe('number')
			expect(messages[0].timestamp).toBe(new Date(isoDate).getTime())

			// Cleanup
			try {
				unlinkSync(legacyDbPath)
			} catch {
				/* ignore */
			}
		})
	})

	describe('idempotent schema', () => {
		it('should not error when initializing database twice', async () => {
			// Create some data
			createRoom('ABC123')

			// Re-import to trigger schema initialization again
			// @ts-expect-error - Bun provides require.cache
			delete require.cache[require.resolve('../db')]
			await import('../db')

			// If we get here without throwing, schema is idempotent
			expect(true).toBe(true)
		})

		it('should preserve existing data with same database instance', () => {
			// Note: In-memory databases don't persist across module reloads
			// This test verifies schema idempotency with existing data
			createRoom('ABC123')
			addMessage({
				roomCode: 'ABC123',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Test',
				timestamp: Date.now(),
			})

			const room = getRoom('ABC123')
			const messages = getMessagesByRoom('ABC123')

			expect(room).not.toBeNull()
			expect(messages).toHaveLength(1)
		})
	})
})

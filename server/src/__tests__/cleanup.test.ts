import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { unlinkSync } from 'node:fs'

describe('cleanup', () => {
	const testDbPath = './test-cleanup.db'
	let dbInstance: Database

	beforeEach(() => {
		process.env.DATABASE_PATH = testDbPath
		// @ts-expect-error - Bun provides require.cache
		delete require.cache[require.resolve('../db')]
	})

	afterEach(() => {
		delete process.env.DATABASE_PATH
		if (dbInstance) {
			dbInstance.close()
		}
		// Clean up test database file
		try {
			unlinkSync(testDbPath)
		} catch {
			// File may not exist, ignore
		}
	})

	describe('getStaleRooms', () => {
		it('should return rooms inactive longer than threshold', async () => {
			const dbModule = await import('../db')

			// Create room and manually backdate its last_activity_at
			dbModule.createRoom('STALE1')

			// Access the db to backdate the timestamp
			dbInstance = new Database(testDbPath)
			const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
			dbInstance
				.prepare('UPDATE rooms SET last_activity_at = ? WHERE code = ?')
				.run(oldTimestamp, 'STALE1')

			const rooms = dbModule.getStaleRooms(24 * 60 * 60 * 1000) // 24 hour threshold
			expect(rooms).toContain('STALE1')
		})

		it('should not return recently active rooms', async () => {
			const dbModule = await import('../db')

			dbModule.createRoom('FRESH1')
			dbModule.updateRoomActivity('FRESH1')

			const rooms = dbModule.getStaleRooms(60 * 60 * 1000) // 1 hour threshold
			expect(rooms).not.toContain('FRESH1')
		})
	})

	describe('deleteRoom', () => {
		it('should delete room and its messages', async () => {
			const dbModule = await import('../db')

			dbModule.createRoom('DEL001')
			dbModule.addMessage({
				roomCode: 'DEL001',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Hello',
				timestamp: Date.now(),
			})

			dbModule.deleteRoom('DEL001')

			expect(dbModule.getRoom('DEL001')).toBeNull()
			const messages = dbModule.getMessagesByRoom('DEL001')
			expect(messages).toHaveLength(0)
		})
	})

	describe('pruneOldMessages', () => {
		it('should delete messages older than threshold', async () => {
			const dbModule = await import('../db')

			dbModule.createRoom('PRUNE1')

			// Add old message
			const oldTimestamp = Date.now() - 60 * 60 * 1000 // 1 hour ago
			dbModule.addMessage({
				roomCode: 'PRUNE1',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Old message',
				timestamp: oldTimestamp,
			})

			// Add recent message
			dbModule.addMessage({
				roomCode: 'PRUNE1',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'New message',
				timestamp: Date.now(),
			})

			const pruned = dbModule.pruneOldMessages(30 * 60 * 1000) // 30 min threshold
			expect(pruned).toBe(1)

			const remaining = dbModule.getMessagesByRoom('PRUNE1')
			expect(remaining).toHaveLength(1)
			expect(remaining[0].text).toContain('New message')
		})

		it('should return 0 when no messages are old enough', async () => {
			const dbModule = await import('../db')

			dbModule.createRoom('PRUNE2')
			dbModule.addMessage({
				roomCode: 'PRUNE2',
				userId: 'user-1',
				displayName: 'Alice',
				text: 'Fresh message',
				timestamp: Date.now(),
			})

			const pruned = dbModule.pruneOldMessages(60 * 60 * 1000)
			expect(pruned).toBe(0)
		})
	})

	describe('updateRoomActivity', () => {
		it('should update last_activity_at timestamp', async () => {
			const dbModule = await import('../db')

			dbModule.createRoom('ACT001')

			// Backdate the activity
			dbInstance = new Database(testDbPath)
			const oldTimestamp = Date.now() - 60 * 60 * 1000 // 1 hour ago
			dbInstance
				.prepare('UPDATE rooms SET last_activity_at = ? WHERE code = ?')
				.run(oldTimestamp, 'ACT001')

			// Verify it's stale before update
			let stale = dbModule.getStaleRooms(30 * 60 * 1000) // 30 min threshold
			expect(stale).toContain('ACT001')

			// Update activity
			dbModule.updateRoomActivity('ACT001')

			// Verify it's no longer stale
			stale = dbModule.getStaleRooms(30 * 60 * 1000)
			expect(stale).not.toContain('ACT001')
		})
	})
})

/**
 * Room manager for in-memory user state.
 *
 * Manages the in-memory Map of connected users per room.
 * Room metadata persists to SQLite via db.ts, but connected users are transient.
 *
 * Room code generation uses crypto.randomUUID().substring(0, 6).toUpperCase()
 * with uniqueness check and retry (max 10 attempts).
 */

import type { User } from '../../shared/types'
import { createRoom as createRoomInDb, getRoom } from './db'

/**
 * In-memory map of room codes to connected users.
 * Key: room code (string)
 * Value: array of User objects currently in the room
 */
const rooms = new Map<string, User[]>()

/**
 * Generates a unique 6-character uppercase alphanumeric room code.
 *
 * Uses crypto.randomUUID().substring(0, 6).toUpperCase() for code generation.
 * Checks SQLite for existing room with the same code and retries up to 10 times.
 *
 * Collision probability is negligible at this scale (~2.18 billion possibilities),
 * but we always check for uniqueness as a safety measure.
 *
 * @returns 6-character uppercase alphanumeric room code
 * @throws Error if unable to generate unique code after 10 attempts
 */
function generateUniqueRoomCode(): string {
	const MAX_ATTEMPTS = 10

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const code = crypto.randomUUID().substring(0, 6).toUpperCase()
		const existingRoom = getRoom(code)

		if (!existingRoom) {
			return code
		}
	}

	throw new Error(
		'Failed to generate unique room code after 10 attempts. This should be extremely rare.',
	)
}

/**
 * Creates a new room.
 *
 * Generates a unique room code, persists it to SQLite, and initializes
 * the in-memory users array for the room.
 *
 * @returns The generated room code
 * @throws Error if unable to generate unique code or database insert fails
 */
export function createRoom(): string {
	const code = generateUniqueRoomCode()
	createRoomInDb(code)
	rooms.set(code, [])
	return code
}

/**
 * Adds a user to a room's in-memory users list.
 *
 * Deduplicates by sessionId: if a user with the same sessionId is already
 * present (e.g. page refresh with new socket), the stale entry is replaced.
 * Two users with the same displayName but different sessionIds coexist correctly.
 *
 * Rejoin detection is handled by the session registry in socket-handlers.ts,
 * not here -- this function only manages the users array.
 *
 * @param roomCode - Room code to join
 * @param user - User object to add to the room
 * @throws Error if room doesn't exist in memory (should call roomExists first)
 */
export function joinRoom(roomCode: string, user: User): void {
	const users = rooms.get(roomCode)

	if (!users) {
		// Initialize in-memory users array if room exists in DB but not in memory
		// (can happen after server restart with persistent SQLite)
		if (roomExists(roomCode)) {
			rooms.set(roomCode, [user])
			return
		}
		throw new Error(`Room ${roomCode} does not exist`)
	}

	// Deduplicate by sessionId - remove stale entry with same session
	// (handles reconnects where socket ID changes but session stays the same)
	const staleIndex = users.findIndex((u) => u.sessionId === user.sessionId)
	if (staleIndex !== -1) {
		users.splice(staleIndex, 1)
	}
	users.push(user)
}

/**
 * Removes a user from a room's in-memory users list by sessionId.
 *
 * @param roomCode - Room code to leave
 * @param sessionId - Session ID to remove (stable across reconnects)
 * @returns The removed User object, or undefined if user wasn't in the room
 */
export function leaveRoom(
	roomCode: string,
	sessionId: string,
): User | undefined {
	const users = rooms.get(roomCode)
	if (!users) return undefined

	const userIndex = users.findIndex((u) => u.sessionId === sessionId)
	if (userIndex === -1) return undefined

	const [removedUser] = users.splice(userIndex, 1)
	return removedUser
}

/**
 * Retrieves all users currently in a room.
 *
 * @param roomCode - Room code to query
 * @returns Array of User objects in the room, or empty array if room not found
 */
export function getRoomUsers(roomCode: string): User[] {
	return rooms.get(roomCode) || []
}

/**
 * Checks if a room exists in the database.
 *
 * @param roomCode - Room code to check
 * @returns true if room exists in SQLite, false otherwise
 */
export function roomExists(roomCode: string): boolean {
	return getRoom(roomCode) !== null
}

/**
 * Removes a room from the in-memory map.
 * Used by the cleanup sweep to evict stale rooms.
 *
 * @param roomCode - Room code to remove
 * @returns true if room was removed, false if not found
 */
export function removeRoom(roomCode: string): boolean {
	return rooms.delete(roomCode)
}

/**
 * SQLite database layer using bun:sqlite.
 * Manages persistent storage for rooms and messages.
 *
 * Users are transient (in-memory only) and do not persist.
 * Messages and rooms persist in SQLite with IF NOT EXISTS for idempotent schema creation
 * (critical for Fly.io persistent volumes across deploys).
 */

import { Database } from 'bun:sqlite'
import type { Message } from '../../shared/types'

/**
 * SQLite database path. Reads from DATABASE_PATH env var.
 * Defaults to ./app.db for local development.
 * On Fly.io, this will be /data/app.db on a persistent volume.
 */
const DATABASE_PATH = process.env.DATABASE_PATH || './app.db'

/**
 * Initialize SQLite database connection.
 * Database file is created automatically if it doesn't exist.
 */
const db = new Database(DATABASE_PATH, { create: true })

/**
 * Create tables with IF NOT EXISTS (idempotent schema).
 * Critical for Fly.io: persistent volume survives deploys, schema must not fail on re-run.
 *
 * Schema:
 * - rooms: Stores room metadata (code as PRIMARY KEY, created_at timestamp)
 * - messages: Stores chat messages with room_code FK, indexed on (room_code, timestamp) for fast retrieval
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'user',
    timestamp TEXT NOT NULL,
    FOREIGN KEY (room_code) REFERENCES rooms(code)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_code, timestamp);
`)

// Migration: add last_activity_at column if it doesn't exist
// SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check pragmatically
const columns = db.prepare("PRAGMA table_info('rooms')").all() as Array<{
	name: string
}>
if (!columns.some((col) => col.name === 'last_activity_at')) {
	db.exec('ALTER TABLE rooms ADD COLUMN last_activity_at INTEGER')
	// Backfill: set last_activity_at to created_at for existing rows
	db.exec('UPDATE rooms SET last_activity_at = created_at')
}

// Migration: convert TEXT timestamps to INTEGER epoch ms
// New inserts already use Date.now() (integer), but legacy data may have ISO strings or numeric strings
{
	const hasTextTimestamps = db
		.prepare(
			"SELECT COUNT(*) as cnt FROM messages WHERE typeof(timestamp) = 'text'",
		)
		.get() as { cnt: number }
	if (hasTextTimestamps.cnt > 0) {
		db.exec(`
			UPDATE messages SET timestamp = CAST(
				CASE
					WHEN timestamp GLOB '[0-9]*' THEN timestamp
					ELSE CAST(strftime('%s', timestamp) AS INTEGER) * 1000
				END AS INTEGER
			) WHERE typeof(timestamp) = 'text'
		`)
	}

	const hasTextCreatedAt = db
		.prepare(
			"SELECT COUNT(*) as cnt FROM rooms WHERE typeof(created_at) = 'text'",
		)
		.get() as { cnt: number }
	if (hasTextCreatedAt.cnt > 0) {
		db.exec(`
			UPDATE rooms SET created_at = CAST(
				CASE
					WHEN created_at GLOB '[0-9]*' THEN created_at
					ELSE CAST(strftime('%s', created_at) AS INTEGER) * 1000
				END AS INTEGER
			) WHERE typeof(created_at) = 'text'
		`)
	}
}

/**
 * Creates a new room in the database.
 *
 * @param code - 6-character uppercase alphanumeric room code (PRIMARY KEY)
 * @throws Error if room code already exists (PRIMARY KEY constraint violation)
 */
export function createRoom(code: string): void {
	const now = Date.now()
	const stmt = db.prepare(
		'INSERT INTO rooms (code, created_at, last_activity_at) VALUES (?, ?, ?)',
	)
	stmt.run(code, now, now)
}

/**
 * Retrieves a room by its code.
 *
 * @param code - Room code to look up
 * @returns Room object with code and created_at (as number), or null if not found
 */
export function getRoom(
	code: string,
): { code: string; created_at: number } | null {
	const stmt = db.prepare('SELECT code, created_at FROM rooms WHERE code = ?')
	const row = stmt.get(code) as {
		code: string
		created_at: string | number
	} | null
	if (!row) return null
	return {
		code: row.code,
		created_at: normalizeTimestamp(row.created_at),
	}
}

/**
 * Adds a new message to the database.
 *
 * @param msg - Message data to persist
 * @param msg.roomCode - Room code this message belongs to
 * @param msg.userId - Session ID of user who sent the message
 * @param msg.displayName - Display name of the sender (denormalized for persistence)
 * @param msg.text - Message text content
 * @param msg.type - Message type ('user' or 'system'), defaults to 'user'
 * @param msg.timestamp - Unix timestamp (ms) when message was sent
 * @returns The complete Message object with generated ID
 */
export function addMessage(msg: {
	roomCode: string
	userId: string
	displayName: string
	text: string
	type?: 'user' | 'system'
	timestamp: number
}): Message {
	const id = crypto.randomUUID()
	const type = msg.type || 'user'

	const stmt = db.prepare(`
    INSERT INTO messages (id, room_code, user_id, display_name, text, type, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

	stmt.run(
		id,
		msg.roomCode,
		msg.userId,
		msg.displayName,
		msg.text,
		type,
		msg.timestamp,
	)

	return {
		id,
		roomCode: msg.roomCode,
		userId: msg.userId,
		displayName: msg.displayName,
		text: msg.text,
		type,
		timestamp: msg.timestamp,
	}
}

/**
 * Normalizes a timestamp value to epoch milliseconds.
 * Handles both integer (new format) and ISO string (legacy format) timestamps.
 */
const normalizeTimestamp = (v: string | number): number => {
	if (typeof v === 'number') return v
	// Try parsing as integer first (for epoch ms stored as string)
	const parsed = Number(v)
	if (!Number.isNaN(parsed)) return parsed
	// Fall back to ISO string parsing for legacy data
	return new Date(v).getTime()
}

/**
 * Retrieves messages for a specific room, ordered by timestamp (oldest first).
 *
 * @param roomCode - Room code to retrieve messages for
 * @param limit - Maximum number of messages to retrieve (default: 100)
 * @returns Array of Message objects, ordered by timestamp ascending
 */
export function getMessagesByRoom(roomCode: string, limit = 100): Message[] {
	const stmt = db.prepare(`
    SELECT id, room_code, user_id, display_name, text, type, timestamp
    FROM messages
    WHERE room_code = ? AND type != 'system'
    ORDER BY timestamp ASC
    LIMIT ?
  `)

	const rows = stmt.all(roomCode, limit) as Array<{
		id: string
		room_code: string
		user_id: string
		display_name: string
		text: string
		type: 'user' | 'system'
		timestamp: string | number
	}>

	return rows.map((row) => ({
		id: row.id,
		roomCode: row.room_code,
		userId: row.user_id,
		displayName: row.display_name,
		text: row.text,
		type: row.type,
		timestamp: normalizeTimestamp(row.timestamp),
	}))
}

/**
 * Updates the last_activity_at timestamp for a room.
 * Called on room:join and message:send to keep active rooms alive.
 *
 * @param roomCode - Room code to update
 */
export function updateRoomActivity(roomCode: string): void {
	const stmt = db.prepare(
		'UPDATE rooms SET last_activity_at = ? WHERE code = ?',
	)
	stmt.run(Date.now(), roomCode)
}

/**
 * Returns room codes that have been inactive for longer than maxAgeMs.
 *
 * @param maxAgeMs - Maximum inactivity age in milliseconds
 * @returns Array of room codes that are candidates for deletion
 */
export function getStaleRooms(maxAgeMs: number): string[] {
	const cutoff = Date.now() - maxAgeMs
	const stmt = db.prepare('SELECT code FROM rooms WHERE last_activity_at < ?')
	const rows = stmt.all(cutoff) as Array<{ code: string }>
	return rows.map((r) => r.code)
}

/**
 * Deletes a room and all its messages from the database.
 *
 * @param roomCode - Room code to delete
 */
export function deleteRoom(roomCode: string): void {
	// Delete messages first (FK constraint)
	db.prepare('DELETE FROM messages WHERE room_code = ?').run(roomCode)
	db.prepare('DELETE FROM rooms WHERE code = ?').run(roomCode)
}

/**
 * Prunes messages older than maxAgeMs.
 *
 * @param maxAgeMs - Maximum message age in milliseconds
 * @returns Number of messages deleted
 */
export function pruneOldMessages(maxAgeMs: number): number {
	const cutoff = Date.now() - maxAgeMs
	const stmt = db.prepare('DELETE FROM messages WHERE timestamp < ?')
	const result = stmt.run(cutoff)
	return result.changes
}

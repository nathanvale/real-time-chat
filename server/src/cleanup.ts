/**
 * Room and message TTL cleanup.
 *
 * Runs on a periodic interval to:
 * - Delete rooms with no activity for 24 hours (if empty)
 * - Prune messages older than 7 days
 *
 * Safety: occupied rooms (with connected users) are never deleted,
 * even if they've been "inactive" by timestamp. Connected lurkers
 * keep rooms alive.
 */

import {
	deleteRoom,
	getStaleRooms,
	pruneOldMessages,
	updateRoomActivity,
} from './db'
import { getRoomUsers, removeRoom } from './room-manager'

/** Default cleanup interval: 15 minutes */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000

/** Room inactivity threshold: 24 hours */
const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Message retention period: 7 days */
const MESSAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Starts the periodic cleanup schedule.
 *
 * On each tick:
 * 1. Finds rooms inactive for > 24 hours
 * 2. Deletes only empty rooms (skips occupied ones)
 * 3. Prunes messages older than 7 days
 *
 * @param intervalMs - Cleanup interval in milliseconds (default: 15 minutes)
 * @returns Timer handle for stopping the schedule
 */
export function startCleanupSchedule(
	intervalMs = DEFAULT_INTERVAL_MS,
): ReturnType<typeof setInterval> {
	return setInterval(() => {
		runCleanup()
	}, intervalMs)
}

/**
 * Runs a single cleanup cycle.
 * Exported for testing.
 */
export function runCleanup(): void {
	// Find stale room candidates
	const staleCodes = getStaleRooms(ROOM_MAX_AGE_MS)

	let deleted = 0
	let skipped = 0

	for (const code of staleCodes) {
		const users = getRoomUsers(code)

		if (users.length > 0) {
			// Room has connected users - bump activity so we don't re-check next tick
			updateRoomActivity(code)
			skipped++
			continue
		}

		// Room is empty and stale - safe to delete
		deleteRoom(code)
		removeRoom(code)
		deleted++
	}

	// Prune old messages
	const pruned = pruneOldMessages(MESSAGE_MAX_AGE_MS)

	if (deleted > 0 || skipped > 0 || pruned > 0) {
		console.log(
			`[Cleanup] Removed ${deleted} stale rooms (skipped ${skipped} occupied), pruned ${pruned} old messages`,
		)
	}
}

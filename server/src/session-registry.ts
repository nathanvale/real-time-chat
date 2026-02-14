/**
 * Server-side session registry for real-time chat.
 *
 * Manages the mapping between sessionId (client-generated UUID) and
 * socket connection state. Replaces the old socketUsers Map pattern.
 * Single source of truth for who is connected and where.
 */

/**
 * Server-side session entry.
 * Keyed by sessionId (client-generated UUID, stable across reconnects).
 * The disconnect timer lives ON the session it guards (no stale closures).
 */
export type SessionEntry = {
	sessionId: string
	socketId: string
	displayName: string
	roomCode: string
	disconnectTimer?: ReturnType<typeof setTimeout>
}

/**
 * Grace period before processing a disconnect as a real "leave".
 * On page refresh the old socket disconnects and a new one connects
 * almost simultaneously. This delay lets the rejoin happen first,
 * so we can detect that the user is still present and skip the
 * "left the room" / "joined the room" spam.
 */
export const DISCONNECT_GRACE_MS = 2000

/**
 * Session registry keyed by sessionId.
 * Single source of truth for who is connected and where.
 */
const sessions = new Map<string, SessionEntry>()

/**
 * Reverse lookup: socket ID -> sessionId.
 * Needed for disconnect/leave handlers where we only have the socket.
 */
const socketToSession = new Map<string, string>()

/**
 * Get session by sessionId.
 *
 * @param sessionId - Session ID to look up
 * @returns SessionEntry if found, undefined otherwise
 */
export function getSession(sessionId: string): SessionEntry | undefined {
	return sessions.get(sessionId)
}

/**
 * Get session for a socket via reverse lookup.
 *
 * @param socketId - Socket ID to look up
 * @returns SessionEntry if found, undefined otherwise
 */
export function getSessionBySocketId(
	socketId: string,
): SessionEntry | undefined {
	const sessionId = socketToSession.get(socketId)
	return sessionId ? sessions.get(sessionId) : undefined
}

/**
 * Register or update a session.
 * Also updates the socketToSession reverse mapping.
 *
 * @param entry - Session entry to store
 */
export function setSession(entry: SessionEntry): void {
	sessions.set(entry.sessionId, entry)
	socketToSession.set(entry.socketId, entry.sessionId)
}

/**
 * Delete a session and its reverse mapping.
 *
 * @param sessionId - Session ID to delete
 */
export function deleteSession(sessionId: string): void {
	const session = sessions.get(sessionId)
	if (session) {
		socketToSession.delete(session.socketId)
		sessions.delete(sessionId)
	}
}

/**
 * Delete just the socket->session reverse mapping.
 * Useful when updating a session with a new socket ID.
 *
 * @param socketId - Socket ID to remove from reverse mapping
 */
export function deleteSocketMapping(socketId: string): void {
	socketToSession.delete(socketId)
}

/**
 * Clear disconnect timer on a session if one exists.
 *
 * @param sessionId - Session ID whose timer to clear
 */
export function clearDisconnectTimer(sessionId: string): void {
	const session = sessions.get(sessionId)
	if (session?.disconnectTimer) {
		clearTimeout(session.disconnectTimer)
		session.disconnectTimer = undefined
	}
}

/**
 * Set disconnect timer on a session.
 *
 * @param sessionId - Session ID whose timer to set
 * @param timer - The setTimeout timer handle
 */
export function setDisconnectTimer(
	sessionId: string,
	timer: ReturnType<typeof setTimeout>,
): void {
	const session = sessions.get(sessionId)
	if (session) {
		session.disconnectTimer = timer
	}
}

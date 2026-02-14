import {
	MAX_DISPLAY_NAME_LENGTH,
	MAX_MESSAGE_LENGTH,
	MIN_DISPLAY_NAME_LENGTH,
	ROOM_CODE_PATTERN,
} from '../../shared/constants'

/**
 * Shared validators for display names, room codes, and message text.
 * Used by both Socket.IO handlers and REST API endpoints to prevent drift.
 */

/**
 * Validates display name meets requirements (2-20 chars after trimming).
 *
 * @param displayName - Display name to validate
 * @returns Trimmed display name if valid
 * @throws Error if validation fails
 */
export function validateDisplayName(displayName: string): string {
	const trimmed = displayName.trim()
	if (
		trimmed.length < MIN_DISPLAY_NAME_LENGTH ||
		trimmed.length > MAX_DISPLAY_NAME_LENGTH
	) {
		throw new Error(
			`Display name must be between ${MIN_DISPLAY_NAME_LENGTH} and ${MAX_DISPLAY_NAME_LENGTH} characters`,
		)
	}
	return trimmed
}

/**
 * Validates message text meets requirements (1-2000 chars after trimming).
 *
 * @param text - Message text to validate
 * @returns Trimmed text if valid
 * @throws Error if validation fails
 */
export function validateMessageText(text: string): string {
	const trimmed = text.trim()
	if (trimmed.length === 0) {
		throw new Error('Message text cannot be empty')
	}
	if (trimmed.length > MAX_MESSAGE_LENGTH) {
		throw new Error(
			`Message text cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
		)
	}
	return trimmed
}

/**
 * Validates room code format (6 uppercase alphanumeric chars).
 *
 * @param roomCode - Room code to validate
 * @returns The room code if valid
 * @throws Error if validation fails
 */
export function validateRoomCode(roomCode: string): string {
	if (!ROOM_CODE_PATTERN.test(roomCode)) {
		throw new Error(
			'Room code must be exactly 6 uppercase alphanumeric characters',
		)
	}
	return roomCode
}

/**
 * UUID v4 pattern for session ID validation.
 * Format: 8-4-4-4-12 hex characters (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
 * where y is 8, 9, a, or b (variant bits).
 */
const UUID_V4_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates session ID format (UUID v4).
 *
 * @param sessionId - Session ID to validate
 * @returns The session ID if valid
 * @throws Error if validation fails
 */
export function validateSessionId(sessionId: string): string {
	if (!UUID_V4_PATTERN.test(sessionId)) {
		throw new Error('Invalid session ID format')
	}
	return sessionId
}

/**
 * Escapes HTML special characters to prevent XSS.
 * Applied at the read boundary (API/socket output), not on write.
 * Raw text is stored in SQLite for searchability and clean exports.
 *
 * @param input - Raw text string
 * @returns HTML-entity-encoded string safe for browser rendering
 */
export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
}

/**
 * Extracts a human-readable error message from an unknown error.
 * Used in catch blocks to avoid repeating the instanceof check.
 *
 * @param error - The caught error value
 * @param fallback - Default message if error is not an Error instance
 * @returns The error message string
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback
}

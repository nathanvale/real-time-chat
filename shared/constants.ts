/**
 * Shared constants used by both client and server.
 * Single source of truth for validation limits and storage keys.
 */

/** sessionStorage key for persisting session data (tab-scoped). */
export const SESSION_STORAGE_KEY = 'chat-session'

/** Minimum display name length after trimming. */
export const MIN_DISPLAY_NAME_LENGTH = 2

/** Maximum display name length after trimming. */
export const MAX_DISPLAY_NAME_LENGTH = 20

/** Maximum message text length after trimming. */
export const MAX_MESSAGE_LENGTH = 2000

/** Room code length (6 uppercase alphanumeric characters). */
export const ROOM_CODE_LENGTH = 6

/** Room code validation pattern. */
export const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/

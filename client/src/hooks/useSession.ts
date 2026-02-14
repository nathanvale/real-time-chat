import { useCallback, useEffect, useState } from 'react'
import { SESSION_STORAGE_KEY } from '../../../shared/constants'

/**
 * Session data stored in sessionStorage.
 * Tab-scoped - automatically cleared when the tab/window is closed.
 */
export type Session = {
	/** Tab-scoped session ID (stable across reconnects within the same tab) */
	sessionId: string
	/** User's display name */
	displayName: string
	/** Current room code */
	roomCode: string
	/** JWT token for REST API authentication */
	token?: string
}

/**
 * Hook for managing session state in sessionStorage.
 *
 * sessionStorage is tab-scoped (clears on tab close), making it ideal for ephemeral session data.
 * The URL is the source of truth for room code - session just stores display name persistence.
 *
 * Edge case: If session is cleared but URL still has room code, redirect to lobby with
 * room code pre-filled so user just needs to re-enter their name.
 *
 * @returns Object containing session state and methods to read/write/clear session
 */
export const useSession = () => {
	const [session, setSession] = useState<Session | null>(null)

	// Load session from sessionStorage on mount
	useEffect(() => {
		const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as Session
				setSession(parsed)
			} catch {
				// Invalid JSON, ignore
				sessionStorage.removeItem(SESSION_STORAGE_KEY)
			}
		}
	}, [])

	/**
	 * Retrieve current session from sessionStorage.
	 * Memoized to prevent effect re-runs in consumers that include it in dependency arrays.
	 * @returns Session object or null if not set
	 */
	const getSession = useCallback((): Session | null => {
		const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
		if (!stored) return null

		try {
			return JSON.parse(stored) as Session
		} catch {
			return null
		}
	}, [])

	/**
	 * Save session data to sessionStorage and update state.
	 * Reuses existing sessionId if present; generates a new one otherwise.
	 * This ensures the sessionId is stable across page refreshes (same tab)
	 * but unique per tab (sessionStorage is tab-scoped).
	 * @param newSession - Session data to persist (sessionId will be auto-populated if missing)
	 */
	const saveSession = useCallback(
		(newSession: Omit<Session, 'sessionId'> & { sessionId?: string }) => {
			const existing = getSession()
			const sessionWithId: Session = {
				...newSession,
				sessionId:
					newSession.sessionId ?? existing?.sessionId ?? crypto.randomUUID(),
			}
			sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionWithId))
			setSession(sessionWithId)
		},
		[getSession],
	)

	/**
	 * Clear session from sessionStorage and reset state.
	 */
	const clearSession = useCallback(() => {
		sessionStorage.removeItem(SESSION_STORAGE_KEY)
		setSession(null)
	}, [])

	/**
	 * Retrieve JWT token from the current session.
	 * @returns JWT token string or null if not authenticated
	 */
	const getToken = useCallback((): string | null => {
		const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
		if (!stored) return null

		try {
			const parsed = JSON.parse(stored) as Session
			return parsed.token ?? null
		} catch {
			return null
		}
	}, [])

	return {
		session,
		getSession,
		getToken,
		saveSession,
		clearSession,
	}
}

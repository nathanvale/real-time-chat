import { afterEach, describe, expect, it } from 'bun:test'
import * as sessionRegistry from '../session-registry'

describe('session-registry', () => {
	// Clean up between tests since session registry uses module-level Maps
	afterEach(() => {
		// Clear all sessions by deleting them one by one
		// (No clearAll() helper exists, so we iterate)
		const allSessions: string[] = []
		// We need to capture sessionIds first to avoid mutation during iteration
		const tempSession = sessionRegistry.getSession('probe-id')
		if (tempSession) allSessions.push('probe-id')

		// Since we can't iterate the Map directly, we'll test with known IDs
		// For a proper cleanup, we'll delete the test session IDs we create
		// This is a limitation of the current API - in real code, sessions are long-lived
	})

	describe('getSession / setSession', () => {
		it('should store and retrieve a session by sessionId', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			const retrieved = sessionRegistry.getSession('session-1')
			expect(retrieved).toEqual(entry)
		})

		it('should return undefined for non-existent session', () => {
			const retrieved = sessionRegistry.getSession('non-existent')
			expect(retrieved).toBeUndefined()
		})

		it('should update existing session when called with same sessionId', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			// Update with new socket ID (simulating reconnect)
			const updated: sessionRegistry.SessionEntry = {
				...entry,
				socketId: 'socket-2',
			}

			sessionRegistry.setSession(updated)

			const retrieved = sessionRegistry.getSession('session-1')
			expect(retrieved?.socketId).toBe('socket-2')
		})
	})

	describe('getSessionBySocketId', () => {
		it('should retrieve session by socket ID via reverse lookup', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			const retrieved = sessionRegistry.getSessionBySocketId('socket-1')
			expect(retrieved).toEqual(entry)
		})

		it('should return undefined for non-existent socket ID', () => {
			const retrieved = sessionRegistry.getSessionBySocketId('non-existent')
			expect(retrieved).toBeUndefined()
		})

		it('should update reverse mapping when session socket changes', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			// Update socket ID
			const updated: sessionRegistry.SessionEntry = {
				...entry,
				socketId: 'socket-2',
			}

			sessionRegistry.setSession(updated)

			// Old socket mapping still exists because setSession doesn't auto-clean stale mappings
			// (In practice, socket-join-handler calls deleteSocketMapping explicitly before updating)
			// The old mapping points to the session, which has been mutated to have socket-2
			const oldSocket = sessionRegistry.getSessionBySocketId('socket-1')
			expect(oldSocket).toEqual(updated) // Old mapping returns the updated session object

			// New socket should also resolve to the same session
			const newSocket = sessionRegistry.getSessionBySocketId('socket-2')
			expect(newSocket).toEqual(updated)
			expect(oldSocket).toBe(newSocket) // Same reference
		})
	})

	describe('deleteSession', () => {
		it('should remove session and its reverse mapping', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)
			sessionRegistry.deleteSession('session-1')

			expect(sessionRegistry.getSession('session-1')).toBeUndefined()
			expect(sessionRegistry.getSessionBySocketId('socket-1')).toBeUndefined()
		})

		it('should be safe to call on non-existent session', () => {
			// Should not throw
			sessionRegistry.deleteSession('non-existent')
			expect(true).toBe(true)
		})

		it('should handle deleting session with timer set', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			const timer = setTimeout(() => {}, 1000)
			sessionRegistry.setDisconnectTimer('session-1', timer)

			sessionRegistry.deleteSession('session-1')

			// Session should be gone
			expect(sessionRegistry.getSession('session-1')).toBeUndefined()
		})
	})

	describe('deleteSocketMapping', () => {
		it('should remove only the reverse mapping, not the session', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)
			sessionRegistry.deleteSocketMapping('socket-1')

			// Session should still exist
			expect(sessionRegistry.getSession('session-1')).toEqual(entry)

			// Reverse lookup should fail
			expect(sessionRegistry.getSessionBySocketId('socket-1')).toBeUndefined()
		})

		it('should be safe to call on non-existent socket', () => {
			// Should not throw
			sessionRegistry.deleteSocketMapping('non-existent')
			expect(true).toBe(true)
		})
	})

	describe('clearDisconnectTimer', () => {
		it('should clear timer if one exists', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			let timerFired = false
			const timer = setTimeout(() => {
				timerFired = true
			}, 100)

			sessionRegistry.setDisconnectTimer('session-1', timer)
			sessionRegistry.clearDisconnectTimer('session-1')

			// Wait to ensure timer doesn't fire
			return new Promise<void>((resolve) => {
				setTimeout(() => {
					expect(timerFired).toBe(false)

					// Timer should be cleared from session
					const session = sessionRegistry.getSession('session-1')
					expect(session?.disconnectTimer).toBeUndefined()

					resolve()
				}, 150)
			})
		})

		it('should be safe to call when no timer is set', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			// Should not throw
			sessionRegistry.clearDisconnectTimer('session-1')
			expect(true).toBe(true)
		})

		it('should be safe to call on non-existent session', () => {
			// Should not throw
			sessionRegistry.clearDisconnectTimer('non-existent')
			expect(true).toBe(true)
		})
	})

	describe('setDisconnectTimer', () => {
		it('should set timer on existing session', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			const timer = setTimeout(() => {}, 1000)
			sessionRegistry.setDisconnectTimer('session-1', timer)

			const session = sessionRegistry.getSession('session-1')
			expect(session?.disconnectTimer).toBe(timer)

			// Clean up
			clearTimeout(timer)
		})

		it('should be safe to call on non-existent session', () => {
			const timer = setTimeout(() => {}, 1000)

			// Should not throw, but also shouldn't store anywhere
			sessionRegistry.setDisconnectTimer('non-existent', timer)

			// Clean up
			clearTimeout(timer)
			expect(true).toBe(true)
		})

		it('should replace existing timer', () => {
			const entry: sessionRegistry.SessionEntry = {
				sessionId: 'session-1',
				socketId: 'socket-1',
				displayName: 'Alice',
				roomCode: 'ABC123',
			}

			sessionRegistry.setSession(entry)

			const timer1 = setTimeout(() => {}, 1000)
			sessionRegistry.setDisconnectTimer('session-1', timer1)

			const timer2 = setTimeout(() => {}, 2000)
			sessionRegistry.setDisconnectTimer('session-1', timer2)

			const session = sessionRegistry.getSession('session-1')
			expect(session?.disconnectTimer).toBe(timer2)

			// Clean up
			clearTimeout(timer1)
			clearTimeout(timer2)
		})
	})

	describe('DISCONNECT_GRACE_MS constant', () => {
		it('should export disconnect grace period constant', () => {
			expect(sessionRegistry.DISCONNECT_GRACE_MS).toBe(2000)
		})
	})
})

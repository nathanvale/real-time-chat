/**
 * Socket.IO event handlers for real-time chat.
 *
 * Uses a server-side session registry keyed by client-generated sessionId
 * (UUID in sessionStorage) to eliminate race conditions around reconnects.
 * The sessionId is stable across page refreshes (same tab) but unique per tab.
 *
 * Validators are imported from validation.ts (shared with REST API endpoints).
 */

import type { Server, Socket } from 'socket.io'
import type {
	ClientToServerEvents,
	Message,
	ServerToClientEvents,
} from '../../shared/types'
import { verifyToken } from './api/jwt'
import { addMessage, updateRoomActivity } from './db'
import * as roomManager from './room-manager'
import * as sessionRegistry from './session-registry'
import { handleRoomJoin } from './socket-join-handler'
import { extractErrorMessage, validateMessageText } from './validation'

/**
 * Socket.data type for authenticated connection metadata.
 * Populated by JWT middleware after successful authentication.
 */
interface SocketData {
	displayName: string
}

/**
 * Typed Socket.IO server and socket types using the event maps from shared/types.ts
 */
type TypedServer = Server<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>
type TypedSocket = Socket<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<string, never>,
	SocketData
>

/**
 * Broadcasts a user-left event and persists the system message.
 *
 * @param io - Server instance for broadcasting
 * @param roomCode - Room to broadcast to
 * @param sessionId - Session ID of the leaving user
 * @param displayName - Display name for the system message
 */
function broadcastUserLeft(
	io: TypedServer,
	roomCode: string,
	sessionId: string,
	displayName: string,
): void {
	io.to(roomCode).emit('room:user-left', {
		sessionId,
		displayName,
	})

	const systemMessage = addMessage({
		roomCode,
		userId: sessionId,
		displayName,
		text: `${displayName} left the room`,
		type: 'system',
		timestamp: Date.now(),
	})

	io.to(roomCode).emit('message:received', {
		message: systemMessage,
	})
}

/**
 * Creates a typed auth error for Socket.IO middleware rejection.
 *
 * @param message - Human-readable error message
 * @returns Error with structured data payload for client error handling
 */
function createAuthError(
	message: string,
): Error & { data: { code: string; message: string } } {
	const err = new Error('AUTH_REQUIRED') as Error & {
		data: { code: string; message: string }
	}
	err.data = { code: 'AUTH_REQUIRED', message }
	return err
}

/**
 * Sets up all Socket.IO event handlers for a server instance.
 *
 * Wires up connection event and all client-to-server events:
 * - room:join
 * - room:leave
 * - message:send
 * - typing:start
 * - typing:stop
 * - disconnect
 *
 * @param io - Typed Socket.IO server instance
 */
export function setupSocketHandlers(io: TypedServer): void {
	// JWT authentication middleware -- reject unauthenticated connections
	io.use(async (socket, next) => {
		const token = socket.handshake.auth?.token as string | undefined
		if (!token) {
			return next(createAuthError('Authentication required. Please log in.'))
		}
		try {
			const payload = await verifyToken(token)
			socket.data = { displayName: payload.sub }
			next()
		} catch {
			next(createAuthError('Session expired. Please re-authenticate.'))
		}
	})

	io.on('connection', (socket: TypedSocket) => {
		console.log(
			`[Socket] Authenticated connection: ${socket.id} (${socket.data.displayName})`,
		)

		/**
		 * Join an existing room by code.
		 * Delegates to handleRoomJoin for full logic.
		 */
		socket.on('room:join', (data) => {
			handleRoomJoin(socket, io, data)
		})

		/**
		 * Leave the current room.
		 * Removes user from room manager, leaves socket room,
		 * broadcasts room:user-left, persists system "left" message.
		 */
		socket.on('room:leave', () => {
			handleUserLeave(socket, io, true)
		})

		/**
		 * Send a chat message to the current room.
		 * Validates message text, persists to DB,
		 * broadcasts message:received to all users (including sender).
		 */
		socket.on('message:send', ({ text }) => {
			try {
				const validText = validateMessageText(text)
				const session = sessionRegistry.getSessionBySocketId(socket.id)

				if (!session) {
					socket.emit('room:error', {
						code: 'AUTH_REQUIRED',
						message: 'You must join a room before sending messages',
					})
					return
				}

				const { displayName, roomCode } = session

				// Persist message to database
				const message: Message = addMessage({
					roomCode,
					userId: session.sessionId,
					displayName,
					text: validText,
					type: 'user',
					timestamp: Date.now(),
				})

				// Update room activity for TTL
				updateRoomActivity(roomCode)

				// Broadcast to all users in room (including sender)
				io.to(roomCode).emit('message:received', {
					message,
				})

				console.log(
					`[Socket] Message sent in room ${roomCode} by ${displayName}`,
				)
			} catch (error) {
				const message = extractErrorMessage(error, 'Failed to send message')
				socket.emit('room:error', { code: 'VALIDATION_ERROR', message })
				console.error(`[Socket] message:send error: ${message}`)
			}
		})

		/**
		 * Indicate user started typing.
		 * Broadcasts typing:started to other users in the room (excludes sender).
		 */
		socket.on('typing:start', () => {
			const session = sessionRegistry.getSessionBySocketId(socket.id)
			if (!session) return

			const { displayName, roomCode } = session

			// Broadcast to room, excluding sender
			socket.to(roomCode).emit('typing:started', {
				sessionId: session.sessionId,
				displayName,
				roomCode,
			})
		})

		/**
		 * Indicate user stopped typing.
		 * Broadcasts typing:stopped to other users in the room (excludes sender).
		 */
		socket.on('typing:stop', () => {
			const session = sessionRegistry.getSessionBySocketId(socket.id)
			if (!session) return

			// Broadcast to room, excluding sender
			socket.to(session.roomCode).emit('typing:stopped', {
				sessionId: session.sessionId,
			})
		})

		/**
		 * Handle socket disconnect.
		 * Immediately clears typing indicator, then defers leave via grace period.
		 */
		socket.on('disconnect', () => {
			console.log(`[Socket] Disconnect: ${socket.id}`)

			// Immediately broadcast typing:stopped so other users don't see ghost typing
			const session = sessionRegistry.getSessionBySocketId(socket.id)
			if (session) {
				io.to(session.roomCode).emit('typing:stopped', {
					sessionId: session.sessionId,
				})
			}

			handleUserLeave(socket, io)
		})
	})
}

/**
 * Handles user leaving a room (explicit leave or disconnect).
 *
 * For explicit room:leave events the cleanup happens immediately.
 * For disconnects (e.g. page refresh) the cleanup is deferred by
 * DISCONNECT_GRACE_MS. The timer is stored ON the session entry so
 * reconnection can cancel it by reference. Timer resolution checks
 * current session state (not captured closure state) to avoid races.
 *
 * @param socket - Socket instance
 * @param io - Server instance (for broadcasting)
 * @param immediate - Skip the grace period (used for explicit leave)
 */
function handleUserLeave(
	socket: TypedSocket,
	io: TypedServer,
	immediate = false,
): void {
	const session = sessionRegistry.getSessionBySocketId(socket.id)
	if (!session) return

	const { sessionId } = session

	const { displayName, roomCode } = session
	const socketId = socket.id

	/**
	 * Execute the actual leave: remove from room, broadcast, persist.
	 * Wrapped in try/catch to prevent unhandled exceptions in setTimeout.
	 */
	const doLeave = () => {
		try {
			// Re-read session state -- if socketId changed, user reconnected
			const currentSession = sessionRegistry.getSession(sessionId)
			if (currentSession && currentSession.socketId !== socketId) {
				// User reconnected with a new socket; just clean up stale mapping
				sessionRegistry.deleteSocketMapping(socketId)
				return
			}

			// Remove from room manager
			const removed = roomManager.leaveRoom(roomCode, sessionId)
			if (!removed) {
				// Already removed (e.g. reconnected and left again)
				sessionRegistry.deleteSession(sessionId)
				return
			}

			// Leave socket room
			socket.leave(roomCode)

			// Clean up session registry
			sessionRegistry.deleteSession(sessionId)

			broadcastUserLeft(io, roomCode, sessionId, displayName)

			console.log(`[Socket] User ${displayName} left room ${roomCode}`)
		} catch (error) {
			console.error(`[Socket] Error in doLeave for ${displayName}:`, error)
		}
	}

	if (immediate) {
		doLeave()
	} else {
		// Store timer on the session so reconnection can cancel it
		const timer = setTimeout(doLeave, sessionRegistry.DISCONNECT_GRACE_MS)
		sessionRegistry.setDisconnectTimer(sessionId, timer)
	}
}

/**
 * Socket handler for room:join events.
 *
 * Handles the complete room join flow including:
 * - Validation of roomCode, sessionId, and displayName
 * - Room existence check
 * - Session-based rejoin detection (eliminates double join on refresh)
 * - Room switch cleanup (leaving old room before joining new one)
 * - Room manager + socket room membership
 * - Fetching messages snapshot before socket.join() (eliminates ordering gap)
 * - Session registry updates
 * - Broadcasting room:joined to client, room:user-joined to peers
 * - Persisting system message for new joins (not rejoins)
 */

import type { Server, Socket } from 'socket.io'
import type {
	ClientToServerEvents,
	ServerToClientEvents,
	User,
} from '../../shared/types'
import { addMessage, getMessagesByRoom, updateRoomActivity } from './db'
import * as roomManager from './room-manager'
import * as sessionRegistry from './session-registry'
import {
	extractErrorMessage,
	validateDisplayName,
	validateRoomCode,
	validateSessionId,
} from './validation'

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
 * Used during room switch cleanup (leaving old room before joining new one).
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
 * Handles room:join events.
 *
 * Session-aware rejoin detection:
 * 1. Look up sessions.get(sessionId)
 * 2. If existing session has a disconnectTimer, cancel it (reconnecting)
 * 3. isRejoin = existingSession?.roomCode === roomCode
 * 4. Update session entry with new socketId
 * 5. If !isRejoin: broadcast join events + system message
 * 6. If isRejoin: silent reconnect, no notifications
 *
 * Message ordering: fetch messages BEFORE socket.join() so the client
 * gets the snapshot before receiving live events.
 *
 * @param socket - Socket instance for the connecting client
 * @param io - Server instance for broadcasting
 * @param data - Join request containing roomCode and sessionId
 */
export function handleRoomJoin(
	socket: TypedSocket,
	io: TypedServer,
	data: { roomCode: string; sessionId: string },
): void {
	try {
		const validRoomCode = validateRoomCode(data.roomCode)
		const validSessionId = validateSessionId(data.sessionId)
		// Use JWT-authenticated displayName, not client payload, to prevent impersonation
		const validDisplayName = validateDisplayName(socket.data.displayName)

		// Check if room exists
		if (!roomManager.roomExists(validRoomCode)) {
			socket.emit('room:error', {
				code: 'ROOM_NOT_FOUND',
				message: 'Room not found',
			})
			return
		}

		// Session-based rejoin detection
		const existingSession = sessionRegistry.getSession(validSessionId)
		if (existingSession?.disconnectTimer) {
			sessionRegistry.clearDisconnectTimer(validSessionId)
		}
		const isRejoin = existingSession?.roomCode === validRoomCode

		// Room switch cleanup: leave old room before joining new one
		if (existingSession && !isRejoin) {
			const oldRoomCode = existingSession.roomCode
			const oldSocketId = existingSession.socketId

			// Remove from old room's in-memory users
			roomManager.leaveRoom(oldRoomCode, validSessionId)

			broadcastUserLeft(
				io,
				oldRoomCode,
				validSessionId,
				existingSession.displayName,
			)

			// Evict the stale socket from the old room
			// Use the OLD socket ID, not the current socket
			io.sockets.sockets.get(oldSocketId)?.leave(oldRoomCode)
		}

		// Create user object
		const user: User = {
			socketId: socket.id,
			sessionId: validSessionId,
			displayName: validDisplayName,
			roomCode: validRoomCode,
			connectedAt: Date.now(),
		}

		// Add user to room manager (dedup by sessionId)
		roomManager.joinRoom(validRoomCode, user)

		// Update room activity for TTL
		updateRoomActivity(validRoomCode)

		// Fetch snapshot BEFORE joining socket room to avoid ordering gap
		const messages = getMessagesByRoom(validRoomCode)
		const users = roomManager.getRoomUsers(validRoomCode)

		// Join socket room for broadcasting
		socket.join(validRoomCode)

		// Update session registry
		// Clean up old socket mapping if this session had a different socket
		if (existingSession) {
			sessionRegistry.deleteSocketMapping(existingSession.socketId)
		}
		sessionRegistry.setSession({
			sessionId: validSessionId,
			socketId: socket.id,
			displayName: validDisplayName,
			roomCode: validRoomCode,
		})

		// Emit room:joined to the joining client
		socket.emit('room:joined', {
			room: {
				code: validRoomCode,
				users,
				messages,
				createdAt: Date.now(), // Approximate - real value is in DB
			},
			user,
		})

		// Always broadcast room:user-joined so peers update their user list
		// (on rejoin the socket ID changes, peers need the new User object)
		socket.to(validRoomCode).emit('room:user-joined', {
			user,
		})

		// Only persist system message + toast for genuinely new users
		if (!isRejoin) {
			// Persist system "joined" message to database
			const systemMessage = addMessage({
				roomCode: validRoomCode,
				userId: validSessionId,
				displayName: user.displayName,
				text: `${user.displayName} joined the room`,
				type: 'system',
				timestamp: Date.now(),
			})

			// Broadcast the system message to all users (including sender)
			io.to(validRoomCode).emit('message:received', {
				message: systemMessage,
			})
		}

		console.log(
			`[Socket] User ${validDisplayName} ${isRejoin ? 'rejoined' : 'joined'} room ${validRoomCode}`,
		)
	} catch (error) {
		const message = extractErrorMessage(error, 'Failed to join room')
		socket.emit('room:error', { code: 'VALIDATION_ERROR', message })
		console.error(`[Socket] room:join error: ${message}`)
	}
}

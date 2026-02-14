/**
 * Shared TypeScript types for real-time chat application.
 * Used by both client and server to ensure type safety across the Socket.IO boundary.
 */

/**
 * Represents a connected user in a chat room.
 * Users are transient (in-memory only) and do not persist to the database.
 */
export type User = {
	/** Socket.IO connection ID (unique per connection, changes on reconnect) */
	socketId: string
	/** Tab-scoped session ID (stable across reconnects, generated via crypto.randomUUID()) */
	sessionId: string
	/** User's chosen display name */
	displayName: string
	/** Room code the user is currently in */
	roomCode: string
	/** Unix timestamp (ms) when user connected */
	connectedAt: number
}

/**
 * Represents a chat message.
 * Messages persist to SQLite and survive page refreshes.
 */
export type Message = {
	/** Unique message ID (UUID) */
	id: string
	/** ID of user who sent the message */
	userId: string
	/** Display name of user who sent the message (denormalized for persistence) */
	displayName: string
	/** Message text content */
	text: string
	/** Message type - 'user' for chat messages, 'system' for join/leave notifications */
	type: 'user' | 'system'
	/** Unix timestamp (ms) when message was sent */
	timestamp: number
	/** Room code this message belongs to */
	roomCode: string
}

/**
 * Represents a chat room.
 * Room metadata persists to SQLite, but the users array is in-memory only.
 */
export type Room = {
	/** Unique 6-character uppercase alphanumeric room code */
	code: string
	/** Currently connected users (in-memory, not persisted) */
	users: User[]
	/** Message history (loaded from SQLite on join) */
	messages: Message[]
	/** Unix timestamp (ms) when room was created */
	createdAt: number
}

/**
 * A toast notification triggered by a system message.
 */
export type Toast = {
	id: string
	text: string
}

/**
 * Error codes for structured error handling across socket and REST boundaries.
 * String literal union (not enum) for tree-shaking compatibility.
 */
type ChatErrorCode =
	| 'ROOM_NOT_FOUND'
	| 'VALIDATION_ERROR'
	| 'AUTH_REQUIRED'
	| 'INTERNAL_ERROR'

/**
 * Structured error payload used in room:error events and REST error responses.
 */
export type ChatError = {
	code: ChatErrorCode
	message: string
}

/**
 * Events that clients can emit to the server.
 */
export type ClientToServerEvents = {
	/**
	 * Join an existing room by code.
	 * Display name is taken from the JWT-authenticated identity, not the payload.
	 * Server responds with 'room:joined' on success or 'room:error' on failure.
	 */
	'room:join': (data: { roomCode: string; sessionId: string }) => void

	/**
	 * Leave the current room.
	 * Server broadcasts 'room:user-left' to other users in the room.
	 */
	'room:leave': () => void

	/**
	 * Send a chat message to the current room.
	 * Server broadcasts 'message:received' to all users in the room.
	 */
	'message:send': (data: { text: string }) => void

	/**
	 * Indicate that user started typing.
	 * Server broadcasts 'typing:started' to other users in the room.
	 */
	'typing:start': () => void

	/**
	 * Indicate that user stopped typing.
	 * Server broadcasts 'typing:stopped' to other users in the room.
	 */
	'typing:stop': () => void
}

/**
 * Events that the server can emit to clients.
 */
export type ServerToClientEvents = {
	/**
	 * Sent to the client who joined a room, providing full room state.
	 */
	'room:joined': (data: { room: Room; user: User }) => void

	/**
	 * Broadcast to all users in a room when a new user joins.
	 */
	'room:user-joined': (data: { user: User }) => void

	/**
	 * Broadcast to all users in a room when a user leaves.
	 */
	'room:user-left': (data: { sessionId: string; displayName: string }) => void

	/**
	 * Sent to a client when a room operation fails (e.g., room not found).
	 */
	'room:error': (data: ChatError) => void

	/**
	 * Broadcast to all users in a room when a new message is sent.
	 */
	'message:received': (data: { message: Message }) => void

	/**
	 * Broadcast to other users in a room when someone starts typing.
	 */
	'typing:started': (data: {
		sessionId: string
		displayName: string
		roomCode: string
	}) => void

	/**
	 * Broadcast to other users in a room when someone stops typing.
	 */
	'typing:stopped': (data: { sessionId: string }) => void
}

// ---------------------------------------------------------------------------
// REST API types
// ---------------------------------------------------------------------------

/** POST /api/auth response */
export type AuthResponse = {
	token: string
}

/** POST /api/rooms response */
export type CreateRoomResponse = {
	roomCode: string
}

/** GET /api/rooms/:code/messages response */
export type GetMessagesResponse = {
	messages: Message[]
}

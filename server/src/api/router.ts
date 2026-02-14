/**
 * REST API router with JWT authentication middleware.
 *
 * Endpoints:
 * - POST /api/auth         -- { displayName } -> { token }
 * - POST /api/rooms         -- (JWT required) -> { roomCode }
 * - GET  /api/rooms/:code/messages?limit=50 -- (JWT required) -> { messages }
 *
 * Interview answer: "REST for request/response, Socket.IO for real-time push.
 * Same hybrid pattern as Ethos API + WebSocket in Ellucian Experience."
 */

import { getMessagesByRoom } from '../db'
import * as roomManager from '../room-manager'
import {
	extractErrorMessage,
	validateDisplayName,
	validateRoomCode,
} from '../validation'
import { signToken, verifyToken } from './jwt'

/** Security headers applied to all API responses */
const SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'Content-Type': 'application/json',
}

/**
 * Extracts and verifies a Bearer token from the Authorization header.
 *
 * @param req - Incoming request
 * @returns Decoded JWT payload with sub (displayName)
 * @throws Error if token is missing, malformed, or invalid
 */
async function authenticate(
	req: Request,
): Promise<{ sub: string; iat: number; exp: number }> {
	const authHeader = req.headers.get('Authorization')
	if (!authHeader?.startsWith('Bearer ')) {
		throw new Error('Missing or invalid Authorization header')
	}

	const token = authHeader.slice(7)
	return verifyToken(token)
}

/**
 * Build a JSON Response with security headers.
 *
 * @param body - Response body (will be JSON.stringify'd)
 * @param status - HTTP status code
 * @param extraHeaders - Additional headers to merge
 * @returns Response object
 */
function jsonResponse(
	body: unknown,
	status = 200,
	extraHeaders: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...SECURITY_HEADERS, ...extraHeaders },
	})
}

/**
 * Build a JSON error Response.
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @param code - Optional error code
 * @returns Response object
 */
function errorResponse(
	message: string,
	status: number,
	code?: string,
): Response {
	return jsonResponse({ error: message, ...(code && { code }) }, status)
}

/**
 * POST /api/auth -- Generate a JWT for a display name.
 *
 * No authentication required (this IS the auth endpoint).
 * Validates display name, signs a token, returns it.
 */
async function handleAuth(req: Request): Promise<Response> {
	if (req.method !== 'POST') {
		return errorResponse('Method not allowed', 405)
	}

	try {
		const body = (await req.json()) as { displayName?: string }

		if (!body.displayName || typeof body.displayName !== 'string') {
			return errorResponse('displayName is required', 400)
		}

		const validName = validateDisplayName(body.displayName)
		const token = await signToken(validName)

		return jsonResponse({ token }, 200, { 'Cache-Control': 'no-store' })
	} catch (error) {
		const message = extractErrorMessage(error, 'Authentication failed')
		return errorResponse(message, 400, 'VALIDATION_ERROR')
	}
}

/**
 * POST /api/rooms -- Create a new room (JWT required).
 *
 * Creates room in DB + memory, returns room code.
 * Client should immediately emit room:join via Socket.IO after this succeeds.
 */
async function handleCreateRoom(req: Request): Promise<Response> {
	if (req.method !== 'POST') {
		return errorResponse('Method not allowed', 405)
	}

	try {
		await authenticate(req)
	} catch (error) {
		const message = extractErrorMessage(error, 'Authentication failed')
		return errorResponse(message, 401, 'AUTH_REQUIRED')
	}

	try {
		const roomCode = roomManager.createRoom()
		return jsonResponse({ roomCode }, 201)
	} catch (error) {
		const message = extractErrorMessage(error, 'Failed to create room')
		return errorResponse(message, 500, 'INTERNAL_ERROR')
	}
}

/**
 * GET /api/rooms/:code/messages -- Fetch message history (JWT required).
 *
 * Returns up to `limit` messages (default 50, max 100) for the given room.
 * Room must exist in the database.
 */
async function handleGetMessages(
	req: Request,
	roomCode: string,
): Promise<Response> {
	if (req.method !== 'GET') {
		return errorResponse('Method not allowed', 405)
	}

	try {
		await authenticate(req)
	} catch (error) {
		const message = extractErrorMessage(error, 'Authentication failed')
		return errorResponse(message, 401, 'AUTH_REQUIRED')
	}

	try {
		const validCode = validateRoomCode(roomCode)

		// Check room exists
		if (!roomManager.roomExists(validCode)) {
			return errorResponse('Room not found', 404, 'ROOM_NOT_FOUND')
		}

		// Parse limit from query string (default 50, max 100)
		const url = new URL(req.url)
		const limitParam = url.searchParams.get('limit')
		const limit = Math.min(Math.max(1, Number(limitParam) || 50), 100)

		const messages = getMessagesByRoom(validCode, limit)
		return jsonResponse({ messages })
	} catch (error) {
		const message = extractErrorMessage(error, 'Failed to get messages')
		return errorResponse(message, 400, 'VALIDATION_ERROR')
	}
}

/**
 * Route incoming /api/* requests to the appropriate handler.
 *
 * URL pattern matching:
 * - /api/auth -> handleAuth
 * - /api/rooms -> handleCreateRoom
 * - /api/rooms/:code/messages -> handleGetMessages
 *
 * @param req - Incoming request (URL must start with /api/)
 * @returns Response or null if no route matches
 */
export async function handleApiRequest(req: Request): Promise<Response | null> {
	const url = new URL(req.url)
	const path = url.pathname

	// POST /api/auth
	if (path === '/api/auth') {
		return handleAuth(req)
	}

	// POST /api/rooms
	if (path === '/api/rooms') {
		return handleCreateRoom(req)
	}

	// GET /api/rooms/:code/messages
	const messagesMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{6})\/messages$/)
	if (messagesMatch) {
		return handleGetMessages(req, messagesMatch[1])
	}

	return null
}

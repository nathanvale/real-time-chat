/**
 * Socket.IO server entry point using @socket.io/bun-engine.
 *
 * Uses native Bun HTTP server (not Node.js polyfill) for better performance.
 * Serves both WebSocket connections (Socket.IO) and static files (built React app) in production.
 *
 * In dev mode:
 * - Socket.IO server runs on PORT (default 3001)
 * - Vite dev server runs on 5173 (separate process)
 * - CORS enabled for localhost:5173
 *
 * In production:
 * - Single server serves both static files and WebSocket connections
 * - No CORS needed (same origin)
 */

import { Server as Engine } from '@socket.io/bun-engine'
import { Server } from 'socket.io'
import type {
	ClientToServerEvents,
	ServerToClientEvents,
} from '../../shared/types'
import { handleApiRequest } from './api/router'
import { startCleanupSchedule } from './cleanup'
import { setupSocketHandlers } from './socket-handlers'
import { handleStaticFiles } from './static'

const PORT = Number(process.env.PORT) || 3001
const isDev = process.env.NODE_ENV !== 'production'

/**
 * Create typed Socket.IO server using event maps from shared/types.ts
 */
const io = new Server<ClientToServerEvents, ServerToClientEvents>({
	cors: isDev
		? {
				origin: 'http://localhost:5173',
				methods: ['GET', 'POST'],
			}
		: undefined,
})

/**
 * Create Bun engine for native HTTP handling
 */
const engine = new Engine({ path: '/socket.io/' })

/**
 * Bind Socket.IO to Bun engine
 */
io.bind(engine)

/**
 * Set up all Socket.IO event handlers
 */
setupSocketHandlers(io)

// Start periodic cleanup for stale rooms and old messages
startCleanupSchedule()

console.log(
	`[Server] Starting on port ${PORT} (${isDev ? 'development' : 'production'})`,
)

/**
 * Get the engine handler which provides fetch, websocket, and idleTimeout.
 *
 * Why spread the handler: Bun.serve() requires the `websocket` property at the
 * top level of the config object for WebSocket upgrades to work. The engine's
 * handler() returns { fetch, websocket, idleTimeout } - we spread it and
 * override `fetch` to add static file serving in production.
 */
const engineHandler = engine.handler()

/** CORS origin for dev mode (Vite dev server). */
const CORS_ORIGIN = 'http://localhost:5173'

/**
 * Adds CORS headers to an API response for dev mode.
 *
 * @param response - Response to add headers to
 */
function addCorsHeaders(response: Response): void {
	response.headers.set('Access-Control-Allow-Origin', CORS_ORIGIN)
	response.headers.set(
		'Access-Control-Allow-Headers',
		'Content-Type, Authorization',
	)
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

/**
 * Creates a CORS preflight response for dev mode.
 *
 * @returns 204 response with CORS headers
 */
function corsPreflightResponse(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': CORS_ORIGIN,
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		},
	})
}

/**
 * Export Bun server config with:
 * - Native Bun HTTP via engine.handler()
 * - Static file serving in production
 * - idleTimeout from engine (exceeds Socket.IO pingInterval)
 */
export default {
	port: PORT,
	...engineHandler,
	async fetch(
		req: Request,
		server: { upgrade: (req: Request, options?: object) => boolean },
	) {
		// Let engine handle Socket.IO requests (including WebSocket upgrades)
		const url = new URL(req.url)
		if (url.pathname.startsWith('/socket.io/')) {
			return engineHandler.fetch(req, server)
		}

		// Handle REST API requests (/api/*)
		if (url.pathname.startsWith('/api/')) {
			// Handle CORS preflight in dev mode
			if (isDev && req.method === 'OPTIONS') {
				return corsPreflightResponse()
			}

			const apiResponse = await handleApiRequest(req)
			if (apiResponse && isDev) {
				addCorsHeaders(apiResponse)
			}

			if (apiResponse) {
				return apiResponse
			}

			return new Response(JSON.stringify({ error: 'Not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			})
		}

		// Try to serve static files (production only)
		const staticResponse = await handleStaticFiles(req)
		if (staticResponse) {
			return staticResponse
		}

		// Fallback: 404
		return new Response('Not found', { status: 404 })
	},
}

/**
 * Static file serving for the built React app.
 *
 * In production (NODE_ENV=production), serves files from client/dist/.
 * In dev, this is a no-op (Vite dev server handles static files).
 *
 * SPA fallback: returns index.html for unmatched routes (for client-side routing).
 */

import path from 'node:path'
import { file } from 'bun'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * Path to built client files (client/dist/).
 * In production, the Dockerfile copies the built client to this location.
 */
const CLIENT_DIST_PATH = path.join(import.meta.dir, '../../client/dist')

/**
 * Handles static file serving for the built React app.
 *
 * Returns null in dev mode (Vite dev server handles static files).
 * In production:
 * - Serves files from client/dist/ for matching paths
 * - Returns index.html for unmatched routes (SPA fallback)
 *
 * @param req - HTTP request
 * @returns Response with file contents or null if not applicable
 */
export async function handleStaticFiles(
	req: Request,
): Promise<Response | null> {
	// In dev, let Vite dev server handle static files
	if (isDev) {
		return null
	}

	const url = new URL(req.url)
	const pathname = url.pathname

	// Skip Socket.IO paths
	if (pathname.startsWith('/socket.io/')) {
		return null
	}

	// Resolve and validate the file path to prevent directory traversal attacks
	const filePath = path.resolve(CLIENT_DIST_PATH, pathname.slice(1))
	if (!filePath.startsWith(CLIENT_DIST_PATH)) {
		return new Response('Forbidden', { status: 403 })
	}

	try {
		const fileHandle = file(filePath)
		const exists = await fileHandle.exists()

		if (exists) {
			return new Response(fileHandle)
		}
	} catch (_error) {
		// File doesn't exist or couldn't be read, fall through to SPA fallback
	}

	// SPA fallback: return index.html for unmatched routes
	// This allows React Router to handle client-side routing
	try {
		const indexPath = path.join(CLIENT_DIST_PATH, 'index.html')
		const indexFile = file(indexPath)
		const exists = await indexFile.exists()

		if (exists) {
			return new Response(indexFile, {
				headers: {
					'Content-Type': 'text/html',
				},
			})
		}
	} catch (error) {
		console.error('[Static] Failed to serve index.html:', error)
	}

	// If we get here, client/dist doesn't exist or is misconfigured
	return new Response('Not Found', { status: 404 })
}

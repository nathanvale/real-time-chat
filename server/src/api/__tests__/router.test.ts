import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { signToken } from '../jwt'
import { handleApiRequest } from '../router'

describe('API router', () => {
	beforeEach(() => {
		// Use dev secret for tests
		delete process.env.JWT_SECRET
		delete process.env.NODE_ENV
		// Use in-memory database for each test
		process.env.DATABASE_PATH = ':memory:'
	})

	afterEach(() => {
		delete process.env.DATABASE_PATH
	})

	/**
	 * Helper to create a Request for testing.
	 */
	function makeRequest(path: string, options: RequestInit = {}): Request {
		return new Request(`http://localhost:3001${path}`, {
			headers: { 'Content-Type': 'application/json' },
			...options,
		})
	}

	/**
	 * Helper to authenticate and get a token.
	 */
	async function getToken(displayName = 'Nathan'): Promise<string> {
		return signToken(displayName)
	}

	describe('POST /api/auth', () => {
		it('should return a token for a valid display name', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({ displayName: 'Nathan' }),
			})

			const res = await handleApiRequest(req)
			expect(res).not.toBeNull()
			expect(res!.status).toBe(200)

			const body = (await res!.json()) as { token: string }
			expect(body.token).toBeDefined()
			expect(typeof body.token).toBe('string')
		})

		it('should set Cache-Control: no-store', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({ displayName: 'Nathan' }),
			})

			const res = await handleApiRequest(req)
			expect(res!.headers.get('Cache-Control')).toBe('no-store')
		})

		it('should set X-Content-Type-Options: nosniff', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({ displayName: 'Nathan' }),
			})

			const res = await handleApiRequest(req)
			expect(res!.headers.get('X-Content-Type-Options')).toBe('nosniff')
		})

		it('should reject missing displayName', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({}),
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(400)

			const body = (await res!.json()) as { error: string }
			expect(body.error).toBe('displayName is required')
		})

		it('should reject display name that is too short', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({ displayName: 'A' }),
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(400)
		})

		it('should reject display name that is too long', async () => {
			const req = makeRequest('/api/auth', {
				method: 'POST',
				body: JSON.stringify({
					displayName: 'A'.repeat(21),
				}),
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(400)
		})

		it('should reject GET method', async () => {
			const req = makeRequest('/api/auth', { method: 'GET' })

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(405)
		})
	})

	describe('POST /api/rooms', () => {
		it('should create a room with valid JWT', async () => {
			const token = await getToken()
			const req = makeRequest('/api/rooms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			})

			const res = await handleApiRequest(req)
			expect(res).not.toBeNull()
			expect(res!.status).toBe(201)

			const body = (await res!.json()) as { roomCode: string }
			expect(body.roomCode).toBeDefined()
			expect(body.roomCode).toMatch(/^[A-Z0-9]{6}$/)
		})

		it('should reject request without Authorization header', async () => {
			const req = makeRequest('/api/rooms', { method: 'POST' })

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(401)
		})

		it('should reject request with invalid token', async () => {
			const req = makeRequest('/api/rooms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer invalid-token',
				},
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(401)
		})

		it('should reject GET method', async () => {
			const token = await getToken()
			const req = makeRequest('/api/rooms', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(405)
		})
	})

	describe('GET /api/rooms/:code/messages', () => {
		it('should return messages for an existing room', async () => {
			const token = await getToken()

			// First create a room
			const createReq = makeRequest('/api/rooms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
			})
			const createRes = await handleApiRequest(createReq)
			const { roomCode } = (await createRes!.json()) as {
				roomCode: string
			}

			// Then get messages
			const req = makeRequest(`/api/rooms/${roomCode}/messages`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			const res = await handleApiRequest(req)
			expect(res).not.toBeNull()
			expect(res!.status).toBe(200)

			const body = (await res!.json()) as { messages: unknown[] }
			expect(body.messages).toBeInstanceOf(Array)
		})

		it('should return 404 for non-existent room', async () => {
			const token = await getToken()
			const req = makeRequest('/api/rooms/ZZZZZZ/messages', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(404)
		})

		it('should reject request without auth', async () => {
			const req = makeRequest('/api/rooms/ABC123/messages', {
				method: 'GET',
			})

			const res = await handleApiRequest(req)
			expect(res!.status).toBe(401)
		})

		it('should reject invalid room code format', async () => {
			const token = await getToken()
			const req = makeRequest('/api/rooms/invalid/messages', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			// Should not match the route pattern (requires 6 uppercase alphanumeric)
			const res = await handleApiRequest(req)
			expect(res).toBeNull() // No route matched
		})
	})

	describe('unknown routes', () => {
		it('should return null for unknown /api/ paths', async () => {
			const req = makeRequest('/api/unknown')
			const res = await handleApiRequest(req)

			expect(res).toBeNull()
		})
	})
})

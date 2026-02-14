import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { signToken, verifyToken } from '../jwt'

describe('jwt', () => {
	beforeEach(() => {
		// Use dev secret for tests (no JWT_SECRET env var)
		delete process.env.JWT_SECRET
		delete process.env.NODE_ENV
	})

	afterEach(() => {
		delete process.env.JWT_SECRET
		delete process.env.NODE_ENV
	})

	describe('signToken', () => {
		it('should return a signed JWT string', async () => {
			const token = await signToken('Nathan')

			expect(typeof token).toBe('string')
			// JWT format: header.payload.signature
			expect(token.split('.')).toHaveLength(3)
		})

		it('should encode displayName as sub claim', async () => {
			const token = await signToken('Nathan')
			const payload = await verifyToken(token)

			expect(payload.sub).toBe('Nathan')
		})

		it('should include iat and exp claims', async () => {
			const token = await signToken('Nathan')
			const payload = await verifyToken(token)

			expect(typeof payload.iat).toBe('number')
			expect(typeof payload.exp).toBe('number')
			expect(payload.exp).toBeGreaterThan(payload.iat)
		})

		it('should set expiry to 30 minutes from now', async () => {
			const before = Math.floor(Date.now() / 1000)
			const token = await signToken('Nathan')
			const payload = await verifyToken(token)

			// 30 minutes = 1800 seconds, allow 5 second tolerance
			const expectedExp = before + 1800
			expect(payload.exp).toBeGreaterThanOrEqual(expectedExp - 5)
			expect(payload.exp).toBeLessThanOrEqual(expectedExp + 5)
		})
	})

	describe('verifyToken', () => {
		it('should verify a valid token', async () => {
			const token = await signToken('Alice')
			const payload = await verifyToken(token)

			expect(payload.sub).toBe('Alice')
		})

		it('should reject a tampered token', async () => {
			const token = await signToken('Alice')
			// Tamper with the payload
			const parts = token.split('.')
			parts[1] = `${parts[1]}tampered`
			const tampered = parts.join('.')

			expect(verifyToken(tampered)).rejects.toThrow()
		})

		it('should reject a completely invalid token', async () => {
			expect(verifyToken('not-a-jwt')).rejects.toThrow()
		})

		it('should reject an empty string', async () => {
			expect(verifyToken('')).rejects.toThrow()
		})

		it('should work with a custom JWT_SECRET', async () => {
			process.env.JWT_SECRET = 'my-test-secret'

			const token = await signToken('Bob')
			const payload = await verifyToken(token)

			expect(payload.sub).toBe('Bob')
		})

		it('should reject tokens signed with a different secret', async () => {
			// Sign with one secret
			process.env.JWT_SECRET = 'secret-one'
			const token = await signToken('Eve')

			// Verify with a different secret
			process.env.JWT_SECRET = 'secret-two'

			expect(verifyToken(token)).rejects.toThrow()
		})
	})

	describe('production mode', () => {
		it('should throw if JWT_SECRET is not set in production', async () => {
			process.env.NODE_ENV = 'production'
			delete process.env.JWT_SECRET

			expect(signToken('Nathan')).rejects.toThrow(
				'JWT_SECRET environment variable is required in production',
			)
		})

		it('should work in production with JWT_SECRET set', async () => {
			process.env.NODE_ENV = 'production'
			process.env.JWT_SECRET = 'production-secret'

			const token = await signToken('Nathan')
			const payload = await verifyToken(token)

			expect(payload.sub).toBe('Nathan')
		})
	})
})

/**
 * JWT utilities using jose (HMAC-SHA256).
 *
 * Tokens are identity-only (sub = displayName). Room access is validated
 * server-side per-request, not encoded in the token.
 *
 * Interview answer: "Security-critical code uses proven libraries. jose handles
 * timing attacks and spec compliance so I don't have to."
 */

import { jwtVerify, SignJWT } from 'jose'

const JWT_EXPIRY = '30m'
const DEV_SECRET = 'dev-secret-do-not-use-in-production'

/**
 * Get the JWT secret as a Uint8Array for jose.
 *
 * In production, reads from JWT_SECRET env var and fails fast if missing.
 * In development, falls back to a deterministic dev secret with a console warning.
 *
 * @returns Encoded secret key
 * @throws Error if JWT_SECRET is not set in production
 */
function getSecret(): Uint8Array {
	const secret = process.env.JWT_SECRET
	const isProd = process.env.NODE_ENV === 'production'

	if (!secret && isProd) {
		throw new Error('JWT_SECRET environment variable is required in production')
	}

	if (!secret) {
		console.warn('[JWT] Using dev secret -- set JWT_SECRET in production')
		return new TextEncoder().encode(DEV_SECRET)
	}

	return new TextEncoder().encode(secret)
}

/**
 * Sign a JWT for the given display name.
 *
 * @param displayName - User's display name (becomes the `sub` claim)
 * @returns Signed JWT string
 */
export async function signToken(displayName: string): Promise<string> {
	return new SignJWT({ sub: displayName })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(JWT_EXPIRY)
		.sign(getSecret())
}

/**
 * Verify and decode a JWT.
 *
 * @param token - JWT string to verify
 * @returns Decoded payload with `sub` (displayName)
 * @throws Error if token is invalid, expired, or malformed
 */
export async function verifyToken(
	token: string,
): Promise<{ sub: string; iat: number; exp: number }> {
	const { payload } = await jwtVerify(token, getSecret(), {
		algorithms: ['HS256'],
	})

	if (!payload.sub) {
		throw new Error('Token missing sub claim')
	}

	return payload as { sub: string; iat: number; exp: number }
}

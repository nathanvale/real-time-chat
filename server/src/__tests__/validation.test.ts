import { describe, expect, it } from 'bun:test'
import {
	escapeHtml,
	extractErrorMessage,
	validateDisplayName,
	validateMessageText,
	validateRoomCode,
	validateSessionId,
} from '../validation'

describe('validation', () => {
	describe('validateDisplayName', () => {
		it('should accept a valid display name', () => {
			expect(validateDisplayName('Nathan')).toBe('Nathan')
		})

		it('should trim whitespace', () => {
			expect(validateDisplayName('  Nathan  ')).toBe('Nathan')
		})

		it('should accept exactly 2 characters', () => {
			expect(validateDisplayName('Al')).toBe('Al')
		})

		it('should accept exactly 20 characters', () => {
			const name = 'A'.repeat(20)
			expect(validateDisplayName(name)).toBe(name)
		})

		it('should reject 1 character', () => {
			expect(() => validateDisplayName('A')).toThrow(
				'Display name must be between 2 and 20 characters',
			)
		})

		it('should reject 21 characters', () => {
			expect(() => validateDisplayName('A'.repeat(21))).toThrow(
				'Display name must be between 2 and 20 characters',
			)
		})

		it('should reject empty string after trimming', () => {
			expect(() => validateDisplayName('   ')).toThrow()
		})
	})

	describe('validateMessageText', () => {
		it('should accept valid text', () => {
			expect(validateMessageText('Hello world')).toBe('Hello world')
		})

		it('should trim whitespace', () => {
			expect(validateMessageText('  Hello  ')).toBe('Hello')
		})

		it('should reject empty text', () => {
			expect(() => validateMessageText('')).toThrow('Message text cannot be empty')
		})

		it('should reject whitespace-only text', () => {
			expect(() => validateMessageText('   ')).toThrow('Message text cannot be empty')
		})

		it('should accept 2000 characters', () => {
			const text = 'A'.repeat(2000)
			expect(validateMessageText(text)).toBe(text)
		})

		it('should reject 2001 characters', () => {
			expect(() => validateMessageText('A'.repeat(2001))).toThrow(
				'Message text cannot exceed 2000 characters',
			)
		})
	})

	describe('validateRoomCode', () => {
		it('should accept valid 6-char uppercase alphanumeric', () => {
			expect(validateRoomCode('ABC123')).toBe('ABC123')
		})

		it('should accept all uppercase letters', () => {
			expect(validateRoomCode('ABCDEF')).toBe('ABCDEF')
		})

		it('should accept all digits', () => {
			expect(validateRoomCode('123456')).toBe('123456')
		})

		it('should reject lowercase letters', () => {
			expect(() => validateRoomCode('abc123')).toThrow(
				'Room code must be exactly 6 uppercase alphanumeric characters',
			)
		})

		it('should reject codes shorter than 6 chars', () => {
			expect(() => validateRoomCode('ABC12')).toThrow()
		})

		it('should reject codes longer than 6 chars', () => {
			expect(() => validateRoomCode('ABC1234')).toThrow()
		})

		it('should reject special characters', () => {
			expect(() => validateRoomCode('ABC!@#')).toThrow()
		})
	})

	describe('escapeHtml', () => {
		it('should escape script tags', () => {
			expect(escapeHtml('<script>alert("xss")</script>')).toBe(
				'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
			)
		})

		it('should pass through normal text unchanged', () => {
			expect(escapeHtml('Hello world')).toBe('Hello world')
		})

		it('should encode ampersands', () => {
			expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
		})

		it('should return empty string for empty input', () => {
			expect(escapeHtml('')).toBe('')
		})

		it('should encode single quotes', () => {
			expect(escapeHtml("it's")).toBe('it&#x27;s')
		})

		it('should escape & to &amp;', () => {
			expect(escapeHtml('A&B')).toBe('A&amp;B')
		})

		it('should escape < to &lt;', () => {
			expect(escapeHtml('A<B')).toBe('A&lt;B')
		})

		it('should escape > to &gt;', () => {
			expect(escapeHtml('A>B')).toBe('A&gt;B')
		})

		it('should escape " to &quot;', () => {
			expect(escapeHtml('A"B')).toBe('A&quot;B')
		})

		it("should escape ' to &#x27;", () => {
			expect(escapeHtml("A'B")).toBe('A&#x27;B')
		})

		it('should escape all special chars in one string', () => {
			expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#x27;')
		})

		it('should double-escape already-escaped text', () => {
			// This is correct behavior - we don't try to detect pre-escaped input
			expect(escapeHtml('&lt;')).toBe('&amp;lt;')
		})
	})

	describe('extractErrorMessage', () => {
		it('should return error.message for Error instance', () => {
			const error = new Error('Something went wrong')
			expect(extractErrorMessage(error, 'Fallback')).toBe('Something went wrong')
		})

		it('should return fallback for non-Error value', () => {
			expect(extractErrorMessage(null, 'Fallback')).toBe('Fallback')
			expect(extractErrorMessage(undefined, 'Fallback')).toBe('Fallback')
			expect(extractErrorMessage(42, 'Fallback')).toBe('Fallback')
			expect(extractErrorMessage({}, 'Fallback')).toBe('Fallback')
		})

		it('should return fallback for string thrown', () => {
			// In JavaScript you can throw anything, including strings
			expect(extractErrorMessage('error string', 'Fallback')).toBe('Fallback')
		})

		it('should handle custom Error subclasses', () => {
			class CustomError extends Error {
				constructor(message: string) {
					super(message)
					this.name = 'CustomError'
				}
			}

			const error = new CustomError('Custom error message')
			expect(extractErrorMessage(error, 'Fallback')).toBe('Custom error message')
		})
	})

	describe('validateSessionId', () => {
		it('should accept valid UUID v4', () => {
			const validUuid = 'a1b2c3d4-e5f6-4abc-9def-0123456789ab'
			expect(validateSessionId(validUuid)).toBe(validUuid)
		})

		it('should accept lowercase UUID v4', () => {
			const validUuid = 'a1b2c3d4-e5f6-4abc-9def-0123456789ab'
			expect(validateSessionId(validUuid)).toBe(validUuid)
		})

		it('should accept uppercase UUID v4', () => {
			const validUuid = 'A1B2C3D4-E5F6-4ABC-9DEF-0123456789AB'
			expect(validateSessionId(validUuid)).toBe(validUuid)
		})

		it('should accept mixed case UUID v4', () => {
			const validUuid = 'A1b2C3d4-E5f6-4AbC-9DeF-0123456789aB'
			expect(validateSessionId(validUuid)).toBe(validUuid)
		})

		it('should reject invalid format', () => {
			expect(() => validateSessionId('not-a-uuid')).toThrow('Invalid session ID format')
		})

		it('should reject empty string', () => {
			expect(() => validateSessionId('')).toThrow('Invalid session ID format')
		})

		it('should reject UUID v1', () => {
			// UUID v1 has version 1 in the 3rd group (not 4)
			const uuidV1 = 'a1b2c3d4-e5f6-1abc-9def-0123456789ab'
			expect(() => validateSessionId(uuidV1)).toThrow('Invalid session ID format')
		})

		it('should reject malformed UUID (wrong length)', () => {
			const malformed = 'a1b2c3d4-e5f6-4abc-9def-0123456789'
			expect(() => validateSessionId(malformed)).toThrow('Invalid session ID format')
		})

		it('should reject UUID with invalid variant bits', () => {
			// The 4th group should start with 8, 9, a, or b (variant bits)
			// Here we use 'c' which is invalid for UUID v4
			const invalidVariant = 'a1b2c3d4-e5f6-4abc-cdef-0123456789ab'
			expect(() => validateSessionId(invalidVariant)).toThrow('Invalid session ID format')
		})
	})
})

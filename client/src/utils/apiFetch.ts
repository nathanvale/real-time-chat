import { SESSION_STORAGE_KEY } from '../../../shared/constants'

/**
 * Thin fetch wrapper that adds JWT Bearer header from sessionStorage.
 *
 * Only 3 call sites in the app -- a generic useApi hook would be premature abstraction.
 *
 * @param path - API path (e.g. '/api/auth')
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 * @throws Error with server error message on non-OK responses
 */
export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	// Read token directly from sessionStorage (avoids hook dependency)
	const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
	const token = stored ? (JSON.parse(stored) as { token?: string }).token : null

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...((options.headers as Record<string, string>) || {}),
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	const response = await fetch(path, {
		...options,
		headers,
	})

	const data = await response.json()

	if (!response.ok) {
		throw new Error(
			(data as { error?: string }).error ||
				`Request failed: ${response.status}`,
		)
	}

	return data as T
}

import { type KeyboardEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type {
	AuthResponse,
	ChatError,
	CreateRoomResponse,
} from '../../../shared/types'
import { LobbyForm } from '../components/LobbyForm/LobbyForm'
import { useSocketContext } from '../contexts/SocketContext'
import { useSession } from '../hooks/useSession'
import { apiFetch } from '../utils/apiFetch'
import styles from './LobbyPage.module.scss'

/**
 * Lobby page component for creating or joining chat rooms.
 *
 * Features two modes:
 * - Create: REST auth + room creation, then Socket.IO join
 * - Join: REST auth, then Socket.IO join to existing room
 *
 * Flow (Create mode):
 * 1. POST /api/auth -> get JWT token
 * 2. POST /api/rooms (with JWT) -> get room code
 * 3. Save session (displayName + roomCode + token)
 * 4. Navigate to /room/:code (ChatPage handles Socket.IO join)
 *
 * Flow (Join mode):
 * 1. POST /api/auth -> get JWT token
 * 2. Save session (displayName + roomCode + token)
 * 3. Navigate to /room/:code (ChatPage handles Socket.IO join)
 *
 * @returns Lobby page JSX
 */
export const LobbyPage = () => {
	const navigate = useNavigate()
	const { socket, connect } = useSocketContext()
	const { saveSession } = useSession()
	const [searchParams] = useSearchParams()

	// Read room code from URL query params
	const urlRoomCode = searchParams.get('roomCode')
	const urlError = searchParams.get('error')

	// Start in 'join' mode if roomCode is in URL, otherwise 'create'
	const [mode, setMode] = useState<'create' | 'join'>(
		urlRoomCode ? 'join' : 'create',
	)
	const [error, setError] = useState<string | null>(urlError)
	const [isLoading, setIsLoading] = useState(false)

	/**
	 * Handle form submission.
	 * Authenticates via REST, creates room if needed, then navigates to chat.
	 */
	const handleSubmit = async (data: {
		displayName: string
		roomCode?: string
	}) => {
		setError(null)
		setIsLoading(true)

		try {
			// Step 1: Authenticate and get JWT
			const { token } = await apiFetch<AuthResponse>('/api/auth', {
				method: 'POST',
				body: JSON.stringify({ displayName: data.displayName }),
			})

			if (mode === 'create') {
				// Step 2: Create room via REST (JWT required)
				// Save token to session first so apiFetch can read it
				saveSession({
					displayName: data.displayName,
					roomCode: '',
					token,
				})

				const { roomCode } = await apiFetch<CreateRoomResponse>('/api/rooms', {
					method: 'POST',
				})

				// Step 3: Update session with actual room code
				saveSession({
					displayName: data.displayName,
					roomCode,
					token,
				})

				// Connect socket with JWT before navigating
				await connect(token)

				// Navigate to room (ChatPage handles Socket.IO join + message fetch)
				navigate(`/room/${roomCode}`)
			} else {
				// Join mode: save session with token and navigate
				saveSession({
					displayName: data.displayName,
					roomCode: data.roomCode || '',
					token,
				})

				// Connect socket with JWT before navigating
				await connect(token)

				navigate(`/room/${data.roomCode}`)
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Something went wrong'
			setError(message)
			setIsLoading(false)
		}
	}

	/**
	 * Handle mode toggle.
	 * Clears error when switching between create/join.
	 */
	const handleModeToggle = (newMode: 'create' | 'join') => {
		setMode(newMode)
		setError(null)
	}

	/**
	 * Handle arrow key navigation for WAI-ARIA tab pattern.
	 * ArrowLeft/ArrowRight toggles between create and join tabs.
	 */
	const handleTabKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			const newMode = mode === 'create' ? 'join' : 'create'
			handleModeToggle(newMode)
			document.getElementById(`tab-${newMode}`)?.focus()
		}
	}

	// Listen for socket room:error events (for errors that happen during join)
	useEffect(() => {
		const handleRoomError = (data: ChatError) => {
			setIsLoading(false)
			setError(data.message)
		}

		socket.on('room:error', handleRoomError)

		return () => {
			socket.off('room:error', handleRoomError)
		}
	}, [socket])

	return (
		<div className={styles.lobby}>
			<div className={styles.container}>
				{/* Mode Toggle */}
				<div
					className={styles.modeToggle}
					role="tablist"
					aria-label="Room mode"
				>
					<button
						type="button"
						role="tab"
						id="tab-create"
						aria-selected={mode === 'create'}
						aria-controls="tabpanel-lobby"
						className={mode === 'create' ? styles.active : ''}
						onClick={() => handleModeToggle('create')}
						onKeyDown={handleTabKeyDown}
						disabled={isLoading}
					>
						Create Room
					</button>
					<button
						type="button"
						role="tab"
						id="tab-join"
						aria-selected={mode === 'join'}
						aria-controls="tabpanel-lobby"
						className={mode === 'join' ? styles.active : ''}
						onClick={() => handleModeToggle('join')}
						onKeyDown={handleTabKeyDown}
						disabled={isLoading}
					>
						Join Room
					</button>
				</div>

				{/* Form */}
				<div
					role="tabpanel"
					id="tabpanel-lobby"
					aria-labelledby={`tab-${mode}`}
				>
					<LobbyForm
						mode={mode}
						onSubmit={handleSubmit}
						error={error || undefined}
						isLoading={isLoading}
						defaultRoomCode={urlRoomCode || undefined}
					/>
				</div>
			</div>
		</div>
	)
}

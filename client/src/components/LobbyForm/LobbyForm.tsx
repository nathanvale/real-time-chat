import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
	MAX_DISPLAY_NAME_LENGTH,
	MIN_DISPLAY_NAME_LENGTH,
	ROOM_CODE_LENGTH,
} from '../../../../shared/constants'
import styles from './LobbyForm.module.scss'

/**
 * Props for the LobbyForm component.
 */
type LobbyFormProps = {
	/** Form mode - 'create' for creating a new room, 'join' for joining an existing room */
	mode: 'create' | 'join'
	/** Callback invoked when form is submitted with valid data */
	onSubmit: (data: { displayName: string; roomCode?: string }) => void
	/** Error message to display (if any) */
	error?: string
	/** Loading state - disables form inputs while processing */
	isLoading?: boolean
	/** Default room code to pre-fill (for URL-based room joining) */
	defaultRoomCode?: string
}

/**
 * Styled form component for the lobby page.
 *
 * Displays a form for entering display name (always required, MIN_DISPLAY_NAME_LENGTH-MAX_DISPLAY_NAME_LENGTH chars).
 * In 'join' mode, also displays a room code input (auto-uppercase, ROOM_CODE_LENGTH chars).
 *
 * Features:
 * - Client-side validation with instant feedback
 * - Auto-uppercase room code transformation
 * - Responsive centered card layout (max 480px)
 * - Fade-in animation on mount
 * - Accessible form inputs with labels
 *
 * @param props - Component props
 */
export const LobbyForm = ({
	mode,
	onSubmit,
	error,
	isLoading = false,
	defaultRoomCode,
}: LobbyFormProps) => {
	const displayNameRef = useRef<HTMLInputElement>(null)
	const [displayName, setDisplayName] = useState('')
	const [roomCode, setRoomCode] = useState(defaultRoomCode || '')
	const [validationError, setValidationError] = useState<string | null>(null)

	/** Focus display name input on mount so users can start typing immediately. */
	useEffect(() => {
		displayNameRef.current?.focus()
	}, [])

	/**
	 * Validates display name and room code (if in join mode).
	 * Returns error message if validation fails, null otherwise.
	 */
	const validate = (): string | null => {
		const trimmedDisplayName = displayName.trim()
		if (!trimmedDisplayName) {
			return 'Display name is required'
		}

		if (
			trimmedDisplayName.length < MIN_DISPLAY_NAME_LENGTH ||
			trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH
		) {
			return `Display name must be ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters`
		}

		if (mode === 'join') {
			const trimmedRoomCode = roomCode.trim()
			if (!trimmedRoomCode) {
				return 'Room code is required'
			}

			if (trimmedRoomCode.length !== ROOM_CODE_LENGTH) {
				return `Room code must be ${ROOM_CODE_LENGTH} characters`
			}
		}

		return null
	}

	/**
	 * Handle form submission.
	 * Validates inputs and calls onSubmit callback if valid.
	 */
	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()

		const validationErr = validate()
		if (validationErr) {
			setValidationError(validationErr)
			return
		}

		setValidationError(null)

		onSubmit({
			displayName: displayName.trim(),
			roomCode: mode === 'join' ? roomCode.toUpperCase() : undefined,
		})
	}

	/**
	 * Handle display name input change.
	 * Clears validation error when user starts typing.
	 */
	const handleDisplayNameChange = (value: string) => {
		setDisplayName(value)
		if (validationError) {
			setValidationError(null)
		}
	}

	/**
	 * Handle room code input change.
	 * Auto-uppercase and limit to ROOM_CODE_LENGTH characters.
	 * Clears validation error when user starts typing.
	 */
	const handleRoomCodeChange = (value: string) => {
		const uppercased = value.toUpperCase()
		const limited = uppercased.slice(0, ROOM_CODE_LENGTH)
		setRoomCode(limited)
		if (validationError) {
			setValidationError(null)
		}
	}

	const displayError = error || validationError

	return (
		<form className={styles.form} onSubmit={handleSubmit}>
			<div className={styles.header}>
				<h1 className={styles.title}>
					{mode === 'create' ? 'Create Room' : 'Join Room'}
				</h1>
				<p className={styles.subtitle}>
					{mode === 'create'
						? 'Start a new chat room and share the code with others'
						: 'Enter a room code to join an existing chat'}
				</p>
			</div>

			<div className={styles.fields}>
				{/* Display Name Input */}
				<div className={styles.field}>
					<label htmlFor="displayName" className={styles.label}>
						Display Name
					</label>
					<input
						ref={displayNameRef}
						type="text"
						id="displayName"
						className={styles.input}
						value={displayName}
						onChange={(e) => handleDisplayNameChange(e.target.value)}
						placeholder="Enter your name"
						disabled={isLoading}
						autoComplete="name"
						minLength={MIN_DISPLAY_NAME_LENGTH}
						maxLength={MAX_DISPLAY_NAME_LENGTH}
						required
						aria-invalid={!!displayError}
						aria-describedby={displayError ? 'form-error' : undefined}
					/>
				</div>

				{/* Room Code Input (Join mode only) */}
				{mode === 'join' && (
					<div className={styles.field}>
						<label htmlFor="roomCode" className={styles.label}>
							Room Code
						</label>
						<input
							type="text"
							id="roomCode"
							className={styles.input}
							value={roomCode}
							onChange={(e) => handleRoomCodeChange(e.target.value)}
							placeholder="ABC123"
							disabled={isLoading}
							autoComplete="off"
							maxLength={ROOM_CODE_LENGTH}
							required
							aria-invalid={!!displayError}
							aria-describedby={displayError ? 'form-error' : undefined}
						/>
					</div>
				)}
			</div>

			{/* Error Display */}
			{displayError && (
				<div className={styles.error} role="alert" id="form-error">
					{displayError}
				</div>
			)}

			{/* Submit Button */}
			<button type="submit" className={styles.button} disabled={isLoading}>
				{isLoading
					? 'Loading...'
					: mode === 'create'
						? 'Create Room'
						: 'Join Room'}
			</button>
		</form>
	)
}

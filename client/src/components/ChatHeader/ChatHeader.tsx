import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatContext } from '../../contexts/ChatContext'
import { useSocketContext } from '../../contexts/SocketContext'
import { useSession } from '../../hooks/useSession'
import styles from './ChatHeader.module.scss'

/**
 * Chat header component displaying room information and controls.
 *
 * Shows:
 * - Room code with copy-to-clipboard button
 * - Auth status indicator (JWT authenticated or not)
 * - Connected user count
 * - User names (collapsible on small screens)
 * - Leave room button that navigates back to lobby
 *
 * @returns Chat header JSX
 */
export const ChatHeader = () => {
	const { state } = useChatContext()
	const { socket } = useSocketContext()
	const navigate = useNavigate()
	const { clearSession, getToken } = useSession()
	const [copied, setCopied] = useState(false)
	const [showUsers, setShowUsers] = useState(false)
	const isAuthenticated = !!getToken()

	/** Max user badges shown inline on desktop before showing "+N" overflow. */
	const MAX_VISIBLE_USERS = 3
	const visibleUsers = useMemo(
		() => state.users.slice(0, MAX_VISIBLE_USERS),
		[state.users],
	)
	const overflowCount = state.users.length - MAX_VISIBLE_USERS

	/**
	 * Copy room code to clipboard and show temporary feedback.
	 */
	const handleCopyCode = async () => {
		if (!state.roomCode) return

		try {
			await navigator.clipboard.writeText(state.roomCode)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard API failed (permissions or unsupported)
		}
	}

	/**
	 * Explicitly emit room:leave before clearing session and navigating.
	 * ChatProvider lives at app root and doesn't unmount on route change,
	 * so we must emit leave explicitly to avoid staying in the old socket room.
	 */
	const handleLeaveRoom = () => {
		socket.emit('room:leave')
		clearSession()
		navigate('/')
	}

	return (
		<header className={styles.header}>
			<div className={styles.roomInfo}>
				<div className={styles.roomCode}>
					<span className={styles.roomCodeLabel}>Room</span>
					<code className={styles.roomCodeValue}>{state.roomCode}</code>
					<button
						type="button"
						onClick={handleCopyCode}
						className={styles.copyButton}
						aria-label={copied ? 'Room code copied' : 'Copy room code'}
					>
						{copied ? '✓' : '📋'}
					</button>
				</div>

				<span
					className={isAuthenticated ? styles.authBadge : styles.authBadgeNone}
					title={isAuthenticated ? 'JWT authenticated' : 'Not authenticated'}
				>
					{isAuthenticated ? 'Authenticated' : 'No auth'}
				</span>

				<div className={styles.users}>
					{/* Mobile: always a toggle button */}
					<button
						type="button"
						onClick={() => setShowUsers(!showUsers)}
						className={styles.userCountBadge}
						aria-label="Toggle user list"
						aria-expanded={showUsers}
						aria-controls="user-list"
					>
						{state.users.length} {state.users.length === 1 ? 'user' : 'users'}
					</button>

					{/* Desktop: plain text when <= 3 users, toggle button when > 3 */}
					{overflowCount > 0 ? (
						<button
							type="button"
							onClick={() => setShowUsers(!showUsers)}
							className={styles.userCountTextButton}
							aria-label="Toggle user list"
							aria-expanded={showUsers}
							aria-controls="user-list"
						>
							{state.users.length} {state.users.length === 1 ? 'user' : 'users'}
						</button>
					) : (
						<span className={styles.userCountText}>
							{state.users.length} {state.users.length === 1 ? 'user' : 'users'}
						</span>
					)}

					{/* Desktop: first N user badges + overflow indicator */}
					<div className={styles.userBadges}>
						{visibleUsers.map((user) => (
							<span key={user.sessionId} className={styles.userName}>
								{user.displayName}
							</span>
						))}
						{overflowCount > 0 && (
							<span className={styles.userName}>+{overflowCount}</span>
						)}
					</div>

					{/* Dropdown: full user list (mobile always, desktop only when overflow) */}
					<div
						id="user-list"
						className={`${styles.userList} ${showUsers ? styles.userListVisible : ''}`}
					>
						{state.users.map((user) => (
							<span key={user.sessionId} className={styles.userName}>
								{user.displayName}
							</span>
						))}
					</div>
				</div>
			</div>

			<button
				type="button"
				onClick={handleLeaveRoom}
				className={styles.leaveButton}
			>
				Leave Room
			</button>
		</header>
	)
}

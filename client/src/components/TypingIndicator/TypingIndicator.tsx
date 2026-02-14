import { useChatContext } from '../../contexts/ChatContext'
import styles from './TypingIndicator.module.scss'

/**
 * Typing indicator component that shows who is currently typing.
 *
 * Displays:
 * - "User is typing" for a single user
 * - "User1, User2 are typing" for two users
 * - "Several people are typing" for three or more users
 * - Animated pulsing dots (CSS-only animation)
 * - Only visible when someone is typing
 *
 * The container always renders (never returns null) so that the
 * aria-live region is already in the DOM when typing starts --
 * screen readers only announce changes to mounted live regions.
 *
 * The typingUsers array comes from ChatContext, which listens to
 * 'typing:started' and 'typing:stopped' socket events.
 *
 * @returns Typing indicator JSX
 */
export const TypingIndicator = () => {
	const { state } = useChatContext()

	// Format user names based on count
	const names = state.typingUsers.map((t) => t.displayName)
	let displayText = ''
	if (names.length === 0) {
		displayText = ''
	} else if (names.length === 1) {
		displayText = `${names[0]} is typing`
	} else if (names.length === 2) {
		displayText = `${names[0]}, ${names[1]} are typing`
	} else {
		displayText = 'Several people are typing'
	}

	return (
		<div className={styles.container} aria-live="polite" aria-atomic="true">
			{state.typingUsers.length > 0 && (
				<div className={styles.indicator}>
					<span className={styles.text}>{displayText}</span>
					<div className={styles.dots}>
						<span className={styles.dot} aria-hidden="true" />
						<span className={styles.dot} aria-hidden="true" />
						<span className={styles.dot} aria-hidden="true" />
					</div>
				</div>
			)}
		</div>
	)
}

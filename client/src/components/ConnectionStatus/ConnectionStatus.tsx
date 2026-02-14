import { useSocketContext } from '../../contexts/SocketContext'
import styles from './ConnectionStatus.module.scss'

/**
 * Connection status banner component.
 *
 * Shows a small banner at the top of the chat when the socket connection
 * is lost. Auto-hides when connection is restored.
 *
 * Uses CSS transitions for smooth show/hide animations.
 *
 * @returns Connection status JSX (null when connected)
 */
export const ConnectionStatus = () => {
	const { isConnected } = useSocketContext()

	if (isConnected) {
		return null
	}

	return (
		<div className={styles.banner} role="alert">
			<div className={styles.content}>
				<div className={styles.indicator} aria-hidden="true" />
				<span className={styles.text}>Connection lost. Reconnecting...</span>
			</div>
		</div>
	)
}

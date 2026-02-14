import { useEffect, useRef } from 'react'
import type { Message } from '../../../../shared/types'
import { useChatContext } from '../../contexts/ChatContext'
import { useSession } from '../../hooks/useSession'
import styles from './MessageList.module.scss'

const GROUP_TIME_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Format Unix timestamp as time string (HH:MM).
 */
const formatTime = (timestamp: number): string => {
	const date = new Date(timestamp)
	const hours = date.getHours().toString().padStart(2, '0')
	const minutes = date.getMinutes().toString().padStart(2, '0')
	return `${hours}:${minutes}`
}

/**
 * Format Unix timestamp as ISO 8601 string for machine-readable datetime attributes.
 */
const formatISO = (timestamp: number): string =>
	new Date(timestamp).toISOString()

/**
 * Determine if a message is the first in a group.
 * A message is first in group if:
 * - It's the first message in the list
 * - Previous message is from a different user
 * - Time gap from previous message > 5 minutes
 * - Previous message is a system message
 *
 * @param messages - Array of messages
 * @param index - Index of current message
 * @returns true if message should show avatar/displayName
 */
const isFirstInGroup = (messages: Message[], index: number): boolean => {
	if (index === 0) {
		return true
	}

	const currentMessage = messages[index]
	const previousMessage = messages[index - 1]

	// System messages are never grouped
	if (currentMessage?.type === 'system' || previousMessage?.type === 'system') {
		return true
	}

	// Different user
	if (currentMessage?.userId !== previousMessage?.userId) {
		return true
	}

	// Time gap > 5 minutes
	const timeDiff =
		(currentMessage?.timestamp ?? 0) - (previousMessage?.timestamp ?? 0)
	if (timeDiff > GROUP_TIME_WINDOW_MS) {
		return true
	}

	return false
}

/**
 * Message list component that displays chat message history.
 *
 * Features:
 * - Auto-scrolls to bottom when new messages arrive
 * - System messages (type: 'system') are filtered out (displayed as toasts instead)
 * - User messages show display name, text, and timestamp
 * - Own messages (matching current user's displayName) styled differently
 * - Message grouping: consecutive messages from same user within 5 minutes are grouped
 * - Scrollable container with overflow-y: auto
 *
 * Auto-scroll implementation uses a dummy div at the bottom of the list
 * and calls scrollIntoView() whenever messages change.
 *
 * @returns Message list JSX
 */
export const MessageList = () => {
	const { state } = useChatContext()
	const { session } = useSession()
	const bottomRef = useRef<HTMLDivElement>(null)

	// Auto-scroll to bottom when messages change
	// biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally want to scroll when messages change
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [state.messages])

	return (
		<div className={styles.container} role="log" aria-live="polite">
			<div className={styles.messages}>
				{state.messages.map((message, index) => {
					const isOwnMessage = message.userId === session?.sessionId
					const isSystemMessage = message.type === 'system'
					const isFirst = isFirstInGroup(state.messages, index)

					// System messages are displayed as toasts via ToastContainer, not inline
					if (isSystemMessage) {
						return null
					}

					return (
						<div
							key={message.id}
							className={`${styles.message} ${isOwnMessage ? styles.messageOwn : ''} ${
								!isFirst ? styles.messageGrouped : ''
							}`}
						>
							{isFirst && (
								<div className={styles.messageHeader}>
									<span className={styles.messageDisplayName}>
										{message.displayName}
									</span>
									<time
										className={styles.messageTime}
										dateTime={formatISO(message.timestamp)}
									>
										{formatTime(message.timestamp)}
									</time>
								</div>
							)}
							<div className={styles.messageText}>{message.text}</div>
						</div>
					)
				})}
				{/* Dummy div for auto-scroll target */}
				<div ref={bottomRef} />
			</div>
		</div>
	)
}

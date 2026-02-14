import {
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react'
import { MAX_MESSAGE_LENGTH } from '../../../../shared/constants'
import { useSocketContext } from '../../contexts/SocketContext'
import styles from './MessageInput.module.scss'

const CHAR_WARN_THRESHOLD = 1800 // Show char count when within 200 chars of limit

/**
 * Message input component for sending chat messages.
 *
 * Features:
 * - Textarea input with auto-resize (up to max height)
 * - Enter to send, Shift+Enter for newline
 * - Emits 'message:send' via socket
 * - Disabled send button when empty or only whitespace
 * - Max message length validation (2000 chars)
 * - Shows character count near limit (when > 1800 chars)
 * - Emits 'typing:start' when user starts typing
 * - Emits 'typing:stop' when user stops typing (debounced after 2s)
 * - Emits 'typing:stop' on blur, send, or when input becomes empty
 *
 * Sticky at bottom of chat interface.
 *
 * @returns Message input JSX
 */
export const MessageInput = () => {
	const { socket } = useSocketContext()
	const [message, setMessage] = useState('')
	const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const isTypingRef = useRef(false)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	/** Emit typing:stop and clear the debounce timer. */
	const stopTyping = useCallback(() => {
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current)
			typingTimeoutRef.current = null
		}
		if (isTypingRef.current) {
			socket.emit('typing:stop')
			isTypingRef.current = false
		}
	}, [socket])

	/** Clean up typing state on unmount to prevent stale timers firing into wrong room. */
	useEffect(() => {
		return () => {
			stopTyping()
		}
	}, [stopTyping])

	/** Focus textarea on mount so users can start typing immediately. */
	useEffect(() => {
		textareaRef.current?.focus()
	}, [])

	const isOverLimit = message.length > MAX_MESSAGE_LENGTH
	const isTrimmedEmpty = message.trim().length === 0
	const showCharCount = message.length >= CHAR_WARN_THRESHOLD

	/**
	 * Handle input change and emit typing events.
	 */
	const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
		const newValue = e.target.value

		// Prevent input if over limit
		if (newValue.length > MAX_MESSAGE_LENGTH) {
			return
		}

		setMessage(newValue)

		// Emit typing:start on first character
		if (!isTypingRef.current && newValue.trim().length > 0) {
			socket.emit('typing:start')
			isTypingRef.current = true
		}

		// Clear existing timeout
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current)
		}

		// Emit typing:stop after 2 seconds of inactivity
		if (newValue.trim().length > 0) {
			typingTimeoutRef.current = setTimeout(() => {
				stopTyping()
			}, 2000)
		} else {
			stopTyping()
		}
	}

	/**
	 * Core message sending logic shared by form submit and keyboard handler.
	 */
	const sendMessage = useCallback(() => {
		const trimmedMessage = message.trim()

		if (trimmedMessage.length === 0 || isOverLimit) {
			return
		}

		// Emit message:send
		socket.emit('message:send', { text: trimmedMessage })

		stopTyping()

		setMessage('')
	}, [message, isOverLimit, socket, stopTyping])

	/**
	 * Handle Enter key (send message) vs Shift+Enter (newline).
	 */
	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			sendMessage()
		}
	}

	/**
	 * Handle form submission.
	 */
	const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		sendMessage()
	}

	/**
	 * Handle blur event - stop typing if active.
	 */
	const handleBlur = () => {
		stopTyping()
	}

	return (
		<form className={styles.form} onSubmit={handleSubmit}>
			<textarea
				ref={textareaRef}
				className={styles.input}
				value={message}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				placeholder="Type a message..."
				rows={1}
				aria-label="Message input"
			/>

			<div className={styles.actions}>
				{showCharCount && (
					<span
						className={`${styles.charCount} ${isOverLimit ? styles.charCountError : ''}`}
					>
						{message.length}/{MAX_MESSAGE_LENGTH}
					</span>
				)}

				<button
					type="submit"
					className={styles.sendButton}
					disabled={isTrimmedEmpty || isOverLimit}
					aria-label="Send message"
				>
					Send
				</button>
			</div>
		</form>
	)
}

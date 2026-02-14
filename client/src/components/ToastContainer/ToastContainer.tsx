import { useEffect, useRef, useState } from 'react'
import { useChatContext } from '../../contexts/ChatContext'
import styles from './ToastContainer.module.scss'

const TOAST_DURATION_MS = 4000
const EXIT_ANIMATION_MS = 300

/**
 * Individual toast notification with enter/exit CSS transitions.
 *
 * Animation lifecycle:
 * 1. Mount with data-mounted="false" (off-screen, transparent)
 * 2. Next frame: set data-mounted="true" (slide up + fade in via CSS transition)
 * 3. After TOAST_DURATION_MS: set data-removing="true" (fade out + slide down)
 * 4. After exit transition ends: call onRemove to unmount
 *
 * Inspired by Sonner's approach of using CSS transitions instead of keyframes
 * so animations are interruptible and feel smoother.
 */
const ToastItem = ({
	id,
	text,
	onRemove,
}: {
	id: string
	text: string
	onRemove: (id: string) => void
}) => {
	const [mounted, setMounted] = useState(false)
	const [removing, setRemoving] = useState(false)
	const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>()
	const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

	useEffect(() => {
		// Trigger enter transition on next frame so the browser paints
		// the initial (off-screen) state first
		const raf = requestAnimationFrame(() => setMounted(true))

		// Schedule exit sequence
		clearTimeout(dismissTimerRef.current)
		dismissTimerRef.current = setTimeout(() => {
			setRemoving(true)
			exitTimerRef.current = setTimeout(() => onRemove(id), EXIT_ANIMATION_MS)
		}, TOAST_DURATION_MS)

		return () => {
			cancelAnimationFrame(raf)
			clearTimeout(dismissTimerRef.current)
			clearTimeout(exitTimerRef.current)
		}
	}, [id, onRemove])

	return (
		<div
			className={styles.toast}
			data-mounted={mounted}
			data-removing={removing}
		>
			{text}
		</div>
	)
}

/**
 * Fixed-position toast stack in the bottom-right corner.
 *
 * Displays system message toasts (join/leave) so they're visible
 * regardless of scroll position in the message list. Each toast
 * auto-dismisses after 4s, matching the in-list fadeInOut animation.
 *
 * pointer-events: none ensures toasts don't block chat interaction.
 */
export const ToastContainer = () => {
	const { toasts, removeToast } = useChatContext()

	return (
		<output className={styles.container} aria-live="polite">
			{toasts.map((toast) => (
				<ToastItem
					key={toast.id}
					id={toast.id}
					text={toast.text}
					onRemove={removeToast}
				/>
			))}
		</output>
	)
}

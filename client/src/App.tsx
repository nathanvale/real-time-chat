import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ToastContainer } from './components/ToastContainer/ToastContainer'
import { ChatProvider } from './contexts/ChatContext'
import { SocketProvider } from './contexts/SocketContext'
import { ChatPage } from './pages/ChatPage'
import { LobbyPage } from './pages/LobbyPage'

/**
 * Main App component with routing and context providers.
 *
 * Provider hierarchy (outermost to innermost):
 * 1. BrowserRouter - React Router v6 routing
 * 2. SocketProvider - Single Socket.IO instance for the entire app
 * 3. ChatProvider - Chat state management (messages, users, typing)
 *
 * Routes:
 * - / - LobbyPage (create or join room)
 * - /room/:code - ChatPage (real-time chat interface)
 *
 * The SocketProvider must be outermost because both LobbyPage and ChatPage
 * need access to the socket instance. ChatProvider wires socket events to
 * state updates, so it wraps the routes.
 *
 * @returns App JSX with routing and providers
 */
export const App = () => {
	return (
		<BrowserRouter>
			<SocketProvider>
				<ChatProvider>
					<main>
						<Routes>
							<Route path="/" element={<LobbyPage />} />
							<Route path="/room/:code" element={<ChatPage />} />
						</Routes>
					</main>
					<ToastContainer />
				</ChatProvider>
			</SocketProvider>
		</BrowserRouter>
	)
}

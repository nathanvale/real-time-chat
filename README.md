# Real-Time Chat

A multi-user real-time chat application with JWT authentication, persistent message history, and room-based communication. Built with Bun, React, Socket.IO, and SQLite.

## Live Demo

**https://real-time-chat-nv.fly.dev**

## Features

- **JWT Authentication** - REST endpoints and Socket.IO connections protected by JWT tokens
- **Room-Based Chat** - Create or join rooms with shareable 6-character alphanumeric codes
- **Real-Time Messaging** - Instant message delivery via Socket.IO with automatic reconnection
- **Persistent History** - SQLite-backed message storage survives page refreshes and server restarts
- **Session Management** - Tab-scoped sessions with stable identity across reconnects (crypto.randomUUID())
- **Typing Indicators** - See who's actively typing in real-time
- **Message Grouping** - Consecutive messages from the same user within 5 minutes are visually grouped
- **Connection Status** - Real-time connection indicator shows when socket is disconnected
- **Room Switch Cleanup** - Automatically leave old room when joining a new one
- **XSS Protection** - HTML entity encoding applied at transport boundary (read-time, not write-time)
- **Structured Errors** - Error codes for programmatic handling (`ROOM_NOT_FOUND`, `AUTH_REQUIRED`, etc.)
- **Room/Message TTL** - Automatic cleanup: rooms inactive for 24 hours, messages older than 7 days
- **Responsive Design** - Mobile-first UI with fluid layouts (320px to 4K)
- **CSS-Only Animations** - Toast notifications, typing indicators, message grouping transitions
- **Light Theme** - Accessible color palette (WCAG AA contrast ratios)

## Tech Stack

| Technology | Purpose | Why? |
|-----------|---------|------|
| **Bun** | Runtime, bundler, test runner, SQLite | All-in-one tool - fast startup, built-in SQLite (no native bindings), drop-in Node.js replacement |
| **React 19** | Frontend UI framework | Latest stable React with modern hooks, useTransition, automatic batching |
| **TypeScript** | Type safety | End-to-end type safety across client/server via shared `types.ts` |
| **Socket.IO** | Real-time messaging | Reliable WebSocket with automatic reconnection, room broadcasting, fallback transports |
| **@socket.io/bun-engine** | Native Bun HTTP server | Better performance than Node.js polyfill (`http.Server`), native `Bun.serve()` integration |
| **SQLite (bun:sqlite)** | Database | Zero dependencies, built into Bun, perfect for single-instance deployment, persistent volume on Fly.io |
| **Vite** | Frontend build tool | Fast dev server with HMR, optimized production builds, SCSS support |
| **SCSS Modules** | Styling | Scoped styles, CSS variables, nesting - no runtime cost, type-safe imports |
| **React Router v6** | Client-side routing | Stable routing, room code in URL for easy refresh/share |
| **Biome** | Linting & formatting | Fast, single config, replaces ESLint + Prettier, built-in import sorting |
| **jose** | JWT authentication | Battle-tested HMAC-SHA256, handles timing attacks, tree-shakeable, no crypto polyfills needed |
| **Fly.io** | Deployment | Simple, persistent volumes for SQLite, Sydney region, auto-scaling (single instance for SQLite) |

## Project Structure

```
real-time-chat/
├── client/                      # Vite + React frontend
│   ├── src/
│   │   ├── pages/               # LobbyPage (create/join), ChatPage (real-time chat)
│   │   ├── components/          # Reusable UI components (SCSS Modules)
│   │   │   ├── ChatHeader/      # Room code, user count, leave button
│   │   │   ├── ConnectionStatus/ # Reconnection banner
│   │   │   ├── LobbyForm/       # Display name + room code form
│   │   │   ├── MessageInput/    # Text input with typing indicators
│   │   │   ├── MessageList/     # Scrollable message history
│   │   │   ├── ToastContainer/  # System message notifications (join/leave)
│   │   │   └── TypingIndicator/ # "Alice is typing..."
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useSocket.ts     # Socket.IO lifecycle (autoConnect: false, JWT auth)
│   │   │   ├── useChat.ts       # Chat state reducer (messages, users, typing)
│   │   │   └── useSession.ts    # sessionStorage abstraction (tab-scoped)
│   │   ├── contexts/            # React Context providers
│   │   │   ├── SocketContext.tsx # Single Socket.IO instance for entire app
│   │   │   └── ChatContext.tsx  # Chat state + socket event wiring
│   │   ├── utils/
│   │   │   └── apiFetch.ts      # Thin fetch wrapper with JWT Bearer header
│   │   └── styles/              # Global variables, reset
│   ├── vite.config.ts           # Vite config (proxy /api and /socket.io to :3001)
│   └── package.json
├── server/                      # Socket.IO + REST API backend
│   └── src/
│       ├── index.ts             # Entry point (Bun engine, Socket.IO, static file serving)
│       ├── db.ts                # SQLite schema, queries, timestamp normalization
│       ├── room-manager.ts      # In-memory room state (users array per room)
│       ├── socket-handlers.ts   # Socket.IO event handlers (room:join, message:send, etc.)
│       ├── socket-join-handler.ts # Extracted room:join logic (session-aware rejoin detection)
│       ├── session-registry.ts  # Server-side session Map (sessionId -> socketId + roomCode)
│       ├── cleanup.ts           # Periodic TTL sweep (rooms inactive 24h, messages older 7d)
│       ├── static.ts            # Static file serving for built client (production only)
│       ├── validation.ts        # Shared validators (display name, room code, message text, escapeHtml)
│       ├── api/
│       │   ├── jwt.ts           # JWT sign/verify (jose), dev secret fallback
│       │   └── router.ts        # REST endpoints (POST /api/auth, POST /api/rooms, GET messages)
│       └── __tests__/           # Bun test files
├── shared/                      # Shared TypeScript types
│   ├── types.ts                 # Message, User, Room, Socket events, ChatError
│   └── constants.ts             # Validation limits, session storage key, TTL values
├── specs/                       # Architecture and implementation docs
├── Dockerfile                   # Multi-stage build for Fly.io
├── fly.toml                     # Fly.io configuration (persistent volume, health checks)
├── biome.json                   # Single root lint/format config
├── tsconfig.json                # TypeScript project references (client + server)
├── tsconfig.base.json           # Shared TypeScript config (strict mode, noUncheckedIndexedAccess)
└── package.json                 # Root workspace config
```

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- Node.js 18+ (for some tooling compatibility, e.g. Vite)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/nathanvale/real-time-chat.git
cd real-time-chat
```

2. Install dependencies:
```bash
bun install
```

3. (Optional) Set `JWT_SECRET` for production:
```bash
export JWT_SECRET="your-production-secret"
```
In development, the server falls back to a deterministic dev secret with a console warning.

4. Start development servers:
```bash
bun run dev
```

This starts:
- **Client dev server** at http://localhost:5173 (Vite HMR)
- **Socket.IO server** at http://localhost:3001 (Bun watch mode)

Vite proxies `/api` and `/socket.io` requests to `:3001`, so the frontend can use relative paths.

## Available Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install all workspace dependencies (client + server) |
| `bun run dev` | Start client and server in dev mode (parallel) |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Run Biome linter with auto-fix |
| `bun run format` | Format code with Biome |
| `bun run format:check` | Check code formatting |
| `bun run check` | Run `biome check --write .` (lint + format + organize imports) |
| `bun run typecheck` | Run TypeScript compiler (no emit) |
| `bun test` | Run all tests (server + client) |
| `bun test --watch` | Run tests in watch mode |
| `bun test --coverage` | Run tests with coverage |
| `bun run validate` | Run lint + typecheck + test (CI gate) |

### Client-Only Commands
```bash
cd client
bun run dev       # Start Vite dev server
bun run build     # Build for production
bun run preview   # Preview production build
```

### Server-Only Commands
```bash
cd server
bun run dev       # Start server with watch mode
```

## Testing

Tests are written using Bun's built-in test runner (Vitest-compatible API):

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Coverage report
bun test --coverage
```

### Test Coverage

**Server** (100+ tests):
- **db.ts** - SQLite queries, schema idempotency, timestamp normalization (ISO string -> epoch ms migration)
- **room-manager.ts** - Room creation, join/leave, sessionId deduplication, room code format
- **session-registry.ts** - Session lifecycle, socket-to-session reverse lookup, disconnect timer cancellation
- **validation.ts** - Display name, room code, message text, sessionId (UUID v4), escapeHtml (5 entities), extractErrorMessage
- **jwt.ts** - Token signing/verification, expiry (30m), custom secrets, production mode (requires JWT_SECRET)
- **router.ts** - REST endpoints, JWT Bearer auth, structured error responses, security headers (X-Content-Type-Options)
- **cleanup.ts** - Stale room detection, message pruning, occupied room protection (active lurker check)

**Client** (20+ tests):
- **useChat.ts** - Reducer for all action types (SET_ROOM, ADD_MESSAGE, USER_JOINED, TYPING_STARTED, etc.), message deduplication, exhaustive switch check

## Architecture

### Hybrid Transport Model

The app uses **REST for request/response** and **Socket.IO for real-time push**:

- **POST /api/auth** - Exchange displayName for JWT (30m expiry, HMAC-SHA256)
- **POST /api/rooms** - Create room (requires JWT Bearer header, returns 6-char code)
- **GET /api/rooms/:code/messages** - Fetch history (requires JWT, returns last 50 messages)
- **Socket.IO** - Real-time messaging, typing indicators, presence events

**Why not just Socket.IO?**
REST provides standard HTTP caching headers, load balancer health checks, and simple token refresh flow.

**Why not just REST polling?**
Socket.IO provides sub-100ms latency for live events, server push (no wasted requests), and automatic reconnection with exponential backoff.

### Authentication Flow

1. **LobbyPage** - User enters display name, clicks "Create Room"
2. **POST /api/auth** - Server signs JWT with `sub: displayName`, `exp: 30m`
3. **Save to sessionStorage** - Client stores `{ sessionId, displayName, roomCode, token }`
4. **POST /api/rooms** - Client sends `Authorization: Bearer <token>`, gets room code
5. **Connect socket** - Client calls `socket.auth = { token }`, then `socket.connect()`
6. **JWT middleware** - Server verifies token, attaches `socket.data.displayName`, rejects if invalid
7. **Navigate to /room/:code** - ChatPage emits `room:join` with sessionId
8. **GET /api/rooms/:code/messages** - Fetch initial history via REST (before socket join to avoid race)
9. **Socket.IO events** - Live messages arrive via `message:received` broadcast

On page refresh:
- sessionStorage persists (tab-scoped, survives F5)
- ChatPage validates session + token, connects socket, emits `room:join`
- Server detects same sessionId + roomCode -> silent rejoin (no duplicate toast)

### Session vs Socket Identity

- **socketId** - Changes on every reconnect (unreliable for ownership)
- **sessionId** - Stable across reconnects (crypto.randomUUID() in sessionStorage)

All messages and typing events use `sessionId` as `userId`. The "is my message" check compares `message.userId === session.sessionId`.

### Data Flow

**Message Send Path:**
```
MessageInput (client)
  -> socket.emit('message:send', { text })
  -> server validates text (2000 char limit)
  -> addMessage({ roomCode, userId: sessionId, text, type: 'user' })
  -> SQLite INSERT
  -> io.to(roomCode).emit('message:received', { message })
  -> ChatContext reducer (ADD_MESSAGE)
  -> MessageList re-renders
```

**Room Join Path:**
```
LobbyPage (client)
  -> POST /api/auth -> JWT token
  -> POST /api/rooms -> room code
  -> socket.auth = { token }
  -> socket.connect()
  -> navigate to /room/:code
  -> ChatPage: GET /api/rooms/:code/messages (REST)
  -> ChatPage: socket.emit('room:join', { roomCode, sessionId })
  -> server: JWT middleware verifies token
  -> server: session registry checks for existing session
  -> server: isRejoin = existingSession?.roomCode === roomCode
  -> server: if (!isRejoin) broadcast join toast
  -> server: socket.join(roomCode)
  -> server: emit('room:joined', { room, user })
  -> client: ChatContext SET_ROOM, SET_USERS, merge messages (dedup by ID)
```

### XSS Protection

React's JSX auto-escaping is the sole XSS defense layer:

- **Write path** - Store raw text in SQLite (searchable, exportable)
- **Read path** - Server sends raw text; React escapes `<>&"'` during rendering
- **No `dangerouslySetInnerHTML`** - All user content rendered via JSX text nodes

**Why not server-side escaping?** Applying `escapeHtml()` on the server causes double-encoding when React escapes again (e.g. `'` becomes `&#x27;` literal text). The `escapeHtml()` utility exists in `validation.ts` for non-React consumers but is not used on output paths.

### Room/Message TTL

**Cleanup sweep runs every 15 minutes:**
1. Find rooms inactive for 24+ hours
2. Check if room has active users (lurker protection)
3. If empty -> delete room + messages, remove from in-memory Map
4. Prune messages older than 7 days (global, not per-room)

### Structured Errors

All errors include a `code` field for programmatic handling:

```typescript
type ChatError = {
  code: 'ROOM_NOT_FOUND' | 'VALIDATION_ERROR' | 'AUTH_REQUIRED' | 'INTERNAL_ERROR'
  message: string
}
```

## Deployment

Deployed to Fly.io as a **single instance** (SQLite is single-writer).

### Prerequisites

- [Fly.io account](https://fly.io)
- [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/)

### Deploy Steps

1. Create a Fly.io app:
```bash
fly apps create real-time-chat-nv
```

2. Create a persistent volume for SQLite:
```bash
fly volumes create chat_data --size 1 --region syd
```

3. Set JWT_SECRET as a secret:
```bash
fly secrets set JWT_SECRET="your-production-secret-here"
```

4. Deploy:
```bash
fly deploy
```

The Dockerfile uses a multi-stage build (`oven/bun:1-slim`): install deps -> build client -> copy server + client/dist -> run Bun. Persistent volume mounts at `/data/app.db`.

## For the Interviewer

### Verifying Auth in the Browser

1. Open DevTools Network tab
2. Enter a display name and create a room
3. You'll see:
   - **POST /api/auth** - Returns JWT in JSON `{ token: "eyJ..." }`
   - **POST /api/rooms** - Includes `Authorization: Bearer <token>` header
   - **WS /socket.io/** - Socket.IO upgrade, auth token in handshake query
4. When the chat loads:
   - **GET /api/rooms/:code/messages** - Fetches history via REST (with Bearer token)
   - **Socket.IO events** - Live messages arrive via WebSocket (visible in WS tab)
5. The **"Authenticated" badge** in chat header confirms JWT is active

### Demo vs Production

| Demo | Production | Why? |
|------|-----------|------|
| Self-asserted displayName in JWT | OIDC/OAuth with real identity provider | Trust external IdP, not user input |
| 30-minute JWT, no refresh | Short-lived tokens (5 min) + refresh rotation | Reduces blast radius if token leaks |
| sessionStorage token | HttpOnly cookies | Prevents XSS exfiltration |
| No rate limiting | Rate limiting on auth + API endpoints | Prevents brute force, abuse |
| Single server, SQLite | Horizontal scaling, PostgreSQL, Redis adapter | Multi-writer DB, shared session state |

The **patterns are the same** - JWT middleware, protected endpoints, hybrid transport. The **identity source** changes.

### Architecture Decisions

**Why Socket.IO over raw WebSocket?**
Automatic reconnection, room broadcasting, fallback transports, portable API.

**Why SQLite over PostgreSQL/Redis?**
Zero dependencies (built into Bun), perfect for single-instance, simple schema (2 tables).

**Why sessionStorage over localStorage?**
Tab-scoped (clears on tab close), ideal for ephemeral session data.

**Why hybrid REST + Socket.IO?**
REST for request/response (auth, history), Socket.IO for real-time push (messages, typing).

**Why Bun over Node.js?**
Built-in SQLite, fast startup, Vitest-compatible test runner, native HTTP server.

## License

MIT

## Author

Built by Nathan Vale for the Monash University Senior Full Stack Developer coding challenge.

# Slack Sync Backend

A Node.js backend service for real-time Slack workspace user synchronization. This service provides REST APIs and WebSocket connections for managing Slack workspace users with automatic synchronization and real-time presence updates.

## Features

- 🔐 **Slack OAuth Integration**: Secure authentication with Slack workspaces
- 🔄 **Real-time Synchronization**: Automatic user data sync with Slack API
- 🌐 **WebSocket Support**: Real-time updates via Socket.io
- 👥 **User Management**: Complete CRUD operations for workspace users
- 🟢 **Presence Tracking**: Real-time online/offline status monitoring
- 📊 **SQLite Database**: Lightweight, file-based data persistence
- 🔌 **Event-Driven Architecture**: Slack Events API integration
- 🚀 **Docker Ready**: Containerized deployment support

## Tech Stack

- **Node.js** with Express.js
- **Socket.io** for WebSocket connections
- **Sequelize ORM** with SQLite
- **Slack SDK** for API integration
- **Docker** for containerization

## Prerequisites

- Node.js 16+ and npm
- Slack App with OAuth configuration
- ngrok (for local development with Slack events)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/dlgiant/slack-sync-backend.git
cd slack-sync-backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Slack credentials
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Slack OAuth Credentials
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_SIGNING_SECRET=your_signing_secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000

# Optional: ngrok for local development
NGROK_AUTHTOKEN=your_ngrok_token
NGROK_DOMAIN=your-domain.ngrok-free.app
```

## Running the Application

### Development Mode
```bash
npm start
```

### With Docker
```bash
docker build -t slack-sync-backend .
docker run -p 3001:3001 --env-file .env slack-sync-backend
```

### Docker Compose
```bash
docker-compose up backend
```

## API Endpoints

### Authentication
- `GET /api/auth/slack/install` - Initiate Slack OAuth flow
- `GET /api/auth/slack/callback` - OAuth callback handler
- `GET /api/auth/slack/status` - Check authentication status

### User Management
- `GET /api/users` - Get paginated user list
  - Query params: `page`, `limit`, `search`, `onlineOnly`, `includeDeleted`
- `GET /api/users/:id` - Get single user details
- `POST /api/users/sync` - Trigger manual sync with Slack
- `POST /api/users/sync/:id` - Sync specific user

### Slack Events
- `POST /api/slack/events` - Webhook for Slack events

## WebSocket Events

### Emitted Events
- `userCreated` - New user added to workspace
- `userUpdated` - User information changed
- `userDeleted` - User removed from workspace
- `userPresenceChanged` - User online/offline status changed

### Event Payload Examples

```javascript
// userPresenceChanged event
{
  userId: 'U123456',
  presence: 'active',
  isOnline: true,
  name: 'John Doe'
}

// userUpdated event
{
  id: 'U123456',
  name: 'johndoe',
  realName: 'John Doe',
  email: 'john@example.com',
  // ... full user object
}
```

## Database Schema

### Users Table
- `id` - Slack user ID (primary key)
- `teamId` - Slack team/workspace ID
- `name` - Username
- `realName` - Display name
- `email` - User email
- `presence` - Current presence status
- `isOnline` - Online/offline boolean
- `isAdmin`, `isOwner`, `isBot` - User type flags
- `lastSyncedAt` - Last synchronization timestamp

### Tokens Table
- `id` - Auto-increment primary key
- `type` - Token type (bot_token, user_token)
- `value` - Encrypted token value
- `teamId` - Associated workspace ID

## Slack App Configuration

1. Create a Slack App at https://api.slack.com/apps

2. OAuth & Permissions - Bot Token Scopes:
   - `users:read`
   - `users:read.email`
   - `presence:read`
   - `team:read`

3. OAuth & Permissions - User Token Scopes:
   - `users:read`
   - `presence:read`

4. Event Subscriptions:
   - Request URL: `https://your-domain/api/slack/events`
   - Subscribe to bot events:
     - `user_change`
     - `team_join`
     - `presence_change`

5. OAuth Redirect URL:
   - `https://your-domain/api/auth/slack/callback`

## Deployment

### Railway

1. Connect GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy with automatic builds on push

### Heroku

```bash
heroku create your-app-name
heroku config:set SLACK_CLIENT_ID=xxx
heroku config:set SLACK_CLIENT_SECRET=xxx
git push heroku main
```

### Manual Deployment

1. Set up Node.js environment
2. Configure environment variables
3. Install dependencies: `npm ci`
4. Run migrations: `npm run migrate`
5. Start server: `npm start`

## Development with ngrok

For local development with Slack events:

1. Install ngrok: `brew install ngrok`
2. Start backend: `npm start`
3. Start ngrok: `ngrok http 3001`
4. Update Slack App URLs with ngrok URL

## Architecture

```
src/
├── config/
│   ├── database.js    # Database configuration
│   └── slack.js       # Slack SDK configuration
├── models/
│   ├── User.js        # User model
│   └── Token.js       # Token model
├── routes/
│   ├── users.js       # User API routes
│   └── auth-simple.js # Authentication routes
├── services/
│   ├── userSync.js    # User synchronization logic
│   └── slackSync.js   # Slack API integration
└── index.js           # Main application entry
```

## Features in Detail

### Automatic Synchronization
- Initial sync on startup
- Periodic sync every hour
- Real-time sync via Slack events

### Presence Polling
- Polls user presence every 30 seconds
- Emits WebSocket events for status changes
- Efficient batch presence fetching

### Error Handling
- Graceful error recovery
- Automatic reconnection
- Detailed error logging

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/dlgiant/slack-sync-backend/issues) page.

## Security

- Never commit `.env` files
- Use environment variables for sensitive data
- Rotate Slack tokens regularly
- Enable HTTPS in production
- Implement rate limiting for API endpoints

## Acknowledgments

- Built with Node.js and Express
- Slack integration via Slack SDK
- Real-time updates powered by Socket.io
- Database management with Sequelize
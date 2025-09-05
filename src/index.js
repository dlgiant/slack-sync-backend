const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const sequelize = require('./config/database');
const { slackEvents } = require('./config/slack');
const UserSyncService = require('./services/userSync');
const Token = require('./models/Token');

const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth-simple'); // Use simpler OAuth implementation

const app = express();

// Trust proxy for ngrok
app.set('trust proxy', true);

// Add ngrok-skip-browser-warning header handling
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow all origins for now to debug the issue
      callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins for debugging
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  exposedHeaders: ['ngrok-skip-browser-warning']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const userSyncService = new UserSyncService(io);
app.set('userSyncService', userSyncService);

app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);

// Slack Events API endpoint with URL verification
app.post('/api/slack/events', (req, res) => {
  console.log('Slack event received:', req.body);
  
  // Handle URL verification challenge from Slack
  if (req.body && req.body.type === 'url_verification') {
    console.log('Slack URL verification challenge received:', req.body.challenge);
    // Immediately respond with the challenge value
    return res.status(200).send(req.body.challenge);
  }
  
  // Handle other event types
  if (req.body && req.body.type === 'event_callback') {
    const event = req.body.event;
    
    // Process events asynchronously
    if (event.type === 'user_change') {
      userSyncService.handleUserChange(event).catch(console.error);
    } else if (event.type === 'team_join') {
      userSyncService.syncSingleUser(event.user.id).catch(console.error);
    } else if (event.type === 'presence_change') {
      // Handle presence changes in real-time
      console.log(`Presence change for user ${event.user}: ${event.presence}`);
      userSyncService.handlePresenceChange(event).catch(console.error);
    }
    
    // Immediately respond to Slack
    return res.status(200).json({ ok: true });
  }
  
  // Default response
  res.status(200).json({ ok: true });
});

app.use('/slack/events', slackEvents.requestListener());

slackEvents.on('user_change', async (event) => {
  console.log('User change event received:', event.user.id);
  await userSyncService.handleUserChange(event);
});

slackEvents.on('team_join', async (event) => {
  console.log('New user joined:', event.user.id);
  await userSyncService.syncSingleUser(event.user.id);
});

slackEvents.on('presence_change', async (event) => {
  console.log('Presence change event:', event.user, event.presence);
  await userSyncService.handlePresenceChange(event);
});

slackEvents.on('error', (error) => {
  console.error('Slack events error:', error);
});

io.on('connection', (socket) => {
  console.log('New WebSocket connection established, ID:', socket.id);
  console.log('Total connected clients:', io.engine.clientsCount);
  console.log('Client transport:', socket.conn.transport.name);
  
  // Send a test event immediately on connection
  socket.emit('test', { message: 'Connected to backend WebSocket' });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('WebSocket connection closed, ID:', socket.id, 'Reason:', reason);
    console.log('Remaining clients:', io.engine.clientsCount - 1);
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    await sequelize.sync({ alter: true });
    console.log('Database models synchronized.');
    
    // Try to load token from database first
    await userSyncService.updateSlackClient();
    
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN !== 'xoxb-your-bot-token') {
      try {
        console.log('Performing initial user sync...');
        await userSyncService.syncAllUsers();
        
        setInterval(async () => {
          console.log('Running periodic user sync...');
          try {
            await userSyncService.syncAllUsers();
          } catch (syncError) {
            console.error('Periodic sync failed:', syncError.message);
          }
        }, 60 * 60 * 1000);
      } catch (syncError) {
        console.error('Initial sync failed:', syncError.message);
        console.log('Server will continue running. Please complete OAuth flow to enable sync.');
      }
    } else {
      console.log('No valid Slack bot token configured. Please complete OAuth flow.');
    }
    
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`WebSocket server is ready for connections`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (userSyncService) {
    userSyncService.stopPresencePolling();
  }
  server.close(() => {
    sequelize.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (userSyncService) {
    userSyncService.stopPresencePolling();
  }
  server.close(() => {
    sequelize.close();
    process.exit(0);
  });
});
// server.js - Main server file
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./db');
const { ensureSeeded, rebaseTimelineIfStale } = require('./utils/seed');
const simulator = require('./services/simulator');
const analytics = require('./services/analytics');

// Routes
const conversationsRoutes = require('./routes/conversations');
const agentsRoutes = require('./routes/agents');
const knowledgeBaseRoutes = require('./routes/knowledgeBase');
const analyticsRoutes = require('./routes/analytics');
const interveneRoutes = require('./routes/intervene');
const templatesRoutes = require('./routes/templates');
const presetsRoutes = require('./routes/presets');
const vectorRoutes = require('./routes/vector');
const systemRoutes = require('./routes/system');
const llmRoutes = require('./mockLlmApi');

// Middleware
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

// WebSocket handlers
const socketHandler = require('./websocket/socketHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 8080;

// Middleware setup
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(requestLogger);

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API routes
app.use('/api/conversations', conversationsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/intervene', interveneRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/presets', presetsRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/vector', vectorRoutes);
app.use('/api', systemRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date(), simulation: simulator.isRunning() });
});

app.use('/api', (req, res) => res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` }));

// Error handling
app.use(errorHandler);

// WebSocket connection handling
wss.on('connection', socketHandler);

async function boot() {
  await db.connect();
  const seeded = await ensureSeeded();
  if (!seeded) await rebaseTimelineIfStale();
  await analytics.captureSnapshot();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
  });

  if (process.env.SIMULATION !== 'off') simulator.start();
}

boot().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  simulator.stop();
  wss.clients.forEach((c) => c.terminate());
  server.close(async () => {
    await db.close().catch(() => {});
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Modular WebSocket and HTTP Server
// File: server.js
const express = require('express');
const { Server } = require('ws');
const { setupRoutes } = require('./routes');
const { setupWebSocket } = require('./websocket');
const { logger } = require('./utils');


// Configuration
const PORT = 3000;
const AUDIO_DIR = './audio';
const LOG_FILE = './server.log';

// Initialize directories and logging
logger.initializeDirectories(AUDIO_DIR);
// Setup Express server
const app = express();
const server = app.listen(PORT, () => {
    logger.logMessage(`HTTP Server listening on port ${PORT}`, LOG_FILE);
});

// Setup WebSocket server
const wss = new Server({ server });
setupWebSocket(wss, AUDIO_DIR, LOG_FILE);

// Setup HTTP routes
setupRoutes(app, AUDIO_DIR, LOG_FILE);

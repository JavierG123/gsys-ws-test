// File: routes/index.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { logMessage } = require('../utils/logger');

function setupRoutes(app, audioDir, logFile) {
    // Route to download WAV audio files
    app.get('/archivo/:id', (req, res) => {
        const audioFilePath = path.join(audioDir, `${req.params.id}.wav`);
        if (fs.existsSync(audioFilePath)) {
            res.download(audioFilePath);
        } else {
            res.status(404).send('Archivo no encontrado');
        }
    });

    // Route to download RAW audio files
    app.get('/raw/:id', (req, res) => {
        const audioFilePath = path.join(audioDir, `${req.params.id}.raw`);
        if (fs.existsSync(audioFilePath)) {
            res.download(audioFilePath);
        } else {
            res.status(404).send('Archivo no encontrado');
        }
    });

    // Route to download the log file
    app.get('/log', (req, res) => {
        if (fs.existsSync(logFile)) {
            res.download(logFile);
        } else {
            res.status(404).send('Log no encontrado');
        }
    });

    // Default route
    app.get('/', (req, res) => {
        res.send('Bienvenido al servidor de audio WebSocket');
    });
}

module.exports = { setupRoutes };

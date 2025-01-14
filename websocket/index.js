// File: websocket/index.js
const fs = require('fs');
const path = require('path');
const { logMessage } = require('../utils/logger');
const { convertRAWToWav } = require('../utils/fileUtils');
const { fileUtils } = require('../utils');

const sessions = {}; // Manage active WebSocket sessions

function setupWebSocket(wss, audioDir, logFile) {
    wss.on('connection', (ws, req) => {
        logMessage('New WebSocket connection', logFile);
        logMessage(`Headers: ${JSON.stringify(req.headers)}`, logFile);

        ws.on('message', (data, isBinary) => {
            if (isBinary) {
                handleBinaryData(ws, data, audioDir, logFile);
            } else {
                handleMessage(ws, data.toString(), audioDir, logFile);
            }
        });

        ws.on('close', () => {
            logMessage('WebSocket connection closed', logFile);
            handleClose(ws, audioDir, logFile);
        });
    });
}

function handleMessage(ws, message, audioDir, logFile) {
    try {
        const msg = JSON.parse(message);
        logMessage(`Message received: ${JSON.stringify(msg)}`, logFile);

        const sessionId = msg.id;

        if (!sessions[sessionId]) {
            const fileStreamRAW = fs.createWriteStream(path.join(audioDir, `${sessionId}.raw`), { flags: 'w' });
            sessions[sessionId] = { seq: 1, fileStreamRAW, ws };
        }

        const session = sessions[sessionId];

        switch (msg.type) {
            case 'open':
                handleOpen(ws, msg, session, logFile);
                break;
            case 'ping':
                handlePing(ws, msg, session, logFile);
                break;
            case 'close':
                handleClose(ws, logFile);
                break;
            case 'dtmf':
                handleDTMF(ws, msg, logFile);
                break;
            default:
                logMessage(`Unknown message type: ${msg.type}`, logFile);
        }
    } catch (err) {
        logMessage(`Error processing message: ${err}`, logFile);
    }
}

function handleBinaryData(ws, data, audioDir, logFile) {
    const sessionId = Object.keys(sessions).find(id => sessions[id].ws === ws);
    if (sessionId) {
        const session = sessions[sessionId];
        session.fileStreamRAW.write(data);
    } else {
        logMessage('Binary data received without an active session', logFile);
    }
}

function handleDTMF(ws, msg, logFile){
    const dtmf = msg.parameters.digit;
    logMessage(`DTMF received: ${dtmf}`);
    switch (dtmf) {
        case '1':
            fileUtils.convertRAWToWav(path.join(AUDIO_DIR, `${sessionId}.raw`), path.join(AUDIO_DIR, `${sessionId}.wav`));
            break;
    
        default:
            break;
    }
}

function handleOpen(ws, msg, session, logFile) {
    logMessage('Open received', logFile);
    const response = {
        version: '2',
        type: 'opened',
        seq: session.seq++,
        clientseq: msg.seq,
        id: msg.id,
        parameters: {
            startPaused: false,
            media: [msg.parameters.media[0]],
        },
    };

    ws.send(JSON.stringify(response));
    logMessage('Opened response sent', logFile);
}

function handlePing(ws, msg, session, logFile) {
    logMessage('Ping received', logFile);
    const pongResponse = {
        version: '2',
        type: 'pong',
        seq: session.seq++,
        clientseq: msg.seq,
        id: msg.id,
        parameters: {},
    };

    ws.send(JSON.stringify(pongResponse));
    logMessage('Pong response sent', logFile);
}

function handleClose(ws, audioDir, logFile) {
    const sessionId = Object.keys(sessions).find(id => sessions[id].ws === ws);
    if (sessionId) {
        const session = sessions[sessionId];
        if (session.fileStreamRAW) {
            session.fileStreamRAW.end();
            const rawFilePath = path.join(audioDir, `${sessionId}.raw`);
            const wavFilePath = path.join(audioDir, `${sessionId}.wav`);
            logMessage(`Saving and converting RAW file: ${rawFilePath}`, logFile);
            convertRAWToWav(rawFilePath, wavFilePath, logFile)
                .then(() => logMessage(`File converted to WAV: ${wavFilePath}`, logFile))
                .catch(err => logMessage(`Error converting file: ${err}`, logFile));
        }
        delete sessions[sessionId];
    }
}

module.exports = { setupWebSocket };

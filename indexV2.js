// Importar los módulos necesarios
const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Configuración del servidor
const PORT = 8080;
const AUDIO_DIR = path.join(__dirname, 'audio');

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

const app = express();
const server = app.listen(PORT, () => {
  console.log(`Servidor HTTP escuchando en puerto ${PORT}`);
});

const wss = new WebSocket.Server({ server });

// Manejo de sesiones
const sessions = {};

// Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
  console.log('Nueva conexión WebSocket');
  console.log('Cabeceras:', req.headers);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      handleBinaryData(ws, data);
    } else {
      handleMessage(ws, data.toString());
    }
  });

  ws.on('close', () => {
    console.log('Conexión WebSocket cerrada');
  });
});

function handleMessage(ws, message) {
  try {
    const msg = JSON.parse(message);
    const sessionId = msg.id;

    if (!sessions[sessionId]) {
      sessions[sessionId] = { seq: 1, audioChunks: [] };
    }

    switch (msg.type) {
      case 'open':
        handleOpen(ws, msg);
        break;
      case 'ping':
        handlePing(ws, msg);
        break;
      case 'close':
        handleClose(ws, msg);
        break;
      default:
        console.warn(`Tipo de mensaje desconocido: ${msg.type}`);
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
}

function handleBinaryData(ws, data) {
  const sessionId = Object.keys(sessions).find(id => sessions[id].ws === ws);
  if (sessionId) {
    sessions[sessionId].audioChunks.push(data);
  } else {
    console.warn('Datos binarios recibidos sin sesión activa.');
  }
}

function handleOpen(ws, msg) {
  const sessionId = msg.id;
  const session = sessions[sessionId];

  session.ws = ws;

  const response = {
    version: '2',
    type: 'opened',
    seq: session.seq++,
    clientseq: msg.seq,
    id: sessionId,
    parameters: {
      startPaused: false,
      media: [msg.parameters.media[0]],
    },
  };

  ws.send(JSON.stringify(response));
}

function handlePing(ws, msg) {
  const sessionId = msg.id;
  const session = sessions[sessionId];

  const response = {
    version: '2',
    type: 'pong',
    seq: session.seq++,
    clientseq: msg.seq,
    id: sessionId,
    parameters: {},
  };

  ws.send(JSON.stringify(response));
}

function handleClose(ws, msg) {
  const sessionId = msg.id;
  const session = sessions[sessionId];

  const response = {
    version: '2',
    type: 'closed',
    seq: session.seq++,
    clientseq: msg.seq,
    id: sessionId,
    parameters: {},
  };

  ws.send(JSON.stringify(response));

  // Guardar el audio en un archivo WAV
  const audioFilePath = path.join(AUDIO_DIR, `${sessionId}.wav`);
  fs.writeFileSync(audioFilePath, Buffer.concat(session.audioChunks));
  console.log(`Audio guardado en ${audioFilePath} --- ${sessionId}`);

  delete sessions[sessionId];
}

// Endpoint para descargar audio
app.get('/archivo/:id', (req, res) => {
  const audioFilePath = path.join(AUDIO_DIR, `${req.params.id}.wav`);
  if (fs.existsSync(audioFilePath)) {
    res.download(audioFilePath);
  } else {
    res.status(404).send('Archivo no encontrado');
  }
});

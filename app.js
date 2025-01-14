// Importar los módulos necesarios
const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { log } = require('console');
const spawn = require("child_process").spawn;

// Configuración del servidor
const PORT = 8080;
const AUDIO_DIR = path.join(__dirname, 'audio');
const LOG_FILE = path.join(__dirname, 'server.log');

function tryPython() {
  const pythonProcess = spawn('python3', ['converter.py', 'test']);
  pythonProcess.stdout.on('data', (data) => {
    logMessage(`Python exec finish: ${data}`);
  });
}


if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

const app = express();
const server = app.listen(PORT, () => {
  logMessage(`Servidor HTTP escuchando en puerto ${PORT}`);
});

logMessage('Call tryPython');
tryPython();
logMessage('After call tryPython');

const wss = new WebSocket.Server({ server });

// Manejo de sesiones
const sessions = {};

// Función para escribir logs en un archivo
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

// Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
  logMessage('Nueva conexión WebSocket');
  logMessage(`Cabeceras: ${JSON.stringify(req.headers)}`);

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      handleBinaryData(ws, data);
    } else {
      handleMessage(ws, data.toString());
    }
  });

  ws.on('close', () => {
    logMessage('Conexión WebSocket cerrada');
    const sessionId = Object.keys(sessions).find(id => sessions[id].ws === ws);
    const session = sessions[sessionId];
    // Cerrar el archivo y eliminar la sesión
    if (session.fileStreamRAW) {
      session.fileStreamRAW.end();
      logMessage(`Archivo RAW guardado en ${path.join(AUDIO_DIR, `${sessionId}.raw --- ${sessionId}`)}`);
      convertRAWToWav(path.join(AUDIO_DIR, `${sessionId}.raw`), path.join(AUDIO_DIR, `${sessionId}.wav`));
    }

    delete sessions[sessionId];

  });
});

function handleMessage(ws, message) {
  try {
    const msg = JSON.parse(message);
    logMessage(`Mensaje recibido: ${JSON.stringify(msg)}`);
    const sessionId = msg.id;

    if (!sessions[sessionId]) {
      // Abrir un archivo en modo escritura binaria
      const fileStreamRAW = fs.createWriteStream(path.join(AUDIO_DIR, `${sessionId}.raw`), { flags: 'w', encoding: null });
      sessions[sessionId] = { seq: 1, fileStreamRAW, ws };
    }

    const session = sessions[sessionId];

    checkDuration(ws, msg);

    if (msg.type.includes('playback')) {
      handlePlayback(ws, msg);
    } else {
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
        case 'dtmf':
          handleDTMF(ws, msg);
          break;
        case 'paused':
          handlePaused(ws, msg);
          break;
        default:
          logMessage(`Tipo de mensaje desconocido: ${msg.type} --- ${JSON.stringify(msg)}`);
      }
    }
  } catch (err) {
    logMessage(`Error procesando mensaje: ${err}`);
  }
}

function handleBinaryData(ws, data) {
  const sessionId = Object.keys(sessions).find(id => sessions[id].ws === ws);
  if (sessionId) {
    const session = sessions[sessionId];
    session.fileStreamRAW.write(data);

  } else {
    logMessage('Datos binarios recibidos sin sesión activa.');
  }
}

function handlePaused(ws, msg) {
  logMessage('Paused recibido');
}

function handlePlayback(ws, msg) {
  logMessage(msg.type === 'playback_started' ? 'Playback Started' : 'Playback Completed');
}

function handleDTMF(ws, msg) {
  logMessage('DTMF recibido');
  logMessage(`DTMF: ${msg.parameters.digit}`);
}


function handleOpen(ws, msg) {
  logMessage('Open recibido');
  logMessage(`Media: ${JSON.stringify(msg.parameters.media)}`);
  const sessionId = msg.id;
  const session = sessions[sessionId];

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
  logMessage('Opened Enviado');
}

function handlePing(ws, msg) {
  logMessage('Ping recibido');
  const sessionId = msg.id;
  const session = sessions[sessionId];

  const pongResponse = {
    version: '2',
    type: 'pong',
    seq: session.seq++,
    clientseq: msg.seq,
    id: sessionId,
    parameters: {},
  };

  ws.send(JSON.stringify(pongResponse));
  logMessage('Pong enviado');
}

function handleClose(ws, msg) {
  logMessage('Close recibido');
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
  logMessage('Closed enviado');
}

function convertRAWToWav(input_path, output_path) {

  return new Promise((resolve, reject) => {
    logMessage('Enter convertRAWToWav');
    const pythonProcess = spawn('python3', ['converter.py', input_path, output_path]);

    pythonProcess.stdout.on('data', (data) => {
      logMessage(`Python exec finish: ${data.toString()}`);
    });

    pythonProcess.stderr.on('data', (error) => {
      logMessage(`Python exec error: ${error.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      logMessage(`Python exec close: ${code}`);
      if (code !== 0) {
        logMessage(`Python process encountered an error: ${code}`);
        reject(`Error code: ${code}`);
      } else {
        resolve();
      }
    });
  });
}

async function checkDuration(ws, msg) {
  let audioEnviado = false;
  const sessionId = msg.id;
  const session = sessions[sessionId];
  const match = msg.position.match(/(\d+(\.\d+)?)/);
  const duration = parseFloat(match[0]);
  if (duration >= 10.0 && duration < 14.99) {
    logMessage('10 seg of transmition reached - Send response');
    sendAudio(ws, 'HolaSoyElBot.wav');
  } else if (duration >= 15.0 && duration < 19.99) {
    logMessage('15 seg of transmition reached');
    logMessage('Send Pause');
    const pause = {
      version: '2',
      type: 'pause',
      seq: session.seq++,
      clientseq: msg.seq,
      id: sessionId,
      parameters: {}
    }
    ws.send(JSON.stringify(pause));
    logMessage('Pause enviado');
    logMessage('Save Raw File and convert to Wav')
    if (session.fileStreamRAW) {
      session.fileStreamRAW.end();
      logMessage(`Archivo RAW guardado en ${path.join(AUDIO_DIR, `${sessionId}.raw --- ${sessionId}`)}`);
      await convertRAWToWav(path.join(AUDIO_DIR, `${sessionId}.raw`), path.join(AUDIO_DIR, `${sessionId}.wav`));
    }
    logMessage('Send back Audio to Genesys');
    audioEnviado = sendAudio(ws, path.join(AUDIO_DIR, `${sessionId}.wav`));
  } else if (audioEnviado) {
    logMessage('Audio Enviado - Send Disconnect');
    const disconnect = {
      version: '2',
      type: 'disconnect',
      seq: session.seq++,
      clientseq: msg.seq,
      id: sessionId,
      parameters: {
        reason: "completed",
        outputVariables: {
          OutputVariable: "Retorno del bot"
        }
      }
    }
    ws.send(JSON.stringify(disconnect));
    logMessage('Disconnect enviado');
  }
}


function sendAudio(ws, audioFilePath) {
  logMessage(`SendAudioFunction - ${audioFilePath}`);
  // Leer el archivo de audio
  const audioData = fs.readFileSync(audioFilePath)
  ws.send(audioData, (err) => {
    if (err) {
      logMessage(`Error enviando archivo de audio: ${err}`);
    } else {
      logMessage(`Archivo de audio enviado: ${audioFilePath}`);
      return true;
    }
  });
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

app.get('/raw/:id', (req, res) => {
  const audioFilePath = path.join(AUDIO_DIR, `${req.params.id}.raw`);
  if (fs.existsSync(audioFilePath)) {
    res.download(audioFilePath);
  } else {
    res.status(404).send('Archivo no encontrado');
  }
});


// Endpoint para descargar el log
app.get('/log', (req, res) => {
  if (fs.existsSync(LOG_FILE)) {
    res.download(LOG_FILE);
  } else {
    res.status(404).send('Log no encontrado');
  }
});

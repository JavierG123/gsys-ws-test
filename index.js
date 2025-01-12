// Importar los módulos necesarios
const WebSocket = require('ws');
const express = require('express');
const fs = require('fs');
const path = require('path');
const wav = require('wav');

// Configuración del servidor
const PORT = 8080;
const AUDIO_DIR = path.join(__dirname, 'audio');
const LOG_FILE = path.join(__dirname, 'server.log');

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

const app = express();
const server = app.listen(PORT, () => {
  logMessage(`Servidor HTTP escuchando en puerto ${PORT}`);
});

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
    addWavHeader(path.join(AUDIO_DIR, `${sessionId}.raw`), path.join(AUDIO_DIR, `${sessionId}.wav`));
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


    if (msg.serverseq === 3) {
      // Ruta del archivo de audio
      const audioFilePath = "HolaSoyElBot.wav";
      // Leer el archivo de audio
      const audioData = fs.readFileSync(audioFilePath)
      ws.send(audioData, (err) => {
        if (err) {
          logMessage(`Error enviando archivo de audio: ${err}`);
        } else {
          logMessage(`Archivo de audio enviado: ${audioFilePath}`);
        }
      });
    }

    if (msg.serverseq === 6) {
      logMessage(`Serverseq: ${msg.serverseq} --- Probando disconnect`);
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
        logMessage(`Tipo de mensaje desconocido: ${msg.type} --- ${JSON.stringify(msg)}`);
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


function createWavHeader(dataSize) {
  const header = Buffer.alloc(44); // Tamaño del header WAV estándar

  // "RIFF" Chunk Descriptor
  header.write('RIFF', 0); // Identificador
  header.writeUInt32LE(36 + dataSize, 4); // Tamaño total del archivo (header + datos)
  header.write('WAVE', 8); // Tipo de archivo
  
  // "fmt " Subchunk
  header.write('fmt ', 12); // Subchunk ID
  header.writeUInt32LE(16, 16); // Tamaño del subchunk (16 para PCM)
  header.writeUInt16LE(0x0101, 20); // Formato (u-Law, 0x0101)
  header.writeUInt16LE(1, 22); // Número de canales (mono)
  header.writeUInt32LE(8000, 24); // Frecuencia de muestreo (8000 Hz)
  header.writeUInt32LE(64000, 28); // Byte rate (8000 Hz * 1 canal * 8 bits / 8)
  header.writeUInt16LE(1, 32); // Block align (1 byte por muestra)
  header.writeUInt16LE(8, 34); // Bits por muestra (8 bits para u-Law)

  // "data" Subchunk
  header.write('data', 36); // Subchunk ID
  header.writeUInt32LE(dataSize, 40); // Tamaño de los datos (no el total del archivo)

  return header;
}

function addWavHeader(inputFile, outputFile) {
  fs.readFile(inputFile, (err, rawData) => {
    if (err) throw err;

    const header = createWavHeader(rawData.length);

    const wavData = Buffer.concat([header, rawData]);

    fs.writeFile(outputFile, wavData, (err) => {
      if (err) throw err;
      logMessage(`Archivo WAV generado en: ${outputFile}`);
    });
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

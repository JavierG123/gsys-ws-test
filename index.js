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
    
    transformToWav(path.join(AUDIO_DIR, `${sessionId}.raw`), path.join(AUDIO_DIR, `${sessionId}.wav`));
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
      case 'dtmf':
        handleDTMF(wav, msg);
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

// Configuración del encabezado WAV
const wavHeader = (dataSize, sampleRate, numChannels, bitsPerSample) => {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  
  return Buffer.concat([
      Buffer.from('RIFF'), // chunkID
      Buffer.alloc(4), // chunkSize (se llenará después)
      Buffer.from('WAVE'), // format
      Buffer.from('fmt '), // subChunk1ID
      Buffer.from([0x12, 0x00, 0x00, 0x00]), // subChunk1Size (18 bytes para extensiones)
      Buffer.from([0x07, 0x00]), // compression (7)
      Buffer.from([numChannels, 0x00]), // numChannels (1)
      Buffer.alloc(4, sampleRate), // sampleRate (8000)
      Buffer.alloc(4, byteRate), // byteRate
      Buffer.from([blockAlign, 0x00]), // blockAlign
      Buffer.from([bitsPerSample, 0x00]), // bitsPerSample
      Buffer.from([0x00, 0x00]), // ExtraParamSize
      Buffer.from('data'), // subChunk2ID
      Buffer.alloc(4, dataSize) // subChunk2Size
  ]);
};

function transformToWav(inputFilePath, outputFilePath){
  // Leer datos del archivo RAW
  fs.readFile(inputFilePath, (err, rawData) => {
    if (err) {
        logMessage('Error al leer el archivo RAW:', err);
        return;
    }
  
    const dataSize = rawData.length;
    const header = wavHeader(dataSize, 8000, 1, 8); // Configuración del encabezado
  
    // Actualizar chunkSize
    const chunkSize = header.length + dataSize - 8; // Tamaño total menos "RIFF" y "WAVE"
    header.writeUInt32LE(chunkSize, 4);
  
    // Combinar encabezado y datos
    const wavData = Buffer.concat([header, rawData]);
  
    // Escribir archivo WAV
    fs.writeFile(outputFilePath, wavData, (err) => {
        if (err) {
            logMessage('Error al escribir el archivo WAV:', err);
            return;
        }
        logMessage('Archivo WAV generado correctamente:', outputFilePath);
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

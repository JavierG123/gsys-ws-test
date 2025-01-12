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
  });
});

function handleMessage(ws, message) {
  try {
    const msg = JSON.parse(message);
    logMessage(`Mensaje recibido: ${JSON.stringify(msg)}`);
    const sessionId = msg.id;

    if (!sessions[sessionId]) {
      //const fileStream = fs.createWriteStream(path.join(AUDIO_DIR, `${sessionId}.raw`), { flags: 'w' });
      const fileStream = fs.createWriteStream(path.join(AUDIO_DIR, `${sessionId}.wav`));
      // Crear el escritor WAV
      const wavWriter = new wav.Writer({
        channels: 1,          // Mono
        sampleRate: 8000,     // Frecuencia de muestreo
        bitDepth: 8,          // Profundidad de bits
      });
      wavWriter.pipe(fileStream);
      sessions[sessionId] = { seq: 1, fileStream, wavWriter, pongSent: false, ws };
      //sessions[sessionId] = { seq: 1, audioChunks: [], pongSent: false, ws , eventSent: false};
    }

    const session = sessions[sessionId];

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
    const pcmData = decodeMuLawToPCM(data);
    session.wavWriter.write(pcmData);
    //session.fileStream.write(data);
    //sessions[sessionId].audioChunks.push(data);
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
  session.pongSent = true;

  // if(session.eventSent === false){
  //   // Enviar evento adicional con el primer pong
  //   const eventResponse = {
  //     version: '2',
  //     type: 'event',
  //     seq: session.seq++,
  //     serverseq: msg.seq,
  //     id: sessionId,
  //     parameters: {
  //       entities: [
  //         {
  //           type: 'OutputVariable',
  //           data: {
  //             OutputVariable: 'PruebaDesdeBot',
  //           },
  //         },
  //       ],
  //     },
  //   };

  //   ws.send(JSON.stringify(eventResponse));
  //   session.eventSent = true;
  //   logMessage('Evento enviado');
  // }
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

  // Cerrar el archivo y eliminar la sesión
  if (session.fileStream) {
    //session.fileStream.end(); // Finaliza la escritura en el archivo
    session.wavWriter.end();
    logMessage(`Archivo binario puro guardado en ${path.join(AUDIO_DIR, `${sessionId}.wav --- ${sessionId}`)}`);
  }
  // // Guardar el audio en un archivo WAV
  // const audioFilePath = path.join(AUDIO_DIR, `${sessionId}.wav`);
  // fs.writeFileSync(audioFilePath, Buffer.concat(session.audioChunks));
  // logMessage(`Audio guardado en ${audioFilePath} --- ${sessionId}`);

  delete sessions[sessionId];
}

// Tabla de descompresión de u-Law a PCM lineal (G.711 estándar)
const MULAW_DECODE_TABLE = new Int16Array(256);

function generateMuLawDecodeTable() {
    for (let i = 0; i < 256; i++) {
        let muLawByte = ~i; // Invertir los bits
        let sign = (muLawByte & 0x80) ? -1 : 1;
        let exponent = (muLawByte >> 4) & 0x07;
        let mantissa = muLawByte & 0x0F;
        let magnitude = ((0x21 << exponent) + (mantissa << (exponent + 3))) - 0x84;
        MULAW_DECODE_TABLE[i] = sign * magnitude;
    }
}

// Llama a esta función al inicializar tu aplicación para llenar la tabla
generateMuLawDecodeTable();

// Función para decodificar un buffer de u-Law a PCM lineal
function decodeMuLawToPCM(ulawBuffer) {
    const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2); // Cada muestra PCM ocupa 2 bytes
    for (let i = 0; i < ulawBuffer.length; i++) {
        const pcmValue = MULAW_DECODE_TABLE[ulawBuffer[i]];
        pcmBuffer.writeInt16LE(pcmValue, i * 2); // Escribe el valor PCM como Int16LE
    }
    return pcmBuffer;
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

// Endpoint para descargar el log
app.get('/log', (req, res) => {
  if (fs.existsSync(LOG_FILE)) {
    res.download(LOG_FILE);
  } else {
    res.status(404).send('Log no encontrado');
  }
});

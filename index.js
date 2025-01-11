const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const util = require('util');
require('events').EventEmitter.defaultMaxListeners = 100;
require('events').EventEmitter.prototype._maxListeners = 100;
process.setMaxListeners(100);

// Configuración del servidor HTTP
const app = express();
const port = process.env.PORT || 3000;

// Crear un servidor WebSocket en un puerto diferente o en el mismo
const wss = new WebSocket.Server({ noServer: true });

// Responder a la solicitud HTTP inicial
app.get('/', (req, res) => {
  console.log('Solicitud HTTP recibida');
  const upgradeHeader = req.headers['upgrade'];
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    res.status(101).send('Switching Protocols');
  } else {
    res.status(400).send('Bad Request');
  }
});

// Servir el archivo cuando se accede a la URL /archivo
app.get('/archivo', (req, res) => {
  const filePath = path.join(__dirname, 'audio_stream.pcm');

  // Verificar si el archivo existe antes de enviarlo
  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.error('Error al acceder al archivo:', err);
      return res.status(404).send('Archivo no encontrado');
    }

    // Enviar el archivo al cliente para su descarga
    res.download(filePath, 'audio_stream.pcm', (err) => {
      if (err) {
        console.error('Error al enviar el archivo:', err);
        res.status(500).send('Error al descargar el archivo');
      }
    });
  });
});

let pongseq = 1;
let openseq = 1;
// Manejo de conexiones WebSocket
wss.on('connection', (ws, req) => {
  // Parsear el primer mensaje WebSocket
  ws.on('message', (message) => {
    if (isText(message)) {
      const messageJson = JSON.parse(message);
      console.log('Mensaje JSON RECIBIDO:', messageJson);
      if (messageJson.type === 'open') {
        // Enviar respuesta de "opened"
        const openResponse = {
          version: "2",
          type: "opened",
          seq: openseq,
          clientseq: 1,
          id: messageJson.id,
          parameters: {
            startPaused: false,
            media: [
              {
                type: "audio",
                format: "PCMU",
                channels: ["external"],
                rate: 8000,
              },
            ],
          },
        }
        ws.send(JSON.stringify(openResponse));
        console.log('Respuesta de "opened" enviada');
        openseq++;
      };
      // Responder a error de "Maximum size of entity for transcription data exceeded"
      if (messageJson.type === 'error' && messageJson.parameters.code === 413) {
        const errorResponse = {
          version: "2",
          type: "closed",
          seq: messageJson.seq,
          clientseq: 1,
          id: messageJson.id,
          parameters: {},
        };
        ws.send(JSON.stringify(errorResponse));
      }
      // Responder al cierre del WebSocket
    } else {
      //Escuchar audio binario y guardarlo en archivo
      // const fileStream = fs.createWriteStream('audio_stream.pcm', { flags: 'a' });
      // ws.on('message', (binaryData) => {
      //   console.log('Datos binarios ---', binaryData);
      //   fileStream.write(binaryData);
      // });
      //let audioData = [];
      ws.on('message', (data) => {
        if (!isText(data)) {
          console.log('Datos NO TEXTO ---', data.buffer.byteLength.toString());
          // audioData.push(data);
          // fs.appendFileSync('audioStream.raw', Buffer.from(data));
          const fileStream = fs.createWriteStream('audio_stream.pcm', { flags: 'a' });
          fileStream.write(data);
        }
      })
    }
    ws.on('close', () => {
      console.log('Conexión WebSocket cerrada');
      //ServerFiles()
    });
    ws.on('message', (ping) => {
      if (isText(ping)) {
        const pingJson = JSON.parse(ping)
        if (pingJson.type === 'ping') {
          console.log('Ping recibido', pingJson);
          const pong = {
            "version": pingJson.version,
            "type": "pong",
            "seq": pongseq,
            "clientseq": pingJson.seq,
            "id": pingJson.id,
            "parameters": {}
          }
          ws.send(JSON.stringify(pong));
          console.log('Pong enviado: ', pong);
          pongseq++;  
        }
      }
    })
  });
});

// Integrar WebSocket en el servidor HTTP
app.server = app.listen(port, () => {
  console.log(`Servidor HTTP escuchando en el puerto ${port}`);
});

app.server.on('upgrade', (request, socket, head) => {
  // Realizar el upgrade de WebSocket
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
    console.log('Proceso upgrade de WebSocket');
  });
});

function ServerFiles() {
  // Obtener la ubicación actual
  const currentDirectory = __dirname;

  // Leer los archivos en el directorio actual
  fs.readdir(currentDirectory, (err, files) => {
    if (err) {
      console.error('Error al leer el directorio:', err);
      return;
    }

    // Imprimir cada archivo o directorio
    files.forEach((file) => {
      const filePath = path.join(currentDirectory, file);

      // Verificar si es un archivo o un directorio
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error al obtener información del archivo:', err);
          return;
        }

        if (stats.isFile()) {
          console.log(`Archivo: ${file}`);
        } else if (stats.isDirectory()) {
          console.log(`Directorio: ${file}`);
        }
      });
    });
  });
}

function isText(uint8Array) {
  try {
    // Convierte el Uint8Array a texto
    const text = new TextDecoder('utf-8').decode(uint8Array);
    // Intenta parsearlo como JSON
    JSON.parse(text);
    return true; // Si no arroja error, es texto válido
  } catch {
    return false; // No es texto válido
  }
}

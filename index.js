const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Configuración del servidor HTTP
const app = express();
const port = process.env.PORT || 3000;

// Crear un servidor WebSocket en un puerto diferente o en el mismo
const wss = new WebSocket.Server({ noServer: true });

// Responder a la solicitud HTTP inicial
app.get('/', (req, res) => {
  const upgradeHeader = req.headers['upgrade'];
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    res.status(101).send('Switching Protocols');
  } else {
    res.status(400).send('Bad Request');
  }
});

// Manejo de conexiones WebSocket
wss.on('connection', (ws, req) => {
  ServerFiles()
  // Parsear el primer mensaje WebSocket
  ws.on('message', (message) => {
    ServerFiles()
    try {
      const messageJson = JSON.parse(message);  
      if (messageJson.type) {
        console.log('Mensaje JSON:', messageJson);
        if (messageJson.type === 'open') {
          // Enviar respuesta de "opened"
          const openResponse = {
            version: "2",
            type: "opened",
            seq: messageJson.seq,
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
          ServerFiles()
        };
        // Responder a error de "Maximum size of entity for transcription data exceeded"
        if (messageJson.type === 'error' && messageJson.parameters.code === 413) {
          const errorResponse = {
            version: "2",
            type: "closed",
            seq: 34,
            clientseq: 15,
            id: messageJson.id,
            parameters: {},
          };
          ws.send(JSON.stringify(errorResponse));
          ServerFiles()
        } 
      }

      // Escuchar audio binario y guardarlo en archivo
      const fileStream = fs.createWriteStream('audio_stream.pcm', { flags: 'a' });
      ws.on('message', (binaryData) => {
        console.log('Datos binarios --- Escribiendo data');
        console.log('Datos binarios:', binaryData);
        fileStream.write(binaryData);
        ServerFiles()
      });
    } catch (e) {
      console.error('Error procesando mensaje:', e);
      ServerFiles()
    }
  });

  // Responder al cierre del WebSocket
  ws.on('close', () => {
    console.log('Conexión WebSocket cerrada');
    ServerFiles()
  });
});

// Integrar WebSocket en el servidor HTTP
app.server = app.listen(port, () => {
  console.log(`Servidor HTTP escuchando en el puerto ${port}`);
  ServerFiles()
});

app.server.on('upgrade', (request, socket, head) => {
  // Realizar el upgrade de WebSocket
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

function ServerFiles(){
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
// File: utils/fileUtils.js
const { spawn } = require('child_process');
const { logMessage } = require('./logger');

/**
 * Converts a RAW audio file to WAV format using a Python script.
 * @param {string} inputPath - The path to the RAW audio file.
 * @param {string} outputPath - The path to save the WAV audio file.
 * @param {string} logFile - The path to the log file.
 * @returns {Promise<void>} - Resolves when the conversion is complete.
 */
function convertRAWToWav(inputPath, outputPath, logFile) {
    return new Promise((resolve, reject) => {
        logMessage(`Starting RAW to WAV conversion: ${inputPath} -> ${outputPath}`, logFile);

        const pythonProcess = spawn('python3', ['converter.py', inputPath, outputPath]);

        pythonProcess.stdout.on('data', (data) => {
            logMessage(`Python stdout: ${data.toString()}`, logFile);
        });

        pythonProcess.stderr.on('data', (error) => {
            logMessage(`Python stderr: ${error.toString()}`, logFile);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                logMessage(`Conversion successful: ${outputPath}`, logFile);
                resolve();
            } else {
                const errorMsg = `Conversion failed with code ${code}`;
                logMessage(errorMsg, logFile);
                reject(new Error(errorMsg));
            }
        });
    });
}

module.exports = {
    convertRAWToWav,
};

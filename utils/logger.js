// File: utils/logger.js
const fs = require('fs');

/**
 * Logs a message to a file with a timestamp.
 * @param {string} message - The message to log.
 * @param {string} logFile - The path to the log file.
 */
function logMessage(message, logFile) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
        fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (error) {
        console.error(`Failed to write to log file: ${error.message}`);
    }
}

/**
 * Ensures that necessary directories exist, creating them if needed.
 * @param {string} directory - The directory path to check or create.
 */
function initializeDirectories(directory) {
    if (!fs.existsSync(directory)) {
        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch (error) {
            console.error(`Failed to create directory: ${directory}. Error: ${error.message}`);
        }
    }
}

module.exports = {
    logMessage,
    initializeDirectories,
};

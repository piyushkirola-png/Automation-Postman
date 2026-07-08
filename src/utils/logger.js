const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create reports directory if it doesn't exist
const reportsDir = path.join(__dirname, '../../reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(reportsDir, 'automation.log')
    })
  ]
});

function logSuccess(message) {
  logger.info(`✅ ${message}`);
}

function logError(message) {
  logger.error(`❌ ${message}`);
}

function logWarning(message) {
  logger.warn(`⚠️ ${message}`);
}

function logInfo(message) {
  logger.info(`ℹ️ ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`📋 ${title}`);
  console.log('='.repeat(60));
}

module.exports = {
  logger,
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logSection
};
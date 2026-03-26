const winston = require('winston');
const path = require('path');

// Определяем директорию логов
const logsDir = path.join(__dirname, '../logs');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ level, message, timestamp, stack }) => {
            const log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
            return stack ? `${log}\n${stack}` : log;
        })
    ),
    defaultMeta: { service: 'transfers-app' },
    transports: [
        // Логировать всё в файл
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(logsDir, 'combined.log') 
        }),
        // В production также выводить в консоль
        ...(process.env.NODE_ENV !== 'production' ? [] : [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ])
    ]
});

// Если не production, также выводить в консоль с цветами
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) => {
                return `${timestamp} [${level}]: ${message}`;
            })
        )
    }));
}

module.exports = logger;

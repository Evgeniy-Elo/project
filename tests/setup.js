require('dotenv').config({ path: '.env.test' });

// Установка переменных окружения для тестов
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Подавление консоли во время тестов
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

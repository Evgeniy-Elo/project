require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const audioRoutes = require('./routes/audio');
const relayRoutes = require('./routes/relay');

const { authMiddleware, requireAnyRole } = require('./middleware/auth');
const setupSocketHandlers = require('./sockets');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
        methods: ['GET', 'POST']
    }
});

// ============ ДОВЕРЕНЫ ПРОКСи ============
app.set('trust proxy', 1); // Для работы с X-Forwarded-For от прокси

// ============ БЕЗОПАСНОСТЬ ============
app.use(helmet()); // Защита заголовками
app.use(compression()); // Сжатие ответов

// Rate limiting для предотвращения brute-force на логин
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    message: 'Слишком много попыток входа. Попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting для API
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 100, // максимум 100 запросов в минуту
    message: 'Слишком много запросов к API. Попробуйте позже.'
});

// ============ НАСТРОЙКА СЕССИИ ============
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // HTTPS только в production
        httpOnly: true,
        sameSite: 'strict', // защита от CSRF
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
    }
});

// ============ БАЗОВЫЕ MIDDLEWARE ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
app.use(apiLimiter); // Общее rate limiting для всех запросов

// ============ ПОДКЛЮЧАЕМ РОУТЫ ============
// Логин с дополнительным rate limiting
app.use('/auth/login', loginLimiter);
app.use('/auth', authRoutes);

app.use('/admin', authMiddleware, adminRoutes);
app.use('/audio', authMiddleware, audioRoutes);
app.use('/relay', relayRoutes);

// Подключаем ту же сессию к Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// НАСТРОЙКА СТРАНИЦ (должны идти после роутов)
// Главная страница — доступна всем авторизованным (admin, viewer, audio, relay)
app.get('/', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница управления реле — только для роли relay
app.get('/relay', authMiddleware, requireAnyRole(['relay']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'relay.html'));
});

// Страница аудио — для роли audio
app.get('/audio', authMiddleware, requireAnyRole(['audio']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'audio.html'));
});

// Админка — только admin
app.get('/admin.html', authMiddleware, requireAnyRole(['admin']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Настройка сокетов
setupSocketHandlers(io, db);

const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
    logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📱 Доступен в сети по адресу: http://${HOST}:${PORT}`);
    console.log('\n📋 Available pages:');
    console.log('- / (main table) - for all authenticated users');
    console.log('- /audio - for users with audio role');
    console.log('- /relay - for users with relay role');
    console.log('- /admin.html - for users with admin role');

    // Показываем реальные IP адреса сервера
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log('\n🌐 Доступные сетевые интерфейсы:');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                logger.info(`http://${net.address}:${PORT} (${name})`);
                console.log(`   http://${net.address}:${PORT} (${name})`);
            }
        }
    }
});
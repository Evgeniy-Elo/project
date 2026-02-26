require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const audioRoutes = require('./routes/audio');
const relayRoutes = require('./routes/relay');

const { authMiddleware, requireAnyRole } = require('./middleware/auth');
const setupSocketHandlers = require('./sockets');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Настройка сессии (ОДИН объект для Express и Socket.IO)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
});

// Базовые middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// ПОДКЛЮЧАЕМ РОУТЫ (ВАЖНО: порядок имеет значение)
app.use('/auth', authRoutes);
app.use('/admin', authMiddleware, adminRoutes);
app.use('/audio', authMiddleware, audioRoutes);  // все API аудио
app.use('/relay', relayRoutes);  // все API реле

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
const HOST = '0.0.0.0'; // ВАЖНО: слушаем на всех интерфейсах!

httpServer.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
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
                console.log(`   http://${net.address}:${PORT} (${name})`);
            }
        }
    }
});
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./config/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница — только для admin
app.get('/', authMiddleware, requireAnyRole(['admin']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница аудио — для роли audio
app.get('/audio', authMiddleware, requireAnyRole(['audio']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'audio.html'));
});

// Админка — только admin
app.get('/admin.html', authMiddleware, requireAnyRole(['admin']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Подключаем ту же сессию к Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

app.use('/auth', authRoutes);
app.use('/admin', authMiddleware, adminRoutes);

setupSocketHandlers(io, db);

const audioRoutes = require('./routes/audio');
app.use('/audio', audioRoutes);  // все API будут доступны по /audio/api/...

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
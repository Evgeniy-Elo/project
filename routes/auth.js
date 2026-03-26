const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const logger = require('../utils/logger');
const router = express.Router();

// Middleware валидации для логина
const validateLogin = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Логин должен быть от 3 до 50 символов')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Логин может содержать только буквы, цифры, _ и -'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Пароль должен быть от 6 до 128 символов')
];

router.post('/login', validateLogin, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Некорректные данные', details: errors.array() });
    }

    const { username, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            logger.warn(`Failed login attempt for non-existent user: ${username}`);
            return res.status(401).json({ error: 'Неверный логин/пароль' });
        }
        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            logger.warn(`Failed login attempt for user: ${username}`);
            return res.status(401).json({ error: 'Неверный логин/пароль' });
        }

        const roles = user.roles ? user.roles.split(',').map(r => r.trim()) : [];
        req.session.user = {
            id: user.id,
            username: user.username,
            is_admin: roles.includes('admin'),
            roles: roles
        };

        // Определяем страницу для редиректа
        let redirectTo = '/';
        if (roles.includes('admin')) {
            redirectTo = '/';
        } else if (roles.includes('audio')) {
            redirectTo = '/audio';
        } else {
            redirectTo = '/'; // можно заменить на страницу-заглушку
        }

        logger.info(`User logged in: ${username}`);
        res.json({ success: true, user: req.session.user, redirectTo });
    } catch (err) {
        logger.error(`Login error: ${err.message}`, err);
        console.error('Full error:', err);
        res.status(500).json({ error: 'Ошибка сервера при входе', details: err.message });
    }
});

router.post('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy((err) => {
        if (err) {
            logger.error(`Logout error: ${err.message}`);
            return res.status(500).json({ error: 'Ошибка при выходе' });
        }
        if (username) logger.info(`User logged out: ${username}`);
        res.json({ success: true });
    });
});

router.get('/me', (req, res) => {
    if (req.session.user) res.json(req.session.user);
    else res.status(401).json(null);
});

module.exports = router;
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const router = express.Router();

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) return res.status(401).json({ error: 'Неверный логин/пароль' });
        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Неверный логин/пароль' });

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

        res.json({ success: true, user: req.session.user, redirectTo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

router.get('/me', (req, res) => {
    if (req.session.user) res.json(req.session.user);
    else res.status(401).json(null);
});

module.exports = router;
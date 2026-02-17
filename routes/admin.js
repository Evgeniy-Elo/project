const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { adminMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(adminMiddleware);

// Получить всех пользователей
router.get('/users', async (req, res) => {
    const [rows] = await db.query('SELECT id, username, roles, created_at FROM users');
    // Добавляем поле is_admin для обратной совместимости, если нужно
    const users = rows.map(u => ({
        ...u,
        is_admin: u.roles ? u.roles.split(',').includes('admin') : false
    }));
    res.json(users);
});

// Добавить пользователя
router.post('/users', async (req, res) => {
    const { username, password, roles } = req.body; // roles - массив строк
    const hash = await bcrypt.hash(password, 10);
    const rolesStr = Array.isArray(roles) ? roles.join(',') : '';
    try {
        const [result] = await db.query(
            'INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)',
            [username, hash, rolesStr]
        );
        res.json({ id: result.insertId, username, roles: rolesStr });
    } catch (e) {
        res.status(400).json({ error: 'Логин занят' });
    }
});

// Сменить пароль
router.put('/users/:id/password', async (req, res) => {
    const { password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true });
});

// История с фильтрами
router.get('/history', async (req, res) => {
    const { user_id, from, to } = req.query;
    let sql = `SELECT h.*, u.username FROM history h 
               JOIN users u ON h.user_id = u.id WHERE 1=1`;
    const params = [];
    if (user_id) {
        sql += ' AND h.user_id = ?';
        params.push(user_id);
    }
    if (from) {
        sql += ' AND DATE(h.changed_at) >= ?';
        params.push(from);
    }
    if (to) {
        sql += ' AND DATE(h.changed_at) <= ?';
        params.push(to);
    }
    sql += ' ORDER BY h.changed_at DESC LIMIT 1000';
    const [rows] = await db.query(sql, params);
    res.json(rows);
});

module.exports = router;
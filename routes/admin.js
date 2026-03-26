const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const db = require('../config/db');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const { adminMiddleware } = require('../middleware/auth');
const router = express.Router();

router.use(adminMiddleware);

// Получить всех пользователей (с кэшированием)
router.get('/users', async (req, res) => {
    try {
        // Проверяем кэш
        const cached = cache.get('all_users');
        if (cached) {
            logger.debug('Returning cached users');
            return res.json(cached);
        }

        const [rows] = await db.query('SELECT id, username, roles, created_at FROM users');
        const users = rows.map(u => ({
            ...u,
            is_admin: u.roles ? u.roles.split(',').includes('admin') : false
        }));
        
        // Сохраняем в кэш на 5 минут
        cache.set('all_users', users, 300);
        
        res.json(users);
    } catch (error) {
        logger.error(`Get users error: ${error.message}`);
        res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
});

// Добавить пользователя с валидацией
router.post('/users',
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Логин должен быть от 3 до 50 символов')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Логин может содержать только буквы, цифры, _ и -'),
    body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Пароль должен быть от 8 до 128 символов'),
    body('roles')
        .optional({ checkFalsy: true })
        .isArray()
        .withMessage('Roles должны быть массивом'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Некорректные данные', details: errors.array() });
        }

        const { username, password, roles } = req.body;
        try {
            const hash = await bcrypt.hash(password, 10);
            const rolesStr = Array.isArray(roles) ? roles.filter(r => /^[a-z0-9_]+$/.test(r)).join(',') : '';
            const [result] = await db.query(
                'INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)',
                [username, hash, rolesStr]
            );
            // Инвалидируем кэш пользователей
            cache.del('all_users');
            logger.info(`New user created by admin: ${username}`);
            res.json({ id: result.insertId, username, roles: rolesStr });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Этот логин уже существует' });
            }
            logger.error(`User creation error: ${e.message}`);
            res.status(500).json({ error: 'Ошибка при создании пользователя' });
        }
    }
);

// Сменить пароль с валидацией
router.put('/users/:id/password',
    param('id').isInt().toInt(),
    body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Пароль должен быть от 8 до 128 символов'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Некорректные данные', details: errors.array() });
        }

        const { password } = req.body;
        const { id } = req.params;
        
        try {
            const hash = await bcrypt.hash(password, 10);
            await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
            cache.del('all_users'); // Инвалидируем кэш
            logger.info(`Password changed for user ID: ${id}`);
            res.json({ success: true });
        } catch (error) {
            logger.error(`Password update error: ${error.message}`);
            res.status(500).json({ error: 'Ошибка при смене пароля' });
        }
    }
);

// История с фильтрами (безопасные параметризованные запросы)
router.get('/history', async (req, res) => {
    const { user_id, from, to, page = 1, limit = 100 } = req.query;
    
    // Валидация pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 100), 500); // максимум 500 записей
    const offset = (pageNum - 1) * limitNum;
    
    try {
        // Строим SQL запрос с условиями
        let conditions = [];
        const params = [];
        
        let sql = 'SELECT h.*, u.username FROM history h JOIN users u ON h.user_id = u.id';
        
        if (user_id) {
            const userId = parseInt(user_id);
            if (!isNaN(userId)) {
                conditions.push('h.user_id = ?');
                params.push(userId);
            }
        }
        
        if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
            conditions.push('DATE(h.changed_at) >= ?');
            params.push(from);
        }
        
        if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
            conditions.push('DATE(h.changed_at) <= ?');
            params.push(to);
        }
        
        // Добавляем условия если они есть
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY h.changed_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offset);
        
        const [rows] = await db.query(sql, params);
        
        // Получить общее количество - используем те же параметры и условия
        let countSql = 'SELECT COUNT(*) as total FROM history h';
        if (conditions.length > 0) {
            countSql += ' WHERE ' + conditions.join(' AND ');
        }
        
        const [[{ total }]] = await db.query(countSql, params);
        
        res.json({
            data: rows,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        logger.error(`History query error: ${error.message}`);
        res.status(500).json({ error: 'Ошибка при получении истории' });
    }
});

module.exports = router;
const express = require('express');
const axios = require('axios');
const router = express.Router();
const agents = require('../config/agents.json');
const { authMiddleware, adminMiddleware, hasRole } = require('../middleware/auth');

// ===================== API ДЛЯ ПОЛУЧЕНИЯ ДАННЫХ =====================

// Получить статус и файлы всех агентов
router.get('/api/agents', authMiddleware, hasRole('audio'), async (req, res) => {
    const promises = agents.map(async (agent) => {
        try {
            const [statusRes, filesRes] = await Promise.all([
                axios.get(`http://${agent.ip}:${agent.port}/status`, { timeout: 5000 }),
                axios.get(`http://${agent.ip}:${agent.port}/files`, { timeout: 5000 })
            ]);
            return {
                name: agent.name,
                ip: agent.ip,
                status: statusRes.data,
                files: filesRes.data.files || []
            };
        } catch (err) {
            return {
                name: agent.name,
                ip: agent.ip,
                status: {
                    status: 'offline',
                    hostname: agent.name,
                    ip: agent.ip,
                    path: '—'
                },
                files: [],
                alert: 'Агент недоступен'
            };
        }
    });

    const results = await Promise.all(promises);
    res.json(results);
});

// ===================== УПРАВЛЯЮЩИЕ КОМАНДЫ (ТОЛЬКО ADMIN) =====================

router.post('/api/agents/:ip/start', authMiddleware, adminMiddleware, async (req, res) => {
    await axios.get(`http://${req.params.ip}:5000/start`);
    res.json({ success: true });
});

router.post('/api/agents/:ip/stop', authMiddleware, adminMiddleware, async (req, res) => {
    await axios.get(`http://${req.params.ip}:5000/stop`);
    res.json({ success: true });
});

router.post('/api/agents/:ip/delete', authMiddleware, adminMiddleware, async (req, res) => {
    const { files } = req.body;
    const response = await axios.post(`http://${req.params.ip}:5000/delete`, { files });
    res.json(response.data);
});

router.post('/api/agents/:ip/cleanup', authMiddleware, adminMiddleware, async (req, res) => {
    const { days } = req.body;
    const response = await axios.post(`http://${req.params.ip}:5000/cleanup`, { days });
    res.json(response.data);
});

// ===================== ПРОКСИ ДЛЯ АУДИОФАЙЛОВ =====================
router.get('/api/agents/:ip/records/:filename', authMiddleware, adminMiddleware, async (req, res) => {
    const { ip, filename } = req.params;
    const url = `http://${ip}:5000/records/${encodeURIComponent(filename)}`;

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });
        res.set(response.headers);
        response.data.pipe(res);
    } catch (err) {
        res.status(502).json({ error: 'Ошибка при получении файла с агента' });
    }
});

// ===================== СТРАНИЦА АУДИО =====================
router.get('/audio', authMiddleware, adminMiddleware, (req, res) => {
    res.sendFile('audio.html', { root: './public' });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==================== ОТКРЫТЫЕ API ДЛЯ ESP8266 (БЕЗ АВТОРИЗАЦИИ) ====================

// Регистрация/обновление устройства (открытый эндпоинт)
router.post('/api/device/register', async (req, res) => {
    const { id, name, location, firmware, ip } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'ID устройства обязателен' });
    }

    try {
        await db.execute(
            `INSERT INTO relay_devices (id, name, location, firmware_version, ip_address) 
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             name = VALUES(name), 
             location = VALUES(location),
             firmware_version = VALUES(firmware_version),
             ip_address = VALUES(ip_address),
             last_seen = NOW()`,
            [id, name || id, location, firmware, ip]
        );
        res.json({ success: true, message: 'Устройство зарегистрировано' });
    } catch (error) {
        logger.error('Error registering device: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Получение расписаний для устройства (открытый эндпоинт)
router.get('/api/schedules/:deviceId', async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT enabled, channel, start_hour, start_minute, 
                    end_hour, end_minute, monday, tuesday, wednesday, 
                    thursday, friday, saturday, sunday 
             FROM relay_schedules 
             WHERE device_id = ? AND enabled = TRUE`,
            [req.params.deviceId]
        );

        // Обновляем last_seen
        await db.execute(
            'UPDATE relay_devices SET last_seen = NOW() WHERE id = ?',
            [req.params.deviceId]
        );

        const schedules = rows.map(row => ({
            enabled: row.enabled,
            channel: row.channel,
            startHour: row.start_hour,
            startMinute: row.start_minute,
            endHour: row.end_hour,
            endMinute: row.end_minute,
            monday: Boolean(row.monday),
            tuesday: Boolean(row.tuesday),
            wednesday: Boolean(row.wednesday),
            thursday: Boolean(row.thursday),
            friday: Boolean(row.friday),
            saturday: Boolean(row.saturday),
            sunday: Boolean(row.sunday)
        }));

        res.json(schedules);
    } catch (error) {
        logger.error('Error fetching schedules: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==================== ЗАЩИЩЕННЫЕ API ДЛЯ ВЕБ-ИНТЕРФЕЙСА (С АВТОРИЗАЦИЕЙ) ====================
const { authMiddleware, hasRole } = require('../middleware/auth');

// Уведомление устройства об изменении расписаний (НОВЫЙ МАРШРУТ)
router.post('/api/device/notify/:deviceId', authMiddleware, hasRole('relay'), async (req, res) => {
    const { deviceId } = req.params;

    try {
        const [devices] = await db.execute(
            'SELECT ip_address FROM relay_devices WHERE id = ?',
            [deviceId]
        );

        if (devices.length === 0) {
            return res.status(404).json({ error: 'Устройство не найдено' });
        }

        const deviceIp = devices[0].ip_address;

        if (!deviceIp) {
            return res.status(400).json({ error: 'IP устройства неизвестен' });
        }

        const axios = require('axios');
        try {
            // Отправляем сигнал устройству, что расписания изменились
            await axios.post(`http://${deviceIp}:80/sync`, {}, { timeout: 3000 });
            res.json({ success: true, message: 'Устройство уведомлено' });
        } catch (error) {
            logger.error('Error notifying device: ' + error.message);
            // Не возвращаем ошибку, так как устройство может быть офлайн
            res.json({ success: true, warning: 'Устройство недоступно, обновит расписания при следующей синхронизации' });
        }
    } catch (error) {
        logger.error('Error notifying device: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Получение всех устройств (только для веба)
router.get('/api/devices', authMiddleware, hasRole('relay'), async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT d.*, COUNT(s.id) as schedule_count 
            FROM relay_devices d 
            LEFT JOIN relay_schedules s ON d.id = s.device_id 
            GROUP BY d.id
            ORDER BY d.last_seen DESC
        `);
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching devices: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Добавление нового устройства (только для веба)
router.post('/api/devices', authMiddleware, hasRole('relay'), async (req, res) => {
    const { id, name, location } = req.body;

    if (!id || !name) {
        return res.status(400).json({ error: 'ID и название обязательны' });
    }

    try {
        await db.execute(
            'INSERT INTO relay_devices (id, name, location) VALUES (?, ?, ?)',
            [id, name, location || null]
        );
        res.json({ success: true, message: 'Устройство добавлено' });
    } catch (error) {
        logger.error('Error adding device: ' + error.message);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Устройство с таким ID уже существует' });
        }
        res.status(500).json({ error: 'Database error' });
    }
});

// Получение расписаний для веба
router.get('/api/schedules', authMiddleware, hasRole('relay'), async (req, res) => {
    const { deviceId } = req.query;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId обязателен' });
    }

    try {
        const [rows] = await db.execute(
            'SELECT * FROM relay_schedules WHERE device_id = ? ORDER BY channel, start_hour, start_minute',
            [deviceId]
        );
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching schedules: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Создание нового расписания
router.post('/api/schedules', authMiddleware, hasRole('relay'), async (req, res) => {
    const schedule = req.body;

    if (!schedule.device_id || schedule.channel === undefined) {
        return res.status(400).json({ error: 'Не хватает данных' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO relay_schedules 
             (device_id, enabled, channel, start_hour, start_minute, end_hour, end_minute,
              monday, tuesday, wednesday, thursday, friday, saturday, sunday) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                schedule.device_id,
                schedule.enabled !== false,
                schedule.channel,
                schedule.start_hour || 0,
                schedule.start_minute || 0,
                schedule.end_hour || 23,
                schedule.end_minute || 59,
                schedule.monday || false,
                schedule.tuesday || false,
                schedule.wednesday || false,
                schedule.thursday || false,
                schedule.friday || false,
                schedule.saturday || false,
                schedule.sunday || false
            ]
        );

        // Уведомляем устройство об изменении
        try {
            await notifyDevice(schedule.device_id);
        } catch (notifyError) {
            logger.debug('Device offline, will sync later');
        }

        res.json({ id: result.insertId, ...schedule });
    } catch (error) {
        logger.error('Error creating schedule: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Обновление расписания
router.put('/api/schedules/:id', authMiddleware, hasRole('relay'), async (req, res) => {
    const schedule = req.body;
    const { id } = req.params;

    try {
        // Сначала получаем device_id для этого расписания
        const [scheduleInfo] = await db.execute('SELECT device_id FROM relay_schedules WHERE id = ?', [id]);

        await db.execute(
            `UPDATE relay_schedules SET 
             enabled = ?, channel = ?, start_hour = ?, start_minute = ?,
             end_hour = ?, end_minute = ?, monday = ?, tuesday = ?,
             wednesday = ?, thursday = ?, friday = ?, saturday = ?, sunday = ?
             WHERE id = ?`,
            [
                schedule.enabled,
                schedule.channel,
                schedule.start_hour,
                schedule.start_minute,
                schedule.end_hour,
                schedule.end_minute,
                schedule.monday,
                schedule.tuesday,
                schedule.wednesday,
                schedule.thursday,
                schedule.friday,
                schedule.saturday,
                schedule.sunday,
                id
            ]
        );

        // Уведомляем устройство об изменении
        if (scheduleInfo.length > 0) {
            try {
                await notifyDevice(scheduleInfo[0].device_id);
            } catch (notifyError) {
                logger.debug('Device offline, will sync later');
            }
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating schedule: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Удаление расписания
router.delete('/api/schedules/:id', authMiddleware, hasRole('relay'), async (req, res) => {
    try {
        // Сначала получаем device_id для этого расписания
        const [scheduleInfo] = await db.execute('SELECT device_id FROM relay_schedules WHERE id = ?', [req.params.id]);

        await db.execute('DELETE FROM relay_schedules WHERE id = ?', [req.params.id]);

        // Уведомляем устройство об изменении
        if (scheduleInfo.length > 0) {
            try {
                await notifyDevice(scheduleInfo[0].device_id);
            } catch (notifyError) {
                logger.debug('Device offline, will sync later');
            }
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting schedule: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==================== РУЧНОЕ УПРАВЛЕНИЕ ====================
// Отправка команды на ESP8266 (только для веба)
router.post('/api/manual-control', authMiddleware, hasRole('relay'), async (req, res) => {
    const { deviceId, channel, state } = req.body;

    if (!deviceId || channel === undefined) {
        return res.status(400).json({ error: 'Не хватает данных' });
    }

    try {
        // Получаем IP устройства из БД
        const [devices] = await db.execute(
            'SELECT ip_address FROM relay_devices WHERE id = ?',
            [deviceId]
        );

        if (devices.length === 0) {
            return res.status(404).json({ error: 'Устройство не найдено' });
        }

        const deviceIp = devices[0].ip_address;

        if (!deviceIp) {
            return res.status(400).json({ error: 'IP устройства неизвестен' });
        }

        // Отправляем команду на ESP8266
        const axios = require('axios');
        try {
            await axios.post(`http://${deviceIp}:80/manual`, {
                channel: channel,
                state: state
            }, { timeout: 3000 });

            // Логируем действие
            logger.info(`Manual control: device ${deviceId}, channel ${channel}, state ${state}`);

            res.json({ success: true });
        } catch (error) {
            logger.error('Error sending command to ESP: ' + error.message);
            res.status(502).json({ error: 'Устройство недоступно' });
        }
    } catch (error) {
        logger.error('Error in manual control: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Сброс ручного режима (возврат к автоматическому)
router.post('/api/manual-control/reset', authMiddleware, hasRole('relay'), async (req, res) => {
    const { deviceId } = req.body;

    if (!deviceId) {
        return res.status(400).json({ error: 'deviceId обязателен' });
    }

    try {
        const [devices] = await db.execute(
            'SELECT ip_address FROM relay_devices WHERE id = ?',
            [deviceId]
        );

        if (devices.length === 0) {
            return res.status(404).json({ error: 'Устройство не найдено' });
        }

        const deviceIp = devices[0].ip_address;

        if (!deviceIp) {
            return res.status(400).json({ error: 'IP устройства неизвестен' });
        }

        const axios = require('axios');
        try {
            await axios.post(`http://${deviceIp}:80/manual/reset`, {}, { timeout: 3000 });
            res.json({ success: true });
        } catch (error) {
            logger.error('Error resetting manual mode: ' + error.message);
            res.status(502).json({ error: 'Устройство недоступно' });
        }
    } catch (error) {
        logger.error('Error resetting manual mode: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Удаление устройства
router.delete('/api/devices/:id', authMiddleware, hasRole('relay'), async (req, res) => {
    try {
        await db.execute('DELETE FROM relay_devices WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting device: ' + error.message);
        res.status(500).json({ error: 'Database error' });
    }
});

// Вспомогательная функция для уведомления устройства
async function notifyDevice(deviceId) {
    const [devices] = await db.execute('SELECT ip_address FROM relay_devices WHERE id = ?', [deviceId]);
    if (devices.length === 0 || !devices[0].ip_address) return;

    const axios = require('axios');
    try {
        await axios.post(`http://${devices[0].ip_address}:80/sync`, {}, { timeout: 2000 });
        logger.debug(`Device ${deviceId} notified successfully`);
    } catch (error) {
        logger.debug(`Device ${deviceId} offline, will sync later`);
        throw error;
    }
}

module.exports = router;
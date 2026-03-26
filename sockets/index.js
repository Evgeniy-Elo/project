const logger = require('../utils/logger');

// Валидация cellId
const isValidCellId = (cellId) => {
    return typeof cellId === 'number' || (typeof cellId === 'string' && /^\d+$/.test(cellId));
};

// Валидация значения ячейки (max 65535 символов, как VARCHAR в MySQL)
const isValidCellValue = (value) => {
    return typeof value === 'string' && value.length <= 65535;
};

module.exports = (io, db) => {
    io.use(async (socket, next) => {
        const session = socket.request.session;
        if (session?.user) {
            socket.user = session.user;
            next();
        } else {
            logger.warn(`Unauthorized socket connection attempt from ${socket.id}`);
            next(new Error('unauthorized'));
        }
    });

    io.on('connection', async (socket) => {
        logger.info(`User ${socket.user?.username} connected, socket ${socket.id}`);

        try {
            // Отправить всю таблицу при подключении
            const [cells] = await db.query('SELECT * FROM cells ORDER BY row_index, col_index');
            socket.emit('init_cells', cells);
        } catch (error) {
            logger.error(`Error loading cells for ${socket.user?.username}: ${error.message}`);
            socket.emit('error', 'Ошибка при загрузке таблицы');
        }

        // Запрос блокировки ячейки
        socket.on('lock_cell', async ({ cellId }) => {
            // Валидация входных данных
            if (!isValidCellId(cellId)) {
                logger.warn(`Invalid cellId from ${socket.user?.username}: ${cellId}`);
                socket.emit('error', 'Недопустимый ID ячейки');
                return;
            }

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                
                // Для предотвращения race condition используем FOR UPDATE
                const [locks] = await connection.query(
                    'SELECT * FROM locks WHERE cell_id = ? FOR UPDATE',
                    [cellId]
                );
                
                if (locks.length > 0) {
                    const lock = locks[0];
                    const [users] = await connection.query('SELECT username FROM users WHERE id = ?', [lock.user_id]);
                    await connection.commit();
                    socket.emit('lock_denied', { cellId, holder: users[0]?.username });
                } else {
                    await connection.query(
                        'INSERT INTO locks (cell_id, user_id, socket_id) VALUES (?, ?, ?)',
                        [cellId, socket.user.id, socket.id]
                    );
                    await connection.commit();
                    socket.emit('lock_granted', { cellId });
                    socket.broadcast.emit('cell_locked', { cellId, username: socket.user.username });
                    logger.debug(`Cell ${cellId} locked by ${socket.user?.username}`);
                }
            } catch (e) {
                await connection.rollback();
                logger.error(`Lock cell error: ${e.message}`);
                socket.emit('error', 'Ошибка при блокировке ячейки');
            } finally {
                connection.release();
            }
        });

        // Сохранение изменений
        socket.on('save_cell', async ({ cellId, value }) => {
            // Валидация входных данных
            if (!isValidCellId(cellId) || !isValidCellValue(value)) {
                logger.warn(`Invalid data from ${socket.user?.username}: cellId=${cellId}, value length=${String(value).length}`);
                socket.emit('error', 'Недопустимые данные');
                return;
            }

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                
                // Проверим, что блокировка принадлежит этому пользователю
                const [locks] = await connection.query(
                    'SELECT * FROM locks WHERE cell_id = ? AND user_id = ?',
                    [cellId, socket.user.id]
                );
                
                if (locks.length === 0) {
                    await connection.commit();
                    socket.emit('save_denied', { cellId, reason: 'Блокировка потеряна' });
                    logger.warn(`Save attempt without lock from ${socket.user?.username} on cell ${cellId}`);
                    return;
                }

                const [cell] = await connection.query('SELECT * FROM cells WHERE id = ?', [cellId]);
                if (cell.length === 0) {
                    await connection.commit();
                    socket.emit('save_denied', { cellId, reason: 'Ячейка не найдена' });
                    return;
                }

                const oldValue = cell[0].value;

                // Не сохраняем, если значение не изменилось
                if (oldValue === value) {
                    await connection.query('DELETE FROM locks WHERE cell_id = ?', [cellId]);
                    await connection.commit();
                    io.emit('cell_unlocked', { cellId });
                    return;
                }

                await connection.query(
                    'UPDATE cells SET value = ?, last_editor_id = ?, last_edit_time = NOW() WHERE id = ?',
                    [value, socket.user.id, cellId]
                );

                await connection.query(
                    'INSERT INTO history (row_index, col_index, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?)',
                    [cell[0].row_index, cell[0].col_index, oldValue, value, socket.user.id]
                );

                await connection.query('DELETE FROM locks WHERE cell_id = ?', [cellId]);

                await connection.commit();

                io.emit('cell_updated', { cellId, value, username: socket.user.username });
                io.emit('cell_unlocked', { cellId });
                logger.debug(`Cell ${cellId} saved by ${socket.user?.username}`);
            } catch (e) {
                await connection.rollback();
                logger.error(`Save cell error: ${e.message}`);
                socket.emit('error', 'Ошибка при сохранении');
            } finally {
                connection.release();
            }
        });

        // Отмена редактирования
        socket.on('unlock_cell', async ({ cellId }) => {
            // Валидация
            if (!isValidCellId(cellId)) {
                logger.warn(`Invalid cellId from ${socket.user?.username}`);
                return;
            }

            try {
                await db.query('DELETE FROM locks WHERE cell_id = ? AND user_id = ?', [cellId, socket.user.id]);
                io.emit('cell_unlocked', { cellId });
                logger.debug(`Cell ${cellId} unlocked by ${socket.user?.username}`);
            } catch (error) {
                logger.error(`Unlock cell error: ${error.message}`);
                socket.emit('error', 'Ошибка при разблокировке');
            }
        });

        // При отключении — снять все блокировки этого сокета
        socket.on('disconnect', async () => {
            try {
                await db.query('DELETE FROM locks WHERE socket_id = ?', [socket.id]);
                logger.info(`User ${socket.user?.username} disconnected`);
            } catch (error) {
                logger.error(`Disconnect cleanup error: ${error.message}`);
            }
        });
    });
};
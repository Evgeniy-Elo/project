module.exports = (io, db) => {
    io.use(async (socket, next) => {
        const session = socket.request.session;
        if (session?.user) {
            socket.user = session.user;
            next();
        } else {
            next(new Error('unauthorized'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`User ${socket.user?.username} connected, socket ${socket.id}`); // добавлено ?.

        // Отправить всю таблицу при подключении
        const [cells] = await db.query('SELECT * FROM cells ORDER BY row_index, col_index');
        socket.emit('init_cells', cells);

        // Запрос блокировки ячейки
        socket.on('lock_cell', async ({ cellId }) => {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const [locks] = await connection.query(
                    'SELECT * FROM locks WHERE cell_id = ? FOR UPDATE',
                    [cellId]
                );
                if (locks.length > 0) {
                    const lock = locks[0];
                    const [users] = await connection.query('SELECT username FROM users WHERE id = ?', [lock.user_id]);
                    socket.emit('lock_denied', { cellId, holder: users[0]?.username });
                } else {
                    await connection.query(
                        'INSERT INTO locks (cell_id, user_id, socket_id) VALUES (?, ?, ?)',
                        [cellId, socket.user.id, socket.id]
                    );
                    socket.emit('lock_granted', { cellId });
                    socket.to('all').emit('cell_locked', { cellId, username: socket.user.username });
                }
                await connection.commit();
            } catch (e) {
                await connection.rollback();
                socket.emit('error', e.message);
            } finally {
                connection.release();
            }
        });

        // Сохранение изменений
        socket.on('save_cell', async ({ cellId, value }) => {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                // Проверим, что блокировка принадлежит этому пользователю
                const [locks] = await connection.query(
                    'SELECT * FROM locks WHERE cell_id = ? AND user_id = ?',
                    [cellId, socket.user.id]
                );
                if (locks.length === 0) {
                    socket.emit('save_denied', { cellId, reason: 'Блокировка потеряна' });
                    return;
                }

                const [cell] = await connection.query('SELECT * FROM cells WHERE id = ?', [cellId]);
                const oldValue = cell[0].value;

                // Не сохраняем, если значение не изменилось
                if (oldValue === value) {
                    // просто снимаем блокировку
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
            } catch (e) {
                await connection.rollback();
                socket.emit('error', e.message);
            } finally {
                connection.release();
            }
        });

        // Отмена редактирования
        socket.on('unlock_cell', async ({ cellId }) => {
            await db.query('DELETE FROM locks WHERE cell_id = ? AND user_id = ?', [cellId, socket.user.id]);
            io.emit('cell_unlocked', { cellId });
        });

        // При отключении — снять все блокировки этого сокета
        socket.on('disconnect', async () => {
            await db.query('DELETE FROM locks WHERE socket_id = ?', [socket.id]);
            console.log(`User ${socket.user.username} disconnected`);
        });
    });
};
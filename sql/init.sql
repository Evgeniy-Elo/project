-- Создание базы данных
CREATE DATABASE IF NOT EXISTS transfers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE transfers;

-- Пользователи
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    roles VARCHAR(255) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ячейки таблицы
CREATE TABLE cells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_index INT NOT NULL,
    col_index INT NOT NULL,
    value TEXT NOT NULL,
    last_editor_id INT NULL,
    last_edit_time TIMESTAMP NULL,
    UNIQUE KEY unique_cell (row_index, col_index),
    FOREIGN KEY (last_editor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Активные блокировки
CREATE TABLE locks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cell_id INT NOT NULL,
    user_id INT NOT NULL,
    socket_id VARCHAR(255),
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- История изменений
CREATE TABLE history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_index INT NOT NULL,
    col_index INT NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    user_id INT NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Добавляем администратора (пароль: admin123)
-- Хеш сгенерирован для bcrypt, замените на свой при необходимости
INSERT INTO users (username, password_hash, roles) VALUES
('admin', '$2b$10$R8eNCcDZgaXy0.YTYlfW5OIBmbDiYiI7X/cg/FSHIzfY3FPst5u76', 'admin,audio');

-- Создаём сетку 50 строк × 6 столбцов, заполняем данными из Excel
-- Внимание: сгенерируйте хеш для admin123 командой:
-- node -e "console.log(require('bcrypt').hashSync('admin123', 10))"
-- и подставьте выше вместо 'YourHashedPasswordHere'.

INSERT INTO cells (row_index, col_index, value)
SELECT r, c,
  CASE
    WHEN r = 0 AND c = 0 THEN 'Островского 71'
    WHEN r = 0 AND c = 1 THEN 'Узда'
    WHEN r = 0 AND c = 2 THEN 'Новый Свержень'
    WHEN r = 0 AND c = 3 THEN 'Войниловичи'
    WHEN r = 0 AND c = 4 THEN 'Ферма-Гай'
    WHEN r = 0 AND c = 5 THEN 'Столбцы'
    WHEN r = 0 AND c = 6 THEN 'Островского 69'
    WHEN r = 0 AND c = 7 THEN 'Протасова 7А'
    WHEN r = 1 AND c = 0 THEN 'На 71-ый быт технику ассортимент; клея для обоев (со Столбцов)\n\nНа 71-й( с Ферма-Гай) : Двина 100л - 1 п.\nТорф верховой кипованный рН 2,5-3,5 100л - 1п. \nТорф верховой кипованный рН 5,5-6,5 100л - 1 п.'
    WHEN r = 1 AND c = 3 THEN 'Грунт пит. Двина 100л - 2 п.\nТорф верховой кипованный рН 5,5-6,5 100л - 1 п. ( с Н.Свержня)'
    WHEN r = 1 AND c = 5 THEN 'Двина 100л - 2 п.\nТорф верховой кипованный рН 5,5-6,5 100л - 1 п. ( с Н.Свержня)'
    ELSE ''
  END
FROM
  (
    SELECT 0 AS r UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
    SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
    SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL
    SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL
    SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL
    SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL
    SELECT 30 UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33 UNION ALL SELECT 34 UNION ALL
    SELECT 35 UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL
    SELECT 40 UNION ALL SELECT 41 UNION ALL SELECT 42 UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL
    SELECT 45 UNION ALL SELECT 46 UNION ALL SELECT 47 UNION ALL SELECT 48 UNION ALL SELECT 49
  ) AS `rows`,
  (
    SELECT 0 AS c UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
  ) AS `cols`;

-- Замечание: после вставки данных id ячеек будут сгенерированы автоматически.
-- В locks и history они ссылаются на эти id.
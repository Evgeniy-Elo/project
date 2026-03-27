-- Полная пересборка базы данных с правильной кодировкой

DROP DATABASE IF EXISTS transfers;
CREATE DATABASE transfers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE transfers;

-- Пользователи
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    roles VARCHAR(255) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ячейки таблицы
CREATE TABLE cells (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_index INT NOT NULL,
    col_index INT NOT NULL,
    value LONGTEXT NOT NULL,
    last_editor_id INT NULL,
    last_edit_time TIMESTAMP NULL,
    UNIQUE KEY unique_cell (row_index, col_index),
    FOREIGN KEY (last_editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Активные блокировки
CREATE TABLE locks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cell_id INT NOT NULL,
    user_id INT NOT NULL,
    socket_id VARCHAR(255),
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- История изменений
CREATE TABLE history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    row_index INT NOT NULL,
    col_index INT NOT NULL,
    old_value LONGTEXT NOT NULL,
    new_value LONGTEXT NOT NULL,
    user_id INT NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Добавляем администратора (пароль: admin123)
INSERT INTO users (username, password_hash, roles) VALUES
('admin', '$2b$10$R8eNCcDZgaXy0.YTYlfW5OIBmbDiYiI7X/cg/FSHIzfY3FPst5u76', 'admin,audio');

-- Данные таблицы
INSERT INTO cells (row_index, col_index, value) VALUES
(0, 0, 'Островского 71'),
(0, 1, 'Узда'),
(0, 2, 'Новый Свержень'),
(0, 3, 'Войниловичи'),
(0, 4, 'Ферма-Гай'),
(0, 5, 'Столбцы'),
(0, 6, 'Островского 69'),
(0, 7, 'Протасова 7А'),
(1, 0, 'На 71-ый быт технику ассортимент; клея для обоев (со Столбцов)\n\nНа 71-й( с Ферма-Гай) : Двина 100л - 1 п.\nТорф верховой кипованный рН 2,5-3,5 100л - 1п. \nТорф верховой кипованный рН 5,5-6,5 100л - 1 п.'),
(1, 3, 'Грунт пит. Двина 100л - 2 п.\nТорф верховой кипованный рН 5,5-6,5 100л - 1 п. ( с Н.Свержня)'),
(1, 5, 'Двина 100л - 2 п.\nТорф верховой кипованный рН 5,5-6,5 100л - 1 п. ( с Н.Свержня)');

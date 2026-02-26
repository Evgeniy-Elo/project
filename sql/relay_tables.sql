USE transfers;

-- Таблица устройств (ESP8266)
CREATE TABLE IF NOT EXISTS relay_devices (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    firmware_version VARCHAR(20),
    ip_address VARCHAR(15)
);

-- Таблица расписаний для реле
CREATE TABLE IF NOT EXISTS relay_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50),
    enabled BOOLEAN DEFAULT TRUE,
    channel INT NOT NULL CHECK (channel BETWEEN 0 AND 3),
    start_hour INT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
    start_minute INT NOT NULL CHECK (start_minute BETWEEN 0 AND 59),
    end_hour INT NOT NULL CHECK (end_hour BETWEEN 0 AND 23),
    end_minute INT NOT NULL CHECK (end_minute BETWEEN 0 AND 59),
    monday BOOLEAN DEFAULT TRUE,
    tuesday BOOLEAN DEFAULT TRUE,
    wednesday BOOLEAN DEFAULT TRUE,
    thursday BOOLEAN DEFAULT TRUE,
    friday BOOLEAN DEFAULT TRUE,
    saturday BOOLEAN DEFAULT TRUE,
    sunday BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES relay_devices(id) ON DELETE CASCADE,
    INDEX idx_device (device_id)
);

-- Таблица для логирования состояний реле (опционально)
CREATE TABLE IF NOT EXISTS relay_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50),
    channel INT,
    state BOOLEAN,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES relay_devices(id) ON DELETE CASCADE
);

UPDATE users SET roles = CONCAT(roles, ',relay') WHERE username = 'admin' AND roles NOT LIKE '%relay%';
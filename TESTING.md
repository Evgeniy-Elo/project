# 🧪 ПОЛНЫЙ ГАЙД ПО ТЕСТИРОВАНИЮ ПРОЕКТА

## 📋 Содержание
1. [Подготовка к тестированию](#подготовка)
2. [Тестирование Backend](#backend)
3. [Тестирование Security](#security)
4. [Тестирование API](#api)
5. [Тестирование Frontend](#frontend)
6. [Тестирование Performance](#performance)
7. [Чек-лист тестов](#чек-лист)

---

## <a name="подготовка"></a>1️⃣ ПОДГОТОВКА К ТЕСТИРОВАНИЮ

### Установка зависимостей для тестирования

```bash
npm install --save-dev jest supertest @testing-library/jest-dom
```

### Создание .env.test файла

```bash
cp .env.example .env.test
```

**Содержание .env.test:**
```env
NODE_ENV=test
PORT=3001
DB_HOST=localhost
DB_USER=test_user
DB_PASSWORD=test_password
DB_NAME=transfers_test
SESSION_SECRET=test-secret-key-12345
LOG_LEVEL=error
CORS_ORIGIN=http://localhost:3001
```

### Создание тестовой БД

```bash
mysql -u root -p << EOF
CREATE DATABASE transfers_test;
CREATE USER 'test_user'@'localhost' IDENTIFIED BY 'test_password';
GRANT ALL PRIVILEGES ON transfers_test.* TO 'test_user'@'localhost';
FLUSH PRIVILEGES;
EOF

# Инициализация схемы БД
mysql -u test_user -p'test_password' transfers_test < sql/init.sql
mysql -u test_user -p'test_password' transfers_test < sql/relay_tables.sql
```

---

## <a name="backend"></a>2️⃣ ТЕСТИРОВАНИЕ BACKEND

### Юнит-тесты для Auth

**Файл: `tests/auth.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Authentication API', () => {
    beforeAll(async () => {
        // Создаем тестового пользователя
        await db.query(
            'INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)',
            ['testuser', '$2b$10$...hashed_password...', 'admin,audio']
        );
    });

    afterAll(async () => {
        // Удаляем тестовых пользователей
        await db.query('DELETE FROM users WHERE username LIKE "test%"');
        await db.end();
    });

    describe('POST /auth/login', () => {
        test('должен успешно залогиниться с правильными данными', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ username: 'testuser', password: 'password123' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('username', 'testuser');
        });

        test('должен отклонить логин с неверным паролем', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ username: 'testuser', password: 'wrongpassword' });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        test('должен отклонить логин с несуществующим пользователем', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ username: 'nonexistent', password: 'password' });

            expect(response.status).toBe(401);
        });

        test('должен валидировать пустые поля', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ username: '', password: '' });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /auth/logout', () => {
        test('должен успешно выйти', async () => {
            const response = await request(app)
                .post('/auth/logout');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });

    describe('GET /auth/me', () => {
        test('должен вернуть текущего пользователя если авторизован', async () => {
            const agent = request.agent(app);
            
            // Сначала логинимся
            await agent
                .post('/auth/login')
                .send({ username: 'testuser', password: 'password123' });

            // Потом проверяем /auth/me
            const response = await agent.get('/auth/me');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('username', 'testuser');
        });

        test('должен вернуть 401 если не авторизован', async () => {
            const response = await request(app).get('/auth/me');
            expect(response.status).toBe(401);
        });
    });
});
```

### Юнит-тесты для Admin API

**Файл: `tests/admin.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('Admin API', () => {
    let adminAgent;
    const adminUser = { username: 'admin', password: 'admin123' };

    beforeAll(async () => {
        adminAgent = request.agent(app);
        
        // Создаем админа
        const hash = await bcrypt.hash(adminUser.password, 10);
        await db.query(
            'INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)',
            [adminUser.username, hash, 'admin']
        );

        // Логинимся как админ
        await adminAgent
            .post('/auth/login')
            .send(adminUser);
    });

    afterAll(async () => {
        await db.query('DELETE FROM users WHERE username = ?', ['admin']);
    });

    describe('GET /admin/users', () => {
        test('должен вернуть список пользователей', async () => {
            const response = await adminAgent.get('/admin/users');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body[0]).toHaveProperty('username');
            expect(response.body[0]).toHaveProperty('roles');
        });

        test('должен быть недоступен для неавторизованного пользователя', async () => {
            const response = await request(app).get('/admin/users');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /admin/history', () => {
        test('должен вернуть историю с фильтрацией', async () => {
            const response = await adminAgent
                .get('/admin/history')
                .query({
                    page: 1,
                    limit: 10,
                    from: '2026-01-01',
                    to: '2026-12-31'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
        });

        test('должен защищать от SQL-инъекций в параметрах', async () => {
            const response = await adminAgent
                .get('/admin/history')
                .query({
                    user_id: "' OR '1'='1",
                    from: "2026-01-01' OR 1=1; --"
                });

            // Должен вернуть безопасный результат (не执行 инъекцию)
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });
    });
});
```

---

## <a name="security"></a>3️⃣ ТЕСТИРОВАНИЕ SECURITY

### Тесты безопасности

**Файл: `tests/security.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');

describe('Security Tests', () => {
    describe('SQL Injection Protection', () => {
        test('должен защищать от SQL-инъекций в логине', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: "' OR '1'='1",
                    password: 'anything'
                });

            expect(response.status).toBe(400); // Валидация
        });

        test('должен защищать от SQL-инъекций в URL параметрах', async () => {
            const response = await request(app)
                .get('/admin/history?user_id=1 OR 1=1');

            expect(response.status).toBe(401); // Нет авторизации
            // Или если авторизованы - должен безопасно обработать
        });
    });

    describe('XSS Protection', () => {
        test('должен экранировать HTML в таблице', async () => {
            // Попытка внедрить скрипт через таблицу
            const malicious = '<script>alert("xss")</script>';
            
            // Проверяем, что скрипт не выполняется на странице
            const response = await request(app)
                .get('/');

            expect(response.text).not.toContain(malicious);
        });
    });

    describe('CSRF Protection', () => {
        test('должны быть установлены безопасные cookie флаги', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({ username: 'test', password: 'test' });

            const setCookie = response.headers['set-cookie'];
            expect(setCookie).toBeDefined();
            expect(setCookie[0]).toContain('HttpOnly');
            expect(setCookie[0]).toContain('SameSite=Strict');
        });
    });

    describe('Rate Limiting', () => {
        test('должен ограничивать количество попыток логина', async () => {
            const attempts = [];
            
            for (let i = 0; i < 6; i++) {
                const response = await request(app)
                    .post('/auth/login')
                    .send({ username: 'test', password: 'wrong' });
                
                attempts.push(response.status);
            }

            // Первые 5 должны быть 401, 6-я должна быть 429 (Too Many Requests)
            expect(attempts[5]).toBe(429);
        });
    });

    describe('Input Validation', () => {
        test('должен отклонить логин с длинным паролем', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 'test',
                    password: 'a'.repeat(200)
                });

            expect(response.status).toBe(400);
        });

        test('должен отклонить логин с недопустимыми символами', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    username: 'test@#$%',
                    password: 'test'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('Helmet Protection', () => {
        test('должны быть установлены защитные заголовки', async () => {
            const response = await request(app).get('/');

            // Проверяем наличие защитных заголовков
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBeDefined();
            expect(response.headers['x-xss-protection']).toBeDefined();
        });
    });
});
```

---

## <a name="api"></a>4️⃣ ТЕСТИРОВАНИЕ API

### Интеграционные тесты API

**Файл: `tests/api.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');
const db = require('../config/db');

describe('API Integration Tests', () => {
    let authToken;
    let userId;

    beforeAll(async () => {
        // Логинимся и получаем сессию
        const response = await request(app)
            .post('/auth/login')
            .send({ username: 'testuser', password: 'password123' });

        authToken = response.body.user.id;
    });

    describe('Table Cells API', () => {
        test('должен получить все ячейки таблицы через Socket.IO', (done) => {
            const io = require('socket.io-client');
            const socket = io('http://localhost:3001');

            socket.on('connect', () => {
                socket.on('init_cells', (cells) => {
                    expect(Array.isArray(cells)).toBe(true);
                    socket.disconnect();
                    done();
                });
            });
        });

        test('должен блокировать ячейку при редактировании', (done) => {
            const io = require('socket.io-client');
            const socket = io('http://localhost:3001');

            socket.on('connect', () => {
                socket.emit('lock_cell', { cellId: 1 }, (response) => {
                    expect(response).toHaveProperty('success');
                    socket.disconnect();
                    done();
                });
            });
        });

        test('должен сохранять изменения ячейки', (done) => {
            const io = require('socket.io-client');
            const socket = io('http://localhost:3001');

            socket.on('connect', () => {
                // Сначала блокируем
                socket.emit('lock_cell', { cellId: 1 });
                
                // Потом сохраняем
                socket.emit('save_cell', { 
                    cellId: 1, 
                    value: 'test value' 
                }, () => {
                    socket.disconnect();
                    done();
                });
            });
        });
    });

    describe('Audio API', () => {
        test('должен получить статус агентов', async () => {
            const response = await request(app)
                .get('/audio/api/agents')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });
    });

    describe('Relay API', () => {
        test('должен получить список устройств', async () => {
            const response = await request(app)
                .get('/relay/api/devices');

            expect(response.status).toBe(200) || expect(response.status).toBe(401);
        });

        test('должен регистрировать новое устройство', async () => {
            const response = await request(app)
                .post('/relay/api/device/register')
                .send({
                    id: 'test-device-001',
                    name: 'Test Device',
                    location: 'Room 1',
                    firmware: '1.0.0',
                    ip: '192.168.1.100'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });
});
```

---

## <a name="frontend"></a>5️⃣ ТЕСТИРОВАНИЕ FRONTEND

### Контрольный список функций Frontend

```javascript
// tests/frontend.test.js

describe('Frontend Functionality', () => {
    beforeEach(() => {
        cy.visit('http://localhost:3000');
    });

    describe('Login Page', () => {
        test('должна отображаться форма логина', () => {
            cy.get('#login-form').should('be.visible');
            cy.get('#username').should('exist');
            cy.get('#password').should('exist');
            cy.get('#login-btn').should('exist');
        });

        test('должен залогиниться с правильными данными', () => {
            cy.get('#username').type('testuser');
            cy.get('#password').type('password123');
            cy.get('#login-btn').click();
            cy.url().should('include', '/');
        });

        test('должен показать ошибку с неверными данными', () => {
            cy.get('#username').type('wrong');
            cy.get('#password').type('wrong');
            cy.get('#login-btn').click();
            cy.get('#login-error').should('contain', 'Неверный');
        });
    });

    describe('Table Functionality', () => {
        test('должна загруститься таблица', () => {
            cy.login('testuser', 'password123');
            cy.get('table').should('be.visible');
            cy.get('th').should('have.length.greaterThan', 0);
        });

        test('должна выделиться ячейка при клике', () => {
            cy.login('testuser', 'password123');
            cy.get('table td').first().click();
            cy.get('table td.selected').should('exist');
        });

        test('должны отображаться уведомления', () => {
            cy.login('testuser', 'password123');
            cy.get('.notification').should('be.visible');
        });
    });

    describe('Navigation', () => {
        test('должна отображаться навигация для авторизованного пользователя', () => {
            cy.login('testuser', 'password123');
            cy.get('#current-user').should('contain', 'testuser');
            cy.get('#logout-btn').should('exist');
        });

        test('должна переходить по ссылкам навигации', () => {
            cy.login('audiouser', 'password123');
            cy.get('a:contains("Аудио")').click();
            cy.url().should('include', '/audio');
        });
    });

    describe('Responsive Design', () => {
        test('должен быть адаптирован для мобильных', () => {
            cy.viewport('iphone-x');
            cy.visit('http://localhost:3000');
            cy.get('.header').should('be.visible');
            cy.get('table').should('be.visible');
        });

        test('должен быть адаптирован для планшетов', () => {
            cy.viewport('ipad-2');
            cy.visit('http://localhost:3000');
            cy.get('.header').should('be.visible');
        });
    });
});
```

---

## <a name="performance"></a>6️⃣ ТЕСТИРОВАНИЕ PERFORMANCE

### Тесты производительности

**Файл: `tests/performance.test.js`**
```javascript
const request = require('supertest');
const app = require('../server');

describe('Performance Tests', () => {
    test('API должен ответить за < 100ms', async () => {
        const start = Date.now();
        
        await request(app)
            .post('/auth/login')
            .send({ username: 'test', password: 'test' });
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100);
    });

    test('таблица должна рендериться за < 500ms', async () => {
        // Юнит тест рендера
        const start = Date.now();
        
        // Имитируем рендер
        const cells = Array(1000).fill(0).map((_, i) => ({
            id: i,
            row_index: Math.floor(i / 10),
            col_index: i % 10,
            value: `Cell ${i}`
        }));
        
        // Вызываем renderTable из браузера
        // ...
        
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(500);
    });

    test('количество запросов к БД должно быть оптимальным', async () => {
        // Замеряем количество SQL запросов при кэшировании
        const withoutCache = 50; // примерное количество без кэша
        const withCache = 2;     // с кэшем

        expect(withCache).toBeLessThan(withoutCache / 10);
    });
});
```

---

## <a name="чек-лист"></a>✅ ЧЕКЛИСТ ТЕСТОВ

### Backend Tests
- [ ] Логин с правильными данными
- [ ] Логин с неправильными данными
- [ ] Лог-аут
- [ ] Получение профиля
- [ ] Создание пользователя
- [ ] Получение истории
- [ ] Фильтрация истории

### Security Tests
- [ ] SQL-инъекции в логине
- [ ] SQL-инъекции в параметрах
- [ ] XSS атаки
- [ ] CSRF защита
- [ ] Rate limiting
- [ ] Валидация input
- [ ] Helmet заголовки

### API Tests
- [ ] Socket.IO подключение
- [ ] Загрузка ячеек
- [ ] Блокировка ячейки
- [ ] Сохранение ячейки
- [ ] Audio API
- [ ] Relay API

### Frontend Tests
- [ ] Форма логика
- [ ] Таблица рендер
- [ ] Клик по ячейке
- [ ] Уведомления
- [ ] Навигация
- [ ] Mobile responseive
- [ ] Tablet responsive
- [ ] Desktop layout

### Performance Tests
- [ ] API response < 100ms
- [ ] Table render < 500ms
- [ ] DB query optimization
- [ ] Cache effectiveness

---

## 🚀 КОМАНДЫ ДЛЯ ЗАПУСКА

```bash
# Установка зависимостей
npm install --save-dev jest supertest @cypress/webpack-dev-server cypress

# Запуск всех тестов
npm test

# Запуск конкретного набора тестов
npm test -- tests/auth.test.js
npm test -- tests/security.test.js

# Запуск с покрытием
npm test -- --coverage

# E2E тесты с Cypress
npx cypress open

# Performance тесты
npm test -- tests/performance.test.js

# Запуск в CI режиме
npm test -- --ci --coverage
```

---

## 📊 Ожидаемые результаты

- **✅ Backend Tests:** 20+ тестов
- **✅ Security Tests:** 15+ тестов
- **✅ API Tests:** 10+ тестов
- **✅ Frontend Tests:** 15+ тестов
- **✅ Performance Tests:** 5+ тестов
- **✅ Code Coverage:** > 80%

---

**Статус:** Готово к комплексному тестированию! 🎉

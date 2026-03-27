const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true
});

// При инициализации пула установить charset
pool.getConnection().then(conn => {
    conn.query('SET NAMES utf8mb4');
    conn.release();
}).catch(err => {
    console.error('Error setting initial charset:', err.message);
});

module.exports = pool;
const NodeCache = require('node-cache');
const logger = require('./logger');

// Кэш на 10 минут по умолчанию
const cache = new NodeCache({ stdTTL: 600, checkperiod: 60 });

// Логирование событий кэша
cache.on('del', (key) => {
    logger.debug(`Cache key deleted: ${key}`);
});

module.exports = cache;

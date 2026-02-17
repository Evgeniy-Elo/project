const authMiddleware = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    req.user = req.session.user;
    next();
};

const adminMiddleware = (req, res, next) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
};

const hasRole = (role) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        const roles = req.session.user.roles || [];
        if (!roles.includes(role)) {
            return res.status(403).json({ error: `Требуется роль ${role}` });
        }
        next();
    };
};

const requireAnyRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        const userRoles = req.session.user.roles || [];
        const hasAccess = allowedRoles.some(role => userRoles.includes(role));
        if (!hasAccess) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        next();
    };
};

module.exports = { authMiddleware, adminMiddleware, hasRole, requireAnyRole };
const socket = io();

// Уведомления
function showNotification(message, type = 'info', duration = 3000) {
    const notif = document.createElement('div');
    notif.className = `notification notification-${type}`;
    notif.textContent = message;  // Текстовое содержимое - безопаснее
    const icon = notif.querySelector('i') || document.createElement('i');
    const iconClass = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
    icon.className = `fas fa-${iconClass}`;
    notif.insertBefore(icon, notif.firstChild);
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, duration);
}

socket.on('connect', () => {
    console.log('Connected to server');
    // Не показываем уведомление при обычном подключении
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    showNotification('Подключено к серверу', 'success', 2000);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showNotification('Отключено от сервера', 'error', 5000);
});

socket.on('init_cells', (cells) => {
    console.log('Initializing cells:', cells.length);
    window.renderTable(cells);
});

socket.on('cell_updated', ({ cellId, value, username }) => {
    console.log(`Cell ${cellId} updated by ${username}`);
    window.updateCellInUI(cellId, value);
});

socket.on('cell_locked', ({ cellId, username }) => {
    console.log(`Cell ${cellId} locked by ${username}`);
    window.markCellLocked(cellId, username);
});

socket.on('cell_unlocked', ({ cellId }) => {
    console.log(`Cell ${cellId} unlocked`);
    window.markCellUnlocked(cellId);
});

socket.on('lock_denied', ({ cellId, holder }) => {
    console.log(`Lock denied for ${cellId}, held by ${holder}`);
    showNotification(`Ячейка уже редактируется пользователем ${holder}`, 'error', 3000);
});

socket.on('save_denied', ({ cellId, reason }) => {
    console.log(`Save denied: ${reason}`);
    showNotification(`Ошибка сохранения: ${reason}`, 'error', 3000);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    // Показываем ошибку только если пользователь авторизован
    if (document.getElementById('login-form').classList.contains('active') === false) {
        showNotification(`Ошибка: ${error}`, 'error', 5000);
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    // Показываем ошибку подключения только если пользователь авторизован
    if (document.getElementById('login-form').classList.contains('active') === false) {
        showNotification('Ошибка подключения к серверу', 'error', 5000);
    }
});
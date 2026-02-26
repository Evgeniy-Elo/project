let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    if (!currentUser?.is_admin) {
        alert('Доступ запрещён');
        window.location.href = '/';
        return;
    }
    setupNavigation();
    setupTabs();
    loadUsers();
    loadHistoryFilters();

    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('apply-filters').addEventListener('click', loadHistory);
    document.getElementById('add-user-form').addEventListener('submit', addUser);
});

async function loadUser() {
    const res = await fetch('/auth/me');
    if (res.ok) {
        currentUser = await res.json();
        document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
    } else {
        window.location.href = '/';
    }
}

function setupNavigation() {
    const navLinks = document.getElementById('nav-links');
    navLinks.innerHTML = '';

    // Кнопка "К таблице" (доступна всем)
    navLinks.innerHTML += `
        <a href="/" class="nav-btn">
            <i class="fas fa-table"></i> К таблице
        </a>
    `;

    // Кнопка "Аудио" (если есть роль audio)
    if (currentUser?.roles?.includes('audio')) {
        navLinks.innerHTML += `
            <a href="/audio" class="nav-btn">
                <i class="fas fa-microphone"></i> Аудио
            </a>
        `;
    }

    // Кнопка "Реле" (если есть роль relay)
    if (currentUser?.roles?.includes('relay')) {
        navLinks.innerHTML += `
            <a href="/relay" class="nav-btn">
                <i class="fas fa-lightbulb"></i> Реле
            </a>
        `;
    }
}

function logout() {
    fetch('/auth/logout', { method: 'POST' }).then(() => {
        window.location.href = '/';
    });
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
            if (btn.dataset.tab === 'history') loadHistory();
        });
    });
}

// ---------- Управление пользователями ----------
async function loadUsers() {
    try {
        const res = await fetch('/admin/users');
        const users = await res.json();
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';

        users.forEach(u => {
            const roles = u.roles ? u.roles.split(',').filter(r => r.trim()) : [];

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge" style="background: #e8f0fe;">#${u.id}</span></td>
                <td><i class="fas fa-user" style="color: var(--primary-color); margin-right: 8px;"></i>${escapeHtml(u.username)}</td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        ${roles.map(role => `
                            <span class="badge ${getRoleBadgeClass(role)}">
                                <i class="fas ${getRoleIcon(role)}"></i> ${role}
                            </span>
                        `).join('')}
                    </div>
                </td>
                <td><i class="fas fa-calendar" style="color: var(--text-secondary); margin-right: 5px;"></i>${new Date(u.created_at).toLocaleString()}</td>
                <td>
                    <button class="btn btn-outline change-password" data-id="${u.id}" style="padding: 4px 12px;">
                        <i class="fas fa-key"></i> Сменить пароль
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.change-password').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.currentTarget.dataset.id;
                const newPass = prompt('Введите новый пароль:');
                if (newPass) {
                    try {
                        await fetch(`/admin/users/${userId}/password`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password: newPass })
                        });
                        showNotification('Пароль успешно изменён', 'success');
                    } catch (error) {
                        showNotification('Ошибка при изменении пароля', 'error');
                    }
                }
            });
        });
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Ошибка загрузки пользователей', 'error');
    }
}

function getRoleBadgeClass(role) {
    switch(role) {
        case 'admin': return 'badge recording';
        case 'audio': return 'badge info';
        case 'relay': return 'badge success';
        default: return 'badge stopped';
    }
}

function getRoleIcon(role) {
    switch(role) {
        case 'admin': return 'fa-shield-alt';
        case 'audio': return 'fa-microphone';
        case 'relay': return 'fa-lightbulb';
        default: return 'fa-eye';
    }
}

async function addUser(e) {
    e.preventDefault();

    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const roles = Array.from(document.querySelectorAll('input[name="roles"]:checked')).map(cb => cb.value);

    if (!username || !password) {
        showNotification('Заполните все поля', 'error');
        return;
    }

    try {
        const res = await fetch('/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, roles })
        });

        if (res.ok) {
            showNotification('Пользователь успешно добавлен', 'success');
            loadUsers();
            e.target.reset();
            loadHistoryFilters(); // Обновляем фильтры
        } else {
            const err = await res.json();
            showNotification(err.error || 'Ошибка при добавлении', 'error');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        showNotification('Ошибка при добавлении пользователя', 'error');
    }
}

// ---------- История ----------
async function loadHistoryFilters() {
    try {
        const res = await fetch('/admin/users');
        const users = await res.json();
        const select = document.getElementById('filter-user');
        select.innerHTML = '<option value="">Все пользователи</option>';

        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.username;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Error loading history filters:', error);
    }
}

async function loadHistory() {
    const userId = document.getElementById('filter-user').value;
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;

    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    try {
        const res = await fetch(`/admin/history?${params.toString()}`);
        if (!res.ok) {
            throw new Error('Ошибка загрузки истории');
        }

        const history = await res.json();
        const tbody = document.querySelector('#history-table tbody');
        tbody.innerHTML = '';

        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <i class="fas fa-inbox" style="font-size: 2em; margin-bottom: 10px; display: block;"></i>
                        Нет записей истории
                    </td>
                </tr>
            `;
            return;
        }

        history.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><i class="fas fa-clock" style="color: var(--text-secondary); margin-right: 5px;"></i>${new Date(h.changed_at).toLocaleString()}</td>
                <td><i class="fas fa-user" style="color: var(--primary-color); margin-right: 5px;"></i>${escapeHtml(h.username)}</td>
                <td><span class="badge info">${h.row_index}</span></td>
                <td><span class="badge info">${h.col_index}</span></td>
                <td class="history-cell" title="${escapeHtml(h.old_value)}">
                    <div style="max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(truncateText(h.old_value, 50))}
                    </div>
                </td>
                <td class="history-cell" title="${escapeHtml(h.new_value)}">
                    <div style="max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(truncateText(h.new_value, 50))}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error loading history:', error);
        showNotification('Ошибка при загрузке истории', 'error');
    }
}

// ---------- Вспомогательные функции ----------
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
}

function showNotification(message, type = 'info') {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;

    // Стили для уведомления
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'};
        color: white;
        border-radius: 8px;
        box-shadow: var(--shadow);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Добавляем анимации
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .role-label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: white;
        border: 1px solid var(--border-color);
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .role-label:hover {
        background: var(--bg-light);
        border-color: var(--primary-color);
    }
    
    .role-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
    
    .role-label i {
        color: var(--primary-color);
    }
`;
document.head.appendChild(style);
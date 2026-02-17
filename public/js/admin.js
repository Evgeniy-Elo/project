let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    if (!currentUser?.roles?.includes('admin')) {
        window.location.href = '/';
        return;
    }
    setupTabs();
    loadUsers();
    loadHistoryFilters();
    document.getElementById('apply-filters').addEventListener('click', loadHistory);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('audio-btn').addEventListener('click', () => {
        window.location.href = '/audio';
    });
});

async function loadUser() {
    const res = await fetch('/auth/me');
    if (res.ok) {
        currentUser = await res.json();
        document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        if (currentUser.roles && currentUser.roles.includes('audio')) {
            document.getElementById('audio-btn').style.display = 'inline-flex';
        }
    } else {
        window.location.href = '/';
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

async function loadUsers() {
    const res = await fetch('/admin/users');
    const users = await res.json();
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td>${u.roles || ''}</td>
            <td>${new Date(u.created_at).toLocaleString()}</td>
            <td>
                <button class="change-password" data-id="${u.id}">Сменить пароль</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.change-password').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.target.dataset.id;
            const newPass = prompt('Введите новый пароль:');
            if (newPass) {
                await fetch(`/admin/users/${userId}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: newPass })
                });
                alert('Пароль изменён');
            }
        });
    });
}

document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;
    const roles = Array.from(document.querySelectorAll('input[name="roles"]:checked')).map(cb => cb.value);
    const res = await fetch('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, roles })
    });
    if (res.ok) {
        alert('Пользователь добавлен');
        loadUsers();
        e.target.reset();
    } else {
        const err = await res.json();
        alert(err.error || 'Ошибка');
    }
});

async function loadHistoryFilters() {
    const res = await fetch('/admin/users');
    const users = await res.json();
    const select = document.getElementById('filter-user');
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.username;
        select.appendChild(opt);
    });
}

async function loadHistory() {
    const userId = document.getElementById('filter-user').value;
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    const res = await fetch(`/admin/history?${params.toString()}`);
    const history = await res.json();
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = '';
    history.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(h.changed_at).toLocaleString()}</td>
            <td>${h.username}</td>
            <td>${h.row_index}</td>
            <td>${h.col_index}</td>
            <td class="history-cell" title="${escapeHtml(h.old_value)}">${escapeHtml(h.old_value.substring(0, 50))}${h.old_value.length > 50 ? '…' : ''}</td>
            <td class="history-cell" title="${escapeHtml(h.new_value)}">${escapeHtml(h.new_value.substring(0, 50))}${h.new_value.length > 50 ? '…' : ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
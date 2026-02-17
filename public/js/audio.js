let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    if (currentUser) {
        document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        if (currentUser.roles && currentUser.roles.includes('admin')) {
            document.getElementById('admin-link').style.display = 'inline-block';
        } else {
            document.getElementById('admin-link').style.display = 'none';
        }
        loadAgents();
    }
    document.getElementById('logout-btn').addEventListener('click', logout);
});

async function loadUser() {
    const res = await fetch('/auth/me');
    if (res.ok) {
        currentUser = await res.json();
        // Если у пользователя нет роли audio – редирект на главную
        if (!currentUser.roles || !currentUser.roles.includes('audio')) {
            window.location.href = '/';
            return;
        }
        document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        if (currentUser.roles.includes('admin')) {
            document.getElementById('admin-link').style.display = 'inline-flex';
        } else {
            document.getElementById('admin-link').style.display = 'none';
        }
        loadAgents();
    } else if (res.status === 401) {
        window.location.href = '/';
    }
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/';
}

async function loadAgents() {
    const container = document.getElementById('agents-container');
    container.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const res = await fetch('/audio/api/agents');
        const agents = await res.json();
        container.innerHTML = '';
        agents.forEach(agent => renderAgentCard(agent, container));
    } catch (err) {
        container.innerHTML = '<div class="error">Ошибка загрузки данных</div>';
    }
}

function renderAgentCard(agent, container) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.dataset.ip = agent.ip;

    const statusClass = agent.status.status === 'recording' ? 'recording' : (agent.status.status === 'stopped' ? 'stopped' : 'offline');
    const statusText = agent.status.status === 'recording' ? 'ЗАПИСЬ' : (agent.status.status === 'stopped' ? 'ОСТАНОВЛЕНО' : 'НЕ В СЕТИ');

    let alertHtml = '';
    if (agent.alert) {
        alertHtml = `<div class="alert"><i class="fas fa-exclamation-triangle"></i> ${agent.alert}</div>`;
    }

    let actionButtons = '';
    if (currentUser.is_admin && agent.status.status !== 'offline') {
        actionButtons = `
            <div class="action-buttons">
                <button class="btn btn-success start-btn"><i class="fas fa-play"></i> Старт</button>
                <button class="btn btn-secondary stop-btn"><i class="fas fa-stop"></i> Стоп</button>
            </div>
        `;
    }

    // Список файлов
    let filesHtml = '<div class="files-list">';
    agent.files.forEach(file => {
        filesHtml += `
            <div class="file-item">
                <input type="checkbox" class="file-checkbox" value="${file}" data-ip="${agent.ip}">
                <span>${file}</span>
                <button class="play-btn" data-ip="${agent.ip}" data-file="${file}"><i class="fas fa-play"></i></button>
            </div>
        `;
    });
    filesHtml += '</div>';

    // Кнопка удаления выбранных (только для админа)
    let deleteBtn = '';
    if (currentUser.is_admin && agent.status.status !== 'offline') {
        deleteBtn = `<button class="btn btn-outline delete-selected-btn" data-ip="${agent.ip}"><i class="fas fa-trash"></i> Удалить выбранные</button>`;
    }

    // Форма очистки (админ)
    let cleanupForm = '';
    if (currentUser.is_admin && agent.status.status !== 'offline') {
        cleanupForm = `
            <div class="cleanup-form">
                <input type="number" class="cleanup-days" value="30" min="1">
                <button class="btn btn-primary cleanup-btn" data-ip="${agent.ip}"><i class="fas fa-broom"></i> Очистить старше</button>
            </div>
        `;
    }

    card.innerHTML = `
        <h3>${agent.name} — ${agent.ip}</h3>
        <div class="badge ${statusClass}">${statusText}</div>
        ${alertHtml}
        <p><i class="fas fa-folder"></i> Папка: ${agent.status.path || '—'}</p>
        ${actionButtons}
        <h4>Файлы:</h4>
        ${filesHtml}
        ${deleteBtn}
        <audio id="player-${agent.ip.replace(/\./g,'-')}" controls></audio>
        ${cleanupForm}
    `;

    container.appendChild(card);

    // Обработчики событий
    if (currentUser.is_admin && agent.status.status !== 'offline') {
        card.querySelector('.start-btn')?.addEventListener('click', () => sendCommand(agent.ip, 'start'));
        card.querySelector('.stop-btn')?.addEventListener('click', () => sendCommand(agent.ip, 'stop'));
        card.querySelector('.delete-selected-btn')?.addEventListener('click', () => deleteSelected(agent.ip));
        card.querySelector('.cleanup-btn')?.addEventListener('click', (e) => {
            const days = card.querySelector('.cleanup-days').value;
            cleanup(agent.ip, days);
        });
    }

    card.querySelectorAll('.play-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const ip = e.currentTarget.dataset.ip;
            const file = e.currentTarget.dataset.file;
            playAudio(ip, file);
        });
    });
}

async function sendCommand(ip, command) {
    try {
        await fetch(`/audio/api/agents/${ip}/${command}`, { method: 'POST' });
        loadAgents(); // обновить данные
    } catch (err) {
        alert('Ошибка при выполнении команды');
    }
}

async function deleteSelected(ip) {
    const checkboxes = document.querySelectorAll(`.file-checkbox[data-ip="${ip}"]:checked`);
    const files = Array.from(checkboxes).map(cb => cb.value);
    if (files.length === 0) {
        alert('Выберите файлы для удаления');
        return;
    }
    if (!confirm(`Удалить ${files.length} файлов?`)) return;

    try {
        const res = await fetch(`/audio/api/agents/${ip}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
        });
        const result = await res.json();
        alert(`Удалено: ${result.deleted?.length || 0}, ошибок: ${result.not_found_or_error?.length || 0}`);
        loadAgents();
    } catch (err) {
        alert('Ошибка при удалении');
    }
}

async function cleanup(ip, days) {
    try {
        const res = await fetch(`/audio/api/agents/${ip}/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days: parseInt(days) })
        });
        const result = await res.json();
        alert(`Удалено файлов: ${result.deleted_count || 0}`);
        loadAgents();
    } catch (err) {
        alert('Ошибка при очистке');
    }
}

function playAudio(ip, file) {
    const playerId = `player-${ip.replace(/\./g,'-')}`;
    const player = document.getElementById(playerId);
    player.src = `/audio/api/agents/${ip}/records/${encodeURIComponent(file)}`;
    player.play();
}
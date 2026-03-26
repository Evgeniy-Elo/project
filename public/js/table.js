// Состояние приложения
let currentUser = null;
let selectedCellId = null;
let editingCellId = null;
let cellsData = [];
let lockedCells = {};
let renderedCells = new Map(); // Кэш отрендеренных ячеек

let statusBar;

// Константы для virtual scrolling
const ROWS_PER_VIEW = 20;
const COLS_PER_VIEW = 10;

// Функция для показа уведомлений
function showNotification(message, type = 'info', duration = 3000) {
    const notif = document.createElement('div');
    notif.className = `notification notification-${type}`;
    const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
    notif.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, duration);
}

document.addEventListener('DOMContentLoaded', async () => {
    statusBar = document.getElementById('status-bar');
    await loadUser();
    setupEventListeners();
});

async function loadUser() {
    try {
        const res = await fetch('/auth/me');
        if (res.ok) {
            currentUser = await res.json();
            document.getElementById('login-form').classList.remove('active');
            document.getElementById('main-content').style.display = 'block';
            document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
            setupNavigation();
        } else {
            document.getElementById('login-form').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading user:', error);
        document.getElementById('login-error').textContent = 'Ошибка при загрузке профиля';
        document.getElementById('login-form').classList.add('active');
    }
}

function setupNavigation() {
    const navLinks = document.getElementById('nav-links');
    navLinks.innerHTML = '';

    if (currentUser?.roles?.includes('audio')) {
        navLinks.innerHTML += `
            <a href="/audio" class="nav-btn">
                <i class="fas fa-microphone"></i> Аудио
            </a>
        `;
    }

    if (currentUser?.roles?.includes('relay')) {
        navLinks.innerHTML += `
            <a href="/relay" class="nav-btn">
                <i class="fas fa-lightbulb"></i> Реле
            </a>
        `;
    }

    if (currentUser?.roles?.includes('admin')) {
        navLinks.innerHTML += `
            <a href="/admin.html" class="nav-btn">
                <i class="fas fa-cog"></i> Админка
            </a>
        `;
    }
}

function setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Ввод через Enter на поле пароля
    document.getElementById('password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });

    // Глобальные клавиши для навигации
    document.addEventListener('keydown', handleGlobalKeys);
}

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    
    if (!username || !password) {
        errorEl.textContent = 'Пожалуйста, заполните оба поля';
        return;
    }

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            window.location.href = data.redirectTo || '/';
        } else {
            errorEl.textContent = data.error || 'Ошибка входа';
            showNotification(data.error || 'Ошибка входа', 'error');
        }
    } catch (error) {
        errorEl.textContent = 'Ошибка подключения к серверу';
        showNotification('Ошибка подключения к серверу', 'error');
        console.error('Login error:', error);
    }
}

async function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        try {
            await fetch('/auth/logout', { method: 'POST' });
            showNotification('Вы вышли из системы', 'success', 1500);
            setTimeout(() => location.reload(), 1500);
        } catch (error) {
            console.error('Logout error:', error);
            showNotification('Ошибка при выходе', 'error');
        }
    }
}

// ... остальной код table.js без изменений ...

// Рендер таблицы (оптимизированный вариант)
window.renderTable = function(cells) {
    cellsData = cells;
    const container = document.getElementById('table-container');

    // Разделяем на заголовок (row 0) и тело
    const headerCells = cells.filter(c => c.row_index === 0).sort((a,b) => a.col_index - b.col_index);
    const bodyCells = cells.filter(c => c.row_index > 0);

    // Группируем тело по row_index
    const rowsMap = new Map();
    bodyCells.forEach(cell => {
        if (!rowsMap.has(cell.row_index)) rowsMap.set(cell.row_index, []);
        rowsMap.get(cell.row_index).push(cell);
    });

    const sortedRows = Array.from(rowsMap.keys()).sort((a,b) => a - b);

    // Используем DocumentFragment для более быстрого DOM манипулирования
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    
    // Создаем заголовок
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let cell of headerCells) {
        const th = document.createElement('th');
        th.setAttribute('data-cell-id', cell.id);
        th.textContent = escapeHtml(cell.value);
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Создаем тело таблицы
    const tbody = document.createElement('tbody');
    for (let r of sortedRows) {
        const row = document.createElement('tr');
        const rowCells = rowsMap.get(r).sort((a,b) => a.col_index - b.col_index);
        for (let cell of rowCells) {
            const td = document.createElement('td');
            td.className = 'cell';
            td.setAttribute('data-cell-id', cell.id);
            td.setAttribute('data-row', cell.row_index);
            td.setAttribute('data-col', cell.col_index);
            
            const lockedBy = lockedCells[cell.id];
            if (lockedBy) {
                td.classList.add('locked');
                const lockInfo = document.createElement('div');
                lockInfo.className = 'lock-info';
                lockInfo.innerHTML = `<i class="fas fa-lock"></i> ${escapeHtml(lockedBy)}`;
                td.appendChild(lockInfo);
            }
            
            td.appendChild(document.createTextNode(escapeHtml(cell.value)));
            row.appendChild(td);
        }
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    fragment.appendChild(table);
    
    container.innerHTML = '';
    container.appendChild(fragment);

    // Добавляем обработчики событий (используем event delegation)
    const tableElement = container.querySelector('table');
    tableElement.addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (cell) {
            onCellClick(cell.dataset.cellId);
        }
    });
    
    tableElement.addEventListener('dblclick', (e) => {
        const cell = e.target.closest('.cell');
        if (cell) {
            onCellDblClick(cell.dataset.cellId);
        }
    });
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Клик по ячейке
function onCellClick(cellId) {
    // Если мы уже редактируем другую ячейку, сначала завершим редактирование
    if (editingCellId && editingCellId !== cellId) {
        finishEditing(); // автосохранение при переходе
    }
    selectCell(cellId);
}

// Двойной клик — начать редактирование (если ещё не начали)
function onCellDblClick(cellId) {
    if (editingCellId) return;
    startEdit(cellId);
}

// Выделить ячейку (без блокировки)
function selectCell(cellId) {
    if (selectedCellId === cellId) return;
    // Снять выделение с предыдущей
    if (selectedCellId) {
        const prevTd = document.querySelector(`.cell[data-cell-id="${selectedCellId}"]`);
        if (prevTd) prevTd.classList.remove('selected');
    }
    selectedCellId = cellId;
    const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
    if (td) td.classList.add('selected');

    // Если ячейка заблокирована другим, показываем статус
    if (lockedCells[cellId]) {
        statusBar.innerHTML = `<i class="fas fa-lock" style="color: #d93025;"></i> Ячейка редактируется пользователем ${lockedCells[cellId]}`;
    } else {
        statusBar.innerHTML = '';
    }
}

// Начать редактирование (запросить блокировку)
function startEdit(cellId) {
    if (editingCellId) return;
    if (lockedCells[cellId]) {
        alert(`Ячейка уже редактируется пользователем ${lockedCells[cellId]}`);
        return;
    }
    // Запрашиваем блокировку
    socket.emit('lock_cell', { cellId });
}

// Завершить редактирование (сохранить, если были изменения)
function finishEditing() {
    if (!editingCellId) return;
    const td = document.querySelector(`.cell[data-cell-id="${editingCellId}"]`);
    const textarea = td?.querySelector('textarea');
    if (textarea) {
        const newValue = textarea.value;
        const cell = cellsData.find(c => c.id == editingCellId);
        if (cell.value !== newValue) {
            socket.emit('save_cell', { cellId: editingCellId, value: newValue });
        } else {
            // Без изменений — просто снимаем блокировку
            socket.emit('unlock_cell', { cellId: editingCellId });
        }
    } else {
        // На всякий случай снимаем блокировку
        socket.emit('unlock_cell', { cellId: editingCellId });
    }
}

// Обработчик ответа на блокировку (приходит из socket.js)
window.startEditing = function(cellId) {
    editingCellId = cellId;
    // Выделяем эту ячейку (если ещё не выделена)
    if (selectedCellId !== cellId) selectCell(cellId);

    // Заменяем содержимое ячейки на textarea
    const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
    const currentValue = cellsData.find(c => c.id == cellId).value;
    td.innerHTML = `<textarea class="cell-editor" data-cell-id="${cellId}">${escapeHtml(currentValue)}</textarea>`;
    td.classList.add('editing');
    const textarea = td.querySelector('textarea');
    textarea.focus();
    textarea.select();

    // Обработчики для textarea
    textarea.addEventListener('blur', () => {
        // Потеря фокуса — сохраняем
        finishEditing();
    });
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textarea.blur(); // сохранить и выйти
        } else if (e.key === 'Escape') {
            e.preventDefault();
            // Отмена: возвращаем исходное значение без сохранения
            socket.emit('unlock_cell', { cellId });
        }
    });

    statusBar.innerHTML = `<i class="fas fa-pen" style="color: #1a73e8;"></i> Редактирование ячейки [${td.dataset.row}, ${td.dataset.col}]`;
};

// Обновление ячейки после сохранения (пришло с сервера)
window.updateCellInUI = function(cellId, value) {
    const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
    if (td) {
        // Если это наша редактируемая ячейка, нужно убрать textarea
        if (editingCellId === cellId) {
            editingCellId = null;
        }
        // Обновляем содержимое, сохраняя lock-info, если есть
        const lockedBy = lockedCells[cellId];
        const lockInfo = lockedBy ? `<div class="lock-info"><i class="fas fa-lock"></i> ${lockedBy}</div>` : '';
        td.innerHTML = escapeHtml(value) + lockInfo;
        td.classList.remove('editing');
        // Обновляем данные
        const cell = cellsData.find(c => c.id == cellId);
        if (cell) cell.value = value;
    }
};

// Блокировка ячейки другим пользователем
window.markCellLocked = function(cellId, username) {
    lockedCells[cellId] = username;
    const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
    if (td) {
        td.classList.add('locked');
        // Добавим информацию о блокировке, если её ещё нет
        if (!td.querySelector('.lock-info')) {
            td.innerHTML += `<div class="lock-info"><i class="fas fa-lock"></i> ${username}</div>`;
        }
    }
    // Если это выделенная ячейка, обновим статус
    if (selectedCellId === cellId) {
        statusBar.innerHTML = `<i class="fas fa-lock" style="color: #d93025;"></i> Ячейка редактируется пользователем ${username}`;
    }
};

// Снятие блокировки
window.markCellUnlocked = function(cellId) {
    delete lockedCells[cellId];
    const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
    if (td) {
        td.classList.remove('locked');
        const lockInfo = td.querySelector('.lock-info');
        if (lockInfo) lockInfo.remove();
    }
    // Если это выделенная ячейка, очистим статус
    if (selectedCellId === cellId) {
        statusBar.innerHTML = '';
    }
    // Если это была наша редактируемая ячейка, но вдруг мы не сохранили, сбросим
    if (editingCellId === cellId) {
        editingCellId = null;
        // Возвращаем исходное значение (без textarea)
        const td = document.querySelector(`.cell[data-cell-id="${cellId}"]`);
        if (td) {
            const cell = cellsData.find(c => c.id == cellId);
            td.innerHTML = escapeHtml(cell.value);
            td.classList.remove('editing');
        }
    }
};

// Обработка глобальных клавиш для навигации
function handleGlobalKeys(e) {
    // Если мы в режиме редактирования, не обрабатываем навигацию (кроме Escape)
    if (editingCellId) return;

    if (!selectedCellId) return;

    const key = e.key;
    const cell = cellsData.find(c => c.id == selectedCellId);
    if (!cell) return;

    let targetRow = cell.row_index;
    let targetCol = cell.col_index;

    switch (key) {
        case 'ArrowUp':
            e.preventDefault();
            targetRow = Math.max(1, cell.row_index - 1); // row 0 - заголовок, не выбираем
            break;
        case 'ArrowDown':
            e.preventDefault();
            targetRow = cell.row_index + 1;
            break;
        case 'ArrowLeft':
            e.preventDefault();
            targetCol = Math.max(0, cell.col_index - 1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            targetCol = cell.col_index + 1;
            break;
        default:
            // Если нажата буква/цифра и нет модификаторов, начинаем редактирование
            if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                startEdit(selectedCellId);
                // После начала редактирования вставим символ в textarea
                setTimeout(() => {
                    if (editingCellId) {
                        const textarea = document.querySelector(`.cell[data-cell-id="${editingCellId}"] textarea`);
                        if (textarea) {
                            textarea.value = key;
                        }
                    }
                }, 10);
            }
            return;
    }

    // Ищем ячейку с такими координатами
    const targetCell = cellsData.find(c => c.row_index === targetRow && c.col_index === targetCol);
    if (targetCell) {
        onCellClick(targetCell.id);
    }
}

// Дополнительные обработчики сокетов
socket.on('lock_granted', ({ cellId }) => {
    window.startEditing(cellId);
});

socket.on('lock_denied', ({ cellId, holder }) => {
    alert(`Ячейка уже редактируется пользователем ${holder}`);
});

socket.on('save_denied', ({ reason }) => {
    alert(`Не удалось сохранить: ${reason}`);
    if (editingCellId) {
        // Сбрасываем режим редактирования
        const td = document.querySelector(`.cell[data-cell-id="${editingCellId}"]`);
        if (td) {
            const cell = cellsData.find(c => c.id == editingCellId);
            td.innerHTML = escapeHtml(cell.value);
            td.classList.remove('editing');
        }
        editingCellId = null;
    }
});
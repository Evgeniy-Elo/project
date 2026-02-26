// Состояние приложения
let currentUser = null;
let selectedCellId = null;          // ID выделенной ячейки (без блокировки)
let editingCellId = null;           // ID ячейки, которую мы редактируем (заблокирована нами)
let cellsData = [];                 // массив всех ячеек { id, row_index, col_index, value }
let lockedCells = {};               // объект { cellId: username } для заблокированных другими

// DOM элементы
let statusBar;

document.addEventListener('DOMContentLoaded', async () => {
    statusBar = document.getElementById('status-bar');
    await loadUser();
    setupEventListeners();
});

async function loadUser() {
    const res = await fetch('/auth/me');
    if (res.ok) {
        currentUser = await res.json();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        document.getElementById('current-user').innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        if (currentUser.is_admin) {
            document.getElementById('admin-btn').style.display = 'inline-flex';
        }
        // После загрузки пользователя
       if (currentUser.roles && currentUser.roles.includes('relay')) {
            document.getElementById('relay-btn').style.display = 'inline-flex';
       } else {
            document.getElementById('relay-btn').style.display = 'none';
       }
       if (currentUser.roles && currentUser.roles.includes('audio')) {
            document.getElementById('audio-btn').style.display = 'inline-flex';
       } else {
            document.getElementById('audio-btn').style.display = 'none';
       }
    } else {
        document.getElementById('login-form').style.display = 'flex';
    }
}

function setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('admin-btn').addEventListener('click', () => {window.location.href = '/admin.html';});
    document.getElementById('audio-btn').addEventListener('click', () => {window.location.href = '/audio';});
    document.getElementById('relay-btn').addEventListener('click', () => {window.location.href = '/relay';});

    // Глобальные клавиши для навигации
    document.addEventListener('keydown', handleGlobalKeys);
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
        window.location.href = data.redirectTo || '/';
    } else {
        document.getElementById('login-error').textContent = data.error || 'Ошибка входа';
    }
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    location.reload();
}

// Рендер таблицы (вызывается из socket.js)
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

    let html = '<table><thead><tr>';
    // Заголовок
    for (let cell of headerCells) {
        html += `<th data-cell-id="${cell.id}">${escapeHtml(cell.value)}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Тело таблицы
    for (let r of sortedRows) {
        html += '<tr>';
        const rowCells = rowsMap.get(r).sort((a,b) => a.col_index - b.col_index);
        for (let cell of rowCells) {
            const lockedBy = lockedCells[cell.id];
            const lockClass = lockedBy ? 'locked' : '';
            const lockInfo = lockedBy ? `<div class="lock-info"><i class="fas fa-lock"></i> ${lockedBy}</div>` : '';
            html += `<td class="cell ${lockClass}" data-cell-id="${cell.id}" data-row="${cell.row_index}" data-col="${cell.col_index}">${escapeHtml(cell.value)}${lockInfo}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    // Добавляем обработчики
    document.querySelectorAll('.cell').forEach(td => {
        td.addEventListener('click', () => onCellClick(td.dataset.cellId));
        td.addEventListener('dblclick', () => onCellDblClick(td.dataset.cellId));
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
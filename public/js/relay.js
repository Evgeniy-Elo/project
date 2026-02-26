let currentUser = null;
let devices = [];
let schedulesByDevice = {};
let manualModes = {};
let manualStates = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    setupNavigation();
    if (currentUser) {
        loadDevices();
    }
    setupEventListeners();
});

async function loadUser() {
    const res = await fetch('/auth/me');
    if (res.ok) {
        currentUser = await res.json();
        const userElement = document.getElementById('current-user');
        if (userElement) {
            userElement.innerHTML = `<i class="fas fa-user"></i> ${currentUser.username}`;
        }
    } else {
        window.location.href = '/';
    }
}

function setupNavigation() {
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

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

    // Кнопка "Админка" (если есть роль admin)
    if (currentUser?.roles?.includes('admin')) {
        navLinks.innerHTML += `
            <a href="/admin.html" class="nav-btn">
                <i class="fas fa-cog"></i> Админка
            </a>
        `;
    }
}

function setupEventListeners() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const scheduleForm = document.getElementById('scheduleForm');
    if (scheduleForm) scheduleForm.addEventListener('submit', saveSchedule);

    const deviceForm = document.getElementById('deviceForm');
    if (deviceForm) deviceForm.addEventListener('submit', addDevice);

    const addDeviceMainBtn = document.getElementById('add-device-main-btn');
    if (addDeviceMainBtn) {
        addDeviceMainBtn.addEventListener('click', () => window.showAddDeviceModal());
    }
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/';
}

async function loadDevices() {
    try {
        const res = await fetch('/relay/api/devices');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        devices = await res.json();

        for (const device of devices) {
            await loadSchedulesForDevice(device.id);
        }

        renderDevices();
    } catch (error) {
        console.error('Error loading devices:', error);
        showError('Ошибка загрузки устройств: ' + error.message);
    }
}

async function loadSchedulesForDevice(deviceId) {
    try {
        const res = await fetch(`/relay/api/schedules?deviceId=${deviceId}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const schedules = await res.json();
        schedulesByDevice[deviceId] = schedules;
    } catch (error) {
        console.error(`Error loading schedules for device ${deviceId}:`, error);
        schedulesByDevice[deviceId] = [];
    }
}

function renderDevices() {
    const grid = document.getElementById('devicesGrid');
    if (!grid) return;

    if (devices.length === 0) {
        grid.innerHTML = `
            <div class="no-devices">
                <i class="fas fa-microchip" style="font-size: 3em; margin-bottom: 20px; color: var(--primary-color);"></i>
                <p style="margin-bottom: 20px;">Нет добавленных устройств</p>
                <button class="btn btn-primary" onclick="window.showAddDeviceModal()">
                    <i class="fas fa-plus"></i> Добавить устройство
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = devices.map(device => renderDeviceCard(device)).join('');
}

function renderDeviceCard(device) {
    const lastSeen = new Date(device.last_seen);
    const created = new Date(device.created_at);
    const now = new Date();

    const neverConnected = (Math.abs(lastSeen - created) < 10000);

    let statusText, statusClass;

    if (neverConnected) {
        statusText = 'Ожидает подключения';
        statusClass = 'status-waiting';
    } else {
        const diffMinutes = Math.floor((now - lastSeen) / 60000);
        if (diffMinutes < 10) {
            statusText = 'Онлайн';
            statusClass = 'status-online';
        } else {
            statusText = 'Офлайн';
            statusClass = 'status-offline';
        }
    }

    const schedules = schedulesByDevice[device.id] || [];
    const manualMode = manualModes[device.id] || false;
    const states = manualStates[device.id] || [false, false, false, false];

    // ВАЖНО: Используем window. для глобального доступа к функциям
    return `
        <div class="device-card ${statusClass === 'status-online' ? 'online' : 'offline'}" data-device-id="${device.id}">
            <div class="device-header">
                <div class="device-title">
                    <span class="device-name">
                        <i class="fas fa-microchip"></i> ${device.name}
                    </span>
                    <span class="device-location">
                        <i class="fas fa-map-marker-alt"></i> ${device.location || 'Не указано'}
                    </span>
                </div>
                <span class="device-status ${statusClass}">
                    ${statusText}
                </span>
            </div>

            <div class="device-info">
                <div class="info-item">
                    <i class="fas fa-calendar"></i>
                    <span>${device.schedule_count || 0} расписаний</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-clock"></i>
                    <span>Последнее: ${lastSeen.toLocaleString()}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-plug"></i>
                    <span>IP: ${device.ip_address || 'Неизвестно'}</span>
                </div>
            </div>

            <div class="manual-control-section">
                <div class="section-title">
                    <i class="fas fa-hand-pointer"></i>
                    <span>Ручное управление</span>
                    ${manualMode ? '<span class="manual-mode-badge"><i class="fas fa-clock"></i> Ручной режим</span>' : ''}
                </div>
                
                <div class="channels-grid">
                    ${[0,1,2,3].map(channel => `
                        <div class="channel-card ${states[channel] ? 'active' : ''}">
                            <div class="channel-number">Канал ${channel + 1}</div>
                            <div class="channel-status ${states[channel] ? 'on' : 'off'}">
                                <i class="fas fa-${states[channel] ? 'lightbulb' : 'power-off'}"></i>
                            </div>
                            <div class="channel-controls">
                                <button class="btn-on" onclick="window.setManualChannel('${device.id}', ${channel}, true)" 
                                        ${states[channel] ? 'disabled' : ''}>
                                    <i class="fas fa-power-off"></i> Вкл
                                </button>
                                <button class="btn-off" onclick="window.setManualChannel('${device.id}', ${channel}, false)" 
                                        ${!states[channel] ? 'disabled' : ''}>
                                    <i class="fas fa-power-off"></i> Выкл
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${statusClass === 'status-online' ? `
                    <button class="reset-manual-btn" onclick="window.resetManualMode('${device.id}')">
                        <i class="fas fa-undo"></i> Вернуться к автоматическому режиму
                    </button>
                ` : ''}
            </div>

            <div class="schedules-section">
                <div class="schedules-header">
                    <h4><i class="fas fa-calendar-alt"></i> Расписания</h4>
                    <button class="add-schedule-btn" onclick="window.showAddScheduleModal('${device.id}')">
                        <i class="fas fa-plus"></i> Добавить
                    </button>
                </div>

                <div class="schedules-list">
                    ${schedules.length === 0 ? `
                        <div class="empty-schedules">
                            <i class="fas fa-calendar-times"></i>
                            <p>Нет расписаний</p>
                        </div>
                    ` : schedules.map(schedule => renderScheduleItem(device.id, schedule)).join('')}
                </div>
            </div>

            ${currentUser.roles && currentUser.roles.includes('admin') ? `
                <button class="btn btn-outline delete-device-btn" onclick="window.deleteDevice('${device.id}')" style="margin-top: 20px; width: 100%;">
                    <i class="fas fa-trash"></i> Удалить устройство
                </button>
            ` : ''}
        </div>
    `;
}

function renderScheduleItem(deviceId, schedule) {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const activeDays = [
        schedule.monday, schedule.tuesday, schedule.wednesday,
        schedule.thursday, schedule.friday, schedule.saturday, schedule.sunday
    ];

    return `
        <div class="schedule-item ${!schedule.enabled ? 'disabled' : ''}">
            <div class="schedule-header">
                <span class="schedule-channel">
                    <i class="fas fa-plug"></i> Канал ${parseInt(schedule.channel) + 1}
                </span>
                <div class="schedule-actions">
                    <button onclick="window.editSchedule('${deviceId}', ${schedule.id})" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="window.deleteSchedule('${deviceId}', ${schedule.id})" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="schedule-time">
                ${String(schedule.start_hour).padStart(2, '0')}:${String(schedule.start_minute).padStart(2, '0')} - 
                ${String(schedule.end_hour).padStart(2, '0')}:${String(schedule.end_minute).padStart(2, '0')}
            </div>
            <div class="schedule-days">
                ${days.map((day, index) => `
                    <span class="day-badge ${activeDays[index] ? 'active' : ''}">${day}</span>
                `).join('')}
            </div>
            ${!schedule.enabled ? '<div style="color: var(--text-secondary); margin-top: 8px;"><i class="fas fa-pause"></i> Отключено</div>' : ''}
        </div>
    `;
}

// Глобальные функции для вызова из HTML
window.setManualChannel = async function(deviceId, channel, state) {
    try {
        const response = await fetch(`/relay/api/manual-control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, channel, state })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        manualModes[deviceId] = true;
        if (!manualStates[deviceId]) {
            manualStates[deviceId] = [false, false, false, false];
        }
        manualStates[deviceId][channel] = state;

        updateDeviceCard(deviceId);
        showSuccess(`Канал ${channel + 1} ${state ? 'включен' : 'выключен'}`);
    } catch (error) {
        console.error('Error setting manual channel:', error);
        showError('Ошибка управления каналом');
    }
};

window.resetManualMode = async function(deviceId) {
    try {
        const response = await fetch(`/relay/api/manual-control/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        delete manualModes[deviceId];
        delete manualStates[deviceId];

        updateDeviceCard(deviceId);
        showSuccess('Возврат к автоматическому режиму');
    } catch (error) {
        console.error('Error resetting manual mode:', error);
        showError('Ошибка сброса ручного режима');
    }
};

window.showAddScheduleModal = function(deviceId) {
    const modal = document.getElementById('scheduleModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('scheduleForm');
    const scheduleId = document.getElementById('scheduleId');
    const modalDeviceId = document.getElementById('modalDeviceId');
    const startHour = document.getElementById('startHour');
    const startMinute = document.getElementById('startMinute');
    const endHour = document.getElementById('endHour');
    const endMinute = document.getElementById('endMinute');

    if (!modal || !title || !form || !modalDeviceId) {
        console.error('Modal elements not found');
        return;
    }

    title.textContent = 'Новое расписание';
    form.reset();
    if (scheduleId) scheduleId.value = '';
    modalDeviceId.value = deviceId;

    if (startHour) startHour.value = '9';
    if (startMinute) startMinute.value = '0';
    if (endHour) endHour.value = '17';
    if (endMinute) endMinute.value = '0';

    modal.classList.add('active');
};

window.showAddDeviceModal = function() {
    const modal = document.getElementById('deviceModal');
    const form = document.getElementById('deviceForm');

    if (!modal || !form) {
        console.error('Device modal elements not found');
        return;
    }

    form.reset();
    modal.classList.add('active');
};

window.closeModal = function() {
    const scheduleModal = document.getElementById('scheduleModal');
    const deviceModal = document.getElementById('deviceModal');

    if (scheduleModal) scheduleModal.classList.remove('active');
    if (deviceModal) deviceModal.classList.remove('active');
};

window.closeDeviceModal = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) modal.classList.remove('active');
};

async function saveSchedule(e) {
    e.preventDefault();

    const deviceId = document.getElementById('modalDeviceId')?.value;
    if (!deviceId) {
        showError('ID устройства не найден');
        return;
    }

    const scheduleData = {
        device_id: deviceId,
        enabled: document.getElementById('enabled')?.checked || false,
        channel: parseInt(document.getElementById('channel')?.value || '0'),
        start_hour: parseInt(document.getElementById('startHour')?.value || '0'),
        start_minute: parseInt(document.getElementById('startMinute')?.value || '0'),
        end_hour: parseInt(document.getElementById('endHour')?.value || '23'),
        end_minute: parseInt(document.getElementById('endMinute')?.value || '59'),
        monday: document.getElementById('monday')?.checked || false,
        tuesday: document.getElementById('tuesday')?.checked || false,
        wednesday: document.getElementById('wednesday')?.checked || false,
        thursday: document.getElementById('thursday')?.checked || false,
        friday: document.getElementById('friday')?.checked || false,
        saturday: document.getElementById('saturday')?.checked || false,
        sunday: document.getElementById('sunday')?.checked || false
    };

    const scheduleId = document.getElementById('scheduleId')?.value;

    try {
        let response;
        if (scheduleId) {
            response = await fetch(`/relay/api/schedules/${scheduleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheduleData)
            });
        } else {
            response = await fetch('/relay/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scheduleData)
            });
        }

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        try {
            await fetch(`/relay/api/device/notify/${deviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (notifyError) {
            console.log('Device offline, will sync later');
        }

        await loadSchedulesForDevice(deviceId);
        updateDeviceCard(deviceId);
        window.closeModal();
        showSuccess('Расписание сохранено');
    } catch (error) {
        console.error('Error saving schedule:', error);
        showError('Ошибка при сохранении: ' + error.message);
    }
}

window.editSchedule = function(deviceId, scheduleId) {
    const schedule = schedulesByDevice[deviceId]?.find(s => s.id === scheduleId);
    if (!schedule) return;

    const modal = document.getElementById('scheduleModal');
    const title = document.getElementById('modalTitle');
    const scheduleIdInput = document.getElementById('scheduleId');
    const modalDeviceId = document.getElementById('modalDeviceId');

    if (!modal || !title || !scheduleIdInput || !modalDeviceId) return;

    title.textContent = 'Редактировать расписание';
    scheduleIdInput.value = schedule.id;
    modalDeviceId.value = deviceId;

    // Заполняем форму
    document.getElementById('enabled').checked = schedule.enabled;
    document.getElementById('channel').value = schedule.channel;
    document.getElementById('startHour').value = schedule.start_hour;
    document.getElementById('startMinute').value = schedule.start_minute;
    document.getElementById('endHour').value = schedule.end_hour;
    document.getElementById('endMinute').value = schedule.end_minute;
    document.getElementById('monday').checked = schedule.monday;
    document.getElementById('tuesday').checked = schedule.tuesday;
    document.getElementById('wednesday').checked = schedule.wednesday;
    document.getElementById('thursday').checked = schedule.thursday;
    document.getElementById('friday').checked = schedule.friday;
    document.getElementById('saturday').checked = schedule.saturday;
    document.getElementById('sunday').checked = schedule.sunday;

    modal.classList.add('active');
};

window.deleteSchedule = async function(deviceId, scheduleId) {
    if (!confirm('Вы уверены, что хотите удалить это расписание?')) return;

    try {
        const response = await fetch(`/relay/api/schedules/${scheduleId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        try {
            await fetch(`/relay/api/device/notify/${deviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (notifyError) {
            console.log('Device offline, will sync later');
        }

        await loadSchedulesForDevice(deviceId);
        updateDeviceCard(deviceId);
        showSuccess('Расписание удалено');
    } catch (error) {
        console.error('Error deleting schedule:', error);
        showError('Ошибка при удалении: ' + error.message);
    }
};

async function addDevice(e) {
    e.preventDefault();

    const deviceData = {
        id: document.getElementById('deviceId')?.value,
        name: document.getElementById('deviceName')?.value,
        location: document.getElementById('deviceLocation')?.value
    };

    if (!deviceData.id || !deviceData.name) {
        showError('ID и название обязательны');
        return;
    }

    try {
        const response = await fetch('/relay/api/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deviceData)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        window.closeDeviceModal();
        loadDevices();
        showSuccess('Устройство добавлено');
    } catch (error) {
        console.error('Error adding device:', error);
        showError('Ошибка при добавлении устройства: ' + error.message);
    }
}

window.deleteDevice = async function(deviceId) {
    if (!confirm('Вы уверены, что хотите удалить это устройство? Все расписания будут также удалены.')) return;

    try {
        const response = await fetch(`/relay/api/devices/${deviceId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        devices = devices.filter(d => d.id !== deviceId);
        delete schedulesByDevice[deviceId];
        delete manualModes[deviceId];
        delete manualStates[deviceId];

        renderDevices();
        showSuccess('Устройство удалено');
    } catch (error) {
        console.error('Error deleting device:', error);
        showError('Ошибка при удалении устройства: ' + error.message);
    }
};

function updateDeviceCard(deviceId) {
    const device = devices.find(d => d.id === deviceId);
    if (device) {
        const deviceCard = document.querySelector(`.device-card[data-device-id="${deviceId}"]`);
        if (deviceCard) {
            const newCard = renderDeviceCard(device);
            deviceCard.outerHTML = newCard;
        }
    }
}

function showError(message) {
    console.error(message);
    alert('❌ ' + message);
}

function showSuccess(message) {
    console.log(message);
    alert('✅ ' + message);
}
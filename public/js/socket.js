const socket = io();

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('init_cells', (cells) => {
    window.renderTable(cells);
});

socket.on('cell_updated', ({ cellId, value }) => {
    window.updateCellInUI(cellId, value);
});

socket.on('cell_locked', ({ cellId, username }) => {
    window.markCellLocked(cellId, username);
});

socket.on('cell_unlocked', ({ cellId }) => {
    window.markCellUnlocked(cellId);
});

socket.on('lock_denied', ({ cellId, holder }) => {
    // Будет обработано в table.js
    console.log('lock denied', cellId, holder);
});

socket.on('save_denied', ({ reason }) => {
    console.log('save denied', reason);
});
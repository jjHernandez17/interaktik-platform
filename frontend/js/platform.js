const navButtons = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-card');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');

const adminNavItem = document.getElementById('adminNavItem');
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
const adminUsersMeta = document.getElementById('adminUsersMeta');
const adminUsersList = document.getElementById('adminUsersList');
const adminEditModal = document.getElementById('adminEditModal');
const adminEditForm = document.getElementById('adminEditForm');
const adminEditUserId = document.getElementById('adminEditUserId');
const adminEditName = document.getElementById('adminEditName');
const adminEditEmail = document.getElementById('adminEditEmail');
const adminEditConnections = document.getElementById('adminEditConnections');
const adminEditCloseBtn = document.getElementById('adminEditCloseBtn');
const adminEditCancelBtn = document.getElementById('adminEditCancelBtn');
const adminEditSaveBtn = document.getElementById('adminEditSaveBtn');

const GAME_LABELS = {
  app: 'Contador de puntos',
  snake: 'Snake Vs Snake',
  race: 'Carrera de Colegas',
};

let currentUser = null;
let adminUsers = [];
let adminUsersLoaded = false;
let adminEditAccountName = null;
let adminEditAccountEmail = null;
let adminSearchInput = null;
let adminEmailFilter = '';
let gameAvailability = {};

function setupAdminSearch() {
  if (!adminUsersList || document.getElementById('adminEmailSearch')) {
    adminSearchInput = document.getElementById('adminEmailSearch');
    return;
  }

  const searchBox = document.createElement('label');
  searchBox.className = 'admin-search';
  searchBox.innerHTML = `
    <span>Buscar por correo electronico</span>
    <input id="adminEmailSearch" type="search" placeholder="correo@ejemplo.com" autocomplete="off" />
  `;

  adminUsersList.before(searchBox);
  adminSearchInput = document.getElementById('adminEmailSearch');
  adminSearchInput.addEventListener('input', () => {
    adminEmailFilter = adminSearchInput.value.trim().toLowerCase();
    renderAdminUsers();
  });
}

function gameTypeFromHref(href = '') {
  if (href.includes('snake-vs-snake')) return 'snake';
  if (href.includes('race')) return 'race';
  if (href.includes('app')) return 'app';
  return '';
}

function applyGameAvailabilityToCards() {
  document.querySelectorAll('.game-card').forEach((card) => {
    const link = card.querySelector('a.start-btn');
    if (!link) return;

    const gameType = gameTypeFromHref(link.getAttribute('href') || '');
    const availability = gameAvailability[gameType];
    const disabled = availability && availability.isEnabled === false && !currentUser?.isSuperUser;

    card.classList.toggle('game-disabled-by-admin', Boolean(disabled));
    let message = card.querySelector('.game-disabled-message');

    if (disabled) {
      if (!message) {
        message = document.createElement('p');
        message.className = 'game-disabled-message';
        card.appendChild(message);
      }
      message.textContent = 'estamos trabajando para darte el mejor servicio, pronto volveremos a activar este juego';
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    } else {
      if (message) message.remove();
      link.removeAttribute('aria-disabled');
      link.tabIndex = 0;
    }
  });
}

function setupAdminGameAvailabilityControls() {
  if (!currentUser?.isSuperUser) {
    return;
  }

  document.querySelectorAll('.game-card').forEach((card) => {
    const link = card.querySelector('a.start-btn');
    if (!link) return;

    const gameType = gameTypeFromHref(link.getAttribute('href') || '');
    if (!gameType || card.querySelector('[data-game-availability]')) return;

    const toggle = document.createElement('label');
    toggle.className = 'admin-game-toggle in-card';
    toggle.innerHTML = `
      <span>Juego habilitado</span>
      <input type="checkbox" data-game-availability="${escapeHtml(gameType)}" />
    `;
    card.appendChild(toggle);

    const input = toggle.querySelector('input');
    input.addEventListener('change', async () => {
      const gameType = input.dataset.gameAvailability;
      const previousValue = !input.checked;
      try {
        const response = await fetch(`/api/admin/games/${gameType}/availability`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isEnabled: input.checked }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo actualizar el juego.');
        }
        gameAvailability[gameType] = {
          gameType,
          isEnabled: data.game?.is_enabled ?? input.checked,
          updatedAt: data.game?.updated_at || null,
        };
        syncAdminGameAvailabilityControls();
        applyGameAvailabilityToCards();
      } catch (error) {
        input.checked = previousValue;
        await showAlert(error.message, 'Error');
      }
    });
  });
}

function syncAdminGameAvailabilityControls() {
  document.querySelectorAll('[data-game-availability]').forEach((input) => {
    const availability = gameAvailability[input.dataset.gameAvailability];
    input.checked = availability ? availability.isEnabled !== false : true;
  });
}

async function loadGameAvailability() {
  try {
    const response = await fetch('/api/games/availability');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la disponibilidad de juegos.');

    gameAvailability = data.games || {};
    setupAdminGameAvailabilityControls();
    syncAdminGameAvailabilityControls();
    applyGameAvailabilityToCards();
  } catch (error) {
    console.warn('[PLATFORM] Game availability unavailable:', error.message);
  }
}

function setupAdminEditModal() {
  const nameField = adminEditName?.closest('.field');
  const emailField = adminEditEmail?.closest('.field');
  const connectionsBox = adminEditConnections?.closest('.admin-connections-box');

  if (nameField) nameField.hidden = true;
  if (emailField) emailField.hidden = true;
  if (adminEditName) {
    adminEditName.required = false;
    adminEditName.disabled = true;
  }
  if (adminEditEmail) {
    adminEditEmail.required = false;
    adminEditEmail.disabled = true;
  }

  if (!connectionsBox || document.getElementById('adminEditAccountSummary')) {
    return;
  }

  const summary = document.createElement('div');
  summary.id = 'adminEditAccountSummary';
  summary.className = 'admin-account-summary';
  summary.innerHTML = `
    <div>
      <span>Nombre</span>
      <strong id="adminEditAccountName">-</strong>
    </div>
    <div>
      <span>Correo electronico</span>
      <strong id="adminEditAccountEmail">-</strong>
    </div>
  `;

  connectionsBox.before(summary);
  adminEditAccountName = document.getElementById('adminEditAccountName');
  adminEditAccountEmail = document.getElementById('adminEditAccountEmail');
}

function showSection(sectionId) {
  sections.forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });

  if (sectionId === 'adminSection' && currentUser?.isSuperUser) {
    loadAdminUsers();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return date.toLocaleString('es-ES');
}

async function showAlert(message, title = 'Aviso') {
  if (window.showAppAlert) {
    return window.showAppAlert(message, title);
  }

  window.alert(message);
  return undefined;
}

async function showConfirm(message, title = 'Confirmacion', confirmText = 'Aceptar', cancelText = 'Cancelar') {
  if (window.showAppConfirm) {
    return window.showAppConfirm(message, title, confirmText, cancelText);
  }

  return window.confirm(message);
}

function normalizeConnections(connections = {}) {
  return Object.entries(GAME_LABELS).map(([gameType, label]) => {
    const connection = connections[gameType] || null;

    return {
      gameType,
      label,
      tiktokUsername: connection?.tiktokUsername || connection?.tiktok_username || '',
      isLinked: Boolean(connection?.isLinked ?? connection?.is_linked),
      linkedAt: connection?.linkedAt || connection?.linked_at || null,
    };
  });
}

function renderEditConnections(connections = {}) {
  adminEditConnections.innerHTML = normalizeConnections(connections)
    .map((connection) => {
      const linkedAt = connection.linkedAt ? `Vinculado: ${escapeHtml(formatDate(connection.linkedAt))}` : 'Sin fecha de vinculacion';

      return `
        <label class="admin-connection-edit">
          <span>${escapeHtml(connection.label)}</span>
          <input
            type="text"
            value="${escapeHtml(connection.tiktokUsername)}"
            placeholder="@usuario_tiktok"
            data-game-type="${escapeHtml(connection.gameType)}"
          />
          <small>${connection.isLinked ? 'Activo' : 'No activo'} - ${linkedAt}</small>
        </label>
      `;
    })
    .join('');
}

function renderAdminUsers() {
  const filteredUsers = adminEmailFilter
    ? adminUsers.filter((user) => String(user.email || '').toLowerCase().includes(adminEmailFilter))
    : adminUsers;

  adminUsersMeta.textContent = adminEmailFilter
    ? `${filteredUsers.length} coincidencia(s) de ${adminUsers.length} cuenta(s).`
    : `${adminUsers.length} cuenta(s) registrada(s).`;

  if (adminUsers.length === 0) {
    adminUsersList.innerHTML = '<div class="admin-user-card muted">No hay cuentas registradas.</div>';
    return;
  }

  if (filteredUsers.length === 0) {
    adminUsersList.innerHTML = '<div class="admin-user-card muted">No hay cuentas que coincidan con ese correo.</div>';
    return;
  }

  adminUsersList.innerHTML = adminUsers
    .filter((user) => filteredUsers.includes(user))
    .map((user) => `
      <article class="admin-user-card" data-user-id="${user.id}">
        <div class="admin-user-top">
          <div>
            <h3 class="admin-user-name">${escapeHtml(user.name)}</h3>
            <p class="admin-user-email">${escapeHtml(user.email)}</p>
            <p class="admin-user-info">Registrado: ${escapeHtml(formatDate(user.created_at))}</p>
          </div>
          <div class="admin-user-actions">
            <button class="btn secondary edit-user" type="button">Editar cuenta</button>
            <button class="btn danger delete-user" type="button">Eliminar cuenta</button>
          </div>
        </div>
      </article>
    `)
    .join('');

  adminUsersList.querySelectorAll('[data-user-id]').forEach((card) => {
    const userId = Number(card.getAttribute('data-user-id'));

    card.querySelector('.edit-user').addEventListener('click', () => {
      openEditModal(userId);
    });

    card.querySelector('.delete-user').addEventListener('click', () => {
      deleteAdminUser(userId);
    });
  });
}

async function loadAdminUsers({ force = false } = {}) {
  if (!currentUser?.isSuperUser || (adminUsersLoaded && !force)) {
    return;
  }

  setupAdminSearch();
  adminUsersMeta.textContent = 'Cargando cuentas...';
  adminUsersList.innerHTML = '';
  if (refreshUsersBtn) refreshUsersBtn.disabled = true;

  try {
    const response = await fetch('/api/admin/users');
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo cargar la lista de cuentas.');
    }

    adminUsers = Array.isArray(data.users) ? data.users : [];
    adminUsersLoaded = true;
    renderAdminUsers();
  } catch (error) {
    adminUsersMeta.textContent = 'No se pudo cargar la lista de cuentas.';
    adminUsersList.innerHTML = '';
    await showAlert(error.message, 'Error');
  } finally {
    if (refreshUsersBtn) refreshUsersBtn.disabled = false;
  }
}

function openEditModal(userId) {
  setupAdminEditModal();
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  adminEditUserId.value = String(user.id);
  adminEditName.value = user.name || '';
  adminEditEmail.value = user.email || '';
  if (adminEditAccountName) adminEditAccountName.textContent = user.name || '-';
  if (adminEditAccountEmail) adminEditAccountEmail.textContent = user.email || '-';
  renderEditConnections(user.tiktokConnections);
  adminEditModal.hidden = false;
  const firstConnectionInput = adminEditConnections.querySelector('input[data-game-type]');
  if (firstConnectionInput) {
    firstConnectionInput.focus();
    firstConnectionInput.select();
  }
}

function closeEditModal() {
  adminEditModal.hidden = true;
  adminEditForm.reset();
  adminEditUserId.value = '';
  adminEditConnections.innerHTML = '';
}

async function saveEditedUser(event) {
  event.preventDefault();

  const userId = Number(adminEditUserId.value);
  const payload = {
    tiktokConnections: {},
  };

  adminEditConnections.querySelectorAll('input[data-game-type]').forEach((input) => {
    payload.tiktokConnections[input.dataset.gameType] = input.value.trim();
  });

  if (!userId) {
    await showAlert('No se encontro la cuenta a editar.', 'Cuenta no encontrada');
    return;
  }

  adminEditSaveBtn.disabled = true;
  adminEditSaveBtn.textContent = 'Guardando...';

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo actualizar la cuenta.');
    }

    adminUsers = adminUsers.map((user) => (user.id === userId ? data.user : user));
    renderAdminUsers();

    closeEditModal();
    await showAlert('TikTok vinculados actualizados correctamente.', 'Cuenta actualizada');
  } catch (error) {
    await showAlert(error.message, 'Error');
  } finally {
    adminEditSaveBtn.disabled = false;
    adminEditSaveBtn.textContent = 'Guardar cambios';
  }
}

async function deleteAdminUser(userId) {
  const user = adminUsers.find((item) => item.id === userId);
  if (!user) return;

  const confirmed = await showConfirm(
    '¿estas seguro que deseas eliminar esta cuenta de la plataforma?',
    'Eliminar cuenta',
    'Aceptar',
    'Cancelar',
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo eliminar la cuenta.');
    }

    adminUsers = adminUsers.filter((item) => item.id !== userId);
    renderAdminUsers();

    if (currentUser?.id === userId) {
      redirectWithLog('/login.html', 'La cuenta actual fue eliminada');
      return;
    }

    await showAlert(`La cuenta de ${user.name} fue eliminada.`, 'Cuenta eliminada');
  } catch (error) {
    await showAlert(error.message, 'Error');
  }
}

async function loadMe() {
  console.log('Verificando autenticacion...');
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
    });

    console.log('Respuesta de /api/auth/me:', response.status, response.statusText);

    if (!response.ok) {
      console.log('Autenticacion fallida, redirigiendo a login');
      redirectWithLog('/login.html', 'Usuario no autenticado en /api/auth/me');
      return;
    }

    const data = await response.json();
    currentUser = data.user || null;

    console.log('Autenticacion exitosa:', currentUser?.email);
    userName.textContent = currentUser?.name || '-';
    userEmail.textContent = currentUser?.email || '-';

    if (currentUser?.isSuperUser) {
      adminNavItem.classList.remove('hidden');
    } else {
      adminNavItem.classList.add('hidden');
      if (!document.getElementById('adminSection')?.classList.contains('hidden')) {
        showSection('gamesSection');
      }
    }

    await loadGameAvailability();
  } catch (_error) {
    console.log('Error al verificar autenticacion:', _error);
    redirectWithLog('/login.html', 'Error al cargar datos de usuario');
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showSection(button.dataset.section);
  });
});

document.querySelectorAll('.game-card a.start-btn').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
    }
  });
});

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Cerrando...';

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    redirectWithLog('/login.html', 'Logout exitoso');
  }
});

if (refreshUsersBtn) {
  refreshUsersBtn.addEventListener('click', () => {
    loadAdminUsers({ force: true });
  });
}

if (adminEditForm) {
  adminEditForm.addEventListener('submit', saveEditedUser);
}

[adminEditCloseBtn, adminEditCancelBtn].forEach((button) => {
  if (button) {
    button.addEventListener('click', closeEditModal);
  }
});

if (adminEditModal) {
  adminEditModal.addEventListener('click', (event) => {
    if (event.target === adminEditModal) {
      closeEditModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && adminEditModal && !adminEditModal.hidden) {
    closeEditModal();
  }
});

loadMe();

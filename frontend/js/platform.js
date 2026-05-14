const navButtons = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-card');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');

function showSection(sectionId) {
  sections.forEach((section) => {
    section.classList.toggle('hidden', section.id !== sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });
}

async function loadMe() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      redirectWithLog('/login.html', 'Usuario no autenticado en /api/auth/me');
      return;
    }

    const data = await response.json();
    userName.textContent = data.user?.name || '-';
    userEmail.textContent = data.user?.email || '-';
  } catch (_error) {
    redirectWithLog('/login.html', 'Error al cargar datos de usuario');
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    showSection(button.dataset.section);
  });
});

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  logoutBtn.textContent = 'Cerrando...';

  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    redirectWithLog('/login.html', 'Logout exitoso');
  }
});

loadMe();

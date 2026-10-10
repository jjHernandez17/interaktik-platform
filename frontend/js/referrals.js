// Seccion "Referidos" de la plataforma: codigo para invitar, saldo de monedas y canje por planes.
// Los montos (cuanto gana cada plan y cuanto cuesta cada canje) los manda el servidor; aqui solo se muestran.
// El canje solo envia el plan elegido y un identificador unico de la solicitud: el servidor decide el costo.

(function referralsSection() {
  const section = document.getElementById('referralsSection');
  if (!section) return;

  const els = {
    error: document.getElementById('rfError'),
    code: document.getElementById('rfCode'),
    link: document.getElementById('rfLink'),
    copyCode: document.getElementById('rfCopyCodeBtn'),
    copyLink: document.getElementById('rfCopyLinkBtn'),
    available: document.getElementById('rfAvailable'),
    pending: document.getElementById('rfPending'),
    pendingNote: document.getElementById('rfPendingNote'),
    rewards: document.getElementById('rfRewards'),
    redeem: document.getElementById('rfRedeem'),
    holdNote: document.getElementById('rfHoldNote'),
    invited: document.getElementById('rfInvited'),
    invitedCount: document.getElementById('rfInvitedCount'),
    history: document.getElementById('rfHistory'),
  };

  const PLAN_LABELS = {
    pass_2d: 'Pase de 2 días',
    monthly: 'Plan mensual',
    yearly: 'Plan anual',
  };
  const PLAN_DETAIL = {
    pass_2d: '2 días de acceso',
    monthly: '30 días de acceso',
    yearly: '365 días de acceso',
  };
  const PLAN_ORDER = ['pass_2d', 'monthly', 'yearly'];

  let overview = null;
  let loading = false;
  let redeeming = false;
  // Si un canje se corta por la red (no sabemos si llego), el reintento reutiliza el mismo identificador:
  // asi el servidor reconoce que es la misma solicitud y no cobra dos veces.
  const pendingRequestIds = {};

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatDate(value, withTime = false) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const options = withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('es', options);
  }

  function coinsText(amount) {
    const value = Math.abs(Number(amount) || 0);
    return `${value} ${value === 1 ? 'moneda' : 'monedas'}`;
  }

  function newRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function showError(message) {
    if (!els.error) return;
    els.error.textContent = message || '';
    els.error.classList.toggle('hidden', !message);
  }

  function inviteLink(code) {
    return `${window.location.origin}/register.html?ref=${encodeURIComponent(code)}`;
  }

  function render() {
    if (!overview) return;

    const { code, balance, rewards, costs, holdDays } = overview;

    els.code.textContent = code;
    els.link.textContent = inviteLink(code);
    els.copyCode.disabled = false;
    els.copyLink.disabled = false;

    els.available.textContent = String(Math.max(0, balance.available));
    els.pending.textContent = String(balance.pending);
    if (balance.pending > 0 && balance.nextAvailableAt) {
      els.pendingNote.textContent = `Las primeras quedan disponibles el ${formatDate(balance.nextAvailableAt)}.`;
      els.pendingNote.classList.remove('hidden');
    } else {
      els.pendingNote.classList.add('hidden');
    }
    if (balance.available < 0) {
      els.pendingNote.textContent = 'Tu saldo está en negativo por una recompensa que se revirtió. Se compensa con las próximas monedas que ganes.';
      els.pendingNote.classList.remove('hidden');
    }

    els.rewards.innerHTML = PLAN_ORDER.map((planId) => `
      <li class="rf-row">
        <span class="rf-row-main"><strong>${escapeHtml(PLAN_LABELS[planId])}</strong></span>
        <span class="rf-row-value rf-gain">+${escapeHtml(coinsText(rewards[planId]))}</span>
      </li>`).join('');

    els.redeem.innerHTML = PLAN_ORDER.map((planId) => {
      const cost = costs[planId];
      const missing = Math.max(0, cost - balance.available);
      const canRedeem = missing === 0;
      return `
      <li class="rf-row">
        <span class="rf-row-main">
          <strong>${escapeHtml(PLAN_LABELS[planId])}</strong>
          <small>${escapeHtml(PLAN_DETAIL[planId])} · ${escapeHtml(coinsText(cost))}</small>
        </span>
        <span class="rf-row-value">
          <button class="btn ${canRedeem ? 'primary' : 'ghost'} small rf-redeem-btn" type="button" data-plan="${escapeHtml(planId)}" ${canRedeem ? '' : 'disabled'}>
            ${canRedeem ? 'Canjear' : `Faltan ${missing}`}
          </button>
        </span>
      </li>`;
    }).join('');

    els.holdNote.textContent = holdDays > 0
      ? `Las monedas que ganas quedan ${holdDays} días en espera antes de poder canjearse, por si la compra de tu invitado se reembolsa o se disputa.`
      : '';
    els.holdNote.classList.toggle('hidden', holdDays <= 0);

    renderInvited(overview);
    renderHistory(overview);
  }

  function renderInvited({ referrals, totals }) {
    els.invitedCount.textContent = totals.invited
      ? `${totals.invited} ${totals.invited === 1 ? 'invitado' : 'invitados'} · ${totals.paid} ${totals.paid === 1 ? 'compró' : 'compraron'}`
      : '';

    if (!referrals.length) {
      els.invited.innerHTML = '<li class="rf-empty">Todavía nadie se registró con tu código. Compártelo en tus lives, en tu perfil o con otros streamers.</li>';
      return;
    }

    els.invited.innerHTML = referrals.map((entry) => {
      let chip;
      if (entry.status === 'rewarded') chip = `<span class="rf-chip rf-chip--ok">Compró un plan · +${escapeHtml(coinsText(entry.coins))}</span>`;
      else if (entry.status === 'revoked') chip = '<span class="rf-chip rf-chip--warn">Recompensa revertida</span>';
      else chip = '<span class="rf-chip">Registrado, aún sin compra</span>';

      return `
      <li class="rf-item">
        <span class="rf-avatar" aria-hidden="true">${escapeHtml(String(entry.name).charAt(0))}</span>
        <span class="rf-item-main"><strong>${escapeHtml(entry.name)}</strong><small>Se registró el ${escapeHtml(formatDate(entry.joinedAt))}</small></span>
        ${chip}
      </li>`;
    }).join('');
  }

  function renderHistory({ history }) {
    if (!history.length) {
      els.history.innerHTML = '<li class="rf-empty">Aún no hay movimientos.</li>';
      return;
    }

    els.history.innerHTML = history.map((entry) => {
      const plan = entry.planId ? PLAN_LABELS[entry.planId] || entry.planId : '';
      let title;
      if (entry.kind === 'earn') title = `Recompensa por un invitado${plan ? ` (${plan})` : ''}`;
      else if (entry.kind === 'redeem') title = `Canje: ${plan || 'plan'}`;
      else title = 'Recompensa revertida';

      const waiting = entry.kind === 'earn' && new Date(entry.availableAt) > new Date();
      const note = waiting ? `En espera hasta el ${formatDate(entry.availableAt)}` : formatDate(entry.createdAt, true);
      const signClass = entry.coins > 0 ? 'rf-gain' : 'rf-spend';
      const sign = entry.coins > 0 ? '+' : '−';

      return `
      <li class="rf-item">
        <span class="rf-item-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(note)}</small></span>
        <span class="rf-amount ${signClass}">${sign}${Math.abs(entry.coins)}</span>
      </li>`;
    }).join('');
  }

  async function loadReferrals() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/api/referrals/me', { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar tus referidos.');
      overview = data;
      showError('');
      render();
    } catch (error) {
      showError(error.message);
    } finally {
      loading = false;
    }
  }

  async function copyText(text, button, doneLabel) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      // Sin permiso del portapapeles (o sin https): se selecciona el texto para copiarlo a mano.
      const range = document.createRange();
      range.selectNodeContents(button === els.copyCode ? els.code : els.link);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Selecciónalo y copia';
      setTimeout(() => { button.textContent = original; }, 2200);
      return;
    }
    button.textContent = doneLabel;
    setTimeout(() => { button.textContent = original; }, 1800);
  }

  async function redeem(planId, button) {
    if (redeeming || !overview) return;

    const cost = overview.costs[planId];
    const confirmed = await window.showAppConfirm(
      `Vas a cambiar ${coinsText(cost)} por el ${PLAN_LABELS[planId].toLowerCase()} (${PLAN_DETAIL[planId]}). Esto no se puede deshacer.`,
      'Canjear monedas',
      'Canjear',
      'Cancelar',
    );
    if (!confirmed) return;

    redeeming = true;
    section.querySelectorAll('.rf-redeem-btn').forEach((btn) => { btn.disabled = true; });
    if (button) button.textContent = 'Canjeando...';

    const requestId = pendingRequestIds[planId] || newRequestId();
    pendingRequestIds[planId] = requestId;

    try {
      const response = await fetch('/api/referrals/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ planId, requestId }),
      });
      const data = await response.json().catch(() => ({}));

      // Cualquier respuesta del servidor (bien o mal) cierra la solicitud; solo un corte de red la deja abierta.
      delete pendingRequestIds[planId];

      if (!response.ok) throw new Error(data.error || 'No se pudo canjear.');

      // Primero se actualiza el saldo y el plan que se ve en pantalla; despues se avisa.
      redeeming = false;
      if (typeof window.loadAccessStatus === 'function') window.loadAccessStatus();
      await loadReferrals();

      await window.showAppAlert(
        data.alreadyProcessed
          ? 'Ese canje ya estaba hecho: no se cobró dos veces.'
          : `¡Listo! Tu ${PLAN_LABELS[planId].toLowerCase()} ya está activo en tu cuenta.`,
        'Canje realizado',
      );
    } catch (error) {
      const offline = error instanceof TypeError;
      await window.showAppAlert(
        offline
          ? 'No pudimos confirmar el canje por un problema de conexión. Revisa tus movimientos y, si no aparece, vuelve a intentarlo: no se cobrará dos veces.'
          : error.message,
        'Canje',
      );
    } finally {
      if (redeeming) {
        redeeming = false;
        await loadReferrals();
      }
    }
  }

  els.copyCode.addEventListener('click', () => overview && copyText(overview.code, els.copyCode, '¡Copiado!'));
  els.copyLink.addEventListener('click', () => overview && copyText(inviteLink(overview.code), els.copyLink, '¡Enlace copiado!'));
  els.redeem.addEventListener('click', (event) => {
    const button = event.target.closest('.rf-redeem-btn');
    if (button && !button.disabled) redeem(button.dataset.plan, button);
  });

  window.loadReferrals = loadReferrals;
  // Si la pagina se abre directamente en #referralsSection, platform.js ya la muestra antes de que este script cargue.
  if (!section.classList.contains('hidden')) loadReferrals();
})();

// Recargar creditos (tokens) del Co-anfitrion IA: elegir pasarela -> escribir el presupuesto -> ver al instante cuantos tokens y
// respuestas da (con Haiku y con Sonnet) -> pagar en Wompi o MercadoPago. El servidor vuelve a calcular todo; esto solo muestra.
(function () {
  const $ = (id) => document.getElementById(id);
  const modal = $('ahTopup');
  if (!modal) return;

  const GATEWAY_NAMES = { wompi: 'Wompi', mercadopago: 'MercadoPago' };
  const state = { options: null, gateway: null, budget: 0, quoteTimer: null, quoteSeq: 0 };

  const fmt = (n) => Number(n || 0).toLocaleString('es');
  const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')} millones` : fmt(n));

  function setStep(step) {
    modal.dataset.step = step;
    $('ahTopupBack').hidden = step !== 'budget';
  }

  async function open() {
    modal.hidden = false;
    document.body.classList.add('ah-modal-open');
    state.gateway = null;
    setStep('gateway');
    $('ahTopupError').textContent = '';
    try {
      const response = await fetch('/api/ai-host/topup/options');
      state.options = await response.json();
      if (!response.ok) throw new Error(state.options.error || 'No se pudieron cargar las opciones.');
      for (const gateway of Object.keys(GATEWAY_NAMES)) {
        const button = modal.querySelector(`[data-gateway="${gateway}"]`);
        const available = Boolean(state.options.gateways?.[gateway]);
        button.disabled = !available;
        button.querySelector('small').textContent = available ? 'Tarjeta, PSE y más' : 'No disponible por ahora';
      }
      $('ahTopupBudget').min = state.options.minUsd;
      $('ahTopupBudget').max = state.options.maxUsd;
      $('ahTopupRange').textContent = `Entre $${state.options.minUsd} y $${state.options.maxUsd} USD`;
    } catch (error) {
      $('ahTopupError').textContent = error.message;
    }
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('ah-modal-open');
  }

  function chooseGateway(gateway) {
    state.gateway = gateway;
    $('ahTopupGatewayName').textContent = GATEWAY_NAMES[gateway];
    $('ahTopupPay').textContent = `Pagar con ${GATEWAY_NAMES[gateway]}`;
    setStep('budget');
    $('ahTopupBudget').focus();
    update();
  }

  // Conversion instantanea con la tarifa del servidor; el cobro en moneda local se pide con un pequeno retraso.
  function update() {
    const opts = state.options;
    const budget = Number($('ahTopupBudget').value);
    state.budget = budget;
    const valid = Number.isFinite(budget) && budget >= opts.minUsd && budget <= opts.maxUsd;
    const tokens = valid ? Math.floor(Math.round(budget * 100) * opts.tokensPerUsd / 100) : 0;

    $('ahTopupTokens').textContent = valid ? fmtTokens(tokens) : '—';
    $('ahTopupHaiku').textContent = valid ? fmt(Math.floor(tokens / opts.tokensPerResponse.haiku)) : '—';
    $('ahTopupSonnet').textContent = valid ? fmt(Math.floor(tokens / opts.tokensPerResponse.sonnet)) : '—';
    $('ahTopupPay').disabled = !valid;
    $('ahTopupCharge').textContent = '';
    $('ahTopupError').textContent = $('ahTopupBudget').value && !valid ? `El presupuesto debe estar entre $${opts.minUsd} y $${opts.maxUsd} USD.` : '';
    modal.querySelectorAll('[data-amount]').forEach((chip) => chip.classList.toggle('active', Number(chip.dataset.amount) === budget));

    clearTimeout(state.quoteTimer);
    if (!valid) return;
    const seq = ++state.quoteSeq;
    state.quoteTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/ai-host/topup/quote?budget=${encodeURIComponent(budget)}&gateway=${state.gateway}`);
        const data = await response.json();
        if (seq !== state.quoteSeq || !response.ok || !data.charge) return;
        const money = new Intl.NumberFormat('es', { style: 'currency', currency: data.charge.currency, maximumFractionDigits: data.charge.currency === 'COP' ? 0 : 2 }).format(data.charge.amount);
        $('ahTopupCharge').textContent = `Se cobrarán ≈ ${money} (${data.charge.currency}) según el cambio de hoy`;
      } catch (error) { /* es solo informativo */ }
    }, 350);
  }

  async function pay() {
    const button = $('ahTopupPay');
    button.disabled = true;
    $('ahTopupError').textContent = '';
    try {
      const response = await fetch('/api/ai-host/topup/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: state.gateway, budgetUsd: state.budget }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || 'No se pudo iniciar el pago.');
      window.location.href = data.url;
    } catch (error) {
      $('ahTopupError').textContent = error.message;
      button.disabled = false;
    }
  }

  // Al volver de la pasarela: se espera a que el aviso de pago llegue (el webhook puede tardar unos segundos)
  async function checkReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('topup');
    const paymentId = params.get('paymentId');
    if (!result || !paymentId) return;
    history.replaceState(null, '', window.location.pathname);
    if (result === 'cancel') { showNotice('Cancelaste la recarga. No se cobró nada.', 'info'); return; }

    showNotice('Confirmando tu pago con la pasarela...', 'info');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/status`);
        const data = await response.json();
        if (data.status === 'paid') {
          await refreshStatus();
          showNotice(`¡Recarga lista! Se sumaron ${fmt(data.topup_tokens)} tokens a tu cuenta.`, 'info');
          return;
        }
        if (data.status === 'failed') { showNotice('El pago fue rechazado. No se cobró ni se sumó nada.', 'warn'); return; }
      } catch (error) { /* se reintenta */ }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    showNotice('Tu pago todavía no se refleja. Si ya te cobraron, los tokens se sumarán solos en unos minutos.', 'warn');
  }

  $('ahTopupOpen').addEventListener('click', open);
  $('ahTopupClose').addEventListener('click', close);
  $('ahTopupBack').addEventListener('click', () => setStep('gateway'));
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) close(); });
  modal.querySelectorAll('[data-gateway]').forEach((button) => button.addEventListener('click', () => chooseGateway(button.dataset.gateway)));
  modal.querySelectorAll('[data-amount]').forEach((chip) => chip.addEventListener('click', () => { $('ahTopupBudget').value = chip.dataset.amount; update(); }));
  $('ahTopupBudget').addEventListener('input', update);
  $('ahTopupPay').addEventListener('click', pay);

  checkReturn();
})();

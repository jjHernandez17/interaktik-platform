// Aviso para el SUPERUSUARIO cuando Anthropic (respuestas del agente) o ElevenLabs (voz de IA) se quedan sin saldo o con la clave invalida.
// Para cualquier otro usuario el servidor responde 403/401 y este script se apaga solo, sin mostrar nada.
(function () {
  const POLL_MS = 60000;
  let timer = null;
  let dismissed = '';
  let bar = null;

  function ensureBar() {
    if (bar) return bar;
    const style = document.createElement('style');
    style.textContent = `
      .pa-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2000; display: grid; gap: 6px; padding: 10px 16px; background: #7f1d1d; color: #fff; border-bottom: 2px solid #f87171; font: 600 0.88rem/1.4 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
      .pa-bar[hidden] { display: none; }
      .pa-row { display: flex; align-items: flex-start; gap: 10px; }
      .pa-row span { flex: 1; }
      .pa-bar button { flex: none; cursor: pointer; border: 1px solid rgba(255,255,255,.5); background: transparent; color: #fff; border-radius: 8px; padding: 2px 10px; font: inherit; }
      .pa-bar button:hover { background: rgba(255,255,255,.15); }
    `;
    document.head.appendChild(style);
    bar = document.createElement('div');
    bar.className = 'pa-bar';
    bar.setAttribute('role', 'alert');
    bar.hidden = true;
    document.body.appendChild(bar);
    return bar;
  }

  function render(alerts) {
    const el = ensureBar();
    const signature = alerts.map((a) => `${a.provider}:${a.kind}:${a.at}`).join('|');
    if (!alerts.length || signature === dismissed) { el.hidden = true; return; }
    el.replaceChildren(...alerts.map((alert) => {
      const row = document.createElement('div');
      row.className = 'pa-row';
      const text = document.createElement('span');
      text.textContent = `⚠️ ${alert.message}`;
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Entendido';
      close.addEventListener('click', () => { dismissed = signature; el.hidden = true; });
      row.append(text, close);
      return row;
    }));
    el.hidden = false;
  }

  async function check() {
    try {
      const response = await fetch('/api/admin/provider-alerts');
      if (response.status === 401 || response.status === 403 || response.status === 404) { clearInterval(timer); return; } // no es superusuario
      if (!response.ok) return;
      const data = await response.json();
      render(Array.isArray(data.alerts) ? data.alerts : []);
    } catch (error) {
      // se vuelve a intentar en un minuto
    }
  }

  check();
  timer = setInterval(check, POLL_MS);
})();

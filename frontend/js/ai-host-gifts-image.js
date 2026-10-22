// Descargar la imagen de las reglas de regalos del Co-anfitrion IA: un PNG con FONDO TRANSPARENTE que lista cada regalo configurado con
// su imagen, su nombre y lo que hace el agente cuando lo mandan. Sirve para ponerla sobre el live (TikTok LIVE Studio) y que los
// espectadores sepan que regalo activa cada cosa. Se arma en el navegador con un <canvas>; las imagenes de los regalos se piden por nuestro
// servidor (/api/ai-host/gift-image) porque el CDN de TikTok no deja exportar un canvas con sus imagenes directamente.
(function () {
  const button = document.getElementById('ahGiftDownload');
  if (!button || !window.AiHostGiftRules) return;

  const RULE_ORDER = ['priority', 'advice', 'joke', 'flatter', 'shoot'];
  // Lo que hace cada regla, dicho para los espectadores
  const ACTION_TEXT = {
    priority: 'Tu mensaje se responde primero',
    advice: 'Te da un consejo',
    joke: 'Te cuenta un chiste',
    flatter: 'Te dedica un halago',
    shoot: 'Saca el arma y dispara a la cámara',
  };

  const SCALE = 2; // resolucion de la imagen (nitida en pantallas grandes)
  const FONT = '"Poppins", "Segoe UI", system-ui, -apple-system, sans-serif';
  const IMG = 96; // tamano de la imagen del regalo
  const PAD = 28;
  const ROW_GAP = 26;
  const COL_GAP = 60;
  const COL_WIDTH = 560;
  const TEXT_GAP = 22;
  const MAX_ROWS_PER_COLUMN = 8;

  const norm = (value) => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Un renglon por regalo (aunque este en varias reglas), ordenado de menos a mas monedas si se conoce el catalogo
  function buildRows(rules) {
    const byGift = new Map();
    for (const type of RULE_ORDER) {
      for (const name of rules[type] || []) {
        const key = norm(name);
        if (!key) continue;
        if (!byGift.has(key)) byGift.set(key, { name, types: [] });
        byGift.get(key).types.push(type);
      }
    }
    return [...byGift.values()]
      .map((row) => {
        const gift = window.AiHostGiftRules.findGift(row.name);
        return { ...row, name: gift?.name || row.name, imageUrl: gift?.imageUrl || '', coins: gift?.diamondCount ?? Number.MAX_SAFE_INTEGER };
      })
      .sort((a, b) => a.coins - b.coins);
  }

  async function loadImage(url) {
    if (!url) return null;
    try {
      const response = await fetch(`/api/ai-host/gift-image?url=${encodeURIComponent(url)}`);
      if (!response.ok) return null;
      return await createImageBitmap(await response.blob());
    } catch (error) {
      return null;
    }
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Texto legible sobre cualquier fondo (claro u oscuro) sin dibujar un fondo: contorno oscuro + relleno
  function outlinedText(ctx, text, x, y, fill) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8, 10, 24, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  async function renderCanvas(rows) {
    const bitmaps = await Promise.all(rows.map((row) => loadImage(row.imageUrl)));
    if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});

    const measure = document.createElement('canvas').getContext('2d');
    const textWidth = COL_WIDTH - IMG - TEXT_GAP;
    const NAME_FONT = `800 30px ${FONT}`;
    const ACTION_FONT = `600 22px ${FONT}`;

    // alto de cada renglon (el texto de la accion puede ocupar 2 lineas)
    const laid = rows.map((row, index) => {
      measure.font = ACTION_FONT;
      const action = row.types.map((type) => ACTION_TEXT[type]).join(' · ');
      const lines = wrapText(measure, action, textWidth).slice(0, 3);
      const textHeight = 38 + lines.length * 28;
      return { row, bitmap: bitmaps[index], lines, height: Math.max(IMG, textHeight) };
    });

    const columns = Math.ceil(laid.length / MAX_ROWS_PER_COLUMN);
    const perColumn = Math.ceil(laid.length / columns);
    const groups = Array.from({ length: columns }, (_, i) => laid.slice(i * perColumn, (i + 1) * perColumn));
    const groupHeights = groups.map((group) => group.reduce((sum, item) => sum + item.height, 0) + Math.max(0, group.length - 1) * ROW_GAP);

    const width = PAD * 2 + columns * COL_WIDTH + (columns - 1) * COL_GAP;
    const height = PAD * 2 + Math.max(...groupHeights);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE); // sin ctx.fillRect de fondo: el PNG queda transparente
    ctx.textBaseline = 'alphabetic';

    groups.forEach((group, columnIndex) => {
      let y = PAD;
      const x = PAD + columnIndex * (COL_WIDTH + COL_GAP);
      for (const item of group) {
        const top = y + (item.height - IMG) / 2;

        // imagen del regalo (con una sombra suave para que se vea sobre cualquier fondo)
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        if (item.bitmap) {
          const ratio = Math.min(IMG / item.bitmap.width, IMG / item.bitmap.height);
          const w = item.bitmap.width * ratio;
          const h = item.bitmap.height * ratio;
          ctx.drawImage(item.bitmap, x + (IMG - w) / 2, top + (IMG - h) / 2, w, h);
        } else {
          ctx.font = `${Math.round(IMG * 0.7)}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText('🎁', x + IMG / 2, top + IMG * 0.76);
        }
        ctx.restore();

        // nombre y lo que hace
        ctx.textAlign = 'left';
        const textTop = y + (item.height - (38 + item.lines.length * 28)) / 2;
        ctx.font = NAME_FONT;
        outlinedText(ctx, fitText(ctx, item.row.name, textWidth), x + IMG + TEXT_GAP, textTop + 28, '#ffffff');
        ctx.font = ACTION_FONT;
        item.lines.forEach((line, i) => outlinedText(ctx, line, x + IMG + TEXT_GAP, textTop + 38 + 22 + i * 28, '#ffe08a'));

        y += item.height + ROW_GAP;
      }
    });
    return canvas;
  }

  function alertUser(message) {
    if (typeof window.showAlert === 'function') window.showAlert(message, 'Reglas de regalos');
    else window.alert(message);
  }

  async function download() {
    const rows = buildRows(window.AiHostGiftRules.get());
    if (rows.length === 0) {
      alertUser('Todavía no hay regalos configurados. Agrega al menos un regalo en alguna regla.');
      return;
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparando imagen...';
    try {
      await window.AiHostGiftRules.ensureCatalog();
      const canvas = await renderCanvas(buildRows(window.AiHostGiftRules.get()));
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('El navegador no pudo crear la imagen.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'reglas-de-regalos.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (error) {
      alertUser(error.message || 'No se pudo crear la imagen.');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  button.addEventListener('click', download);
})();

// Snake Vs Snake — centra el nombre, los wins y el contador de manzanas
// respecto al TABLERO (canvas) y no respecto a la tarjeta completa.
//
// La columna de regalos va a un lado del tablero (a la izquierda en la
// serpiente 1, a la derecha en la 2) y tiene un ancho que cambia según los
// regalos configurados, así que el tablero queda corrido del centro de la
// tarjeta. Aquí solo se mueve el encabezado: no se toca el tablero ni la
// lógica del juego.
(function alignSnakeHeaders() {
  const cards = Array.from(document.querySelectorAll('.board-card'));
  if (!cards.length || typeof ResizeObserver === 'undefined') {
    return;
  }

  function align(card) {
    const header = card.querySelector('.card-header');
    const canvas = card.querySelector('.snake-board');
    if (!header || !canvas) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    if (!canvasRect.width || !headerRect.width) {
      return;
    }

    // La medida ya incluye el desplazamiento actual: se acumula la diferencia.
    const delta = (canvasRect.left + canvasRect.width / 2) - (headerRect.left + headerRect.width / 2);
    if (Math.abs(delta) < 0.5) {
      return;
    }

    const shift = (Number(header.dataset.alignShift) || 0) + delta;
    header.dataset.alignShift = String(shift);
    header.style.transform = `translateX(${shift}px)`;
  }

  function alignAll() {
    cards.forEach(align);
  }

  const resizeObserver = new ResizeObserver(alignAll);
  const mutationObserver = new MutationObserver(alignAll);

  cards.forEach((card) => {
    const body = card.querySelector('.board-body');
    const canvas = card.querySelector('.snake-board');
    const gifts = card.querySelector('.board-gifts');
    [card, body, canvas, gifts].forEach((element) => element && resizeObserver.observe(element));
    if (gifts) {
      mutationObserver.observe(gifts, { childList: true, subtree: true });
    }
    if (canvas) {
      mutationObserver.observe(canvas, { attributes: true, attributeFilter: ['width', 'height', 'style'] });
    }
  });

  window.addEventListener('resize', alignAll);
  document.addEventListener('fullscreenchange', alignAll);
  window.addEventListener('load', alignAll);
  alignAll();

  // El juego dimensiona el tablero y carga los regalos poco después de abrir
  // la página: se reintenta unas veces para quedar bien aunque el layout tarde.
  [150, 500, 1200, 2500].forEach((delay) => setTimeout(alignAll, delay));
})();

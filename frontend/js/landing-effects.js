function initLandingScrollReveal() {
  const revealElements = document.querySelectorAll('.scroll-reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      }
    },
    {
      threshold: 0.25,
    },
  );

  revealElements.forEach((element) => observer.observe(element));
}

function initFooterYear() {
  const yearEl = document.getElementById('footerYear');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

window.addEventListener('DOMContentLoaded', () => {
  initLandingScrollReveal();
  initFooterYear();
  initBackgroundEffects('.info-card, .hero-stats > div');
});

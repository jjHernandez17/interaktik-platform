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

window.addEventListener('DOMContentLoaded', initLandingScrollReveal);
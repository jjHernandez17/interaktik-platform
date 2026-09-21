const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("authMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = String(form.email.value || "").trim();
  const submitBtn = form.querySelector("button[type=submit]");

  submitBtn.disabled = true;
  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });
    await response.json().catch(() => ({}));
    setMessage("Si la cuenta existe, te enviamos un correo con el enlace para restablecer tu contrasena.");
    form.reset();
  } catch (_error) {
    setMessage("No se pudo enviar el correo. Intenta de nuevo.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

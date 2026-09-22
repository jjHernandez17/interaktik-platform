const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("authMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

function setButtonLoading(button, loading, originalHtml) {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    button.innerHTML = '<span class="pt-orbit pt-orbit--sm"><i><b></b></i><i><b></b></i></span>';
  } else if (typeof originalHtml === "string") {
    button.innerHTML = originalHtml;
  }
}

const submitBtn = form.querySelector("button[type=submit]");
const submitBtnOriginalHtml = submitBtn ? submitBtn.innerHTML : "";

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = String(form.email.value || "").trim();

  setButtonLoading(submitBtn, true);
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
    setButtonLoading(submitBtn, false, submitBtnOriginalHtml);
  }
});

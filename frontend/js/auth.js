const form = document.getElementById("authForm");
const message = document.getElementById("authMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

function ensureResendButton() {
  let btn = document.getElementById("resendVerificationBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "resendVerificationBtn";
  btn.type = "button";
  btn.textContent = "Reenviar correo de verificación";
  btn.style.marginTop = "10px";
  btn.style.width = "100%";
  message.insertAdjacentElement("afterend", btn);
  return btn;
}

function hideResendButton() {
  const btn = document.getElementById("resendVerificationBtn");
  if (btn) btn.remove();
}

async function resendVerification(email) {
  try {
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });
    await response.json().catch(() => ({}));
    setMessage("Si la cuenta existe y no ha sido verificada, te enviamos un nuevo correo.");
    hideResendButton();
  } catch (_error) {
    setMessage("No se pudo reenviar el correo. Intenta de nuevo.", true);
  }
}

// Mensajes al volver del link de verificacion (/api/auth/verify-email te trae aqui)
function showVerifyQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const verify = params.get("verify");
  if (!verify) return;

  const messages = {
    success: ["¡Correo verificado! Ya puedes iniciar sesión.", false],
    expired: ["El enlace de verificación venció. Pide uno nuevo iniciando sesión.", true],
    used: ["Ese enlace ya fue usado. Si no puedes entrar, pide uno nuevo.", true],
    not_found: ["Enlace de verificación inválido.", true],
    error: ["Ocurrió un error verificando tu correo. Intenta de nuevo.", true],
  };

  const [text, isError] = messages[verify] || messages.error;
  setMessage(text, isError);

  params.delete("verify");
  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", newUrl);
}

if (form) {
  showVerifyQueryMessage();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideResendButton();

    const mode = form.dataset.mode;
    const payload = {
      email: String(form.email.value || "").trim(),
      password: String(form.password.value || ""),
    };

    if (mode === "register") {
      payload.name = String(form.name.value || "").trim();
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setMessage(data.error, true);
          const resendBtn = ensureResendButton();
          resendBtn.onclick = () => resendVerification(payload.email);
          return;
        }
        throw new Error(data.error || "No se pudo completar la operacion.");
      }

      if (mode === "register" && data.requiresVerification) {
        setMessage("¡Cuenta creada! Revisa tu correo y confirma tu cuenta antes de iniciar sesión.");
        form.reset();
        return;
      }

      setMessage("Autenticacion correcta. Redirigiendo...");
      redirectWithLog("/platform.html", `Login exitoso para ${payload.email}`);
    } catch (error) {
      setMessage(error.message, true);
    }
  });
}

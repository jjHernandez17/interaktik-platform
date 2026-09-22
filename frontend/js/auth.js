const form = document.getElementById("authForm");
const message = document.getElementById("authMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

// Reemplaza el contenido del boton por el spinner de marca (pt-orbit)
// mientras dura la peticion, y lo devuelve a su texto original al terminar.
function setButtonLoading(button, loading, originalHtml) {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    button.innerHTML = '<span class="pt-orbit pt-orbit--sm"><i><b></b></i><i><b></b></i></span>';
  } else if (typeof originalHtml === "string") {
    button.innerHTML = originalHtml;
  }
}

function ensureResendButton() {
  let btn = document.getElementById("resendVerificationBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "resendVerificationBtn";
  btn.type = "button";
  btn.className = "btn-resend";
  btn.textContent = "Reenviar correo de verificación";
  message.insertAdjacentElement("afterend", btn);
  return btn;
}

function hideResendButton() {
  const btn = document.getElementById("resendVerificationBtn");
  if (btn) btn.remove();
}

async function resendVerification(email) {
  const btn = document.getElementById("resendVerificationBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando...";
  }

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
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Reenviar correo de verificación";
    }
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

// Mensaje al volver de reset-password.html tras restablecer la contrasena.
function showResetQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") !== "success") return;

  setMessage("¡Contrasena restablecida! Ya puedes iniciar sesion con tu nueva contrasena.");

  params.delete("reset");
  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", newUrl);
}

// Checklist de requisitos de contrasena, solo en el formulario de registro.
function setupPasswordRules() {
  const passwordInput = document.getElementById("passwordInput");
  const passwordConfirmInput = document.getElementById("passwordConfirmInput");
  const rulesList = document.getElementById("passwordRules");
  const submitBtn = document.getElementById("submitBtn");

  if (!passwordInput || !passwordConfirmInput || !rulesList || !submitBtn) {
    return null;
  }

  const ruleCheckers = {
    length: (value) => value.length >= 6,
    lower: (value) => /[a-z]/.test(value),
    upper: (value) => /[A-Z]/.test(value),
    number: (value) => /[0-9]/.test(value),
    special: (value) => /[^A-Za-z0-9]/.test(value),
    match: (value, confirmValue) => value.length > 0 && value === confirmValue,
  };

  function update() {
    const value = passwordInput.value;
    const confirmValue = passwordConfirmInput.value;
    let allValid = true;

    rulesList.querySelectorAll("li[data-rule]").forEach((item) => {
      const rule = item.dataset.rule;
      const checker = ruleCheckers[rule];
      const valid = checker ? checker(value, confirmValue) : false;
      item.classList.toggle("valid", valid);
      if (!valid) allValid = false;
    });

    submitBtn.disabled = !allValid;
    return allValid;
  }

  passwordInput.addEventListener("input", update);
  passwordConfirmInput.addEventListener("input", update);
  update();

  return update;
}

if (form) {
  showVerifyQueryMessage();
  showResetQueryMessage();
  const refreshPasswordRules = setupPasswordRules();
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitBtnOriginalHtml = submitBtn ? submitBtn.innerHTML : "";

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

    setButtonLoading(submitBtn, true);

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
          setButtonLoading(submitBtn, false, submitBtnOriginalHtml);
          setMessage(data.error, true);
          const resendBtn = ensureResendButton();
          resendBtn.onclick = () => resendVerification(payload.email);
          return;
        }
        throw new Error(data.error || "No se pudo completar la operacion.");
      }

      if (mode === "register" && data.requiresVerification) {
        // El orden importa: restaurar el boton ANTES de resetear el
        // formulario, para que setupPasswordRules() (llamado dentro de
        // refreshPasswordRules) sea quien decida el estado final de
        // disabled segun los campos ya vacios, no este helper.
        setButtonLoading(submitBtn, false, submitBtnOriginalHtml);
        setMessage("¡Cuenta creada! Revisa tu correo y confirma tu cuenta antes de iniciar sesión.");
        form.reset();
        if (refreshPasswordRules) refreshPasswordRules();
        return;
      }

      setMessage("Autenticacion correcta. Redirigiendo...");
      redirectWithLog("/platform.html", `Login exitoso para ${payload.email}`);
    } catch (error) {
      setButtonLoading(submitBtn, false, submitBtnOriginalHtml);
      setMessage(error.message, true);
    }
  });
}

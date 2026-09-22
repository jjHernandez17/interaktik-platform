const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("authMessage");
const invalidMessage = document.getElementById("resetInvalidMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

function getToken() {
  return new URLSearchParams(window.location.search).get("token") || "";
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

// Checklist de requisitos de contrasena, igual que en register.html.
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
}

async function init() {
  const token = getToken();

  if (!token) {
    form.hidden = true;
    invalidMessage.hidden = false;
    return;
  }

  setupPasswordRules();

  try {
    const response = await fetch(`/api/auth/check-reset-token?token=${encodeURIComponent(token)}`);
    const data = await response.json();

    if (!data.valid) {
      form.hidden = true;
      invalidMessage.hidden = false;
      return;
    }
  } catch (_error) {
    form.hidden = true;
    invalidMessage.hidden = false;
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  const submitBtnOriginalHtml = submitBtn ? submitBtn.innerHTML : "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword = String(form.newPassword.value || "");

    setButtonLoading(submitBtn, true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo restablecer la contrasena.");
      }

      setMessage("¡Contrasena actualizada! Redirigiendo a iniciar sesion...");
      form.reset();
      redirectWithLog("/login.html?reset=success", "Contrasena restablecida, redirigiendo a login");
    } catch (error) {
      setButtonLoading(submitBtn, false, submitBtnOriginalHtml);
      setMessage(error.message, true);
    }
  });
}

init();

const form = document.getElementById("authForm");
const message = document.getElementById("authMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#fca5a5" : "#86efac";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

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
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo completar la operacion.");
    }

    setMessage("Autenticacion correcta. Redirigiendo...");
    redirectWithLog("/platform.html", `Login exitoso para ${payload.email}`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

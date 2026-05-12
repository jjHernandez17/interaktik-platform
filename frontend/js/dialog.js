(function () {
  if (window.showAppAlert && window.showAppConfirm) {
    return;
  }

  const styleId = "app-dialog-styles";
  const rootId = "app-dialog-root";

  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .app-dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 4000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(2, 6, 23, 0.72);
        backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity 180ms ease;
      }

      .app-dialog-backdrop[hidden] {
        display: none !important;
      }

      .app-dialog-backdrop.open {
        opacity: 1;
      }

      .app-dialog-panel {
        width: min(480px, 100%);
        border-radius: 24px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 34%),
          radial-gradient(circle at top right, rgba(168, 85, 247, 0.16), transparent 28%),
          linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.96));
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
        color: #e2e8f0;
        overflow: hidden;
        transform: translateY(10px) scale(0.98);
        transition: transform 180ms ease;
      }

      .app-dialog-backdrop.open .app-dialog-panel {
        transform: translateY(0) scale(1);
      }

      .app-dialog-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 22px 22px 0;
      }

      .app-dialog-icon {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(168, 85, 247, 0.22));
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 1.15rem;
      }

      .app-dialog-heading {
        min-width: 0;
      }

      .app-dialog-title {
        margin: 0;
        font-size: 1.2rem;
        line-height: 1.2;
      }

      .app-dialog-message {
        margin: 10px 0 0;
        padding: 0 22px 22px 84px;
        color: #cbd5e1;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .app-dialog-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 0 22px 22px;
        flex-wrap: wrap;
      }

      .app-dialog-button {
        min-width: 112px;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 14px;
        padding: 12px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 140ms ease, filter 140ms ease, background 140ms ease, border-color 140ms ease;
      }

      .app-dialog-button:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
      }

      .app-dialog-button.ghost {
        color: #e2e8f0;
        background: rgba(15, 23, 42, 0.72);
      }

      .app-dialog-button.primary {
        color: white;
        border-color: rgba(56, 189, 248, 0.34);
        background: linear-gradient(135deg, #0ea5e9, #8b5cf6);
      }

      @media (max-width: 640px) {
        .app-dialog-panel {
          width: min(100%, 420px);
        }

        .app-dialog-message {
          padding-left: 22px;
        }

        .app-dialog-header {
          padding-bottom: 0;
        }

        .app-dialog-button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const root = document.createElement("div");
  root.id = rootId;
  root.className = "app-dialog-backdrop";
  root.hidden = true;
  root.innerHTML = `
    <div class="app-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle" aria-describedby="appDialogMessage" tabindex="-1">
      <div class="app-dialog-header">
        <div class="app-dialog-icon" aria-hidden="true">!</div>
        <div class="app-dialog-heading">
          <h2 id="appDialogTitle" class="app-dialog-title">Aviso</h2>
        </div>
      </div>
      <div id="appDialogMessage" class="app-dialog-message"></div>
      <div class="app-dialog-actions">
        <button id="appDialogCancelBtn" class="app-dialog-button ghost" type="button">Cancelar</button>
        <button id="appDialogConfirmBtn" class="app-dialog-button primary" type="button">Aceptar</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector(".app-dialog-panel");
  const titleNode = document.getElementById("appDialogTitle");
  const messageNode = document.getElementById("appDialogMessage");
  const cancelBtn = document.getElementById("appDialogCancelBtn");
  const confirmBtn = document.getElementById("appDialogConfirmBtn");

  let activeResolver = null;
  let activeType = "alert";
  const pendingQueue = [];

  function closeDialog(result) {
    if (!activeResolver) return;

    const resolver = activeResolver;
    activeResolver = null;
    root.classList.remove("open");
    root.hidden = true;
    document.removeEventListener("keydown", handleKeydown, true);
    resolver(result);
    requestAnimationFrame(processQueue);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(activeType !== "confirm");
    }
  }

  function openDialog(config) {
    activeType = config.type || "alert";
    titleNode.textContent = config.title || (activeType === "confirm" ? "Confirmación" : "Aviso");
    messageNode.textContent = config.message || "";
    confirmBtn.textContent = config.confirmText || (activeType === "confirm" ? "Aceptar" : "Entendido");
    cancelBtn.textContent = config.cancelText || "Cancelar";
    cancelBtn.hidden = activeType !== "confirm";

    root.hidden = false;
    requestAnimationFrame(() => {
      root.classList.add("open");
      panel.focus();
    });

    document.addEventListener("keydown", handleKeydown, true);

    cancelBtn.onclick = () => closeDialog(false);
    confirmBtn.onclick = () => closeDialog(true);
    root.onclick = (event) => {
      if (event.target === root) {
        closeDialog(activeType !== "confirm");
      }
    };
  }

  function processQueue() {
    if (activeResolver || pendingQueue.length === 0) {
      return;
    }

    const next = pendingQueue.shift();
    activeResolver = next.resolve;
    openDialog(next.config);
  }

  function enqueueDialog(config) {
    return new Promise((resolve) => {
      pendingQueue.push({ config, resolve });
      processQueue();
    });
  }

  window.showAppAlert = function showAppAlert(message, title = "Aviso") {
    return enqueueDialog({
      type: "alert",
      title,
      message: String(message || ""),
      confirmText: "Entendido",
    });
  };

  window.showAppConfirm = function showAppConfirm(message, title = "Confirmación", confirmText = "Aceptar", cancelText = "Cancelar") {
    return enqueueDialog({
      type: "confirm",
      title,
      message: String(message || ""),
      confirmText,
      cancelText,
    });
  };
})();

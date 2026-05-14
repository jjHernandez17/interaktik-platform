const MAX_TEAMS = 20;

const teamForm = document.getElementById("teamForm");
const giftForm = document.getElementById("giftForm");
const teamNameInput = document.getElementById("teamName");
const teamColorInput = document.getElementById("teamColor");
const giftPointsInput = document.getElementById("giftPoints");
const giftTeamSelect = document.getElementById("giftTeam");
const liveGiftSelect = document.getElementById("liveGiftSelect");
const teamsList = document.getElementById("teamsList");
const scoreboard = document.getElementById("scoreboard");
const scoreboardCard = document.getElementById("scoreboardCard");
const toggleScoreboardFullscreenBtn = document.getElementById("toggleScoreboardFullscreenBtn");
const historyList = document.getElementById("historyList");
const totalsSummary = document.getElementById("totalsSummary");

const clearTeamsBtn = document.getElementById("clearTeamsBtn");
const clearGiftsBtn = document.getElementById("clearGiftsBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const resetScoresBtn = document.getElementById("resetScoresBtn");
const applyGiftBtn = document.getElementById("applyGiftBtn");
const connectionForm = document.getElementById("connectionForm");
const tiktokUsernameInput = document.getElementById("tiktokUsername");
const linkBtn = document.getElementById("linkBtn");
const connectLiveBtn = document.getElementById("connectLiveBtn");
const loadCatalogBtn = document.getElementById("loadCatalogBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const connectionStatusBadge = document.getElementById("appConnectionStatusBadge");
const connectionDetails = document.getElementById("connectionDetails");
const giftCatalogPreviewImage = document.getElementById("giftCatalogPreviewImage");
const giftCatalogPreviewName = document.getElementById("giftCatalogPreviewName");
const giftCatalogPreviewMeta = document.getElementById("giftCatalogPreviewMeta");
const giftCatalogHint = document.getElementById("giftCatalogHint");
const giftCatalogToggle = document.getElementById("giftCatalogToggle");
const giftCatalogToggleName = document.getElementById("giftCatalogToggleName");
const giftCatalogMenu = document.getElementById("giftCatalogMenu");
const giftSearchInput = document.getElementById("giftSearchInput");
const giftCoinsFilterInput = document.getElementById("giftCoinsFilterInput");
const giftCatalogOptions = document.getElementById("giftCatalogOptions");
const giftRulesList = document.getElementById("giftRulesList");
const scoreAdjustModal = document.getElementById("scoreAdjustModal");
const scoreAdjustForm = document.getElementById("scoreAdjustForm");
const scoreAdjustAmountInput = document.getElementById("scoreAdjustAmountInput");
const scoreAdjustModalTitle = document.getElementById("scoreAdjustModalTitle");
const scoreAdjustModalDescription = document.getElementById("scoreAdjustModalDescription");
const scoreAdjustCancelBtn = document.getElementById("scoreAdjustCancelBtn");

const state = defaultState();
const connectionState = {
  status: "disconnected",
  uniqueId: "",
  roomId: "",
  lastError: "",
};
const scoreAdjustState = {
  teamId: null,
  direction: "add",
};
let liveEventsSource = null;
let selectedCatalogGiftId = "";
let giftNameFilter = "";
let giftCoinsFilter = "";
let isHydratingState = false;
let saveStateTimer = null;
let lastPersistedStateHash = "";
const processedLiveEventIds = new Map();
const processedLiveEventFingerprints = new Map();
const giftStreakProgress = new Map();
const liveGiftProgress = new Map();

async function showAlert(message, title) {
  if (window.showAppAlert) {
    return window.showAppAlert(message, title);
  }

  window.alert(message);
  return undefined;
}

async function showConfirm(message, title, confirmText, cancelText) {
  if (window.showAppConfirm) {
    return window.showAppConfirm(message, title, confirmText, cancelText);
  }

  return window.confirm(message);
}

function markLiveEventProcessed(eventId) {
  if (!eventId) return;
  const now = Date.now();
  processedLiveEventIds.set(eventId, now);

  // Keep only recent ids to avoid unbounded growth.
  const ttlMs = 2 * 60 * 1000;
  for (const [id, timestamp] of processedLiveEventIds.entries()) {
    if (now - timestamp > ttlMs) {
      processedLiveEventIds.delete(id);
    }
  }
}

function buildLiveEventFingerprint(payload) {
  const giftId = String(payload.giftId || payload.extendedGiftInfo?.id || "");
  const giftName = String(payload.giftName || payload.extendedGiftInfo?.giftName || "").trim().toLowerCase();
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEndNormalized = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === "1";
  const repeatEnd = String(repeatEndNormalized);
  const giftType = Number(payload.giftType ?? payload.giftDetails?.giftType ?? 0);
  const userId = String(payload.userId || payload.uniqueId || payload.nickname || "");
  const createTime = Number(payload.createTime || 0) || 0;
  const timeBucket = createTime > 0 ? Math.floor(createTime / 1000) : 0;

  return [giftId, giftName, repeatCount, repeatEnd, giftType, userId, timeBucket].join("|");
}

function markLiveEventFingerprintProcessed(fingerprint) {
  if (!fingerprint) return;
  const now = Date.now();
  processedLiveEventFingerprints.set(fingerprint, now);

  const ttlMs = 8 * 1000;
  for (const [key, timestamp] of processedLiveEventFingerprints.entries()) {
    if (now - timestamp > ttlMs) {
      processedLiveEventFingerprints.delete(key);
    }
  }
}

function hasProcessedLiveEventFingerprint(fingerprint) {
  if (!fingerprint) return false;
  return processedLiveEventFingerprints.has(fingerprint);
}

function hasProcessedLiveEvent(eventId) {
  if (!eventId) return false;
  return processedLiveEventIds.has(eventId);
}

function getLiveGiftProgressKey(payload, giftId, giftName, senderId) {
  return [
    senderId,
    giftId || normalizeGiftName(giftName),
    String(payload.nickname || payload.uniqueId || ""),
  ].join("|");
}

function pruneLiveGiftProgress(now = Date.now()) {
  const ttlMs = 15000;
  for (const [key, entry] of liveGiftProgress.entries()) {
    const receivedAt = Number(entry?.receivedAt || 0) || 0;
    if (!receivedAt || now - receivedAt > ttlMs) {
      liveGiftProgress.delete(key);
    }
  }
}

function defaultState() {
  return {
    teams: [
      { id: crypto.randomUUID(), name: "Equipo A", color: "#8b5cf6", score: 0 },
      { id: crypto.randomUUID(), name: "Equipo B", color: "#06b6d4", score: 0 },
    ],
    gifts: [],
    giftCatalog: [],
    history: [],
  };
}

function sanitizeLoadedState(payload) {
  const teams = Array.isArray(payload?.teams) ? payload.teams.slice(0, MAX_TEAMS) : [];
  const gifts = Array.isArray(payload?.gifts) ? payload.gifts : [];
  const history = Array.isArray(payload?.history) ? payload.history : [];

  return {
    teams,
    gifts,
    history,
  };
}

function hydrateState(nextState) {
  const normalized = sanitizeLoadedState(nextState);
  state.teams = normalized.teams;
  state.gifts = normalized.gifts;
  state.history = normalized.history;
}

function buildPersistableState() {
  return {
    teams: state.teams,
    gifts: state.gifts,
    history: state.history,
  };
}

async function saveStateToServer() {
  const payload = buildPersistableState();
  const payloadHash = JSON.stringify(payload);

  if (payloadHash === lastPersistedStateHash) {
    return;
  }

  const response = await fetch("/api/game-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: payloadHash,
  });

  if (!response.ok) {
    throw new Error("No se pudo guardar el estado del juego.");
  }

  lastPersistedStateHash = payloadHash;
}

function scheduleSaveState() {
  if (isHydratingState) {
    return;
  }

  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    saveStateToServer().catch((error) => {
      setConnectionStatus("error", "No se pudo guardar la configuracion del juego.", error.message);
    });
  }, 250);
}

async function loadStateFromServer() {
  isHydratingState = true;

  try {
    const response = await fetch("/api/game-state");
    if (!response.ok) {
      throw new Error("No se pudo cargar el estado del juego.");
    }

    const payload = await response.json();
    hydrateState(payload);
    lastPersistedStateHash = JSON.stringify(buildPersistableState());
  } catch (error) {
    // Si falla la carga remota, se usa el estado por defecto en memoria.
    console.warn(error);
  } finally {
    isHydratingState = false;
  }
}

function findTeam(teamId) {
  return state.teams.find((team) => team.id === teamId);
}

function findGiftRuleById(giftId) {
  return state.gifts.find((gift) => gift.giftId && String(gift.giftId) === String(giftId));
}

function normalizeGiftName(name) {
  return String(name || "").trim().toLowerCase();
}

function findGiftRuleByName(giftName) {
  const normalizedGiftName = normalizeGiftName(giftName);
  return state.gifts.find((gift) => normalizeGiftName(gift.name) === normalizedGiftName);
}

function pickFirstUrl(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstUrl(item);
      if (picked) return picked;
    }
    return "";
  }

  if (typeof value === "object") {
    return (
      pickFirstUrl(value.url) ||
      pickFirstUrl(value.urlList) ||
      pickFirstUrl(value.url_list) ||
      pickFirstUrl(value.urls) ||
      pickFirstUrl(value.uri) ||
      ""
    );
  }

  return "";
}

function getGiftImageUrl(gift) {
  return (
    pickFirstUrl(gift?.imageUrl) ||
    pickFirstUrl(gift?.giftImage) ||
    pickFirstUrl(gift?.previewImage) ||
    pickFirstUrl(gift?.icon) ||
    pickFirstUrl(gift?.giftLabelIcon) ||
    pickFirstUrl(gift?.image) ||
    pickFirstUrl(gift?.staticImage) ||
    pickFirstUrl(gift?.dynamicImage) ||
    ""
  );
}

function setCatalogPreview(gift) {
  if (!gift) {
    giftCatalogPreviewImage.removeAttribute("src");
    giftCatalogPreviewImage.alt = "Vista previa del regalo";
    giftCatalogPreviewName.textContent = "Selecciona un regalo";
    giftCatalogPreviewMeta.textContent = "Se mostrará su imagen y valor en monedas.";
    giftPointsInput.value = "1";
    return;
  }

  const imageUrl = getGiftImageUrl(gift);
  giftCatalogPreviewImage.src = imageUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHZpZXdCb3g9JzAgMCA2NCA2NCcgZmlsbD0nbm9uZScgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48cmVjdCB3aWR0aD0nNjQnIGhlaWdodD0nNjQnIHJ4PScxNicgZmlsbD0nIzExMTgyNScvPjxwYXRoIGQ9J00yMiAyOWwxMi04IDEyIDgtMTIgOC0xMiA4LTEyIDgtMTItOFonIGZpbGw9JyM5NGEzYjgnLz48L3N2Zz4=";
  giftCatalogPreviewImage.alt = gift.name;
  giftCatalogPreviewName.textContent = gift.name;
  giftCatalogPreviewMeta.textContent = `${gift.diamondCount} monedas${gift.id ? ` • ID ${gift.id}` : ""}`;
  giftPointsInput.value = String(gift.diamondCount || 1);
}

function getSelectedCatalogGift() {
  return state.giftCatalog.find((gift) => String(gift.id) === String(selectedCatalogGiftId || ""));
}

function getLiveGiftDisplayName(rule) {
  if (!rule) return "Regalo";
  return `${rule.name}${rule.teamId ? ` → ${findTeam(rule.teamId)?.name || "Equipo eliminado"}` : ""}`;
}

function setConnectionStatus(status, details = "", error = "") {
  connectionState.status = status;
  connectionState.lastError = error;

  if (status === "connected") {
    connectionStatusBadge.textContent = "Conectado";
  } else if (status === "connecting") {
    connectionStatusBadge.textContent = "Conectando...";
  } else if (status === "error") {
    connectionStatusBadge.textContent = "Error";
  } else {
    connectionStatusBadge.textContent = "Desconectado";
  }

  connectionStatusBadge.className = `status-badge ${status}`;

  if (details) {
    connectionDetails.textContent = details;
  } else if (status === "connected" && connectionState.uniqueId) {
    connectionDetails.textContent = `Conectado a @${connectionState.uniqueId}${connectionState.roomId ? ` • Room ${connectionState.roomId}` : ""}.`;
  } else if (status === "error" && error) {
    connectionDetails.textContent = error;
  } else {
    connectionDetails.textContent = "Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.";
  }
}

function sanitizeGiftCatalog(rawGifts) {
  return (Array.isArray(rawGifts) ? rawGifts : []).map((gift) => ({
    id: String(gift.id),
    name: gift.name || gift.giftName || `Regalo ID ${gift.id}`,
    diamondCount: Number(gift.diamondCount || gift.diamond_count || 1) || 1,
    imageUrl: gift.imageUrl || getGiftImageUrl(gift),
    giftType: gift.giftType ?? null,
  }));
}

function mergeCatalogIntoRules() {
  state.gifts = state.gifts.map((gift) => {
    if (gift.giftId && !gift.imageUrl) {
      const catalogGift = state.giftCatalog.find((item) => String(item.id) === String(gift.giftId));
      if (catalogGift) {
        return {
          ...gift,
          name: gift.name || catalogGift.name,
          diamondCount: gift.diamondCount || catalogGift.diamondCount,
          imageUrl: catalogGift.imageUrl || gift.imageUrl || "",
        };
      }
    }

    return gift;
  });
}

function pushHistoryEntry({ giftName, points, teamId = null, teamName = null, source = "manual", note = "" }) {
  state.history.unshift({
    id: crypto.randomUUID(),
    giftName,
    points,
    teamId,
    teamName,
    source,
    note,
    createdAt: new Date().toISOString(),
  });

  state.history = state.history.slice(0, 50);
}

function addHistoryEntry(gift, teamId, teamName, source = "manual", note = "") {
  pushHistoryEntry({
    giftName: gift.name,
    points: gift.points,
    teamId,
    teamName,
    source,
    note,
  });
}

function updateTeamScore(teamId, points, reason, source = "manual") {
  const team = findTeam(teamId);
  if (!team) return;

  team.score += points;
  pushHistoryEntry({
    giftName: reason,
    points,
    teamId,
    teamName: team.name,
    source,
  });

  render();
}

function applyGiftToTeam(gift, team, points, source = "live", note = "") {
  team.score += points;
  addHistoryEntry(gift, team.id, team.name, source, note);
  render();
}

function handleLiveGift(payload) {
  const giftId = payload.giftId ? String(payload.giftId) : payload.extendedGiftInfo?.id ? String(payload.extendedGiftInfo.id) : "";
  const giftName =
    payload.giftName ||
    payload.extendedGiftInfo?.giftName ||
    payload.giftDetails?.giftName ||
    payload.giftDetails?.name ||
    (giftId ? `Regalo ID ${giftId}` : "Regalo");
  const repeatCount = Number(payload.repeatCount || payload.giftCount || 1) || 1;
  const repeatEnd = payload.repeatEnd === true || payload.repeatEnd === 1 || payload.repeatEnd === "1";
  const senderId = String(payload.userId || payload.uniqueId || payload.nickname || "anonimo");
  const receivedAt = Date.now();

  pruneLiveGiftProgress(receivedAt);

  let appliedCount = repeatCount;
  const progressKey = getLiveGiftProgressKey(payload, giftId, giftName, senderId);
  const previousProgress = liveGiftProgress.get(progressKey);
  const progressWindowMs = 8000;

  if (previousProgress) {
    const previousCount = Number(previousProgress.repeatCount || 0) || 0;
    const previousReceivedAt = Number(previousProgress.receivedAt || 0) || 0;
    const isSameGiftSession =
      previousCount > 0 &&
      repeatCount >= previousCount &&
      (!previousReceivedAt || receivedAt - previousReceivedAt <= progressWindowMs);

    if (isSameGiftSession) {
      appliedCount = Math.max(0, repeatCount - previousCount);
    }
  }

  if (appliedCount === 0) {
    if (repeatEnd) {
      liveGiftProgress.delete(progressKey);
    }
    return;
  }

  liveGiftProgress.set(progressKey, {
    repeatCount,
    receivedAt,
  });

  if (repeatEnd) {
    liveGiftProgress.delete(progressKey);
  }

  const giftRule = giftId ? findGiftRuleById(giftId) : findGiftRuleByName(giftName);
  if (!giftRule || !giftRule.teamId) {
    pushHistoryEntry({
      giftName,
      points: 0,
      teamId: null,
      teamName: "Sin regla",
      source: "live",
      note: `${giftId ? `Gift ID ${giftId}` : giftName} llegó ${appliedCount} vez/veces, pero no existe una regla asignada.`,
    });
    render();
    return;
  }

  const team = findTeam(giftRule.teamId);
  if (!team) {
    pushHistoryEntry({
      giftName,
      points: 0,
      teamId: null,
      teamName: "Equipo eliminado",
      source: "live",
      note: "La regla existe, pero el equipo ya no está disponible.",
    });
    render();
    return;
  }

  const appliedPoints = giftRule.points * appliedCount;
  applyGiftToTeam(
    { name: giftRule.name || giftName, points: appliedPoints },
    team,
    appliedPoints,
    "live",
    appliedCount > 1 ? `Aplicado ${appliedCount} vez/veces.` : "Aplicado automáticamente desde TikTok Live.",
  );
}

async function fetchStatus() {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) return;

    const status = await response.json();
    connectionState.uniqueId = status.uniqueId || "";
    connectionState.roomId = status.roomId || "";
    setConnectionStatus(
      status.status || "disconnected",
      status.message || "",
      status.error || "",
    );

    if (status.status === "connected" && connectionState.uniqueId) {
      await loadGiftCatalog();
    }
  } catch (error) {
    setConnectionStatus("error", "No se pudo leer el estado del servidor local.", String(error));
  }
}

async function loadGiftCatalog() {
  try {
    const response = await fetch("/api/gifts");
    if (!response.ok) return;

    const payload = await response.json();
    state.giftCatalog = sanitizeGiftCatalog(payload.gifts);
    mergeCatalogIntoRules();
    syncGiftCatalog();
    renderGiftRules();
    render();
  } catch (error) {
    setConnectionStatus("error", "No se pudo cargar el catálogo de regalos.", String(error));
  }
}

async function preloadCatalogBeforeLive() {
  const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
  if (!uniqueId) {
    setConnectionStatus("error", "Debes escribir un usuario para cargar catálogo.");
    return;
  }

  setConnectionStatus("connecting", `Consultando catálogo de @${uniqueId}...`);

  try {
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniqueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo consultar el catálogo.");
    }

    state.giftCatalog = sanitizeGiftCatalog(payload.gifts);
    mergeCatalogIntoRules();
    render();

    if (payload.fromCache) {
      setConnectionStatus(
        "disconnected",
        payload.warning || "Se cargó el último catálogo guardado en cache.",
      );
    } else {
      setConnectionStatus("disconnected", payload.message || `Catálogo listo para @${uniqueId}.`);
    }
  } catch (error) {
    setConnectionStatus("error", "No se pudo cargar catálogo antes del live.", error.message);
  }
}

function startEventStream() {
  if (liveEventsSource) {
    liveEventsSource.close();
  }

  liveEventsSource = new EventSource("/events");

  liveEventsSource.addEventListener("status", (event) => {
    const payload = JSON.parse(event.data);
    connectionState.uniqueId = payload.uniqueId || "";
    connectionState.roomId = payload.roomId || "";
    setConnectionStatus(payload.status || "disconnected", payload.message || "", payload.error || "");
  });

  liveEventsSource.addEventListener("gift", (event) => {
    const payload = JSON.parse(event.data);
    handleLiveGift(payload);
  });

  liveEventsSource.addEventListener("giftCatalog", (event) => {
    const payload = JSON.parse(event.data);
    state.giftCatalog = sanitizeGiftCatalog(payload.gifts);
    mergeCatalogIntoRules();
    render();
  });

  liveEventsSource.addEventListener("error", () => {
    if (connectionState.status === "connected") {
      setConnectionStatus("connecting", "Reconectando al servidor local...");
    }
  });
}

async function connectToTikTok() {
  const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
  if (!uniqueId) return;

  setConnectionStatus("connecting", `Conectando a @${uniqueId}...`);

  try {
    const response = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniqueId }),
    });

    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 405) {
        throw new Error(
          `La app no está corriendo con el servidor. Asegúrate de que el servidor esté ejecutándose en ${window.API_BASE_URL}.`,
        );
      }
      throw new Error(payload.error || "No se pudo conectar.");
    }

    connectionState.uniqueId = payload.uniqueId || uniqueId;
    connectionState.roomId = payload.roomId || "";
    setConnectionStatus(
      payload.status || "connecting",
      payload.message || `Conectando a @${connectionState.uniqueId}...`,
      payload.error || "",
    );

    if (payload.status === "connected") {
      await loadGiftCatalog();
    }
  } catch (error) {
    setConnectionStatus("error", "No se pudo iniciar la conexión con TikTok Live.", error.message);
  }
}

async function saveLinkedTiktokUsername() {
  const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
  if (!uniqueId) return;

  try {
    await saveTiktokConnectionToDB();
    tiktokUsernameInput.value = `@${uniqueId}`;
    tiktokUsernameInput.disabled = true;
    if (linkBtn) linkBtn.disabled = true;
    if (connectLiveBtn) connectLiveBtn.disabled = false;
    setConnectionStatus("disconnected", `Cuenta vinculada a @${uniqueId}. Ahora puedes conectar el live.`);
  } catch (error) {
    setConnectionStatus("error", error.message || "No se pudo guardar la cuenta.");
    throw error;
  }
}

async function connectLiveFromSavedUsername() {
  const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
  if (!uniqueId) {
    setConnectionStatus("error", "Primero vincula y guarda tu cuenta de TikTok.");
    return;
  }

  if (connectLiveBtn) connectLiveBtn.disabled = true;
  await connectToTikTok();
  if (connectLiveBtn) connectLiveBtn.disabled = false;
}

async function disconnectFromTikTok() {
  try {
    const response = await fetch("/api/disconnect", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo desconectar.");
    }

    connectionState.uniqueId = "";
    connectionState.roomId = "";
    setConnectionStatus(payload.status || "disconnected", payload.message || "Conexión cerrada.");
  } catch (error) {
    setConnectionStatus("error", "No se pudo desconectar el flujo de TikTok Live.", error.message);
  }
}


async function saveTiktokConnectionToDB() {
  try {
    const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
    if (!uniqueId) return;

    const response = await fetch("/api/tiktok-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "app", tiktokUsername: uniqueId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se pudo guardar la cuenta.");
    }
  } catch (error) {
    console.error("[APP] Error saving TikTok connection to DB:", error.message);
    throw error;
  }
}

async function restoreTiktokConnection() {
  try {
    const response = await fetch("/api/tiktok-connection/app");
    if (!response.ok) return;

    const data = await response.json();
    if (data.connected && data.tiktok_username) {
      tiktokUsernameInput.value = `@${data.tiktok_username}`;
      tiktokUsernameInput.disabled = true;
      if (linkBtn) linkBtn.disabled = true;
      if (connectLiveBtn) connectLiveBtn.disabled = false;
      setConnectionStatus("disconnected", `Cuenta vinculada a @${data.tiktok_username}. Ahora puedes conectar el live.`);
    } else {
      tiktokUsernameInput.disabled = false;
      if (linkBtn) linkBtn.disabled = false;
      if (connectLiveBtn) connectLiveBtn.disabled = true;
      setConnectionStatus("disconnected", "Ingresa el nombre de usuario de TikTok que está transmitiendo en vivo.");
    }
  } catch (error) {
    console.error("[APP] Error restoring TikTok connection from DB:", error.message);
  }
}

async function deleteTiktokConnectionFromDB() {
  try {
    await fetch("/api/tiktok-connection/app", { method: "DELETE" });
  } catch (error) {
    console.error("[APP] Error deleting TikTok connection from DB:", error.message);
  }
}

function syncTeamSelects() {
  const previousValue = giftTeamSelect.value;
  const teamOptions = state.teams
    .map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`)
    .join("");

  giftTeamSelect.innerHTML =
    `<option value="">Selecciona un equipo</option>` + teamOptions;

  if (state.teams.some((team) => team.id === previousValue)) {
    giftTeamSelect.value = previousValue;
  } else if (state.teams.length > 0) {
    giftTeamSelect.value = state.teams[0].id;
  } else {
    giftTeamSelect.value = "";
  }
}

function syncGiftSelect() {
  if (!liveGiftSelect) return;

  const previousValue = liveGiftSelect.value;
  const options = state.gifts
    .map(
      (gift) =>
        `<option value="${gift.id}">${escapeHtml(gift.name)} → ${escapeHtml(findTeam(gift.teamId)?.name || "Sin equipo")} (+${gift.points})</option>`,
    )
    .join("");

  liveGiftSelect.innerHTML =
    options || `<option value="">No hay regalos configurados</option>`;

  if (state.gifts.some((gift) => gift.id === previousValue)) {
    liveGiftSelect.value = previousValue;
  }
}

function syncGiftCatalog() {
  const previousValue = selectedCatalogGiftId;

  if (state.giftCatalog.some((gift) => String(gift.id) === String(previousValue))) {
    selectedCatalogGiftId = previousValue;
  } else if (state.giftCatalog.length > 0) {
    selectedCatalogGiftId = state.giftCatalog[0].id;
  } else {
    selectedCatalogGiftId = "";
  }

  setCatalogPreview(getSelectedCatalogGift());
  renderGiftCatalogMenu();

  giftCatalogHint.textContent = state.giftCatalog.length
    ? `Catálogo cargado: ${state.giftCatalog.length} regalo(s) disponibles.`
    : "Conéctate a TikTok Live para cargar el catálogo de regalos disponibles.";
}

function updateGiftCatalogToggle(gift) {
  giftCatalogToggleName.textContent = gift ? gift.name : "Selecciona un regalo";
}

function closeGiftCatalogMenu() {
  if (giftCatalogMenu) giftCatalogMenu.classList.remove("open");
  if (giftCatalogToggle) giftCatalogToggle.setAttribute("aria-expanded", "false");
}

function openGiftCatalogMenu() {
  if (giftCatalogMenu) giftCatalogMenu.classList.add("open");
  if (giftCatalogToggle) giftCatalogToggle.setAttribute("aria-expanded", "true");
}

function toggleGiftCatalogMenu() {
  if (giftCatalogMenu && giftCatalogMenu.classList.contains("open")) {
    closeGiftCatalogMenu();
  } else {
    openGiftCatalogMenu();
  }
}

function renderGiftCatalogMenu() {
  if (!state.giftCatalog.length) {
    giftCatalogOptions.innerHTML = `<div class="empty">No hay regalos disponibles.</div>`;
    updateGiftCatalogToggle(null);
    return;
  }

  const currentGift = getSelectedCatalogGift();
  updateGiftCatalogToggle(currentGift || state.giftCatalog[0]);

  const normalizedNameFilter = giftNameFilter.trim().toLowerCase();
  const coinsFilterNumber = Number(giftCoinsFilter);
  const hasCoinsFilter = giftCoinsFilter.trim() !== "" && Number.isFinite(coinsFilterNumber);

  const filteredCatalog = state.giftCatalog.filter((gift) => {
    const matchesName = !normalizedNameFilter || String(gift.name).toLowerCase().includes(normalizedNameFilter);
    const giftCoins = Number(gift.diamondCount || 0);
    const matchesCoins = !hasCoinsFilter || giftCoins === coinsFilterNumber;
    return matchesName && matchesCoins;
  });

  giftSearchInput.value = giftNameFilter;
  giftCoinsFilterInput.value = giftCoinsFilter;

  if (!filteredCatalog.length) {
    giftCatalogOptions.innerHTML = `<div class="empty">No hay coincidencias para ese filtro.</div>`;
    return;
  }

  giftCatalogOptions.innerHTML = filteredCatalog
    .map((gift) => {
      const imageUrl = getGiftImageUrl(gift);
      const selected = String(gift.id) === String(selectedCatalogGiftId);
      return `
        <button
          type="button"
          class="gift-catalog-option ${selected ? "selected" : ""}"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
          data-gift-id="${escapeHtml(gift.id)}"
        >
          <img class="gift-catalog-option-image" src="${escapeHtml(imageUrl || "")}" alt="${escapeHtml(gift.name)}" onerror="this.style.display='none'" />
          <span class="gift-catalog-option-name">${escapeHtml(gift.name)}</span>
          <span class="gift-catalog-option-meta">${gift.diamondCount} monedas</span>
        </button>
      `;
    })
    .join("");

  giftCatalogOptions.querySelectorAll("[data-gift-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCatalogGiftId = button.getAttribute("data-gift-id") || "";
      const gift = getSelectedCatalogGift();
      updateGiftCatalogToggle(gift);
      setCatalogPreview(gift);
      renderGiftCatalogMenu();
      closeGiftCatalogMenu();
    });
  });
}

function renderGiftRules() {
  if (state.gifts.length === 0) {
    giftRulesList.innerHTML = `<div class="empty">Todavía no has creado reglas de regalos.</div>`;
    return;
  }

  giftRulesList.innerHTML = state.gifts
    .map((rule) => {
      const team = findTeam(rule.teamId);
      const imageUrl = rule.imageUrl || "";
      return `
        <div class="gift-rule-item team-item" data-rule-id="${rule.id}">
          <div class="team-main">
            <img class="gift-rule-thumb" src="${escapeHtml(imageUrl || '')}" alt="${escapeHtml(rule.name)}" onerror="this.style.display='none'" />
            <div>
              <strong class="team-name">${escapeHtml(rule.name)}</strong>
              <small class="gift-rule-meta">${escapeHtml(team?.name || "Sin equipo")} • ${rule.points} punto(s) • ID ${escapeHtml(rule.giftId || 'N/D')}</small>
            </div>
          </div>
          <div class="team-actions">
            <button class="btn danger small remove-rule" type="button">Eliminar</button>
          </div>
        </div>
      `;
    })
    .join("");

  giftRulesList.querySelectorAll("[data-rule-id]").forEach((row) => {
    const ruleId = row.getAttribute("data-rule-id");
    row.querySelector(".remove-rule").addEventListener("click", () => {
      state.gifts = state.gifts.filter((rule) => rule.id !== ruleId);
      render();
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  syncGiftCatalog();
  syncTeamSelects();
  syncGiftSelect();

  totalsSummary.textContent = `${state.teams.length} equipos • ${state.gifts.length} reglas • ${state.giftCatalog.length} regalos`;
  renderTeams();
  renderScoreboard();
  renderHistory();
  renderGiftRules();
  scheduleSaveState();
}

function renderTeams() {
  if (state.teams.length === 0) {
    teamsList.innerHTML = `<div class="empty">Todavía no has agregado equipos.</div>`;
    return;
  }

  teamsList.innerHTML = state.teams
    .map((team) => {
      const mappedGifts = state.gifts.filter((gift) => gift.teamId === team.id);
      return `
        <div class="team-item" data-team-id="${team.id}">
          <div class="team-main">
            <span class="team-dot" style="background:${team.color}; box-shadow: 0 0 0 5px ${team.color}26"></span>
            <div>
              <strong class="team-name">${escapeHtml(team.name)}</strong>
              <small class="team-meta">${mappedGifts.length} regalo(s) asignado(s)</small>
            </div>
          </div>
          <div class="team-actions">
            <button class="btn ghost small decrement" type="button">Quitar puntos</button>
            <button class="btn ghost small increment" type="button">Agregar puntos</button>
            <button class="btn danger small remove" type="button">Eliminar</button>
          </div>
        </div>
      `;
    })
    .join("");

  teamsList.querySelectorAll("[data-team-id]").forEach((row) => {
    const teamId = row.getAttribute("data-team-id");

    row.querySelector(".increment").addEventListener("click", () => {
      openScoreAdjustModal(teamId, "add");
    });

    row.querySelector(".decrement").addEventListener("click", () => {
      openScoreAdjustModal(teamId, "subtract");
    });

    row.querySelector(".remove").addEventListener("click", () => {
      removeTeam(teamId);
    });
  });
}

function renderScoreboard() {
  if (state.teams.length === 0) {
    scoreboard.innerHTML = `<div class="empty">Agrega equipos para ver el marcador.</div>`;
    scoreboard.style.removeProperty("--team-count");
    return;
  }

  const sortedTeams = [...state.teams].sort((a, b) => b.score - a.score);
  scoreboard.style.setProperty("--team-count", String(sortedTeams.length));
  const maxScore = Math.max(0, ...sortedTeams.map((team) => Number(team.score) || 0));
  const minTowerHeight = 160;
  const maxTowerHeight = 340;

  scoreboard.innerHTML = sortedTeams
    .map((team) => {
      const score = Number(team.score) || 0;
      const ratio = maxScore > 0 ? Math.max(0, score / maxScore) : 0;
      const towerHeight = Math.round(minTowerHeight + ratio * (maxTowerHeight - minTowerHeight));
      const towerLabel = score >= 0 ? `${score}` : `-${Math.abs(score)}`;

      return `
        <div class="score-tower-card" title="${escapeHtml(team.name)} · ${towerLabel} punto(s)">
          <div
            class="score-tower"
            style="height:${towerHeight}px; --tower-color:${escapeHtml(team.color)};"
          >
            <div class="score-tower-content">
              <div class="score-tower-points">${towerLabel}</div>
              <div class="score-tower-name">${escapeHtml(team.name)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderHistory() {
  if (state.history.length === 0) {
    historyList.innerHTML = `<div class="empty">Aún no hay regalos aplicados.</div>`;
    return;
  }

  historyList.innerHTML = state.history
    .slice(0, 20)
    .map((entry) => {
      const team = findTeam(entry.teamId);
      const sourceLabel = entry.source === "live" ? "TikTok Live" : "Manual";
      const teamLabel = entry.teamId ? (team?.name || entry.teamName || "Equipo eliminado") : (entry.teamName || "Sin equipo");
      return `
        <div class="history-item">
          <div>
            <strong>${escapeHtml(entry.giftName)} · ${entry.points > 0 ? "+" : ""}${entry.points} punto(s)</strong>
            <div>Equipo: ${escapeHtml(teamLabel)}</div>
            <div>Origen: ${escapeHtml(sourceLabel)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</div>
          </div>
          <time>${new Date(entry.createdAt).toLocaleString("es-ES")}</time>
        </div>
      `;
    })
    .join("");
}

function updateScoreboardFullscreenButton() {
  if (!toggleScoreboardFullscreenBtn || !scoreboardCard) return;
  const isFullscreen = document.fullscreenElement === scoreboardCard;
  toggleScoreboardFullscreenBtn.textContent = isFullscreen ? "Salir pantalla completa" : "Pantalla completa";
}

async function toggleScoreboardFullscreen() {
  if (!scoreboardCard) return;

  try {
    if (document.fullscreenElement === scoreboardCard) {
      await document.exitFullscreen();
    } else {
      await scoreboardCard.requestFullscreen();
    }
  } catch (error) {
    await showAlert("No se pudo cambiar a pantalla completa en este navegador.");
  }
}

function addHistoryEntry(gift, teamId, teamName, source = "manual", note = "") {
  pushHistoryEntry({
    giftName: gift.name,
    points: gift.points,
    teamId,
    teamName,
    source,
    note,
  });
}

function adjustTeamScore(teamId, points, reason, source = "manual") {
  updateTeamScore(teamId, points, reason, source);
}

function closeScoreAdjustModal() {
  if (!scoreAdjustModal) return;
  scoreAdjustModal.hidden = true;
  scoreAdjustState.teamId = null;
  scoreAdjustAmountInput.value = "1";
}

function openScoreAdjustModal(teamId, direction) {
  const team = findTeam(teamId);
  if (!team || !scoreAdjustModal) return;

  scoreAdjustState.teamId = teamId;
  scoreAdjustState.direction = direction;

  const isAdd = direction === "add";
  scoreAdjustModalTitle.textContent = isAdd ? "Agregar puntos" : "Quitar puntos";
  scoreAdjustModalDescription.textContent = `${isAdd ? "Suma" : "Resta"} puntos para ${team.name}.`;
  scoreAdjustAmountInput.value = "1";
  scoreAdjustModal.hidden = false;
  scoreAdjustAmountInput.focus();
  scoreAdjustAmountInput.select();
}

async function submitScoreAdjust(event) {
  event.preventDefault();

  const { teamId, direction } = scoreAdjustState;
  const team = findTeam(teamId);
  if (!team) {
    closeScoreAdjustModal();
    return;
  }

  const amount = Number(scoreAdjustAmountInput.value);
  if (!Number.isFinite(amount) || amount < 1) {
    await showAlert("La cantidad debe ser un número mayor o igual a 1.");
    return;
  }

  const normalizedAmount = Math.floor(amount);
  const signedPoints = direction === "subtract" ? -normalizedAmount : normalizedAmount;
  adjustTeamScore(team.id, signedPoints, "Ajuste manual");
  closeScoreAdjustModal();
}

async function removeTeam(teamId) {
  const team = findTeam(teamId);
  if (!team) return;

  const hasRelatedGifts = state.gifts.some((gift) => gift.teamId === teamId);
  const confirmationMessage = hasRelatedGifts
    ? `El equipo "${team.name}" tiene regalos vinculados. ¿Deseas eliminarlo y desvincular sus regalos?`
    : `¿Eliminar el equipo "${team.name}"?`;

  if (!(await showConfirm(confirmationMessage, "Eliminar equipo", "Eliminar", "Cancelar"))) return;

  state.teams = state.teams.filter((item) => item.id !== teamId);
  state.gifts = state.gifts.map((gift) =>
    gift.teamId === teamId ? { ...gift, teamId: null } : gift,
  );
  render();
}

function removeGift(giftId) {
  state.gifts = state.gifts.filter((gift) => gift.id !== giftId);
  render();
}

async function applyGift(giftId) {
  const gift = state.gifts.find((item) => item.id === giftId);
  if (!gift) {
    await showAlert("Selecciona un regalo válido.");
    return;
  }

  if (!gift.teamId) {
    await showAlert("Ese regalo todavía no tiene un equipo asignado.");
    return;
  }

  const team = findTeam(gift.teamId);
  if (!team) {
    await showAlert("El equipo asignado ya no existe.");
    return;
  }

  updateTeamScore(team.id, gift.points, gift.name, "manual");
}

teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.teams.length >= MAX_TEAMS) {
    await showAlert(`El limite maximo es de ${MAX_TEAMS} equipos.`);
    return;
  }

  const name = teamNameInput.value.trim();
  if (!name) return;

  state.teams.push({
    id: crypto.randomUUID(),
    name,
    color: teamColorInput.value,
    score: 0,
  });

  teamNameInput.value = "";
  render();
});

giftForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const selectedGift = getSelectedCatalogGift();
  const points = Number(giftPointsInput.value);
  const teamId = giftTeamSelect.value || null;

  if (!selectedGift || !Number.isFinite(points) || points < 1 || !teamId) return;

  const existingRuleIndex = state.gifts.findIndex((rule) => String(rule.giftId) === String(selectedGift.id));
  const rule = {
    id: existingRuleIndex >= 0 ? state.gifts[existingRuleIndex].id : crypto.randomUUID(),
    giftId: String(selectedGift.id),
    name: selectedGift.name,
    points,
    diamondCount: selectedGift.diamondCount,
    imageUrl: selectedGift.imageUrl,
    teamId,
  };

  if (existingRuleIndex >= 0) {
    state.gifts[existingRuleIndex] = rule;
  } else {
    state.gifts.push(rule);
  }

  selectedCatalogGiftId = selectedGift.id;
  render();
});

giftCatalogToggle.addEventListener("click", (event) => {
  event.preventDefault();
  toggleGiftCatalogMenu();
});

document.addEventListener("click", (event) => {
  if (giftCatalogToggle && giftCatalogMenu) {
    if (!giftCatalogToggle.contains(event.target) && !giftCatalogMenu.contains(event.target)) {
      closeGiftCatalogMenu();
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeGiftCatalogMenu();
    if (scoreAdjustModal && !scoreAdjustModal.hidden) {
      closeScoreAdjustModal();
    }
  }
});

giftSearchInput.addEventListener("input", () => {
  giftNameFilter = giftSearchInput.value;
  renderGiftCatalogMenu();
});

giftCoinsFilterInput.addEventListener("input", () => {
  giftCoinsFilter = giftCoinsFilterInput.value;
  renderGiftCatalogMenu();
});

scoreAdjustForm.addEventListener("submit", submitScoreAdjust);
scoreAdjustCancelBtn.addEventListener("click", closeScoreAdjustModal);
scoreAdjustModal.addEventListener("click", (event) => {
  if (event.target === scoreAdjustModal) {
    closeScoreAdjustModal();
  }
});

toggleScoreboardFullscreenBtn.addEventListener("click", toggleScoreboardFullscreen);
document.addEventListener("fullscreenchange", updateScoreboardFullscreenButton);

loadCatalogBtn.addEventListener("click", preloadCatalogBeforeLive);

if (applyGiftBtn && liveGiftSelect) {
  applyGiftBtn.addEventListener("click", async () => {
    await applyGift(liveGiftSelect.value);
  });
}

linkBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  const uniqueId = tiktokUsernameInput.value.trim().replace(/^@/, "");
  if (!uniqueId) {
    showAppAlert("Por favor ingresa un usuario de TikTok.", "Usuario requerido");
    return;
  }

  if (confirm(`¿Estás seguro de que quieres vincular el juego a @${uniqueId}?\n\nNo podrás cambiar esta cuenta después.`)) {
    await saveLinkedTiktokUsername();
  }
});

if (connectLiveBtn) {
  connectLiveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await connectLiveFromSavedUsername();
  });
}

disconnectBtn.addEventListener("click", async () => {
  await disconnectFromTikTok();
});

clearTeamsBtn.addEventListener("click", async () => {
  if (!(await showConfirm("¿Borrar todos los equipos?", "Borrar equipos", "Borrar", "Cancelar"))) return;
  state.teams = [];
  state.gifts = state.gifts.map((gift) => ({ ...gift, teamId: null }));
  render();
});

clearGiftsBtn.addEventListener("click", async () => {
  if (!(await showConfirm("¿Borrar todas las reglas de regalos?", "Borrar reglas", "Borrar", "Cancelar"))) return;
  state.gifts = [];
  render();
});

clearHistoryBtn.addEventListener("click", async () => {
  if (!(await showConfirm("¿Limpiar el registro reciente?", "Limpiar registro", "Limpiar", "Cancelar"))) return;
  state.history = [];
  render();
});

resetScoresBtn.addEventListener("click", async () => {
  if (!(await showConfirm("¿Reiniciar todos los puntos a cero?", "Reiniciar puntos", "Reiniciar", "Cancelar"))) return;
  state.teams = state.teams.map((team) => ({ ...team, score: 0 }));
  state.history = [];
  render();
});

async function initializeApp() {
  await loadStateFromServer();
  await restoreTiktokConnection();
  
  await fetchStatus();
  await loadGiftCatalog();
  startEventStream();
  render();
  updateScoreboardFullscreenButton();
}

initializeApp();

-- La partida: rounds, tiempo, marcador, campeon, y el puente con lo que llega de Interaktik (regalos y comentarios).
-- Lo que ven los jugadores sale de atributos en ReplicatedStorage.PeleaState y de los modelos de los luchadores.

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

local AI = require(script.Parent.AI)
local Combat = require(script.Parent.Combat)
local Config = require(script.Parent.Config)
local Effects = require(script.Parent.Effects)
local Fighter = require(script.Parent.Fighter)
local Net = require(script.Parent.Net)
local Powers = require(script.Parent.Powers)
local Styles = require(script.Parent.Styles)
local Util = require(script.Parent.Util)

local Match = {}
Match.__index = Match

local DEMO_NAMES = { "Ana", "Luis", "Marta", "Pedro", "Sofía", "Diego", "Valeria", "Camilo", "Laura", "Andrés" }

-- poderes de la demostracion: { poder, cantidad, duracion, peso }
local DEMO_POWERS = {
	{ "golpe", 90, 0, 5 },
	{ "hadouken", 80, 0, 4 },
	{ "curar", 160, 0, 3 },
	{ "escudo", 180, 0, 2 },
	{ "furia", 0, 10, 2 },
	{ "velocidad", 0, 10, 2 },
	{ "congelar", 0, 3, 1 },
	{ "meteoros", 5, 0, 1.5 },
	{ "super", 280, 0, 0.8 },
	{ "estilo", 0, 0, 1 },
}

local function setAttr(instance, name, value)
	if instance:GetAttribute(name) ~= value then
		instance:SetAttribute(name, value)
	end
end

local function normalizeSettings(raw)
	local defaults = Config.Defaults
	raw = type(raw) == "table" and raw or {}

	local function side(key)
		local base = defaults[key]
		local given = type(raw[key]) == "table" and raw[key] or {}
		return {
			name = (type(given.name) == "string" and given.name ~= "") and given.name or base.name,
			color = Util.hexToColor3(given.color, base.color),
			style = Styles.isValid(given.style) and given.style or base.style,
			keyword = type(given.keyword) == "string" and given.keyword or base.keyword,
		}
	end

	return {
		left = side("left"),
		right = side("right"),
		winGoal = Util.clamp(math.floor(tonumber(raw.winGoal) or defaults.winGoal), 1, 99),
		roundSeconds = Util.clamp(math.floor(tonumber(raw.roundSeconds) or defaults.roundSeconds), 20, 180),
		maxHealth = Util.clamp(math.floor(tonumber(raw.maxHealth) or defaults.maxHealth), 200, 5000),
		aiLevel = Util.clamp(math.floor(tonumber(raw.aiLevel) or defaults.aiLevel), 1, 3),
	}
end

-- env: { state = Folder, remotes = { Feed, Fx }, fightersFolder = Folder, arena = { setTeamColors } }
function Match.new(env)
	local self = setmetatable({}, Match)

	self.state = env.state
	self.remotes = env.remotes
	self.arena = env.arena
	self.fighters = {
		left = Fighter.new("left", env.fightersFolder),
		right = Fighter.new("right", env.fightersFolder),
	}
	self.fighters.left.enemy = self.fighters.right
	self.fighters.right.enemy = self.fighters.left
	for _, fighter in pairs(self.fighters) do
		fighter.onKO = function(f, attacker)
			self:onFighterKO(f, attacker)
		end
	end

	self.settings = normalizeSettings(nil)
	self.pendingSettings = nil
	self.score = { leftWins = 0, rightWins = 0, winGoal = self.settings.winGoal, championsLeft = 0, championsRight = 0 }
	self.supporters = { left = 0, right = 0 }
	self.joined = {}
	self.phase = "waiting"
	self.round = 0
	self.roundEndsAt = 0
	self.result = nil
	self.deferred = {}
	self.demo = true
	self.running = false
	self.nextDemoAt = 0
	self.bannerId = 0
	self.statusText = ""
	self.statusTone = "info"
	return self
end

-- ---------- lo que ven los clientes ----------

function Match:publish()
	local state = self.state
	local settings = self.settings
	local left, right = self.fighters.left, self.fighters.right

	setAttr(state, "Phase", self.phase)
	setAttr(state, "Round", self.round)
	setAttr(state, "RoundEndsAt", self.phase == "fight" and self.roundEndsAt or 0)
	setAttr(state, "RoundSeconds", settings.roundSeconds)
	setAttr(state, "Demo", self.demo)
	setAttr(state, "Status", self.statusText)
	setAttr(state, "StatusTone", self.statusTone)

	setAttr(state, "LeftName", settings.left.name)
	setAttr(state, "RightName", settings.right.name)
	setAttr(state, "LeftColor", settings.left.color)
	setAttr(state, "RightColor", settings.right.color)
	setAttr(state, "LeftStyle", left.style.label)
	setAttr(state, "RightStyle", right.style.label)

	setAttr(state, "LeftHealth", math.floor(left.health + 0.5))
	setAttr(state, "RightHealth", math.floor(right.health + 0.5))
	setAttr(state, "LeftMax", math.floor(left.maxHealth + 0.5))
	setAttr(state, "RightMax", math.floor(right.maxHealth + 0.5))
	setAttr(state, "LeftShield", math.floor(left.shield + 0.5))
	setAttr(state, "RightShield", math.floor(right.shield + 0.5))

	setAttr(state, "LeftWins", self.score.leftWins)
	setAttr(state, "RightWins", self.score.rightWins)
	setAttr(state, "WinGoal", self.score.winGoal)
	setAttr(state, "ChampsLeft", self.score.championsLeft)
	setAttr(state, "ChampsRight", self.score.championsRight)
	setAttr(state, "LeftSupporters", self.supporters.left)
	setAttr(state, "RightSupporters", self.supporters.right)
end

function Match:banner(text, sub)
	self.bannerId += 1
	self.state:SetAttribute("Banner", text)
	self.state:SetAttribute("BannerSub", sub or "")
	self.state:SetAttribute("BannerId", self.bannerId)
end

function Match:feed(text, side, kind)
	if self.remotes.Feed then
		self.remotes.Feed:FireAllClients(text, side, kind or "power")
	end
end

function Match:setStatus(text, tone)
	self.statusText = text or ""
	self.statusTone = tone or "info"
end

function Match:setDemo(flag)
	self.demo = flag
end

-- ---------- ajustes que llegan de la pagina ----------

-- payload = respuesta de /session: { settings, score, supporters }
function Match:applySession(payload)
	if type(payload) ~= "table" then
		return
	end

	if type(payload.settings) == "table" then
		self.pendingSettings = normalizeSettings(payload.settings)
	end

	if type(payload.score) == "table" and self.phase ~= "roundEnd" and self.phase ~= "champion" then
		local score = payload.score
		self.score.leftWins = tonumber(score.leftWins) or self.score.leftWins
		self.score.rightWins = tonumber(score.rightWins) or self.score.rightWins
		self.score.championsLeft = tonumber(score.championsLeft) or self.score.championsLeft
		self.score.championsRight = tonumber(score.championsRight) or self.score.championsRight
		self.score.winGoal = tonumber(score.winGoal) or self.score.winGoal
	end

	if type(payload.supporters) == "table" then
		self.supporters.left = math.max(self.supporters.left, tonumber(payload.supporters.left) or 0)
		self.supporters.right = math.max(self.supporters.right, tonumber(payload.supporters.right) or 0)
	end
end

-- Los nombres, colores y estilos nuevos se aplican entre rounds (reconstruye el cuerpo si cambia el color o el estilo)
function Match:applyPendingSettings()
	if self.pendingSettings then
		self.settings = self.pendingSettings
		self.pendingSettings = nil
		self.score.winGoal = self.settings.winGoal
	end

	for _, side in ipairs({ "left", "right" }) do
		local wanted = self.settings[side]
		local fighter = self.fighters[side]
		fighter.name = wanted.name
		if not fighter.model or fighter.styleId ~= wanted.style or fighter.color ~= wanted.color then
			fighter:build(wanted.name, wanted.color, wanted.style)
		end
	end
	self.arena.setTeamColors(self.settings.left.color, self.settings.right.color)
end

function Match:refreshAppearance()
	self:publish()
end

-- ---------- regalos y comentarios ----------

function Match:announcePower(item)
	local sideName = self.settings[item.side].name
	local who = (item.nickname and item.nickname ~= "") and item.nickname or "Alguien"
	self:feed(Powers.message(item.power, who, sideName), item.side, "power")
end

function Match:onJoin(item)
	local side = item.side
	if side ~= "left" and side ~= "right" then
		return
	end

	local id = item.uniqueId or item.nickname or ""
	local previous = self.joined[id]
	if previous == side then
		return
	end

	if previous then
		self.supporters[previous] = math.max(0, self.supporters[previous] - 1)
	end
	self.joined[id] = side
	self.supporters[side] += 1

	local who = (item.nickname and item.nickname ~= "") and item.nickname or "Alguien"
	self:feed(who .. " se unió a " .. self.settings[side].name, side, "join")
end

-- Un poder que llega cuando no hay pelea (entre rounds) espera al siguiente round
function Match:deferPower(item)
	local last = self.deferred[#self.deferred]
	if #self.deferred >= 40 and last and last.side == item.side and last.power == item.power then
		-- demasiados esperando: se juntan los iguales para que el round no empiece con una cola eterna
		last.amount = (last.amount or 0) + (item.amount or 0)
		last.duration = (last.duration or 0) + (item.duration or 0)
		return
	end
	table.insert(self.deferred, item)
end

function Match:flushDeferred()
	local items = self.deferred
	self.deferred = {}
	task.spawn(function()
		for _, item in ipairs(items) do
			if self.phase ~= "fight" then
				table.insert(self.deferred, item)
			else
				Util.safe("poder diferido", Powers.apply, self, item)
				task.wait(0.12)
			end
		end
	end)
end

-- item = { kind = "join" | "power", side, power, amount, duration, param, nickname, uniqueId }
function Match:handleItem(item)
	if item.kind == "join" then
		self:onJoin(item)
		return
	end

	if self.phase == "fight" then
		Util.safe("poder", Powers.apply, self, item)
	else
		self:deferPower(item)
	end
end

-- ---------- rounds ----------

function Match:onFighterKO(fighter, attacker)
	if self.phase ~= "fight" then
		return
	end
	self.result = { winner = Util.otherSide(fighter.side), reason = "ko" }
	self.phase = "ending"
end

function Match:decideByTime()
	local left, right = self.fighters.left:healthFraction(), self.fighters.right:healthFraction()
	if math.abs(left - right) < 0.01 then
		return { winner = "draw", reason = "time" }
	end
	return { winner = left > right and "left" or "right", reason = "time" }
end

function Match:step(dt)
	local now = Util.now()
	local fighting = self.phase == "fight"

	if fighting then
		for _, side in ipairs({ "left", "right" }) do
			AI.update(self.fighters[side], now, self.settings.aiLevel)
		end

		if self.demo and now >= self.nextDemoAt then
			self.nextDemoAt = now + 2.4 + math.random() * 3
			self:simulateGift()
		end

		if now >= self.roundEndsAt then
			self.result = self:decideByTime()
			self.phase = "ending"
			fighting = false
		end
	end

	for _, fighter in pairs(self.fighters) do
		fighter:update(now, dt, fighting)
	end

	if fighting or self.phase == "ending" then
		Combat.step(dt)
		self:separateFighters()
	end

	self:publish()
end

-- Los dos luchadores no se pueden atravesar: si estan en el suelo y muy juntos, se separan
local MIN_GAP = 2.6

function Match:separateFighters()
	local left, right = self.fighters.left, self.fighters.right
	local a, b = left.root, right.root
	if not a or not b or not left.alive or not right.alive then
		return
	end

	local delta = b.Position.X - a.Position.X
	if math.abs(delta) >= MIN_GAP or math.abs(b.Position.Y - a.Position.Y) > 2.2 then
		return
	end

	local direction = delta >= 0 and 1 or -1
	local push = (MIN_GAP - math.abs(delta)) / 2
	local half = Config.ArenaHalfWidth
	local ax = Util.clamp(a.Position.X - direction * push, -half, half)
	local bx = Util.clamp(b.Position.X + direction * push, -half, half)
	a.CFrame = a.CFrame + Vector3.new(ax - a.Position.X, 0, 0)
	b.CFrame = b.CFrame + Vector3.new(bx - b.Position.X, 0, 0)
end

-- Regalos de mentira para la demostracion
function Match:simulateGift()
	local total = 0
	for _, entry in ipairs(DEMO_POWERS) do
		total += entry[4]
	end
	local roll = math.random() * total
	local chosen = DEMO_POWERS[1]
	for _, entry in ipairs(DEMO_POWERS) do
		roll -= entry[4]
		if roll <= 0 then
			chosen = entry
			break
		end
	end

	local side = math.random() < 0.5 and "left" or "right"
	local name = DEMO_NAMES[math.random(1, #DEMO_NAMES)]
	if not self.joined[name] then
		self:onJoin({ kind = "join", side = side, nickname = name, uniqueId = name })
	end

	self:handleItem({
		kind = "power",
		side = self.joined[name] or side,
		power = chosen[1],
		amount = chosen[2],
		duration = chosen[3],
		param = chosen[1] == "estilo" and Styles.randomOther(self.fighters[side].styleId) or nil,
		nickname = name,
		uniqueId = name,
	})
end

function Match:resetFighters()
	local offset = Config.StartOffset
	self.fighters.left:resetForRound(self.settings.maxHealth, -offset)
	self.fighters.right:resetForRound(self.settings.maxHealth, offset)
end

function Match:playRound()
	self:applyPendingSettings()
	Combat.clear()

	self.round += 1
	self.result = nil
	self.phase = "intro"
	self:resetFighters()
	self:publish()

	self:banner("ROUND " .. self.round, self.settings.left.name .. "  VS  " .. self.settings.right.name)
	task.wait(Config.IntroSec * 0.65)
	self:banner("¡PELEA!", "")
	task.wait(Config.IntroSec * 0.35)

	self.roundEndsAt = Util.now() + self.settings.roundSeconds
	self.phase = "fight"
	self:flushDeferred()

	while self.phase == "fight" do
		task.wait(0.05)
	end

	self:finishRound()
end

-- Avisa del resultado al servidor (con reintentos). Devuelve la respuesta, o nil si no se pudo.
function Match:reportResult(winner)
	if self.demo or not Net.robloxUserId then
		return nil
	end

	local roundId = HttpService:GenerateGUID(false)
	for attempt = 1, 3 do
		local ok, data = Net.reportRound(winner, roundId)
		if ok and type(data) == "table" then
			return data
		end
		task.wait(0.6 * attempt)
	end
	return nil
end

-- Suma la victoria al marcador. Devuelve el lado campeon (o nil).
function Match:applyResult(winner, response)
	local score = self.score

	if response then
		score.leftWins = tonumber(response.leftWins) or score.leftWins
		score.rightWins = tonumber(response.rightWins) or score.rightWins
		score.winGoal = tonumber(response.winGoal) or score.winGoal
		score.championsLeft = tonumber(response.championsLeft) or score.championsLeft
		score.championsRight = tonumber(response.championsRight) or score.championsRight
		return response.champion
	end

	if winner == "left" then
		score.leftWins += 1
	elseif winner == "right" then
		score.rightWins += 1
	end

	local champion = nil
	if score.leftWins >= score.winGoal then
		champion = "left"
		score.championsLeft += 1
	elseif score.rightWins >= score.winGoal then
		champion = "right"
		score.championsRight += 1
	end
	return champion
end

function Match:finishRound()
	local result = self.result or { winner = "draw", reason = "time" }
	local left, right = self.fighters.left, self.fighters.right

	Combat.clear()
	self.phase = "roundEnd"
	self.deferred = {}

	local winnerFighter = result.winner ~= "draw" and self.fighters[result.winner] or nil
	local loserFighter = winnerFighter and winnerFighter.enemy or nil
	if loserFighter and loserFighter.alive then
		loserFighter.alive = false
		loserFighter:setState("ko", math.huge)
		loserFighter:setAction("ko", 0.8)
	end

	task.wait(0.7)

	if winnerFighter then
		winnerFighter:victory()
		local winnerName = self.settings[result.winner].name
		self:banner(result.reason == "ko" and "K.O." or "¡TIEMPO!", winnerName .. " gana el round")
	else
		left:victory()
		right:victory()
		self:banner("¡EMPATE!", "Nadie gana este round")
	end

	-- el aviso al servidor corre aparte para que el banner no espere a la red
	local response, answered = nil, false
	task.spawn(function()
		response = self:reportResult(result.winner)
		answered = true
	end)

	task.wait(Config.RoundEndSec - 0.7)
	local waited = 0
	while not answered and waited < 5 do
		task.wait(0.2)
		waited += 0.2
	end

	local champion = self:applyResult(result.winner, response)
	self:publish()

	if champion then
		self:celebrateChampion(champion)
	end
end

function Match:celebrateChampion(side)
	self.phase = "champion"
	local name = self.settings[side].name
	self:banner("¡" .. string.upper(name) .. " ES CAMPEÓN!", "Campeonatos: " .. self.score.championsLeft .. " - " .. self.score.championsRight)

	local winner = self.fighters[side]
	if winner.root then
		Effects.confetti(winner.root.Position)
		Effects.screen("flash", self.settings[side].color, 0.6)
	end
	self:feed("¡" .. name .. " ganó el campeonato!", side, "champion")

	task.wait(Config.ChampionSec * 0.5)
	if winner.root then
		Effects.confetti(winner.root.Position)
	end
	task.wait(Config.ChampionSec * 0.5)

	-- empieza un campeonato nuevo
	self.score.leftWins = 0
	self.score.rightWins = 0
end

-- ---------- ciclo de vida ----------

function Match:start()
	if self.running then
		return
	end
	self.running = true

	self.stepConnection = RunService.Heartbeat:Connect(function(dt)
		Util.safe("paso de la partida", self.step, self, dt)
	end)

	task.spawn(function()
		self:applyPendingSettings()
		while self.running do
			local ok, err = pcall(function()
				self:playRound()
			end)
			if not ok then
				warn("[PeleaCallejera] Error en un round: " .. tostring(err))
				self.phase = "waiting"
				task.wait(1.5)
			end
		end
	end)
end

function Match:stop()
	self.running = false
	if self.stepConnection then
		self.stepConnection:Disconnect()
		self.stepConnection = nil
	end
	Combat.clear()
	for _, fighter in pairs(self.fighters) do
		fighter:destroy()
	end
end

return Match

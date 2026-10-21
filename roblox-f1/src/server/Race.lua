-- Simulacion de la carrera (solo servidor). No mueve modelos: calcula donde va cada carro y se lo manda a los clientes, que
-- los dibujan (asi el servidor no tiene que replicar cientos de piezas por carro cada frame).
--
-- Fases: lobby (los espectadores se unen) -> countdown (semaforo) -> racing -> results -> lobby...

local HttpService = game:GetService("HttpService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("F1Shared")
local Config = require(Shared.Config)
local Path = require(Shared.Path)

local Race = {}

local env
local racers, byId, waitlist = {}, {}, {}
local phase = "lobby"
local phaseEndsAt = 0
local raceId = 0
local rosterVersion = 0
local raceStart = 0
local firstFinishAt = nil
local finishCount = 0
local demo = true
local statusText = ""
local lastLeaderId = nil
local lastLeaderFeedAt = -math.huge
local laneChangeCount = 0
local pending = {} -- poderes que llegaron fuera de la carrera: se aplican en cuanto se pone en verde
local pendingSettings = nil
local joinKeyword = "unirme"
local finalStandings = {}
local lights = {}
local rng = Random.new()
local nextBotAt = 0
local lastPublish, lastSnap = 0, 0

local PUBLISH_EVERY = 0.25
local SNAP_EVERY = 1 / 20
local BOT_NAMES = { "Rayo", "Turbo", "Fenix", "Cometa", "Trueno", "Halcon", "Vortex", "Nitro", "Jaguar", "Blaze", "Orion", "Zeta", "Lobo", "Mamba", "Titan", "Pixel", "Sonic", "Apex", "Drift", "Kira" }

local function now()
	return os.clock()
end

local function feed(text, kind)
	if env and env.feed then
		env.feed:FireAllClients(text, kind or "info")
	end
end

local function cleanName(name)
	local text = tostring(name or ""):gsub("[%c]", ""):sub(1, 22)
	if text == "" then
		return "Piloto"
	end
	return text
end

-- ---------- semaforo ----------

local function setLights(count, go)
	for i, part in ipairs(lights) do
		if go then
			part.Color = Color3.fromRGB(60, 255, 90)
		elseif i <= count then
			part.Color = Color3.fromRGB(255, 30, 30)
		else
			part.Color = Color3.fromRGB(120, 15, 15)
		end
	end
end

-- ---------- corredores ----------

local function laneCenter(lane)
	return Path.laneOffset(lane)
end

local function addRacer(id, name, robloxUserId)
	local slot = #racers + 1
	local lane, dist = Path.gridSlot(slot)
	local racer = {
		id = id,
		name = cleanName(name),
		slot = slot,
		team = (slot - 1) % Config.TeamCount + 1,
		number = slot,
		robloxUserId = tonumber(robloxUserId), -- con cuenta de Roblox: corre con su skin; sin ella, skin aleatoria
		lane = lane,
		homeLane = lane, -- su carril: solo lo deja para adelantar y luego vuelve
		passing = nil,
		lateral = laneCenter(lane),
		latVel = 0,
		dist = dist,
		speed = 0,
		base = rng:NextNumber(0.97, 1.03),
		seed = rng:NextNumber(0, 100),
		cool = 0,
		turboUntil = 0,
		slowUntil = 0,
		shieldUntil = 0,
		finished = false,
		finishTime = nil,
		place = nil,
	}
	table.insert(racers, racer)
	byId[id] = racer
	rosterVersion += 1
	return racer
end

local function standings()
	local list = table.clone(racers)
	table.sort(list, function(a, b)
		if a.finished ~= b.finished then
			return a.finished
		end
		if a.finished and b.finished then
			return a.finishTime < b.finishTime
		end
		return a.dist > b.dist
	end)
	return list
end

local function lapOf(racer)
	return math.clamp(math.floor(racer.dist / Path.total) + 1, 1, Config.Laps)
end

-- ---------- fases ----------

local function startLobby()
	if pendingSettings then
		Config.Laps = pendingSettings.laps
		Config.LobbySec = pendingSettings.lobbySec
		pendingSettings = nil
	end
	phase = "lobby"
	phaseEndsAt = now() + Config.LobbySec
	finalStandings = {}
	firstFinishAt = nil
	finishCount = 0
	lastLeaderId = nil
	setLights(0, false)

	-- los que esperaban entran primero
	local pending = waitlist
	waitlist = {}
	for _, entry in ipairs(pending) do
		if #racers < Config.MaxRacers and not byId[entry.id] then
			addRacer(entry.id, entry.name, entry.robloxUserId)
		else
			table.insert(waitlist, entry)
		end
	end
	nextBotAt = now() + 1.5
end

local function startCountdown()
	phase = "countdown"
	phaseEndsAt = now() + Config.CountdownSec
	raceId += 1
	feed("🚦 ¡Prepárense! La carrera de " .. #racers .. " pilotos va a comenzar", "info")
end

local function startRacing()
	phase = "racing"
	raceStart = now()
	setLights(0, true)
	feed("🏁 ¡VERDE! ¡A correr!", "good")
	flushPending()
end

local function finishRace()
	phase = "results"
	phaseEndsAt = now() + Config.ResultsSec
	local list = standings()
	finalStandings = {}
	for place, racer in ipairs(list) do
		racer.place = racer.place or place
		table.insert(finalStandings, {
			id = racer.id,
			name = racer.name,
			place = place,
			finished = racer.finished,
			time = racer.finishTime,
		})
	end
	if list[1] then
		feed("🏆 ¡" .. list[1].name .. " gana la carrera!", "good")
	end
	if env.onRaceEnd then
		task.spawn(env.onRaceEnd, raceId, finalStandings)
	end
end

local function clearRacers()
	racers, byId = {}, {}
	rosterVersion += 1
end

-- ---------- poderes ----------

local function findRacer(query)
	if byId[tostring(query)] then
		return byId[tostring(query)]
	end
	local active = {}
	for _, r in ipairs(standings()) do
		if not r.finished then
			table.insert(active, r)
		end
	end
	if #active == 0 then
		return nil
	end
	if query == "leader" then
		return active[1]
	elseif query == "last" then
		return active[#active]
	elseif query == "random" then
		return active[rng:NextInteger(1, #active)]
	end
	return nil
end

local function applyNow(racer, kind, seconds, by)
	local t = now()
	local sender = by and (by .. " → ") or ""

	if kind == "turbo" then
		racer.turboUntil = math.max(racer.turboUntil, t) + seconds
		feed("🚀 " .. sender .. racer.name .. " recibe TURBO", "good")
	elseif kind == "slow" then
		if racer.shieldUntil > t then
			feed("🛡️ El escudo de " .. racer.name .. " bloqueó el ataque", "info")
			return true
		end
		racer.slowUntil = math.max(racer.slowUntil, t) + seconds
		feed("🛢️ " .. sender .. racer.name .. " se resbala con aceite", "bad")
	elseif kind == "shield" then
		racer.shieldUntil = math.max(racer.shieldUntil, t) + seconds
		feed("🛡️ " .. sender .. racer.name .. " activa un ESCUDO", "good")
	else
		return false
	end
	return true
end

local function isWaiting(id)
	for _, entry in ipairs(waitlist) do
		if entry.id == tostring(id) then
			return true
		end
	end
	return false
end

-- Un regalo que llega antes de que empiece la carrera (o para alguien que espera la siguiente) no se pierde: se guarda y se
-- aplica en cuanto se pone en verde.
local function queuePending(query, kind, seconds, by)
	if #pending >= 200 then
		table.remove(pending, 1)
	end
	table.insert(pending, { query = query, kind = kind, seconds = seconds, by = by, at = now() })
end

local function flushPending()
	local keep = {}
	for _, entry in ipairs(pending) do
		local racer = findRacer(entry.query)
		if racer and not racer.finished then
			applyNow(racer, entry.kind, entry.seconds, entry.by)
		elseif isWaiting(entry.query) and now() - entry.at < 600 then
			table.insert(keep, entry)
		end
	end
	pending = keep
end

-- kind: "turbo" | "slow" | "shield". query: id del corredor, "leader", "last" o "random".
function Race.applyEffect(query, kind, seconds, by)
	if kind ~= "turbo" and kind ~= "slow" and kind ~= "shield" then
		return false, "Poder no valido"
	end
	seconds = math.clamp(tonumber(seconds) or 5, 1, 60)

	if phase ~= "racing" then
		queuePending(query, kind, seconds, by)
		return true, "queued"
	end

	local racer = findRacer(query)
	if not racer then
		if isWaiting(query) then
			queuePending(query, kind, seconds, by)
			return true, "queued"
		end
		return false, "Corredor no encontrado"
	end
	if racer.finished then
		return false, "Ya termino"
	end
	return applyNow(racer, kind, seconds, by)
end

function Race.has(id)
	return byId[tostring(id)] ~= nil or isWaiting(id)
end

-- ---------- uniones ----------

-- Un espectador se une. Devuelve ok, motivo ("joined" | "waitlist" | "already" | "full")
function Race.join(id, name, robloxUserId)
	id = tostring(id)
	if byId[id] then
		return false, "already"
	end
	for _, entry in ipairs(waitlist) do
		if entry.id == id then
			return false, "already"
		end
	end

	if phase == "lobby" and #racers < Config.MaxRacers then
		local racer = addRacer(id, name, robloxUserId)
		feed("🏎️ " .. racer.name .. " se une a la parrilla (#" .. racer.slot .. ")", "good")
		return true, "joined"
	end

	if #waitlist >= Config.MaxRacers then
		return false, "full"
	end
	table.insert(waitlist, { id = id, name = cleanName(name), robloxUserId = tonumber(robloxUserId) })
	feed("⏳ " .. cleanName(name) .. " entra a la siguiente carrera", "info")
	return true, "waitlist"
end

-- ---------- fisica ----------

local function laneFree(racer, lane)
	local center = laneCenter(lane)
	for _, other in ipairs(racers) do
		if other ~= racer then
			local gap = math.abs(other.dist - racer.dist)
			if gap < 20 and (math.abs(other.lateral - center) < Config.CarLateralGap + 1 or other.lane == lane) then
				return false
			end
		end
	end
	return true
end

local function tryLaneChange(racer, force)
	local options = {}
	if racer.lane > 1 then
		table.insert(options, racer.lane - 1)
	end
	if racer.lane < Config.Lanes then
		table.insert(options, racer.lane + 1)
	end
	if #options == 2 and rng:NextNumber() < 0.5 then
		options[1], options[2] = options[2], options[1]
	end
	if force then
		-- bloqueado: tambien se mira saltar dos carriles
		for _, delta in ipairs({ -2, 2 }) do
			local lane = racer.lane + delta
			if lane >= 1 and lane <= Config.Lanes then
				table.insert(options, lane)
			end
		end
	end
	for _, lane in ipairs(options) do
		if laneFree(racer, lane) then
			racer.lane = lane
			racer.cool = force and 1.2 or 2
			laneChangeCount += 1
			return true
		end
	end
	return false
end

local function stepRacing(dt)
	local t = now()
	local order = table.clone(racers)
	table.sort(order, function(a, b)
		return a.dist > b.dist
	end)
	local leaderDist = order[1] and order[1].dist or 0
	local totalDist = Path.total * Config.Laps

	for idx, racer in ipairs(order) do
		if racer.finished then
			racer.speed += math.clamp(Config.BaseSpeed * racer.base - racer.speed, -Config.Brake * dt, Config.Accel * dt)
		else
			-- la velocidad no depende de la curva: nadie frena en ningun momento
			local target = Config.BaseSpeed * racer.base
			local gap = leaderDist - racer.dist
			target *= 1 + math.clamp(gap / 900, 0, 0.04) - (idx == 1 and 0.01 or 0)
			target *= 1 + 0.02 * math.noise(t * 0.15, racer.seed)
			if racer.turboUntil > t then
				target *= Config.TurboMul
			end
			if racer.slowUntil > t then
				target *= Config.SlowMul
			end

			-- Cada carro va por su carril. Solo lo deja para adelantar a uno que le estorba (nunca frena) y, cuando ya lo
			-- pasó, vuelve a su carril.
			racer.cool = math.max(0, racer.cool - dt)
			local blocker = nil
			for k = idx - 1, math.max(1, idx - 6), -1 do
				local other = order[k]
				local ahead = other.dist - racer.dist
				if ahead > 48 then
					break
				end
				if ahead >= 0 and math.abs(other.lateral - racer.lateral) < Config.CarLateralGap and other.speed < racer.speed + 4 then
					blocker = other
					break
				end
			end
			local capSpeed = nil
			if blocker then
				local moved = false
				if racer.cool <= 0 and tryLaneChange(racer, true) then
					racer.passing = blocker
					moved = true
				end
				-- si no hay carril libre para adelantar, solo se evita chocar con el de adelante (no se frena antes)
				local gapAhead = blocker.dist - racer.dist
				if not moved and gapAhead < 26 then
					-- un carro mide ~17: se mantiene a ~20 studs del de adelante (si queda mas cerca, se abre el hueco)
					capSpeed = blocker.speed + (gapAhead - 20) * 1.5
				end
			end

			if racer.passing then
				local passed = racer.passing
				if passed.finished or passed.dist < racer.dist - 26 then
					racer.passing = nil
				end
			end
			if not blocker and not racer.passing and racer.lane ~= racer.homeLane and racer.cool <= 0 then
				-- de vuelta a su carril, un carril a la vez y solo si esta libre
				local nextLane = racer.lane + (racer.homeLane > racer.lane and 1 or -1)
				if laneFree(racer, nextLane) then
					racer.lane = nextLane
					racer.cool = 1.2
				end
			end

			racer.speed += math.clamp(target - racer.speed, -Config.Brake * dt, Config.Accel * dt)
			if capSpeed and racer.speed > capSpeed then
				racer.speed = math.max(capSpeed, racer.speed - 60 * dt)
			end
		end

		local goal = laneCenter(racer.lane)
		-- el cambio de carril acelera y frena suave (sin tirones laterales)
		local wantedVel = math.clamp((goal - racer.lateral) * 2.4, -Config.LaneChangeSpeed, Config.LaneChangeSpeed)
		racer.latVel += math.clamp(wantedVel - racer.latVel, -45 * dt, 45 * dt)
		racer.lateral += racer.latVel * dt
		-- speed es velocidad real sobre el suelo: en una curva el carril de afuera recorre mas, asi que avanza menos "metros de eje"
		local denominator = math.max(0.35, 1 + Path.curvatureAt(racer.dist) * racer.lateral)
		racer.dist += racer.speed * dt / denominator

		if not racer.finished and racer.dist >= totalDist then
			racer.finished = true
			racer.finishTime = t - raceStart
			finishCount += 1
			racer.place = finishCount
			firstFinishAt = firstFinishAt or t
			feed(string.format("🏁 %s termina en el puesto %d (%.1fs)", racer.name, finishCount, racer.finishTime), "good")
		end
	end

	-- aviso cuando cambia el lider
	local leader = standings()[1]
	if leader and not leader.finished and leader.id ~= lastLeaderId then
		-- los cambios de lider muy seguidos (carros parejos) no se anuncian todos
		if lastLeaderId and t - lastLeaderFeedAt > 8 then
			lastLeaderFeedAt = t
			feed("🥇 " .. leader.name .. " toma la punta", "info")
		end
		lastLeaderId = leader.id
	end

	local allDone = true
	for _, racer in ipairs(racers) do
		if not racer.finished then
			allDone = false
			break
		end
	end
	if allDone or (firstFinishAt and t - firstFinishAt > Config.FinishWaitSec) or t - raceStart > Config.MaxRaceSec then
		finishRace()
	end
end

-- ---------- publicacion a los clientes ----------

local function publish()
	local list = standings()
	local top = {}
	local leader = list[1]
	for i = 1, math.min(10, #list) do
		local r = list[i]
		table.insert(top, { i = r.slot, n = r.name, l = lapOf(r), f = r.finished, t = r.finishTime and math.floor(r.finishTime * 10) / 10 or nil, tm = r.team })
	end
	local roster = {}
	for _, r in ipairs(racers) do
		table.insert(roster, { n = r.name, tm = r.team, num = r.number, uid = r.robloxUserId, sk = math.floor(r.seed * 10000) })
	end
	local results = {}
	if phase == "results" then
		for i = 1, math.min(10, #finalStandings) do
			local r = finalStandings[i]
			table.insert(results, { n = r.name, p = r.place, f = r.finished, t = r.time and math.floor(r.time * 10) / 10 or nil })
		end
	end

	env.state.Value = HttpService:JSONEncode({
		ph = phase,
		left = math.max(0, math.ceil(phaseEndsAt - now())),
		lap = leader and lapOf(leader) or 1,
		laps = Config.Laps,
		n = #racers,
		max = Config.MaxRacers,
		wait = #waitlist,
		rid = raceId,
		rv = rosterVersion,
		roster = roster,
		top = top,
		res = results,
		demo = demo,
		kw = joinKeyword,
		msg = statusText,
	})
end

local function snapshot()
	local data = table.create(#racers * 5)
	for i, r in ipairs(racers) do
		local t = now()
		local flags = 0
		if r.turboUntil > t then
			flags += 1
		end
		if r.slowUntil > t then
			flags += 2
		end
		if r.shieldUntil > t then
			flags += 4
		end
		if r.finished then
			flags += 8
		end
		data[#data + 1] = r.slot
		data[#data + 1] = math.floor(r.dist * 10) / 10
		data[#data + 1] = math.floor(r.lateral * 10) / 10
		data[#data + 1] = math.floor(r.speed * 10) / 10
		data[#data + 1] = flags
	end
	env.snap:FireAllClients(workspace:GetServerTimeNow(), data)
end

-- ---------- ciclo ----------

function Race.step(dt)
	local t = now()

	if phase == "lobby" then
		if demo and #racers < Config.DemoBots and t >= nextBotAt then
			nextBotAt = t + 1.2
			local index = #racers + 1
			Race.join("bot" .. index, BOT_NAMES[(index - 1) % #BOT_NAMES + 1])
		end
		if t >= phaseEndsAt then
			if #racers >= Config.MinRacers then
				startCountdown()
			else
				phaseEndsAt = t + 8
			end
		end
	elseif phase == "countdown" then
		local left = phaseEndsAt - t
		setLights(math.clamp(Config.CountdownSec - math.ceil(left) + 1, 0, #lights), false)
		if left <= 0 then
			startRacing()
		end
	elseif phase == "racing" then
		stepRacing(dt)
	elseif phase == "results" then
		if t >= phaseEndsAt then
			clearRacers()
			startLobby()
		end
	end

	if t - lastSnap >= SNAP_EVERY then
		lastSnap = t
		snapshot()
	end
	if t - lastPublish >= PUBLISH_EVERY then
		lastPublish = t
		publish()
	end
end

function Race.setDemo(value)
	if demo == value then
		return
	end
	demo = value
	-- al cambiar de modo se reinicia la parrilla para no mezclar bots con espectadores reales
	if phase == "lobby" then
		clearRacers()
		waitlist = {}
	end
end

-- Ajustes de la pagina de Interaktik (vueltas, segundos de parrilla, palabra para unirse). Se aplican en la siguiente parrilla.
function Race.configure(settings)
	if type(settings) ~= "table" then
		return
	end
	joinKeyword = tostring(settings.joinKeyword or "unirme")
	pendingSettings = {
		laps = math.clamp(math.floor(tonumber(settings.laps) or Config.Laps), 1, 10),
		lobbySec = math.clamp(math.floor(tonumber(settings.lobbySeconds) or Config.LobbySec), 10, 120),
	}
end

function Race.setStatus(text)
	statusText = text or ""
end

-- Solo para pruebas en Studio: velocidad minima y maxima, carros fuera de su carril, cambios de carril y carros encimados
function Race.debugSpeeds()
	local low, high, off, overlaps = math.huge, 0, 0, 0
	for i, r in ipairs(racers) do
		low = math.min(low, r.speed)
		high = math.max(high, r.speed)
		if r.lane ~= r.homeLane then
			off += 1
		end
		for j = i + 1, #racers do
			local o = racers[j]
			if math.abs(o.dist - r.dist) < 14 and math.abs(o.lateral - r.lateral) < 8 then
				overlaps += 1
			end
		end
	end
	return low, high, off, laneChangeCount, overlaps
end

function Race.debugPairs()
	local out = {}
	for i, r in ipairs(racers) do
		for j = i + 1, #racers do
			local o = racers[j]
			if math.abs(o.dist - r.dist) < 14 and math.abs(o.lateral - r.lateral) < 8 then
				table.insert(out, string.format("%s(l%d/h%d d%.0f lat%.0f v%.0f) %s(l%d/h%d d%.0f lat%.0f v%.0f)", r.name, r.lane, r.homeLane, r.dist, r.lateral, r.speed, o.name, o.lane, o.homeLane, o.dist, o.lateral, o.speed))
			end
		end
	end
	return table.concat(out, " ; ")
end

-- Solo para pruebas en Studio: termina la carrera ya
function Race.debugFinish()
	if phase == "racing" then
		finishRace()
	end
end

function Race.isDemo()
	return demo
end

function Race.getPhase()
	return phase
end

function Race.init(environment)
	env = environment
	Path.load(env.track)

	for _, descendant in ipairs(env.track:GetDescendants()) do
		if descendant:IsA("BasePart") and descendant:GetAttribute("StartLight") then
			table.insert(lights, descendant)
		end
	end
	table.sort(lights, function(a, b)
		return a:GetAttribute("StartLight") < b:GetAttribute("StartLight")
	end)

	startLobby()
	publish()
end

return Race

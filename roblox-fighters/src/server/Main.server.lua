-- Pelea Callejera para Interaktik: dos luchadores pelean solos en una arena y los regalos de TikTok Live los ayudan.
--
-- Como instalarlo: este Script (con todo lo que trae dentro) va en ServerScriptService.
-- Activa "Allow HTTP Requests" en Game Settings > Security para que hable con Interaktik.
-- Sin cuenta vinculada (o sin HTTP) el juego corre en modo demostracion con regalos de mentira.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterPlayer = game:GetService("StarterPlayer")

local Arena = require(script.Arena)
local Config = require(script.Config)
local Effects = require(script.Effects)
local Match = require(script.Match)
local Net = require(script.Net)
local Util = require(script.Util)

-- No hay avatares de jugadores: el jugador solo mira la pelea
Players.CharacterAutoLoads = false

-- ---------- lo que se comparte con los clientes ----------

local function ensureFolder(parent, name)
	local folder = parent:FindFirstChild(name)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = name
		folder.Parent = parent
	end
	return folder
end

local stateFolder = ensureFolder(ReplicatedStorage, "PeleaState")
local remotesFolder = ensureFolder(ReplicatedStorage, "PeleaRemotes")

local function ensureRemote(name)
	local remote = remotesFolder:FindFirstChild(name)
	if not remote then
		remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = remotesFolder
	end
	return remote
end

local remotes = { Feed = ensureRemote("Feed"), Fx = ensureRemote("Fx") }

-- El script del cliente (camara, pantalla y animaciones) viaja dentro de este Script y se copia a cada jugador
local clientTemplate = script:FindFirstChild("Client")
-- Los jugadores no tienen personaje (la camara es fija), asi que con "StreamingEnabled" no les llegaria nada del mundo.
-- Este punto invisible en el centro de la arena es lo que el servidor les manda como foco.
local focusPart = Instance.new("Part")
focusPart.Name = "PeleaFocus"
focusPart.Anchored = true
focusPart.CanCollide = false
focusPart.CanQuery = false
focusPart.Transparency = 1
focusPart.Size = Vector3.one
focusPart.Position = Vector3.new(0, 6, 0)
focusPart.Parent = workspace

local function giveClient(player)
	pcall(function()
		player.ReplicationFocus = focusPart
	end)
	if not clientTemplate then
		warn("[PeleaCallejera] Falta la carpeta Client dentro del Script principal")
		return
	end
	local scripts = player:FindFirstChild("PlayerScripts")
	if scripts and not scripts:FindFirstChild("PeleaCallejeraClient") then
		local copy = clientTemplate:Clone()
		copy.Name = "PeleaCallejeraClient"
		copy.Parent = scripts
	end
end

if clientTemplate then
	local starterScripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
	if starterScripts and not starterScripts:FindFirstChild("PeleaCallejeraClient") then
		local copy = clientTemplate:Clone()
		copy.Name = "PeleaCallejeraClient"
		copy.Parent = starterScripts
	end
end
for _, player in ipairs(Players:GetPlayers()) do
	giveClient(player)
end

-- ---------- el mundo ----------

local fightersFolder = ensureFolder(workspace, "Fighters")
local effectsFolder = ensureFolder(workspace, "PeleaEffects")
local arena = Arena.build(workspace)
Effects.init(effectsFolder, remotes.Fx)

local match = Match.new({
	state = stateFolder,
	remotes = remotes,
	fightersFolder = fightersFolder,
	arena = arena,
})
match:publish()
match:start()

-- ---------- cuenta de Roblox del que juega ----------

local owner = nil
local live = false

local function setOwner(player)
	owner = player
	live = false
	Net.robloxUserId = player and player.UserId or nil
	match:setDemo(true)
end

Players.PlayerAdded:Connect(function(player)
	giveClient(player)
	if not owner then
		setOwner(player)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	if player == owner then
		local others = {}
		for _, other in ipairs(Players:GetPlayers()) do
			if other ~= player then
				table.insert(others, other)
			end
		end
		setOwner(others[1])
	end
end)

for _, player in ipairs(Players:GetPlayers()) do
	if not owner then
		setOwner(player)
	end
end

-- ---------- ajustes y marcador (cada cierto tiempo) ----------

task.spawn(function()
	while true do
		local delay = Config.SessionRetrySec

		if not owner then
			match:setStatus("", "info")
		elseif not Net.httpEnabled() then
			live = false
			match:setDemo(true)
			match:setStatus("Modo demostración: activa HTTP Requests en Game Settings > Security para conectar con Interaktik.", "warn")
		else
			Net.robloxUserId = owner.UserId
			local ok, data = Net.getSession()

			if ok and type(data) == "table" and data.ready then
				if not live then
					live = true
					match:setDemo(false)
				end
				match:setStatus("", "ok")
				match:applySession(data)
				delay = Config.SessionIntervalSec
			elseif ok and type(data) == "table" then
				live = false
				match:setDemo(true)
				if data.linked == false then
					match:setStatus("Modo demostración: tu cuenta de Roblox (ID " .. tostring(owner.UserId) .. ") no está vinculada. Vincúlala en interaktik.com > Pelea Callejera.", "warn")
				else
					match:setStatus("Modo demostración: tu prueba o plan de Interaktik venció.", "warn")
				end
			else
				-- sin red o el servidor tardo: si ya estaba conectado no se interrumpe la partida
				if not live then
					match:setDemo(true)
				end
				match:setStatus("No se pudo hablar con Interaktik (" .. tostring(data) .. "). Reintentando...", "warn")
			end
		end

		task.wait(delay)
	end
end)

-- ---------- regalos y comentarios (cada segundo) ----------

local seen = {}
local seenOrder = {}

local function remember(id)
	seen[id] = true
	table.insert(seenOrder, id)
	if #seenOrder > 3000 then
		seen[table.remove(seenOrder, 1)] = nil
	end
end

task.spawn(function()
	while true do
		if live and owner and Net.robloxUserId then
			local ok, data = Net.pollQueue()
			if ok and type(data) == "table" and type(data.items) == "table" and #data.items > 0 then
				local ids = {}
				for _, item in ipairs(data.items) do
					table.insert(ids, item.id)
					-- el servidor repite lo que no se confirmo: lo ya aplicado se descarta por su id
					if not seen[item.id] then
						remember(item.id)
						Util.safe("evento de la cola", match.handleItem, match, item)
					end
				end

				local confirmed = false
				for _ = 1, 3 do
					local ackOk = Net.ack(ids)
					if ackOk then
						confirmed = true
						break
					end
					task.wait(0.4)
				end
				if not confirmed then
					warn("[PeleaCallejera] No se pudo confirmar la cola; el servidor la volvera a enviar")
				end
			end
		end
		task.wait(Config.QueueIntervalSec)
	end
end)

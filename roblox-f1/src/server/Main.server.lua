-- Carrera de Formula 1 para Interaktik: hasta 20 espectadores de TikTok corren en una pista de 4 carriles y los regalos les
-- dan turbo, escudo o los frenan con aceite.
--
-- Como instalarlo: este Script (con todo lo que trae dentro) va en ServerScriptService. La pista (carpeta "F1Track") debe estar
-- en Workspace (la crea roblox-f1/src/build/TrackBuilder.lua). En Game Settings > Security activa "Allow HTTP Requests".
-- Sin cuenta vinculada (o sin HTTP) corre en modo demostracion con pilotos y regalos de mentira.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterPlayer = game:GetService("StarterPlayer")

-- No hay avatares: el jugador solo mira la carrera
Players.CharacterAutoLoads = false

local function ensure(parent, className, name)
	local item = parent:FindFirstChild(name)
	if not item then
		item = Instance.new(className)
		item.Name = name
		item.Parent = parent
	end
	return item
end

-- ---------- lo que se comparte con los clientes ----------

-- Modulos compartidos (Config, Path, CarBuilder) viajan dentro de este Script y se copian a ReplicatedStorage
local sharedFolder = ensure(ReplicatedStorage, "Folder", "F1Shared")
for _, module in ipairs(script.Shared:GetChildren()) do
	if not sharedFolder:FindFirstChild(module.Name) then
		module:Clone().Parent = sharedFolder
	end
end

local Config = require(sharedFolder.Config)
local Race = require(script.Race)
local Net = require(script.Net)

local stateValue = ensure(ReplicatedStorage, "StringValue", "F1State")
local remotes = ensure(ReplicatedStorage, "Folder", "F1Remotes")
local snapRemote = ensure(remotes, "RemoteEvent", "Snap")
local feedRemote = ensure(remotes, "RemoteEvent", "Feed")

local clientTemplate = script:FindFirstChild("Client")
local function giveClient(player)
	if not clientTemplate then
		warn("[F1] Falta el LocalScript Client dentro del Script principal")
		return
	end
	local scripts = player:FindFirstChild("PlayerScripts")
	if scripts and not scripts:FindFirstChild("F1Client") then
		local copy = clientTemplate:Clone()
		copy.Name = "F1Client"
		copy.Parent = scripts
	end
end

if clientTemplate then
	local starterScripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
	if starterScripts and not starterScripts:FindFirstChild("F1Client") then
		local copy = clientTemplate:Clone()
		copy.Name = "F1Client"
		copy.Parent = starterScripts
	end
end

-- ---------- la carrera ----------

local track = workspace:WaitForChild("F1Track", 10)
if not track then
	error("[F1] No existe workspace.F1Track: ejecuta TrackBuilder.build(workspace) primero")
end

Race.init({
	track = track,
	state = stateValue,
	snap = snapRemote,
	feed = feedRemote,
	onRaceEnd = function(raceId, results)
		-- en modo demostracion los corredores son bots: no se guarda nada en el ranking
		if not Race.isDemo() then
			Net.reportResult(string.format("%d-%d", os.time(), raceId), results)
		end
	end,
})

RunService.Heartbeat:Connect(function(dt)
	Race.step(dt)
end)

-- Solo en Studio: permite probar la carrera desde la linea de comandos (ServerStorage.F1Debug:Invoke("join", "id", "Nombre"))
if RunService:IsStudio() then
	local debugFn = Instance.new("BindableFunction")
	debugFn.Name = "F1Debug"
	debugFn.OnInvoke = function(action, ...)
		local fn = Race[action]
		if type(fn) == "function" then
			return fn(...)
		end
	end
	debugFn.Parent = game:GetService("ServerStorage")
end

-- ---------- cuenta de Roblox del que juega ----------

local owner = nil
local live = false
local studioTestId = RunService:IsStudio() and Config.StudioTestRobloxUserId or nil

local function ownerId()
	return owner and owner.UserId or studioTestId
end

local function setOwner(player)
	owner = player
	live = false
	Net.robloxUserId = player and player.UserId or nil
	Race.setDemo(true)
end

Players.PlayerAdded:Connect(function(player)
	giveClient(player)
	if not owner then
		setOwner(player)
	end
end)

Players.PlayerRemoving:Connect(function(player)
	if player == owner then
		local next = nil
		for _, other in ipairs(Players:GetPlayers()) do
			if other ~= player then
				next = other
				break
			end
		end
		setOwner(next)
	end
end)

for _, player in ipairs(Players:GetPlayers()) do
	giveClient(player)
	if not owner then
		setOwner(player)
	end
end

-- ---------- conexion con Interaktik (sesion y cola de espectadores/regalos) ----------

task.spawn(function()
	while true do
		local delay = Config.SessionRetrySec

		if not ownerId() then
			Race.setStatus("")
		elseif not Net.httpEnabled() then
			live = false
			Race.setDemo(true)
			Race.setStatus("Modo demostración: activa HTTP Requests en Game Settings > Security para conectar con Interaktik.")
		else
			Net.robloxUserId = ownerId()
			local ok, data = Net.getSession()
			if ok and type(data) == "table" and data.ready then
				if not live then
					live = true
					Race.setDemo(false)
				end
				Race.setStatus("")
				Race.configure(data.settings)
				delay = Config.SessionIntervalSec
			elseif ok and type(data) == "table" then
				live = false
				Race.setDemo(true)
				if data.linked == false then
					Race.setStatus("Modo demostración: tu cuenta de Roblox (ID " .. tostring(ownerId()) .. ") no está vinculada en Interaktik.")
				else
					Race.setStatus("Modo demostración: tu prueba o plan de Interaktik venció.")
				end
			else
				if not live then
					Race.setDemo(true)
				end
				Race.setStatus("No se pudo hablar con Interaktik. Reintentando...")
			end
		end

		task.wait(delay)
	end
end)

local seen, seenOrder = {}, {}
local function remember(id)
	seen[id] = true
	table.insert(seenOrder, id)
	if #seenOrder > 3000 then
		seen[table.remove(seenOrder, 1)] = nil
	end
end

local function handleItem(item)
	if item.kind == "join" then
		Race.join(item.uniqueId, item.nickname or item.uniqueId, item.robloxUserId)
	elseif item.kind == "power" then
		local target = item.target or "random"
		if target == "self" then
			-- el regalo es para el carro de quien lo manda; si todavia no corria, entra primero
			target = item.uniqueId
			if not Race.has(target) then
				Race.join(target, item.nickname or target)
			end
		end
		Race.applyEffect(target, item.power, item.seconds, item.nickname)
	end
end

task.spawn(function()
	while true do
		if live and ownerId() and Net.robloxUserId then
			local ok, data = Net.pollQueue()
			if ok and type(data) == "table" and type(data.items) == "table" and #data.items > 0 then
				local ids = {}
				for _, item in ipairs(data.items) do
					table.insert(ids, item.id)
					if not seen[item.id] then
						remember(item.id)
						local success, err = pcall(handleItem, item)
						if not success then
							warn("[F1] Error aplicando un evento: " .. tostring(err))
						end
					end
				end
				local confirmed = false
				for _ = 1, 3 do
					if Net.ack(ids) then
						confirmed = true
						break
					end
					task.wait(0.4)
				end
				if not confirmed then
					warn("[F1] No se pudo confirmar la cola; el servidor la volverá a enviar")
				end
			end
		end
		task.wait(Config.QueueIntervalSec)
	end
end)

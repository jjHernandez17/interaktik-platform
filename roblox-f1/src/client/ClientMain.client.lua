-- Cliente de la carrera: dibuja los carros (el servidor solo manda posiciones), la camara de television y la pantalla
-- (clasificacion, vueltas, semaforo, avisos).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("F1Shared")
local Config = require(Shared.Config)
local Path = require(Shared.Path)
local CarBuilder = require(Shared.CarBuilder)

local stateValue = ReplicatedStorage:WaitForChild("F1State")
local remotes = ReplicatedStorage:WaitForChild("F1Remotes")
local snapRemote = remotes:WaitForChild("Snap")
local feedRemote = remotes:WaitForChild("Feed")

local track = workspace:WaitForChild("F1Track")
Path.load(track)

local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable

-- ---------- carros ----------

local carsFolder = Instance.new("Folder")
carsFolder.Name = "F1CarsLocal"
carsFolder.Parent = workspace

local namesGui = Instance.new("ScreenGui")
namesGui.Name = "F1Names"
namesGui.ResetOnSpawn = false
namesGui.IgnoreGuiInset = true
namesGui.DisplayOrder = 0
namesGui.Parent = player:WaitForChild("PlayerGui")

local cars = {} -- slot -> { model, chassis, dist, lat, speed, target, flags, fire, smoke, shield }
local state = nil
local rosterVersion = -1
local rosterKey = nil

local function teamColor(index)
	local team = CarBuilder.TEAMS[(index - 1) % #CarBuilder.TEAMS + 1]
	return team.primary
end

-- ---------- piloto sentado en el carro ----------
-- Con cuenta de Roblox: su skin real. Sin cuenta (o si el ID no existe): una skin aleatoria (colores) que sale igual para todos.

local descriptionCache = {}
local SKIN_TONES = {
	Color3.fromRGB(255, 219, 172), Color3.fromRGB(241, 194, 125), Color3.fromRGB(224, 172, 105),
	Color3.fromRGB(198, 134, 66), Color3.fromRGB(141, 85, 36), Color3.fromRGB(94, 60, 38),
}

local function randomDescription(seed)
	local rng = Random.new(seed)
	local description = Instance.new("HumanoidDescription")
	local skin = SKIN_TONES[rng:NextInteger(1, #SKIN_TONES)]
	local shirt = Color3.fromHSV(rng:NextNumber(), 0.75, 0.95)
	local pants = Color3.fromHSV(rng:NextNumber(), 0.6, 0.55)
	description.HeadColor = skin
	description.LeftArmColor = skin
	description.RightArmColor = skin
	description.TorsoColor = shirt
	description.LeftLegColor = pants
	description.RightLegColor = pants
	return description
end

local function getDescription(info)
	if info.uid then
		local cached = descriptionCache[info.uid]
		if cached then
			return cached
		end
		local ok, description = pcall(function()
			return Players:GetHumanoidDescriptionFromUserId(info.uid)
		end)
		if ok and description then
			descriptionCache[info.uid] = description
			return description
		end
	end
	return randomDescription(info.sk or 1)
end

local function bendJoint(rig, name, pitchDegrees)
	local motor = rig:FindFirstChild(name, true)
	if motor and motor:IsA("Motor6D") then
		-- Transform (no C0): C0 no se puede escribir en estas piezas y ScaleTo lo reinicia
		motor.Transform = CFrame.Angles(math.rad(pitchDegrees), 0, 0)
	end
end

local function buildDriver(car, info)
	local description = getDescription(info)
	local ok, rig = pcall(function()
		return Players:CreateHumanoidModelFromDescription(description, Enum.HumanoidRigType.R15)
	end)
	if not ok or not rig then
		return
	end
	if not car.model.Parent then
		rig:Destroy()
		return
	end

	rig.Name = "Driver"
	for _, descendant in ipairs(rig:GetDescendants()) do
		if descendant:IsA("BasePart") then
			descendant.Anchored = false
			descendant.CanCollide = false
			descendant.CanQuery = false
			descendant.CanTouch = false
			descendant.Massless = true
		elseif descendant:IsA("BaseScript") then
			descendant:Destroy()
		end
	end

	local humanoid = rig:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid:Destroy() -- ya no hace falta: solo es una figura soldada al carro
	end

	rig:ScaleTo(Config.DriverScale)
	rig:PivotTo(car.chassis.CFrame * Config.DriverOffset)
	local root = rig:FindFirstChild("HumanoidRootPart")
	if root then
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = car.chassis
		weld.Part1 = root
		weld.Parent = root
	end
	rig.Parent = car.model

	-- sentado con las manos en el volante
	bendJoint(rig, "LeftHip", 90)
	bendJoint(rig, "RightHip", 90)
	bendJoint(rig, "LeftKnee", -90)
	bendJoint(rig, "RightKnee", -90)
	bendJoint(rig, "LeftShoulder", 70)
	bendJoint(rig, "RightShoulder", 70)
	bendJoint(rig, "LeftElbow", -30)
	bendJoint(rig, "RightElbow", -30)

	-- el casco del carro estorba: el piloto se ve con su skin
	for _, name in ipairs({ "Helmet", "Visor", "HelmetStripe", "Shoulders" }) do
		local part = car.model:FindFirstChild(name)
		if part then
			part.Transparency = 1
			for _, child in ipairs(part:GetChildren()) do
				if child:IsA("SurfaceGui") then
					child.Enabled = false
				end
			end
		end
	end
end

local function makeCar(slot, info)
	local team = CarBuilder.TEAMS[(info.tm - 1) % #CarBuilder.TEAMS + 1]
	local model = CarBuilder.build(team, info.num)
	model.Name = "Car_" .. slot
	local chassis = model.PrimaryPart

	local lane, dist = Path.gridSlot(slot)
	local exhaust = model:FindFirstChild("ExhaustGlow", true)

	local fire = Instance.new("Fire")
	fire.Enabled = false
	fire.Size = 6
	fire.Heat = 12
	fire.Color = Color3.fromRGB(80, 200, 255)
	fire.SecondaryColor = Color3.fromRGB(255, 255, 255)
	fire.Parent = exhaust or chassis

	local smoke = Instance.new("Smoke")
	smoke.Enabled = false
	smoke.Size = 5
	smoke.Opacity = 0.6
	smoke.RiseVelocity = 3
	smoke.Color = Color3.fromRGB(40, 40, 44)
	smoke.Parent = exhaust or chassis

	local shield = Instance.new("Highlight")
	shield.Enabled = false
	shield.FillColor = Color3.fromRGB(60, 220, 255)
	shield.OutlineColor = Color3.fromRGB(255, 255, 255)
	shield.FillTransparency = 0.65
	shield.OutlineTransparency = 0.1
	shield.Adornee = model
	shield.Parent = model

	-- nombre sobre el carro (etiqueta en pantalla que sigue al carro; se mueve en el bucle por frame)
	local label = Instance.new("TextLabel")
	label.AnchorPoint = Vector2.new(0.5, 1)
	label.Size = UDim2.fromOffset(200, 26)
	label.BackgroundColor3 = Color3.fromRGB(12, 14, 24)
	label.BackgroundTransparency = 0.25
	label.Font = Enum.Font.GothamBlack
	label.TextSize = 16
	label.Text = "#" .. info.num .. " " .. info.n
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.4
	label.Visible = false
	label.Parent = namesGui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = label
	local stroke = Instance.new("UIStroke")
	stroke.Color = team.primary
	stroke.Thickness = 2
	stroke.Parent = label

	model.Parent = carsFolder

	-- estelas en las puntas del alerón trasero (se ven al ir rapido), chispas bajo el difusor y humo de llantas al arrancar
	local function attachment(position)
		local a = Instance.new("Attachment")
		a.Position = position
		a.Parent = chassis
		return a
	end
	local trails = {}
	for _, side in ipairs({ -1, 1 }) do
		local trail = Instance.new("Trail")
		trail.Attachment0 = attachment(Vector3.new(side * 3.15, 0.9, 7.45))
		trail.Attachment1 = attachment(Vector3.new(side * 3.15, 2.7, 7.45))
		trail.Lifetime = 0.45
		trail.MinLength = 0.2
		trail.LightEmission = 0.55
		trail.Color = ColorSequence.new(Color3.new(1, 1, 1))
		trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.55), NumberSequenceKeypoint.new(1, 1) })
		trail.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0.1) })
		trail.Enabled = false
		trail.Parent = chassis
		table.insert(trails, trail)
	end

	local sparks = Instance.new("ParticleEmitter")
	sparks.Rate = 0
	sparks.Lifetime = NumberRange.new(0.2, 0.45)
	sparks.Speed = NumberRange.new(10, 24)
	sparks.SpreadAngle = Vector2.new(25, 25)
	sparks.EmissionDirection = Enum.NormalId.Back
	sparks.Acceleration = Vector3.new(0, -35, 0)
	sparks.LightEmission = 1
	sparks.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.22), NumberSequenceKeypoint.new(1, 0) })
	sparks.Color = ColorSequence.new(Color3.fromRGB(255, 220, 120), Color3.fromRGB(255, 110, 30))
	sparks.Parent = attachment(Vector3.new(0, -1.05, 6.8))

	local smokes = {}
	for _, side in ipairs({ -1, 1 }) do
		local smoke = Instance.new("ParticleEmitter")
		smoke.Rate = 0
		smoke.Lifetime = NumberRange.new(0.6, 1.1)
		smoke.Speed = NumberRange.new(3, 7)
		smoke.SpreadAngle = Vector2.new(30, 30)
		smoke.EmissionDirection = Enum.NormalId.Back
		smoke.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1.6), NumberSequenceKeypoint.new(1, 4.5) })
		smoke.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.55), NumberSequenceKeypoint.new(1, 1) })
		smoke.Color = ColorSequence.new(Color3.fromRGB(235, 235, 240))
		smoke.Parent = attachment(Vector3.new(side * 3.5, -0.9, 5.4))
		table.insert(smokes, smoke)
	end

	local car = {
		trails = trails,
		sparks = sparks,
		smokes = smokes,
		model = model,
		chassis = chassis,
		dist = dist,
		lat = Path.laneOffset(lane),
		speed = 0,
		target = nil,
		flags = 0,
		fire = fire,
		smoke = smoke,
		shield = shield,
		latVel = 0,
		yaw = nil,
		buffer = {}, -- ultimas posiciones del servidor: se dibuja un poco "en el pasado" interpolando entre dos para que el movimiento sea continuo
		wheels = {},
		label = label,
	}
	for _, wheelModel in ipairs(model:GetChildren()) do
		if string.sub(wheelModel.Name, 1, 6) == "Wheel_" then
			local hub = wheelModel:FindFirstChild("Hub")
			local spin = hub and hub:FindFirstChild("Spin")
			if spin then
				table.insert(car.wheels, { motor = spin, radius = hub:GetAttribute("Radius") or 1.7, angle = 0 })
			end
		end
	end
	task.spawn(buildDriver, car, info)
	return car
end

local function syncRoster(roster)
	-- los carros que ya existen se conservan; solo se crean los nuevos y se quitan los que sobran
	for slot = 1, #roster do
		if not cars[slot] then
			cars[slot] = makeCar(slot, roster[slot])
		end
	end
	for slot, car in pairs(cars) do
		if slot > #roster then
			car.label:Destroy()
			car.model:Destroy()
			cars[slot] = nil
		end
	end
end

local function clearCars()
	for slot, car in pairs(cars) do
		car.label:Destroy()
		car.model:Destroy()
		cars[slot] = nil
	end
end

-- ---------- datos del servidor ----------

stateValue:GetPropertyChangedSignal("Value"):Connect(function()
	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(stateValue.Value)
	end)
	if not ok or type(decoded) ~= "table" then
		return
	end
	local previous = state
	state = decoded

	-- nueva carrera (o se vacio la parrilla): se dibujan carros desde cero
	if previous and decoded.rv ~= rosterVersion then
		if #decoded.roster == 0 or (previous.rid ~= decoded.rid and decoded.ph == "lobby") then
			clearCars()
		end
	end
	if decoded.rv ~= rosterVersion then
		rosterVersion = decoded.rv
		syncRoster(decoded.roster)
	end
end)

snapRemote.OnClientEvent:Connect(function(serverTime, data)
	for i = 1, #data, 5 do
		local car = cars[data[i]]
		if car then
			local buffer = car.buffer
			buffer[#buffer + 1] = { t = serverTime, dist = data[i + 1], lat = data[i + 2], speed = data[i + 3] }
			if #buffer > 8 then
				table.remove(buffer, 1)
			end
			car.flags = data[i + 4]
		end
	end
end)

local function applyInitialState()
	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(stateValue.Value)
	end)
	if ok and type(decoded) == "table" then
		state = decoded
		rosterVersion = decoded.rv
		syncRoster(decoded.roster)
	end
end
applyInitialState()

-- ---------- pantalla ----------

local gui = Instance.new("ScreenGui")
gui.Name = "F1Hud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function make(className, props, parent)
	local item = Instance.new(className)
	for key, value in pairs(props) do
		item[key] = value
	end
	item.Parent = parent
	return item
end

local function text(props, parent)
	local base = { BackgroundTransparency = 1, Font = Enum.Font.GothamBold, TextColor3 = Color3.new(1, 1, 1), TextStrokeTransparency = 0.5, RichText = true }
	for key, value in pairs(props) do
		base[key] = value
	end
	return make("TextLabel", base, parent)
end

-- clasificacion (arriba izquierda)
local board = make("Frame", { Position = UDim2.fromOffset(18, 18), Size = UDim2.fromOffset(290, 36 + 10 * 30 + 16), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.18, BorderSizePixel = 0 }, gui)
make("UICorner", { CornerRadius = UDim.new(0, 12) }, board)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 0), Thickness = 2, Transparency = 0.2 }, board)
text({ Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -28, 0, 26), Text = "CLASIFICACIÓN", Font = Enum.Font.GothamBlack, TextSize = 17, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 214, 0) }, board)
local rows = {}
for i = 1, 10 do
	local row = make("Frame", { Position = UDim2.fromOffset(8, 36 + (i - 1) * 30), Size = UDim2.new(1, -16, 0, 27), BackgroundColor3 = Color3.fromRGB(30, 34, 52), BackgroundTransparency = 0.25, BorderSizePixel = 0, Visible = false }, board)
	make("UICorner", { CornerRadius = UDim.new(0, 7) }, row)
	local stripe = make("Frame", { Size = UDim2.fromOffset(5, 27), BackgroundColor3 = Color3.new(1, 1, 1), BorderSizePixel = 0 }, row)
	make("UICorner", { CornerRadius = UDim.new(0, 3) }, stripe)
	local pos = text({ Position = UDim2.fromOffset(10, 0), Size = UDim2.fromOffset(28, 27), Text = tostring(i), TextSize = 16, Font = Enum.Font.GothamBlack }, row)
	local name = text({ Position = UDim2.fromOffset(40, 0), Size = UDim2.new(1, -110, 1, 0), Text = "", TextSize = 15, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, row)
	local info = text({ AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -8, 0, 0), Size = UDim2.fromOffset(64, 27), Text = "", TextSize = 13, TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(200, 210, 235) }, row)
	rows[i] = { frame = row, stripe = stripe, pos = pos, name = name, info = info }
end

-- vuelta / estado (arriba centro)
local top = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 18), Size = UDim2.fromOffset(470, 56), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.18, BorderSizePixel = 0 }, gui)
make("UICorner", { CornerRadius = UDim.new(0, 12) }, top)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 0), Thickness = 2, Transparency = 0.2 }, top)
local topTitle = text({ Size = UDim2.new(1, 0, 0.55, 0), Position = UDim2.fromScale(0, 0.04), Text = "", TextSize = 24, Font = Enum.Font.GothamBlack }, top)
local topSub = text({ Size = UDim2.new(1, -16, 0.35, 0), Position = UDim2.new(0, 8, 0.62, 0), Text = "", TextSize = 13, TextTruncate = Enum.TextTruncate.AtEnd, TextColor3 = Color3.fromRGB(200, 210, 235) }, top)

-- mensaje grande al centro (cuenta regresiva, ganador)
local big = text({ AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.36), Size = UDim2.fromOffset(900, 160), Text = "", TextSize = 120, Font = Enum.Font.GothamBlack, TextStrokeTransparency = 0 }, gui)
local bigSub = text({ AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.fromScale(0.5, 0.36), Size = UDim2.fromOffset(900, 40), Text = "", TextSize = 28, TextStrokeTransparency = 0.2 }, gui)
bigSub.Position = UDim2.new(0.5, 0, 0.36, 90)

-- avisos (abajo izquierda)
local feedBox = make("Frame", { AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 18, 1, -18), Size = UDim2.fromOffset(420, 190), BackgroundTransparency = 1 }, gui)
make("UIListLayout", { VerticalAlignment = Enum.VerticalAlignment.Bottom, SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 4) }, feedBox)
local feedOrder = 0

local FEED_COLORS = { good = Color3.fromRGB(110, 255, 150), bad = Color3.fromRGB(255, 120, 110), info = Color3.new(1, 1, 1) }
feedRemote.OnClientEvent:Connect(function(message, kind)
	feedOrder += 1
	local line = text({ Size = UDim2.new(1, 0, 0, 24), Text = tostring(message), TextSize = 16, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = FEED_COLORS[kind] or FEED_COLORS.info, BackgroundTransparency = 0.35, BackgroundColor3 = Color3.fromRGB(12, 14, 24), LayoutOrder = feedOrder, TextTruncate = Enum.TextTruncate.AtEnd }, feedBox)
	make("UICorner", { CornerRadius = UDim.new(0, 6) }, line)
	make("UIPadding", { PaddingLeft = UDim.new(0, 8) }, line)
	-- maximo 6 avisos visibles
	local children = {}
	for _, child in ipairs(feedBox:GetChildren()) do
		if child:IsA("TextLabel") then
			table.insert(children, child)
		end
	end
	table.sort(children, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	while #children > 6 do
		table.remove(children, 1):Destroy()
	end
	task.delay(9, function()
		if line.Parent then
			TweenService:Create(line, TweenInfo.new(0.5), { TextTransparency = 1, BackgroundTransparency = 1, TextStrokeTransparency = 1 }):Play()
			task.delay(0.6, function()
				line:Destroy()
			end)
		end
	end)
end)

-- estado de conexion (abajo derecha)
local statusLabel = text({ AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -18, 1, -18), Size = UDim2.fromOffset(420, 40), Text = "", TextSize = 14, TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(255, 220, 120), TextWrapped = true }, gui)

local goAt = 0
local function setBig(value, color, sub)
	if big.Text ~= value then
		big.Text = value
		big.TextColor3 = color or Color3.new(1, 1, 1)
		big.TextTransparency = 0
		if value ~= "" then
			big.TextSize = 40
			TweenService:Create(big, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { TextSize = 120 }):Play()
		end
	end
	bigSub.Text = sub or ""
end

local function formatTime(seconds)
	return string.format("%d:%04.1f", math.floor(seconds / 60), seconds % 60)
end

local function renderHud()
	if not state then
		return
	end

	-- clasificacion
	if state.ph == "lobby" then
		for i, row in ipairs(rows) do
			local entry = state.roster[i]
			row.frame.Visible = entry ~= nil
			if entry then
				row.stripe.BackgroundColor3 = teamColor(entry.tm)
				row.pos.Text = "#" .. entry.num
				row.name.Text = entry.n
				row.info.Text = ""
			end
		end
	else
		local list = state.ph == "results" and state.res or state.top
		for i, row in ipairs(rows) do
			local entry = list[i]
			row.frame.Visible = entry ~= nil
			if entry then
				local team = state.ph == "results" and nil or entry.tm
				row.stripe.BackgroundColor3 = team and teamColor(team) or Color3.fromRGB(255, 214, 0)
				row.pos.Text = tostring(state.ph == "results" and entry.p or i)
				row.name.Text = entry.n
				if state.ph == "results" then
					row.info.Text = entry.t and formatTime(entry.t) or "—"
				elseif entry.f then
					row.info.Text = "🏁 " .. (entry.t and formatTime(entry.t) or "")
				else
					row.info.Text = "V " .. entry.l .. "/" .. state.laps
				end
			end
		end
	end

	-- barra superior y mensajes
	if state.ph == "lobby" then
		topTitle.Text = "PARRILLA " .. state.n .. "/" .. state.max
		topSub.Text = "Sale en " .. state.left .. " s · comenta 1 para unirte · o !" .. (state.kw or "unirme") .. " + tu ID de Roblox (tu skin)" .. (state.wait > 0 and (" · " .. state.wait .. " en espera") or "")
		setBig("", nil, "")
	elseif state.ph == "countdown" then
		topTitle.Text = "¡PREPÁRENSE!"
		topSub.Text = state.n .. " pilotos"
		setBig(tostring(math.max(1, state.left)), Color3.fromRGB(255, 80, 70), "")
	elseif state.ph == "racing" then
		topTitle.Text = "VUELTA " .. state.lap .. "/" .. state.laps
		topSub.Text = state.n .. " pilotos en pista"
		if big.Text ~= "¡YA!" or os.clock() - goAt > 1.5 then
			setBig("", nil, "")
		end
	else
		topTitle.Text = "RESULTADOS"
		topSub.Text = "Siguiente carrera en " .. state.left .. " s"
		local winner = state.res[1]
		setBig(winner and "🏆 " .. winner.n or "", Color3.fromRGB(255, 214, 0), winner and "¡GANADOR!" or "")
	end

	statusLabel.Text = state.msg or ""
	if state.demo and state.msg == "" then
		statusLabel.Text = "MODO DEMOSTRACIÓN · vincula tu cuenta en Interaktik para jugar con tu live"
	end
end

-- confeti sobre el carro ganador
local function celebrate(slot)
	local car = cars[slot]
	if not car then
		return
	end
	local confetti = Instance.new("ParticleEmitter")
	confetti.Rate = 140
	confetti.Lifetime = NumberRange.new(2.5, 4)
	confetti.Speed = NumberRange.new(14, 30)
	confetti.SpreadAngle = Vector2.new(180, 180)
	confetti.EmissionDirection = Enum.NormalId.Top
	confetti.Acceleration = Vector3.new(0, -26, 0)
	confetti.RotSpeed = NumberRange.new(-300, 300)
	confetti.Rotation = NumberRange.new(0, 360)
	confetti.LightEmission = 0.3
	confetti.Size = NumberSequence.new(0.7)
	confetti.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 70, 90)),
		ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 214, 0)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(70, 255, 130)),
		ColorSequenceKeypoint.new(0.75, Color3.fromRGB(70, 170, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(200, 90, 255)),
	})
	confetti.Parent = car.chassis
	task.delay(7, function()
		confetti.Enabled = false
		task.delay(5, function()
			confetti:Destroy()
		end)
	end)
end

local lastPhase = nil
stateValue:GetPropertyChangedSignal("Value"):Connect(function()
	if state and state.ph ~= lastPhase then
		if state.ph == "racing" and lastPhase == "countdown" then
			goAt = os.clock()
			big.Text = ""
			setBig("¡YA!", Color3.fromRGB(80, 255, 120), "")
		end
		if state.ph == "results" and state.top and state.top[1] then
			celebrate(state.top[1].i)
		end
		lastPhase = state.ph
	end
	renderHud()
end)
renderHud()

-- ---------- bucle por frame: mover carros y camara ----------

local INTERP_DELAY = 0.12
local debugStats = nil
if RunService:IsStudio() then
	workspace:GetAttributeChangedSignal("F1Measure"):Connect(function()
		if workspace:GetAttribute("F1Measure") then
			debugStats = { n = 0, jumps = 0, worst = 0, minV = math.huge, maxV = 0, maxYaw = 0 }
		else
			if debugStats then
				workspace:SetAttribute("F1Stats", string.format("n=%d saltos>15%%=%d (%.2f%%) peor=%.0f%% vel %.0f..%.0f giro max=%.0f deg/s", debugStats.n, debugStats.jumps, 100 * debugStats.jumps / math.max(debugStats.n, 1), debugStats.worst * 100, debugStats.minV, debugStats.maxV, debugStats.maxYaw))
			end
			debugStats = nil
		end
	end)
end
local startPos = select(1, Path.at(-70))
local camPos = camera.CFrame.Position
local camLook = startPos
local camMode, camModeAt = 1, os.clock()
local orbitAngle = 0
local focusSlot, candidateSlot, candidateSince = nil, nil, 0

-- hacia donde apunta: la direccion de la pista mas el movimiento lateral (cambio de carril), suavizado una vez por frame
local function stepYaw(car, dt)
	local _, tangent, right = Path.at(car.dist)
	local heading = tangent * math.max(car.speed, 20) + right * car.latVel
	local targetYaw = math.atan2(-heading.X, -heading.Z)
	if not car.yaw then
		car.yaw = targetYaw
	end
	local diff = (targetYaw - car.yaw + math.pi) % (2 * math.pi) - math.pi
	car.yaw += diff * (1 - math.exp(-9 * dt))
end

local function carCFrame(car)
	local pos, _, right = Path.at(car.dist)
	local position = pos + right * car.lat + Vector3.new(0, Config.ChassisHeight, 0)
	local yaw = car.yaw or 0
	local forward = Vector3.new(-math.sin(yaw), 0, -math.cos(yaw))
	return CFrame.new(position) * CFrame.Angles(0, yaw, 0), position, forward
end

RunService.RenderStepped:Connect(function(dt)
	local serverNow = workspace:GetServerTimeNow()
	camera.CameraType = Enum.CameraType.Scriptable

	for _, car in pairs(cars) do
		local buffer = car.buffer
		local last = buffer[#buffer]
		if last then
			local renderTime = serverNow - INTERP_DELAY
			local dist, lat, speed
			if renderTime <= buffer[1].t then
				dist, lat, speed = buffer[1].dist, buffer[1].lat, buffer[1].speed
			elseif renderTime >= last.t then
				-- el servidor se retraso: se sigue con la ultima velocidad conocida (un rato corto)
				local extra = math.min(renderTime - last.t, 0.3)
				dist, lat, speed = last.dist + last.speed * extra, last.lat, last.speed
			else
				for i = #buffer - 1, 1, -1 do
					local a, b = buffer[i], buffer[i + 1]
					if a.t <= renderTime then
						local f = (renderTime - a.t) / math.max(b.t - a.t, 1e-4)
						dist = a.dist + (b.dist - a.dist) * f
						lat = a.lat + (b.lat - a.lat) * f
						speed = a.speed + (b.speed - a.speed) * f
						break
					end
				end
			end
			if dist then
				if math.abs(dist - car.dist) > 120 then
					car.yaw = nil
				end
				car.dist = dist
				car.speed = speed
				local oldLat = car.lat
				car.lat = lat
				local rawVel = (lat - oldLat) / math.max(dt, 1e-3)
				car.latVel += (rawVel - car.latVel) * math.min(1, dt * 6)
			end
		end

		stepYaw(car, dt)
		local cf = carCFrame(car)
		car.chassis.CFrame = cf
		if debugStats then
			-- solo Studio: mide si el movimiento es parejo (cambio de velocidad y de rumbo entre frames)
			local v = car.lastPos and (cf.Position - car.lastPos).Magnitude / dt
			if v and car.lastV and car.lastV > 20 then
				debugStats.n += 1
				local change = math.abs(v - car.lastV) / car.lastV
				if change > 0.15 then debugStats.jumps += 1 end
				debugStats.worst = math.max(debugStats.worst, change)
				debugStats.minV = math.min(debugStats.minV, v)
				debugStats.maxV = math.max(debugStats.maxV, v)
				local yawRate = math.deg(math.abs((car.yaw - (car.lastYaw or car.yaw) + math.pi) % (2 * math.pi) - math.pi)) / dt
				debugStats.maxYaw = math.max(debugStats.maxYaw, yawRate)
			end
			car.lastV = v
			car.lastPos = cf.Position
			car.lastYaw = car.yaw
		end
		for _, wheel in ipairs(car.wheels) do
			wheel.angle = (wheel.angle + car.speed * dt / wheel.radius) % (2 * math.pi)
			wheel.motor.Transform = CFrame.Angles(-wheel.angle, 0, 0)
		end
		car.fire.Enabled = bit32.band(car.flags, 1) ~= 0
		car.smoke.Enabled = bit32.band(car.flags, 2) ~= 0
		car.shield.Enabled = bit32.band(car.flags, 4) ~= 0
		local fast = car.speed > 60
		for _, trail in ipairs(car.trails) do
			trail.Enabled = fast
		end
		car.sparks.Rate = (car.speed > 90) and 22 or 0
		local launching = state and state.ph == "racing" and car.speed > 8 and car.speed < 85
		for _, smoke in ipairs(car.smokes) do
			smoke.Rate = launching and 35 or 0
		end

		local screen, onScreen = camera:WorldToViewportPoint(car.chassis.Position + Vector3.new(0, 7, 0))
		local distance = screen.Z
		if onScreen and distance > 0 and distance < 650 then
			car.label.Visible = true
			car.label.Position = UDim2.fromOffset(screen.X, screen.Y)
			car.label.TextSize = math.floor(11 + 7 * math.clamp(110 / distance, 0.2, 1) + 0.5)
			car.label.Size = UDim2.fromOffset(#car.label.Text * car.label.TextSize * 0.62 + 18, car.label.TextSize + 10)
		else
			car.label.Visible = false
		end
	end

	-- solo en Studio: una camara fija para revisar detalles (workspace:SetAttribute("F1Cam", CFrame))
	if RunService:IsStudio() then
		local override = workspace:GetAttribute("F1Cam")
		if typeof(override) == "CFrame" then
			camera.CFrame = override
			return
		end
	end

	-- camara de television
	local ph = state and state.ph or "lobby"
	local desiredPos, desiredLook

	local focus = nil
	if state and state.top and state.top[1] and (ph == "racing" or ph == "countdown" or ph == "results") then
		-- el lider de la camara solo cambia si otro va primero por mas de 2.5 s (si no, salta entre carros que van parejos)
		local leaderSlot = state.top[1].i
		if ph ~= "racing" or not focusSlot or not cars[focusSlot] then
			focusSlot = leaderSlot
			candidateSlot = nil
		elseif leaderSlot ~= focusSlot then
			if candidateSlot ~= leaderSlot then
				candidateSlot = leaderSlot
				candidateSince = os.clock()
			elseif os.clock() - candidateSince > 2.5 then
				focusSlot = leaderSlot
				candidateSlot = nil
			end
		else
			candidateSlot = nil
		end
		focus = cars[focusSlot]
	end

	if ph == "lobby" or not focus then
		orbitAngle += dt * 0.12
		desiredPos = startPos + Vector3.new(math.cos(orbitAngle) * 150, 75, math.sin(orbitAngle) * 150)
		desiredLook = startPos
	else
		if os.clock() - camModeAt > 11 then
			camMode = camMode % 3 + 1
			camModeAt = os.clock()
		end
		local cf, position, heading = carCFrame(focus)
		if ph == "results" then
			orbitAngle += dt * 0.5
			desiredPos = position + Vector3.new(math.cos(orbitAngle) * 34, 14, math.sin(orbitAngle) * 34)
			desiredLook = position
		elseif camMode == 1 then
			desiredPos = position - heading * 52 + Vector3.new(0, 24, 0)
			desiredLook = position + heading * 18
		elseif camMode == 2 then
			local right = heading:Cross(Vector3.yAxis).Unit
			desiredPos = position + right * 46 + Vector3.new(0, 20, 0) - heading * 10
			desiredLook = position + heading * 8
		else
			desiredPos = position - heading * 20 + Vector3.new(0, 95, 0)
			desiredLook = position + heading * 25
		end
	end

	-- el campo de vision se abre un poco con la velocidad (sensacion de rapidez)
	local targetFov = 62
	if focus and ph == "racing" then
		targetFov = 66 + math.clamp(focus.speed / Config.BaseSpeed, 0, 1.5) * 8
	end
	camera.FieldOfView += (targetFov - camera.FieldOfView) * (1 - math.exp(-2.5 * dt))

	local alpha = 1 - math.exp(-4.5 * dt)
	camPos = camPos:Lerp(desiredPos, alpha)
	camLook = camLook:Lerp(desiredLook, alpha)
	camera.CFrame = CFrame.lookAt(camPos, camLook)
end)

-- Cliente de la carrera: dibuja los carros (el servidor solo manda posiciones), la camara de television y la pantalla
-- (clasificacion, vueltas, semaforo, avisos).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("F1Shared")
local Config = require(Shared.Config)
local Path = require(Shared.Path)
local CarBuilder = require(Shared.CarBuilder)

local stateValue = ReplicatedStorage:WaitForChild("F1State")
local remotes = ReplicatedStorage:WaitForChild("F1Remotes")
local snapRemote = remotes:WaitForChild("Snap")
local feedRemote = remotes:WaitForChild("Feed")
local controlRemote = remotes:WaitForChild("Control")
local powerRemote = remotes:WaitForChild("Power")

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
local onStateChanged = nil -- lo asigna la pantalla: se llama cuando el estado ya se leyo (asi nunca dibuja un estado viejo)
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
	if onStateChanged then
		onStateChanged()
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
local statusLabel = text({ AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -74, 1, -18), Size = UDim2.fromOffset(420, 40), Text = "", TextSize = 14, TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Color3.fromRGB(255, 220, 120), TextWrapped = true }, gui)

-- controles del streamer: boton INICIAR (abajo, afuera del menu) y la tuerca de opciones (abajo a la derecha). La tecla H los oculta.
local controls = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1 }, gui)

local startButton = make("TextButton", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -26), Size = UDim2.fromOffset(440, 66), BackgroundColor3 = Color3.fromRGB(46, 204, 113), Text = "", AutoButtonColor = true, Visible = false }, controls)
make("UICorner", { CornerRadius = UDim.new(0, 16) }, startButton)
make("UIStroke", { Color = Color3.new(1, 1, 1), Thickness = 2, Transparency = 0.35 }, startButton)
local startTitle = text({ Size = UDim2.new(1, 0, 0.58, 0), Position = UDim2.fromScale(0, 0.04), Text = "▶ INICIAR CARRERA", TextSize = 28, Font = Enum.Font.GothamBlack }, startButton)
local startSub = text({ Size = UDim2.new(1, 0, 0.32, 0), Position = UDim2.fromScale(0, 0.62), Text = "", TextSize = 14, TextStrokeTransparency = 0.7 }, startButton)

local gearButton = make("TextButton", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -18, 1, -18), Size = UDim2.fromOffset(46, 46), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.1, Text = "⚙", Font = Enum.Font.GothamBold, TextSize = 28, TextColor3 = Color3.new(1, 1, 1), Visible = false }, controls)
make("UICorner", { CornerRadius = UDim.new(0, 12) }, gearButton)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 0), Thickness = 2, Transparency = 0.2 }, gearButton)

local panel = make("Frame", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -18, 1, -72), Size = UDim2.fromOffset(340, 480), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.05, BorderSizePixel = 0, Visible = false }, controls)
make("UICorner", { CornerRadius = UDim.new(0, 14) }, panel)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 0), Thickness = 2, Transparency = 0.2 }, panel)
text({ Position = UDim2.fromOffset(16, 10), Size = UDim2.new(1, -32, 0, 26), Text = "OPCIONES DEL JUEGO", Font = Enum.Font.GothamBlack, TextSize = 18, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(255, 214, 0) }, panel)

local function smallButton(props, parent)
	local base = { BackgroundColor3 = Color3.fromRGB(38, 44, 66), TextColor3 = Color3.new(1, 1, 1), Font = Enum.Font.GothamBlack, TextSize = 24 }
	for key, value in pairs(props) do
		base[key] = value
	end
	local button = make("TextButton", base, parent)
	make("UICorner", { CornerRadius = UDim.new(0, 8) }, button)
	return button
end

-- fila con titulo, caja numerica y botones - / +; devuelve la caja y una funcion que lee el valor ya limitado
local function stepperRow(y, label, hint, minValue, maxValue, step)
	text({ Position = UDim2.fromOffset(16, y), Size = UDim2.new(1, -32, 0, 20), Text = label, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left }, panel)
	text({ Position = UDim2.fromOffset(16, y + 70), Size = UDim2.new(1, -32, 0, 16), Text = hint, TextSize = 12, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Color3.fromRGB(170, 180, 205) }, panel)
	local minus = smallButton({ Position = UDim2.fromOffset(16, y + 24), Size = UDim2.fromOffset(46, 42), Text = "−" }, panel)
	local box = make("TextBox", { Position = UDim2.fromOffset(70, y + 24), Size = UDim2.fromOffset(196, 42), BackgroundColor3 = Color3.fromRGB(26, 30, 48), TextColor3 = Color3.new(1, 1, 1), Font = Enum.Font.GothamBold, TextSize = 22, Text = "", ClearTextOnFocus = false, BorderSizePixel = 0 }, panel)
	make("UICorner", { CornerRadius = UDim.new(0, 8) }, box)
	local plus = smallButton({ Position = UDim2.fromOffset(274, y + 24), Size = UDim2.fromOffset(46, 42), Text = "+" }, panel)

	local function value()
		return math.clamp(math.floor(tonumber(box.Text) or minValue), minValue, maxValue)
	end
	box:GetPropertyChangedSignal("Text"):Connect(function()
		local digits = box.Text:gsub("%D", "")
		if digits ~= box.Text then
			box.Text = digits
		end
	end)
	box.FocusLost:Connect(function()
		box.Text = tostring(value())
	end)
	minus.Activated:Connect(function()
		box.Text = tostring(math.clamp(value() - step, minValue, maxValue))
	end)
	plus.Activated:Connect(function()
		box.Text = tostring(math.clamp(value() + step, minValue, maxValue))
	end)
	return box, value
end

local maxBox, maxValue = stepperRow(46, "Máximo de jugadores en la carrera", "De 2 a 20. Los demás esperan la siguiente carrera.", 2, 20, 1)
local secBox, secValue = stepperRow(138, "Segundos antes de comenzar (cuenta de preparación)", "De 3 a 120. Empieza al pulsar INICIAR.", 3, 120, 1)
local lapsBox, lapsValue = stepperRow(230, "Vueltas de la carrera", "De 1 a 10. Tiene prioridad sobre lo que pongas en la página.", 1, 10, 1)

text({ Position = UDim2.fromOffset(16, 322), Size = UDim2.new(1, -32, 0, 20), Text = "Modo de cámara (W/A/S/D en manual)", TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left }, panel)
local autoCamButton = smallButton({ Position = UDim2.fromOffset(16, 346), Size = UDim2.fromOffset(150, 44), Text = "Automático", TextSize = 16 }, panel)
local manualCamButton = smallButton({ Position = UDim2.fromOffset(176, 346), Size = UDim2.fromOffset(148, 44), Text = "Manual", TextSize = 16 }, panel)

local function paintCamButtons()
	local manualOn = state ~= nil and state.cam == "manual"
	autoCamButton.BackgroundColor3 = manualOn and Color3.fromRGB(38, 44, 66) or Color3.fromRGB(46, 204, 113)
	manualCamButton.BackgroundColor3 = manualOn and Color3.fromRGB(46, 204, 113) or Color3.fromRGB(38, 44, 66)
end
autoCamButton.Activated:Connect(function()
	controlRemote:FireServer("camera", "auto")
end)
manualCamButton.Activated:Connect(function()
	controlRemote:FireServer("camera", "manual")
end)

-- indicaciones del modo manual (abajo al centro; la tecla H las oculta junto con los controles)
local camHint = text({ AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -20), Size = UDim2.fromOffset(760, 30), Text = "", TextSize = 16, Visible = false }, controls)

local saveButton = smallButton({ Position = UDim2.fromOffset(16, 402), Size = UDim2.new(1, -32, 0, 48), BackgroundColor3 = Color3.fromRGB(46, 204, 113), Text = "GUARDAR", TextSize = 20 }, panel)
local savedLabel = text({ Position = UDim2.fromOffset(16, 454), Size = UDim2.new(1, -32, 0, 18), Text = "", TextSize = 13, TextColor3 = Color3.fromRGB(110, 255, 150) }, panel)

gearButton.Activated:Connect(function()
	panel.Visible = not panel.Visible
	if panel.Visible and state then
		maxBox.Text = tostring(state.max or Config.MaxRacers)
		secBox.Text = tostring(state.cd or Config.CountdownSec)
		lapsBox.Text = tostring(state.laps or Config.Laps)
		savedLabel.Text = ""
	end
end)

saveButton.Activated:Connect(function()
	controlRemote:FireServer("options", maxValue(), secValue(), lapsValue())
	maxBox.Text = tostring(maxValue())
	secBox.Text = tostring(secValue())
	lapsBox.Text = tostring(lapsValue())
	savedLabel.Text = "✔ Guardado"
	task.delay(2.5, function()
		savedLabel.Text = ""
	end)
end)

local lastStartAt = 0
startButton.Activated:Connect(function()
	if os.clock() - lastStartAt < 1 then
		return
	end
	lastStartAt = os.clock()
	controlRemote:FireServer("start")
end)

-- tecla H: oculta o muestra los controles (para transmitir la pantalla limpia)
UserInputService.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.H then
		controls.Visible = not controls.Visible
	end
end)

-- el boton INICIAR solo se ve en la parrilla, antes de empezar; el boton de opciones siempre (la camara se cambia en plena carrera)
local function updateControls()
	local lobby = state ~= nil and state.ph == "lobby"
	startButton.Visible = lobby
	gearButton.Visible = state ~= nil
	paintCamButtons()
	if not lobby then
		return
	end
	local need = state.min or 2
	local ready = state.n >= need
	startButton.BackgroundColor3 = ready and Color3.fromRGB(46, 204, 113) or Color3.fromRGB(90, 96, 112)
	startTitle.Text = ready and "▶ INICIAR CARRERA" or "▶ INICIAR"
	startSub.Text = ready and ("Empieza la cuenta de " .. (state.cd or Config.CountdownSec) .. " s con " .. state.n .. " pilotos") or ("Faltan pilotos: mínimo " .. need .. " (hay " .. state.n .. ")")
end

-- barras de poderes (arriba al centro): quien tiro el poder, cual y una barra que se vacia mientras el poder esta activo
local POWER_STYLE = {
	turbo = { label = "🚀 TURBO", color = Color3.fromRGB(255, 150, 40) },
	shield = { label = "🛡️ ESCUDO", color = Color3.fromRGB(70, 200, 255) },
	slow = { label = "🛢️ ACEITE", color = Color3.fromRGB(170, 110, 255) },
}
local powerBox = make("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 88), Size = UDim2.fromOffset(430, 270), BackgroundTransparency = 1 }, gui)
make("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 6) }, powerBox)
local powerOrder = 0

-- slot: carro que se enfoca; byName: quien lo tiro; isRacer: ese quien corre (tiene carro); targetSlot: carro que lo recibe
-- seconds = 0: el aceite lo bloqueo un escudo
local function showPowerBar(slot, kind, seconds, byName, isRacer, targetSlot)
	local style = POWER_STYLE[kind]
	if not style then
		return
	end
	local roster = state and state.roster or {}
	local info = roster[slot]
	local victim = roster[targetSlot]
	local name = tostring(byName or (info and info.n) or "Piloto")
	local blocked = kind == "slow" and (tonumber(seconds) or 0) <= 0
	local duration = blocked and 2.5 or math.max(1, tonumber(seconds) or 5)
	local detail = style.label
	if kind == "slow" and victim then
		detail = detail .. " → " .. victim.n
	end
	if blocked then
		detail = detail .. " · bloqueado por escudo"
	end

	powerOrder += 1
	local row = make("Frame", { Size = UDim2.new(1, 0, 0, 62), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.12, BorderSizePixel = 0, LayoutOrder = powerOrder }, powerBox)
	make("UICorner", { CornerRadius = UDim.new(0, 12) }, row)
	make("UIStroke", { Color = style.color, Thickness = 2, Transparency = 0.15 }, row)

	-- foto del personaje de Roblox de quien lo tiro (si no tiene cuenta de Roblox, su numero sobre el color de su equipo)
	local avatar = make("ImageLabel", { Position = UDim2.fromOffset(8, 7), Size = UDim2.fromOffset(40, 40), BackgroundColor3 = info and teamColor(info.tm) or style.color, BorderSizePixel = 0, Image = "" }, row)
	make("UICorner", { CornerRadius = UDim.new(1, 0) }, avatar)
	if isRacer and info and info.uid then
		avatar.Image = "rbxthumb://type=AvatarHeadShot&id=" .. info.uid .. "&w=150&h=150"
	else
		text({ Size = UDim2.fromScale(1, 1), Text = info and ("#" .. info.num) or "?", TextSize = 14, Font = Enum.Font.GothamBlack }, avatar)
	end

	text({ Position = UDim2.fromOffset(58, 5), Size = UDim2.new(1, -130, 0, 22), Text = name, TextSize = 17, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd }, row)
	text({ Position = UDim2.fromOffset(58, 26), Size = UDim2.new(1, -130, 0, 18), Text = detail, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = style.color, TextTruncate = Enum.TextTruncate.AtEnd }, row)
	local timeLabel = text({ AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -12, 0, 8), Size = UDim2.fromOffset(60, 22), Text = "", TextSize = 16, TextXAlignment = Enum.TextXAlignment.Right }, row)

	local track = make("Frame", { Position = UDim2.fromOffset(58, 48), Size = UDim2.new(1, -72, 0, 8), BackgroundColor3 = Color3.fromRGB(40, 46, 66), BorderSizePixel = 0 }, row)
	make("UICorner", { CornerRadius = UDim.new(1, 0) }, track)
	local fill = make("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = style.color, BorderSizePixel = 0 }, track)
	make("UICorner", { CornerRadius = UDim.new(1, 0) }, fill)
	TweenService:Create(fill, TweenInfo.new(duration, Enum.EasingStyle.Linear), { Size = UDim2.fromScale(0, 1) }):Play()

	-- maximo 4 barras a la vez: si llega otra, se va la mas vieja
	local rowsNow = {}
	for _, child in ipairs(powerBox:GetChildren()) do
		if child:IsA("Frame") then
			table.insert(rowsNow, child)
		end
	end
	table.sort(rowsNow, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	while #rowsNow > 4 do
		table.remove(rowsNow, 1):Destroy()
	end

	task.spawn(function()
		local endsAt = os.clock() + duration
		while row.Parent and os.clock() < endsAt do
			timeLabel.Text = string.format("%.1fs", math.max(0, endsAt - os.clock()))
			task.wait(0.1)
		end
		row:Destroy()
	end)
end
powerRemote.OnClientEvent:Connect(showPowerBar)

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
		topSub.Text = "Esperando el INICIO · comenta 1 para unirte · o !" .. (state.kw or "unirme") .. " + tu ID de Roblox (tu skin)" .. (state.wait > 0 and (" · " .. state.wait .. " en espera") or "")
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
		-- al terminar solo dice FINISH; a los 5 s se quita y sube el podio (los ganadores no salen en el centro de la pantalla)
		if state.left <= Config.ResultsSec - 5 then
			setBig("", nil, "")
		else
			setBig("FINISH", Color3.fromRGB(255, 214, 0), "")
		end
	end

	updateControls()
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

-- ---------- podio: al terminar la carrera, los 3 primeros con su skin y su nombre de TikTok sobre las escaleras ----------
local PODIUM_AHEAD = 140 -- studs despues de la meta (por donde los carros siguen frenando)
local PODIUM_SIDE = 110 -- al costado de la pista; la camara lo mira desde la pista
local PODIUM_STEP_WIDTH = 24
local PODIUM_HEIGHTS = { 16, 11, 7 }
local PODIUM_COLORS = { Color3.fromRGB(255, 205, 40), Color3.fromRGB(205, 210, 222), Color3.fromRGB(205, 127, 50) }
local PODIUM_MEDALS = { "🥇", "🥈", "🥉" }
local PODIUM_FIGURE_SCALE = 2.4
-- visto de frente (desde la pista): el 2.º a la izquierda, el 1.º al centro y el 3.º a la derecha
local PODIUM_X = { 0, PODIUM_STEP_WIDTH + 2, -(PODIUM_STEP_WIDTH + 2) }

local podiumFolder = nil
local podiumBase = nil -- CFrame del podio en el suelo; su frente (-Z) mira hacia la pista
local podiumShown = false

local function clearPodium()
	podiumShown = false
	podiumBase = nil
	if podiumFolder then
		podiumFolder:Destroy()
		podiumFolder = nil
	end
end

-- figura de pie con la skin del corredor (la misma que lleva sentado en su carro)
local function buildPodiumFigure(info, place, entryName, standTop, parent)
	local description = getDescription(info)
	local ok, rig = pcall(function()
		return Players:CreateHumanoidModelFromDescription(description, Enum.HumanoidRigType.R15)
	end)
	if not ok or not rig then
		return nil
	end
	rig.Name = "Winner" .. place
	for _, descendant in ipairs(rig:GetDescendants()) do
		if descendant:IsA("BasePart") then
			descendant.Anchored = descendant.Name == "HumanoidRootPart" -- solo la raiz fija: lo demas sigue a los joints
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
		humanoid:Destroy()
	end
	rig:ScaleTo(PODIUM_FIGURE_SCALE)
	rig:PivotTo(standTop * CFrame.new(0, 3.05 * PODIUM_FIGURE_SCALE, 0))
	rig.Parent = parent

	-- brazos arriba (el ganador los levanta del todo)
	local raise = ({ 175, 135, 95 })[place]
	bendJoint(rig, "LeftShoulder", raise)
	bendJoint(rig, "RightShoulder", raise)

	-- nombre de TikTok encima de la cabeza
	local head = rig:FindFirstChild("Head")
	if head then
		local tag = Instance.new("BillboardGui")
		tag.Size = UDim2.fromOffset(280, 58)
		tag.StudsOffset = Vector3.new(0, 2.6 * PODIUM_FIGURE_SCALE / 2 + 2, 0)
		tag.AlwaysOnTop = true
		tag.LightInfluence = 0
		tag.Parent = head
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundColor3 = Color3.fromRGB(12, 14, 24)
		label.BackgroundTransparency = 0.15
		label.Font = Enum.Font.GothamBlack
		label.TextSize = 28
		label.TextColor3 = Color3.new(1, 1, 1)
		label.TextTruncate = Enum.TextTruncate.AtEnd
		label.Text = PODIUM_MEDALS[place] .. " " .. entryName
		label.Parent = tag
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 12)
		corner.Parent = label
		local stroke = Instance.new("UIStroke")
		stroke.Color = PODIUM_COLORS[place]
		stroke.Thickness = 3
		stroke.Parent = label
	end
	return rig
end

local function showPodium()
	if podiumShown or not state or state.ph ~= "results" or not state.res then
		return
	end
	local winners = {}
	for place = 1, 3 do
		local entry = state.res[place]
		local info = entry and entry.f and entry.i and state.roster[entry.i] or nil
		if info then
			winners[place] = { entry = entry, info = info }
		end
	end
	if not winners[1] then
		return
	end
	podiumShown = true

	local position, _, right = Path.at(PODIUM_AHEAD)
	local ground = Vector3.new(position.X - right.X * PODIUM_SIDE, -1, position.Z - right.Z * PODIUM_SIDE)
	podiumBase = CFrame.lookAt(ground, ground + Vector3.new(right.X, 0, right.Z))

	podiumFolder = Instance.new("Folder")
	podiumFolder.Name = "F1Podium"
	podiumFolder.Parent = workspace

	-- primero sube el 3.º, luego el 2.º y al final el 1.º
	for order, place in ipairs({ 3, 2, 1 }) do
		local winner = winners[place]
		if winner then
			task.delay((order - 1) * 1.3, function()
				if not podiumShown or not podiumFolder then
					return
				end
				local height = PODIUM_HEIGHTS[place]
				local x = PODIUM_X[place]
				local step = Instance.new("Part")
				step.Name = "Step" .. place
				step.Anchored = true
				step.CanCollide = false
				step.Material = Enum.Material.SmoothPlastic
				step.Color = PODIUM_COLORS[place]
				step.TopSurface = Enum.SurfaceType.Smooth
				step.BottomSurface = Enum.SurfaceType.Smooth
				step.Size = Vector3.new(PODIUM_STEP_WIDTH, 0.2, PODIUM_STEP_WIDTH)
				step.CFrame = podiumBase * CFrame.new(x, 0.1, 0)
				step.Parent = podiumFolder

				-- numero en la cara de adelante
				local numeral = Instance.new("SurfaceGui")
				numeral.Face = Enum.NormalId.Front
				numeral.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
				numeral.PixelsPerStud = 24
				numeral.LightInfluence = 0
				numeral.Parent = step
				local digit = Instance.new("TextLabel")
				digit.Size = UDim2.fromScale(1, 1)
				digit.BackgroundTransparency = 1
				digit.Font = Enum.Font.GothamBlack
				digit.TextScaled = true
				digit.TextColor3 = Color3.fromRGB(40, 36, 30)
				digit.Text = tostring(place)
				digit.Parent = numeral

				local rise = TweenService:Create(step, TweenInfo.new(0.9, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
					Size = Vector3.new(PODIUM_STEP_WIDTH, height, PODIUM_STEP_WIDTH),
					CFrame = podiumBase * CFrame.new(x, height / 2, 0),
				})
				rise:Play()
				rise.Completed:Connect(function()
					if not podiumShown or not podiumFolder then
						return
					end
					local standTop = podiumBase * CFrame.new(x, height, 0)
					buildPodiumFigure(winner.info, place, winner.entry.n, standTop, podiumFolder)
					if place == 1 then
						-- confeti sobre el ganador
						local anchor = Instance.new("Part")
						anchor.Anchored = true
						anchor.CanCollide = false
						anchor.CanQuery = false
						anchor.Transparency = 1
						anchor.Size = Vector3.new(1, 1, 1)
						anchor.CFrame = standTop * CFrame.new(0, 22, 0)
						anchor.Parent = podiumFolder
						local confetti = Instance.new("ParticleEmitter")
						confetti.Rate = 120
						confetti.Lifetime = NumberRange.new(2.5, 4)
						confetti.Speed = NumberRange.new(10, 26)
						confetti.SpreadAngle = Vector2.new(180, 180)
						confetti.Acceleration = Vector3.new(0, -24, 0)
						confetti.RotSpeed = NumberRange.new(-300, 300)
						confetti.Rotation = NumberRange.new(0, 360)
						confetti.LightEmission = 0.3
						confetti.Size = NumberSequence.new(0.8)
						confetti.Color = ColorSequence.new({
							ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 70, 90)),
							ColorSequenceKeypoint.new(0.33, Color3.fromRGB(255, 214, 0)),
							ColorSequenceKeypoint.new(0.66, Color3.fromRGB(70, 255, 130)),
							ColorSequenceKeypoint.new(1, Color3.fromRGB(70, 170, 255)),
						})
						confetti.Parent = anchor
					end
				end)
			end)
		end
	end
end

-- la camara del podio: en la pista, de frente a las escaleras, con un balanceo lento
local function podiumCamera()
	local sway = math.sin(os.clock() * 0.35) * 10
	local pos = (podiumBase * CFrame.new(sway, 30, -86)).Position
	local look = (podiumBase * CFrame.new(0, 13, 0)).Position
	return pos, look
end

local lastPhase = nil
onStateChanged = function()
	if state and state.ph ~= lastPhase then
		if state.ph == "racing" and lastPhase == "countdown" then
			goAt = os.clock()
			big.Text = ""
			setBig("¡YA!", Color3.fromRGB(80, 255, 120), "")
			task.delay(1.6, renderHud) -- el "¡YA!" se quita solo, aunque el estado no cambie
		end
		if state.ph == "results" and state.top and state.top[1] then
			celebrate(state.top[1].i)
		end
		lastPhase = state.ph
	end
	-- podio: sube a los 5 s de empezar los resultados y se quita al terminarlos
	if state and state.ph == "results" then
		if not podiumShown and state.left <= Config.ResultsSec - 5 then
			showPodium()
		end
	elseif podiumShown or podiumFolder then
		clearPodium()
	end
	renderHud()
end
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

-- ---------- modos de camara ----------
-- Automatico: la camara enfoca sola a todos los carros a la vez, desde arriba y algo lejos, cambiando de angulo, y cuando alguien tira un
-- poder baja y lo enfoca desde el frente. Manual: el streamer la mueve con W (arriba), S (frente) y A / D (cambiar de piloto).
local CAM_FOLLOW_RATE = 4.5 -- que tan rapido sigue la camara (el retraso se compensa para no quedarse atras)
local AUTO_CYCLE_SEC = 5 -- cuanto dura cada plano normal
local POWER_SHOT_SEC = 3 -- plano de quien tira un poder
local POWER_SHOT_BUSY_SEC = 1.8 -- si otro poder espera su turno, el plano de poder dura esto
local PACK_ANGLES = { 0, 40, 80, -40, -80, 20 } -- angulos del plano general: 0 = por delante del grupo, 90 = de lado (nunca desde atras)
local PACK_DRIFT_DEG_PER_SEC = 5 -- el angulo se va moviendo despacio durante el plano
local manual = { view = "top", slot = nil }
local auto = { shot = nil, queue = {}, cycle = 0 }
local lastCamSetting = "auto"

local function camSetting()
	return (state and state.cam == "manual") and "manual" or "auto"
end

-- todos los carros ordenados por posicion en la carrera (el primero va adelante)
local function carsByPosition()
	local list = {}
	for slot, car in pairs(cars) do
		table.insert(list, { slot = slot, car = car })
	end
	table.sort(list, function(a, b)
		return a.car.dist > b.car.dist
	end)
	return list
end

-- A / D: pasa al piloto anterior / siguiente (ordenados por posicion)
local function stepManualTarget(direction)
	local list = carsByPosition()
	if #list == 0 then
		return
	end
	local index = 1
	for i, entry in ipairs(list) do
		if entry.slot == manual.slot then
			index = i
			break
		end
	end
	manual.slot = list[(index - 1 + direction) % #list + 1].slot
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed or camSetting() ~= "manual" then
		return
	end
	if input.KeyCode == Enum.KeyCode.W then
		manual.view = "top"
	elseif input.KeyCode == Enum.KeyCode.S then
		manual.view = "front"
	elseif input.KeyCode == Enum.KeyCode.A then
		stepManualTarget(-1)
	elseif input.KeyCode == Enum.KeyCode.D then
		stepManualTarget(1)
	end
end)

-- un poder lanzado: en automatico la camara baja a enfocar a quien lo tiro
powerRemote.OnClientEvent:Connect(function(slot, kind)
	if camSetting() ~= "auto" or not state or state.ph ~= "racing" or not cars[slot] then
		return
	end
	local shot = auto.shot
	if shot and shot.power and shot.slot == slot then
		shot.startedAt = os.clock() -- el mismo piloto tira otro poder: sigue enfocado
		return
	end
	for _, queued in ipairs(auto.queue) do
		if queued == slot then
			return
		end
	end
	if #auto.queue < 4 then
		table.insert(auto.queue, slot)
	end
end)

-- plano general del modo automatico: todos los carros a la vez, desde arriba y mas lejos, desde un angulo que va cambiando
local function packPoints(angleDeg)
	local list = carsByPosition()
	local sum, avgDist, avgSpeed = Vector3.zero, 0, 0
	local positions = {}
	for _, entry in ipairs(list) do
		local _, position = carCFrame(entry.car)
		positions[#positions + 1] = position
		sum += position
		avgDist += entry.car.dist
		avgSpeed += entry.car.speed
	end
	local n = math.max(#list, 1)
	local center = sum / n
	avgDist /= n
	avgSpeed /= n
	-- que tan separado va el grupo: la camara se aleja para que quepan todos (con un minimo y un maximo)
	local spread = 0
	for _, position in ipairs(positions) do
		spread = math.max(spread, Vector3.new(position.X - center.X, 0, position.Z - center.Z).Magnitude)
	end
	local _, tangent, right = Path.at(avgDist)
	local base = math.clamp(spread * 1.2 + 60, 100, 360)
	local theta = math.rad(angleDeg)
	local horizontal = (tangent * math.cos(theta) + right * math.sin(theta)) * base * 0.8
	local pos = center + horizontal + Vector3.new(0, 70 + base * 0.6, 0)
	local lead = tangent * (avgSpeed / CAM_FOLLOW_RATE)
	return pos + lead, center + lead
end

-- donde se pone la camara para ver a un carro: "top" desde arriba y por delante del carro, "front" en la pista, desde el frente del carro
local function shotPoints(car, view, arg)
	if view == "pack" then
		return packPoints(arg)
	end
	local _, position, heading = carCFrame(car)
	local pos, look
	if view == "front" then
		local ahead, _, aheadRight = Path.at(car.dist + 38)
		pos = ahead + aheadRight * car.lat + Vector3.new(0, 6, 0)
		look = position + Vector3.new(0, 2, 0)
	else
		-- desde arriba y por delante del carro, mirandolo de frente (nunca desde atras)
		pos = position + heading * 20 + Vector3.new(0, 95, 0)
		look = position - heading * 25
	end
	-- la camara llega con retraso a un carro que corre: se adelanta el punto para que no se quede atras
	local lead = heading * (car.speed / CAM_FOLLOW_RATE)
	return pos + lead, look + lead
end

-- modo manual: el carro y el plano que eligio el streamer
local function manualShot()
	local list = carsByPosition()
	if #list == 0 then
		return nil
	end
	if not manual.slot or not cars[manual.slot] then
		manual.slot = list[1].slot
	end
	return cars[manual.slot], manual.view
end

-- modo automatico: que carro y desde donde se ve ahora
local function autoShot()
	local t = os.clock()
	local shot = auto.shot
	if shot and shot.power then
		local limit = #auto.queue > 0 and POWER_SHOT_BUSY_SEC or POWER_SHOT_SEC
		if t - shot.startedAt >= limit or not cars[shot.slot] then
			shot = nil
		end
	elseif shot and (t - shot.startedAt >= AUTO_CYCLE_SEC or not cars[shot.slot]) then
		shot = nil
	end
	-- un poder que espera interrumpe el plano normal o toma el turno cuando termina el plano de poder anterior
	if (not shot or not shot.power) and #auto.queue > 0 then
		local slot = table.remove(auto.queue, 1)
		if cars[slot] then
			shot = { slot = slot, view = "front", power = true, startedAt = t }
		end
	end
	if not shot then
		local list = carsByPosition()
		if #list == 0 then
			auto.shot = nil
			return nil
		end
		auto.cycle += 1
		-- plano general: todos los carros a la vez, cada vez desde otro angulo
		shot = { slot = list[1].slot, view = "pack", angle = PACK_ANGLES[(auto.cycle - 1) % #PACK_ANGLES + 1], startedAt = t }
	end
	auto.shot = shot
	local arg = shot.angle and (shot.angle + (t - shot.startedAt) * PACK_DRIFT_DEG_PER_SEC) or nil
	return cars[shot.slot], shot.view, arg
end

-- ---------- mapa de la pista (arriba a la derecha): el trazado y un punto de color por corredor ----------
local MAP_SIZE = 180
local mapFrame = make("Frame", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -18, 0, 18), Size = UDim2.fromOffset(MAP_SIZE, MAP_SIZE), BackgroundColor3 = Color3.fromRGB(12, 14, 24), BackgroundTransparency = 0.6, BorderSizePixel = 0 }, gui)
make("UICorner", { CornerRadius = UDim.new(0, 14) }, mapFrame)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 0), Thickness = 2, Transparency = 0.4 }, mapFrame)
local mapToScreen = nil -- convierte un punto del mundo a su posicion dentro del mapa
local mapDots = {}

local function buildMap()
	local samples = 150
	local points = {}
	local minX, maxX, minZ, maxZ = math.huge, -math.huge, math.huge, -math.huge
	for k = 0, samples - 1 do
		local position = Path.at(k * Path.total / samples)
		points[k + 1] = position
		minX, maxX = math.min(minX, position.X), math.max(maxX, position.X)
		minZ, maxZ = math.min(minZ, position.Z), math.max(maxZ, position.Z)
	end
	-- el trazado se escala para caber en el cuadro, centrado y sin deformarse
	local pad = 17
	local scale = math.min((MAP_SIZE - 2 * pad) / math.max(maxX - minX, 1), (MAP_SIZE - 2 * pad) / math.max(maxZ - minZ, 1))
	local offsetX = (MAP_SIZE - (maxX - minX) * scale) / 2
	local offsetY = (MAP_SIZE - (maxZ - minZ) * scale) / 2
	mapToScreen = function(position)
		return Vector2.new(offsetX + (position.X - minX) * scale, offsetY + (position.Z - minZ) * scale)
	end

	-- el trazado: segmentos cortos (una capa oscura mas ancha y una clara encima)
	for layer = 1, 2 do
		for k = 1, samples do
			local a = mapToScreen(points[k])
			local b = mapToScreen(points[k % samples + 1])
			local delta = b - a
			make("Frame", {
				AnchorPoint = Vector2.new(0.5, 0.5),
				Position = UDim2.fromOffset((a.X + b.X) / 2, (a.Y + b.Y) / 2),
				Size = UDim2.fromOffset(delta.Magnitude + 2, layer == 1 and 8 or 4),
				Rotation = math.deg(math.atan2(delta.Y, delta.X)),
				BackgroundColor3 = layer == 1 and Color3.fromRGB(34, 38, 58) or Color3.fromRGB(190, 198, 220),
				BorderSizePixel = 0,
				ZIndex = layer,
			}, mapFrame)
		end
	end

	-- la meta: una linea a cuadros atravesada a la pista, con una bandera al lado
	local finish = mapToScreen(points[1])
	local forward = mapToScreen(points[2]) - finish
	local across = Vector2.new(-forward.Y, forward.X).Unit -- perpendicular al sentido de la carrera
	for cell = 0, 3 do
		local at = finish + across * ((cell - 1.5) * 4.5)
		local checker = make("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromOffset(at.X, at.Y),
			Size = UDim2.fromOffset(4.5, 6),
			Rotation = math.deg(math.atan2(across.Y, across.X)),
			BackgroundColor3 = cell % 2 == 0 and Color3.new(1, 1, 1) or Color3.fromRGB(20, 20, 26),
			BorderSizePixel = 0,
			ZIndex = 4,
		}, mapFrame)
		if cell % 2 == 1 then
			make("UIStroke", { Color = Color3.new(1, 1, 1), Thickness = 1 }, checker)
		end
	end
	local flagAt = finish - across * 17
	text({ AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromOffset(flagAt.X, flagAt.Y), Size = UDim2.fromOffset(22, 22), Text = "🏁", TextSize = 16, ZIndex = 4 }, mapFrame)
end
buildMap()

local function mapDot(slot)
	local dot = mapDots[slot]
	if not dot then
		dot = make("Frame", { AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(9, 9), BorderSizePixel = 0, ZIndex = 5 }, mapFrame)
		make("UICorner", { CornerRadius = UDim.new(1, 0) }, dot)
		make("UIStroke", { Name = "Ring", Color = Color3.new(1, 1, 1), Thickness = 1.5 }, dot)
		mapDots[slot] = dot
	end
	return dot
end

RunService.RenderStepped:Connect(function()
	local roster = state and state.roster or {}
	local leaderSlot = state and state.top and state.top[1] and state.top[1].i
	for slot, car in pairs(cars) do
		local dot = mapDot(slot)
		local _, position = carCFrame(car)
		local at = mapToScreen(position)
		dot.Position = UDim2.fromOffset(at.X, at.Y)
		local info = roster[slot]
		dot.BackgroundColor3 = info and teamColor(info.tm) or Color3.new(1, 1, 1)
		-- el que va de primero se ve mas grande y con borde dorado
		local isLeader = slot == leaderSlot and state.ph == "racing"
		dot.Size = isLeader and UDim2.fromOffset(13, 13) or UDim2.fromOffset(9, 9)
		dot.ZIndex = isLeader and 6 or 5
		dot.Ring.Color = isLeader and Color3.fromRGB(255, 214, 0) or Color3.new(1, 1, 1)
		dot.Visible = true
	end
	for slot, dot in pairs(mapDots) do
		if not cars[slot] then
			dot.Visible = false
		end
	end
end)

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

	local mode = camSetting()
	if mode ~= lastCamSetting then
		lastCamSetting = mode
		auto.shot, auto.queue = nil, {}
		manual.slot = nil
	end
	if ph ~= "racing" then
		auto.shot, auto.queue = nil, {}
	end

	local focus, shotView, shotArg = nil, nil, nil
	if ph == "racing" then
		if mode == "manual" then
			focus, shotView = manualShot()
		else
			focus, shotView, shotArg = autoShot()
		end
	elseif state and state.top and state.top[1] and (ph == "countdown" or ph == "results") then
		focusSlot = state.top[1].i
		focus = cars[focusSlot]
	end

	if ph == "results" and podiumShown and podiumBase then
		desiredPos, desiredLook = podiumCamera()
	elseif ph == "lobby" or not focus then
		orbitAngle += dt * 0.12
		desiredPos = startPos + Vector3.new(math.cos(orbitAngle) * 150, 75, math.sin(orbitAngle) * 150)
		desiredLook = startPos
	elseif shotView then
		desiredPos, desiredLook = shotPoints(focus, shotView, shotArg)
	else
		local cf, position, heading = carCFrame(focus)
		if ph == "results" then
			orbitAngle += dt * 0.5
			desiredPos = position + Vector3.new(math.cos(orbitAngle) * 34, 14, math.sin(orbitAngle) * 34)
			desiredLook = position
		else
			-- parrilla (cuenta de preparacion): vista de persecucion del primero
			desiredPos = position - heading * 52 + Vector3.new(0, 24, 0)
			desiredLook = position + heading * 18
		end
	end

	-- indicaciones del modo manual
	local showHint = mode == "manual" and (ph == "racing" or ph == "countdown")
	camHint.Visible = showHint
	if showHint then
		local viewName = manual.view == "front" and "desde el frente" or "desde arriba"
		camHint.Text = (ph == "racing" and focus) and (focus.label.Text .. " · " .. viewName .. " · ") or "CÁMARA MANUAL · "
		camHint.Text ..= "W arriba · S frente · A/D cambiar de piloto"
	end

	-- el campo de vision se abre un poco con la velocidad (sensacion de rapidez)
	local targetFov = 62
	if focus and ph == "racing" then
		targetFov = 66 + math.clamp(focus.speed / Config.BaseSpeed, 0, 1.5) * 8
	end
	camera.FieldOfView += (targetFov - camera.FieldOfView) * (1 - math.exp(-2.5 * dt))

	local alpha = 1 - math.exp(-CAM_FOLLOW_RATE * dt)
	camPos = camPos:Lerp(desiredPos, alpha)
	camLook = camLook:Lerp(desiredLook, alpha)
	camera.CFrame = CFrame.lookAt(camPos, camLook)
end)

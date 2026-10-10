-- La arena: una calle de noche con edificios al fondo, luces de cada equipo y paredes invisibles a los lados.
-- Se construye entera por codigo para que el juego funcione sin armar nada a mano.

local Lighting = game:GetService("Lighting")

local Config = require(script.Parent.Config)
local Util = require(script.Parent.Util)

local Arena = {}

local ARENA_FOLDER_NAME = "Arena"

local function clearOld(parent)
	local old = parent:FindFirstChild(ARENA_FOLDER_NAME)
	if old then
		old:Destroy()
	end
end

local function setupLighting()
	Lighting.ClockTime = 21.5
	Lighting.Brightness = 1.4
	Lighting.Ambient = Color3.fromRGB(78, 66, 120)
	Lighting.OutdoorAmbient = Color3.fromRGB(70, 60, 110)
	Lighting.EnvironmentDiffuseScale = 0.6
	Lighting.EnvironmentSpecularScale = 0.4
	Lighting.GlobalShadows = true
	Lighting.FogColor = Color3.fromRGB(32, 24, 60)
	Lighting.FogStart = 140
	Lighting.FogEnd = 520

	-- la plantilla de Roblox trae sus propios efectos (bloom, desenfoque, cielo...) y se sumarian a los nuestros
	for _, child in ipairs(Lighting:GetChildren()) do
		local isEffect = child:IsA("PostEffect") or child:IsA("Sky") or child:IsA("Atmosphere") or child:IsA("Clouds")
		if isEffect and string.sub(child.Name, 1, 5) ~= "Pelea" then
			child:Destroy()
		end
	end

	local function ensure(className, name)
		local existing = Lighting:FindFirstChild(name)
		if existing and existing.ClassName == className then
			return existing
		end
		local created = Instance.new(className)
		created.Name = name
		created.Parent = Lighting
		return created
	end

	local atmosphere = ensure("Atmosphere", "PeleaAtmosphere")
	atmosphere.Density = 0.28
	atmosphere.Offset = 0.2
	atmosphere.Color = Color3.fromRGB(120, 95, 190)
	atmosphere.Decay = Color3.fromRGB(70, 40, 110)
	atmosphere.Glare = 0.3
	atmosphere.Haze = 1.2

	local bloom = ensure("BloomEffect", "PeleaBloom")
	bloom.Intensity = 0.7
	bloom.Size = 28
	bloom.Threshold = 1.05

	local correction = ensure("ColorCorrectionEffect", "PeleaColor")
	correction.Contrast = 0.12
	correction.Saturation = 0.18
	correction.TintColor = Color3.fromRGB(245, 235, 255)

	ensure("Sky", "PeleaSky")
end

local function buildSkyline(folder)
	local random = Random.new(7)
	local windowColors = {
		Color3.fromRGB(255, 226, 140),
		Color3.fromRGB(255, 244, 210),
		Color3.fromRGB(150, 225, 255),
		Color3.fromRGB(255, 170, 215),
	}

	local x = -190
	while x < 190 do
		local width = random:NextInteger(14, 26)
		local height = random:NextInteger(46, 120)
		local depth = random:NextInteger(14, 22)
		local z = -random:NextInteger(46, 96)
		local shade = random:NextInteger(18, 34)

		Util.part({
			Name = "Building",
			Size = Vector3.new(width, height, depth),
			Material = Enum.Material.Concrete,
			Color = Color3.fromRGB(shade, shade - 4, shade + 22),
			CFrame = CFrame.new(x + width / 2, height / 2 - 2, z),
			CastShadow = true,
		}, folder)

		-- ventanas encendidas al azar sobre la cara que mira a la camara
		for _ = 1, 12 do
			local wx = x + random:NextNumber(2, width - 2)
			local wy = random:NextNumber(6, height - 4)
			Util.part({
				Name = "Window",
				Size = Vector3.new(1.6, 2.2, 0.3),
				Material = Enum.Material.Neon,
				Color = windowColors[random:NextInteger(1, #windowColors)],
				CFrame = CFrame.new(wx, wy, z + depth / 2 + 0.2),
			}, folder)
		end

		x += width + random:NextInteger(1, 5)
	end
end

local function buildBackWall(folder)
	local width = Config.ArenaHalfWidth * 2 + 70

	Util.part({
		Name = "BackWall",
		Size = Vector3.new(width, 30, 3),
		Material = Enum.Material.Brick,
		Color = Color3.fromRGB(46, 40, 66),
		CFrame = CFrame.new(0, 13, -15),
		CastShadow = true,
	}, folder)

	-- murales de colores
	local random = Random.new(21)
	local mural = {
		Color3.fromRGB(255, 70, 110),
		Color3.fromRGB(70, 200, 255),
		Color3.fromRGB(255, 200, 60),
		Color3.fromRGB(150, 90, 255),
	}
	for i = 1, 9 do
		local panelWidth = random:NextInteger(5, 9)
		local panelHeight = random:NextInteger(4, 8)
		Util.part({
			Name = "Mural",
			Size = Vector3.new(panelWidth, panelHeight, 0.3),
			Material = Enum.Material.SmoothPlastic,
			Color = mural[(i % #mural) + 1]:Lerp(Color3.new(0, 0, 0), 0.62),
			CFrame = CFrame.new(-Config.ArenaHalfWidth - 20 + (i - 1) * 11.5, 8 + random:NextInteger(0, 8), -13.3),
		}, folder)
	end

	-- letrero luminoso con el nombre del juego
	local sign = Util.part({
		Name = "Sign",
		Size = Vector3.new(34, 7, 0.4),
		Material = Enum.Material.SmoothPlastic,
		Color = Color3.fromRGB(14, 10, 26),
		CFrame = CFrame.new(0, 27, -13.2),
	}, folder)

	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.LightInfluence = 0
	gui.Brightness = 3
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.Parent = sign

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = string.upper(Config.GameName)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBlack
	label.TextColor3 = Color3.fromRGB(255, 214, 102)
	label.TextStrokeColor3 = Color3.fromRGB(255, 70, 110)
	label.TextStrokeTransparency = 0.2
	label.Parent = gui
end

local function buildFloor(folder, onMarkers)
	local half = Config.ArenaHalfWidth

	Util.part({
		Name = "Floor",
		Size = Vector3.new(half * 2 + 80, 4, 40),
		Material = Enum.Material.Concrete,
		Color = Color3.fromRGB(58, 56, 72),
		CFrame = CFrame.new(0, Config.FloorTopY - 2, -2),
		CanCollide = true,
		CanQuery = true,
		CastShadow = false,
	}, folder)

	-- linea central
	Util.part({
		Name = "CenterLine",
		Size = Vector3.new(0.5, 0.06, 24),
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(240, 240, 255),
		Transparency = 0.15,
		CFrame = CFrame.new(0, Config.FloorTopY + 0.03, 0),
	}, folder)

	-- bordes de la zona de pelea
	for _, sign in ipairs({ -1, 1 }) do
		Util.part({
			Name = "EdgeLine",
			Size = Vector3.new(0.6, 0.06, 24),
			Material = Enum.Material.Neon,
			Color = Color3.fromRGB(255, 214, 102),
			Transparency = 0.3,
			CFrame = CFrame.new(sign * half, Config.FloorTopY + 0.03, 0),
		}, folder)
	end

	-- discos de salida de cada equipo
	local markers = {}
	for side, sign in pairs({ left = -1, right = 1 }) do
		markers[side] = Util.part({
			Name = "StartMarker_" .. side,
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.12, 5.2, 5.2),
			Material = Enum.Material.Neon,
			Color = Color3.new(1, 1, 1),
			Transparency = 0.3,
			CFrame = CFrame.new(sign * Config.StartOffset, Config.FloorTopY + 0.07, 0) * CFrame.Angles(0, 0, math.rad(90)),
		}, folder)
	end
	onMarkers(markers)
end

local function buildWalls(folder)
	local half = Config.ArenaHalfWidth

	-- los luchadores no pueden salirse de la arena
	for _, sign in ipairs({ -1, 1 }) do
		Util.part({
			Name = "SideWall",
			Size = Vector3.new(2, 60, 40),
			Transparency = 1,
			CFrame = CFrame.new(sign * (half + 2.2), 28, 0),
			CanCollide = true,
		}, folder)
	end
	for _, z in ipairs({ -6, 6 }) do
		Util.part({
			Name = "DepthWall",
			Size = Vector3.new(half * 2 + 12, 60, 2),
			Transparency = 1,
			CFrame = CFrame.new(0, 28, z),
			CanCollide = true,
		}, folder)
	end
	Util.part({
		Name = "Ceiling",
		Size = Vector3.new(half * 2 + 12, 2, 14),
		Transparency = 1,
		CFrame = CFrame.new(0, 60, 0),
		CanCollide = true,
	}, folder)
end

local function buildLamps(folder)
	local half = Config.ArenaHalfWidth
	for _, sign in ipairs({ -1, 1 }) do
		local x = sign * (half + 8)
		Util.part({
			Name = "LampPost",
			Size = Vector3.new(0.9, 18, 0.9),
			Material = Enum.Material.Metal,
			Color = Color3.fromRGB(28, 28, 36),
			CFrame = CFrame.new(x, 9, -8),
		}, folder)
		local head = Util.part({
			Name = "LampHead",
			Size = Vector3.new(3.4, 0.8, 1.6),
			Material = Enum.Material.Neon,
			Color = Color3.fromRGB(255, 232, 170),
			CFrame = CFrame.new(x - sign * 1.2, 18.4, -8),
		}, folder)
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 232, 170)
		light.Range = 45
		light.Brightness = 1.6
		light.Parent = head
	end
end

-- Devuelve { folder, setTeamColors = function(leftColor, rightColor) }
function Arena.build(parent)
	clearOld(parent)
	setupLighting()

	-- piezas de la plantilla "Baseplate" que estorban: el suelo gris y el punto de aparicion
	for _, name in ipairs({ "Baseplate", "SpawnLocation" }) do
		local leftover = parent:FindFirstChild(name)
		if leftover and (leftover:IsA("BasePart")) then
			leftover:Destroy()
		end
	end

	local folder = Instance.new("Folder")
	folder.Name = ARENA_FOLDER_NAME
	folder.Parent = parent

	local markers = {}
	buildFloor(folder, function(created)
		markers = created
	end)
	buildWalls(folder)
	buildBackWall(folder)
	buildSkyline(folder)
	buildLamps(folder)

	-- luces de cada equipo sobre su lado de la arena
	local teamLights = {}
	for side, sign in pairs({ left = -1, right = 1 }) do
		local anchor = Util.part({
			Name = "TeamLight_" .. side,
			Size = Vector3.new(1, 1, 1),
			Transparency = 1,
			CFrame = CFrame.new(sign * 16, 22, 12),
		}, folder)
		local light = Instance.new("PointLight")
		light.Range = 70
		light.Brightness = 2.2
		light.Shadows = false
		light.Parent = anchor
		teamLights[side] = light
	end

	local arena = { folder = folder }

	function arena.setTeamColors(leftColor, rightColor)
		teamLights.left.Color = leftColor
		teamLights.right.Color = rightColor
		markers.left.Color = leftColor
		markers.right.Color = rightColor
	end

	arena.setTeamColors(Config.Defaults.left.color, Config.Defaults.right.color)
	return arena
end

return Arena

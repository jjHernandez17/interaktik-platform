-- Carro de Formula 1 detallado y colorido, armado con partes de Roblox.
--
-- Convencion del modelo (igual que Roblox): el frente apunta a -Z, la derecha es +X y arriba es +Y.
-- Origen: centro del carro al nivel del suelo. Largo ~17 studs, ancho ~7.6 (de rueda a rueda), alto ~4.4.
--
--   local Car = require(CarBuilder)
--   local model = Car.build(Car.TEAMS[1], 1)     -- equipo + numero
--
-- El modelo queda soldado a una pieza "Chassis" (PrimaryPart). Las ruedas se llaman Wheel_FL/FR/RL/RR para que luego se
-- puedan mover o girar con el codigo de la carrera.

local CarBuilder = {}

local function rgb(r, g, b)
	return Color3.fromRGB(r, g, b)
end

-- Equipos ficticios, cada uno con su propia paleta
CarBuilder.TEAMS = {
	{ name = "SOLAR RACING", primary = rgb(232, 28, 40), secondary = rgb(250, 250, 250), accent = rgb(255, 214, 0), helmet = rgb(255, 214, 0), tire = rgb(240, 30, 30) },
	{ name = "OCEANO GP", primary = rgb(0, 102, 255), secondary = rgb(255, 128, 0), accent = rgb(0, 232, 255), helmet = rgb(255, 128, 0), tire = rgb(255, 214, 0) },
	{ name = "TOXIC GREEN", primary = rgb(70, 255, 90), secondary = rgb(20, 22, 26), accent = rgb(255, 0, 170), helmet = rgb(255, 0, 170), tire = rgb(240, 240, 240) },
	{ name = "GOLDEN BEE", primary = rgb(255, 214, 0), secondary = rgb(20, 20, 24), accent = rgb(255, 255, 255), helmet = rgb(30, 30, 30), tire = rgb(240, 30, 30) },
	{ name = "NEBULA", primary = rgb(140, 62, 255), secondary = rgb(255, 72, 182), accent = rgb(0, 238, 255), helmet = rgb(255, 72, 182), tire = rgb(255, 214, 0) },
	{ name = "AQUA STORM", primary = rgb(0, 214, 204), secondary = rgb(250, 250, 250), accent = rgb(255, 118, 0), helmet = rgb(255, 118, 0), tire = rgb(240, 240, 240) },
	{ name = "INFERNO", primary = rgb(255, 112, 0), secondary = rgb(22, 34, 96), accent = rgb(255, 232, 0), helmet = rgb(22, 34, 96), tire = rgb(240, 30, 30) },
	{ name = "ARCTIC", primary = rgb(236, 242, 252), secondary = rgb(92, 172, 255), accent = rgb(238, 28, 52), helmet = rgb(238, 28, 52), tire = rgb(255, 214, 0) },
}

local CARBON = rgb(26, 28, 34)
local METAL = rgb(150, 158, 170)
local BLACK = rgb(14, 14, 16)

-- ---------------------------------------------------------------------------------------------------------------------

local function newPart(parent, name, size, cframe, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.Anchored = false
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

-- MaterialVariant generado en Studio (MaterialService): carbono, goma... Si no existe, se ve el material normal
local function carbon(part)
	part.Material = Enum.Material.SmoothPlastic
	part.MaterialVariant = "F1Carbon"
	part.Reflectance = 0.04
	return part
end

local function newWedge(parent, name, size, cframe, color, material)
	local wedge = Instance.new("WedgePart")
	wedge.Name = name
	wedge.Size = size
	wedge.CFrame = cframe
	wedge.Color = color
	wedge.Material = material or Enum.Material.SmoothPlastic
	wedge.Anchored = false
	wedge.CanCollide = false
	wedge.CanQuery = false
	wedge.CanTouch = false
	wedge.TopSurface = Enum.SurfaceType.Smooth
	wedge.BottomSurface = Enum.SurfaceType.Smooth
	wedge.Parent = parent
	return wedge
end

-- Cilindro con el eje a lo largo de Z (para narices, escapes, tomas de aire...)
local function cylinderZ(parent, name, length, diameter, position, color, material)
	local part = newPart(parent, name, Vector3.new(length, diameter, diameter), CFrame.new(position) * CFrame.Angles(0, math.rad(90), 0), color, material)
	part.Shape = Enum.PartType.Cylinder
	return part
end

-- Barra delgada entre dos puntos (suspension, halo, soportes)
local function bar(parent, name, from, to, thickness, color, material)
	local distance = (to - from).Magnitude
	local part = newPart(parent, name, Vector3.new(thickness, thickness, distance), CFrame.lookAt((from + to) / 2, to), color, material or Enum.Material.Metal)
	return part
end

local function addText(part, face, text, color, size)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.LightInfluence = 0
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 60
	gui.Parent = part

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.Font = Enum.Font.GothamBlack
	label.TextColor3 = color
	label.TextStrokeTransparency = size and 1 or 0.6
	label.Parent = gui
	return label
end

local function addGlow(part, color, brightness, range)
	local light = Instance.new("PointLight")
	light.Color = color
	light.Brightness = brightness
	light.Range = range
	light.Shadows = false
	light.Parent = part
end

-- ---------------------------------------------------------------------------------------------------------------------

-- Una rueda completa: neumatico con franja de color del compuesto, rin, radios y tuerca central.
-- side = -1 (izquierda) o 1 (derecha). El eje del cilindro es X.
local function buildWheel(model, name, x, z, radius, width, side, team)
	local folder = Instance.new("Model")
	folder.Name = name
	folder.Parent = model

	local center = Vector3.new(x, radius, z)
	-- Eje de giro: la rueda entera cuelga de este cubo invisible, que se une al chasis con un Motor6D ("Spin") para poder girarla
	local hub = newPart(folder, "Hub", Vector3.new(0.3, 0.3, 0.3), CFrame.new(center), BLACK)
	hub.Transparency = 1
	hub:SetAttribute("Radius", radius)

	local face = side * (width / 2) -- cara exterior de la rueda

	local tire = newPart(folder, "Tire", Vector3.new(width, radius * 2, radius * 2), CFrame.new(center), rgb(30, 30, 33), Enum.Material.Rubber)
	tire.Shape = Enum.PartType.Cylinder
	tire.MaterialVariant = "F1Tyre"

	-- Franja de color del compuesto en el costado (anillo: disco de color + disco negro un poco mas chico)
	local band = newPart(folder, "SidewallBand", Vector3.new(0.08, radius * 1.74, radius * 1.74), CFrame.new(center + Vector3.new(face + side * 0.02, 0, 0)), team.tire, Enum.Material.SmoothPlastic)
	band.Shape = Enum.PartType.Cylinder
	local inner = newPart(folder, "SidewallInner", Vector3.new(0.1, radius * 1.6, radius * 1.6), CFrame.new(center + Vector3.new(face + side * 0.025, 0, 0)), rgb(24, 24, 28), Enum.Material.SmoothPlastic)
	inner.Shape = Enum.PartType.Cylinder

	-- Rin
	local rim = newPart(folder, "Rim", Vector3.new(0.16, radius * 1.34, radius * 1.34), CFrame.new(center + Vector3.new(face + side * 0.09, 0, 0)), METAL, Enum.Material.Metal)
	rim.Shape = Enum.PartType.Cylinder
	rim.Reflectance = 0.45
	local rimColor = newPart(folder, "RimAccent", Vector3.new(0.2, radius * 1.0, radius * 1.0), CFrame.new(center + Vector3.new(face + side * 0.1, 0, 0)), team.accent, Enum.Material.SmoothPlastic)
	rimColor.Shape = Enum.PartType.Cylinder

	-- Radios
	for i = 0, 4 do
		local angle = math.rad(i * 72 + 18)
		local spoke = newPart(folder, "Spoke", Vector3.new(0.12, 0.2, radius * 0.95), CFrame.new(center + Vector3.new(face + side * 0.2, 0, 0)) * CFrame.Angles(angle, 0, 0) * CFrame.new(0, 0, -radius * 0.24), CARBON, Enum.Material.Metal)
	end

	-- Tuerca central
	local nut = newPart(folder, "Nut", Vector3.new(0.18, radius * 0.34, radius * 0.34), CFrame.new(center + Vector3.new(face + side * 0.3, 0, 0)), rgb(235, 235, 240), Enum.Material.Metal)
	nut.Reflectance = 0.5
	nut.Shape = Enum.PartType.Cylinder

	-- Disco de freno visible dentro de la rueda
	local disc = newPart(folder, "BrakeDisc", Vector3.new(0.12, radius * 1.15, radius * 1.15), CFrame.new(center + Vector3.new(-face * 0.4, 0, 0)), rgb(210, 90, 40), Enum.Material.Metal)
	disc.Shape = Enum.PartType.Cylinder

	return center, tire
end

-- ---------------------------------------------------------------------------------------------------------------------

function CarBuilder.build(team, number)
	local model = Instance.new("Model")
	model.Name = "Car_" .. tostring(number)
	model:SetAttribute("Team", team.name)
	model:SetAttribute("Number", number)

	local chassis = newPart(model, "Chassis", Vector3.new(1, 1, 1), CFrame.new(0, 1.6, 0), CARBON)
	chassis.Transparency = 1
	model.PrimaryPart = chassis

	local primary, secondary, accent = team.primary, team.secondary, team.accent

	-- ---------- piso, splitter y luz de piso ----------
	carbon(newPart(model, "Floor", Vector3.new(5.8, 0.25, 12.8), CFrame.new(0, 0.55, 0.3), CARBON))
	newPart(model, "Splitter", Vector3.new(6.4, 0.12, 1.4), CFrame.new(0, 0.48, -6.2), accent, Enum.Material.SmoothPlastic)
	carbon(newPart(model, "Diffuser", Vector3.new(4.6, 0.18, 1.6), CFrame.new(0, 0.7, 7.0) * CFrame.Angles(math.rad(-12), 0, 0), CARBON))
	for _, side in ipairs({ -1, 1 }) do
		local glow = newPart(model, "Underglow", Vector3.new(0.12, 0.06, 9.5), CFrame.new(side * 2.95, 0.42, 0.4), accent, Enum.Material.Neon)
		addGlow(glow, accent, 0.9, 9)
	end

	-- ---------- monocasco y nariz ----------
	newPart(model, "Tub", Vector3.new(2.5, 1.35, 6.6), CFrame.new(0, 1.35, 0.9), primary)
	newWedge(model, "NoseTop", Vector3.new(2.1, 1.15, 5.2), CFrame.new(0, 1.18, -4.5) * CFrame.Angles(0, math.rad(180), 0), primary)
	cylinderZ(model, "NoseTip", 1.6, 1.05, Vector3.new(0, 0.95, -7.2), primary)
	cylinderZ(model, "NoseCap", 0.4, 1.12, Vector3.new(0, 0.95, -8.05), accent)
	-- franja central de librea (recorre la nariz y el monocasco)
	newPart(model, "StripeTub", Vector3.new(0.55, 0.06, 5.0), CFrame.new(0, 2.04, 0.2), secondary, Enum.Material.SmoothPlastic)
	newPart(model, "StripeNose", Vector3.new(0.5, 0.05, 3.6), CFrame.new(0, 1.84, -4.0) * CFrame.Angles(math.rad(-8), 0, 0), secondary, Enum.Material.SmoothPlastic)
	newPart(model, "StripeAccent", Vector3.new(0.18, 0.07, 5.0), CFrame.new(0.5, 2.05, 0.2), accent, Enum.Material.Neon)
	newPart(model, "StripeAccent", Vector3.new(0.18, 0.07, 5.0), CFrame.new(-0.5, 2.05, 0.2), accent, Enum.Material.Neon)

	-- ---------- cabina, piloto y volante ----------
	newPart(model, "Cockpit", Vector3.new(1.7, 0.55, 2.8), CFrame.new(0, 2.05, 0.4), rgb(10, 10, 12))
	newPart(model, "Seat", Vector3.new(1.3, 0.2, 1.4), CFrame.new(0, 2.25, 1.1), rgb(30, 30, 36))
	newPart(model, "Shoulders", Vector3.new(1.5, 0.55, 0.9), CFrame.new(0, 2.4, 0.95), secondary)
	local helmet = newPart(model, "Helmet", Vector3.new(1.15, 1.15, 1.15), CFrame.new(0, 2.95, 0.45), team.helmet)
	helmet.Shape = Enum.PartType.Ball
	newPart(model, "Visor", Vector3.new(0.9, 0.36, 0.5), CFrame.new(0, 3.0, -0.08), rgb(10, 10, 14), Enum.Material.Glass).Reflectance = 0.35
	newPart(model, "HelmetStripe", Vector3.new(0.18, 0.08, 1.0), CFrame.new(0, 3.5, 0.45), secondary)
	local wheel = newPart(model, "SteeringWheel", Vector3.new(0.9, 0.5, 0.12), CFrame.new(0, 2.5, -0.7) * CFrame.Angles(math.rad(-35), 0, 0), BLACK)
	newPart(model, "SteeringLeds", Vector3.new(0.7, 0.06, 0.04), CFrame.new(0, 2.7, -0.76) * CFrame.Angles(math.rad(-35), 0, 0), rgb(255, 60, 60), Enum.Material.Neon)

	-- ---------- halo ----------
	for _, side in ipairs({ -1, 1 }) do
		bar(model, "HaloSide", Vector3.new(side * 0.95, 2.3, 1.7), Vector3.new(side * 0.85, 3.45, 0.2), 0.16, METAL)
		bar(model, "HaloSide", Vector3.new(side * 0.85, 3.45, 0.2), Vector3.new(side * 0.35, 3.5, -1.1), 0.16, METAL)
	end
	bar(model, "HaloFront", Vector3.new(0, 2.45, -1.7), Vector3.new(0, 3.5, -1.05), 0.2, METAL)
	bar(model, "HaloTop", Vector3.new(-0.35, 3.5, -1.1), Vector3.new(0.35, 3.5, -1.1), 0.16, METAL)

	-- ---------- pontones (sidepods) ----------
	for _, side in ipairs({ -1, 1 }) do
		newPart(model, "Sidepod", Vector3.new(1.75, 1.3, 4.9), CFrame.new(side * 2.05, 1.25, 1.6), primary)
		newWedge(model, "SidepodFront", Vector3.new(1.75, 1.3, 1.6), CFrame.new(side * 2.05, 1.25, -1.65) * CFrame.Angles(0, math.rad(180), 0), primary)
		newPart(model, "Intake", Vector3.new(1.4, 0.8, 0.12), CFrame.new(side * 2.05, 1.3, -1.35), rgb(8, 8, 10))
		newPart(model, "SidepodStripe", Vector3.new(0.1, 0.55, 4.6), CFrame.new(side * 2.94, 1.35, 1.6), secondary)
		newPart(model, "SidepodAccent", Vector3.new(0.1, 0.16, 4.6), CFrame.new(side * 2.95, 1.0, 1.6), accent, Enum.Material.Neon)
		newPart(model, "SidepodTop", Vector3.new(1.6, 0.08, 4.4), CFrame.new(side * 2.05, 1.93, 1.6), secondary)
		-- espejo
		bar(model, "MirrorStalk", Vector3.new(side * 1.1, 2.3, -1.0), Vector3.new(side * 1.85, 2.65, -1.2), 0.1, CARBON)
		newPart(model, "Mirror", Vector3.new(0.6, 0.34, 0.12), CFrame.new(side * 2.1, 2.7, -1.25), accent)
	end

	-- ---------- cubierta del motor, aleta y toma de aire ----------
	newPart(model, "EngineCover", Vector3.new(1.5, 1.35, 4.4), CFrame.new(0, 2.0, 4.0), primary)
	newWedge(model, "EngineTail", Vector3.new(1.5, 1.35, 2.0), CFrame.new(0, 1.55, 6.9), primary)
	newWedge(model, "SharkFin", Vector3.new(0.2, 1.4, 4.0), CFrame.new(0, 3.35, 4.2) * CFrame.Angles(0, math.rad(180), 0), secondary)
	cylinderZ(model, "Airbox", 1.9, 1.25, Vector3.new(0, 3.35, 1.6), primary)
	cylinderZ(model, "AirboxInlet", 0.2, 0.95, Vector3.new(0, 3.35, 0.55), rgb(8, 8, 10))
	newPart(model, "AirboxStripe", Vector3.new(0.12, 0.3, 1.9), CFrame.new(0.64, 3.55, 1.6), accent, Enum.Material.Neon)

	-- ---------- trasera: caja de cambios, escape y luz de lluvia ----------
	carbon(newPart(model, "Gearbox", Vector3.new(1.3, 0.95, 2.0), CFrame.new(0, 1.2, 6.5), CARBON))
	cylinderZ(model, "Exhaust", 1.0, 0.5, Vector3.new(0, 1.8, 7.9), METAL, Enum.Material.Metal).Reflectance = 0.3
	local heat = cylinderZ(model, "ExhaustGlow", 0.15, 0.34, Vector3.new(0, 1.8, 8.4), rgb(255, 120, 20), Enum.Material.Neon)
	addGlow(heat, rgb(255, 120, 20), 0.8, 6)
	local rain = newPart(model, "RainLight", Vector3.new(0.6, 0.36, 0.14), CFrame.new(0, 1.05, 8.1), rgb(255, 40, 40), Enum.Material.Neon)
	addGlow(rain, rgb(255, 40, 40), 1.2, 7)

	-- ---------- alerón trasero ----------
	newPart(model, "RearWingMain", Vector3.new(6.2, 0.26, 1.7), CFrame.new(0, 3.55, 7.5) * CFrame.Angles(math.rad(8), 0, 0), secondary)
	newPart(model, "RearWingFlap", Vector3.new(6.2, 0.2, 1.1), CFrame.new(0, 4.15, 7.35) * CFrame.Angles(math.rad(22), 0, 0), primary)
	newPart(model, "RearWingStripe", Vector3.new(6.2, 0.05, 0.28), CFrame.new(0, 4.3, 7.2) * CFrame.Angles(math.rad(22), 0, 0), accent, Enum.Material.Neon)
	for _, side in ipairs({ -1, 1 }) do
		newPart(model, "RearEndplate", Vector3.new(0.18, 2.3, 2.6), CFrame.new(side * 3.15, 3.5, 7.45), accent)
		newPart(model, "RearEndplateStripe", Vector3.new(0.2, 0.5, 2.2), CFrame.new(side * 3.16, 3.7, 7.45), primary)
		bar(model, "RearWingPillar", Vector3.new(side * 0.35, 1.7, 6.7), Vector3.new(side * 0.35, 3.5, 7.4), 0.2, CARBON, Enum.Material.Metal)
	end

	-- ---------- alerón delantero ----------
	newPart(model, "FrontWingMain", Vector3.new(7.6, 0.2, 1.9), CFrame.new(0, 0.66, -7.4) * CFrame.Angles(math.rad(-4), 0, 0), primary)
	newPart(model, "FrontWingFlap1", Vector3.new(7.1, 0.16, 1.1), CFrame.new(0, 0.98, -7.15) * CFrame.Angles(math.rad(-10), 0, 0), secondary)
	newPart(model, "FrontWingFlap2", Vector3.new(6.6, 0.14, 0.8), CFrame.new(0, 1.26, -6.95) * CFrame.Angles(math.rad(-16), 0, 0), accent)
	for _, side in ipairs({ -1, 1 }) do
		newPart(model, "FrontEndplate", Vector3.new(0.18, 1.2, 2.5), CFrame.new(side * 3.85, 0.98, -7.35), accent)
		newPart(model, "FrontEndplateStripe", Vector3.new(0.2, 0.34, 2.2), CFrame.new(side * 3.86, 1.2, -7.35), secondary)
		bar(model, "FrontWingPylon", Vector3.new(side * 0.4, 1.0, -6.0), Vector3.new(side * 0.4, 0.75, -7.3), 0.2, CARBON, Enum.Material.Metal)
	end

	-- ---------- ruedas y suspension ----------
	local frontRadius, rearRadius = 1.65, 1.85
	local wheels = {
		{ "Wheel_FL", -3.4, -5.1, frontRadius, 1.5, -1 },
		{ "Wheel_FR", 3.4, -5.1, frontRadius, 1.5, 1 },
		{ "Wheel_RL", -3.5, 4.7, rearRadius, 2.1, -1 },
		{ "Wheel_RR", 3.5, 4.7, rearRadius, 2.1, 1 },
	}
	for _, info in ipairs(wheels) do
		local name, x, z, radius, width, side = table.unpack(info)
		local center = buildWheel(model, name, x, z, radius, width, side, team)

		-- dos brazos de suspension por rueda (arriba y abajo) hacia el cuerpo
		local bodyX = side * 1.3
		bar(model, "ArmUpper", Vector3.new(bodyX, 1.7, z - 0.7), Vector3.new(x - side * (width / 2), center.Y + 0.3, z), 0.14, METAL)
		bar(model, "ArmUpper", Vector3.new(bodyX, 1.7, z + 0.7), Vector3.new(x - side * (width / 2), center.Y + 0.3, z), 0.14, METAL)
		bar(model, "ArmLower", Vector3.new(bodyX, 0.8, z - 0.9), Vector3.new(x - side * (width / 2), center.Y - 0.3, z), 0.16, CARBON)
		bar(model, "ArmLower", Vector3.new(bodyX, 0.8, z + 0.9), Vector3.new(x - side * (width / 2), center.Y - 0.3, z), 0.16, CARBON)
	end

	-- ---------- numeros y nombre del equipo ----------
	local noseTop = newPart(model, "NumberPlate", Vector3.new(1.3, 0.04, 1.3), CFrame.new(0, 1.78, -3.3) * CFrame.Angles(math.rad(-8), 0, 0), secondary)
	addText(noseTop, Enum.NormalId.Top, tostring(number), primary).Rotation = 0
	for _, side in ipairs({ -1, 1 }) do
		local sidePlate = newPart(model, "SideNumber", Vector3.new(0.05, 0.9, 1.8), CFrame.new(side * 2.97, 1.4, 1.2), secondary)
		addText(sidePlate, side == 1 and Enum.NormalId.Right or Enum.NormalId.Left, tostring(number), primary)
		local cover = newPart(model, "TeamName", Vector3.new(0.05, 0.5, 3.2), CFrame.new(side * 0.78, 2.15, 4.0), secondary)
		addText(cover, side == 1 and Enum.NormalId.Right or Enum.NormalId.Left, team.name, primary)
	end
	local wingText = newPart(model, "WingSponsor", Vector3.new(4.2, 0.04, 0.9), CFrame.new(0, 3.72, 7.55) * CFrame.Angles(math.rad(8), 0, 0), accent)
	addText(wingText, Enum.NormalId.Top, team.name, secondary)

	-- Pintura brillante: las piezas de los colores del equipo reflejan un poco el cielo
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("BasePart") and descendant.Material == Enum.Material.SmoothPlastic and descendant.Reflectance == 0 then
			local c = descendant.Color
			if c == primary or c == secondary or c == accent then
				descendant.Reflectance = 0.1
			end
		end
	end

	-- Todo soldado al chasis; las piezas de cada rueda se sueldan a su cubo, y el cubo gira con un Motor6D
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("BasePart") and descendant ~= chassis then
			local isWheelPart = descendant.Parent and string.sub(descendant.Parent.Name, 1, 6) == "Wheel_"
			if descendant.Name == "Hub" and isWheelPart then
				local motor = Instance.new("Motor6D")
				motor.Name = "Spin"
				motor.Part0 = chassis
				motor.Part1 = descendant
				motor.C0 = chassis.CFrame:ToObjectSpace(descendant.CFrame)
				motor.Parent = descendant
			else
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = isWheelPart and descendant.Parent:FindFirstChild("Hub") or chassis
				weld.Part1 = descendant
				weld.Parent = descendant
			end
		end
	end
	chassis.Anchored = true

	return model
end

return CarBuilder

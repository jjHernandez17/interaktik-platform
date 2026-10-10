-- Efectos visuales del servidor: chispas, ondas, bolas de energia, auras, escudos, hielo, meteoros y numeros de daño.
-- Todo se crea como piezas simples (sin imagenes ni sonidos externos) y se borra solo.

local TweenService = game:GetService("TweenService")

local Util = require(script.Parent.Util)

local Effects = {}

local container = nil
local fxRemote = nil

function Effects.init(folder, remote)
	container = folder
	fxRemote = remote
end

-- Efectos de pantalla que dibuja el cliente: "shake", "flash", "slowmo", "ko", "zoom"
function Effects.screen(name, ...)
	if fxRemote then
		fxRemote:FireAllClients(name, ...)
	end
end

-- Pieza invisible para colgar emisores de particulas en un punto
local function anchorPoint(position, lifetime)
	local part = Util.part({
		Size = Vector3.new(0.4, 0.4, 0.4),
		Transparency = 1,
		CFrame = CFrame.new(position),
	}, container)
	Util.debris(part, lifetime or 2)
	return part
end

local function burst(position, color, count, speedMin, speedMax, size, lifetime)
	local part = anchorPoint(position, 2)
	local emitter = Instance.new("ParticleEmitter")
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	emitter.Color = ColorSequence.new(Color3.new(1, 1, 1), color)
	emitter.Lifetime = NumberRange.new(lifetime * 0.6, lifetime)
	emitter.Speed = NumberRange.new(speedMin, speedMax)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Rate = 0
	emitter.Drag = 4
	emitter.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size), NumberSequenceKeypoint.new(1, 0) })
	emitter.LightEmission = 1
	emitter.LightInfluence = 0
	emitter.Parent = part
	emitter:Emit(count)
end

-- Onda que se expande y se desvanece
function Effects.ring(position, color, startSize, endSize, duration)
	local ring = Util.part({
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(startSize, startSize, startSize),
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 0.25,
		CFrame = CFrame.new(position),
	}, container)
	Util.tween(ring, duration, { Size = Vector3.new(endSize, endSize, endSize), Transparency = 1 })
	Util.debris(ring, duration + 0.1)
end

-- Golpe que conecta. power: 1 normal, 2 fuerte, 3 enorme
function Effects.hit(position, color, power)
	power = power or 1
	burst(position, color, 10 * power, 14 * power, 26 * power, 1.1 * power, 0.45)
	Effects.ring(position, color, 0.6, 3.2 * power, 0.22)
end

function Effects.block(position, color)
	burst(position, Color3.fromRGB(190, 225, 255), 8, 10, 18, 0.8, 0.35)
	Effects.ring(position, Color3.fromRGB(150, 205, 255), 0.5, 2.6, 0.2)
end

-- Numero flotante: dano, curacion, escudo...
function Effects.floatingText(position, text, color, size)
	local part = anchorPoint(position + Vector3.new(0, 2.5, 0), 1.4)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(size or 150, (size or 150) * 0.4)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.Parent = part

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.Font = Enum.Font.GothamBlack
	label.TextStrokeTransparency = 0
	label.TextStrokeColor3 = Color3.new(0, 0, 0)
	label.Parent = gui

	Util.tween(part, 1.1, { CFrame = part.CFrame + Vector3.new(0, 4.5, 0) })
	local fade = TweenService:Create(label, TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 0.6), {
		TextTransparency = 1,
		TextStrokeTransparency = 1,
	})
	fade:Play()
end

function Effects.healBurst(position)
	burst(position, Color3.fromRGB(90, 255, 140), 18, 6, 14, 1.1, 0.8)
	Effects.ring(position, Color3.fromRGB(90, 255, 140), 0.8, 5, 0.5)
end

-- Bola de energia o shuriken (la mueve Combat.lua)
function Effects.projectileBall(position, color, size)
	local part = Util.part({
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(size, size, size),
		Material = Enum.Material.Neon,
		Color = color,
		CFrame = CFrame.new(position),
	}, container)

	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 14
	light.Brightness = 3
	light.Parent = part

	local top = Instance.new("Attachment")
	top.Position = Vector3.new(0, size * 0.5, 0)
	top.Parent = part
	local bottom = Instance.new("Attachment")
	bottom.Position = Vector3.new(0, -size * 0.5, 0)
	bottom.Parent = part
	local trail = Instance.new("Trail")
	trail.Attachment0 = top
	trail.Attachment1 = bottom
	trail.Lifetime = 0.3
	trail.Color = ColorSequence.new(color)
	trail.Transparency = NumberSequence.new(0.1, 1)
	trail.LightEmission = 1
	trail.Parent = part

	return part
end

-- Explosion de adorno (no empuja ni rompe nada)
function Effects.explosion(position, radius)
	local explosion = Instance.new("Explosion")
	explosion.BlastPressure = 0
	explosion.BlastRadius = radius or 6
	explosion.DestroyJointRadiusPercent = 0
	explosion.Position = position
	explosion.Parent = container
end

-- Meteoro que cae desde el cielo y avisa al llegar al suelo
function Effects.meteor(targetPosition, color, onImpact)
	local size = 4.2
	local startPosition = targetPosition + Vector3.new(math.random(-8, 8), 70, 0)
	local rock = Util.part({
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(size, size, size),
		Material = Enum.Material.Neon,
		Color = Color3.fromRGB(255, 140, 40),
		CFrame = CFrame.new(startPosition),
	}, container)

	local fire = Instance.new("Fire")
	fire.Size = 12
	fire.Heat = 10
	fire.Color = Color3.fromRGB(255, 160, 40)
	fire.SecondaryColor = color
	fire.Parent = rock

	local fall = Util.tween(rock, 0.65, { Position = targetPosition }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
	fall.Completed:Connect(function()
		rock:Destroy()
		Effects.explosion(targetPosition, 7)
		Effects.ring(targetPosition, color, 1, 9, 0.35)
		burst(targetPosition, Color3.fromRGB(255, 190, 80), 24, 16, 34, 1.4, 0.6)
		if onImpact then
			onImpact(targetPosition)
		end
	end)
end

-- Llama alrededor del luchador (furia). Devuelve una funcion para quitarla.
function Effects.fireAura(model, color)
	local torso = model:FindFirstChild("UpperTorso") or model:FindFirstChild("Torso")
	if not torso then
		return function() end
	end
	local fire = Instance.new("Fire")
	fire.Size = 9
	fire.Heat = 12
	fire.Color = color
	fire.SecondaryColor = Color3.fromRGB(255, 220, 90)
	fire.Parent = torso
	return function()
		fire:Destroy()
	end
end

-- Chispas alrededor del luchador (velocidad). Devuelve una funcion para quitarlas.
function Effects.sparkleAura(model, color)
	local torso = model:FindFirstChild("UpperTorso") or model:FindFirstChild("Torso")
	if not torso then
		return function() end
	end
	local sparkles = Instance.new("Sparkles")
	sparkles.SparkleColor = color
	sparkles.Parent = torso
	return function()
		sparkles:Destroy()
	end
end

-- Esfera transparente pegada al luchador (escudo)
function Effects.bubble(model, color)
	local root = model:FindFirstChild("HumanoidRootPart")
	if not root then
		return nil
	end

	local bubble = Instance.new("Part")
	bubble.Shape = Enum.PartType.Ball
	bubble.Size = Vector3.new(8.5, 8.5, 8.5)
	bubble.Material = Enum.Material.ForceField
	bubble.Color = color
	bubble.Transparency = 0.35
	bubble.CanCollide = false
	bubble.CanQuery = false
	bubble.CanTouch = false
	bubble.Massless = true
	bubble.CastShadow = false
	bubble.CFrame = root.CFrame
	bubble.Parent = model

	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = bubble
	weld.Parent = bubble
	return bubble
end

-- Bloque de hielo alrededor del luchador (congelado)
function Effects.iceBlock(model)
	local root = model:FindFirstChild("HumanoidRootPart")
	if not root then
		return nil
	end

	local ice = Instance.new("Part")
	ice.Size = Vector3.new(5.2, 8.4, 4.4)
	ice.Material = Enum.Material.Glass
	ice.Color = Color3.fromRGB(165, 225, 255)
	ice.Transparency = 0.4
	ice.CanCollide = false
	ice.CanQuery = false
	ice.CanTouch = false
	ice.Massless = true
	ice.CastShadow = false
	ice.CFrame = root.CFrame
	ice.Parent = model

	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = ice
	weld.Parent = ice
	return ice
end

-- Rayo de energia que cruza la arena (super ataque). Es solo visual; el dano lo pone Combat.lua.
function Effects.beam(fromPosition, toPosition, color)
	local distance = (toPosition - fromPosition).Magnitude
	local middle = (fromPosition + toPosition) / 2
	local beam = Util.part({
		Size = Vector3.new(distance, 3.2, 3.2),
		Material = Enum.Material.Neon,
		Color = color,
		Transparency = 0.1,
		CFrame = CFrame.new(middle), -- la pelea es de lado: el rayo siempre va a lo largo del eje X
	}, container)
	local core = Util.part({
		Size = Vector3.new(distance, 1.4, 1.4),
		Material = Enum.Material.Neon,
		Color = Color3.new(1, 1, 1),
		CFrame = beam.CFrame,
	}, container)
	Util.tween(beam, 0.5, { Size = Vector3.new(distance, 0.4, 0.4), Transparency = 1 })
	Util.tween(core, 0.5, { Size = Vector3.new(distance, 0.2, 0.2), Transparency = 1 })
	Util.debris(beam, 0.6)
	Util.debris(core, 0.6)
end

-- Confeti de colores (celebracion del campeon)
function Effects.confetti(position)
	local colors = {
		Color3.fromRGB(255, 90, 120),
		Color3.fromRGB(255, 214, 102),
		Color3.fromRGB(90, 200, 255),
		Color3.fromRGB(150, 255, 160),
		Color3.fromRGB(190, 130, 255),
	}

	for _, color in ipairs(colors) do
		local part = anchorPoint(position + Vector3.new(0, 4, 0), 6)
		local emitter = Instance.new("ParticleEmitter")
		emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		emitter.Color = ColorSequence.new(color)
		emitter.Lifetime = NumberRange.new(2.4, 3.6)
		emitter.Speed = NumberRange.new(14, 34)
		emitter.SpreadAngle = Vector2.new(70, 70)
		emitter.Acceleration = Vector3.new(0, -26, 0)
		emitter.Rate = 0
		emitter.RotSpeed = NumberRange.new(-240, 240)
		emitter.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.9), NumberSequenceKeypoint.new(1, 0.5) })
		emitter.LightEmission = 0.4
		emitter.Parent = part
		emitter:Emit(36)
	end
end

return Effects

-- Herramientas pequeñas que usan todos los modulos del servidor.

local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Util = {}

function Util.clamp(value, minValue, maxValue)
	return math.max(minValue, math.min(maxValue, value))
end

function Util.lerp(a, b, t)
	return a + (b - a) * t
end

function Util.sign(value)
	if value < 0 then
		return -1
	elseif value > 0 then
		return 1
	end
	return 0
end

-- Hora del servidor (la misma que ven los clientes: sirve para sincronizar animaciones)
function Util.now()
	return workspace:GetServerTimeNow()
end

function Util.randomRange(minValue, maxValue)
	return minValue + math.random() * (maxValue - minValue)
end

-- Elige una clave de una tabla { clave = peso }
function Util.weightedPick(weights)
	local total = 0
	for _, weight in pairs(weights) do
		total += math.max(0, weight)
	end
	if total <= 0 then
		return nil
	end

	local roll = math.random() * total
	for key, weight in pairs(weights) do
		roll -= math.max(0, weight)
		if roll <= 0 then
			return key
		end
	end
	return next(weights)
end

-- Ejecuta algo sin que un error detenga el juego: se avisa en la consola y se sigue
function Util.safe(label, callback, ...)
	local ok, result = pcall(callback, ...)
	if not ok then
		warn(("[PeleaCallejera] Error en %s: %s"):format(label, tostring(result)))
		return nil
	end
	return result
end

-- Crea una pieza decorativa (sin colision ni consultas, anclada por defecto)
function Util.part(props, parent)
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Material = Enum.Material.SmoothPlastic
	for key, value in pairs(props) do
		part[key] = value
	end
	part.Parent = parent
	return part
end

function Util.tween(instance, duration, goal, style, direction)
	local info = TweenInfo.new(duration, style or Enum.EasingStyle.Quad, direction or Enum.EasingDirection.Out)
	local tween = TweenService:Create(instance, info, goal)
	tween:Play()
	return tween
end

function Util.debris(instance, seconds)
	Debris:AddItem(instance, seconds)
end

-- Mezcla un color con blanco (amount 0..1) o con negro (amount negativo)
function Util.tint(color, amount)
	if amount >= 0 then
		return color:Lerp(Color3.new(1, 1, 1), amount)
	end
	return color:Lerp(Color3.new(0, 0, 0), -amount)
end

function Util.otherSide(side)
	return side == "left" and "right" or "left"
end

function Util.hexToColor3(hex, fallback)
	if type(hex) ~= "string" then
		return fallback
	end
	local r, g, b = hex:match("^#?(%x%x)(%x%x)(%x%x)$")
	if not r then
		return fallback
	end
	return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16))
end

return Util

-- Efectos de pantalla que pide el servidor: temblor de camara, destello y acercamiento en un K.O.

local Fx = {}

local shake = { intensity = 0, startedAt = 0, duration = 0 }
local zoom = { startedAt = -10, duration = 0 }
local flashHandler = nil

local function now()
	return os.clock()
end

function Fx.setFlashHandler(callback)
	flashHandler = callback
end

function Fx.shake(intensity, duration)
	-- si ya hay un temblor mas fuerte, no se pisa
	local remaining = shake.intensity * math.max(0, 1 - (now() - shake.startedAt) / math.max(0.01, shake.duration))
	if intensity >= remaining then
		shake.intensity = intensity
		shake.startedAt = now()
		shake.duration = duration
	end
end

-- Cuanto se desplaza la camara por el temblor en este momento
function Fx.shakeOffset()
	local elapsed = now() - shake.startedAt
	if elapsed >= shake.duration then
		return Vector3.zero
	end

	local strength = shake.intensity * (1 - elapsed / shake.duration)
	return Vector3.new(
		(math.random() - 0.5) * 2 * strength,
		(math.random() - 0.5) * 2 * strength,
		0
	)
end

-- 0..1: cuanto se acerca la camara (K.O.)
function Fx.zoomAmount()
	local elapsed = now() - zoom.startedAt
	if elapsed >= zoom.duration then
		return 0
	end

	local k = elapsed / zoom.duration
	-- sube rapido y se relaja despacio
	if k < 0.15 then
		return k / 0.15
	end
	return 1 - (k - 0.15) / 0.85
end

function Fx.handle(name, a, b)
	if name == "shake" then
		Fx.shake(tonumber(a) or 0.5, tonumber(b) or 0.25)
	elseif name == "flash" then
		if flashHandler then
			flashHandler(typeof(a) == "Color3" and a or Color3.new(1, 1, 1), tonumber(b) or 0.3)
		end
	elseif name == "ko" then
		Fx.shake(1.6, 0.6)
		zoom.startedAt = now()
		zoom.duration = 1.6
		if flashHandler then
			flashHandler(Color3.new(1, 1, 1), 0.28)
		end
	end
end

return Fx

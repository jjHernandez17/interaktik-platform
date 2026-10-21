-- Recorrido de la pista: se lee de workspace.F1Track.Waypoints (los puntos que genera TrackBuilder) y se vuelve a
-- muestrear cada ~4 studs para poder preguntar "donde esta la distancia s" con posicion, direccion y que tan cerrada es la curva.
-- Lo usan el servidor (simulacion) y los clientes (dibujar los carros).

local Config = require(script.Parent.Config)

local Path = {}

local STEP = 4
local posSamples, tanSamples, curveSamples, kappaSamples = {}, {}, {}, {}
local count = 0

Path.total = 0
Path.ready = false

local function lerpVector(a, b, t)
	return a + (b - a) * t
end

function Path.load(track)
	local waypoints = track:WaitForChild("Waypoints"):GetChildren()
	table.sort(waypoints, function(a, b)
		return (tonumber(a.Name) or 0) < (tonumber(b.Name) or 0)
	end)

	local pts = {}
	for _, w in ipairs(waypoints) do
		table.insert(pts, Vector3.new(w.Position.X, 0, w.Position.Z))
	end
	assert(#pts >= 8, "Pista sin puntos de recorrido")

	-- largo acumulado de la polilinea cerrada
	local cumulative = { 0 }
	for i = 1, #pts do
		local nextPoint = pts[i % #pts + 1]
		cumulative[i + 1] = cumulative[i] + (nextPoint - pts[i]).Magnitude
	end
	local total = cumulative[#pts + 1]

	count = math.max(8, math.floor(total / STEP))
	local step = total / count
	Path.total = total
	Path.step = step

	posSamples, tanSamples, curveSamples = {}, {}, {}
	local segment = 1
	for k = 0, count - 1 do
		local d = k * step
		while cumulative[segment + 1] < d do
			segment += 1
		end
		local a = pts[segment]
		local b = pts[segment % #pts + 1]
		local len = cumulative[segment + 1] - cumulative[segment]
		local t = len > 0 and (d - cumulative[segment]) / len or 0
		posSamples[k + 1] = lerpVector(a, b, t)
	end

	-- suavizado: el recorrido sale de una polilinea; se promedia con los vecinos para que la direccion cambie sin tirones
	for _ = 1, 3 do
		local smoothed = {}
		for k = 1, count do
			local sum = Vector3.zero
			for offset = -2, 2 do
				sum += posSamples[(k - 1 + offset) % count + 1]
			end
			smoothed[k] = sum / 5
		end
		posSamples = smoothed
	end

	-- direccion: diferencia central sobre ~24 studs (no entre dos muestras vecinas)
	for k = 1, count do
		local ahead = posSamples[(k - 1 + 3) % count + 1]
		local behind = posSamples[(k - 1 - 3) % count + 1]
		tanSamples[k] = (ahead - behind).Unit
	end

	-- curvatura con signo (positiva = la pista gira a la izquierda), en 1/studs: sirve para que el carril de afuera avance mas "metros de
	-- eje" por segundo que el de adentro y todos vayan a la misma velocidad real
	kappaSamples = {}
	local window = 6
	for k = 1, count do
		local a = tanSamples[k]
		local b = tanSamples[(k - 1 + window) % count + 1]
		local angle = math.atan2(a:Cross(b).Y, a:Dot(b))
		kappaSamples[k] = angle / (window * step)
	end

	-- curva: angulo entre la direccion aqui y 8 muestras (~32 studs) mas adelante; mas angulo = mas lento
	for k = 1, count do
		local ahead = tanSamples[(k + 7) % count + 1]
		local dot = math.clamp(tanSamples[k]:Dot(ahead), -1, 1)
		local angle = math.acos(dot)
		curveSamples[k] = 1 - math.clamp(angle * 1.1, 0, 0.3)
	end

	Path.ready = true
end

-- Devuelve: posicion, direccion de avance, vector "derecha", factor de velocidad por curva (0.7 a 1)
function Path.at(s)
	local total = Path.total
	s = s % total
	local f = s / Path.step
	local i = math.floor(f)
	local t = f - i
	local i0 = i % count + 1
	local i1 = (i + 1) % count + 1

	local pos = lerpVector(posSamples[i0], posSamples[i1], t)
	local tangent = lerpVector(tanSamples[i0], tanSamples[i1], t)
	if tangent.Magnitude < 1e-4 then
		tangent = tanSamples[i0]
	end
	tangent = tangent.Unit
	local right = tangent:Cross(Vector3.yAxis).Unit
	local curve = curveSamples[i0] + (curveSamples[i1] - curveSamples[i0]) * t
	return pos, tangent, right, curve
end

function Path.curvatureAt(s)
	local f = (s % Path.total) / Path.step
	local i = math.floor(f)
	local t = f - i
	local a = kappaSamples[i % count + 1]
	local b = kappaSamples[(i + 1) % count + 1]
	return a + (b - a) * t
end

-- Centro (en el eje de la pista) de un carril 1..Lanes
function Path.laneOffset(lane)
	local laneWidth = Config.RoadWidth / Config.Lanes
	return -Config.RoadWidth / 2 + laneWidth * (lane - 0.5)
end

-- Casilla de salida del jugador n: carril y distancia (negativa = detras de la linea de meta)
function Path.gridSlot(slot)
	local lane0 = (slot - 1) % Config.Lanes
	local row = (slot - 1) // Config.Lanes
	return lane0 + 1, -(16 + row * 24 + (lane0 % 2) * 10 + 4)
end

return Path

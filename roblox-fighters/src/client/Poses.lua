-- Poses de los luchadores. No usa animaciones de Roblox (no hacen falta imagenes ni IDs): cada cuadro se calcula con angulos.
--
-- Una pose es una tabla con estos valores (angulos en grados, desplazamientos en studs):
--   RootPos / RootRot   la cadera completa (agacharse, caer, girar)
--   Waist / Neck        cintura y cuello  (X: inclinarse, Y: girar, Z: ladearse)
--   NS NE / FS FE       hombro y codo del brazo CERCANO a la camara / LEJANO
--   NH NK / FH FK       cadera y rodilla de la pierna CERCANA / LEJANA
-- Convenciones (el personaje mira hacia -Z): X positivo en el hombro/cadera = adelante; en el codo = doblar; en la rodilla
-- doblar es X negativo; en la cintura inclinarse hacia adelante es X negativo. Z = separar el miembro del cuerpo.
-- "Cercano" es el lado que ve la camara; el Animator lo asigna a la derecha o a la izquierda segun hacia donde mire.

local V = Vector3.new

local Poses = {}

local STANCE = {
	RootPos = V(0, -0.38, 0),
	RootRot = V(0, 0, 0),
	Waist = V(-6, 0, 0),
	Neck = V(4, 0, 0),
	NS = V(68, 0, 10),
	NE = V(108, 0, 0),
	FS = V(54, 0, -8),
	FE = V(118, 0, 0),
	NH = V(18, 0, 6),
	NK = V(-34, 0, 0),
	FH = V(-14, 0, -6),
	FK = V(-30, 0, 0),
}

local KEYS = { "RootPos", "RootRot", "Waist", "Neck", "NS", "NE", "FS", "FE", "NH", "NK", "FH", "FK" }

Poses.STANCE = STANCE
Poses.KEYS = KEYS

local function copy(pose)
	local result = {}
	for _, key in ipairs(KEYS) do
		result[key] = pose[key]
	end
	return result
end

-- Pose completa: lo que no se indica queda como en la guardia
local function make(overrides)
	local pose = copy(STANCE)
	if overrides then
		for key, value in pairs(overrides) do
			pose[key] = value
		end
	end
	return pose
end

local function mix(a, b, alpha)
	local result = {}
	for _, key in ipairs(KEYS) do
		result[key] = a[key]:Lerp(b[key], alpha)
	end
	return result
end

local function smooth(alpha)
	return alpha * alpha * (3 - 2 * alpha)
end

-- ---------- golpes con cuadros clave ----------
-- u va de 0 a 2: 0 = empieza, 1 = el momento del golpe, 2 = termina (el servidor manda cuando cae el golpe: ActionHit)

local attacks = {
	jab = {
		{ 0, make() },
		{ 0.6, make({ NS = V(62, 0, 4), NE = V(142, 0, 0), Waist = V(-6, 8, 0) }) },
		{ 1, make({ NS = V(93, 0, 0), NE = V(6, 0, 0), Waist = V(-10, 20, 0), RootPos = V(0, -0.5, 0) }) },
		{ 1.4, make({ NS = V(93, 0, 0), NE = V(6, 0, 0), Waist = V(-10, 20, 0), RootPos = V(0, -0.5, 0) }) },
		{ 2, make() },
	},
	cross = {
		{ 0, make() },
		{ 0.6, make({ NS = V(52, 0, 4), NE = V(150, 0, 0), Waist = V(-4, -14, 0), NH = V(8, 0, 6) }) },
		{ 1, make({ NS = V(94, 0, 0), NE = V(4, 0, 0), Waist = V(-12, 34, 0), NH = V(30, 0, 6), NK = V(-24, 0, 0), RootPos = V(0, -0.55, 0) }) },
		{ 1.4, make({ NS = V(94, 0, 0), NE = V(4, 0, 0), Waist = V(-12, 34, 0), NH = V(30, 0, 6), NK = V(-24, 0, 0), RootPos = V(0, -0.55, 0) }) },
		{ 2, make() },
	},
	hook = {
		{ 0, make() },
		{ 0.6, make({ NS = V(40, 0, 100), NE = V(100, 0, 0), Waist = V(-6, -30, 0) }) },
		{ 1, make({ NS = V(82, 0, -4), NE = V(95, 0, 0), Waist = V(-8, 42, 0), RootPos = V(0, -0.5, 0) }) },
		{ 1.4, make({ NS = V(82, 0, -4), NE = V(95, 0, 0), Waist = V(-8, 42, 0), RootPos = V(0, -0.5, 0) }) },
		{ 2, make() },
	},
	uppercut = {
		{ 0, make() },
		{ 0.6, make({ NS = V(8, 0, 6), NE = V(70, 0, 0), Waist = V(-16, 0, 0), RootPos = V(0, -1.0, 0), NH = V(40, 0, 6), NK = V(-70, 0, 0) }) },
		{ 1, make({ NS = V(158, 0, 0), NE = V(40, 0, 0), Waist = V(8, 10, 0), RootPos = V(0, 0.1, 0), NH = V(5, 0, 6), NK = V(-5, 0, 0), FH = V(0, 0, -6), FK = V(-10, 0, 0) }) },
		{ 1.5, make({ NS = V(158, 0, 0), NE = V(40, 0, 0), Waist = V(8, 10, 0), RootPos = V(0, 0.1, 0), NH = V(40, 0, 6), NK = V(-60, 0, 0), FH = V(20, 0, -6), FK = V(-50, 0, 0) }) },
		{ 2, make() },
	},
	kick = {
		{ 0, make() },
		{ 0.6, make({ NH = V(62, 0, 0), NK = V(-95, 0, 0), Waist = V(2, 0, 0), FK = V(-22, 0, 0) }) },
		{ 1, make({ NH = V(88, 0, 4), NK = V(-6, 0, 0), Waist = V(10, 0, 0), RootPos = V(0, -0.55, 0), FH = V(-6, 0, -6), FK = V(-28, 0, 0), NS = V(40, 0, 20), FS = V(60, 0, -20) }) },
		{ 1.4, make({ NH = V(88, 0, 4), NK = V(-6, 0, 0), Waist = V(10, 0, 0), RootPos = V(0, -0.55, 0), FK = V(-28, 0, 0) }) },
		{ 2, make() },
	},
	highkick = {
		{ 0, make() },
		{ 0.6, make({ NH = V(70, 0, 25), NK = V(-100, 0, 0), Waist = V(0, 0, 8) }) },
		{ 1, make({ NH = V(100, 0, 42), NK = V(-8, 0, 0), Waist = V(4, 0, 18), RootPos = V(0, -0.45, 0), NS = V(30, 0, 40), FS = V(60, 0, -40) }) },
		{ 1.4, make({ NH = V(100, 0, 42), NK = V(-8, 0, 0), Waist = V(4, 0, 18), RootPos = V(0, -0.45, 0) }) },
		{ 2, make() },
	},
	axekick = {
		{ 0, make() },
		{ 0.7, make({ NH = V(160, 0, 8), NK = V(-6, 0, 0), Waist = V(14, 0, 0), RootPos = V(0, -0.2, 0), NS = V(30, 0, 30), FS = V(60, 0, -30) }) },
		{ 1, make({ NH = V(55, 0, 4), NK = V(-4, 0, 0), Waist = V(-12, 0, 0), RootPos = V(0, -0.8, 0) }) },
		{ 1.4, make({ NH = V(55, 0, 4), NK = V(-4, 0, 0), Waist = V(-12, 0, 0), RootPos = V(0, -0.8, 0) }) },
		{ 2, make() },
	},
	spinkick = {
		{ 0, make() },
		{ 0.7, make({ Waist = V(-8, -25, 0), NH = V(40, 0, 10), NK = V(-60, 0, 0) }) },
		{ 1, make({ RootRot = V(0, 180, 0), NH = V(90, 0, 0), NK = V(-4, 0, 0), Waist = V(0, 0, 14), NS = V(60, 0, 70), FS = V(60, 0, -70) }) },
		{ 1.5, make({ RootRot = V(0, 360, 0), NH = V(90, 0, 0), NK = V(-4, 0, 0), Waist = V(0, 0, 14), NS = V(60, 0, 70), FS = V(60, 0, -70) }) },
		{ 2, make({ RootRot = V(0, 360, 0) }) },
	},
	aerialkick = {
		{ 0, make() },
		{ 0.6, make({ NH = V(60, 0, 0), NK = V(-70, 0, 0), FH = V(30, 0, 0), FK = V(-60, 0, 0), RootPos = V(0, 0, 0), NS = V(70, 0, 40), FS = V(70, 0, -40) }) },
		{ 1, make({ NH = V(88, 0, 0), NK = V(-6, 0, 0), FH = V(20, 0, 0), FK = V(-80, 0, 0), Waist = V(12, 0, 0), RootPos = V(0, 0, 0), NS = V(60, 0, 50), FS = V(40, 0, -50) }) },
		{ 1.5, make({ NH = V(88, 0, 0), NK = V(-6, 0, 0), FH = V(20, 0, 0), FK = V(-80, 0, 0), Waist = V(12, 0, 0), RootPos = V(0, 0, 0) }) },
		{ 2, make() },
	},
	sweep = {
		{ 0, make() },
		{ 0.6, make({ RootPos = V(0, -1.3, 0), Waist = V(-20, -20, 0), NH = V(30, 0, 0), NK = V(-90, 0, 0), FH = V(30, 0, -6), FK = V(-110, 0, 0) }) },
		{ 1, make({ RootPos = V(0, -1.5, 0), Waist = V(-22, 26, 0), NH = V(84, 0, 0), NK = V(0, 0, 0), FH = V(24, 0, -6), FK = V(-118, 0, 0), NS = V(30, 0, 60), FS = V(30, 0, -60) }) },
		{ 1.5, make({ RootPos = V(0, -1.5, 0), Waist = V(-22, 26, 0), NH = V(84, 0, 0), NK = V(0, 0, 0), FH = V(24, 0, -6), FK = V(-118, 0, 0) }) },
		{ 2, make() },
	},
	haymaker = {
		{ 0, make() },
		{ 0.7, make({ NS = V(-35, 0, 45), NE = V(70, 0, 0), Waist = V(8, -34, 0), RootPos = V(0, -0.9, 0), NH = V(8, 0, 6) }) },
		{ 1, make({ NS = V(96, 0, -6), NE = V(8, 0, 0), Waist = V(-24, 48, 0), RootPos = V(0, -0.7, 0), NH = V(34, 0, 6), NK = V(-30, 0, 0) }) },
		{ 1.4, make({ NS = V(96, 0, -6), NE = V(8, 0, 0), Waist = V(-24, 48, 0), RootPos = V(0, -0.7, 0), NH = V(34, 0, 6), NK = V(-30, 0, 0) }) },
		{ 2, make() },
	},
	dashpunch = {
		{ 0, make() },
		{ 0.6, make({ Waist = V(-20, -10, 0), NS = V(50, 0, 6), NE = V(140, 0, 0), NH = V(40, 0, 6), NK = V(-60, 0, 0), FH = V(-30, 0, -6) }) },
		{ 1, make({ Waist = V(-28, 24, 0), NS = V(94, 0, 0), NE = V(4, 0, 0), NH = V(64, 0, 6), NK = V(-50, 0, 0), FH = V(-38, 0, -6), FK = V(-8, 0, 0), RootPos = V(0, -0.7, 0) }) },
		{ 1.4, make({ Waist = V(-28, 24, 0), NS = V(94, 0, 0), NE = V(4, 0, 0), NH = V(64, 0, 6), NK = V(-50, 0, 0), FH = V(-38, 0, -6), FK = V(-8, 0, 0), RootPos = V(0, -0.7, 0) }) },
		{ 2, make() },
	},
	clothesline = {
		{ 0, make() },
		{ 0.6, make({ NS = V(40, 0, 100), NE = V(20, 0, 0), FS = V(40, 0, -30), Waist = V(-6, -40, 0) }) },
		{ 1, make({ NS = V(86, 0, 52), NE = V(0, 0, 0), Waist = V(-14, 50, 0), RootPos = V(0, -0.6, 0), NH = V(30, 0, 6), NK = V(-26, 0, 0) }) },
		{ 1.4, make({ NS = V(86, 0, 52), NE = V(0, 0, 0), Waist = V(-14, 50, 0), RootPos = V(0, -0.6, 0), NH = V(30, 0, 6), NK = V(-26, 0, 0) }) },
		{ 2, make() },
	},
	tackle = {
		{ 0, make() },
		{ 0.6, make({ Waist = V(-14, 0, 0), NS = V(40, 0, 10), FS = V(40, 0, -10), NE = V(110, 0, 0), FE = V(110, 0, 0), RootPos = V(0, -0.9, 0) }) },
		{ 1, make({ Waist = V(-46, 0, 0), Neck = V(30, 0, 0), NS = V(70, 0, 20), FS = V(70, 0, -20), NE = V(50, 0, 0), FE = V(50, 0, 0), NH = V(58, 0, 6), NK = V(-54, 0, 0), FH = V(-40, 0, -6), RootPos = V(0, -1.0, 0) }) },
		{ 1.4, make({ Waist = V(-46, 0, 0), Neck = V(30, 0, 0), NS = V(70, 0, 20), FS = V(70, 0, -20), NE = V(50, 0, 0), FE = V(50, 0, 0), NH = V(58, 0, 6), NK = V(-54, 0, 0), FH = V(-40, 0, -6), RootPos = V(0, -1.0, 0) }) },
		{ 2, make() },
	},
	slam = {
		{ 0, make() },
		{ 0.7, make({ NS = V(168, 0, 14), FS = V(168, 0, -14), NE = V(20, 0, 0), FE = V(20, 0, 0), Waist = V(14, 0, 0), RootPos = V(0, 0, 0), NH = V(8, 0, 6), NK = V(-8, 0, 0), FH = V(-8, 0, -6), FK = V(-8, 0, 0) }) },
		{ 1, make({ NS = V(50, 0, 6), FS = V(50, 0, -6), NE = V(30, 0, 0), FE = V(30, 0, 0), Waist = V(-36, 0, 0), RootPos = V(0, -0.9, 0), NH = V(30, 0, 6), NK = V(-50, 0, 0) }) },
		{ 1.4, make({ NS = V(50, 0, 6), FS = V(50, 0, -6), NE = V(30, 0, 0), FE = V(30, 0, 0), Waist = V(-36, 0, 0), RootPos = V(0, -0.9, 0), NH = V(30, 0, 6), NK = V(-50, 0, 0) }) },
		{ 2, make() },
	},
	palm = {
		{ 0, make() },
		{ 0.7, make({ NS = V(30, 0, 12), FS = V(30, 0, -12), NE = V(140, 0, 0), FE = V(140, 0, 0), Waist = V(-2, 0, 0), RootPos = V(0, -0.8, 0) }) },
		{ 1, make({ NS = V(92, 0, 6), FS = V(92, 0, -6), NE = V(4, 0, 0), FE = V(4, 0, 0), Waist = V(-16, 0, 0), RootPos = V(0, -0.7, 0), NH = V(30, 0, 6), NK = V(-30, 0, 0) }) },
		{ 1.4, make({ NS = V(92, 0, 6), FS = V(92, 0, -6), NE = V(4, 0, 0), FE = V(4, 0, 0), Waist = V(-16, 0, 0), RootPos = V(0, -0.7, 0), NH = V(30, 0, 6), NK = V(-30, 0, 0) }) },
		{ 2, make() },
	},
	throw = {
		{ 0, make() },
		{ 0.7, make({ NS = V(170, 0, 14), NE = V(60, 0, 0), Waist = V(10, -16, 0), RootPos = V(0, -0.5, 0) }) },
		{ 1, make({ NS = V(84, 0, 0), NE = V(6, 0, 0), Waist = V(-14, 24, 0), RootPos = V(0, -0.6, 0), NH = V(30, 0, 6), NK = V(-26, 0, 0) }) },
		{ 1.4, make({ NS = V(84, 0, 0), NE = V(6, 0, 0), Waist = V(-14, 24, 0), RootPos = V(0, -0.6, 0), NH = V(30, 0, 6), NK = V(-26, 0, 0) }) },
		{ 2, make() },
	},
	-- carga del super ataque: se agacha y junta energia (temblando), y suelta un empujon con las dos manos
	charge = {
		{ 0, make() },
		{ 0.5, make({ NS = V(-30, 0, 40), FS = V(-30, 0, -40), NE = V(30, 0, 0), FE = V(30, 0, 0), Waist = V(-16, 0, 0), RootPos = V(0, -1.0, 0), NH = V(40, 0, 10), NK = V(-70, 0, 0), FH = V(-10, 0, -10), FK = V(-60, 0, 0) }) },
		{ 1, make({ NS = V(-52, 0, 34), FS = V(-52, 0, -34), NE = V(20, 0, 0), FE = V(20, 0, 0), Waist = V(-22, 0, 0), RootPos = V(0, -1.2, 0), NH = V(44, 0, 10), NK = V(-78, 0, 0), FH = V(-12, 0, -10), FK = V(-66, 0, 0) }) },
		{ 1.25, make({ NS = V(94, 0, 5), FS = V(94, 0, -5), NE = V(3, 0, 0), FE = V(3, 0, 0), Waist = V(-18, 0, 0), RootPos = V(0, -0.8, 0), NH = V(38, 0, 6), NK = V(-34, 0, 0) }) },
		{ 2, make({ NS = V(94, 0, 5), FS = V(94, 0, -5), NE = V(3, 0, 0), FE = V(3, 0, 0), Waist = V(-18, 0, 0), RootPos = V(0, -0.8, 0), NH = V(38, 0, 6), NK = V(-34, 0, 0) }) },
	},
}

-- ---------- poses que dependen del tiempo en segundos ----------

local function idle(ctx)
	local t = ctx.time
	local pose = copy(STANCE)
	local breath = math.sin(t * 3.2)
	pose.RootPos = V(0, STANCE.RootPos.Y + breath * 0.05, 0)
	pose.Waist = V(STANCE.Waist.X + breath * 1.6, 0, 0)
	pose.NS = V(STANCE.NS.X + math.sin(t * 2.4) * 3, 0, STANCE.NS.Z)
	pose.FS = V(STANCE.FS.X + math.sin(t * 2.4 + 1) * 3, 0, STANCE.FS.Z)
	return pose
end

local function walk(ctx)
	local swing = math.sin(ctx.walk)
	local pose = copy(STANCE)
	local direction = ctx.speed >= 0 and 1 or -1
	pose.NH = V(18 + swing * 30 * direction, 0, 6)
	pose.FH = V(-14 - swing * 30 * direction, 0, -6)
	pose.NK = V(-34 - math.max(0, -swing) * 40, 0, 0)
	pose.FK = V(-30 - math.max(0, swing) * 40, 0, 0)
	pose.RootPos = V(0, STANCE.RootPos.Y + math.abs(math.cos(ctx.walk)) * 0.08, 0)
	pose.Waist = V(STANCE.Waist.X - 2 * direction, math.sin(ctx.walk) * 4, 0)
	return pose
end

local function dash(ctx)
	local swing = math.sin(ctx.time * 30)
	local pose = copy(STANCE)
	pose.Waist = V(-26, 0, 0)
	pose.Neck = V(14, 0, 0)
	pose.NS = V(-20, 0, 10)
	pose.FS = V(-30, 0, -10)
	pose.NE = V(70, 0, 0)
	pose.FE = V(70, 0, 0)
	pose.NH = V(40 + swing * 45, 0, 6)
	pose.FH = V(40 - swing * 45, 0, -6)
	pose.NK = V(-60 - math.max(0, -swing) * 30, 0, 0)
	pose.FK = V(-60 - math.max(0, swing) * 30, 0, 0)
	pose.RootPos = V(0, -0.5, 0)
	return pose
end

local function jump(ctx)
	local pose = copy(STANCE)
	pose.NH = V(52, 0, 8)
	pose.NK = V(-72, 0, 0)
	pose.FH = V(28, 0, -8)
	pose.FK = V(-64, 0, 0)
	pose.NS = V(70, 0, 30)
	pose.FS = V(60, 0, -30)
	pose.RootPos = V(0, 0, 0)
	return pose
end

local function block(ctx)
	local pose = copy(STANCE)
	local shake = math.sin(ctx.time * 40) * 0.6
	pose.NS = V(92, 0, -24)
	pose.NE = V(122, 0, 0)
	pose.FS = V(96, 0, 24)
	pose.FE = V(122, 0, 0)
	pose.Waist = V(-16 + shake, 0, 0)
	pose.Neck = V(14, 0, 0)
	pose.RootPos = V(0, -0.7, 0)
	pose.NH = V(24, 0, 8)
	pose.NK = V(-48, 0, 0)
	pose.FH = V(-10, 0, -8)
	pose.FK = V(-44, 0, 0)
	return pose
end

local function hit(ctx)
	-- tirón hacia atras y vuelve a la guardia
	local duration = math.max(0.1, ctx.duration)
	local n = math.clamp(ctx.time / duration, 0, 1)
	local k = n < 0.25 and (n / 0.25) or (1 - (n - 0.25) / 0.75)
	k = smooth(math.clamp(k, 0, 1))
	local pose = copy(STANCE)
	pose.Waist = V(STANCE.Waist.X + 24 * k, 0, 0)
	pose.Neck = V(STANCE.Neck.X + 18 * k, 0, 0)
	pose.NS = V(STANCE.NS.X - 30 * k, 0, STANCE.NS.Z + 20 * k)
	pose.FS = V(STANCE.FS.X - 30 * k, 0, STANCE.FS.Z - 20 * k)
	pose.RootPos = V(0, STANCE.RootPos.Y + 0.1 * k, 0)
	return pose
end

local function lying(spread)
	local pose = copy(STANCE)
	pose.RootRot = V(90, 0, 0)
	pose.RootPos = V(0, -2.55, 0)
	pose.Waist = V(0, 0, 0)
	pose.Neck = V(0, 0, 0)
	pose.NS = V(15, 0, 28 * spread)
	pose.FS = V(15, 0, -28 * spread)
	pose.NE = V(10, 0, 0)
	pose.FE = V(10, 0, 0)
	pose.NH = V(0, 0, 8 * spread)
	pose.FH = V(0, 0, -8 * spread)
	pose.NK = V(-6, 0, 0)
	pose.FK = V(-6, 0, 0)
	return pose
end

local function knockdown(ctx)
	-- vuela hacia atras girando, cae de espaldas y se queda tirado
	local t = ctx.time
	local pose = lying(1)
	local fall = math.clamp(t / 0.5, 0, 1)
	pose.RootRot = V(90 * smooth(fall), 0, 0)
	local y = -2.55 * smooth(fall)
	pose.RootPos = V(0, y, 0)
	if fall < 1 then
		pose.NS = V(-30 + 45 * fall, 0, 50)
		pose.FS = V(-30 + 45 * fall, 0, -50)
		pose.NH = V(30 * (1 - fall), 0, 10)
		pose.FH = V(10 * (1 - fall), 0, -10)
	end
	return pose
end

local function ko(ctx)
	local fall = math.clamp(ctx.time / 0.55, 0, 1)
	local pose = lying(1.4)
	pose.RootRot = V(90 * smooth(fall), 0, 0)
	pose.RootPos = V(0, -2.55 * smooth(fall), 0)
	return pose
end

local function getup(ctx)
	local duration = math.max(0.1, ctx.duration)
	local n = math.clamp(ctx.time / duration, 0, 1)
	local rise = smooth(n)
	local down = lying(0.6)
	return mix(down, make({ RootPos = V(0, -0.9, 0), Waist = V(-18, 0, 0) }), rise)
end

local function victory(ctx)
	local t = ctx.time
	local pose = copy(STANCE)
	local hop = math.abs(math.sin(t * 5.5))
	pose.NS = V(165, 0, 30 + math.sin(t * 8) * 8)
	pose.FS = V(165, 0, -30 - math.sin(t * 8) * 8)
	pose.NE = V(10, 0, 0)
	pose.FE = V(10, 0, 0)
	pose.Waist = V(8, 0, math.sin(t * 5.5) * 5)
	pose.RootPos = V(0, -0.1 + hop * 0.7, 0)
	pose.NH = V(8 + hop * 20, 0, 6)
	pose.NK = V(-10 - hop * 30, 0, 0)
	pose.FH = V(8, 0, -6)
	pose.FK = V(-10 - hop * 30, 0, 0)
	return pose
end

local function flurry(ctx)
	-- lluvia de golpes: los dos brazos alternan rapido
	local t = ctx.time
	local pose = copy(STANCE)
	local a = math.sin(t * 30)
	local b = math.sin(t * 30 + math.pi)
	pose.NS = V(78 + a * 18, 0, 4)
	pose.NE = V(70 - a * 62, 0, 0)
	pose.FS = V(78 + b * 18, 0, -4)
	pose.FE = V(70 - b * 62, 0, 0)
	pose.Waist = V(-12, a * 16, 0)
	pose.RootPos = V(0, -0.55, 0)
	pose.NH = V(30, 0, 6)
	pose.NK = V(-34, 0, 0)
	return pose
end

local timed = {
	idle = idle,
	walk = walk,
	dash = dash,
	jump = jump,
	block = block,
	hit = hit,
	knockdown = knockdown,
	ko = ko,
	getup = getup,
	victory = victory,
	flurry = flurry,
	frozen = function()
		return copy(STANCE)
	end,
}

-- ctx = { time = segundos desde que empezo la accion, duration = duracion (0 si no tiene), hit = momento del golpe 0..1,
--         walk = fase del paso, speed = velocidad hacia adelante (negativa si retrocede) }
function Poses.sample(action, ctx)
	local timedPose = timed[action]
	if timedPose then
		return timedPose(ctx)
	end

	local frames = attacks[action]
	if not frames then
		return idle(ctx)
	end

	local duration = ctx.duration
	local n = duration > 0 and math.clamp(ctx.time / duration, 0, 1) or 0
	local hitAt = math.clamp(ctx.hit or 0.4, 0.1, 0.9)
	local u = n < hitAt and (n / hitAt) or (1 + (n - hitAt) / (1 - hitAt))

	for index = 1, #frames - 1 do
		local current, following = frames[index], frames[index + 1]
		if u <= following[1] or index == #frames - 1 then
			local span = following[1] - current[1]
			local alpha = span > 0 and math.clamp((u - current[1]) / span, 0, 1) or 1
			return mix(current[2], following[2], smooth(alpha))
		end
	end
	return frames[#frames][2]
end

-- Acciones donde el cuerpo debe seguir la pose casi sin suavizado (para que el golpe caiga en su momento)
function Poses.isSnappy(action)
	return attacks[action] ~= nil or action == "hit" or action == "knockdown"
end

return Poses

-- Estilos de pelea. Cada estilo tiene su velocidad, su defensa, sus golpes y cuales usa segun la distancia.
--
-- Campos de un golpe (en segundos y studs; el dano es para 1000 de vida, se escala si la vida es distinta):
--   anim       nombre de la animacion que dibuja el cliente (ver client/Poses.lua)
--   startup    tiempo antes de que pegue; active = tiempo en que puede pegar; recovery = tiempo para recuperarse
--   dmg        dano; hits = cuantos golpes da durante "active"
--   hitstun    cuanto aturde al rival; kb = empuje horizontal; launch = lo manda por el aire (lo tira al suelo)
--   range      alcance hacia adelante; win = {min, max} diferencia de altura en la que alcanza al rival
--   lunge      velocidad con la que se lanza hacia adelante; approach = corre hasta quedar cerca antes de pegar
--   jumpFirst  salta antes de pegar; selfLaunch = salto vertical propio (uppercut)
--   cooldown   tiempo antes de volver a usarlo; unblockable = no se puede bloquear
--   kind       "light" | "heavy" | "launcher" | "projectile"
--   projectile { speed, dmg, size, life } para las bolas de energia y shurikens

local Styles = {}

Styles.order = { "boxeador", "karateka", "luchador", "ninja", "taekwondo" }

Styles.list = {
	karateka = {
		label = "Karateka",
		walkSpeed = 14,
		jumpPower = 52,
		healthMul = 1,
		blockReduction = 0.8,
		idealRange = 6,
		skin = Color3.fromRGB(240, 190, 150),
		pants = Color3.fromRGB(240, 240, 240),
		accessory = "headband",
		strike = "dashpunch",
		moves = {
			jab = { anim = "jab", startup = 0.09, active = 0.06, recovery = 0.15, dmg = 20, hitstun = 0.26, kb = 6, range = 5.4 },
			cross = { anim = "cross", startup = 0.13, active = 0.07, recovery = 0.22, dmg = 30, hitstun = 0.32, kb = 10, range = 5.8 },
			kick = { anim = "kick", startup = 0.17, active = 0.08, recovery = 0.27, dmg = 38, hitstun = 0.36, kb = 14, range = 6.6 },
			uppercut = { anim = "uppercut", startup = 0.14, active = 0.16, recovery = 0.45, dmg = 64, hitstun = 0.5, kb = 8, launch = 34, selfLaunch = 32, range = 4.8, win = { -3, 8 }, kind = "launcher", cooldown = 3 },
			dashpunch = { anim = "dashpunch", startup = 0.18, active = 0.09, recovery = 0.34, dmg = 46, hitstun = 0.4, kb = 16, range = 6.5, lunge = 40, kind = "heavy", cooldown = 2.5 },
			fireball = { anim = "palm", startup = 0.34, active = 0, recovery = 0.42, kind = "projectile", projectile = { speed = 50, dmg = 52, size = 2.4, life = 2.4 }, cooldown = 3.6 },
		},
		ai = {
			close = { jab = 3, cross = 2.2, kick = 1.4, uppercut = 1.1 },
			mid = { kick = 2, dashpunch = 1.6, fireball = 1.2 },
			far = { fireball = 3, dashpunch = 0.6 },
		},
	},

	boxeador = {
		label = "Boxeador",
		walkSpeed = 15,
		jumpPower = 48,
		healthMul = 1,
		blockReduction = 0.9,
		idealRange = 4.6,
		skin = Color3.fromRGB(176, 118, 86),
		pants = Color3.fromRGB(30, 30, 40),
		accessory = "gloves",
		strike = "overhand",
		moves = {
			jab = { anim = "jab", startup = 0.07, active = 0.05, recovery = 0.12, dmg = 14, hitstun = 0.22, kb = 4, range = 5.2 },
			cross = { anim = "cross", startup = 0.1, active = 0.06, recovery = 0.18, dmg = 26, hitstun = 0.3, kb = 9, range = 5.6 },
			hook = { anim = "hook", startup = 0.14, active = 0.07, recovery = 0.24, dmg = 34, hitstun = 0.36, kb = 13, range = 5.4 },
			uppercut = { anim = "uppercut", startup = 0.15, active = 0.1, recovery = 0.34, dmg = 46, hitstun = 0.46, kb = 6, launch = 26, selfLaunch = 18, range = 4.6, win = { -3, 7 }, kind = "launcher", cooldown = 3 },
			flurry = { anim = "flurry", startup = 0.12, active = 0.42, hits = 4, recovery = 0.3, dmg = 11, hitstun = 0.2, kb = 3, range = 5.2, kind = "heavy", cooldown = 4 },
			overhand = { anim = "haymaker", startup = 0.32, active = 0.08, recovery = 0.4, dmg = 72, hitstun = 0.5, kb = 22, range = 5.4, kind = "heavy", cooldown = 5 },
		},
		ai = {
			close = { jab = 3, cross = 2.5, hook = 1.6, uppercut = 0.8, flurry = 0.8, overhand = 0.6 },
			mid = { jab = 1.2, cross = 1, overhand = 0.5 },
			far = {},
		},
	},

	luchador = {
		label = "Luchador",
		walkSpeed = 11.5,
		jumpPower = 44,
		healthMul = 1.15,
		blockReduction = 0.75,
		idealRange = 4.6,
		skin = Color3.fromRGB(210, 160, 120),
		pants = Color3.fromRGB(70, 20, 90),
		accessory = "mask",
		strike = "tackle",
		moves = {
			chop = { anim = "hook", startup = 0.16, active = 0.08, recovery = 0.26, dmg = 30, hitstun = 0.34, kb = 10, range = 5.2 },
			stomp = { anim = "kick", startup = 0.2, active = 0.08, recovery = 0.3, dmg = 36, hitstun = 0.38, kb = 12, range = 5.6 },
			clothesline = { anim = "clothesline", startup = 0.2, active = 0.14, recovery = 0.4, dmg = 56, hitstun = 0.5, kb = 22, range = 6.6, win = { -3, 4 }, kind = "heavy", cooldown = 3 },
			tackle = { anim = "tackle", startup = 0.18, active = 0.14, recovery = 0.4, dmg = 52, hitstun = 0.46, kb = 26, range = 5.6, lunge = 52, kind = "heavy", cooldown = 3.2 },
			slam = { anim = "slam", startup = 0.34, active = 0.1, recovery = 0.55, dmg = 105, hitstun = 0.7, kb = 4, launch = 22, range = 3.8, unblockable = true, kind = "heavy", cooldown = 7 },
		},
		ai = {
			close = { chop = 2.4, clothesline = 1.4, stomp = 1.2, slam = 1.1, tackle = 0.8 },
			mid = { tackle = 1.8, clothesline = 0.8 },
			far = { tackle = 1.6 },
		},
	},

	ninja = {
		label = "Ninja",
		walkSpeed = 17.5,
		jumpPower = 58,
		healthMul = 0.92,
		blockReduction = 0.7,
		idealRange = 5,
		skin = Color3.fromRGB(235, 200, 170),
		pants = Color3.fromRGB(25, 25, 32),
		accessory = "ninja",
		strike = "dashstrike",
		moves = {
			slash = { anim = "jab", startup = 0.07, active = 0.05, recovery = 0.12, dmg = 15, hitstun = 0.2, kb = 5, range = 5.4 },
			combo = { anim = "flurry", startup = 0.1, active = 0.36, hits = 3, recovery = 0.28, dmg = 14, hitstun = 0.2, kb = 4, range = 5.4, kind = "heavy", cooldown = 3.5 },
			dashstrike = { anim = "dashpunch", startup = 0.1, active = 0.1, recovery = 0.32, dmg = 42, hitstun = 0.4, kb = 16, range = 6.4, lunge = 64, kind = "heavy", cooldown = 2.6 },
			shuriken = { anim = "throw", startup = 0.2, active = 0, recovery = 0.3, kind = "projectile", projectile = { speed = 70, dmg = 24, size = 1.2, life = 1.6 }, cooldown = 1.6 },
			flipkick = { anim = "aerialkick", jumpFirst = true, startup = 0.2, active = 0.2, recovery = 0.3, dmg = 40, hitstun = 0.4, kb = 14, range = 6.2, win = { -8, 6 }, kind = "heavy", cooldown = 3.2 },
			sweep = { anim = "sweep", startup = 0.16, active = 0.1, recovery = 0.34, dmg = 30, hitstun = 0.34, kb = 6, launch = 18, range = 6, win = { -3.2, 1.5 }, cooldown = 2.6 },
		},
		ai = {
			close = { slash = 3, combo = 1.4, sweep = 1, flipkick = 0.6 },
			mid = { dashstrike = 2, shuriken = 2, flipkick = 1 },
			far = { shuriken = 3, dashstrike = 1 },
		},
	},

	taekwondo = {
		label = "Taekwondista",
		walkSpeed = 14.5,
		jumpPower = 54,
		healthMul = 1,
		blockReduction = 0.75,
		idealRange = 7,
		skin = Color3.fromRGB(225, 170, 130),
		pants = Color3.fromRGB(245, 245, 245),
		accessory = "chest",
		strike = "axekick",
		moves = {
			frontkick = { anim = "kick", startup = 0.14, active = 0.08, recovery = 0.24, dmg = 30, hitstun = 0.3, kb = 12, range = 7.2 },
			roundhouse = { anim = "highkick", startup = 0.2, active = 0.09, recovery = 0.3, dmg = 46, hitstun = 0.4, kb = 18, range = 6.9, kind = "heavy", cooldown = 2 },
			spinkick = { anim = "spinkick", startup = 0.22, active = 0.3, hits = 2, recovery = 0.4, dmg = 30, hitstun = 0.34, kb = 12, range = 6.4, kind = "heavy", cooldown = 4 },
			jumpkick = { anim = "aerialkick", jumpFirst = true, startup = 0.2, active = 0.2, recovery = 0.3, dmg = 50, hitstun = 0.44, kb = 16, range = 6.4, win = { -8, 6 }, kind = "heavy", cooldown = 3.5 },
			sweep = { anim = "sweep", startup = 0.17, active = 0.1, recovery = 0.34, dmg = 32, hitstun = 0.34, kb = 6, launch = 18, range = 6.4, win = { -3.2, 1.5 }, cooldown = 2.6 },
			axekick = { anim = "axekick", startup = 0.28, active = 0.1, recovery = 0.42, dmg = 58, hitstun = 0.5, kb = 10, range = 6, kind = "heavy", cooldown = 4 },
		},
		ai = {
			close = { frontkick = 3, roundhouse = 1.6, sweep = 1.2, axekick = 0.9, spinkick = 0.8 },
			mid = { frontkick = 2, jumpkick = 1.4, roundhouse = 1.2, spinkick = 0.8 },
			far = { jumpkick = 1.5 },
		},
	},
}

-- Movimientos que no dependen del estilo (los activan los regalos)
Styles.common = {
	-- bola de energia (regalo "Bola de energia")
	hadouken = { anim = "palm", startup = 0.32, active = 0, recovery = 0.4, kind = "projectile", projectile = { speed = 56, dmg = 80, size = 2.8, life = 2.6 } },
	-- carga del super ataque: el rival queda inmovil mientras tanto
	super = { anim = "charge", startup = 0.95, active = 0, recovery = 0.7, kind = "super" },
}

local GOLDEN = { kind = "light", hits = 1, hitstun = 0.3, kb = 8, launch = 0, range = 5.5, win = { -3.2, 3.5 }, cooldown = 0 }

-- Rellena lo que cada golpe no define para no repetirlo en las tablas de arriba
local function finalize(move)
	for key, value in pairs(GOLDEN) do
		if move[key] == nil then
			move[key] = value
		end
	end
	move.active = move.active or 0
	return move
end

for _, style in pairs(Styles.list) do
	for _, move in pairs(style.moves) do
		finalize(move)
	end
end
for _, move in pairs(Styles.common) do
	finalize(move)
end

function Styles.get(id)
	return Styles.list[id] or Styles.list.karateka
end

function Styles.isValid(id)
	return Styles.list[id] ~= nil
end

function Styles.randomOther(currentId)
	local options = {}
	for _, id in ipairs(Styles.order) do
		if id ~= currentId then
			table.insert(options, id)
		end
	end
	return options[math.random(1, #options)]
end

return Styles

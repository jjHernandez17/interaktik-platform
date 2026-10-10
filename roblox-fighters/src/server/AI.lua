-- El "cerebro" de cada luchador: nadie lo maneja, asi que decide solo cuando acercarse, alejarse, saltar, taparse o pegar.
-- El nivel (1 facil, 2 normal, 3 dificil) cambia que tan rapido piensa, cuanto ataca y cuanto se defiende.

local Combat = require(script.Parent.Combat)
local Config = require(script.Parent.Config)
local Util = require(script.Parent.Util)

local AI = {}

local LEVELS = {
	[1] = { interval = 0.4, attackChance = 0.4, blockChance = 0.12, jumpChance = 0.03, dodgeChance = 0.1 },
	[2] = { interval = 0.26, attackChance = 0.62, blockChance = 0.3, jumpChance = 0.05, dodgeChance = 0.35 },
	[3] = { interval = 0.16, attackChance = 0.82, blockChance = 0.5, jumpChance = 0.08, dodgeChance = 0.6 },
}

local CLOSE_RANGE = 6.8
local MID_RANGE = 15

local function newState()
	return {
		nextThink = 0,
		plan = "approach",
		planUntil = 0,
		blockUntil = 0,
		reactedTo = nil,
		jumpedForProjectile = 0,
	}
end

local function band(distance)
	if distance <= CLOSE_RANGE then
		return "close"
	elseif distance <= MID_RANGE then
		return "mid"
	end
	return "far"
end

-- Golpes que sirven ahora: listos (sin esperar) y que alcanzan (o que traen su propio avance)
local function usableMoves(fighter, now, distance)
	local weights = {}
	local table_ = fighter.style.ai[band(distance)] or {}
	for key, weight in pairs(table_) do
		local def = fighter.style.moves[key]
		if def and fighter:isReady(key, def, now) then
			local reachesNow = distance <= def.range + 1.2 + (def.lunge and def.lunge * 0.25 or 0)
			if def.kind == "projectile" or reachesNow then
				weights[key] = weight
			end
		end
	end
	return weights
end

local function choosePlan(ai, now, distance, idealRange, nearWall)
	local plan
	if distance > idealRange + 1.2 then
		plan = "approach"
	elseif distance < idealRange - 1.6 then
		plan = (math.random() < 0.55 and not nearWall) and "retreat" or "hold"
	else
		local roll = math.random()
		plan = roll < 0.4 and "hold" or (roll < 0.75 and "approach" or "retreat")
		if plan == "retreat" and nearWall then
			plan = "hold"
		end
	end
	ai.plan = plan
	ai.planUntil = now + 0.25 + math.random() * 0.45
end

-- Se llama cada cuadro para cada luchador mientras dura el round
function AI.update(fighter, now, level)
	local ai = fighter.ai
	if not ai then
		ai = newState()
		fighter.ai = ai
	end

	local cfg = LEVELS[level] or LEVELS[2]
	local intent = fighter.intent
	intent.jump = false
	intent.block = false

	local enemy = fighter.enemy
	if not enemy or not enemy.root or not fighter.root or not fighter.alive then
		intent.move = 0
		return
	end

	local delta = enemy.root.Position.X - fighter.root.Position.X
	local distance = math.abs(delta)
	local direction = Util.sign(delta)

	-- defensa: si el rival empieza un golpe cerca, a veces se tapa
	local enemyRun = enemy.state == "attack" and enemy.run or nil
	if enemyRun and enemyRun ~= ai.reactedTo and distance < enemyRun.def.range + 2.5 then
		ai.reactedTo = enemyRun
		if math.random() < cfg.blockChance and not enemyRun.def.unblockable then
			ai.blockUntil = now + enemyRun.startup + enemyRun.active + 0.2
		end
	end

	if not fighter:canAct(now) then
		intent.move = 0
		return
	end

	-- esquiva las bolas de energia saltando
	local incoming = Combat.incomingFor(fighter)
	if incoming and incoming < 14 and incoming > 4 and now - ai.jumpedForProjectile > 1.2 and fighter:isGrounded() then
		if math.random() < cfg.dodgeChance then
			ai.jumpedForProjectile = now
			intent.jump = true
		end
	end

	if now < ai.blockUntil then
		intent.block = true
		intent.move = 0
		return
	end

	-- cada tanto piensa: ¿pega o se mueve?
	if now >= ai.nextThink then
		ai.nextThink = now + cfg.interval * (0.8 + math.random() * 0.4)

		-- si nadie se hace dano en un buen rato, se vuelven mas agresivos para que el round termine
		local idle = now - math.max(fighter.lastDamageAt, enemy.lastDamageAt)
		local pressure = idle > 6 and 0.25 or 0

		if math.random() < cfg.attackChance + pressure then
			local weights = usableMoves(fighter, now, distance)
			local key = Util.weightedPick(weights)
			if key then
				fighter:startMove(key, fighter.style.moves[key])
				return
			end
		end

		local nearWall = math.abs(fighter.root.Position.X) > Config.ArenaHalfWidth - 5
		if now >= ai.planUntil then
			choosePlan(ai, now, distance, fighter.style.idealRange, nearWall)
		end

		if math.random() < cfg.jumpChance and fighter:isGrounded() and distance > 6 then
			intent.jump = true
		end
	end

	if now >= ai.planUntil then
		choosePlan(ai, now, distance, fighter.style.idealRange, math.abs(fighter.root.Position.X) > Config.ArenaHalfWidth - 5)
	end

	if ai.plan == "approach" then
		intent.move = direction
	elseif ai.plan == "retreat" then
		intent.move = -direction
	else
		intent.move = 0
	end
end

return AI

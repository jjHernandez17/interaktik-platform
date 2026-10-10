-- Poderes que activan los regalos. Cada uno se aplica al luchador del lado indicado (o al rival, en el caso de "congelar").

local Combat = require(script.Parent.Combat)
local Util = require(script.Parent.Util)

local Powers = {}

local METEOR_DAMAGE = 40 -- por meteoro, para 1000 de vida

-- Texto del aviso que ven los espectadores. {who} = quien mando el regalo, {side} = nombre del lado que recibe el poder
local MESSAGES = {
	golpe = "{who} mandó un GOLPE FUERTE para {side}",
	hadouken = "{who} lanzó una BOLA DE ENERGÍA para {side}",
	super = "{who} activó el SÚPER ATAQUE de {side}",
	meteoros = "{who} llamó una LLUVIA DE METEOROS para {side}",
	curar = "{who} curó a {side}",
	escudo = "{who} le puso un ESCUDO a {side}",
	furia = "{who} le dio FURIA a {side}",
	velocidad = "{who} aceleró a {side}",
	congelar = "{who} CONGELÓ al rival de {side}",
	estilo = "{who} cambió el estilo de {side}",
}

function Powers.message(power, who, sideName)
	local text = MESSAGES[power] or "{who} activó un poder para {side}"
	text = text:gsub("{who}", function()
		return who
	end)
	text = text:gsub("{side}", function()
		return sideName
	end)
	return text
end

-- Devuelve true si el poder se aplico. item = { side, power, amount, duration, param, nickname }
function Powers.apply(match, item)
	local fighter = match.fighters[item.side]
	local enemy = match.fighters[Util.otherSide(item.side)]
	if not fighter or not enemy or not fighter.model or not enemy.model then
		return false
	end

	local power = item.power
	local amount = tonumber(item.amount) or 0
	local duration = tonumber(item.duration) or 0

	if power == "golpe" or power == "hadouken" or power == "super" then
		fighter:queueGift({ kind = power == "golpe" and "strike" or power, amount = math.max(1, amount) })
	elseif power == "meteoros" then
		Combat.meteorShower(fighter, math.max(1, math.min(60, math.floor(amount))), METEOR_DAMAGE * fighter:damageScale())
	elseif power == "curar" then
		fighter:heal(amount)
	elseif power == "escudo" then
		fighter:addShield(amount)
	elseif power == "furia" then
		fighter:addFury(math.max(1, duration))
	elseif power == "velocidad" then
		fighter:addHaste(math.max(1, duration))
	elseif power == "congelar" then
		enemy:freeze(math.max(1, duration))
	elseif power == "estilo" then
		task.spawn(function()
			fighter:setStyle(item.param)
			match:refreshAppearance()
		end)
	else
		return false
	end

	match:announcePower(item)
	return true
end

return Powers

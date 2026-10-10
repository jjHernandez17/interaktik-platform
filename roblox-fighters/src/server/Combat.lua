-- Proyectiles (bolas de energia y shurikens) y meteoros. Los golpes cuerpo a cuerpo viven en Fighter.lua.

local Config = require(script.Parent.Config)
local Effects = require(script.Parent.Effects)
local Util = require(script.Parent.Util)

local Combat = {}

local projectiles = {}

function Combat.clear()
	for _, projectile in ipairs(projectiles) do
		if projectile.part then
			projectile.part:Destroy()
		end
	end
	table.clear(projectiles)
end

-- spec: { speed, dmg, size, life, unblockable, hitstun, kb, kind }
function Combat.spawnProjectile(owner, spec)
	local root = owner.root
	if not root then
		return
	end

	local facing = owner.facing
	local position = root.Position + Vector3.new(facing * 2.6, 0.6, 0)
	local part = Effects.projectileBall(position, owner.color, spec.size)

	table.insert(projectiles, {
		part = part,
		owner = owner,
		vx = facing * spec.speed,
		dmg = spec.dmg,
		size = spec.size,
		bornAt = Util.now(),
		life = spec.life or 2.5,
		unblockable = spec.unblockable,
		hitstun = spec.hitstun or 0.4,
		kb = spec.kb or 14,
		power = spec.power or 2,
	})
end

local function remove(index)
	local projectile = projectiles[index]
	if projectile and projectile.part then
		projectile.part:Destroy()
	end
	table.remove(projectiles, index)
end

function Combat.step(dt)
	local now = Util.now()

	-- se mueve y comprueba contra el rival
	for index = #projectiles, 1, -1 do
		local projectile = projectiles[index]
		local part = projectile.part
		local enemy = projectile.owner.enemy

		if not part or not part.Parent then
			table.remove(projectiles, index)
		else
			local position = part.Position + Vector3.new(projectile.vx * dt, 0, 0)
			part.Position = position

			local expired = now - projectile.bornAt > projectile.life or math.abs(position.X) > Config.ArenaHalfWidth + 12
			local hit = false

			if enemy and enemy.root and enemy:isTargetable() then
				local target = enemy.root.Position
				if math.abs(position.X - target.X) < 2 + projectile.size * 0.5 and math.abs(position.Y - target.Y) < 3.4 + projectile.size * 0.5 then
					hit = true
					enemy:takeHit(projectile.owner, {
						dmg = projectile.dmg,
						hitstun = projectile.hitstun,
						kb = projectile.kb,
						launch = 0,
						unblockable = projectile.unblockable,
						position = position,
						power = projectile.power,
					})
				end
			end

			if hit then
				Effects.explosion(position, 4)
				remove(index)
			elseif expired then
				remove(index)
			end
		end
	end

	-- dos bolas de energia de equipos distintos que se cruzan se anulan
	for i = #projectiles, 2, -1 do
		for j = i - 1, 1, -1 do
			local a = projectiles[i]
			local b = projectiles[j]
			if a and b and a.owner ~= b.owner and a.part and b.part then
				local delta = a.part.Position - b.part.Position
				if math.abs(delta.X) < (a.size + b.size) * 0.5 + 0.6 and math.abs(delta.Y) < (a.size + b.size) * 0.5 + 1 then
					local middle = (a.part.Position + b.part.Position) / 2
					Effects.hit(middle, Color3.fromRGB(255, 240, 200), 2)
					Effects.explosion(middle, 4)
					remove(i)
					remove(j)
					break
				end
			end
		end
	end
end

-- Distancia a la bola de energia mas cercana que va hacia este luchador (nil si no hay ninguna). La usa la IA para esquivar.
function Combat.incomingFor(fighter)
	if not fighter.root then
		return nil
	end

	local nearest = nil
	for _, projectile in ipairs(projectiles) do
		if projectile.owner ~= fighter and projectile.part and projectile.part.Parent then
			local ahead = (fighter.root.Position.X - projectile.part.Position.X) * Util.sign(projectile.vx)
			if ahead > 0 and (not nearest or ahead < nearest) then
				nearest = ahead
			end
		end
	end
	return nearest
end

-- Lluvia de meteoros sobre el rival. Cada uno hace "damage" si el rival sigue cerca del punto de impacto.
function Combat.meteorShower(owner, count, damage)
	local enemy = owner.enemy
	if not enemy or not enemy.root then
		return
	end

	for index = 1, count do
		task.delay((index - 1) * 0.28, function()
			if not enemy.root or not enemy.alive then
				return
			end

			-- apuntan cerca de donde esta el rival ahora (con un poco de azar para que se vea natural)
			local target = enemy.root.Position
			local ground = Vector3.new(target.X + math.random(-3, 3), Config.FloorTopY + 0.6, Config.LaneZ)
			Effects.meteor(ground, owner.color, function(impact)
				if enemy.root and enemy:isTargetable() and math.abs(enemy.root.Position.X - impact.X) < 5.5 and enemy.root.Position.Y < impact.Y + 7 then
					enemy:takeHit(owner, {
						dmg = damage,
						hitstun = 0.45,
						kb = 10,
						launch = 0,
						unblockable = true,
						position = impact + Vector3.new(0, 2, 0),
						power = 2,
					})
				end
			end)
		end)
	end
end

return Combat

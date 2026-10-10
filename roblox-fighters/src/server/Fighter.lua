-- Un luchador: su cuerpo (un personaje R15), su vida, sus golpes, sus defensas y sus efectos (furia, escudo, hielo...).
-- El servidor manda todo; el cliente solo dibuja la pose segun los atributos del modelo (ver client/Poses.lua).
--
-- Atributos del modelo que lee el cliente: Action, ActionT, ActionDur, Facing, Style, Side, Fury, Haste, Frozen, HitT, Shielded

local Players = game:GetService("Players")

local Combat = require(script.Parent.Combat)
local Config = require(script.Parent.Config)
local Effects = require(script.Parent.Effects)
local Styles = require(script.Parent.Styles)
local Util = require(script.Parent.Util)

local Fighter = {}
Fighter.__index = Fighter

local FURY_MULTIPLIER = 2
local HASTE_SPEED = 1.5
local HASTE_ATTACK = 1.35
local BLOCK_MAX_SEC = 1.4

function Fighter.new(side, folder)
	return setmetatable({
		side = side,
		folder = folder,
		enemy = nil,
		model = nil,
		root = nil,
		humanoid = nil,
		alive = false,
		name = "",
		color = Color3.new(1, 1, 1),
		styleId = "karateka",
		style = Styles.get("karateka"),
		maxHealth = 1000,
		health = 1000,
		shield = 0,
		facing = side == "left" and 1 or -1,
		state = "idle",
		stateUntil = 0,
		run = nil,
		cooldowns = {},
		furyUntil = 0,
		hasteUntil = 0,
		frozenUntil = 0,
		invulnUntil = 0,
		slideVx = 0,
		slideUntil = 0,
		intent = { move = 0, jump = false, block = false },
		blockSince = 0,
		blockLockedUntil = 0,
		giftQueue = {},
		giftRun = false,
		auras = {},
		bubble = nil,
		ice = nil,
		accessories = nil,
		lastDamageAt = 0,
		damageDealt = 0,
		onKO = nil,
	}, Fighter)
end

-- ---------- construccion del cuerpo ----------

local function weldTo(part, anchorPart)
	part.Anchored = false
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Massless = true
	part.CastShadow = false
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = anchorPart
	weld.Part1 = part
	weld.Parent = part
end

local function accessoryPart(props, anchorPart, offset, folder)
	local part = Instance.new("Part")
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Material = Enum.Material.SmoothPlastic
	for key, value in pairs(props) do
		part[key] = value
	end
	part.CFrame = anchorPart.CFrame * offset
	part.Parent = folder
	weldTo(part, anchorPart)
	return part
end

-- Adornos que distinguen el estilo (guantes, banda, mascara...). Se pegan al cuerpo con soldaduras.
function Fighter:applyAccessory()
	if not self.model then
		return
	end
	if self.accessories then
		self.accessories:Destroy()
	end

	local folder = Instance.new("Folder")
	folder.Name = "Accessories"
	folder.Parent = self.model
	self.accessories = folder

	local kind = self.style.accessory
	local head = self.model:FindFirstChild("Head")
	local torso = self.model:FindFirstChild("UpperTorso")
	local rightHand = self.model:FindFirstChild("RightHand")
	local leftHand = self.model:FindFirstChild("LeftHand")
	local accent = Util.tint(self.color, 0.15)
	local dark = Color3.fromRGB(24, 24, 30)

	if kind == "gloves" and rightHand and leftHand then
		for _, hand in ipairs({ rightHand, leftHand }) do
			accessoryPart({ Shape = Enum.PartType.Ball, Size = Vector3.new(1.5, 1.5, 1.5), Color = Color3.fromRGB(200, 30, 40) }, hand, CFrame.new(0, -0.1, 0), folder)
		end
	elseif kind == "headband" and head then
		accessoryPart({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.35, head.Size.X * 1.08, head.Size.X * 1.08), Color = accent }, head, CFrame.new(0, 0.25, 0) * CFrame.Angles(0, 0, math.rad(90)), folder)
		accessoryPart({ Size = Vector3.new(0.35, 0.35, 1.6), Color = accent }, head, CFrame.new(0.2, 0.25, 0.9), folder)
	elseif kind == "mask" and head then
		accessoryPart({ Shape = Enum.PartType.Ball, Size = Vector3.new(1.55, 1.55, 1.55), Color = accent }, head, CFrame.new(0, 0, 0), folder)
		accessoryPart({ Size = Vector3.new(0.9, 0.22, 0.12), Color = Color3.new(1, 1, 1) }, head, CFrame.new(0, 0.1, -0.75), folder)
	elseif kind == "ninja" and head and torso then
		accessoryPart({ Size = Vector3.new(head.Size.X * 1.05, head.Size.Y * 0.55, head.Size.Z * 1.05), Color = dark }, head, CFrame.new(0, -0.22, 0), folder)
		accessoryPart({ Size = Vector3.new(0.5, 0.4, 2.4), Color = accent }, torso, CFrame.new(0, 0.7, 1.2), folder)
	elseif kind == "chest" and torso then
		accessoryPart({ Size = Vector3.new(torso.Size.X * 1.05, torso.Size.Y * 0.8, 0.3), Color = Color3.fromRGB(245, 245, 245) }, torso, CFrame.new(0, 0, -torso.Size.Z * 0.5), folder)
		accessoryPart({ Size = Vector3.new(torso.Size.X * 0.5, torso.Size.Y * 0.35, 0.34), Color = accent }, torso, CFrame.new(0, 0.1, -torso.Size.Z * 0.5), folder)
	end
end

local function configureHumanoid(humanoid, root, style)
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoid.AutoRotate = false
	humanoid.UseJumpPower = true
	humanoid.JumpPower = style.jumpPower
	humanoid.WalkSpeed = style.walkSpeed
	humanoid.BreakJointsOnDeath = false
	humanoid.RequiresNeck = false
	humanoid.MaxHealth = 1000000
	humanoid.Health = 1000000
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Dead, false)
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Ragdoll, false)
	humanoid:SetStateEnabled(Enum.HumanoidStateType.FallingDown, false)
	humanoid:SetStateEnabled(Enum.HumanoidStateType.GettingUp, false)

	-- el servidor es quien lo mueve (si no, la fisica la calcularia el cliente y todo seria menos preciso)
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
end

-- Crea (o vuelve a crear) el personaje. Puede tardar un poco: la plataforma arma el R15 con una descripcion.
function Fighter:build(name, color, styleId)
	self.name = name
	self.color = color
	self.styleId = Styles.isValid(styleId) and styleId or "karateka"
	self.style = Styles.get(self.styleId)

	if self.model then
		self.model:Destroy()
		self.model = nil
	end

	local description = Instance.new("HumanoidDescription")
	description.HeadColor = self.style.skin
	description.LeftArmColor = self.style.skin
	description.RightArmColor = self.style.skin
	description.TorsoColor = color
	description.LeftLegColor = self.style.pants
	description.RightLegColor = self.style.pants

	local ok, model = pcall(function()
		return Players:CreateHumanoidModelFromDescription(description, Enum.HumanoidRigType.R15)
	end)
	if not ok or not model then
		warn("[PeleaCallejera] No se pudo crear el luchador: " .. tostring(model))
		return false
	end

	model.Name = self.side == "left" and "FighterLeft" or "FighterRight"
	model:SetAttribute("Side", self.side)
	model:SetAttribute("Style", self.styleId)
	model:SetAttribute("Facing", self.facing)
	model:SetAttribute("Action", "idle")
	model:SetAttribute("ActionT", Util.now())
	model:SetAttribute("ActionDur", 0)
	model:SetAttribute("Fury", false)
	model:SetAttribute("Haste", false)
	model:SetAttribute("Frozen", false)
	model:SetAttribute("Shielded", false)
	model:SetAttribute("HitT", 0)
	model.Parent = self.folder

	self.model = model
	self.root = model:WaitForChild("HumanoidRootPart", 5)
	self.humanoid = model:WaitForChild("Humanoid", 5)
	if not self.root or not self.humanoid then
		warn("[PeleaCallejera] El luchador se creo incompleto")
		return false
	end

	configureHumanoid(self.humanoid, self.root, self.style)
	self.auras = {}
	self.bubble = nil
	self.ice = nil
	self:applyAccessory()
	return true
end

-- Cambia de estilo sin perder vida ni posicion (regalo "Cambiar estilo")
function Fighter:setStyle(styleId)
	if not Styles.isValid(styleId) or not self.model then
		return
	end

	local cframe = self.root.CFrame
	local health, shield = self.health, self.shield
	local fury, haste, frozen = self.furyUntil, self.hasteUntil, self.frozenUntil
	local wasAlive = self.alive

	-- el modelo se vuelve a armar con el cuerpo del estilo nuevo
	if self:build(self.name, self.color, styleId) then
		self.root.CFrame = cframe
		self.health, self.shield = health, shield
		self.furyUntil, self.hasteUntil, self.frozenUntil = fury, haste, frozen
		self.alive = wasAlive
		self.run = nil
		self.state = "idle"
		self:setAction("idle")
		Effects.ring(cframe.Position, self.color, 1, 7, 0.4)
		Effects.floatingText(cframe.Position + Vector3.new(0, 3, 0), string.upper(self.style.label), self.color, 190)
	end
end

function Fighter:destroy()
	self:clearEffects()
	if self.model then
		self.model:Destroy()
		self.model = nil
	end
	self.root = nil
	self.humanoid = nil
end

-- ---------- estado y animacion ----------

-- hitFraction: en que parte de la duracion (0..1) cae el golpe; el cliente usa ese dato para que la pose llegue a tiempo
function Fighter:setAction(name, duration, hitFraction)
	if not self.model then
		return
	end
	local current = self.model:GetAttribute("Action")
	if current == name and duration == nil then
		return
	end
	self.model:SetAttribute("Action", name)
	self.model:SetAttribute("ActionT", Util.now())
	self.model:SetAttribute("ActionDur", duration or 0)
	self.model:SetAttribute("ActionHit", hitFraction or 0.4)
end

function Fighter:setState(state, untilTime)
	self.state = state
	self.stateUntil = untilTime or 0
end

function Fighter:setFacing(facing)
	if facing ~= self.facing then
		self.facing = facing
		if self.model then
			self.model:SetAttribute("Facing", facing)
		end
	end
end

-- Mantiene el cuerpo mirando a donde toca (la fisica a veces lo gira un poco al chocar)
function Fighter:orient()
	local root = self.root
	local look = root.CFrame.LookVector
	if look.X * self.facing < 0.985 then
		local position = root.Position
		root.CFrame = CFrame.lookAt(position, position + Vector3.new(self.facing, 0, 0))
	end
end

function Fighter:isFrozen(now)
	return now < self.frozenUntil
end

function Fighter:isHasted(now)
	return now < self.hasteUntil
end

function Fighter:isFurious(now)
	return now < self.furyUntil
end

function Fighter:isGrounded()
	return self.humanoid.FloorMaterial ~= Enum.Material.Air
end

function Fighter:isTargetable()
	return self.alive and self.model ~= nil and self.root ~= nil and self.state ~= "ko" and Util.now() >= self.invulnUntil
end

-- ¿Puede empezar un golpe o un poder ahora?
function Fighter:canAct(now)
	if not self.alive or self:isFrozen(now) then
		return false
	end
	return self.state == "idle" or self.state == "walk" or self.state == "jump" or self.state == "block"
end

function Fighter:healthFraction()
	return self.health / math.max(1, self.maxHealth)
end

function Fighter:damageScale()
	return self.maxHealth / 1000
end

function Fighter:setSlide(vx, duration)
	self.slideVx = vx
	self.slideUntil = Util.now() + duration
end

-- ---------- efectos de estado: furia, velocidad, escudo, hielo ----------

function Fighter:clearEffects()
	for _, cleanup in pairs(self.auras) do
		cleanup()
	end
	self.auras = {}
	if self.bubble then
		self.bubble:Destroy()
		self.bubble = nil
	end
	if self.ice then
		self.ice:Destroy()
		self.ice = nil
	end
end

function Fighter:refreshEffects(now)
	if not self.model then
		return
	end

	local furious = self:isFurious(now)
	if furious and not self.auras.fury then
		self.auras.fury = Effects.fireAura(self.model, Color3.fromRGB(255, 70, 40))
	elseif not furious and self.auras.fury then
		self.auras.fury()
		self.auras.fury = nil
	end
	if self.model:GetAttribute("Fury") ~= furious then
		self.model:SetAttribute("Fury", furious)
	end

	local hasted = self:isHasted(now)
	if hasted and not self.auras.haste then
		self.auras.haste = Effects.sparkleAura(self.model, Color3.fromRGB(90, 200, 255))
		self.humanoid.WalkSpeed = self.style.walkSpeed * HASTE_SPEED
	elseif not hasted and self.auras.haste then
		self.auras.haste()
		self.auras.haste = nil
		self.humanoid.WalkSpeed = self.style.walkSpeed
	end
	if self.model:GetAttribute("Haste") ~= hasted then
		self.model:SetAttribute("Haste", hasted)
	end

	local shielded = self.shield > 0
	if shielded and not self.bubble then
		self.bubble = Effects.bubble(self.model, Color3.fromRGB(110, 200, 255))
	elseif not shielded and self.bubble then
		self.bubble:Destroy()
		self.bubble = nil
	end
	if self.model:GetAttribute("Shielded") ~= shielded then
		self.model:SetAttribute("Shielded", shielded)
	end

	local frozen = self:isFrozen(now)
	if frozen and not self.ice then
		self.ice = Effects.iceBlock(self.model)
	elseif not frozen and self.ice then
		self.ice:Destroy()
		self.ice = nil
		if self.state == "frozen" then
			self:setState("idle")
		end
	end
	if self.model:GetAttribute("Frozen") ~= frozen then
		self.model:SetAttribute("Frozen", frozen)
	end
end

function Fighter:heal(amount)
	if not self.alive then
		return
	end
	local before = self.health
	self.health = math.min(self.maxHealth, self.health + amount)
	local healed = math.floor(self.health - before + 0.5)
	if self.root then
		Effects.healBurst(self.root.Position)
		Effects.floatingText(self.root.Position, "+" .. tostring(math.max(healed, math.floor(amount))), Color3.fromRGB(90, 255, 140), 170)
	end
end

function Fighter:addShield(amount)
	if not self.alive then
		return
	end
	self.shield = math.min(self.maxHealth, self.shield + amount)
	if self.root then
		Effects.ring(self.root.Position, Color3.fromRGB(110, 200, 255), 1, 8, 0.4)
		Effects.floatingText(self.root.Position, "ESCUDO +" .. tostring(math.floor(amount)), Color3.fromRGB(130, 215, 255), 200)
	end
end

function Fighter:addFury(seconds)
	local now = Util.now()
	self.furyUntil = math.max(now, self.furyUntil) + seconds
	if self.root then
		Effects.ring(self.root.Position, Color3.fromRGB(255, 70, 40), 1, 7, 0.4)
		Effects.floatingText(self.root.Position, "FURIA", Color3.fromRGB(255, 90, 60), 160)
	end
end

function Fighter:addHaste(seconds)
	local now = Util.now()
	self.hasteUntil = math.max(now, self.hasteUntil) + seconds
	if self.root then
		Effects.ring(self.root.Position, Color3.fromRGB(90, 200, 255), 1, 7, 0.4)
		Effects.floatingText(self.root.Position, "VELOCIDAD", Color3.fromRGB(110, 210, 255), 190)
	end
end

function Fighter:freeze(seconds)
	if not self.alive then
		return
	end
	local now = Util.now()
	self.frozenUntil = math.max(now, self.frozenUntil) + seconds
	-- un golpe en curso (que no sea de un regalo) se corta; si estaba en el aire, cae y se queda quieto
	if self.run and not self.run.armor then
		self.run = nil
	end
	if not self.run then
		self:setState("frozen", self.frozenUntil)
		self:setAction("frozen")
	end
	if self.root then
		Effects.ring(self.root.Position, Color3.fromRGB(170, 225, 255), 1, 8, 0.4)
	end
end

-- ---------- recibir golpes ----------

-- info: { dmg, hitstun, kb, launch, unblockable, position, power }
function Fighter:takeHit(attacker, info)
	if not self:isTargetable() then
		return nil
	end

	local now = Util.now()
	local dmg = info.dmg
	local blocked = false
	local position = info.position or self.root.Position

	if self.state == "block" and not info.unblockable then
		blocked = true
		dmg = math.max(1, dmg * (1 - self.style.blockReduction))
		Effects.block(position, self.color)
		self:setSlide(attacker.facing * 6, 0.12) -- el bloqueo lo empuja un poco hacia atras
	end

	-- el escudo se come el dano primero
	local absorbed = 0
	if self.shield > 0 then
		absorbed = math.min(self.shield, dmg)
		self.shield -= absorbed
		dmg -= absorbed
	end

	self.health = math.max(0, self.health - dmg)
	self.lastDamageAt = now
	attacker.lastDamageAt = now
	attacker.damageDealt += dmg

	if not blocked then
		Effects.hit(position, attacker.color, info.power or 1)
		self.model:SetAttribute("HitT", now)
	end

	local shown = math.floor(dmg + absorbed + 0.5)
	if shown > 0 then
		Effects.floatingText(position + Vector3.new(0, 1, 0), tostring(shown), blocked and Color3.fromRGB(170, 215, 255) or Color3.fromRGB(255, 240, 150), 120 + math.min(110, shown * 0.6))
	end

	if info.power and info.power >= 2 then
		Effects.screen("shake", 0.35 * info.power, 0.25)
	end

	if self.health <= 0 then
		self:knockOut(attacker, info)
		return { blocked = false, dmg = dmg, ko = true }
	end

	if not blocked then
		self:reactToHit(attacker, info, now)
	end
	return { blocked = blocked, dmg = dmg }
end

function Fighter:reactToHit(attacker, info, now)
	-- un golpe de regalo en curso no se interrumpe (asi un regalo nunca se pierde)
	if self.run and self.run.armor then
		return
	end

	self.run = nil
	local pushDirection = attacker.facing

	if (info.launch or 0) > 0 then
		-- por el aire y al suelo: sube, cae y se levanta
		local velocity = self.root.AssemblyLinearVelocity
		self.root.AssemblyLinearVelocity = Vector3.new(pushDirection * (info.kb or 8), info.launch, velocity.Z)
		self:setState("down", now + 1.7)
		self:setAction("knockdown", 1.7)
		self.invulnUntil = now + 1.6 -- tirado en el suelo no se le puede seguir pegando
	else
		self:setSlide(pushDirection * (info.kb or 8) * 2.2, 0.16)
		self:setState("hit", now + (info.hitstun or 0.3))
		self:setAction("hit", info.hitstun or 0.3)
	end
end

function Fighter:knockOut(attacker, info)
	self.alive = false
	self.run = nil
	self.shield = 0
	self.giftQueue = {}
	self:setState("ko", math.huge)
	self:setAction("ko", 0.8)
	self.humanoid:Move(Vector3.zero, false)

	local direction = attacker and attacker.facing or -self.facing
	local velocity = self.root.AssemblyLinearVelocity
	self.root.AssemblyLinearVelocity = Vector3.new(direction * 22, 26, velocity.Z)
	self:setSlide(direction * 12, 0.5)

	Effects.hit(self.root.Position, Color3.fromRGB(255, 240, 200), 3)
	Effects.screen("ko")
	if self.onKO then
		self.onKO(self, attacker)
	end
end

function Fighter:victory()
	self.alive = false
	self.run = nil
	self.giftQueue = {}
	self.humanoid:Move(Vector3.zero, false)
	self:setState("victory", math.huge)
	self:setAction("victory")
end

-- ---------- golpes ----------

function Fighter:isReady(key, def, now)
	return (self.cooldowns[key] or 0) <= now
end

-- opts: { dmg (dano fijo), unblockable, approach, armor, projectileDmg, onDone }
function Fighter:startMove(key, def, opts)
	opts = opts or {}
	local now = Util.now()
	local haste = self:isHasted(now) and HASTE_ATTACK or 1

	local run = {
		key = key,
		def = def,
		t0 = now,
		startup = def.startup / haste,
		active = def.active / haste,
		recovery = def.recovery / haste,
		fixedDamage = opts.dmg,
		unblockable = opts.unblockable or def.unblockable,
		armor = opts.armor,
		approach = opts.approach or def.approach,
		projectileDmg = opts.projectileDmg,
		onDone = opts.onDone,
		hitsDone = 0,
		fired = false,
		jumped = false,
		launched = false,
	}
	run.total = run.startup + run.active + run.recovery

	self.run = run
	self.cooldowns[key] = now + (def.cooldown or 0)
	self.humanoid:Move(Vector3.zero, false)
	self:setState("attack", math.huge)

	if run.approach then
		run.approachUntil = now + 0.65
		self:setAction("dash", 0.65)
	else
		self:setAction(def.anim, run.total, run.startup / run.total)
	end
	return true
end

function Fighter:endMove(now)
	local run = self.run
	self.run = nil
	if self.state == "attack" then
		self:setState("idle")
	end
	if run and run.onDone then
		run.onDone()
	end
end

-- ¿Alcanza el golpe al rival ahora?
function Fighter:reaches(def)
	local enemy = self.enemy
	if not enemy or not enemy:isTargetable() then
		return false
	end
	local dx = (enemy.root.Position.X - self.root.Position.X) * self.facing
	local dy = enemy.root.Position.Y - self.root.Position.Y
	return dx > -0.8 and dx < def.range + 1.2 and dy >= def.win[1] and dy <= def.win[2]
end

function Fighter:resolveMeleeHit(run)
	local def = run.def
	if not self:reaches(def) then
		return false
	end

	local now = Util.now()
	local base = run.fixedDamage or (def.dmg * self:damageScale())
	if self:isFurious(now) then
		base *= FURY_MULTIPLIER
	end

	local enemyPosition = self.enemy.root.Position
	local power = (def.kind == "light") and 1 or 2
	if run.fixedDamage then
		power = 3
	end

	self.enemy:takeHit(self, {
		dmg = base,
		hitstun = def.hitstun,
		kb = def.kb,
		launch = def.launch,
		unblockable = run.unblockable,
		position = Vector3.new((enemyPosition.X + self.root.Position.X) / 2 + self.facing * 0.8, enemyPosition.Y + 0.6, enemyPosition.Z),
		power = power,
	})
	return true
end

function Fighter:fireProjectile(run)
	local spec = run.def.projectile
	local now = Util.now()
	local damage = run.projectileDmg or (spec.dmg * self:damageScale())
	if self:isFurious(now) then
		damage *= FURY_MULTIPLIER
	end

	Combat.spawnProjectile(self, {
		speed = spec.speed,
		dmg = damage,
		size = spec.size,
		life = spec.life,
		unblockable = run.unblockable,
		power = run.projectileDmg and 3 or 2,
	})
end

-- Super ataque: rayo que cruza la arena (el rival quedo inmovil durante la carga, asi que siempre le llega)
function Fighter:fireSuper(run)
	local enemy = self.enemy
	local now = Util.now()
	local damage = run.fixedDamage or (260 * self:damageScale())
	if self:isFurious(now) then
		damage *= FURY_MULTIPLIER
	end

	local fromPosition = self.root.Position + Vector3.new(self.facing * 2, 0.5, 0)
	local toPosition = Vector3.new(self.facing * (Config.ArenaHalfWidth + 6), fromPosition.Y, fromPosition.Z)
	if enemy and enemy.root then
		toPosition = Vector3.new(enemy.root.Position.X + self.facing * 3, fromPosition.Y, fromPosition.Z)
	end
	Effects.beam(fromPosition, toPosition, self.color)
	Effects.screen("flash", self.color, 0.35)

	if enemy and enemy:isTargetable() then
		enemy.invulnUntil = 0
		enemy:takeHit(self, {
			dmg = damage,
			hitstun = 0.9,
			kb = 26,
			launch = 30,
			unblockable = true,
			position = enemy.root.Position + Vector3.new(0, 1, 0),
			power = 3,
		})
	end
end

function Fighter:updateAttack(now, dt)
	local run = self.run
	local def = run.def
	local root = self.root

	-- primero corre hacia el rival hasta quedar a tiro (golpes con "approach", como los de los regalos)
	if run.approach then
		local enemy = self.enemy
		local close = enemy and enemy.root and math.abs(enemy.root.Position.X - root.Position.X) <= math.max(2.4, def.range * 0.75)
		if close or now >= run.approachUntil then
			run.approach = false
			run.t0 = now
			self:setAction(def.anim, run.total, run.startup / run.total)
		else
			root.CFrame = root.CFrame + Vector3.new(self.facing * 62 * dt, 0, 0)
			return
		end
	end

	local t = now - run.t0

	if def.jumpFirst and not run.jumped then
		run.jumped = true
		self.humanoid.Jump = true
		self:setSlide(self.facing * 15, 0.55)
	end

	if def.selfLaunch and not run.launched and t >= run.startup * 0.4 then
		run.launched = true
		local velocity = root.AssemblyLinearVelocity
		root.AssemblyLinearVelocity = Vector3.new(self.facing * 4, def.selfLaunch, velocity.Z)
	end

	if def.lunge and t < run.startup + run.active then
		root.CFrame = root.CFrame + Vector3.new(self.facing * def.lunge * dt, 0, 0)
	end

	if def.kind == "projectile" then
		if not run.fired and t >= run.startup then
			run.fired = true
			self:fireProjectile(run)
		end
	elseif def.kind == "super" then
		if t < run.startup then
			-- mientras carga, el rival no puede hacer nada
			local enemy = self.enemy
			if enemy and enemy.alive and not run.froze then
				run.froze = true
				enemy.invulnUntil = 0
				enemy:freeze(run.startup + 0.5)
			end
		elseif not run.fired then
			run.fired = true
			self:fireSuper(run)
		end
	else
		local hits = def.hits
		local interval = hits > 1 and (run.active / hits) or 0
		while run.hitsDone < hits and t >= run.startup + interval * run.hitsDone do
			run.hitsDone += 1
			self:resolveMeleeHit(run)
		end
	end

	if t >= run.total then
		self:endMove(now)
	end
end

-- ---------- regalos que se ejecutan con animacion ----------

-- action: { kind = "strike" | "hadouken" | "super", amount = numero, queuedAt = hora }
function Fighter:queueGift(action)
	action.queuedAt = Util.now()
	table.insert(self.giftQueue, action)
end

local function giftDef(self, action)
	if action.kind == "strike" then
		local base = self.style.moves[self.style.strike]
		return self.style.strike, base, { dmg = action.amount, unblockable = true, approach = true, armor = true }
	elseif action.kind == "hadouken" then
		return "hadouken", Styles.common.hadouken, { projectileDmg = action.amount, armor = true, unblockable = false }
	end
	return "super", Styles.common.super, { dmg = action.amount, armor = true, unblockable = true }
end

-- Si un regalo lleva mucho esperando (rival congelado o atrapado en una cadena de golpes), se aplica directo para no perderlo
function Fighter:applyGiftDirect(action)
	local enemy = self.enemy
	if not enemy or not enemy:isTargetable() then
		return
	end

	if action.kind == "hadouken" then
		Combat.spawnProjectile(self, { speed = 56, dmg = action.amount, size = 2.8, life = 2.6, power = 3 })
		return
	end

	enemy:takeHit(self, {
		dmg = action.amount,
		hitstun = 0.5,
		kb = action.kind == "super" and 26 or 16,
		launch = action.kind == "super" and 30 or 0,
		unblockable = true,
		position = enemy.root.Position + Vector3.new(0, 1, 0),
		power = 3,
	})
end

function Fighter:processGifts(now)
	if #self.giftQueue == 0 then
		return
	end

	local waited = now - self.giftQueue[1].queuedAt
	if self.giftRun then
		return
	end

	if not self:canAct(now) then
		if waited > Config.MaxPowerWaitSec then
			self:applyGiftDirect(table.remove(self.giftQueue, 1))
		end
		return
	end

	local action = table.remove(self.giftQueue, 1)
	local key, def, opts = giftDef(self, action)
	self.giftRun = true
	opts.onDone = function()
		self.giftRun = false
	end
	if not self:startMove(key, def, opts) then
		self.giftRun = false
	end
end

-- ---------- turno ----------

function Fighter:applyIntent(now, dt)
	local intent = self.intent
	local humanoid = self.humanoid
	local grounded = self:isGrounded()

	-- bloqueo (con limite de tiempo para que nadie se quede tapado para siempre)
	if self.state == "block" then
		if not intent.block or now - self.blockSince > BLOCK_MAX_SEC then
			self:setState("idle")
			self.blockLockedUntil = now + 0.5
		else
			humanoid:Move(Vector3.zero, false)
			return
		end
	end

	if intent.block and grounded and now >= self.blockLockedUntil and (self.state == "idle" or self.state == "walk") then
		self:setState("block")
		self.blockSince = now
		self:setAction("block")
		humanoid:Move(Vector3.zero, false)
		return
	end

	humanoid:Move(Vector3.new(intent.move, 0, 0), false)

	if intent.jump and grounded and (self.state == "idle" or self.state == "walk") then
		humanoid.Jump = true
	end

	if not grounded then
		self:setState("jump")
		self:setAction("jump")
	else
		local speed = math.abs(self.root.AssemblyLinearVelocity.X)
		if speed > 2 and intent.move ~= 0 then
			self:setState("walk")
			self:setAction("walk")
		else
			self:setState("idle")
			self:setAction("idle")
		end
	end
end

function Fighter:update(now, dt, fighting)
	local root = self.root
	if not self.model or not root then
		return
	end

	-- se queda en su carril y dentro de la arena
	local position = root.Position
	local half = Config.ArenaHalfWidth
	local clampedX = Util.clamp(position.X, -half, half)
	if math.abs(position.Z - Config.LaneZ) > 0.05 or clampedX ~= position.X or position.Y < Config.FloorTopY - 8 then
		local y = position.Y < Config.FloorTopY - 8 and (Config.FloorTopY + 4) or position.Y
		root.CFrame = CFrame.lookAt(Vector3.new(clampedX, y, Config.LaneZ), Vector3.new(clampedX + self.facing, y, Config.LaneZ))
		local velocity = root.AssemblyLinearVelocity
		root.AssemblyLinearVelocity = Vector3.new(0, math.min(velocity.Y, 0), 0)
	end

	self:refreshEffects(now)

	-- empuje por golpes (se mueve directo para que no lo frene el controlador del personaje)
	if now < self.slideUntil then
		root.CFrame = root.CFrame + Vector3.new(self.slideVx * dt, 0, 0)
	end

	local enemy = self.enemy
	local state = self.state

	if state == "ko" or state == "victory" then
		self:orient()
		return
	end

	if self:isFrozen(now) then
		if not (self.run and self.run.armor) then
			self.humanoid:Move(Vector3.zero, false)
			if state ~= "frozen" then
				self:setState("frozen", self.frozenUntil)
				self:setAction("frozen")
			end
			self:orient()
			return
		end
	elseif state == "frozen" then
		self:setState("idle")
	end

	-- el rival siempre queda de frente, salvo en medio de un golpe
	if enemy and enemy.root and state ~= "attack" and state ~= "down" then
		local dx = enemy.root.Position.X - root.Position.X
		if math.abs(dx) > 0.4 then
			self:setFacing(dx > 0 and 1 or -1)
		end
	end
	self:orient()

	if state == "hit" then
		self.humanoid:Move(Vector3.zero, false)
		if now >= self.stateUntil then
			self:setState("idle")
		end
		return
	end

	if state == "down" then
		self.humanoid:Move(Vector3.zero, false)
		if now >= self.stateUntil then
			self:setState("getup", now + 0.5)
			self:setAction("getup", 0.5)
		end
		return
	end

	if state == "getup" then
		self.humanoid:Move(Vector3.zero, false)
		if now >= self.stateUntil then
			self:setState("idle")
		end
		return
	end

	if not fighting then
		self.humanoid:Move(Vector3.zero, false)
		if state == "idle" or state == "walk" or state == "block" or state == "jump" then
			self:setState("idle")
			if self:isGrounded() then
				self:setAction("idle")
			end
		end
		return
	end

	if state == "attack" then
		if self.run then
			self:updateAttack(now, dt)
			return
		end
		self:setState("idle") -- no deberia pasar, pero un golpe sin datos no puede dejarlo atascado
	end

	self:processGifts(now)
	if self.state == "attack" then
		return
	end

	self:applyIntent(now, dt)
end

-- ---------- colocar para el round ----------

function Fighter:resetForRound(maxHealth, x)
	self:clearEffects()
	self.maxHealth = maxHealth * self.style.healthMul
	self.health = self.maxHealth
	self.shield = 0
	self.alive = true
	self.run = nil
	self.cooldowns = {}
	self.furyUntil, self.hasteUntil, self.frozenUntil, self.invulnUntil = 0, 0, 0, 0
	self.slideVx, self.slideUntil = 0, 0
	self.giftQueue = {}
	self.giftRun = false
	self.intent = { move = 0, jump = false, block = false }
	self.blockLockedUntil = 0
	self.damageDealt = 0
	self.lastDamageAt = 0

	if self.humanoid then
		self.humanoid.WalkSpeed = self.style.walkSpeed
		self.humanoid.JumpPower = self.style.jumpPower
	end

	self.facing = x < 0 and 1 or -1
	if self.model then
		self.model:SetAttribute("Facing", self.facing)
	end

	if self.root then
		local position = Vector3.new(x, Config.FloorTopY + 4, Config.LaneZ)
		self.root.AssemblyLinearVelocity = Vector3.zero
		self.root.AssemblyAngularVelocity = Vector3.zero
		self.root.CFrame = CFrame.lookAt(position, position + Vector3.new(self.facing, 0, 0))
	end

	self:setState("idle")
	self:setAction("idle", 0)
end

return Fighter

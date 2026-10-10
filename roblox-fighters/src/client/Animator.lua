-- Dibuja la pose de cada luchador en cada cuadro, moviendo las articulaciones del personaje (Motor6D.Transform).
-- Lee los atributos que pone el servidor en el modelo: Action, ActionT, ActionDur, ActionHit, Facing, HitT, Fury, Frozen...

local RunService = game:GetService("RunService")

local Poses = require(script.Parent.Poses)

local Animator = {}

local states = {}

-- Articulaciones del personaje R15: nombre -> { pieza que la contiene, nombre de la articulacion }
local JOINT_PATHS = {
	Root = { "LowerTorso", "Root" },
	Waist = { "UpperTorso", "Waist" },
	Neck = { "Head", "Neck" },
	RightShoulder = { "RightUpperArm", "RightShoulder" },
	RightElbow = { "RightLowerArm", "RightElbow" },
	LeftShoulder = { "LeftUpperArm", "LeftShoulder" },
	LeftElbow = { "LeftLowerArm", "LeftElbow" },
	RightHip = { "RightUpperLeg", "RightHip" },
	RightKnee = { "RightLowerLeg", "RightKnee" },
	LeftHip = { "LeftUpperLeg", "LeftHip" },
	LeftKnee = { "LeftLowerLeg", "LeftKnee" },
}

local function findJoints(model)
	local joints = {}
	for name, path in pairs(JOINT_PATHS) do
		local part = model:FindFirstChild(path[1])
		local joint = part and part:FindFirstChild(path[2])
		if not joint then
			return nil
		end
		joints[name] = joint
	end
	return joints
end

local function copyPose(pose)
	local result = {}
	for _, key in ipairs(Poses.KEYS) do
		result[key] = pose[key]
	end
	return result
end

local function newHighlight(model)
	local highlight = Instance.new("Highlight")
	highlight.Name = "FighterHighlight"
	highlight.FillTransparency = 1
	highlight.OutlineTransparency = 1
	highlight.DepthMode = Enum.HighlightDepthMode.Occluded
	highlight.Parent = model
	return highlight
end

local function rotation(vector, mirror)
	return CFrame.Angles(math.rad(vector.X), math.rad(vector.Y * mirror), math.rad(vector.Z * mirror))
end

-- Colores y destellos: golpe recibido, congelado, furia
local function updateHighlight(model, data, now)
	local highlight = data.highlight
	if not highlight or not highlight.Parent then
		data.highlight = newHighlight(model)
		return
	end

	local hitAt = model:GetAttribute("HitT") or 0
	if hitAt ~= data.lastHit then
		data.lastHit = hitAt
		data.flashUntil = now + 0.16
	end

	if now < (data.flashUntil or 0) then
		local k = (data.flashUntil - now) / 0.16
		highlight.FillColor = Color3.new(1, 1, 1)
		highlight.FillTransparency = 1 - 0.7 * k
		highlight.OutlineTransparency = 1
	elseif model:GetAttribute("Frozen") then
		highlight.FillColor = Color3.fromRGB(150, 220, 255)
		highlight.FillTransparency = 0.55
		highlight.OutlineColor = Color3.fromRGB(220, 245, 255)
		highlight.OutlineTransparency = 0.2
	elseif model:GetAttribute("Fury") then
		local pulse = 0.35 + 0.2 * math.sin(now * 12)
		highlight.FillColor = Color3.fromRGB(255, 60, 30)
		highlight.FillTransparency = 0.82
		highlight.OutlineColor = Color3.fromRGB(255, 90, 40)
		highlight.OutlineTransparency = pulse
	else
		highlight.FillTransparency = 1
		highlight.OutlineTransparency = 1
	end
end

local function animateModel(model, data, dt, now)
	local root = model:FindFirstChild("HumanoidRootPart")
	local action = model:GetAttribute("Action") or "idle"
	local startedAt = model:GetAttribute("ActionT") or now
	local duration = model:GetAttribute("ActionDur") or 0
	local hitFraction = model:GetAttribute("ActionHit") or 0.4
	local facing = model:GetAttribute("Facing") or 1

	local velocity = root and (root.AssemblyLinearVelocity.X * facing) or 0
	data.walkPhase += dt * (5 + math.abs(velocity) * 0.5)

	local target = Poses.sample(action, {
		time = math.max(0, now - startedAt),
		duration = duration,
		hit = hitFraction,
		walk = data.walkPhase,
		speed = math.clamp(velocity / 16, -1.5, 1.5),
	})

	-- suavizado: los golpes casi no se suavizan para que lleguen en su momento
	local rate = Poses.isSnappy(action) and 40 or 16
	local alpha = 1 - math.exp(-rate * dt)
	local pose = data.pose
	for _, key in ipairs(Poses.KEYS) do
		pose[key] = pose[key]:Lerp(target[key], alpha)
	end

	local nearIsRight = facing >= 0
	local mirror = nearIsRight and 1 or -1
	local joints = data.joints

	joints.Root.Transform = CFrame.new(pose.RootPos) * rotation(pose.RootRot, mirror)
	joints.Waist.Transform = rotation(pose.Waist, mirror)
	joints.Neck.Transform = rotation(pose.Neck, mirror)

	joints.RightShoulder.Transform = rotation(nearIsRight and pose.NS or pose.FS, 1)
	joints.RightElbow.Transform = rotation(nearIsRight and pose.NE or pose.FE, 1)
	joints.LeftShoulder.Transform = rotation(nearIsRight and pose.FS or pose.NS, -1)
	joints.LeftElbow.Transform = rotation(nearIsRight and pose.FE or pose.NE, -1)

	joints.RightHip.Transform = rotation(nearIsRight and pose.NH or pose.FH, 1)
	joints.RightKnee.Transform = rotation(nearIsRight and pose.NK or pose.FK, 1)
	joints.LeftHip.Transform = rotation(nearIsRight and pose.FH or pose.NH, -1)
	joints.LeftKnee.Transform = rotation(nearIsRight and pose.FK or pose.NK, -1)
end

local function step(dt)
	local folder = workspace:FindFirstChild("Fighters")
	if not folder then
		return
	end

	local now = workspace:GetServerTimeNow()
	for _, model in ipairs(folder:GetChildren()) do
		if model:IsA("Model") then
			local data = states[model]
			if not data then
				data = { joints = nil, pose = copyPose(Poses.STANCE), walkPhase = 0, highlight = nil }
				states[model] = data
			end

			if not data.joints then
				data.joints = findJoints(model)
			end

			if data.joints then
				animateModel(model, data, dt, now)
				updateHighlight(model, data, now)
			end
		end
	end

	for model in pairs(states) do
		if not model.Parent then
			states[model] = nil
		end
	end
end

function Animator.start()
	-- despues de las animaciones normales del motor y antes de dibujar, para que la pose de aqui sea la que se ve
	RunService:BindToRenderStep("PeleaAnimator", Enum.RenderPriority.Character.Value + 5, step)
end

return Animator

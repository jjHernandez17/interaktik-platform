-- Camara fija de lado, como en los juegos de peleas: sigue el punto medio entre los dos luchadores y se aleja o acerca
-- para que siempre se vean los dos (tambien en pantallas verticales de celular).

local RunService = game:GetService("RunService")

local Fx = require(script.Parent.Fx)

local CameraRig = {}

local FLOOR_Y = 0
local LANE_Z = 0
local FIELD_OF_VIEW = 52
local MARGIN = 20 -- studs de aire a cada lado de los luchadores
local MIN_DISTANCE = 22
local MAX_DISTANCE = 110

local currentX = 0
local currentDistance = 46

local function fighterRoot(name)
	local folder = workspace:FindFirstChild("Fighters")
	local model = folder and folder:FindFirstChild(name)
	return model and model:FindFirstChild("HumanoidRootPart")
end

local function step(dt)
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end

	camera.CameraType = Enum.CameraType.Scriptable
	camera.FieldOfView = FIELD_OF_VIEW

	local left, right = fighterRoot("FighterLeft"), fighterRoot("FighterRight")
	local x1 = left and left.Position.X or -11
	local x2 = right and right.Position.X or 11

	local middle = (x1 + x2) / 2
	local span = math.abs(x1 - x2)

	-- distancia necesaria para que quepan los dos, segun la forma de la pantalla
	local viewport = camera.ViewportSize
	local aspect = viewport.X / math.max(1, viewport.Y)
	local verticalFov = math.rad(FIELD_OF_VIEW)
	local horizontalFov = 2 * math.atan(math.tan(verticalFov / 2) * aspect)
	local wanted = math.clamp(((span + MARGIN) / 2) / math.tan(horizontalFov / 2), MIN_DISTANCE, MAX_DISTANCE)
	wanted *= 1 - 0.3 * Fx.zoomAmount()

	currentX += (middle - currentX) * (1 - math.exp(-7 * dt))
	currentDistance += (wanted - currentDistance) * (1 - math.exp(-4 * dt))

	local shake = Fx.shakeOffset()
	local position = Vector3.new(currentX, FLOOR_Y + 5.2 + currentDistance * 0.07, LANE_Z + currentDistance) + shake
	local target = Vector3.new(currentX, FLOOR_Y + 4.4, LANE_Z) + shake * 0.3
	camera.CFrame = CFrame.lookAt(position, target)
end

function CameraRig.start()
	-- justo despues de la camara normal del motor, para que mande la nuestra
	RunService:BindToRenderStep("PeleaCamera", Enum.RenderPriority.Camera.Value + 1, step)
end

return CameraRig

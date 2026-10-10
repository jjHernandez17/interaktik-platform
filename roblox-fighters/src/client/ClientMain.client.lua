-- Pelea Callejera (cliente): camara fija de lado, interfaz y animacion de los luchadores.
-- No decide nada de la pelea: solo dibuja lo que el servidor va publicando.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Animator = require(script.Animator)
local CameraRig = require(script.CameraRig)
local Fx = require(script.Fx)
local Hud = require(script.Hud)

local state = ReplicatedStorage:WaitForChild("PeleaState")
local remotes = ReplicatedStorage:WaitForChild("PeleaRemotes")

local fxRemote = remotes:WaitForChild("Fx")
fxRemote.OnClientEvent:Connect(Fx.handle)

Hud.start(state, {
	Feed = remotes:WaitForChild("Feed"),
}, Fx)
CameraRig.start()
Animator.start()

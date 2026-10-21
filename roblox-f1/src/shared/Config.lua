-- Carrera de Formula 1: ajustes generales (los comparten servidor y cliente).

local Config = {}

Config.GameName = "Carrera de Formula 1"

-- Servidor de Interaktik: de aqui salen los espectadores que se unen y los regalos
Config.BaseUrl = "https://interaktik-platform-production.up.railway.app"
Config.ApiPath = "/api/roblox-f1"
-- Solo en Roblox Studio: si el backend local esta encendido se usa ese en vez del de produccion
Config.LocalUrl = "http://localhost:3000"
Config.StudioTestRobloxUserId = 10495506917
Config.LocalProbeSec = 15
Config.QueueIntervalSec = 1
Config.SessionIntervalSec = 20
Config.SessionRetrySec = 5

-- Pista
Config.Lanes = 4
Config.RoadWidth = 120
Config.TeamCount = 8
Config.ChassisHeight = 1.6 -- altura del chasis respecto al suelo (origen del CarBuilder)
Config.DriverScale = 0.72 -- tamano del piloto (avatar R15) dentro del cockpit
Config.DriverOffset = CFrame.new(0, 1.3, 0.15) -- donde se sienta, respecto al chasis

-- Carrera
Config.MaxRacers = 20
Config.MinRacers = 2
Config.Laps = 3
Config.LobbySec = 30 -- tiempo para que los espectadores se unan
Config.CountdownSec = 5
Config.ResultsSec = 14
Config.FinishWaitSec = 25 -- tras llegar el ganador, los demas tienen este tiempo para terminar
Config.MaxRaceSec = 600

-- Fisica simple (studs/segundo)
Config.BaseSpeed = 140
Config.CruiseSpeed = 55 -- despues de cruzar la meta
Config.Accel = 55
Config.Brake = 22
Config.LaneChangeSpeed = 16
Config.CarLateralGap = 11 -- si dos carros estan a menos de esto de lado, se estorban
Config.TurboMul = 1.35
Config.SlowMul = 0.5

-- Poderes (regalos): segundos por defecto
Config.TurboSec = 8
Config.SlowSec = 6
Config.ShieldSec = 10

-- Modo demostracion (sin cuenta vinculada): carros "bot" y regalos de mentira
Config.DemoBots = 12

return Config

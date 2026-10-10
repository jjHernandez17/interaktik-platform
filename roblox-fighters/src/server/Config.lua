-- Pelea Callejera: ajustes generales del juego (no cambian entre partidas).
-- Lo que decide el streamer (nombres, colores, estilos, vida, tiempo...) llega desde la pagina de Interaktik.

local Config = {}

Config.GameName = "Pelea Callejera"

-- Servidor de Interaktik: de aqui salen los regalos, los comentarios y el marcador
Config.BaseUrl = "https://interaktik-platform-production.up.railway.app"
Config.ApiPath = "/api/roblox-fighters"
-- Solo en Roblox Studio: si el backend local esta encendido se usa ese en vez del de produccion
Config.LocalUrl = "http://localhost:3000"
-- Solo en Studio: ID de Roblox a usar cuando se ejecuta con "Run" (F8), que no tiene jugador. Con "Play" se usa tu cuenta.
Config.StudioTestRobloxUserId = 10495506917
Config.LocalProbeSec = 15 -- cada cuanto se vuelve a mirar si el backend local esta encendido

Config.QueueIntervalSec = 1 -- cada cuanto se piden regalos nuevos
Config.SessionIntervalSec = 20 -- cada cuanto se revisan los ajustes de la pagina
Config.SessionRetrySec = 5 -- mientras la cuenta no este lista, cada cuanto se vuelve a preguntar

-- Arena: los luchadores solo se mueven por el eje X (hacia los lados); el eje Z queda fijo
Config.LaneZ = 0
Config.FloorTopY = 0
Config.ArenaHalfWidth = 38
Config.StartOffset = 11 -- cada luchador empieza a esta distancia del centro

-- Ritmo de la partida (segundos)
Config.IntroSec = 3.2
Config.RoundEndSec = 4.6
Config.ChampionSec = 9
Config.MaxPowerWaitSec = 3 -- un poder que no puede ejecutarse (luchador aturdido) se aplica directo pasado este tiempo

-- Lo que se usa mientras no haya cuenta vinculada (modo demostracion)
Config.Defaults = {
	left = { name = "Rojo", color = Color3.fromRGB(230, 57, 70), style = "karateka", keyword = "rojo" },
	right = { name = "Azul", color = Color3.fromRGB(58, 134, 255), style = "ninja", keyword = "azul" },
	winGoal = 5,
	roundSeconds = 90,
	maxHealth = 1000,
	aiLevel = 0,
}

return Config

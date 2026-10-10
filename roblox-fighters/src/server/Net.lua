-- Comunicacion con el servidor de Interaktik (regalos, comentarios, ajustes y marcador).
-- El juego se identifica con el ID de la cuenta de Roblox del jugador, que el streamer vinculo en la pagina del juego.

local HttpService = game:GetService("HttpService")

local Config = require(script.Parent.Config)

local Net = {}

Net.robloxUserId = nil

function Net.httpEnabled()
	local ok, enabled = pcall(function()
		return HttpService.HttpEnabled
	end)
	return ok and enabled == true
end

-- Devuelve: ok, datos (o texto del error), codigo HTTP, cuerpo del error
function Net.request(method, path, body)
	if not Net.robloxUserId then
		return false, "Todavia no hay una cuenta de Roblox", nil
	end

	local request = {
		Url = Config.BaseUrl .. Config.ApiPath .. path .. "?robloxUserId=" .. tostring(Net.robloxUserId),
		Method = method,
		Headers = { ["Content-Type"] = "application/json" },
	}
	if body ~= nil then
		request.Body = HttpService:JSONEncode(body)
	end

	local ok, response = pcall(function()
		return HttpService:RequestAsync(request)
	end)
	if not ok then
		return false, tostring(response), nil
	end

	local data = nil
	if response.Body and #response.Body > 0 then
		local decodedOk, decoded = pcall(function()
			return HttpService:JSONDecode(response.Body)
		end)
		if decodedOk then
			data = decoded
		end
	end

	if not response.Success then
		local message = (type(data) == "table" and data.error) or ("HTTP " .. tostring(response.StatusCode))
		return false, message, response.StatusCode, data
	end

	return true, data, response.StatusCode
end

-- Ajustes de la pagina, marcador y cuantos apoyan a cada lado. Responde { ready = true/false, ... }
function Net.getSession()
	return Net.request("GET", "/session")
end

-- Regalos y espectadores nuevos. Hay que confirmarlos con ack() o el servidor los vuelve a mandar.
function Net.pollQueue()
	return Net.request("GET", "/queue")
end

function Net.ack(ids)
	return Net.request("POST", "/ack", { ids = ids })
end

-- winner: "left" | "right" | "draw". roundId evita contar dos veces el mismo round si el aviso se repite.
function Net.reportRound(winner, roundId)
	return Net.request("POST", "/round-result", { winner = winner, roundId = roundId })
end

function Net.reset()
	return Net.request("POST", "/reset", {})
end

return Net

-- Lo que se ve en pantalla: barras de vida, tiempo, marcador de victorias, avisos grandes ("ROUND 1", "¡PELEA!", "K.O."),
-- la lista de lo que hacen los espectadores y los mensajes de estado. Todo sale de los atributos de PeleaState.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local TweenService = game:GetService("TweenService")

local Hud = {}

local FONT_BLACK = Enum.Font.GothamBlack
local FONT_BOLD = Enum.Font.GothamBold
local WHITE = Color3.new(1, 1, 1)
local MAX_FEED = 7
local FEED_SECONDS = 7

local function new(className, props, parent)
	local instance = Instance.new(className)
	for key, value in pairs(props) do
		instance[key] = value
	end
	instance.Parent = parent
	return instance
end

local function corner(parent, radius)
	return new("UICorner", { CornerRadius = UDim.new(0, radius) }, parent)
end

local function stroke(parent, color, thickness, transparency)
	return new("UIStroke", { Color = color, Thickness = thickness, Transparency = transparency or 0, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }, parent)
end

local function textStroke(parent, thickness)
	return new("UIStroke", { Color = Color3.new(0, 0, 0), Thickness = thickness, Transparency = 0.15, ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual }, parent)
end

-- Una de las dos barras de arriba (izquierda o derecha)
local function buildSide(top, side)
	local isRight = side == "right"
	local anchorX = isRight and 1 or 0
	local align = isRight and Enum.TextXAlignment.Right or Enum.TextXAlignment.Left

	local block = new("Frame", {
		Name = side .. "Block",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(anchorX, 0),
		Position = UDim2.new(anchorX, 0, 0, 0),
		Size = UDim2.new(0.5, -66, 1, 0),
	}, top)

	local nameLabel = new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 28),
		Font = FONT_BLACK,
		TextSize = 24,
		TextColor3 = WHITE,
		TextXAlignment = align,
		Text = "",
	}, block)
	textStroke(nameLabel, 2)

	local infoLabel = new("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0, 28),
		Size = UDim2.new(1, 0, 0, 18),
		Font = FONT_BOLD,
		TextSize = 14,
		TextColor3 = WHITE,
		TextXAlignment = align,
		Text = "",
	}, block)
	textStroke(infoLabel, 1.5)

	local bar = new("Frame", {
		Position = UDim2.new(0, 0, 0, 50),
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundColor3 = Color3.fromRGB(18, 16, 30),
		BorderSizePixel = 0,
		ClipsDescendants = true,
	}, block)
	corner(bar, 8)
	stroke(bar, WHITE, 2, 0.2)

	local function barPiece(color, zIndex)
		return new("Frame", {
			AnchorPoint = Vector2.new(anchorX, 0),
			Position = UDim2.new(anchorX, 0, 0, 0),
			Size = UDim2.new(1, 0, 1, 0),
			BackgroundColor3 = color,
			BorderSizePixel = 0,
			ZIndex = zIndex,
		}, bar)
	end

	local ghost = barPiece(Color3.fromRGB(255, 196, 64), 1)
	local fill = barPiece(WHITE, 2)
	new("UIGradient", { Color = ColorSequence.new(WHITE, Color3.fromRGB(175, 175, 175)), Rotation = 90 }, fill)

	local healthText = new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Font = FONT_BOLD,
		TextSize = 14,
		TextColor3 = WHITE,
		ZIndex = 3,
		Text = "",
	}, bar)
	textStroke(healthText, 1.5)

	local shieldBar = new("Frame", {
		AnchorPoint = Vector2.new(anchorX, 0),
		Position = UDim2.new(anchorX, 0, 0, 80),
		Size = UDim2.new(0, 0, 0, 5),
		BackgroundColor3 = Color3.fromRGB(110, 200, 255),
		BorderSizePixel = 0,
	}, block)
	corner(shieldBar, 3)

	local pips = new("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0, 90),
		Size = UDim2.new(1, 0, 0, 14),
	}, block)
	new("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = isRight and Enum.HorizontalAlignment.Right or Enum.HorizontalAlignment.Left,
		Padding = UDim.new(0, 5),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, pips)

	return {
		name = nameLabel,
		info = infoLabel,
		fill = fill,
		ghost = ghost,
		healthText = healthText,
		shield = shieldBar,
		pips = pips,
		winsText = nil,
		displayRatio = 1,
		ghostRatio = 1,
		builtGoal = -1,
		builtColor = nil,
	}
end

-- Circulos de victorias (o un texto si la meta es muy grande)
local function refreshPips(side, goal, wins, color)
	local pips = side.pips
	if goal > 10 then
		if side.builtGoal ~= goal then
			for _, child in ipairs(pips:GetChildren()) do
				if not child:IsA("UIListLayout") then
					child:Destroy()
				end
			end
			side.winsText = new("TextLabel", {
				BackgroundTransparency = 1,
				Size = UDim2.new(0, 120, 1, 0),
				Font = FONT_BOLD,
				TextSize = 14,
				TextColor3 = WHITE,
				Text = "",
			}, pips)
			textStroke(side.winsText, 1.5)
			side.builtGoal = goal
		end
		side.winsText.Text = ("VICTORIAS %d / %d"):format(wins, goal)
		return
	end

	if side.builtGoal ~= goal or side.builtColor ~= color then
		for _, child in ipairs(pips:GetChildren()) do
			if not child:IsA("UIListLayout") then
				child:Destroy()
			end
		end
		for index = 1, goal do
			local pip = new("Frame", {
				Name = "Pip" .. index,
				LayoutOrder = index,
				Size = UDim2.fromOffset(13, 13),
				BackgroundColor3 = color,
				BackgroundTransparency = 1,
				BorderSizePixel = 0,
			}, pips)
			corner(pip, 7)
			stroke(pip, WHITE, 2, 0.15)
		end
		side.builtGoal = goal
		side.builtColor = color
	end

	for index, pip in ipairs(pips:GetChildren()) do
		if pip:IsA("Frame") then
			local number = tonumber(pip.Name:match("%d+")) or index
			pip.BackgroundTransparency = number <= wins and 0 or 1
		end
	end
end

function Hud.start(state, remotes, Fx)
	local player = Players.LocalPlayer
	local playerGui = player:WaitForChild("PlayerGui")

	-- sin la interfaz normal de Roblox (chat, lista de jugadores, mochila...)
	pcall(function()
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false)
	end)

	local old = playerGui:FindFirstChild("PeleaHud")
	if old then
		old:Destroy()
	end

	local gui = new("ScreenGui", {
		Name = "PeleaHud",
		ResetOnSpawn = false,
		IgnoreGuiInset = true,
		DisplayOrder = 20,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	}, playerGui)

	-- ---------- barra de arriba ----------
	local top = new("Frame", {
		Name = "Top",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 14),
		Size = UDim2.new(0.96, 0, 0, 108),
	}, gui)

	local sides = { left = buildSide(top, "left"), right = buildSide(top, "right") }

	local timerBox = new("Frame", {
		Name = "Timer",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 4),
		Size = UDim2.fromOffset(84, 84),
		BackgroundColor3 = Color3.fromRGB(16, 14, 28),
		BorderSizePixel = 0,
	}, top)
	corner(timerBox, 42)
	stroke(timerBox, Color3.fromRGB(255, 214, 102), 3, 0)
	local timerLabel = new("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Font = FONT_BLACK,
		TextSize = 42,
		TextColor3 = WHITE,
		Text = "90",
	}, timerBox)
	local roundLabel = new("TextLabel", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 90),
		Size = UDim2.fromOffset(140, 18),
		Font = FONT_BOLD,
		TextSize = 14,
		TextColor3 = Color3.fromRGB(255, 214, 102),
		Text = "",
	}, top)
	textStroke(roundLabel, 1.5)

	-- ---------- aviso grande en el centro ----------
	local banner = new("TextLabel", {
		Name = "Banner",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.36, 0),
		Size = UDim2.new(0.9, 0, 0, 110),
		Font = FONT_BLACK,
		TextSize = 88,
		TextColor3 = WHITE,
		Text = "",
		Visible = false,
		TextWrapped = true,
	}, gui)
	local bannerStroke = new("UIStroke", { Color = Color3.fromRGB(20, 8, 30), Thickness = 6, ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual }, banner)
	local bannerScale = new("UIScale", { Scale = 1 }, banner)
	local bannerSub = new("TextLabel", {
		Name = "BannerSub",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.36, 62),
		Size = UDim2.new(0.9, 0, 0, 40),
		Font = FONT_BOLD,
		TextSize = 30,
		TextColor3 = Color3.fromRGB(255, 214, 102),
		Text = "",
		Visible = false,
	}, gui)
	textStroke(bannerSub, 3)

	local bannerToken = 0
	local function showBanner(text, sub)
		bannerToken += 1
		local token = bannerToken

		if not text or text == "" then
			banner.Visible = false
			bannerSub.Visible = false
			return
		end

		banner.Text = text
		bannerSub.Text = sub or ""
		banner.Visible = true
		bannerSub.Visible = (sub or "") ~= ""
		banner.TextTransparency = 0
		bannerStroke.Transparency = 0
		bannerSub.TextTransparency = 0
		bannerScale.Scale = 1.8
		TweenService:Create(bannerScale, TweenInfo.new(0.28, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()

		local hold = (text:find("PELEA") and 0.9) or (text:find("CAMPE") and 6) or 1.9
		task.delay(hold, function()
			if token ~= bannerToken then
				return
			end
			TweenService:Create(banner, TweenInfo.new(0.35), { TextTransparency = 1 }):Play()
			TweenService:Create(bannerStroke, TweenInfo.new(0.35), { Transparency = 1 }):Play()
			TweenService:Create(bannerSub, TweenInfo.new(0.35), { TextTransparency = 1 }):Play()
			task.delay(0.4, function()
				if token == bannerToken then
					banner.Visible = false
					bannerSub.Visible = false
				end
			end)
		end)
	end

	-- ---------- lista de lo que hacen los espectadores ----------
	local feed = new("Frame", {
		Name = "Feed",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 16, 1, -16),
		Size = UDim2.new(0.38, 0, 0.42, 0),
	}, gui)
	new("UIListLayout", {
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		Padding = UDim.new(0, 5),
	}, feed)

	local feedCounter = 0
	local function addFeed(text, side, kind)
		feedCounter += 1
		local color = WHITE
		if side == "left" then
			color = state:GetAttribute("LeftColor") or WHITE
		elseif side == "right" then
			color = state:GetAttribute("RightColor") or WHITE
		end

		local entry = new("Frame", {
			LayoutOrder = feedCounter,
			Size = UDim2.new(1, 0, 0, 28),
			BackgroundColor3 = Color3.new(0, 0, 0),
			BackgroundTransparency = 0.45,
			BorderSizePixel = 0,
		}, feed)
		corner(entry, 6)
		new("Frame", { Size = UDim2.new(0, 5, 1, 0), BackgroundColor3 = color, BorderSizePixel = 0 }, entry)
		local label = new("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 12, 0, 0),
			Size = UDim2.new(1, -16, 1, 0),
			Font = kind == "champion" and FONT_BLACK or FONT_BOLD,
			TextSize = 15,
			TextColor3 = kind == "join" and Color3.fromRGB(215, 215, 235) or WHITE,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			Text = text,
		}, entry)

		-- si hay demasiados, se va el mas viejo
		local entries = {}
		for _, child in ipairs(feed:GetChildren()) do
			if child:IsA("Frame") then
				table.insert(entries, child)
			end
		end
		table.sort(entries, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
		while #entries > MAX_FEED do
			table.remove(entries, 1):Destroy()
		end

		task.delay(FEED_SECONDS - 0.6, function()
			if entry.Parent then
				TweenService:Create(entry, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()
				TweenService:Create(label, TweenInfo.new(0.5), { TextTransparency = 1 }):Play()
				task.delay(0.55, function()
					if entry.Parent then
						entry:Destroy()
					end
				end)
			end
		end)
	end

	if remotes.Feed then
		remotes.Feed.OnClientEvent:Connect(addFeed)
	end

	-- ---------- mensajes de estado y modo demostracion ----------
	local status = new("TextLabel", {
		Name = "Status",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -14),
		Size = UDim2.new(0.62, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(20, 18, 34),
		BackgroundTransparency = 0.15,
		Font = FONT_BOLD,
		TextSize = 16,
		TextColor3 = WHITE,
		TextWrapped = true,
		Text = "",
		Visible = false,
	}, gui)
	corner(status, 10)
	new("UIPadding", { PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8), PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14) }, status)
	local statusStroke = stroke(status, Color3.fromRGB(110, 150, 255), 2, 0.1)

	local demoBadge = new("TextLabel", {
		Name = "DemoBadge",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 0, 130),
		Size = UDim2.fromOffset(190, 24),
		BackgroundColor3 = Color3.fromRGB(255, 160, 40),
		Font = FONT_BLACK,
		TextSize = 12,
		TextColor3 = Color3.fromRGB(30, 18, 4),
		Text = "MODO DEMOSTRACIÓN",
		Visible = false,
	}, gui)
	corner(demoBadge, 12)

	-- ---------- destello de pantalla ----------
	local flash = new("Frame", {
		Name = "Flash",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = WHITE,
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ZIndex = 50,
		Active = false,
	}, gui)
	Fx.setFlashHandler(function(color, duration)
		flash.BackgroundColor3 = color
		flash.BackgroundTransparency = 0.45
		TweenService:Create(flash, TweenInfo.new(duration), { BackgroundTransparency = 1 }):Play()
	end)

	-- ---------- actualizacion cada cuadro ----------
	local lastBannerId = state:GetAttribute("BannerId") or 0

	local function update(dt)
		local now = workspace:GetServerTimeNow()
		local phase = state:GetAttribute("Phase") or "waiting"
		local goal = state:GetAttribute("WinGoal") or 5

		for _, key in ipairs({ "left", "right" }) do
			local prefix = key == "left" and "Left" or "Right"
			local side = sides[key]
			local color = state:GetAttribute(prefix .. "Color") or WHITE
			local health = state:GetAttribute(prefix .. "Health") or 0
			local maxHealth = math.max(1, state:GetAttribute(prefix .. "Max") or 1)
			local shield = state:GetAttribute(prefix .. "Shield") or 0
			local ratio = math.clamp(health / maxHealth, 0, 1)

			side.name.Text = string.upper(state:GetAttribute(prefix .. "Name") or "")
			side.name.TextColor3 = color:Lerp(WHITE, 0.35)
			side.info.Text = ("%s  ·  %d seguidores"):format(state:GetAttribute(prefix .. "Style") or "", state:GetAttribute(prefix .. "Supporters") or 0)
			side.info.TextColor3 = color:Lerp(WHITE, 0.55)
			side.fill.BackgroundColor3 = color

			-- la barra se mueve suave y una sombra amarilla marca lo que se acaba de perder
			side.displayRatio += (ratio - side.displayRatio) * (1 - math.exp(-14 * dt))
			side.ghostRatio = math.max(side.displayRatio, side.ghostRatio - dt * 0.22)
			if ratio > side.ghostRatio then
				side.ghostRatio = ratio
			end
			side.fill.Size = UDim2.new(side.displayRatio, 0, 1, 0)
			side.ghost.Size = UDim2.new(side.ghostRatio, 0, 1, 0)
			side.healthText.Text = ("%d / %d"):format(health, maxHealth)
			side.shield.Size = UDim2.new(math.clamp(shield / maxHealth, 0, 1), 0, 0, 5)

			refreshPips(side, goal, state:GetAttribute(prefix .. "Wins") or 0, color)
		end

		if phase == "fight" then
			local remaining = math.max(0, (state:GetAttribute("RoundEndsAt") or 0) - now)
			timerLabel.Text = tostring(math.ceil(remaining))
			timerLabel.TextColor3 = remaining <= 10 and Color3.fromRGB(255, 90, 90) or WHITE
		elseif phase == "intro" then
			timerLabel.Text = tostring(state:GetAttribute("RoundSeconds") or 90)
			timerLabel.TextColor3 = WHITE
		end
		local round = state:GetAttribute("Round") or 0
		roundLabel.Text = round > 0 and ("ROUND " .. round) or ""

		local bannerId = state:GetAttribute("BannerId") or 0
		if bannerId ~= lastBannerId then
			lastBannerId = bannerId
			showBanner(state:GetAttribute("Banner") or "", state:GetAttribute("BannerSub") or "")
		end

		local statusText = state:GetAttribute("Status") or ""
		status.Visible = statusText ~= ""
		if statusText ~= "" then
			status.Text = statusText
			local tone = state:GetAttribute("StatusTone") or "info"
			statusStroke.Color = tone == "warn" and Color3.fromRGB(255, 170, 60) or (tone == "ok" and Color3.fromRGB(90, 220, 140) or Color3.fromRGB(110, 150, 255))
		end
		demoBadge.Visible = state:GetAttribute("Demo") == true
	end

	RunService.RenderStepped:Connect(update)
end

return Hud

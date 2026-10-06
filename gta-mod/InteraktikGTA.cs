// Interaktik para GTA V - mod de ScriptHookVDotNet (v3).
//
// Se conecta a la plataforma por WebSocket (<url>/gta-bridge/<llave>) y ejecuta DENTRO del juego cada
// accion que mandan los regalos de TikTok: sin consola, sin teclas y sin ventanas. Solo funciona en GTA V
// (version clasica) con Script Hook V y ScriptHookVDotNet instalados, y solo en modo historia.
//
// La configuracion (llave del usuario) esta en scripts\InteraktikGTA.ini; se descarga ya rellena desde la
// pagina del juego en Interaktik. Cada accion (su "id") la define el servidor (gtaService.js).
//
// Compilacion (sin SDK, con el compilador que trae Windows): ver gta-mod/build.cmd

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;

public class InteraktikGTA : Script
{
    class Job
    {
        public int Id;
        public string Action;
        public int Amount;
        public string Label;
        public string Nickname;
        public DateTime Received = DateTime.UtcNow;
    }

    class Delayed
    {
        public DateTime At;
        public Action Run;
    }

    const string DefaultUrl = "https://interaktik-platform-production.up.railway.app";
    const int MaxJobAgeSeconds = 60;

    // ----- configuracion
    string key = "";
    string url = DefaultUrl;
    bool showGifts;
    bool showConnected = true;

    // ----- red (hilo aparte): solo se encolan trabajos; los comandos del juego se ejecutan en OnTick
    readonly ConcurrentQueue<Job> inbox = new ConcurrentQueue<Job>();
    readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly CancellationTokenSource cancel = new CancellationTokenSource();
    volatile bool connectedNotice;
    volatile string pendingMessage;
    volatile bool paused;
    ClientWebSocket current;

    // ----- estado dentro del juego
    readonly Random random = new Random();
    readonly List<Delayed> delayed = new List<Delayed>();
    readonly Dictionary<string, DateTime> effects = new Dictionary<string, DateTime>();
    bool drunkWaiting;
    DateTime drunkStart;
    bool onlineWarned;

    static readonly WeaponHash[] Arsenal =
    {
        WeaponHash.Knife, WeaponHash.Pistol, WeaponHash.CombatPistol, WeaponHash.APPistol, WeaponHash.Pistol50,
        WeaponHash.MicroSMG, WeaponHash.SMG, WeaponHash.AssaultRifle, WeaponHash.CarbineRifle, WeaponHash.AdvancedRifle,
        WeaponHash.PumpShotgun, WeaponHash.SawnOffShotgun, WeaponHash.SniperRifle, WeaponHash.HeavySniper,
        WeaponHash.GrenadeLauncher, WeaponHash.RPG, WeaponHash.Grenade, WeaponHash.StickyBomb, WeaponHash.Molotov,
    };

    static readonly Weather[] WeatherPool =
    {
        Weather.ExtraSunny, Weather.Clear, Weather.Clouds, Weather.Overcast, Weather.Raining,
        Weather.ThunderStorm, Weather.Foggy, Weather.Smog, Weather.Snowing,
    };

    public InteraktikGTA()
    {
        // Sin esto la conexion segura (wss) falla en .NET Framework: solo hablaria TLS 1.0
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;

        LoadConfig();
        Tick += OnTick;
        Aborted += OnAborted;
        Interval = 0;

        if (key.Length == 0)
        {
            Log("No hay llave: descarga InteraktikGTA.ini desde la pagina del juego y ponlo en la carpeta scripts.");
            pendingMessage = "Interaktik: falta la llave. Descarga InteraktikGTA.ini desde la pagina del juego.";
            return;
        }

        Task.Run(delegate { return NetworkLoop(cancel.Token); });
    }

    // ================= configuracion y registro =================

    static string ScriptsFolder()
    {
        string folder = Path.Combine(Directory.GetCurrentDirectory(), "scripts");
        if (Directory.Exists(folder)) return folder;
        try
        {
            string here = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (!string.IsNullOrEmpty(here) && Directory.Exists(here)) return here;
        }
        catch (Exception)
        {
        }
        return folder;
    }

    void LoadConfig()
    {
        try
        {
            string path = Path.Combine(ScriptsFolder(), "InteraktikGTA.ini");
            if (!File.Exists(path)) return;

            foreach (string raw in File.ReadAllLines(path))
            {
                string line = raw.Trim();
                int eq = line.IndexOf('=');
                if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#") || eq <= 0) continue;

                string name = line.Substring(0, eq).Trim().ToLowerInvariant();
                string value = line.Substring(eq + 1).Trim();
                if (name == "key") key = value;
                else if (name == "url" && value.Length > 0) url = value;
                else if (name == "showgifts") showGifts = value.ToLowerInvariant() == "true" || value == "1";
                else if (name == "showconnected") showConnected = !(value.ToLowerInvariant() == "false" || value == "0");
            }
        }
        catch (Exception ex)
        {
            Log("No se pudo leer la configuracion: " + ex.Message);
        }
    }

    // El mismo error en cada tick llenaria el disco: se anota una vez por minuto, con cuantas veces se repitio
    static readonly Dictionary<string, DateTime> lastLogged = new Dictionary<string, DateTime>();
    static readonly Dictionary<string, int> suppressed = new Dictionary<string, int>();

    static void LogThrottled(string key, string text)
    {
        DateTime last;
        if (lastLogged.TryGetValue(key, out last) && (DateTime.UtcNow - last).TotalSeconds < 60)
        {
            int count;
            suppressed.TryGetValue(key, out count);
            suppressed[key] = count + 1;
            return;
        }

        int repeats;
        suppressed.TryGetValue(key, out repeats);
        suppressed[key] = 0;
        lastLogged[key] = DateTime.UtcNow;
        Log(text + (repeats > 0 ? " (se repitio " + repeats + " veces mas)" : ""));
    }

    static void Log(string text)
    {
        try
        {
            File.AppendAllText(Path.Combine(ScriptsFolder(), "InteraktikGTA.log"), "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + text + Environment.NewLine);
        }
        catch (Exception)
        {
            // el registro es solo para diagnosticar
        }
    }

    void OnAborted(object sender, EventArgs e)
    {
        cancel.Cancel();
        ClientWebSocket socket = current;
        if (socket != null)
        {
            try { socket.Abort(); } catch (Exception) { }
        }
    }

    // ================= red =================

    Uri BuildUri()
    {
        string baseUrl = url.Trim().TrimEnd('/');
        if (baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) baseUrl = "wss://" + baseUrl.Substring(8);
        else if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) baseUrl = "ws://" + baseUrl.Substring(7);
        return new Uri(baseUrl + "/gta-bridge/" + key.Trim());
    }

    async Task NetworkLoop(CancellationToken token)
    {
        int delay = 2000;
        while (!token.IsCancellationRequested)
        {
            bool fatal = false;
            try
            {
                using (ClientWebSocket socket = new ClientWebSocket())
                {
                    current = socket;
                    await socket.ConnectAsync(BuildUri(), token);
                    delay = 2000;

                    Task statusTask = StatusLoop(socket, token);
                    fatal = await ReceiveLoop(socket, token);
                    current = null;
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                if (token.IsCancellationRequested) return;
                Log("No se pudo conectar: " + ex.Message + " (reintento en " + (delay / 1000) + " s)");
            }

            if (fatal) return;

            try { await Task.Delay(delay, token); } catch (OperationCanceledException) { return; }
            delay = Math.Min(delay * 2, 15000);
        }
    }

    // Devuelve true si el servidor cerro por un motivo que no se arregla reintentando
    async Task<bool> ReceiveLoop(ClientWebSocket socket, CancellationToken token)
    {
        byte[] buffer = new byte[16 * 1024];
        while (socket.State == WebSocketState.Open && !token.IsCancellationRequested)
        {
            MemoryStream message = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return HandleClose(socket);
                }
                message.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            HandleMessage(Encoding.UTF8.GetString(message.ToArray()));
        }
        return false;
    }

    bool HandleClose(ClientWebSocket socket)
    {
        int code = socket.CloseStatus.HasValue ? (int)socket.CloseStatus.Value : 0;
        if (code == 4004)
        {
            pendingMessage = "Interaktik: la llave no es valida. Descarga de nuevo InteraktikGTA.ini.";
            Log("Cierre 4004: llave no valida.");
            return true;
        }
        if (code == 4003)
        {
            pendingMessage = "Interaktik: tu prueba o plan vencio.";
            Log("Cierre 4003: plan vencido.");
            return true;
        }
        if (code == 4001)
        {
            pendingMessage = "Interaktik: la llave fue regenerada. Descarga de nuevo InteraktikGTA.ini.";
            Log("Cierre 4001: llave regenerada.");
            return true;
        }
        if (code == 4000)
        {
            pendingMessage = "Interaktik: este juego se conecto desde otro lugar.";
            Log("Cierre 4000: reemplazada por otra conexion.");
            return true;
        }
        return false;
    }

    void HandleMessage(string text)
    {
        Dictionary<string, object> message;
        try
        {
            message = json.Deserialize<Dictionary<string, object>>(text);
        }
        catch (Exception)
        {
            return;
        }
        if (message == null || !message.ContainsKey("type")) return;

        string type = Convert.ToString(message["type"]);
        if (type == "hello")
        {
            connectedNotice = true;
            Log("Conectado a Interaktik.");
        }
        else if (type == "cheat" && message.ContainsKey("action"))
        {
            Job job = new Job();
            job.Id = Convert.ToInt32(message["id"]);
            job.Action = Convert.ToString(message["action"]);
            job.Amount = message.ContainsKey("amount") ? Convert.ToInt32(message["amount"]) : 1;
            job.Label = message.ContainsKey("label") ? Convert.ToString(message["label"]) : "";
            job.Nickname = message.ContainsKey("nickname") ? Convert.ToString(message["nickname"]) : "";
            inbox.Enqueue(job);
        }
    }

    async Task StatusLoop(ClientWebSocket socket, CancellationToken token)
    {
        while (socket.State == WebSocketState.Open && !token.IsCancellationRequested)
        {
            await Send(socket, "{\"type\":\"status\",\"gameRunning\":true,\"gameFocused\":" + (paused ? "false" : "true") + "}");
            try { await Task.Delay(3000, token); } catch (OperationCanceledException) { return; }
        }
    }

    async Task Send(ClientWebSocket socket, string text)
    {
        if (socket == null || socket.State != WebSocketState.Open) return;
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        await sendLock.WaitAsync();
        try
        {
            if (socket.State == WebSocketState.Open)
            {
                await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }
        }
        catch (Exception)
        {
            // la conexion se reinicia sola
        }
        finally
        {
            sendLock.Release();
        }
    }

    void Report(Job job, bool ok, string reason)
    {
        string body = "{\"type\":\"result\",\"id\":" + job.Id + ",\"ok\":" + (ok ? "true" : "false") + ",\"reason\":" + json.Serialize(reason ?? "") + "}";
        ClientWebSocket socket = current;
        Task.Run(delegate { return Send(socket, body); });
    }

    // ================= juego (siempre en el hilo del script) =================

    void OnTick(object sender, EventArgs e)
    {
        try
        {
            paused = Game.IsPaused;

            if (pendingMessage != null)
            {
                string text = pendingMessage;
                pendingMessage = null;
                Screen.ShowSubtitle(text, 6000);
            }

            if (connectedNotice)
            {
                connectedNotice = false;
                if (showConnected) Screen.ShowSubtitle("Interaktik conectado", 3000);
            }

            RunEffects();
            RunDelayed();
            ProcessInbox();
        }
        catch (Exception ex)
        {
            LogThrottled("tick", "Error en el tick (si dice SHVDN.NativeMemory, tu ScriptHookVDotNet es demasiado viejo para esta version de GTA V: actualizalo con el instalador): " + ex);
        }
    }

    static bool CanRun()
    {
        if (Game.IsPaused) return false;
        if (Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE)) return false;
        if (Function.Call<bool>(Hash.IS_CUTSCENE_ACTIVE)) return false;
        Ped ped = Game.Player.Character;
        return ped != null && ped.Exists() && ped.IsAlive;
    }

    void ProcessInbox()
    {
        Job job;
        // Una accion por tick: si hay varias, se ejecutan una detras de otra
        if (inbox.IsEmpty) return;

        // GTA Online: el mod no hace nada (Script Hook V ya lo desactiva, esto es solo un seguro)
        if (Function.Call<bool>(Hash.NETWORK_IS_SESSION_STARTED))
        {
            while (inbox.TryDequeue(out job)) Report(job, false, "GTA Online: el mod solo funciona en modo historia");
            if (!onlineWarned)
            {
                onlineWarned = true;
                Screen.ShowSubtitle("Interaktik no funciona en GTA Online. Usa el modo historia.", 6000);
            }
            return;
        }

        if (!CanRun()) return;
        if (!inbox.TryDequeue(out job)) return;

        if ((DateTime.UtcNow - job.Received).TotalSeconds > MaxJobAgeSeconds)
        {
            Report(job, false, "la accion llego cuando el juego no estaba listo y se descarto");
            return;
        }

        try
        {
            Execute(job);
            if (showGifts && !string.IsNullOrEmpty(job.Label))
            {
                string who = string.IsNullOrEmpty(job.Nickname) ? "Alguien" : job.Nickname;
                Screen.ShowSubtitle(who + ": " + job.Label, 3000);
            }
            Report(job, true, "");
        }
        catch (Exception ex)
        {
            Log("Error ejecutando '" + job.Action + "': " + ex);
            Report(job, false, ex.Message);
        }
    }

    // ---------- efectos con duracion y acciones retrasadas ----------

    void StartEffect(string name, int seconds)
    {
        effects[name] = DateTime.UtcNow.AddSeconds(seconds);
    }

    bool EffectActive(string name)
    {
        DateTime end;
        return effects.TryGetValue(name, out end) && DateTime.UtcNow < end;
    }

    void After(int milliseconds, Action run)
    {
        Delayed item = new Delayed();
        item.At = DateTime.UtcNow.AddMilliseconds(milliseconds);
        item.Run = run;
        delayed.Add(item);
    }

    void RunDelayed()
    {
        if (delayed.Count == 0) return;
        DateTime now = DateTime.UtcNow;
        for (int i = delayed.Count - 1; i >= 0; i--)
        {
            if (delayed[i].At > now) continue;
            Action run = delayed[i].Run;
            delayed.RemoveAt(i);
            try { run(); } catch (Exception ex) { Log("Error en accion retrasada: " + ex.Message); }
        }
    }

    void RunEffects()
    {
        Ped ped = Game.Player.Character;

        if (EffectActive("super_jump")) Function.Call(Hash.SET_SUPER_JUMP_THIS_FRAME, Game.Player.Handle);
        if (EffectActive("fast_run")) Game.Player.SetRunSpeedMultThisFrame(1.49f);

        if (effects.ContainsKey("invincible") && DateTime.UtcNow >= effects["invincible"])
        {
            effects.Remove("invincible");
            ped.IsInvincible = false;
        }

        // Borrachera: hay que esperar a que cargue la animacion de caminar
        if (drunkWaiting)
        {
            if (Function.Call<bool>(Hash.HAS_ANIM_SET_LOADED, "move_m@drunk@verydrunk"))
            {
                drunkWaiting = false;
                Function.Call(Hash.SET_PED_MOVEMENT_CLIPSET, ped.Handle, "move_m@drunk@verydrunk", 1.0f);
                Function.Call(Hash.SHAKE_GAMEPLAY_CAM, "DRUNK_SHAKE", 1.0f);
                Function.Call(Hash.SET_TIMECYCLE_MODIFIER, "Drunk");
                StartEffect("drunk", 30);
            }
            else if ((DateTime.UtcNow - drunkStart).TotalSeconds > 5)
            {
                drunkWaiting = false;
            }
        }
        if (effects.ContainsKey("drunk") && DateTime.UtcNow >= effects["drunk"])
        {
            effects.Remove("drunk");
            Function.Call(Hash.RESET_PED_MOVEMENT_CLIPSET, ped.Handle, 0.0f);
            Function.Call(Hash.STOP_GAMEPLAY_CAM_SHAKING, true);
            Function.Call(Hash.CLEAR_TIMECYCLE_MODIFIER);
        }
    }

    // ---------- acciones ----------

    // Punto delante (o al lado, si va en coche) del jugador para aparecer vehiculos
    Vector3 SpawnPoint(Ped ped, float distance)
    {
        if (ped.IsInVehicle()) return ped.Position + ped.RightVector * (distance + 2f);
        return ped.Position + ped.ForwardVector * distance;
    }

    void SpawnVehicle(VehicleHash hash, float distance)
    {
        Ped ped = Game.Player.Character;
        Vehicle vehicle = World.CreateVehicle(hash, SpawnPoint(ped, distance), ped.Heading);
        if (vehicle == null) throw new InvalidOperationException("no se pudo crear el vehiculo");
        vehicle.PlaceOnGround();
        vehicle.MarkAsNoLongerNeeded();
    }

    void Execute(Job job)
    {
        Ped ped = Game.Player.Character;

        switch (job.Action)
        {
            // ---------------- molestar ----------------
            case "wanted_up":
                {
                    int stars = Function.Call<int>(Hash.GET_PLAYER_WANTED_LEVEL, Game.Player.Handle);
                    Function.Call(Hash.SET_PLAYER_WANTED_LEVEL, Game.Player.Handle, Math.Min(5, stars + Math.Max(1, job.Amount)), false);
                }
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL_NOW, Game.Player.Handle, false);
                break;

            case "skyfall":
                Function.Call(Hash.CLEAR_PED_TASKS_IMMEDIATELY, ped.Handle);
                ped.Weapons.Give(WeaponHash.Parachute, 1, false, true);
                Vector3 up = ped.Position + new Vector3(0f, 0f, 500f);
                Function.Call(Hash.SET_ENTITY_COORDS, ped.Handle, up.X, up.Y, up.Z, false, false, false, true);
                Function.Call(Hash.TASK_SKY_DIVE, ped.Handle, false);
                break;

            case "drunk":
                Function.Call(Hash.REQUEST_ANIM_SET, "move_m@drunk@verydrunk");
                drunkWaiting = true;
                drunkStart = DateTime.UtcNow;
                break;

            case "slippery":
                {
                    List<Vehicle> cars = new List<Vehicle>(World.GetNearbyVehicles(ped.Position, 60f));
                    if (ped.CurrentVehicle != null && !cars.Contains(ped.CurrentVehicle)) cars.Add(ped.CurrentVehicle);
                    foreach (Vehicle car in cars) Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, car.Handle, true);
                    After(30000, delegate
                    {
                        foreach (Vehicle car in cars)
                        {
                            if (car != null && car.Exists()) Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, car.Handle, false);
                        }
                    });
                }
                break;

            case "garbage_truck":
                SpawnVehicle(VehicleHash.Trash, 7f);
                break;

            case "weather":
                {
                    Weather next = WeatherPool[random.Next(WeatherPool.Length)];
                    if (next == World.Weather) next = WeatherPool[(Array.IndexOf(WeatherPool, next) + 1) % WeatherPool.Length];
                    World.Weather = next;
                }
                break;

            case "explosion":
                for (int i = 0; i < Math.Max(1, job.Amount); i++)
                {
                    After(i * 450, delegate
                    {
                        Ped p = Game.Player.Character;
                        Vector3 spot = p.Position + p.ForwardVector * 3f + p.RightVector * (random.Next(-2, 3));
                        World.AddExplosion(spot, ExplosionType.Grenade, 1.0f, 0.4f);
                    });
                }
                break;

            case "disarm":
                ped.Weapons.RemoveAll();
                break;

            case "ragdoll":
                ped.Ragdoll(3000, RagdollType.Relax);
                break;

            case "fire":
                Function.Call(Hash.START_ENTITY_FIRE, ped.Handle);
                After(5000, delegate { Function.Call(Hash.STOP_ENTITY_FIRE, Game.Player.Character.Handle); });
                break;

            // ---------------- ayudar ----------------
            case "health":
                ped.Health = ped.MaxHealth;
                ped.Armor = 100;
                break;

            case "weapons":
                foreach (WeaponHash weapon in Arsenal) ped.Weapons.Give(weapon, 500, false, true);
                break;

            case "invincible":
                ped.IsInvincible = true;
                StartEffect("invincible", 300);
                break;

            case "wanted_clear":
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL, Game.Player.Handle, 0, false);
                Function.Call(Hash.SET_PLAYER_WANTED_LEVEL_NOW, Game.Player.Handle, false);
                break;

            case "special":
                Function.Call(Hash.SPECIAL_ABILITY_FILL_METER, Game.Player.Handle, true, 0);
                break;

            case "helicopter":
                SpawnVehicle(VehicleHash.Buzzard, 9f);
                break;

            case "sports_car":
                SpawnVehicle(VehicleHash.Comet2, 6f);
                break;

            case "rapid_gt":
                SpawnVehicle(VehicleHash.RapidGT, 6f);
                break;

            case "stunt_plane":
                SpawnVehicle(VehicleHash.Stunt, 12f);
                break;

            case "tank":
                SpawnVehicle(VehicleHash.Rhino, 9f);
                break;

            case "super_jump":
                StartEffect("super_jump", 120);
                break;

            case "fast_run":
                StartEffect("fast_run", 120);
                break;

            default:
                throw new InvalidOperationException("accion desconocida: " + job.Action);
        }
    }
}

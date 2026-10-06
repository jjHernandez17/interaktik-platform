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
    volatile bool lastCloseWas4000;

    // ----- estado dentro del juego
    readonly Random random = new Random();
    readonly List<Delayed> delayed = new List<Delayed>();
    readonly Dictionary<string, DateTime> effects = new Dictionary<string, DateTime>();
    bool drunkWaiting;
    DateTime drunkStart;
    bool onlineWarned;

    class Car
    {
        public VehicleHash Hash;
        public float Distance;
        public Car(VehicleHash hash, float distance) { Hash = hash; Distance = distance; }
    }

    // Grupos de peds: enemigos que atacan al jugador, o aliados que lo siguen y lo defienden
    class Squad
    {
        public PedHash[] Models;
        public WeaponHash[] Weapons;
        public bool Allied;
        public int Accuracy;
        public Squad(bool allied, int accuracy, PedHash[] models, WeaponHash[] weapons)
        {
            Allied = allied; Accuracy = accuracy; Models = models; Weapons = weapons;
        }
    }

    class Spawned
    {
        public Entity Entity;
        public DateTime Expires;
    }

    static readonly WeaponHash[] NoWeapons = new WeaponHash[0];

    static readonly Dictionary<string, Car> Cars = new Dictionary<string, Car>
    {
        { "car_adder", new Car(VehicleHash.Adder, 6f) }, { "car_zentorno", new Car(VehicleHash.Zentorno, 6f) },
        { "car_t20", new Car(VehicleHash.T20, 6f) }, { "car_osiris", new Car(VehicleHash.Osiris, 6f) },
        { "car_entityxf", new Car(VehicleHash.EntityXF, 6f) }, { "car_infernus", new Car(VehicleHash.Infernus, 6f) },
        { "car_bullet", new Car(VehicleHash.Bullet, 6f) }, { "car_vacca", new Car(VehicleHash.Vacca, 6f) },
        { "car_banshee", new Car(VehicleHash.Banshee, 6f) }, { "car_jester", new Car(VehicleHash.Jester, 6f) },
        { "car_turismor", new Car(VehicleHash.Turismor, 6f) }, { "car_cheetah", new Car(VehicleHash.Cheetah, 6f) },
        { "car_voltic", new Car(VehicleHash.Voltic, 6f) }, { "car_sultan", new Car(VehicleHash.Sultan, 6f) },
        { "car_buffalo", new Car(VehicleHash.Buffalo, 6f) }, { "car_dukes", new Car(VehicleHash.Dukes, 6f) },
        { "car_ruiner", new Car(VehicleHash.Ruiner, 6f) }, { "car_hotknife", new Car(VehicleHash.Hotknife, 6f) },
        { "car_monster", new Car(VehicleHash.Monster, 8f) }, { "car_rebel", new Car(VehicleHash.Rebel, 7f) },
        { "car_sandking", new Car(VehicleHash.Sandking, 7f) }, { "car_dune", new Car(VehicleHash.Dune, 6f) },
        { "car_bifta", new Car(VehicleHash.Bifta, 6f) }, { "car_insurgent", new Car(VehicleHash.Insurgent, 8f) },
        { "car_sanchez", new Car(VehicleHash.Sanchez, 4f) }, { "car_bati", new Car(VehicleHash.Bati, 4f) },
        { "car_akuma", new Car(VehicleHash.Akuma, 4f) }, { "car_faggio", new Car(VehicleHash.Faggio, 4f) },
        { "car_bmx", new Car(VehicleHash.Bmx, 3f) }, { "car_caddy", new Car(VehicleHash.Caddy, 5f) },
        { "car_mower", new Car(VehicleHash.Mower, 4f) }, { "car_tractor", new Car(VehicleHash.Tractor, 6f) },
        { "car_bus", new Car(VehicleHash.Bus, 10f) }, { "car_stretch", new Car(VehicleHash.Stretch, 8f) },
        { "car_taxi", new Car(VehicleHash.Taxi, 6f) }, { "car_ambulance", new Car(VehicleHash.Ambulance, 7f) },
        { "car_police", new Car(VehicleHash.Police, 6f) }, { "car_riot", new Car(VehicleHash.Riot, 9f) },
        { "car_barracks", new Car(VehicleHash.Barracks, 10f) }, { "car_towtruck", new Car(VehicleHash.TowTruck, 8f) },
        { "car_frogger", new Car(VehicleHash.Frogger, 10f) }, { "car_maverick", new Car(VehicleHash.Maverick, 10f) },
        { "car_lazer", new Car(VehicleHash.Lazer, 14f) }, { "car_hydra", new Car(VehicleHash.Hydra, 14f) },
        { "car_dodo", new Car(VehicleHash.Dodo, 14f) },
    };

    static readonly Dictionary<string, Squad> Squads = new Dictionary<string, Squad>
    {
        { "enemy_thugs", new Squad(false, 20, new PedHash[] { PedHash.BallaOrig01GMY, PedHash.BallaEast01GMY }, new WeaponHash[] { WeaponHash.Bat, WeaponHash.Crowbar, WeaponHash.Hammer }) },
        { "enemy_ballas", new Squad(false, 25, new PedHash[] { PedHash.BallaOrig01GMY, PedHash.BallaEast01GMY }, new WeaponHash[] { WeaponHash.Pistol, WeaponHash.MicroSMG }) },
        { "enemy_families", new Squad(false, 25, new PedHash[] { PedHash.Famdd01, PedHash.Famca01GMY }, new WeaponHash[] { WeaponHash.Pistol, WeaponHash.SMG }) },
        { "enemy_vagos", new Squad(false, 25, new PedHash[] { PedHash.VagosFun01 }, new WeaponHash[] { WeaponHash.Pistol, WeaponHash.MicroSMG, WeaponHash.SawnOffShotgun }) },
        { "enemy_bikers", new Squad(false, 25, new PedHash[] { PedHash.Lost01GMY, PedHash.Lost02GMY }, new WeaponHash[] { WeaponHash.Machete, WeaponHash.Pistol }) },
        { "enemy_mafia", new Squad(false, 30, new PedHash[] { PedHash.ArmGoon01GMM }, new WeaponHash[] { WeaponHash.SMG, WeaponHash.Pistol50 }) },
        { "enemy_soldiers", new Squad(false, 30, new PedHash[] { PedHash.Marine01SMY }, new WeaponHash[] { WeaponHash.CarbineRifle, WeaponHash.AssaultRifle }) },
        { "enemy_swat", new Squad(false, 35, new PedHash[] { PedHash.Swat01SMY }, new WeaponHash[] { WeaponHash.CarbineRifle, WeaponHash.PumpShotgun }) },
        { "enemy_clowns", new Squad(false, 20, new PedHash[] { PedHash.Clown01SMY }, new WeaponHash[] { WeaponHash.Knife, WeaponHash.Machete }) },
        { "enemy_zombies", new Squad(false, 20, new PedHash[] { PedHash.Zombie01 }, NoWeapons) },
        { "enemy_aliens", new Squad(false, 25, new PedHash[] { PedHash.MovAlien01 }, new WeaponHash[] { WeaponHash.SMG }) },
        { "enemy_dogs", new Squad(false, 20, new PedHash[] { PedHash.Rottweiler }, NoWeapons) },
        { "enemy_cougars", new Squad(false, 20, new PedHash[] { PedHash.MountainLion }, NoWeapons) },
        { "enemy_boars", new Squad(false, 20, new PedHash[] { PedHash.Boar }, NoWeapons) },
        { "ally_bodyguards", new Squad(true, 45, new PedHash[] { PedHash.Security01SMM }, new WeaponHash[] { WeaponHash.SMG, WeaponHash.CarbineRifle }) },
        { "ally_gang", new Squad(true, 40, new PedHash[] { PedHash.Famdd01, PedHash.Famca01GMY }, new WeaponHash[] { WeaponHash.Pistol, WeaponHash.MicroSMG }) },
        { "ally_soldiers", new Squad(true, 50, new PedHash[] { PedHash.Marine01SMY }, new WeaponHash[] { WeaponHash.CarbineRifle }) },
        { "ally_chop", new Squad(true, 40, new PedHash[] { PedHash.Chop }, NoWeapons) },
    };

    static readonly Vector3[] FarAway =
    {
        new Vector3(-75f, -819f, 328f),    // azotea de la Maze Bank
        new Vector3(501f, 5604f, 798f),    // cima del Monte Chiliad
        new Vector3(-1850f, -1230f, 14f),  // muelle de Del Perro
        new Vector3(1851f, 3688f, 35f),    // Sandy Shores
        new Vector3(-1336f, -3044f, 14f),  // pista del aeropuerto
        new Vector3(711f, 1198f, 349f),    // letrero de Vinewood
    };

    static readonly VehicleHash[] RainCars = { VehicleHash.Futo, VehicleHash.Panto, VehicleHash.Dukes, VehicleHash.Ruiner, VehicleHash.Sultan, VehicleHash.Buffalo, VehicleHash.Taxi, VehicleHash.Bus };

    readonly List<Spawned> spawned = new List<Spawned>();
    RelationshipGroup enemyGroup;
    bool enemyGroupReady;
    Entity teleportEntity;
    Vector3 teleportSpot;

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

            try { await Task.Delay(lastCloseWas4000 ? 20000 : delay, token); } catch (OperationCanceledException) { return; }
            lastCloseWas4000 = false;
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
            lastCloseWas4000 = true;
            Log("Cierre 4000: reemplazada por otra conexion (por ejemplo la prueba del instalador). Reintento en 20 s.");
            return false;
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

        CleanSpawned();

        // Teletransporte: se pide el mapa del destino y se mantiene quieto hasta que cargue, para no caer al vacio
        if (teleportEntity != null)
        {
            if (EffectActive("tp") && teleportEntity.Exists())
            {
                Function.Call(Hash.REQUEST_COLLISION_AT_COORD, teleportSpot.X, teleportSpot.Y, teleportSpot.Z);
            }
            else
            {
                if (teleportEntity.Exists()) Function.Call(Hash.FREEZE_ENTITY_POSITION, teleportEntity.Handle, false);
                teleportEntity = null;
            }
        }

        if (effects.ContainsKey("slowmo") && DateTime.UtcNow >= effects["slowmo"])
        {
            effects.Remove("slowmo");
            Game.TimeScale = 1f;
        }

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

    // ---------- entidades que aparecen (enemigos, aliados, vehiculos) ----------

    void Track(Entity entity, int lifetimeSeconds)
    {
        Spawned item = new Spawned();
        item.Entity = entity;
        item.Expires = DateTime.UtcNow.AddSeconds(lifetimeSeconds);
        spawned.Add(item);
    }

    // Lo que ya cumplio su tiempo se suelta (el juego lo retira solo) y si hay demasiado se borra lo mas viejo
    void CleanSpawned()
    {
        if (spawned.Count == 0) return;
        DateTime now = DateTime.UtcNow;
        for (int i = spawned.Count - 1; i >= 0; i--)
        {
            Entity entity = spawned[i].Entity;
            if (entity == null || !entity.Exists())
            {
                spawned.RemoveAt(i);
            }
            else if (now >= spawned[i].Expires)
            {
                entity.MarkAsNoLongerNeeded();
                spawned.RemoveAt(i);
            }
        }
        while (spawned.Count > 70)
        {
            Entity oldest = spawned[0].Entity;
            if (oldest != null && oldest.Exists()) oldest.Delete();
            spawned.RemoveAt(0);
        }
    }

    // Punto en el suelo a una distancia al azar del jugador
    Vector3 RingPosition(Vector3 center, float minRadius, float maxRadius)
    {
        double angle = random.NextDouble() * Math.PI * 2.0;
        float radius = minRadius + (float)random.NextDouble() * (maxRadius - minRadius);
        Vector3 point = new Vector3(center.X + (float)Math.Cos(angle) * radius, center.Y + (float)Math.Sin(angle) * radius, center.Z);
        float ground;
        if (World.GetGroundHeight(new Vector3(point.X, point.Y, center.Z + 30f), out ground, GetGroundHeightMode.Normal)) point.Z = ground;
        return point;
    }

    RelationshipGroup EnemyGroup()
    {
        if (!enemyGroupReady)
        {
            enemyGroup = World.AddRelationshipGroup("INTERAKTIK_ENEMIES");
            enemyGroupReady = true;
        }
        enemyGroup.SetRelationshipBetweenGroups(Game.Player.Character.RelationshipGroup, Relationship.Hate, true);
        return enemyGroup;
    }

    void SpawnSquad(Squad squad, int amount)
    {
        Ped player = Game.Player.Character;
        int count = Math.Max(1, Math.Min(amount, 15));
        int created = 0;

        for (int i = 0; i < count; i++)
        {
            PedHash model = squad.Models[random.Next(squad.Models.Length)];
            Vector3 position = squad.Allied ? RingPosition(player.Position, 3f, 6f) : RingPosition(player.Position, 14f, 26f);
            Ped npc = World.CreatePed(model, position, (float)(random.NextDouble() * 360.0));
            if (npc == null) continue;
            created += 1;

            if (squad.Weapons.Length > 0) npc.Weapons.Give(squad.Weapons[random.Next(squad.Weapons.Length)], 999, true, true);
            npc.Accuracy = squad.Accuracy;
            Function.Call(Hash.SET_PED_DROPS_WEAPONS_WHEN_DEAD, npc.Handle, false);
            Function.Call(Hash.SET_PED_COMBAT_ATTRIBUTES, npc.Handle, 46, true);
            Function.Call(Hash.SET_PED_COMBAT_ABILITY, npc.Handle, 2);
            npc.AlwaysKeepTask = true;
            npc.BlockPermanentEvents = true;

            if (squad.Allied)
            {
                npc.RelationshipGroup = player.RelationshipGroup;
                Function.Call(Hash.SET_PED_AS_GROUP_MEMBER, npc.Handle, Function.Call<int>(Hash.GET_PLAYER_GROUP, Game.Player.Handle));
                Track(npc, 600);
            }
            else
            {
                npc.RelationshipGroup = EnemyGroup();
                npc.Task.FightAgainst(player);
                Track(npc, 240);
            }
        }

        if (created == 0) throw new InvalidOperationException("no se pudo crear a ninguno (modelo no disponible)");
    }

    void EnemyTank()
    {
        Ped player = Game.Player.Character;
        Vector3 position = RingPosition(player.Position, 40f, 55f);
        Vehicle tank = World.CreateVehicle(VehicleHash.Rhino, position, (float)(random.NextDouble() * 360.0));
        if (tank == null) throw new InvalidOperationException("no se pudo crear el tanque");

        Ped driver = tank.CreatePedOnSeat(VehicleSeat.Driver, PedHash.Marine01SMY);
        if (driver == null) { tank.Delete(); throw new InvalidOperationException("no se pudo crear al conductor"); }

        driver.RelationshipGroup = EnemyGroup();
        driver.AlwaysKeepTask = true;
        driver.BlockPermanentEvents = true;
        Function.Call(Hash.SET_PED_COMBAT_ATTRIBUTES, driver.Handle, 46, true);
        Function.Call(Hash.SET_DRIVER_AGGRESSIVENESS, driver.Handle, 1.0f);
        driver.Task.VehicleChase(player);
        Track(tank, 240);
        Track(driver, 240);
    }

    void RainCarsOnPlayer(int amount)
    {
        Ped player = Game.Player.Character;
        int count = Math.Max(1, Math.Min(amount, 8));
        for (int i = 0; i < count; i++)
        {
            int index = i;
            After(i * 700, delegate
            {
                Ped p = Game.Player.Character;
                Vector3 above = p.Position + new Vector3((float)(random.NextDouble() * 12.0 - 6.0), (float)(random.NextDouble() * 12.0 - 6.0), 45f);
                Vehicle car = World.CreateVehicle(RainCars[random.Next(RainCars.Length)], above, (float)(random.NextDouble() * 360.0));
                if (car != null) Track(car, 90);
            });
        }
    }

    void Meteors(int amount)
    {
        int count = Math.Max(1, Math.Min(amount, 15));
        for (int i = 0; i < count; i++)
        {
            After(i * 350, delegate
            {
                Ped p = Game.Player.Character;
                Vector3 spot = RingPosition(p.Position, 3f, 15f);
                World.AddExplosion(spot, ExplosionType.Grenade, 1.2f, 0.5f);
            });
        }
    }

    // El vehiculo del jugador, o el mas cercano si va a pie
    Vehicle TargetVehicle(Ped ped)
    {
        Vehicle vehicle = ped.CurrentVehicle;
        if (vehicle == null || !vehicle.Exists()) vehicle = World.GetClosestVehicle(ped.Position, 20f);
        if (vehicle == null || !vehicle.Exists()) throw new InvalidOperationException("no hay ningun coche cerca");
        return vehicle;
    }

    void Execute(Job job)
    {
        Ped ped = Game.Player.Character;

        Car car;
        if (Cars.TryGetValue(job.Action, out car))
        {
            SpawnVehicle(car.Hash, car.Distance);
            return;
        }

        Squad squad;
        if (Squads.TryGetValue(job.Action, out squad))
        {
            SpawnSquad(squad, job.Amount);
            return;
        }

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
                    foreach (Vehicle nearby in cars) Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, nearby.Handle, true);
                    After(30000, delegate
                    {
                        foreach (Vehicle nearby in cars)
                        {
                            if (nearby != null && nearby.Exists()) Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, nearby.Handle, false);
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

            case "enemy_tank":
                EnemyTank();
                break;

            case "car_rain":
                RainCarsOnPlayer(job.Amount);
                break;

            case "meteors":
                Meteors(job.Amount);
                break;

            case "launch":
                {
                    Entity target = ped.IsInVehicle() ? (Entity)ped.CurrentVehicle : ped;
                    if (!ped.IsInVehicle()) ped.Ragdoll(2500, RagdollType.Relax);
                    float lift = 7f + Math.Max(1, job.Amount) * 2.5f;
                    Function.Call(Hash.SET_ENTITY_VELOCITY, target.Handle, (float)(random.NextDouble() * 8.0 - 4.0), (float)(random.NextDouble() * 8.0 - 4.0), lift);
                }
                break;

            case "freeze":
                {
                    Entity target = ped.IsInVehicle() ? (Entity)ped.CurrentVehicle : ped;
                    Function.Call(Hash.FREEZE_ENTITY_POSITION, target.Handle, true);
                    After(5000, delegate
                    {
                        if (target.Exists()) Function.Call(Hash.FREEZE_ENTITY_POSITION, target.Handle, false);
                    });
                }
                break;

            case "blackout":
                Function.Call(Hash.SET_ARTIFICIAL_LIGHTS_STATE, true);
                After(20000, delegate { Function.Call(Hash.SET_ARTIFICIAL_LIGHTS_STATE, false); });
                break;

            case "night":
                Function.Call(Hash.SET_CLOCK_TIME, 23, 30, 0);
                break;

            case "day":
                Function.Call(Hash.SET_CLOCK_TIME, 12, 0, 0);
                break;

            case "burst_tires":
                {
                    Vehicle vehicle = TargetVehicle(ped);
                    for (int wheel = 0; wheel < 8; wheel++) Function.Call(Hash.SET_VEHICLE_TYRE_BURST, vehicle.Handle, wheel, true, 1000.0f);
                }
                break;

            case "blow_car":
                TargetVehicle(ped).Explode();
                break;

            case "repair_car":
                TargetVehicle(ped).Repair();
                break;

            case "turbo":
                {
                    Vehicle vehicle = ped.CurrentVehicle;
                    if (vehicle == null || !vehicle.Exists()) throw new InvalidOperationException("no va en un vehiculo");
                    vehicle.ForwardSpeed = Math.Min(80f, vehicle.Speed + 35f);
                }
                break;

            case "tp_random":
                {
                    Vector3 spot = FarAway[random.Next(FarAway.Length)];
                    Entity target = ped.IsInVehicle() ? (Entity)ped.CurrentVehicle : ped;
                    Function.Call(Hash.SET_ENTITY_COORDS, target.Handle, spot.X, spot.Y, spot.Z + 2f, false, false, false, true);
                    Function.Call(Hash.FREEZE_ENTITY_POSITION, target.Handle, true);
                    teleportEntity = target;
                    teleportSpot = spot;
                    StartEffect("tp", 3);
                }
                break;

            case "lose_cash":
                Game.Player.Money = Math.Max(0, Game.Player.Money - Math.Max(1, job.Amount));
                break;

            case "give_money":
                Game.Player.Money = Game.Player.Money + Math.Max(1, job.Amount);
                break;

            case "slowmo":
                Game.TimeScale = 0.3f;
                StartEffect("slowmo", 10);
                break;

            default:
                throw new InvalidOperationException("accion desconocida: " + job.Action);
        }
    }
}

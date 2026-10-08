// Interaktik "Rampa" para GTA V - mod de ScriptHookVDotNet (v3).
//
// El jugador aparece en un mapa aparte: una plataforma de containers suspendida en el cielo (sobre el mar, lejos de
// todo), con un container plano de inicio y una rampa de containers pegada. Tiene que subir la rampa mientras los
// regalos de TikTok hacen caer carros, camiones y objetos desde lo alto. Si se cae, vuelve al inicio (no puede morir);
// si llega arriba suma 1 win. Durante la partida no hay trafico, ni policia, ni misiones, ni llamadas.
//
// Se conecta a la plataforma por WebSocket (<url>/gtaramp-bridge/<llave>) igual que el mod de modo historia, pero es
// un mod aparte: solo actua cuando la pagina del juego manda "iniciar".
//
// Configuracion en scripts\InteraktikRampa.ini (se escribe sola con el instalador de Windows).
// Compilacion: ver gta-ramp-mod/build.cmd

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
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

public class InteraktikRampa : Script
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

    class Tracked
    {
        public Entity Entity;
        public DateTime Born = DateTime.UtcNow;
        public int LifeSeconds;
        public bool IsVehicle;
    }

    // Lo que puede caer: candidatos de modelos (se usa el primero que exista en esta version del juego)
    class Spawner
    {
        public bool Vehicle;
        public string[] Models;
        public float Speed;     // velocidad inicial cuesta abajo (m/s)
        public float Lift;      // altura extra sobre el punto de aparicion
        public int Life;        // segundos antes de borrarlo
        public Spawner(bool vehicle, float speed, float lift, int life, params string[] models)
        {
            Vehicle = vehicle; Models = models; Speed = speed; Lift = lift; Life = life;
        }
    }

    enum Mode { Off, Loading, Playing, Won }

    const string DefaultUrl = "https://interaktik-platform-production.up.railway.app";
    const int MaxJobAgeSeconds = 60;
    const int MaxVehicles = 14;
    const int MaxProps = 90;

    // ----- configuracion (InteraktikRampa.ini)
    string key = "";
    string url = DefaultUrl;
    float rampAngle = 14f;       // grados de inclinacion de la rampa
    int segments = 13;           // containers de largo de la rampa (RampLength)
    int walkColumns = 6;         // containers de ancho de la parte por donde se camina (RampWidth)
    float pushAccel = 11f;       // empuje extra cuesta abajo para lo que cae (m/s2), PushAccel
    float pushMinSpeed = 7f;     // velocidad minima cuesta abajo mientras esta sobre la rampa (m/s), PushSpeed
    bool blockPhoneScripts = true; // apaga el script del celular durante la partida (BlockPhone)
    bool flipPitch;              // por si en tu juego la rampa baja en vez de subir
    Vector3 origin = new Vector3(-3000f, 500f, 650f); // esquina del frente de la rampa (arriba del mar)

    // ----- red (hilo aparte)
    readonly ConcurrentQueue<Job> inbox = new ConcurrentQueue<Job>();
    readonly ConcurrentQueue<string> commands = new ConcurrentQueue<string>();
    readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly CancellationTokenSource cancel = new CancellationTokenSource();
    volatile bool connectedNotice;
    volatile string pendingMessage;
    volatile bool paused;
    volatile int cfgGoal = 10;
    volatile int cfgWins = 0;
    volatile bool lastCloseWas4000;
    ClientWebSocket current;

    // ----- estado del juego
    readonly Random random = new Random();
    readonly List<Delayed> delayed = new List<Delayed>();
    readonly List<Prop> buildings = new List<Prop>();
    readonly List<Tracked> tracked = new List<Tracked>();
    Mode mode = Mode.Off;
    DateTime modeSince = DateTime.UtcNow;
    Vector3 previousPosition;
    float previousHeading;
    bool hasPrevious;
    bool built;
    Vector3 startSpot;
    Vector3 spawnSpot;
    Vector3 winSpot;
    float zStart, zTop, rampBaseY, rampEndY, halfWidth, walkHalf;
    float wallLeanDeg = 14f;     // cuanto se abren las paredes hacia afuera
    float tanAngle, sinAngle, cosAngle, spawnDistance;
    DateTime lastClean = DateTime.UtcNow;
    DateTime lastFallNotice = DateTime.MinValue;
    string flash = "";
    DateTime flashUntil = DateTime.MinValue;

    static readonly Dictionary<string, Spawner> Spawners = BuildSpawners();

    static Dictionary<string, Spawner> BuildSpawners()
    {
        Dictionary<string, Spawner> s = new Dictionary<string, Spawner>();
        // ---- vehiculos
        s["ramp_car_small"] = new Spawner(true, 5f, 1.2f, 40, "blista", "panto", "issi2", "prairie");
        s["ramp_car_sport"] = new Spawner(true, 7f, 1.2f, 40, "zentorno", "adder", "t20", "osiris", "entityxf");
        s["ramp_car_muscle"] = new Spawner(true, 6f, 1.2f, 40, "dukes", "gauntlet", "ruiner", "sabregt");
        s["ramp_suv"] = new Spawner(true, 5f, 1.4f, 40, "baller", "granger", "landstalker", "cavalcade");
        s["ramp_van"] = new Spawner(true, 5f, 1.6f, 40, "speedo", "burrito", "rumpo", "bobcatxl");
        s["ramp_bus"] = new Spawner(true, 4f, 2.2f, 50, "bus", "coach", "airbus");
        s["ramp_truck"] = new Spawner(true, 5f, 2.0f, 50, "mule", "pounder", "benson", "boxville");
        s["ramp_hauler"] = new Spawner(true, 5f, 2.2f, 50, "hauler", "phantom", "packer");
        s["ramp_dump"] = new Spawner(true, 4f, 2.6f, 55, "dump", "rubble", "tiptruck");
        s["ramp_mixer"] = new Spawner(true, 4f, 2.2f, 50, "mixer", "mixer2");
        s["ramp_garbage"] = new Spawner(true, 5f, 2.0f, 45, "trash", "trash2");
        s["ramp_firetruck"] = new Spawner(true, 5f, 2.0f, 45, "firetruk");
        s["ramp_tractor"] = new Spawner(true, 4f, 1.6f, 40, "tractor", "tractor2");
        s["ramp_forklift"] = new Spawner(true, 4f, 1.4f, 40, "forklift");
        s["ramp_bulldozer"] = new Spawner(true, 3f, 2.4f, 50, "bulldozer");
        s["ramp_monster"] = new Spawner(true, 5f, 2.6f, 45, "monster", "bfinjection");
        s["ramp_tank"] = new Spawner(true, 3f, 2.4f, 55, "rhino");
        s["ramp_limo"] = new Spawner(true, 5f, 1.4f, 40, "stretch", "limo2");
        s["ramp_bike"] = new Spawner(true, 6f, 1.0f, 35, "bati", "akuma", "sanchez");
        // ---- objetos que ruedan o caen
        s["ramp_barrels"] = new Spawner(false, 4f, 1.2f, 30, "prop_barrel_01a", "prop_barrel_02a", "prop_barrel_03a");
        s["ramp_explosive_barrels"] = new Spawner(false, 4f, 1.2f, 30, "prop_barrel_exp_01a", "prop_gascyl_01a");
        s["ramp_dumpsters"] = new Spawner(false, 3f, 1.6f, 35, "prop_dumpster_01a", "prop_dumpster_02a", "prop_dumpster_3a");
        s["ramp_crates"] = new Spawner(false, 3f, 1.4f, 30, "prop_crate_11e", "prop_box_wood02a_pu", "prop_box_wood05a");
        s["ramp_boulders"] = new Spawner(false, 3f, 1.8f, 35, "prop_rock_4_c", "prop_rock_1_a", "prop_rock_2_a");
        s["ramp_fridges"] = new Spawner(false, 3f, 1.6f, 30, "prop_vend_soda_01", "prop_vend_soda_02", "prop_fridge_03");
        s["ramp_hay"] = new Spawner(false, 3f, 1.4f, 30, "prop_haybale_01", "prop_haybale_02");
        s["ramp_cones"] = new Spawner(false, 3f, 1.0f, 25, "prop_roadcone02a", "prop_mp_cone_02");
        return s;
    }

    public InteraktikRampa()
    {
        // Sin esto la conexion segura (wss) falla en .NET Framework: solo hablaria TLS 1.0
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;

        LoadConfig();
        Tick += OnTick;
        KeyDown += OnKeyDown;
        Aborted += OnAborted;
        Interval = 0;

        if (key.Length == 0)
        {
            Log("No hay llave: instala el mod con el instalador de Interaktik (o escribe Key= en InteraktikRampa.ini).");
            pendingMessage = "Interaktik Rampa: falta la llave. Usa el instalador de Interaktik.";
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

    static float ParseFloat(string text, float fallback)
    {
        float value;
        return float.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out value) ? value : fallback;
    }

    void LoadConfig()
    {
        try
        {
            string path = Path.Combine(ScriptsFolder(), "InteraktikRampa.ini");
            if (!File.Exists(path)) return;

            float ox = origin.X, oy = origin.Y, oz = origin.Z;
            foreach (string raw in File.ReadAllLines(path))
            {
                string line = raw.Trim();
                int eq = line.IndexOf('=');
                if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#") || eq <= 0) continue;

                string name = line.Substring(0, eq).Trim().ToLowerInvariant();
                string value = line.Substring(eq + 1).Trim();
                if (name == "key") key = value;
                else if (name == "url" && value.Length > 0) url = value;
                else if (name == "rampangle") rampAngle = Math.Max(5f, Math.Min(30f, ParseFloat(value, rampAngle)));
                else if (name == "ramplength") segments = Math.Max(4, Math.Min(30, (int)ParseFloat(value, segments)));
                else if (name == "rampwidth") walkColumns = Math.Max(2, Math.Min(12, (int)ParseFloat(value, walkColumns)));
                else if (name == "pushaccel") pushAccel = Math.Max(0f, Math.Min(40f, ParseFloat(value, pushAccel)));
                else if (name == "pushspeed") pushMinSpeed = Math.Max(0f, Math.Min(40f, ParseFloat(value, pushMinSpeed)));
                else if (name == "blockphone") blockPhoneScripts = !(value.ToLowerInvariant() == "false" || value == "0");
                else if (name == "flippitch") flipPitch = value.ToLowerInvariant() == "true" || value == "1";
                else if (name == "originx") ox = ParseFloat(value, ox);
                else if (name == "originy") oy = ParseFloat(value, oy);
                else if (name == "originz") oz = ParseFloat(value, oz);
            }
            origin = new Vector3(ox, oy, oz);
        }
        catch (Exception ex)
        {
            Log("No se pudo leer la configuracion: " + ex.Message);
        }
    }

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
            File.AppendAllText(Path.Combine(ScriptsFolder(), "InteraktikRampa.log"), "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + text + Environment.NewLine);
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
        try { EndGame(false); } catch (Exception) { }
    }

    // ================= red =================

    Uri BuildUri()
    {
        string baseUrl = url.Trim().TrimEnd('/');
        if (baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) baseUrl = "wss://" + baseUrl.Substring(8);
        else if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) baseUrl = "ws://" + baseUrl.Substring(7);
        return new Uri(baseUrl + "/gtaramp-bridge/" + key.Trim());
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
            pendingMessage = "Interaktik Rampa: la llave no es valida. Vuelve a ejecutar el instalador.";
            Log("Cierre 4004: llave no valida.");
            return true;
        }
        if (code == 4003)
        {
            pendingMessage = "Interaktik Rampa: tu prueba o plan vencio.";
            Log("Cierre 4003: plan vencido.");
            return true;
        }
        if (code == 4001)
        {
            pendingMessage = "Interaktik Rampa: la llave fue regenerada. Vuelve a ejecutar el instalador.";
            Log("Cierre 4001: llave regenerada.");
            return true;
        }
        if (code == 4000)
        {
            lastCloseWas4000 = true;
            Log("Cierre 4000: reemplazada por otra conexion. Reintento en 20 s.");
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
        else if (type == "config")
        {
            if (message.ContainsKey("goal")) cfgGoal = Convert.ToInt32(message["goal"]);
            if (message.ContainsKey("wins")) cfgWins = Convert.ToInt32(message["wins"]);
        }
        else if (type == "command" && message.ContainsKey("cmd"))
        {
            commands.Enqueue(Convert.ToString(message["cmd"]));
        }
        else if (type == "spawn" && message.ContainsKey("action"))
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
            await Send(socket, "{\"type\":\"status\",\"gameRunning\":true,\"gameFocused\":" + (paused ? "false" : "true") + ",\"active\":" + (mode == Mode.Playing ? "true" : "false") + "}");
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

    void SendNow(string body)
    {
        ClientWebSocket socket = current;
        Task.Run(delegate { return Send(socket, body); });
    }

    void Report(Job job, bool ok, string reason)
    {
        SendNow("{\"type\":\"result\",\"id\":" + job.Id + ",\"ok\":" + (ok ? "true" : "false") + ",\"reason\":" + json.Serialize(reason ?? "") + "}");
    }

    // ================= bucle del juego (siempre en el hilo del script) =================

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
                Screen.ShowSubtitle("Interaktik Rampa conectado", 3000);
            }

            string command;
            while (commands.TryDequeue(out command)) HandleCommand(command);

            RunDelayed();
            TickRestorePhone();

            if (mode == Mode.Loading) TickLoading();
            else if (mode == Mode.Playing) TickPlaying();
            else if (mode == Mode.Won) TickWon();

            if (mode != Mode.Off) DrawHud();
        }
        catch (Exception ex)
        {
            LogThrottled("tick", "Error en el tick: " + ex);
        }
    }

    // F8: iniciar o terminar la partida sin salir del juego
    void OnKeyDown(object sender, System.Windows.Forms.KeyEventArgs e)
    {
        if (e.KeyCode == System.Windows.Forms.Keys.F8) commands.Enqueue(mode == Mode.Off ? "start" : "stop");
    }

    void HandleCommand(string command)
    {
        command = (command ?? "").Trim().ToLowerInvariant();
        Log("Orden recibida: " + command);
        if (command == "start")
        {
            if (mode == Mode.Off) BeginGame();
            else if (mode == Mode.Playing) RespawnAtStart("Reiniciada la partida");
        }
        else if (command == "reset")
        {
            if (mode == Mode.Playing) { ClearSpawned(); RespawnAtStart("Partida reiniciada"); }
        }
        else if (command == "stop")
        {
            if (mode != Mode.Off) EndGame(true);
        }
    }

    void SetMode(Mode next)
    {
        mode = next;
        modeSince = DateTime.UtcNow;
    }

    static bool CanRun()
    {
        if (Game.IsPaused) return false;
        if (Function.Call<bool>(Hash.GET_IS_LOADING_SCREEN_ACTIVE)) return false;
        if (Function.Call<bool>(Hash.IS_CUTSCENE_ACTIVE)) return false;
        Ped ped = Game.Player.Character;
        return ped != null && ped.Exists();
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
        for (int i = delayed.Count - 1; i >= 0; i--)
        {
            if (DateTime.UtcNow < delayed[i].At) continue;
            Action run = delayed[i].Run;
            delayed.RemoveAt(i);
            try { run(); } catch (Exception ex) { LogThrottled("delayed", "Error en una accion diferida: " + ex.Message); }
        }
    }

    void Flash(string text, int milliseconds)
    {
        flash = text;
        flashUntil = DateTime.UtcNow.AddMilliseconds(milliseconds);
    }

    // ================= inicio y fin de la partida =================

    void BeginGame()
    {
        if (!CanRun()) { pendingMessage = "Interaktik Rampa: espera a que termine la pantalla de carga."; return; }
        Ped ped = Game.Player.Character;
        if (ped.IsInVehicle()) ped.Task.LeaveVehicle(ped.CurrentVehicle, true);

        previousPosition = ped.Position;
        previousHeading = ped.Heading;
        hasPrevious = true;

        SetMode(Mode.Loading);
        built = false;
        Screen.FadeOut(400);
        Log("Cargando el mapa de containers en " + origin.X + ", " + origin.Y + ", " + origin.Z);
    }

    // Fase de carga: se lleva al jugador a la zona vacia, se construye todo y se espera a que la colision este lista
    void TickLoading()
    {
        double elapsed = (DateTime.UtcNow - modeSince).TotalSeconds;
        Ped ped = Game.Player.Character;

        if (elapsed < 0.6) return; // la pantalla termina de oscurecerse

        if (!built)
        {
            // a la zona vacia, quieto, para que el juego cargue la colision de lo que se construye alli
            ped.Position = new Vector3(origin.X, origin.Y - 4f, origin.Z + 3f);
            ped.IsPositionFrozen = true;
            ped.Velocity = Vector3.Zero;
            Function.Call(Hash.NEW_LOAD_SCENE_START_SPHERE, origin.X, origin.Y, origin.Z, 250f, 0);
            try
            {
                BuildArena();
                built = true;
                Log("Arena construida: " + buildings.Count + " containers.");
            }
            catch (Exception ex)
            {
                Log("No se pudo construir la arena: " + ex);
                pendingMessage = "Interaktik Rampa: no se pudo construir el mapa (mira InteraktikRampa.log).";
                EndGame(true);
            }
            return;
        }

        Function.Call(Hash.REQUEST_COLLISION_AT_COORD, startSpot.X, startSpot.Y, startSpot.Z);
        bool ready = Function.Call<bool>(Hash.HAS_COLLISION_LOADED_AROUND_ENTITY, ped);
        if ((ready && elapsed > 2.5) || elapsed > 9.0)
        {
            Function.Call(Hash.NEW_LOAD_SCENE_STOP);
            ped.IsPositionFrozen = false;
            PlaceOnStart(ped);
            SetMode(Mode.Playing);
            Screen.FadeIn(500);
            Flash("¡Sube la rampa!", 3000);
        }
    }

    void PlaceOnStart(Ped ped)
    {
        ped.Position = startSpot;
        ped.Heading = 0f; // mira hacia la rampa (norte)
        ped.Velocity = Vector3.Zero;
        Function.Call(Hash.SET_ENTITY_COORDS_NO_OFFSET, ped, startSpot.X, startSpot.Y, startSpot.Z, false, false, false);
        if (!ped.IsAlive) ped.Resurrect();
        ped.Health = ped.MaxHealth;
    }

    void EndGame(bool restorePlayer)
    {
        ClearSpawned();
        foreach (Prop prop in buildings)
        {
            try { if (prop != null && prop.Exists()) prop.Delete(); } catch (Exception) { }
        }
        buildings.Clear();
        built = false;
        delayed.Clear();

        Ped ped = null;
        try { ped = Game.Player.Character; } catch (Exception) { }
        try
        {
            Game.Player.IsInvincible = false;
            if (ped != null && ped.Exists())
            {
                ped.IsPositionFrozen = false;
                Function.Call(Hash.SET_PED_CAN_RAGDOLL, ped, true);
            }
            Function.Call(Hash.SET_CREATE_RANDOM_COPS, true);
            Function.Call(Hash.SET_RANDOM_EVENT_FLAG, true);
            Function.Call(Hash.NEW_LOAD_SCENE_STOP);
            if (restorePlayer && hasPrevious && ped != null && ped.Exists())
            {
                ped.Position = previousPosition;
                ped.Heading = previousHeading;
                ped.Velocity = Vector3.Zero;
            }
        }
        catch (Exception ex)
        {
            Log("Error al terminar la partida: " + ex.Message);
        }

        RestorePhone();
        SetMode(Mode.Off);
        if (restorePlayer)
        {
            Screen.FadeIn(400);
            Screen.ShowSubtitle("Interaktik Rampa: partida terminada", 3000);
        }
    }

    // ================= construccion del mapa de containers =================

    Model PickModel(string[] names)
    {
        foreach (string name in names)
        {
            Model model = new Model(name);
            if (model.IsInCdImage && model.IsValid) return model;
        }
        return new Model();
    }

    // Se crea el container en un sitio provisional, se le da la inclinacion y se corrige la posicion para que su CENTRO
    // quede donde se quiere (asi no importa donde este el origen del modelo).
    Prop PlaceContainer(Model model, Vector3 localCenter, bool longAxisY, Vector3 desiredCenter, float pitchDeg)
    {
        float p = flipPitch ? -pitchDeg : pitchDeg;
        Vector3 rotation = longAxisY ? new Vector3(p, 0f, 0f) : new Vector3(0f, -p, 90f);
        Prop prop = World.CreateProp(model, desiredCenter, rotation, false, false);
        if (prop == null) throw new InvalidOperationException("no se pudo crear un container");
        prop.Rotation = rotation;
        Vector3 center = prop.GetOffsetPosition(localCenter);
        prop.Position = prop.Position + (desiredCenter - center);
        prop.IsPositionFrozen = true;
        prop.IsPersistent = true;
        buildings.Add(prop);
        return prop;
    }

    // Pared que se abre hacia afuera: se inclina sobre su eje largo, con el signo comprobado midiendo hacia donde queda
    // su parte de arriba (asi no depende de convenciones de rotacion). side: -1 = izquierda, 1 = derecha.
    Prop PlaceWall(Model model, Vector3 localCenter, bool longAxisY, Vector3 desiredCenter, float pitchDeg, int side, float height)
    {
        Prop prop = PlaceContainer(model, localCenter, longAxisY, desiredCenter, pitchDeg);
        try
        {
            Quaternion q0 = prop.Quaternion;
            Vector3 axis = longAxisY ? new Vector3(0f, 1f, 0f) : new Vector3(1f, 0f, 0f);
            float roll = wallLeanDeg * (float)Math.PI / 180f;

            for (int attempt = 0; attempt < 2; attempt++)
            {
                float signed = attempt == 0 ? roll : -roll;
                prop.Quaternion = q0 * Quaternion.RotationAxis(axis, signed);
                Vector3 top = prop.GetOffsetPosition(new Vector3(localCenter.X, localCenter.Y, localCenter.Z + height * 0.5f));
                Vector3 bottom = prop.GetOffsetPosition(new Vector3(localCenter.X, localCenter.Y, localCenter.Z - height * 0.5f));
                if ((top.X - bottom.X) * side > 0f) break; // la parte de arriba queda hacia afuera
            }

            // el centro vuelve a su sitio y se desplaza hacia afuera lo que se abre la base, para no invadir la rampa
            Vector3 center = prop.GetOffsetPosition(localCenter);
            float outward = side * (height * 0.5f * (float)Math.Sin(roll) + 0.15f);
            prop.Position = prop.Position + (desiredCenter - center) + new Vector3(outward, 0f, 0f);
            prop.IsPositionFrozen = true;
        }
        catch (Exception ex)
        {
            LogThrottled("wall", "No se pudo inclinar una pared (queda recta): " + ex.Message);
        }
        return prop;
    }

    void BuildArena()
    {
        Model container = PickModel(new string[] { "prop_container_ld", "prop_container_01a", "prop_container_01b", "prop_contr_03b_ld" });
        if (!container.IsValid) throw new InvalidOperationException("este GTA V no tiene modelos de container");
        if (!container.Request(5000)) throw new InvalidOperationException("no cargo el modelo del container");

        Vector3 min, max;
        container.GetDimensions(out min, out max);
        float dx = max.X - min.X, dy = max.Y - min.Y, dz = max.Z - min.Z;
        bool longAxisY = dy >= dx;
        float length = longAxisY ? dy : dx;
        float width = longAxisY ? dx : dy;
        float height = dz;
        Vector3 localCenter = new Vector3((min.X + max.X) / 2f, (min.Y + max.Y) / 2f, (min.Z + max.Z) / 2f);
        Log("Container " + container.Hash + ": largo " + length + ", ancho " + width + ", alto " + height + " (eje largo " + (longAxisY ? "Y" : "X") + ")");

        double theta = rampAngle * Math.PI / 180.0;
        float cos = (float)Math.Cos(theta), sin = (float)Math.Sin(theta);
        tanAngle = sin / cos;
        sinAngle = sin;
        cosAngle = cos;
        Vector3 dir = new Vector3(0f, cos, sin);           // a lo largo de la rampa (hacia arriba)
        Vector3 normal = new Vector3(0f, -sin, cos);       // perpendicular a la superficie
        int columns = walkColumns + 2;   // las de caminar + 1 de pared a cada lado
        float[] lateral = new float[columns];
        for (int c = 0; c < columns; c++) lateral[c] = (c - (columns - 1) / 2f) * width;
        halfWidth = columns * width / 2f;
        walkHalf = (columns - 2) * width / 2f;

        zStart = origin.Z;
        rampBaseY = origin.Y;

        // 1) container(es) planos de inicio, antes de la rampa
        for (int c = 0; c < columns; c++)
        {
            Vector3 center = new Vector3(origin.X + lateral[c], origin.Y - length * 0.5f, zStart - height * 0.5f);
            PlaceContainer(container, localCenter, longAxisY, center, 0f);
        }
        startSpot = new Vector3(origin.X, origin.Y - length * 0.5f, zStart + 1.0f);

        // 2) la rampa: cada segmento sigue la misma recta; los de los costados llevan una pared encima
        Vector3 rampStart = new Vector3(origin.X, origin.Y, zStart);
        for (int i = 0; i < segments; i++)
        {
            Vector3 topCenter = rampStart + dir * (length * (i + 0.5f));
            for (int c = 0; c < columns; c++)
            {
                Vector3 lat = new Vector3(lateral[c], 0f, 0f);
                PlaceContainer(container, localCenter, longAxisY, topCenter - normal * (height * 0.5f) + lat, rampAngle);
                if (c == 0 || c == columns - 1)
                {
                    PlaceWall(container, localCenter, longAxisY, topCenter + normal * (height * 0.5f) + lat, rampAngle, c == 0 ? -1 : 1, height);
                }
            }
        }

        // 3) plataforma de arriba (plana), con paredes a los lados y un muro al fondo
        Vector3 end = rampStart + dir * (length * segments);
        zTop = end.Z;
        rampEndY = end.Y;
        for (int row = 0; row < 2; row++)
        {
            for (int c = 0; c < columns; c++)
            {
                Vector3 center = new Vector3(origin.X + lateral[c], end.Y + length * (row + 0.5f), zTop - height * 0.5f);
                PlaceContainer(container, localCenter, longAxisY, center, 0f);
                if (c == 0 || c == columns - 1)
                {
                    PlaceWall(container, localCenter, longAxisY, new Vector3(center.X, center.Y, zTop + height * 0.5f), 0f, c == 0 ? -1 : 1, height);
                }
            }
        }
        for (int c = 0; c < columns; c++)
        {
            float cy = end.Y + length * 2.5f;
            PlaceContainer(container, localCenter, longAxisY, new Vector3(origin.X + lateral[c], cy, zTop - height * 0.5f), 0f);
            PlaceContainer(container, localCenter, longAxisY, new Vector3(origin.X + lateral[c], cy, zTop + height * 0.5f), 0f);
            PlaceContainer(container, localCenter, longAxisY, new Vector3(origin.X + lateral[c], cy, zTop + height * 1.5f), 0f);
        }

        // Lo que cae aparece sobre la pendiente, unos metros antes del final de la rampa, para que ruede cuesta abajo
        spawnDistance = Math.Min(length * 0.6f, 4.5f);
        spawnSpot = new Vector3(origin.X, end.Y - spawnDistance * cos, zTop - spawnDistance * sin);
        winSpot = new Vector3(origin.X, end.Y + length * 1.0f, zTop);
        container.MarkAsNoLongerNeeded();
    }

    // Altura de la superficie por la que se camina en la coordenada Y indicada
    float SurfaceZ(float y)
    {
        if (y <= rampBaseY) return zStart;
        if (y >= rampEndY) return zTop;
        return zStart + (y - rampBaseY) * tanAngle;
    }

    // ================= partida =================

    void TickPlaying()
    {
        if (!CanRun()) return;
        Ped ped = Game.Player.Character;
        KeepWorldQuiet(ped);

        // el jugador no puede morir
        if (!ped.IsAlive)
        {
            ped.Resurrect();
            RespawnAtStart("Vuelves al inicio");
            return;
        }

        Vector3 pos = ped.Position;
        float surface = SurfaceZ(pos.Y);
        bool fell = pos.Z < surface - 4.0f || pos.Z < zStart - 6.0f || Math.Abs(pos.X - origin.X) > halfWidth + 6f || pos.Y < rampBaseY - 14f
                    || pos.Y > rampEndY + 40f || ped.IsInWater;
        if (fell)
        {
            RespawnAtStart("¡Te caíste! Vuelves al inicio");
            return;
        }

        // llego arriba: gana
        if (pos.Y >= winSpot.Y && pos.Z >= zTop - 1.2f && Math.Abs(pos.X - origin.X) < halfWidth)
        {
            Win();
            return;
        }

        ProcessInbox();
        PushDownhill();
        CleanSpawned();
    }

    // Los vehiculos y objetos no se deslizan solos por una pendiente tan suave: mientras estan sobre la rampa se les da un
    // empuje extra cuesta abajo (como si la gravedad fuera mayor) hasta que lleven una velocidad minima.
    void PushDownhill()
    {
        float dt = Game.LastFrameTime;
        if (dt <= 0f || dt > 0.2f) dt = 0.016f;
        Vector3 down = new Vector3(0f, -cosAngle, -sinAngle);
        foreach (Tracked t in tracked)
        {
            Entity e = t.Entity;
            if (e == null || !e.Exists()) continue;
            Vector3 p = e.Position;
            if (p.Y > rampEndY + 3f || p.Y < rampBaseY - 3f) continue;
            float surface = SurfaceZ(p.Y);
            if (p.Z < surface - 2.5f || p.Z > surface + 14f) continue;
            Vector3 v = e.Velocity;
            float along = Vector3.Dot(v, down);
            if (along < pushMinSpeed) e.Velocity = v + down * (pushAccel * dt);
        }
    }

    void KeepWorldQuiet(Ped ped)
    {
        Player player = Game.Player;
        player.IsInvincible = true;
        ped.IsInvincible = true;
        Game.MaxWantedLevel = 0;
        if (player.WantedLevel != 0) player.WantedLevel = 0;

        // nada de trafico, peatones ni eventos
        Function.Call(Hash.SET_PED_DENSITY_MULTIPLIER_THIS_FRAME, 0f);
        Function.Call(Hash.SET_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME, 0f);
        Function.Call(Hash.SET_RANDOM_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME, 0f);
        Function.Call(Hash.SET_PARKED_VEHICLE_DENSITY_MULTIPLIER_THIS_FRAME, 0f);
        Function.Call(Hash.SET_SCENARIO_PED_DENSITY_MULTIPLIER_THIS_FRAME, 0f, 0f);
        Function.Call(Hash.SET_CREATE_RANDOM_COPS, false);
        Function.Call(Hash.SET_RANDOM_EVENT_FLAG, false);

        // sin celular, llamadas, cambio de personaje ni misiones que interrumpan
        foreach (int control in PhoneAndSwitchControls) Function.Call(Hash.DISABLE_CONTROL_ACTION, 0, control, true);
        if (Function.Call<bool>(Hash.IS_MOBILE_PHONE_CALL_ONGOING) || Function.Call<bool>(Hash.IS_SCRIPTED_CONVERSATION_ONGOING))
        {
            Function.Call(Hash.STOP_SCRIPTED_CONVERSATION, false);
            Function.Call(Hash.STOP_SCRIPTED_CONVERSATION, true);
            Function.Call(Hash.CLEAR_PRINTS);
            Function.Call(Hash.CLEAR_HELP, true);
        }
        Function.Call(Hash.DESTROY_MOBILE_PHONE);
        Function.Call(Hash.CELL_CAM_ACTIVATE, false, false);
        if (blockPhoneScripts) SilencePhone();

        // no se puede subir a los vehiculos que caen
        Function.Call(Hash.DISABLE_CONTROL_ACTION, 0, 23, true);   // entrar a un vehiculo
        Function.Call(Hash.DISABLE_CONTROL_ACTION, 0, 75, true);   // salir/entrar

        if (ped.IsInVehicle()) ped.Task.LeaveVehicle(ped.CurrentVehicle, true);
        if (ped.IsRagdoll && (DateTime.UtcNow - lastFallNotice).TotalSeconds > 3) { /* se levanta solo */ }
    }

    const string PhoneScript = "cellphone_controller";
    bool phoneKilled;
    DateTime lastPhoneCheck = DateTime.MinValue;
    DateTime restorePhoneAt = DateTime.MinValue;

    // El script "cellphone_controller" es el que hace sonar el celular y muestra las llamadas de la historia. Se apaga mientras
    // dura la partida (se vigila cada segundo por si el juego lo reinicia) y se vuelve a encender al terminar.
    void SilencePhone()
    {
        if ((DateTime.UtcNow - lastPhoneCheck).TotalSeconds < 1.0) return;
        lastPhoneCheck = DateTime.UtcNow;
        int hash = Game.GenerateHash(PhoneScript);
        if (Function.Call<int>(Hash.GET_NUMBER_OF_THREADS_RUNNING_THE_SCRIPT_WITH_THIS_HASH, hash) > 0)
        {
            Function.Call(Hash.TERMINATE_ALL_SCRIPTS_WITH_THIS_NAME, PhoneScript);
            if (!phoneKilled) Log("Celular apagado durante la partida.");
        }
        phoneKilled = true;
    }

    void RestorePhone()
    {
        if (!phoneKilled) return;
        phoneKilled = false;
        try
        {
            if (Function.Call<int>(Hash.GET_NUMBER_OF_THREADS_RUNNING_THE_SCRIPT_WITH_THIS_HASH, Game.GenerateHash(PhoneScript)) > 0) return;
            Function.Call(Hash.REQUEST_SCRIPT, PhoneScript);
            restorePhoneAt = DateTime.UtcNow.AddMilliseconds(250);
            Log("Celular: se vuelve a encender.");
        }
        catch (Exception ex)
        {
            Log("No se pudo pedir el script del celular: " + ex.Message);
        }
    }

    // El script se pide al terminar y se arranca cuando ya cargo
    void TickRestorePhone()
    {
        if (restorePhoneAt == DateTime.MinValue || DateTime.UtcNow < restorePhoneAt) return;
        if (Function.Call<bool>(Hash.HAS_SCRIPT_LOADED, PhoneScript))
        {
            Function.Call(Hash.START_NEW_SCRIPT, PhoneScript, 1424);
            Function.Call(Hash.SET_SCRIPT_AS_NO_LONGER_NEEDED, PhoneScript);
            restorePhoneAt = DateTime.MinValue;
            Log("Celular restaurado.");
        }
        else if ((DateTime.UtcNow - restorePhoneAt).TotalSeconds > 15)
        {
            restorePhoneAt = DateTime.MinValue;
            Log("El script del celular no cargo; si no tienes celular, reinicia GTA V.");
        }
    }

    // 27 telefono, 19 rueda de personajes, 172-177 navegacion del celular, 165/166/167 cambiar de personaje
    static readonly int[] PhoneAndSwitchControls = new int[] { 27, 19, 172, 173, 174, 175, 176, 177, 165, 166, 167, 168, 169, 170, 171 };

    void RespawnAtStart(string message)
    {
        Ped ped = Game.Player.Character;
        PlaceOnStart(ped);
        Flash(message, 2500);
        Log(message);
    }

    void Win()
    {
        SetMode(Mode.Won);
        ClearSpawned();
        cfgWins += 1; // la plataforma confirma el numero real enseguida
        SendNow("{\"type\":\"win\"}");
        Flash(cfgWins == cfgGoal ? "¡OBJETIVO DE WINS CUMPLIDO!" : "¡+1 WIN!", 3500);
        Screen.ShowSubtitle("¡Llegaste arriba! +1 win", 3000);
        Log("Win. Ahora " + cfgWins + "/" + cfgGoal);
    }

    void TickWon()
    {
        Ped ped = Game.Player.Character;
        Game.Player.IsInvincible = true;
        if ((DateTime.UtcNow - modeSince).TotalSeconds >= 3.5)
        {
            PlaceOnStart(ped);
            SetMode(Mode.Playing);
            Flash("¡Sube otra vez!", 2500);
        }
    }

    // ================= regalos =================

    void ProcessInbox()
    {
        Job job;
        while (inbox.TryDequeue(out job))
        {
            if ((DateTime.UtcNow - job.Received).TotalSeconds > MaxJobAgeSeconds)
            {
                Report(job, false, "expirada");
                continue;
            }

            Spawner spawner;
            if (!Spawners.TryGetValue(job.Action, out spawner))
            {
                Report(job, false, "accion desconocida: " + job.Action);
                continue;
            }

            try
            {
                int count = Math.Max(1, Math.Min(job.Amount, 40));
                for (int i = 0; i < count; i++)
                {
                    Spawner captured = spawner;
                    After(i * 350, delegate { SpawnOne(captured); });
                }
                string who = string.IsNullOrEmpty(job.Nickname) ? "Alguien" : job.Nickname;
                Screen.ShowSubtitle(who + ": " + job.Label, 3000);
                Report(job, true, "");
            }
            catch (Exception ex)
            {
                Log("Error en " + job.Action + ": " + ex.Message);
                Report(job, false, ex.Message);
            }
        }
    }

    // Lo que cae aparece al final de la rampa (detras de la plataforma de arriba) y baja por su propio peso
    void SpawnOne(Spawner spawner)
    {
        if (mode != Mode.Playing || !built) return;

        Model model = PickModel(spawner.Models);
        if (!model.IsValid) { LogThrottled("model-" + spawner.Models[0], "Ningun modelo disponible entre: " + string.Join(", ", spawner.Models)); return; }
        if (!model.Request(2000)) return;

        // a lo ancho de la parte por donde se camina; arriba de la pendiente y empujado cuesta abajo (siguiendo su inclinacion)
        float lateral = (float)((random.NextDouble() - 0.5) * (walkHalf * 1.7));
        Vector3 pos = new Vector3(spawnSpot.X + lateral, spawnSpot.Y, spawnSpot.Z + spawner.Lift);
        Vector3 push = new Vector3(0f, -spawner.Speed * cosAngle, -spawner.Speed * sinAngle);

        if (spawner.Vehicle)
        {
            Vehicle vehicle = World.CreateVehicle(model, pos, 180f);
            if (vehicle == null) return;
            vehicle.IsPersistent = true;
            vehicle.IsEngineRunning = false;
            vehicle.LockStatus = VehicleLockStatus.CannotBeTriedToEnter;
            Function.Call(Hash.SET_VEHICLE_DOORS_LOCKED_FOR_PLAYER, vehicle, Game.Player, true);
            vehicle.Velocity = push;
            Track(vehicle, spawner.Life, true);
        }
        else
        {
            Vector3 rotation = new Vector3((float)random.NextDouble() * 360f, (float)random.NextDouble() * 360f, (float)random.NextDouble() * 360f);
            Prop prop = World.CreateProp(model, pos, rotation, true, false);
            if (prop == null) return;
            prop.IsPersistent = true;
            prop.ActivatePhysics();
            prop.Velocity = push;
            Track(prop, spawner.Life, false);
        }
        model.MarkAsNoLongerNeeded();
    }

    void Track(Entity entity, int life, bool isVehicle)
    {
        Tracked item = new Tracked();
        item.Entity = entity;
        item.LifeSeconds = life;
        item.IsVehicle = isVehicle;
        tracked.Add(item);

        // si hay demasiados, se borran los mas viejos
        int vehicles = 0, props = 0;
        foreach (Tracked t in tracked) { if (t.IsVehicle) vehicles++; else props++; }
        for (int i = 0; i < tracked.Count && (vehicles > MaxVehicles || props > MaxProps); i++)
        {
            Tracked old = tracked[i];
            if (old.IsVehicle && vehicles > MaxVehicles) { vehicles--; Remove(old); tracked.RemoveAt(i); i--; }
            else if (!old.IsVehicle && props > MaxProps) { props--; Remove(old); tracked.RemoveAt(i); i--; }
        }
    }

    static void Remove(Tracked t)
    {
        try { if (t.Entity != null && t.Entity.Exists()) t.Entity.Delete(); } catch (Exception) { }
    }

    // Se borra lo que ya cayo al vacio, lo que lleva mucho tiempo y lo que no existe
    void CleanSpawned()
    {
        if ((DateTime.UtcNow - lastClean).TotalSeconds < 1.0) return;
        lastClean = DateTime.UtcNow;

        for (int i = tracked.Count - 1; i >= 0; i--)
        {
            Tracked t = tracked[i];
            bool gone = t.Entity == null || !t.Entity.Exists();
            if (!gone)
            {
                double age = (DateTime.UtcNow - t.Born).TotalSeconds;
                gone = age > t.LifeSeconds || t.Entity.Position.Z < zStart - 40f;
            }
            if (gone)
            {
                Remove(t);
                tracked.RemoveAt(i);
            }
        }
    }

    void ClearSpawned()
    {
        foreach (Tracked t in tracked) Remove(t);
        tracked.Clear();
    }

    // ================= pantalla =================

    void DrawHud()
    {
        if (paused) return;

        string wins = cfgWins + "/" + cfgGoal + " wins";
        TextElement counter = new TextElement(wins, new PointF(640f, 18f), 0.9f, Color.White, GTA.UI.Font.ChaletLondon, Alignment.Center, true, true);
        counter.Draw();

        if (DateTime.UtcNow < flashUntil && flash.Length > 0)
        {
            TextElement big = new TextElement(flash, new PointF(640f, 120f), 1.3f, Color.Gold, GTA.UI.Font.ChaletLondon, Alignment.Center, true, true);
            big.Draw();
        }
    }
}

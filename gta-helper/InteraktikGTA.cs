// Interaktik para GTA V - aplicacion de Windows.
//
// Se conecta a la plataforma por WebSocket (<url>/gta-bridge/<llave>) y, cuando llega un regalo,
// escribe en GTA V el truco que corresponde. No toca los archivos del juego ni se mete en su
// proceso: solo envia teclas a la ventana de GTA V cuando esta en primer plano, asi que funciona
// igual en la version clasica y en la Enhanced, en Steam, Epic o Rockstar.
//
// Los codigos de los trucos los manda el servidor (backend/src/services/gtaService.js): si alguno
// cambia, se corrige alla sin actualizar esta aplicacion.
//
// Compilacion (sin SDK, con el compilador que trae Windows): ver gta-helper/build.cmd

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace InteraktikGta
{
    static class Native
    {
        public const uint INPUT_KEYBOARD = 1;
        public const uint KEYEVENTF_KEYUP = 0x0002;
        public const uint KEYEVENTF_SCANCODE = 0x0008;

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        public static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);
    }

    // Detecta GTA V y escribe en el las teclas de un truco.
    static class Game
    {
        const string TitlePrefix = "Grand Theft Auto V";
        static readonly string[] ProcessNames = { "GTA5", "GTA5_Enhanced" };

        static string WindowTitle(IntPtr hWnd)
        {
            StringBuilder text = new StringBuilder(256);
            Native.GetWindowText(hWnd, text, text.Capacity);
            return text.ToString();
        }

        static bool TitleMatches(string title)
        {
            return title.StartsWith(TitlePrefix, StringComparison.OrdinalIgnoreCase);
        }

        static HashSet<uint> GamePids()
        {
            HashSet<uint> pids = new HashSet<uint>();
            foreach (string name in ProcessNames)
            {
                foreach (Process process in Process.GetProcessesByName(name))
                {
                    pids.Add((uint)process.Id);
                    process.Dispose();
                }
            }
            return pids;
        }

        public static bool IsRunning()
        {
            if (GamePids().Count > 0) return true;

            bool found = false;
            Native.EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
            {
                if (Native.IsWindowVisible(hWnd) && TitleMatches(WindowTitle(hWnd)))
                {
                    found = true;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        public static bool IsForeground()
        {
            IntPtr hWnd = Native.GetForegroundWindow();
            if (hWnd == IntPtr.Zero) return false;

            uint pid;
            Native.GetWindowThreadProcessId(hWnd, out pid);
            if (GamePids().Contains(pid)) return true;
            return TitleMatches(WindowTitle(hWnd));
        }

        static void SendKey(ushort scan, bool down)
        {
            Native.INPUT[] inputs = new Native.INPUT[1];
            inputs[0].type = Native.INPUT_KEYBOARD;
            inputs[0].U.ki.wScan = scan;
            inputs[0].U.ki.dwFlags = Native.KEYEVENTF_SCANCODE | (down ? 0u : Native.KEYEVENTF_KEYUP);
            uint sent = Native.SendInput(1, inputs, Marshal.SizeOf(typeof(Native.INPUT)));
            if (sent == 0) throw new InvalidOperationException("Windows rechazo la tecla (si GTA V corre como administrador, abre esta aplicacion tambien como administrador).");
        }

        // Si el usuario cambia de ventana a mitad del truco, se corta: nunca se escribe en otro programa.
        static void Tap(ushort scan)
        {
            if (!IsForeground()) throw new InvalidOperationException("GTA V perdio el primer plano mientras se escribia el truco");
            SendKey(scan, true);
            Thread.Sleep(45);
            SendKey(scan, false);
            Thread.Sleep(45);
        }

        // Teclas por posicion fisica (scancode): funcionan con cualquier distribucion de teclado.
        const ushort ScanConsole = 0x29; // la tecla a la izquierda del 1 (~ o ` segun el teclado)
        const ushort ScanEnter = 0x1C;

        public static void TypeCheat(List<string> codes, bool useConsole)
        {
            for (int i = 0; i < codes.Count; i++)
            {
                if (i > 0) Thread.Sleep(600);

                // Siempre ~ + codigo + Enter: si el juego no necesita la consola, el codigo entra igual.
                if (useConsole)
                {
                    Tap(ScanConsole);
                    Thread.Sleep(250);
                }

                foreach (char letter in codes[i].ToUpperInvariant())
                {
                    if (letter < 'A' || letter > 'Z') continue;
                    ushort scan = (ushort)Native.MapVirtualKey((uint)letter, 0);
                    Tap(scan);
                }

                Thread.Sleep(150);
                Tap(ScanEnter);
            }
        }
    }

    class Settings
    {
        public string Key = "";
        public string Url = "https://interaktik-platform-production.up.railway.app";
        public bool UseConsole = true;

        static string FilePath
        {
            get
            {
                string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "InteraktikGTA");
                Directory.CreateDirectory(folder);
                return Path.Combine(folder, "config.txt");
            }
        }

        public static Settings Load()
        {
            Settings settings = new Settings();
            try
            {
                if (File.Exists(FilePath))
                {
                    foreach (string line in File.ReadAllLines(FilePath))
                    {
                        int eq = line.IndexOf('=');
                        if (eq <= 0) continue;
                        string name = line.Substring(0, eq).Trim().ToLowerInvariant();
                        string value = line.Substring(eq + 1).Trim();
                        if (name == "key") settings.Key = value;
                        else if (name == "url" && value.Length > 0) settings.Url = value;
                        else if (name == "console") settings.UseConsole = value != "0";
                    }
                }
            }
            catch (Exception)
            {
                // sin configuracion guardada: valores por defecto
            }
            return settings;
        }

        public void Save()
        {
            try
            {
                File.WriteAllLines(FilePath, new string[]
                {
                    "key=" + Key,
                    "url=" + Url,
                    "console=" + (UseConsole ? "1" : "0"),
                });
            }
            catch (Exception)
            {
                // si no se puede guardar, simplemente pedira la llave la proxima vez
            }
        }
    }

    class CheatJob
    {
        public int Id;
        public string Label;
        public string Nickname;
        public List<string> Codes = new List<string>();
    }

    // Conexion con la plataforma: reconecta sola, recibe los regalos y reporta el estado del juego.
    class Bridge
    {
        public event Action<string> Log;
        public event Action<string, bool> State; // texto, conectado
        public event Action<bool, bool> GameState; // corriendo, en primer plano
        public event Action Stopped; // se detuvo por un motivo que requiere accion del usuario

        readonly Settings settings;
        readonly BlockingCollection<CheatJob> jobs = new BlockingCollection<CheatJob>();
        readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        CancellationTokenSource cancel;
        ClientWebSocket current;
        Thread worker;
        bool jobsStarted;

        public Bridge(Settings settings)
        {
            this.settings = settings;
        }

        void Say(string text)
        {
            Action<string> handler = Log;
            if (handler != null) handler(text);
        }

        void SetState(string text, bool connected)
        {
            Action<string, bool> handler = State;
            if (handler != null) handler(text, connected);
        }

        Uri BuildUri()
        {
            string baseUrl = settings.Url.Trim().TrimEnd('/');
            if (baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) baseUrl = "wss://" + baseUrl.Substring(8);
            else if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) baseUrl = "ws://" + baseUrl.Substring(7);
            return new Uri(baseUrl + "/gta-bridge/" + settings.Key.Trim());
        }

        public void Start()
        {
            Stop();
            cancel = new CancellationTokenSource();
            if (!jobsStarted)
            {
                jobsStarted = true;
                worker = new Thread(Work);
                worker.IsBackground = true;
                worker.Start();
            }
            Task.Run(() => Loop(cancel.Token));
        }

        public void Stop()
        {
            if (cancel != null)
            {
                cancel.Cancel();
                cancel = null;
            }
            ClientWebSocket socket = current;
            if (socket != null)
            {
                try { socket.Abort(); } catch (Exception) { }
            }
            SetState("Desconectada", false);
        }

        async Task Loop(CancellationToken token)
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
                        SetState("Conectando...", false);
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
                    SetState("Sin conexion, reintentando...", false);
                    string reason = ex.Message;
                    if (reason.Contains("502") || reason.Contains("404") || reason.Contains("503"))
                    {
                        reason = "el servidor de Interaktik aun no tiene este juego activo (" + reason + ")";
                    }
                    Say("No se pudo conectar: " + reason + ". Reintento en " + (delay / 1000) + " s.");
                }

                if (fatal)
                {
                    Action stopped = Stopped;
                    if (stopped != null) stopped();
                    return;
                }

                try { await Task.Delay(delay, token); } catch (OperationCanceledException) { return; }
                delay = Math.Min(delay * 2, 15000);
            }
        }

        // Devuelve true si el servidor cerro con un motivo que no se arregla reintentando
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
            SetState("Sin conexion, reintentando...", false);
            return false;
        }

        bool HandleClose(ClientWebSocket socket)
        {
            int code = socket.CloseStatus.HasValue ? (int)socket.CloseStatus.Value : 0;
            if (code == 4004)
            {
                SetState("La llave no es valida", false);
                Say("La llave no es valida. Copiala de nuevo desde la pagina de GTA Interactivo en Interaktik.");
                return true;
            }
            if (code == 4003)
            {
                SetState("Plan vencido", false);
                Say("Tu prueba o plan de Interaktik vencio.");
                return true;
            }
            if (code == 4001)
            {
                SetState("Llave regenerada", false);
                Say("La llave fue regenerada. Pega la nueva y pulsa Conectar.");
                return true;
            }
            if (code == 4000)
            {
                SetState("Abierta en otro lugar", false);
                Say("Esta cuenta se conecto desde otra ventana de la aplicacion. Cierra esa o pulsa Conectar para recuperar la conexion.");
                return true;
            }
            SetState("Sin conexion, reintentando...", false);
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
                SetState("Conectada ✔", true);
                Say("Conectada a Interaktik.");
            }
            else if (type == "cheat")
            {
                CheatJob job = new CheatJob();
                job.Id = Convert.ToInt32(message["id"]);
                job.Label = message.ContainsKey("label") ? Convert.ToString(message["label"]) : "";
                job.Nickname = message.ContainsKey("nickname") ? Convert.ToString(message["nickname"]) : "";
                object[] codes = message["codes"] as object[];
                if (codes == null)
                {
                    System.Collections.ArrayList list = message["codes"] as System.Collections.ArrayList;
                    if (list != null) codes = list.ToArray();
                }
                if (codes == null) return;
                foreach (object code in codes) job.Codes.Add(Convert.ToString(code));
                if (job.Codes.Count == 0) return;
                jobs.Add(job);
            }
        }

        async Task StatusLoop(ClientWebSocket socket, CancellationToken token)
        {
            while (socket.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                bool running = false;
                bool focused = false;
                try
                {
                    running = Game.IsRunning();
                    focused = running && Game.IsForeground();
                }
                catch (Exception)
                {
                    // se informa como no detectado
                }

                Action<bool, bool> handler = GameState;
                if (handler != null) handler(running, focused);

                await Send(socket, "{\"type\":\"status\",\"gameRunning\":" + (running ? "true" : "false") + ",\"gameFocused\":" + (focused ? "true" : "false") + "}");

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

        void Report(CheatJob job, bool ok, string reason)
        {
            string body = "{\"type\":\"result\",\"id\":" + job.Id + ",\"ok\":" + (ok ? "true" : "false") + ",\"reason\":" + json.Serialize(reason ?? "") + "}";
            Task.Run(() => Send(current, body));
        }

        // Escribe los trucos de uno en uno, solo cuando GTA V esta en primer plano
        void Work()
        {
            foreach (CheatJob job in jobs.GetConsumingEnumerable())
            {
                string who = string.IsNullOrWhiteSpace(job.Nickname) ? "Alguien" : job.Nickname;
                Say(who + ": " + job.Label);

                bool ok = false;
                string reason = "";
                try
                {
                    DateTime runningDeadline = DateTime.UtcNow.AddSeconds(3);
                    while (!Game.IsRunning() && DateTime.UtcNow < runningDeadline) Thread.Sleep(250);

                    if (!Game.IsRunning())
                    {
                        reason = "GTA V no esta abierto";
                    }
                    else
                    {
                        DateTime focusDeadline = DateTime.UtcNow.AddSeconds(20);
                        while (!Game.IsForeground() && DateTime.UtcNow < focusDeadline) Thread.Sleep(250);

                        if (!Game.IsForeground())
                        {
                            reason = "GTA V no estaba en primer plano";
                        }
                        else
                        {
                            Game.TypeCheat(job.Codes, settings.UseConsole);
                            ok = true;
                        }
                    }
                }
                catch (Exception ex)
                {
                    reason = ex.Message;
                }

                if (!ok) Say("   No se ejecuto: " + reason + ".");
                Report(job, ok, reason);
                Thread.Sleep(1500);
            }
        }
    }

    class MainForm : Form
    {
        readonly Settings settings;
        readonly Bridge bridge;
        readonly TextBox keyBox = new TextBox();
        readonly Button connectButton = new Button();
        readonly CheckBox consoleCheck = new CheckBox();
        readonly Label stateLabel = new Label();
        readonly Label gameLabel = new Label();
        readonly TextBox logBox = new TextBox();
        bool connected;
        bool wanted;

        public MainForm(Settings settings, bool autoConnect)
        {
            this.settings = settings;
            bridge = new Bridge(settings);

            Text = "Interaktik para GTA V";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(480, 430);
            MinimumSize = new Size(420, 380);
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Color.FromArgb(18, 12, 34);
            ForeColor = Color.White;

            Label title = new Label();
            title.Text = "Interaktik para GTA V";
            title.Font = new Font("Segoe UI Semibold", 15f);
            title.AutoSize = true;
            title.Location = new Point(16, 14);

            Label hint = new Label();
            hint.Text = "Pega tu llave de la pagina de GTA Interactivo y pulsa Conectar.\nDeja esta ventana abierta (puede estar minimizada) mientras juegas.";
            hint.ForeColor = Color.FromArgb(190, 180, 220);
            hint.AutoSize = true;
            hint.Location = new Point(18, 48);

            Label keyCaption = new Label();
            keyCaption.Text = "Tu llave";
            keyCaption.AutoSize = true;
            keyCaption.Location = new Point(18, 96);

            keyBox.Location = new Point(18, 116);
            keyBox.Size = new Size(ClientSize.Width - 36 - 110, 26);
            keyBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            keyBox.UseSystemPasswordChar = true;
            keyBox.Text = settings.Key;
            keyBox.BackColor = Color.FromArgb(34, 26, 60);
            keyBox.ForeColor = Color.White;
            keyBox.BorderStyle = BorderStyle.FixedSingle;

            connectButton.Text = "Conectar";
            connectButton.Location = new Point(ClientSize.Width - 18 - 96, 114);
            connectButton.Size = new Size(96, 30);
            connectButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            connectButton.FlatStyle = FlatStyle.Flat;
            connectButton.BackColor = Color.FromArgb(255, 94, 98);
            connectButton.ForeColor = Color.White;
            connectButton.FlatAppearance.BorderSize = 0;
            connectButton.Click += OnConnectClick;

            consoleCheck.Text = "Abrir consola con ~ antes de escribir el truco (recomendado)";
            consoleCheck.Checked = settings.UseConsole;
            consoleCheck.AutoSize = true;
            consoleCheck.Location = new Point(18, 154);
            consoleCheck.CheckedChanged += delegate
            {
                settings.UseConsole = consoleCheck.Checked;
                settings.Save();
            };

            stateLabel.Text = "Estado: sin conexion";
            stateLabel.AutoSize = true;
            stateLabel.Font = new Font("Segoe UI Semibold", 10f);
            stateLabel.Location = new Point(18, 188);

            gameLabel.Text = "GTA V: no detectado";
            gameLabel.AutoSize = true;
            gameLabel.ForeColor = Color.FromArgb(190, 180, 220);
            gameLabel.Location = new Point(18, 212);

            logBox.Location = new Point(18, 242);
            logBox.Size = new Size(ClientSize.Width - 36, ClientSize.Height - 242 - 18);
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.BackColor = Color.FromArgb(28, 20, 50);
            logBox.ForeColor = Color.FromArgb(220, 214, 240);
            logBox.BorderStyle = BorderStyle.FixedSingle;

            Controls.AddRange(new Control[] { title, hint, keyCaption, keyBox, connectButton, consoleCheck, stateLabel, gameLabel, logBox });

            bridge.Log += AppendLog;
            bridge.State += OnState;
            bridge.GameState += OnGameState;
            bridge.Stopped += delegate { OnUi(delegate { wanted = false; connectButton.Text = "Conectar"; }); };

            Load += delegate
            {
                AppendLog("Listo. En GTA V usa el modo historia (nunca GTA Online).");
                if (autoConnect && IsValidKey(settings.Key)) StartConnection();
            };
            FormClosing += delegate { bridge.Stop(); };
        }

        static bool IsValidKey(string key)
        {
            return Regex.IsMatch((key ?? "").Trim(), "^[A-Fa-f0-9]{32,64}$");
        }

        void OnUi(Action action)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(action); } catch (Exception) { }
            }
            else
            {
                action();
            }
        }

        void AppendLog(string text)
        {
            OnUi(delegate
            {
                logBox.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + text + Environment.NewLine);
            });
        }

        void OnState(string text, bool isConnected)
        {
            OnUi(delegate
            {
                connected = isConnected;
                stateLabel.Text = "Estado: " + text;
                stateLabel.ForeColor = isConnected ? Color.FromArgb(74, 222, 128) : Color.White;
            });
        }

        void OnGameState(bool running, bool focused)
        {
            OnUi(delegate
            {
                gameLabel.Text = running ? (focused ? "GTA V: detectado (en primer plano)" : "GTA V: detectado") : "GTA V: no detectado (abrelo en modo historia)";
                gameLabel.ForeColor = running ? Color.FromArgb(74, 222, 128) : Color.FromArgb(190, 180, 220);
            });
        }

        void StartConnection()
        {
            settings.Key = keyBox.Text.Trim();
            settings.Save();
            wanted = true;
            connectButton.Text = "Desconectar";
            bridge.Start();
        }

        void OnConnectClick(object sender, EventArgs e)
        {
            if (wanted)
            {
                wanted = false;
                connectButton.Text = "Conectar";
                bridge.Stop();
                return;
            }

            if (!IsValidKey(keyBox.Text))
            {
                MessageBox.Show(this, "La llave no parece valida. Copiala con el boton \"Copiar llave\" de la pagina de GTA Interactivo y pegala aqui.", "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            StartConnection();
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            bool created;
            using (Mutex mutex = new Mutex(true, "InteraktikGtaHelper", out created))
            {
                if (!created)
                {
                    MessageBox.Show("La aplicacion ya esta abierta.", "Interaktik para GTA V", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Settings settings = Settings.Load();
                bool autoConnect = true;
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--url" && i + 1 < args.Length) settings.Url = args[++i];
                    else if (args[i] == "--key" && i + 1 < args.Length) settings.Key = args[++i];
                    else if (args[i] == "--no-autoconnect") autoConnect = false;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm(settings, autoConnect));
            }
        }
    }
}

// Instalador de Interaktik para GTA V (Windows).
//
// Hace por el streamer lo que antes eran pasos manuales: encuentra la carpeta de GTA V (Epic, Steam o Rockstar),
// descarga ScriptHookVDotNet, instala el mod de Interaktik (InteraktikGTA.dll) y escribe su archivo de
// configuracion con la llave. Script Hook V NO se puede redistribuir: el usuario lo baja de la pagina oficial de
// su autor y este instalador solo extrae los dos archivos que hacen falta del ZIP que el elija.
//
// Compilacion (sin SDK, con el compilador que trae Windows): ver gta-installer/build.cmd
// Modo sin ventana, para pruebas: --auto --folder <carpeta> --key <llave> [--shv-zip <zip>] [--url <servidor>]
//                                 [--no-download] [--uninstall] [--log <archivo>]

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace InteraktikGtaInstaller
{
    // Toda la logica de instalacion: la usan la ventana y el modo de pruebas.
    class Installer
    {
        public const string DefaultUrl = "https://interaktik-platform-production.up.railway.app";
        // La version "estable" de ScriptHookVDotNet es de 2022 y no entiende las versiones nuevas de GTA V (falla con
        // SHVDN.NativeMemory). Las compilaciones "nightly" se actualizan con cada parche del juego.
        const string ShvdnNightlyApi = "https://api.github.com/repos/scripthookvdotnet/scripthookvdotnet-nightly/releases/latest";
        const string ShvdnStableZipUrl = "https://github.com/scripthookvdotnet/scripthookvdotnet/releases/latest/download/ScriptHookVDotNet.zip";

        public Action<string> Log = delegate { };
        public string ServerUrl = DefaultUrl;
        public string Game = "story"; // "story" = Modo historia (InteraktikGTA), "ramp" = Rampa Imposible (InteraktikRampa)
        public bool AllowDownloads = true;

        // ---------- deteccion ----------

        public static bool IsGameFolder(string folder)
        {
            return !string.IsNullOrEmpty(folder) && Directory.Exists(folder) && File.Exists(Path.Combine(folder, "GTA5.exe"));
        }

        public static bool IsEnhancedOnly(string folder)
        {
            return !string.IsNullOrEmpty(folder) && Directory.Exists(folder)
                && File.Exists(Path.Combine(folder, "GTA5_Enhanced.exe")) && !File.Exists(Path.Combine(folder, "GTA5.exe"));
        }

        static void AddIfGame(List<string> found, string folder)
        {
            if (IsGameFolder(folder) && !found.Contains(folder)) found.Add(folder);
        }

        // Busca GTA V en Epic, Steam y Rockstar. Devuelve todas las carpetas donde esta la version clasica.
        public static List<string> FindGameFolders()
        {
            List<string> found = new List<string>();

            // Epic Games: cada juego instalado tiene un .item (JSON) con su carpeta
            try
            {
                string manifests = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"Epic\EpicGamesLauncher\Data\Manifests");
                if (Directory.Exists(manifests))
                {
                    JavaScriptSerializer json = new JavaScriptSerializer();
                    foreach (string file in Directory.GetFiles(manifests, "*.item"))
                    {
                        try
                        {
                            Dictionary<string, object> item = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
                            object name;
                            object location;
                            if (item.TryGetValue("DisplayName", out name) && item.TryGetValue("InstallLocation", out location)
                                && Convert.ToString(name).StartsWith("Grand Theft Auto V", StringComparison.OrdinalIgnoreCase))
                            {
                                AddIfGame(found, Convert.ToString(location));
                            }
                        }
                        catch (Exception)
                        {
                            // un manifiesto danado no debe impedir buscar en los demas
                        }
                    }
                }
            }
            catch (Exception)
            {
            }

            // Rockstar Games Launcher
            try
            {
                using (RegistryKey hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                {
                    foreach (string path in new string[] { @"SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V", @"SOFTWARE\Rockstar Games\Grand Theft Auto V" })
                    {
                        using (RegistryKey key = hklm.OpenSubKey(path))
                        {
                            if (key != null) AddIfGame(found, Convert.ToString(key.GetValue("InstallFolder")));
                        }
                    }
                }
            }
            catch (Exception)
            {
            }

            // Steam: la carpeta principal y las bibliotecas extra (libraryfolders.vdf)
            try
            {
                string steam = null;
                using (RegistryKey hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                using (RegistryKey key = hklm.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam"))
                {
                    if (key != null) steam = Convert.ToString(key.GetValue("InstallPath"));
                }

                if (!string.IsNullOrEmpty(steam))
                {
                    List<string> libraries = new List<string>();
                    libraries.Add(steam);
                    string vdf = Path.Combine(steam, @"steamapps\libraryfolders.vdf");
                    if (File.Exists(vdf))
                    {
                        foreach (Match match in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s+\"([^\"]+)\""))
                        {
                            libraries.Add(match.Groups[1].Value.Replace("\\\\", "\\"));
                        }
                    }
                    foreach (string library in libraries) AddIfGame(found, Path.Combine(library, @"steamapps\common\Grand Theft Auto V"));
                }
            }
            catch (Exception)
            {
            }

            // Rutas habituales por si lo anterior no encontro nada
            foreach (string drive in new string[] { @"C:\", @"D:\", @"E:\" })
            {
                AddIfGame(found, Path.Combine(drive, @"Program Files\Epic Games\GTAV"));
                AddIfGame(found, Path.Combine(drive, @"Program Files\Rockstar Games\Grand Theft Auto V"));
                AddIfGame(found, Path.Combine(drive, @"Program Files (x86)\Steam\steamapps\common\Grand Theft Auto V"));
                AddIfGame(found, Path.Combine(drive, @"Games\Epic Games\GTAV"));
            }

            return found;
        }

        public static bool GameRunning()
        {
            foreach (string name in new string[] { "GTA5", "GTA5_Enhanced", "PlayGTAV" })
            {
                Process[] processes = Process.GetProcessesByName(name);
                bool any = processes.Length > 0;
                foreach (Process process in processes) process.Dispose();
                if (any) return true;
            }
            return false;
        }

        public static bool HasScriptHookV(string folder)
        {
            return File.Exists(Path.Combine(folder, "ScriptHookV.dll")) && File.Exists(Path.Combine(folder, "dinput8.dll"));
        }

        public static bool HasScriptHookVDotNet(string folder)
        {
            return File.Exists(Path.Combine(folder, "ScriptHookVDotNet.asi")) && File.Exists(Path.Combine(folder, "ScriptHookVDotNet3.dll"));
        }

        // true si ScriptHookVDotNet esta instalado pero es anterior a la serie 3.7 (la estable de 2022)
        public static bool IsShvdnOutdated(string folder)
        {
            try
            {
                string path = Path.Combine(folder, "ScriptHookVDotNet3.dll");
                if (!File.Exists(path)) return false;
                FileVersionInfo info = FileVersionInfo.GetVersionInfo(path);
                return info.FileMajorPart < 3 || (info.FileMajorPart == 3 && info.FileMinorPart < 7);
            }
            catch (Exception)
            {
                return false;
            }
        }

        public static string ShvdnVersion(string folder)
        {
            try
            {
                string path = Path.Combine(folder, "ScriptHookVDotNet3.dll");
                return File.Exists(path) ? FileVersionInfo.GetVersionInfo(path).FileVersion : "";
            }
            catch (Exception)
            {
                return "";
            }
        }

        public static string ModName(string game)
        {
            return game == "ramp" ? "InteraktikRampa" : "InteraktikGTA";
        }

        public static bool HasMod(string folder)
        {
            return HasMod(folder, "story");
        }

        public static bool HasMod(string folder, string game)
        {
            return File.Exists(Path.Combine(folder, @"scripts\" + ModName(game) + ".dll"));
        }

        public static bool HasNet48()
        {
            try
            {
                using (RegistryKey hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                using (RegistryKey key = hklm.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
                {
                    return key != null && Convert.ToInt32(key.GetValue("Release") ?? 0) >= 528040;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        public static bool HasVcRedist()
        {
            try
            {
                using (RegistryKey hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
                using (RegistryKey key = hklm.OpenSubKey(@"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"))
                {
                    return key != null && Convert.ToInt32(key.GetValue("Installed") ?? 0) == 1;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        public static bool IsValidKey(string key)
        {
            return Regex.IsMatch((key ?? "").Trim(), "^[A-Fa-f0-9]{32,64}$");
        }

        public static string ReadExistingKey(string folder)
        {
            return ReadExistingKey(folder, "story");
        }

        public static string ReadExistingKey(string folder, string game)
        {
            try
            {
                string path = Path.Combine(folder, @"scripts\" + ModName(game) + ".ini");
                if (!File.Exists(path)) return "";
                foreach (string line in File.ReadAllLines(path))
                {
                    if (line.TrimStart().StartsWith("Key=", StringComparison.OrdinalIgnoreCase)) return line.Substring(line.IndexOf('=') + 1).Trim();
                }
            }
            catch (Exception)
            {
            }
            return "";
        }

        // ---------- comprobar la llave ----------

        public const int KeyOk = 0;
        public const int KeyInvalid = 1;
        public const int KeyExpired = 2;
        public const int KeyOffline = 3;

        // Se conecta un instante a la plataforma con la llave y dice si la acepta. OJO: si GTA V esta abierto con el
        // mod conectado, esta prueba lo desconecta (la plataforma solo deja una conexion por usuario).
        public static int TestKey(string serverUrl, string key, out string message)
        {
            message = "";
            string baseUrl = serverUrl.Trim().TrimEnd('/');
            if (baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) baseUrl = "wss://" + baseUrl.Substring(8);
            else if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) baseUrl = "ws://" + baseUrl.Substring(7);

            int result = KeyOffline;
            string text = "No pude conectar con Interaktik. Revisa tu internet.";
            try
            {
                Task task = Task.Run(async delegate
                {
                    using (ClientWebSocket socket = new ClientWebSocket())
                    using (CancellationTokenSource timeout = new CancellationTokenSource(12000))
                    {
                        await socket.ConnectAsync(new Uri(baseUrl + "/gta-bridge/" + key.Trim()), timeout.Token);
                        byte[] buffer = new byte[4096];
                        while (socket.State == WebSocketState.Open)
                        {
                            WebSocketReceiveResult received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), timeout.Token);
                            if (received.MessageType == WebSocketMessageType.Close)
                            {
                                int code = socket.CloseStatus.HasValue ? (int)socket.CloseStatus.Value : 0;
                                if (code == 4004)
                                {
                                    result = KeyInvalid;
                                    text = "Interaktik no reconoce esa llave. Copia la llave de la pagina de Modo historia (no la de otro juego) y vuelve a probar.";
                                }
                                else if (code == 4003)
                                {
                                    result = KeyExpired;
                                    text = "Tu prueba o plan de Interaktik vencio.";
                                }
                                else
                                {
                                    result = KeyOffline;
                                    text = "La plataforma cerro la conexion (codigo " + code + ").";
                                }
                                return;
                            }
                            if (Encoding.UTF8.GetString(buffer, 0, received.Count).Contains("\"hello\""))
                            {
                                result = KeyOk;
                                text = "La llave es valida: la plataforma te reconoce.";
                                try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "ok", CancellationToken.None); } catch (Exception) { }
                                return;
                            }
                        }
                    }
                });
                task.Wait(15000);
            }
            catch (Exception ex)
            {
                Exception inner = ex;
                while (inner.InnerException != null) inner = inner.InnerException;
                result = KeyOffline;
                text = "No pude conectar con Interaktik (" + inner.Message + ").";
            }

            message = text;
            return result;
        }

        // ---------- instalacion ----------

        static void CopyStream(Stream from, string destination)
        {
            using (FileStream to = new FileStream(destination, FileMode.Create, FileAccess.Write))
            {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = from.Read(buffer, 0, buffer.Length)) > 0) to.Write(buffer, 0, read);
            }
        }

        // Extrae ScriptHookV.dll y dinput8.dll del ZIP que el usuario bajo de la pagina oficial de Script Hook V
        public void InstallScriptHookVFromZip(string folder, string zipPath)
        {
            int copied = 0;
            using (ZipArchive zip = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in zip.Entries)
                {
                    string name = entry.FullName.Replace('\\', '/');
                    bool wanted = name.EndsWith("bin/ScriptHookV.dll", StringComparison.OrdinalIgnoreCase)
                        || name.EndsWith("bin/dinput8.dll", StringComparison.OrdinalIgnoreCase);
                    if (!wanted) continue;

                    using (Stream input = entry.Open()) CopyStream(input, Path.Combine(folder, entry.Name));
                    copied += 1;
                }
            }

            if (copied < 2) throw new InvalidOperationException("Ese ZIP no es el de Script Hook V (no tiene bin\\ScriptHookV.dll y bin\\dinput8.dll).");
            Log("Script Hook V instalado.");
        }

        string FindShvdnUrl()
        {
            try
            {
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "InteraktikGTA-Installer";
                    string body = client.DownloadString(ShvdnNightlyApi);
                    Dictionary<string, object> release = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(body);
                    System.Collections.ArrayList assets = release["assets"] as System.Collections.ArrayList;
                    if (assets != null)
                    {
                        foreach (object asset in assets)
                        {
                            Dictionary<string, object> item = asset as Dictionary<string, object>;
                            string name = item != null ? Convert.ToString(item["name"]) : "";
                            if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) return Convert.ToString(item["browser_download_url"]);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Log("No se pudo consultar la version nightly de ScriptHookVDotNet (" + ex.Message + ").");
            }
            return null;
        }

        // ScriptHookVDotNet se descarga de su pagina oficial en GitHub (su licencia lo permite)
        public void InstallScriptHookVDotNet(string folder)
        {
            if (!AllowDownloads) throw new InvalidOperationException("Falta ScriptHookVDotNet y las descargas estan desactivadas.");

            string url = FindShvdnUrl();
            if (url == null)
            {
                Log("Se usara la version estable de ScriptHookVDotNet; puede ser demasiado vieja para tu GTA V.");
                url = ShvdnStableZipUrl;
            }

            Log("Descargando ScriptHookVDotNet (" + Path.GetFileName(url) + ")...");
            string temp = Path.Combine(Path.GetTempPath(), "ScriptHookVDotNet-" + Guid.NewGuid().ToString("N") + ".zip");
            try
            {
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.UserAgent] = "InteraktikGTA-Installer";
                    client.DownloadFile(url, temp);
                }

                int copied = 0;
                using (ZipArchive zip = ZipFile.OpenRead(temp))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        string name = entry.Name;
                        if (name == "ScriptHookVDotNet.asi" || name == "ScriptHookVDotNet2.dll" || name == "ScriptHookVDotNet3.dll")
                        {
                            using (Stream input = entry.Open()) CopyStream(input, Path.Combine(folder, name));
                            copied += 1;
                        }
                        else if (name == "ScriptHookVDotNet.ini" && !File.Exists(Path.Combine(folder, name)))
                        {
                            using (Stream input = entry.Open()) CopyStream(input, Path.Combine(folder, name));
                        }
                    }
                }
                if (copied < 3) throw new InvalidOperationException("El ZIP descargado de ScriptHookVDotNet no tiene los archivos esperados.");
            }
            finally
            {
                try { File.Delete(temp); } catch (Exception) { }
            }
            Log("ScriptHookVDotNet instalado (version " + ShvdnVersion(folder) + ").");
        }

        // El mod se baja de la plataforma (asi se actualiza sin cambiar el instalador); si no se puede, se usa el incluido
        byte[] GetModBytes()
        {
            if (AllowDownloads)
            {
                try
                {
                    using (WebClient client = new WebClient())
                    {
                        client.Headers[HttpRequestHeader.UserAgent] = "InteraktikGTA-Installer";
                        byte[] data = client.DownloadData(Updater.Base(ServerUrl) + ModName(Game) + ".dll");
                        if (data.Length > 5000 && data[0] == 'M' && data[1] == 'Z')
                        {
                            Log("Mod descargado de la plataforma.");
                            return data;
                        }
                        Log("La plataforma todavia no ofrece el mod; se usa el incluido en el instalador.");
                    }
                }
                catch (Exception ex)
                {
                    Log("No se pudo bajar el mod de la plataforma (" + ex.Message + "); se usa el incluido en el instalador.");
                }
            }

            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(ModName(Game) + ".dll"))
            {
                if (resource == null) throw new InvalidOperationException("Este instalador no trae el mod de este juego incluido: descarga el instalador actualizado de la p\u00e1gina.");
                using (MemoryStream memory = new MemoryStream())
                {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = resource.Read(buffer, 0, buffer.Length)) > 0) memory.Write(buffer, 0, read);
                    return memory.ToArray();
                }
            }
        }

        public void InstallMod(string folder, string key)
        {
            string scripts = Path.Combine(folder, "scripts");
            Directory.CreateDirectory(scripts);

            File.WriteAllBytes(Path.Combine(scripts, ModName(Game) + ".dll"), GetModBytes());

            // Configuracion: si ya existe se conserva todo y solo se cambia la llave
            string ini = Path.Combine(scripts, ModName(Game) + ".ini");
            key = key.Trim();
            if (File.Exists(ini))
            {
                List<string> lines = new List<string>(File.ReadAllLines(ini));
                bool replaced = false;
                for (int i = 0; i < lines.Count; i++)
                {
                    if (lines[i].TrimStart().StartsWith("Key=", StringComparison.OrdinalIgnoreCase))
                    {
                        lines[i] = "Key=" + key;
                        replaced = true;
                    }
                }
                if (!replaced) lines.Insert(0, "Key=" + key);
                File.WriteAllLines(ini, lines.ToArray());
            }
            else
            {
                if (Game == "ramp")
                {
                    File.WriteAllLines(ini, new string[]
                    {
                        "; Interaktik Rampa Imposible para GTA V - NO compartas este archivo (contiene tu llave secreta).",
                        "Key=" + key,
                        "",
                        "; Opciones (si las quitas se usan estos valores):",
                        "; RampAngle=14      inclinacion de la rampa en grados (5 a 30)",
                        "; RampLength=13     containers de largo (4 a 30)",
                        "; RampWidth=6       containers de ancho de la parte por donde se camina (2 a 12)",
                        "; SpeedScale=1.7    velocidad con la que sale lo que cae (0.5 a 4)",
                        "; PushAccel=24      empuje extra cuesta abajo para lo que cae (0 a 40)",
                        "; PushSpeed=15      velocidad minima cuesta abajo de lo que cae (0 a 40)",
                        "; BlockPhone=true   apaga el celular durante la partida",
                        "; ShelterHeight=2.0  cuanto asoma (en metros) la punta del container de cada punto seguro",
                        "; ShelterLean=38     cuanto se inclina la punta hacia abajo de la rampa, en grados (0 a 65)",
                        "; FlipPitch=false   pon true si en tu juego la rampa baja en vez de subir",
                    });
                }
                else
                File.WriteAllLines(ini, new string[]
                {
                    "; Interaktik para GTA V - NO compartas este archivo (contiene tu llave secreta).",
                    "Key=" + key,
                    "",
                    "; Mostrar en pantalla quien manda cada regalo (true o false).",
                    "ShowGifts=false",
                    "; Mostrar el aviso \"Interaktik conectado\" al abrir el juego (true o false).",
                    "ShowConnected=true",
                });
            }
            Log("Mod de Interaktik instalado en " + scripts);
        }

        // Quita solo lo de Interaktik; Script Hook V y ScriptHookVDotNet se dejan (pueden servir para otros mods)
        public void Uninstall(string folder)
        {
            string scripts = Path.Combine(folder, "scripts");
            foreach (string name in new string[] { ModName(Game) + ".dll", ModName(Game) + ".ini", ModName(Game) + ".log" })
            {
                string path = Path.Combine(scripts, name);
                if (File.Exists(path)) File.Delete(path);
            }
            Log("Mod de Interaktik desinstalado.");
        }

        // Instalacion completa. Devuelve null si todo salio bien, o el motivo del fallo.
        public string Run(string folder, string key, string shvZip)
        {
            try
            {
                if (IsEnhancedOnly(folder)) return "Esa carpeta es la version Enhanced de GTA V. El mod solo funciona con la version clasica.";
                if (!IsGameFolder(folder)) return "No encuentro GTA5.exe en esa carpeta. Elige la carpeta donde esta instalado GTA V.";
                if (!IsValidKey(key)) return "La llave no parece valida. Copiala con el boton \"Copiar llave\" de la pagina de Modo historia.";
                if (GameRunning()) return "GTA V esta abierto. Cierralo (y tu launcher) y vuelve a pulsar Instalar.";

                if (AllowDownloads)
                {
                    string keyMessage;
                    int keyState = TestKey(ServerUrl, key, out keyMessage);
                    if (keyState == KeyInvalid || keyState == KeyExpired) return keyMessage;
                    Log(keyState == KeyOk ? keyMessage : "No pude comprobar la llave (" + keyMessage + ") pero sigo con la instalacion.");
                }

                if (!string.IsNullOrEmpty(shvZip)) InstallScriptHookVFromZip(folder, shvZip);

                if (!HasScriptHookV(folder))
                {
                    return "Falta Script Hook V. Pulsa \"Abrir pagina de Script Hook V\", descarga el ZIP y elige ese ZIP con \"Ya lo descargue\".";
                }

                if (!HasScriptHookVDotNet(folder) || IsShvdnOutdated(folder))
                {
                    if (IsShvdnOutdated(folder)) Log("Tu ScriptHookVDotNet (" + ShvdnVersion(folder) + ") es demasiado viejo para el GTA V actual: se actualiza.");
                    InstallScriptHookVDotNet(folder);
                }

                InstallMod(folder, key);
                return null;
            }
            catch (UnauthorizedAccessException)
            {
                return "Windows no deja escribir en la carpeta del juego. Cierra el instalador y abrelo con clic derecho > Ejecutar como administrador.";
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }
    }

    partial class MainForm : Form
    {
        readonly Installer installer = new Installer();
        readonly TextBox folderBox = new TextBox();
        readonly Label folderInfo = new Label();
        readonly TextBox keyBox = new TextBox();
        readonly Label keyInfo = new Label();
        readonly Button testButton = new Button();
        readonly Label shvLabel = new Label();
        readonly Label shvdnLabel = new Label();
        readonly Label netLabel = new Label();
        readonly Label vcLabel = new Label();
        readonly Label modLabel = new Label();
        readonly Button installButton = new Button();
        readonly Button uninstallButton = new Button();
        readonly TextBox logBox = new TextBox();
        readonly Button storyTab = new Button();
        readonly Button rampTab = new Button();
        string gtaGame = "story";
        string shvZip = "";

        static readonly Color Bg = Color.FromArgb(18, 12, 34);
        static readonly Color Panel = Color.FromArgb(28, 20, 50);
        static readonly Color Muted = Color.FromArgb(190, 180, 220);
        static readonly Color Good = Color.FromArgb(74, 222, 128);
        static readonly Color Bad = Color.FromArgb(251, 113, 133);
        static readonly Color Accent = Color.FromArgb(255, 94, 98);

        public MainForm(string url, bool startOnMinecraft)
        {
            installer.ServerUrl = url;
            installer.Log = AppendLog;

            Text = "Instalar Interaktik para GTA V";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(640, 790);
            MinimumSize = new Size(600, 640);
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Bg;
            ForeColor = Color.White;

            BuildChrome(startOnMinecraft);

            int y = 14;
            AddLabel("Instalar Interaktik para GTA V", 16, y, new Font("Segoe UI Semibold", 15f), Color.White);
            y += 34;
            AddLabel("Instala el mod en tu GTA V (versi\u00f3n cl\u00e1sica) en pocos pasos. Cierra GTA V y tu launcher antes de empezar.", 18, y, Font, Muted);
            y += 30;

            StyleGameTab(storyTab, "Modo historia", 18);
            StyleGameTab(rampTab, "Rampa Imposible", 168);
            storyTab.Click += delegate { SetGtaGame("story"); };
            rampTab.Click += delegate { SetGtaGame("ramp"); };
            gtaPanel.Controls.AddRange(new Control[] { storyTab, rampTab });
            storyTab.Top = y;
            rampTab.Top = y;
            y += 40;

            AddLabel("1. Carpeta de GTA V", 18, y, new Font("Segoe UI Semibold", 10f), Color.White);
            y += 24;
            folderBox.SetBounds(18, y, 380, 26);
            StyleBox(folderBox);
            folderBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            folderBox.TextChanged += delegate { RefreshStatus(); };
            Button detect = MakeButton("Detectar", 408, y - 2, 96, 30, false);
            detect.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            detect.Click += delegate { DetectFolder(true); };
            Button browse = MakeButton("Examinar...", 512, y - 2, 110, 30, false);
            browse.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            browse.Click += OnBrowse;
            gtaPanel.Controls.AddRange(new Control[] { folderBox, detect, browse });
            y += 32;
            folderInfo.SetBounds(18, y, 600, 20);
            folderInfo.ForeColor = Muted;
            gtaPanel.Controls.Add(folderInfo);
            y += 30;

            AddLabel("2. Tu llave (c\u00f3piala desde la p\u00e1gina de tu juego en Interaktik; es la misma para los dos)", 18, y, new Font("Segoe UI Semibold", 10f), Color.White);
            y += 24;
            keyBox.SetBounds(18, y, 470, 26);
            StyleBox(keyBox);
            keyBox.UseSystemPasswordChar = true;
            keyBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            testButton.Text = "Probar conexi\u00f3n";
            testButton.SetBounds(496, y - 2, 126, 30);
            testButton.FlatStyle = FlatStyle.Flat;
            testButton.BackColor = Accent;
            testButton.ForeColor = Color.White;
            testButton.FlatAppearance.BorderSize = 0;
            testButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            testButton.Click += OnTestKey;
            gtaPanel.Controls.AddRange(new Control[] { keyBox, testButton });
            y += 30;
            keyInfo.SetBounds(18, y, 604, 20);
            keyInfo.ForeColor = Muted;
            keyInfo.Text = "Comprueba que la llave sea correcta antes de instalar.";
            gtaPanel.Controls.Add(keyInfo);
            y += 28;

            AddLabel("3. Requisitos", 18, y, new Font("Segoe UI Semibold", 10f), Color.White);
            y += 26;
            foreach (Label label in new Label[] { shvLabel, shvdnLabel, netLabel, vcLabel, modLabel })
            {
                label.SetBounds(18, y, 604, 20);
                gtaPanel.Controls.Add(label);
                y += 22;
            }
            y += 4;

            Button openShv = MakeButton("Abrir p\u00e1gina de Script Hook V", 18, y, 220, 30, false);
            openShv.Click += delegate { OpenUrl("http://www.dev-c.com/gtav/scripthookv/"); };
            Button chooseZip = MakeButton("Ya lo descargu\u00e9 (elegir ZIP)...", 246, y, 220, 30, false);
            chooseZip.Click += OnChooseZip;
            Button openNet = MakeButton("Requisitos de Windows", 474, y, 148, 30, false);
            openNet.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            openNet.Click += delegate
            {
                if (!Installer.HasNet48()) OpenUrl("https://dotnet.microsoft.com/download/dotnet-framework/net48");
                if (!Installer.HasVcRedist()) OpenUrl("https://aka.ms/vs/17/release/vc_redist.x64.exe");
            };
            gtaPanel.Controls.AddRange(new Control[] { openShv, chooseZip, openNet });
            y += 46;

            installButton.SetBounds(18, y, 300, 40);
            installButton.Text = "Instalar Modo historia";
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.BackColor = Accent;
            installButton.ForeColor = Color.White;
            installButton.Font = new Font("Segoe UI Semibold", 11f);
            installButton.FlatAppearance.BorderSize = 0;
            installButton.Click += OnInstall;
            uninstallButton.SetBounds(326, y, 160, 40);
            uninstallButton.Text = "Desinstalar";
            uninstallButton.FlatStyle = FlatStyle.Flat;
            uninstallButton.BackColor = Panel;
            uninstallButton.ForeColor = Color.White;
            uninstallButton.FlatAppearance.BorderColor = Color.FromArgb(70, 60, 110);
            uninstallButton.Click += OnUninstall;
            gtaPanel.Controls.AddRange(new Control[] { installButton, uninstallButton });
            y += 54;

            logBox.SetBounds(18, y, 604, Math.Max(80, ClientSize.Height - BarHeight - y - 18));
            logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            logBox.Multiline = true;
            logBox.ReadOnly = true;
            logBox.ScrollBars = ScrollBars.Vertical;
            logBox.BackColor = Panel;
            logBox.ForeColor = Color.FromArgb(220, 214, 240);
            logBox.BorderStyle = BorderStyle.FixedSingle;
            gtaPanel.Controls.Add(logBox);

            BuildMinecraftPage(url);
            SetGtaGame("story");

            Load += delegate
            {
                DetectFolder(false);
                RefreshStatus();
                StartUpdateCheck();
            };
        }

        void AddLabel(string text, int x, int y, Font font, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = font;
            label.ForeColor = color;
            label.AutoSize = true;
            label.Location = new Point(x, y);
            gtaPanel.Controls.Add(label);
        }

        void StyleBox(TextBox box)
        {
            box.BackColor = Panel;
            box.ForeColor = Color.White;
            box.BorderStyle = BorderStyle.FixedSingle;
        }

        Button MakeButton(string text, int x, int y, int w, int h, bool primary)
        {
            Button button = new Button();
            button.Text = text;
            button.SetBounds(x, y, w, h);
            button.FlatStyle = FlatStyle.Flat;
            button.BackColor = primary ? Accent : Panel;
            button.ForeColor = Color.White;
            button.FlatAppearance.BorderColor = Color.FromArgb(70, 60, 110);
            return button;
        }

        void OpenUrl(string url)
        {
            try { Process.Start(url); } catch (Exception) { }
        }

        void AppendLog(string text)
        {
            if (IsDisposed) return;
            TextBox target = mcPanel.Visible ? mcLogBox : logBox;
            Action action = delegate { target.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + text + Environment.NewLine); };
            if (InvokeRequired) { try { BeginInvoke(action); } catch (Exception) { } } else action();
        }

        void SetStatus(Label label, bool ok, string okText, string badText)
        {
            label.Text = (ok ? "\u2714  " : "\u2718  ") + (ok ? okText : badText);
            label.ForeColor = ok ? Good : Bad;
        }

        void DetectFolder(bool announce)
        {
            List<string> folders = Installer.FindGameFolders();
            if (folders.Count > 0)
            {
                folderBox.Text = folders[0];
                if (announce) AppendLog("GTA V encontrado en " + folders[0] + (folders.Count > 1 ? " (hay " + folders.Count + " copias; usa Examinar para elegir otra)" : ""));
            }
            else if (announce)
            {
                AppendLog("No encontr\u00e9 GTA V autom\u00e1ticamente. Usa Examinar y elige la carpeta donde est\u00e1 GTA5.exe.");
            }
        }

        void OnBrowse(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Elige la carpeta donde esta instalado GTA V (la que tiene GTA5.exe)";
                if (dialog.ShowDialog(this) == DialogResult.OK) folderBox.Text = dialog.SelectedPath;
            }
        }

        void OnChooseZip(object sender, EventArgs e)
        {
            using (OpenFileDialog dialog = new OpenFileDialog())
            {
                dialog.Title = "Elige el ZIP de Script Hook V que descargaste";
                dialog.Filter = "ZIP (*.zip)|*.zip";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                shvZip = dialog.FileName;
                AppendLog("ZIP de Script Hook V elegido: " + Path.GetFileName(shvZip) + ". Se instalar\u00e1 al pulsar Instalar.");
                RefreshStatus();
            }
        }

        void RefreshStatus()
        {
            string folder = folderBox.Text.Trim();
            bool isGame = Installer.IsGameFolder(folder);

            if (folder.Length == 0) { folderInfo.Text = "Pulsa Detectar o Examinar."; folderInfo.ForeColor = Muted; }
            else if (Installer.IsEnhancedOnly(folder)) { folderInfo.Text = "Esa es la versi\u00f3n Enhanced: el mod no funciona con ella."; folderInfo.ForeColor = Bad; }
            else if (isGame) { folderInfo.Text = "GTA V (versi\u00f3n cl\u00e1sica) encontrado."; folderInfo.ForeColor = Good; }
            else { folderInfo.Text = "No hay GTA5.exe en esa carpeta."; folderInfo.ForeColor = Bad; }

            if (isGame && keyBox.Text.Length == 0)
            {
                string existing = Installer.ReadExistingKey(folder, gtaGame);
                if (existing.Length == 0) existing = Installer.ReadExistingKey(folder, gtaGame == "ramp" ? "story" : "ramp");
                if (existing.Length > 0) keyBox.Text = existing;
            }

            bool shv = isGame && Installer.HasScriptHookV(folder);
            SetStatus(shvLabel, shv || shvZip.Length > 0, shv ? "Script Hook V instalado" : "Script Hook V: listo para instalar desde tu ZIP",
                "Script Hook V: falta (abre su p\u00e1gina, descarga el ZIP y elige ese ZIP)");
            bool shvdnOk = isGame && Installer.HasScriptHookVDotNet(folder) && !Installer.IsShvdnOutdated(folder);
            SetStatus(shvdnLabel, shvdnOk, "ScriptHookVDotNet instalado (" + (isGame ? Installer.ShvdnVersion(folder) : "") + ")",
                isGame && Installer.IsShvdnOutdated(folder) ? "ScriptHookVDotNet: versi\u00f3n vieja, se actualizar\u00e1 al instalar" : "ScriptHookVDotNet: se descargar\u00e1 solo al instalar");
            SetStatus(netLabel, Installer.HasNet48(), ".NET Framework 4.8 instalado", ".NET Framework 4.8: falta (bot\u00f3n Requisitos de Windows)");
            SetStatus(vcLabel, Installer.HasVcRedist(), "Visual C++ 2019 (x64) instalado", "Visual C++ 2019 (x64): falta (bot\u00f3n Requisitos de Windows)");
            string gameName = gtaGame == "ramp" ? "Rampa Imposible" : "Modo historia";
            SetStatus(modLabel, isGame && Installer.HasMod(folder, gtaGame), "Mod de " + gameName + " instalado", "Mod de " + gameName + ": todav\u00eda no instalado");
        }

        void OnTestKey(object sender, EventArgs e)
        {
            string key = keyBox.Text.Trim();
            if (!Installer.IsValidKey(key))
            {
                keyInfo.Text = "La llave no parece valida (son letras y numeros, unos 48 caracteres). Copiala de nuevo desde la pagina.";
                keyInfo.ForeColor = Bad;
                return;
            }
            if (Installer.GameRunning())
            {
                keyInfo.Text = "Cierra GTA V antes de probar: la prueba desconectaria el mod del juego.";
                keyInfo.ForeColor = Bad;
                return;
            }

            testButton.Enabled = false;
            keyInfo.Text = "Probando...";
            keyInfo.ForeColor = Muted;
            string url = installer.ServerUrl;
            ThreadPool.QueueUserWorkItem(delegate
            {
                string message;
                int state = Installer.TestKey(url, key, out message);
                BeginInvoke((Action)delegate
                {
                    testButton.Enabled = true;
                    keyInfo.Text = (state == Installer.KeyOk ? "\u2714  " : "\u2718  ") + message;
                    keyInfo.ForeColor = state == Installer.KeyOk ? Good : Bad;
                    AppendLog(message);
                });
            });
        }

        void OnInstall(object sender, EventArgs e)
        {
            string folder = folderBox.Text.Trim();
            string key = keyBox.Text.Trim();
            string zip = shvZip;
            installer.Game = gtaGame;
            installButton.Enabled = false;
            uninstallButton.Enabled = false;
            AppendLog("Instalando...");

            ThreadPool.QueueUserWorkItem(delegate
            {
                string problem = installer.Run(folder, key, zip);
                BeginInvoke((Action)delegate
                {
                    installButton.Enabled = true;
                    uninstallButton.Enabled = true;
                    if (problem == null)
                    {
                        shvZip = "";
                        BackgroundUpdate();
                        AppendLog("Listo. Antes de abrir GTA V agrega -nobattleye en tu launcher (sin eso GTA V no abre). Luego entra a modo historia.");
                        MessageBox.Show(this, "Instalaci\u00f3n terminada.\n\nANTES de abrir GTA V desactiva BattlEye: en tu launcher agrega el argumento -nobattleye "
                            + "(Epic: Biblioteca > los tres puntos de GTA V > Administrar > activar Opciones de inicio y escribir -nobattleye). "
                            + "Sin eso GTA V no abre y muestra el error 0xc000009a.\n\nLuego abre GTA V en modo historia: debe aparecer \"Interaktik conectado\" en pantalla.\n\n"
                            + "Recuerda tambi\u00e9n desactivar las actualizaciones autom\u00e1ticas de GTA V.",
                            "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        AppendLog("No se pudo instalar: " + problem);
                        MessageBox.Show(this, problem, "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                    RefreshStatus();
                });
            });
        }

        void OnUninstall(object sender, EventArgs e)
        {
            string folder = folderBox.Text.Trim();
            if (!Installer.IsGameFolder(folder)) { AppendLog("Elige primero la carpeta de GTA V."); return; }
            if (Installer.GameRunning()) { AppendLog("Cierra GTA V antes de desinstalar."); return; }
            if (MessageBox.Show(this, "Se quitar\u00e1 el mod de Interaktik (Script Hook V y ScriptHookVDotNet se quedan). \u00bfContinuar?", "Desinstalar", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            installer.Game = gtaGame;
            try { installer.Uninstall(folder); }
            catch (Exception ex) { AppendLog("No se pudo desinstalar: " + ex.Message); }
            RefreshStatus();
        }

        void StyleGameTab(Button tab, string text, int x)
        {
            tab.Text = text;
            tab.SetBounds(x, 0, 140, 30);
            tab.FlatStyle = FlatStyle.Flat;
            tab.FlatAppearance.BorderSize = 0;
            tab.Font = new Font("Segoe UI Semibold", 9.5f);
            tab.ForeColor = Color.White;
            tab.BackColor = Panel;
        }

        // Cada juego de GTA V tiene su propio mod; los requisitos (Script Hook V, ScriptHookVDotNet...) son los mismos
        void SetGtaGame(string game)
        {
            gtaGame = game;
            storyTab.BackColor = game == "story" ? Accent : Panel;
            rampTab.BackColor = game == "ramp" ? Accent : Panel;
            installButton.Text = game == "ramp" ? "Instalar Rampa Imposible" : "Instalar Modo historia";
            RefreshStatus();
        }
    }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            // Sin esto las descargas por https fallan en .NET Framework (solo hablaria TLS 1.0)
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | SecurityProtocolType.Tls;

            Updater.OriginalArgs = args;
            string folder = "";
            string key = "";
            string zip = "";
            string url = Installer.DefaultUrl;
            string logPath = "";
            bool auto = false;
            bool uninstall = false;
            bool noDownload = false;
            bool testKey = false;
            bool checkUpdates = false;
            string gtaGameArg = "story";
            bool minecraft = false;
            bool keepOthers = false;
            bool fabric = false;
            string game = MinecraftInstaller.GameAll;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--auto") auto = true;
                else if (args[i] == "--uninstall") uninstall = true;
                else if (args[i] == "--no-download") noDownload = true;
                else if (args[i] == "--test-key") testKey = true;
                else if (args[i] == "--minecraft") minecraft = true;
                else if (args[i] == "--no-update") Updater.Disabled = true;
                else if (args[i] == "--downloads-url" && i + 1 < args.Length) Updater.DownloadsHost = args[++i];
                else if (args[i] == "--check-updates") checkUpdates = true;
                else if (args[i] == "--gta-game" && i + 1 < args.Length) gtaGameArg = args[++i];
                else if (args[i] == "--updated") Updater.JustUpdated = true;
                else if (args[i] == "--keep-other-mods") keepOthers = true;
                else if (args[i] == "--install-fabric") fabric = true;
                else if (args[i] == "--game" && i + 1 < args.Length) game = args[++i];
                else if (args[i] == "--folder" && i + 1 < args.Length) folder = args[++i];
                else if (args[i] == "--key" && i + 1 < args.Length) key = args[++i];
                else if (args[i] == "--shv-zip" && i + 1 < args.Length) zip = args[++i];
                else if (args[i] == "--url" && i + 1 < args.Length) url = args[++i];
                else if (args[i] == "--log" && i + 1 < args.Length) logPath = args[++i];
            }

            if (auto && checkUpdates)
            {
                // modo sin ventana: revisa y aplica las actualizaciones (para pruebas y soporte)
                StringBuilder updateLog = new StringBuilder();
                int modsUpdated;
                bool replaced = Updater.CheckAll(url, delegate (string text) { updateLog.AppendLine(text); }, out modsUpdated);
                updateLog.AppendLine("reemplazado=" + replaced + " mods=" + modsUpdated);
                if (logPath.Length > 0) File.WriteAllText(logPath, updateLog.ToString());
                return 0;
            }

            if (auto)
            {
                Installer installer = new Installer();
                installer.ServerUrl = url;
                installer.AllowDownloads = !noDownload;
                installer.Game = gtaGameArg;
                StringBuilder log = new StringBuilder();
                installer.Log = delegate (string text) { log.AppendLine(text); };

                string problem;
                if (minecraft)
                {
                    MinecraftInstaller mc = new MinecraftInstaller();
                    mc.ServerUrl = url;
                    mc.AllowDownloads = !noDownload;
                    mc.Log = installer.Log;
                    if (testKey)
                    {
                        string mcMessage;
                        int mcState = MinecraftInstaller.TestKey(url, key, out mcMessage);
                        log.AppendLine("estado=" + mcState + " " + mcMessage);
                        if (logPath.Length > 0) File.WriteAllText(logPath, log.ToString());
                        return mcState;
                    }
                    if (uninstall) { try { mc.Uninstall(folder, game); problem = null; } catch (Exception ex) { problem = ex.Message; } }
                    else
                    {
                        problem = fabric ? mc.InstallFabric(folder) : null;
                        if (problem == null) problem = mc.Run(folder, key, !keepOthers, game);
                    }
                    log.AppendLine(problem == null ? "OK" : "ERROR: " + problem);
                    if (logPath.Length > 0) File.WriteAllText(logPath, log.ToString());
                    return problem == null ? 0 : 1;
                }
                if (testKey)
                {
                    string keyMessage;
                    int state = Installer.TestKey(url, key, out keyMessage);
                    log.AppendLine("estado=" + state + " " + keyMessage);
                    if (logPath.Length > 0) File.WriteAllText(logPath, log.ToString());
                    return state;
                }
                if (uninstall)
                {
                    try { installer.Uninstall(folder); problem = null; } catch (Exception ex) { problem = ex.Message; }
                }
                else
                {
                    problem = installer.Run(folder, key, zip);
                }
                log.AppendLine(problem == null ? "OK" : "ERROR: " + problem);
                if (logPath.Length > 0) File.WriteAllText(logPath, log.ToString());
                return problem == null ? 0 : 1;
            }

            Updater.CleanupOld();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(url, minecraft));
            return 0;
        }
    }
}

// Parte de Minecraft del instalador de Interaktik (Windows).
//
// Hace por el streamer lo que antes eran pasos manuales: encuentra la carpeta .minecraft, comprueba que exista
// Fabric 1.21.4, copia los mods de Interaktik (InteraktikMod.jar y InteraktikCubo.jar, que van dentro de este .exe)
// a la carpeta mods y escribe config\interaktik.json con la llave para que el juego se conecte solo.
//
// Los mods son para Minecraft 1.21.4 con Fabric. Fabric Loader falla si en mods hay archivos hechos para otra version,
// por eso (opcional, activado por defecto) los demas .jar se mueven a una carpeta de respaldo, no se borran.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace InteraktikGtaInstaller
{
    class MinecraftInstaller
    {
        public const string GameVersion = "1.21.4";
        public const string BackupFolderName = "mods_respaldo_interaktik";
        static readonly string[] AllModFiles = { "InteraktikMod.jar", "InteraktikCubo.jar" };

        // Juegos interactivos de Minecraft. "InteraktikMod.jar" es el puente comun (recibe los regalos);
        // el del Cubo Gigante suma su propio mod con las reglas del juego.
        public const string GameSurvival = "survival";
        public const string GameCube = "cube";
        public const string GameAll = "all";

        public static string[] ModFilesFor(string game)
        {
            if (game == GameSurvival) return new string[] { "InteraktikMod.jar" };
            return new string[] { "InteraktikMod.jar", "InteraktikCubo.jar" };
        }

        // Este instalador lleva los mods dentro; si se compilo sin alguno, esa seccion no puede instalarse
        public static bool IsBundled(string file)
        {
            return Assembly.GetExecutingAssembly().GetManifestResourceStream(file) != null;
        }

        public static bool GameBundled(string game)
        {
            foreach (string file in ModFilesFor(game))
            {
                if (!IsBundled(file)) return false;
            }
            return true;
        }

        // Java del propio Minecraft (el launcher lo descarga al abrir 1.21.x por primera vez)
        public static bool HasGameJava(string folder)
        {
            try
            {
                string runtime = Path.Combine(folder, "runtime");
                return Directory.Exists(runtime) && Directory.GetFiles(runtime, "java.exe", SearchOption.AllDirectories).Length > 0;
            }
            catch (Exception)
            {
                return false;
            }
        }

        public Action<string> Log = delegate { };
        public string ServerUrl = Installer.DefaultUrl;
        public bool AllowDownloads = true;

        // ---------- deteccion ----------

        public static string DefaultFolder()
        {
            string forced = Environment.GetEnvironmentVariable("INTERAKTIK_MC_DIR"); // para pruebas
            if (!string.IsNullOrEmpty(forced)) return forced;
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), ".minecraft");
        }

        public static bool IsMinecraftFolder(string folder)
        {
            return !string.IsNullOrEmpty(folder) && Directory.Exists(folder) && Directory.Exists(Path.Combine(folder, "versions"));
        }

        // Nombre de la version Fabric 1.21.4 instalada ("" si no hay): TLauncher la llama "Fabric 1.21.4", el instalador
        // oficial "fabric-loader-x.y.z-1.21.4".
        public static string FabricVersionName(string folder)
        {
            try
            {
                string versions = Path.Combine(folder, "versions");
                if (!Directory.Exists(versions)) return "";
                foreach (string dir in Directory.GetDirectories(versions))
                {
                    string name = Path.GetFileName(dir);
                    string lower = name.ToLowerInvariant();
                    if (lower.Contains("fabric") && lower.Contains(GameVersion)) return name;
                }
            }
            catch (Exception)
            {
            }
            return "";
        }

        public static string ModsFolder(string folder)
        {
            return Path.Combine(folder, "mods");
        }

        public static bool HasMods(string folder, string game)
        {
            string mods = ModsFolder(folder);
            foreach (string file in ModFilesFor(game))
            {
                if (!File.Exists(Path.Combine(mods, file))) return false;
            }
            return true;
        }

        // .jar que no son de Interaktik (o copias viejas como "InteraktikMod (1).jar")
        public static List<string> OtherJars(string folder)
        {
            List<string> others = new List<string>();
            string mods = ModsFolder(folder);
            if (!Directory.Exists(mods)) return others;
            foreach (string file in Directory.GetFiles(mods, "*.jar"))
            {
                string name = Path.GetFileName(file);
                bool ours = false;
                foreach (string mine in AllModFiles)
                {
                    if (string.Equals(mine, name, StringComparison.OrdinalIgnoreCase)) ours = true;
                }
                if (!ours) others.Add(file);
            }
            return others;
        }

        public static bool GameRunning()
        {
            try
            {
                foreach (Process process in Process.GetProcessesByName("javaw"))
                {
                    try
                    {
                        // el launcher y otras apps tambien usan javaw: solo avisamos si es Minecraft
                        if (process.MainWindowTitle.ToLowerInvariant().Contains("minecraft")) return true;
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            catch (Exception)
            {
            }
            return false;
        }

        public static string ReadExistingKey(string folder)
        {
            try
            {
                string path = Path.Combine(folder, @"config\interaktik.json");
                if (!File.Exists(path)) return "";
                Dictionary<string, object> data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
                object key;
                if (data != null && data.TryGetValue("serverKey", out key) && key != null) return key.ToString();
            }
            catch (Exception)
            {
            }
            return "";
        }

        // ---------- comprobar la llave ----------

        // Se conecta un instante al puente de Minecraft con la llave. OJO: si Minecraft esta abierto y conectado, esta
        // prueba lo desconecta (la plataforma solo deja una conexion por usuario).
        public static int TestKey(string serverUrl, string key, out string message)
        {
            message = "";
            string baseUrl = serverUrl.Trim().TrimEnd('/');
            if (baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) baseUrl = "wss://" + baseUrl.Substring(8);
            else if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) baseUrl = "ws://" + baseUrl.Substring(7);

            int result = Installer.KeyOk;
            string text = "La llave es v\u00e1lida: la plataforma te reconoce.";
            try
            {
                Task task = Task.Run(async delegate
                {
                    using (ClientWebSocket socket = new ClientWebSocket())
                    {
                        using (CancellationTokenSource connectTimeout = new CancellationTokenSource(12000))
                        {
                            await socket.ConnectAsync(new Uri(baseUrl + "/mc-bridge/" + key.Trim() + "?edition=java"), connectTimeout.Token);
                        }

                        // Si la llave no sirve, la plataforma cierra enseguida con un codigo; si sirve, la conexion sigue abierta.
                        byte[] buffer = new byte[4096];
                        using (CancellationTokenSource wait = new CancellationTokenSource(2500))
                        {
                            try
                            {
                                while (socket.State == WebSocketState.Open)
                                {
                                    WebSocketReceiveResult received = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), wait.Token);
                                    if (received.MessageType == WebSocketMessageType.Close)
                                    {
                                        int code = socket.CloseStatus.HasValue ? (int)socket.CloseStatus.Value : 0;
                                        if (code == 4004)
                                        {
                                            result = Installer.KeyInvalid;
                                            text = "Interaktik no reconoce esa llave. C\u00f3piala de la p\u00e1gina del Cubo Gigante o de Survivaltik y vuelve a probar.";
                                        }
                                        else if (code == 4003)
                                        {
                                            result = Installer.KeyExpired;
                                            text = "Tu prueba o plan de Interaktik venci\u00f3.";
                                        }
                                        else
                                        {
                                            result = Installer.KeyOffline;
                                            text = "La plataforma cerr\u00f3 la conexi\u00f3n (c\u00f3digo " + code + ").";
                                        }
                                        return;
                                    }
                                }
                            }
                            catch (OperationCanceledException)
                            {
                                // paso el tiempo sin que la cerraran: la llave es buena
                            }
                        }

                        try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "ok", CancellationToken.None); } catch (Exception) { }
                    }
                });
                task.Wait(20000);
            }
            catch (Exception ex)
            {
                Exception inner = ex;
                while (inner.InnerException != null) inner = inner.InnerException;
                result = Installer.KeyOffline;
                text = "No pude conectar con Interaktik (" + inner.Message + ").";
            }

            message = text;
            return result;
        }

        // ---------- instalacion ----------

        static void ExtractResource(string name, string destination)
        {
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (input == null) throw new InvalidOperationException("Este instalador no incluye " + name + ".");
                string temp = destination + ".tmp";
                using (FileStream output = new FileStream(temp, FileMode.Create, FileAccess.Write))
                {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = input.Read(buffer, 0, buffer.Length)) > 0) output.Write(buffer, 0, read);
                }
                if (File.Exists(destination)) File.Delete(destination);
                File.Move(temp, destination);
            }
        }

        public void WriteConfig(string folder, string key)
        {
            string path = Path.Combine(folder, @"config\interaktik.json");
            Directory.CreateDirectory(Path.GetDirectoryName(path));

            string apiUrl = ServerUrl.Trim().TrimEnd('/');
            JavaScriptSerializer json = new JavaScriptSerializer();
            Dictionary<string, object> data = new Dictionary<string, object>();
            data["apiUrl"] = apiUrl;
            data["serverKey"] = key.Trim().ToLowerInvariant();
            File.WriteAllText(path, json.Serialize(data), new UTF8Encoding(false));
            Log("Llave guardada en config\\interaktik.json.");
        }

        // Devuelve null si todo salio bien, o el problema en texto simple
        public string Run(string folder, string key, bool moveOthers, string game)
        {
            try
            {
                if (!IsMinecraftFolder(folder)) return "No encuentro la carpeta de Minecraft. Elige la carpeta .minecraft (la que tiene la carpeta versions).";
                if (!Installer.IsValidKey(key)) return "La llave no es v\u00e1lida. C\u00f3piala completa desde la p\u00e1gina de Interaktik.";
                if (game == GameAll)
                {
                    string first = Run(folder, key, moveOthers, GameSurvival);
                    return first != null ? first : Run(folder, key, false, GameCube);
                }
                if (!GameBundled(game)) return "Esta versi\u00f3n del instalador no incluye los mods de este juego todav\u00eda. Descarga el instalador actualizado de la p\u00e1gina.";

                string mods = ModsFolder(folder);
                Directory.CreateDirectory(mods);

                List<string> others = OtherJars(folder);
                if (others.Count > 0 && moveOthers)
                {
                    string backup = Path.Combine(folder, BackupFolderName);
                    Directory.CreateDirectory(backup);
                    foreach (string file in others)
                    {
                        string target = Path.Combine(backup, Path.GetFileName(file));
                        if (File.Exists(target)) target = Path.Combine(backup, DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Path.GetFileName(file));
                        File.Move(file, target);
                        Log("Movido a respaldo: " + Path.GetFileName(file));
                    }
                }
                else if (others.Count > 0)
                {
                    Log("Aviso: hay " + others.Count + " mod(s) m\u00e1s en la carpeta mods. Si Minecraft no abre, vuelve a instalar con la casilla de respaldo marcada.");
                }

                foreach (string file in ModFilesFor(game))
                {
                    ExtractResource(file, Path.Combine(mods, file));
                    Log("Instalado " + file + ".");
                }

                WriteConfig(folder, key);

                if (FabricVersionName(folder).Length == 0)
                {
                    Log("Aviso: no encuentro la versi\u00f3n Fabric " + GameVersion + ". Usa el bot\u00f3n para instalarla o sigue la gu\u00eda de la p\u00e1gina.");
                }
                return null;
            }
            catch (IOException ex)
            {
                return "No pude copiar los archivos (" + ex.Message + "). Cierra Minecraft y TLauncher y vuelve a intentar.";
            }
            catch (UnauthorizedAccessException ex)
            {
                return "Windows no me dej\u00f3 escribir en la carpeta (" + ex.Message + "). Ejecuta el instalador como administrador.";
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }

        // Quita los mods del juego. El puente comun (InteraktikMod.jar) y la llave solo se quitan si ya no queda
        // ningun juego de Minecraft de Interaktik instalado.
        public void Uninstall(string folder, string game)
        {
            string mods = ModsFolder(folder);
            if (game == GameSurvival)
            {
                // Survivaltik solo usa el puente: se queda si el Cubo Gigante esta instalado
                if (File.Exists(Path.Combine(mods, "InteraktikCubo.jar"))) { Log("El puente InteraktikMod.jar se queda porque el Cubo Gigante lo necesita."); return; }
            }
            else
            {
                string cube = Path.Combine(mods, "InteraktikCubo.jar");
                if (File.Exists(cube)) { File.Delete(cube); Log("Quitado InteraktikCubo.jar."); }
                if (game == GameCube) return;
            }

            string bridge = Path.Combine(mods, "InteraktikMod.jar");
            if (File.Exists(bridge)) { File.Delete(bridge); Log("Quitado InteraktikMod.jar."); }
            string config = Path.Combine(folder, @"config\interaktik.json");
            if (File.Exists(config)) { File.Delete(config); Log("Quitada la llave guardada."); }

            string backup = Path.Combine(folder, BackupFolderName);
            if (Directory.Exists(backup))
            {
                foreach (string file in Directory.GetFiles(backup, "*.jar"))
                {
                    string target = Path.Combine(mods, Path.GetFileName(file));
                    if (!File.Exists(target)) { File.Move(file, target); Log("Devuelto a mods: " + Path.GetFileName(file)); }
                }
            }
        }

        // ---------- Fabric (opcional) ----------

        static string FindJava(string folder)
        {
            try
            {
                string runtime = Path.Combine(folder, "runtime");
                if (Directory.Exists(runtime))
                {
                    foreach (string java in Directory.GetFiles(runtime, "java.exe", SearchOption.AllDirectories)) return java;
                }
            }
            catch (Exception)
            {
            }

            string home = Environment.GetEnvironmentVariable("JAVA_HOME");
            if (!string.IsNullOrEmpty(home) && File.Exists(Path.Combine(home, @"bin\java.exe"))) return Path.Combine(home, @"bin\java.exe");

            string path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in path.Split(';'))
            {
                try
                {
                    if (dir.Trim().Length > 0 && File.Exists(Path.Combine(dir.Trim(), "java.exe"))) return Path.Combine(dir.Trim(), "java.exe");
                }
                catch (Exception)
                {
                }
            }
            return "";
        }

        // Descarga el instalador oficial de Fabric y lo ejecuta para 1.21.4. Devuelve null si quedo instalada.
        public string InstallFabric(string folder)
        {
            try
            {
                if (!AllowDownloads) return "Las descargas est\u00e1n desactivadas.";
                if (!IsMinecraftFolder(folder)) return "No encuentro la carpeta de Minecraft.";
                if (FabricVersionName(folder).Length > 0) return null;

                string java = FindJava(folder);
                if (java.Length == 0) return "No encontr\u00e9 Java. Abre Minecraft una vez con TLauncher (descarga Java) o instala Fabric a mano desde fabricmc.net/use/installer.";

                string installerUrl = "https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.1/fabric-installer-1.0.1.jar";
                try
                {
                    using (WebClient meta = new WebClient())
                    {
                        string raw = meta.DownloadString("https://meta.fabricmc.net/v2/versions/installer");
                        object[] list = new JavaScriptSerializer().Deserialize<object[]>(raw);
                        foreach (object item in list)
                        {
                            Dictionary<string, object> entry = item as Dictionary<string, object>;
                            if (entry != null && entry.ContainsKey("url") && entry.ContainsKey("stable") && (bool)entry["stable"]) { installerUrl = entry["url"].ToString(); break; }
                        }
                    }
                }
                catch (Exception)
                {
                    Log("No pude consultar la \u00faltima versi\u00f3n del instalador de Fabric; uso la 1.0.1.");
                }

                string jar = Path.Combine(Path.GetTempPath(), "fabric-installer-interaktik.jar");
                Log("Descargando el instalador oficial de Fabric...");
                using (WebClient client = new WebClient())
                {
                    client.Headers.Add("User-Agent", "InteraktikInstaller");
                    client.DownloadFile(installerUrl, jar);
                }

                Log("Instalando Fabric " + GameVersion + " (puede tardar un minuto)...");
                ProcessStartInfo start = new ProcessStartInfo(java, "-jar \"" + jar + "\" client -mcversion " + GameVersion + " -dir \"" + folder + "\" -noprofile");
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                start.RedirectStandardOutput = true;
                start.RedirectStandardError = true;
                using (Process process = Process.Start(start))
                {
                    string output = process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
                    if (!process.WaitForExit(180000)) { try { process.Kill(); } catch (Exception) { } return "El instalador de Fabric tard\u00f3 demasiado."; }
                    if (process.ExitCode != 0) return "El instalador de Fabric fall\u00f3: " + output.Trim();
                }
                try { File.Delete(jar); } catch (Exception) { }

                if (FabricVersionName(folder).Length == 0) return "Fabric se instal\u00f3 pero no aparece en la carpeta versions. Rev\u00edsalo en TLauncher.";
                Log("Fabric " + GameVersion + " instalado. En TLauncher elige esa versi\u00f3n en la lista (si no aparece, reinicia TLauncher).");
                return null;
            }
            catch (Exception ex)
            {
                Exception inner = ex;
                while (inner.InnerException != null) inner = inner.InnerException;
                return "No pude instalar Fabric (" + inner.Message + ").";
            }
        }
    }
}

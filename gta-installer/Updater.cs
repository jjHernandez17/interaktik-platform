// Actualizaciones automaticas del instalador de Interaktik.
//
// La plataforma publica frontend\downloads\installer.json (lo genera publish-manifest.ps1) con:
//   version  numero de la ultima version del instalador
//   file     nombre del instalador en /downloads
//   sha256   huella del instalador
//   files    huella de cada mod (InteraktikGTA.dll, InteraktikMod.jar, InteraktikCubo.jar)
//
// Al abrirse, el instalador:
//   1. Si hay una version nueva de si mismo, la baja, comprueba la huella, se reemplaza y se reabre.
//   2. Si algun mod ya instalado (GTA V o Minecraft) es distinto al publicado, lo baja y lo reemplaza
//      (si el juego esta abierto lo deja para la proxima vez). La llave y la configuracion no se tocan.
// Asi el streamer nunca tiene que desinstalar y volver a instalar. Nada se instala si la huella no coincide.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

namespace InteraktikGtaInstaller
{
    static class Updater
    {
        // --no-update desactiva todo; --updated <version> lo pasa el instalador que acaba de actualizarse (evita bucles)
        public static bool Disabled = false;
        public static bool JustUpdated = false;
        // Los archivos (instalador, mods, installer.json) los sirve el sitio web; el servidor de Railway solo responde la API y el puente
        public static string DownloadsHost = "https://www.interaktik.com";
        public static string[] OriginalArgs = new string[0]; // para reabrir el instalador nuevo con los mismos argumentos (--url, --minecraft...)

        static string ExePath
        {
            get { return Assembly.GetExecutingAssembly().Location; }
        }

        public class Manifest
        {
            public long Version;
            public string File = "";
            public string Sha256 = "";
            public Dictionary<string, string> Files = new Dictionary<string, string>();
        }

        // El instalador anterior queda renombrado como .old (un .exe en uso se puede renombrar pero no borrar)
        public static void CleanupOld()
        {
            try
            {
                string old = ExePath + ".old";
                if (System.IO.File.Exists(old)) System.IO.File.Delete(old);
            }
            catch (Exception)
            {
            }
        }

        static string Sha256Of(string path)
        {
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                return ToHex(SHA256.Create().ComputeHash(stream));
            }
        }

        static string ToHex(byte[] bytes)
        {
            char[] hex = new char[bytes.Length * 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                hex[i * 2] = "0123456789abcdef"[bytes[i] >> 4];
                hex[i * 2 + 1] = "0123456789abcdef"[bytes[i] & 15];
            }
            return new string(hex);
        }

        public static string Base(string serverUrl)
        {
            return DownloadsHost.TrimEnd('/') + "/downloads/";
        }

        public static Manifest Fetch(string serverUrl)
        {
            using (WebClient client = new WebClient())
            {
                client.Headers[HttpRequestHeader.UserAgent] = "InteraktikInstaller";
                client.Headers[HttpRequestHeader.CacheControl] = "no-cache";
                string raw = client.DownloadString(Base(serverUrl) + "installer.json?t=" + DateTime.UtcNow.Ticks);
                Dictionary<string, object> data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(raw);

                Manifest manifest = new Manifest();
                manifest.Version = Convert.ToInt64(data["version"]);
                if (data.ContainsKey("file") && data["file"] != null) manifest.File = data["file"].ToString();
                if (data.ContainsKey("sha256") && data["sha256"] != null) manifest.Sha256 = data["sha256"].ToString().ToLowerInvariant();
                Dictionary<string, object> files = data.ContainsKey("files") ? data["files"] as Dictionary<string, object> : null;
                if (files != null)
                {
                    foreach (KeyValuePair<string, object> entry in files) manifest.Files[entry.Key] = Convert.ToString(entry.Value).ToLowerInvariant();
                }
                return manifest;
            }
        }

        // Baja un archivo de /downloads y comprueba su huella; devuelve la ruta temporal o null si no coincide
        static string Download(string serverUrl, string name, string expectedSha256, Action<string> log)
        {
            string temp = Path.Combine(Path.GetTempPath(), "interaktik-" + Guid.NewGuid().ToString("N") + "-" + name);
            using (WebClient client = new WebClient())
            {
                client.Headers[HttpRequestHeader.UserAgent] = "InteraktikInstaller";
                client.Headers[HttpRequestHeader.CacheControl] = "no-cache";
                client.DownloadFile(Base(serverUrl) + name + "?v=" + expectedSha256.Substring(0, Math.Min(12, expectedSha256.Length)), temp);
            }
            string actual = Sha256Of(temp);
            if (!string.Equals(actual, expectedSha256, StringComparison.OrdinalIgnoreCase))
            {
                log("La descarga de " + name + " no coincide con la huella publicada; no se usa.");
                try { System.IO.File.Delete(temp); } catch (Exception) { }
                return null;
            }
            return temp;
        }

        // ---------- 1. el instalador se actualiza a si mismo ----------

        // Devuelve true si se instalo una version nueva y ya se abrio: esta ventana debe cerrarse.
        public static bool UpdateSelf(Manifest manifest, string serverUrl, Action<string> log)
        {
            if (manifest.Version <= BuildInfo.Version) return false;
            if (JustUpdated)
            {
                log("El instalador publicado (" + manifest.Version + ") es más nuevo que este, pero acaba de actualizarse; no se vuelve a intentar.");
                return false;
            }
            if (manifest.File.Length == 0 || manifest.Sha256.Length < 32)
            {
                log("La plataforma anuncia una versión nueva pero sin huella; no se actualiza.");
                return false;
            }

            log("Hay una versión nueva del instalador (" + manifest.Version + "). Descargando...");
            string temp = Download(serverUrl, manifest.File, manifest.Sha256, log);
            if (temp == null) return false;
            if (new FileInfo(temp).Length < 100 * 1024)
            {
                log("El instalador descargado es demasiado pequeño; no se usa.");
                return false;
            }

            string exe = ExePath;
            string old = exe + ".old";
            try
            {
                if (System.IO.File.Exists(old)) System.IO.File.Delete(old);
                System.IO.File.Move(exe, old); // el .exe en uso se puede renombrar
                try
                {
                    System.IO.File.Copy(temp, exe, true);
                }
                catch (Exception)
                {
                    System.IO.File.Move(old, exe); // algo salio mal: se deja todo como estaba
                    throw;
                }

                List<string> passArgs = new List<string>();
                for (int i = 0; i < OriginalArgs.Length; i++)
                {
                    if (OriginalArgs[i] == "--updated") { i++; continue; }
                    passArgs.Add(OriginalArgs[i].IndexOf(' ') >= 0 ? "\"" + OriginalArgs[i] + "\"" : OriginalArgs[i]);
                }
                passArgs.Add("--updated " + manifest.Version);
                ProcessStartInfo start = new ProcessStartInfo(exe, string.Join(" ", passArgs.ToArray()));
                start.UseShellExecute = false;
                start.WorkingDirectory = Path.GetDirectoryName(exe);
                Process.Start(start);
                try { System.IO.File.Delete(temp); } catch (Exception) { }
                log("Instalador actualizado a la versión " + manifest.Version + ". Reabriendo...");
                return true;
            }
            catch (Exception ex)
            {
                log("No pude actualizar el instalador (" + ex.Message + "). Puedes descargarlo de nuevo desde la plataforma.");
                return false;
            }
        }

        // ---------- 2. los mods ya instalados se actualizan ----------

        // Cambia un archivo ya instalado por la version publicada. Devuelve 1 si se actualizo, 0 si ya estaba al dia,
        // -1 si no se pudo (juego abierto o archivo en uso).
        static int UpdateFile(string serverUrl, string target, string name, Manifest manifest, bool gameRunning, string label, Action<string> log)
        {
            string expected;
            if (!System.IO.File.Exists(target) || !manifest.Files.TryGetValue(name, out expected) || expected.Length < 32) return 0;

            try
            {
                if (string.Equals(Sha256Of(target), expected, StringComparison.OrdinalIgnoreCase)) return 0;
            }
            catch (Exception)
            {
                return -1;
            }

            if (gameRunning)
            {
                log("Hay una actualización de " + label + ", pero el juego está abierto. Ábrela de nuevo con el juego cerrado.");
                return -1;
            }

            string temp = Download(serverUrl, name, expected, log);
            if (temp == null) return -1;
            try
            {
                System.IO.File.Copy(temp, target, true);
                log(label + " actualizado a la última versión.");
                return 1;
            }
            catch (Exception ex)
            {
                log("No pude actualizar " + label + " (" + ex.Message + "). Cierra el juego e inténtalo de nuevo.");
                return -1;
            }
            finally
            {
                try { System.IO.File.Delete(temp); } catch (Exception) { }
            }
        }

        // Devuelve cuantos archivos se actualizaron
        public static int UpdateMods(Manifest manifest, string serverUrl, Action<string> log)
        {
            int updated = 0;

            try
            {
                bool gtaRunning = Installer.GameRunning();
                foreach (string folder in Installer.FindGameFolders())
                {
                    int result = UpdateFile(serverUrl, Path.Combine(folder, @"scripts\InteraktikGTA.dll"), "InteraktikGTA.dll", manifest, gtaRunning, "el mod de GTA V", log);
                    if (result > 0) updated++;
                }
            }
            catch (Exception ex)
            {
                log("No pude revisar las actualizaciones de GTA V (" + ex.Message + ").");
            }

            try
            {
                string minecraft = MinecraftInstaller.DefaultFolder();
                if (MinecraftInstaller.IsMinecraftFolder(minecraft))
                {
                    bool running = MinecraftInstaller.GameRunning();
                    foreach (string name in new string[] { "InteraktikMod.jar", "InteraktikCubo.jar" })
                    {
                        int result = UpdateFile(serverUrl, Path.Combine(MinecraftInstaller.ModsFolder(minecraft), name), name, manifest, running, "el mod " + name, log);
                        if (result > 0) updated++;
                    }
                }
            }
            catch (Exception ex)
            {
                log("No pude revisar las actualizaciones de Minecraft (" + ex.Message + ").");
            }

            return updated;
        }

        // Revision completa al abrir el instalador. Devuelve true si el instalador se reemplazo y esta ventana debe cerrarse.
        public static bool CheckAll(string serverUrl, Action<string> log, out int modsUpdated)
        {
            modsUpdated = 0;
            if (Disabled) return false;

            Manifest manifest;
            try
            {
                manifest = Fetch(serverUrl);
            }
            catch (Exception ex)
            {
                log("No pude revisar las actualizaciones (" + ex.Message + "). Se sigue con lo instalado.");
                return false; // sin internet o sin manifiesto: se sigue con lo que hay
            }

            if (UpdateSelf(manifest, serverUrl, log)) return true;
            modsUpdated = UpdateMods(manifest, serverUrl, log);
            return false;
        }
    }
}

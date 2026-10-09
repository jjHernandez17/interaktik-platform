// Ventana del instalador: barra superior para cambiar entre GTA V y Minecraft. La pagina de Minecraft tiene dos
// secciones (Survivaltik y Cubo Gigante); cada una comprueba lo que necesita su juego, deja el enlace de descarga
// de lo que falte y, al instalar, pone cada archivo en su carpeta.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace InteraktikGtaInstaller
{
    partial class MainForm
    {
        const int BarHeight = 46;
        const string TLauncherUrl = "https://tlauncher.org/es/";
        const string JavaUrl = "https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64&package=jre";
        const string FabricUrl = "https://fabricmc.net/use/installer/";

        readonly System.Windows.Forms.Panel gtaPanel = new System.Windows.Forms.Panel();
        readonly System.Windows.Forms.Panel mcPanel = new System.Windows.Forms.Panel();
        readonly Button gtaTab = new Button();
        readonly Button mcTab = new Button();

        readonly MinecraftInstaller mcInstaller = new MinecraftInstaller();
        readonly TextBox mcFolderBox = new TextBox();
        readonly Label mcFolderInfo = new Label();
        readonly TextBox mcKeyBox = new TextBox();
        readonly Label mcKeyInfo = new Label();
        readonly Button mcTestButton = new Button();
        readonly TextBox mcLogBox = new TextBox();
        readonly CheckBox mcMoveOthers = new CheckBox();
        readonly List<GameSection> sections = new List<GameSection>();
        int mcBusy = 0;

        // Una fila de requisito: texto de estado + boton con el enlace/accion cuando falta
        class Requirement
        {
            public Label Text = new Label();
            public Button Action = new Button();
            public Func<string, bool> Check;
            public string OkText;
            public string BadText;
        }

        class GameSection
        {
            public string Game;
            public Button Tab = new Button();
            public System.Windows.Forms.Panel Panel = new System.Windows.Forms.Panel();
            public List<Requirement> Rows = new List<Requirement>();
            public Label Others = new Label();
            public Button Install = new Button();
            public Button Uninstall = new Button();
        }

        // ---------- actualizaciones automaticas ----------

        void StartUpdateCheck()
        {
            AppendLog("Instalador versión " + BuildInfo.Version + (Updater.Disabled ? " (actualizaciones desactivadas)." : "."));
            BackgroundUpdate();
        }

        // Busca una version nueva del instalador y de los mods ya instalados (sin molestar si no hay internet)
        void BackgroundUpdate()
        {
            if (Updater.Disabled) return;
            string url = installer.ServerUrl;
            ThreadPool.QueueUserWorkItem(delegate
            {
                int mods;
                bool replaced = Updater.CheckAll(url, AppendLog, out mods);
                try
                {
                    BeginInvoke((Action)delegate
                    {
                        if (replaced) { Application.Exit(); return; }
                        if (mods > 0) { RefreshStatus(); RefreshMinecraftStatus(); }
                    });
                }
                catch (Exception)
                {
                }
            });
        }

        // ---------- barra y paginas ----------

        void BuildChrome(bool startOnMinecraft)
        {
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { } // el icono del .exe (favicon de Interaktik)
            gtaPanel.Dock = DockStyle.Fill;
            gtaPanel.BackColor = Bg;
            mcPanel.Dock = DockStyle.Fill;
            mcPanel.BackColor = Bg;

            System.Windows.Forms.Panel bar = new System.Windows.Forms.Panel();
            bar.Dock = DockStyle.Top;
            bar.Height = BarHeight;
            bar.BackColor = Panel;

            StyleTab(gtaTab, "GTA V", 10, 130);
            StyleTab(mcTab, "Minecraft", 150, 130);
            gtaTab.Click += delegate { ShowPage(false); };
            mcTab.Click += delegate { ShowPage(true); };
            bar.Controls.AddRange(new Control[] { gtaTab, mcTab });

            Controls.Add(gtaPanel);
            Controls.Add(mcPanel);
            Controls.Add(bar);
            ShowPage(startOnMinecraft);
        }

        void StyleTab(Button tab, string text, int x, int width)
        {
            tab.Text = text;
            tab.SetBounds(x, 8, width, 32);
            tab.FlatStyle = FlatStyle.Flat;
            tab.FlatAppearance.BorderSize = 0;
            tab.Font = new Font("Segoe UI Semibold", 10f);
            tab.ForeColor = Color.White;
        }

        void ShowPage(bool minecraft)
        {
            mcPanel.Visible = minecraft;
            gtaPanel.Visible = !minecraft;
            mcTab.BackColor = minecraft ? Accent : Panel;
            gtaTab.BackColor = minecraft ? Panel : Accent;
            Text = minecraft ? "Interaktik Installer - Minecraft" : "Interaktik Installer - GTA V";
        }

        void AddMcLabel(Control host, string text, int x, int y, Font font, Color color)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = font;
            label.ForeColor = color;
            label.AutoSize = true;
            label.Location = new Point(x, y);
            host.Controls.Add(label);
        }

        // ---------- pagina de Minecraft ----------

        void BuildMinecraftPage(string url)
        {
            mcInstaller.ServerUrl = url;
            mcInstaller.Log = AppendLog;

            Font head = new Font("Segoe UI Semibold", 10f);
            int y = 12;
            AddMcLabel(mcPanel, "Instalar Interaktik para Minecraft", 16, y, new Font("Segoe UI Semibold", 15f), Color.White);
            y += 32;
            AddMcLabel(mcPanel, "Minecraft Java 1.21.4 con Fabric. Cierra Minecraft antes de instalar.", 18, y, Font, Muted);
            y += 28;

            AddMcLabel(mcPanel, "Carpeta de Minecraft (.minecraft)", 18, y, head, Color.White);
            y += 22;
            mcFolderBox.SetBounds(18, y, 380, 26);
            StyleBox(mcFolderBox);
            mcFolderBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            mcFolderBox.TextChanged += delegate { RefreshMinecraftStatus(); };
            Button detect = MakeButton("Detectar", 408, y - 2, 96, 30, false);
            detect.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            detect.Click += delegate { DetectMinecraft(true); };
            Button browse = MakeButton("Examinar...", 512, y - 2, 110, 30, false);
            browse.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            browse.Click += OnMcBrowse;
            mcPanel.Controls.AddRange(new Control[] { mcFolderBox, detect, browse });
            y += 30;
            mcFolderInfo.SetBounds(18, y, 604, 20);
            mcFolderInfo.ForeColor = Muted;
            mcPanel.Controls.Add(mcFolderInfo);
            y += 26;

            AddMcLabel(mcPanel, "Tu llave (c\u00f3piala desde la p\u00e1gina de tu juego en Interaktik; es la misma para los dos)", 18, y, head, Color.White);
            y += 22;
            mcKeyBox.SetBounds(18, y, 470, 26);
            StyleBox(mcKeyBox);
            mcKeyBox.UseSystemPasswordChar = true;
            mcKeyBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            mcTestButton.Text = "Probar conexi\u00f3n";
            mcTestButton.SetBounds(496, y - 2, 126, 30);
            mcTestButton.FlatStyle = FlatStyle.Flat;
            mcTestButton.BackColor = Accent;
            mcTestButton.ForeColor = Color.White;
            mcTestButton.FlatAppearance.BorderSize = 0;
            mcTestButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            mcTestButton.Click += OnMcTestKey;
            mcPanel.Controls.AddRange(new Control[] { mcKeyBox, mcTestButton });
            y += 30;
            mcKeyInfo.SetBounds(18, y, 604, 20);
            mcKeyInfo.ForeColor = Muted;
            mcKeyInfo.Text = "Comprueba que la llave sea correcta antes de instalar (con Minecraft cerrado).";
            mcPanel.Controls.Add(mcKeyInfo);
            y += 30;

            // pestanas de juego
            int tabY = y;
            AddSection(MinecraftInstaller.GameSurvival, "Survivaltik", 18, tabY, y + 42,
                "Los regalos te ayudan o te molestan en tu mundo (mobs, TNT, diamantes...).");
            AddSection(MinecraftInstaller.GameCube, "Cubo Gigante", 160, tabY, y + 42,
                "Los regalos llenan un cubo enorme de bloques; cada cubo lleno es +1 win.");
            y += 42;

            int sectionBottom = y + 216 + 4;
            mcMoveOthers.SetBounds(18, sectionBottom, 604, 24);
            mcMoveOthers.Text = "Mover otros mods a una carpeta de respaldo (recomendado)";
            mcMoveOthers.Checked = true;
            mcMoveOthers.ForeColor = Muted;
            mcPanel.Controls.Add(mcMoveOthers);
            sectionBottom += 30;

            mcLogBox.SetBounds(18, sectionBottom, 604, Math.Max(70, ClientSize.Height - BarHeight - sectionBottom - 14));
            mcLogBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            mcLogBox.Multiline = true;
            mcLogBox.ReadOnly = true;
            mcLogBox.ScrollBars = ScrollBars.Vertical;
            mcLogBox.BackColor = Panel;
            mcLogBox.ForeColor = Color.FromArgb(220, 214, 240);
            mcLogBox.BorderStyle = BorderStyle.FixedSingle;
            mcPanel.Controls.Add(mcLogBox);

            ShowSection(MinecraftInstaller.GameSurvival);

            Load += delegate
            {
                DetectMinecraft(false);
                RefreshMinecraftStatus();
            };
            // Al volver de instalar algo (TLauncher, Java, Fabric...) la lista se actualiza sola
            Activated += delegate { RefreshMinecraftStatus(); };
        }

        void AddSection(string game, string title, int tabX, int tabY, int panelY, string description)
        {
            GameSection section = new GameSection();
            section.Game = game;

            section.Tab.Text = title;
            section.Tab.SetBounds(tabX, tabY, 134, 32);
            section.Tab.FlatStyle = FlatStyle.Flat;
            section.Tab.FlatAppearance.BorderSize = 0;
            section.Tab.Font = new Font("Segoe UI Semibold", 9.5f);
            section.Tab.ForeColor = Color.White;
            section.Tab.Click += delegate { ShowSection(game); };
            mcPanel.Controls.Add(section.Tab);

            System.Windows.Forms.Panel host = section.Panel;
            host.SetBounds(18, panelY, 604, 216);
            host.BackColor = Bg;
            mcPanel.Controls.Add(host);

            int y = 0;
            AddMcLabel(host, description, 0, y, Font, Muted);
            y += 24;

            AddRequirement(section, y, "Minecraft Java instalado (carpeta .minecraft)", "Minecraft Java: no encontrado. Instala TLauncher y \u00e1brelo una vez",
                delegate (string folder) { return MinecraftInstaller.IsMinecraftFolder(folder); }, "Descargar TLauncher", delegate { OpenUrl(TLauncherUrl); });
            y += 30;
            AddRequirement(section, y, "Java 21 (lo trae Minecraft)", "Java 21: falta. Se descarga solo al abrir Minecraft 1.21.4 una vez, o desc\u00e1rgalo",
                delegate (string folder) { return MinecraftInstaller.HasGameJava(folder); }, "Descargar Java 21", delegate { OpenUrl(JavaUrl); });
            y += 30;
            AddRequirement(section, y, "Fabric 1.21.4 instalada", "Fabric 1.21.4: falta. Inst\u00e1lala con el bot\u00f3n o desde su p\u00e1gina",
                delegate (string folder) { return MinecraftInstaller.FabricVersionName(folder).Length > 0; }, "Instalar Fabric", delegate { InstallFabricFromUi(); });
            y += 30;

            Requirement mods = AddRequirement(section, y, "Mods de este juego instalados", "Mods de este juego: todav\u00eda no instalados (pulsa Instalar)",
                delegate (string folder) { return MinecraftInstaller.HasMods(folder, game); }, "", null);
            mods.Action.Visible = false;
            y += 30;

            section.Others.SetBounds(0, y, 604, 20);
            host.Controls.Add(section.Others);

            section.Install.SetBounds(0, y + 30, 300, 40);
            section.Install.Text = "Instalar " + title;
            section.Install.FlatStyle = FlatStyle.Flat;
            section.Install.BackColor = Accent;
            section.Install.ForeColor = Color.White;
            section.Install.Font = new Font("Segoe UI Semibold", 11f);
            section.Install.FlatAppearance.BorderSize = 0;
            section.Install.Click += delegate { OnMcInstall(game); };
            section.Uninstall.SetBounds(308, y + 30, 160, 40);
            section.Uninstall.Text = "Desinstalar";
            section.Uninstall.FlatStyle = FlatStyle.Flat;
            section.Uninstall.BackColor = Panel;
            section.Uninstall.ForeColor = Color.White;
            section.Uninstall.FlatAppearance.BorderColor = Color.FromArgb(70, 60, 110);
            section.Uninstall.Click += delegate { OnMcUninstall(game); };
            host.Controls.AddRange(new Control[] { section.Install, section.Uninstall });

            sections.Add(section);
        }

        Requirement AddRequirement(GameSection section, int y, string okText, string badText, Func<string, bool> check, string buttonText, Action onClick)
        {
            Requirement row = new Requirement();
            row.OkText = okText;
            row.BadText = badText;
            row.Check = check;
            row.Text.SetBounds(0, y + 3, 470, 22);
            row.Action.SetBounds(478, y, 126, 26);
            row.Action.Text = buttonText;
            row.Action.FlatStyle = FlatStyle.Flat;
            row.Action.BackColor = Panel;
            row.Action.ForeColor = Color.White;
            row.Action.FlatAppearance.BorderColor = Color.FromArgb(70, 60, 110);
            row.Action.Font = new Font("Segoe UI", 8.5f);
            if (onClick != null) row.Action.Click += delegate { onClick(); };
            section.Panel.Controls.AddRange(new Control[] { row.Text, row.Action });
            section.Rows.Add(row);
            return row;
        }

        void ShowSection(string game)
        {
            foreach (GameSection section in sections)
            {
                bool active = section.Game == game;
                section.Panel.Visible = active;
                section.Tab.BackColor = active ? Accent : Panel;
            }
            RefreshMinecraftStatus();
        }

        GameSection ActiveSection()
        {
            foreach (GameSection section in sections)
            {
                if (section.Panel.Visible) return section;
            }
            return sections[0];
        }

        // ---------- estado ----------

        void DetectMinecraft(bool announce)
        {
            string folder = MinecraftInstaller.DefaultFolder();
            if (MinecraftInstaller.IsMinecraftFolder(folder))
            {
                mcFolderBox.Text = folder;
                if (announce) AppendLog("Minecraft encontrado en " + folder);
            }
            else if (announce)
            {
                AppendLog("No encontr\u00e9 Minecraft autom\u00e1ticamente. Instala TLauncher y \u00e1brelo una vez, o usa Examinar y elige la carpeta .minecraft.");
            }
        }

        void OnMcBrowse(object sender, EventArgs e)
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Elige la carpeta .minecraft (la que tiene la carpeta versions)";
                if (dialog.ShowDialog(this) == DialogResult.OK) mcFolderBox.Text = dialog.SelectedPath;
            }
        }

        void RefreshMinecraftStatus()
        {
            if (sections.Count == 0) return;
            string folder = mcFolderBox.Text.Trim();
            bool ok = MinecraftInstaller.IsMinecraftFolder(folder);

            if (folder.Length == 0) { mcFolderInfo.Text = "Pulsa Detectar o Examinar."; mcFolderInfo.ForeColor = Muted; }
            else if (ok) { mcFolderInfo.Text = "Carpeta de Minecraft encontrada."; mcFolderInfo.ForeColor = Good; }
            else { mcFolderInfo.Text = "Esa carpeta no parece de Minecraft (no tiene la carpeta versions)."; mcFolderInfo.ForeColor = Bad; }

            if (ok && mcKeyBox.Text.Length == 0)
            {
                string existing = MinecraftInstaller.ReadExistingKey(folder);
                if (existing.Length > 0) mcKeyBox.Text = existing;
            }

            int others = ok ? MinecraftInstaller.OtherJars(folder).Count : 0;
            foreach (GameSection section in sections)
            {
                foreach (Requirement row in section.Rows)
                {
                    bool good = row.Check(ok ? folder : "");
                    SetStatus(row.Text, good, row.OkText, row.BadText);
                    if (row.Action.Text.Length > 0) row.Action.Visible = !good;
                }
                section.Others.Text = others == 0 ? "\u2714  No hay otros mods en la carpeta mods" : "!  Hay " + others + " mod(s) m\u00e1s en la carpeta mods";
                section.Others.ForeColor = others == 0 ? Good : Color.FromArgb(251, 191, 36);
                section.Install.Enabled = mcBusy == 0;
                section.Uninstall.Enabled = mcBusy == 0;
            }
        }

        // ---------- acciones ----------

        void OnMcTestKey(object sender, EventArgs e)
        {
            string key = mcKeyBox.Text.Trim();
            if (!Installer.IsValidKey(key))
            {
                mcKeyInfo.Text = "La llave no parece valida (son letras y numeros, unos 48 caracteres). Copiala de nuevo desde la pagina.";
                mcKeyInfo.ForeColor = Bad;
                return;
            }
            if (MinecraftInstaller.GameRunning())
            {
                mcKeyInfo.Text = "Cierra Minecraft antes de probar: la prueba desconectaria el mod del juego.";
                mcKeyInfo.ForeColor = Bad;
                return;
            }

            mcTestButton.Enabled = false;
            mcKeyInfo.Text = "Probando...";
            mcKeyInfo.ForeColor = Muted;
            string url = mcInstaller.ServerUrl;
            ThreadPool.QueueUserWorkItem(delegate
            {
                string message;
                int state = MinecraftInstaller.TestKey(url, key, out message);
                BeginInvoke((Action)delegate
                {
                    mcTestButton.Enabled = true;
                    mcKeyInfo.Text = (state == Installer.KeyOk ? "\u2714  " : "\u2718  ") + message;
                    mcKeyInfo.ForeColor = state == Installer.KeyOk ? Good : Bad;
                    AppendLog(message);
                });
            });
        }

        void SetMcBusy(bool busy)
        {
            mcBusy += busy ? 1 : -1;
            RefreshMinecraftStatus();
        }

        void InstallFabricFromUi()
        {
            string folder = mcFolderBox.Text.Trim();
            if (!MinecraftInstaller.IsMinecraftFolder(folder)) { AppendLog("Primero instala Minecraft (TLauncher) y elige su carpeta."); return; }
            if (MinecraftInstaller.FabricVersionName(folder).Length > 0) { AppendLog("Fabric " + MinecraftInstaller.GameVersion + " ya est\u00e1 instalada."); return; }

            SetMcBusy(true);
            ThreadPool.QueueUserWorkItem(delegate
            {
                string problem = mcInstaller.InstallFabric(folder);
                BeginInvoke((Action)delegate
                {
                    SetMcBusy(false);
                    if (problem != null)
                    {
                        AppendLog(problem);
                        if (MessageBox.Show(this, problem + "\n\n\u00bfAbro la p\u00e1gina de Fabric para instalarla a mano? (elige 1.21.4 y pulsa Install)", "Interaktik",
                            MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes) OpenUrl(FabricUrl);
                    }
                    RefreshMinecraftStatus();
                });
            });
        }

        void OnMcInstall(string game)
        {
            string folder = mcFolderBox.Text.Trim();
            string key = mcKeyBox.Text.Trim();
            bool move = mcMoveOthers.Checked;

            if (!MinecraftInstaller.IsMinecraftFolder(folder))
            {
                MessageBox.Show(this, "Todav\u00eda no encuentro Minecraft. Usa el bot\u00f3n \"Descargar TLauncher\", \u00e1brelo una vez y vuelve a pulsar Detectar.", "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            string otherGame = game == MinecraftInstaller.GameCube ? MinecraftInstaller.GameSurvival : MinecraftInstaller.GameCube;
            if (MinecraftInstaller.HasMods(folder, otherGame))
            {
                string thisName = game == MinecraftInstaller.GameCube ? "Cubo Gigante" : "Survivaltik";
                string otherName = game == MinecraftInstaller.GameCube ? "Survivaltik" : "Cubo Gigante";
                if (MessageBox.Show(this, "Ya tienes instalado " + otherName + ".\n\nLos juegos de Minecraft de Interaktik no se pueden mezclar: si instalas "
                    + thisName + ", se quitar\u00e1 " + otherName + ".\n\n\u00bfContinuar?", "Interaktik", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            }
            if (MinecraftInstaller.GameRunning())
            {
                if (MessageBox.Show(this, "Parece que Minecraft est\u00e1 abierto. Ci\u00e9rralo antes de instalar para que cargue los mods nuevos. \u00bfInstalar de todos modos?",
                    "Interaktik", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            }

            SetMcBusy(true);
            AppendLog("Instalando...");
            ThreadPool.QueueUserWorkItem(delegate
            {
                string problem = mcInstaller.Run(folder, key, move, game);
                BeginInvoke((Action)delegate
                {
                    SetMcBusy(false);
                    if (problem == null)
                    {
                        bool hasFabric = MinecraftInstaller.FabricVersionName(folder).Length > 0;
                        string where = game == MinecraftInstaller.GameCube
                            ? "3. En la p\u00e1gina del Cubo Gigante pulsa \"Crear cubo\"."
                            : "3. En la p\u00e1gina de Survivaltik crea tus reglas y prueba una.";
                        BackgroundUpdate();
                        AppendLog("Listo. Abre Minecraft con Fabric " + MinecraftInstaller.GameVersion + " y entra a un mundo: debe aparecer \"Interaktik conectado\".");
                        MessageBox.Show(this, "Instalaci\u00f3n terminada.\n\n"
                            + (hasFabric ? "" : "OJO: todav\u00eda falta Fabric " + MinecraftInstaller.GameVersion + " (usa el bot\u00f3n \"Instalar Fabric\").\n\n")
                            + "1. Abre TLauncher y elige la versi\u00f3n \"Fabric 1.21.4\".\n"
                            + "2. Entra a un mundo de Un jugador: aparece \"Interaktik conectado\".\n"
                            + where,
                            "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        AppendLog("No se pudo instalar: " + problem);
                        MessageBox.Show(this, problem, "Interaktik", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                    RefreshMinecraftStatus();
                });
            });
        }

        void OnMcUninstall(string game)
        {
            string folder = mcFolderBox.Text.Trim();
            if (!MinecraftInstaller.IsMinecraftFolder(folder)) { AppendLog("Elige primero la carpeta de Minecraft."); return; }
            if (MessageBox.Show(this, "Se quitar\u00e1n los mods de este juego (y la llave guardada si ya no queda ninguno), y se devolver\u00e1n a mods los que hayas dejado en respaldo. \u00bfContinuar?",
                "Desinstalar", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

            try { mcInstaller.Uninstall(folder, game); }
            catch (Exception ex) { AppendLog("No se pudo desinstalar: " + ex.Message); }
            RefreshMinecraftStatus();
        }
    }
}

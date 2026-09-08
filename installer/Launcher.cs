using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace DiamondERP.Launcher
{
    public class Program
    {
        private static NotifyIcon _trayIcon;
        private static ContextMenuStrip _trayMenu;
        private static string _appDir;
        private static Process _apiProcess;
        private static Process _webProcess;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "DiamondERP_Singleton_Mutex", out createdNew))
            {
                if (!createdNew)
                {
                    OpenBrowser("http://localhost:5175/");
                    return;
                }

                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                if (Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase))
                {
                    _appDir = Directory.GetParent(baseDir).FullName;
                }
                else
                {
                    _appDir = baseDir;
                }

                SetupTray();

                ThreadPool.QueueUserWorkItem(state =>
                {
                    StartServices();
                    WaitForWebAndOpenBrowser();
                });

                Application.Run();
            }
        }

        private static void SetupTray()
        {
            _trayMenu = new ContextMenuStrip();
            _trayMenu.Items.Add("Open DiamondERP", null, (s, e) => OpenBrowser("http://localhost:5175/"));
            _trayMenu.Items.Add(new ToolStripSeparator());
            _trayMenu.Items.Add("Exit & Stop App", null, (s, e) => Shutdown());

            Icon appIcon = null;
            string iconPath = Path.Combine(_appDir, "installer", "app.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(_appDir, "app.ico");
            }

            if (File.Exists(iconPath))
            {
                try { appIcon = new Icon(iconPath); } catch { }
            }
            if (appIcon == null)
            {
                appIcon = SystemIcons.Application;
            }

            _trayIcon = new NotifyIcon
            {
                Text = "DiamondERP V3.0 (Running)",
                Icon = appIcon,
                ContextMenuStrip = _trayMenu,
                Visible = true
            };

            _trayIcon.DoubleClick += (s, e) => OpenBrowser("http://localhost:5175/");
            _trayIcon.ShowBalloonTip(2000, "DiamondERP Running", "Click here or use the tray icon to open the application.", ToolTipIcon.Info);
            _trayIcon.BalloonTipClicked += (s, e) => OpenBrowser("http://localhost:5175/");
        }

        private static void StartServices()
        {
            try
            {
                if (!IsPortActive("http://localhost:3002/api/health") && !IsPortActive("http://localhost:3002/"))
                {
                    ProcessStartInfo apiInfo = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm run dev:api",
                        WorkingDirectory = _appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    _apiProcess = Process.Start(apiInfo);
                }

                if (!IsPortActive("http://localhost:5175/"))
                {
                    ProcessStartInfo webInfo = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm run dev:web",
                        WorkingDirectory = _appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    _webProcess = Process.Start(webInfo);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not start background services: " + ex.Message, "DiamondERP Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void WaitForWebAndOpenBrowser()
        {
            int attempts = 0;
            while (attempts < 25)
            {
                if (IsPortActive("http://localhost:5175/"))
                {
                    Thread.Sleep(500);
                    OpenBrowser("http://localhost:5175/");
                    return;
                }
                Thread.Sleep(800);
                attempts++;
            }

            OpenBrowser("http://localhost:5175/");
        }

        private static bool IsPortActive(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 800;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK || (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch
            {
                try
                {
                    Process.Start("cmd.exe", "/c start " + url);
                }
                catch { }
            }
        }

        private static void Shutdown()
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }

            try
            {
                if (_apiProcess != null && !_apiProcess.HasExited)
                {
                    KillProcessTree(_apiProcess.Id);
                }
            }
            catch { }

            try
            {
                if (_webProcess != null && !_webProcess.HasExited)
                {
                    KillProcessTree(_webProcess.Id);
                }
            }
            catch { }

            Application.Exit();
            Environment.Exit(0);
        }

        private static void KillProcessTree(int pid)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = string.Format("/F /T /PID {0}", pid),
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            catch { }
        }
    }
}

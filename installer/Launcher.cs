using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace DiamondERP.App
{
    public class AppMainWindow : Window
    {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private const int SW_RESTORE = 9;
        private const string WINDOW_TITLE = "Diamond ERP — Enterprise Suite";
        private const int DEFAULT_PORT = 3002;
        private const string LOOPBACK_HOST = "127.0.0.1";

        private static string _appDir;
        private static string _dataDir;
        private static bool _isProductionMode;
        private static Process _backendProcess;
        private static Process _devWebProcess;
        private static System.Windows.Forms.NotifyIcon _trayIcon;

        private WebView2 _webView;
        private Grid _loadingGrid;
        private TextBlock _statusText;

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                // Check if existing application window is already open
                IntPtr existingHwnd = FindWindow(null, WINDOW_TITLE);
                if (existingHwnd != IntPtr.Zero)
                {
                    ShowWindow(existingHwnd, SW_RESTORE);
                    SetForegroundWindow(existingHwnd);
                    return;
                }

                _appDir = ResolveApplicationDirectory();
                _dataDir = ResolveDataDirectory();
                _isProductionMode = DetectProductionMode();

                WriteLog("Startup", string.Format("Application started. Mode: {0}, AppDir: {1}, DataDir: {2}",
                    _isProductionMode ? "PRODUCTION" : "DEVELOPMENT", _appDir, _dataDir));

                AppDomain.CurrentDomain.UnhandledException += (s, e) =>
                {
                    WriteLog("UnhandledException", e.ExceptionObject != null ? e.ExceptionObject.ToString() : "Unknown exception");
                };

                var app = new Application();
                app.DispatcherUnhandledException += (s, e) =>
                {
                    WriteLog("DispatcherException", e.Exception != null ? e.Exception.ToString() : "Unknown dispatcher exception");
                    e.Handled = true;
                };

                var window = new AppMainWindow();
                app.Run(window);
            }
            catch (Exception ex)
            {
                WriteLog("MainCatch", ex.ToString());
                MessageBox.Show("Could not launch DiamondERP: " + ex.Message, "DiamondERP Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public AppMainWindow()
        {
            this.Title = WINDOW_TITLE;
            this.Width = 1360;
            this.Height = 880;
            this.MinWidth = 1024;
            this.MinHeight = 700;
            this.WindowStartupLocation = WindowStartupLocation.CenterScreen;
            this.Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)); // Slate-900

            string iconPath = Path.Combine(_appDir, "installer", "app.ico");
            if (!File.Exists(iconPath)) { iconPath = Path.Combine(_appDir, "app.ico"); }
            if (File.Exists(iconPath))
            {
                try
                {
                    this.Icon = BitmapFrame.Create(new Uri(iconPath));
                }
                catch { }
            }

            // Root layout
            var rootGrid = new Grid();
            this.Content = rootGrid;

            _webView = new WebView2();
            rootGrid.Children.Add(_webView);

            // Branded Loading Splash Overlay
            _loadingGrid = new Grid
            {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42))
            };
            var stack = new StackPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };

            var titleBlock = new TextBlock
            {
                Text = "Diamond ERP — Enterprise Suite",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 14)
            };
            stack.Children.Add(titleBlock);

            _statusText = new TextBlock
            {
                Text = "Initializing local services...",
                FontSize = 14,
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 22)
            };
            stack.Children.Add(_statusText);

            var pBar = new ProgressBar
            {
                IsIndeterminate = true,
                Width = 280,
                Height = 6,
                Background = new SolidColorBrush(Color.FromRgb(30, 41, 59)),
                Foreground = new SolidColorBrush(Color.FromRgb(59, 130, 246))
            };
            stack.Children.Add(pBar);

            _loadingGrid.Children.Add(stack);
            rootGrid.Children.Add(_loadingGrid);

            SetupTray();

            this.Loaded += (s, e) =>
            {
                StartServicesAndNavigate();
            };

            this.Closing += (s, e) =>
            {
                ShutdownBackend();
            };
        }

        // ── Architecture & Path Resolution ─────────────────────────────────────

        public static string ResolveApplicationDirectory()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase))
            {
                return Directory.GetParent(baseDir).FullName;
            }
            return baseDir;
        }

        public static string ResolveRuntimeDirectory()
        {
            string bundledNodeDir = Path.Combine(_appDir, "runtime");
            if (File.Exists(Path.Combine(bundledNodeDir, "node.exe")))
            {
                return bundledNodeDir;
            }
            return null;
        }

        public static string ResolveDataDirectory()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string dataRoot = Path.Combine(localAppData, "DiamondERP");
            if (!Directory.Exists(dataRoot))
            {
                try { Directory.CreateDirectory(dataRoot); } catch { }
            }
            return dataRoot;
        }

        public static void WriteLog(string category, string message)
        {
            try
            {
                string targetDir = _dataDir ?? ResolveDataDirectory();
                string logsDir = Path.Combine(targetDir, "logs");
                if (!Directory.Exists(logsDir))
                {
                    Directory.CreateDirectory(logsDir);
                }
                string logFile = Path.Combine(logsDir, "launcher.log");
                string entry = string.Format("[{0:o}] [{1}] {2}{3}", DateTime.Now, category, message, Environment.NewLine);
                File.AppendAllText(logFile, entry);
            }
            catch { }
        }

        private static bool DetectProductionMode()
        {
            // Production mode if built API distribution exists
            string apiDist1 = Path.Combine(_appDir, "api", "dist", "index.js");
            string apiDist2 = Path.Combine(_appDir, "dist", "index.js");
            string appsApiDist = Path.Combine(_appDir, "apps", "api", "dist", "index.js");
            return File.Exists(apiDist1) || File.Exists(apiDist2) || File.Exists(appsApiDist);
        }

        // ── Service Management & Process Lifecycle ─────────────────────────────

        private void StartServicesAndNavigate()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    string healthUrl = string.Format("http://{0}:{1}/health", LOOPBACK_HOST, DEFAULT_PORT);
                    string targetAppUrl = _isProductionMode
                        ? string.Format("http://{0}:{1}/", LOOPBACK_HOST, DEFAULT_PORT)
                        : "http://localhost:5175/";

                    // 1. Start backend process if not already responding
                    if (!IsBackendHealthy(healthUrl))
                    {
                        StartBackend();
                    }

                    // 2. In development mode, also start Vite web dev server if needed
                    if (!_isProductionMode && !IsPortActive("http://localhost:5175/"))
                    {
                        StartDevWebServer();
                    }

                    UpdateStatus("Waiting for local DiamondERP services to initialize...");

                    // 3. Wait for target service readiness
                    string readinessCheckUrl = _isProductionMode ? healthUrl : "http://localhost:5175/";
                    bool ready = WaitForBackend(readinessCheckUrl, 40, 600);

                    if (!ready)
                    {
                        throw new TimeoutException("DiamondERP services did not become ready within the expected time window.");
                    }

                    // 4. Initialize WebView2 and navigate
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        InitializeWebView2(targetAppUrl);
                    }));
                }
                catch (Exception ex)
                {
                    WriteLog("ServiceStartError", ex.ToString());
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        MessageBox.Show("Error starting DiamondERP services: " + ex.Message,
                            "DiamondERP Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }));
                }
            });
        }

        public static void StartBackend()
        {
            WriteLog("Backend", "Starting backend process...");

            if (_isProductionMode)
            {
                // PRODUCTION MODE: Run bundled or local Node against api/dist/index.js
                string runtimeDir = ResolveRuntimeDirectory();
                string nodeExe = runtimeDir != null ? Path.Combine(runtimeDir, "node.exe") : "node";

                string scriptPath = Path.Combine(_appDir, "api", "dist", "index.js");
                if (!File.Exists(scriptPath)) { scriptPath = Path.Combine(_appDir, "dist", "index.js"); }
                if (!File.Exists(scriptPath)) { scriptPath = Path.Combine(_appDir, "apps", "api", "dist", "index.js"); }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\"", scriptPath),
                    WorkingDirectory = Path.GetDirectoryName(scriptPath),
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                // Inject deterministic production environment variables
                psi.EnvironmentVariables["NODE_ENV"] = "production";
                psi.EnvironmentVariables["PORT"] = DEFAULT_PORT.ToString();
                psi.EnvironmentVariables["HOST"] = LOOPBACK_HOST;
                psi.EnvironmentVariables["DIAMOND_DATA_DIR"] = _dataDir;

                _backendProcess = Process.Start(psi);
                WriteLog("Backend", string.Format("Started production Node backend (PID: {0})", _backendProcess != null ? _backendProcess.Id : 0));
            }
            else
            {
                // DEVELOPMENT MODE: Fall back to npm workspace runner
                ProcessStartInfo devPsi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npm run dev:api",
                    WorkingDirectory = _appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                _backendProcess = Process.Start(devPsi);
                WriteLog("Backend", string.Format("Started development API process via npm (PID: {0})", _backendProcess != null ? _backendProcess.Id : 0));
            }

            if (_backendProcess != null)
            {
                _backendProcess.EnableRaisingEvents = true;
                _backendProcess.Exited += (s, e) => HandleBackendExit();
            }
        }

        private static void StartDevWebServer()
        {
            WriteLog("DevWeb", "Starting development Vite web server...");
            ProcessStartInfo webInfo = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c npm run dev:web",
                WorkingDirectory = _appDir,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            _devWebProcess = Process.Start(webInfo);
        }

        public static bool WaitForBackend(string probeUrl, int maxAttempts, int delayMs)
        {
            int attempts = 0;
            while (attempts < maxAttempts)
            {
                if (IsPortActive(probeUrl))
                {
                    return true;
                }
                Thread.Sleep(delayMs);
                attempts++;
            }
            return false;
        }

        public async void InitializeWebView2(string targetUrl)
        {
            try
            {
                // Verify WebView2 Runtime availability
                string wvVersion = null;
                try
                {
                    wvVersion = CoreWebView2Environment.GetAvailableBrowserVersionString();
                }
                catch { }

                if (string.IsNullOrEmpty(wvVersion))
                {
                    WriteLog("WebView2Error", "Microsoft Edge WebView2 Runtime was not detected on this system.");
                    string msg = "Microsoft Edge WebView2 Runtime is required to run DiamondERP on Windows.\n\n" +
                                 "Please download and install Microsoft Edge WebView2 from Microsoft, or contact your system administrator.";
                    MessageBox.Show(msg, "WebView2 Runtime Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                string webViewDataDir = Path.Combine(_dataDir, "WebView2Data");
                if (!Directory.Exists(webViewDataDir))
                {
                    Directory.CreateDirectory(webViewDataDir);
                }

                var env = await CoreWebView2Environment.CreateAsync(null, webViewDataDir);
                await _webView.EnsureCoreWebView2Async(env);

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = !_isProductionMode;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                _webView.NavigationCompleted += (s, args) =>
                {
                    if (args.IsSuccess)
                    {
                        _loadingGrid.Visibility = Visibility.Collapsed;
                    }
                    else
                    {
                        WriteLog("NavigationError", "Failed to navigate to: " + targetUrl);
                    }
                };

                _webView.Source = new Uri(targetUrl);
            }
            catch (Exception ex)
            {
                WriteLog("WebView2InitError", ex.ToString());
                MessageBox.Show("Could not initialize desktop application view: " + ex.Message,
                    "DiamondERP View Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        public static void HandleBackendExit()
        {
            if (_backendProcess != null && _backendProcess.HasExited)
            {
                WriteLog("BackendExited", string.Format("Backend process exited with code: {0}", _backendProcess.ExitCode));
            }
        }

        public static void ShutdownBackend()
        {
            WriteLog("Shutdown", "Shutting down application launcher and backend services...");

            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
            }

            try
            {
                if (_backendProcess != null && !_backendProcess.HasExited)
                {
                    KillProcessTree(_backendProcess.Id);
                }
            }
            catch { }

            try
            {
                if (_devWebProcess != null && !_devWebProcess.HasExited)
                {
                    KillProcessTree(_devWebProcess.Id);
                }
            }
            catch { }
        }

        // ── Helper Utilities ───────────────────────────────────────────────────

        private static bool IsBackendHealthy(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 900;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
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

        private void SetupTray()
        {
            try
            {
                string iconPath = Path.Combine(_appDir, "installer", "app.ico");
                if (!File.Exists(iconPath)) { iconPath = Path.Combine(_appDir, "app.ico"); }

                System.Drawing.Icon appIcon = null;
                if (File.Exists(iconPath))
                {
                    try { appIcon = new System.Drawing.Icon(iconPath); } catch { }
                }
                if (appIcon == null) { appIcon = System.Drawing.SystemIcons.Application; }

                var menu = new System.Windows.Forms.ContextMenuStrip();
                menu.Items.Add("Open DiamondERP", null, (s, e) =>
                {
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        this.Show();
                        this.WindowState = WindowState.Normal;
                        this.Activate();
                    }));
                });
                menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
                menu.Items.Add("Exit Application", null, (s, e) =>
                {
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        ShutdownBackend();
                        Application.Current.Shutdown();
                    }));
                });

                _trayIcon = new System.Windows.Forms.NotifyIcon
                {
                    Text = "Diamond ERP — Enterprise Suite",
                    Icon = appIcon,
                    ContextMenuStrip = menu,
                    Visible = true
                };

                _trayIcon.DoubleClick += (s, e) =>
                {
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        this.Show();
                        this.WindowState = WindowState.Normal;
                        this.Activate();
                    }));
                };
            }
            catch { }
        }

        private void UpdateStatus(string msg)
        {
            this.Dispatcher.Invoke(new Action(() =>
            {
                if (_statusText != null)
                {
                    _statusText.Text = msg;
                }
            }));
        }
    }
}

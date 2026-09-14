using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Interop;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

[assembly: AssemblyTitle("Diamond ERP")]
[assembly: AssemblyDescription("Diamond ERP Desktop Application")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Diamond ERP")]
[assembly: AssemblyProduct("Diamond ERP")]
[assembly: AssemblyCopyright("Copyright © 2025-2026 Diamond ERP")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("3.0.0.0")]
[assembly: AssemblyFileVersion("3.0.0.0")]
[assembly: AssemblyInformationalVersion("3.0.0")]

namespace DiamondERP.App
{
    public enum BackendState
    {
        NotStarted,
        Starting,
        Running,
        Stopping,
        Stopped,
        Failed
    }

    public class AppMainWindow : Window
    {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AttachConsole(int dwProcessId);
        private const int ATTACH_PARENT_PROCESS = -1;

        private const int SW_RESTORE = 9;
        private const string WINDOW_TITLE = "Diamond ERP — Enterprise Suite";
        private const int DEFAULT_PORT = 3002;
        private const string LOOPBACK_HOST = "127.0.0.1";
        private const int MAX_BACKEND_RESTARTS = 2;
        private static int _webViewCrashCount = 0;
        private const int MAX_WEBVIEW_RESTARTS = 2;
        private static int _profileRecoveryAttempts = 0;
        private const int MAX_PROFILE_RECOVERY_ATTEMPTS = 1;

        private static string _appDir;
        private static string _dataDir;
        private static bool _isProductionMode;
        private static Process _backendProcess;
        private static int _backendPid = 0;
        private static bool _backendStartedByThisLauncher = false;
        private static Process _devWebProcess;
        private static System.Windows.Forms.NotifyIcon _trayIcon;
        private static int _backendRestartCount = 0;
        private static volatile bool _isShuttingDown = false;
        private static volatile bool _shutdownRequested = false;
        private static int _shutdownInitiated = 0;
        private static readonly object _shutdownLock = new object();
        private static volatile BackendState _backendState = BackendState.NotStarted;
        private static Stopwatch _startupStopwatch;

        private WebView2 _webView;
        private Grid _loadingGrid;
        private TextBlock _statusText;

        [STAThread]
        public static void Main(string[] args)
        {
            // Command-line diagnostics and version inspection
            if (args != null && args.Length > 0)
            {
                AttachConsole(ATTACH_PARENT_PROCESS);
                try
                {
                    var stdout = Console.OpenStandardOutput();
                    var writer = new StreamWriter(stdout, Console.OutputEncoding) { AutoFlush = true };
                    Console.SetOut(writer);
                }
                catch { }

                if (args[0].Equals("--check-env", StringComparison.OrdinalIgnoreCase))
                {
                    string ad = ResolveApplicationDirectory();
                    string dd = ResolveDataDirectory();
                    string rd = ResolveRuntimeDirectory();
                    bool ip = DetectProductionMode();

                    string nodeExe = rd != null ? Path.Combine(rd, "node.exe") : Path.Combine(ad, "runtime", "node.exe");
                    string apiEntry = Path.Combine(ad, "api", "dist", "index.js");
                    string webDist = Path.Combine(ad, "web", "dist");

                    bool nodeExists = File.Exists(nodeExe);
                    bool apiExists = File.Exists(apiEntry);
                    bool webDistExists = Directory.Exists(webDist) && File.Exists(Path.Combine(webDist, "index.html"));

                    // Compact single-line summary for backwards compatibility with tests
                    Console.WriteLine(string.Format("MODE:{0}|APPDIR:{1}|DATADIR:{2}|RUNTIMEDIR:{3}",
                        ip ? "PRODUCTION" : "DEVELOPMENT", ad, dd, rd ?? "NULL"));

                    // Expanded diagnostic contract
                    Console.WriteLine(string.Format("MODE:{0}", ip ? "PRODUCTION" : "DEVELOPMENT"));
                    Console.WriteLine(string.Format("APPDIR:{0}", ad));
                    Console.WriteLine(string.Format("DATADIR:{0}", dd));
                    Console.WriteLine(string.Format("NODE_RUNTIME:{0}", nodeExe));
                    Console.WriteLine(string.Format("API_ENTRY:{0}", apiEntry));
                    Console.WriteLine(string.Format("WEB_DIST:{0}", webDist));
                    Console.WriteLine(string.Format("NODE_RUNTIME_EXISTS:{0}", nodeExists.ToString().ToLower()));
                    Console.WriteLine(string.Format("API_ENTRY_EXISTS:{0}", apiExists.ToString().ToLower()));
                    Console.WriteLine(string.Format("WEB_DIST_EXISTS:{0}", webDistExists.ToString().ToLower()));

                    bool valid = ip ? (nodeExists && apiExists && webDistExists) : true;
                    Environment.ExitCode = valid ? 0 : 1;
                    return;
                }
                else if (args[0].Equals("--version", StringComparison.OrdinalIgnoreCase) || args[0].Equals("-v", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("Diamond ERP v3.0.0");
                    Environment.ExitCode = 0;
                    return;
                }
                else if (args[0].Equals("--shutdown", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        using (var evt = EventWaitHandle.OpenExisting("Global\\DiamondERP_Shutdown_Event"))
                        {
                            evt.Set();
                            Console.WriteLine("SHUTDOWN_SIGNALED");
                            Environment.ExitCode = 0;
                            return;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("SHUTDOWN_ERROR:" + ex.Message);
                        Environment.ExitCode = 1;
                        return;
                    }
                }
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "Global\\DiamondERP_SingleInstance_Mutex", out createdNew))
            {
                if (!createdNew)
                {
                    IntPtr existingHwnd = FindWindow(null, WINDOW_TITLE);
                    if (existingHwnd != IntPtr.Zero)
                    {
                        ShowWindow(existingHwnd, SW_RESTORE);
                        SetForegroundWindow(existingHwnd);
                    }
                    return;
                }

                EventWaitHandle shutdownEvent = null;
                try
                {
                    bool createdEvt;
                    shutdownEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "Global\\DiamondERP_Shutdown_Event", out createdEvt);
                    ThreadPool.QueueUserWorkItem(state =>
                    {
                        try
                        {
                            shutdownEvent.WaitOne();
                            WriteLog("SHUTDOWN", "Shutdown signaled via IPC event. Initiating clean exit...");
                            _shutdownRequested = true;
                            if (Application.Current != null)
                            {
                                Application.Current.Dispatcher.Invoke(new Action(() =>
                                {
                                    ShutdownBackend();
                                    try { Application.Current.Shutdown(); } catch { }
                                    try { Environment.Exit(0); } catch { }
                                }));
                            }
                            else
                            {
                                _shutdownRequested = true;
                                ShutdownBackend();
                                try { Environment.Exit(0); } catch { }
                            }
                        }
                        catch { }
                    });

                    _appDir = ResolveApplicationDirectory();
                    _dataDir = ResolveDataDirectory();
                    _isProductionMode = DetectProductionMode();

                    WriteLog("STARTUP", string.Format("Application started. Mode: {0}, AppDir: {1}, DataDir: {2}",
                        _isProductionMode ? "PRODUCTION" : "DEVELOPMENT", _appDir, _dataDir));

                    AppDomain.CurrentDomain.UnhandledException += (s, e) =>
                    {
                        WriteLog("ERROR", e.ExceptionObject != null ? e.ExceptionObject.ToString() : "Unknown unhandled domain exception");
                    };

                    AppDomain.CurrentDomain.ProcessExit += (s, e) =>
                    {
                        ShutdownBackend();
                    };

                    var app = new Application();
                    app.DispatcherUnhandledException += (s, e) =>
                    {
                        WriteLog("ERROR", e.Exception != null ? e.Exception.ToString() : "Unknown dispatcher exception");
                        e.Handled = true;
                    };

                    var window = new AppMainWindow();
                    app.Run(window);
                }
                catch (Exception ex)
                {
                    WriteLog("ERROR", "Main execution error: " + ex.ToString());
                    MessageBox.Show("Could not launch DiamondERP: " + ex.Message, "DiamondERP Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
                finally
                {
                    if (shutdownEvent != null)
                    {
                        try { shutdownEvent.Dispose(); } catch { }
                    }
                }
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

            // Suppress unwanted browser shortcuts in production mode while preserving normal ERP text editing
            this.PreviewKeyDown += (s, e) =>
            {
                if (_isProductionMode)
                {
                    Key actualKey = (e.Key == Key.System) ? e.SystemKey : e.Key;
                    var mods = Keyboard.Modifiers;
                    bool isCtrl = (mods & ModifierKeys.Control) == ModifierKeys.Control;
                    bool isShift = (mods & ModifierKeys.Shift) == ModifierKeys.Shift;
                    bool isAlt = (mods & ModifierKeys.Alt) == ModifierKeys.Alt;

                    // Suppress DevTools (F12)
                    if (actualKey == Key.F12)
                    {
                        e.Handled = true;
                        return;
                    }
                    // Suppress Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (Chromium DevTools / Inspect)
                    if (isCtrl && isShift && (actualKey == Key.I || actualKey == Key.J || actualKey == Key.C))
                    {
                        e.Handled = true;
                        return;
                    }
                    // Suppress Ctrl+R, F5 (unwanted browser reloads)
                    if (actualKey == Key.F5 || (isCtrl && actualKey == Key.R))
                    {
                        e.Handled = true;
                        return;
                    }
                    // Suppress Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+O, Ctrl+U, Ctrl+D, Ctrl+H, Ctrl+J (browser window/tab/history actions)
                    if (isCtrl && !isShift && !isAlt &&
                        (actualKey == Key.N || actualKey == Key.T || actualKey == Key.W || actualKey == Key.L ||
                         actualKey == Key.O || actualKey == Key.U || actualKey == Key.D || actualKey == Key.H || actualKey == Key.J))
                    {
                        e.Handled = true;
                        return;
                    }
                    // Suppress Alt+Left, Alt+Right (browser history back/forward navigation)
                    if (isAlt && (actualKey == Key.Left || actualKey == Key.Right))
                    {
                        e.Handled = true;
                        return;
                    }

                    // Note: Legitimate ERP user input MUST remain unaffected:
                    // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y, Tab, Shift+Tab, Enter, Escape, Arrow keys
                }
            };

            SetupTray();

            this.Loaded += (s, e) =>
            {
                StartServicesAndNavigate();
            };

            this.Closing += (s, e) =>
            {
                _shutdownRequested = true;
                DisposeWebView();
                ShutdownBackend();
                if (Application.Current != null)
                {
                    try { Application.Current.Shutdown(); } catch { }
                }
                try { Environment.Exit(0); } catch { }
            };
        }

        private void DisposeWebView()
        {
            try
            {
                if (_webView != null)
                {
                    _webView.Stop();
                    _webView.Dispose();
                    _webView = null;
                }
            }
            catch { }
        }

        protected override void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);
            HwndSource source = PresentationSource.FromVisual(this) as HwndSource;
            if (source != null)
            {
                source.AddHook(WndProc);
            }
        }

        private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            const int WM_CLOSE = 0x0010;
            if (msg == WM_CLOSE)
            {
                WriteLog("SHUTDOWN", "WM_CLOSE received via WndProc. Initiating clean exit...");
                _shutdownRequested = true;
                ShutdownBackend();
                if (Application.Current != null)
                {
                    try { Application.Current.Shutdown(); } catch { }
                }
                try { Environment.Exit(0); } catch { }
            }
            return IntPtr.Zero;
        }

        // ── Architecture & Path Resolution ─────────────────────────────────────

        public static string ResolveApplicationDirectory()
        {
            if (!string.IsNullOrEmpty(_appDir)) return _appDir;
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase))
            {
                _appDir = Directory.GetParent(baseDir).FullName;
            }
            else
            {
                _appDir = baseDir;
            }
            return _appDir;
        }

        public static string ResolveRuntimeDirectory()
        {
            string appDir = _appDir ?? ResolveApplicationDirectory();
            string bundledNodeDir = Path.Combine(appDir, "runtime");
            if (File.Exists(Path.Combine(bundledNodeDir, "node.exe")))
            {
                return bundledNodeDir;
            }
            return null;
        }

        public static string ResolveDataDirectory()
        {
            if (!string.IsNullOrEmpty(_dataDir)) return _dataDir;
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string dataRoot = Path.Combine(localAppData, "DiamondERP");
            if (!Directory.Exists(dataRoot))
            {
                try { Directory.CreateDirectory(dataRoot); } catch { }
            }
            _dataDir = dataRoot;
            return _dataDir;
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
            string appDir = _appDir ?? ResolveApplicationDirectory();
            // Production mode: authoritative compiled backend entrypoint at api\dist\index.js
            string canonicalApiDist = Path.Combine(appDir, "api", "dist", "index.js");
            return File.Exists(canonicalApiDist);
        }

        // ── Service Management & Process Lifecycle ─────────────────────────────

        private void StartServicesAndNavigate()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    _startupStopwatch = Stopwatch.StartNew();
                    string healthUrl = string.Format("http://{0}:{1}/health", LOOPBACK_HOST, DEFAULT_PORT);
                    string targetAppUrl = _isProductionMode
                        ? string.Format("http://{0}:{1}/", LOOPBACK_HOST, DEFAULT_PORT)
                        : "http://localhost:5175/";

                    // 1. Port conflict detection & starting backend process
                    if (IsTcpPortInUse(DEFAULT_PORT))
                    {
                        if (!IsBackendHealthy(healthUrl))
                        {
                            WriteLog("ERROR", string.Format("Port {0} is occupied by an unrelated or unhealthy application.", DEFAULT_PORT));
                            throw new InvalidOperationException(string.Format("Port {0} is already in use by another application. Please terminate the conflicting process before launching DiamondERP.", DEFAULT_PORT));
                        }
                        _backendStartedByThisLauncher = false;
                        WriteLog("HEALTH_CHECK", "Existing healthy DiamondERP backend detected on loopback port. Attaching to existing instance.");
                    }
                    else
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
                    bool ready = WaitForBackend(readinessCheckUrl, 40, 500);

                    if (!ready)
                    {
                        if (_backendProcess != null && _backendProcess.HasExited)
                        {
                            WriteLog("ERROR", string.Format("DiamondERP backend process terminated before becoming ready (exit code: {0}).", _backendProcess.ExitCode));
                            throw new InvalidOperationException(string.Format("DiamondERP backend process terminated before becoming ready (exit code: {0}). Please check logs in {1}.",
                                _backendProcess.ExitCode, Path.Combine(_dataDir, "logs")));
                        }
                        WriteLog("ERROR", "DiamondERP services failed to become ready within the expected timeout window.");
                        throw new TimeoutException("DiamondERP services did not become ready within the expected time window. Please restart the application.");
                    }

                    if (_startupStopwatch != null)
                    {
                        _startupStopwatch.Stop();
                        WriteLog("HEALTH_CHECK", string.Format("Backend validated ready in {0}ms.", _startupStopwatch.ElapsedMilliseconds));
                    }

                    // 4. Initialize WebView2 and navigate
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        InitializeWebView2(targetAppUrl);
                    }));
                }
                catch (Exception ex)
                {
                    WriteLog("ERROR", "Startup failure: " + ex.ToString());
                    FailStartup(ex.Message);
                }
            });
        }

        private void FailStartup(string reason)
        {
            _shutdownRequested = true;
            _backendState = BackendState.Failed;
            ShutdownBackend();
            this.Dispatcher.Invoke(new Action(() =>
            {
                MessageBox.Show("Error starting DiamondERP services: " + reason,
                    "DiamondERP Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
                if (Application.Current != null)
                {
                    Application.Current.Shutdown();
                }
                else
                {
                    this.Close();
                }
            }));
        }

        public static void StartBackend()
        {
            _backendState = BackendState.Starting;
            WriteLog("BACKEND_START", "Starting backend process...");

            if (_isProductionMode)
            {
                // PRODUCTION MODE: Require bundled Node against api/dist/index.js
                string runtimeDir = ResolveRuntimeDirectory();
                if (string.IsNullOrEmpty(runtimeDir))
                {
                    string err = "Bundled Node.js runtime not found in: " + Path.Combine(_appDir, "runtime", "node.exe") +
                                 "\n\nThe Diamond ERP standalone installation is incomplete. Please reinstall the application.";
                    WriteLog("ERROR", err);
                    throw new FileNotFoundException(err);
                }

                string nodeExe = Path.Combine(runtimeDir, "node.exe");

                // Canonical production entrypoint: <appDir>\api\dist\index.js
                string scriptPath = Path.Combine(_appDir, "api", "dist", "index.js");

                if (!File.Exists(scriptPath))
                {
                    string err = "Production API entrypoint not found in: " + scriptPath +
                                 "\n\nThe Diamond ERP standalone installation is incomplete. Please reinstall the application.";
                    WriteLog("ERROR", err);
                    throw new FileNotFoundException(err);
                }

                string apiDir = Path.Combine(_appDir, "api");
                if (!Directory.Exists(apiDir)) { apiDir = Path.GetDirectoryName(scriptPath); }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\"", scriptPath),
                    WorkingDirectory = apiDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                // Inject deterministic production environment variables (NO universal hardcoded credentials)
                psi.EnvironmentVariables["NODE_ENV"] = "production";
                psi.EnvironmentVariables["PORT"] = DEFAULT_PORT.ToString();
                psi.EnvironmentVariables["HOST"] = LOOPBACK_HOST;
                psi.EnvironmentVariables["DIAMOND_DATA_DIR"] = _dataDir;
                psi.EnvironmentVariables["DIAMOND_DESKTOP_PARENT_PID"] = Process.GetCurrentProcess().Id.ToString();

                _backendProcess = Process.Start(psi);
                if (_backendProcess != null)
                {
                    _backendPid = _backendProcess.Id;
                    _backendStartedByThisLauncher = true;
                    _backendState = BackendState.Running;
                    _backendProcess.OutputDataReceived += (s, e) =>
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            WriteLog("BackendOut", e.Data);
                        }
                    };
                    _backendProcess.ErrorDataReceived += (s, e) =>
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            WriteLog("BackendErr", e.Data);
                        }
                    };
                    _backendProcess.BeginOutputReadLine();
                    _backendProcess.BeginErrorReadLine();
                }
                WriteLog("BACKEND_START", string.Format("Started production Node backend (PID: {0}, Port: {1}, Runtime: {2}, Entry: {3})",
                    _backendPid, DEFAULT_PORT, nodeExe, scriptPath));
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
                if (_backendProcess != null)
                {
                    _backendPid = _backendProcess.Id;
                    _backendStartedByThisLauncher = true;
                    _backendState = BackendState.Running;
                }
                WriteLog("BACKEND_START", string.Format("Started development API process via npm (PID: {0})", _backendPid));
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
                // Immediate fail-fast if backend child process exited prematurely
                if (_backendStartedByThisLauncher && _backendProcess != null && _backendProcess.HasExited)
                {
                    WriteLog("ERROR", string.Format("Backend process exited prematurely with code {0} during readiness probe.", _backendProcess.ExitCode));
                    return false;
                }

                if (_isProductionMode)
                {
                    if (IsBackendHealthy(probeUrl))
                    {
                        return true;
                    }
                }
                else
                {
                    if (IsPortActive(probeUrl))
                    {
                        return true;
                    }
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
                    WriteLog("ERROR", "Microsoft Edge WebView2 Runtime was not detected on this system.");
                    string msg = "Microsoft Edge WebView2 Runtime is required to run DiamondERP on Windows.\n\n" +
                                 "Please install Microsoft Edge WebView2, or contact your system administrator.";
                    MessageBox.Show(msg, "WebView2 Runtime Required", MessageBoxButton.OK, MessageBoxImage.Warning);
                    _shutdownRequested = true;
                    ShutdownBackend();
                    if (Application.Current != null) Application.Current.Shutdown();
                    return;
                }

                string webViewDataDir = Path.Combine(_dataDir, "WebView2Data");
                if (!Directory.Exists(webViewDataDir))
                {
                    Directory.CreateDirectory(webViewDataDir);
                }

                WriteLog("WEBVIEW_START", string.Format("Initializing WebView2 desktop environment (Runtime: {0}, Profile: {1})...", wvVersion, webViewDataDir));
                CoreWebView2Environment env = null;
                bool needsRecovery = false;
                try
                {
                    env = await CoreWebView2Environment.CreateAsync(null, webViewDataDir);
                    await _webView.EnsureCoreWebView2Async(env);
                }
                catch (Exception initEx)
                {
                    WriteLog("WARN", "Initial WebView2 environment creation failed: " + initEx.Message + ". Checking profile recovery eligibility...");
                    if (_profileRecoveryAttempts < MAX_PROFILE_RECOVERY_ATTEMPTS)
                    {
                        needsRecovery = true;
                    }
                    else
                    {
                        WriteLog("ERROR", "Max profile recovery attempts reached. Cannot recover WebView2 profile.");
                        throw;
                    }
                }

                if (needsRecovery)
                {
                    _profileRecoveryAttempts++;
                    WriteLog("PROFILE_RECOVERY", string.Format("Attempting safe profile recovery ({0}/{1})...", _profileRecoveryAttempts, MAX_PROFILE_RECOVERY_ATTEMPTS));

                    // Safe Corrupted Profile Recovery:
                    // Back up and recreate ONLY %LOCALAPPDATA%\DiamondERP\WebView2Data (NEVER touching databases, uploads, backups, or logs!)
                    bool recovered = TrySafeRecoverCorruptProfile(webViewDataDir);
                    if (!recovered)
                    {
                        throw new InvalidOperationException("Could not safely recover corrupted WebView2 profile.");
                    }

                    env = await CoreWebView2Environment.CreateAsync(null, webViewDataDir);
                    await _webView.EnsureCoreWebView2Async(env);
                    WriteLog("WEBVIEW_START", "WebView2 desktop environment successfully initialized after safe profile recovery.");
                }

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDevToolsEnabled = !_isProductionMode;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
                _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = !_isProductionMode;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = !_isProductionMode;
                _webView.CoreWebView2.Settings.IsBuiltInErrorPageEnabled = false;

                // Handle post-initialization process failure (renderer, GPU, utility, or browser crash)
                _webView.CoreWebView2.ProcessFailed += (s, args) =>
                {
                    WriteLog("ERROR", string.Format("WebView2 Core Process Failed. Kind: {0}, Reason: {1}, ExitCode: {2}", 
                        args.ProcessFailedKind, args.Reason, args.ExitCode));

                    if (_shutdownRequested || _isShuttingDown)
                    {
                        return;
                    }

                    bool isRendererFailure =
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited ||
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive ||
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.FrameRenderProcessExited;

                    bool isGpuOrUtilityFailure =
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.GpuProcessExited ||
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.UtilityProcessExited;

                    bool isBrowserExit =
                        args.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited;

                    if ((isRendererFailure || isGpuOrUtilityFailure) && _webViewCrashCount < MAX_WEBVIEW_RESTARTS)
                    {
                        _webViewCrashCount++;
                        WriteLog("WEBVIEW_RESTART", string.Format("Attempting bounded WebView2 renderer reload ({0}/{1})...", _webViewCrashCount, MAX_WEBVIEW_RESTARTS));
                        bool reloaded = false;
                        this.Dispatcher.Invoke(new Action(() =>
                        {
                            try
                            {
                                _webView.CoreWebView2.Reload();
                                reloaded = true;
                                WriteLog("WEBVIEW_RESTART", "WebView2 CoreWebView2.Reload() executed successfully.");
                            }
                            catch (Exception reloadEx)
                            {
                                WriteLog("ERROR", "WebView2 reload failed: " + reloadEx.Message);
                            }
                        }));
                        if (reloaded) return;
                    }
                    else if (isBrowserExit && _webViewCrashCount < MAX_WEBVIEW_RESTARTS)
                    {
                        _webViewCrashCount++;
                        WriteLog("WEBVIEW_RESTART", string.Format("Attempting controlled WebView2 browser process recovery ({0}/{1})...", _webViewCrashCount, MAX_WEBVIEW_RESTARTS));
                        bool reinitialized = false;
                        this.Dispatcher.Invoke(new Action(() =>
                        {
                            try
                            {
                                InitializeWebView2(targetUrl);
                                reinitialized = true;
                            }
                            catch (Exception reinEx)
                            {
                                WriteLog("ERROR", "WebView2 re-initialization failed: " + reinEx.Message);
                            }
                        }));
                        if (reinitialized) return;
                    }

                    WriteLog("ERROR", "WebView2 process failure limit exceeded or unrecoverable. Initiating clean application shutdown.");
                    this.Dispatcher.Invoke(new Action(() =>
                    {
                        MessageBox.Show("The desktop display encountered an unexpected failure and must close.\n\nYour business database records in AppData have been safely preserved.",
                            "DiamondERP View Failure", MessageBoxButton.OK, MessageBoxImage.Error);
                        _shutdownRequested = true;
                        ShutdownBackend();
                        if (Application.Current != null) Application.Current.Shutdown();
                    }));
                };

                // Security: Restrict navigation strictly according to centralized policy
                _webView.CoreWebView2.NavigationStarting += (s, args) =>
                {
                    Uri uri;
                    if (Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
                    {
                        if (IsAllowedApplicationUri(uri))
                        {
                            return;
                        }

                        args.Cancel = true;
                        WriteLog("NAV_RESTRICT", "Blocked navigation to URI: " + args.Uri);

                        // Route external web links (http/https) to default system browser
                        // Reject file://, javascript:, data:, vbscript:, arbitrary ports
                        if (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                        {
                            try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); } catch { }
                        }
                    }
                    else
                    {
                        args.Cancel = true;
                        WriteLog("NAV_RESTRICT", "Blocked invalid navigation: " + args.Uri);
                    }
                };

                // Open popup links in default system browser
                _webView.CoreWebView2.NewWindowRequested += (s, args) =>
                {
                    args.Handled = true;
                    if (!string.IsNullOrEmpty(args.Uri))
                    {
                        Uri uri;
                        if (Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
                        {
                            if (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                            {
                                try { Process.Start(new ProcessStartInfo(args.Uri) { UseShellExecute = true }); } catch { }
                            }
                        }
                    }
                };

                _webView.NavigationCompleted += (s, args) =>
                {
                    if (args.IsSuccess)
                    {
                        _loadingGrid.Visibility = Visibility.Collapsed;
                    }
                    else
                    {
                        WriteLog("ERROR", "Failed to navigate to: " + targetUrl);
                    }
                };

                _webView.Source = new Uri(targetUrl);
            }
            catch (Exception ex)
            {
                WriteLog("ERROR", "WebView2 initialization failure: " + ex.ToString());
                MessageBox.Show("Could not initialize desktop application view: " + ex.Message,
                    "DiamondERP View Error", MessageBoxButton.OK, MessageBoxImage.Error);
                _shutdownRequested = true;
                ShutdownBackend();
                if (Application.Current != null) Application.Current.Shutdown();
            }
        }

        public static bool IsAllowedApplicationUri(Uri uri)
        {
            if (uri == null) return false;
            if (uri.Scheme != Uri.UriSchemeHttp) return false;

            if (_isProductionMode)
            {
                // Production mode: Strictly loopback DEFAULT_PORT (3002) only. Disallow 5175 and arbitrary ports.
                return string.Equals(uri.Host, LOOPBACK_HOST, StringComparison.OrdinalIgnoreCase) && uri.Port == DEFAULT_PORT;
            }
            else
            {
                // Development mode: Allow loopback or localhost on 3002 or 5175
                bool isHostAllowed = string.Equals(uri.Host, LOOPBACK_HOST, StringComparison.OrdinalIgnoreCase) ||
                                     string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase);
                bool isPortAllowed = (uri.Port == DEFAULT_PORT) || (uri.Port == 5175);
                return isHostAllowed && isPortAllowed;
            }
        }

        public static bool IsSafeWebView2DataPath(string targetPath)
        {
            if (string.IsNullOrEmpty(targetPath)) return false;
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string expected = Path.Combine(localAppData, "DiamondERP", "WebView2Data");
                string normalizedTarget = Path.GetFullPath(targetPath).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string normalizedExpected = Path.GetFullPath(expected).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                return string.Equals(normalizedTarget, normalizedExpected, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static bool TrySafeRecoverCorruptProfile(string webViewDataDir)
        {
            // CRITICAL SAFETY GUARD:
            // Path MUST be EXACTLY %LOCALAPPDATA%\DiamondERP\WebView2Data (normalized).
            // NEVER touch databases, uploads, backups, or logs!
            if (!IsSafeWebView2DataPath(webViewDataDir))
            {
                WriteLog("ERROR", "Safety guard rejected WebView2Data recovery for unauthorized or unexpected path: " + webViewDataDir);
                return false;
            }

            try
            {
                if (Directory.Exists(webViewDataDir))
                {
                    string timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
                    string backupDir = webViewDataDir + ".corrupt." + timestamp;
                    WriteLog("PROFILE_RECOVERY", string.Format("Renaming corrupt profile from '{0}' to '{1}'", webViewDataDir, backupDir));

                    try
                    {
                        Directory.Move(webViewDataDir, backupDir);
                        WriteLog("PROFILE_RECOVERY", "Corrupt profile directory renamed successfully to: " + backupDir);
                    }
                    catch (Exception moveEx)
                    {
                        WriteLog("WARN", "Atomic profile rename failed (" + moveEx.Message + "); copying contents to backup directory...");
                        if (!Directory.Exists(backupDir))
                        {
                            Directory.CreateDirectory(backupDir);
                        }
                        foreach (string file in Directory.GetFiles(webViewDataDir))
                        {
                            try { File.Move(file, Path.Combine(backupDir, Path.GetFileName(file))); } catch { }
                        }
                        foreach (string dir in Directory.GetDirectories(webViewDataDir))
                        {
                            try { Directory.Move(dir, Path.Combine(backupDir, Path.GetFileName(dir))); } catch { }
                        }
                    }
                }

                if (!Directory.Exists(webViewDataDir))
                {
                    Directory.CreateDirectory(webViewDataDir);
                }
                WriteLog("PROFILE_RECOVERY", "Fresh WebView2Data directory created successfully.");
                return true;
            }
            catch (Exception ex)
            {
                WriteLog("ERROR", "Failed to recover corrupt WebView2 profile: " + ex.Message);
                return false;
            }
        }

        public static void HandleBackendExit()
        {
            int code = (_backendProcess != null && _backendProcess.HasExited) ? _backendProcess.ExitCode : -1;
            bool expected = _shutdownRequested || _isShuttingDown;

            WriteLog("BACKEND_EXIT", string.Format(
                "Backend process exited.\nPID={0}\nExitCode={1}\nExpected={2}\nState={3}",
                _backendPid, code, expected, _backendState));

            if (expected)
            {
                _backendState = BackendState.Stopped;
                return;
            }

            _backendState = BackendState.Failed;

            // Bounded restart policy: up to 2 controlled attempts only if we started it
            if (_backendStartedByThisLauncher && _isProductionMode && _backendRestartCount < MAX_BACKEND_RESTARTS)
            {
                _backendRestartCount++;
                WriteLog("BACKEND_RESTART", string.Format("Attempting controlled backend recovery ({0}/{1})...", _backendRestartCount, MAX_BACKEND_RESTARTS));
                Thread.Sleep(1000);
                try
                {
                    StartBackend();
                    string healthUrl = string.Format("http://{0}:{1}/health", LOOPBACK_HOST, DEFAULT_PORT);
                    if (WaitForBackend(healthUrl, 20, 500))
                    {
                        WriteLog("BACKEND_RESTART", "Backend successfully recovered and validated healthy.");
                        if (Application.Current != null)
                        {
                            Application.Current.Dispatcher.Invoke(new Action(() =>
                            {
                                var mainWin = Application.Current.MainWindow as AppMainWindow;
                                if (mainWin != null && mainWin._webView != null && mainWin._webView.CoreWebView2 != null)
                                {
                                    mainWin._webView.CoreWebView2.Reload();
                                }
                            }));
                        }
                        return;
                    }
                }
                catch (Exception ex)
                {
                    WriteLog("ERROR", "Backend recovery attempt failed: " + ex.Message);
                }
            }

            try
            {
                if (Application.Current != null)
                {
                    Application.Current.Dispatcher.Invoke(new Action(() =>
                    {
                        if (Application.Current.MainWindow != null && Application.Current.MainWindow.IsVisible)
                        {
                            string msg = string.Format("The local Diamond ERP service stopped unexpectedly (exit code {0}) and could not be recovered.\n\nPlease restart Diamond ERP.", code);
                            MessageBox.Show(msg, "Diamond ERP Service Failure", MessageBoxButton.OK, MessageBoxImage.Error);
                            _shutdownRequested = true;
                            ShutdownBackend();
                            Application.Current.Shutdown();
                        }
                    }));
                }
            }
            catch { }
        }

        public static void ShutdownBackend()
        {
            if (Interlocked.Exchange(ref _shutdownInitiated, 1) != 0)
            {
                return; // Idempotent: already in progress or completed
            }

            lock (_shutdownLock)
            {
                _isShuttingDown = true;
                _shutdownRequested = true;
                _backendState = BackendState.Stopping;
                WriteLog("SHUTDOWN", "Shutting down application launcher and backend services...");

                if (_trayIcon != null)
                {
                    try
                    {
                        _trayIcon.Visible = false;
                        _trayIcon.Dispose();
                    }
                    catch { }
                    _trayIcon = null;
                }

                // Safely and idempotently dispose WebView2 desktop view
                try
                {
                    if (Application.Current != null && Application.Current.Dispatcher != null)
                    {
                        Application.Current.Dispatcher.Invoke(new Action(() =>
                        {
                            var mainWin = Application.Current.MainWindow as AppMainWindow;
                            if (mainWin != null)
                            {
                                mainWin.DisposeWebView();
                            }
                        }));
                    }
                }
                catch { }

                try
                {
                    // Only terminate the backend process if THIS launcher instance started it
                    if (_backendStartedByThisLauncher && _backendProcess != null && !_backendProcess.HasExited)
                    {
                        WriteLog("SHUTDOWN", string.Format("Requesting graceful termination of owned backend process (PID: {0})...", _backendPid));

                        // 1. Request graceful HTTP shutdown to flush SQLite WAL and disconnect Prisma
                        try
                        {
                            string shutdownUrl = string.Format("http://{0}:{1}/api/system/shutdown", LOOPBACK_HOST, DEFAULT_PORT);
                            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(shutdownUrl);
                            req.Method = "POST";
                            req.Timeout = 1500;
                            req.ContentLength = 0;
                            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse()) { }
                        }
                        catch { }

                        // 2. Close standard input pipe (signals EOF to child Node process)
                        try
                        {
                            _backendProcess.StandardInput.Close();
                        }
                        catch { }

                        // 3. Allow up to 3000ms for clean database flush and exit
                        if (!_backendProcess.WaitForExit(3000))
                        {
                            WriteLog("FORCED_TERMINATION", string.Format("Backend process (PID: {0}) did not exit within timeout. Forcing termination of process tree...", _backendPid));
                            KillProcessTree(_backendPid);
                        }
                        else
                        {
                            WriteLog("SHUTDOWN", string.Format("Backend process (PID: {0}) exited cleanly.", _backendPid));
                        }
                    }
                    else if (!_backendStartedByThisLauncher && _backendProcess == null)
                    {
                        WriteLog("SHUTDOWN", "Backend process was not started by this launcher; preserving existing process.");
                    }
                    _backendState = BackendState.Stopped;
                }
                catch (Exception ex)
                {
                    WriteLog("ERROR", "Error during backend shutdown: " + ex.Message);
                }

                try
                {
                    if (_devWebProcess != null && !_devWebProcess.HasExited)
                    {
                        KillProcessTree(_devWebProcess.Id);
                    }
                }
                catch { }
            }
        }

        // ── Helper Utilities ───────────────────────────────────────────────────

        private static bool IsBackendHealthy(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Timeout = 1500;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                        {
                            string body = reader.ReadToEnd();
                            // Authoritative DiamondERP health contract:
                            // {"backend":"OK","database":"Connected","status":"ok",...}
                            bool hasBackend = body.IndexOf("\"backend\"", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool hasDbConnected = body.IndexOf("\"database\":\"Connected\"", StringComparison.OrdinalIgnoreCase) >= 0;
                            bool hasStatusOk = body.IndexOf("\"status\":\"ok\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                               body.IndexOf("\"status\":\"ready\"", StringComparison.OrdinalIgnoreCase) >= 0;
                            return hasBackend && hasDbConnected && hasStatusOk;
                        }
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool IsTcpPortInUse(int port)
        {
            try
            {
                var ipGlobalProperties = IPGlobalProperties.GetIPGlobalProperties();
                var tcpConnInfoArray = ipGlobalProperties.GetActiveTcpListeners();
                foreach (var endpoint in tcpConnInfoArray)
                {
                    if (endpoint.Port == port)
                    {
                        return true;
                    }
                }
            }
            catch { }
            return false;
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
            if (pid <= 0) return;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = string.Format("/F /T /PID {0}", pid),
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                var p = Process.Start(psi);
                if (p != null)
                {
                    p.WaitForExit(2000);
                }
            }
            catch (Exception ex)
            {
                WriteLog("ERROR", string.Format("Failed to execute taskkill on PID {0}: {1}", pid, ex.Message));
            }
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
                        _shutdownRequested = true;
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

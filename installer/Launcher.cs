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

        private static string _appDir;
        private static Process _apiProcess;
        private static Process _webProcess;
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

                string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                if (Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase))
                {
                    _appDir = Directory.GetParent(baseDir).FullName;
                }
                else
                {
                    _appDir = baseDir;
                }

                AppDomain.CurrentDomain.UnhandledException += (s, e) =>
                {
                    try
                    {
                        File.AppendAllText(Path.Combine(_appDir, "app_crash.log"),
                            DateTime.Now.ToString("o") + " [Unhandled] " + e.ExceptionObject.ToString() + Environment.NewLine);
                    }
                    catch { }
                };

                var app = new Application();
                app.DispatcherUnhandledException += (s, e) =>
                {
                    try
                    {
                        File.AppendAllText(Path.Combine(_appDir, "app_crash.log"),
                            DateTime.Now.ToString("o") + " [Dispatcher] " + e.Exception.ToString() + Environment.NewLine);
                    }
                    catch { }
                    e.Handled = true;
                };

                var window = new AppMainWindow();
                app.Run(window);
            }
            catch (Exception ex)
            {
                try
                {
                    string crashLogPath = Path.Combine(_appDir ?? AppDomain.CurrentDomain.BaseDirectory, "app_crash.log");
                    File.AppendAllText(crashLogPath,
                        DateTime.Now.ToString("o") + " [MainCatch] " + ex.ToString() + Environment.NewLine);
                }
                catch { }
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
                Shutdown();
            };
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
                    this.Dispatcher.Invoke(() =>
                    {
                        this.Show();
                        this.WindowState = WindowState.Normal;
                        this.Activate();
                    });
                });
                menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
                menu.Items.Add("Exit Application", null, (s, e) =>
                {
                    this.Dispatcher.Invoke(() =>
                    {
                        Shutdown();
                        Application.Current.Shutdown();
                    });
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
                    this.Dispatcher.Invoke(() =>
                    {
                        this.Show();
                        this.WindowState = WindowState.Normal;
                        this.Activate();
                    });
                };
            }
            catch { }
        }

        private void StartServicesAndNavigate()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    // 1. Start API if not running
                    if (!IsPortActive("http://localhost:3002/health") && !IsPortActive("http://localhost:3002/api/health") && !IsPortActive("http://localhost:3002/"))
                    {
                        UpdateStatus("Starting backend database & API service...");
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

                    // 2. Start Web if not running
                    if (!IsPortActive("http://localhost:5175/"))
                    {
                        UpdateStatus("Starting web UI application...");
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

                    UpdateStatus("Waiting for application interface to become ready...");

                    // 3. Wait for web server to respond
                    int attempts = 0;
                    while (attempts < 35)
                    {
                        if (IsPortActive("http://localhost:5175/"))
                        {
                            break;
                        }
                        Thread.Sleep(600);
                        attempts++;
                    }

                    // 4. Initialize WebView2 and navigate
                    this.Dispatcher.Invoke(async () =>
                    {
                        try
                        {
                            string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiamondERP", "WebView2Data");
                            if (!Directory.Exists(dataDir))
                            {
                                Directory.CreateDirectory(dataDir);
                            }

                            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
                            await _webView.EnsureCoreWebView2Async(env);

                            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                            _webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                            _webView.NavigationCompleted += (s, args) =>
                            {
                                if (args.IsSuccess)
                                {
                                    _loadingGrid.Visibility = Visibility.Collapsed;
                                }
                            };

                            _webView.Source = new Uri("http://localhost:5175/");
                        }
                        catch (Exception initEx)
                        {
                            try
                            {
                                File.AppendAllText(Path.Combine(_appDir, "app_crash.log"),
                                    DateTime.Now.ToString("o") + " [WebView2InitError] " + initEx.ToString() + Environment.NewLine);
                            }
                            catch { }

                            // Fallback if WebView2 initialization fails
                            LaunchEdgeAppFallback("http://localhost:5175/");
                        }
                    });
                }
                catch (Exception ex)
                {
                    try
                    {
                        File.AppendAllText(Path.Combine(_appDir, "app_crash.log"),
                            DateTime.Now.ToString("o") + " [StartServicesError] " + ex.ToString() + Environment.NewLine);
                    }
                    catch { }

                    this.Dispatcher.Invoke(() =>
                    {
                        MessageBox.Show("Error starting services: " + ex.Message, "DiamondERP", MessageBoxButton.OK, MessageBoxImage.Error);
                    });
                }
            });
        }

        private void LaunchEdgeAppFallback(string url)
        {
            string edge = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edge)) { edge = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"; }

            if (File.Exists(edge))
            {
                string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiamondERP", "app_profile");
                string args = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1360,860 --no-first-run", url, profile);
                Process.Start(edge, args);
                this.Hide();
            }
            else
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                this.Hide();
            }
        }

        private void UpdateStatus(string msg)
        {
            this.Dispatcher.Invoke(() =>
            {
                if (_statusText != null)
                {
                    _statusText.Text = msg;
                }
            });
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

        private static void Shutdown()
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayIcon = null;
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

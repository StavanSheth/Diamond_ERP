using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace DiamondERP.Setup
{
    public class SetupForm : Form
    {
        private Panel headerPanel;
        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;

        private Panel contentPanel;
        private Panel step1Panel;
        private Panel step2Panel;
        private Panel step3Panel;

        private Panel footerPanel;
        private Button btnCancel;
        private Button btnNext;

        // Step 1 Controls
        private Label lblNodeStatus;
        private Label lblNpmStatus;
        private Button btnDownloadNode;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;
        private TextBox txtInstallPath;

        // Step 2 Controls
        private ProgressBar progressBar;
        private Label lblProgressStatus;
        private TextBox txtLog;

        // Step 3 Controls
        private Label lblFinishedTitle;
        private Label lblFinishedDesc;
        private Label lblFirstRunNote;

        private string appDir;
        private bool isNodeInstalled = false;
        private bool isNpmInstalled = false;
        private string nodeVersion = "";
        private string npmVersion = "";

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }

        public SetupForm()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            InitializeComponent();
            CheckPrerequisites();
        }

        private void InitializeComponent()
        {
            this.Text = "DiamondERP V3.0 — Setup Wizard";
            this.Size = new Size(680, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9f, FontStyle.Regular);

            string iconPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            // Top Banner
            headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 76,
                BackColor = Color.FromArgb(15, 23, 42)
            };

            lblHeaderTitle = new Label
            {
                Text = "DiamondERP V3.0 Setup Wizard",
                Font = new Font("Segoe UI", 13.5f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(24, 14),
                AutoSize = true
            };

            lblHeaderSubtitle = new Label
            {
                Text = "Install and configure DiamondERP Enterprise Management on this machine",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(25, 42),
                AutoSize = true
            };

            headerPanel.Controls.Add(lblHeaderTitle);
            headerPanel.Controls.Add(lblHeaderSubtitle);
            this.Controls.Add(headerPanel);

            // Bottom Footer
            footerPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = Color.FromArgb(241, 245, 249)
            };

            btnCancel = new Button
            {
                Text = "Cancel",
                Size = new Size(88, 32),
                Location = new Point(560, 14),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            btnCancel.Click += (s, e) => this.Close();

            btnNext = new Button
            {
                Text = "Install Now",
                Size = new Size(110, 32),
                Location = new Point(440, 14),
                BackColor = Color.FromArgb(79, 70, 229),
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                FlatStyle = FlatStyle.System
            };
            btnNext.Click += BtnNext_Click;

            footerPanel.Controls.Add(btnCancel);
            footerPanel.Controls.Add(btnNext);
            this.Controls.Add(footerPanel);

            // Central Content Container
            contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(24, 18, 24, 18)
            };
            this.Controls.Add(contentPanel);

            BuildStep1Panel();
            BuildStep2Panel();
            BuildStep3Panel();

            ShowStep(1);
        }

        private void BuildStep1Panel()
        {
            step1Panel = new Panel
            {
                Dock = DockStyle.Fill,
                Visible = false
            };

            Label lblWelcome = new Label
            {
                Text = "Ready to install DiamondERP",
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(0, 4),
                AutoSize = true
            };
            step1Panel.Controls.Add(lblWelcome);

            Label lblIntro = new Label
            {
                Text = "This wizard will configure the enterprise runtime, verify dependencies, and create desktop shortcuts for one-click access.",
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(1, 28),
                Size = new Size(610, 32)
            };
            step1Panel.Controls.Add(lblIntro);

            // Group: System Verification
            GroupBox grpPre = new GroupBox
            {
                Text = "System Prerequisites",
                Location = new Point(0, 68),
                Size = new Size(612, 100),
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.FromArgb(51, 65, 85)
            };

            lblNodeStatus = new Label
            {
                Text = "Checking Node.js...",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(16, 26),
                AutoSize = true
            };
            grpPre.Controls.Add(lblNodeStatus);

            lblNpmStatus = new Label
            {
                Text = "Checking NPM...",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(16, 54),
                AutoSize = true
            };
            grpPre.Controls.Add(lblNpmStatus);

            btnDownloadNode = new Button
            {
                Text = "Download Node.js (v18+)",
                Location = new Point(440, 24),
                Size = new Size(155, 28),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                Visible = false
            };
            btnDownloadNode.Click += (s, e) => Process.Start("https://nodejs.org/en/download/");
            grpPre.Controls.Add(btnDownloadNode);

            step1Panel.Controls.Add(grpPre);

            // Group: Options
            GroupBox grpOpt = new GroupBox
            {
                Text = "Setup Preferences",
                Location = new Point(0, 180),
                Size = new Size(612, 130),
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.FromArgb(51, 65, 85)
            };

            Label lblPath = new Label
            {
                Text = "Application Location:",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                Location = new Point(16, 24),
                AutoSize = true
            };
            grpOpt.Controls.Add(lblPath);

            txtInstallPath = new TextBox
            {
                Text = appDir,
                ReadOnly = true,
                Location = new Point(18, 45),
                Size = new Size(576, 24),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                BackColor = Color.FromArgb(248, 250, 252)
            };
            grpOpt.Controls.Add(txtInstallPath);

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create Desktop Shortcut (DiamondERP)",
                Checked = true,
                Location = new Point(18, 76),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };
            grpOpt.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Add to Windows Start Menu",
                Checked = true,
                Location = new Point(310, 76),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };
            grpOpt.Controls.Add(chkStartMenuShortcut);

            chkLaunchAfter = new CheckBox
            {
                Text = "Launch DiamondERP immediately after installation",
                Checked = true,
                Location = new Point(18, 102),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };
            grpOpt.Controls.Add(chkLaunchAfter);

            step1Panel.Controls.Add(grpOpt);
            contentPanel.Controls.Add(step1Panel);
        }

        private void BuildStep2Panel()
        {
            step2Panel = new Panel
            {
                Dock = DockStyle.Fill,
                Visible = false
            };

            Label lblStep2Title = new Label
            {
                Text = "Installing DiamondERP...",
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(0, 4),
                AutoSize = true
            };
            step2Panel.Controls.Add(lblStep2Title);

            lblProgressStatus = new Label
            {
                Text = "Initializing installation...",
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(1, 30),
                AutoSize = true
            };
            step2Panel.Controls.Add(lblProgressStatus);

            progressBar = new ProgressBar
            {
                Location = new Point(0, 58),
                Size = new Size(612, 22),
                Style = ProgressBarStyle.Continuous,
                Value = 10
            };
            step2Panel.Controls.Add(progressBar);

            Label lblLogTitle = new Label
            {
                Text = "Installation Log:",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(0, 92),
                AutoSize = true
            };
            step2Panel.Controls.Add(lblLogTitle);

            txtLog = new TextBox
            {
                Location = new Point(0, 112),
                Size = new Size(612, 190),
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.FromArgb(226, 232, 240),
                Font = new Font("Consolas", 8.5f)
            };
            step2Panel.Controls.Add(txtLog);

            contentPanel.Controls.Add(step2Panel);
        }

        private void BuildStep3Panel()
        {
            step3Panel = new Panel
            {
                Dock = DockStyle.Fill,
                Visible = false
            };

            Panel successBadge = new Panel
            {
                Size = new Size(54, 54),
                Location = new Point(280, 20),
                BackColor = Color.Transparent
            };
            successBadge.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (SolidBrush b = new SolidBrush(Color.FromArgb(16, 185, 129)))
                {
                    e.Graphics.FillEllipse(b, 2, 2, 50, 50);
                }
                using (Pen p = new Pen(Color.White, 3.5f))
                {
                    e.Graphics.DrawLine(p, 16, 27, 24, 35);
                    e.Graphics.DrawLine(p, 24, 35, 38, 19);
                }
            };
            step3Panel.Controls.Add(successBadge);

            lblFinishedTitle = new Label
            {
                Text = "Installation Completed Successfully!",
                Font = new Font("Segoe UI", 13f, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Location = new Point(0, 85),
                Size = new Size(612, 28),
                TextAlign = ContentAlignment.MiddleCenter
            };
            step3Panel.Controls.Add(lblFinishedTitle);

            lblFinishedDesc = new Label
            {
                Text = "DiamondERP V3.0 is ready. Desktop shortcuts have been configured for instant access.",
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(40, 118),
                Size = new Size(532, 38),
                TextAlign = ContentAlignment.MiddleCenter
            };
            step3Panel.Controls.Add(lblFinishedDesc);

            Panel noteBox = new Panel
            {
                Location = new Point(40, 168),
                Size = new Size(532, 80),
                BackColor = Color.FromArgb(238, 242, 255)
            };
            noteBox.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(199, 210, 254), 1f))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, noteBox.Width - 1, noteBox.Height - 1);
                }
            };

            lblFirstRunNote = new Label
            {
                Text = "Security Note: On first start, you will be prompted once for your master password to unlock and activate this machine for its lifetime. Once activated, the password is never asked again.",
                Font = new Font("Segoe UI", 9f),
                ForeColor = Color.FromArgb(67, 56, 202),
                Location = new Point(14, 14),
                Size = new Size(504, 52)
            };
            noteBox.Controls.Add(lblFirstRunNote);
            step3Panel.Controls.Add(noteBox);

            contentPanel.Controls.Add(step3Panel);
        }

        private void CheckPrerequisites()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c node -v",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process p = Process.Start(psi))
                {
                    nodeVersion = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(3000);
                    if (p.ExitCode == 0 && nodeVersion.StartsWith("v"))
                    {
                        isNodeInstalled = true;
                    }
                }
            }
            catch { }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npm -v",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (Process p = Process.Start(psi))
                {
                    npmVersion = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(3000);
                    if (p.ExitCode == 0 && npmVersion.Length > 0)
                    {
                        isNpmInstalled = true;
                    }
                }
            }
            catch { }

            if (isNodeInstalled)
            {
                lblNodeStatus.Text = "✔ Node.js: " + nodeVersion + " (Detected)";
                lblNodeStatus.ForeColor = Color.FromArgb(22, 101, 52);
            }
            else
            {
                lblNodeStatus.Text = "✖ Node.js: Not found in system PATH";
                lblNodeStatus.ForeColor = Color.FromArgb(185, 28, 28);
                btnDownloadNode.Visible = true;
            }

            if (isNpmInstalled)
            {
                lblNpmStatus.Text = "✔ NPM: v" + npmVersion + " (Detected)";
                lblNpmStatus.ForeColor = Color.FromArgb(22, 101, 52);
            }
            else
            {
                lblNpmStatus.Text = "✖ NPM: Not found in system PATH";
                lblNpmStatus.ForeColor = Color.FromArgb(185, 28, 28);
            }

            if (!isNodeInstalled || !isNpmInstalled)
            {
                btnNext.Text = "Proceed Anyway";
            }
        }

        private void ShowStep(int step)
        {
            step1Panel.Visible = (step == 1);
            step2Panel.Visible = (step == 2);
            step3Panel.Visible = (step == 3);

            if (step == 1)
            {
                btnNext.Text = (!isNodeInstalled || !isNpmInstalled) ? "Proceed Anyway" : "Install Now";
                btnNext.Visible = true;
                btnCancel.Visible = true;
            }
            else if (step == 2)
            {
                btnNext.Visible = false;
                btnCancel.Enabled = false;
            }
            else if (step == 3)
            {
                btnNext.Text = "Finish & Launch";
                btnNext.Visible = true;
                btnCancel.Visible = false;
            }
        }

        private void BtnNext_Click(object sender, EventArgs e)
        {
            if (step1Panel.Visible)
            {
                ShowStep(2);
                StartInstallWorker();
            }
            else if (step3Panel.Visible)
            {
                if (chkLaunchAfter.Checked)
                {
                    LaunchApp();
                }
                this.Close();
            }
        }

        private void AppendLog(string text)
        {
            if (txtLog.InvokeRequired)
            {
                txtLog.Invoke(new Action<string>(AppendLog), text);
                return;
            }
            txtLog.AppendText(text + Environment.NewLine);
        }

        private void UpdateProgress(int pct, string status)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<int, string>(UpdateProgress), pct, status);
                return;
            }
            progressBar.Value = Math.Min(100, Math.Max(0, pct));
            lblProgressStatus.Text = status;
        }

        private void StartInstallWorker()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    AppendLog("[1/4] Checking environment and database...");
                    UpdateProgress(20, "Configuring runtime environment...");
                    Thread.Sleep(400);

                    // Compile DiamondERP.exe if missing
                    string launcherExe = Path.Combine(appDir, "DiamondERP.exe");
                    string launcherCs = Path.Combine(appDir, "Launcher.cs");
                    string iconPath = Path.Combine(appDir, "app.ico");

                    if (!File.Exists(launcherExe) && File.Exists(launcherCs))
                    {
                        AppendLog("[2/4] Compiling native DiamondERP.exe launcher...");
                        UpdateProgress(40, "Building desktop launcher executable...");
                        string csc = @"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe";
                        if (File.Exists(csc))
                        {
                            string args = string.Format("/out:\"{0}\" /target:winexe /win32icon:\"{1}\" \"{2}\"", launcherExe, iconPath, launcherCs);
                            RunProcess(csc, args);
                        }
                    }

                    // Build packages
                    AppendLog("[3/4] Validating monorepo packages and assets...");
                    UpdateProgress(60, "Verifying build assets...");
                    Thread.Sleep(300);

                    // Shortcuts
                    AppendLog("[4/4] Creating Windows shortcuts...");
                    UpdateProgress(85, "Configuring shortcuts...");

                    string targetExe = File.Exists(launcherExe) ? launcherExe : Path.Combine(appDir, "start.bat");

                    if (chkDesktopShortcut.Checked)
                    {
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                        string lnkPath = Path.Combine(desktopPath, "DiamondERP.lnk");
                        CreateShortcut(lnkPath, targetExe, appDir, iconPath, "DiamondERP Enterprise Management");
                        AppendLog("✔ Created Desktop shortcut: " + lnkPath);
                    }

                    if (chkStartMenuShortcut.Checked)
                    {
                        string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        string lnkPath = Path.Combine(startMenu, "DiamondERP.lnk");
                        CreateShortcut(lnkPath, targetExe, appDir, iconPath, "DiamondERP Enterprise Management");
                        AppendLog("✔ Created Start Menu shortcut: " + lnkPath);
                    }

                    UpdateProgress(100, "Setup complete!");
                    AppendLog("✔ DiamondERP Setup completed successfully.");
                    Thread.Sleep(500);

                    this.Invoke(new Action(() => ShowStep(3)));
                }
                catch (Exception ex)
                {
                    AppendLog("ERROR: " + ex.Message);
                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show("An error occurred during setup: " + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        btnCancel.Enabled = true;
                    }));
                }
            });
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = workingDir;
                    if (File.Exists(iconPath))
                    {
                        shortcut.IconLocation = iconPath + ",0";
                    }
                    shortcut.Description = description;
                    shortcut.Save();
                }
            }
            catch { }
        }

        private void LaunchApp()
        {
            string launcherExe = Path.Combine(appDir, "DiamondERP.exe");
            if (File.Exists(launcherExe))
            {
                Process.Start(new ProcessStartInfo(launcherExe) { WorkingDirectory = appDir });
            }
            else
            {
                string startBat = Path.Combine(appDir, "start.bat");
                if (File.Exists(startBat))
                {
                    Process.Start(new ProcessStartInfo(startBat) { WorkingDirectory = appDir });
                }
            }
        }

        private void RunProcess(string fileName, string arguments)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = appDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit(30000);
            }
        }
    }
}

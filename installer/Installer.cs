using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace DiamondERP.Setup
{
    public class SetupWizardForm : Form
    {
        private int currentPage = 0;
        private const int TOTAL_PAGES = 7;

        // Container Panels
        private Panel bottomNavPanel;
        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;

        private Panel topBannerPanel;
        private Label lblTopBannerTitle;
        private Label lblTopBannerSubtitle;
        private PictureBox picTopBannerIcon;

        private Panel wizardBodyPanel;
        private Panel[] pages = new Panel[TOTAL_PAGES];

        // Page 1: License Controls
        private RadioButton rbAccept;
        private RadioButton rbDoNotAccept;

        // Page 2: Destination Controls
        private TextBox txtDestPath;
        private Button btnBrowse;

        // Page 3: Additional Tasks Controls
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchAfter;

        // Page 4: Ready to Install Controls
        private TextBox txtSummary;

        // Page 5: Installing Controls
        private ProgressBar progressBar;
        private Label lblInstallStatus;
        private TextBox txtInstallLog;

        // Page 6: Completed Controls
        private CheckBox chkFinishLaunch;

        // Context
        private string appDir;
        private string nodeVersion = "";
        private string npmVersion = "";
        private bool isNodeInstalled = false;
        private bool isNpmInstalled = false;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWizardForm());
        }

        public SetupWizardForm()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase))
            {
                appDir = Directory.GetParent(baseDir).FullName;
            }
            else
            {
                appDir = baseDir;
            }

            InitializeComponent();
            CheckPrerequisites();
            ShowPage(0);
        }

        private void InitializeComponent()
        {
            this.Text = "Setup — DiamondERP V3.0";
            this.ClientSize = new Size(500, 360);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = SystemColors.Control;
            this.Font = new Font("Segoe UI", 9f);

            string iconPath = Path.Combine(appDir, "installer", "app.ico");
            if (!File.Exists(iconPath)) { iconPath = Path.Combine(appDir, "app.ico"); }
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            // --- Bottom Navigation Panel ---
            bottomNavPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 46,
                BackColor = SystemColors.Control
            };
            bottomNavPanel.Paint += (s, e) =>
            {
                using (Pen p = new Pen(SystemColors.ControlDark))
                {
                    e.Graphics.DrawLine(p, 0, 0, bottomNavPanel.ClientSize.Width, 0);
                }
            };
            bottomNavPanel.Resize += (s, e) => PositionButtons();

            btnCancel = new Button { Text = "Cancel", Size = new Size(78, 24), FlatStyle = FlatStyle.System };
            btnCancel.Click += (s, e) => this.Close();

            btnNext = new Button { Text = "Next >", Size = new Size(78, 24), FlatStyle = FlatStyle.System };
            btnNext.Click += BtnNext_Click;

            btnBack = new Button { Text = "< Back", Size = new Size(78, 24), FlatStyle = FlatStyle.System };
            btnBack.Click += BtnBack_Click;

            bottomNavPanel.Controls.Add(btnBack);
            bottomNavPanel.Controls.Add(btnNext);
            bottomNavPanel.Controls.Add(btnCancel);
            this.Controls.Add(bottomNavPanel);

            // --- Top Banner Panel (for interior pages 1-5) ---
            topBannerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 58,
                BackColor = Color.White,
                Visible = false
            };
            topBannerPanel.Paint += (s, e) =>
            {
                using (Pen p = new Pen(SystemColors.ControlDark))
                {
                    e.Graphics.DrawLine(p, 0, topBannerPanel.Height - 1, topBannerPanel.Width, topBannerPanel.Height - 1);
                }
            };

            lblTopBannerTitle = new Label
            {
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Location = new Point(20, 9),
                AutoSize = true,
                ForeColor = Color.Black
            };
            lblTopBannerSubtitle = new Label
            {
                Font = new Font("Segoe UI", 8.25f),
                Location = new Point(34, 28),
                AutoSize = true,
                ForeColor = Color.FromArgb(70, 70, 70)
            };

            picTopBannerIcon = new PictureBox
            {
                Size = new Size(34, 34),
                Location = new Point(452, 10),
                SizeMode = PictureBoxSizeMode.StretchImage,
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            if (File.Exists(iconPath))
            {
                try { picTopBannerIcon.Image = Image.FromFile(iconPath); } catch { }
            }

            topBannerPanel.Controls.Add(lblTopBannerTitle);
            topBannerPanel.Controls.Add(lblTopBannerSubtitle);
            topBannerPanel.Controls.Add(picTopBannerIcon);
            this.Controls.Add(topBannerPanel);

            // --- Wizard Body Panel (Fills area between top banner and bottom nav) ---
            wizardBodyPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = SystemColors.Control
            };
            this.Controls.Add(wizardBodyPanel);

            // Build all pages
            BuildPage0_Welcome();
            BuildPage1_License();
            BuildPage2_Destination();
            BuildPage3_Tasks();
            BuildPage4_Ready();
            BuildPage5_Installing();
            BuildPage6_Finish();

            PositionButtons();
        }

        private void PositionButtons()
        {
            int pad = 12;
            int btnW = 78;
            int btnH = 24;
            int y = 10;
            int clientW = bottomNavPanel.ClientSize.Width;

            btnCancel.Size = new Size(btnW, btnH);
            btnCancel.Location = new Point(clientW - pad - btnW, y);

            btnNext.Size = new Size(btnW, btnH);
            btnNext.Location = new Point(btnCancel.Left - 8 - btnW, y);

            btnBack.Size = new Size(btnW, btnH);
            btnBack.Location = new Point(btnNext.Left - 8 - btnW, y);
        }

        private Panel CreateSidebarPanel()
        {
            Panel sidebar = new Panel
            {
                Dock = DockStyle.Left,
                Width = 164,
                BackColor = Color.FromArgb(15, 23, 42)
            };
            sidebar.Paint += (s, e) =>
            {
                Rectangle rect = new Rectangle(0, 0, sidebar.Width, sidebar.Height);
                using (LinearGradientBrush br = new LinearGradientBrush(rect, Color.FromArgb(15, 23, 42), Color.FromArgb(30, 41, 59), 90f))
                {
                    e.Graphics.FillRectangle(br, rect);
                }

                // Draw diamond symbol
                using (Font symFont = new Font("Segoe UI Symbol", 34f))
                using (SolidBrush symBrush = new SolidBrush(Color.FromArgb(96, 165, 250)))
                {
                    e.Graphics.DrawString("💎", symFont, symBrush, 46, 85);
                }

                using (Font brandFont = new Font("Segoe UI", 11.5f, FontStyle.Bold))
                using (SolidBrush textBrush = new SolidBrush(Color.White))
                {
                    e.Graphics.DrawString("DiamondERP", brandFont, textBrush, 32, 155);
                }

                using (Font subFont = new Font("Segoe UI", 8f))
                using (SolidBrush textBrush = new SolidBrush(Color.FromArgb(148, 163, 184)))
                {
                    e.Graphics.DrawString("Enterprise Version 3.0", subFont, textBrush, 24, 178);
                }
            };
            return sidebar;
        }

        private void BuildPage0_Welcome()
        {
            pages[0] = new Panel { Dock = DockStyle.Fill, Visible = false };

            Panel leftBar = CreateSidebarPanel();
            Panel rightContent = new Panel { BackColor = SystemColors.Control };

            pages[0].Resize += (s, e) =>
            {
                leftBar.Location = new Point(0, 0);
                leftBar.Size = new Size(164, pages[0].ClientSize.Height);
                rightContent.Location = new Point(164, 0);
                rightContent.Size = new Size(Math.Max(0, pages[0].ClientSize.Width - 164), pages[0].ClientSize.Height);
            };

            Label lblTitle = new Label
            {
                Text = "Welcome to the DiamondERP\nSetup Wizard",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                Location = new Point(14, 12),
                Size = new Size(300, 52),
                ForeColor = Color.Black
            };
            rightContent.Controls.Add(lblTitle);

            Label lblDesc = new Label
            {
                Text = "This will install DiamondERP V3.0 on your computer.\n\n" +
                       "DiamondERP provides diamond trading management, parcel inventory tracking, and dual-entry accounting ledgers.\n\n" +
                       "It is recommended that you close all other applications before continuing.\n\n" +
                       "Click Next to continue, or Cancel to exit Setup.",
                Location = new Point(16, 74),
                Size = new Size(295, 220),
                ForeColor = Color.FromArgb(40, 40, 40)
            };
            rightContent.Controls.Add(lblDesc);

            pages[0].Controls.Add(leftBar);
            pages[0].Controls.Add(rightContent);
            wizardBodyPanel.Controls.Add(pages[0]);
        }

        private void BuildPage1_License()
        {
            pages[1] = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(18, 8, 18, 8) };

            Label lblIntro = new Label
            {
                Text = "Please read the following License Agreement. You must accept the terms of this agreement before continuing with the installation.",
                Location = new Point(14, 4),
                Size = new Size(468, 28)
            };
            pages[1].Controls.Add(lblIntro);

            TextBox txtLicense = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(16, 34),
                Size = new Size(464, 140),
                BackColor = Color.White,
                Font = new Font("Segoe UI", 8.25f),
                Text = "DiamondERP V3.0 — Enterprise Software License Agreement\r\n\r\n" +
                       "Copyright (c) 2026 DiamondERP Enterprise Systems. All rights reserved.\r\n\r\n" +
                       "1. GRANT OF LICENSE\r\n" +
                       "This software is licensed, not sold. DiamondERP grants you the non-exclusive, non-transferable right to install and execute this software on authorized devices solely for diamond trading, parcel inventory management, and ledger accounting operations.\r\n\r\n" +
                       "2. SECURITY & ACCESS CONTROL\r\n" +
                       "Access to this software is secured by device hardware locks and an authorized master key. You agree to protect the installation credentials and not distribute unauthorized copies of the runtime.\r\n\r\n" +
                       "3. DATA OWNERSHIP & PRIVACY\r\n" +
                       "All local database records, inventory entries, customer party records, and financial transaction ledgers belong exclusively to your organization and are stored locally on your machine.\r\n\r\n" +
                       "4. DISCLAIMER OF WARRANTIES\r\n" +
                       "This software is provided \"AS IS\", without warranty of any kind, express or implied."
            };
            pages[1].Controls.Add(txtLicense);

            rbAccept = new RadioButton
            {
                Text = "I accept the agreement",
                Location = new Point(18, 182),
                AutoSize = true,
                Checked = true
            };
            rbAccept.CheckedChanged += (s, e) => btnNext.Enabled = rbAccept.Checked;
            pages[1].Controls.Add(rbAccept);

            rbDoNotAccept = new RadioButton
            {
                Text = "I do not accept the agreement",
                Location = new Point(18, 204),
                AutoSize = true
            };
            pages[1].Controls.Add(rbDoNotAccept);

            wizardBodyPanel.Controls.Add(pages[1]);
        }

        private void BuildPage2_Destination()
        {
            pages[2] = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(18, 8, 18, 8) };

            Label lblIntro = new Label
            {
                Text = "Setup will install DiamondERP into the following folder.\nTo continue, click Next. If you would like to select a different folder, click Browse.",
                Location = new Point(14, 8),
                Size = new Size(468, 32)
            };
            pages[2].Controls.Add(lblIntro);

            GroupBox grpPath = new GroupBox
            {
                Text = "Destination Location",
                Location = new Point(14, 50),
                Size = new Size(466, 68),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
            };

            txtDestPath = new TextBox
            {
                Text = appDir,
                Location = new Point(14, 25),
                Size = new Size(350, 23),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ReadOnly = true,
                BackColor = Color.White
            };
            grpPath.Controls.Add(txtDestPath);

            btnBrowse = new Button
            {
                Text = "Browse...",
                Location = new Point(374, 24),
                Size = new Size(78, 25),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                FlatStyle = FlatStyle.System
            };
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.SelectedPath = appDir;
                    fbd.Description = "Select the folder where DiamondERP is located:";
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        appDir = fbd.SelectedPath;
                        txtDestPath.Text = appDir;
                    }
                }
            };
            grpPath.Controls.Add(btnBrowse);
            pages[2].Controls.Add(grpPath);

            Label lblSpace = new Label
            {
                Text = "At least 250 MB of free disk space is required on this drive.",
                Location = new Point(16, 130),
                AutoSize = true,
                ForeColor = Color.FromArgb(70, 70, 70)
            };
            pages[2].Controls.Add(lblSpace);

            wizardBodyPanel.Controls.Add(pages[2]);
        }

        private void BuildPage3_Tasks()
        {
            pages[3] = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(18, 8, 18, 8) };

            Label lblIntro = new Label
            {
                Text = "Select the additional tasks you would like Setup to perform while installing DiamondERP, then click Next.",
                Location = new Point(14, 8),
                Size = new Size(468, 30)
            };
            pages[3].Controls.Add(lblIntro);

            GroupBox grpShortcuts = new GroupBox
            {
                Text = "Additional shortcuts:",
                Location = new Point(14, 46),
                Size = new Size(466, 76),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
            };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create a desktop shortcut",
                Location = new Point(18, 22),
                AutoSize = true,
                Checked = true,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
            };
            grpShortcuts.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Create a Start Menu shortcut",
                Location = new Point(18, 46),
                AutoSize = true,
                Checked = true,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
            };
            grpShortcuts.Controls.Add(chkStartMenuShortcut);
            pages[3].Controls.Add(grpShortcuts);

            GroupBox grpLaunch = new GroupBox
            {
                Text = "Launch options:",
                Location = new Point(14, 132),
                Size = new Size(466, 56),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
            };

            chkLaunchAfter = new CheckBox
            {
                Text = "Launch DiamondERP after setup completes",
                Location = new Point(18, 22),
                AutoSize = true,
                Checked = true,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
            };
            grpLaunch.Controls.Add(chkLaunchAfter);
            pages[3].Controls.Add(grpLaunch);

            wizardBodyPanel.Controls.Add(pages[3]);
        }

        private void BuildPage4_Ready()
        {
            pages[4] = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(18, 8, 18, 8) };

            Label lblIntro = new Label
            {
                Text = "Click Install to continue with the installation, or click Back if you want to review or change any settings.",
                Location = new Point(14, 8),
                Size = new Size(468, 24)
            };
            pages[4].Controls.Add(lblIntro);

            txtSummary = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(16, 34),
                Size = new Size(464, 175),
                BackColor = Color.White,
                Font = new Font("Segoe UI", 8.25f)
            };
            pages[4].Controls.Add(txtSummary);

            wizardBodyPanel.Controls.Add(pages[4]);
        }

        private void BuildPage5_Installing()
        {
            pages[5] = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(18, 8, 18, 8) };

            lblInstallStatus = new Label
            {
                Text = "Preparing installation...",
                Location = new Point(14, 10),
                Size = new Size(468, 18),
                AutoEllipsis = true
            };
            pages[5].Controls.Add(lblInstallStatus);

            progressBar = new ProgressBar
            {
                Location = new Point(16, 32),
                Size = new Size(464, 20),
                Style = ProgressBarStyle.Continuous,
                Value = 10
            };
            pages[5].Controls.Add(progressBar);

            txtInstallLog = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(16, 62),
                Size = new Size(464, 145),
                BackColor = Color.FromArgb(248, 250, 252),
                Font = new Font("Consolas", 8f)
            };
            pages[5].Controls.Add(txtInstallLog);

            wizardBodyPanel.Controls.Add(pages[5]);
        }

        private void BuildPage6_Finish()
        {
            pages[6] = new Panel { Dock = DockStyle.Fill, Visible = false };

            Panel leftBar = CreateSidebarPanel();
            Panel rightContent = new Panel { BackColor = SystemColors.Control };

            pages[6].Resize += (s, e) =>
            {
                leftBar.Location = new Point(0, 0);
                leftBar.Size = new Size(164, pages[6].ClientSize.Height);
                rightContent.Location = new Point(164, 0);
                rightContent.Size = new Size(Math.Max(0, pages[6].ClientSize.Width - 164), pages[6].ClientSize.Height);
            };

            Label lblTitle = new Label
            {
                Text = "Completing the DiamondERP\nSetup Wizard",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                Location = new Point(14, 12),
                Size = new Size(300, 52),
                ForeColor = Color.Black
            };
            rightContent.Controls.Add(lblTitle);

            Label lblDesc = new Label
            {
                Text = "Setup has finished installing DiamondERP on your computer. The application may be launched by selecting the installed shortcuts.\n\n" +
                       "Click Finish to exit Setup.",
                Location = new Point(16, 72),
                Size = new Size(295, 66),
                ForeColor = Color.FromArgb(40, 40, 40)
            };
            rightContent.Controls.Add(lblDesc);

            Panel securityBox = new Panel
            {
                Location = new Point(16, 148),
                Size = new Size(295, 60),
                BackColor = Color.FromArgb(240, 245, 255)
            };
            securityBox.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(199, 210, 254)))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, securityBox.Width - 1, securityBox.Height - 1);
                }
            };
            Label lblSecNote = new Label
            {
                Text = "Security Note: On first start, you will be prompted once for your master password to activate this computer for its lifetime.",
                Font = new Font("Segoe UI", 7.75f),
                ForeColor = Color.FromArgb(55, 48, 163),
                Location = new Point(6, 6),
                Size = new Size(280, 46)
            };
            securityBox.Controls.Add(lblSecNote);
            rightContent.Controls.Add(securityBox);

            chkFinishLaunch = new CheckBox
            {
                Text = "Launch DiamondERP",
                Location = new Point(18, 222),
                AutoSize = true,
                Checked = true,
                Font = new Font("Segoe UI", 8.5f)
            };
            rightContent.Controls.Add(chkFinishLaunch);

            pages[6].Controls.Add(leftBar);
            pages[6].Controls.Add(rightContent);
            wizardBodyPanel.Controls.Add(pages[6]);
        }

        private void CheckPrerequisites()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo { FileName = "cmd.exe", Arguments = "/c node -v", RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                using (Process p = Process.Start(psi))
                {
                    nodeVersion = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(3000);
                    if (p.ExitCode == 0 && nodeVersion.StartsWith("v")) { isNodeInstalled = true; }
                }
            } catch { }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo { FileName = "cmd.exe", Arguments = "/c npm -v", RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                using (Process p = Process.Start(psi))
                {
                    npmVersion = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(3000);
                    if (p.ExitCode == 0 && npmVersion.Length > 0) { isNpmInstalled = true; }
                }
            } catch { }
        }

        private void ShowPage(int pageIndex)
        {
            currentPage = pageIndex;

            for (int i = 0; i < TOTAL_PAGES; i++)
            {
                pages[i].Visible = (i == pageIndex);
            }

            // Top banner is only visible for interior pages (1 through 5)
            bool isInterior = (pageIndex >= 1 && pageIndex <= 5);
            topBannerPanel.Visible = isInterior;

            // Configure navigation buttons
            btnBack.Visible = (pageIndex > 0 && pageIndex < 6);
            btnBack.Enabled = (pageIndex > 0 && pageIndex != 5);
            btnCancel.Visible = (pageIndex < 6);
            btnCancel.Enabled = (pageIndex != 5);

            switch (pageIndex)
            {
                case 0: // Welcome
                    btnNext.Text = "Next >";
                    btnNext.Enabled = true;
                    break;

                case 1: // License
                    lblTopBannerTitle.Text = "License Agreement";
                    lblTopBannerSubtitle.Text = "Please read the following important information before continuing.";
                    btnNext.Text = "Next >";
                    btnNext.Enabled = rbAccept.Checked;
                    break;

                case 2: // Destination
                    lblTopBannerTitle.Text = "Select Destination Location";
                    lblTopBannerSubtitle.Text = "Where should DiamondERP be installed?";
                    txtDestPath.Text = appDir;
                    btnNext.Text = "Next >";
                    btnNext.Enabled = true;
                    break;

                case 3: // Additional Tasks
                    lblTopBannerTitle.Text = "Select Additional Tasks";
                    lblTopBannerSubtitle.Text = "Which additional tasks should be performed?";
                    btnNext.Text = "Next >";
                    btnNext.Enabled = true;
                    break;

                case 4: // Ready to Install
                    lblTopBannerTitle.Text = "Ready to Install";
                    lblTopBannerSubtitle.Text = "Setup is now ready to begin installing DiamondERP on your computer.";
                    btnNext.Text = "Install";
                    btnNext.Enabled = true;
                    UpdateSummary();
                    break;

                case 5: // Installing
                    lblTopBannerTitle.Text = "Installing";
                    lblTopBannerSubtitle.Text = "Please wait while Setup installs DiamondERP on your computer.";
                    btnNext.Enabled = false;
                    StartInstallWorker();
                    break;

                case 6: // Finished
                    btnNext.Text = "Finish";
                    btnNext.Enabled = true;
                    break;
            }

            PositionButtons();
        }

        private void UpdateSummary()
        {
            string summary = "Destination location:\r\n" +
                             "      " + appDir + "\r\n\r\n" +
                             "Additional tasks:\r\n";
            if (chkDesktopShortcut.Checked) summary += "      Create a desktop shortcut\r\n";
            if (chkStartMenuShortcut.Checked) summary += "      Create a Start Menu shortcut\r\n";
            if (chkLaunchAfter.Checked) summary += "      Launch DiamondERP after installation\r\n";

            summary += "\r\nSystem Prerequisites:\r\n";
            summary += isNodeInstalled ? "      Node.js: " + nodeVersion + " (Detected)\r\n" : "      Node.js: Not detected in PATH (Warning)\r\n";
            summary += isNpmInstalled ? "      NPM: v" + npmVersion + " (Detected)\r\n" : "      NPM: Not detected in PATH (Warning)\r\n";

            txtSummary.Text = summary;
        }

        private void BtnNext_Click(object sender, EventArgs e)
        {
            if (currentPage < 5)
            {
                ShowPage(currentPage + 1);
            }
            else if (currentPage == 6)
            {
                if (chkFinishLaunch.Checked)
                {
                    LaunchApp();
                }
                this.Close();
            }
        }

        private void BtnBack_Click(object sender, EventArgs e)
        {
            if (currentPage > 0 && currentPage != 5)
            {
                ShowPage(currentPage - 1);
            }
        }

        private void AppendLog(string text)
        {
            if (txtInstallLog.InvokeRequired)
            {
                txtInstallLog.Invoke(new Action<string>(AppendLog), text);
                return;
            }
            txtInstallLog.AppendText(text + Environment.NewLine);
        }

        private void SetInstallStatus(string text, int progress)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<string, int>(SetInstallStatus), text, progress);
                return;
            }
            lblInstallStatus.Text = text;
            progressBar.Value = Math.Min(100, Math.Max(0, progress));
        }

        private void StartInstallWorker()
        {
            ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    SetInstallStatus("Validating environment...", 20);
                    AppendLog("[1/4] Checking environment runtime...");
                    Thread.Sleep(250);

                    // Ensure DiamondERP.exe is ready in appDir
                    string targetLauncherExe = Path.Combine(appDir, "DiamondERP.exe");
                    string installerLauncherExe = Path.Combine(appDir, "installer", "DiamondERP.exe");
                    string launcherCs = Path.Combine(appDir, "installer", "Launcher.cs");
                    string iconPath = Path.Combine(appDir, "installer", "app.ico");

                    SetInstallStatus("Preparing desktop launcher executable...", 45);
                    AppendLog("[2/4] Verifying DiamondERP.exe launcher...");

                    // If DiamondERP.exe is in installer folder, copy to root as well
                    if (!File.Exists(targetLauncherExe) && File.Exists(installerLauncherExe))
                    {
                        try { File.Copy(installerLauncherExe, targetLauncherExe, true); } catch { }
                    }

                    // If neither exists, compile from Launcher.cs
                    if (!File.Exists(targetLauncherExe) && !File.Exists(installerLauncherExe) && File.Exists(launcherCs))
                    {
                        string csc = @"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe";
                        if (File.Exists(csc))
                        {
                            string args = string.Format("/out:\"{0}\" /target:winexe /win32icon:\"{1}\" \"{2}\"", targetLauncherExe, iconPath, launcherCs);
                            RunProcess(csc, args);
                        }
                    }

                    // Choose primary executable for shortcut
                    string shortcutTarget = File.Exists(targetLauncherExe) ? targetLauncherExe : (File.Exists(installerLauncherExe) ? installerLauncherExe : null);

                    if (string.IsNullOrEmpty(shortcutTarget) || !File.Exists(shortcutTarget))
                    {
                        throw new FileNotFoundException("Could not locate or compile DiamondERP.exe launcher.");
                    }

                    SetInstallStatus("Creating application shortcuts...", 75);
                    AppendLog("[3/4] Creating application shortcuts pointing to: " + Path.GetFileName(shortcutTarget));
                    Thread.Sleep(250);

                    if (chkDesktopShortcut.Checked)
                    {
                        // Create in user's special desktop directory (works with OneDrive redirection)
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                        CreateShortcut(Path.Combine(desktopPath, "DiamondERP.lnk"), shortcutTarget, appDir, iconPath, "DiamondERP Enterprise Management");
                        AppendLog("✔ Created Desktop shortcut: " + Path.Combine(desktopPath, "DiamondERP.lnk"));

                        // Also create in local desktop if different from OneDrive desktop
                        string localDesktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
                        if (!localDesktop.Equals(desktopPath, StringComparison.OrdinalIgnoreCase) && Directory.Exists(localDesktop))
                        {
                            CreateShortcut(Path.Combine(localDesktop, "DiamondERP.lnk"), shortcutTarget, appDir, iconPath, "DiamondERP Enterprise Management");
                        }
                    }

                    if (chkStartMenuShortcut.Checked)
                    {
                        string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        string lnkPath = Path.Combine(startMenu, "DiamondERP.lnk");
                        CreateShortcut(lnkPath, shortcutTarget, appDir, iconPath, "DiamondERP Enterprise Management");
                        AppendLog("✔ Created Start Menu shortcut: " + lnkPath);
                    }

                    SetInstallStatus("Installation completed!", 100);
                    AppendLog("[4/4] Installation finished successfully.");
                    Thread.Sleep(400);

                    this.Invoke(new Action(() => ShowPage(6)));
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
            if (!File.Exists(launcherExe)) { launcherExe = Path.Combine(appDir, "installer", "DiamondERP.exe"); }

            if (File.Exists(launcherExe))
            {
                Process.Start(new ProcessStartInfo(launcherExe) { WorkingDirectory = appDir });
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

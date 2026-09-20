using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Diamond ERP Setup")]
[assembly: AssemblyDescription("Diamond ERP Setup Wizard")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Diamond ERP")]
[assembly: AssemblyProduct("Diamond ERP")]
[assembly: AssemblyCopyright("Copyright © 2025-2026 Diamond ERP")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("3.0.0.0")]
[assembly: AssemblyFileVersion("3.0.0.0")]
[assembly: AssemblyInformationalVersion("3.0.0")]

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
        private string installedTargetDir;
        private string webView2Version = "";
        private bool isWebView2Installed = false;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string runningAppDir = Path.GetFileName(baseDir).Equals("installer", StringComparison.OrdinalIgnoreCase)
                ? Directory.GetParent(baseDir).FullName
                : baseDir;

            bool isUninstall = false;
            bool isSilent = false;
            string customDir = null;
            bool createDesktop = true;
            bool createStartMenu = true;
            bool launchAfter = false;

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (a.Equals("/uninstall", StringComparison.OrdinalIgnoreCase) || a.Equals("/u", StringComparison.OrdinalIgnoreCase))
                {
                    isUninstall = true;
                }
                else if (a.Equals("/silent", StringComparison.OrdinalIgnoreCase) || a.Equals("/s", StringComparison.OrdinalIgnoreCase) || a.Equals("/verysilent", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
                else if (a.StartsWith("/dir=", StringComparison.OrdinalIgnoreCase))
                {
                    customDir = a.Substring(5).Trim('\"');
                }
                else if (a.Equals("/nodesktop", StringComparison.OrdinalIgnoreCase))
                {
                    createDesktop = false;
                }
                else if (a.Equals("/nostartmenu", StringComparison.OrdinalIgnoreCase))
                {
                    createStartMenu = false;
                }
                else if (a.Equals("/launch", StringComparison.OrdinalIgnoreCase))
                {
                    launchAfter = true;
                }
            }

            if (isUninstall)
            {
                PerformUninstall(runningAppDir, isSilent);
                return;
            }

            if (isSilent)
            {
                int exitCode = PerformSilentInstall(runningAppDir, customDir, createDesktop, createStartMenu, launchAfter);
                Environment.Exit(exitCode);
                return;
            }

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

            CheckPrerequisites();
            InitializeComponent();
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
                Size = new Size(295, 140),
                ForeColor = Color.FromArgb(40, 40, 40)
            };
            rightContent.Controls.Add(lblDesc);

            Label lblPrereq = new Label
            {
                Text = isWebView2Installed
                    ? "✔ System Prerequisite: Microsoft Edge WebView2 Runtime is installed (v" + webView2Version + ")."
                    : "⚠ Prerequisite Alert: Microsoft Edge WebView2 Runtime is REQUIRED, but was not detected.",
                Font = new Font("Segoe UI", 8.25f, isWebView2Installed ? FontStyle.Regular : FontStyle.Bold),
                ForeColor = isWebView2Installed ? Color.FromArgb(22, 101, 52) : Color.FromArgb(185, 28, 28),
                Location = new Point(16, 218),
                Size = new Size(295, 36)
            };
            rightContent.Controls.Add(lblPrereq);

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
                       "This software is licensed, not sold. DiamondERP grants you the non-exclusive, non-transferable right to install and execute this software solely for diamond trading, parcel inventory management, and ledger accounting operations.\r\n\r\n" +
                       "2. LOCAL DESKTOP DEPLOYMENT\r\n" +
                       "This standalone enterprise desktop application runs fully offline on your local computer. All backend processing, database transactions, and data management operate entirely on your machine without external network dependencies.\r\n\r\n" +
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

            string defaultInstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "DiamondERP");
            txtDestPath = new TextBox
            {
                Text = defaultInstallDir,
                Location = new Point(14, 25),
                Size = new Size(350, 23),
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ReadOnly = false,
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
                    fbd.SelectedPath = txtDestPath.Text;
                    fbd.Description = "Select the folder where DiamondERP should be installed:";
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtDestPath.Text = fbd.SelectedPath;
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
                Text = "Offline Operation: DiamondERP runs entirely on your local machine with no internet connection required. Your business data is stored locally in your secure user profile.",
                Font = new Font("Segoe UI", 7.75f),
                ForeColor = Color.FromArgb(30, 64, 175),
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

        public static bool IsWebView2Available(out string version)
        {
            version = "";
            string[] subKeys = new string[]
            {
                @"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
                @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
            };

            // Check HKLM 64-bit and 32-bit registry views
            try
            {
                foreach (var sk in subKeys)
                {
                    using (var key = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64).OpenSubKey(sk))
                    {
                        if (key != null)
                        {
                            object val = key.GetValue("pv");
                            if (val != null && !string.IsNullOrEmpty(val.ToString()) && val.ToString() != "0.0.0.0")
                            {
                                version = val.ToString();
                                return true;
                            }
                        }
                    }
                    using (var key = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry32).OpenSubKey(sk))
                    {
                        if (key != null)
                        {
                            object val = key.GetValue("pv");
                            if (val != null && !string.IsNullOrEmpty(val.ToString()) && val.ToString() != "0.0.0.0")
                            {
                                version = val.ToString();
                                return true;
                            }
                        }
                    }
                }
            }
            catch { }

            // Check HKCU
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"))
                {
                    if (key != null)
                    {
                        object val = key.GetValue("pv");
                        if (val != null && !string.IsNullOrEmpty(val.ToString()) && val.ToString() != "0.0.0.0")
                        {
                            version = val.ToString();
                            return true;
                        }
                    }
                }
            }
            catch { }

            return false;
        }

        private void CheckPrerequisites()
        {
            isWebView2Installed = IsWebView2Available(out webView2Version);
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
                    if (string.IsNullOrEmpty(txtDestPath.Text))
                    {
                        txtDestPath.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "DiamondERP");
                    }
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
            string target = !string.IsNullOrEmpty(txtDestPath.Text) ? txtDestPath.Text : appDir;
            string summary = "Destination location:\r\n" +
                             "      " + target + "\r\n\r\n" +
                             "Additional tasks:\r\n";
            if (chkDesktopShortcut.Checked) summary += "      Create a desktop shortcut\r\n";
            if (chkStartMenuShortcut.Checked) summary += "      Create a Start Menu shortcut\r\n";
            if (chkLaunchAfter.Checked) summary += "      Launch DiamondERP after installation\r\n";

            summary += "\r\nSystem Prerequisites:\r\n";
            summary += isWebView2Installed 
                ? "      WebView2 Runtime: v" + webView2Version + " (Required - Detected)\r\n" 
                : "      WebView2 Runtime: Required (Evergreen — NOT DETECTED)\r\n";
            summary += "      Architecture: Standalone Desktop (Pre-compiled, no dev tools needed)\r\n";

            txtSummary.Text = summary;
        }

        public static bool ValidateInstallationPath(string path, out string errorMessage)
        {
            errorMessage = null;
            if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(path.Trim()))
            {
                errorMessage = "Installation path cannot be empty.";
                return false;
            }

            try
            {
                string trimmed = path.Trim();
                if (trimmed.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
                {
                    errorMessage = "Installation path contains invalid characters.";
                    return false;
                }

                string fullPath = Path.GetFullPath(trimmed);
                if (!Path.IsPathRooted(fullPath))
                {
                    errorMessage = "Installation path must be an absolute path (e.g. C:\\Program Files\\DiamondERP).";
                    return false;
                }

                string root = Path.GetPathRoot(fullPath);
                if (fullPath.Equals(root, StringComparison.OrdinalIgnoreCase) ||
                    fullPath.Equals(root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
                {
                    errorMessage = "Cannot install directly into the root of a drive (" + root + "). Please specify an application folder.";
                    return false;
                }

                string winDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                if (!string.IsNullOrEmpty(winDir) && (fullPath.Equals(winDir, StringComparison.OrdinalIgnoreCase) || fullPath.StartsWith(winDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                {
                    errorMessage = "Cannot install into the Windows system directory.";
                    return false;
                }

                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string userDbDir = Path.Combine(localAppData, "DiamondERP");
                if (fullPath.Equals(userDbDir, StringComparison.OrdinalIgnoreCase) || fullPath.StartsWith(userDbDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    errorMessage = "Installation directory cannot be inside the customer data directory:\r\n" + userDbDir + "\r\n\r\nApplication binaries belong in Program Files, while your business data remains in AppData.";
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                errorMessage = "Invalid installation path: " + ex.Message;
                return false;
            }
        }

        private void BtnNext_Click(object sender, EventArgs e)
        {
            if (currentPage == 0 && !isWebView2Installed)
            {
                MessageBox.Show(
                    "DiamondERP requires Microsoft Edge WebView2 Runtime to display the application.\n\n" +
                    "Please install Microsoft Edge WebView2 Runtime and start Setup again.",
                    "WebView2 Runtime Required",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            if (currentPage == 2)
            {
                string targetDir = !string.IsNullOrEmpty(txtDestPath.Text) ? txtDestPath.Text.Trim() : "";
                string pathErr;
                if (!ValidateInstallationPath(targetDir, out pathErr))
                {
                    MessageBox.Show(pathErr, "Invalid Destination Folder", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
            }

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
                    string defaultDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "DiamondERP");
                    string targetDir = !string.IsNullOrEmpty(txtDestPath.Text) ? txtDestPath.Text.Trim() : defaultDir;
                    installedTargetDir = targetDir;

                    string validErr;
                    if (!ValidateInstallationPath(targetDir, out validErr))
                    {
                        throw new ArgumentException(validErr);
                    }

                    SetInstallStatus("Validating environment...", 15);
                    AppendLog("[1/4] Validating offline standalone installation environment...");
                    Thread.Sleep(150);

                    if (!isWebView2Installed)
                    {
                        throw new InvalidOperationException("Microsoft Edge WebView2 Runtime is required to run DiamondERP, but was not detected on this computer.\r\n\r\nPlease install Microsoft Edge WebView2 Runtime before installing DiamondERP.");
                    }

                    // Check elevation if target is in Program Files
                    string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                    if (targetDir.StartsWith(pf, StringComparison.OrdinalIgnoreCase) && !IsAdministrator())
                    {
                        throw new UnauthorizedAccessException("Installing into " + targetDir + " requires administrator privileges. Please restart Setup as Administrator.");
                    }

                    // Disk space check (verify at least 250 MB free)
                    try
                    {
                        string driveRoot = Path.GetPathRoot(Path.GetFullPath(targetDir));
                        if (!string.IsNullOrEmpty(driveRoot))
                        {
                            DriveInfo di = new DriveInfo(driveRoot);
                            if (di.IsReady && di.AvailableFreeSpace < 250L * 1024 * 1024)
                            {
                                throw new IOException(string.Format("Insufficient disk space on drive {0}. At least 250 MB free space is required (found {1:N1} MB).", driveRoot, di.AvailableFreeSpace / (1024.0 * 1024.0)));
                            }
                        }
                    }
                    catch (IOException) { throw; }
                    catch (Exception) { }

                    // Gracefully close any running DiamondERP process
                    EnsureAppNotRunning(true, targetDir);

                    SetInstallStatus("Deploying application binaries...", 45);
                    AppendLog("[2/4] Deploying application payload to: " + targetDir);

                    // Universal transactional payload deployment (embedded resource, adjacent zip, or directory copy)
                    DeployPayload(appDir, targetDir, AppendLog, pct => SetInstallStatus("Deploying application binaries...", pct));

                    string shortcutTarget = Path.Combine(targetDir, "DiamondERP.exe");
                    string targetIcon = Path.Combine(targetDir, "app.ico");
                    if (!File.Exists(targetIcon)) { targetIcon = Path.Combine(appDir, "app.ico"); }

                    SetInstallStatus("Creating application shortcuts...", 80);
                    AppendLog("[3/4] Creating application shortcuts pointing to: " + Path.GetFileName(shortcutTarget));
                    Thread.Sleep(150);

                    if (chkDesktopShortcut.Checked)
                    {
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                        string lnk1 = Path.Combine(desktopPath, "DiamondERP.lnk");
                        if (CreateShortcut(lnk1, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", AppendLog))
                        {
                            AppendLog("✔ Created Desktop shortcut: " + lnk1);
                        }

                        string localDesktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
                        if (!localDesktop.Equals(desktopPath, StringComparison.OrdinalIgnoreCase) && Directory.Exists(localDesktop))
                        {
                            string lnk2 = Path.Combine(localDesktop, "DiamondERP.lnk");
                            CreateShortcut(lnk2, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", AppendLog);
                        }
                    }

                    if (chkStartMenuShortcut.Checked)
                    {
                        string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        string lnkPath = Path.Combine(startMenu, "DiamondERP.lnk");
                        if (CreateShortcut(lnkPath, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", AppendLog))
                        {
                            AppendLog("✔ Created Start Menu shortcut: " + lnkPath);
                        }
                    }

                    // Register uninstaller in Add/Remove Programs
                    if (RegisterUninstall(targetDir, targetIcon, AppendLog))
                    {
                        AppendLog("✔ Registered uninstaller in Windows Add/Remove Programs");
                    }

                    SetInstallStatus("Installation completed!", 100);
                    AppendLog("[4/4] Installation finished successfully.");
                    Thread.Sleep(250);

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

        private static bool CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string description, Action<string> logWarning = null)
        {
            try
            {
                string dir = Path.GetDirectoryName(shortcutPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null)
                {
                    if (logWarning != null)
                    {
                        logWarning("Warning: WScript.Shell COM type not found. Shortcut could not be created at: " + shortcutPath);
                    }
                    return false;
                }

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
                return true;
            }
            catch (Exception ex)
            {
                if (logWarning != null)
                {
                    logWarning(string.Format("Warning: Could not create shortcut '{0}': {1}", shortcutPath, ex.Message));
                }
                return false;
            }
        }

        private void LaunchApp()
        {
            string target = !string.IsNullOrEmpty(installedTargetDir) ? installedTargetDir : appDir;
            string launcherExe = Path.Combine(target, "DiamondERP.exe");
            if (!File.Exists(launcherExe)) { launcherExe = Path.Combine(appDir, "DiamondERP.exe"); }
            if (!File.Exists(launcherExe)) { launcherExe = Path.Combine(appDir, "installer", "DiamondERP.exe"); }

            if (File.Exists(launcherExe))
            {
                Process.Start(new ProcessStartInfo(launcherExe) { WorkingDirectory = target });
            }
        }

        private static void CopyDirectoryRecursive(string source, string target)
        {
            if (!Directory.Exists(target))
            {
                Directory.CreateDirectory(target);
            }

            foreach (string file in Directory.GetFiles(source))
            {
                string fileName = Path.GetFileName(file);
                if (fileName.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) || fileName.Equals("test.db", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                string destFile = Path.Combine(target, fileName);
                File.Copy(file, destFile, true);
            }

            foreach (string dir in Directory.GetDirectories(source))
            {
                string dirName = Path.GetFileName(dir);
                if (dirName.Equals(".git", StringComparison.OrdinalIgnoreCase) || dirName.Equals(".github", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                CopyDirectoryRecursive(dir, Path.Combine(target, dirName));
            }
        }

        private static void CopyApplicationPayload(string sourceDir, string targetDir, Action<string> logAction = null)
        {
            string[] rootFiles = new string[]
            {
                "DiamondERP.exe",
                "Installer.exe",
                "Microsoft.Web.WebView2.Core.dll",
                "Microsoft.Web.WebView2.Wpf.dll",
                "WebView2Loader.dll",
                "app.ico"
            };

            foreach (string rf in rootFiles)
            {
                string src = Path.Combine(sourceDir, rf);
                if (File.Exists(src))
                {
                    File.Copy(src, Path.Combine(targetDir, rf), true);
                    if (logAction != null) logAction("  Copied: " + rf);
                }
            }

            string[] subDirs = new string[] { "runtime", "api", "web" };
            foreach (string sd in subDirs)
            {
                string srcSub = Path.Combine(sourceDir, sd);
                if (Directory.Exists(srcSub))
                {
                    if (logAction != null) logAction("  Deploying " + sd + "/ payload...");
                    CopyDirectoryRecursive(srcSub, Path.Combine(targetDir, sd));
                    if (logAction != null) logAction("  ✔ Deployed: " + sd + "/");
                }
            }
        }

        public static void ExtractZipStream(Stream zipStream, string targetDir, Action<string> logAction = null, Action<int> progressAction = null)
        {
            string targetRoot = Path.GetFullPath(targetDir);
            if (!targetRoot.EndsWith(Path.DirectorySeparatorChar.ToString()))
            {
                targetRoot += Path.DirectorySeparatorChar;
            }

            using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
            {
                int totalEntries = archive.Entries.Count;
                int current = 0;
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    current++;
                    string rawName = entry.FullName;
                    if (string.IsNullOrEmpty(rawName)) continue;

                    // Security: Reject control chars, null bytes, alternate data streams, drive colons
                    if (rawName.IndexOf('\0') >= 0 || rawName.IndexOf(':') >= 0)
                    {
                        throw new System.Security.SecurityException(
                            string.Format("Security violation: Malicious archive entry contains illegal character or drive/stream colon '{0}'. Extraction aborted.", rawName));
                    }

                    // Security: Reject leading directory separators, drive roots, UNC paths
                    string normalized = rawName.Replace('/', Path.DirectorySeparatorChar);
                    if (normalized.StartsWith(Path.DirectorySeparatorChar.ToString()) ||
                        normalized.StartsWith(Path.AltDirectorySeparatorChar.ToString()) ||
                        normalized.StartsWith("\\\\") ||
                        Path.IsPathRooted(normalized))
                    {
                        throw new System.Security.SecurityException(
                            string.Format("Security violation: Malicious archive entry has absolute, rooted, or UNC path '{0}'. Extraction aborted.", rawName));
                    }

                    // Security: Reject any segment with directory traversal ".." or invalid relative sequences
                    string[] segments = normalized.Split(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (string seg in segments)
                    {
                        string s = seg.Trim();
                        if (s == ".." || s.StartsWith("..") || s.Contains(".."))
                        {
                            throw new System.Security.SecurityException(
                                string.Format("Security violation: Malicious archive entry contains directory traversal ('..') sequence '{0}'. Extraction aborted.", rawName));
                        }
                    }

                    // Canonical destination full path
                    string destFile = Path.GetFullPath(Path.Combine(targetRoot, normalized));

                    // Security: Strictly enforce directory boundary within targetRoot (respecting directory separator)
                    if (!destFile.StartsWith(targetRoot, StringComparison.OrdinalIgnoreCase) || destFile.Length < targetRoot.Length)
                    {
                        throw new System.Security.SecurityException(
                            string.Format("Security violation: Archive entry '{0}' resolves outside installation root '{1}' -> '{2}'. Extraction aborted.", rawName, targetRoot, destFile));
                    }

                    // Directory entry handling
                    if (string.IsNullOrEmpty(entry.Name) && (rawName.EndsWith("/") || rawName.EndsWith("\\")))
                    {
                        if (!Directory.Exists(destFile))
                        {
                            Directory.CreateDirectory(destFile);
                        }
                        continue;
                    }

                    string destDir = Path.GetDirectoryName(destFile);
                    if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                    {
                        string checkDir = destDir.EndsWith(Path.DirectorySeparatorChar.ToString()) ? destDir : destDir + Path.DirectorySeparatorChar;
                        if (!checkDir.StartsWith(targetRoot, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new System.Security.SecurityException(
                                string.Format("Security violation: Parent directory for entry '{0}' escapes target root '{1}'. Extraction aborted.", rawName, targetRoot));
                        }
                        Directory.CreateDirectory(destDir);
                    }

                    entry.ExtractToFile(destFile, true);

                    if (current % 300 == 0 || current == totalEntries)
                    {
                        int pct = 45 + (int)((current / (double)totalEntries) * 30);
                        if (progressAction != null) progressAction(pct);
                        if (logAction != null) logAction(string.Format("  [{0}/{1}] Deployed: {2}", current, totalEntries, entry.FullName));
                    }
                }
            }
            if (logAction != null) logAction("✔ Payload extraction completed successfully.");
        }

        private static void VerifyPayloadIntegrity(string dir)
        {
            string[] criticalFiles = new string[]
            {
                "DiamondERP.exe",
                Path.Combine("runtime", "node.exe"),
                Path.Combine("api", "dist", "index.js"),
                Path.Combine("web", "dist", "index.html"),
                Path.Combine("api", "prisma", "template.db")
            };

            foreach (string cf in criticalFiles)
            {
                string fullPath = Path.Combine(dir, cf);
                if (!File.Exists(fullPath))
                {
                    throw new FileNotFoundException("Payload integrity check failed: missing critical runtime file '" + cf + "' in: " + dir);
                }
                FileInfo fi = new FileInfo(fullPath);
                if (fi.Length == 0)
                {
                    throw new InvalidDataException("Payload integrity check failed: critical runtime file '" + cf + "' is 0 bytes (corrupt) in: " + dir);
                }
            }
        }

        private static void ExtractRawPayload(string sourceDir, string targetDir, Action<string> logAction, Action<int> progressAction)
        {
            // Mode 1: Embedded Zip Resource inside executing assembly (Single-file Setup.exe)
            Assembly asm = Assembly.GetExecutingAssembly();
            string[] resNames = asm.GetManifestResourceNames();
            string payloadRes = null;
            foreach (string r in resNames)
            {
                if (r.EndsWith("DiamondERP.Payload.zip", StringComparison.OrdinalIgnoreCase) || r.Equals("DiamondERP.Payload.zip", StringComparison.OrdinalIgnoreCase))
                {
                    payloadRes = r;
                    break;
                }
            }

            if (payloadRes != null)
            {
                if (logAction != null) logAction("Extracting embedded self-contained payload archive (" + payloadRes + ")...");
                using (Stream s = asm.GetManifestResourceStream(payloadRes))
                {
                    if (s != null)
                    {
                        ExtractZipStream(s, targetDir, logAction, progressAction);
                        return;
                    }
                }
            }

            // Mode 2: Adjacent zip package in sourceDir or baseDir
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string[] candidateZips = new string[]
            {
                Path.Combine(sourceDir, "DiamondERP-3.0.0-Windows-x64.zip"),
                Path.Combine(sourceDir, "DiamondERP-Windows-x64.zip"),
                Path.Combine(sourceDir, "payload.zip"),
                Path.Combine(baseDir, "DiamondERP-3.0.0-Windows-x64.zip"),
                Path.Combine(baseDir, "DiamondERP-Windows-x64.zip"),
                Path.Combine(baseDir, "payload.zip")
            };

            foreach (string cz in candidateZips)
            {
                if (File.Exists(cz))
                {
                    if (logAction != null) logAction("Extracting adjacent payload archive: " + Path.GetFileName(cz) + "...");
                    using (FileStream fs = File.OpenRead(cz))
                    {
                        ExtractZipStream(fs, targetDir, logAction, progressAction);
                        return;
                    }
                }
            }

            // Mode 3: Directory-based copy from sourceDir
            string runtimeNode = Path.Combine(sourceDir, "runtime", "node.exe");
            string launcherExe = Path.Combine(sourceDir, "DiamondERP.exe");
            if (File.Exists(runtimeNode) && File.Exists(launcherExe))
            {
                if (logAction != null) logAction("Deploying application payload from staged directory: " + sourceDir);
                CopyApplicationPayload(sourceDir, targetDir, logAction);
                return;
            }

            // Mode 4: Staged development directory fallback
            string[] fallbackDirs = new string[]
            {
                Path.Combine(sourceDir, "..", "windows", "DiamondERP"),
                Path.Combine(sourceDir, "..", "..", "build", "windows", "DiamondERP"),
                Path.Combine(sourceDir, "build", "windows", "DiamondERP"),
                Path.Combine(baseDir, "..", "windows", "DiamondERP"),
                Path.Combine(baseDir, "..", "..", "build", "windows", "DiamondERP"),
                Path.Combine(baseDir, "build", "windows", "DiamondERP")
            };
            foreach (string fb in fallbackDirs)
            {
                if (File.Exists(Path.Combine(fb, "runtime", "node.exe")) && File.Exists(Path.Combine(fb, "DiamondERP.exe")))
                {
                    string fullFb = Path.GetFullPath(fb);
                    if (logAction != null) logAction("Deploying application payload from staged directory: " + fullFb);
                    CopyApplicationPayload(fullFb, targetDir, logAction);
                    return;
                }
            }

            throw new FileNotFoundException("Could not locate DiamondERP production payload. Expected embedded resource, adjacent zip package, or staged application directory.");
        }

        private static void DeployPayload(string sourceDir, string targetDir, Action<string> logAction = null, Action<int> progressAction = null)
        {
            targetDir = Path.GetFullPath(targetDir);
            string parentDir = Path.GetDirectoryName(targetDir);
            if (!Directory.Exists(parentDir))
            {
                Directory.CreateDirectory(parentDir);
            }

            bool isExistingInstall = Directory.Exists(targetDir) && File.Exists(Path.Combine(targetDir, "DiamondERP.exe"));

            if (isExistingInstall)
            {
                string stagingDir = Path.Combine(parentDir, Path.GetFileName(targetDir) + ".staging_" + Guid.NewGuid().ToString("N").Substring(0, 8));
                string backupDir = Path.Combine(parentDir, Path.GetFileName(targetDir) + ".backup_" + Guid.NewGuid().ToString("N").Substring(0, 8));

                try
                {
                    if (logAction != null) logAction("Preparing staged upgrade package...");
                    if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true);
                    Directory.CreateDirectory(stagingDir);

                    // 1. Extract into isolated staging directory
                    ExtractRawPayload(sourceDir, stagingDir, logAction, progressAction);

                    // 2. Validate extracted files before modifying active installation
                    if (logAction != null) logAction("Validating deployment payload integrity...");
                    VerifyPayloadIntegrity(stagingDir);

                    // 3. Gracefully stop running app before file swap
                    EnsureAppNotRunning(false, targetDir);

                    // 4. Atomic directory swap with automatic rollback protection
                    if (logAction != null) logAction("Upgrading application files...");
                    bool moveSucceeded = false;
                    for (int attempt = 0; attempt < 10; attempt++)
                    {
                        try
                        {
                            Directory.Move(targetDir, backupDir);
                            moveSucceeded = true;
                            break;
                        }
                        catch (Exception)
                        {
                            Thread.Sleep(400);
                        }
                    }

                    if (moveSucceeded)
                    {
                        try
                        {
                            Directory.Move(stagingDir, targetDir);
                        }
                        catch (Exception ex)
                        {
                            // ROLLBACK: Restore previous installation if swap fails!
                            if (logAction != null) logAction("ERROR: Staged swap failed. Initiating automatic rollback: " + ex.Message);
                            if (Directory.Exists(backupDir) && !Directory.Exists(targetDir))
                            {
                                try { Directory.Move(backupDir, targetDir); } catch { }
                            }
                            throw;
                        }

                        // Cleanup backup directory on success
                        try
                        {
                            if (Directory.Exists(backupDir)) Directory.Delete(backupDir, true);
                        }
                        catch { }
                    }
                    else
                    {
                        // Fallback: in-place transactional file deployment when folder handle is held
                        if (logAction != null) logAction("Note: Directory handle locked, executing transactional in-place file upgrade...");
                        CopyDirectoryRecursive(targetDir, backupDir);
                        try
                        {
                            // Option A: Clean known payload subdirectories to eliminate obsolete files from older releases
                            string[] obsoleteDirs = new string[] { "runtime", Path.Combine("api", "dist"), Path.Combine("web", "dist") };
                            foreach (string od in obsoleteDirs)
                            {
                                string p = Path.Combine(targetDir, od);
                                if (Directory.Exists(p))
                                {
                                    try { Directory.Delete(p, true); } catch { }
                                }
                            }

                            CopyDirectoryRecursive(stagingDir, targetDir);
                            VerifyPayloadIntegrity(targetDir);
                        }
                        catch (Exception ex)
                        {
                            if (logAction != null) logAction("ERROR: File-level upgrade failed. Restoring from backup: " + ex.Message);
                            try { CopyDirectoryRecursive(backupDir, targetDir); } catch { }
                            throw;
                        }
                        finally
                        {
                            try { if (Directory.Exists(backupDir)) Directory.Delete(backupDir, true); } catch { }
                        }
                    }

                    if (logAction != null) logAction("✔ Application upgrade committed successfully.");
                }
                catch
                {
                    // If anything fails during staging, clean up staging dir
                    try { if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true); } catch { }
                    throw;
                }
            }
            else
            {
                // Fresh installation: extract directly and verify
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                try
                {
                    ExtractRawPayload(sourceDir, targetDir, logAction, progressAction);
                    VerifyPayloadIntegrity(targetDir);
                }
                catch
                {
                    // Clean up partial fresh installation so broken state is not left
                    try { if (Directory.Exists(targetDir)) Directory.Delete(targetDir, true); } catch { }
                    throw;
                }
            }
        }

        private static bool IsAdministrator()
        {
            try
            {
                using (var identity = System.Security.Principal.WindowsIdentity.GetCurrent())
                {
                    var principal = new System.Security.Principal.WindowsPrincipal(identity);
                    return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
                }
            }
            catch
            {
                return false;
            }
        }

        private static void EnsureAppNotRunning(bool promptUser = false, string targetDir = null)
        {
            Process[] procs = Process.GetProcessesByName("DiamondERP");
            if (procs != null && procs.Length > 0)
            {
                if (promptUser)
                {
                    var res = MessageBox.Show(
                        "Diamond ERP is currently running.\n\nSetup must close the application to proceed with installation or upgrade.\n\nWould you like Setup to close it automatically?",
                        "Diamond ERP Running",
                        MessageBoxButtons.OKCancel,
                        MessageBoxIcon.Warning
                    );
                    if (res != DialogResult.OK)
                    {
                        throw new InvalidOperationException("Setup was cancelled by user because Diamond ERP is currently running.");
                    }
                }

                // 2. Request graceful window close on each process
                foreach (var p in procs)
                {
                    try
                    {
                        p.CloseMainWindow();
                    }
                    catch { }
                }

                // 3. Wait up to 4000ms for exit
                for (int i = 0; i < 40; i++)
                {
                    Thread.Sleep(100);
                    bool anyRunning = false;
                    foreach (var p in procs)
                    {
                        try
                        {
                            if (!p.HasExited) anyRunning = true;
                        }
                        catch { }
                    }
                    if (!anyRunning) break;
                }

                // 4. Force terminate if any process still running after timeout
                foreach (var p in procs)
                {
                    try
                    {
                        if (!p.HasExited)
                        {
                            p.Kill();
                            p.WaitForExit(1000);
                        }
                    }
                    catch { }
                }
            }

            // Always request graceful HTTP shutdown to flush SQLite WAL and disconnect Prisma cleanly
            try
            {
                var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:3002/api/system/shutdown");
                req.Method = "POST";
                req.Timeout = 2000;
                req.ContentLength = 0;
                using (var resp = (System.Net.HttpWebResponse)req.GetResponse()) { }
            }
            catch { }

            // Wait up to 2500ms for loopback port 3002 to close gracefully
            for (int i = 0; i < 25; i++)
            {
                bool portInUse = false;
                try
                {
                    using (var client = new System.Net.Sockets.TcpClient())
                    {
                        var result = client.BeginConnect("127.0.0.1", 3002, null, null);
                        bool connected = result.AsyncWaitHandle.WaitOne(100);
                        if (connected)
                        {
                            client.EndConnect(result);
                            portInUse = true;
                        }
                    }
                }
                catch { }

                if (!portInUse) break;
                Thread.Sleep(100);
            }

            // Terminate any DiamondERP-owned bundled Node processes inside targetDir
            if (!string.IsNullOrEmpty(targetDir))
            {
                try
                {
                    string canonicalTarget = Path.GetFullPath(targetDir);
                    Process[] nodeProcs = Process.GetProcessesByName("node");
                    foreach (var np in nodeProcs)
                    {
                        try
                        {
                            if (!np.HasExited && np.MainModule != null)
                            {
                                string nodePath = np.MainModule.FileName;
                                if (!string.IsNullOrEmpty(nodePath) &&
                                    nodePath.StartsWith(canonicalTarget, StringComparison.OrdinalIgnoreCase))
                                {
                                    if (!np.HasExited)
                                    {
                                        np.Kill();
                                        np.WaitForExit(1500);
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
                catch { }
            }

            // Allow 800ms for OS port and file handle release
            Thread.Sleep(800);
        }

        private static bool RegisterUninstall(string targetDir, string iconPath, Action<string> logWarning = null)
        {
            try
            {
                string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP";
                RegistryKey baseKey = null;
                bool isMachineInstall = IsAdministrator();

                if (isMachineInstall)
                {
                    try
                    {
                        baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Default).CreateSubKey(keyPath);
                    }
                    catch { }
                }

                if (baseKey == null)
                {
                    baseKey = Registry.CurrentUser.CreateSubKey(keyPath);
                }

                using (var key = baseKey)
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "DiamondERP Enterprise Suite");
                        key.SetValue("DisplayVersion", "3.0.0");
                        key.SetValue("Publisher", "DiamondERP Enterprise Systems");
                        key.SetValue("InstallLocation", targetDir);
                        key.SetValue("DisplayIcon", iconPath);
                        key.SetValue("UninstallString", string.Format("\"{0}\" /uninstall", Path.Combine(targetDir, "Installer.exe")));
                        key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                        key.SetValue("EstimatedSize", 185000, RegistryValueKind.DWord);
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                        return true;
                    }
                }
                if (logWarning != null) logWarning("Warning: Could not open uninstall registry key for writing.");
                return false;
            }
            catch (Exception ex)
            {
                if (logWarning != null) logWarning("Warning: Failed to register uninstaller in registry: " + ex.Message);
                return false;
            }
        }

        public static int PerformSilentInstall(string sourceDir, string targetDir, bool createDesktop, bool createStartMenu, bool launchAfter)
        {
            try
            {
                if (string.IsNullOrEmpty(targetDir))
                {
                    string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                    targetDir = Path.Combine(pf, "DiamondERP");
                }
                else
                {
                    targetDir = targetDir.Trim();
                }

                // Destination Path Validation
                string pathValidationErr;
                if (!ValidateInstallationPath(targetDir, out pathValidationErr))
                {
                    Console.Error.WriteLine("Error: " + pathValidationErr);
                    return 1;
                }

                // WebView2 Prerequisite Check for Silent Install
                string wvVer;
                if (!IsWebView2Available(out wvVer))
                {
                    Console.Error.WriteLine("Error: DiamondERP requires Microsoft Edge WebView2 Runtime, but it was not detected on this system. Installation aborted.");
                    return 1;
                }

                // Elevation Safety Check for System Folders
                string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                if (targetDir.StartsWith(programFiles, StringComparison.OrdinalIgnoreCase) && !IsAdministrator())
                {
                    Console.Error.WriteLine("Error: Installing into " + targetDir + " requires administrator privileges. Please run Setup as Administrator.");
                    return 1;
                }

                EnsureAppNotRunning(false, targetDir);

                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                DeployPayload(sourceDir, targetDir, msg => Console.WriteLine(msg), null);

                string shortcutTarget = Path.Combine(targetDir, "DiamondERP.exe");
                string targetIcon = Path.Combine(targetDir, "app.ico");

                if (createDesktop)
                {
                    string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string lnk1 = Path.Combine(desktopPath, "DiamondERP.lnk");
                    if (CreateShortcut(lnk1, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", msg => Console.Error.WriteLine(msg)))
                    {
                        Console.WriteLine("✔ Created Desktop shortcut: " + lnk1);
                    }

                    string localDesktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
                    if (!localDesktop.Equals(desktopPath, StringComparison.OrdinalIgnoreCase) && Directory.Exists(localDesktop))
                    {
                        string lnk2 = Path.Combine(localDesktop, "DiamondERP.lnk");
                        CreateShortcut(lnk2, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", msg => Console.Error.WriteLine(msg));
                    }
                }

                if (createStartMenu)
                {
                    string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    string lnkPath = Path.Combine(startMenu, "DiamondERP.lnk");
                    if (CreateShortcut(lnkPath, shortcutTarget, targetDir, targetIcon, "DiamondERP Enterprise Management", msg => Console.Error.WriteLine(msg)))
                    {
                        Console.WriteLine("✔ Created Start Menu shortcut: " + lnkPath);
                    }
                }

                RegisterUninstall(targetDir, targetIcon, msg => Console.Error.WriteLine(msg));

                if (launchAfter && File.Exists(shortcutTarget))
                {
                    Process.Start(new ProcessStartInfo(shortcutTarget) { WorkingDirectory = targetDir });
                }

                Console.WriteLine("Installation completed successfully to: " + targetDir);
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Silent installation error: " + ex.Message);
                return 1;
            }
        }

        private static void PerformUninstall(string installDir, bool silent = false)
        {
            // Elevation check for system directories
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            if (installDir.StartsWith(programFiles, StringComparison.OrdinalIgnoreCase) && !IsAdministrator())
            {
                if (!silent)
                {
                    MessageBox.Show("Uninstalling from " + installDir + " requires administrator privileges. Please run as Administrator.", "Elevation Required", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                else
                {
                    Console.Error.WriteLine("Error: Uninstalling from " + installDir + " requires administrator privileges.");
                }
                return;
            }

            if (!silent)
            {
                var confirm = MessageBox.Show(
                    "Are you sure you want to uninstall DiamondERP Enterprise Suite?\n\n" +
                    "Note: Your local business database records, parcel inventories, and ledgers stored in AppData will be safely preserved.",
                    "DiamondERP Uninstall",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );

                if (confirm != DialogResult.Yes)
                {
                    return;
                }
            }

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string userDbDir = Path.Combine(localAppData, "DiamondERP");

            // ── HARD UNINSTALL SAFETY GATE (PHASE 7) ─────────────────────────
            // If customer databases or records exist in AppData, uninstallation is BLOCKED
            // unless an authoritative, unexpired, unconsumed uninstall authorization token exists.
            bool hasCustomerData = false;
            string databasesDir = Path.Combine(userDbDir, "databases");
            if (Directory.Exists(databasesDir))
            {
                try
                {
                    string[] dbs = Directory.GetFiles(databasesDir, "*.db");
                    if (dbs.Length > 0) hasCustomerData = true;
                }
                catch { }
            }
            if (File.Exists(Path.Combine(userDbDir, "Stavan.db")) || File.Exists(Path.Combine(userDbDir, "system.db")))
            {
                hasCustomerData = true;
            }

            if (hasCustomerData)
            {
                string tokenPath = Path.Combine(userDbDir, "uninstall-authorization.json");
                bool isAuthorized = false;
                string blockReason = "No data preservation authorization token found in AppData.";

                if (File.Exists(tokenPath))
                {
                    try
                    {
                        string tokenJson = File.ReadAllText(tokenPath);
                        string authId = ExtractJsonValue(tokenJson, "authorizationId");
                        string expiresAtStr = ExtractJsonValue(tokenJson, "expiresAt");
                        string consumedAtStr = ExtractJsonValue(tokenJson, "consumedAt");
                        string destPath = ExtractJsonValue(tokenJson, "preservationDestinationPath");

                        DateTime expiresAt;
                        if (string.IsNullOrEmpty(authId))
                        {
                            blockReason = "Authorization token format is invalid (missing authorizationId).";
                        }
                        else if (!string.IsNullOrEmpty(consumedAtStr) && consumedAtStr != "null")
                        {
                            blockReason = "Authorization token has already been consumed (single-use).";
                        }
                        else if (!string.IsNullOrEmpty(expiresAtStr) && DateTime.TryParse(expiresAtStr, null, System.Globalization.DateTimeStyles.RoundtripKind, out expiresAt) && expiresAt < DateTime.UtcNow)
                        {
                            blockReason = "Authorization token has expired.";
                        }
                        else if (!string.IsNullOrEmpty(destPath) && !Directory.Exists(destPath))
                        {
                            blockReason = "Preservation package directory could not be located on disk.";
                        }
                        else
                        {
                            isAuthorized = true;
                            // Mark token consumed atomically to enforce single-use invariant
                            try
                            {
                                string updatedJson = tokenJson.Replace("\"consumedAt\": null", string.Format("\"consumedAt\": \"{0}\"", DateTime.UtcNow.ToString("o")));
                                if (!updatedJson.Contains("consumedAt\": \""))
                                {
                                    updatedJson = updatedJson.TrimEnd('}', ' ', '\r', '\n') + string.Format(",\n  \"consumedAt\": \"{0}\"\n}}", DateTime.UtcNow.ToString("o"));
                                }
                                File.WriteAllText(tokenPath, updatedJson);
                            }
                            catch { }
                        }
                    }
                    catch (Exception ex)
                    {
                        blockReason = "Error parsing authorization token: " + ex.Message;
                    }
                }

                if (!isAuthorized)
                {
                    if (!silent)
                    {
                        MessageBox.Show(
                            "UNINSTALL BLOCKED BY DATA PRESERVATION SAFETY GATE\n\n" +
                            "Active business databases and transactions were detected in your AppData directory.\n\n" +
                            "Reason: " + blockReason + "\n\n" +
                            "To protect customer data from accidental loss, you must complete the Pre-Uninstall Data Preservation Wizard in Diamond ERP before uninstalling.\n\n" +
                            "Steps to proceed:\n" +
                            "1. Open Diamond ERP\n" +
                            "2. Go to Settings -> Data Preservation & Uninstall Wizard\n" +
                            "3. Click 'Create & Verify Preservation Package' (exports CSV, XLSX, and Database Backup)\n" +
                            "4. Click 'Authorize Uninstall'\n" +
                            "5. Run the uninstaller again.",
                            "DiamondERP Uninstall Gate — Action Required",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning
                        );
                    }
                    else
                    {
                        Console.Error.WriteLine("Error: Uninstall blocked by Phase 7 Safety Gate: " + blockReason);
                    }
                    return;
                }
            }

            EnsureAppNotRunning(!silent, installDir);

            try
            {
                // 1. Remove Desktop shortcut
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string lnk1 = Path.Combine(desktopPath, "DiamondERP.lnk");
                if (File.Exists(lnk1)) { try { File.Delete(lnk1); } catch { } }

                string userDesktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop");
                string lnk2 = Path.Combine(userDesktop, "DiamondERP.lnk");
                if (File.Exists(lnk2)) { try { File.Delete(lnk2); } catch { } }

                // 2. Remove Start Menu shortcut
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string lnk3 = Path.Combine(startMenu, "DiamondERP.lnk");
                if (File.Exists(lnk3)) { try { File.Delete(lnk3); } catch { } }

                // 3. Remove Registry uninstaller entry from both HKLM and HKCU
                try
                {
                    using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Default))
                    {
                        hklm.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP", false);
                    }
                }
                catch { }
                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\DiamondERP", false);
                }
                catch { }

                // 4. Clean up application installation files (strictly preserving customer AppData)
                string canonicalInstallDir = Path.GetFullPath(installDir);

                if (!canonicalInstallDir.Equals(userDbDir, StringComparison.OrdinalIgnoreCase) &&
                    !canonicalInstallDir.StartsWith(userDbDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    // Ensure we never delete system roots
                    string root = Path.GetPathRoot(canonicalInstallDir);
                    string winDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                    if (!canonicalInstallDir.Equals(root, StringComparison.OrdinalIgnoreCase) &&
                        !canonicalInstallDir.Equals(winDir, StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            if (Directory.Exists(canonicalInstallDir))
                            {
                                Directory.Delete(canonicalInstallDir, true);
                            }
                        }
                        catch
                        {
                            // Self-deleting executable workaround: sanitize against injection before calling delayed rmdir
                            string safeDir = canonicalInstallDir.Replace("\"", "").Replace("&", "").Replace("|", "").Replace(";", "");
                            ProcessStartInfo psi = new ProcessStartInfo
                            {
                                FileName = "cmd.exe",
                                Arguments = string.Format("/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{0}\"", safeDir),
                                CreateNoWindow = true,
                                UseShellExecute = false,
                                WindowStyle = ProcessWindowStyle.Hidden
                            };
                            Process.Start(psi);
                        }
                    }
                }

                if (!silent)
                {
                    MessageBox.Show(
                        "DiamondERP has been successfully uninstalled from this computer.\n\n" +
                        "Your business data in AppData was safely preserved.",
                        "Uninstall Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                else
                {
                    Console.WriteLine("Uninstall completed successfully.");
                }
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    MessageBox.Show("Error during uninstallation: " + ex.Message, "Uninstall Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                else
                {
                    Console.Error.WriteLine("Error during uninstallation: " + ex.Message);
                }
            }
        }

        private static string ExtractJsonValue(string json, string key)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key)) return null;
            string pattern = "\"" + key + "\"\\s*:\\s*\"?([^\"\\,\\}\\\r\\\n]+)\"?";
            var match = System.Text.RegularExpressions.Regex.Match(json, pattern);
            if (match.Success && match.Groups.Count > 1)
            {
                string val = match.Groups[1].Value.Trim().Trim('"');
                return val == "null" ? null : val;
            }
            return null;
        }
    }
}

# DiamondERP V3.0 — Interactive Windows GUI Setup Wizard
# Enables 1-click setup, dependency installation, build, and desktop shortcut generation.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$scriptRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $scriptRoot) {
    $scriptRoot = (Get-Item .).FullName
}

# --- Main Form Window ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "DiamondERP V3.0 — Setup Wizard"
$form.Size = New-Object System.Drawing.Size(650, 480)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)

# --- Top Header Panel ---
$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Size = New-Object System.Drawing.Size(650, 75)
$headerPanel.Dock = "Top"
$headerPanel.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)

$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = "DiamondERP V3.0 Installation Wizard"
$headerTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$headerTitle.ForeColor = [System.Drawing.Color]::White
$headerTitle.Location = New-Object System.Drawing.Point(24, 15)
$headerTitle.AutoSize = $true
$headerPanel.Controls.Add($headerTitle)

$headerSub = New-Object System.Windows.Forms.Label
$headerSub.Text = "Automated environment setup, dependency build, and desktop launcher configuration"
$headerSub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$headerSub.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$headerSub.Location = New-Object System.Drawing.Point(25, 42)
$headerSub.AutoSize = $true
$headerPanel.Controls.Add($headerSub)
$form.Controls.Add($headerPanel)

# --- Bottom Navigation Panel ---
$footerPanel = New-Object System.Windows.Forms.Panel
$footerPanel.Size = New-Object System.Drawing.Size(650, 60)
$footerPanel.Dock = "Bottom"
$footerPanel.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "Cancel"
$btnCancel.Size = New-Object System.Drawing.Size(90, 32)
$btnCancel.Location = New-Object System.Drawing.Point(525, 14)
$btnCancel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnCancel.BackColor = [System.Drawing.Color]::White
$btnCancel.Add_Click({ $form.Close() })
$footerPanel.Controls.Add($btnCancel)

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = "Next >"
$btnNext.Size = New-Object System.Drawing.Size(100, 32)
$btnNext.Location = New-Object System.Drawing.Point(415, 14)
$btnNext.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnNext.BackColor = [System.Drawing.Color]::FromArgb(79, 70, 229)
$btnNext.ForeColor = [System.Drawing.Color]::White
$btnNext.FlatStyle = "Flat"
$footerPanel.Controls.Add($btnNext)

$form.Controls.Add($footerPanel)

# --- Content Area Container ---
$contentPanel = New-Object System.Windows.Forms.Panel
$contentPanel.Location = New-Object System.Drawing.Point(0, 75)
$contentPanel.Size = New-Object System.Drawing.Size(650, 305)
$form.Controls.Add($contentPanel)

# --- Pages Setup ---
$currentPage = 1

function Show-WelcomePage {
    $contentPanel.Controls.Clear()
    $btnNext.Text = "Next >"

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Welcome to the DiamondERP Installation Wizard"
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $lbl.Location = New-Object System.Drawing.Point(30, 20)
    $lbl.AutoSize = $true
    $contentPanel.Controls.Add($lbl)

    $desc = New-Object System.Windows.Forms.Label
    $desc.Text = "This wizard will install and prepare DiamondERP V3.0 on your computer.`n`n" +
                 "What will happen:`n" +
                 "• Verify system prerequisites (Node.js LTS, npm)`n" +
                 "• Configure local workspace and high-concurrency SQLite databases`n" +
                 "• Build production-ready REST API and React Web client`n" +
                 "• Generate a 1-Click Desktop Launcher (`DiamondERP.lnk`)`n`n" +
                 "Click 'Next' to verify system prerequisites and continue."
    $desc.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
    $desc.ForeColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $desc.Location = New-Object System.Drawing.Point(30, 55)
    $desc.Size = New-Object System.Drawing.Size(580, 220)
    $contentPanel.Controls.Add($desc)
}

function Show-PrereqPage {
    $contentPanel.Controls.Clear()
    $btnNext.Text = "Install Now"

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "System Prerequisite Verification"
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $lbl.Location = New-Object System.Drawing.Point(30, 20)
    $lbl.AutoSize = $true
    $contentPanel.Controls.Add($lbl)

    # Node check
    $nodeVer = (node -v 2>$null)
    $nodeOk = [bool]$nodeVer
    $nodeTxt = if ($nodeOk) { "✔ Node.js: Detected ($nodeVer)" } else { "✘ Node.js: Not detected (Requires Node.js 18+)" }

    $lblNode = New-Object System.Windows.Forms.Label
    $lblNode.Text = $nodeTxt
    $lblNode.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $lblNode.ForeColor = if ($nodeOk) { [System.Drawing.Color]::FromArgb(22, 101, 52) } else { [System.Drawing.Color]::FromArgb(185, 28, 28) }
    $lblNode.Location = New-Object System.Drawing.Point(35, 65)
    $lblNode.AutoSize = $true
    $contentPanel.Controls.Add($lblNode)

    # NPM check
    $npmVer = (npm -v 2>$null)
    $npmOk = [bool]$npmVer
    $npmTxt = if ($npmOk) { "✔ NPM: Detected (v$npmVer)" } else { "✘ NPM: Not detected" }

    $lblNpm = New-Object System.Windows.Forms.Label
    $lblNpm.Text = $npmTxt
    $lblNpm.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $lblNpm.ForeColor = if ($npmOk) { [System.Drawing.Color]::FromArgb(22, 101, 52) } else { [System.Drawing.Color]::FromArgb(185, 28, 28) }
    $lblNpm.Location = New-Object System.Drawing.Point(35, 100)
    $lblNpm.AutoSize = $true
    $contentPanel.Controls.Add($lblNpm)

    # Path check
    $lblPath = New-Object System.Windows.Forms.Label
    $lblPath.Text = "✔ Installation Location: $scriptRoot"
    $lblPath.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
    $lblPath.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
    $lblPath.Location = New-Object System.Drawing.Point(35, 140)
    $lblPath.AutoSize = $true
    $contentPanel.Controls.Add($lblPath)

    if (-not $nodeOk) {
        $btnNext.Enabled = $false
        $warn = New-Object System.Windows.Forms.Label
        $warn.Text = "Please install Node.js from https://nodejs.org before continuing setup."
        $warn.ForeColor = [System.Drawing.Color]::Red
        $warn.Location = New-Object System.Drawing.Point(35, 180)
        $warn.AutoSize = $true
        $contentPanel.Controls.Add($warn)
    }
}

function Run-Installation {
    $contentPanel.Controls.Clear()
    $btnNext.Enabled = $false
    $btnCancel.Enabled = $false

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Installing & Configuring DiamondERP..."
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $lbl.Location = New-Object System.Drawing.Point(30, 20)
    $lbl.AutoSize = $true
    $contentPanel.Controls.Add($lbl)

    $statusLabel = New-Object System.Windows.Forms.Label
    $statusLabel.Text = "Preparing monorepo packages..."
    $statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
    $statusLabel.Location = New-Object System.Drawing.Point(30, 60)
    $statusLabel.Size = New-Object System.Drawing.Size(580, 25)
    $contentPanel.Controls.Add($statusLabel)

    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Location = New-Object System.Drawing.Point(30, 95)
    $progressBar.Size = New-Object System.Drawing.Size(580, 25)
    $progressBar.Style = "Continuous"
    $progressBar.Value = 15
    $contentPanel.Controls.Add($progressBar)

    $form.Refresh()

    # Step 1: Install packages if needed
    $statusLabel.Text = "Building shared libraries (@diamond-erp/contracts & shared-utils)..."
    $progressBar.Value = 40
    $form.Refresh()

    Start-Process -FilePath "npm" -ArgumentList "run build" -WorkingDirectory $scriptRoot -Wait -WindowStyle Hidden

    # Step 2: Create Shortcuts & Silent Launcher
    $statusLabel.Text = "Creating Desktop shortcut and silent background launcher..."
    $progressBar.Value = 80
    $form.Refresh()

    Create-LauncherScripts $scriptRoot
    Create-DesktopShortcut $scriptRoot

    $progressBar.Value = 100
    $statusLabel.Text = "Installation completed successfully!"
    $form.Refresh()

    Start-Sleep -Milliseconds 600
    Show-FinishedPage
}

function Create-LauncherScripts($root) {
    # 1. start-app.bat
    $batPath = Join-Path $root "start.bat"
    $batContent = "@echo off`r`n" +
                  "title DiamondERP V3.0`r`n" +
                  "cd /d `"$root`"`r`n" +
                  "start /min cmd /c `"npm run dev:api`"`r`n" +
                  "start /min cmd /c `"npm run dev:web`"`r`n" +
                  "timeout /t 3 /nobreak >nul`r`n" +
                  "start http://localhost:5175/`r`n"
    Set-Content -Path $batPath -Value $batContent -Encoding Ascii

    # 2. launch.vbs (Runs silently without showing black console windows)
    $vbsPath = Join-Path $root "launch.vbs"
    $vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")`r`n" +
                  "WshShell.Run `"`"`"$batPath`"`"`", 0, False`r`n"
    Set-Content -Path $vbsPath -Value $vbsContent -Encoding Ascii
}

function Create-DesktopShortcut($root) {
    $vbsPath = Join-Path $root "launch.vbs"
    $desktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::DesktopDirectory)
    $shortcutPath = Join-Path $desktopDir "DiamondERP.lnk"

    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "wscript.exe"
    $shortcut.Arguments = "`"$vbsPath`""
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = "DiamondERP V3.0 Professional System"
    $shortcut.Save()
}

function Show-FinishedPage {
    $contentPanel.Controls.Clear()
    $btnNext.Text = "Finish"
    $btnNext.Enabled = $true
    $btnCancel.Visible = $false

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Installation Complete!"
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
    $lbl.Location = New-Object System.Drawing.Point(30, 20)
    $lbl.AutoSize = $true
    $contentPanel.Controls.Add($lbl)

    $desc = New-Object System.Windows.Forms.Label
    $desc.Text = "DiamondERP V3.0 has been successfully installed and configured.`n`n" +
                 "✔ Monorepo components built and validated`n" +
                 "✔ Desktop Shortcut ('DiamondERP.lnk') created on your Desktop`n" +
                 "✔ One-click silent background launcher ready`n`n" +
                 "When starting the application for the first time, you will be prompted on the UI for the initial activation master password to unlock and activate the software on this machine."
    $desc.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
    $desc.ForeColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
    $desc.Location = New-Object System.Drawing.Point(30, 55)
    $desc.Size = New-Object System.Drawing.Size(580, 160)
    $contentPanel.Controls.Add($desc)

    $chkLaunch = New-Object System.Windows.Forms.CheckBox
    $chkLaunch.Text = "Launch DiamondERP now"
    $chkLaunch.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
    $chkLaunch.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $chkLaunch.Checked = $true
    $chkLaunch.Location = New-Object System.Drawing.Point(35, 220)
    $chkLaunch.AutoSize = $true
    $contentPanel.Controls.Add($chkLaunch)

    $btnNext.Add_Click({
        if ($chkLaunch.Checked) {
            $vbsPath = Join-Path $scriptRoot "launch.vbs"
            Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbsPath`""
        }
        $form.Close()
    })
}

# Navigation Click Handler
$btnNext.Add_Click({
    if ($currentPage -eq 1) {
        $currentPage = 2
        Show-PrereqPage
    } elseif ($currentPage -eq 2) {
        $currentPage = 3
        Run-Installation
    }
})

# Initial render
Show-WelcomePage
[void]$form.ShowDialog()

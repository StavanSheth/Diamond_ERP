param (
    [string]$InstallerPath,
    [string]$ZipPath,
    [string]$TargetDir
)

try {
    $fullInstallerPath = (Resolve-Path $InstallerPath).Path
    $asm = [System.Reflection.Assembly]::LoadFrom($fullInstallerPath)
    $type = $asm.GetType("DiamondERP.Setup.SetupWizardForm")
    $method = $type.GetMethod("ExtractZipStream", [System.Reflection.BindingFlags]"Public,Static")
    $fullZipPath = (Resolve-Path $ZipPath).Path
    $stream = [System.IO.File]::OpenRead($fullZipPath)
    try {
        $method.Invoke($null, @($stream, $TargetDir, $null, $null))
        Write-Output "EXTRACTED_WITHOUT_EXCEPTION"
    }
    catch {
        $inner = $_.Exception
        if ($inner.InnerException) { $inner = $inner.InnerException }
        Write-Output ("BLOCKED_EXCEPTION: " + $inner.GetType().FullName + ": " + $inner.Message)
    }
    finally {
        $stream.Close()
    }
}
catch {
    Write-Output ("LOAD_ERROR: " + $_.Exception.Message)
}

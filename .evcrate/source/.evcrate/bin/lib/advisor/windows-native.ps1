$ErrorActionPreference = 'Stop'

if ($args.Count -lt 1) {
    exit 1
}

$op = $args[0]
$csPath = Join-Path $PSScriptRoot 'windows-native.cs'

if (-not ([System.Management.Automation.PSTypeName]'EvcrateNativeBridge').Type) {
    $csItem = Get-Item $csPath
    $cacheName = 'evcrate-bridge-' + $csItem.Length + '-' + $csItem.LastWriteTimeUtc.Ticks + '.dll'
    $dllPath = Join-Path $env:TEMP $cacheName
    if (Test-Path $dllPath) {
        try {
            Add-Type -Path $dllPath
        } catch {
            Add-Type -Path $csPath
        }
    } else {
        try {
            Add-Type -Path $csPath -OutputAssembly $dllPath
            Add-Type -Path $dllPath
        } catch {
            Add-Type -Path $csPath
        }
    }
}

switch ($op) {
    'process-start' {
        if ($args.Count -lt 2) { exit 1 }
        $res = [EvcrateNativeBridge]::GetProcessCreationTime([int]$args[1])
        if ($res) { [Console]::Out.WriteLine($res) }
        else { exit 1 }
    }
    'process-status' {
        if ($args.Count -lt 3) { exit 1 }
        $res = [EvcrateNativeBridge]::CheckProcessStatus([int]$args[1], $args[2])
        [Console]::Out.WriteLine($res)
    }
    'console-observe' {
        if ($args.Count -lt 3) { exit 1 }
        $ctx = if ($args.Count -ge 4 -and $args[3]) {
            [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($args[3]))
        } else { $null }
        $res = [EvcrateNativeBridge]::ObserveConsole($ctx, $args[1], [int]$args[2])
        [Console]::Out.WriteLine($res)
        if ($res -ne 'OBSERVED') { exit 2 }
    }
    'supervise-invocation' {
        $line = [Console]::In.ReadLine()
        if (-not $line) { exit 1 }
        $req = ConvertFrom-Json $line
        $app = if ($req.app) { $req.app } else { $null }
        $cmdLine = $req.cmdLine
        $cwd = if ($req.cwd) { $req.cwd } else { $null }
        $prompt = if ($req.prompt) { $req.prompt } else { $null }
        $killGraceMs = if ($req.killGraceMs) { [int]$req.killGraceMs } else { 250 }
        [EvcrateNativeBridge]::SuperviseInvocation($app, $cmdLine, $cwd, $prompt, $killGraceMs)
    }
    'read-pinned' {
        if ($args.Count -lt 3) { exit 1 }
        $res = [EvcrateNativeBridge]::ReadPinnedFile($args[1], [int]$args[2])
        [Console]::Out.WriteLine($res)
        if ($res.Contains('"status":"error"')) { exit 2 }
    }
    'write-pinned' {
        if ($args.Count -lt 4) { exit 1 }
        $b64 = if ($args[2] -eq 'STDIN') { [Console]::In.ReadToEnd().Trim() } else { $args[2] }
        $expDev = if ($args.Count -ge 5) { $args[4] } else { $null }
        $expIno = if ($args.Count -ge 6) { $args[5] } else { $null }
        $expDigest = if ($args.Count -ge 7) { $args[6] } else { $null }
        $res = [EvcrateNativeBridge]::WritePinnedFile($args[1], $b64, [bool]::Parse($args[3]), $expDev, $expIno, $expDigest)
        [Console]::Out.WriteLine($res)
        if ($res.Contains('"status":"conflict"')) { exit 3 }
        if (-not $res.Contains('"status":"ok"')) { exit 2 }
    }
    'verify-pinned' {
        if ($args.Count -lt 2) { exit 1 }
        $res = [EvcrateNativeBridge]::VerifyPinnedDirectory($args[1])
        [Console]::Out.WriteLine($res)
        if (-not $res.Contains('"status":"ok"')) { exit 2 }
    }
    default {
        exit 1
    }
}

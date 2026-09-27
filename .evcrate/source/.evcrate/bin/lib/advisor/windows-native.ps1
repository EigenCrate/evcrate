$ErrorActionPreference = 'Stop'

if ($args.Count -lt 1) {
    exit 1
}

$op = $args[0]
$csPath = Join-Path $PSScriptRoot 'windows-native.cs'

if (-not ([System.Management.Automation.PSTypeName]'EvcrateNativeBridge').Type) {
    Add-Type -Path $csPath
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
        $res = [EvcrateNativeBridge]::ObserveConsole($args[1], [int]$args[2])
        [Console]::Out.WriteLine($res)
        if ($res -ne 'OBSERVED') { exit 2 }
    }
    default {
        exit 1
    }
}

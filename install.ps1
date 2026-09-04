# EVCrate Windows standalone installer entrypoint
# Standalone PowerShell entrypoint for private registry-free unpack distribution.
# Mirrors Phase 2 Linux installer lifecycle and security semantics for Windows.
#
# NOTE: Windows runtime/harness execution is explicitly deferred outside this plan.
# This script represents production-intent source designed for Windows PowerShell 5.1
# and PowerShell Core 7+ on Windows.

# Strict mode and error preference
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Constants and schemas
$SCHEMA_RELEASE = 'evcrate-private-release/v1'
$SCHEMA_JOURNAL = 'evcrate-install-journal/v1'
$SCHEMA_RECEIPT = 'evcrate-installer-receipt/v1'
$SCHEMA_OWNED = 'evcrate-installer-owned/v1'
$SCHEMA_POINTER = 'evcrate-current-pointer/v1'

$MAX_ARCHIVE_BYTES = 512 * 1024 * 1024 # 512 MiB
$MAX_TOTAL_EXPANDED_BYTES = 512 * 1024 * 1024 # 512 MiB
$MAX_FILE_BYTES = 16 * 1024 * 1024 # 16 MiB
$MAX_FILES = 100000
$MAX_PATH_BYTES = 4096
$MAX_PATH_DEPTH = 32

$MUTABLE_PATHS = @(
    '.evcrate/source/.claude/**',
    '.evcrate/registry.json',
    '.evcrate/scopes/**'
)

$DOS_DEVICE_NAMES = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($name in @(
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
)) {
    [void]$DOS_DEVICE_NAMES.Add($name)
}

$ADVISOR_CONTROLLER_FILES = @(
    'evcrate-advisor',
    'lib/advisor/adapter-contract.cjs',
    'lib/advisor/adapter-registry.cjs',
    'lib/advisor/adapters/claude.cjs',
    'lib/advisor/adapters/codex.cjs',
    'lib/advisor/adapters/omp.cjs',
    'lib/advisor/adapters/omp-parser.cjs',
    'lib/advisor/adapters/pi.cjs',
    'lib/advisor/checkpoint-contract.cjs',
    'lib/advisor/controller-envelope.cjs',
    'lib/advisor/controller.cjs',
    'lib/advisor/errors.cjs',
    'lib/advisor/isolated-workspace.cjs',
    'lib/advisor/json-document.cjs',
    'lib/advisor/policy-schema.cjs',
    'lib/advisor/profile.cjs',
    'lib/advisor/runner.cjs'
)

# ---------------------------------------------------------------------------
# Canonical JSON serialization helper (matches RFC 8785 & EVCrate contract)
# ---------------------------------------------------------------------------

function ConvertTo-JsonString {
    param([string]$Value)
    if ($null -eq $Value) { return 'null' }
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.Append('"')
    foreach ($ch in $Value.ToCharArray()) {
        $code = [int]$ch
        switch ($code) {
            34 { [void]$sb.Append('\"'); break }
            92 { [void]$sb.Append('\\'); break }
            8  { [void]$sb.Append('\b'); break }
            12 { [void]$sb.Append('\f'); break }
            10 { [void]$sb.Append('\n'); break }
            13 { [void]$sb.Append('\r'); break }
            9  { [void]$sb.Append('\t'); break }
            default {
                if ($code -lt 32) {
                    [void]$sb.Append([string]::Format('\u{0:x4}', $code))
                } else {
                    [void]$sb.Append($ch)
                }
            }
        }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function ConvertTo-CanonicalJson {
    param(
        $InputObject,
        [int]$Depth = 0
    )
    if ($Depth -gt 32) {
        throw [System.InvalidOperationException]::new('JSON nesting exceeds maximum depth of 32')
    }
    if ($null -eq $InputObject) {
        return 'null'
    }
    if ($InputObject -is [bool]) {
        if ($InputObject) { return 'true' } else { return 'false' }
    }
    if ($InputObject -is [int] -or $InputObject -is [long] -or $InputObject -is [double] -or $InputObject -is [decimal]) {
        return [System.Convert]::ToString($InputObject, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    if ($InputObject -is [string]) {
        return ConvertTo-JsonString $InputObject
    }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $keys = [System.Collections.ArrayList]::new($InputObject.Keys)
        $keys.Sort([System.StringComparer]::Ordinal)
        $pairs = [System.Collections.Generic.List[string]]::new()
        foreach ($k in $keys) {
            $kStr = ConvertTo-JsonString ([string]$k)
            $vStr = ConvertTo-CanonicalJson -InputObject $InputObject[$k] -Depth ($Depth + 1)
            $pairs.Add("$kStr`:$vStr")
        }
        return '{' + [string]::Join(',', $pairs) + '}'
    }
    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $elements = [System.Collections.Generic.List[string]]::new()
        foreach ($item in $InputObject) {
            $elements.Add((ConvertTo-CanonicalJson -InputObject $item -Depth ($Depth + 1)))
        }
        return '[' + [string]::Join(',', $elements) + ']'
    }
    if ($InputObject -is [PSCustomObject]) {
        $propNames = [System.Collections.ArrayList]::new($InputObject.PSObject.Properties.Name)
        $propNames.Sort([System.StringComparer]::Ordinal)
        $pairs = [System.Collections.Generic.List[string]]::new()
        foreach ($pName in $propNames) {
            $kStr = ConvertTo-JsonString ([string]$pName)
            $vStr = ConvertTo-CanonicalJson -InputObject $InputObject.$pName -Depth ($Depth + 1)
            $pairs.Add("$kStr`:$vStr")
        }
        return '{' + [string]::Join(',', $pairs) + '}'
    }
    throw [System.ArgumentException]::new("Cannot canonically encode type: $($InputObject.GetType().FullName)")
}

# ---------------------------------------------------------------------------
# Cryptographic and Hash Helpers
# ---------------------------------------------------------------------------

function Get-BytesSha256Hex {
    param([byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash($Bytes)
        $sb = [System.Text.StringBuilder]::new($hashBytes.Length * 2)
        foreach ($b in $hashBytes) {
            [void]$sb.Append($b.ToString('x2'))
        }
        return $sb.ToString()
    } finally {
        $sha.Dispose()
    }
}

function Get-FileSha256Hex {
    param([string]$FilePath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try {
        $hashBytes = $sha.ComputeHash($stream)
        $sb = [System.Text.StringBuilder]::new($hashBytes.Length * 2)
        foreach ($b in $hashBytes) {
            [void]$sb.Append($b.ToString('x2'))
        }
        return $sb.ToString()
    } finally {
        $stream.Dispose()
        $sha.Dispose()
    }
}

function Compute-InventoryDigest {
    param([array]$Records)
    # Sort records strictly by ordinal code-point order of relative path
    $sorted = [System.Collections.Generic.List[object]]::new($Records)
    $sorted.Sort({
        param($a, $b)
        return [System.StringComparer]::Ordinal.Compare($a.path, $b.path)
    })

    $seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $seenLower = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    $canonicalList = [System.Collections.Generic.List[hashtable]]::new()
    foreach ($rec in $sorted) {
        if ($seenPaths.Contains($rec.path)) {
            throw [System.InvalidOperationException]::new("Duplicate path in inventory: $($rec.path)")
        }
        if ($seenLower.Contains($rec.path.ToLowerInvariant())) {
            throw [System.InvalidOperationException]::new("Case-fold collision in inventory: $($rec.path)")
        }
        [void]$seenPaths.Add($rec.path)
        [void]$seenLower.Add($rec.path.ToLowerInvariant())

        $canonicalList.Add(@{
            mode   = [int]$rec.mode
            path   = [string]$rec.path
            sha256 = [string]$rec.sha256
            size   = [long]$rec.size
        })
    }

    $json = ConvertTo-CanonicalJson -InputObject $canonicalList
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("$json`n")
    return Get-BytesSha256Hex -Bytes $bytes
}

# ---------------------------------------------------------------------------
# Path and Filename Safety Validation
# ---------------------------------------------------------------------------

function Test-InventoryPathSafety {
    param([string]$RelativePath)
    if ([string]::IsNullOrEmpty($RelativePath)) {
        throw [System.ArgumentException]::new('Empty path is invalid')
    }
    $byteCount = [System.Text.Encoding]::UTF8.GetByteCount($RelativePath)
    if ($byteCount -gt $MAX_PATH_BYTES) {
        throw [System.InvalidOperationException]::new("Path exceeds maximum length of $MAX_PATH_BYTES bytes: $RelativePath")
    }
    if ($RelativePath.StartsWith('/') -or $RelativePath.EndsWith('/')) {
        throw [System.InvalidOperationException]::new("Path has leading or trailing slash: $RelativePath")
    }
    if ($RelativePath.StartsWith('\') -or $RelativePath.EndsWith('\')) {
        throw [System.InvalidOperationException]::new("Path has leading or trailing backslash: $RelativePath")
    }

    # Normalize to forward slashes for segment parsing
    $normalized = $RelativePath.Replace('\', '/')
    if ($normalized -match '[\u0000-\u001f\u007f-\u009f]') {
        throw [System.InvalidOperationException]::new("Path contains control characters or NUL: $RelativePath")
    }

    $segments = $normalized.Split('/')
    if ($segments.Length -gt $MAX_PATH_DEPTH) {
        throw [System.InvalidOperationException]::new("Path exceeds maximum depth of $MAX_PATH_DEPTH: $RelativePath")
    }

    foreach ($seg in $segments) {
        if ($seg -eq '' -or $seg -eq '.' -or $seg -eq '..') {
            throw [System.InvalidOperationException]::new("Path contains invalid traversal segment: $RelativePath")
        }
        if ($seg.EndsWith('.') -or $seg.EndsWith(' ')) {
            throw [System.InvalidOperationException]::new("Path segment ends with dot or space: $RelativePath")
        }
        if ($seg.Contains(':')) {
            throw [System.InvalidOperationException]::new("Path segment contains colon (alternate data stream syntax): $RelativePath")
        }
        $baseSeg = $seg.Split('.')[0].ToUpperInvariant()
        if ($DOS_DEVICE_NAMES.Contains($baseSeg)) {
            throw [System.InvalidOperationException]::new("Path segment contains Windows DOS device name '$seg': $RelativePath")
        }
    }

    # Deny-list checks
    if ($normalized.StartsWith('plans/') -or $normalized -eq 'plans') {
        throw [System.InvalidOperationException]::new("Confidential path denied: $RelativePath")
    }
    if ($normalized.StartsWith('.git/') -or $normalized -eq '.git') {
        throw [System.InvalidOperationException]::new(".git path denied: $RelativePath")
    }
    if ($normalized.StartsWith('node_modules/') -or $normalized.Contains('/node_modules/')) {
        throw [System.InvalidOperationException]::new("node_modules path denied: $RelativePath")
    }
    if ($normalized.StartsWith('distribution/') -or $normalized.StartsWith('distribute') -or
        $normalized.StartsWith('migrate_') -or $normalized.Contains('/__pycache__') -or
        $normalized.EndsWith('.pyc') -or $normalized.EndsWith('.pyo')) {
        throw [System.InvalidOperationException]::new("Python distribution/migrator/bytecode denied: $RelativePath")
    }
    if ($normalized.StartsWith('tests/') -or $normalized.StartsWith('src/')) {
        throw [System.InvalidOperationException]::new("Repository test/source directory denied: $RelativePath")
    }
    $fileName = $segments[$segments.Length - 1]
    if ($fileName -eq '.env' -or ($fileName.StartsWith('.env.') -and $fileName -ne '.env.example')) {
        throw [System.InvalidOperationException]::new("Environment/secret file denied: $RelativePath")
    }

    return $normalized
}

# ---------------------------------------------------------------------------
# Sidecar and Metadata Parsers
# ---------------------------------------------------------------------------

function Parse-Sidecar {
    param(
        [string]$Content,
        [string]$ExpectedBasename
    )
    if ($null -eq $Content) {
        throw [System.ArgumentNullException]::new('Content', 'Sidecar content must not be null')
    }
    if ($Content.Contains("`r") -or ($Content -match '[\u0000-\u0009\u000b-\u001f\u007f-\u009f]')) {
        throw [System.InvalidOperationException]::new('Sidecar contains forbidden CR or control characters')
    }
    if (-not $Content.EndsWith("`n") -or $Content.EndsWith("`n`n")) {
        throw [System.InvalidOperationException]::new('Sidecar must end with exactly one newline')
    }
    $lines = $Content.Split("`n")
    if ($lines.Length -ne 2 -or $lines[1] -ne '') {
        throw [System.InvalidOperationException]::new('Sidecar must contain exactly one record')
    }
    $match = [System.Text.RegularExpressions.Regex]::Match($lines[0], '^([a-f0-9]{64})  ([^/\s\\]+)$')
    if (-not $match.Success) {
        throw [System.InvalidOperationException]::new('Sidecar does not match grammar "<64-hex>  <basename>\n"')
    }
    $digest = $match.Groups[1].Value
    $basename = $match.Groups[2].Value
    if ($basename -eq '.' -or $basename -eq '..' -or $basename.Trim() -ne $basename) {
        throw [System.InvalidOperationException]::new('Sidecar basename is invalid or contains padding')
    }
    if ($null -ne $ExpectedBasename -and $basename -ne $ExpectedBasename) {
        throw [System.InvalidOperationException]::new("Sidecar basename mismatch: expected $ExpectedBasename, got $basename")
    }
    return @{
        sha256   = $digest
        basename = $basename
    }
}

function Parse-JsonFile {
    param([string]$FilePath)
    if (-not [System.IO.File]::Exists($FilePath)) {
        throw [System.IO.FileNotFoundException]::new("JSON file not found: $FilePath", $FilePath)
    }
    $raw = [System.IO.File]::ReadAllText($FilePath, [System.Text.Encoding]::UTF8)
    try {
        return ConvertFrom-Json -InputObject $raw
    } catch {
        throw [System.InvalidOperationException]::new("Failed to parse JSON in $FilePath`: $($_.Exception.Message)")
    }
}

function Validate-ReleaseMetadata {
    param(
        $Metadata,
        [string]$ArchivePath,
        [string]$ArchiveSha256
    )
    if ($Metadata.schema -ne $SCHEMA_RELEASE) {
        throw [System.InvalidOperationException]::new("Invalid metadata schema: $($Metadata.schema), expected $SCHEMA_RELEASE")
    }
    $winPlatform = $Metadata.platforms.'windows-x64'
    if ($null -eq $winPlatform) {
        throw [System.InvalidOperationException]::new('Metadata missing platforms["windows-x64"] definition')
    }
    $archiveBase = [System.IO.Path]::GetFileName($ArchivePath)
    if ($winPlatform.archive_name -ne $archiveBase) {
        throw [System.InvalidOperationException]::new("Metadata archive_name '$($winPlatform.archive_name)' does not match file '$archiveBase'")
    }
    $archiveFileInfo = [System.IO.FileInfo]::new($ArchivePath)
    if ([long]$winPlatform.size -ne $archiveFileInfo.Length) {
        throw [System.InvalidOperationException]::new("Metadata archive size $($winPlatform.size) does not match file size $($archiveFileInfo.Length)")
    }
    if ($winPlatform.sha256 -ne $ArchiveSha256) {
        throw [System.InvalidOperationException]::new('Metadata archive SHA-256 does not match file SHA-256')
    }
}

# ---------------------------------------------------------------------------
# Preflight Environment and Node.js
# ---------------------------------------------------------------------------

function Find-NodeExecutable {
    # 1. Check if node is in current PATH
    $nodeCmd = Get-Command -Name 'node.exe' -ErrorAction SilentlyContinue
    if ($null -eq $nodeCmd) {
        $nodeCmd = Get-Command -Name 'node' -ErrorAction SilentlyContinue
    }
    if ($null -ne $nodeCmd) {
        return $nodeCmd.Source
    }

    # 2. Check standard Windows Node.js locations
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\node\node.exe",
        "$env:APPDATA\npm\node.exe"
    )
    foreach ($cand in $candidates) {
        if ([System.IO.File]::Exists($cand)) {
            return $cand
        }
    }
    return $null
}

function Assert-NodeFloor {
    $nodePath = Find-NodeExecutable
    if ($null -eq $nodePath) {
        throw [System.InvalidOperationException]::new('Node.js is required but not found in PATH. Please install Node.js >= 22.19.0.')
    }

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $nodePath
    $psi.Arguments = '-e "const [M, m] = process.versions.node.split(''.'').map(Number); if (M > 22 || (M === 22 && m >= 19)) { process.stdout.write(''OK''); } else { process.stdout.write(process.versions.node); }"'
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $proc.WaitForExit()

    if ($stdout -ne 'OK') {
        throw [System.InvalidOperationException]::new("Node.js >= 22.19.0 is required (found $stdout at $nodePath)")
    }
    return $nodePath
}

# ---------------------------------------------------------------------------
# Roots Resolution and Reparse-Point / Lock Checks
# ---------------------------------------------------------------------------

function Resolve-InstallRoots {
    param($Options)
    $localAppData = $env:LOCALAPPDATA
    if ([string]::IsNullOrEmpty($localAppData)) {
        $localAppData = [System.IO.Path]::Combine($env:USERPROFILE, 'AppData', 'Local')
    }

    $defaultRoot = [System.IO.Path]::Combine($localAppData, 'EVCrate')
    $dataRoot = if ($Options.RootDir) { $Options.RootDir } elseif ($Options.DataDir) { $Options.DataDir } else { $defaultRoot }
    $stateRoot = if ($Options.StateDir) { $Options.StateDir } else { [System.IO.Path]::Combine($dataRoot, 'state') }
    $binDir = if ($Options.BinDir) { $Options.BinDir } else { [System.IO.Path]::Combine($dataRoot, 'bin') }

    # FUTURE PROOF: NTFS reparse points, junctions, and developer-mode symlink traversal must be verified by native Windows harness.
    # Check that root paths do not contain reparse points / junctions
    foreach ($dirPath in @($dataRoot, $stateRoot, $binDir)) {
        $cur = [System.IO.Path]::GetFullPath($dirPath)
        while (-not [string]::IsNullOrEmpty($cur) -and [System.IO.Directory]::Exists($cur)) {
            $di = [System.IO.DirectoryInfo]::new($cur)
            if (($di.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw [System.InvalidOperationException]::new("Insecure reparse point or junction detected in root path ancestor: $cur")
            }
            $parent = [System.IO.Path]::GetDirectoryName($cur)
            if ($parent -eq $cur) { break }
            $cur = $parent
        }
    }

    [void][System.IO.Directory]::CreateDirectory($dataRoot)
    [void][System.IO.Directory]::CreateDirectory($stateRoot)
    [void][System.IO.Directory]::CreateDirectory($binDir)

    return @{
        dataRoot      = [System.IO.Path]::GetFullPath($dataRoot)
        stateRoot     = [System.IO.Path]::GetFullPath($stateRoot)
        binDir        = [System.IO.Path]::GetFullPath($binDir)
        versionsDir   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dataRoot, 'versions'))
        stagingDir    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dataRoot, 'staging'))
        currentJson   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dataRoot, 'current.json'))
        cmdLauncher   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($binDir, 'evcrate.cmd'))
        jsLauncher    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($binDir, 'launcher.cjs'))
        lockPath      = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($stateRoot, 'install.lock'))
        journalPath   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($stateRoot, 'install-journal.json'))
        ownedPath     = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($stateRoot, 'installer-owned.json'))
    }
}

# FUTURE PROOF: Windows file locking and sharing violations (ERROR_SHARING_VIOLATION) during upgrade must be validated in native harness.
function Acquire-InstallLock {
    param($Roots)
    $lockPath = $Roots.lockPath
    $payload = ConvertTo-CanonicalJson @{
        pid        = [System.Diagnostics.Process]::GetCurrentProcess().Id
        hostname   = [System.Environment]::MachineName
        created_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $lockBytes = [System.Text.Encoding]::UTF8.GetBytes("$payload`n")

    try {
        $fs = [System.IO.FileStream]::new(
            $lockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        $fs.Write($lockBytes, 0, $lockBytes.Length)
        $fs.Flush()
        return @{ FileStream = $fs; LockPath = $lockPath }
    } catch [System.IO.IOException] {
        # Check if lock is stale
        $isStale = $false
        try {
            if ([System.IO.File]::Exists($lockPath)) {
                $rawLock = [System.IO.File]::ReadAllText($lockPath, [System.Text.Encoding]::UTF8)
                $lockData = ConvertFrom-Json -InputObject $rawLock
                if ($lockData.hostname -eq [System.Environment]::MachineName -and $null -ne $lockData.pid) {
                    $liveProc = Get-Process -Id $lockData.pid -ErrorAction SilentlyContinue
                    if ($null -eq $liveProc) {
                        $isStale = $true
                    }
                }
            }
        } catch {
            # Corrupt lock file remains active for safety
        }

        if ($isStale) {
            $quarantine = "$lockPath.stale-$(Get-Date -UFormat %s)"
            try {
                [System.IO.File]::Move($lockPath, $quarantine)
            } catch {
                [System.IO.File]::Delete($lockPath)
            }
            $fs = [System.IO.FileStream]::new(
                $lockPath,
                [System.IO.FileMode]::CreateNew,
                [System.IO.FileAccess]::Write,
                [System.IO.FileShare]::None
            )
            $fs.Write($lockBytes, 0, $lockBytes.Length)
            $fs.Flush()
            return @{ FileStream = $fs; LockPath = $lockPath }
        }

        throw [System.InvalidOperationException]::new("Installer is busy: active lock at $lockPath")
    }
}

function Release-InstallLock {
    param($LockHandle)
    if ($null -eq $LockHandle) { return }
    if ($null -ne $LockHandle.FileStream) {
        try { $LockHandle.FileStream.Dispose() } catch {}
    }
    if ([System.IO.File]::Exists($LockHandle.LockPath)) {
        try { [System.IO.File]::Delete($LockHandle.LockPath) } catch {}
    }
}

# ---------------------------------------------------------------------------
# Journaling & Recovery State Machine
# ---------------------------------------------------------------------------

function Write-InstallJournal {
    param($Roots, $Data)
    $journalPath = $Roots.journalPath
    $tmpJournal = "$journalPath.tmp-$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$(Get-Date -UFormat %s)"
    $json = ConvertTo-CanonicalJson -InputObject $Data
    [System.IO.File]::WriteAllText($tmpJournal, "$json`n", [System.Text.Encoding]::UTF8)
    if ([System.IO.File]::Exists($journalPath)) {
        [System.IO.File]::Delete($journalPath)
    }
    [System.IO.File]::Move($tmpJournal, $journalPath)
}

function Read-InstallJournal {
    param($Roots)
    if (-not [System.IO.File]::Exists($Roots.journalPath)) { return $null }
    try {
        return Parse-JsonFile -FilePath $Roots.journalPath
    } catch {
        return $null
    }
}

function Clear-InstallJournal {
    param($Roots)
    if ([System.IO.File]::Exists($Roots.journalPath)) {
        try { [System.IO.File]::Delete($Roots.journalPath) } catch {}
    }
}

function Recover-InstallJournal {
    param($Roots)
    $journal = Read-InstallJournal -Roots $Roots
    if ($null -eq $journal) { return }

    if ($journal.state -eq 'staged') {
        if ($journal.stage_path -and [System.IO.Directory]::Exists($journal.stage_path)) {
            if ($journal.stage_path.StartsWith($Roots.stagingDir)) {
                [System.IO.Directory]::Delete($journal.stage_path, $true)
            }
        }
        Clear-InstallJournal -Roots $Roots
    } elseif ($journal.state -eq 'pointer-ready') {
        if ($journal.target_snapshot_path -and [System.IO.Directory]::Exists($journal.target_snapshot_path)) {
            Commit-Pointers -Roots $Roots -TargetVersionDir $journal.target_snapshot_path -SnapshotId $journal.new_snapshot -ArchiveSha $journal.archive_digest -Version $journal.version
            $journal.state = 'committed'
            $journal.updated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            Write-InstallJournal -Roots $Roots -Data $journal
        }
    }
}

# ---------------------------------------------------------------------------
# Launchers and Pointer Management
# ---------------------------------------------------------------------------

function Commit-Pointers {
    param(
        $Roots,
        [string]$TargetVersionDir,
        [string]$SnapshotId,
        [string]$ArchiveSha,
        [string]$Version
    )

    $versionDirName = [System.IO.Path]::GetFileName($TargetVersionDir)

    # 1. Atomic current.json pointer update
    # FUTURE PROOF: Atomic file replacement across volume boundaries and antivirus file-lock behavior must be validated on NTFS.
    $pointer = @{
        schema          = $SCHEMA_POINTER
        version_dir     = $versionDirName
        package_version = $Version
        archive_sha256  = $ArchiveSha
        generation      = [int]($versionDirName.Split('-')[-1])
    }
    $pointerJson = ConvertTo-CanonicalJson -InputObject $pointer
    $tmpPointer = [System.IO.Path]::Combine($Roots.dataRoot, "current.json.tmp-$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$(Get-Date -UFormat %s)")
    [System.IO.File]::WriteAllText($tmpPointer, "$pointerJson`n", [System.Text.Encoding]::UTF8)

    if ([System.IO.File]::Exists($Roots.currentJson)) {
        [void][System.IO.File]::Replace($tmpPointer, $Roots.currentJson, $null)
    } else {
        [System.IO.File]::Move($tmpPointer, $Roots.currentJson)
    }

    # 2. Stable cmd launcher: bin\evcrate.cmd
    $cmdContent = "@ECHO OFF`r`nSETLOCAL`r`nnode `"%~dp0launcher.cjs`" %*`r`nEXIT /B %ERRORLEVEL%`r`n"
    [System.IO.File]::WriteAllText($Roots.cmdLauncher, $cmdContent, [System.Text.Encoding]::ASCII)

    # 3. Stable Node.js launcher: bin\launcher.cjs
    $launcherJs = @'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function main() {
  const installRoot = path.resolve(__dirname, '..');
  const pointerPath = path.join(installRoot, 'current.json');
  if (!fs.existsSync(pointerPath)) {
    console.error('Error: EVCrate current.json pointer not found at: ' + pointerPath);
    process.exit(1);
  }

  let pointer;
  try {
    const raw = fs.readFileSync(pointerPath, 'utf8');
    if (raw.length > 65536) throw new Error('Pointer file exceeds maximum size');
    pointer = JSON.parse(raw);
  } catch (err) {
    console.error('Error: Failed to read EVCrate current.json: ' + err.message);
    process.exit(1);
  }

  if (pointer.schema !== 'evcrate-current-pointer/v1') {
    console.error('Error: Invalid pointer schema: ' + pointer.schema);
    process.exit(1);
  }

  const versionDir = pointer.version_dir;
  if (!versionDir || typeof versionDir !== 'string' || !/^[0-9A-Za-z._-]+$/u.test(versionDir)) {
    console.error('Error: Invalid or malicious version_dir in pointer: ' + versionDir);
    process.exit(1);
  }

  const cliPath = path.resolve(installRoot, 'versions', versionDir, 'package', 'dist', 'cli', 'evcrate.js');
  const expectedPrefix = path.resolve(installRoot, 'versions') + path.sep;
  if (!cliPath.startsWith(expectedPrefix)) {
    console.error('Error: CLI path traversal escape denied: ' + cliPath);
    process.exit(1);
  }

  if (!fs.existsSync(cliPath)) {
    console.error('Error: Staged CLI entrypoint missing: ' + cliPath);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    console.error('Error executing EVCrate CLI: ' + result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
'@
    [System.IO.File]::WriteAllText($Roots.jsLauncher, $launcherJs, [System.Text.Encoding]::UTF8)

    # 4. Record installer ownership
    $owned = @{
        schema          = $SCHEMA_OWNED
        install_root    = $Roots.dataRoot
        versions_dir    = $Roots.versionsDir
        bin_dir         = $Roots.binDir
        cmd_launcher    = $Roots.cmdLauncher
        js_launcher     = $Roots.jsLauncher
        current_version = $SnapshotId
        updated_at      = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $ownedJson = ConvertTo-CanonicalJson -InputObject $owned
    [System.IO.File]::WriteAllText($Roots.ownedPath, "$ownedJson`n", [System.Text.Encoding]::UTF8)
}

# ---------------------------------------------------------------------------
# User PATH Management (HKCU\Environment only, no elevation, broadcast)
# ---------------------------------------------------------------------------

# FUTURE PROOF: HKCU\Environment registry write, REG_EXPAND_SZ expansion, and WM_SETTINGCHANGE broadcast must be verified in Windows harness.
function Add-UserPathEntry {
    param([string]$BinDir)
    try {
        $userPath = [System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)
        if ($null -eq $userPath) { $userPath = '' }
        $entries = $userPath.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

        $normBin = $BinDir.TrimEnd('\').ToLowerInvariant()
        foreach ($entry in $entries) {
            if ($entry.TrimEnd('\').ToLowerInvariant() -eq $normBin) {
                return $false # already in path
            }
        }

        $newPath = if ($userPath -eq '') { $BinDir } else { "$userPath;$BinDir" }
        [System.Environment]::SetEnvironmentVariable('PATH', $newPath, [System.EnvironmentVariableTarget]::User)
        return $true
    } catch {
        return $false
    }
}

function Remove-UserPathEntry {
    param([string]$BinDir)
    try {
        $userPath = [System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)
        if ($null -eq $userPath) { return }
        $entries = $userPath.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

        $normBin = $BinDir.TrimEnd('\').ToLowerInvariant()
        $kept = [System.Collections.Generic.List[string]]::new()
        foreach ($entry in $entries) {
            if ($entry.TrimEnd('\').ToLowerInvariant() -ne $normBin) {
                $kept.Add($entry)
            }
        }

        $newPath = [string]::Join(';', $kept)
        [System.Environment]::SetEnvironmentVariable('PATH', $newPath, [System.EnvironmentVariableTarget]::User)
    } catch {}
}

# ---------------------------------------------------------------------------
# Asset Resolution (Adjacent vs Explicit Local)
# ---------------------------------------------------------------------------

function Resolve-ReleaseAssets {
    param(
        [string]$ScriptPath,
        $Options
    )
    $hasArchive = -not [string]::IsNullOrEmpty($Options.Archive)
    $hasChecksum = -not [string]::IsNullOrEmpty($Options.Checksum)
    $hasMetadata = -not [string]::IsNullOrEmpty($Options.Metadata)

    if ($hasArchive -or $hasChecksum -or $hasMetadata) {
        if (-not ($hasArchive -and $hasChecksum -and $hasMetadata)) {
            throw [System.ArgumentException]::new('Explicit local install requires all three arguments: --Archive, --Checksum, and --Metadata.')
        }

        $archivePath = [System.IO.Path]::GetFullPath($Options.Archive)
        $checksumPath = [System.IO.Path]::GetFullPath($Options.Checksum)
        $metadataPath = [System.IO.Path]::GetFullPath($Options.Metadata)

        if (-not [System.IO.File]::Exists($archivePath)) {
            throw [System.IO.FileNotFoundException]::new("Archive file not found: $archivePath", $archivePath)
        }
        if (-not [System.IO.File]::Exists($checksumPath)) {
            throw [System.IO.FileNotFoundException]::new("Checksum file not found: $checksumPath", $checksumPath)
        }
        if (-not [System.IO.File]::Exists($metadataPath)) {
            throw [System.IO.FileNotFoundException]::new("Metadata file not found: $metadataPath", $metadataPath)
        }

        return @{
            archivePath  = $archivePath
            checksumPath = $checksumPath
            metadataPath = $metadataPath
        }
    }

    # Adjacent discovery
    $scriptDir = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($ScriptPath))
    $searchDirs = @(
        $scriptDir,
        [System.IO.Path]::Combine($scriptDir, 'dist', 'release')
    )

    $foundDir = $null
    $matchingArchives = @()

    foreach ($dir in $searchDirs) {
        if ([System.IO.Directory]::Exists($dir)) {
            $files = [System.IO.Directory]::GetFiles($dir, 'evcrate-v*-windows-x64.zip')
            if ($files.Length -gt 0) {
                $foundDir = $dir
                $matchingArchives = $files
                break
            }
        }
    }

    if ($matchingArchives.Length -eq 0) {
        throw [System.InvalidOperationException]::new('No matching Windows release archives found adjacent to install.ps1. Please provide -Archive, -Checksum, and -Metadata.')
    }
    if ($matchingArchives.Length -gt 1) {
        $names = ($matchingArchives | ForEach-Object { [System.IO.Path]::GetFileName($_) }) -join ', '
        throw [System.InvalidOperationException]::new("Ambiguous adjacent release assets: found multiple archives [$names]. Please provide -Archive, -Checksum, and -Metadata.")
    }

    $archivePath = $matchingArchives[0]
    $checksumPath = "$archivePath.sha256"
    if (-not [System.IO.File]::Exists($checksumPath)) {
        throw [System.IO.FileNotFoundException]::new("Matching sidecar checksum not found for adjacent archive: $checksumPath")
    }

    $archiveName = [System.IO.Path]::GetFileName($archivePath)
    $verMatch = [System.Text.RegularExpressions.Regex]::Match($archiveName, '^evcrate-v([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)-windows-x64\.zip$')
    if (-not $verMatch.Success) {
        throw [System.InvalidOperationException]::new("Cannot parse semver version from archive name: $archiveName")
    }
    $version = $verMatch.Groups[1].Value
    $metadataPath = [System.IO.Path]::Combine($foundDir, "evcrate-v$version.release.json")
    if (-not [System.IO.File]::Exists($metadataPath)) {
        throw [System.IO.FileNotFoundException]::new("Matching release metadata not found for adjacent archive: $metadataPath")
    }

    return @{
        archivePath  = $archivePath
        checksumPath = $checksumPath
        metadataPath = $metadataPath
    }
}

# ---------------------------------------------------------------------------
# ZIP Enumeration and Extraction (Two-pass containment & safety)
# ---------------------------------------------------------------------------

function Extract-ZipArchiveSafely {
    param(
        [string]$ArchivePath,
        [string]$StageDir
    )
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $archiveFile = [System.IO.FileInfo]::new($ArchivePath)
    if ($archiveFile.Length -gt $MAX_ARCHIVE_BYTES) {
        throw [System.InvalidOperationException]::new("Archive size $($archiveFile.Length) exceeds maximum $MAX_ARCHIVE_BYTES")
    }

    $zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        if ($zip.Entries.Count -gt $MAX_FILES) {
            throw [System.InvalidOperationException]::new("ZIP file count $($zip.Entries.Count) exceeds limit $MAX_FILES")
        }

        # Pass 1: Validation and preflight
        $totalExpanded = [long]0
        $seenPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
        $seenLower = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

        foreach ($entry in $zip.Entries) {
            $totalExpanded += $entry.Length
            if ($totalExpanded -gt $MAX_TOTAL_EXPANDED_BYTES) {
                throw [System.InvalidOperationException]::new("Total decompressed ZIP bytes exceed limit $MAX_TOTAL_EXPANDED_BYTES")
            }
            if ($entry.Length -gt $MAX_FILE_BYTES) {
                throw [System.InvalidOperationException]::new("File '$($entry.FullName)' size $($entry.Length) exceeds limit $MAX_FILE_BYTES")
            }

            $entryName = $entry.FullName.Replace('\', '/')
            if (-not $entryName.StartsWith('package/')) {
                throw [System.InvalidOperationException]::new("ZIP entry does not start with package/: $entryName")
            }

            $relPath = $entryName.Substring('package/'.Length)
            [void](Test-InventoryPathSafety -RelativePath $relPath)

            if ($seenPaths.Contains($relPath)) {
                throw [System.InvalidOperationException]::new("Duplicate path in ZIP: $relPath")
            }
            if ($seenLower.Contains($relPath.ToLowerInvariant())) {
                throw [System.InvalidOperationException]::new("Case-fold collision in ZIP: $relPath")
            }
            [void]$seenPaths.Add($relPath)
            [void]$seenLower.Add($relPath.ToLowerInvariant())

            # Check external attributes for reparse/symlink flags
            if ($entry.ExternalAttributes -ne 0) {
                $rawMode = ($entry.ExternalAttributes -shr 16) -band 0xFFFF
                # S_IFLNK = 0120000 (0xA000)
                if (($rawMode -band 0xF000) -eq 0xA000) {
                    throw [System.InvalidOperationException]::new("Symbolic link entry rejected in ZIP archive: $relPath")
                }
            }
        }

        # Pass 2: Extract each regular file using FileMode.CreateNew under fresh stage
        $records = [System.Collections.Generic.List[object]]::new()
        $packageStageRoot = [System.IO.Path]::Combine($StageDir, 'package')

        foreach ($entry in $zip.Entries) {
            $relPath = $entry.FullName.Replace('\', '/').Substring('package/'.Length)
            $destSubPath = $relPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $destFullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($packageStageRoot, $destSubPath))

            # Strict containment check
            if (-not $destFullPath.StartsWith($packageStageRoot)) {
                throw [System.InvalidOperationException]::new("Extraction path escapes stage root: $destFullPath")
            }

            $destDir = [System.IO.Path]::GetDirectoryName($destFullPath)
            if (-not [System.IO.Directory]::Exists($destDir)) {
                [void][System.IO.Directory]::CreateDirectory($destDir)
            }

            # Extract via CreateNew to prevent overwriting or following links
            $entryStream = $entry.Open()
            $destStream = [System.IO.File]::Open($destFullPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $buffer = [byte[]]::new(65536)
                while (($read = $entryStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $destStream.Write($buffer, 0, $read)
                    [void]$sha.TransformBlock($buffer, 0, $read, $null, 0)
                }
                [void]$sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
            } finally {
                $destStream.Dispose()
                $entryStream.Dispose()
            }

            # Verify destination attributes are regular file
            $fi = [System.IO.FileInfo]::new($destFullPath)
            if (($fi.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw [System.InvalidOperationException]::new("Reparse point detected on extracted file: $destFullPath")
            }

            $sb = [System.Text.StringBuilder]::new($sha.Hash.Length * 2)
            foreach ($b in $sha.Hash) {
                [void]$sb.Append($b.ToString('x2'))
            }
            $fileSha = $sb.ToString()
            $sha.Dispose()

            # Mode handling for Windows:
            # NOTE: Windows ZIP lacks reliable POSIX mode behavior. If ExternalAttributes is present, use it; otherwise infer executable from entrypoint paths. Full native Windows harness validation will verify this in future plan.
            $rawMode = ($entry.ExternalAttributes -shr 16) -band 0x1FF
            $isExec = if ($rawMode -ne 0) {
                ($rawMode -band 0x49) -ne 0 # 0o111
            } else {
                $relPath -eq 'dist/cli/evcrate.js' -or $relPath -eq '.evcrate/source/.evcrate/bin/evcrate-advisor'
            }
            $normMode = if ($isExec) { 493 } else { 420 } # 0o755 vs 0o644

            $records.Add(@{
                path   = $relPath
                size   = $fi.Length
                mode   = $normMode
                sha256 = $fileSha
            })
        }

        return $records
    } finally {
        $zip.Dispose()
    }
}

# ---------------------------------------------------------------------------
# Staged Smoke Check (Non-mutating CLI version verification)
# ---------------------------------------------------------------------------

function Execute-StagedSmoke {
    param(
        [string]$NodePath,
        [string]$StagedCliPath,
        [string]$ExpectedVersion
    )
    if (-not [System.IO.File]::Exists($StagedCliPath)) {
        throw [System.IO.FileNotFoundException]::new("Staged CLI not found at $StagedCliPath", $StagedCliPath)
    }

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $NodePath
    $psi.Arguments = "`"$StagedCliPath`" version --json"
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    if ($proc.ExitCode -ne 0) {
        throw [System.InvalidOperationException]::new("Staged CLI validation exited with code $($proc.ExitCode): $stderr")
    }

    try {
        $parsed = ConvertFrom-Json -InputObject $stdout
    } catch {
        throw [System.InvalidOperationException]::new("Staged CLI version --json emitted invalid JSON: $stdout")
    }

    if ($parsed.status -ne 'ok' -or $null -eq $parsed.payload -or $parsed.payload.version -ne $ExpectedVersion) {
        throw [System.InvalidOperationException]::new("Staged CLI validation failed: unexpected response $stdout")
    }
}

# ---------------------------------------------------------------------------
# Lifecycle Operations: Install, Upgrade, Repair, Rollback, Uninstall
# ---------------------------------------------------------------------------

function Prune-OldSnapshots {
    param(
        $Roots,
        [array]$KeepSnapshotIds
    )
    if (-not [System.IO.Directory]::Exists($Roots.versionsDir)) { return }
    $keepSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($k in $KeepSnapshotIds) {
        if (-not [string]::IsNullOrEmpty($k)) { [void]$keepSet.Add($k) }
    }

    $entries = [System.IO.Directory]::GetDirectories($Roots.versionsDir)
    foreach ($entry in $entries) {
        $base = [System.IO.Path]::GetFileName($entry)
        if (-not $keepSet.Contains($base)) {
            try { [System.IO.Directory]::Delete($entry, $true) } catch {}
        }
    }
}

function Perform-Install {
    param(
        $Roots,
        $Assets,
        $Options,
        [bool]$IsRepair = $false,
        [string]$NodePath
    )

    # 1. Verify sidecar
    $sidecarRaw = [System.IO.File]::ReadAllText($Assets.checksumPath, [System.Text.Encoding]::UTF8)
    $sidecar = Parse-Sidecar -Content $sidecarRaw -ExpectedBasename ([System.IO.Path]::GetFileName($Assets.archivePath))

    # 2. Verify archive SHA-256
    $archiveSha = Get-FileSha256Hex -FilePath $Assets.archivePath
    if ($archiveSha -ne $sidecar.sha256) {
        throw [System.InvalidOperationException]::new("Archive SHA-256 $archiveSha does not match sidecar $($sidecar.sha256)")
    }

    # 3. Verify metadata
    $metadata = Parse-JsonFile -FilePath $Assets.metadataPath
    Validate-ReleaseMetadata -Metadata $metadata -ArchivePath $Assets.archivePath -ArchiveSha256 $archiveSha

    # 4. Idempotent check
    $oldSnapshotId = $null
    $oldSnapshotDir = $null
    if ([System.IO.File]::Exists($Roots.currentJson)) {
        try {
            $curPointer = Parse-JsonFile -FilePath $Roots.currentJson
            if ($curPointer.version_dir) {
                $oldSnapshotId = $curPointer.version_dir
                $oldSnapshotDir = [System.IO.Path]::Combine($Roots.versionsDir, $oldSnapshotId)
            }
        } catch {}
    }

    if (-not $IsRepair -and $oldSnapshotId -and $oldSnapshotId.StartsWith("$($metadata.version)-$archiveSha-")) {
        $journal = Read-InstallJournal -Roots $Roots
        if ($null -ne $journal -and $journal.state -eq 'committed' -and $journal.new_snapshot -eq $oldSnapshotId) {
            return @{
                action         = 'idempotent'
                snapshotId     = $oldSnapshotId
                version        = $metadata.version
                backupSnapshot = $null
                launcher       = $Roots.cmdLauncher
            }
        }
    }

    # 5. Stage fresh extraction
    [void][System.IO.Directory]::CreateDirectory($Roots.stagingDir)
    $stageDir = [System.IO.Path]::Combine($Roots.stagingDir, "stage-$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$(Get-Date -UFormat %s)")
    [void][System.IO.Directory]::CreateDirectory($stageDir)

    Write-InstallJournal -Roots $Roots -Data @{
        schema               = $SCHEMA_JOURNAL
        operation            = if ($IsRepair) { 'repair' } elseif ($oldSnapshotId) { 'upgrade' } else { 'install' }
        state                = 'staged'
        old_snapshot         = $oldSnapshotId
        new_snapshot         = $null
        archive_digest       = $archiveSha
        version              = $metadata.version
        stage_path           = $stageDir
        target_snapshot_path = $null
        current_pointer      = $Roots.currentJson
        launcher_path        = $Roots.cmdLauncher
        created_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        updated_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }

    # 6. Extract ZIP archive
    $extractedRecords = Extract-ZipArchiveSafely -ArchivePath $Assets.archivePath -StageDir $stageDir

    # 7. Post-extraction validations
    $packageDir = [System.IO.Path]::Combine($stageDir, 'package')

    # Verify package.json
    $pkgPath = [System.IO.Path]::Combine($packageDir, 'package.json')
    if (-not [System.IO.File]::Exists($pkgPath)) {
        throw [System.InvalidOperationException]::new('package/package.json missing from extracted payload')
    }
    $pkg = Parse-JsonFile -FilePath $pkgPath
    if ($pkg.version -ne $metadata.version) {
        throw [System.InvalidOperationException]::new("package.json version $($pkg.version) does not match metadata $($metadata.version)")
    }

    # Verify build manifests
    if ($metadata.build_manifest_digests) {
        foreach ($prop in $metadata.build_manifest_digests.PSObject.Properties) {
            $key = $prop.Name
            $expectedSha = $prop.Value
            $rel = if ($key -eq 'all') { '.evcrate/build-manifest.json' } else { ".evcrate/build-manifest-$key.json" }
            $manifestFull = [System.IO.Path]::Combine($packageDir, $rel.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
            if (-not [System.IO.File]::Exists($manifestFull)) {
                throw [System.InvalidOperationException]::new("Build manifest $rel missing from stage")
            }
            $actualSha = Get-FileSha256Hex -FilePath $manifestFull
            if ($actualSha -ne $expectedSha) {
                throw [System.InvalidOperationException]::new("Build manifest $rel SHA-256 mismatch")
            }
        }
    }

    # Verify 17-file controller closure
    if ($metadata.controller_closure_digest) {
        $controllerDir = [System.IO.Path]::Combine($packageDir, '.evcrate', 'source', '.evcrate', 'bin')
        if (-not [System.IO.Directory]::Exists($controllerDir)) {
            throw [System.InvalidOperationException]::new('Controller closure directory missing from stage')
        }
        $controllerMap = @{}
        foreach ($entry in $ADVISOR_CONTROLLER_FILES) {
            $entryFull = [System.IO.Path]::Combine($controllerDir, $entry.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
            if (-not [System.IO.File]::Exists($entryFull)) {
                throw [System.InvalidOperationException]::new("Controller file missing from stage: $entry")
            }
            $controllerMap[".evcrate/bin/$entry"] = Get-FileSha256Hex -FilePath $entryFull
        }
        $closureJson = ConvertTo-CanonicalJson -InputObject $controllerMap
        $computedClosureDigest = Get-BytesSha256Hex -Bytes ([System.Text.Encoding]::UTF8.GetBytes("$closureJson`n"))
        if ($computedClosureDigest -ne $metadata.controller_closure_digest) {
            throw [System.InvalidOperationException]::new("Controller closure digest $computedClosureDigest does not match metadata $($metadata.controller_closure_digest)")
        }
    }

    # Verify inventory digest
    $computedInventoryDigest = Compute-InventoryDigest -Records $extractedRecords
    if ($computedInventoryDigest -ne $metadata.inventory_digest) {
        throw [System.InvalidOperationException]::new("Extracted inventory digest $computedInventoryDigest does not match metadata $($metadata.inventory_digest)")
    }

    # 8. Non-mutating smoke check
    $stagedCli = [System.IO.Path]::Combine($packageDir, 'dist', 'cli', 'evcrate.js')
    Execute-StagedSmoke -NodePath $NodePath -StagedCliPath $stagedCli -ExpectedVersion $metadata.version

    # 9. Determine generation
    [void][System.IO.Directory]::CreateDirectory($Roots.versionsDir)
    $existingVersions = [System.IO.Directory]::GetDirectories($Roots.versionsDir) | ForEach-Object { [System.IO.Path]::GetFileName($_) }
    $prefix = "$($metadata.version)-$archiveSha-"
    $maxGen = 0
    foreach ($v in $existingVersions) {
        if ($v.StartsWith($prefix)) {
            $genStr = $v.Substring($prefix.Length)
            $g = 0
            if ([int]::TryParse($genStr, [ref]$g) -and $g -gt $maxGen) {
                $maxGen = $g
            }
        }
    }
    $nextGen = $maxGen + 1
    $newSnapshotId = "$prefix$nextGen"
    $targetVersionDir = [System.IO.Path]::Combine($Roots.versionsDir, $newSnapshotId)

    # 10. Write snapshot receipt
    $immutableFiles = @{}
    foreach ($r in $extractedRecords) {
        $immutableFiles[$r.path] = @{
            size   = $r.size
            sha256 = $r.sha256
            mode   = $r.mode
        }
    }
    $receipt = @{
        schema           = $SCHEMA_RECEIPT
        snapshot_id      = $newSnapshotId
        version          = $metadata.version
        archive_name     = [System.IO.Path]::GetFileName($Assets.archivePath)
        archive_sha256   = $archiveSha
        inventory_digest = $computedInventoryDigest
        immutable_files  = $immutableFiles
        mutable_paths    = @($MUTABLE_PATHS)
        installed_at     = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $receiptJson = ConvertTo-CanonicalJson -InputObject $receipt
    [System.IO.File]::WriteAllText([System.IO.Path]::Combine($stageDir, 'installer-receipt.json'), "$receiptJson`n", [System.Text.Encoding]::UTF8)

    # 11. Promote stage to versions directory
    [System.IO.Directory]::Move($stageDir, $targetVersionDir)

    # 12. Journal state: pointer-ready
    Write-InstallJournal -Roots $Roots -Data @{
        schema               = $SCHEMA_JOURNAL
        operation            = if ($IsRepair) { 'repair' } elseif ($oldSnapshotId) { 'upgrade' } else { 'install' }
        state                = 'pointer-ready'
        old_snapshot         = $oldSnapshotId
        new_snapshot         = $newSnapshotId
        archive_digest       = $archiveSha
        version              = $metadata.version
        stage_path           = $null
        target_snapshot_path = $targetVersionDir
        current_pointer      = $Roots.currentJson
        launcher_path        = $Roots.cmdLauncher
        created_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        updated_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }

    # 13. Commit pointers and shims
    Commit-Pointers -Roots $Roots -TargetVersionDir $targetVersionDir -SnapshotId $newSnapshotId -ArchiveSha $archiveSha -Version $metadata.version

    # 14. Journal state: committed
    Write-InstallJournal -Roots $Roots -Data @{
        schema               = $SCHEMA_JOURNAL
        operation            = if ($IsRepair) { 'repair' } elseif ($oldSnapshotId) { 'upgrade' } else { 'install' }
        state                = 'committed'
        old_snapshot         = $oldSnapshotId
        new_snapshot         = $newSnapshotId
        archive_digest       = $archiveSha
        version              = $metadata.version
        stage_path           = $null
        target_snapshot_path = $targetVersionDir
        current_pointer      = $Roots.currentJson
        launcher_path        = $Roots.cmdLauncher
        created_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        updated_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }

    # 15. User PATH configuration
    $pathAdded = Add-UserPathEntry -BinDir $Roots.binDir

    # 16. Prune old snapshots (keep new snapshot and displaced backup)
    Prune-OldSnapshots -Roots $Roots -KeepSnapshotIds @($newSnapshotId, $oldSnapshotId)

    return @{
        action         = if ($IsRepair) { 'repaired' } elseif ($oldSnapshotId) { 'upgraded' } else { 'installed' }
        snapshotId     = $newSnapshotId
        version        = $metadata.version
        backupSnapshot = $oldSnapshotDir
        launcher       = $Roots.cmdLauncher
        pathAdded      = $pathAdded
    }
}

function Perform-Rollback {
    param(
        $Roots,
        [string]$TargetSnapshotId
    )
    if (-not [System.IO.Directory]::Exists($Roots.versionsDir)) {
        throw [System.InvalidOperationException]::new('No versions directory found; rollback unavailable.')
    }

    $available = [System.IO.Directory]::GetDirectories($Roots.versionsDir) | ForEach-Object { [System.IO.Path]::GetFileName($_) }
    if ($available.Length -eq 0) {
        throw [System.InvalidOperationException]::new('No snapshots found in versions directory.')
    }

    if ([string]::IsNullOrEmpty($TargetSnapshotId)) {
        $availList = $available -join ', '
        throw [System.ArgumentException]::new("Rollback requires an explicit snapshot identifier. Available: [$availList]")
    }

    $targetId = [System.IO.Path]::GetFileName($TargetSnapshotId)
    $targetDir = [System.IO.Path]::Combine($Roots.versionsDir, $targetId)
    if (-not [System.IO.Directory]::Exists($targetDir)) {
        $availList = $available -join ', '
        throw [System.IO.DirectoryNotFoundException]::new("Snapshot '$targetId' not found in $($Roots.versionsDir). Available: [$availList]")
    }

    # Read and validate receipt
    $receiptPath = [System.IO.Path]::Combine($targetDir, 'installer-receipt.json')
    if (-not [System.IO.File]::Exists($receiptPath)) {
        throw [System.InvalidOperationException]::new("Snapshot receipt missing from rollback target: $receiptPath")
    }
    $receipt = Parse-JsonFile -FilePath $receiptPath
    if ($receipt.schema -ne $SCHEMA_RECEIPT) {
        throw [System.InvalidOperationException]::new("Invalid snapshot receipt schema: $($receipt.schema)")
    }

    # Validate immutable files against receipt
    $packageDir = [System.IO.Path]::Combine($targetDir, 'package')
    foreach ($prop in $receipt.immutable_files.PSObject.Properties) {
        $relPath = $prop.Name
        $meta = $prop.Value

        # Skip mutable paths
        $isMutable = $false
        foreach ($m in $MUTABLE_PATHS) {
            $prefix = $m.Replace('/**', '').Replace('/*', '')
            if ($relPath -eq $prefix -or $relPath.StartsWith("$prefix/")) {
                $isMutable = $true
                break
            }
        }
        if ($isMutable) { continue }

        $fullPath = [System.IO.Path]::Combine($packageDir, $relPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not [System.IO.File]::Exists($fullPath)) {
            throw [System.InvalidOperationException]::new("Immutable file missing from rollback target: $relPath")
        }
        $fi = [System.IO.FileInfo]::new($fullPath)
        if (($fi.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw [System.InvalidOperationException]::new("Reparse point detected on rollback file: $relPath")
        }
        if ($fi.Length -ne [long]$meta.size) {
            throw [System.InvalidOperationException]::new("Immutable file size changed in rollback target: $relPath")
        }
        $fileSha = Get-FileSha256Hex -FilePath $fullPath
        if ($fileSha -ne $meta.sha256) {
            throw [System.InvalidOperationException]::new("Immutable file hash changed in rollback target: $relPath")
        }
    }

    # Determine displaced snapshot
    $displacedSnapshotId = $null
    $displacedDir = $null
    if ([System.IO.File]::Exists($Roots.currentJson)) {
        try {
            $cur = Parse-JsonFile -FilePath $Roots.currentJson
            $displacedSnapshotId = $cur.version_dir
            if ($displacedSnapshotId) {
                $displacedDir = [System.IO.Path]::Combine($Roots.versionsDir, $displacedSnapshotId)
            }
        } catch {}
    }

    # Commit pointers
    Commit-Pointers -Roots $Roots -TargetVersionDir $targetDir -SnapshotId $targetId -ArchiveSha $receipt.archive_sha256 -Version $receipt.version

    Write-InstallJournal -Roots $Roots -Data @{
        schema               = $SCHEMA_JOURNAL
        operation            = 'rollback'
        state                = 'committed'
        old_snapshot         = $displacedSnapshotId
        new_snapshot         = $targetId
        archive_digest       = $receipt.archive_sha256
        version              = $receipt.version
        stage_path           = $null
        target_snapshot_path = $targetDir
        current_pointer      = $Roots.currentJson
        launcher_path        = $Roots.cmdLauncher
        created_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        updated_at           = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }

    return @{
        action         = 'rolled_back'
        snapshotId     = $targetId
        version        = $receipt.version
        backupSnapshot = $displacedDir
        launcher       = $Roots.cmdLauncher
    }
}

function Perform-Uninstall {
    param($Roots)
    # Check if already uninstalled
    if (-not [System.IO.Directory]::Exists($Roots.dataRoot) -and
        -not [System.IO.Directory]::Exists($Roots.stateRoot) -and
        -not [System.IO.File]::Exists($Roots.cmdLauncher)) {
        return @{ action = 'already_uninstalled' }
    }

    # 1. Remove User PATH entry
    Remove-UserPathEntry -BinDir $Roots.binDir

    # 2. Remove launchers
    if ([System.IO.File]::Exists($Roots.cmdLauncher)) {
        try { [System.IO.File]::Delete($Roots.cmdLauncher) } catch {}
    }
    if ([System.IO.File]::Exists($Roots.jsLauncher)) {
        try { [System.IO.File]::Delete($Roots.jsLauncher) } catch {}
    }

    # 3. Remove versions and staging
    if ([System.IO.Directory]::Exists($Roots.versionsDir)) {
        try { [System.IO.Directory]::Delete($Roots.versionsDir, $true) } catch {}
    }
    if ([System.IO.Directory]::Exists($Roots.stagingDir)) {
        try { [System.IO.Directory]::Delete($Roots.stagingDir, $true) } catch {}
    }

    # 4. Remove current.json and data root files
    if ([System.IO.File]::Exists($Roots.currentJson)) {
        try { [System.IO.File]::Delete($Roots.currentJson) } catch {}
    }

    # 5. Remove state files
    if ([System.IO.Directory]::Exists($Roots.stateRoot)) {
        try { [System.IO.Directory]::Delete($Roots.stateRoot, $true) } catch {}
    }

    # 6. Remove data root if empty
    if ([System.IO.Directory]::Exists($Roots.dataRoot)) {
        try {
            $items = [System.IO.Directory]::GetFileSystemEntries($Roots.dataRoot)
            if ($items.Length -eq 0) {
                [System.IO.Directory]::Delete($Roots.dataRoot, $false)
            }
        } catch {}
    }

    return @{ action = 'uninstalled' }
}

# ---------------------------------------------------------------------------
# Argument Parsing and Main Entrypoint
# ---------------------------------------------------------------------------

function Parse-Args {
    param([string[]]$RawArgs)

    $subcommand = 'install'
    $targetSnapshot = $null
    $options = @{
        Archive  = $null
        Checksum = $null
        Metadata = $null
        RootDir  = $null
        DataDir  = $null
        StateDir = $null
        BinDir   = $null
    }

    $i = 0
    if ($RawArgs.Length -gt 0 -and -not $RawArgs[0].StartsWith('-')) {
        $cmd = $RawArgs[0].ToLowerInvariant()
        if ($cmd -in @('install', 'repair', 'upgrade', 'rollback', 'uninstall', 'help')) {
            $subcommand = if ($cmd -eq 'upgrade') { 'install' } else { $cmd }
            $i = 1
            if ($subcommand -eq 'rollback' -and $RawArgs.Length -gt 1 -and -not $RawArgs[1].StartsWith('-')) {
                $targetSnapshot = $RawArgs[1]
                $i = 2
            }
        }
    }

    while ($i -lt $RawArgs.Length) {
        $arg = $RawArgs[$i]
        switch -Regex ($arg) {
            '^(?:--archive|-Archive)$' {
                $options.Archive = $RawArgs[++$i]
            }
            '^(?:--checksum|-Checksum)$' {
                $options.Checksum = $RawArgs[++$i]
            }
            '^(?:--metadata|-Metadata)$' {
                $options.Metadata = $RawArgs[++$i]
            }
            '^(?:--root-dir|-RootDir)$' {
                $options.RootDir = $RawArgs[++$i]
            }
            '^(?:--data-dir|-DataDir)$' {
                $options.DataDir = $RawArgs[++$i]
            }
            '^(?:--state-dir|-StateDir)$' {
                $options.StateDir = $RawArgs[++$i]
            }
            '^(?:--bin-dir|-BinDir)$' {
                $options.BinDir = $RawArgs[++$i]
            }
            '^(?:-h|--help|-Help)$' {
                $subcommand = 'help'
            }
            default {
                # Check for forbidden acquisition parameters
                if ($arg -match '^(?:--url|--repo|--tag|--token|https?://)') {
                    throw [System.ArgumentException]::new("Remote URL or repository acquisition is not supported. Please download release assets manually: $arg")
                }
                throw [System.ArgumentException]::new("Unrecognized argument: $arg")
            }
        }
        $i++
    }

    return @{
        subcommand     = $subcommand
        targetSnapshot = $targetSnapshot
        options        = $options
    }
}

function Show-Help {
    Write-Output @"
EVCrate Windows Unpack Installer

Usage:
  .\install.ps1 [command] [options]

Commands:
  install               Install or upgrade EVCrate (default)
  repair                Perform same-version repair from clean assets
  rollback <snapshot>   Roll back to a retained prior snapshot
  uninstall             Safely remove installer-owned roots and launcher
  help                  Show this help message

Options:
  -Archive <path>       Path to evcrate-v*-windows-x64.zip
  -Checksum <path>      Path to evcrate-v*-windows-x64.zip.sha256
  -Metadata <path>      Path to evcrate-v*.release.json
  -RootDir <path>       Override %LOCALAPPDATA%\EVCrate
  -DataDir <path>       Override data directory
  -StateDir <path>      Override state directory
  -BinDir <path>        Override bin directory
  -Help                 Show this help message
"@
}

function Main {
    $parsed = Parse-Args -RawArgs $args

    if ($parsed.subcommand -eq 'help') {
        Show-Help
        return 0
    }

    # Preflight Node.js >= 22.19.0
    $nodePath = Assert-NodeFloor

    $roots = Resolve-InstallRoots -Options $parsed.options
    $lock = Acquire-InstallLock -Roots $roots

    try {
        Recover-InstallJournal -Roots $roots

        if ($parsed.subcommand -eq 'uninstall') {
            $uninstResult = Perform-Uninstall -Roots $roots
            Write-Output '✓ Successfully uninstalled EVCrate CLI.'
            return 0
        }

        if ($parsed.subcommand -eq 'rollback') {
            $rbResult = Perform-Rollback -Roots $roots -TargetSnapshotId $parsed.targetSnapshot
            Write-Output "✓ Rolled back to snapshot: $($rbResult.snapshotId) (v$($rbResult.version))"
            if ($rbResult.backupSnapshot) {
                Write-Output "  Displaced snapshot preserved at: $($rbResult.backupSnapshot)"
            }
            return 0
        }

        # install / repair
        $scriptPath = $MyInvocation.MyCommand.Path
        if ([string]::IsNullOrEmpty($scriptPath)) {
            $scriptPath = [System.IO.Path]::Combine((Get-Location).Path, 'install.ps1')
        }

        $assets = Resolve-ReleaseAssets -ScriptPath $scriptPath -Options $parsed.options
        $isRepair = $parsed.subcommand -eq 'repair'
        $result = Perform-Install -Roots $roots -Assets $assets -Options $parsed.options -IsRepair $isRepair -NodePath $nodePath

        if ($result.action -eq 'idempotent') {
            Write-Output "✓ EVCrate v$($result.version) is already installed at snapshot $($result.snapshotId)."
            return 0
        }

        Write-Output "✓ Successfully $($result.action) EVCrate v$($result.version)"
        Write-Output "  Snapshot: $($result.snapshotId)"
        Write-Output "  Launcher: $($result.launcher)"
        if ($result.backupSnapshot) {
            Write-Output "  Backup preserved at: $($result.backupSnapshot)"
        } else {
            Write-Output '  No prior backup snapshot.'
        }

        if ($result.pathAdded) {
            Write-Output "`nNote: Added '$($roots.binDir)' to User PATH."
            Write-Output 'Please reopen your terminal for PATH changes to take effect.'
        }

        Write-Output "`nNext steps to publish coding agent harnesses:"
        Write-Output '  evcrate publish --dry-run'
        Write-Output '  evcrate publish --apply'

        return 0
    } finally {
        Release-InstallLock -LockHandle $lock
    }
}

try {
    $exitCode = Main
    exit $exitCode
} catch {
    Write-Error "Installation error: $($_.Exception.Message)"
    exit 1
}

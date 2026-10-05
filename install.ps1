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

$UTF8_NO_BOM = [System.Text.UTF8Encoding]::new($false)
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
    'evcrate-advice-mode',
    'lib/advisor/activation.cjs',
    'lib/advisor/adapter-contract.cjs',
    'lib/advisor/adapter-registry.cjs',
    'lib/advisor/adapters/claude.cjs',
    'lib/advisor/adapters/codex.cjs',
    'lib/advisor/adapters/omp.cjs',
    'lib/advisor/adapters/omp-parser.cjs',
    'lib/advisor/adapters/pi.cjs',
    'lib/advisor/checkpoint-contract.cjs',
    'lib/advisor/contracts-v2.cjs',
    'lib/advisor/controller-envelope.cjs',
    'lib/advisor/controller.cjs',
    'lib/advisor/darwin-platform.cjs',
    'lib/advisor/errors.cjs',
    'lib/advisor/generated/advisor-contract-runtime.js',
    'lib/advisor/generated/advisor-metrics.js',
    'lib/advisor/generated/canonical-json.js',
    'lib/advisor/generated/json.js',
    'lib/advisor/history-contract.cjs',
    'lib/advisor/history-prune.cjs',
    'lib/advisor/history-query.cjs',
    'lib/advisor/history-store.cjs',
    'lib/advisor/isolated-workspace.cjs',
    'lib/advisor/json-document.cjs',
    'lib/advisor/managed-checkpoint.cjs',
    'lib/advisor/native/darwin/advisor-native.c',
    'lib/advisor/native/darwin/advisor-native.h',
    'lib/advisor/native/darwin/prebuilt/artifacts.json',
    'lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node',
    'lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node',
    'lib/advisor/native/darwin/process.c',
    'lib/advisor/native/darwin/storage.c',
    'lib/advisor/policy-schema.cjs',
    'lib/advisor/profile.cjs',
    'lib/advisor/runner.cjs',
    'lib/advisor/runtime-brief.generated.cjs',
    'lib/advisor/state-baseline.cjs',
    'lib/advisor/state-contract.cjs',
    'lib/advisor/state-human.cjs',
    'lib/advisor/state-io.cjs',
    'lib/advisor/task-state.cjs',
    'lib/advisor/windows-native.cs',
    'lib/advisor/windows-native.ps1',
    'lib/advisor/windows-platform.cjs'
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
        throw [System.InvalidOperationException]::new("Path exceeds maximum depth of ${MAX_PATH_DEPTH}: $RelativePath")
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

function Test-ContainedPath {
    param(
        [string]$BasePath,
        [string]$CandidatePath,
        [bool]$AllowExact = $false
    )
    if ([string]::IsNullOrEmpty($BasePath) -or [string]::IsNullOrEmpty($CandidatePath)) {
        return $false
    }
    try {
        $fullBase = [System.IO.Path]::GetFullPath($BasePath)
        $fullCandidate = [System.IO.Path]::GetFullPath($CandidatePath)
    } catch {
        return $false
    }

    $normBase = $fullBase.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $root = [System.IO.Path]::GetPathRoot($fullBase)
    if ([string]::IsNullOrEmpty($normBase) -or $normBase -eq $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)) {
        $normBase = $root
    }

    $normCandidate = $fullCandidate.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $candidateRoot = [System.IO.Path]::GetPathRoot($fullCandidate)
    if ([string]::IsNullOrEmpty($normCandidate) -or $normCandidate -eq $candidateRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)) {
        $normCandidate = $candidateRoot
    }

    if ([string]::Equals($normBase, $normCandidate, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $AllowExact
    }

    if ($normBase.EndsWith([System.IO.Path]::DirectorySeparatorChar.ToString()) -or $normBase.EndsWith([System.IO.Path]::AltDirectorySeparatorChar.ToString())) {
        if ($fullCandidate.Length -gt $normBase.Length -and
            $fullCandidate.StartsWith($normBase, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    } else {
        $prefix = $normBase + [System.IO.Path]::DirectorySeparatorChar
        if ($fullCandidate.Length -ge $prefix.Length -and
            $fullCandidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    return $false
}

function Assert-ContainedPath {
    param(
        [string]$BasePath,
        [string]$CandidatePath,
        [bool]$AllowExact = $false,
        [string]$Message = 'Path containment violation'
    )
    if (-not (Test-ContainedPath -BasePath $BasePath -CandidatePath $CandidatePath -AllowExact $AllowExact)) {
        throw [System.InvalidOperationException]::new("$Message`: '$CandidatePath' is not contained in '$BasePath'")
    }
}

function Assert-NoReparseAncestor {
    param(
        [string]$Path,
        [string]$Description = 'path'
    )
    if ([string]::IsNullOrEmpty($Path)) { return }
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($fullPath)
    if ([string]::IsNullOrEmpty($root)) {
        throw [System.InvalidOperationException]::new("Cannot determine path root for: $fullPath")
    }

    $cur = $fullPath
    $components = [System.Collections.Generic.List[string]]::new()
    while (-not [string]::IsNullOrEmpty($cur)) {
        $components.Add($cur)
        $parent = [System.IO.Path]::GetDirectoryName($cur)
        if ([string]::IsNullOrEmpty($parent) -or [string]::Equals($cur, $parent, [System.StringComparison]::OrdinalIgnoreCase)) {
            break
        }
        $cur = $parent
    }

    $components.Reverse()

    foreach ($checkPath in $components) {
        if ([string]::Equals($checkPath, $root, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        $entryExists = $false
        $isReparse = $false
        try {
            $attrs = [System.IO.File]::GetAttributes($checkPath)
            $entryExists = $true
            if (($attrs -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                $isReparse = $true
            }
        } catch [System.InvalidOperationException] {
            throw
        } catch {
            # File::GetAttributes threw (e.g. DirectoryNotFoundException on dangling junction in PS 5.1)
            try {
                $item = Get-Item -LiteralPath $checkPath -Force -ErrorAction SilentlyContinue
                if ($null -ne $item) {
                    $entryExists = $true
                    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                        $isReparse = $true
                    }
                }
            } catch {}

            if (-not $entryExists) {
                try {
                    $parentDir = [System.IO.Path]::GetDirectoryName($checkPath)
                    $leafName = [System.IO.Path]::GetFileName($checkPath)
                    if ([System.IO.Directory]::Exists($parentDir)) {
                        $pDi = [System.IO.DirectoryInfo]::new($parentDir)
                        $matches = $pDi.GetFileSystemInfos($leafName)
                        if ($matches.Length -gt 0) {
                            $entryExists = $true
                            if (($matches[0].Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                                $isReparse = $true
                            }
                        }
                    }
                } catch {}
            }
        }

        if ($isReparse) {
            throw [System.InvalidOperationException]::new("Insecure reparse point or junction detected in $Description ancestor: $checkPath")
        }

        if (-not $entryExists) {
            break
        }
    }
}

function New-SafeDirectory {
    param(
        [string]$DirPath,
        [string]$Description = 'directory'
    )
    if ([string]::IsNullOrEmpty($DirPath)) { return }
    $fullDir = [System.IO.Path]::GetFullPath($DirPath)
    Assert-NoReparseAncestor -Path $fullDir -Description $Description
    if (-not [System.IO.Directory]::Exists($fullDir)) {
        [void][System.IO.Directory]::CreateDirectory($fullDir)
    }
    Assert-NoReparseAncestor -Path $fullDir -Description $Description
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

function Test-AlreadyUninstalled {
    param($Roots)
    return (-not [System.IO.Directory]::Exists($Roots.dataRoot) -and
            -not [System.IO.Directory]::Exists($Roots.stateRoot) -and
            -not [System.IO.Directory]::Exists($Roots.binDir) -and
            -not [System.IO.File]::Exists($Roots.cmdLauncher) -and
            -not [System.IO.File]::Exists($Roots.jsLauncher))
}

function Resolve-InstallRoots {
    param(
        $Options,
        [bool]$EnsureDirectories = $false
    )
    $localAppData = $env:LOCALAPPDATA
    if ([string]::IsNullOrEmpty($localAppData)) {
        $localAppData = [System.IO.Path]::Combine($env:USERPROFILE, 'AppData', 'Local')
    }

    $defaultRoot = [System.IO.Path]::Combine($localAppData, 'EVCrate')
    $dataRoot = if ($Options.RootDir) { $Options.RootDir } elseif ($Options.DataDir) { $Options.DataDir } else { $defaultRoot }
    $stateRoot = if ($Options.StateDir) { $Options.StateDir } else { [System.IO.Path]::Combine($dataRoot, 'state') }
    $binDir = if ($Options.BinDir) { $Options.BinDir } else { [System.IO.Path]::Combine($dataRoot, 'bin') }

    $fullDataRoot = [System.IO.Path]::GetFullPath($dataRoot)
    $fullStateRoot = [System.IO.Path]::GetFullPath($stateRoot)
    $fullBinDir = [System.IO.Path]::GetFullPath($binDir)

    Assert-NoReparseAncestor -Path $fullDataRoot -Description 'data root'
    Assert-NoReparseAncestor -Path $fullStateRoot -Description 'state root'
    Assert-NoReparseAncestor -Path $fullBinDir -Description 'bin directory'

    if ($EnsureDirectories) {
        New-SafeDirectory -DirPath $fullDataRoot -Description 'data root'
        New-SafeDirectory -DirPath $fullStateRoot -Description 'state root'
        New-SafeDirectory -DirPath $fullBinDir -Description 'bin directory'
    }

    return @{
        dataRoot      = $fullDataRoot
        stateRoot     = $fullStateRoot
        binDir        = $fullBinDir
        versionsDir   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullDataRoot, 'versions'))
        stagingDir    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullDataRoot, 'staging'))
        currentJson   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullDataRoot, 'current.json'))
        cmdLauncher   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullBinDir, 'evcrate.cmd'))
        jsLauncher    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullBinDir, 'launcher.cjs'))
        lockPath      = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullStateRoot, 'install.lock'))
        journalPath   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullStateRoot, 'install-journal.json'))
        ownedPath     = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fullStateRoot, 'installer-owned.json'))
    }
}

function Acquire-InstallLock {
    param($Roots)
    $lockPath = $Roots.lockPath
    $stateDir = [System.IO.Path]::GetDirectoryName($lockPath)
    New-SafeDirectory -DirPath $stateDir -Description 'state root'
    Assert-NoReparseAncestor -Path $lockPath -Description 'lock file'

    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $tokenBytes = [byte[]]::new(16)
    $rng.GetBytes($tokenBytes)
    $rng.Dispose()
    $token = [System.BitConverter]::ToString($tokenBytes).Replace('-', '').ToLowerInvariant()

    $payload = ConvertTo-CanonicalJson @{
        pid        = [System.Diagnostics.Process]::GetCurrentProcess().Id
        hostname   = [System.Environment]::MachineName
        token      = $token
        created_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $lockBytes = [System.Text.Encoding]::UTF8.GetBytes("$payload`n")
    $fileOptions = [System.IO.FileOptions]::DeleteOnClose

    try {
        $fs = [System.IO.FileStream]::new(
            $lockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None,
            4096,
            $fileOptions
        )
        $fs.Write($lockBytes, 0, $lockBytes.Length)
        $fs.Flush($true)
        return @{ FileStream = $fs; LockPath = $lockPath; Token = $token }
    } catch [System.IO.IOException] {
        # Lock file exists or is held by another process; evaluate for stale legacy lock
        $isStaleLegacy = $false
        try {
            if ([System.IO.File]::Exists($lockPath)) {
                $fsRead = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $reader = [System.IO.StreamReader]::new($fsRead, [System.Text.Encoding]::UTF8)
                $rawLock = $reader.ReadToEnd()
                $reader.Dispose()
                $fsRead.Dispose()

                $lockData = ConvertFrom-Json -InputObject $rawLock
                # Legacy shape must have hostname, pid, created_at, and MUST NOT have token
                if ($null -ne $lockData) {
                    $hasToken = $null -ne $lockData.PSObject.Properties['token']
                    $hasHostname = $null -ne $lockData.PSObject.Properties['hostname']
                    $hasPid = $null -ne $lockData.PSObject.Properties['pid']
                    $hasCreatedAt = $null -ne $lockData.PSObject.Properties['created_at']
                    if (-not $hasToken -and $hasHostname -and $hasPid -and $hasCreatedAt) {
                        if ($lockData.hostname -eq [System.Environment]::MachineName) {
                            $pidNum = 0
                            if ([int]::TryParse($lockData.pid.ToString(), [ref]$pidNum) -and $pidNum -gt 0) {
                                $liveProc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
                                if ($null -eq $liveProc) {
                                    $isStaleLegacy = $true
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            # Sharing violation or parse failure: active or corrupt lock; fails closed
        }

        if ($isStaleLegacy) {
            $uniqueId = "$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$([System.Guid]::NewGuid().ToString('N'))"
            $quarantine = "$lockPath.stale-$uniqueId"
            try {
                [System.IO.File]::Move($lockPath, $quarantine)
            } catch {
                # Never delete after failed rename! Ambiguity fails closed.
                throw [System.InvalidOperationException]::new("Failed to quarantine stale legacy lock at $lockPath`: $($_.Exception.Message)")
            }

            # Re-attempt lock acquisition after successful rename quarantine
            $fs = [System.IO.FileStream]::new(
                $lockPath,
                [System.IO.FileMode]::CreateNew,
                [System.IO.FileAccess]::ReadWrite,
                [System.IO.FileShare]::None,
                4096,
                $fileOptions
            )
            $fs.Write($lockBytes, 0, $lockBytes.Length)
            $fs.Flush($true)
            return @{ FileStream = $fs; LockPath = $lockPath; Token = $token }
        }

        throw [System.InvalidOperationException]::new("Installer is busy: active lock at $lockPath")
    }
}

function Release-InstallLock {
    param($LockHandle)
    if ($null -eq $LockHandle) { return }
    if ($null -ne $LockHandle.FileStream) {
        try {
            $LockHandle.FileStream.Dispose()
            $LockHandle.FileStream = $null
        } catch {}
    }
}

# ---------------------------------------------------------------------------
# Journaling & Recovery State Machine
# ---------------------------------------------------------------------------

function Replace-FileAtomic {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )
    if ([System.IO.File]::Exists($DestinationPath)) {
        $backupPath = "$DestinationPath.bak.$([System.Guid]::NewGuid().ToString('N'))"
        try {
            [void][System.IO.File]::Replace($SourcePath, $DestinationPath, $backupPath)
        } finally {
            if ([System.IO.File]::Exists($backupPath)) {
                try { [System.IO.File]::Delete($backupPath) } catch {}
            }
        }
    } else {
        [System.IO.File]::Move($SourcePath, $DestinationPath)
    }
}

function Write-InstallJournal {
    param($Roots, $Data)
    $journalPath = $Roots.journalPath
    $journalDir = [System.IO.Path]::GetDirectoryName($journalPath)
    New-SafeDirectory -DirPath $journalDir -Description 'journal directory'
    Assert-NoReparseAncestor -Path $journalPath -Description 'journal destination'

    $uniqueId = "$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$([System.Guid]::NewGuid().ToString('N'))"
    $tmpJournal = [System.IO.Path]::Combine($journalDir, "install-journal.tmp-$uniqueId")

    $json = ConvertTo-CanonicalJson -InputObject $Data
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("$json`n")

    try {
        $fs = [System.IO.FileStream]::new(
            $tmpJournal,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        try {
            $fs.Write($bytes, 0, $bytes.Length)
            $fs.Flush($true)
        } finally {
            $fs.Dispose()
        }

        Assert-NoReparseAncestor -Path $journalPath -Description 'journal destination'

        Replace-FileAtomic -SourcePath $tmpJournal -DestinationPath $journalPath
        Assert-NoReparseAncestor -Path $journalPath -Description 'journal destination after replacement'
    } catch {
        if ([System.IO.File]::Exists($tmpJournal)) {
            try { [System.IO.File]::Delete($tmpJournal) } catch {}
        }
        throw
    }
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
        Assert-NoReparseAncestor -Path $Roots.journalPath -Description 'journal destination'
        try { [System.IO.File]::Delete($Roots.journalPath) } catch {}
    }
}

function Recover-InstallJournal {
    param($Roots)
    if (-not [System.IO.File]::Exists($Roots.journalPath)) { return }
    $journal = Read-InstallJournal -Roots $Roots
    if ($null -eq $journal) {
        throw [System.InvalidOperationException]::new("Corrupt or unreadable install journal at $($Roots.journalPath)")
    }
    if ($journal.schema -ne $SCHEMA_JOURNAL) {
        throw [System.InvalidOperationException]::new("Invalid journal schema: $($journal.schema), expected $SCHEMA_JOURNAL")
    }

    if ($journal.state -eq 'staged') {
        if (-not [string]::IsNullOrEmpty($journal.stage_path)) {
            Assert-ContainedPath -BasePath $Roots.stagingDir -CandidatePath $journal.stage_path -AllowExact $false -Message 'Journal stage_path escape detected'
            if ([System.IO.Directory]::Exists($journal.stage_path)) {
                Assert-NoReparseAncestor -Path $journal.stage_path -Description 'journal stage path'
                [System.IO.Directory]::Delete($journal.stage_path, $true)
            }
        }
        Clear-InstallJournal -Roots $Roots
    } elseif ($journal.state -eq 'pointer-ready') {
        if (-not [string]::IsNullOrEmpty($journal.target_snapshot_path)) {
            Assert-ContainedPath -BasePath $Roots.versionsDir -CandidatePath $journal.target_snapshot_path -AllowExact $false -Message 'Journal target_snapshot_path escape detected'
            if ([System.IO.Directory]::Exists($journal.target_snapshot_path)) {
                Assert-NoReparseAncestor -Path $journal.target_snapshot_path -Description 'journal target snapshot path'
                Commit-Pointers -Roots $Roots -TargetVersionDir $journal.target_snapshot_path -SnapshotId $journal.new_snapshot -ArchiveSha $journal.archive_digest -Version $journal.version
                $journal.state = 'committed'
                $journal.updated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                Write-InstallJournal -Roots $Roots -Data $journal
            } else {
                throw [System.InvalidOperationException]::new("Journal target snapshot directory missing: $($journal.target_snapshot_path)")
            }
        } else {
            throw [System.InvalidOperationException]::new('Journal in pointer-ready state missing target_snapshot_path')
        }
    } elseif ($journal.state -eq 'committed') {
        return
    } else {
        throw [System.InvalidOperationException]::new("Unknown journal state: $($journal.state)")
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

    $fullDataRoot = [System.IO.Path]::GetFullPath($Roots.dataRoot)
    $fullBinDir = [System.IO.Path]::GetFullPath($Roots.binDir)
    $fullStateRoot = [System.IO.Path]::GetFullPath($Roots.stateRoot)

    New-SafeDirectory -DirPath $fullDataRoot -Description 'data root'
    New-SafeDirectory -DirPath $fullBinDir -Description 'bin directory'
    New-SafeDirectory -DirPath $fullStateRoot -Description 'state root'

    Assert-ContainedPath -BasePath $fullDataRoot -CandidatePath $Roots.currentJson -AllowExact $false -Message 'current.json escapes data root'
    Assert-NoReparseAncestor -Path $Roots.currentJson -Description 'current.json pointer'

    Assert-ContainedPath -BasePath $fullBinDir -CandidatePath $Roots.cmdLauncher -AllowExact $false -Message 'cmdLauncher escapes bin directory'
    Assert-NoReparseAncestor -Path $Roots.cmdLauncher -Description 'cmd launcher'

    Assert-ContainedPath -BasePath $fullBinDir -CandidatePath $Roots.jsLauncher -AllowExact $false -Message 'jsLauncher escapes bin directory'
    Assert-NoReparseAncestor -Path $Roots.jsLauncher -Description 'js launcher'

    Assert-ContainedPath -BasePath $fullStateRoot -CandidatePath $Roots.ownedPath -AllowExact $false -Message 'ownedPath escapes state root'
    Assert-NoReparseAncestor -Path $Roots.ownedPath -Description 'installer-owned metadata'

    $versionDirName = [System.IO.Path]::GetFileName($TargetVersionDir)

    # 1. Atomic current.json pointer update
    $pointer = @{
        schema          = $SCHEMA_POINTER
        version_dir     = $versionDirName
        package_version = $Version
        archive_sha256  = $ArchiveSha
        generation      = [int]($versionDirName.Split('-')[-1])
    }
    $pointerJson = ConvertTo-CanonicalJson -InputObject $pointer
    $tmpPointer = [System.IO.Path]::Combine($fullDataRoot, "current.json.tmp-$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$([System.Guid]::NewGuid().ToString('N'))")
    $pointerBytes = [System.Text.Encoding]::UTF8.GetBytes("$pointerJson`n")
    $fsPointer = [System.IO.FileStream]::new(
        $tmpPointer,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )
    try {
        $fsPointer.Write($pointerBytes, 0, $pointerBytes.Length)
        $fsPointer.Flush($true)
    } finally {
        $fsPointer.Dispose()
    }

    Assert-NoReparseAncestor -Path $Roots.currentJson -Description 'current.json pointer destination'
    Replace-FileAtomic -SourcePath $tmpPointer -DestinationPath $Roots.currentJson
    Assert-NoReparseAncestor -Path $Roots.currentJson -Description 'current.json pointer after replacement'

    # 2. Stable cmd launcher: bin\evcrate.cmd
    $cmdContent = "@ECHO OFF`r`nSETLOCAL`r`nnode `"%~dp0launcher.cjs`" %*`r`nEXIT /B %ERRORLEVEL%`r`n"
    [System.IO.File]::WriteAllText($Roots.cmdLauncher, $cmdContent, [System.Text.Encoding]::ASCII)
    Assert-NoReparseAncestor -Path $Roots.cmdLauncher -Description 'cmd launcher after write'
    # 3. Stable Node.js launcher: bin\launcher.cjs
    $escapedDataRoot = $Roots.dataRoot.Replace('\', '\\').Replace("'", "\'")
    $launcherJsTemplate = @'
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function main() {
  let installRoot = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(installRoot, 'current.json'))) {
    installRoot = path.resolve('__CONFIGURED_DATA_ROOT__');
  }
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
    $launcherJs = $launcherJsTemplate.Replace('__CONFIGURED_DATA_ROOT__', $escapedDataRoot)
    [System.IO.File]::WriteAllText($Roots.jsLauncher, $launcherJs, $UTF8_NO_BOM)
    Assert-NoReparseAncestor -Path $Roots.jsLauncher -Description 'js launcher after write'

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
    [System.IO.File]::WriteAllText($Roots.ownedPath, "$ownedJson`n", $UTF8_NO_BOM)
    Assert-NoReparseAncestor -Path $Roots.ownedPath -Description 'installer-owned metadata after write'
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

        $normBin = [System.IO.Path]::GetFullPath($BinDir).TrimEnd('\', '/')
        foreach ($entry in $entries) {
            $normEntry = $entry.Trim().TrimEnd('\', '/')
            if ([string]::Equals($normEntry, $normBin, [System.StringComparison]::OrdinalIgnoreCase)) {
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
    if ([string]::IsNullOrEmpty($BinDir)) { return }
    $normBin = [System.IO.Path]::GetFullPath($BinDir).TrimEnd('\', '/')

    $removed = $false
    try {
        $userPath = [System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)
        if ($null -ne $userPath -and $userPath -ne '') {
            $entries = $userPath.Split(';')
            $kept = [System.Collections.Generic.List[string]]::new()
            foreach ($entry in $entries) {
                if ([string]::IsNullOrWhiteSpace($entry)) { continue }
                $trimmed = $entry.Trim()
                $normEntry = $trimmed.TrimEnd('\', '/')
                if ([string]::Equals($normEntry, $normBin, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $removed = $true
                } else {
                    $kept.Add($entry)
                }
            }

            if ($removed) {
                $newPath = if ($kept.Count -eq 0) { '' } else { [string]::Join(';', $kept) }
                [System.Environment]::SetEnvironmentVariable('PATH', $newPath, [System.EnvironmentVariableTarget]::User)
            }
        }
    } catch {}

    # Verify absence by re-reading user PATH
    try {
        $verifyPath = [System.Environment]::GetEnvironmentVariable('PATH', [System.EnvironmentVariableTarget]::User)
        if ($null -ne $verifyPath -and $verifyPath -ne '') {
            $verifyEntries = $verifyPath.Split(';')
            foreach ($v in $verifyEntries) {
                if ([string]::IsNullOrWhiteSpace($v)) { continue }
                $normV = $v.Trim().TrimEnd('\', '/')
                if ([string]::Equals($normV, $normBin, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw [System.InvalidOperationException]::new("Failed to remove '$BinDir' from user PATH in registry/environment")
                }
            }
        }
    } catch [System.InvalidOperationException] {
        throw
    } catch {}

    return
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
        $packageStageRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($StageDir, 'package'))
        New-SafeDirectory -DirPath $packageStageRoot -Description 'package stage root'

        foreach ($entry in $zip.Entries) {
            $relPath = $entry.FullName.Replace('\', '/').Substring('package/'.Length)
            $destSubPath = $relPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $destFullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($packageStageRoot, $destSubPath))

            # Strict containment check
            Assert-ContainedPath -BasePath $packageStageRoot -CandidatePath $destFullPath -AllowExact $false -Message 'Extraction path escapes stage root'

            $destDir = [System.IO.Path]::GetDirectoryName($destFullPath)
            New-SafeDirectory -DirPath $destDir -Description 'extraction subdirectory'
            Assert-NoReparseAncestor -Path $destFullPath -Description 'extracted file destination'
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

            $records.Add(@{
                path   = $relPath
                size   = $fi.Length
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
            $fullEntry = [System.IO.Path]::GetFullPath($entry)
            Assert-ContainedPath -BasePath $Roots.versionsDir -CandidatePath $fullEntry -AllowExact $false -Message 'Prune entry escapes versions directory'
            Assert-NoReparseAncestor -Path $fullEntry -Description 'prune entry'
            try { [System.IO.Directory]::Delete($fullEntry, $true) } catch {}
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
    New-SafeDirectory -DirPath $Roots.stagingDir -Description 'staging root'
    $stageDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Roots.stagingDir, "stage-$([System.Diagnostics.Process]::GetCurrentProcess().Id)-$([System.Guid]::NewGuid().ToString('N'))"))
    Assert-ContainedPath -BasePath $Roots.stagingDir -CandidatePath $stageDir -AllowExact $false -Message 'Stage directory escapes staging root'
    New-SafeDirectory -DirPath $stageDir -Description 'stage directory'
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

    # Verify controller closure
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
    New-SafeDirectory -DirPath $Roots.versionsDir -Description 'versions root'
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
    $targetVersionDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Roots.versionsDir, $newSnapshotId))
    Assert-ContainedPath -BasePath $Roots.versionsDir -CandidatePath $targetVersionDir -AllowExact $false -Message 'Target version directory escapes versions directory'

    # 10. Write snapshot receipt
    $immutableFiles = @{}
    foreach ($r in $extractedRecords) {
        $immutableFiles[$r.path] = @{
            size   = $r.size
            sha256 = $r.sha256
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
    [System.IO.File]::WriteAllText([System.IO.Path]::Combine($stageDir, 'installer-receipt.json'), "$receiptJson`n", $UTF8_NO_BOM)

    # 11. Promote stage to versions directory
    Assert-NoReparseAncestor -Path $stageDir -Description 'stage directory before promotion'
    Assert-NoReparseAncestor -Path $targetVersionDir -Description 'target version directory before promotion'
    [System.IO.Directory]::Move($stageDir, $targetVersionDir)
    Assert-NoReparseAncestor -Path $targetVersionDir -Description 'target version directory after promotion'
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

    if ([string]::IsNullOrWhiteSpace($TargetSnapshotId)) {
        $availList = $available -join ', '
        throw [System.ArgumentException]::new("Rollback requires an explicit snapshot identifier. Available: [$availList]")
    }

    # Strict snapshot grammar and safety validation; reject any directory separators or path traversal
    if ($TargetSnapshotId.Contains('/') -or $TargetSnapshotId.Contains('\')) {
        throw [System.ArgumentException]::new("Snapshot identifier must not contain path separators: $TargetSnapshotId")
    }

    try {
        [void](Test-InventoryPathSafety -RelativePath $TargetSnapshotId)
    } catch {
        throw [System.ArgumentException]::new("Invalid snapshot identifier '$TargetSnapshotId': $($_.Exception.Message)")
    }

    if (-not ($TargetSnapshotId -match '^[0-9A-Za-z._-]+$')) {
        throw [System.ArgumentException]::new("Snapshot identifier does not match grammar '^[0-9A-Za-z._-]+$': $TargetSnapshotId")
    }

    $targetId = $TargetSnapshotId
    $targetDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Roots.versionsDir, $targetId))
    Assert-ContainedPath -BasePath $Roots.versionsDir -CandidatePath $targetDir -AllowExact $false -Message 'Rollback target escapes versions directory'
    Assert-NoReparseAncestor -Path $targetDir -Description 'rollback target'

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

    if ($null -eq $receipt.immutable_files) {
        throw [System.InvalidOperationException]::new("Snapshot receipt missing immutable_files table in: $receiptPath")
    }

    # Validate immutable files against receipt
    $packageDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($targetDir, 'package'))
    Assert-ContainedPath -BasePath $targetDir -CandidatePath $packageDir -AllowExact $false -Message 'Package directory escapes rollback target'
    Assert-NoReparseAncestor -Path $packageDir -Description 'package directory'

    $props = if ($receipt.immutable_files -is [PSCustomObject]) {
        $receipt.immutable_files.PSObject.Properties
    } else {
        $receipt.immutable_files.GetEnumerator()
    }

    foreach ($prop in $props) {
        $relPath = if ($prop -is [System.Collections.DictionaryEntry]) { $prop.Key } else { $prop.Name }
        $meta = if ($prop -is [System.Collections.DictionaryEntry]) { $prop.Value } else { $prop.Value }

        # Validate receipt key safety FIRST before anything else!
        try {
            [void](Test-InventoryPathSafety -RelativePath $relPath)
        } catch {
            throw [System.InvalidOperationException]::new("Receipt contains invalid or hostile immutable_files key '$relPath': $($_.Exception.Message)")
        }

        if ($null -eq $meta -or $null -eq $meta.size -or $null -eq $meta.sha256) {
            throw [System.InvalidOperationException]::new("Malformed receipt metadata for file '$relPath'")
        }

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

        $subPath = $relPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($packageDir, $subPath))
        Assert-ContainedPath -BasePath $packageDir -CandidatePath $fullPath -AllowExact $false -Message 'Immutable file escapes package directory'
        Assert-NoReparseAncestor -Path $fullPath -Description 'rollback file'

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

function Remove-EmptyDirectoryTree {
    param([string]$DirPath)
    if (-not [System.IO.Directory]::Exists($DirPath)) { return }
    Assert-NoReparseAncestor -Path $DirPath -Description 'directory cleanup'

    try {
        $subDirs = [System.IO.Directory]::GetDirectories($DirPath)
        foreach ($sd in $subDirs) {
            Remove-EmptyDirectoryTree -DirPath $sd
        }

        $entries = [System.IO.Directory]::GetFileSystemEntries($DirPath)
        if ($entries.Length -eq 0) {
            [System.IO.Directory]::Delete($DirPath, $false)
        }
    } catch {}
}

function Perform-Uninstall {
    param(
        $Roots,
        $LockHandle
    )
    if (Test-AlreadyUninstalled -Roots $Roots) {
        return @{ action = 'already_uninstalled'; survivors = @() }
    }

    # 1. Remove User PATH entry
    [void](Remove-UserPathEntry -BinDir $Roots.binDir)

    $ownedFiles = [System.Collections.Generic.List[string]]::new()

    # 2. Launchers
    if ([System.IO.File]::Exists($Roots.cmdLauncher)) {
        $ownedFiles.Add($Roots.cmdLauncher)
    }
    if ([System.IO.File]::Exists($Roots.jsLauncher)) {
        $ownedFiles.Add($Roots.jsLauncher)
    }

    # 3. Pointers and state files
    if ([System.IO.File]::Exists($Roots.currentJson)) {
        $ownedFiles.Add($Roots.currentJson)
    }
    if ([System.IO.File]::Exists($Roots.ownedPath)) {
        $ownedFiles.Add($Roots.ownedPath)
    }
    if ([System.IO.File]::Exists($Roots.journalPath)) {
        $ownedFiles.Add($Roots.journalPath)
    }

    # Collect stale lock files or journal temp files in state root
    if ([System.IO.Directory]::Exists($Roots.stateRoot)) {
        try {
            $stateFiles = [System.IO.Directory]::GetFiles($Roots.stateRoot)
            foreach ($sf in $stateFiles) {
                $sfName = [System.IO.Path]::GetFileName($sf)
                if ($sfName.StartsWith('install.lock.stale-') -or
                    $sfName.StartsWith('install-journal.tmp-')) {
                    $ownedFiles.Add($sf)
                }
            }
        } catch {}
    }

    # Collect current pointer temp files in data root
    if ([System.IO.Directory]::Exists($Roots.dataRoot)) {
        try {
            $dataFiles = [System.IO.Directory]::GetFiles($Roots.dataRoot)
            foreach ($df in $dataFiles) {
                $dfName = [System.IO.Path]::GetFileName($df)
                if ($dfName.StartsWith('current.json.tmp-')) {
                    $ownedFiles.Add($df)
                }
            }
        } catch {}
    }

    # 4. Snapshot versions receipts and immutable files
    if ([System.IO.Directory]::Exists($Roots.versionsDir)) {
        $snapDirs = [System.IO.Directory]::GetDirectories($Roots.versionsDir)
        foreach ($sDir in $snapDirs) {
            $rcptFile = [System.IO.Path]::Combine($sDir, 'installer-receipt.json')
            if ([System.IO.File]::Exists($rcptFile)) {
                $ownedFiles.Add($rcptFile)
                $rcpt = Parse-JsonFile -FilePath $rcptFile
                if ($rcpt -and $rcpt.immutable_files) {
                    $props = if ($rcpt.immutable_files -is [PSCustomObject]) {
                        $rcpt.immutable_files.PSObject.Properties
                    } else {
                        $rcpt.immutable_files.GetEnumerator()
                    }
                    $pkgDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($sDir, 'package'))
                    Assert-ContainedPath -BasePath $sDir -CandidatePath $pkgDir -AllowExact $false -Message 'Package directory escapes snapshot directory'
                    foreach ($p in $props) {
                        $k = if ($p -is [System.Collections.DictionaryEntry]) { $p.Key } else { $p.Name }
                        try {
                            [void](Test-InventoryPathSafety -RelativePath $k)
                        } catch {
                            throw [System.InvalidOperationException]::new("Receipt in '$sDir' contains invalid immutable_files key '$k': $($_.Exception.Message)")
                        }
                        $sub = $k.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                        $fPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($pkgDir, $sub))
                        Assert-ContainedPath -BasePath $pkgDir -CandidatePath $fPath -AllowExact $false -Message "Owned file path '$k' escapes package directory"
                        Assert-NoReparseAncestor -Path $fPath -Description 'owned file candidate'
                        if ([System.IO.File]::Exists($fPath)) {
                            $ownedFiles.Add($fPath)
                        }
                    }
                }
            }
        }
    }

    # 5. Staging files
    if ([System.IO.Directory]::Exists($Roots.stagingDir)) {
        try {
            $stageDirs = [System.IO.Directory]::GetDirectories($Roots.stagingDir)
            foreach ($stg in $stageDirs) {
                $stgFiles = [System.IO.Directory]::GetFiles($stg, '*', [System.IO.SearchOption]::AllDirectories)
                foreach ($sf in $stgFiles) {
                    $ownedFiles.Add($sf)
                }
            }
        } catch {}
    }

    # Delete owned files and collect survivors
    $survivors = [System.Collections.Generic.List[object]]::new()
    foreach ($filePath in $ownedFiles) {
        if ([System.IO.File]::Exists($filePath)) {
            try {
                Assert-NoReparseAncestor -Path $filePath -Description 'owned file'
                [System.IO.File]::Delete($filePath)
            } catch {
                $errCategory = $_.Exception.GetType().Name
                $survivors.Add(@{
                    path  = $filePath
                    error = $errCategory
                })
            }
        }
    }

    # Bottom-up empty directory removal
    if ([System.IO.Directory]::Exists($Roots.stagingDir)) {
        Remove-EmptyDirectoryTree -DirPath $Roots.stagingDir
    }
    if ([System.IO.Directory]::Exists($Roots.versionsDir)) {
        Remove-EmptyDirectoryTree -DirPath $Roots.versionsDir
    }

    # If any file survived, do NOT remove roots; report survivors
    if ($survivors.Count -gt 0) {
        return @{
            action    = 'partial'
            survivors = $survivors
        }
    }

    # Dispose delete-on-close lock before removing state root so install.lock disappears atomically
    if ($null -ne $LockHandle) {
        Release-InstallLock -LockHandle $LockHandle
    }

    # Non-recursively remove empty state, bin, and data roots
    if ([System.IO.Directory]::Exists($Roots.stateRoot)) {
        try {
            $sEntries = [System.IO.Directory]::GetFileSystemEntries($Roots.stateRoot)
            if ($sEntries.Length -eq 0) {
                [System.IO.Directory]::Delete($Roots.stateRoot, $false)
            }
        } catch {}
    }
    if ([System.IO.Directory]::Exists($Roots.binDir)) {
        try {
            $bEntries = [System.IO.Directory]::GetFileSystemEntries($Roots.binDir)
            if ($bEntries.Length -eq 0) {
                [System.IO.Directory]::Delete($Roots.binDir, $false)
            }
        } catch {}
    }
    if ([System.IO.Directory]::Exists($Roots.dataRoot)) {
        try {
            $dEntries = [System.IO.Directory]::GetFileSystemEntries($Roots.dataRoot)
            if ($dEntries.Length -eq 0) {
                [System.IO.Directory]::Delete($Roots.dataRoot, $false)
            }
        } catch {}
    }

    # Final verification: check if any owned file still exists
    $remainingOwned = [System.Collections.Generic.List[object]]::new()
    foreach ($filePath in $ownedFiles) {
        if ([System.IO.File]::Exists($filePath)) {
            $remainingOwned.Add(@{
                path  = $filePath
                error = 'FileStillExists'
            })
        }
    }

    if ($remainingOwned.Count -gt 0) {
        return @{
            action    = 'partial'
            survivors = $remainingOwned
        }
    }

    return @{
        action    = 'uninstalled'
        survivors = @()
    }
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
    param([string[]]$ScriptArgs)
    $parsed = Parse-Args -RawArgs $ScriptArgs

    if ($parsed.subcommand -eq 'help') {
        Show-Help
        return 0
    }

    # For uninstall: check if already uninstalled first before creating any roots or locks
    if ($parsed.subcommand -eq 'uninstall') {
        $roots = Resolve-InstallRoots -Options $parsed.options -EnsureDirectories $false
        if (Test-AlreadyUninstalled -Roots $roots) {
            Write-Output "$([char]0x2713) Already uninstalled EVCrate CLI."
            return 0
        }

        $lock = Acquire-InstallLock -Roots $roots
        try {
            Recover-InstallJournal -Roots $roots
            $uninstResult = Perform-Uninstall -Roots $roots -LockHandle $lock
            if ($uninstResult.action -eq 'already_uninstalled') {
                Write-Output "$([char]0x2713) Already uninstalled EVCrate CLI."
                return 0
            }
            if ($uninstResult.survivors.Count -gt 0 -or $uninstResult.action -eq 'partial') {
                $lines = [System.Collections.Generic.List[string]]::new()
                $lines.Add("Uninstall incomplete: $($uninstResult.survivors.Count) file(s) could not be removed due to sharing violations or access restrictions.")
                foreach ($s in $uninstResult.survivors) {
                    $lines.Add("  Survivor: $($s.path) ($($s.error))")
                }
                throw [System.InvalidOperationException]::new(($lines -join "`n"))
            }
            Write-Output "$([char]0x2713) Successfully uninstalled EVCrate CLI."
            return 0
        } finally {
            Release-InstallLock -LockHandle $lock
        }
    }

    # For rollback, install, repair: ensure directories exist
    $roots = Resolve-InstallRoots -Options $parsed.options -EnsureDirectories $true
    $lock = Acquire-InstallLock -Roots $roots

    try {
        Recover-InstallJournal -Roots $roots

        if ($parsed.subcommand -eq 'rollback') {
            # Rollback does not require Node.js
            $rbResult = Perform-Rollback -Roots $roots -TargetSnapshotId $parsed.targetSnapshot
            Write-Output "$([char]0x2713) Rolled back to snapshot: $($rbResult.snapshotId) (v$($rbResult.version))"
            if ($rbResult.backupSnapshot) {
                Write-Output "  Displaced snapshot preserved at: $($rbResult.backupSnapshot)"
            }
            return 0
        }

        # install / repair: requires Node.js >= 22.19.0
        $nodePath = Assert-NodeFloor

        $scriptPath = $null
        if (Test-Path Variable:\PSCommandPath) {
            $scriptPath = $PSCommandPath
        }
        if ([string]::IsNullOrEmpty($scriptPath) -and (Test-Path Variable:\PSScriptRoot)) {
            $scriptPath = [System.IO.Path]::Combine($PSScriptRoot, 'install.ps1')
        }
        if ([string]::IsNullOrEmpty($scriptPath)) {
            $scriptPath = [System.IO.Path]::Combine((Get-Location).Path, 'install.ps1')
        }

        $assets = Resolve-ReleaseAssets -ScriptPath $scriptPath -Options $parsed.options
        $isRepair = $parsed.subcommand -eq 'repair'
        $result = Perform-Install -Roots $roots -Assets $assets -Options $parsed.options -IsRepair $isRepair -NodePath $nodePath

        if ($result.action -eq 'idempotent') {
            Write-Output "$([char]0x2713) EVCrate v$($result.version) is already installed at snapshot $($result.snapshotId)."
            return 0
        }

        Write-Output "$([char]0x2713) Successfully $($result.action) EVCrate v$($result.version)"
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

        Write-Output "`nNext steps to verify installation:"
        Write-Output '  evcrate version --json'

        return 0
    } finally {
        Release-InstallLock -LockHandle $lock
    }
}

try {
    $exitCode = Main -ScriptArgs $args
    exit $exitCode
} catch {
    Write-Error "Installation error: $($_.Exception.Message)"
    exit 1
}

<#
.SYNOPSIS
    Fetches issues using the authenticated SonarQube CLI session.
.PARAMETER ProjectKey
    SonarQube project key.
.PARAMETER Branch
    Optional branch name.
.PARAMETER Statuses
    Comma-separated issue statuses.
.PARAMETER Severities
    Optional comma-separated severities.
.PARAMETER Format
    Output format: toon, json, or table.
.PARAMETER OutputFile
    Optional report path.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectKey,
    [string]$Branch = "",
    [string]$Statuses = "OPEN,CONFIRMED",
    [string]$Severities = "",
    [ValidateSet("toon", "json", "table")]
    [string]$Format = "toon",
    [string]$OutputFile = ""
)

if (-not (Get-Command sonar -ErrorAction SilentlyContinue)) {
    Write-Error "SonarQube CLI ('sonar') is not available. Install/configure it, then authenticate with 'sonar auth login'."
    exit 1
}

$arguments = @("list", "issues", "-p", $ProjectKey, "--format", $Format)
if ($Branch) { $arguments += @("--branch", $Branch) }
if ($Statuses) { $arguments += @("--statuses", $Statuses) }
if ($Severities) { $arguments += @("--severities", $Severities) }

$output = & sonar @arguments
if ($LASTEXITCODE -ne 0) {
    Write-Error "Sonar CLI failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

if ($OutputFile) {
    $output | Set-Content -Path $OutputFile -Encoding utf8
    Write-Host "Issues written to $OutputFile"
} else {
    $output | Out-String | Write-Output
}
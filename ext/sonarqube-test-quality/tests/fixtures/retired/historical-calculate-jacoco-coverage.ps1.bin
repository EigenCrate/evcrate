<#
.SYNOPSIS
    Calculates line, branch, and combined coverage from a JaCoCo XML report.
.PARAMETER ReportPath
    Path to jacoco.xml (default: target/site/jacoco/jacoco.xml).
.PARAMETER Threshold
    Strict combined-coverage threshold (default: 95.0).
.PARAMETER IncludePattern
    Optional regex matching JaCoCo class names to include.
#>
[CmdletBinding()]
param(
    [string]$ReportPath = "target/site/jacoco/jacoco.xml",
    [double]$Threshold = 95.0,
    [string]$IncludePattern = ""
)

if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
    Write-Error "JaCoCo report not found at '$ReportPath'. Run the clean test suite first."
    exit 1
}

try {
    [xml]$xml = Get-Content -LiteralPath $ReportPath -Raw
} catch {
    Write-Error "JaCoCo report is not valid XML."
    exit 1
}

$linesMissed = 0
$linesCovered = 0
$branchesMissed = 0
$branchesCovered = 0
$classesEvaluated = 0

foreach ($class in $xml.SelectNodes("//class")) {
    if ($IncludePattern -and $class.name -notmatch $IncludePattern) { continue }

    $classesEvaluated++
    $lineCounter = $class.SelectSingleNode("counter[@type='LINE']")
    $branchCounter = $class.SelectSingleNode("counter[@type='BRANCH']")
    if ($lineCounter) {
        $linesMissed += [int]$lineCounter.missed
        $linesCovered += [int]$lineCounter.covered
    }
    if ($branchCounter) {
        $branchesMissed += [int]$branchCounter.missed
        $branchesCovered += [int]$branchCounter.covered
    }
}

$linesTotal = $linesMissed + $linesCovered
$branchesTotal = $branchesMissed + $branchesCovered
$combinedTotal = $linesTotal + $branchesTotal
if ($classesEvaluated -eq 0 -or $combinedTotal -eq 0) {
    Write-Error "No covered classes or line/branch counters matched the requested scope."
    exit 2
}

$linePercent = 100.0 * $linesCovered / $linesTotal
$branchPercent = if ($branchesTotal -gt 0) { 100.0 * $branchesCovered / $branchesTotal } else { 0.0 }
$combinedPercent = 100.0 * ($linesCovered + $branchesCovered) / $combinedTotal

Write-Output ("Classes evaluated : {0}" -f $classesEvaluated)
Write-Output ("Line coverage     : {0}/{1} ({2:N2}%)" -f $linesCovered, $linesTotal, $linePercent)
Write-Output ("Branch coverage   : {0}/{1} ({2:N2}%)" -f $branchesCovered, $branchesTotal, $branchPercent)
Write-Output ("Combined coverage : {0}/{1} ({2:N4}%)" -f ($linesCovered + $branchesCovered), $combinedTotal, $combinedPercent)
Write-Output ("Required          : > {0}%" -f $Threshold)

if ($combinedPercent -gt $Threshold) {
    Write-Output "RESULT            : PASSED"
    exit 0
}

Write-Output "RESULT            : FAILED"
exit 2
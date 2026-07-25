[CmdletBinding()]
param(
    [string]$Database = (Join-Path $PSScriptRoot "cartograph.db"),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "exports")
)

$resolvedDatabase = Resolve-Path -LiteralPath $Database -ErrorAction SilentlyContinue
if (-not $resolvedDatabase) {
    Write-Error "Database not found: $Database"
    exit 1
}

$resolvedOutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath(
    $OutputDirectory
)
$pythonArguments = @(
    "-m",
    "backend.tools.export_csv",
    "--database",
    $resolvedDatabase.ProviderPath,
    "--output",
    $resolvedOutputDirectory
)
$virtualEnvironmentPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

Push-Location $PSScriptRoot
try {
    if (Test-Path -LiteralPath $virtualEnvironmentPython -PathType Leaf) {
        & $virtualEnvironmentPython @pythonArguments
    }
    elseif (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 @pythonArguments
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python @pythonArguments
    }
    else {
        Write-Error "Python 3 was not found. Install Python or create .venv in the project root."
        exit 1
    }
    $exportExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exportExitCode
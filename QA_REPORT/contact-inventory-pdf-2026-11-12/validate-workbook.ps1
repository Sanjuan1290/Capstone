param([string]$Workbook = 'inventory-corrected.xlsx')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sdkPath = Join-Path $PSScriptRoot 'validation-deps/DocumentFormat.OpenXml.dll'
if (-not (Test-Path -LiteralPath $sdkPath)) {
  $package = [IO.Compression.ZipFile]::OpenRead((Join-Path $PSScriptRoot 'validation-deps/openxml.nupkg'))
  try {
    $entry = $package.GetEntry('lib/net46/DocumentFormat.OpenXml.dll')
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $sdkPath, $true)
  } finally { $package.Dispose() }
}
Add-Type -Path $sdkPath
$workbookPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot $Workbook)).Path
$document = [DocumentFormat.OpenXml.Packaging.SpreadsheetDocument]::Open($workbookPath, $false)
try {
  $validator = New-Object DocumentFormat.OpenXml.Validation.OpenXmlValidator
  $issues = @($validator.Validate($document))
  $result = [ordered]@{
    workbook = $Workbook
    validation_errors = $issues.Count
    errors = @($issues | Select-Object -First 12 | ForEach-Object {
      [ordered]@{ description = $_.Description; part = $_.Part.Uri.ToString(); path = $_.Path.XPath }
    })
  }
  $result | ConvertTo-Json -Depth 5
  if ($issues.Count -gt 0) { exit 1 }
} finally { $document.Dispose() }

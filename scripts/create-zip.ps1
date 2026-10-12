Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Get-Location
$zipPath = Join-Path $root 'frontend-dist.zip'
$distDir = (Get-Item 'frontend/dist').FullName

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

Get-ChildItem -Path $distDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($distDir.Length + 1).Replace('\', '/')
    Write-Host "Adding: $rel"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
}

$archive.Dispose()
Write-Host "Done. Entries in zip:"
$read = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$read.Entries | Select-Object -Property FullName | Format-Table
$read.Dispose()

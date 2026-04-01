param(
  [int]$Port = 3030,
  [string]$OutputFile = "tv.log"
)
 
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $ScriptDir $OutputFile
$Listener = [System.Net.HttpListener]::new()
$Prefix = "http://*:$Port/"
$Listener.Prefixes.Add($Prefix)
$Listener.Start()

Write-Host "Log receiver listening on $Prefix"
Write-Host "POST JSON to /tv-log ; writing to $LogPath"
Write-Host "Press Ctrl+C to stop."

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Request = $Context.Request
    $Response = $Context.Response

    if ($Request.HttpMethod -eq 'POST' -and $Request.Url.AbsolutePath -eq '/tv-log') {
      $Reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
      $Body = $Reader.ReadToEnd()
      $Reader.Close()

      Add-Content -Path $LogPath -Value $Body
      $Response.StatusCode = 204
    } else {
      $Response.StatusCode = 404
      $Payload = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
      $Response.OutputStream.Write($Payload, 0, $Payload.Length)
    }

    $Response.Close()
  }
}
finally {
  $Listener.Stop()
  $Listener.Close()
}

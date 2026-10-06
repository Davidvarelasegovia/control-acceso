# Provoca una caida larga de la API para ver el ciclo completo
# (la pantalla se pone roja y luego vuelve sola).
#   powershell -ExecutionPolicy Bypass -File scripts/probar-caida-larga.ps1

$segundos = 25
Write-Output "Mato la API y la mantengo caida ~$segundos segundos, sin dejar que levante antes de tiempo.`n"

$fin = (Get-Date).AddSeconds($segundos)
$n = 0
while ((Get-Date) -lt $fin) {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'server[\\/]index\.js' } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $script:n++
    }
  Start-Sleep -Milliseconds 700
}

Write-Output "procesos matados: $n"
Start-Sleep -Seconds 8

$r = try { (Invoke-RestMethod 'http://localhost:3001/api/estado' -TimeoutSec 5).data } catch { $null }
if ($r) {
  Write-Output "API estable de nuevo: servicio #$($r.servicio.id) $($r.servicio.nombre) | contadores $($r.estadisticas | ConvertTo-Json -Compress)"
} else {
  Write-Output 'La API NO se levanto'
}
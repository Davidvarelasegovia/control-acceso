# Mates el proceso de la API (server/index.js) y comprueba que se levanta sola.
#   powershell -File scripts/probar-reinicio.ps1

function Get-Api {
  # Ojo: en Windows la linea de comandos usa backslash, no slash.
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'server[\\/]index\.js' }
}

function Test-Api {
  try { return (Invoke-RestMethod 'http://localhost:3001/api/estado' -TimeoutSec 4).data }
  catch { return $null }
}

$antes = Get-Api
if (-not $antes) { Write-Output 'La API no esta corriendo. Levanta el servidor primero.'; exit 1 }

Write-Output "1) API arriba  pid=$($antes.ProcessId)"
$estado = Test-Api
Write-Output "   servicio: $($estado.servicio.nombre) #$($estado.servicio.id) | contadores: $($estado.estadisticas | ConvertTo-Json -Compress)"
Write-Output ''

Write-Output '2) MATO la API a proposito...'
$antes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output "   pid $($_.ProcessId) terminado" }

Start-Sleep -Seconds 3
if (Test-Api) { Write-Output '   ??? la API respondio igual' }
else { Write-Output '   API caida (como se esperaba)' }
Write-Output ''

Write-Output '3) Espero el reinicio automatico...'
$ok = $null
for ($i = 1; $i -le 20; $i++) {
  Start-Sleep -Seconds 1
  $ok = Test-Api
  if ($ok) { Write-Output "   volvio a los $i segundo(s)"; break }
}

if ($ok) {
  $nuevo = Get-Api
  Write-Output "   API OK  pid=$($nuevo.ProcessId) (antes $($antes.ProcessId))"
  Write-Output "   servicio: $($ok.servicio.nombre) #$($ok.servicio.id)"
  Write-Output "   contadores: $($ok.estadisticas | ConvertTo-Json -Compress)"
  Write-Output "   personas: $($ok.personas)"
  Write-Output ''
  Write-Output 'RESULTADO: la API se levanta sola. OK'
} else {
  Write-Output '   NO se levanto en 20 segundos'
  Write-Output 'RESULTADO: FALLA'
}
# Cria as abas "Grupos <dd.mm>" e "Produtos <dd.mm>" na planilha da Black Friday
# da Probel, com concorrencia e "preco no ar hoje" vindos de concorrencia-semanal.mjs.
# As abas antigas ficam intactas (foto da semana anterior).
#
# Uso: powershell -File concorrencia-semanal.ps1 <entrada.xlsx> <saida.xlsx> <conc.json> <dd.mm novo> <dd/mm/aaaa> <dd.mm da semana anterior>
# (o .mjs tem de ter lido a aba "Grupos <dd.mm da semana anterior>"; ele grava <conc>.json e <conc>.precos.json)
param($entrada, $saida, $json, $rotulo, $dataLonga, $antiga)
$ErrorActionPreference = "Stop"
$dados = Get-Content $json -Raw | ConvertFrom-Json
$precos = Get-Content ($json.Substring(0, $json.Length - 5) + ".precos.json") -Raw | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($entrada)
  $prod = $wb.Worksheets.Item("Produtos $antiga")
  $grup = $wb.Worksheets.Item("Grupos $antiga")
  # semana nova na frente da antiga: Grupos novo, Produtos novo, Grupos antigo, Produtos antigo
  $primeira = $wb.Worksheets.Item([Math]::Min($prod.Index, $grup.Index))
  $grup.Copy($primeira); $novoG = $wb.Worksheets.Item($primeira.Index - 1)
  $novoG.Name = "Grupos $rotulo"
  $prod.Copy([Type]::Missing, $novoG); $novoP = $wb.Worksheets.Item($novoG.Index + 1)
  $novoP.Name = "Produtos $rotulo"
  # as copias ainda apontam para as abas antigas: religa uma na outra
  [void]$novoP.Cells.Replace("'Grupos $antiga'!", "'Grupos $rotulo'!", 2)
  [void]$novoG.Cells.Replace("'Produtos $antiga'!", "'Produtos $rotulo'!", 2)
  # A1 sem o carimbo da semana anterior (o sufixo e colocado de novo abaixo)
  foreach ($ws in @($novoP, $novoG)) { $t = [string]$ws.Range("A1").Value2; $i = $t.IndexOf(" " + [char]0xB7 + " concorr"); if ($i -ge 0) { $ws.Range("A1").Value2 = $t.Substring(0, $i) } }
  foreach ($d in $dados) {
    $c = $novoG.Cells.Item($d.linha, $d.coluna)
    if ($null -eq $d.min) { $c.ClearContents() | Out-Null; $c.Interior.Color = 13421823 }  # catalogo saiu do ar: vazio e vermelho claro
    else { $c.Value2 = [double]$d.min }
  }
  # Preco no ar hoje = coluna M de Produtos (numero fixo)
  foreach ($d in $precos) { if ($null -ne $d.novo) { $c = $novoP.Cells.Item($d.linha, 13); if (-not $c.HasFormula) { $c.Value2 = [double]$d.novo } } }
  # a aba de ficha ficou redundante: as abas da semana ja trazem concorrente, preco e link
  try { $wb.Worksheets.Item("Concorrentes (ficha)").Delete() } catch {}
  $ponto = [string][char]0xB7; $ee = [string][char]0xEA
  $novoG.Range("A1").Value2 = $novoG.Range("A1").Value2 + " $ponto concorr${ee}ncia e pre$([char]0xE7)o no ar lidos em $dataLonga"
  $novoP.Range("A1").Value2 = $novoP.Range("A1").Value2 + " $ponto concorr${ee}ncia e pre$([char]0xE7)o no ar lidos em $dataLonga"
  $xl.CalculateFull()
  foreach ($ws in @($novoP, $novoG)) {
    try { $e = $ws.UsedRange.SpecialCells(-4123, 16); Write-Host "ERROS em $($ws.Name): $($e.Address())" } catch { Write-Host "sem erro de formula em $($ws.Name)" }
  }
  try { $wb.Worksheets.Item("Planilha1").Delete() } catch {}   # aba vazia
  $novoP.Activate()
  $wb.SaveAs($saida, 51)
  $wb.Close($false)
} finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }

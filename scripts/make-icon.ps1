Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$r = 220
$d = 2 * $r
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()

$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new(0, $size),
  [System.Drawing.Color]::FromArgb(255, 32, 27, 58),
  [System.Drawing.Color]::FromArgb(255, 9, 9, 16)
)
$g.FillPath($bg, $path)

$center = $size / 2
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse($center - 380, $center - 380, 760, 760)
$glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
$glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(120, 139, 125, 255)
$glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 139, 125, 255))
$g.FillPath($glowBrush, $glow)

$coreGlow = New-Object System.Drawing.Drawing2D.GraphicsPath
$coreGlow.AddEllipse($center - 230, $center - 230, 460, 460)
$coreBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($coreGlow)
$coreBrush.CenterColor = [System.Drawing.Color]::FromArgb(190, 180, 165, 255)
$coreBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 139, 125, 255))
$g.FillPath($coreBrush, $coreGlow)

$golden = [Math]::PI * (1 + [Math]::Sqrt(5))
$count = 170
$radius = 330
$spin = 0.45
$tilt = -0.35
$cosSpin = [Math]::Cos($spin)
$sinSpin = [Math]::Sin($spin)
$cosTilt = [Math]::Cos($tilt)
$sinTilt = [Math]::Sin($tilt)

for ($i = 0; $i -lt $count; $i++) {
  $k = $i + 0.5
  $phi = [Math]::Acos(1 - (2 * $k) / $count)
  $theta = $golden * $k
  $x = [Math]::Sin($phi) * [Math]::Cos($theta)
  $y = [Math]::Cos($phi)
  $z = [Math]::Sin($phi) * [Math]::Sin($theta)

  $rx = $x * $cosSpin - $z * $sinSpin
  $rz = $x * $sinSpin + $z * $cosSpin
  $ry = $y * $cosTilt - $rz * $sinTilt
  $rz2 = $y * $sinTilt + $rz * $cosTilt

  $perspective = 1 + $rz2 * 0.18
  $px = $center + $rx * $radius * $perspective
  $py = $center + $ry * $radius * $perspective
  $depth = ($rz2 + 1) / 2
  $dot = (5 + $depth * 12)
  $alpha = [int](40 + $depth * 200)

  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 216, 210, 255))
  $g.FillEllipse($brush, $px - $dot / 2, $py - $dot / 2, $dot, $dot)
  $brush.Dispose()
}

$g.Dispose()
$bmp.Save("$PSScriptRoot\icon-source.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "wrote $PSScriptRoot\icon-source.png"

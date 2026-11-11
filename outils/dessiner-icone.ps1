param([string]$OutDir)
# Dessine l'icône de la Galaxie (512 px) puis la décline en plusieurs tailles PNG.
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$S = 512
$bmp = New-Object System.Drawing.Bitmap $S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::Transparent)

function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, 2*$r, 2*$r, 180, 90); $p.AddArc($x+$w-2*$r, $y, 2*$r, 2*$r, 270, 90)
  $p.AddArc($x+$w-2*$r, $y+$h-2*$r, 2*$r, 2*$r, 0, 90); $p.AddArc($x, $y+$h-2*$r, 2*$r, 2*$r, 90, 90)
  $p.CloseFigure(); return $p
}
function Glow($cx, $cy, $r, $color, $alpha) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddEllipse([single]($cx-$r), [single]($cy-$r), [single](2*$r), [single](2*$r))
  $b = New-Object System.Drawing.Drawing2D.PathGradientBrush $p
  $b.CenterColor = [System.Drawing.Color]::FromArgb($alpha, $color)
  $b.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $color))
  $g.FillPath($b, $p); $b.Dispose(); $p.Dispose()
}

# Fond : carré arrondi, nuit profonde avec une lueur violette
$bg = RoundRect 16 16 480 480 112
$g.SetClip($bg)
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 7, 6, 18))), $bg)
Glow 210 230 330 ([System.Drawing.Color]::FromArgb(70, 50, 140)) 150
Glow 360 380 220 ([System.Drawing.Color]::FromArgb(120, 40, 110)) 70

# Petites étoiles
$rnd = New-Object System.Random 7
for ($i = 0; $i -lt 70; $i++) {
  $x = $rnd.Next(30, 482); $y = $rnd.Next(30, 482); $s = 1 + $rnd.NextDouble() * 2.4; $a = $rnd.Next(70, 220)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, 230, 232, 255))), [single]$x, [single]$y, [single]$s, [single]$s)
}

# Orbite inclinée
$state = $g.Save()
$g.TranslateTransform(256, 262); $g.RotateTransform(-18)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 255, 214, 140)), 5
$g.DrawEllipse($pen, -190, -72, 380, 144)
$pen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 214, 140)), 3
$g.DrawEllipse($pen2, -232, -98, 464, 196)
$g.Restore($state)

# Soleil
Glow 256 262 150 ([System.Drawing.Color]::FromArgb(255, 200, 110)) 120
Glow 256 262 78 ([System.Drawing.Color]::FromArgb(255, 226, 160)) 230
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 246, 226))), 222, 228, 68, 68)

# Planète sur l'orbite (devant), éclairée côté soleil
$px = 256 + [Math]::Cos(0.55) * 190 * [Math]::Cos(-18 * [Math]::PI / 180) - [Math]::Sin(0.55) * 72 * [Math]::Sin(-18 * [Math]::PI / 180)
$py = 262 + [Math]::Cos(0.55) * 190 * [Math]::Sin(-18 * [Math]::PI / 180) + [Math]::Sin(0.55) * 72 * [Math]::Cos(-18 * [Math]::PI / 180)
$pr = 34
$pp = New-Object System.Drawing.Drawing2D.GraphicsPath
$pp.AddEllipse([single]($px-$pr), [single]($py-$pr), [single](2*$pr), [single](2*$pr))
$pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $pp
$pb.CenterPoint = New-Object System.Drawing.PointF ([single]($px-14)), ([single]($py-14))
$pb.CenterColor = [System.Drawing.Color]::FromArgb(255, 150, 205, 235)
$pb.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 22, 48, 92))
$g.FillPath($pb, $pp)

# Petite lune
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 215, 216, 228))), [single]($px+40), [single]($py-46), 13, 13)

$g.ResetClip()
$g.Dispose()
$bmp.Save((Join-Path $OutDir 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)

foreach ($n in 256, 192, 48, 32, 16) {
  $o = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $og = [System.Drawing.Graphics]::FromImage($o)
  $og.InterpolationMode = 'HighQualityBicubic'; $og.SmoothingMode = 'AntiAlias'; $og.PixelOffsetMode = 'HighQuality'
  $og.DrawImage($bmp, 0, 0, $n, $n); $og.Dispose()
  $o.Save((Join-Path $OutDir "icon-$n.png"), [System.Drawing.Imaging.ImageFormat]::Png); $o.Dispose()
}
$bmp.Dispose()
Get-ChildItem $OutDir | Select-Object Name, Length | Format-Table -AutoSize

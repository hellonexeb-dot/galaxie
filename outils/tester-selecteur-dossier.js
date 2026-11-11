// Ouvre le sélecteur comme le serveur (programme caché), puis vérifie qu'une fenêtre de dialogue est VISIBLE.
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ps = eval(src.match(/const ps = ("\[Console\][\s\S]*?\$f\.Close\(\)");/)[1].replace(/'" \+ t \+ "'/, "'Test'"));
const child = execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: true }, () => {});
setTimeout(() => {
  const check = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class W { public delegate bool P(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n); }
"@
$n = 0
[W]::EnumWindows({ param($h,$l) $p=0; [void][W]::GetWindowThreadProcessId($h,[ref]$p); if ($p -eq ${child.pid}) { $sb=New-Object Text.StringBuilder 64; [void][W]::GetClassName($h,$sb,64); if ($sb.ToString() -eq '#32770' -and [W]::IsWindowVisible($h)) { $script:n++ } }; $true }, [IntPtr]::Zero) | Out-Null
"fenetres de dialogue visibles : $n"`;
  console.log(execFileSync('powershell.exe', ['-NoProfile', '-Command', check]).toString().trim());
  try { process.kill(child.pid); } catch {}
  execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}, 3500);

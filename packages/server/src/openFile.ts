import { spawn } from 'node:child_process';

// Windows lets only the foreground process bring a window to the front, and the daemon runs in the background,
// so the app would open behind the browser. The script opens the file, waits for a window with the file's name
// in its title and brings it forward; a synthetic Alt press first lifts the foreground lock for this process.
// The path comes in an environment variable, never in the script text.
const WINDOWS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$path = $env:AINSTORM_OPEN_FILE
Add-Type -Namespace Ainstorm -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'@
Start-Process -FilePath $path
$name = [System.IO.Path]::GetFileNameWithoutExtension($path)
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 150
  $window = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$name*" } | Select-Object -First 1
  if ($window) {
    $handle = $window.MainWindowHandle
    [Ainstorm.Win]::keybd_event(0x12, 0, 0, [System.UIntPtr]::Zero)
    [Ainstorm.Win]::keybd_event(0x12, 0, 2, [System.UIntPtr]::Zero)
    if ([Ainstorm.Win]::IsIconic($handle)) { [void][Ainstorm.Win]::ShowWindow($handle, 9) }
    [void][Ainstorm.Win]::SetForegroundWindow($handle)
    break
  }
}
`;
export const ENCODED_SCRIPT = Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64');

/**
 * Opens a file in the system's default application for its type (mdread for .md on the user's machine)
 * and, on Windows, brings its window to the front. The path goes as data, never through a shell command line.
 * Resolves when the opener is done (on Windows once the window is in front, or the script gave up looking for it).
 */
export function openWithDefaultApp(path: string): Promise<void> {
  const child = process.platform === 'win32'
    // -EncodedCommand (UTF-16LE base64): quotes in the script would not survive the Windows command line
    ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ENCODED_SCRIPT], {
      // Not detached: a detached PowerShell gets no console at all and quits without opening anything
      stdio: 'ignore', windowsHide: true, env: { ...process.env, AINSTORM_OPEN_FILE: path },
    })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [path], { detached: true, stdio: 'ignore' });
  // A missing opener must not crash the daemon nor keep the request waiting
  return new Promise(resolve => {
    child.on('error', () => resolve());
    child.on('exit', () => resolve());
  });
}

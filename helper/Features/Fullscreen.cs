using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;

namespace IslandHelper;

/// <summary>
/// Game mode detection. Once a second it asks Windows whether a full-screen app is in front (SHQueryUserNotificationState)
/// and whether the foreground window exactly covers its monitor, and emits
/// { type: "fullscreen", on, exe, title, d3d } when that changes. The same state is repeated every 10 s as a keep-alive,
/// so Island can tell "still fullscreen" from "the helper died while the island was hidden".
/// No stdin commands.
/// </summary>
internal sealed class Fullscreen : IHelperFeature
{
    public string Prefix => "fs";

    // SHQUERYUSERNOTIFICATIONSTATE
    private const int QUNS_BUSY = 2;
    private const int QUNS_RUNNING_D3D_FULL_SCREEN = 3;
    private const int QUNS_PRESENTATION_MODE = 4;

    private const uint MONITOR_DEFAULTTONULL = 0;
    private const uint MONITORINFOF_PRIMARY = 1;
    private const int GWL_STYLE = -16;
    private const int WS_CAPTION = 0x00C00000;   // WS_BORDER | WS_DLGFRAME
    private const int WS_MAXIMIZE = 0x01000000;
    private const int KeepAliveMs = 10_000;

    // Shell windows that can cover the whole monitor but are not a game or a video.
    private static readonly HashSet<string> ShellClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "MultitaskingViewFrame",
        "XamlExplorerHostIslandWindow", "ForegroundStaging", "Windows.UI.Core.CoreWindow"
    };
    private static readonly HashSet<string> ShellProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        "explorer", "SearchHost", "SearchApp", "StartMenuExperienceHost", "ShellExperienceHost", "LockApp", "TextInputHost"
    };
    // Island itself (packaged name, or the stock Electron binary in dev) and this helper.
    private static readonly HashSet<string> OwnProcesses = new(StringComparer.OrdinalIgnoreCase) { "Island", "electron", "IslandHelper" };

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out int pquns);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassNameW(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfoW(IntPtr hMonitor, ref MONITORINFO lpmi);

    private Timer? _timer;
    private int _busy;
    private string _lastKey = "";
    private long _lastEmitTick;

    public void Start() => _timer = new Timer(_ => Poll(), null, 500, 1000);

    private void Poll()
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return; // never overlap
        try
        {
            var (on, exe, title, d3d) = Detect();
            var key = $"{on}|{exe}|{d3d}";
            var now = Environment.TickCount64;
            var changed = key != _lastKey;
            if (!changed && now - _lastEmitTick < KeepAliveMs) return;
            if (changed) Program.Log($"fullscreen: on={on} exe={exe} d3d={d3d}"); // never the window title
            _lastKey = key;
            _lastEmitTick = now;
            Program.Emit(new JsonObject { ["type"] = "fullscreen", ["on"] = on, ["exe"] = exe, ["title"] = title, ["d3d"] = d3d });
        }
        catch (Exception e) { Program.Log($"fullscreen: {e.Message}"); }
        finally { Volatile.Write(ref _busy, 0); }
    }

    private static (bool On, string Exe, string Title, bool D3d) Detect()
    {
        var quns = 0;
        var hr = 1;
        try { hr = SHQueryUserNotificationState(out quns); } catch (Exception e) { Program.Log($"quns: {e.Message}"); }
        var d3d = hr == 0 && quns == QUNS_RUNNING_D3D_FULL_SCREEN;
        var shellSaysFullscreen = hr == 0 && (quns == QUNS_BUSY || quns == QUNS_RUNNING_D3D_FULL_SCREEN || quns == QUNS_PRESENTATION_MODE);

        var (fgFull, exe, title) = ForegroundInfo();
        // The foreground check alone also catches borderless games and F11 video that the shell does not flag.
        return (shellSaysFullscreen || fgFull, exe, title, d3d);
    }

    /// <summary>Is the foreground window (not the shell, not us) exactly covering its monitor? Plus its exe and title.</summary>
    private static (bool Full, string Exe, string Title) ForegroundInfo()
    {
        try
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return (false, "", "");

            var cls = new StringBuilder(256);
            GetClassNameW(hwnd, cls, cls.Capacity);
            if (ShellClasses.Contains(cls.ToString())) return (false, "", "");

            GetWindowThreadProcessId(hwnd, out var pid);
            var name = "";
            try { using var p = Process.GetProcessById((int)pid); name = p.ProcessName; } catch { }
            if (pid == (uint)Environment.ProcessId || OwnProcesses.Contains(name) || ShellProcesses.Contains(name)) return (false, "", "");

            var sb = new StringBuilder(256);
            GetWindowTextW(hwnd, sb, sb.Capacity);
            var title = sb.ToString();
            var exe = name.Length > 0 ? name + ".exe" : "";

            if (!GetWindowRect(hwnd, out var r)) return (false, exe, title);
            var mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
            if (mon == IntPtr.Zero) return (false, exe, title);
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (!GetMonitorInfoW(mon, ref mi)) return (false, exe, title);
            // Island lives on the primary monitor, so only that one matters.
            if ((mi.dwFlags & MONITORINFOF_PRIMARY) == 0) return (false, exe, title);

            var m = mi.rcMonitor;
            var exact = r.Left == m.Left && r.Top == m.Top && r.Right == m.Right && r.Bottom == m.Bottom;
            // A maximized normal window (title bar + maximize) can also end up exactly monitor-sized with an auto-hiding taskbar.
            var style = GetWindowLong(hwnd, GWL_STYLE);
            var maximizedNormal = (style & WS_MAXIMIZE) != 0 && (style & WS_CAPTION) == WS_CAPTION;
            return (exact && !maximizedNormal, exe, title);
        }
        catch (Exception e)
        {
            Program.Log($"foreground: {e.Message}");
            return (false, "", "");
        }
    }
}

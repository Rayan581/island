// IslandHelper: streams the Windows media session (Spotify, browsers, ...) and system volume to Island as JSON lines.
// stdin commands: toggle | next | prev | seek <seconds>. Exits when stdin closes (i.e. when Island quits).
// Every Windows call that can hang (Spotify sometimes never answers) is wrapped in a timeout, and everything is logged to
// %APPDATA%\Island\helper.log so a stuck control can be diagnosed.
using System.Globalization;
using System.Text;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace IslandHelper;

internal static class Util
{
    /// Awaits a task for at most `ms`; (false, default) when it did not finish in time.
    public static async Task<(bool Ok, T? Value)> Timed<T>(Task<T> task, int ms)
    {
        var done = await Task.WhenAny(task, Task.Delay(ms));
        if (done != task) return (false, default);
        return (true, await task);
    }
}

internal static class Program
{
    private static readonly object OutLock = new();
    private static readonly object LogLock = new();
    private static readonly string LogPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Island", "helper.log");
    private static Timer? _heartbeat;

    internal static void Emit(JsonObject o)
    {
        var s = o.ToJsonString();
        lock (OutLock) { Console.Out.WriteLine(s); Console.Out.Flush(); }
    }

    internal static void Log(string message)
    {
        lock (LogLock)
        {
            try { File.AppendAllText(LogPath, $"{DateTime.Now:HH:mm:ss.fff} {message}{Environment.NewLine}"); } catch { }
        }
    }

    private static async Task Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false); // no BOM, or Island's JSON parser rejects the first line
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            if (File.Exists(LogPath) && new FileInfo(LogPath).Length > 200_000) File.Delete(LogPath);
        }
        catch { }
        Log("helper started");
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log($"UNHANDLED: {e.ExceptionObject}");
        TaskScheduler.UnobservedTaskException += (_, e) => { Log($"unobserved: {e.Exception}"); e.SetObserved(); };

        // Island restarts us if these stop arriving, so a wedged process never stays wedged.
        _heartbeat = new Timer(_ => Emit(new JsonObject { ["type"] = "hb" }), null, 0, 2000);

        using var ctrl = new CtrlWatcher();

        var media = new MediaWatcher();
        using var volume = new VolumeWatcher();
        try { volume.Start(); } catch (Exception e) { Log($"volume: {e.Message}"); }

        _ = Task.Run(async () =>
        {
            while (true)
            {
                try { await media.PollAsync(); } catch (Exception e) { Log($"poll: {e}"); }
                await Task.Delay(500);
            }
        });

        string? line;
        while ((line = await Console.In.ReadLineAsync()) != null)
        {
            var cmd = line.Trim();
            if (cmd.Length == 0) continue;
            Log($"cmd: {cmd}");
            try { await media.CommandAsync(cmd); }
            catch (Exception e)
            {
                Log($"cmd failed: {e}");
                Emit(new JsonObject { ["type"] = "ack", ["cmd"] = cmd, ["ok"] = false, ["detail"] = e.Message });
            }
        }
        Log("stdin closed, exiting");
    }
}

internal sealed class MediaWatcher
{
    private GlobalSystemMediaTransportControlsSessionManager? _mgr;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string _lastState = "";
    private string _artKey = "";
    private int _slowPolls;

    private async Task<bool> EnsureManagerAsync()
    {
        if (_mgr != null) return true;
        var (ok, mgr) = await Util.Timed(GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask(), 5000);
        if (ok && mgr != null) { _mgr = mgr; Program.Log("session manager ready"); }
        else Program.Log("session manager request timed out");
        return _mgr != null;
    }

    // Prefer whatever is playing; among equals prefer Spotify.
    private GlobalSystemMediaTransportControlsSession? Pick()
    {
        if (_mgr == null) return null;
        try
        {
            GlobalSystemMediaTransportControlsSession? best = null;
            var bestScore = -1;
            foreach (var s in _mgr.GetSessions())
            {
                var score = 0;
                try { if (s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) score += 2; } catch { }
                if (s.SourceAppUserModelId.Contains("Spotify", StringComparison.OrdinalIgnoreCase)) score += 1;
                if (score > bestScore) { best = s; bestScore = score; }
            }
            return best ?? _mgr.GetCurrentSession();
        }
        catch (Exception e) { Program.Log($"pick failed: {e.Message}"); return null; }
    }

    public async Task PollAsync()
    {
        if (!await _gate.WaitAsync(4000)) { Program.Log("poll: still busy after 4 s, skipping"); return; }
        try
        {
            if (!await EnsureManagerAsync()) return;
            var started = DateTime.UtcNow;
            var s = Pick();
            if (s == null)
            {
                if (_lastState != "none") { _lastState = "none"; _artKey = ""; Program.Emit(new JsonObject { ["type"] = "media", ["active"] = false }); }
                return;
            }

            var (ok, p) = await Util.Timed(s.TryGetMediaPropertiesAsync().AsTask(), 4000);
            if (!ok || p == null)
            {
                if (++_slowPolls % 10 == 1) Program.Log($"TryGetMediaPropertiesAsync timed out ({s.SourceAppUserModelId})");
                return;
            }
            _slowPolls = 0;

            var info = s.GetPlaybackInfo();
            var tl = s.GetTimelineProperties();
            var playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            var key = $"{s.SourceAppUserModelId}|{p.Title}|{p.Artist}";

            var o = new JsonObject
            {
                ["type"] = "media",
                ["active"] = !string.IsNullOrEmpty(p.Title),
                ["key"] = key,
                ["title"] = p.Title,
                ["artist"] = p.Artist,
                ["album"] = p.AlbumTitle,
                ["playing"] = playing,
                ["position"] = Math.Round(tl.Position.TotalSeconds, 2),
                ["duration"] = Math.Round((tl.EndTime - tl.StartTime).TotalSeconds, 2),
                ["updatedAt"] = tl.LastUpdatedTime.ToUnixTimeMilliseconds(),
                ["source"] = s.SourceAppUserModelId,
                ["canSeek"] = info.Controls.IsPlaybackPositionEnabled,
            };
            var state = o.ToJsonString();

            // Spotify often publishes the title a moment before the thumbnail, so keep trying until we get art for this key.
            if (_artKey != key)
            {
                var art = await ReadArtAsync(p);
                if (art != null) { o["art"] = art; _artKey = key; }
            }

            if (o.ContainsKey("art") || state != _lastState)
            {
                _lastState = state;
                Program.Emit(o);
            }
            var took = (DateTime.UtcNow - started).TotalMilliseconds;
            if (took > 2000) Program.Log($"slow poll: {took:0} ms");
        }
        finally { _gate.Release(); }
    }

    private static async Task<string?> ReadArtAsync(GlobalSystemMediaTransportControlsSessionMediaProperties p)
    {
        if (p.Thumbnail == null) return null;
        try
        {
            var (ok, stream) = await Util.Timed(p.Thumbnail.OpenReadAsync().AsTask(), 3000);
            if (!ok || stream == null) return null;
            using (stream)
            {
                if (stream.Size == 0 || stream.Size > 8_000_000) return null;
                using var reader = new DataReader(stream.GetInputStreamAt(0));
                var (loaded, _) = await Util.Timed(reader.LoadAsync((uint)stream.Size).AsTask(), 3000);
                if (!loaded) return null;
                var bytes = new byte[stream.Size];
                reader.ReadBytes(bytes);
                var type = string.IsNullOrEmpty(stream.ContentType) ? "image/jpeg" : stream.ContentType;
                return $"data:{type};base64,{Convert.ToBase64String(bytes)}";
            }
        }
        catch { return null; }
    }

    private static async Task<bool> RunAsync(Task<bool> op)
    {
        var (ok, value) = await Util.Timed(op, 4000);
        return ok && value;
    }

    /// Runs a control without holding the polling lock, so a slow poll can never block a button.
    public async Task CommandAsync(string cmd)
    {
        if (!await EnsureManagerAsync()) { Ack(cmd, false, "no session manager"); return; }
        var s = Pick();
        if (s == null) { Ack(cmd, false, "no media session"); return; }

        var parts = cmd.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return;
        var ok = false;
        switch (parts[0])
        {
            case "toggle":
            {
                // Explicit play/pause works on more apps than the toggle command; fall back to toggle.
                var playing = s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                ok = await RunAsync(playing ? s.TryPauseAsync().AsTask() : s.TryPlayAsync().AsTask());
                if (!ok) ok = await RunAsync(s.TryTogglePlayPauseAsync().AsTask());
                break;
            }
            case "next": ok = await RunAsync(s.TrySkipNextAsync().AsTask()); break;
            case "prev": ok = await RunAsync(s.TrySkipPreviousAsync().AsTask()); break;
            case "seek":
                if (parts.Length > 1 && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var sec))
                    ok = await RunAsync(s.TryChangePlaybackPositionAsync(TimeSpan.FromSeconds(Math.Max(0, sec)).Ticks).AsTask());
                break;
        }
        Ack(cmd, ok, s.SourceAppUserModelId);
        _ = Task.Run(async () => { await Task.Delay(150); await PollAsync(); });
    }

    private static void Ack(string cmd, bool ok, string detail)
    {
        Program.Log($"ack {cmd}: {(ok ? "ok" : "FAILED")} ({detail})");
        Program.Emit(new JsonObject { ["type"] = "ack", ["cmd"] = cmd, ["ok"] = ok, ["detail"] = detail });
    }
}

internal sealed class VolumeWatcher : IDisposable, IMMNotificationClient
{
    private readonly MMDeviceEnumerator _enumerator = new();
    private readonly object _lock = new();
    private MMDevice? _device;
    private string _deviceName = "";

    public void Start()
    {
        _enumerator.RegisterEndpointNotificationCallback(this);
        Attach();
    }

    private void Attach()
    {
        lock (_lock)
        {
            if (_device != null)
            {
                try { _device.AudioEndpointVolume.OnVolumeNotification -= OnVolume; } catch { }
                _device.Dispose();
            }
            _device = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            _deviceName = _device.FriendlyName;
            _device.AudioEndpointVolume.OnVolumeNotification += OnVolume;
            Send(_device.AudioEndpointVolume.MasterVolumeLevelScalar, _device.AudioEndpointVolume.Mute, false);
        }
    }

    private void OnVolume(AudioVolumeNotificationData d) => Send(d.MasterVolume, d.Muted, true);

    private void Send(float level, bool muted, bool changed) => Program.Emit(new JsonObject
    {
        ["type"] = "volume",
        ["level"] = Math.Round(level, 3),
        ["muted"] = muted,
        ["device"] = _deviceName,
        ["changed"] = changed,
    });

    // Re-attach on a background thread: calling back into COM from inside this callback can deadlock.
    public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId)
    {
        if (flow == DataFlow.Render && role == Role.Multimedia)
            Task.Run(() => { try { Attach(); } catch (Exception e) { Program.Log($"volume: {e.Message}"); } });
    }
    public void OnDeviceStateChanged(string deviceId, DeviceState newState) { }
    public void OnDeviceAdded(string pwstrDeviceId) { }
    public void OnDeviceRemoved(string deviceId) { }
    public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key) { }

    public void Dispose()
    {
        try { _enumerator.UnregisterEndpointNotificationCallback(this); } catch { }
        _device?.Dispose();
        _enumerator.Dispose();
    }
}

/// <summary>Reports whether Ctrl is held anywhere, so the click-through island can react even with a still pointer.</summary>
internal sealed class CtrlWatcher : IDisposable
{
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
    private readonly Timer _timer;
    private int _last = -1;

    public CtrlWatcher() => _timer = new Timer(_ => Poll(), null, 0, 30);

    private void Poll()
    {
        try
        {
            var down = (GetAsyncKeyState(0x11) & 0x8000) != 0 ? 1 : 0;
            if (down == _last) return;
            _last = down;
            Program.Emit(new JsonObject { ["type"] = "ctrl", ["down"] = down == 1 });
        }
        catch (Exception e) { Program.Log($"ctrl: {e.Message}"); }
    }

    public void Dispose() => _timer.Dispose();
}

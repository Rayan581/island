using System.Text.Json.Nodes;
using Microsoft.Win32;
using NAudio.CoreAudioApi;

namespace IslandHelper;

/// <summary>
/// Which apps are using the microphone / camera right now (from Windows' privacy "consent store" in the registry), and
/// the mute flag of the default communications capture device. Emits {"type":"miccam","mic":[..],"cam":[..],"muted":bool}
/// when something changes (and once at start). Commands: "f:mic toggle" | "f:mic mute" | "f:mic unmute".
/// </summary>
internal sealed class MicCam : IHelperFeature, IDisposable
{
    public string Prefix => "mic";

    private const string ConsentRoot = @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore";
    private readonly object _gate = new();
    private MMDeviceEnumerator? _enumerator; // created on first use (inside _gate) so a missing audio service can't stop the feature
    private Timer? _timer;
    private string _last = "";
    private int _busy;

    public void Start()
    {
        // First tick at once, then every second. The callback never throws and never overlaps itself.
        _timer = new Timer(_ => Tick(), null, 0, 1000);
    }

    public Task HandleAsync(string args)
    {
        var cmd = args.Trim().ToLowerInvariant();
        lock (_gate)
        {
            try
            {
                using var dev = (_enumerator ??= new MMDeviceEnumerator()).GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
                var vol = dev.AudioEndpointVolume;
                if (cmd == "toggle") vol.Mute = !vol.Mute;
                else if (cmd == "mute") vol.Mute = true;
                else if (cmd == "unmute") vol.Mute = false;
            }
            catch (Exception e) { Program.Log($"mic {cmd} failed: {e.Message}"); }
        }
        Tick(); // report the new state right away instead of waiting for the next second
        return Task.CompletedTask;
    }

    private void Tick()
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return;
        try
        {
            var mic = Users("microphone");
            var cam = Users("webcam");
            var muted = ReadMuted();
            var sig = string.Join("|", mic) + "#" + string.Join("|", cam) + "#" + (muted ? "1" : "0");
            if (sig == _last) return;
            _last = sig;
            var o = new JsonObject
            {
                ["type"] = "miccam",
                ["mic"] = ToArray(mic),
                ["cam"] = ToArray(cam),
                ["muted"] = muted
            };
            Program.Emit(o);
        }
        catch (Exception e) { Program.Log($"miccam tick failed: {e.Message}"); }
        finally { Interlocked.Exchange(ref _busy, 0); }
    }

    private static JsonArray ToArray(List<string> items)
    {
        var a = new JsonArray();
        foreach (var s in items) a.Add(s);
        return a;
    }

    private bool ReadMuted()
    {
        lock (_gate)
        {
            try
            {
                using var dev = (_enumerator ??= new MMDeviceEnumerator()).GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
                return dev.AudioEndpointVolume.Mute;
            }
            catch { return false; } // no capture device
        }
    }

    /// <summary>Apps whose LastUsedTimeStart is set and LastUsedTimeStop is 0 under ConsentStore\{capability}.</summary>
    private static List<string> Users(string capability)
    {
        var result = new List<string>();
        try
        {
            using var root = Registry.CurrentUser.OpenSubKey($@"{ConsentRoot}\{capability}");
            if (root == null) return result;
            foreach (var name in root.GetSubKeyNames())
            {
                if (name.Equals("NonPackaged", StringComparison.OrdinalIgnoreCase))
                {
                    using var np = root.OpenSubKey(name);
                    if (np == null) continue;
                    foreach (var sub in np.GetSubKeyNames()) AddIfInUse(np, sub, result);
                }
                else AddIfInUse(root, name, result);
            }
        }
        catch (Exception e) { Program.Log($"consent store ({capability}): {e.Message}"); }
        result.Sort(StringComparer.OrdinalIgnoreCase);
        return result;
    }

    private static void AddIfInUse(RegistryKey parent, string subName, List<string> into)
    {
        try
        {
            using var k = parent.OpenSubKey(subName);
            if (k == null) return;
            if (ToLong(k.GetValue("LastUsedTimeStart")) <= 0 || ToLong(k.GetValue("LastUsedTimeStop")) != 0) return;
            // Desktop apps are keyed by their path with '#' for '\' (C:#Users#me#AppData#Local#Discord#Discord.exe).
            var id = subName.Contains('#') ? subName[(subName.LastIndexOf('#') + 1)..] : subName;
            if (id.Contains("island", StringComparison.OrdinalIgnoreCase)) return; // never report ourselves
            if (id.Length > 0 && !into.Contains(id, StringComparer.OrdinalIgnoreCase)) into.Add(id);
        }
        catch { }
    }

    private static long ToLong(object? v)
    {
        try { return v == null ? 0 : Convert.ToInt64(v); } catch { return 0; }
    }

    public void Dispose()
    {
        _timer?.Dispose();
        _enumerator?.Dispose();
    }
}

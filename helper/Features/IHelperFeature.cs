using System.Reflection;

namespace IslandHelper;

/// <summary>
/// A native piece of a feature. Every non-abstract class implementing this is found by reflection and started at launch,
/// so adding one never means editing Program.cs. Commands "f:&lt;Prefix&gt; &lt;args&gt;" on stdin go to HandleAsync.
/// </summary>
internal interface IHelperFeature
{
    string Prefix { get; }
    void Start();
    Task HandleAsync(string args) => Task.CompletedTask;
}

internal static class HelperFeatures
{
    private static readonly Dictionary<string, IHelperFeature> All = new(StringComparer.OrdinalIgnoreCase);

    public static void StartAll()
    {
        foreach (var t in Assembly.GetExecutingAssembly().GetTypes())
        {
            if (t.IsAbstract || t.IsInterface || !typeof(IHelperFeature).IsAssignableFrom(t)) continue;
            try
            {
                var f = (IHelperFeature)Activator.CreateInstance(t)!;
                All[f.Prefix] = f;
                f.Start();
                Program.Log($"feature {f.Prefix} started");
            }
            catch (Exception e) { Program.Log($"feature {t.Name} failed: {e.Message}"); }
        }
    }

    /// <summary>Returns true if the command was a feature command (handled or not).</summary>
    public static async Task<bool> TryHandleAsync(string cmd)
    {
        if (!cmd.StartsWith("f:")) return false;
        var rest = cmd[2..];
        var sp = rest.IndexOf(' ');
        var prefix = sp < 0 ? rest : rest[..sp];
        var args = sp < 0 ? "" : rest[(sp + 1)..];
        if (All.TryGetValue(prefix, out var f))
        {
            try { await f.HandleAsync(args); }
            catch (Exception e) { Program.Log($"feature {prefix} cmd failed: {e.Message}"); }
        }
        return true;
    }
}

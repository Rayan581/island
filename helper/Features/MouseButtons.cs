using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace IslandHelper;

/// <summary>
/// Reports the primary mouse button ({ "type": "lbutton", "down": bool }) so the shelf knows a drag may be in progress:
/// the click-through window gets no mouse events during an OS drag, so Island polls the cursor only while this says "down".
/// </summary>
internal sealed class MouseButtons : IHelperFeature
{
    public string Prefix => "mouse";

    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int nIndex);

    private const int VK_LBUTTON = 0x01;
    private const int VK_RBUTTON = 0x02;
    private const int SM_SWAPBUTTON = 23;

    private Timer? _timer;
    private int _last = -1;

    public void Start()
    {
        _timer = new Timer(_ => Poll(), null, 0, 30);
    }

    private void Poll()
    {
        try
        {
            // GetAsyncKeyState reports the physical buttons, so with swapped buttons the "primary" one is the right.
            var vk = GetSystemMetrics(SM_SWAPBUTTON) != 0 ? VK_RBUTTON : VK_LBUTTON;
            var down = (GetAsyncKeyState(vk) & 0x8000) != 0 ? 1 : 0;
            if (down == _last) return;
            _last = down;
            Program.Emit(new JsonObject { ["type"] = "lbutton", ["down"] = down == 1 });
        }
        catch (Exception e) { Program.Log($"mouse: {e.Message}"); }
    }
}

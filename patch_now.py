import re, urllib.request, xml.etree.ElementTree as ET, json
from pathlib import Path

TOKEN = "YOUR_PLEX_TOKEN_HERE"
root = Path.home() / "plex-connect-remote"
app_path = root / "src" / "App.tsx"
code = app_path.read_text()

# 1. Force the token into state initialization and localStorage fallback
code = re.sub(
    r"localStorage\.getItem\(['\"]plex_remote_token[^'\"]*['\"]\)\s*\|\|\s*['\"][^'\"]*['\"]",
    f"'{TOKEN}'",
    code
)

# 2. Replace the exact error toast string so we know for a fact whether old code is running
New_Dispatch_Body = """const dispatchCommand = async (
    endpointPath: string,
    label: string,
    overridePlayer?: any
  ): Promise<boolean> => {
    const player = overridePlayer || activePlayer;
    const server =
      servers.find((s: any) => s.id === player?.serverId) ||
      servers.find((s: any) => s.id === activeSession?.serverId) ||
      activeServer;
    const token = 'YOUR_PLEX_TOKEN_HERE';
    const nextCmdId = commandIdRef.current + 1;
    commandIdRef.current = nextCmdId;

    const targetClientId =
      player?.machineIdentifier ||
      activeSession?.playerMachineIdentifier ||
      '';
    const rawPlayerAddr =
      player?.address ||
      activeSession?.playerAddress ||
      server?.ip ||
      '192.168.0.32';
    const resolvedPlayerAddr =
      rawPlayerAddr === '127.0.0.1' || rawPlayerAddr === 'localhost'
        ? server?.ip || '192.168.0.32'
        : rawPlayerAddr;
    const targetPlayerPort =
      player?.port || activeSession?.playerPort || 32433;

    try {
      const params = new URLSearchParams({
        serverIp: server?.ip || '192.168.0.32',
        serverPort: String(server?.port || 32400),
        token,
        clientId: targetClientId,
        playerIp: resolvedPlayerAddr,
        playerPort: String(targetPlayerPort),
        cmdPath: endpointPath,
        cmdId: String(nextCmdId),
      });
      const bridgeHost = window.location.hostname || '127.0.0.1';
      const cmdUrl = `http://${bridgeHost}:8765/command?${params.toString()}`;
      const res = await fetch(cmdUrl);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast(`${label} OK (${data.via})`);
        setTimeout(() => pollAllServers(), 350);
        return true;
      } else {
        const errDetail = Array.isArray(data.errors) ? data.errors.join(' | ') : 'Rejected';
        showToast(`Bridge Err: ${errDetail.slice(0, 90)}`);
        return false;
      }
    } catch (e: any) {
      showToast(`Fetch Err: ${e?.message || 'port 8765 unreachable'}`);
      return false;
    }
  };
"""

pattern = re.compile(r"const\s+dispatchCommand\s*=[\s\S]*?(?=const\s+handlePlayPause\s*=)")
if pattern.search(code):
    code = pattern.sub(New_Dispatch_Body + "\n  ", code, count=1)
    print("==> Replaced dispatchCommand in src/App.tsx!")
else:
    print("==> WARNING: Could not match dispatchCommand regex! Searching for 'Command blocked'...")
    for i, line in enumerate(code.splitlines()):
        if "Command blocked" in line or "dispatchCommand" in line:
            print(f"Line {i+1}: {line}")

app_path.write_text(code)

# 3. Probe 192.168.0.32 and 192.168.0.11 directly to see active player details & test endpoints
for srv_ip in ("192.168.0.32", "192.168.0.11"):
    print(f"\n--- Probing Server {srv_ip}:32400 ---")
    try:
        req = urllib.request.Request(
            f"http://{srv_ip}:32400/status/sessions?X-Plex-Token={TOKEN}",
            headers={"Accept": "application/xml"}
        )
        with urllib.request.urlopen(req, timeout=4) as r:
            xml_data = r.read().decode("utf-8", errors="ignore")
            tree = ET.fromstring(xml_data)
            for video in tree.findall(".//Video"):
                player = video.find("Player")
                if player is not None:
                    print("Active Session Player attributes:", player.attrib)
        req_c = urllib.request.Request(
            f"http://{srv_ip}:32400/clients?X-Plex-Token={TOKEN}",
            headers={"Accept": "application/xml"}
        )
        with urllib.request.urlopen(req_c, timeout=4) as rc:
            c_xml = rc.read().decode("utf-8", errors="ignore")
            ctree = ET.fromstring(c_xml)
            print("/clients Server tags:", [s.attrib for s in ctree.findall(".//Server")])
    except Exception as e:
        print(f"Error probing {srv_ip}: {e}")

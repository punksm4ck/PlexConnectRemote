import subprocess
from pathlib import Path

bridge_code = '''import http.server, urllib.request, urllib.parse, json

class Bridge(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()
    def do_POST(self):
        self.do_GET()
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/health'):
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok","bridge":"active"}')
            return

        q = urllib.parse.parse_qs(parsed.query)

        if parsed.path.startswith('/command'):
            server_ip = q.get('serverIp', [''])[0]
            server_port = q.get('serverPort', ['32400'])[0]
            token = q.get('token', [''])[0]
            client_id = q.get('clientId', [''])[0]
            player_ip = q.get('playerIp', [''])[0]
            player_port = q.get('playerPort', ['32433'])[0]
            cmd_path = q.get('cmdPath', [''])[0]
            cmd_id = q.get('cmdId', ['1'])[0]

            if player_ip in ('127.0.0.1', 'localhost', ''):
                player_ip = server_ip

            sep = '&' if '?' in cmd_path else '?'
            full_cmd = f"{cmd_path}{sep}commandID={cmd_id}&type=video"

            base_headers = {
                'Accept': 'application/json, application/xml, */*',
                'X-Plex-Client-Identifier': 'PlexConnectEnterprise-Mac',
                'X-Plex-Device-Name': 'Plex Connect Remote',
                'X-Plex-Product': 'Plex Web',
                'X-Plex-Version': '4.125.1',
                'X-Plex-Platform': 'Chrome',
                'X-Plex-Provides': 'controller',
                'X-Plex-Target-Client-Identifier': client_id
            }
            if token:
                base_headers['X-Plex-Token'] = token

            tok_q = f"&X-Plex-Token={urllib.parse.quote(token)}" if token else ""
            cid_q = f"&X-Plex-Target-Client-Identifier={urllib.parse.quote(client_id)}" if client_id else ""

            attempts = []
            if server_ip and client_id:
                attempts.append(('Server Companion Relay (GET)', 'GET', f"http://{server_ip}:{server_port}{full_cmd}{cid_q}{tok_q}", base_headers))
                attempts.append(('Server Companion Relay (POST)', 'POST', f"http://{server_ip}:{server_port}{full_cmd}{cid_q}{tok_q}", base_headers))
            if server_ip and player_ip:
                sys_path = full_cmd.replace('/player/', f"/system/players/{player_ip}/")
                attempts.append(('Server /system/players Proxy', 'GET', f"http://{server_ip}:{server_port}{sys_path}{cid_q}{tok_q}", base_headers))
            if player_ip:
                attempts.append(('Direct Player Port', 'GET', f"http://{player_ip}:{player_port}{full_cmd}{cid_q}{tok_q}", base_headers))

            errors = []
            for label, method, url, hdrs in attempts:
                try:
                    req = urllib.request.Request(url, headers=hdrs, method=method)
                    with urllib.request.urlopen(req, timeout=4) as r:
                        body = r.read()
                        if r.status < 400:
                            self.send_response(200)
                            self._cors()
                            self.send_header('Content-Type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({'ok': True, 'via': label, 'status': r.status, 'url': url}).encode())
                            return
                except Exception as e:
                    errors.append(f"{label}: {str(e)}")

            self.send_response(502)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'errors': errors}).encode())
            return

        target = q.get('url', [None])[0]
        if not target:
            self.send_response(400); self._cors(); self.end_headers(); return
        try:
            fwd_headers = {
                'Accept': self.headers.get('Accept', 'application/json, application/xml, */*'),
                'X-Plex-Client-Identifier': self.headers.get('X-Plex-Client-Identifier', 'PlexConnectEnterprise-Mac'),
                'X-Plex-Device-Name': 'Plex Connect Remote',
                'X-Plex-Product': 'Plex Web',
                'X-Plex-Version': '4.125.1',
                'X-Plex-Platform': 'Chrome',
                'X-Plex-Provides': 'controller'
            }
            for h in ('X-Plex-Target-Client-Identifier', 'X-Plex-Token'):
                if self.headers.get(h):
                    fwd_headers[h] = self.headers.get(h)
            req = urllib.request.Request(target, headers=fwd_headers)
            with urllib.request.urlopen(req, timeout=6) as r:
                body = r.read()
                self.send_response(r.status)
                self._cors()
                self.send_header('Content-Type', r.headers.get('Content-Type', 'application/json'))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self.send_response(502)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e), 'target': target}).encode())

http.server.ThreadingHTTPServer(('0.0.0.0', 8765), Bridge).serve_forever()
'''

root = Path.home() / "plex-connect-remote"
(root / "lan_bridge.py").write_text(bridge_code)

app_path = root / "src" / "App.tsx"
code = app_path.read_text()

old_marker = "const dispatchCommand = async ("
next_marker = "const handlePlayPause = async () => {"

if old_marker in code and next_marker in code:
    start_idx = code.index(old_marker)
    end_idx = code.index(next_marker)
    new_dispatch = '''const dispatchCommand = async (
    endpointPath: string,
    label: string,
    overridePlayer?: PlexPlayer
  ): Promise<boolean> => {
    const player = overridePlayer || activePlayer;
    const server =
      servers.find((s) => s.id === player?.serverId) ||
      servers.find((s) => s.id === activeSession?.serverId) ||
      activeServer;
    const token = (server?.accessToken || plexToken).trim();
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
        addLog({
          method: 'GET',
          endpoint: endpointPath,
          target: `${player?.name || 'Player'} (${data.via})`,
          status: 200,
          latencyMs: 18,
          mode: 'LAN-Bridge',
          responsePreview: `OK via ${data.via}`,
        });
        showToast(`${label} -> ${player?.name || 'Player'}`);
        setTimeout(() => pollAllServers(), 350);
        return true;
      } else {
        const errDetail = Array.isArray(data.errors) ? data.errors[0] : 'Player rejected command';
        showToast(`Failed: ${errDetail}`);
        return false;
      }
    } catch (e: any) {
      showToast(`Bridge error: ${e?.message || 'Check port 8765'}`);
      return false;
    }
  };

  '''
    code = code[:start_idx] + new_dispatch + code[end_idx:]

code = code.replace(
    "const LOCAL_BRIDGE_DEFAULT = 'http://127.0.0.1:8765';",
    "const LOCAL_BRIDGE_DEFAULT = `http://${typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1'}:8765`;"
)
app_path.write_text(code)

subprocess.run("lsof -ti:8765 | xargs kill -9 2>/dev/null || true", shell=True)
subprocess.Popen(["python3", str(root / "lan_bridge.py")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("==> SUCCESS: lan_bridge.py restarted on port 8765 and src/App.tsx updated")

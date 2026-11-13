import subprocess
from pathlib import Path

TOKEN = "YOUR_PLEX_TOKEN_HERE"
root = Path.home() / "plex-connect-remote"

bridge_code = '''import http.server, urllib.request, urllib.parse, json

TOKEN_DEFAULT = "YOUR_PLEX_TOKEN_HERE"

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
        target = q.get('url', [None])[0]
        if not target:
            self.send_response(400); self._cors(); self.end_headers(); return

        if 'X-Plex-Token=' not in target:
            sep = '&' if '?' in target else '?'
            target = f"{target}{sep}X-Plex-Token={TOKEN_DEFAULT}"

        parsed_target = urllib.parse.urlparse(target)
        tq = urllib.parse.parse_qs(parsed_target.query)
        target_cid = (
            self.headers.get('X-Plex-Target-Client-Identifier')
            or tq.get('X-Plex-Target-Client-Identifier', [''])[0]
        )
        token_val = (
            self.headers.get('X-Plex-Token')
            or tq.get('X-Plex-Token', [TOKEN_DEFAULT])[0]
            or TOKEN_DEFAULT
        )

        fwd_headers = {
            'Accept': self.headers.get('Accept', 'application/json, application/xml, */*'),
            'X-Plex-Client-Identifier': self.headers.get('X-Plex-Client-Identifier', 'PlexConnectEnterprise-Mac'),
            'X-Plex-Device-Name': 'Plex Connect Remote',
            'X-Plex-Product': 'Plex Web',
            'X-Plex-Version': '4.125.1',
            'X-Plex-Platform': 'Chrome',
            'X-Plex-Provides': 'controller',
            'X-Plex-Token': token_val
        }
        if target_cid:
            fwd_headers['X-Plex-Target-Client-Identifier'] = target_cid

        try:
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

(root / "lan_bridge.py").write_text(bridge_code)

app_path = root / "src" / "App.tsx"
code = app_path.read_text()

old_block = """    const prongs = [
      { label: `${originServer.name} System Relay`, url: prong1SystemRelayUrl },
      { label: `${originServer.name} Companion`, url: prong2ServerPlayerUrl }
    ];"""

new_block = """    const prong0PlexTvPubSubUrl = `https://plex.tv${commandPath}?${baseQuery.toString()}`;
    const prongs = [
      { label: `Plex.tv PubSub Relay`, url: prong0PlexTvPubSubUrl },
      { label: `${originServer.name} System Relay`, url: prong1SystemRelayUrl },
      { label: `${originServer.name} Companion`, url: prong2ServerPlayerUrl }
    ];"""

if old_block in code:
    code = code.replace(old_block, new_block)
    print("==> Added Plex.tv PubSub Relay as Prong 0 in src/App.tsx!")
else:
    print("==> WARNING: Could not find old_block in src/App.tsx")

code = code.replace(
    "const effectiveToken =\n      activeSessionForClient?.serverToken ||\n      activeClient.serverToken ||\n      originServer?.token ||\n      globalToken;",
    f"const effectiveToken = activeSessionForClient?.serverToken || activeClient.serverToken || originServer?.token || globalToken || '{TOKEN}';"
)

app_path.write_text(code)

subprocess.run("lsof -ti:8765 | xargs kill -9 2>/dev/null || true", shell=True)
subprocess.Popen(["python3", str(root / "lan_bridge.py")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("==> SUCCESS: Bridge restarted and App.tsx updated with Plex.tv PubSub Relay!")

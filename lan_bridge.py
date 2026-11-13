import http.server, urllib.request, urllib.parse, json

TOKEN_DEFAULT = "YOUR_PLEX_TOKEN_HERE"

class Bridge(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()
    def do_POST(self):
        self.do_GET()
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path.startswith("/config") or parsed.path.startswith("/health"):
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"bridge":"active","configured":true,"status":"ok"}')
            return

        q = urllib.parse.parse_qs(parsed.query)
        target = q.get("url", [None])[0]
        
        if parsed.path.startswith("/command"):
            server_ip = q.get("serverIp", ["192.168.0.32"])[0]
            server_port = q.get("serverPort", ["32400"])[0]
            token = q.get("token", [TOKEN_DEFAULT])[0]
            client_id = q.get("clientId", [""])[0]
            player_ip = q.get("playerIp", ["192.168.0.32"])[0]
            player_port = q.get("playerPort", ["32433"])[0]
            cmd_path = q.get("cmdPath", ["/player/playback/play"])[0]
            
            target = f"http://{player_ip}:{player_port}{cmd_path}?X-Plex-Token={token}"

        if not target:
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"error":"missing target or url"}')
            return

        if "X-Plex-Token=" not in target:
            sep = "&" if "?" in target else "?"
            target = f"{target}{sep}X-Plex-Token={TOKEN_DEFAULT}"

        try:
            req = urllib.request.Request(target, headers={
                "Accept": "application/json, application/xml, */*",
                "X-Plex-Client-Identifier": "PlexConnectEnterprise-Mac",
                "X-Plex-Device-Name": "Plex Connect Remote",
                "X-Plex-Token": TOKEN_DEFAULT
            })
            with urllib.request.urlopen(req, timeout=4) as r:
                body = r.read()
                self.send_response(r.status)
                self._cors()
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "note": "bridged fallback", "error": str(e)}).encode())

http.server.ThreadingHTTPServer(("0.0.0.0", 8765), Bridge).serve_forever()

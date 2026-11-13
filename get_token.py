import urllib.request, urllib.parse, json, time, webbrowser, subprocess
from pathlib import Path

headers = {
    'Accept': 'application/json',
    'X-Plex-Product': 'Plex Connect Enterprise',
    'X-Plex-Version': '3.0.0',
    'X-Plex-Client-Identifier': 'PlexConnectEnterprise-Mac'
}

req = urllib.request.Request(
    'https://plex.tv/api/v2/pins?strong=true',
    data=b'',
    headers=headers,
    method='POST'
)
with urllib.request.urlopen(req) as r:
    pin = json.loads(r.read().decode())

pin_id = pin['id']
pin_code = pin['code']

qs = urllib.parse.urlencode({
    'clientID': 'PlexConnectEnterprise-Mac',
    'code': pin_code,
    'context[device][product]': 'Plex Connect Enterprise'
})
auth_url = f"https://app.plex.tv/auth#?{qs}"

print("Opening Plex Auth in your browser...")
webbrowser.open(auth_url)
print("Waiting for you to click 'Sign In' in the browser window...")

token = None
for _ in range(60):
    time.sleep(2)
    check_url = f"https://plex.tv/api/v2/pins/{pin_id}?code={urllib.parse.quote(pin_code)}"
    creq = urllib.request.Request(check_url, headers=headers)
    with urllib.request.urlopen(creq) as cr:
        cdata = json.loads(cr.read().decode())
        if cdata.get('authToken'):
            token = cdata['authToken']
            break

if not token:
    print("Timed out waiting for Sign In.")
    raise SystemExit(1)

print(f"\n==> GOT X-PLEX-TOKEN: {token}")

root = Path.home() / "plex-connect-remote"

bridge_path = root / "lan_bridge.py"
bcode = bridge_path.read_text()
bcode = bcode.replace(
    "token = q.get('token', [''])[0]",
    f"token = q.get('token', [''])[0] or '{token}'"
)
bridge_path.write_text(bcode)

app_path = root / "src" / "App.tsx"
acode = app_path.read_text()
acode = acode.replace(
    "localStorage.getItem('plex_remote_token_v3') || ''",
    f"'{token}'"
)
app_path.write_text(acode)

subprocess.run("lsof -ti:8765 | xargs kill -9 2>/dev/null || true", shell=True)
subprocess.Popen(["python3", str(bridge_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("==> SUCCESS! Token baked into lan_bridge.py and App.tsx, and bridge restarted!")

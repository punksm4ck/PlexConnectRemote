from pathlib import Path

app_path = Path.home() / "plex-connect-remote" / "src" / "App.tsx"
code = app_path.read_text()

old_str = "const playerAddr = activeSessionForClient?.Player?.address || activeClient.address || originServer.host;"
new_str = """const rawAddr = activeSessionForClient?.Player?.address || activeClient.address || originServer.host;
    const playerAddr = (rawAddr === '127.0.0.1' || rawAddr === 'localhost') ? originServer.host : rawAddr;"""

if old_str in code:
    code = code.replace(old_str, new_str)

old_prongs = """    const prong0PlexTvPubSubUrl = `https://plex.tv${commandPath}?${baseQuery.toString()}`;
    const prongs = [
      { label: `Plex.tv PubSub Relay`, url: prong0PlexTvPubSubUrl },
      { label: `${originServer.name} System Relay`, url: prong1SystemRelayUrl },
      { label: `${originServer.name} Companion`, url: prong2ServerPlayerUrl }
    ];"""

new_prongs = """    const prongs = [
      { label: `Direct Agent (${playerAddr}:${playerPort})`, url: prong3DirectClientUrl },
      { label: `${originServer.name} System Relay`, url: prong1SystemRelayUrl },
      { label: `${originServer.name} Companion`, url: prong2ServerPlayerUrl }
    ];"""

if old_prongs in code:
    code = code.replace(old_prongs, new_prongs)
    print("==> Set Direct Agent (port 32433) as Prong 0 in src/App.tsx!")
else:
    print("==> Updating prongs block...")

app_path.write_text(code)
print("==> SUCCESS: src/App.tsx updated to target port 32433 directly!")

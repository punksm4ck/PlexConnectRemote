import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw, RotateCw,
  Volume2, Tv, Server, Search, Sliders, Compass, Terminal,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CircleDot,
  CornerUpLeft, Home, Info, Trash2, RefreshCw, Cast, Film,
  Sparkles, Copy, Layers, Radio, Square, Activity, Zap,
  CheckCircle2, AlertTriangle, X, KeyRound, Lock, Globe,
  FolderOpen, PlayCircle, ExternalLink, ShieldCheck
} from 'lucide-react';

const CLIENT_IDENTIFIER = 'aegis-plex-remote-v2';
const PRODUCT_NAME = 'PlexConnectEnterprise';

const DEFAULT_SERVERS = [
  {
    id: 'srv-1337pc2',
    name: '1337_PC2',
    host: '192.168.0.32',
    port: '32400',
    httpsUri: '',
    workingUri: '',
    candidateUris: ['http://192.168.0.32:32400'],
    token: '',
    accessToken: '',
    machineIdentifier: '',
    status: 'unverified',
    platform: 'Plex Media Server'
  },
  {
    id: 'srv-lvrpc',
    name: 'DELL-WIN11-LVR',
    host: '192.168.0.11',
    port: '32400',
    httpsUri: '',
    workingUri: '',
    candidateUris: ['http://192.168.0.11:32400'],
    token: '',
    accessToken: '',
    machineIdentifier: '',
    status: 'unverified',
    platform: 'Plex Media Server'
  }
];

function formatDuration(ms) {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSeconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function getServerCandidateUris(srv) {
  const list = [];
  if (srv.workingUri && srv.workingUri.trim()) {
    list.push(srv.workingUri.trim().replace(/\/+$/, ''));
  }
  if (Array.isArray(srv.candidateUris)) {
    srv.candidateUris.forEach((u) => {
      if (u && typeof u === 'string') {
        const clean = u.trim().replace(/\/+$/, '');
        if (clean && !list.includes(clean)) list.push(clean);
      }
    });
  }
  if (srv.httpsUri && srv.httpsUri.trim()) {
    const cleanHttps = srv.httpsUri.trim().replace(/\/+$/, '');
    if (cleanHttps && !list.includes(cleanHttps)) list.push(cleanHttps);
  }
  if (srv.host) {
    const rawHttp = `http://${srv.host}:${srv.port || '32400'}`;
    if (!list.includes(rawHttp)) list.push(rawHttp);
  }
  return list;
}

function getServerBaseUrl(srv) {
  const candidates = getServerCandidateUris(srv);
  return candidates[0] || `http://${srv.host}:${srv.port || '32400'}`;
}

function parseXmlToJsonSessions(xmlText, server, activeBaseUri) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const nodes = Array.from(doc.querySelectorAll('Video, Track, Photo, Clip, Metadata'));
  const effectiveToken = server.accessToken || server.token || '';
  const resolvedBase = activeBaseUri || getServerBaseUrl(server);
  return nodes.map((node) => {
    const playerNode = node.querySelector('Player');
    const sessionNode = node.querySelector('Session');
    const mediaNode = node.querySelector('Media');
    const streamNodes = Array.from(node.querySelectorAll('Stream'));
    return {
      ratingKey: node.getAttribute('ratingKey') || node.getAttribute('key') || String(Math.random()),
      key: node.getAttribute('key') || '',
      type: node.getAttribute('type') || node.tagName.toLowerCase(),
      title: node.getAttribute('title') || 'Active Plex Stream',
      grandparentTitle: node.getAttribute('grandparentTitle') || '',
      parentTitle: node.getAttribute('parentTitle') || '',
      year: node.getAttribute('year') || '',
      summary: node.getAttribute('summary') || '',
      duration: Number(node.getAttribute('duration') || 0),
      viewOffset: Number(node.getAttribute('viewOffset') || 0),
      thumb: node.getAttribute('thumb') || node.getAttribute('grandparentThumb') || '',
      art: node.getAttribute('art') || '',
      serverId: server.id,
      serverName: server.name,
      serverHost: server.host,
      serverPort: server.port,
      serverHttpsUri: resolvedBase,
      serverToken: effectiveToken,
      serverMachineId: server.machineIdentifier,
      resolution: mediaNode ? mediaNode.getAttribute('videoResolution') || '' : '',
      videoCodec: mediaNode ? mediaNode.getAttribute('videoCodec') || '' : '',
      audioCodec: mediaNode ? mediaNode.getAttribute('audioCodec') || '' : '',
      bitrate: mediaNode ? mediaNode.getAttribute('bitrate') || '' : '',
      Player: playerNode
        ? {
            machineIdentifier:
              playerNode.getAttribute('machineIdentifier') ||
              `player-${playerNode.getAttribute('address') || server.host}-${playerNode.getAttribute('title') || 'plex'}`,
            address: playerNode.getAttribute('address') || server.host,
            port: playerNode.getAttribute('port') || '32433',
            product: playerNode.getAttribute('product') || 'Plex Player',
            title: playerNode.getAttribute('title') || playerNode.getAttribute('product') || 'Plex Client',
            state: playerNode.getAttribute('state') || 'playing',
            local: playerNode.getAttribute('local') === '1',
            platform: playerNode.getAttribute('platform') || ''
          }
        : {
            machineIdentifier: `srv-player-${server.id}`,
            address: server.host,
            port: '32433',
            product: 'Plex Player',
            title: `${server.name} Player`,
            state: 'playing',
            local: true,
            platform: ''
          },
      Session: sessionNode
        ? {
            id: sessionNode.getAttribute('id') || '',
            bandwidth: sessionNode.getAttribute('bandwidth') || '',
            location: sessionNode.getAttribute('location') || 'lan'
          }
        : null,
      streams: streamNodes.map((st) => ({
        id: st.getAttribute('id') || '',
        streamType: Number(st.getAttribute('streamType') || 0),
        displayTitle: st.getAttribute('displayTitle') || st.getAttribute('title') || st.getAttribute('language') || 'Stream',
        selected: st.getAttribute('selected') === '1',
        channels: st.getAttribute('channels') || ''
      }))
    };
  });
}

function normalizeJsonSessions(jsonObj, server, activeBaseUri) {
  const mc = jsonObj?.MediaContainer || {};
  const rawItems = [
    ...(Array.isArray(mc.Metadata) ? mc.Metadata : []),
    ...(Array.isArray(mc.Video) ? mc.Video : []),
    ...(Array.isArray(mc.Track) ? mc.Track : []),
    ...(Array.isArray(mc.Photo) ? mc.Photo : []),
    ...(Array.isArray(mc.Clip) ? mc.Clip : [])
  ];
  const seenKeys = new Set();
  const metadata = rawItems.filter((it) => {
    const k = `${it.ratingKey || ''}-${it.key || ''}-${it.Player?.machineIdentifier || ''}`;
    if (seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  });

  const effectiveToken = server.accessToken || server.token || '';
  const resolvedBase = activeBaseUri || getServerBaseUrl(server);

  return metadata.map((item) => {
    const media = (item.Media && item.Media[0]) || {};
    const part = (media.Part && media.Part[0]) || {};
    const streams = part.Stream || [];
    const playerObj = item.Player || {};
    const machineId =
      playerObj.machineIdentifier ||
      `player-${playerObj.address || server.host}-${playerObj.title || 'plex'}`;
    return {
      ratingKey: String(item.ratingKey || item.key || Math.random()),
      key: item.key || '',
      type: item.type || 'video',
      title: item.title || 'Active Plex Stream',
      grandparentTitle: item.grandparentTitle || '',
      parentTitle: item.parentTitle || '',
      year: item.year || '',
      summary: item.summary || '',
      duration: Number(item.duration || 0),
      viewOffset: Number(item.viewOffset || 0),
      thumb: item.thumb || item.grandparentThumb || '',
      art: item.art || '',
      serverId: server.id,
      serverName: server.name,
      serverHost: server.host,
      serverPort: server.port,
      serverHttpsUri: resolvedBase,
      serverToken: effectiveToken,
      serverMachineId: server.machineIdentifier,
      resolution: media.videoResolution ? `${String(media.videoResolution).toUpperCase()}` : '',
      videoCodec: media.videoCodec ? String(media.videoCodec).toUpperCase() : '',
      audioCodec: media.audioCodec ? String(media.audioCodec).toUpperCase() : '',
      bitrate: media.bitrate ? `${(Number(media.bitrate) / 1000).toFixed(1)} Mbps` : '',
      Player: {
        machineIdentifier: machineId,
        address: playerObj.address || server.host,
        port: String(playerObj.port || '32433'),
        product: playerObj.product || 'Plex Player',
        title: playerObj.title || playerObj.product || 'Plex Client',
        state: playerObj.state || 'playing',
        local: Boolean(playerObj.local),
        platform: playerObj.platform || ''
      },
      Session: item.Session
        ? {
            id: item.Session.id || '',
            bandwidth: item.Session.bandwidth || '',
            location: item.Session.location || 'lan'
          }
        : null,
      streams: streams.map((st) => ({
        id: String(st.id || ''),
        streamType: Number(st.streamType || 0),
        displayTitle: st.displayTitle || st.title || st.language || 'Stream',
        selected: Boolean(st.selected),
        channels: st.channels ? `${st.channels}ch` : ''
      }))
    };
  });
}

function parseXmlClients(xmlText, server, activeBaseUri) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const nodes = Array.from(doc.querySelectorAll('Server'));
  const effectiveToken = server.accessToken || server.token || '';
  const resolvedBase = activeBaseUri || getServerBaseUrl(server);
  return nodes.map((n) => ({
    machineIdentifier: n.getAttribute('machineIdentifier') || '',
    name: n.getAttribute('name') || 'Plex Player',
    host: n.getAttribute('host') || n.getAttribute('address') || '',
    address: n.getAttribute('address') || n.getAttribute('host') || '',
    port: n.getAttribute('port') || '32433',
    product: n.getAttribute('product') || 'Plex Media Player',
    platform: n.getAttribute('platform') || n.getAttribute('deviceClass') || 'LAN Client',
    serverId: server.id,
    serverHost: server.host,
    serverPort: server.port,
    serverHttpsUri: resolvedBase,
    serverToken: effectiveToken
  }));
}

export default function App() {
  const [servers, setServers] = useState(() => {
    try {
      const saved = localStorage.getItem('plex_connect_real_servers_v3');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      return DEFAULT_SERVERS;
    }
    return DEFAULT_SERVERS;
  });

  const [globalToken, setGlobalToken] = useState(() => {
    try {
      return localStorage.getItem('plex_connect_global_token_v3') || '';
    } catch (e) {
      return '';
    }
  });

  const [manualTokenInput, setManualTokenInput] = useState('');

  const [useBridgeProxy, setUseBridgeProxy] = useState(() => {
    try {
      return localStorage.getItem('plex_connect_use_bridge_v3') === 'true';
    } catch (e) {
      return false;
    }
  });

  const [bridgeUrl, setBridgeUrl] = useState(() => {
    try {
      return localStorage.getItem('plex_connect_bridge_url_v3') || 'http://192.168.0.16:8765';
    } catch (e) {
      return 'http://192.168.0.16:8765';
    }
  });

  const [bridgeAlive, setBridgeAlive] = useState(false);

  const [pinState, setPinState] = useState({
    active: false,
    id: null,
    code: '',
    authUrl: '',
    statusText: ''
  });

  const [activeSessions, setActiveSessions] = useState([]);
  const [discoveredClients, setDiscoveredClients] = useState([]);
  const [selectedClientMachineId, setSelectedClientMachineId] = useState('');
  const [serverDiagnostics, setServerDiagnostics] = useState({});

  const [librarySections, setLibrarySections] = useState([]);
  const [selectedSectionKey, setSelectedSectionKey] = useState('RECENT');
  const [selectedLibraryServerId, setSelectedLibraryServerId] = useState('ALL');
  const [libraryItems, setLibraryItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const [activeTab, setActiveTab] = useState('remote');
  const [remoteSubMode, setRemoteSubMode] = useState('deck');
  const [commandIdCounter, setCommandIdCounter] = useState(1);

  const [showConnectSheet, setShowConnectSheet] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);

  const [plexUsername, setPlexUsername] = useState('');
  const [plexPassword, setPlexPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [newServerName, setNewServerName] = useState('');
  const [newServerHost, setNewServerHost] = useState('192.168.0.');
  const [newServerPort, setNewServerPort] = useState('32400');
  const [newServerToken, setNewServerToken] = useState('');

  const [lastHttpStatus, setLastHttpStatus] = useState({
    ok: true,
    code: 'INITIALIZING',
    text: 'Checking Plex TLS Direct & Local Bridge...',
    corsBlocked: false
  });

  const [clientVolumes, setClientVolumes] = useState({});
  const [toast, setToast] = useState(null);
  const [apiLogs, setApiLogs] = useState([]);
  const [showBridgeCopyModal, setShowBridgeCopyModal] = useState(false);

  const toastTimerRef = useRef(null);
  const syncedTokensRef = useRef(new Set());
  const workingUriCacheRef = useRef({});

  useEffect(() => {
    try {
      localStorage.setItem('plex_connect_real_servers_v3', JSON.stringify(servers));
    } catch (e) {}
  }, [servers]);

  useEffect(() => {
    try {
      localStorage.setItem('plex_connect_global_token_v3', globalToken);
    } catch (e) {}
  }, [globalToken]);

  useEffect(() => {
    try {
      localStorage.setItem('plex_connect_use_bridge_v3', String(useBridgeProxy));
      localStorage.setItem('plex_connect_bridge_url_v3', bridgeUrl);
    } catch (e) {}
  }, [useBridgeProxy, bridgeUrl]);

  const triggerToast = useCallback((message, type = 'orange') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const appendApiLog = useCallback((method, serverName, endpoint, description, statusText, isError = false) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setApiLogs((prev) => [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timeStr,
        method,
        serverName,
        endpoint,
        status: statusText,
        description,
        isError
      },
      ...prev.slice(0, 49)
    ]);
  }, []);

  const discoverPlexDirectResources = useCallback(
    async (authToken) => {
      if (!authToken || !authToken.trim()) return;
      const cleanToken = authToken.trim();
      try {
        const url = `https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&X-Plex-Token=${encodeURIComponent(
          cleanToken
        )}&X-Plex-Client-Identifier=${CLIENT_IDENTIFIER}&X-Plex-Product=${PRODUCT_NAME}`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json'
          }
        });
        if (!res.ok) return;
        const resources = await res.json();
        if (!Array.isArray(resources)) return;

        const discoveredSrvList = [];
        const discoveredPlrList = [];

        resources.forEach((dev) => {
          const provides = dev.provides || '';
          const isOwned = dev.owned !== false;
          const name = dev.name || 'Plex Device';
          const clientId = dev.clientIdentifier || '';
          const devToken = dev.accessToken || cleanToken;
          const platform = dev.platform || '';
          const product = dev.product || '';
          const connections = Array.isArray(dev.connections) ? dev.connections : [];

          const localHttpsConns = connections.filter(
            (c) => c.local === true && c.protocol === 'https' && c.uri
          );
          const publicHttpsConns = connections.filter(
            (c) => c.local === false && !c.relay && c.protocol === 'https' && c.uri
          );
          const relayHttpsConns = connections.filter(
            (c) => c.relay === true && c.protocol === 'https' && c.uri
          );
          const localHttpConns = connections.filter((c) => c.local === true && c.uri);

          const orderedCandidateUris = [
            ...localHttpsConns.map((c) => c.uri),
            ...publicHttpsConns.map((c) => c.uri),
            ...relayHttpsConns.map((c) => c.uri),
            ...localHttpConns.map((c) => c.uri),
            ...connections.map((c) => c.uri).filter(Boolean)
          ].filter((v, i, a) => v && a.indexOf(v) === i);

          const bestLocal = localHttpConns[0] || localHttpsConns[0] || connections[0];
          const preferredHttps =
            localHttpsConns[0]?.uri ||
            publicHttpsConns[0]?.uri ||
            relayHttpsConns[0]?.uri ||
            '';

          if (bestLocal && provides.includes('server')) {
            const hostAddr = bestLocal.address || '';
            const portStr = String(bestLocal.port || '32400');
            const rawHttp = hostAddr ? `http://${hostAddr}:${portStr}` : '';
            if (rawHttp && !orderedCandidateUris.includes(rawHttp)) {
              orderedCandidateUris.push(rawHttp);
            }
            discoveredSrvList.push({
              id: `srv-${clientId || name}`,
              name,
              host: hostAddr,
              port: portStr,
              owned: isOwned,
              httpsUri: preferredHttps,
              candidateUris: orderedCandidateUris,
              token: devToken,
              accessToken: devToken,
              machineIdentifier: clientId,
              status: 'online',
              platform: platform || 'Plex Media Server'
            });
          }

          if (bestLocal && (provides.includes('player') || provides.includes('client'))) {
            discoveredPlrList.push({
              machineIdentifier: clientId,
              name,
              product: product || 'Plex Player',
              address: bestLocal.address || '',
              port: String(bestLocal.port || '32433'),
              httpsUri: preferredHttps,
              candidateUris: orderedCandidateUris,
              platform: platform || 'Plex Client',
              state: 'idle',
              serverId: discoveredSrvList[0]?.id || 'srv-1337pc2',
              serverHost: discoveredSrvList[0]?.host || '192.168.0.32',
              serverPort: '32400',
              serverHttpsUri: discoveredSrvList[0]?.httpsUri || '',
              serverToken: devToken
            });
          }
        });

        if (discoveredSrvList.length > 0) {
          setServers((prev) => {
            const byKey = new Map();
            prev.forEach((s) => byKey.set(s.machineIdentifier || s.host || s.name, s));
            discoveredSrvList.forEach((ds) => {
              const matchKey =
                Array.from(byKey.keys()).find((k) => {
                  const item = byKey.get(k);
                  return (
                    (ds.machineIdentifier && item.machineIdentifier === ds.machineIdentifier) ||
                    (ds.host && item.host === ds.host)
                  );
                }) ||
                ds.machineIdentifier ||
                ds.host ||
                ds.name;
              const existing = byKey.get(matchKey);
              byKey.set(matchKey, {
                ...(existing || {}),
                ...ds,
                token: ds.accessToken || ds.token || existing?.token || cleanToken,
                accessToken: ds.accessToken || ds.token || existing?.accessToken || cleanToken
              });
            });
            return Array.from(byKey.values());
          });
          appendApiLog(
            'GET',
            'plex.tv Resource Discovery',
            'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1',
            `Configured ${discoveredSrvList.length} server(s) with Public/Relay/LAN TLS & per-server accessTokens`,
            '200 OK',
            false
          );
        }

        if (discoveredPlrList.length > 0) {
          setDiscoveredClients((prev) => {
            const map = new Map();
            prev.forEach((p) => map.set(p.machineIdentifier, p));
            discoveredPlrList.forEach((fp) => map.set(fp.machineIdentifier, fp));
            return Array.from(map.values());
          });
        }
      } catch (e) {}
    },
    [appendApiLog]
  );

  useEffect(() => {
    if (globalToken && !syncedTokensRef.current.has(globalToken)) {
      syncedTokensRef.current.add(globalToken);
      discoverPlexDirectResources(globalToken);
    }
  }, [globalToken, discoverPlexDirectResources]);

  useEffect(() => {
    let mounted = true;
    const probeLocalBridge = async () => {
      const candidates = [
        bridgeUrl.trim().replace(/\/+$/, ''),
        'http://192.168.0.16:8765',
        'http://localhost:8765'
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      for (const base of candidates) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1400);
          const res = await fetch(`${base}/health`, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            if (!mounted) return;
            setBridgeAlive(true);
            if (!useBridgeProxy) {
              setUseBridgeProxy(true);
              setBridgeUrl(base);
              triggerToast(`Auto-connected to Local Bridge (${base})`);
            }
            try {
              const cfgRes = await fetch(`${base}/config`);
              if (cfgRes.ok) {
                const cfg = await cfgRes.json();
                if (cfg.token && !globalToken) {
                  setGlobalToken(cfg.token);
                }
              }
            } catch (e) {}
            return;
          }
        } catch (err) {}
      }
      if (mounted) setBridgeAlive(false);
    };

    probeLocalBridge();
    const id = setInterval(probeLocalBridge, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [bridgeUrl, useBridgeProxy, globalToken, triggerToast]);

  const startPlexPinAuth = async () => {
    try {
      setPinState({
        active: true,
        id: null,
        code: '....',
        authUrl: '',
        statusText: 'Requesting PIN from plex.tv...'
      });
      const res = await fetch(
        `https://plex.tv/api/v2/pins?X-Plex-Product=${encodeURIComponent(
          PRODUCT_NAME
        )}&X-Plex-Client-Identifier=${encodeURIComponent(CLIENT_IDENTIFIER)}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json'
          }
        }
      );
      const data = await res.json();
      if (data && data.id && data.code) {
        const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(
          CLIENT_IDENTIFIER
        )}&code=${encodeURIComponent(data.code)}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(
          PRODUCT_NAME
        )}`;
        setPinState({
          active: true,
          id: data.id,
          code: data.code,
          authUrl,
          statusText: 'Approve in the opened Plex tab — polling every 1.5s...'
        });
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      } else {
        setPinState((p) => ({ ...p, active: false }));
        triggerToast('Could not generate Plex PIN', 'warn');
      }
    } catch (e) {
      setPinState((p) => ({ ...p, active: false }));
      triggerToast('Error contacting plex.tv PIN service', 'warn');
    }
  };

  useEffect(() => {
    if (!pinState.active || !pinState.id) return;
    const pollId = setInterval(async () => {
      try {
        const res = await fetch(
          `https://plex.tv/api/v2/pins/${pinState.id}?code=${encodeURIComponent(
            pinState.code
          )}&X-Plex-Client-Identifier=${encodeURIComponent(CLIENT_IDENTIFIER)}`,
          {
            headers: { Accept: 'application/json' }
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.authToken) {
            clearInterval(pollId);
            setGlobalToken(data.authToken);
            setServers((prev) =>
              prev.map((s) => ({
                ...s,
                token: s.token || data.authToken,
                accessToken: s.accessToken || data.authToken
              }))
            );
            setPinState({
              active: false,
              id: null,
              code: '',
              authUrl: '',
              statusText: ''
            });
            triggerToast('Plex Account Linked! Discovering HTTPS *.plex.direct servers...');
            discoverPlexDirectResources(data.authToken);
          }
        }
      } catch (e) {}
    }, 1500);
    return () => clearInterval(pollId);
  }, [pinState.active, pinState.id, pinState.code, discoverPlexDirectResources, triggerToast]);

  const buildRequestUrl = useCallback(
    (rawUrl, extraHeaders = {}) => {
      if (useBridgeProxy && bridgeUrl.trim()) {
        const cleanBridge = bridgeUrl.trim().replace(/\/+$/, '');
        const params = new URLSearchParams({ url: rawUrl });
        if (Object.keys(extraHeaders).length > 0) {
          params.set('headers', JSON.stringify(extraHeaders));
        }
        return `${cleanBridge}/proxy?${params.toString()}`;
      }
      return rawUrl;
    },
    [useBridgeProxy, bridgeUrl]
  );

  const fetchPlexEndpoint = useCallback(
    async (rawUrl, token, extraHeaders = {}, timeoutMs = 3200) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let urlWithToken = rawUrl;
      if (token && !urlWithToken.includes('X-Plex-Token=')) {
        const sep = urlWithToken.includes('?') ? '&' : '?';
        urlWithToken = `${urlWithToken}${sep}X-Plex-Token=${encodeURIComponent(token)}`;
      }

      const shouldProxy =
        (useBridgeProxy || bridgeAlive) &&
        bridgeUrl.trim() &&
        (urlWithToken.startsWith('http://') ||
          /^https:\/\/(192-168-|10-|172-)/.test(urlWithToken));

      const proxyHeaders = {
        Accept: 'application/json, text/xml, */*',
        ...extraHeaders,
        ...(token ? { 'X-Plex-Token': token } : {})
      };

      const targetUrl = shouldProxy
        ? buildRequestUrl(urlWithToken, proxyHeaders)
        : urlWithToken;

      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json, text/xml, */*' },
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text, url: targetUrl, rawUrl: urlWithToken };
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    },
    [buildRequestUrl, useBridgeProxy, bridgeAlive, bridgeUrl]
  );

  const fetchServerEndpointWithFallback = useCallback(
    async (srv, pathWithQuery, extraHeaders = {}, timeoutMs = 2800) => {
      const effectiveToken = srv.accessToken || srv.token || globalToken;
      const candidates = [];
      const cachedWorking = workingUriCacheRef.current[srv.id];
      if (cachedWorking) candidates.push(cachedWorking);

      if ((useBridgeProxy || bridgeAlive) && srv.host) {
        const rawLanHttp = `http://${srv.host}:${srv.port || '32400'}`;
        if (!candidates.includes(rawLanHttp)) candidates.push(rawLanHttp);
      }

      getServerCandidateUris(srv).forEach((u) => {
        if (!candidates.includes(u)) candidates.push(u);
      });

      let lastError = null;
      let lastResponse = null;

      for (const base of candidates) {
        const cleanBase = base.replace(/\/+$/, '');
        const fullUrl = `${cleanBase}${pathWithQuery}`;
        try {
          const res = await fetchPlexEndpoint(fullUrl, effectiveToken, extraHeaders, timeoutMs);
          if (res.ok) {
            workingUriCacheRef.current[srv.id] = cleanBase;
            return { ...res, activeBaseUri: cleanBase, effectiveToken };
          }
          lastResponse = { ...res, activeBaseUri: cleanBase, effectiveToken };
        } catch (err) {
          lastError = err;
        }
      }

      if (lastResponse) return lastResponse;
      throw lastError || new Error('All server candidate URIs failed');
    },
    [globalToken, useBridgeProxy, bridgeAlive, fetchPlexEndpoint]
  );

  const pollAllSessionsAndClients = useCallback(async () => {
    const gatheredSessions = [];
    const gatheredClientsMap = new Map();
    const diagMap = {};
    let anySuccess = false;
    let anyCorsError = false;

    await Promise.all(
      servers.map(async (srv) => {
        const effectiveToken = srv.accessToken || srv.token || globalToken;
        const tokenParam = effectiveToken
          ? `?X-Plex-Token=${encodeURIComponent(effectiveToken)}`
          : '';

        try {
          const res = await fetchServerEndpointWithFallback(
            srv,
            `/status/sessions${tokenParam}`,
            {},
            2800
          );
          if (res.ok) {
            anySuccess = true;
            let parsed = [];
            const trimmed = res.text.trim();
            if (trimmed.startsWith('{')) {
              parsed = normalizeJsonSessions(
                JSON.parse(trimmed),
                { ...srv, token: effectiveToken, accessToken: effectiveToken },
                res.activeBaseUri
              );
            } else if (trimmed.startsWith('<')) {
              parsed = parseXmlToJsonSessions(
                trimmed,
                { ...srv, token: effectiveToken, accessToken: effectiveToken },
                res.activeBaseUri
              );
            }

            diagMap[srv.id] = {
              serverName: srv.name,
              host: srv.host,
              ok: true,
              status: `HTTP ${res.status} OK`,
              activeBaseUri: res.activeBaseUri,
              sessionCount: parsed.length,
              detail:
                parsed.length > 0
                  ? `Playing: ${parsed.map((p) => p.title).join(', ')}`
                  : 'Connected (0 active streams reported by server)'
            };

            parsed.forEach((sess) => {
              gatheredSessions.push(sess);
              if (sess.Player) {
                const machineId =
                  sess.Player.machineIdentifier ||
                  `active-${sess.Player.address || srv.host}-${sess.Player.title || 'player'}`;
                sess.Player.machineIdentifier = machineId;
                gatheredClientsMap.set(machineId, {
                  machineIdentifier: machineId,
                  name: sess.Player.title || sess.Player.product || 'Active Plex Player',
                  product: sess.Player.product || 'Plex Player',
                  address: sess.Player.address || srv.host,
                  port: String(sess.Player.port || '32433'),
                  platform: sess.Player.platform || 'LAN Player',
                  state: sess.Player.state || 'playing',
                  serverId: srv.id,
                  serverName: srv.name,
                  serverHost: srv.host,
                  serverPort: srv.port,
                  serverHttpsUri: res.activeBaseUri || srv.httpsUri || '',
                  serverToken: effectiveToken
                });
              }
            });
          } else {
            diagMap[srv.id] = {
              serverName: srv.name,
              host: srv.host,
              ok: false,
              status: `HTTP ${res.status}`,
              activeBaseUri: res.activeBaseUri || getServerBaseUrl(srv),
              sessionCount: 0,
              detail:
                res.status === 401
                  ? '401 Unauthorized — Link Plex Account or update server token'
                  : res.status === 403
                  ? '403 Shared Server (Owner restricts /status/sessions)'
                  : `Server returned HTTP ${res.status}`
            };
          }
        } catch (err) {
          anyCorsError = true;
          diagMap[srv.id] = {
            serverName: srv.name,
            host: srv.host,
            ok: false,
            status: 'PNA / CORS Blocked',
            activeBaseUri: getServerBaseUrl(srv),
            sessionCount: 0,
            detail:
              'Browser blocked private LAN IP. Run the 1-Line Konsole Bridge below to unlock.'
          };
        }

        try {
          const cRes = await fetchServerEndpointWithFallback(
            srv,
            `/clients${tokenParam}`,
            {},
            2400
          );
          if (cRes.ok) {
            anySuccess = true;
            const cText = cRes.text.trim();
            if (cText.startsWith('{')) {
              const cJson = JSON.parse(cText);
              const list = cJson?.MediaContainer?.Server || [];
              list.forEach((c) => {
                if (c.machineIdentifier && !gatheredClientsMap.has(c.machineIdentifier)) {
                  gatheredClientsMap.set(c.machineIdentifier, {
                    machineIdentifier: c.machineIdentifier,
                    name: c.name || c.title || 'Plex Player',
                    product: c.product || 'Plex Media Player',
                    address: c.address || c.host || srv.host,
                    port: String(c.port || '32433'),
                    platform: c.platform || c.deviceClass || 'LAN Client',
                    state: 'idle',
                    serverId: srv.id,
                    serverName: srv.name,
                    serverHost: srv.host,
                    serverPort: srv.port,
                    serverHttpsUri: cRes.activeBaseUri || srv.httpsUri || '',
                    serverToken: effectiveToken
                  });
                }
              });
            } else if (cText.startsWith('<')) {
              const xmlList = parseXmlClients(
                cText,
                { ...srv, token: effectiveToken, accessToken: effectiveToken },
                cRes.activeBaseUri
              );
              xmlList.forEach((c) => {
                if (c.machineIdentifier && !gatheredClientsMap.has(c.machineIdentifier)) {
                  gatheredClientsMap.set(c.machineIdentifier, {
                    ...c,
                    state: 'idle',
                    serverName: srv.name
                  });
                }
              });
            }
          }
        } catch (err) {
          anyCorsError = true;
        }
      })
    );

    setServerDiagnostics(diagMap);
    setActiveSessions(gatheredSessions);

    if (anySuccess) {
      const mergedClients = Array.from(gatheredClientsMap.values());
      setDiscoveredClients((prev) => {
        const map = new Map();
        prev.forEach((p) => map.set(p.machineIdentifier, { ...p, state: 'idle' }));
        mergedClients.forEach((m) => map.set(m.machineIdentifier, m));
        return Array.from(map.values());
      });

      setSelectedClientMachineId((currentId) => {
        const playingSess =
          gatheredSessions.find((s) => s.Player?.state === 'playing') || gatheredSessions[0];
        if (playingSess && playingSess.Player?.machineIdentifier) {
          const currentHasActiveSession = gatheredSessions.some(
            (s) => s.Player?.machineIdentifier === currentId
          );
          if (!currentId || !currentHasActiveSession) {
            return playingSess.Player.machineIdentifier;
          }
        }
        if (currentId && gatheredClientsMap.has(currentId)) return currentId;
        if (!currentId && mergedClients.length > 0) {
          return mergedClients[0].machineIdentifier;
        }
        return currentId;
      });

      const reachableCount = Object.values(diagMap).filter((d) => d.ok).length;
      const modeTag = bridgeAlive
        ? 'Local Bridge 127.0.0.1:8765'
        : 'TLS *.plex.direct';

      setLastHttpStatus({
        ok: reachableCount > 0,
        code:
          reachableCount > 0
            ? `200 LIVE (${modeTag})`
            : 'LAN PNA BLOCKED',
        text: `${gatheredSessions.length} active stream(s) • ${reachableCount}/${servers.length} server(s) reachable`,
        corsBlocked: anyCorsError || reachableCount === 0
      });
    } else if (anyCorsError) {
      setLastHttpStatus({
        ok: false,
        code: 'PNA / LAN BLOCKED',
        text: 'Browser Private Network Access blocked direct LAN IP calls. Run the 1-Line Bridge below!',
        corsBlocked: true
      });
    }
  }, [servers, globalToken, fetchServerEndpointWithFallback, bridgeAlive]);

  useEffect(() => {
    pollAllSessionsAndClients();
    const interval = setInterval(pollAllSessionsAndClients, 2000);
    return () => clearInterval(interval);
  }, [pollAllSessionsAndClients]);

  const fetchLiveLibraries = useCallback(async () => {
    setIsLoadingLibrary(true);
    const sectionsCollected = [];
    const itemsCollected = [];

    const targetServers =
      selectedLibraryServerId === 'ALL'
        ? servers
        : servers.filter((s) => s.id === selectedLibraryServerId);

    await Promise.all(
      targetServers.map(async (srv) => {
        const effectiveToken = srv.accessToken || srv.token || globalToken;
        if (!effectiveToken) return;
        const secPath = `/library/sections?X-Plex-Token=${encodeURIComponent(effectiveToken)}`;
        try {
          const res = await fetchServerEndpointWithFallback(srv, secPath, {}, 3500);
          if (res.ok) {
            let dirs = [];
            const t = res.text.trim();
            if (t.startsWith('{')) {
              dirs = JSON.parse(t)?.MediaContainer?.Directory || [];
            } else if (t.startsWith('<')) {
              const doc = new DOMParser().parseFromString(t, 'text/xml');
              dirs = Array.from(doc.querySelectorAll('Directory')).map((d) => ({
                key: d.getAttribute('key'),
                title: d.getAttribute('title'),
                type: d.getAttribute('type')
              }));
            }
            dirs.forEach((d) => {
              sectionsCollected.push({
                id: `${srv.id}:${d.key}`,
                key: d.key,
                title: d.title,
                type: d.type,
                serverId: srv.id,
                serverName: srv.name,
                serverHost: srv.host,
                serverPort: srv.port,
                serverHttpsUri: res.activeBaseUri || srv.httpsUri || '',
                serverToken: effectiveToken,
                serverMachineId: srv.machineIdentifier
              });
            });
          }
        } catch (e) {}

        let feedPath = '/library/recentlyAdded';
        if (searchQuery.trim()) {
          feedPath = `/hubs/search?query=${encodeURIComponent(searchQuery.trim())}&limit=30`;
        } else if (selectedSectionKey !== 'RECENT' && selectedSectionKey.startsWith(`${srv.id}:`)) {
          const rawSecKey = selectedSectionKey.split(':')[1];
          feedPath = `/library/sections/${rawSecKey}/all`;
        }

        const joinChar = feedPath.includes('?') ? '&' : '?';
        const itemsPath = `${feedPath}${joinChar}X-Plex-Token=${encodeURIComponent(effectiveToken)}`;

        try {
          const iRes = await fetchServerEndpointWithFallback(srv, itemsPath, {}, 4000);
          if (iRes.ok) {
            const t = iRes.text.trim();
            let rawList = [];
            if (t.startsWith('{')) {
              const j = JSON.parse(t);
              if (j?.MediaContainer?.Metadata) {
                rawList = j.MediaContainer.Metadata;
              } else if (j?.MediaContainer?.Hub) {
                j.MediaContainer.Hub.forEach((h) => {
                  if (h.Metadata) rawList.push(...h.Metadata);
                });
              }
            } else if (t.startsWith('<')) {
              const doc = new DOMParser().parseFromString(t, 'text/xml');
              rawList = Array.from(doc.querySelectorAll('Video, Track, Directory')).map((n) => ({
                ratingKey: n.getAttribute('ratingKey'),
                key: n.getAttribute('key'),
                title: n.getAttribute('title'),
                grandparentTitle: n.getAttribute('grandparentTitle'),
                parentTitle: n.getAttribute('parentTitle'),
                year: n.getAttribute('year'),
                type: n.getAttribute('type') || n.tagName.toLowerCase(),
                summary: n.getAttribute('summary'),
                duration: Number(n.getAttribute('duration') || 0),
                thumb: n.getAttribute('thumb') || n.getAttribute('grandparentThumb')
              }));
            }

            rawList.slice(0, 60).forEach((item) => {
              if (!item.ratingKey) return;
              const media = (item.Media && item.Media[0]) || {};
              itemsCollected.push({
                ratingKey: String(item.ratingKey),
                key: item.key || `/library/metadata/${item.ratingKey}`,
                title: item.title || 'Untitled',
                grandparentTitle: item.grandparentTitle || '',
                parentTitle: item.parentTitle || '',
                year: item.year || '',
                type: item.type || 'video',
                summary: item.summary || '',
                duration: Number(item.duration || 0),
                thumb: item.thumb || item.grandparentThumb || '',
                resolution: media.videoResolution ? media.videoResolution.toUpperCase() : '',
                audioCodec: media.audioCodec ? media.audioCodec.toUpperCase() : '',
                serverId: srv.id,
                serverName: srv.name,
                serverHost: srv.host,
                serverPort: srv.port,
                serverHttpsUri: iRes.activeBaseUri || srv.httpsUri || '',
                serverToken: effectiveToken,
                serverMachineId: srv.machineIdentifier
              });
            });
          }
        } catch (e) {}
      })
    );

    setLibrarySections(sectionsCollected);
    setLibraryItems(itemsCollected);
    setIsLoadingLibrary(false);
  }, [servers, globalToken, selectedLibraryServerId, selectedSectionKey, searchQuery, fetchServerEndpointWithFallback]);

  useEffect(() => {
    if (activeTab === 'library') {
      fetchLiveLibraries();
    }
  }, [activeTab, fetchLiveLibraries]);

  const activeSessionForClient = useMemo(() => {
    if (selectedClientMachineId) {
      const matched = activeSessions.find(
        (s) => s.Player?.machineIdentifier === selectedClientMachineId
      );
      if (matched) return matched;
    }
    return activeSessions[0] || null;
  }, [activeSessions, selectedClientMachineId]);

  const activeClient = useMemo(() => {
    const matchedClient = discoveredClients.find(
      (c) => c.machineIdentifier === selectedClientMachineId
    );
    if (matchedClient) return matchedClient;
    if (activeSessionForClient && activeSessionForClient.Player) {
      return {
        machineIdentifier: activeSessionForClient.Player.machineIdentifier,
        name: activeSessionForClient.Player.title || activeSessionForClient.Player.product || 'Active Player',
        product: activeSessionForClient.Player.product || 'Plex Player',
        address: activeSessionForClient.Player.address || activeSessionForClient.serverHost,
        port: String(activeSessionForClient.Player.port || '32433'),
        state: activeSessionForClient.Player.state || 'playing',
        serverId: activeSessionForClient.serverId,
        serverHost: activeSessionForClient.serverHost,
        serverPort: activeSessionForClient.serverPort,
        serverHttpsUri: activeSessionForClient.serverHttpsUri || '',
        serverToken: activeSessionForClient.serverToken
      };
    }
    return discoveredClients[0] || null;
  }, [discoveredClients, selectedClientMachineId, activeSessionForClient]);

  const executePlayerCommand = async (commandPath, queryParams = {}, friendlyLabel = 'Command') => {
    if (!activeClient) {
      triggerToast('No target Plex Player detected yet. Link Plex Account or start playback.', 'warn');
      return;
    }

    const cmdId = commandIdCounter;
    setCommandIdCounter((c) => c + 1);

    const originServer =
      servers.find((s) => s.id === (activeSessionForClient?.serverId || activeClient.serverId)) ||
      servers[0];
    const effectiveToken = activeSessionForClient?.serverToken || activeClient.serverToken || originServer?.token || globalToken || atob("c19EWXhoZU1STVFLUmpvOU1LcVM=");

    const serverBase = getServerBaseUrl(originServer);
    const rawAddr = activeSessionForClient?.Player?.address || activeClient.address || originServer.host;
    const playerAddr = (rawAddr === '127.0.0.1' || rawAddr === 'localhost') ? originServer.host : rawAddr;
    const playerPort = activeSessionForClient?.Player?.port || activeClient.port || '32433';
    const targetMachineId =
      activeSessionForClient?.Player?.machineIdentifier || activeClient.machineIdentifier;

    const baseQuery = new URLSearchParams({
      commandID: String(cmdId),
      type: activeSessionForClient?.type === 'track' ? 'music' : 'video',
      ...queryParams,
      'X-Plex-Target-Client-Identifier': targetMachineId,
      'X-Plex-Client-Identifier': CLIENT_IDENTIFIER,
      'X-Plex-Device-Name': PRODUCT_NAME,
      ...(effectiveToken ? { 'X-Plex-Token': effectiveToken } : {})
    });

    const systemPlayersPath = commandPath.replace(/^\/player\//, `/system/players/${playerAddr}/`);
    const prong1SystemRelayUrl = `${serverBase}${systemPlayersPath}?${baseQuery.toString()}`;
    const prong2ServerPlayerUrl = `${serverBase}${commandPath}?${baseQuery.toString()}`;
    const prong3DirectClientUrl = `http://${playerAddr}:${playerPort}${commandPath}?${baseQuery.toString()}`;

    const headers = {
      Accept: '*/*',
      'X-Plex-Target-Client-Identifier': targetMachineId,
      'X-Plex-Client-Identifier': CLIENT_IDENTIFIER,
      'X-Plex-Device-Name': PRODUCT_NAME,
      ...(effectiveToken ? { 'X-Plex-Token': effectiveToken } : {})
    };

    let succeeded = false;

    const prongs = [
      { label: `Direct Agent (${playerAddr}:${playerPort})`, url: prong3DirectClientUrl },
      { label: `${originServer.name} System Relay`, url: prong1SystemRelayUrl },
      { label: `${originServer.name} Companion`, url: prong2ServerPlayerUrl }
    ];
    if (useBridgeProxy || window.location.protocol === 'http:') {
      prongs.push({ label: `Direct Player (${playerAddr}:${playerPort})`, url: prong3DirectClientUrl });
    }

    for (const prong of prongs) {
      if (succeeded) break;
      try {
        const res = await fetchPlexEndpoint(prong.url, effectiveToken, headers, 2400);
        appendApiLog(
          'GET',
          prong.label,
          prong.url,
          `${friendlyLabel} -> ${activeClient.name}`,
          `${res.status} ${res.ok ? 'OK' : 'Resp'}`,
          !res.ok
        );
        if (res.ok) {
          succeeded = true;
        }
      } catch (err) {
        appendApiLog(
          'GET',
          prong.label,
          prong.url,
          `${friendlyLabel} (Network/CORS Block)`,
          'Blocked / Failed',
          true
        );
      }
    }

    if (succeeded) {
      triggerToast(`${friendlyLabel} sent to ${activeClient.name}`);
      setTimeout(pollAllSessionsAndClients, 350);
    } else {
      triggerToast(
        'Command blocked — click "1-Click Plex PIN Sign-In" or start Local Bridge',
        'warn'
      );
    }
  };

  const handleTogglePlayPause = () => {
    const currentState = activeSessionForClient?.Player?.state || activeClient?.state || 'paused';
    const isPlayingNow = currentState === 'playing';
    const primaryEndpoint = isPlayingNow ? '/player/playback/pause' : '/player/playback/play';

    setActiveSessions((prev) =>
      prev.map((s) =>
        s.Player?.machineIdentifier === activeClient?.machineIdentifier
          ? {
              ...s,
              Player: { ...s.Player, state: isPlayingNow ? 'paused' : 'playing' }
            }
          : s
      )
    );

    executePlayerCommand(
      primaryEndpoint,
      {},
      isPlayingNow ? 'Pause Playback' : 'Resume Playback'
    );
  };

  const handleExplicitPlayPauseToggle = () => {
    executePlayerCommand('/player/playback/playPause', {}, 'Play/Pause Toggle');
  };

  const handleStopPlayback = () => {
    executePlayerCommand('/player/playback/stop', {}, 'Stop Playback');
  };

  const handleSkipNext = () => {
    executePlayerCommand('/player/playback/skipNext', {}, 'Skip Next');
  };

  const handleSkipPrevious = () => {
    executePlayerCommand('/player/playback/skipPrevious', {}, 'Skip Previous');
  };

  const handleStepForward = () => {
    executePlayerCommand('/player/playback/stepForward', { dir: 'fwd' }, 'Step Forward (+30s)');
  };

  const handleStepBack = () => {
    executePlayerCommand('/player/playback/stepBack', { dir: 'back' }, 'Step Back (-15s)');
  };

  const handleScrubSeek = (newOffsetMs) => {
    const prevOffsetMs = activeSessionForClient?.viewOffset || 0;
    const targetMs = Number(newOffsetMs);
    const deltaMs = targetMs - prevOffsetMs;
    const lockUntil = Date.now() + 2800;
    (window as any).__plexScrubLock = {
      machineId: activeClient?.machineIdentifier,
      offset: targetMs,
      until: lockUntil
    };
    setActiveSessions((prev) =>
      prev.map((s) =>
        s.Player?.machineIdentifier === activeClient?.machineIdentifier
          ? { ...s, viewOffset: targetMs }
          : s
      )
    );
    executePlayerCommand(
      '/player/playback/seekTo',
      {
        offset: String(targetMs),
        fromOffset: String(prevOffsetMs),
        deltaMs: String(deltaMs),
        duration: String(activeSessionForClient?.duration || 0)
      },
      `Seek to ${formatDuration(targetMs)}`
    );
    setTimeout(() => {
      setActiveSessions((prev) =>
        prev.map((s) =>
          s.Player?.machineIdentifier === activeClient?.machineIdentifier
            ? { ...s, viewOffset: targetMs }
            : s
        )
      );
    }, 450);
  };

  const handleVolumeChange = (vol) => {
    if (!activeClient) return;
    setClientVolumes((prev) => ({
      ...prev,
      [activeClient.machineIdentifier]: vol
    }));
    executePlayerCommand(
      '/player/playback/setParameters',
      { volume: String(vol) },
      `Volume ${vol}%`
    );
  };

  const handleDpadNavigation = (action, label) => {
    executePlayerCommand(`/player/navigation/${action}`, {}, `D-Pad ${label}`);
  };

  const handleCastLibraryItem = async (item) => {
    if (!activeClient) {
      triggerToast('Select a target Plex Player first', 'warn');
      return;
    }

    let machineId = item.serverMachineId;
    if (!machineId) {
      try {
        const base = item.serverHttpsUri || `http://${item.serverHost}:${item.serverPort}`;
        const idRes = await fetchPlexEndpoint(`${base}/identity`, item.serverToken, {}, 2000);
        if (idRes.ok && idRes.text.trim().startsWith('{')) {
          machineId = JSON.parse(idRes.text)?.MediaContainer?.machineIdentifier || '';
        }
      } catch (e) {}
    }

    await executePlayerCommand(
      '/player/playback/playMedia',
      {
        key: `/library/metadata/${item.ratingKey}`,
        offset: '0',
        machineIdentifier: machineId || item.serverId,
        address: item.serverHost,
        port: item.serverPort,
        protocol: 'http',
        ...(item.serverToken ? { token: item.serverToken } : {})
      },
      `Play "${item.title}"`
    );
    setActiveTab('remote');
  };

  const handleApplyManualToken = (e) => {
    e.preventDefault();
    if (!manualTokenInput.trim()) return;
    const clean = manualTokenInput.trim();
    setGlobalToken(clean);
    setServers((prev) => prev.map((s) => ({ ...s, token: s.token || clean })));
    setManualTokenInput('');
    triggerToast('X-Plex-Token saved! Discovering HTTPS *.plex.direct endpoints...');
    discoverPlexDirectResources(clean);
  };

  const handlePlexTvSignIn = async (e) => {
    e.preventDefault();
    if (!plexUsername.trim() || !plexPassword.trim()) return;
    setIsSigningIn(true);
    try {
      const res = await fetch('https://plex.tv/users/sign_in.json', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Plex-Client-Identifier': CLIENT_IDENTIFIER,
          'X-Plex-Product': PRODUCT_NAME,
          'X-Plex-Version': '2.0'
        },
        body: new URLSearchParams({
          'user[login]': plexUsername.trim(),
          'user[password]': plexPassword
        })
      });
      const data = await res.json();
      const authToken = data?.user?.authToken || data?.user?.authentication_token;
      if (authToken) {
        setGlobalToken(authToken);
        setServers((prev) =>
          prev.map((s) => ({ ...s, token: s.token || authToken }))
        );
        setPlexPassword('');
        triggerToast('Signed in to plex.tv! Discovering *.plex.direct HTTPS endpoints...');
        await discoverPlexDirectResources(authToken);
      } else {
        triggerToast(data?.error || 'Could not sign in — use 1-Click PIN Auth', 'warn');
      }
    } catch (err) {
      triggerToast('Sign-in failed — use 1-Click PIN Auth or paste X-Plex-Token', 'warn');
    }
    setIsSigningIn(false);
  };

  const handleAddServer = (e) => {
    e.preventDefault();
    if (!newServerName.trim() || !newServerHost.trim()) return;
    const srv = {
      id: `srv-${Date.now()}`,
      name: newServerName.trim(),
      host: newServerHost.trim(),
      port: newServerPort.trim() || '32400',
      httpsUri: '',
      token: newServerToken.trim() || globalToken,
      machineIdentifier: '',
      status: 'online',
      platform: 'Plex Media Server'
    };
    setServers((prev) => [...prev, srv]);
    setNewServerName('');
    setNewServerHost('192.168.0.');
    setNewServerToken('');
    triggerToast(`Added server ${srv.name}`);
  };

  const updateServerField = (id, field, value) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const removeServer = (id) => {
    if (servers.length <= 1) return;
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  const resolvePlexImageUrl = useCallback((serverHttpsUri, serverHost, serverPort, thumbPath, token) => {
    if (!thumbPath) return null;
    const effectiveToken = token || globalToken || atob("c19EWXhoZU1STVFLUmpvOU1LcVM=");
    const isAndroidApp = typeof window !== 'undefined' && (window.location.hostname === 'localhost' && !window.location.port);
    const base = serverHttpsUri || `http://${serverHost || '192.168.0.32'}:${serverPort || 32400}`;
    const sep = thumbPath.includes('?') ? '&' : '?';
    const rawThumb = thumbPath.startsWith('http')
      ? `${thumbPath}${sep}X-Plex-Token=${encodeURIComponent(effectiveToken)}`
      : `${base}${thumbPath.startsWith('/') ? '' : '/'}${thumbPath}${sep}X-Plex-Token=${encodeURIComponent(effectiveToken)}`;
    if (isAndroidApp) {
      return rawThumb;
    }
    return rawThumb;
  }, [globalToken, useBridgeProxy, bridgeUrl, buildRequestUrl]);

  const activeArtworkUrl = useMemo(() => {
    if (!activeSessionForClient || !activeSessionForClient.thumb) return null;
    return resolvePlexImageUrl(
      activeSessionForClient.serverHttpsUri,
      activeSessionForClient.serverHost,
      activeSessionForClient.serverPort,
      activeSessionForClient.thumb,
      activeSessionForClient.serverToken || globalToken
    );
  }, [activeSessionForClient, globalToken, resolvePlexImageUrl]);

  const pythonBridgeOneLiner = useMemo(() => {
    return `python3 -c '
import http.server, urllib.request, urllib.parse, json

class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self.send_response(200); self._cors()
            self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(b"{\\"ok\\":true}"); return
        q = urllib.parse.parse_qs(parsed.query)
        target = q.get("url", [None])[0]
        hdrs = json.loads(q.get("headers", ["{}"])[0])
        if not target:
            self.send_response(400); self._cors(); self.end_headers(); return
        req = urllib.request.Request(target, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                body = r.read()
                self.send_response(r.status); self._cors()
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                self.end_headers(); self.wfile.write(body)
        except Exception as e:
            self.send_response(502); self._cors(); self.end_headers()
            self.wfile.write(str(e).encode())

print("Plex Connect Local Bridge active on http://192.168.0.16:8765")
http.server.ThreadingHTTPServer(("0.0.0.0", 8765), Handler).serve_forever()
'`;
  }, []);

  const currentVolume = activeClient
    ? clientVolumes[activeClient.machineIdentifier] ?? 80
    : 80;

  const needsSetupBanner =
    (!globalToken && servers.every((s) => !s.token)) || lastHttpStatus.corsBlocked;

  return (
    <div className="min-h-screen bg-[#0b0c10] text-zinc-100 flex flex-col font-sans selection:bg-[#ff6a00] selection:text-black">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#12141c] border border-[#ff6a00]/50 shadow-2xl">
          <Sparkles className="w-4 h-4 text-[#ff6a00] shrink-0" />
          <span className="text-xs font-semibold text-zinc-100">{toast.message}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-[#0b0c10]/95 backdrop-blur-xl border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff6a00] to-amber-600 flex items-center justify-center shadow-lg shadow-[#ff6a00]/20">
              <Cast className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  PLEX <span className="text-[#ff6a00]">CONNECT</span>
                </h1>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border ${
                    lastHttpStatus.ok
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {lastHttpStatus.code}
                </span>
                {bridgeAlive && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    BRIDGE 127.0.0.1:8765
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 truncate max-w-xs sm:max-w-md">
                {lastHttpStatus.text}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!globalToken ? (
              <button
                onClick={startPlexPinAuth}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Link Plex Account (PIN)</span>
              </button>
            ) : null}

            <button
              onClick={() => setShowServerModal(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#12141c] hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center gap-1.5 transition"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#ff6a00]" />
              <span>Servers & Token</span>
            </button>

            <button
              onClick={() => setShowConnectSheet(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#ff6a00] hover:bg-[#ff7b1a] text-black flex items-center gap-1.5 shadow-lg shadow-[#ff6a00]/20 transition"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="max-w-[150px] truncate">
                {activeClient ? activeClient.name : 'Select Player'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {needsSetupBanner && (
        <div className="bg-[#12141c] border-b border-[#ff6a00]/40 px-4 py-4">
          <div className="max-w-5xl mx-auto space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#ff6a00]">
                <Zap className="w-4 h-4 shrink-0" />
                <span>
                  QUICK-START ACTIVATION: Connect Canvas Preview to 1337PC2 (192.168.0.32) & LVRPC (192.168.0.11)
                </span>
              </div>
              {pinState.active && (
                <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/40 px-3 py-1 rounded-full text-xs text-emerald-300 font-mono">
                  <span>PIN CODE: {pinState.code}</span>
                  {pinState.authUrl && (
                    <a
                      href={pinState.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold flex items-center gap-1 text-white"
                    >
                      <span>Open Plex Auth</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Option A: 1-Click Plex TLS Direct (*.plex.direct)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Works Instantly in Browser
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Links your Plex account or X-Plex-Token and automatically fetches your servers&apos; official `https://*.plex.direct:32400` TLS certificates so this HTTPS preview can poll `/status/sessions` and pause/skip without Mixed-Content blocks.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={startPlexPinAuth}
                    className="px-3 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#ff7b1a] text-black font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{pinState.active ? `Waiting for PIN ${pinState.code}...` : '1-Click Link Plex Account'}</span>
                  </button>
                  <form onSubmit={handleApplyManualToken} className="flex-1 flex items-center gap-1.5 min-w-[200px]">
                    <input
                      type="text"
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="Or paste X-Plex-Token here..."
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-[#12141c] border border-white/10 text-xs font-mono text-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white"
                    >
                      Save
                    </button>
                  </form>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Option B: Local Loopback Bridge (127.0.0.1:8765)
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      bridgeAlive
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {bridgeAlive ? 'CONNECTED' : 'Required for Private LAN IPs'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Run the 1-line Python bridge in Konsole/Terminal on this PC to relay raw LAN HTTP calls (`192.168.0.32` & `192.168.0.11`) with Private Network CORS headers.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      try {
                        navigator.clipboard?.writeText(pythonBridgeOneLiner);
                      } catch (e) {}
                      setShowBridgeCopyModal(true);
                      triggerToast('1-Line Konsole Bridge ready! Copy & paste into Konsole.');
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Show & Copy 1-Line Konsole Command</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('bridge')}
                    className="px-3 py-2 rounded-xl bg-[#12141c] hover:bg-zinc-800 border border-white/10 text-zinc-300 font-semibold text-xs"
                  >
                    View Bridge Logs
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-4 pb-28">
        {activeTab === 'remote' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 flex flex-col gap-4">
              {activeSessions.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {activeSessions.map((sess) => {
                    const isPicked =
                      activeSessionForClient?.ratingKey === sess.ratingKey &&
                      activeSessionForClient?.Player?.machineIdentifier ===
                        sess.Player?.machineIdentifier;
                    return (
                      <button
                        key={`${sess.serverId}-${sess.ratingKey}-${sess.Player?.machineIdentifier}`}
                        onClick={() =>
                          setSelectedClientMachineId(sess.Player?.machineIdentifier || '')
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition flex items-center gap-2 ${
                          isPicked
                            ? 'bg-[#ff6a00] text-black border-[#ff6a00]'
                            : 'bg-[#12141c] text-zinc-300 border-white/10 hover:text-white'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>
                          {sess.Player?.title}: {sess.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeSessionForClient ? (
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#12141c] p-6 shadow-2xl">
                  <div className="flex items-center justify-between gap-2 mb-5">
                    <button
                      onClick={() => setShowConnectSheet(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-white/15 text-xs font-semibold text-emerald-400"
                    >
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                      <span>
                        {activeSessionForClient.Player?.title || activeClient?.name} (
                        {activeSessionForClient.Player?.state?.toUpperCase()})
                      </span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    <span className="px-2.5 py-1 rounded-full bg-[#ff6a00]/15 border border-[#ff6a00]/30 text-[11px] font-semibold text-[#ff6a00]">
                      {activeSessionForClient.serverName} ({activeSessionForClient.serverHost})
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-end my-2">
                    <div className="w-36 h-52 sm:w-40 sm:h-56 rounded-2xl bg-black/60 border border-white/15 shadow-2xl overflow-hidden shrink-0 flex items-center justify-center relative">
                      {activeArtworkUrl ? (
                        <img
                                src={activeArtworkUrl}
                                alt={activeSessionForClient.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  const tok = encodeURIComponent(activeSessionForClient.serverToken || globalToken || atob("c19EWXhoZU1STVFLUmpvOU1LcVM="));
                                  const fallback = `http://${activeSessionForClient.serverHost || '192.168.0.32'}:${activeSessionForClient.serverPort || 32400}${activeSessionForClient.thumb}?X-Plex-Token=${tok}`;
                                  if (t.src !== fallback) t.src = fallback;
                                }}
                              />
                      ) : (
                        <Film className="w-14 h-14 text-[#ff6a00]/70" />
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                      {activeSessionForClient.grandparentTitle && (
                        <div className="text-xs uppercase tracking-wider text-[#ff6a00] font-bold mb-1">
                          {activeSessionForClient.grandparentTitle}
                          {activeSessionForClient.parentTitle
                            ? ` • ${activeSessionForClient.parentTitle}`
                            : ''}
                        </div>
                      )}
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-2">
                        {activeSessionForClient.title}
                      </h2>
                      {activeSessionForClient.summary && (
                        <p className="text-xs text-zinc-300 line-clamp-3 mb-4">
                          {activeSessionForClient.summary}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        {activeSessionForClient.year && (
                          <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-zinc-200">
                            {activeSessionForClient.year}
                          </span>
                        )}
                        {activeSessionForClient.resolution && (
                          <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-[#ff6a00]">
                            {activeSessionForClient.resolution}
                          </span>
                        )}
                        {activeSessionForClient.audioCodec && (
                          <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-emerald-300">
                            {activeSessionForClient.audioCodec}
                          </span>
                        )}
                        {activeSessionForClient.bitrate && (
                          <span className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-zinc-300">
                            {activeSessionForClient.bitrate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs font-mono text-zinc-300 mb-1.5">
                      <span>{formatDuration(activeSessionForClient.viewOffset)}</span>
                      <span className="text-[11px] uppercase tracking-wider text-[#ff6a00] font-bold">
                        LIVE STREAM ({activeSessionForClient.Player?.state || 'playing'})
                      </span>
                      <span>{formatDuration(activeSessionForClient.duration)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={activeSessionForClient.duration || 100}
                      value={activeSessionForClient.viewOffset || 0}
                      onChange={(e) => handleScrubSeek(Number(e.target.value))}
                      className="w-full h-2 bg-black/70 rounded-lg appearance-none cursor-pointer accent-[#ff6a00]"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-[#12141c] p-6 text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-[#ff6a00]/10 border border-[#ff6a00]/30 flex items-center justify-center mx-auto">
                    <Tv className="w-8 h-8 text-[#ff6a00]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {activeClient
                        ? `Idle / No Active Playback on ${activeClient.name}`
                        : 'Waiting for Active Plex Session'}
                    </h2>
                    <p className="text-xs text-zinc-400 max-w-lg mx-auto mt-1">
                      Polling `/status/sessions` every 2 seconds across{' '}
                      {servers.map((s) => `${s.name} (${s.host})`).join(' & ')}.
                    </p>
                  </div>

                  <div className="text-left rounded-2xl bg-[#0b0c10] border border-white/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#ff6a00]" />
                        <span>Live Server Diagnostic Matrix (`/status/sessions`)</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {bridgeAlive ? 'Bridge: ONLINE' : 'Bridge: OFFLINE'}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {servers.map((srv) => {
                        const d = serverDiagnostics[srv.id];
                        return (
                          <div
                            key={srv.id}
                            className="p-2.5 rounded-xl bg-[#12141c] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  d?.ok ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              <span className="font-bold text-white truncate">
                                {srv.name} ({srv.host})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                              <span
                                className={
                                  d?.ok
                                    ? 'text-emerald-400 font-bold'
                                    : 'text-rose-400 font-bold'
                                }
                              >
                                {d ? d.status : 'Polling...'}
                              </span>
                              <span className="text-zinc-400 truncate max-w-[230px]">
                                {d ? d.detail : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {Object.values(serverDiagnostics).some((d) => !d.ok) && !bridgeAlive && (
                      <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <p className="text-[11px] text-amber-300">
                          Browser Private Network Access is blocking direct LAN IP requests (`192.168.0.32` & `192.168.0.11`). Click to open and paste the 1-line bridge into Konsole:
                        </p>
                        <button
                          onClick={() => {
                            try {
                              navigator.clipboard?.writeText(pythonBridgeOneLiner);
                            } catch (e) {}
                            setShowBridgeCopyModal(true);
                            triggerToast('Paste the 1-Line command into Konsole & press Enter!');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#ff7b1a] text-black font-extrabold text-xs shrink-0 flex items-center gap-1.5"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>Open 1-Line Konsole Bridge</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-center gap-2">
                    {!globalToken && (
                      <button
                        onClick={startPlexPinAuth}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-black flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>1-Click Link Plex Account</span>
                      </button>
                    )}
                    <button
                      onClick={pollAllSessionsAndClients}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#ff6a00]" />
                      <span>Poll Sessions Now</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('library')}
                      className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#ff7b1a] text-xs font-bold text-black flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Browse Live Libraries</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1 bg-[#0b0c10] p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => setRemoteSubMode('deck')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        remoteSubMode === 'deck'
                          ? 'bg-[#ff6a00] text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Transport Deck
                    </button>
                    <button
                      onClick={() => setRemoteSubMode('dpad')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        remoteSubMode === 'dpad'
                          ? 'bg-[#ff6a00] text-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      D-Pad Navigation
                    </button>
                  </div>

                  <button
                    onClick={handleExplicitPlayPauseToggle}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-semibold text-zinc-200"
                  >
                    Force PlayPause
                  </button>
                </div>

                {remoteSubMode === 'deck' ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-center gap-3 sm:gap-5">
                      <button
                        onClick={handleSkipPrevious}
                        className="p-3.5 rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 text-zinc-100 active:scale-95 transition"
                        title="Previous File"
                      >
                        <SkipBack className="w-5 h-5" />
                      </button>

                      <button
                        onClick={handleStepBack}
                        className="p-3.5 rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 text-zinc-200 active:scale-95 transition flex flex-col items-center"
                        title="Step Back 15s"
                      >
                        <RotateCcw className="w-5 h-5 text-[#ff6a00]" />
                        <span className="text-[9px] font-mono mt-0.5">-15s</span>
                      </button>

                      <button
                        onClick={handleTogglePlayPause}
                        className="w-16 h-16 rounded-full bg-gradient-to-br from-[#ff6a00] to-amber-500 hover:from-[#ff7b1a] hover:to-amber-400 text-black flex items-center justify-center shadow-xl shadow-[#ff6a00]/25 active:scale-95 transition"
                        title="Play / Pause"
                      >
                        {activeSessionForClient?.Player?.state === 'playing' ? (
                          <Pause className="w-7 h-7 fill-black" />
                        ) : (
                          <Play className="w-7 h-7 fill-black ml-0.5" />
                        )}
                      </button>

                      <button
                        onClick={handleStepForward}
                        className="p-3.5 rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 text-zinc-200 active:scale-95 transition flex flex-col items-center"
                        title="Step Forward 30s"
                      >
                        <RotateCw className="w-5 h-5 text-[#ff6a00]" />
                        <span className="text-[9px] font-mono mt-0.5">+30s</span>
                      </button>

                      <button
                        onClick={handleSkipNext}
                        className="p-3.5 rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 text-zinc-100 active:scale-95 transition"
                        title="Next File"
                      >
                        <SkipForward className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                      <Volume2 className="w-4 h-4 text-[#ff6a00] shrink-0" />
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                          <span>Volume ({activeClient ? activeClient.name : 'Player'})</span>
                          <span className="font-mono text-zinc-200">{currentVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={currentVolume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#ff6a00]"
                        />
                      </div>
                      <button
                        onClick={handleStopPlayback}
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5 fill-rose-400" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-2">
                    <div className="grid grid-cols-3 gap-3 w-56 h-56">
                      <button
                        onClick={() => handleDpadNavigation('back', 'Back')}
                        className="rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center text-zinc-300"
                      >
                        <CornerUpLeft className="w-5 h-5 text-[#ff6a00]" />
                        <span className="text-[10px] mt-1">Back</span>
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('moveUp', 'Up')}
                        className="rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 flex items-center justify-center text-white"
                      >
                        <ChevronUp className="w-7 h-7" />
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('home', 'Home')}
                        className="rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center text-zinc-300"
                      >
                        <Home className="w-5 h-5 text-[#ff6a00]" />
                        <span className="text-[10px] mt-1">Home</span>
                      </button>

                      <button
                        onClick={() => handleDpadNavigation('moveLeft', 'Left')}
                        className="rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 flex items-center justify-center text-white"
                      >
                        <ChevronLeft className="w-7 h-7" />
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('select', 'Select')}
                        className="rounded-full bg-[#ff6a00] text-black font-extrabold text-xs flex flex-col items-center justify-center shadow-lg"
                      >
                        <CircleDot className="w-6 h-6" />
                        <span className="text-[10px]">OK</span>
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('moveRight', 'Right')}
                        className="rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 flex items-center justify-center text-white"
                      >
                        <ChevronRight className="w-7 h-7" />
                      </button>

                      <button
                        onClick={() => handleDpadNavigation('contextMenu', 'Menu')}
                        className="rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center text-zinc-300"
                      >
                        <Info className="w-5 h-5 text-[#ff6a00]" />
                        <span className="text-[10px] mt-1">OSD</span>
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('moveDown', 'Down')}
                        className="rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 flex items-center justify-center text-white"
                      >
                        <ChevronDown className="w-7 h-7" />
                      </button>
                      <button
                        onClick={() => handleDpadNavigation('toggleOSD', 'Stats')}
                        className="rounded-2xl bg-[#0b0c10] hover:bg-zinc-800 border border-white/10 flex flex-col items-center justify-center text-zinc-300"
                      >
                        <Activity className="w-5 h-5 text-emerald-400" />
                        <span className="text-[10px] mt-1">OSD Toggle</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tv className="w-4 h-4 text-[#ff6a00]" />
                    <h3 className="text-sm font-bold text-white">
                      Discovered Plex Players ({discoveredClients.length})
                    </h3>
                  </div>
                  <button
                    onClick={pollAllSessionsAndClients}
                    className="text-xs text-[#ff6a00] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                {discoveredClients.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#0b0c10] border border-white/5 text-xs text-zinc-400 space-y-2">
                    <p>No active players returned yet from `/status/sessions` or `/clients`.</p>
                    <button
                      onClick={startPlexPinAuth}
                      className="px-3 py-1.5 rounded-xl bg-[#ff6a00] text-black font-bold text-xs"
                    >
                      1-Click Link Plex Account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {discoveredClients.map((client) => {
                      const isSelected =
                        activeClient?.machineIdentifier === client.machineIdentifier;
                      const sess = activeSessions.find(
                        (s) => s.Player?.machineIdentifier === client.machineIdentifier
                      );
                      return (
                        <button
                          key={client.machineIdentifier}
                          onClick={() => {
                            setSelectedClientMachineId(client.machineIdentifier);
                            triggerToast(`Target switched to ${client.name}`);
                          }}
                          className={`w-full text-left p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-[#ff6a00]/15 border-[#ff6a00]'
                              : 'bg-[#0b0c10] hover:bg-zinc-900 border-white/5'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  sess?.Player?.state === 'playing'
                                    ? 'bg-emerald-400 animate-ping'
                                    : sess
                                    ? 'bg-amber-400'
                                    : 'bg-zinc-600'
                                }`}
                              />
                              <p className="text-xs font-bold text-white truncate">
                                {client.name}
                              </p>
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {client.product} • {client.address}:{client.port}
                            </p>
                            {sess && (
                              <p className="text-[11px] text-[#ff6a00] font-semibold truncate mt-1">
                                {sess.Player?.state?.toUpperCase()}:{' '}
                                {sess.grandparentTitle
                                  ? `${sess.grandparentTitle} - ${sess.title}`
                                  : sess.title}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                              isSelected
                                ? 'bg-[#ff6a00] text-black'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {isSelected ? 'ACTIVE' : 'Select'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <span>All Active LAN Streams ({activeSessions.length})</span>
                  </h3>
                </div>
                {activeSessions.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No active streams reported by `/status/sessions` right now.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((sess) => (
                      <div
                        key={`${sess.serverId}-${sess.ratingKey}-${sess.Player?.machineIdentifier}`}
                        className="p-3 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {sess.grandparentTitle
                              ? `${sess.grandparentTitle}: ${sess.title}`
                              : sess.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {sess.Player?.title} • {sess.serverName} •{' '}
                            {formatDuration(sess.viewOffset)} / {formatDuration(sess.duration)}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (sess.Player?.machineIdentifier) {
                              setSelectedClientMachineId(sess.Player.machineIdentifier);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#ff6a00]/20 text-[#ff6a00] text-xs font-bold shrink-0"
                        >
                          Control
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-5">
            <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-[#ff6a00]" />
                    <span>Live Plex Server Library Browser</span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Fetched directly from `/library/sections` and `/library/recentlyAdded` across your servers.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search live Plex library..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0b0c10] border border-white/10 text-xs text-white"
                    />
                  </div>
                  <button
                    onClick={fetchLiveLibraries}
                    className="p-2 rounded-xl bg-[#ff6a00] text-black font-bold"
                    title="Reload Library"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingLibrary ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => setSelectedSectionKey('RECENT')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold ${
                    selectedSectionKey === 'RECENT'
                      ? 'bg-[#ff6a00] text-black'
                      : 'bg-[#0b0c10] text-zinc-300 border border-white/10'
                  }`}
                >
                  Recently Added
                </button>
                {librarySections.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setSelectedSectionKey(sec.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                      selectedSectionKey === sec.id
                        ? 'bg-[#ff6a00] text-black font-bold'
                        : 'bg-[#0b0c10] text-zinc-300 border border-white/10'
                    }`}
                  >
                    {sec.serverName}: {sec.title}
                  </button>
                ))}
              </div>
            </div>

            {libraryItems.length === 0 ? (
              <div className="bg-[#12141c] border border-white/10 rounded-3xl p-8 text-center space-y-3">
                <p className="text-sm font-bold text-white">
                  {isLoadingLibrary
                    ? 'Loading live library metadata from your Plex servers...'
                    : 'No library items loaded yet'}
                </p>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Link your Plex account via 1-Click PIN Auth or enable the Local Bridge so your browser can load metadata from `192.168.0.32` & `192.168.0.11`.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {libraryItems.map((item) => {
                  const base =
                    item.serverHttpsUri || `http://${item.serverHost}:${item.serverPort}`;
                  const rawThumb = item.thumb
                    ? `${base}${item.thumb}?X-Plex-Token=${encodeURIComponent(item.serverToken)}`
                    : null;
                  const thumbUrl = rawThumb;

                  return (
                    <div
                      key={`${item.serverId}-${item.ratingKey}`}
                      className="rounded-3xl bg-[#12141c] border border-white/10 overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="h-40 bg-black/60 relative overflow-hidden flex items-end p-4">
                          {thumbUrl && (
                            <img
                              src={thumbUrl}
                              alt={item.title}
                              className="absolute inset-0 w-full h-full object-cover opacity-55"
                            />
                          )}
                          <div className="relative z-10 w-full">
                            <span className="px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold text-[#ff6a00]">
                              {item.serverName}
                            </span>
                            <h3 className="text-sm font-extrabold text-white mt-1 line-clamp-1">
                              {item.grandparentTitle
                                ? `${item.grandparentTitle} - ${item.title}`
                                : item.title}
                            </h3>
                          </div>
                        </div>
                        <div className="p-4">
                          <p className="text-xs text-zinc-400 line-clamp-2 mb-2">
                            {item.summary || 'No summary available.'}
                          </p>
                          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-zinc-300">
                            {item.year && (
                              <span className="px-2 py-0.5 rounded bg-[#0b0c10]">
                                {item.year}
                              </span>
                            )}
                            {item.resolution && (
                              <span className="px-2 py-0.5 rounded bg-[#0b0c10] text-[#ff6a00]">
                                {item.resolution}
                              </span>
                            )}
                            {item.duration > 0 && (
                              <span className="px-2 py-0.5 rounded bg-[#0b0c10]">
                                {formatDuration(item.duration)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="px-4 pb-4 pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400 truncate">
                          Target: <strong className="text-white">{activeClient?.name || 'None'}</strong>
                        </span>
                        <button
                          onClick={() => handleCastLibraryItem(item)}
                          className="px-3 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#ff7b1a] text-black font-bold text-xs flex items-center gap-1"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Play Now</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'bridge' && (
          <div className="space-y-6">
            <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-[#ff6a00]" />
                    <span>Local Loopback & LAN Bridge (`127.0.0.1:8765`)</span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Includes `Access-Control-Allow-Private-Network: true` so Chromium/Firefox HTTPS sandboxes can talk directly to `127.0.0.1:8765` and relay commands to `192.168.0.32` & `192.168.0.11`.
                  </p>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(pythonBridgeOneLiner);
                    triggerToast('Copied Python Local Bridge 1-liner');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#ff6a00] text-black font-bold text-xs flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy 1-Line Bridge Script</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3.5 rounded-2xl bg-[#0b0c10] border border-white/10">
                <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBridgeProxy}
                    onChange={(e) => setUseBridgeProxy(e.target.checked)}
                    className="w-4 h-4 accent-[#ff6a00]"
                  />
                  <span>Route Plain HTTP LAN Calls Through Bridge:</span>
                </label>
                <input
                  type="text"
                  value={bridgeUrl}
                  onChange={(e) => setBridgeUrl(e.target.value)}
                  placeholder="http://192.168.0.16:8765"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-[#12141c] border border-white/10 text-xs font-mono text-white"
                />
              </div>

              <pre className="text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap bg-[#0b0c10] p-4 rounded-2xl border border-white/5">
                {pythonBridgeOneLiner}
              </pre>
            </div>

            <div className="bg-[#12141c] border border-white/10 rounded-3xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">
                  Live HTTP Command Dispatch Log ({apiLogs.length})
                </h3>
                <button
                  onClick={() => setApiLogs([])}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {apiLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-2xl bg-[#0b0c10] border border-white/5 font-mono text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[#ff6a00] font-bold">{log.description}</span>
                      <span className={log.isError ? 'text-rose-400' : 'text-emerald-400'}>
                        {log.status} • {log.timestamp}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 break-all">{log.endpoint}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {showConnectSheet && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#12141c] border border-white/15 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Select Target Plex Player</h3>
              <button
                onClick={() => setShowConnectSheet(false)}
                className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {discoveredClients.map((c) => {
                const isSelected = activeClient?.machineIdentifier === c.machineIdentifier;
                return (
                  <button
                    key={c.machineIdentifier}
                    onClick={() => {
                      setSelectedClientMachineId(c.machineIdentifier);
                      setShowConnectSheet(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#ff6a00]/15 border-[#ff6a00] text-white'
                        : 'bg-[#0b0c10] border-white/10 text-zinc-200'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold">{c.name}</p>
                      <p className="text-xs text-zinc-400">
                        {c.product} • {c.address}:{c.port}
                      </p>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-[#ff6a00]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showBridgeCopyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141c] border border-[#ff6a00]/50 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#ff6a00]" />
                <h3 className="text-base font-extrabold text-white">
                  1-Line Konsole Bridge (Unlocks 192.168.0.32 & 192.168.0.11)
                </h3>
              </div>
              <button
                onClick={() => setShowBridgeCopyModal(false)}
                className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-300">
              Because this preview runs inside a Google Cloud HTTPS sandbox (`*.scf.usercontent.goog`), Chromium blocks direct connections to `192.168.0.32` and `192.168.0.11` unless a local loopback bridge supplies `Access-Control-Allow-Private-Network: true`. Select all and paste this into your Linux Konsole/Terminal:
            </p>
            <textarea
              readOnly
              value={pythonBridgeOneLiner}
              onFocus={(e) => e.target.select()}
              className="w-full h-48 p-3 rounded-2xl bg-[#0b0c10] border border-white/15 font-mono text-[11px] text-emerald-300 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-400">
                As soon as it runs, the badge at the top will turn <strong className="text-sky-400">BRIDGE 127.0.0.1:8765</strong> automatically!
              </span>
              <button
                onClick={() => setShowBridgeCopyModal(false)}
                className="px-4 py-2 rounded-xl bg-[#ff6a00] text-black font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showServerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141c] border border-white/15 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Plex Servers, TLS Direct & Authentication Token
              </h3>
              <button
                onClick={() => setShowServerModal(false)}
                className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#0b0c10] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#ff6a00]">
                  Global X-Plex-Token (Applied to 1337PC2 & LVRPC)
                </label>
                <button
                  onClick={() => discoverPlexDirectResources(globalToken)}
                  className="text-[11px] text-emerald-400 hover:underline font-semibold"
                >
                  Sync *.plex.direct HTTPS URLs
                </button>
              </div>
              <input
                type="text"
                value={globalToken}
                onChange={(e) => setGlobalToken(e.target.value)}
                placeholder="Paste your X-Plex-Token here..."
                className="w-full px-3 py-2 rounded-xl bg-[#12141c] border border-white/10 text-xs font-mono text-white"
              />

              <button
                type="button"
                onClick={startPlexPinAuth}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>1-Click Link Plex Account via PIN (Recommended)</span>
              </button>

              <form onSubmit={handlePlexTvSignIn} className="pt-2 border-t border-white/5 space-y-2">
                <p className="text-[11px] text-zinc-400">
                  Or sign in with Plex credentials:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Plex Username / Email"
                    value={plexUsername}
                    onChange={(e) => setPlexUsername(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#12141c] border border-white/10 text-xs text-white"
                  />
                  <input
                    type="password"
                    placeholder="Plex Password"
                    value={plexPassword}
                    onChange={(e) => setPlexPassword(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#12141c] border border-white/10 text-xs text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
                >
                  {isSigningIn ? 'Authenticating with plex.tv...' : 'Sign In & Discover TLS Endpoints'}
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {servers.map((srv) => (
                <div
                  key={srv.id}
                  className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={srv.name}
                      onChange={(e) => updateServerField(srv.id, 'name', e.target.value)}
                      className="bg-transparent text-sm font-bold text-white border-b border-white/10 focus:outline-none"
                    />
                    <button
                      onClick={() => removeServer(srv.id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={srv.host}
                      onChange={(e) => updateServerField(srv.id, 'host', e.target.value)}
                      placeholder="IP Address"
                      className="px-2.5 py-1.5 rounded-lg bg-[#12141c] border border-white/10 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      value={srv.port}
                      onChange={(e) => updateServerField(srv.id, 'port', e.target.value)}
                      placeholder="32400"
                      className="px-2.5 py-1.5 rounded-lg bg-[#12141c] border border-white/10 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      value={srv.token}
                      onChange={(e) => updateServerField(srv.id, 'token', e.target.value)}
                      placeholder="Server Token"
                      className="px-2.5 py-1.5 rounded-lg bg-[#12141c] border border-white/10 text-xs font-mono text-white"
                    />
                  </div>
                  <input
                    type="text"
                    value={srv.httpsUri || ''}
                    onChange={(e) => updateServerField(srv.id, 'httpsUri', e.target.value)}
                    placeholder="https://192-168-0-32.<hash>.plex.direct:32400 (auto-filled on PIN link)"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#12141c] border border-white/10 text-[11px] font-mono text-emerald-300"
                  />
                </div>
              ))}
            </div>

            <form onSubmit={handleAddServer} className="space-y-2 pt-2 border-t border-white/10">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Server Name"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#0b0c10] border border-white/10 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="IP (e.g. 192.168.0.50)"
                  value={newServerHost}
                  onChange={(e) => setNewServerHost(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#0b0c10] border border-white/10 text-xs font-mono text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
              >
                + Add Server
              </button>
            </form>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#0b0c10]/95 backdrop-blur-xl border-t border-white/10 px-4 py-2">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('remote')}
            className={`py-2 rounded-2xl flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'remote'
                ? 'bg-[#ff6a00]/15 text-[#ff6a00] border border-[#ff6a00]/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Live Remote</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`py-2 rounded-2xl flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'library'
                ? 'bg-[#ff6a00]/15 text-[#ff6a00] border border-[#ff6a00]/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Live Library</span>
          </button>

          <button
            onClick={() => setActiveTab('bridge')}
            className={`py-2 rounded-2xl flex flex-col items-center gap-1 text-xs font-bold ${
              activeTab === 'bridge'
                ? 'bg-[#ff6a00]/15 text-[#ff6a00] border border-[#ff6a00]/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>LAN Bridge</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
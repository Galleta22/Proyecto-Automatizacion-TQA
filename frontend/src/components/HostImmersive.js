import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  LuChevronDown, LuArrowUp, LuArrowDown, LuMove, LuMinus, LuPlay, LuPause, LuSquare,
  LuSun, LuMoon, LuRepeat, LuSkipBack, LuSkipForward, LuMonitor as Monitor, LuX as X, LuDice5 as Dice5, LuHash as Hash,
  LuCamera as Camera, LuSave as Save, LuCheck as Check, LuGlobe as Globe,
  LuEyeOff as EyeOff, LuEye as Eye,
  LuRotateCcw as RotateCcw, LuMusic as Music, LuYoutube as Youtube,
  LuVolume2 as Volume2, LuVolumeOff as VolumeOff,
  LuDroplets as Droplets, LuWind as Wind, LuMoon as Moon,
  LuTreePine as Tree, LuFlame as Flame, LuRadio as Radio,
} from "react-icons/lu";
import HostImmersiveContent from "./HostImmersiveContent";
import useTheme, { toggleTheme } from "../ui/useTheme";
import "./HostImmersive.css";

const TOOLS = [
  { id: "dice", icon: Dice5, label: "Dados" },
  { id: "counters", icon: Hash, label: "Contadores" },
  { id: "turns", icon: RotateCcw, label: "Turnos" },
  { id: "notes", icon: Camera, label: "Notas" },
  { id: "ambient", icon: Music, label: "Sonido" },
  { id: "youtube", icon: Youtube, label: "YouTube" },
];

// --- YouTube API ---
let youtubeApiReady = false;
const readyCallbacks = [];
window.onYouTubeIframeAPIReady = () => {
  youtubeApiReady = true;
  readyCallbacks.forEach((cb) => cb());
  readyCallbacks.length = 0;
};
function waitYT() {
  if (youtubeApiReady || window.YT) return Promise.resolve();
  return new Promise((r) => readyCallbacks.push(r));
}
if (!window.YT && !document.querySelector("#youtube-api-script")) {
  const s = document.createElement("script");
  s.id = "youtube-api-script";
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

// --- Ambient engines ---
function noiseBuffer(ctx, sec) {
  const len = ctx.sampleRate * sec;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function reverb(ctx, type) {
  const sr = ctx.sampleRate;
  const len = sr * (type === "room" ? 0.3 : 1.2);
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * (type === "room" ? 0.05 : 0.3))) * 0.5;
  }
  const c = ctx.createConvolver();
  c.buffer = b;
  return c;
}
function startRain(ctx, g) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 4); n.loop = true;
  const lp1 = ctx.createBiquadFilter(); lp1.type = "lowpass"; lp1.frequency.value = 800; lp1.Q.value = 0.5;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 100;
  const lfo = ctx.createOscillator(); const lg = ctx.createGain();
  lfo.frequency.value = 0.2 + Math.random() * 0.1; lg.gain.value = 400;
  lfo.connect(lg); lg.connect(lp1.frequency);
  n.connect(lp1); lp1.connect(hp);
  const rev = reverb(ctx, "room"); hp.connect(g); hp.connect(rev); rev.connect(g);
  n.start(); lfo.start();
  return [n, lp1, hp, lfo, lg, rev];
}
function startWind(ctx, g) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 5); n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 350; bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 150;
  const lfo = ctx.createOscillator(); const lg = ctx.createGain();
  lfo.frequency.value = 0.12; lg.gain.value = 95;
  lfo.connect(lg); lg.connect(bp.frequency);
  n.connect(bp); bp.connect(hp); hp.connect(g);
  n.start(); lfo.start();
  return [n, bp, hp, lfo, lg];
}
function startNight(ctx, output) {
  const bed = ctx.createBufferSource();
  bed.buffer = noiseBuffer(ctx, 8);
  bed.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  bed.connect(filter).connect(output);
  bed.start();

  const crickets = ctx.createOscillator();
  crickets.frequency.value = 3600;
  const pulses = ctx.createGain();
  pulses.gain.value = 0;
  crickets.connect(pulses).connect(output);
  crickets.start();
  const chirp = () => {
    const time = ctx.currentTime + 0.02;
    for (let index = 0; index < 3; index++) {
      const start = time + index * 0.075;
      pulses.gain.setValueAtTime(0, start);
      pulses.gain.linearRampToValueAtTime(0.025, start + 0.012);
      pulses.gain.linearRampToValueAtTime(0, start + 0.048);
    }
  };
  chirp();
  const timer = window.setInterval(chirp, 2300);
  return [bed, filter, crickets, pulses, { stop: () => window.clearInterval(timer) }];
}
function startForest(ctx, g) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 4); n.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1000;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 1.0;
  const boost = ctx.createGain(); boost.gain.value = 0.7;
  n.connect(hp); hp.connect(bp); bp.connect(boost);
  const rev = reverb(ctx, "hall"); boost.connect(rev); rev.connect(g);
  n.start();
  const chirp = () => {
    if (ctx.state === "closed") return;
    const o = ctx.createOscillator(); const cg = ctx.createGain();
    o.type = "sine"; o.frequency.value = 1700 + Math.random() * 1100;
    o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.78, ctx.currentTime + 0.15);
    cg.gain.setValueAtTime(0.001, ctx.currentTime);
    cg.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 0.015);
    cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.connect(cg); cg.connect(g); o.start(); o.stop(ctx.currentTime + 0.15);
    timer = window.setTimeout(chirp, 1800 + Math.random() * 3500);
  };
  let timer;
  chirp();
  return [n, hp, bp, boost, rev, { stop: () => window.clearTimeout(timer) }];
}
function startFire(ctx, g) {
  const n1 = ctx.createBufferSource(); n1.buffer = noiseBuffer(ctx, 3); n1.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
  const lfo = ctx.createOscillator(); const lg = ctx.createGain();
  lfo.frequency.value = 6 + Math.random() * 3; lg.gain.value = 170;
  lfo.connect(lg); lg.connect(lp.frequency);
  const n2 = ctx.createBufferSource(); n2.buffer = noiseBuffer(ctx, 0.5); n2.loop = true;
  const cp = ctx.createBiquadFilter(); cp.type = "highpass"; cp.frequency.value = 3000;
  const cg = ctx.createGain(); cg.gain.value = 0.07;
  n1.connect(lp); n2.connect(cp); cp.connect(cg); cg.connect(g);
  const rev = reverb(ctx, "room"); lp.connect(rev); rev.connect(g);
  n1.start(); lfo.start(); n2.start();
  return [n1, lp, lfo, lg, n2, cp, cg, rev];
}
function startLofi(ctx, output) {
  const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]];
  const clock = 0.48;
  const schedule = (start) => {
    chords.forEach((notes, bar) => {
      [0, 2, 1, 3].forEach((noteIndex, beat) => {
        const time = start + (bar * 4 + beat) * clock;
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        oscillator.type = noteIndex === 0 ? "triangle" : "sine";
        oscillator.frequency.value = 440 * 2 ** ((notes[noteIndex] - 69) / 12);
        envelope.gain.setValueAtTime(0.001, time);
        envelope.gain.exponentialRampToValueAtTime(0.12, time + 0.025);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
        oscillator.connect(envelope).connect(output);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(time);
        oscillator.stop(time + 0.72);
      });
    });
  };
  let nextPhrase = ctx.currentTime + 0.05;
  const queue = () => {
    if (nextPhrase > ctx.currentTime + 0.3) return;
    nextPhrase = Math.max(nextPhrase, ctx.currentTime + 0.02);
    schedule(nextPhrase);
    nextPhrase += chords.length * 4 * clock;
  };
  queue();
  const timer = window.setInterval(queue, 100);
  return [{ stop: () => window.clearInterval(timer) }];
}
const ENGINES = { rain: startRain, wind: startWind, night: startNight, forest: startForest, fire: startFire, lofi: startLofi };
const AMBIENT_PRESETS = [
  { id: "rain", label: "Lluvia", icon: Droplets, color: "#4a90d9" },
  { id: "wind", label: "Viento", icon: Wind, color: "#8ecae6" },
  { id: "night", label: "Noche", icon: Moon, color: "#6b4e9e" },
  { id: "forest", label: "Bosque", icon: Tree, color: "#2d8a4e" },
  { id: "fire", label: "Fuego", icon: Flame, color: "#e76f51" },
  { id: "lofi", label: "Lo-fi", icon: Radio, color: "#e9c46a" },
];

function parseYTUrl(input) {
  const c = input.trim();
  if (!c) return null;
  const result = { videoId: null, playlistId: null };
  let m;
  m = c.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) result.videoId = m[1];
  m = c.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (m) result.playlistId = m[1];
  if (!result.videoId && !result.playlistId) {
    m = c.match(/^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) result.videoId = m[1];
  }
  if (!result.videoId && !result.playlistId) {
    m = c.match(/^[a-zA-Z0-9_-]{11}$/);
    if (m) result.videoId = m[0];
  }
  return result.videoId || result.playlistId ? result : null;
}

export default function HostImmersive({
  sessionName, onExit, editor, games, communityUsers,
  formatDuration,
  sessions, onFinishSession, onSave, onPublish, onUnpublish,
}) {
  const theme = useTheme();
  const [openTools, setOpenTools] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [savedState, setSavedState] = useState(null);
  const [cleanView, setCleanView] = useState(false);

  // YouTube state
  const [ytUrl, setYtUrl] = useState("");
  const [ytVideoId, setYtVideoId] = useState(null);
  const [ytPlaylistId, setYtPlaylistId] = useState(null);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytError, setYtError] = useState("");
  const [ytMinimized, setYtMinimized] = useState(false);
  const [videoPosition, setVideoPosition] = useState(null);
  const videoWindow = useRef(null);
  const videoMount = useRef(null);
  const videoDrag = useRef(null);

  const moveVideo = useCallback((left, top) => {
    const bounds = videoWindow.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    setVideoPosition({
      left: Math.min(Math.max(0, window.innerWidth - bounds.width), Math.max(0, left)),
      top: Math.min(Math.max(0, window.innerHeight - bounds.height), Math.max(0, top)),
    });
  }, []);

  useEffect(() => {
    const clampVideo = () => {
      if (videoPosition) moveVideo(videoPosition.left, videoPosition.top);
    };
    window.addEventListener("resize", clampVideo);
    return () => window.removeEventListener("resize", clampVideo);
  }, [moveVideo, videoPosition, ytMinimized]);

  const startVideoDrag = (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const bounds = videoWindow.current.getBoundingClientRect();
    videoDrag.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveVideoWithKeys = (event) => {
    const offsets = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const bounds = videoWindow.current.getBoundingClientRect();
    moveVideo(bounds.left + offset[0], bounds.top + offset[1]);
  };
  const [ytLoop, setYtLoop] = useState(false);
  const ytPlayerRef = useRef(null);
  const ytLoopRef = useRef(false);

  const sessionId = editor.editing;

  // YT persistence: save on change, restore on mount
  const saveYTState = useCallback(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(`hi_yt_${sessionId}`, JSON.stringify({
        url: ytUrl, videoId: ytVideoId, playlistId: ytPlaylistId,
      }));
    } catch {}
  }, [sessionId, ytUrl, ytVideoId, ytPlaylistId]);

  // Restore YT state on mount
  useEffect(() => {
    if (!sessionId) return;
    try {
      const saved = sessionStorage.getItem(`hi_yt_${sessionId}`);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.url) setYtUrl(state.url);
        if (state.videoId) setYtVideoId(state.videoId);
        if (state.playlistId) setYtPlaylistId(state.playlistId);
      }
    } catch {}
  }, [sessionId]);

  useEffect(() => { saveYTState(); }, [ytVideoId, ytPlaylistId]);

  // Ambient state
  const [ambientPreset, setAmbientPreset] = useState(null);
  const [ambientPlaying, setAmbientPlaying] = useState(false);
  const [ambientVolume, setAmbientVolume] = useState(60);
  const ambientCtxRef = useRef(null);
  const ambientNodesRef = useRef([]);
  const ambientGainRef = useRef(null);

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i, left: `${Math.random() * 100}%`, size: `${1 + Math.random() * 3}px`,
      duration: `${10 + Math.random() * 20}s`, delay: `${Math.random() * 15}s`,
    })),
  []);

  const handleExit = useCallback(() => {
    saveYTState();
    document.body.classList.remove("hi-open");
    document.documentElement.classList.remove("hi-open");
    onExit();
  }, [onExit, saveYTState]);

  const handleFinish = useCallback(() => {
    const s = sessions.find((x) => x.id === editor.editing);
    if (s) onFinishSession(s);
  }, [sessions, editor.editing, onFinishSession]);

  const sideOpen = openTools.length > 0 && !cleanView;

  // --- Tool panel management ---
  const toggleTool = useCallback((id) => {
    setOpenTools((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return window.matchMedia("(max-width:700px)").matches ? [id] : [...prev, id];
    });
  }, []);

  const closeTool = useCallback((id) => {
    setOpenTools((prev) => prev.filter((x) => x !== id));
  }, []);

  const toggleCollapse = useCallback((id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const moveTool = useCallback((id, dir) => {
    setOpenTools((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      if (dir === "up" && idx === 0) return prev;
      if (dir === "down" && idx === prev.length - 1) return prev;
      const swap = dir === "up" ? idx - 1 : idx + 1;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const toggleCleanView = useCallback(() => {
    if (!cleanView) {
      setSavedState({ openTools, collapsed });
      setOpenTools([]);
      setCleanView(true);
    } else {
      if (savedState) {
        setOpenTools(savedState.openTools);
        setCollapsed(savedState.collapsed);
      }
      setCleanView(false);
    }
  }, [cleanView, openTools, collapsed, savedState]);

  const resetTools = useCallback(() => {
    setOpenTools([]);
    setCollapsed({});
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith("fp_pos_") || k.startsWith("fp_mode_") || k.startsWith("hi_yt_")) sessionStorage.removeItem(k);
      });
    } catch {}
  }, []);

  // --- Body classes ---
  useEffect(() => {
    document.body.classList.add("hi-open");
    document.documentElement.classList.add("hi-open");
    return () => {
      document.body.classList.remove("hi-open");
      document.documentElement.classList.remove("hi-open");
    };
  }, []);

  useEffect(() => {
    const h = (e) => {
      if ((e.key === "h" || e.key === "H") && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        e.preventDefault();
        toggleCleanView();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [toggleCleanView]);

  // --- Ambient ---
  useEffect(() => {
    return () => {
      ambientNodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} });
      ambientCtxRef.current?.close();
    };
  }, []);

  const stopAmbient = useCallback(() => {
    ambientNodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    ambientNodesRef.current = [];
    ambientCtxRef.current?.close();
    ambientCtxRef.current = null;
    setAmbientPlaying(false);
    setAmbientPreset(null);
  }, []);

  const startAmbient = useCallback((presetId) => {
    if (presetId === ambientPreset && ambientPlaying) { stopAmbient(); return; }
    ambientNodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    ambientNodesRef.current = [];
    ambientCtxRef.current?.close();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    ambientCtxRef.current = ctx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setTargetAtTime(ambientVolume / 100, ctx.currentTime, 0.06);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.ratio.value = 4;
    gain.connect(limiter).connect(ctx.destination);
    ambientGainRef.current = gain;
    const engine = ENGINES[presetId];
    if (engine) ambientNodesRef.current = engine(ctx, gain);
    setAmbientPreset(presetId);
    setAmbientPlaying(true);
  }, [ambientPreset, ambientPlaying, ambientVolume, stopAmbient]);

  useEffect(() => {
    const gain = ambientGainRef.current;
    const ctx = ambientCtxRef.current;
    if (!gain || !ctx) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(ambientVolume / 100, ctx.currentTime, 0.06);
  }, [ambientVolume]);

  // --- YouTube ---
  useEffect(() => {
    if (!ytVideoId && !ytPlaylistId) return;
    let cancelled = false;
    (async () => {
      await waitYT();
      if (cancelled) return;
      if (ytPlayerRef.current) { ytPlayerRef.current.destroy(); ytPlayerRef.current = null; }
      const mount = videoMount.current;
      if (!mount) return;
      const el = document.createElement("div");
      mount.replaceChildren(el);
      const playerVars = { controls: 1, modestbranding: 1, rel: 0 };
      if (!ytPlaylistId) {
        playerVars.autoplay = 1;
        const p = new window.YT.Player(el, { height: "160", width: "280", videoId: ytVideoId, playerVars,
          events: {
            onReady: () => { p.playVideo(); setYtPlaying(true); },
            onStateChange: (e) => {
              setYtPlaying(e.data === window.YT.PlayerState.PLAYING);
              if (e.data === window.YT.PlayerState.ENDED && ytLoopRef.current) {
                ytPlayerRef.current?.seekTo(0);
                ytPlayerRef.current?.playVideo();
              }
            },
            onError: () => { setYtError("Error al reproducir el video"); setYtPlaying(false); },
          },
        });
        ytPlayerRef.current = p;
      } else {
        playerVars.list = ytPlaylistId;
        playerVars.listType = "playlist";
        playerVars.autoplay = 1;
        const startVideo = ytVideoId || undefined;
        if (startVideo) playerVars.index = 0;
        const p = new window.YT.Player(el, { height: "160", width: "280", playerVars,
          events: {
            onReady: () => { p.playVideo(); setYtPlaying(true); },
            onStateChange: (e) => setYtPlaying(e.data === window.YT.PlayerState.PLAYING),
            onError: () => { setYtPlaying(false); try { p.nextVideo(); } catch { setYtError("Error al reproducir la playlist"); } },
          },
        });
        ytPlayerRef.current = p;
      }
    })();
    return () => { cancelled = true; };
  }, [ytVideoId, ytPlaylistId]);

  useEffect(() => {
    return () => {
      if (ytPlayerRef.current) { ytPlayerRef.current.destroy(); ytPlayerRef.current = null; }
    };
  }, []);

  const loadYT = () => {
    const parsed = parseYTUrl(ytUrl);
    if (!parsed) { setYtError("No se pudo reconocer este enlace"); return; }
    setYtError("");
    if (parsed.playlistId) setYtPlaylistId(parsed.playlistId);
    else setYtPlaylistId(null);
    setYtVideoId(parsed.videoId || null);
    if (!openTools.includes("youtube")) setOpenTools((prev) => [...prev, "youtube"]);
  };

  const retryYT = () => {
    setYtError("");
    if (ytPlayerRef.current) { ytPlayerRef.current.destroy(); ytPlayerRef.current = null; }
    const vid = ytVideoId; const plid = ytPlaylistId;
    setYtVideoId(null); setYtPlaylistId(null);
    setTimeout(() => { setYtVideoId(vid); setYtPlaylistId(plid); }, 50);
  };

  const toggleYT = () => {
    if (ytPlayerRef.current) {
      ytPlaying ? ytPlayerRef.current.pauseVideo() : ytPlayerRef.current.playVideo();
    }
  };

  const stopYT = () => {
    if (ytPlayerRef.current) { ytPlayerRef.current.stopVideo(); }
    setYtPlaying(false);
  };

  const nextYT = () => {
    if (ytPlayerRef.current && ytPlaylistId) {
      try { ytPlayerRef.current.nextVideo(); } catch { setYtError("No se pudo pasar al siguiente video"); }
    }
  };

  const prevYT = () => {
    if (ytPlayerRef.current && ytPlaylistId) {
      try { ytPlayerRef.current.previousVideo(); } catch { setYtError("No se pudo volver al video anterior"); }
    }
  };

  const toggleLoop = () => {
    const next = !ytLoopRef.current;
    ytLoopRef.current = next;
    setYtLoop(next);
  };

  const clearYT = () => {
    if (ytPlayerRef.current) { ytPlayerRef.current.destroy(); ytPlayerRef.current = null; }
    setYtVideoId(null);
    setYtPlaylistId(null);
    setYtPlaying(false);
    setYtUrl("");
    setYtError("");
    if (sessionId) { try { sessionStorage.removeItem(`hi_yt_${sessionId}`); } catch {} }
  };

  // --- Render tool content ---
  const renderToolContent = (id) => {
    switch (id) {
      case "dice":
        return (
          <div className="hi-tc">
            <div className="hi-tc-dice-btns">
              {[4, 6, 8, 10, 12, 20].map((s) => (
                <button key={s} onClick={() => editor.rollDice(s)}>d{s}</button>
              ))}
            </div>
            {editor.form.dice_history.length > 0 && (
              <>
                <div className="hi-tc-dice-last">
                  <small>Última tirada</small>
                  <strong>{editor.form.dice_history.at(-1).result}</strong>
                  <span>d{editor.form.dice_history.at(-1).sides}</span>
                </div>
                <div className="hi-tc-dice-hist">
                  {editor.form.dice_history.slice(-8).reverse().map((r) => (
                    <span key={r.id}>d{r.sides}<strong>{r.result}</strong></span>
                  ))}
                </div>
              </>
            )}
          </div>
        );

      case "counters":
        return (
          <div className="hi-tc">
            <button className="hi-tc-add-counter" onClick={editor.addCounter}>+ Añadir contador</button>
            <div className="hi-tc-counter-list">
              {editor.form.custom_counters.map((c) => (
                <div key={c.id} className="hi-tc-counter-row" style={{"--c": c.color}}>
                  <span className="hi-tc-counter-name">{c.name || "Sin nombre"}</span>
                  <div className="hi-tc-counter-ctrl">
                    <button onClick={() => editor.adjustCounter(c.id, -1)}>-</button>
                    <strong>{c.value}</strong>
                    <button onClick={() => editor.adjustCounter(c.id, 1)}>+</button>
                  </div>
                </div>
              ))}
              {!editor.form.custom_counters.length && <p className="hi-tc-empty">Sin contadores</p>}
            </div>
          </div>
        );

      case "turns": {
        const activeP = editor.form.players.find((p) => p.id === editor.form.active_player_id);
        return (
          <div className="hi-tc">
            <label className="hi-tc-toggle">
              <input type="checkbox" checked={editor.form.turn_order_enabled}
                onChange={(e) => editor.toggleTurnOrder(e.target.checked)} />
              <span className="hi-tc-toggle-slider" />
              <span>Orden de turnos</span>
            </label>
            {!editor.form.turn_order_enabled ? (
              <div className="hi-tc-turn-disabled">
                <span>El orden de turnos está desactivado</span>
                <button onClick={() => editor.toggleTurnOrder(true)}>Activar orden de turnos</button>
              </div>
            ) : (
              <>
                <div className="hi-tc-turn-info">
                  <span>Turno actual: <strong>{activeP?.name || "Sin iniciar"}</strong></span>
                  <span className="hi-tc-turn-time">{formatDuration(editor.form.turn_times[editor.form.active_player_id] || 0)}</span>
                </div>
                <div className="hi-tc-turn-actions">
                  <button className="hi-tc-turn-btn-primary" onClick={editor.nextTurn}>▶ Siguiente</button>
                  <button className="hi-tc-turn-btn-sec" onClick={editor.resetActiveTurnTime}><RotateCcw /> Reiniciar tiempo</button>
                </div>
                <div className="hi-tc-turn-list">
                  {editor.form.turn_order.map((pid, i) => {
                    const p = editor.form.players.find((pl) => pl.id === pid);
                    if (!p) return null;
                    return (
                      <div key={pid} className={`${editor.form.active_player_id === pid ? "hi-tc-turn-active" : ""}`}
                        onClick={() => editor.setForm({ ...editor.form, active_player_id: pid })}>
                        <span className="hi-tc-turn-pos">{i + 1}</span>
                        <i style={{ background: p.color }} />
                        <strong>{p.name || `Jugador ${editor.form.players.indexOf(p) + 1}`}</strong>
                        <time>{formatDuration(editor.form.turn_times[pid] || 0)}</time>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      }

      case "notes":
        return (
          <div className="hi-tc">
            <textarea className="hi-tc-notes-textarea" value={editor.form.notes}
              onChange={(e) => editor.setForm({ ...editor.form, notes: e.target.value })}
              placeholder="Notas rápidas..." rows={5} />
            {editor.form.snapshots.length > 0 && (
              <div className="hi-tc-snapshots">
                {editor.form.snapshots.map((url, i) => (
                  <img key={url} src={url} alt={`Captura ${i + 1}`}
                    onClick={() => editor.setForm({ ...editor.form, snapshots: editor.form.snapshots.filter((_, pos) => pos !== i) })} />
                ))}
              </div>
            )}
            <label className="hi-tc-add-snapshot">
              <Camera /> Añadir captura
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={editor.addSnapshot} />
            </label>
          </div>
        );

      case "ambient":
        return (
          <div className="hi-tc">
            <div className="hi-tc-ambient-presets">
              {AMBIENT_PRESETS.map((p) => (
                <button key={p.id} className={`hi-tc-ambient-btn ${ambientPreset === p.id && ambientPlaying ? "active" : ""}`}
                  style={{"--accent": p.color}} onClick={() => startAmbient(p.id)}>
                  <p.icon /> {p.label}
                </button>
              ))}
            </div>
            {ambientPlaying && (
              <div className="hi-tc-ambient-controls">
                <button className="hi-tc-ambient-stop" onClick={stopAmbient}><VolumeOff /> Detener</button>
                <div className="hi-tc-ambient-volume">
                  <Volume2 />
                  <input type="range" min={0} max={100} value={ambientVolume}
                    onChange={(e) => setAmbientVolume(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>
        );

      case "youtube":
        return (
          <div className="hi-tc">
            {!ytVideoId && !ytPlaylistId ? (
              <div className="hi-tc-yt-input">
                <input type="text" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadYT()} placeholder="URL o ID de YouTube / playlist" />
                <button onClick={loadYT}>Cargar</button>
              </div>
            ) : (
              <div className="hi-tc-yt-loaded">
                <span className="hi-tc-yt-label">{ytPlaylistId ? "Lista" : "Video"} <Check /></span>
                <div className="hi-tc-yt-loaded-actions">
                  <button className="hi-yt-btn-sm" onClick={retryYT} title="Recargar video" aria-label="Recargar video"><RotateCcw /></button>
                  <button className="hi-yt-btn-sm hi-yt-btn-sm-danger" onClick={clearYT} title="Quitar video" aria-label="Quitar video"><X /></button>
                </div>
              </div>
            )}
            {(ytVideoId || ytPlaylistId) && !ytError && (
              <div className="hi-tc-yt-ctrls">
                <div className="hi-tc-yt-row hi-tc-yt-row-main">
                  {ytPlaylistId && <button className="hi-yt-btn hi-yt-btn-nav" onClick={prevYT} aria-label="Video anterior"><LuSkipBack /></button>}
                  <button className={`hi-yt-btn hi-yt-btn-play ${ytPlaying ? "is-playing" : ""}`} onClick={toggleYT} aria-label={ytPlaying ? "Pausar video" : "Reproducir video"}>{ytPlaying ? <LuPause /> : <LuPlay />}</button>
                  <button className="hi-yt-btn hi-yt-btn-nav" onClick={stopYT} aria-label="Detener video"><LuSquare /></button>
                  {!ytPlaylistId && <button className={`hi-yt-btn hi-yt-btn-loop ${ytLoop ? "active" : ""}`} onClick={toggleLoop} aria-pressed={ytLoop} aria-label="Repetir video"><LuRepeat /></button>}
                  {ytPlaylistId && <button className="hi-yt-btn hi-yt-btn-nav" onClick={nextYT} aria-label="Siguiente video"><LuSkipForward /></button>}
                </div>
              </div>
            )}
            {ytError && (
              <div className="hi-tc-yt-ctrls">
                <div className="hi-tc-yt-row">
                  <button className="hi-yt-btn hi-yt-btn-primary" onClick={retryYT}><RotateCcw /> Reintentar</button>
                  {ytPlaylistId && <button className="hi-yt-btn" onClick={nextYT}>Siguiente →</button>}
                  <button className="hi-yt-btn hi-yt-btn-danger" onClick={clearYT}><X /> Quitar video</button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const hasPublicVisibility = editor.form.visibility === "public";

  return (
    <div className="host-immersive-room" onMouseDown={(e) => e.stopPropagation()}>
      <div className="immersive-particles">
        {particles.map((p) => (
          <div key={p.id} className="immersive-particle"
            style={{ left: p.left, width: p.size, height: p.size, animationDuration: p.duration, animationDelay: p.delay }} />
        ))}
      </div>

      <header className="hi-header">
        <div className="hi-header-left">
          <Monitor />
          <h2>{sessionName || "Sala inmersiva"}</h2>
          <span className="hi-badge">Anfitrión</span>
        </div>

        <div className="hi-header-actions">
          <button type="button" className="hi-theme-switch" role="switch" aria-label="Modo claro"
            aria-checked={theme === "light"} onClick={toggleTheme}
            title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}>
            <span className="hi-theme-thumb" aria-hidden="true">{theme === "light" ? <LuSun /> : <LuMoon />}</span>
          </button>
          {/* Status badge */}
          <span className={`hi-status-badge ${hasPublicVisibility ? "live" : "private"}`}>
            {hasPublicVisibility ? <><span className="hi-status-dot" /> En vivo</> : "Privada"}
          </span>

          {/* Clean view toggle */}
          <button className="hi-btn-label" onClick={toggleCleanView}>
            {cleanView ? <Eye /> : <EyeOff />}
            {cleanView ? "Mostrar herramientas" : "Vista limpia"}
          </button>

          {/* Save */}
          <button className="hi-btn-label" onClick={onSave}><Save /> Guardar</button>

          {/* Publish / Unpublish */}
          <button className="hi-btn-label" onClick={hasPublicVisibility ? onUnpublish : onPublish}>
            <Globe /> {hasPublicVisibility ? "Pasar a privado" : "Publicar"}
          </button>

          {/* Reset tools */}
          <button className="hi-btn-label" onClick={resetTools} title="Restablecer herramientas">
            <RotateCcw />
          </button>

          {/* Finish */}
          <button className="hi-btn-label hi-btn-finish" onClick={handleFinish}>
            <Check /> Finalizar
          </button>

          {/* Exit */}
          <button className="hi-exit-btn" onClick={handleExit}><X /> Salir</button>
        </div>
      </header>

      {/* Main area */}
      <div className={`hi-main ${sideOpen ? "hi-main-shrunk" : ""}`}>
        <HostImmersiveContent
          editor={editor} games={games} formatDuration={formatDuration}
        />
      </div>

      {/* Side panel — accordion */}
      {sideOpen && (
        <aside className="hi-side-panel">
          <div className="hi-side-panel-scroll">
            {openTools.map((id) => {
              const tool = TOOLS.find((t) => t.id === id);
              if (!tool) return null;
              const isCollapsed = !!collapsed[id];
              const idx = openTools.indexOf(id);
              return (
                <div key={id} className="hi-accordion-section">
                  <div className="hi-accordion-header">
                    <button className="hi-accordion-toggle" onClick={() => toggleCollapse(id)}>
                      <tool.icon />
                      <span>{tool.label}</span>
                      <LuChevronDown className="hi-accordion-arrow" aria-hidden="true" style={{ rotate: isCollapsed ? "-90deg" : undefined }} />
                    </button>
                    <div className="hi-accordion-actions">
                      <button onClick={() => moveTool(id, "up")} disabled={idx <= 0} title="Subir" aria-label="Subir herramienta"><LuArrowUp aria-hidden="true" /></button>
                      <button onClick={() => moveTool(id, "down")} disabled={idx >= openTools.length - 1} title="Bajar" aria-label="Bajar herramienta"><LuArrowDown aria-hidden="true" /></button>
                      <button onClick={() => closeTool(id)} title="Cerrar" aria-label="Cerrar herramienta"><X aria-hidden="true" /></button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="hi-accordion-body">
                      {renderToolContent(id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Dock */}
      {!cleanView && (
        <nav className="hi-dock">
          {TOOLS.map((tool) => {
            const isOpen = openTools.includes(tool.id);
            return (
              <button key={tool.id} className={`hi-dock-btn ${isOpen ? "active" : ""} ${tool.id === "ambient" && ambientPlaying ? "has-indicator" : ""} ${tool.id === "youtube" && (ytVideoId || ytPlaylistId) ? "has-indicator" : ""}`}
                onClick={() => toggleTool(tool.id)} title={tool.label}>
                <tool.icon />
                <span className="hi-dock-label">{tool.label}</span>
                {tool.id === "ambient" && ambientPlaying && <span className="hi-dock-indicator" />}
                {tool.id === "youtube" && (ytVideoId || ytPlaylistId) && <span className="hi-dock-indicator" />}
              </button>
            );
          })}
        </nav>
      )}

      {/* YouTube miniplayer — ocultar con CSS para mantener el player vivo */}
      {(ytVideoId || ytPlaylistId) && (
        <div ref={videoWindow} className={`hi-yt-miniplayer ${ytMinimized ? "minimized" : ""}`}
          style={videoPosition ? { ...videoPosition, right: "auto", bottom: "auto" } : undefined}>
          <div className="hi-video-titlebar">
            <button type="button" className="hi-video-drag" aria-label="Mover reproductor con las flechas"
              onKeyDown={moveVideoWithKeys} onPointerDown={startVideoDrag}
              onPointerMove={(event) => {
                const drag = videoDrag.current;
                if (drag && event.currentTarget.hasPointerCapture(event.pointerId)) {
                  moveVideo(event.clientX - drag.x, event.clientY - drag.y);
                }
              }}
              onLostPointerCapture={() => { videoDrag.current = null; }}>
              <LuMove aria-hidden="true" /> YouTube
            </button>
            <button type="button" onClick={() => { setYtMinimized(true); stopYT(); }} aria-label="Minimizar reproductor"><LuMinus /></button>
          </div>
          <div ref={videoMount} className="hi-video-frame" />
          {ytError && <div className="hi-yt-miniplayer-error">{ytError}</div>}

        </div>
      )}
      {/* Botón flotante para restaurar */}
      {ytMinimized && (ytVideoId || ytPlaylistId) && (
        <button className="hi-yt-restore-btn" onClick={() => { setVideoPosition(null); setYtMinimized(false); }} title="Restaurar YouTube" aria-label="Restaurar reproductor de YouTube">
          <Youtube />
        </button>
      )}
    </div>
  );
}

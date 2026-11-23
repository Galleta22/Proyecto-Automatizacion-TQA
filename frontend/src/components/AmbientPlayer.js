import React, { useEffect, useRef, useState } from "react";
import {
  LuMusic as Music, LuVolume2 as Volume, LuVolumeX as VolumeOff,
  LuDroplets as Droplets, LuWind as Wind,
  LuMoon as Moon, LuTreePine as Tree,
  LuFlame as Flame, LuRadio as Radio,
} from "react-icons/lu";
import FloatingPanel from "./FloatingPanel";
import "./AmbientPlayer.css";

const PRESETS = [
  { id: "rain", label: "Lluvia", icon: Droplets, color: "#4a90d9" },
  { id: "wind", label: "Viento", icon: Wind, color: "#8ecae6" },
  { id: "night", label: "Noche", icon: Moon, color: "#6b4e9e" },
  { id: "forest", label: "Bosque", icon: Tree, color: "#2d8a4e" },
  { id: "fire", label: "Fuego", icon: Flame, color: "#e76f51" },
  { id: "lofi", label: "Lo-fi", icon: Radio, color: "#e9c46a" },
];

function createNoiseBuffer(ctx, seconds) {
  const bufferSize = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createConvolver(ctx, type) {
  const sr = ctx.sampleRate;
  const len = sr * (type === "room" ? 0.3 : 1.2);
  const buffer = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * (type === "room" ? 0.05 : 0.3))) * 0.5;
  }
  const conv = ctx.createConvolver();
  conv.buffer = buffer;
  return conv;
}

function startRain(ctx, gain) {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 4);
  noise.loop = true;
  const lp1 = ctx.createBiquadFilter();
  lp1.type = "lowpass"; lp1.frequency.value = 800; lp1.Q.value = 0.5;
  const lp2 = ctx.createBiquadFilter();
  lp2.type = "highpass"; lp2.frequency.value = 100;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.2 + Math.random() * 0.1;
  lfoGain.gain.value = 400;
  lfo.connect(lfoGain); lfoGain.connect(lp1.frequency);
  noise.connect(lp1); lp1.connect(lp2);
  const conv = createConvolver(ctx, "room");
  lp2.connect(conv); conv.connect(gain);
  noise.start(); lfo.start();
  return [noise, lp1, lp2, lfo, lfoGain, conv];
}

function startWind(ctx, gain) {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 5); noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 350; bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 150;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.08; lfoGain.gain.value = 250;
  lfo.connect(lfoGain); lfoGain.connect(bp.frequency);
  const lfo2 = ctx.createOscillator();
  const lg2 = ctx.createGain();
  lfo2.frequency.value = 0.3; lg2.gain.value = 0.4;
  lfo2.connect(lg2); lg2.connect(gain.gain);
  noise.connect(bp); bp.connect(hp); hp.connect(gain);
  noise.start(); lfo.start(); lfo2.start();
  return [noise, bp, hp, lfo, lfoGain, lfo2, lg2];
}

function startNight(ctx, gain) {
  const osc1 = ctx.createOscillator();
  osc1.type = "sine"; osc1.frequency.value = 55;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine"; osc2.frequency.value = 110; osc2.detune.value = 3;
  const g1 = ctx.createGain(); g1.gain.value = 0.3;
  const g2 = ctx.createGain(); g2.gain.value = 0.15;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 300;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 3); noise.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "highpass"; nf.frequency.value = 5000;
  const ng = ctx.createGain(); ng.gain.value = 0.02;
  osc1.connect(g1); g1.connect(filter);
  osc2.connect(g2); g2.connect(filter);
  noise.connect(nf); nf.connect(ng); ng.connect(filter);
  filter.connect(gain);
  osc1.start(); osc2.start(); noise.start();
  return [osc1, osc2, g1, g2, filter, noise, nf, ng];
}

function startForest(ctx, gain) {
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 4); noise.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 2000;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 4000; bp.Q.value = 1.5;
  const conv = createConvolver(ctx, "hall");
  noise.connect(hp); hp.connect(bp); bp.connect(conv); conv.connect(gain);
  noise.start();
  const chirp = () => {
    if (!ctx || ctx.state === "closed") return;
    const osc = ctx.createOscillator();
    const cg = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 1500 + Math.random() * 3500;
    cg.gain.value = 0.04;
    cg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    osc.connect(cg); cg.connect(pan); pan.connect(gain);
    osc.start(); osc.stop(ctx.currentTime + 0.12);
    setTimeout(chirp, 1500 + Math.random() * 5000);
  };
  chirp();
  return [noise, hp, bp, conv];
}

function startFire(ctx, gain) {
  const n1 = ctx.createBufferSource();
  n1.buffer = createNoiseBuffer(ctx, 3); n1.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 500;
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 6 + Math.random() * 3; lg.gain.value = 350;
  lfo.connect(lg); lg.connect(lp.frequency);
  const crackle = ctx.createBufferSource();
  crackle.buffer = createNoiseBuffer(ctx, 1); crackle.loop = true;
  const cp = ctx.createBiquadFilter();
  cp.type = "highpass"; cp.frequency.value = 3000;
  const cg = ctx.createGain(); cg.gain.value = 0.15;
  const lfo2 = ctx.createOscillator();
  const lg2 = ctx.createGain();
  lfo2.frequency.value = 12; lg2.gain.value = 0.1;
  lfo2.connect(lg2); lg2.connect(cg.gain);
  const conv = createConvolver(ctx, "room");
  n1.connect(lp); lp.connect(conv);
  crackle.connect(cp); cp.connect(cg); cg.connect(conv);
  conv.connect(gain);
  n1.start(); lfo.start(); crackle.start(); lfo2.start();
  return [n1, lp, lfo, lg, crackle, cp, cg, lfo2, lg2, conv];
}

function startLofi(ctx, gain) {
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle"; osc1.frequency.value = 130.81;
  const oscs = [osc1];
  const g1 = ctx.createGain(); g1.gain.value = 0.12;
  osc1.connect(g1); g1.connect(gain);
  osc1.start();
  [261.63, 329.63, 392.00].forEach((freq) => {
    const o = ctx.createOscillator();
    o.type = "sine"; o.frequency.value = freq;
    const og = ctx.createGain(); og.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 2 + Math.random(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(og.gain);
    o.connect(og); og.connect(gain);
    o.start(); lfo.start();
    oscs.push(o, og, lfo, lg);
  });
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, 2); noise.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass"; nf.frequency.value = 6000; nf.Q.value = 0.3;
  const ng = ctx.createGain(); ng.gain.value = 0.015;
  noise.connect(nf); nf.connect(ng); ng.connect(gain);
  noise.start();
  oscs.push(noise, nf, ng);
  return oscs;
}

const ENGINES = {
  rain: startRain, wind: startWind, night: startNight,
  forest: startForest, fire: startFire, lofi: startLofi,
};

export default function AmbientPlayer({ mode, onModeChange }) {
  const [active, setActive] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const audioContextRef = useRef(null);
  const nodesRef = useRef([]);
  const gainRef = useRef(null);

  const stopAll = () => {
    nodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    nodesRef.current = [];
    setPlaying(false);
    if (audioContextRef.current?.state !== "closed") audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const startPreset = (presetId) => {
    stopAll();
    if (presetId === active && playing) { setActive(null); return; }
    setActive(presetId);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = ctx;
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;
    gain.connect(ctx.destination);
    gainRef.current = gain;
    const engine = ENGINES[presetId];
    if (engine) nodesRef.current = engine(ctx, gain);
    setPlaying(true);
  };

  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = volume / 100; }, [volume]);
  useEffect(() => { return () => stopAll(); }, []);

  return (
    <FloatingPanel id="ambient" title="Sonido ambiente" icon={Music} defaultPosition="left" compactWidth={320} mode={mode} onModeChange={onModeChange}>
      <div className="ambient-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`ambient-preset-btn ${active === p.id ? "active" : ""}`}
            style={{ "--accent": p.color }}
            onClick={() => startPreset(p.id)}
            title={p.label}
          >
            <p.icon /><span>{p.label}</span>
            {active === p.id && playing && <span className="ambient-playing-dot" />}
          </button>
        ))}
      </div>
      {active && playing && (
        <div className="ambient-controls">
          <button className="ambient-play-btn" onClick={() => { stopAll(); setActive(null); }}>
            <VolumeOff /> Detener
          </button>
          <div className="ambient-volume">
            <Volume />
            <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </div>
        </div>
      )}
    </FloatingPanel>
  );
}

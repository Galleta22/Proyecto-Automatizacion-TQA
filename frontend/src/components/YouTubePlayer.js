import React, { useRef, useState, useEffect } from "react";
import { LuYoutube as Youtube, LuX as X } from "react-icons/lu";
import FloatingPanel from "./FloatingPanel";
import "./YouTubePlayer.css";

let youtubeApiReady = false;
let readyCallbacks = [];
window.onYouTubeIframeAPIReady = () => {
  youtubeApiReady = true;
  readyCallbacks.forEach((cb) => cb());
  readyCallbacks = [];
};
function waitForYoutubeApi() {
  return new Promise((resolve) => {
    if (youtubeApiReady) return resolve();
    readyCallbacks.push(resolve);
  });
}
if (!window.YT && !document.querySelector("#youtube-api-script")) {
  const tag = document.createElement("script");
  tag.id = "youtube-api-script";
  tag.src = "https://www.youtube.com/iframe_api";
  const first = document.getElementsByTagName("script")[0];
  first.parentNode.insertBefore(tag, first);
}

export default function YouTubePlayer({ mode, onModeChange }) {
  const [url, setUrl] = useState("");
  const [player, setPlayer] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [error, setError] = useState("");
  const playerRef = useRef(null);

  const extractId = (input) => {
    const clean = input.trim();
    if (!clean) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) { const m = clean.match(p); if (m) return m[1]; }
    return null;
  };

  const loadVideo = async () => {
    const id = extractId(url);
    if (!id) { setError("URL o ID de YouTube inválido"); return; }
    setError("");
    setVideoId(id);
    await waitForYoutubeApi();
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    const newPlayer = new window.YT.Player("youtube-player-box", {
      height: "160", width: "280",
      videoId: id,
      playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0 },
      events: {
        onReady: () => { newPlayer.playVideo(); setPlaying(true); },
        onStateChange: (e) => setPlaying(e.data === window.YT.PlayerState.PLAYING),
      },
    });
    playerRef.current = newPlayer;
    setPlayer(newPlayer);
  };

  const togglePlay = () => { if (player) playing ? player.pauseVideo() : player.playVideo(); };
  useEffect(() => { return () => { if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; } }; }, []);

  return (
    <FloatingPanel id="youtube" title="YouTube" icon={Youtube} defaultPosition="right" compactWidth={300} mode={mode} onModeChange={onModeChange}>
      {!videoId ? (
        <div className="youtube-input-group">
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadVideo()} placeholder="URL o ID de YouTube" />
          <button onClick={loadVideo}>Cargar</button>
        </div>
      ) : (
        <div className="youtube-player-box" id="youtube-player-box" />
      )}
      {error && <span className="youtube-error">{error}</span>}
      {videoId && (
        <div className="youtube-controls">
          <button onClick={togglePlay}>{playing ? "Pausa" : "Reproducir"}</button>
          <button onClick={() => { setVideoId(null); setPlayer(null); if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; } }}><X /> Cerrar</button>
        </div>
      )}
    </FloatingPanel>
  );
}

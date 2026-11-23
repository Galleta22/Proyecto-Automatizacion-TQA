import React, { useMemo, useEffect } from "react";
import { LuMonitor as Monitor, LuX as X } from "react-icons/lu";
import AmbientPlayer from "./AmbientPlayer";
import "./ImmersiveRoom.css";

const PARTICLE_COUNT = 30;

export default function ImmersiveRoom({ children, sessionName, onExit }) {
    const particles = useMemo(() =>
        Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            size: `${1 + Math.random() * 3}px`,
            duration: `${10 + Math.random() * 20}s`,
            delay: `${Math.random() * 15}s`,
        })),
    []);

    useEffect(() => {
      document.body.classList.add("hi-open");
      document.documentElement.classList.add("hi-open");
      return () => {
        document.body.classList.remove("hi-open");
        document.documentElement.classList.remove("hi-open");
      };
    }, []);

    return (
        <div className="immersive-room" onMouseDown={(e) => e.stopPropagation()}>
            <div className="immersive-particles">
                {particles.map((p) => (
                    <div
                        key={p.id}
                        className="immersive-particle"
                        style={{
                            left: p.left,
                            width: p.size,
                            height: p.size,
                            animationDuration: p.duration,
                            animationDelay: p.delay,
                        }}
                    />
                ))}
            </div>
            <div className="immersive-header">
                <h2><Monitor /> {sessionName || "Sala inmersiva"}</h2>
                <button onClick={onExit}><X /> Salir del modo inmersivo</button>
            </div>
            {children}
            <AmbientPlayer />
        </div>
    );
}

import React, { useEffect, useState } from "react";
import GameList from "./GameList";
import { getToken } from "../services/auth";

export default function JuegosPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchGames = async () => {
    setLoading(true);
    const res = await fetch("http://localhost:8000/games", {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    setGames(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    fetchGames();
  }, []);

  return (
    <div>
      <h2>Juegos</h2>
      <GameList games={games} loading={loading} />
    </div>
  );
}

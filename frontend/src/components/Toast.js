import React from "react";
import "./Toast.css";

export default function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="toast">
      {message}
      <button onClick={onClose} className="toast-close">&times;</button>
    </div>
  );
}

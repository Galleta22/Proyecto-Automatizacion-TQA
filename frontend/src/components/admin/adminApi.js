import { getToken, logout } from "../../services/auth";

export const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

export async function adminRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    logout();
    window.dispatchEvent(new CustomEvent("ludisist:admin-session-invalid"));
    throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || `Error ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

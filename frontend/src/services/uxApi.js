import { getToken } from "./auth";
export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
export async function uxRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { "Content-Type":"application/json", ...(getToken() ? { Authorization:`Bearer ${getToken()}` } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Revisa los datos o vuelve a intentarlo");
  return data;
}

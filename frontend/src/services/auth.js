const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export async function login(username, password) {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo iniciar sesión");
  }
  const data = await response.json();
  localStorage.setItem("token", data.access_token);
  return data;
}

export function logout() {
  const id = parseJwt(getToken())?.user_id;
  for (const key of Object.keys(sessionStorage)) {
    if (key === "ludisist_chat_messages" || key === `ludisist:ai:${id}` || key.startsWith(`ludisist:message:${id}:`)) sessionStorage.removeItem(key);
  }
  localStorage.removeItem("token");
}

export function getToken() {
  return localStorage.getItem("token");
}

async function publicAuthRequest(path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "No se pudo completar la solicitud");
  return data;
}

export const forgotPassword = (email) => publicAuthRequest("/password/forgot", { email });
export const resetPassword = (token, password) => publicAuthRequest("/password/reset", { token, password });
export const verifyEmail = (token) => publicAuthRequest("/email/verify", { token });
export const resendVerification = (email) => publicAuthRequest("/email/resend", { email });

export async function refreshSession() {
  const response = await fetch(`${API_URL}/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo renovar la sesión");
  }
  const data = await response.json();
  localStorage.setItem("token", data.access_token);
  window.dispatchEvent(new CustomEvent("ludisist:session-refreshed", {
    detail: parseJwt(data.access_token),
  }));
  return data;
}

// Decode JWT to read roles (basic)
export function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

export function isTokenExpired(token, marginSeconds = 0) {
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + marginSeconds * 1000;
}

import { getToken } from "./auth";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const API_URL = `${BASE_URL}/games`;

export async function getGames(options = null) {
    const token = getToken();
    const params = new URLSearchParams();
    if (options?.paginated) {
        params.set("paginated", "true");
        params.set("page", String(options.page || 1));
        params.set("page_size", String(options.pageSize === "all" ? 20 : options.pageSize || 20));
        params.set("all_items", String(options.pageSize === "all"));
        if (options.query) params.set("q", options.query);
        if (options.sort) params.set("sort", options.sort);
    }
    const response = await fetch(`${API_URL}${params.size ? `?${params}` : ""}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        throw new Error("Error al obtener juegos");
    }
    return await response.json();
}

export async function getRandomGame() {
    const token = getToken();
    const response = await fetch(`${API_URL}/random`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        throw new Error("Error al obtener juego aleatorio");
    }
    return await response.json();
}

export async function getGameById(id) {
    const token = getToken();
    const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        throw new Error("Error al obtener juego");
    }
    return await response.json();
}

export async function deleteGame(id) {
    const token = getToken();
    const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        // Intentar leer mensaje de error del backend
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al eliminar juego");
        } catch (e) {
            // Validate if it was the previous throw
            if (e.message !== "Error al eliminar juego" && e.message !== "[object Object]") throw e;

            // If json failed, try text
            const text = await response.text();
            throw new Error(text || `Error al eliminar juego (${response.status})`);
        }
    }
    return await response.json();
}

export async function createGame(gameData) {
    const token = getToken();
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(gameData),
    });

    if (!response.ok) {
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al crear juego");
        } catch (e) {
            throw new Error("Error al crear juego");
        }
    }
    return await response.json();
}

export async function updateGame(id, gameData) {
    const token = getToken();
    const response = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(gameData),
    });

    if (!response.ok) {
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al actualizar juego");
        } catch (e) {
            throw new Error("Error al actualizar juego");
        }
    }
    return await response.json();
}

// ==================== RULES API ====================
const RULES_URL = `${BASE_URL}/rules`;

export async function getRules() {
    const token = getToken();
    const response = await fetch(RULES_URL, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error("Error al obtener reglas");
    }
    return await response.json();
}

export async function createRule(ruleData) {
    const token = getToken();
    const response = await fetch(RULES_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(ruleData),
    });

    if (!response.ok) {
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al crear regla");
        } catch (e) {
            if (e.message.includes("Error al crear")) throw e;
            throw new Error("Error al crear regla");
        }
    }
    return await response.json();
}

export async function updateRule(id, ruleData) {
    const token = getToken();
    const response = await fetch(`${RULES_URL}/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(ruleData),
    });

    if (!response.ok) {
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al actualizar regla");
        } catch (e) {
            if (e.message.includes("Error al actualizar")) throw e;
            throw new Error("Error al actualizar regla");
        }
    }
    return await response.json();
}

export async function deleteRule(id) {
    const token = getToken();
    const response = await fetch(`${RULES_URL}/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        try {
            const err = await response.json();
            throw new Error(err.detail || "Error al eliminar regla");
        } catch (e) {
            if (e.message.includes("Error al eliminar")) throw e;
            throw new Error("Error al eliminar regla");
        }
    }
    return await response.json();
}

export async function deleteAccount(password) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/me/deactivate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Error al desactivar la cuenta");
    }
    return await response.json();
}

export async function rateGame(gameId, rating) {
    const token = getToken();
    const response = await fetch(`${API_URL}/${gameId}/rating?rating=${rating}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo guardar la valoración");
    }
    return await response.json();
}

export async function removeGameRating(gameId) {
    const token = getToken();
    const response = await fetch(`${API_URL}/${gameId}/rating`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo quitar la valoración");
    }
    return await response.json();
}

export async function getGameTips(gameId) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/tips/game/${gameId}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("No se pudieron cargar los tips");
    return await response.json();
}

export async function createGameTip(gameId, payload) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/tips/game/${gameId}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo publicar el tip");
    }
    return await response.json();
}

export async function updateGameTip(tipId, payload) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/tips/${tipId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo actualizar el tip");
    }
    return await response.json();
}

export async function deleteGameTip(tipId) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/tips/${tipId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo eliminar el tip");
    }
    return await response.json();
}

export async function getGameManuals(gameId = "") {
    const token = getToken();
    const query = gameId ? `?game_id=${encodeURIComponent(gameId)}` : "";
    const response = await fetch(`${BASE_URL}/manuals/${query}`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("No se pudieron cargar los reglamentos digitales");
    return await response.json();
}

export function uploadGameManual(payload, onProgress) {
    return sendGameManual("/manuals/", "POST", payload, onProgress);
}

export function replaceGameManualFile(manualId, payload, onProgress) {
    return sendGameManual(`/manuals/${manualId}/file`, "PUT", payload, onProgress);
}

async function sendGameManual(path, method, payload, onProgress) {
    const token = getToken();
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
    if (onProgress) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open(method, `${BASE_URL}${path}`);
            request.setRequestHeader("Authorization", `Bearer ${token}`);
            request.responseType = "json";
            request.upload.onprogress = (event) => {
                if (event.lengthComputable && event.total > 0) {
                    onProgress(Math.floor(100 * event.loaded / event.total));
                }
            };
            request.upload.onload = () => onProgress(100);
            request.onload = () => {
                if (request.status >= 200 && request.status < 300 && request.response) {
                    resolve(request.response);
                    return;
                }
                const detail = request.response?.detail;
                reject(new Error(typeof detail === "string" ? detail : "No se pudo subir el reglamento"));
            };
            request.onerror = () => reject(new Error("Se perdió la conexión durante la subida."));
            request.onabort = () => reject(new Error("La subida se interrumpió."));
            request.send(formData);
        });
    }
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo subir el reglamento");
    }
    return await response.json();
}

export async function downloadGameManual(manual) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/manuals/${manual.id}/download`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo descargar el reglamento");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = manual.original_filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function viewGameManual(manual) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/manuals/${manual.id}/download`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("No se pudo cargar el reglamento");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

export async function deleteGameManual(manualId) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/manuals/${manualId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo eliminar el reglamento");
    }
    return await response.json();
}

export async function getMySessions() {
    const response = await fetch(`${BASE_URL}/sessions/`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("No se pudieron cargar tus partidas");
    return response.json();
}

export async function getPublicSessions() {
    const response = await fetch(`${BASE_URL}/sessions/public`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("No se pudieron cargar las partidas públicas");
    return response.json();
}

export async function getSessionById(sessionId) {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("No se pudo cargar la partida");
    return response.json();
}

export async function followSession(sessionId) {
    return sessionRequest(`/sessions/${sessionId}/follow`, "POST");
}

export async function unfollowSession(sessionId) {
    return sessionRequest(`/sessions/${sessionId}/unfollow`, "POST");
}

export async function setViewerColor(sessionId, color) {
    return sessionRequest(`/sessions/${sessionId}/color`, "POST", { color });
}

export async function getCommunityUsers() {
    const response = await fetch(`${BASE_URL}/users/community`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("No se pudieron cargar los jugadores registrados");
    return response.json();
}

export async function createGameSession(payload) {
    return sessionRequest("/sessions/", "POST", payload);
}

export async function updateGameSession(sessionId, payload) {
    return sessionRequest(`/sessions/${sessionId}`, "PUT", payload);
}

export async function completeGameSession(sessionId) {
    return sessionRequest(`/sessions/${sessionId}/complete`, "POST");
}

export async function deleteGameSession(sessionId) {
    return sessionRequest(`/sessions/${sessionId}`, "DELETE");
}

async function sessionRequest(path, method, payload) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${getToken()}`,
            ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo actualizar la partida");
    }
    return response.json();
}

export async function uploadSessionSnapshot(file) {
    return uploadProfileImage(file);
}

export async function getMyProfile() {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/me/profile`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al cargar el perfil");
    return await response.json();
}

export async function getPublicProfile(userId) {
    const response = await fetch(`${BASE_URL}/users/public/${userId}`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo cargar el perfil");
    }
    return response.json();
}

export async function getPublicUserSessions(userId, page = 1, pageSize = 10) {
    const response = await fetch(`${BASE_URL}/users/public/${userId}/sessions?page=${page}&page_size=${pageSize}`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("Error al cargar sesiones del usuario");
    return response.json();
}

export async function followUser(userId) {
    const response = await fetch(`${BASE_URL}/users/${userId}/follow`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Error al seguir usuario");
    }
    return response.json();
}

export async function unfollowUser(userId) {
    const response = await fetch(`${BASE_URL}/users/${userId}/follow`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Error al dejar de seguir");
    }
    return response.json();
}

export async function getMyFollowing(page = 1, pageSize = 20) {
    const response = await fetch(`${BASE_URL}/users/me/following?page=${page}&page_size=${pageSize}`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("Error al cargar seguidos");
    return response.json();
}

export async function getMyFollowers(page = 1, pageSize = 20) {
    const response = await fetch(`${BASE_URL}/users/me/followers?page=${page}&page_size=${pageSize}`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("Error al cargar seguidores");
    return response.json();
}

export async function updateMyProfile(profile) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/me/profile`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Error al actualizar el perfil");
    }
    return await response.json();
}

export async function getNotificationPreferences() {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/me/notification-preferences`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al obtener preferencias de notificación");
    return await response.json();
}

export async function updateNotificationPreferences(prefs) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/me/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(prefs),
    });
    if (!response.ok) throw new Error("Error al actualizar preferencias de notificación");
    return await response.json();
}

export async function uploadProfileImage(file) {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${BASE_URL}/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo subir la imagen");
    }
    return await response.json();
}

export async function getMyBadges() {
    const response = await fetch(`${BASE_URL}/badges/me`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) throw new Error("No se pudieron cargar las insignias");
    return response.json();
}

export async function requestBadge(badgeId) {
    const response = await fetch(`${BASE_URL}/badges/${badgeId}/request`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo enviar la solicitud");
    }
    return response.json();
}

export async function setFavoriteBadge(badgeId) {
    const response = await fetch(`${BASE_URL}/badges/${badgeId}/favorite`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo cambiar la insignia favorita");
    }
    return response.json();
}

async function matchmakingRequest(path, method = "GET", payload) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${getToken()}`,
            ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(formatMatchmakingError(error.detail));
    }
    return response.json();
}

function formatMatchmakingError(detail) {
    if (typeof detail === "string") return detail;
    if (!Array.isArray(detail)) return "No se pudo completar la operación";
    const labels = {
        game_id: "Juego",
        title: "Título",
        scheduled_at: "Fecha y hora",
        location: "Lugar",
        capacity: "Cupos totales",
        tutor_mode: "Modalidad",
        notes: "Notas",
    };
    return detail.map((item) => {
        const field = item.loc?.[item.loc.length - 1];
        const label = labels[field] || "Dato inválido";
        if (item.type === "string_too_short") return `${label}: escribe al menos ${item.ctx?.min_length || 3} caracteres`;
        if (item.type === "string_too_long") return `${label}: supera el máximo permitido`;
        if (item.type === "greater_than_equal") return `${label}: el mínimo es ${item.ctx?.ge}`;
        if (item.type === "less_than_equal") return `${label}: el máximo es ${item.ctx?.le}`;
        if (item.type === "missing") return `${label}: este campo es obligatorio`;
        return `${label}: revisa el valor ingresado`;
    }).join(" · ");
}

export const getMatchTables = (filters = "") => matchmakingRequest(`/matchmaking/${filters}`);
export const createMatchTable = (payload) => matchmakingRequest("/matchmaking/", "POST", payload);
export const requestMatchTable = (tableId, message) => matchmakingRequest(`/matchmaking/${tableId}/request`, "POST", { message });
export const reviewMatchRequest = (requestId, status) => matchmakingRequest(`/matchmaking/requests/${requestId}`, "PUT", { status });
export const cancelMatchTable = (tableId) => matchmakingRequest(`/matchmaking/${tableId}`, "DELETE");
export const finishMatchTable = (tableId) => matchmakingRequest(`/matchmaking/${tableId}/finish`, "PUT");

async function notificationRequest(path, method = "GET") {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { "Authorization": `Bearer ${getToken()}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudieron actualizar las notificaciones");
    }
    return response.json();
}

export const getNotifications = (params = "") => notificationRequest(`/notifications/${params}`);
export const markNotificationRead = (notificationId) => notificationRequest(`/notifications/${notificationId}/read`, "PUT");
export const markAllNotificationsRead = () => notificationRequest("/notifications/read-all", "PUT");
export const deleteNotification = (notificationId) => notificationRequest(`/notifications/${notificationId}`, "DELETE");
export const deleteAllReadNotifications = () => notificationRequest("/notifications/", "DELETE");

export async function getFavoriteGames() {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/games/favorites`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al cargar favoritos");
    return await response.json();
}

export async function setGameFavorite(gameId, favorite) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/games/${gameId}/favorite`, {
        method: favorite ? "POST" : "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "No se pudo actualizar el favorito");
    }
    return await response.json();
}

export async function sendMessage(recipientId, content) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/messages/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ recipient_id: recipientId, content }),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Error al enviar mensaje");
    }
    return response.json();
}

export async function getConversations(page = 1) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/messages/conversations?page=${page}`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al cargar conversaciones");
    return response.json();
}

export async function getConversation(otherUserId, page = 1) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/messages/${otherUserId}?page=${page}`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al cargar conversación");
    return response.json();
}

export async function markMessageRead(messageId) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/messages/${messageId}/read`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al marcar mensaje");
    return response.json();
}

export async function getLeaderboard(sort = "xp", page = 1) {
    const token = getToken();
    const response = await fetch(`${BASE_URL}/users/leaderboard?sort=${sort}&page=${page}`, {
        headers: { "Authorization": `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Error al cargar ranking");
    return response.json();
}

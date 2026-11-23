import { useSyncExternalStore } from "react";

const themeKey = "ludisist:theme";
const themeEvent = "ludisist:theme-changed";

function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(callback) {
  window.addEventListener(themeEvent, callback);
  return () => window.removeEventListener(themeEvent, callback);
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(themeKey, next);
  } catch {
    // The theme still applies when local storage is unavailable.
  }
  window.dispatchEvent(new Event(themeEvent));
}

export default function useTheme() {
  return useSyncExternalStore(subscribe, getTheme);
}

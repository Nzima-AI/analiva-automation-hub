"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";

const APPEARANCE_CHANGE = "analiva-appearance-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  window.addEventListener(APPEARANCE_CHANGE, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(APPEARANCE_CHANGE, onChange);
  };
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(APPEARANCE_CHANGE));
}

function isDark() {
  const explicit = document.documentElement.dataset.theme;
  return explicit ? explicit === "dark" : window.matchMedia(DARK_QUERY).matches;
}

function isSidebarCollapsed() {
  return document.documentElement.dataset.sidebar === "collapsed";
}

const defaultPreference = () => false;

export function useSidebarAppearance() {
  const collapsed = useSyncExternalStore(subscribe, isSidebarCollapsed, defaultPreference);
  function toggle() {
    const next = isSidebarCollapsed() ? "expanded" : "collapsed";
    document.documentElement.dataset.sidebar = next;
    savePreference("analiva-hub-sidebar", next);
  }
  return { collapsed, toggle };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, defaultPreference);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  function toggle() {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    savePreference("analiva-hub-theme", next);
  }

  return (
    <button type="button" className="shell-icon theme-toggle" aria-label={label} title={label} onClick={toggle}>
      <Sun className="theme-sun" size={19} weight="duotone" aria-hidden />
      <Moon className="theme-moon" size={18} weight="duotone" aria-hidden />
    </button>
  );
}

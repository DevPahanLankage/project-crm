"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "visiontech-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  function toggleTheme() {
    const nextTheme: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The visual theme can still switch even if browser storage is blocked.
    }
    setTheme(nextTheme);
  }

  const isDark = theme === "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-checked={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-mode={theme}
      suppressHydrationWarning
    >
      <span className="theme-toggle-label theme-toggle-label-light">Light</span>
      <span className="theme-switch" aria-hidden="true">
        <span className="theme-switch-glow" />
        <span className="theme-toggle-thumb">
          <Sun className="theme-toggle-icon theme-toggle-sun" size={12} strokeWidth={2.2} />
          <Moon className="theme-toggle-icon theme-toggle-moon" size={12} strokeWidth={2.2} />
        </span>
      </span>
      <span className="theme-toggle-label theme-toggle-label-dark">Dark</span>
    </button>
  );
}

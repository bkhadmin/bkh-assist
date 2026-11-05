// UI preferences kept on <html> data attributes. Shared by the root layout (server) and the
// client components, so this must stay a plain module (no "use client").
export const SIDEBAR_KEY = "bkh-insight:sidebar-collapsed";
export const THEME_KEY = "bkh-insight:theme";

export type ThemePref = "light" | "dark" | "system";

// Runs in <head> before first paint: applies the saved theme and collapsed rail, so a reload
// shows no flash of the wrong theme and no sidebar animation.
export const prefsInitScript = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)").matches,t;try{t=localStorage.getItem("${THEME_KEY}");if(localStorage.getItem("${SIDEBAR_KEY}")==="1")d.dataset.sidebar="collapsed"}catch(e){}d.dataset.theme=t==="light"||t==="dark"?t:m?"dark":"light"})()`;

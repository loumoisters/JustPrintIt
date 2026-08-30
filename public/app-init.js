// public/app-init.js
// Boots the app once every page-*.js module has registered itself.

// A per-device localStorage override (from clicking the moon icon) always
// wins. With no override yet, falls back to the workspace's Settings >
// Appearance "Default theme" (light/dark/system), which itself falls back
// to the OS preference when set to "system".
function initTheme() {
  const saved = localStorage.getItem('theme');
  const workspaceDefault = state.settings.defaultTheme || 'system';
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let dark;
  if (saved) {
    dark = saved === 'dark';
  } else if (workspaceDefault === 'dark') {
    dark = true;
  } else if (workspaceDefault === 'light') {
    dark = false;
  } else {
    dark = prefersDark;
  }
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('theme-toggle').onclick = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
}

// Same pattern as theme: a per-device localStorage value (from manually
// collapsing/expanding) wins; otherwise falls back to the workspace's
// Settings > Appearance "Default sidebar state".
function initSidebarState() {
  const saved = localStorage.getItem('sidebarCollapsed');
  const collapsed = saved !== null ? saved === 'true' : !!state.settings.defaultSidebarCollapsed;
  document.querySelector('.app-shell').classList.toggle('sidebar-collapsed', collapsed);
}

// Escape closes the topmost open drawer (the stacked "Add new customer"
// panel, if one's open, before the drawer underneath it) - a deliberate
// keyboard action, unlike a stray backdrop click, so it's fine for this to
// stay a quick way out.
function initEscapeToClose() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('modal-root-2')?.querySelector('.modal')) {
      closeModal('modal-root-2');
    } else if (document.getElementById('modal-root')?.querySelector('.modal')) {
      closeModal('modal-root');
    }
  });
}

(async function start() {
  try {
    await refreshCollections(); // populate the client-side cache once at boot
  } catch (err) {
    console.error('Failed to load initial data', err);
  }
  initShell();
  initTheme();
  initSidebarState();
  initEscapeToClose();
  // Land back on whatever page the URL hash points at (set by navigate()
  // as you move around the app) instead of always booting to the
  // Dashboard - that's what made a refresh feel like it "lost your place".
  const hashPage = location.hash.slice(1);
  await navigate(hashPage && PAGE_RENDERERS[hashPage] ? hashPage : 'dashboard');
})();

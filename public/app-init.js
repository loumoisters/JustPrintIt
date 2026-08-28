// public/app-init.js
// Boots the app once every page-*.js module has registered itself.

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = saved ? saved === 'dark' : prefersDark;
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('theme-toggle').onclick = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
}

(async function start() {
  try {
    state.settings = await api('GET', '/api/settings');
  } catch (err) {
    console.error('Failed to load settings', err);
  }
  initShell();
  initTheme();
  await navigate('dashboard');
})();

// Theme Management System
(function() {
  'use strict';
  
  const THEMES = {
    meridian: { name: 'Meridian (Default)', icon: '🌙' },
    dark: { name: 'Dark Mode', icon: '🌑' },
    blue: { name: 'Ocean Blue', icon: '💙' },
    green: { name: 'Forest Green', icon: '💚' },
    purple: { name: 'Purple Haze', icon: '💜' }
  };

  function initTheme() {
    const savedTheme = localStorage.getItem('hrms-theme') || 'meridian';
    applyTheme(savedTheme);
  }

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
  }

  function setTheme(themeName) {
    if (THEMES[themeName]) {
      applyTheme(themeName);
      localStorage.setItem('hrms-theme', themeName);
      if (typeof toast === 'function') {
        toast(`Theme changed to ${THEMES[themeName].name}`, 'success');
      }
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'meridian';
  }

  function renderThemeSelector() {
    const currentTheme = getCurrentTheme();
    let html = '<div class="grid grid-2" style="gap:12px">';
    
    Object.entries(THEMES).forEach(([key, theme]) => {
      const isActive = currentTheme === key;
      html += `
        <button type="button" class="theme-card ${isActive ? 'active' : ''}" data-theme="${key}">
          <div class="theme-preview" data-theme="${key}">
            <div class="theme-colors">
              <span class="color-dot" style="background:var(--accent)"></span>
              <span class="color-dot" style="background:var(--teal)"></span>
              <span class="color-dot" style="background:var(--paper)"></span>
            </div>
          </div>
          <div class="theme-info">
            <div class="theme-emoji">${theme.icon}</div>
            <div class="theme-name">${theme.name}</div>
            ${isActive ? '<div class="theme-badge">Active</div>' : ''}
          </div>
        </button>
      `;
    });
    
    html += '</div>';
    return html;
  }

  // Initialize theme on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  // Expose functions globally
  window.ThemeManager = {
    init: initTheme,
    set: setTheme,
    getCurrent: getCurrentTheme,
    renderSelector: renderThemeSelector,
    themes: THEMES
  };
})();

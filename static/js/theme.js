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

  const THEME_SWATCHES = {
    meridian: { accent: '#c2703d', teal: '#0f766e', paper: '#f5f3ee' },
    dark: { accent: '#e89860', teal: '#14a895', paper: '#0f1514' },
    blue: { accent: '#3b82f6', teal: '#0891b2', paper: '#f0f4f8' },
    green: { accent: '#10b981', teal: '#0f766e', paper: '#f0f8f4' },
    purple: { accent: '#8b5cf6', teal: '#7c3aed', paper: '#f5f3f8' }
  };

  function clearBrandAccentOverrides() {
    const root = document.documentElement.style;
    root.removeProperty('--accent');
    root.removeProperty('--accent-dark');
    root.removeProperty('--accent-soft');
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('hrms-theme') || 'meridian';
    applyTheme(savedTheme);
  }

  function applyTheme(themeName) {
    if (!THEMES[themeName]) themeName = 'meridian';
    clearBrandAccentOverrides();
    document.documentElement.setAttribute('data-theme', themeName);
  }

  function setTheme(themeName) {
    if (THEMES[themeName]) {
      applyTheme(themeName);
      localStorage.setItem('hrms-theme', themeName);
      document.dispatchEvent(new CustomEvent('hrms-theme-change', { detail: { theme: themeName } }));
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
      const sw = THEME_SWATCHES[key] || THEME_SWATCHES.meridian;
      html += `
        <button type="button" class="theme-card ${isActive ? 'active' : ''}" data-theme="${key}">
          <div class="theme-preview" data-theme="${key}" style="background:${sw.paper}">
            <div class="theme-colors">
              <span class="color-dot" style="background:${sw.accent}"></span>
              <span class="color-dot" style="background:${sw.teal}"></span>
              <span class="color-dot" style="background:${sw.paper}"></span>
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

  function renderThemeMenu() {
    const currentTheme = getCurrentTheme();
    return Object.entries(THEMES).map(([key, theme]) => {
      const sw = THEME_SWATCHES[key] || THEME_SWATCHES.meridian;
      const active = currentTheme === key;
      const checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><polyline points="20 6 9 17 4 12"/></svg>';
      return '<button type="button" class="theme-menu-item' + (active ? ' active' : '') + '" data-theme-pick="' + key + '" role="menuitem" aria-checked="' + active + '">'
        + '<span class="theme-menu-swatch" style="background:' + sw.accent + '" aria-hidden="true"></span>'
        + '<span class="theme-menu-name">' + theme.name + '</span>'
        + (active ? '<span class="theme-menu-check">' + checkIcon + 'Active</span>' : '')
        + '</button>';
    }).join('');
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
    renderMenu: renderThemeMenu,
    themes: THEMES
  };
})();

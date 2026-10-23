// Theme Settings Integration
(function() {
  'use strict';

  function renderThemeSettings() {
    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-head">
          <div>
            <h3>Theme & Appearance</h3>
            <div class="sub">Choose your preferred color theme for the HR portal. Changes apply immediately across the app.</div>
          </div>
        </div>
        <div class="card-body">
          <div id="theme-selector-container">${window.ThemeManager.renderSelector()}</div>
        </div>
      </div>
    `;
  }

  function refreshThemeSelector() {
    const container = document.querySelector('#theme-selector-container');
    if (container) container.innerHTML = window.ThemeManager.renderSelector();
  }

  function initThemeSettings() {
    document.addEventListener('click', function(e) {
      const themeBtn = e.target.closest('[data-theme]');
      if (!themeBtn || !themeBtn.classList.contains('theme-card')) return;
      if (!themeBtn.closest('#theme-selector-container')) return;
      e.preventDefault();
      window.ThemeManager.set(themeBtn.dataset.theme);
      refreshThemeSelector();
    });

    document.addEventListener('hrms-theme-change', refreshThemeSelector);
  }

  window.ThemeSettings = {
    render: renderThemeSettings,
    init: initThemeSettings
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSettings);
  } else {
    initThemeSettings();
  }
})();

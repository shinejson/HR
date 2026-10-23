// Theme Settings Integration
(function() {
  'use strict';

  // Add theme settings to the settings page
  function renderThemeSettings() {
    return `
      <div class="card" style="margin-bottom:18px">
        <div class="card-head">
          <div>
            <h3>🎨 Theme & Appearance</h3>
            <div class="sub">Choose your preferred color theme for the HR portal</div>
          </div>
        </div>
        <div class="card-body">
          <div id="theme-selector-container">${window.ThemeManager.renderSelector()}</div>
        </div>
      </div>
    `;
  }

  // Initialize theme selector when settings page loads
  function initThemeSettings() {
    const settingsStage = document.querySelector('#settings-stage');
    if (!settingsStage) return;

    // Add event delegation for theme buttons
    settingsStage.addEventListener('click', function(e) {
      const themeBtn = e.target.closest('[data-theme]');
      if (themeBtn && themeBtn.classList.contains('theme-card')) {
        const themeName = themeBtn.dataset.theme;
        window.ThemeManager.set(themeName);
        
        // Update UI
        const container = document.querySelector('#theme-selector-container');
        if (container) {
          container.innerHTML = window.ThemeManager.renderSelector();
        }
      }
    });
  }

  // Expose functions
  window.ThemeSettings = {
    render: renderThemeSettings,
    init: initThemeSettings
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSettings);
  } else {
    initThemeSettings();
  }
})();

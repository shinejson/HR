/* ============================================================================
   Two-factor authentication UI (authenticator app / TOTP)

   Shared by the Settings › Account & Security tab, the first-sign-in reminder
   for users who have not enrolled yet, and the sign-in verification step.
============================================================================ */
const MfaUI = (() => {
  const TRUST_KEY = "hrms_trusted_device";
  let promptShownThisSession = false;

  /* ---------------------------------------------------------- storage utils */
  function getTrustedDevice() {
    try { return localStorage.getItem(TRUST_KEY) || null; } catch (e) { return null; }
  }

  function setTrustedDevice(token) {
    try {
      if (token) localStorage.setItem(TRUST_KEY, token);
      else localStorage.removeItem(TRUST_KEY);
    } catch (e) { /* private mode */ }
  }

  function copyText(text, label) {
    const done = () => toast((label || "Copied") + " to clipboard", "success");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
        return;
      }
    } catch (e) { /* fall through */ }
    legacyCopy(text, done);
  }

  function legacyCopy(text, done) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      if (done) done();
    } catch (e) { toast("Copy failed — select the text manually", "error"); }
  }

  function downloadCodes(codes) {
    const text = [
      "Meridian HR — two-factor recovery codes",
      "Account: " + ((Store.user && Store.user.email) || ""),
      "Generated: " + new Date().toLocaleString(),
      "",
      "Each code can be used once if you lose access to your authenticator app.",
      "",
      codes.join("\n"),
      "",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meridian-2fa-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ------------------------------------------------------------- formatting */
  function qrSvg(uri) {
    try {
      if (typeof qrcode !== "function") return "";
      const qr = qrcode(0, "M");
      qr.addData(uri);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 8 });
    } catch (e) {
      return "";
    }
  }

  function groupSecret(secret) {
    return String(secret || "").replace(/(.{4})/g, "$1 ").trim();
  }

  function codesGrid(codes) {
    return '<div class="mfa-codes">' + codes.map(c => '<code>' + esc(c) + "</code>").join("") + "</div>";
  }

  function codesBlock(codes) {
    return '<div class="mfa-recovery">'
      + '<div class="row-between" style="margin-bottom:6px">'
      + '<b style="font-size:12.5px">Recovery codes</b>'
      + '<div class="row" style="gap:6px">'
      + '<button type="button" class="btn btn-sm btn-ghost" data-mfa-copy-codes>' + icon("copy", 12) + ' Copy</button>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-mfa-download-codes>' + icon("download", 12) + ' Download</button>'
      + "</div></div>"
      + codesGrid(codes)
      + '<div class="tiny muted" style="margin-top:6px">Keep these somewhere safe. Each code works once and they are the only way in if you lose your phone.</div>'
      + "</div>";
  }

  function bindCodesBlock(root, codes) {
    const copy = root.querySelector("[data-mfa-copy-codes]");
    if (copy) copy.onclick = () => copyText(codes.join("\n"), "Recovery codes copied");
    const download = root.querySelector("[data-mfa-download-codes]");
    if (download) download.onclick = () => downloadCodes(codes);
  }

  function digitsOnly(input, max) {
    input.addEventListener("input", () => {
      const clean = input.value.replace(/[^0-9a-zA-Z-]/g, "").slice(0, max);
      if (clean !== input.value) input.value = clean;
    });
  }

  /* ---------------------------------------------------------------- service */
  async function status() {
    return (await API.get("/auth/mfa/status")).data;
  }

  function applyToStore(data) {
    if (!Store.user) return;
    Store.user.mfa_enabled = !!data.enabled;
    Store.user.mfa_pending_setup = !!data.pending_setup;
    Store.user.mfa_confirmed_at = data.confirmed_at || null;
    Store.user.mfa_prompt_due = false;
  }

  /* ------------------------------------------------------------- setup flow */
  async function openSetup(opts) {
    opts = opts || {};
    let payload;
    try {
      payload = (await API.post("/auth/mfa/setup")).data;
    } catch (err) {
      handleErr(err);
      return;
    }
    const codes = payload.recovery_codes || [];
    const qr = qrSvg(payload.otpauth_uri);

    const body = '<div class="stack">'
      + '<div class="mfa-intro">' + icon("shield", 18)
      + '<div>You will need an authenticator app — Google Authenticator, Microsoft Authenticator, Authy or 1Password — on your phone.</div></div>'
      + '<div class="mfa-setup-grid">'
      + '  <div class="mfa-qr">' + (qr || '<div class="tiny muted">QR unavailable — use the key below.</div>') + '</div>'
      + '  <div>'
      + '    <div class="tiny muted" style="margin-bottom:4px">1 · Scan this QR code with your app</div>'
      + '    <div class="tiny muted" style="margin:10px 0 4px">2 · Or enter this setup key manually</div>'
      + '    <div class="mfa-secret"><code>' + esc(groupSecret(payload.secret)) + '</code>'
      + '      <button type="button" class="btn btn-sm btn-ghost" data-mfa-copy-secret>' + icon("copy", 12) + ' Copy</button></div>'
      + '    <div class="tiny muted" style="margin-top:8px">Account: <b>' + esc(payload.account || "") + '</b> · 6-digit codes, refreshed every 30 seconds</div>'
      + '  </div>'
      + '</div>'
      + codesBlock(codes)
      + '<div class="field" style="margin:0">'
      + '  <label for="mfa-verify-code">3 · Enter the 6-digit code shown in your app</label>'
      + '  <input class="input mfa-code-input" id="mfa-verify-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">'
      + '</div>'
      + '<div id="mfa-verify-error" class="form-error hidden"></div>'
      + '</div>';

    openModal({
      title: "Set up two-factor authentication",
      sub: "Add a code from your phone on top of your password",
      wide: true,
      body: body,
      footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
        + '<button class="btn btn-accent" id="mfa-verify-btn">' + icon("check", 14) + ' Verify &amp; enable</button>',
      onMount(card) {
        bindCodesBlock(card, codes);
        const secretBtn = card.querySelector("[data-mfa-copy-secret]");
        if (secretBtn) secretBtn.onclick = () => copyText(payload.secret, "Setup key copied");
        const input = card.querySelector("#mfa-verify-code");
        const errBox = card.querySelector("#mfa-verify-error");
        const btn = card.querySelector("#mfa-verify-btn");
        digitsOnly(input, 6);
        input.focus();

        const submit = async () => {
          errBox.classList.add("hidden");
          const code = input.value.trim();
          if (code.replace(/\D/g, "").length !== 6) {
            errBox.textContent = "Enter the 6-digit code from your authenticator app.";
            errBox.classList.remove("hidden");
            return;
          }
          btn.disabled = true;
          btn.textContent = "Verifying…";
          try {
            const data = (await API.post("/auth/mfa/confirm", { code })).data;
            applyToStore(data);
            showSuccess(codes, opts);
          } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove("hidden");
            btn.disabled = false;
            btn.innerHTML = icon("check", 14) + " Verify &amp; enable";
            input.select();
          }
        };
        btn.onclick = submit;
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
      },
    });
  }

  function showSuccess(codes, opts) {
    openModal({
      title: "Two-factor authentication is on",
      sub: "Your account now needs a code from your phone at sign-in",
      body: '<div class="stack">'
        + '<div class="mfa-intro success">' + icon("checkCircle", 18) + '<div>Well done — keep the recovery codes below somewhere safe. They are shown once and each one works a single time.</div></div>'
        + codesBlock(codes)
        + '</div>',
      footer: '<button class="btn btn-accent" data-close-modal id="mfa-success-done">Done</button>',
      onMount(card) {
        bindCodesBlock(card, codes);
      },
    });
    toast("Two-factor authentication enabled", "success");
    if (opts && typeof opts.onDone === "function") opts.onDone();
  }

  /* ----------------------------------------------------------- disable flow */
  function openDisable(opts) {
    openModal({
      title: "Turn off two-factor authentication",
      sub: "Your account will be protected by a password only",
      narrow: true,
      body: '<form id="mfa-disable-form" class="stack">'
        + '<div class="field"><label>Account password</label><input class="input" type="password" name="password" required autocomplete="current-password"></div>'
        + '<div class="field"><label>Authenticator or recovery code</label><input class="input mfa-code-input" name="code" maxlength="9" autocomplete="one-time-code" placeholder="123456" required></div>'
        + '<div id="mfa-disable-error" class="form-error hidden"></div>'
        + '</form>',
      footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
        + '<button class="btn btn-danger" id="mfa-disable-btn">Turn off 2FA</button>',
      onMount(card) {
        const form = card.querySelector("#mfa-disable-form");
        const errBox = card.querySelector("#mfa-disable-error");
        const btn = card.querySelector("#mfa-disable-btn");
        btn.onclick = async () => {
          errBox.classList.add("hidden");
          const fd = Object.fromEntries(new FormData(form).entries());
          if (!fd.password) { errBox.textContent = "Enter your password"; errBox.classList.remove("hidden"); return; }
          btn.disabled = true;
          btn.textContent = "Turning off…";
          try {
            const data = (await API.post("/auth/mfa/disable", {
              password: fd.password, code: fd.code,
            })).data;
            applyToStore(data);
            setTrustedDevice(null);
            closeModal();
            toast("Two-factor authentication disabled", "success");
            if (opts && typeof opts.onDone === "function") opts.onDone();
          } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove("hidden");
            btn.disabled = false;
            btn.textContent = "Turn off 2FA";
          }
        };
      },
    });
  }

  /* -------------------------------------------------------- recover / codes */
  function openRegenerateCodes(opts) {
    openModal({
      title: "New recovery codes",
      sub: "Your existing recovery codes stop working straight away",
      narrow: true,
      body: '<div class="stack">'
        + '<div class="field"><label>Account password</label><input class="input" type="password" id="mfa-rc-password" required autocomplete="current-password"></div>'
        + '<div id="mfa-rc-error" class="form-error hidden"></div>'
        + '</div>',
      footer: '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
        + '<button class="btn btn-accent" id="mfa-rc-btn">Generate codes</button>',
      onMount(card) {
        const input = card.querySelector("#mfa-rc-password");
        const errBox = card.querySelector("#mfa-rc-error");
        const btn = card.querySelector("#mfa-rc-btn");
        input.focus();
        btn.onclick = async () => {
          errBox.classList.add("hidden");
          btn.disabled = true;
          try {
            const data = (await API.post("/auth/mfa/recovery-codes", { password: input.value })).data;
            openModal({
              title: "Your new recovery codes",
              sub: "Save these now — they will not be shown again",
              body: '<div class="stack">' + codesBlock(data.recovery_codes || []) + '</div>',
              footer: '<button class="btn btn-accent" data-close-modal id="mfa-rc-done">Done</button>',
              onMount(panel) { bindCodesBlock(panel, data.recovery_codes || []); },
            });
            toast("Recovery codes regenerated", "success");
            if (opts && typeof opts.onDone === "function") opts.onDone();
          } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove("hidden");
            btn.disabled = false;
          }
        };
      },
    });
  }

  async function revokeDevice(id, opts) {
    try {
      const data = (await API.del("/auth/mfa/devices/" + encodeURIComponent(id))).data;
      toast("Device removed — it will need a code next time", "success");
      if (opts && typeof opts.onChange === "function") opts.onChange(data);
    } catch (err) { handleErr(err); }
  }

  /* ------------------------------------------------------ settings card body */
  function panelHTML(data) {
    const enabled = !!data.enabled;
    const chipHTML = enabled
      ? '<span class="chip green">' + icon("shield", 11) + ' Enabled</span>'
      : (data.pending_setup
        ? '<span class="chip amber">Setup unfinished</span>'
        : '<span class="chip chip-grey">Not enabled</span>');

    let detail;
    if (enabled) {
      const remaining = data.recovery_codes_remaining || 0;
      const devices = data.trusted_devices || [];
      detail = ''
        + '<div class="tiny muted" style="margin:10px 0 12px">Enabled ' + esc(fmtDateTime(data.confirmed_at) || "just now")
        + ' · ' + (remaining > 0
          ? remaining + " recovery code" + (remaining === 1 ? "" : "s") + " left"
          : '<b class="mfa-warn">no recovery codes left</b>')
        + '</div>'
        + '<div class="row wrap" style="gap:8px">'
        + '  <button class="btn btn-sm btn-ghost" data-mfa-action="regenerate">' + icon("key", 13) + ' New recovery codes</button>'
        + (remaining === 0 ? '<button class="btn btn-sm btn-accent" data-mfa-action="regenerate">' + icon("key", 13) + ' Generate recovery codes</button>' : '')
        + '  <button class="btn btn-sm btn-danger" data-mfa-action="disable">Turn off</button>'
        + '</div>'
        + '<div class="divider"></div>'
        + '<div class="row-between" style="align-items:flex-start">'
        + '  <div><b style="font-size:12.5px">Trusted devices</b>'
        + '  <div class="tiny muted">Browsers that can skip the code for ' + (data.trust_days || 30) + ' days after “Trust this device for 1 month”.</div></div>'
        + '  <span class="chip chip-grey">' + devices.length + '</span>'
        + '</div>'
        + (devices.length
          ? '<div class="mfa-devices">' + devices.map(d => ''
            + '<div class="mfa-device">'
            + '  <div><b>' + esc(d.label || "Browser") + '</b>'
            + '  <div class="tiny muted">' + esc(d.ip || "unknown IP") + ' · trusted ' + esc(fmtDateTime(d.created_at))
            + (d.expired ? ' · <span class="mfa-warn">expired</span>' : ' · expires ' + esc(fmtDateTime(d.expires_at))) + '</div></div>'
            + '  <button class="btn btn-sm btn-ghost" data-mfa-revoke="' + d.id + '">Remove</button>'
            + '</div>').join("") + '</div>'
          : '<div class="tiny muted" style="margin-top:8px">No devices trusted yet.</div>');
    } else {
      detail = ''
        + '<div class="tiny muted" style="margin:10px 0 12px">'
        + (data.pending_setup
          ? 'Setup was started but not verified. Finish it to switch protection on.'
          : 'Add a 6-digit code from your phone on top of your password. Strongly recommended — one stolen password is not enough to reach payroll or employee records.')
        + '</div>'
        + '<button class="btn btn-accent" data-mfa-action="setup">' + icon("shield", 14)
        + (data.pending_setup ? ' Finish setup' : ' Enable two-factor authentication') + '</button>';
    }

    return '<div class="row-between" style="align-items:flex-start">'
      + '<div><b style="font-size:13px">Authenticator app (TOTP)</b>'
      + '<div class="tiny muted">Time-based one-time codes · works offline</div></div>'
      + chipHTML + '</div>'
      + detail;
  }

  async function mount(el, opts) {
    opts = opts || {};
    if (!el) return;
    el.innerHTML = '<div class="tiny muted">Loading 2FA status…</div>';
    let data;
    try {
      data = await status();
    } catch (err) {
      el.innerHTML = '<div class="form-error">' + esc(err.message) + '</div>';
      return;
    }
    const draw = (fresh) => {
      const current = fresh || data;
      if (fresh) data = fresh;
      el.innerHTML = panelHTML(current);
      const setupBtn = el.querySelector('[data-mfa-action="setup"]');
      if (setupBtn) setupBtn.onclick = () => openSetup({
        onDone: () => { refresh(); if (opts.onChange) opts.onChange(); },
      });
      const disableBtn = el.querySelector('[data-mfa-action="disable"]');
      if (disableBtn) disableBtn.onclick = () => openDisable({
        onDone: () => { refresh(); if (opts.onChange) opts.onChange(); },
      });
      const regenBtn = el.querySelector('[data-mfa-action="regenerate"]');
      if (regenBtn) regenBtn.onclick = () => openRegenerateCodes({
        onDone: () => { refresh(); if (opts.onChange) opts.onChange(); },
      });
      el.querySelectorAll("[data-mfa-revoke]").forEach(b => {
        b.onclick = () => revokeDevice(b.dataset.mfaRevoke, {
          onChange: (list) => { draw(Object.assign({}, current, { trusted_devices: list })); if (opts.onChange) opts.onChange(); },
        });
      });
    };
    const refresh = async () => {
      try { draw(await status()); } catch (err) { /* keep current view */ }
    };
    draw();
  }

  /* ------------------------------------------- first sign-in setup reminder */
  function promptAfterLogin() {
    const u = Store.user;
    if (!u || u.mfa_enabled || !u.mfa_prompt_due || promptShownThisSession) return;
    promptShownThisSession = true;

    openModal({
      title: "Protect your account with two-factor authentication",
      sub: "About a minute to set up — you can skip for now",
      narrow: true,
      body: '<div class="stack">'
        + '<div class="mfa-intro">' + icon("shield", 18)
        + '<div>Your account can reach employee records, payroll and approvals. A stolen password alone should not be enough.</div></div>'
        + '<ul class="mfa-benefits">'
        + '<li>' + icon("check", 12) + ' A 6-digit code from your phone, on top of your password</li>'
        + '<li>' + icon("check", 12) + ' Works offline — any authenticator app</li>'
        + '<li>' + icon("check", 12) + ' Recovery codes so you never get locked out</li>'
        + '</ul>'
        + '</div>',
      footer: '<button class="btn btn-ghost" id="mfa-prompt-skip">Skip for now</button>'
        + '<button class="btn btn-accent" id="mfa-prompt-start">' + icon("shield", 14) + ' Set up now</button>',
      onMount(card) {
        card.querySelector("#mfa-prompt-start").onclick = () => {
          closeModal();
          openSetup({ onDone: () => { promptShownThisSession = true; } });
        };
        card.querySelector("#mfa-prompt-skip").onclick = async () => {
          try { await API.post("/auth/mfa/prompt-dismiss"); } catch (e) { /* non-blocking */ }
          if (Store.user) Store.user.mfa_prompt_due = false;
          closeModal();
          toast("We'll remind you again in 7 days", "info");
        };
      },
    });
  }

  function resetPrompt() { promptShownThisSession = false; }

  return {
    getTrustedDevice,
    setTrustedDevice,
    status,
    mount,
    openSetup,
    openDisable,
    openRegenerateCodes,
    promptAfterLogin,
    resetPrompt,
    applyToStore,
  };
})();

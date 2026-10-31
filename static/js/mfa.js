/* ============================================================================
   Two-factor authentication UI (WhatsApp, Email, Authenticator App / TOTP)
   Strict Security Enforcement: No skip button allowed; users must configure
   2FA or click Sign Out.
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
      "Each code can be used once if you lose access to your primary phone or email.",
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
      + '<b style="font-size:12.5px">One-time recovery codes</b>'
      + '<div class="row" style="gap:6px">'
      + '<button type="button" class="btn btn-sm btn-ghost" data-mfa-copy-codes>' + icon("copy", 12) + ' Copy</button>'
      + '<button type="button" class="btn btn-sm btn-ghost" data-mfa-download-codes>' + icon("download", 12) + ' Download</button>'
      + "</div></div>"
      + codesGrid(codes)
      + '<div class="tiny muted" style="margin-top:6px">Keep these somewhere safe. Each code works once if you lose access to your phone or authenticator.</div>'
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
    Store.user.mfa_method = data.method || "app";
    Store.user.mfa_phone = data.phone || null;
    Store.user.mfa_enforced = !!data.mfa_enforced;
    Store.user.mfa_pending_setup = !!data.pending_setup;
    Store.user.mfa_confirmed_at = data.confirmed_at || null;
    Store.user.mfa_prompt_due = false;
  }

  /* ------------------------------------------------- multi-method setup flow */
  function openSetup(opts) {
    opts = opts || {};
    const u = Store.user || {};
    const isEnrolled = !!u.mfa_enabled;
    const isMandatory = !isEnrolled || !!opts.mandatory;

    const defaultPhone = u.mfa_phone || u.phone || "";
    const userEmail = u.email || "";

    // Step 1: Method selection
    const securityBanner = isMandatory
      ? '<div class="alert" style="margin-bottom:14px;background:#fef2f2;border:1px solid #f87171;color:#991b1b;padding:12px 14px;border-radius:10px;font-size:13px;display:flex;gap:10px;align-items:flex-start">'
        + '<div style="flex-shrink:0;margin-top:1px">' + icon("shield", 18) + '</div>'
        + '<div><b>Strict Security Enforced:</b> Two-Factor Authentication is required for all accounts. Please select your verification channel (WhatsApp, Email, or Authenticator App) to access the portal. If you do not wish to set up 2FA, please sign out.</div>'
        + '</div>'
      : '';

    const step1Body = '<div class="stack">'
      + securityBanner
      + '<div class="mfa-intro">' + icon("shield", 18)
      + '<div>Select how you want to receive or generate 6-digit security codes when signing in:</div></div>'
      + '<div class="stack" style="gap:10px;margin-top:6px">'

      // WhatsApp Option
      + '<label class="mfa-method-option" data-mfa-choice="whatsapp" style="display:flex;gap:12px;padding:12px 14px;border:2px solid var(--accent, #0f766e);border-radius:10px;cursor:pointer;background:var(--bg-subtle, #f8fafc)">'
      + '  <input type="radio" name="mfa_method_select" value="whatsapp" checked style="margin-top:3px">'
      + '  <div style="flex:1">'
      + '    <div class="row" style="gap:6px;align-items:center">'
      + '      <b style="font-size:14px">' + icon("message", 14) + ' WhatsApp</b>'
      + '      <span class="chip teal" style="font-size:11px">Instant Delivery</span>'
      + '    </div>'
      + '    <div class="tiny muted" style="margin:2px 0 8px">Receive 6-digit OTP codes straight to your WhatsApp messages.</div>'
      + '    <div id="mfa-phone-field" class="field" style="margin:0">'
      + '      <label style="font-size:11.5px">WhatsApp phone number</label>'
      + '      <input class="input" id="mfa-input-phone" placeholder="+233 24 123 4567" value="' + esc(defaultPhone) + '">'
      + '    </div>'
      + '  </div>'
      + '</label>'

      // Email Option
      + '<label class="mfa-method-option" data-mfa-choice="email" style="display:flex;gap:12px;padding:12px 14px;border:1px solid var(--border, #cbd5e1);border-radius:10px;cursor:pointer">'
      + '  <input type="radio" name="mfa_method_select" value="email" style="margin-top:3px">'
      + '  <div style="flex:1">'
      + '    <div class="row" style="gap:6px;align-items:center">'
      + '      <b style="font-size:14px">' + icon("mail", 14) + ' Email</b>'
      + '    </div>'
      + '    <div class="tiny muted">Receive 6-digit codes delivered to <b>' + esc(userEmail) + '</b>.</div>'
      + '  </div>'
      + '</label>'

      // Authenticator App Option
      + '<label class="mfa-method-option" data-mfa-choice="app" style="display:flex;gap:12px;padding:12px 14px;border:1px solid var(--border, #cbd5e1);border-radius:10px;cursor:pointer">'
      + '  <input type="radio" name="mfa_method_select" value="app" style="margin-top:3px">'
      + '  <div style="flex:1">'
      + '    <div class="row" style="gap:6px;align-items:center">'
      + '      <b style="font-size:14px">' + icon("shield", 14) + ' Authenticator App (TOTP)</b>'
      + '      <span class="chip chip-grey" style="font-size:11px">Works Offline</span>'
      + '    </div>'
      + '    <div class="tiny muted">Google Authenticator, Microsoft Authenticator, Authy, or 1Password.</div>'
      + '  </div>'
      + '</label>'
      + '</div>'
      + '<div id="mfa-step1-error" class="form-error hidden"></div>'
      + '</div>';

    const footerHTML = isMandatory
      ? '<button type="button" class="btn btn-danger btn-outline" id="mfa-mandatory-logout">' + icon("logout", 14) + ' Sign out</button>'
        + '<button class="btn btn-accent" id="mfa-step1-next">Continue &rarr;</button>'
      : '<button class="btn btn-ghost" data-close-modal>Cancel</button>'
        + '<button class="btn btn-accent" id="mfa-step1-next">Continue &rarr;</button>';

    openModal({
      title: isMandatory ? "Two-Factor Authentication Required" : "Set up Two-Factor Authentication",
      sub: isMandatory ? "Step 1 of 2 · Mandatory Security Configuration" : "Step 1 of 2 · Choose your verification channel",
      wide: true,
      mandatory: isMandatory,
      body: step1Body,
      footer: footerHTML,
      onMount(card) {
        const phoneField = card.querySelector("#mfa-phone-field");
        const options = card.querySelectorAll(".mfa-method-option");
        const errBox = card.querySelector("#mfa-step1-error");
        const nextBtn = card.querySelector("#mfa-step1-next");
        const logoutBtn = card.querySelector("#mfa-mandatory-logout");

        if (logoutBtn) {
          logoutBtn.onclick = () => {
            closeModal(true);
            if (typeof logout === "function") logout();
            else API.logout().finally(() => location.reload());
            toast("Signed out — Two-factor authentication is required to access your account.", "warning");
          };
        }

        options.forEach(opt => {
          opt.onclick = () => {
            const rad = opt.querySelector('input[type="radio"]');
            if (rad) rad.checked = true;
            options.forEach(o => {
              o.style.borderColor = "var(--border, #cbd5e1)";
              o.style.background = "";
            });
            opt.style.borderColor = "var(--accent, #0f766e)";
            opt.style.background = "var(--bg-subtle, #f8fafc)";
            if (phoneField) {
              phoneField.style.display = (rad.value === "whatsapp") ? "block" : "none";
            }
          };
        });

        nextBtn.onclick = async () => {
          errBox.classList.add("hidden");
          const selectedRadio = card.querySelector('input[name="mfa_method_select"]:checked');
          const method = selectedRadio ? selectedRadio.value : "whatsapp";
          let phone = "";
          if (method === "whatsapp") {
            const phoneInput = card.querySelector("#mfa-input-phone");
            phone = phoneInput ? phoneInput.value.trim() : "";
            if (!phone) {
              errBox.textContent = "Please provide your WhatsApp phone number.";
              errBox.classList.remove("hidden");
              return;
            }
          }

          nextBtn.disabled = true;
          nextBtn.textContent = "Sending code…";
          try {
            const res = await API.post("/auth/mfa/setup", { method, phone });
            renderStep2(res.data, method, Object.assign({}, opts, { mandatory: isMandatory }));
          } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove("hidden");
            nextBtn.disabled = false;
            nextBtn.innerHTML = "Continue &rarr;";
          }
        };
      },
    });
  }

  /* ------------------------------------------------ Step 2: Code Verification */
  function renderStep2(data, method, opts) {
    const isMandatory = !!opts.mandatory;
    const codes = data.recovery_codes || [];
    let methodTitle = "Verify Code";
    let methodHint = "";
    let channelSpecificHTML = "";

    if (method === "whatsapp") {
      methodTitle = "WhatsApp Verification";
      methodHint = 'We sent a 6-digit code via WhatsApp to <b>' + esc(data.masked_phone || data.phone) + '</b>. Enter it below to activate 2FA:';
    } else if (method === "email") {
      methodTitle = "Email Verification";
      methodHint = 'We sent a 6-digit code to your email <b>' + esc(data.masked_email || data.account) + '</b>. Enter it below to activate 2FA:';
    } else {
      methodTitle = "Link Authenticator App";
      methodHint = 'Scan the QR code in your app (Google Authenticator, Microsoft Authenticator), then enter the 6-digit code:';
      const qr = qrSvg(data.otpauth_uri);
      channelSpecificHTML = '<div class="mfa-setup-grid">'
        + '  <div class="mfa-qr">' + (qr || '<div class="tiny muted">QR unavailable — use the key below.</div>') + '</div>'
        + '  <div>'
        + '    <div class="tiny muted" style="margin-bottom:4px">1 · Scan QR with your authenticator app</div>'
        + '    <div class="tiny muted" style="margin:10px 0 4px">2 · Or enter this setup key manually</div>'
        + '    <div class="mfa-secret"><code>' + esc(groupSecret(data.secret)) + '</code>'
        + '      <button type="button" class="btn btn-sm btn-ghost" data-mfa-copy-secret>' + icon("copy", 12) + ' Copy</button></div>'
        + '    <div class="tiny muted" style="margin-top:8px">Account: <b>' + esc(data.account || "") + '</b></div>'
        + '  </div>'
        + '</div>';
    }

    const resendRow = (method === "whatsapp" || method === "email")
      ? '<div class="row-between" style="margin-top:6px;font-size:13px">'
        + '<span class="muted tiny" id="mfa-resend-countdown"></span>'
        + '<button type="button" class="btn btn-sm btn-ghost" id="mfa-resend-btn" style="padding:2px 8px">Resend code</button>'
        + '</div>'
      : '';

    const step2Body = '<div class="stack">'
      + '<div class="mfa-intro">' + icon("shield", 18) + '<div>' + methodHint + '</div></div>'
      + channelSpecificHTML
      + '<div class="field" style="margin:8px 0 0">'
      + '  <label for="mfa-verify-code">Enter the 6-digit verification code</label>'
      + '  <input class="input mfa-code-input" id="mfa-verify-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">'
      + '</div>'
      + resendRow
      + '<div id="mfa-verify-error" class="form-error hidden"></div>'
      + codesBlock(codes)
      + '</div>';

    const footerHTML = '<button class="btn btn-ghost" id="mfa-back-step1">&larr; Change channel</button>'
      + (isMandatory
          ? '<button type="button" class="btn btn-danger btn-outline" id="mfa-mandatory-logout-step2">' + icon("logout", 14) + ' Sign out</button>'
          : '')
      + '<button class="btn btn-accent" id="mfa-verify-btn">' + icon("check", 14) + ' Verify &amp; enable</button>';

    openModal({
      title: isMandatory ? "Two-Factor Authentication Required" : "Confirm Two-Factor Authentication",
      sub: "Step 2 of 2 · " + methodTitle,
      wide: true,
      mandatory: isMandatory,
      body: step2Body,
      footer: footerHTML,
      onMount(card) {
        bindCodesBlock(card, codes);
        const secretBtn = card.querySelector("[data-mfa-copy-secret]");
        if (secretBtn) secretBtn.onclick = () => copyText(data.secret, "Setup key copied");

        const input = card.querySelector("#mfa-verify-code");
        const errBox = card.querySelector("#mfa-verify-error");
        const btn = card.querySelector("#mfa-verify-btn");
        const backBtn = card.querySelector("#mfa-back-step1");
        const logoutBtn = card.querySelector("#mfa-mandatory-logout-step2");
        const resendBtn = card.querySelector("#mfa-resend-btn");
        const countdownEl = card.querySelector("#mfa-resend-countdown");

        let timer = null;
        const startTimer = (seconds) => {
          if (!countdownEl || !resendBtn) return;
          resendBtn.disabled = true;
          let left = seconds;
          if (timer) clearInterval(timer);
          countdownEl.textContent = "Resend available in " + left + "s";
          timer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
              clearInterval(timer);
              timer = null;
              resendBtn.disabled = false;
              countdownEl.textContent = "";
            } else {
              countdownEl.textContent = "Resend available in " + left + "s";
            }
          }, 1000);
        };

        if (logoutBtn) {
          logoutBtn.onclick = () => {
            if (timer) clearInterval(timer);
            closeModal(true);
            if (typeof logout === "function") logout();
            else API.logout().finally(() => location.reload());
            toast("Signed out — Two-factor authentication is required to access your account.", "warning");
          };
        }

        if (resendBtn) {
          startTimer(45);
          resendBtn.onclick = async () => {
            try {
              resendBtn.disabled = true;
              await API.post("/auth/mfa/resend", { method, phone: data.phone });
              toast("A new verification code has been dispatched", "success");
              startTimer(60);
            } catch (err) {
              toast(err.message, "error");
              resendBtn.disabled = false;
            }
          };
        }

        if (backBtn) {
          backBtn.onclick = () => {
            if (timer) clearInterval(timer);
            openSetup(opts);
          };
        }

        digitsOnly(input, 6);
        input.focus();

        const submit = async () => {
          errBox.classList.add("hidden");
          const code = input.value.trim();
          if (code.replace(/\D/g, "").length !== 6) {
            errBox.textContent = "Enter the 6-digit verification code.";
            errBox.classList.remove("hidden");
            return;
          }
          btn.disabled = true;
          btn.textContent = "Verifying…";
          try {
            const confirmed = (await API.post("/auth/mfa/confirm", { code })).data;
            if (timer) clearInterval(timer);
            applyToStore(confirmed);
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
      title: "Two-Factor Authentication is Active",
      sub: "Your Meridian account is now fully secured",
      body: '<div class="stack">'
        + '<div class="mfa-intro success">' + icon("checkCircle", 18) + '<div><b>Success!</b> Two-Factor Authentication is activated. Save your recovery codes below somewhere safe — they can be used to recover access if you ever lose your phone or email.</div></div>'
        + codesBlock(codes)
        + '</div>',
      footer: '<button class="btn btn-accent" id="mfa-success-done" style="width:100%">' + icon("check", 14) + ' Enter Meridian Portal &rarr;</button>',
      onMount(card) {
        bindCodesBlock(card, codes);
        const doneBtn = card.querySelector("#mfa-success-done");
        if (doneBtn) {
          doneBtn.onclick = () => {
            closeModal(true);
            if (opts && typeof opts.onDone === "function") opts.onDone();
          };
        }
      },
    });
    toast("Two-factor authentication enabled successfully", "success");
  }

  /* ----------------------------------------------------------- disable flow */
  function openDisable(opts) {
    if (Store.user && (Store.user.mfa_enforced || (Store.meta && Store.meta.mfa_enforced))) {
      toast("Two-factor authentication is mandatory under organization security policy and cannot be disabled.", "warning");
      return;
    }
    openModal({
      title: "Turn off Two-Factor Authentication",
      sub: "Your account will be protected by a password only",
      narrow: true,
      body: '<form id="mfa-disable-form" class="stack">'
        + '<div class="field"><label>Account password</label><input class="input" type="password" name="password" required autocomplete="current-password"></div>'
        + '<div class="field"><label>Verification code or recovery code</label><input class="input mfa-code-input" name="code" maxlength="9" autocomplete="one-time-code" placeholder="123456" required></div>'
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
            closeModal(true);
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
      sub: "Your existing recovery codes will immediately expire",
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
      toast("Device removed — verification code required on next sign-in", "success");
      if (opts && typeof opts.onChange === "function") opts.onChange(data);
    } catch (err) { handleErr(err); }
  }

  /* ------------------------------------------------------ settings card body */
  function panelHTML(data) {
    const enabled = !!data.enabled;
    const method = data.method || "app";
    const methodLabels = {
      whatsapp: "WhatsApp (" + (data.masked_phone || data.phone || "mobile") + ")",
      email: "Email (" + (data.masked_email || data.email || "inbox") + ")",
      app: "Authenticator App (TOTP)",
    };
    const methodIcons = {
      whatsapp: icon("message", 12),
      email: icon("mail", 12),
      app: icon("shield", 12),
    };

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
        + '<div class="row wrap" style="gap:8px;align-items:center;margin:10px 0 12px">'
        + '  <span class="chip teal">' + (methodIcons[method] || "") + ' ' + esc(methodLabels[method] || "2FA") + '</span>'
        + '  <span class="tiny muted">Confirmed ' + esc(fmtDateTime(data.confirmed_at) || "recently") + '</span>'
        + '  <span class="tiny muted">· ' + (remaining > 0
          ? remaining + " recovery code" + (remaining === 1 ? "" : "s") + " left"
          : '<b class="mfa-warn">no recovery codes left</b>') + '</span>'
        + '</div>'
        + '<div class="row wrap" style="gap:8px">'
        + '  <button class="btn btn-sm btn-ghost" data-mfa-action="switch">' + icon("refresh", 13) + ' Switch channel</button>'
        + '  <button class="btn btn-sm btn-ghost" data-mfa-action="regenerate">' + icon("key", 13) + ' New recovery codes</button>'
        + (data.mfa_enforced
          ? '<span class="tiny muted" style="align-self:center;font-weight:600;color:var(--amber, #d97706)">' + icon("lock", 12) + ' Required by Organization Policy</span>'
          : '<button class="btn btn-sm btn-danger" data-mfa-action="disable">Turn off 2FA</button>')
        + '</div>'
        + '<div class="divider"></div>'
        + '<div class="row-between" style="align-items:flex-start">'
        + '  <div><b style="font-size:12.5px">Trusted devices</b>'
        + '  <div class="tiny muted">Browsers that can skip the code for ' + (data.trust_days || 30) + ' days after "Trust this device".</div></div>'
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
          : 'Add a second verification factor on top of your password using <b>WhatsApp</b>, <b>Email</b>, or an <b>Authenticator App</b>.')
        + '</div>'
        + '<button class="btn btn-accent" data-mfa-action="setup">' + icon("shield", 14)
        + (data.pending_setup ? ' Finish setup' : ' Enable Two-Factor Authentication') + '</button>';
    }

    return '<div class="row-between" style="align-items:flex-start">'
      + '<div><b style="font-size:13px">Two-Factor Authentication (2FA)</b>'
      + '<div class="tiny muted">WhatsApp · Email · Authenticator App (TOTP)</div></div>'
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
      const switchBtn = el.querySelector('[data-mfa-action="switch"]');
      if (switchBtn) switchBtn.onclick = () => openSetup({
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

  /* ------------------------------------------- sign-in setup reminder / mandatory policy */
  function promptAfterLogin() {
    const u = Store.user;
    if (!u || u.mfa_enabled) return;

    // Strict Security Enforced:
    // Any user without 2FA MUST configure it immediately.
    // There is NO skip button. The only alternative is setting up 2FA or clicking "Sign out".
    openSetup({
      mandatory: true,
      onDone: () => {
        toast("Two-factor authentication successfully configured. Welcome to Meridian HR!", "success");
      }
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

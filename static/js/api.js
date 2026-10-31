const API = (() => {
  const BASE = "/api/v1";
  let token = localStorage.getItem("hrms_token") || null;

  function setToken(t) {
    token = t;
    if (t) {
      localStorage.setItem("hrms_token", t);
      localStorage.setItem("hrms_last_activity", String(Date.now()));
    } else {
      localStorage.removeItem("hrms_token");
      localStorage.removeItem("hrms_last_activity");
    }
  }

  function recordActivity() {
    if (token) {
      localStorage.setItem("hrms_last_activity", String(Date.now()));
    }
  }

  function isFormDataBody(body) {
    return (typeof FormData !== "undefined" && body instanceof FormData)
      || !!(body && typeof body.append === "function" && typeof body.getAll === "function");
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;
    if (options.body && !isFormDataBody(options.body)) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { ...options, headers });
    let body = null;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) {
      if (res.status === 401) {
        setToken(null);
        if (path !== "/auth/login" && !options.silentAuth) {
          document.dispatchEvent(new CustomEvent("auth:expired", { detail: { reason: "session_expired" } }));
        }
      }
      const err = new Error((body && body.message) || "Request failed (" + res.status + ")");
      err.status = res.status;
      err.errors = body && body.errors;
      throw err;
    }
    if (token && path !== "/auth/ping") {
      recordActivity();
    }
    return body;
  }

  return {
    get token() { return token; },
    setToken,
    async login(email, password) {
      const body = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setToken(body.data.token);
      return body.data.user;
    },
    logout() {
      return request("/auth/logout", { method: "POST" }).catch(() => {}).finally(() => setToken(null));
    },
    ping() {
      return request("/auth/ping", { method: "POST" });
    },
    recordActivity,
    me(options = {}) { return request("/auth/me", options).then(r => r.data); },
    get(path, params) {
      let qs = "";
      if (params) {
        const p = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, v); });
        const s = p.toString();
        if (s) qs = "?" + s;
      }
      return request(path + qs);
    },
    post(path, data) { return request(path, { method: "POST", body: JSON.stringify(data || {}) }); },
    put(path, data) { return request(path, { method: "PUT", body: JSON.stringify(data || {}) }); },
    patch(path, data) { return request(path, { method: "PATCH", body: JSON.stringify(data || {}) }); },
    del(path) { return request(path, { method: "DELETE" }); },
    delete(path) { return request(path, { method: "DELETE" }); },
    upload(path, formData) { return request(path, { method: "POST", body: formData }); },
  };
})();

const Store = {
  user: null,
  meta: null,
  notifications: [],
  async boot() {
    if (!API.token) return false;
    const lastActivity = parseInt(localStorage.getItem("hrms_last_activity") || "0", 10);
    const timeoutMs = 30 * 60 * 1000;
    if (lastActivity > 0 && (Date.now() - lastActivity > timeoutMs)) {
      API.setToken(null);
      return false;
    }
    try {
      this.user = await API.me({ silentAuth: true });
      await this.loadMeta();
      return true;
    } catch (e) {
      API.setToken(null);
      return false;
    }
  },
  async loadMeta() { this.meta = (await API.get("/meta")).data; return this.meta; },
  role() { return this.user ? this.user.role_slug : null; },
  isRole(...roles) { return roles.includes(this.role()); },
  isAdmin() { return this.isRole("super_admin", "hr_admin"); },
  isReadOnly() { return this.isRole("auditor"); },
  canManage() { return this.isRole("super_admin", "hr_admin", "hr_officer"); },
  canPayroll() { return this.isRole("super_admin", "hr_admin", "payroll"); },
  canAdmin() { return this.isRole("super_admin"); },
  canOperations() {
    if (!this.user) return false;
    if (this.user.can_access_operations !== undefined) return Boolean(this.user.can_access_operations);
    const role = this.role();
    if (role === "super_admin") return true;
    if (["operations_manager", "operations_officer", "hotel_manager", "hr_admin"].includes(role)) return true;
    const perms = String((this.user && this.user.permissions) || "").split(",").map(p => p.trim());
    if (perms.includes("*") || perms.includes("operations") || perms.includes("operations.view") || perms.includes("operations.manage")) return true;
    const dept = ((this.user && this.user.department) || "").toLowerCase().trim();
    if (dept === "operations" || dept === "hotel operations" || dept === "ops") return true;
    const code = ((this.user && this.user.department_code) || "").toUpperCase().trim();
    if (code === "OPS") return true;
    return false;
  },
  employeeName(id) {
    if (!this.meta) return "—";
    const e = this.meta.employees.find(x => x.id === id);
    return e ? e.name : "—";
  },
};

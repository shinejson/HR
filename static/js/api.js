const API = (() => {
  const BASE = "/api/v1";
  let token = localStorage.getItem("hrms_token") || null;

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem("hrms_token", t);
    else localStorage.removeItem("hrms_token");
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { ...options, headers });
    let body = null;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    if (!res.ok) {
      if (res.status === 401) {
        setToken(null);
        document.dispatchEvent(new CustomEvent("auth:expired"));
      }
      const err = new Error((body && body.message) || "Request failed (" + res.status + ")");
      err.status = res.status;
      err.errors = body && body.errors;
      throw err;
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
    me() { return request("/auth/me").then(r => r.data); },
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
    upload(path, formData) { return request(path, { method: "POST", body: formData }); },
  };
})();

const Store = {
  user: null,
  meta: null,
  notifications: [],
  async boot() {
    if (!API.token) return false;
    try {
      this.user = await API.me();
      await this.loadMeta();
      return true;
    } catch (e) {
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
  employeeName(id) {
    if (!this.meta) return "—";
    const e = this.meta.employees.find(x => x.id === id);
    return e ? e.name : "—";
  },
};

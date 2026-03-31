(function () {
  const core = (window.AppCore = window.AppCore || {});
  let authRedirecting = false;

  function cookieValue(name) {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name + "=([^;]*)"),
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function csrfHeaders(method) {
    const headers = { "Content-Type": "application/json" };
    const m = String(method || "GET").toUpperCase();
    if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") {
      const csrf = cookieValue("cbtlms_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    return headers;
  }

  function extractAPIError(json, statusText) {
    if (!json || typeof json !== "object") {
      return statusText || "Request failed";
    }
    if (typeof json.error === "string" && json.error.trim()) {
      return json.error.trim();
    }
    if (
      json.error &&
      typeof json.error === "object" &&
      typeof json.error.message === "string" &&
      json.error.message.trim()
    ) {
      return json.error.message.trim();
    }
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message.trim();
    }
    return statusText || "Request failed";
  }

  function redirectToLoginOnUnauthorized(res) {
    if (!res || Number(res.status || 0) !== 401 || authRedirecting) {
      return false;
    }
    authRedirecting = true;
    window.setTimeout(function () {
      window.location.href = "/login";
    }, 0);
    return true;
  }

  async function api(path, method, body) {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: csrfHeaders(method),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(function () {
      return {};
    });
    if (redirectToLoginOnUnauthorized(res)) {
      throw new Error("unauthorized");
    }
    if (!res.ok || !json.ok) {
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    return json.data;
  }

  function parseDownloadFilename(res, fallbackName) {
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (match && match[1]) return match[1];
    return fallbackName || "download.csv";
  }

  async function downloadCSV(path, payload, fallbackName) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders("POST"),
      body: JSON.stringify(payload || {}),
    });
    if (redirectToLoginOnUnauthorized(res)) {
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const json = await res.json().catch(function () {
        return {};
      });
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name = parseDownloadFilename(res, fallbackName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "download.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function apiMultipart(path, method, formData) {
    const m = String(method || "POST").toUpperCase();
    const headers = {};
    if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") {
      const csrf = cookieValue("cbtlms_csrf");
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    const res = await fetch(path, {
      method: m,
      credentials: "include",
      headers: headers,
      body: formData,
    });
    const json = await res.json().catch(function () {
      return {};
    });
    if (redirectToLoginOnUnauthorized(res)) {
      throw new Error("unauthorized");
    }
    if (!res.ok || !json.ok) {
      const msg = extractAPIError(json, res.statusText || "Request failed");
      throw new Error(msg);
    }
    return json.data;
  }

  async function meOrNull() {
    try {
      return await api("/api/v1/auth/me", "GET");
    } catch (_) {
      return null;
    }
  }

  core.cookieValue = cookieValue;
  core.csrfHeaders = csrfHeaders;
  core.extractAPIError = extractAPIError;
  core.api = api;
  core.parseDownloadFilename = parseDownloadFilename;
  core.downloadCSV = downloadCSV;
  core.apiMultipart = apiMultipart;
  core.meOrNull = meOrNull;
})();

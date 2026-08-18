import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://127.0.0.1:8000",
});

let isRefreshing = false;
let refreshQueue = [];

function processQueue(error, token = null) {
  refreshQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  refreshQueue = [];
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;
    const isAuthRoute =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && !isAuthRoute && !originalRequest._retry) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const newToken = res.data.access_token;
          localStorage.setItem("token", newToken);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          localStorage.removeItem("token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }

    // FIX: this used to swallow a 404 from ANY method (GET/PUT/POST/DELETE)
    // and resolve it as {data: null} instead of rejecting. That's fine for a
    // "does this record exist yet" GET, but a 404 on PUT/POST means the save
    // itself failed (e.g. Form B's hasBirthRecordRef thought a row existed
    // and PUT'd to it, but the row was never actually created) — silently
    // handing back {data: null} instead of a real error made every such
    // failure crash downstream with "Cannot read properties of null" instead
    // of showing the actual "Not found" message. Only GET gets the soft
    // 404 treatment now; writes always reject so their catch blocks see it.
    const method = (originalRequest?.method || "get").toLowerCase();
    if (error.response?.status === 404 && method === "get") {
      console.log("404 handled safely:", originalRequest?.url);
      return Promise.resolve({ data: null });
    }

    return Promise.reject(error);
  }
);

export default api;
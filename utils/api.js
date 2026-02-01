// utils/api.js

function getAppSafe() {
  try {
    return getApp(); // available after App({}) is constructed
  } catch {
    return null;
  }
}

function getApiBase() {
  // Prefer app.globalData.apiBase; fallback to a safe default
  const app = getAppSafe();
  return (app && app.globalData && app.globalData.apiBase) || 'http://localhost:8080/api/user';
}

function getAuthHeader() {
  // Prefer token from app; fallback to storage (works early in lifecycle)
  const app = getAppSafe();
  const token =
    (app && app.globalData && app.globalData.token) ||
    wx.getStorageSync('token') ||
    '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Unified API wrapper for wx.request
 * - Lazy reads app/globalData so it works even if imported before App() exists
 * - Auto re-login & retry on 401 (if app.ensureLogin exists)
 */
function api(path, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const url = `${getApiBase()}${path}`;

    wx.request({
      url,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...getAuthHeader(),
      },
      success: async (res) => {
        const { statusCode, data: resData } = res;

        if (statusCode >= 200 && statusCode < 300) {
          return resolve(resData);
        }

        if (statusCode === 401) {
          // Try single re-login if app exposes ensureLogin
          const app = getAppSafe();
          if (app && typeof app.ensureLogin === 'function') {
            try {
              await app.ensureLogin();
              // retry original request once after refresh
              return resolve(await api(path, method, data));
            } catch (e) {
              return reject({ status: 401, error: 'Unauthorized', detail: e });
            }
          }
        }

        reject({
          status: statusCode,
          error: resData?.error || resData?.message || 'API Error',
          raw: res,
        });
      },
      fail: (err) => {
        reject({ error: 'Network error', detail: err });
      },
    });
  });
}

module.exports = { api };

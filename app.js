// app.js
const { api } = require('./utils/api');

function resolveApiBase() {
  try {
    const { miniProgram } = wx.getAccountInfoSync?.() || {};
    const env = miniProgram?.envVersion || 'develop';
    // Backend user APIs are under /api/user/* (wechat-mini-backend)
    if (env === 'release')  return 'https://yd.qiaq.online/api/user';
    if (env === 'trial')    return 'https://hwls1.qiaq.online/api/user';
    return 'http://localhost:8080/api/user';
  } catch (e) {
    console.warn('resolveApiBase failed, fallback to dev:', e);
    return 'http://localhost:8080/api/user';
  }
}

function getReferralFromEnterOptions() {
  try {
    const enter = wx.getEnterOptionsSync?.();
    const raw = enter?.query?.ref || '';
    return raw ? decodeURIComponent(String(raw)).trim() : '';
  } catch { return ''; }
}

async function acceptReferralOnce(code) {
  if (!code) return;
  try {
    const res = await api('/referral/accept', 'POST', { code });
    if (res?.ok) {
      try { wx.removeStorageSync('pendingRef'); } catch {}
    } else {
      try { wx.setStorageSync('pendingRef', code); } catch {}
      console.warn('accept referral not ok:', res);
    }
  } catch (e) {
    try { wx.setStorageSync('pendingRef', code); } catch {}
    console.warn('accept referral error:', e);
  }
}

App({
  globalData: {
    token: '',
    userId: '',
    joinCount: 0,
    prizeMultiplier: 1,
    apiBase: resolveApiBase(),
    cashed_assets: {
      share: null
    }
  },

  onLaunch() {
    // 1) capture ref early
    const refFromEntry = getReferralFromEnterOptions();
    const readyToUse = refFromEntry || wx.getStorageSync('pendingRef') || '';
    if (readyToUse) {
      wx.setStorageSync('pendingRef', readyToUse);
    }

    // 2) restore cached creds (we will NOT accept referral based on old token)
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    const joinCount = wx.getStorageSync('joinCount');
    const prizeMultiplier = wx.getStorageSync('prizeMultiplier');

    if (token) this.globalData.token = token;
    if (userId) this.globalData.userId = userId;
    if (joinCount) this.globalData.joinCount = joinCount;
    if (prizeMultiplier) this.globalData.prizeMultiplier = prizeMultiplier;

    // 3) ensure login; if we have a ref, force a fresh wx.login so acceptance happens strictly after login success
    const forceFreshLogin = !!refFromEntry;
    
    this.ensureLogin({ forceFreshLogin }).catch(err => {
      console.warn('Initial ensureLogin failed:', err);
    });
  },

  /**
   * ensureLogin({ forceFreshLogin })
   * - If forceFreshLogin: ALWAYS run wx.login, even if we already have a token.
   * - Otherwise: reuse token if present; no referral acceptance occurs without a fresh login.
   */
  ensureLogin(opts = {}) {
    const { forceFreshLogin = false } = opts;

    if (!forceFreshLogin && this.globalData.token) {
      // No fresh login → DO NOT accept referral here (strict rule)
      return Promise.resolve(this.globalData.token);
    }

    return new Promise((resolve, reject) => {
      wx.login({
        success: async ({ code }) => {
          try {
            // login payload (you can include ref or not; acceptance still happens AFTER token)
            const payload = { code };
            const res = await api('/auth/login', 'POST', payload);

            const token = res?.token || '';
            const userId = res?.userId || '';
            const joinCount = res?.joinCount || 3;
            const prizeMultiplier = res?.prizeMultiplier || 1;

            if (!token) throw new Error('No token returned from /auth/login');

            // persist token
            this.globalData.token = token;
            this.globalData.userId = userId;
            this.globalData.joinCount = joinCount;
            this.globalData.prizeMultiplier = prizeMultiplier;
            try {
              wx.setStorageSync('token', token);
              if (userId) wx.setStorageSync('userId', userId);
              if (joinCount) wx.setStorageSync('joinCount', joinCount);
              if (prizeMultiplier) wx.setStorageSync('prizeMultiplier', prizeMultiplier);
            } catch {}
            const refCode = wx.getStorageSync('pendingRef') || '';
            if (refCode){
              // await this.acceptReferralOnce(refCode);
              await acceptReferralOnce('R8F084225');
            }
            resolve(token);
          } catch (e) {
            console.error('ensureLogin exchange failed:', e);
            reject(e);
            wx.showToast({ title: '登录失败', icon: 'none' });
          }
        },
        fail: (e) => {
          console.error('wx.login failed:', e);
          reject(e);
          wx.showToast({ title: '登录失败', icon: 'none' });
        }
      });
    });
  },

  async afterLogin(fn) {
    try {
      await this.ensureLogin();
      typeof fn === 'function' && fn();
    } catch (e) {
      console.warn('afterLogin failed:', e);
    }
  },

  logout() {
    try {
      wx.removeStorageSync('token');
      wx.removeStorageSync('userId');
      wx.removeStorageSync('joinCount');
      wx.removeStorageSync('prizeMultiplier');
    } catch {}
    this.globalData.token = '';
    this.globalData.userId = '';
    this.globalData.joinCount = 3;
    this.globalData.prizeMultiplier = 1;
  }
});

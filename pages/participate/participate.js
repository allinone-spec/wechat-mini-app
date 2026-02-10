// pages/participate/participate.js
const app = getApp();
const { api } = require('../../utils/api');
const { shareData, shareMethods, applyShareOnLoad } = require('../../utils/share');

/** Date range display (same-day → 仅单日) */
function formatRange(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const sTxt = `${s.getMonth() + 1}月${s.getDate()}日`;
  const eTxt = `${e.getMonth() + 1}月${e.getDate()}日`;
  return sTxt === eTxt ? sTxt : `${sTxt} - ${eTxt}`;
}

Page({
  data: {
    // Sharing (image selector, etc.)
    ...shareData,

    // List rendered as contests plus optional ad cards
    displayItems: [],

    // Agree modal (component)
    agreeModal: { show: false, agreed: false, joinCount: app.globalData.joinCount, contestId: 0, viewShare: false },

    // modalHub     
    modalHub: { joinCount: app.globalData.joinCount, viewShare: false },

    // Ad materials (safe to leave empty)
    ads: [
      // { img: '/assets/ads/ad1.jpg', link: 'https://your-landing.com' },
      // { img: '/assets/ads/ad2.jpg', link: 'https://your-landing2.com' },
    ],

    // UI guards
    loading: false,
    participating: false,
  },

  // share methods (onShareAppMessage / onShareTimeline, etc.)
  ...shareMethods,

  onLoad() {
    // enable share menus
    applyShareOnLoad(this);
  },

  onShow() {
    // Optional: refresh when returning to the page
    app.afterLogin(async () => {
      await this.fetchCount();
      this.safeLoadContests();
    });
  },

  onPullDownRefresh() {
    this.safeLoadContests().finally(() => wx.stopPullDownRefresh());
  },

  async fetchCount() {
    try {
      const res = await api('/me/fetchCount', 'GET');
      const joinCount = Number(res?.joinCount);
      const prizeMultiplier = Number(res?.prizeMultiplier);
      app.globalData.joinCount = joinCount;
      app.globalData.prizeMultiplier = prizeMultiplier;
      if (joinCount) wx.setStorageSync('joinCount', joinCount);
      if (prizeMultiplier) wx.setStorageSync('prizeMultiplier', prizeMultiplier);
      this.setData({'agreeModal.joinCount': joinCount});
      this.setData({'modalHub.joinCount': joinCount});
    } catch (err) {
      console.warn('Failed to fetch joinCount:', err);
    }
  },

  // Wrapper with loading guard
  async safeLoadContests() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await this.loadContests();
    } finally {
      this.setData({ loading: false });
    }
  },

  /** Fetch contests, normalize, and interleave ads */
  async loadContests() {
    try {
      const res = await api('/contest/list', 'GET');
      const contests = Array.isArray(res?.items) ? res.items : [];
      const normalized = contests.map(c => {
        let statusText = '未开始';
        if (c.status == 'ONGOING') {
          statusText = '进行中';
        } else if (c.status == 'FINALIZED') {
          statusText = '已结束';
        } else if (c.status == 'FINALIZING') {
          statusText = '结束中'
        }

        return {
          __type: 'contest',
          __key: 'ct_' + c.id,
          id: c.id,
          title: c.title,
          frequency: c.frequency,
          dateText: formatRange(c.startAt, c.endAt),
          status: c.status,
          statusText,
          joined: typeof c.joined === 'boolean' ? c.joined : false
        };
      });

      // Interleave ads every N items (3 or 5) if ads available
      const items = [];
      const step = this.data.ads?.length ? (Math.random() < 0.5 ? 3 : 5) : Number.MAX_SAFE_INTEGER;
      let adIndex = 0;
      for (let i = 0; i < normalized.length; i++) {
        items.push(normalized[i]);
        const shouldInsertAd = this.data.ads.length > 0 && (i + 1) % step === 0;
        if (shouldInsertAd) {
          const ad = this.data.ads[adIndex % this.data.ads.length];
          items.push({ __type: 'ad', __key: `ad_${i}`, img: ad.img, link: ad.link });
          adIndex++;
        }
      }

      this.setData({ displayItems: items });
    } catch (e) {
      console.error('loadContests failed:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // ===== Agree Modal =====
  openAgreeModal(e) {
    const contestId = Number(e?.currentTarget?.dataset?.id || 0);
    if (!contestId) return;
    this.setData({
      agreeModal: {
        show: true,
        agreed: false,
        joinCount: app.globalData.joinCount,
        contestId
      }
    });
  },

  closeAgree() {
    this.setData({ 'agreeModal.show': false });
  },

  /** Confirm participate (guarded; reuses global login) */
  async confirmParticipate(e) {
    const contestId = Number(e?.detail?.contestId || this.data.agreeModal.contestId || 0);
    if (!contestId) return;

    if (this.data.participating) return; // double-click guard
    this.setData({ participating: true });

    try {
      // Ensure login (single-flight) before calling API
      if (app && typeof app.ensureLogin === 'function') {
        await app.ensureLogin();
      }

      await api('/contest/participate', 'POST', { contestId });

      wx.showToast({ title: '报名成功', icon: 'success' });
      this.setData({ 'agreeModal.show': false });

      // Optionally refresh contest list to update "joined" state
      await this.safeLoadContests();
      await this.fetchCount();
    } catch (err) {
      console.error('participate error:', err);
      // If your backend uses 409 for "already joined", customize message:
      const msg =
        err?.status === 409
          ? '已报名，请勿重复'
          : (err?.error || '报名失败');
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ participating: false });
    }
  },

  /** Entry → leaderboard (tabBar); scope/tab/ranking from contest id, type, status */
  goMyRanking(e) {
    const { id, type, status } = e.currentTarget?.dataset || {};
    if (!id) return;
    wx.setStorageSync('contestIdForLeaderboard', Number(id));
    wx.setStorageSync('contestTypeForLeaderboard', String(type || ''));
    wx.setStorageSync('contestStatusForLeaderboard', String(status || ''));
    wx.setStorageSync('gotoEnded', status === 'FINALIZED' ? '1' : '');
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  /** Open ad link (requires business-domain allowlist if using web-view) */
  openAd(e) {
    const link = e?.currentTarget?.dataset?.link;
    if (!link) return;
    // e.g., use web-view if you’ve added the domain:
    // wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(link)}` });
  },

  goShare(){
    this.setData({'modalHub.viewShare': true});
  }
});

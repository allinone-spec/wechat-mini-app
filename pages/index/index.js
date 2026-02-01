// pages/index/index.js
const { preload_assets } = require('../../utils/preload_assets.js');

const app = getApp();
const { api } = require('../../utils/api');
const { shareData, shareMethods, applyShareOnLoad } = require('../../utils/share');

// ===== Daily 3-times disclaimer helper =====
const KEY_PREFIX = 'disclaimerCount:';
function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return KEY_PREFIX + `${yyyy}-${mm}-${dd}`;
}
function readDisclaimerCount() {
  try { return Number(wx.getStorageSync(todayKey()) || 0) || 0; } catch { return 0; }
}
function writeDisclaimerCount(v) {
  try { wx.setStorageSync(todayKey(), v); } catch {}
}

function getTodaySteps(stepInfoList) {
  if (!stepInfoList || stepInfoList.length === 0) return 0
  // Sort by timestamp just in case
  const sortedList = stepInfoList.slice().sort((a, b) => a.timestamp - b.timestamp)
  // Get the last element
  const lastStep = sortedList[sortedList.length - 1]
  return lastStep.step
}

function formatRange(startISO, endISO) {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const sTxt = `${s.getMonth() + 1}月${s.getDate()}日`;
  const eTxt = `${e.getMonth() + 1}月${e.getDate()}日`;
  return (sTxt === eTxt) ? sTxt : `${sTxt} - ${eTxt}`;
}

Page({
  data: {
    ...shareData,
    steps: 0,

    // Background swiper
    bgCurrent: 0,
    bgImages: [
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise1.png' },
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise2.png' },
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise3.png' },
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise4.png' },
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise5.png' },
      { img: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/background/exercise6.png' }
    ],

    equipIcons: [
      { id: 1, img: '/assets/reward/rewards1.png' },
      { id: 2, img: '/assets/reward/rewards2.png' },
      { id: 3, img: '/assets/reward/rewards3.png' },
      { id: 4, img: '/assets/reward/rewards4.png' },
      { id: 5, img: '/assets/reward/rewards5.png' },
    ],

    ads: [],
    displayItems: [],

    // Agree modal (component)
    agreeModal: { show: false, agreed: false, joinCount: app.globalData.joinCount, contestId: 0, viewShare: false },
    modalHub: { joinCount: app.globalData.joinCount, viewShare: false },
    // UI guards
    loading: false,
    participating: false,

    // Marquee: shown until it loops 3 times per day
    showDisclaimer: true
  },

  ...shareMethods,

  onLoad() {
    applyShareOnLoad(this);
    const cnt = readDisclaimerCount();
    this.setData({ showDisclaimer: cnt < 3 });
  },

  onShow() {
    // Ensure login, then load everything
    app.afterLogin(async () => {
      this.fetchTodaySteps();
      await this.fetchCount();
      await this.safeLoadContests();
    });
  },

  onReady() {
    preload_assets({
      share1: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/share/1.png',
      share2: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/share/2.png',
      share3: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/share/3.png',
      share4: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/share/4.png',
      share5: 'https://wechat-assets-cdn.b-cdn.net/cdn_assets/share/5.png'
    });
  },

  async onPullDownRefresh() {
    try {
      this.fetchTodaySteps();
      await this.safeLoadContests();
      await this.fetchCount();   // optional on refresh as well
    } finally {
      wx.stopPullDownRefresh();
    }
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

  onBgChange(e) {
    this.setData({ bgCurrent: e.detail.current });
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
  // ===== Contests =====
  async loadContests() {
    try {
      const res = await api('/contest/recent-list', 'GET');
      const contests = Array.isArray(res?.items) ? res.items : [];
      const now = Date.now();

      const normalized = contests.map(c => {
        const start = new Date(c.startAt).getTime();
        const end   = new Date(c.endAt).getTime();

        let status = 'upcoming';
        let statusText = '未开始';
        if (now >= start && now <= end) {
          status = 'ongoing'; statusText = '进行中';
        } else if (now > end) {
          status = 'ended'; statusText = '已结束';
        }

        return {
          __type: 'contest',
          __key: 'ct_' + c.id,
          id: c.id,
          title: c.title,
          frequency: c.frequency,
          dateText: formatRange(c.startAt, c.endAt),
          status,
          statusText,
          joined: typeof c.joined === 'boolean' ? c.joined : false
        };
      });

      this.setData({ displayItems: normalized });
    } catch (e) {
      console.error('loadContests error:', e);
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

  async confirmParticipate(e) {
    const contestId = Number(e?.detail?.contestId || this.data.agreeModal.contestId || 0);
    if (!contestId) return;

    try {
      await api('/contest/participate', 'POST', { contestId });
      wx.showToast({ title: '报名成功', icon: 'success' });
      this.setData({ 'agreeModal.show': false });
      await this.safeLoadContests();
      await this.fetchCount();
    } catch (err) {
      console.error('participate error', err);
      wx.showToast({ title: '报名失败', icon: 'none' });
    }
  },

  openAd(e) {
    const link = e?.currentTarget?.dataset?.link;
    if (!link) return;
    // wx.navigateTo({ url: `/pages/webview/webview?url=${encodeURIComponent(link)}` });
  },

  stopScroll() {},

  // ===== WeRun steps (stubbed) =====
  fetchTodaySteps() {
    wx.getWeRunData({
      success: async (r) => {
        try {
          console.log("crypted steps data:", r);
          const loginRes = await wx.login()
          const code = loginRes.code
          const resp = await api('/me/stepsUpload', 'POST', { iv: r.iv, encryptedData: r.encryptedData, code: code });
          console.log(resp?.werun.stepInfoList);
          const todaySteps = Number(getTodaySteps(resp?.werun.stepInfoList) || 0);
          this.setData({ steps: todaySteps });
        } catch (e) {
          console.error('werun decrypt error', e);
          this.setData({ steps: 0 });
        }
      },
      fail: () => wx.showToast({ title: '需授权微信运动', icon: 'none' })
    });
  },

  goMyRanking(e) {
    const { id, type, status } = e.currentTarget?.dataset || {};
    if (!id) return;
    wx.setStorageSync('contestIdForLeaderboard', Number(id));
    wx.setStorageSync('contestTypeForLeaderboard', String(type || ''));
    wx.setStorageSync('contestStatusForLeaderboard', String(status || ''));
    wx.setStorageSync('gotoEnded', status === 'ended' ? '1' : '');
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  // ===== Disclaimer: stop after 3 loops =====
  onMarqueeEnd() {
    const curr = readDisclaimerCount();
    const next = curr + 1;
    writeDisclaimerCount(next);
    if (next >= 3) {
      this.setData({ showDisclaimer: false });
    }
  },
  
  goShare(){
    this.setData({'modalHub.viewShare': true});
  }
});

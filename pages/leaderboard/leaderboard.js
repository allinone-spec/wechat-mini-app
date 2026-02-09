// pages/leaderboard/leaderboard.js
const app = getApp();
const { api } = require('../../utils/api');
const { shareData, shareMethods, applyShareOnLoad } = require('../../utils/share');

Page({
  data: {
    ...shareData,
    seg: 'ongoing',        // ongoing | ended
    tab: 'day',            // day | week | month (only for ongoing)
    tabDisabled: { day: false, week: false, month: false },
    me: { 
      uid: app.globalData.userId, 
      nickname: '', 
      weekSteps: 0, 
      joinCount: app.globalData.joinCount, 
      prizeMultiplier: app.globalData.prizeMultiplier, 
      stats: {} 
    },
    claim: { show: false },
    modalHub: { joinCount: app.globalData.joinCount, viewShare: false },

    ongoing: {
      contestId: '',       // current ongoing contest (by tab: day/week/month)
      contestType: '',
      ongoingByTab: { day: null, week: null, month: null }, // contestId per frequency
      page: 1,
      size: 30,
      hasMore: true,
      items: [],
      my: null,
      showMyRow: false,
      firstScreenCount: 0,
      loadingText: '加载中...'
    },

    ended: {
      page: 1, size: 10, hasMore: true,
      items: [],
      loadingText: '加载中...',
      selectedContestId: null,
      rankingItems: [],
      rankingTitle: '',
      rankingLoading: false,
      my: null,            // my rank for selected finalized contest
      showMyRow: false,    // overlay my rank at bottom when not in viewport
      firstScreenCount: 0
    },

    vip: {}
  },
  ...shareMethods, 

  onLoad() {
    applyShareOnLoad(this); // ⬅️ enables both share menus
    // ... keep your existing onLoad work here (if any)
  },

  onShow() {
    app.afterLogin(async () => {
      const handedRaw = wx.getStorageSync('contestIdForLeaderboard');
      const handed = handedRaw === '' || handedRaw == null ? null : Number(handedRaw);
      const gotoEnded = !!wx.getStorageSync('gotoEnded');
      const handedType = wx.getStorageSync('contestTypeForLeaderboard') || '';

      if (Number.isFinite(handed)) {
        wx.removeStorageSync('contestIdForLeaderboard');
        wx.removeStorageSync('contestTypeForLeaderboard');
        wx.removeStorageSync('contestStatusForLeaderboard');
        wx.removeStorageSync('gotoEnded');

        if (gotoEnded) {
          this.setData({
            seg: 'ended',
            'ended.selectedContestId': handed,
            'ended.rankingItems': [],
            'ended.rankingTitle': ''
          }, () => {
            this.loadEnded(true);
            this.loadEndedRanking(handed);
          });
        } else {
          this.fillOngoingByTab().then(() => {
            const locks = this.computeTabLocks(handedType);
            this.setData({
              seg: 'ongoing',
              tab: locks.defaultTab,
              tabDisabled: locks.disabled,
              'ongoing.contestId': handed
            }, () => {
              this.loadOngoing(true);
            });
          });
        }
      } else {
        if (!this.data.ongoing.items.length || !Number.isFinite(this.data.ongoing.contestId)) {
          this.bootstrap();
        } else if (this.data.seg === 'ongoing') {
          this.reapplyFirstScreenLogic();
        }
      }

      this.loadMeAndVip();
    });
  },

  computeTabLocks(contestType) {
    const type = String(contestType || '').toUpperCase(); // DAILY | WEEKLY | (empty)
    let disabled = { day: false, week: false, month: false };
    let defaultTab = 'day';
    if (type === 'DAILY') {
      disabled = { day: false, week: true, month: true };
      defaultTab = 'day';
    } else if (type === 'WEEKLY') {
      disabled = { day: true, week: false, month: true };
      defaultTab = 'week';
    } else if (type === 'MONTHLY') {
      disabled = { day: true, week: true, month: true };
      defaultTab = 'month';
    } 
    return { disabled, defaultTab };
  },

  /** Build ongoingByTab (day/week/month by frequency) from contest list */
  async fillOngoingByTab() {
    try {
      const res = await api('/contest/list', 'GET');
      const items = (res.items || []).slice();
      const now = Date.now();
      const ongoing = items.filter(c => {
        const start = new Date(c.startAt).getTime();
        const end = new Date(c.endAt).getTime();
        return now >= start && now <= end;
      });
      ongoing.sort((a, b) => new Date(b.endAt) - new Date(a.endAt));

      const byTab = { day: null, week: null, month: null };
      ongoing.forEach(c => {
        const freq = String(c.frequency || '').toUpperCase();
        if (freq === 'DAILY' && byTab.day == null) byTab.day = c.id;
        else if (freq === 'WEEKLY' && byTab.week == null) byTab.week = c.id;
        else if (freq === 'MONTHLY' && byTab.month == null) byTab.month = c.id;
      });
      const tabDisabled = { day: byTab.day == null, week: byTab.week == null, month: byTab.month == null };
      this.setData({ 'ongoing.ongoingByTab': byTab, tabDisabled });
      return byTab;
    } catch (e) {
      console.error(e);
      return this.data.ongoing.ongoingByTab || { day: null, week: null, month: null };
    }
  },

  async bootstrap() {
    const byTab = await this.fillOngoingByTab();
    const defaultContestId = byTab.day || byTab.week || byTab.month || null;
    const tab = byTab.day != null ? 'day' : (byTab.week != null ? 'week' : 'month');
    this.setData({
      'ongoing.contestId': defaultContestId,
      tab
    }, () => {
      this.loadOngoing(true);
    });
  },

  /* ---------------- 一级 / 二级切换 ---------------- */
  switchSeg(e) {
    const seg = e.currentTarget.dataset.k;
    if (seg === this.data.seg) return;

    if (seg === 'ended') {
      this.setData({ seg, 'ended.selectedContestId': null, 'ended.rankingItems': [], 'ended.rankingTitle': '' }, () => {
        if (this.data.ended.items.length === 0) this.loadEnded(true);
      });
    } else {
      this.setData({ seg }, () => {
        if (this.data.ongoing.items.length === 0) this.loadOngoing(true);
        else this.reapplyFirstScreenLogic();
      });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.k;       // 'day' | 'week' | 'month'
    if (this.data.tabDisabled?.[tab]) return;
    if (tab === this.data.tab) return;

    const contestId = this.data.ongoing.ongoingByTab?.[tab];
    if (contestId == null) return;

    this.setData({
      tab,
      'ongoing.contestId': contestId,
      'ongoing.showMyRow': false,
      'ongoing.firstScreenCount': 0
    });
    this.loadOngoing(true);
  },

  /* ---------------- 进行中榜单（日 / 周 / 月） ---------------- */
  async loadOngoing(reset = false) {
    const contestId = Number(
      wx.getStorageSync('contestIdForLeaderboard') || this.data.ongoing.contestId
    );
    const contestType = wx.getStorageSync('contestTypeForLeaderboard');

    if (!Number.isFinite(contestId)) {
      this.setData({ 'ongoing.loadingText': '缺少赛事ID' });
      return;
    }
    if (reset) {
      this.setData({
        'ongoing.page': 1,
        'ongoing.contestType': (wx.getStorageSync('contestTypeForLeaderboard') || '').toUpperCase(),
        'ongoing.items': [],
        'ongoing.hasMore': true,
        'ongoing.showMyRow': false,
        'ongoing.firstScreenCount': 0,
        'ongoing.loadingText': '加载中...'
      });
    }
    if (!this.data.ongoing.hasMore) return;

    const { page, size } = this.data.ongoing;
    const scope = this.data.tab; // 'day' | 'week' | 'month'

    try {
      const r = await api('/leaderboard/list', 'GET', { contestId, page, size, scope });
      const { list = [], hasMore = false } = r || {};

      this.setData({
        'ongoing.contestType': contestType,
        'ongoing.items': this.data.ongoing.items.concat(list),
        'ongoing.hasMore': !!hasMore,
        'ongoing.page': page + 1,
        'ongoing.loadingText': hasMore ? '上拉加载更多' : (this.data.ongoing.items.length ? '没有更多了' : '暂无数据')
      });

      if (reset) {
        try {
          const meRank = await api('/leaderboard/my-rank', 'GET', { contestId, scope });
          if (meRank && typeof meRank.rank === 'number') {
            this.setData({ 'ongoing.my': meRank });
          } else {
            this.setData({ 'ongoing.my': null });
          }
        } catch {
          this.setData({ 'ongoing.my': null });
        }

        // 与首次加载同逻辑：计算首屏并决定是否固定我的行
        this.updateFirstScreenCountAndVisibility();
      }
    } catch (e) {
      console.error(e);
      this.setData({ 'ongoing.loadingText': '加载失败' });
    }
  },

  /* --------- 首屏可见性判断（设备相关首屏条数） ---------- */
  reapplyFirstScreenLogic() {
    // 清零后重新测量并评估
    this.setData({ 'ongoing.showMyRow': false, 'ongoing.firstScreenCount': 0 }, () => {
      this.updateFirstScreenCountAndVisibility();
    });
  },

  updateFirstScreenCountAndVisibility() {
    wx.nextTick(() => {
      const q = wx.createSelectorQuery();
      q.select('.list').boundingClientRect();
      q.select('.rank-row').boundingClientRect(); // 用第一行高度推算行高
      q.exec(res => {
        const [listRect, rowRect] = res || [];
        let firstCount = 0;

        if (listRect && rowRect && rowRect.height > 0) {
          firstCount = Math.max(1, Math.floor(listRect.height / rowRect.height));
        } else {
          firstCount = 8; // 兜底
        }

        this.setData({ 'ongoing.firstScreenCount': firstCount }, () => {
          this.applyShowMyRowByViewport();
        });
      });
    });
  },

  applyShowMyRowByViewport() {
    const my = this.data.ongoing.my;
    const items = this.data.ongoing.items || [];
    const size = this.data.ongoing.size || 30;
    const firstCount = this.data.ongoing.firstScreenCount || 0;

    // 首屏逻辑只在首页数据范围内判定
    const isFirstPageData = items.length <= size;
    if (!isFirstPageData || !my || typeof my.rank !== 'number' || firstCount <= 0) {
      this.setData({ 'ongoing.showMyRow': false });
      return;
    }

    const includedInPage = items.some(x => x.rank === my.rank);
    const includedInViewport = my.rank <= firstCount;

    const show = !includedInViewport && isFirstPageData && (includedInPage || my.rank > size);
    this.setData({ 'ongoing.showMyRow': show });
  },

  /* --------- 任何滚动都取消固定行 ---------- */
  onOngoingScroll() {
    if (this.data.ongoing.showMyRow) {
      this.setData({ 'ongoing.showMyRow': false });
    }
  },

  /* ---------------- 已结束榜单（卡片） ---------------- */
  async loadEnded(reset = false) {
    if (reset) {
      this.setData({
        'ended.page': 1,
        'ended.items': [],
        'ended.hasMore': true,
        'ended.loadingText': '加载中...'
      });
    }
    if (!this.data.ended.hasMore) return;

    const { page, size } = this.data.ended;
    try {
      const r = await api('/contest/ended', 'GET', { page, size });
      const { items = [], hasMore = false } = r || {};

      this.setData({
        'ended.items': this.data.ended.items.concat(items),
        'ended.hasMore': !!hasMore,
        'ended.page': page + 1,
        'ended.loadingText': hasMore ? '上拉加载更多' : (this.data.ended.items.length ? '没有更多了' : '暂无数据')
      });
    } catch (e) {
      console.error(e);
      this.setData({ 'ended.loadingText': '加载失败' });
    }
  },

  loadMoreEnded() {
    if (this.data.seg !== 'ended') return;
    this.loadEnded();
  },

  /** Load ranking for one finalized contest (show in finalized scope, not ongoing) */
  async loadEndedRanking(contestId) {
    if (!Number.isFinite(contestId)) return;
    this.setData({ 'ended.rankingLoading': true, 'ended.showMyRow': false, 'ended.my': null });
    try {
      const [listRes, meRes] = await Promise.all([
        api('/leaderboard/list', 'GET', { contestId, page: 1, size: 100, scope: 'day' }),
        api('/leaderboard/my-rank', 'GET', { contestId, scope: 'day' }).catch(() => null)
      ]);
      const list = listRes?.list || [];
      const item = (this.data.ended.items || []).find(i => i.contestId === contestId);
      const title = item ? item.title : ('赛事 #' + contestId);
      this.setData({
        'ended.rankingItems': list,
        'ended.rankingTitle': title,
        'ended.rankingLoading': false,
        'ended.my': meRes && typeof meRes.rank === 'number' ? meRes : null
      }, () => {
        this.updateEndedFirstScreenCountAndVisibility();
      });
    } catch (e) {
      console.error(e);
      this.setData({ 'ended.rankingLoading': false, 'ended.rankingItems': [], 'ended.my': null });
    }
  },

  /** Finalized ranking: compute firstScreenCount and show my-row overlay if my rank outside viewport */
  updateEndedFirstScreenCountAndVisibility() {
    if (!this.data.ended.selectedContestId || !this.data.ended.rankingItems.length) return;
    wx.nextTick(() => {
      const q = wx.createSelectorQuery().in(this);
      q.select('.ended-ranking-list').boundingClientRect();
      q.select('.ended-ranking-list .rank-row').boundingClientRect();
      q.exec(res => {
        const [listRect, rowRect] = res || [];
        let firstCount = 0;
        if (listRect && rowRect && rowRect.height > 0) {
          firstCount = Math.max(1, Math.floor(listRect.height / rowRect.height));
        } else {
          firstCount = 8;
        }
        const my = this.data.ended.my;
        const items = this.data.ended.rankingItems || [];
        const includedInViewport = my && typeof my.rank === 'number' && my.rank <= firstCount;
        const includedInList = my && items.some(x => x.rank === my.rank);
        const show = !!my && !includedInViewport && includedInList;
        this.setData({
          'ended.firstScreenCount': firstCount,
          'ended.showMyRow': show
        });
      });
    });
  },

  /** Finalized ranking scroll: remove my-rank overlay */
  onEndedRankingScroll() {
    if (this.data.ended.showMyRow) {
      this.setData({ 'ended.showMyRow': false });
    }
  },

  /** Finalized scope: click "查看排名" on a contest → show that contest ranking (stay in finalized) */
  goRanking(e) {
    const { id } = e.currentTarget?.dataset || {};
    if (!id) return;
    const contestId = Number(id);
    this.setData({
      seg: 'ended',
      'ended.selectedContestId': contestId,
      'ended.rankingItems': [],
      'ended.rankingTitle': ''
    }, () => {
      this.loadEnded(true);
      this.loadEndedRanking(contestId);
    });
  },

  /** Finalized ranking view: back to list */
  backEndedList() {
    this.setData({
      'ended.selectedContestId': null,
      'ended.rankingItems': [],
      'ended.rankingTitle': '',
      'ended.my': null,
      'ended.showMyRow': false
    });
  },

  async loadMeAndVip() {
    const me = await api('/me/getInfo', 'GET');
    const membership = await api('/membership/me', 'GET');
  
    const meta = VIP_META[membership?.tier || 'NONE'];
    const vip = {
      tier: membership?.tier || 'NONE',
      frame: VIP_ASSETS[membership?.tier] || '',
      class: membership?.tier?.toLowerCase?.() || '',
      name: meta.name,
      color: meta.color,
      badge: meta.badge,
      start: membership?.startAt ? fmtDate(membership.startAt) : '',
      end:   membership?.endAt ? fmtDate(membership.endAt) : '',
    };
  
    this.setData({ me, vip });
    app.globalData.joinCount = me.joinCount;
    this.setData({ 'modalHub.joinCount': me.joinCount });
  },

  /* ---------------- actions ---------------- */
  async claim(e){
    e.stopPropagation && e.stopPropagation();
    const contestId = Number(e.currentTarget.dataset.id);

    try{
      const r = await api('/reward/start','POST',{ contestId });
      const d = await api('/reward/detail','GET',{ claimId: r.claimId });

      this.setData({
        claim: {
          show: true,
          claimId: r.claimId,
          contestId,
          rank: r.rank,
          prizeTitle: d.prizeTitle,
          imageUrl: '/assets/prize_sample.jpg',
          csWeChatId: d.csWeChatId,
          stateHint: d.stateHint
        }
      });
    }catch(err){
      wx.showToast({ title: err?.message || '领取失败', icon:'none' });
    }
  },

  async viewPrize(e){
    e.stopPropagation && e.stopPropagation();
    const claimId = Number(e.currentTarget.dataset.claimId);
    if (!Number.isFinite(claimId)) {
      wx.showToast({ title: '缺少 claimId', icon: 'none' });
      return;
    }
    try{
      const d = await api('/reward/detail','GET',{ claimId });
      this.setData({
        claim: {
          show: true,
          claimId,
          contestId: d.contestId,
          rank: d.rank,
          prizeTitle: d.prizeTitle || '奖品',
          imageUrl: d.imageUrl || '/assets/prize_sample.jpg',
          taobaoLink: d.taobaoLink || '',
          csWeChatId: d.csWeChatId || '15786424201',
          orderNo: d.orderNo || '',
          waybillNo: d.waybillNo || '',
          stateHint: d.stateHint || ''
        }
      });
    }catch(err){
      wx.showToast({ title: err?.message || '加载失败', icon: 'none' });
    }
  },
  closeClaimModal(){ this.setData({ 'claim.show': false }); },

  noop(){}
});

const VIP_ASSETS = {
  BRONZE: '/assets/my/VIP1.png',
  SILVER: '/assets/my/VIP2.png',  
  GOLD:   '/assets/my/VIP3.png',
};

const VIP_META = {
  NONE:   { name: '',      color: '#9aa0a6', badge: '' },
  BRONZE: { name: '青铜会员', color: '#AF6F59', badge: '青铜' },
  SILVER: { name: '白银会员', color: '#7AA7FF', badge: '白银' },
  GOLD:   { name: '黄金会员', color: '#F6A623', badge: '黄金' },
};

function fmtDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}.${dt.getMonth()+1}.${dt.getDate()}`;
}

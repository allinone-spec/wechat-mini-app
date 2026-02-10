// pages/claim_modal.js
const { api } = require('../../utils/api');

Component({
  properties: {
    show: { type: Boolean, value: false },
    userid: Number,
    claimId: Number,
    contestId: Number,
    rank: Number,
    prize: Number,
    rankSub: String,
    imageUrl: String,
    csWeChatId: String,
    stateHint: String
  },
  data: {
  },
  observers: {
    rank(v){
      if (typeof v === 'number') {
        const map = {1:'第一名',2:'第二名',3:'第三名'};
        this.setData({ rankText: map[v] || `第${v}名` });
      }
    }
  },
  methods: {
    noop(){},
    close(){ this.triggerEvent('close'); },
    copyCS(){
      if (!this.data.csWeChatId || this.data.csWeChatId === "") return;
      wx.setClipboardData({ data: this.data.csWeChatId });
    },
  }
});


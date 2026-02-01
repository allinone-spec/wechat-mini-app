# WeChat Mini App (Sport)

Mini program that talks to **wechat-mini-backend** for auth, contests, leaderboard, membership, referral, and rewards.

## API connection

- **Base URL** is set in `app.js` via `resolveApiBase()` and stored in `app.globalData.apiBase`.
- All requests go through `utils/api.js`, which builds URLs as `apiBase + path` and sends `Authorization: Bearer <token>` when logged in.

| Environment | API base (user APIs) |
|-------------|------------------------|
| develop     | `http://localhost:8080/api/user` |
| trial       | `https://hwls1.qiaq.online/api/user` |
| release     | `https://yd.qiaq.online/api/user` |

Backend mounts user routes under `/api/user/*` (auth, me, contest, leaderboard, referral, membership, reward). The mini-app uses paths like `/auth/login`, `/contest/list`, so the base must end with `/api/user`.

## Local development

1. Start **wechat-mini-backend** (e.g. `npm run dev` in `wechat-mini-backend`), so it listens on `http://localhost:8080`.
2. Open this project in WeChat DevTools.
3. If the simulator blocks requests to `http://localhost`, enable **“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”** in the project settings / 详情 → 本地设置.

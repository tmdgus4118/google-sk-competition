// 퇴근길 마감 백엔드 (Express)
// 실행: npm install && npm start  →  http://localhost:3000
const express = require('express');
const path = require('path');
const Engine = require('./public/engine.js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 데모용 메모리 상태 (서버를 다시 켜면 처음으로 돌아갑니다)
let user = Engine.freshUser();

// 잠들지 않게 깨우는 주소 (무료 호스팅에서 주기적으로 호출)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 사장님 흐름: 남은 거 팔아줘 → 판매자 에이전트가 가격을 정하고 손님 에이전트들이 예약
app.post('/api/seller', (req, res) => {
  res.json(Engine.sellerFlow(req.body.shop || req.body.shopId, req.body.now || '18:10'));
});

// 구매자 흐름: 내 에이전트가 동네 마감 상품을 거르고 점수 매겨 고름
app.post('/api/buyer', (req, res) => {
  if (req.body.reset) user = Engine.freshUser();
  if (req.body.settings) applySettings(user, req.body.settings);
  const result = Engine.buyerFlow(user, req.body.now || '18:20');
  result.user = user;
  res.json(result);
});

// 승인: 에이전트 지갑에서 결제하고 사장님께 바로 정산
app.post('/api/pay', (req, res) => {
  res.json(Engine.pay(req.body.offer, user));
});

// 화면에서 고친 맡긴 범위를 반영합니다
function applySettings(u, st) {
  u.budgetPerOrder = st.budgetPerOrder;
  u.maxDetourMin = st.maxDetourMin;
  u.arriveAt = st.arriveAt;
  u.avoid = st.avoid;
  if (!st.data.search && !st.data.buy && !st.data.pay) {
    for (const k in u.habits) u.habits[k] = 0.5;
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('퇴근길 마감 데모: http://localhost:' + port));

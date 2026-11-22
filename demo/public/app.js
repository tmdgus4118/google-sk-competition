// 퇴근길 마감 화면
// 서버가 있으면 /api 로 계산하고, 없으면(정적 호스팅) 브라우저에서 같은 엔진으로 계산합니다.

var app = document.getElementById('app');
var localUser = Engine.freshUser();
var useServer = false;

// 서버가 살아 있는지 한 번 확인합니다
fetch('api/health').then(function (r) { useServer = r.ok; }).catch(function () { useServer = false; });

// 서버 호출, 실패하면 브라우저 엔진으로 대신 계산
function api(path, body) {
  if (useServer) {
    return fetch('api/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).catch(function () { return local(path, body); });
  }
  return Promise.resolve(local(path, body));
}

function local(path, body) {
  if (path === 'seller') return Engine.sellerFlow(body.shopId, body.now);
  if (path === 'buyer') {
    if (body.reset) localUser = Engine.freshUser();
    if (body.settings) applySettings(localUser, body.settings);
    var r = Engine.buyerFlow(localUser, body.now);
    r.user = localUser;
    return r;
  }
  if (path === 'pay') return Engine.pay(body.offer, localUser);
  if (path === 'cancel') return Engine.cancel(body.paid, body.offer, localUser);
}

function won(n) { return n.toLocaleString() + '원'; }

function steps(list, on) {
  var html = '<div class="steps">';
  for (var i = 0; i < list.length; i++) {
    html += '<span class="' + (i === on ? 'on' : '') + '">' + (i + 1) + '. ' + list[i] + '</span>';
  }
  return html + '</div>';
}

// ───────── 시작 화면 ─────────
function home() {
  app.innerHTML =
    '<h1 class="appear">어느 쪽으로 시작할까요?</h1>' +
    '<div class="notice appear"><b>시연용 데모입니다</b><p>핵심 흐름이 한눈에 보이도록 디자인과 기능을 최대한 직관적이고 단순하게 만들었습니다. 가게, 손님, 가격은 모두 예시 데이터이며, 실제 지도 동선, 결제 연동, 사장님 음성 입력 등은 이 흐름을 바탕으로 계속 디벨롭할 예정입니다.</p></div>' +
    '<p class="lead">빵집, 반찬가게, 만두집처럼 오늘 못 팔면 버려지는 동네 가게의 마감 상품을 AI 에이전트끼리 사고팝니다. 역할을 골라 흐름을 따라가 보세요.</p>' +
    '<div class="roles">' +
    '<button type="button" class="role owner" id="pickOwner"><span class="who">사장님으로 시작</span><span class="title">남은 거 팔아줘</span><span class="desc">말 한마디에 판매자 에이전트가 가격과 묶음을 정하고, 근처 손님 에이전트들이 예약합니다.</span></button>' +
    '<button type="button" class="role buyer" id="pickBuyer"><span class="who">구매자로 시작</span><span class="title">퇴근길에 승인 한 번</span><span class="desc">동의한 데이터로 내 식습관을 아는 에이전트가 거르고, 점수 매기고, 필요할 때만 묻습니다.</span></button>' +
    '</div>';
  document.getElementById('pickOwner').onclick = ownerStart;
  document.getElementById('pickBuyer').onclick = buyerStart;
}

// ───────── 사장님 흐름 ─────────
var OWNER_STEPS = ['가게 고르기', '남은 거 팔아줘', '손님 에이전트 예약', '바로 정산'];

function ownerStart() {
  var html = steps(OWNER_STEPS, 0) + '<h2>어느 가게 사장님인가요?</h2><p class="lead">지금은 18:10, 마감 전입니다.</p><div class="roles">';
  for (var i = 0; i < Engine.SHOPS.length; i++) {
    var s = Engine.SHOPS[i];
    var names = [];
    for (var j = 0; j < s.items.length; j++) names.push(s.items[j].name + ' ' + s.items[j].left + '개');
    html += '<button type="button" class="role owner appear" data-shop="' + s.id + '"><span class="who">' + s.type + ' · 마감 ' + s.closeAt + '</span><span class="title">' + s.name + '</span><span class="desc">남은 상품: ' + names.join(', ') + '</span></button>';
  }
  app.innerHTML = html + '</div>';
  var btns = app.querySelectorAll('[data-shop]');
  for (var k = 0; k < btns.length; k++) {
    btns[k].onclick = function () { ownerSell(this.getAttribute('data-shop')); };
  }
}

function ownerSell(shopId) {
  api('seller', { shopId: shopId, now: '18:10' }).then(function (res) {
    var shop = res.shop;
    var names = [];
    for (var i = 0; i < shop.items.length; i++) names.push(shop.items[i].name + ' ' + shop.items[i].left + '개');
    var html = steps(OWNER_STEPS, 1) + '<h2>' + shop.name + '</h2>' +
      '<p class="say appear">남은 거 팔아줘. ' + names.join(', ') + ' 남았어</p>' +
      '<div class="slip appear"><h3>판매자 에이전트가 정한 마감 가격</h3>';
    for (var j = 0; j < res.offers.length; j++) {
      var o = res.offers[j];
      html += '<div class="row"><span>' + o.item + ' · ' + o.left + '개</span><span><span class="old">' + won(o.price) + '</span><b>' + won(o.sale) + '</b></span></div>';
    }
    html += '<p class="small">마감 ' + shop.closeAt + '까지 남은 시간과 남은 수량으로 할인율을 정했고, 정가의 ' + Math.round(shop.floorRate * 100) + '% 아래로는 내리지 않아요.</p></div>' +
      '<button type="button" class="primary" id="sendBtn">이 가격으로 근처 손님 에이전트에게 내보내기</button>';
    app.innerHTML = html;
    document.getElementById('sendBtn').onclick = function () { ownerMatched(res); };
  });
}

function ownerMatched(res) {
  var html = steps(OWNER_STEPS, 2) + '<h2>손님 에이전트들이 골랐어요</h2>' +
    '<p class="lead">각 손님의 식습관, 동선, 한도에 맞을 때만 예약합니다. 처음 오는 손님은 본인에게 한 번 더 확인해요.</p>' +
    '<table><tr><th>손님 에이전트</th><th>예약 상품</th><th>가격</th><th>점수</th><th>결제 방식</th></tr>';
  var total = 0;
  for (var i = 0; i < res.reservations.length; i++) {
    var r = res.reservations[i];
    total += r.sale;
    html += '<tr class="appear"><td>' + r.buyer + ' 님</td><td>' + r.item + '</td><td>' + won(r.sale) + '</td><td class="score">' + r.score + '</td><td>' + (r.decision.mode === 'one_tap' ? '승인 한 번' : '본인 확인 후') + '</td></tr>';
  }
  if (res.reservations.length === 0) html += '<tr><td colspan="5">조건에 맞는 손님이 없어 가격을 조금 더 낮춰 다시 제안해요</td></tr>';
  html += '</table><button type="button" class="primary" id="settleBtn">손님 승인 받기</button>';
  app.innerHTML = html;
  document.getElementById('settleBtn').onclick = function () { ownerSettled(res, total); };
}

function ownerSettled(res, total) {
  var html = steps(OWNER_STEPS, 3) + '<h2>오늘 마감, 바로 정산됐어요</h2><div class="log">';
  for (var i = 0; i < res.reservations.length; i++) {
    var r = res.reservations[i];
    html += '<p class="appear">' + r.buyer + ' 님 에이전트 지갑에서 ' + won(r.sale) + ' 결제 · 픽업 QR 발송</p>';
  }
  var leftText = [];
  for (var key in res.left) if (res.left[key] > 0) leftText.push(key + ' ' + res.left[key] + '개');
  html += '<p class="done appear">총 ' + won(total) + ' 바로 정산 완료. 버려질 뻔한 상품이 매출이 됐어요.</p>' +
    '<p class="appear">남은 상품: ' + (leftText.length ? leftText.join(', ') + ' · 다음 손님에게 계속 제안 중' : '없음') + '</p></div>' +
    '<p class="small">노쇼면 결제 조건에 따라 자동 처리, 가게 사정으로 못 팔면 자동 환불됩니다.</p>' +
    '<div class="actions" style="max-width:360px"><button type="button" class="ghost" id="againBtn">다른 가게로 해 보기</button><button type="button" class="primary" id="toBuyer">구매자 쪽도 보기</button></div>';
  app.innerHTML = html;
  document.getElementById('againBtn').onclick = ownerStart;
  document.getElementById('toBuyer').onclick = buyerStart;
}

// ───────── 구매자 흐름 ─────────
var BUYER_STEPS = ['내 퇴근길과 맡길 범위', '에이전트 추천', '자세히 보고 승인', '픽업과 서비스'];
var settings = null;   // 사용자가 화면에서 고친 맡긴 범위
var lastBuyer = null;  // 마지막 추천 결과
var picks = [];        // 추천 1~3순위

var PENCIL = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2"/></svg>';

function defaultSettings() {
  var u = Engine.freshUser();
  return { budgetPerOrder: u.budgetPerOrder, maxDetourMin: u.maxDetourMin, arriveAt: u.arriveAt,
    avoid: u.avoid.slice(), data: { route: true, search: true, buy: true, pay: true } };
}

// 맡긴 범위를 엔진용 사용자 정보에 반영합니다
function applySettings(user, st) {
  user.budgetPerOrder = st.budgetPerOrder;
  user.maxDetourMin = st.maxDetourMin;
  user.arriveAt = st.arriveAt;
  user.avoid = st.avoid;
  // 검색·구매·결제 데이터를 모두 끄면 식습관을 모르니 모든 메뉴를 같은 점수로 봅니다
  if (!st.data.search && !st.data.buy && !st.data.pay) {
    for (var k in user.habits) user.habits[k] = 0.5;
  }
  return user;
}

// 퇴근길 위에서 가게와 가장 가까운 지점을 찾습니다 (가게로 빠지는 길 표시용)
function nearestOnRoute(px, py) {
  var R = Engine.ROUTE;
  var best = null;
  for (var i = 0; i < R.length - 1; i++) {
    var ax = R[i].x, ay = R[i].y, bx = R[i + 1].x, by = R[i + 1].y;
    var t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    var d = (px - x) * (px - x) + (py - y) * (py - y);
    if (!best || d < best.d) best = { x: x, y: y, d: d };
  }
  return best;
}

// 평소 퇴근길과 가게 위치 약도. focusId가 있으면 그 가게로 빠지는 길을 강조합니다
function mapSvg(ranked, focusId) {
  var R = Engine.ROUTE;
  var svg = '<svg viewBox="0 0 600 270" class="map" role="img" aria-label="평소 퇴근길과 가게 위치">';
  svg += '<rect width="600" height="270" fill="#EFE7D6"/>';
  for (var g = 1; g < 6; g++) svg += '<line x1="' + g * 100 + '" y1="0" x2="' + g * 100 + '" y2="270" stroke="#E2D8C3"/>';
  svg += '<polyline points="' + R[0].x + ',' + R[0].y + ' ' + R[1].x + ',' + R[1].y + ' ' + R[2].x + ',' + R[2].y + '" fill="none" stroke="#1F3D2E" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 12"/>';
  for (var i = 0; i < R.length; i++) {
    svg += '<circle cx="' + R[i].x + '" cy="' + R[i].y + '" r="8" fill="#1F3D2E"/>';
    svg += '<text x="' + R[i].x + '" y="' + (R[i].y + 26) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#1F3D2E">' + R[i].label + '</text>';
  }
  for (var j = 0; j < Engine.SHOPS.length; j++) {
    var shop = Engine.SHOPS[j];
    var color = '#5A564C';
    if (ranked) {
      var state = 'out';
      for (var k = 0; k < ranked.length; k++) {
        if (ranked[k].offer.shopId !== shop.id || ranked[k].excluded) continue;
        if (ranked[k].rank <= 3) state = 'top';
        else if (state !== 'top') state = 'ok';
      }
      color = state === 'top' ? '#E2622B' : (state === 'ok' ? '#2E5642' : '#A9A291');
    }
    var opacity = 1;
    if (focusId) {
      color = shop.id === focusId ? '#E2622B' : '#A9A291';
      opacity = shop.id === focusId ? 1 : 0.5;
      if (shop.id === focusId) {
        var n = nearestOnRoute(shop.x, shop.y);
        svg += '<line x1="' + n.x + '" y1="' + n.y + '" x2="' + shop.x + '" y2="' + shop.y + '" stroke="#E2622B" stroke-width="5" stroke-linecap="round"/>';
      }
    }
    var r = shop.id === focusId ? 15 : 11;
    svg += '<g opacity="' + opacity + '"><circle cx="' + shop.x + '" cy="' + shop.y + '" r="' + r + '" fill="' + color + '" stroke="#FBF8F1" stroke-width="3"/>';
    svg += '<text x="' + (shop.x + 18) + '" y="' + (shop.y + 5) + '" font-size="13" font-weight="' + (shop.id === focusId ? 700 : 400) + '" fill="#1C1A17">' + shop.name + ' · ' + shop.detourMin + '분</text></g>';
  }
  return svg + '</svg>';
}

// ① 내 퇴근길과 맡길 범위 (연필 버튼으로 항목마다 수정)
function buyerStart() {
  if (!settings) settings = defaultSettings();
  var st = settings;
  var dataNames = { route: '출퇴근 시간과 동선', search: '검색 기록', buy: '구매 이력', pay: '결제 이력' };
  var allergens = ['땅콩', '새우', '우유'];

  function editRow(id, label, view, input) {
    return '<div class="row editable" id="row-' + id + '"><span>' + label + '</span>' +
      '<span class="val"><b class="view">' + view + '</b><span class="edit" hidden>' + input + '</span>' +
      '<button type="button" class="pencil" data-edit="' + id + '" aria-label="' + label + ' 수정">' + PENCIL + '</button></span></div>';
  }
  var chk = '';
  for (var i = 0; i < allergens.length; i++) chk += '<label><input type="checkbox" name="avoid" value="' + allergens[i] + '"' + (st.avoid.indexOf(allergens[i]) >= 0 ? ' checked' : '') + '> ' + allergens[i] + '</label>';
  var dchk = '';
  var dview = [];
  for (var key in dataNames) {
    dchk += '<label><input type="checkbox" name="data" value="' + key + '"' + (st.data[key] ? ' checked' : '') + '> ' + dataNames[key] + '</label>';
    if (st.data[key]) dview.push(dataNames[key]);
  }

  app.innerHTML = steps(BUYER_STEPS, 0) +
    '<h2>지은 님의 평소 퇴근길</h2>' + mapSvg(null, null) +
    '<p class="small">18:20 회사 출발 → 지하철역 → 19:05 집 도착 · 출퇴근 동선 데이터로 파악한 경로예요 · 숫자는 퇴근길에서 더 걸리는 시간</p>' +
    '<form id="setForm" class="slip appear" style="margin-top:16px"><h3>에이전트에게 맡긴 범위 · 연필을 눌러 고칠 수 있어요</h3>' +
    editRow('budget', '한 번에 결제 한도', won(st.budgetPerOrder), '<input id="budget" type="number" min="1000" step="500" value="' + st.budgetPerOrder + '"> 원') +
    editRow('detour', '퇴근길에서 돌아가도 되는 시간', st.maxDetourMin + '분까지', '<input id="detour" type="number" min="0" max="15" value="' + st.maxDetourMin + '"> 분') +
    editRow('arrive', '평소 도착 시간', st.arriveAt, '<input id="arrive" type="time" value="' + st.arriveAt + '">') +
    editRow('avoid', '못 먹는 재료', st.avoid.length ? st.avoid.join(', ') : '없음', '<span class="chips light">' + chk + '</span>') +
    editRow('data', '에이전트가 써도 되는 데이터', dview.length ? dview.join(', ') : '사용 안 함', '<span class="chips light">' + dchk + '</span>') +
    '<div class="row"><span>파악된 식습관</span><b>반찬 90% · 김밥 70% · 빵 60% · 만두 50% · 떡 40%</b></div>' +
    '<p class="small">검색, 구매, 결제 이력을 모두 끄면 식습관을 모르는 상태로 추천해요.</p>' +
    '<button type="submit" class="primary" style="margin-top:10px">이 범위로 18:20 퇴근 시작</button></form>';

  var pens = app.querySelectorAll('[data-edit]');
  for (var p = 0; p < pens.length; p++) {
    pens[p].onclick = function () {
      var row = document.getElementById('row-' + this.getAttribute('data-edit'));
      row.querySelector('.view').hidden = true;
      row.querySelector('.edit').hidden = false;
      this.hidden = true;
    };
  }
  document.getElementById('setForm').onsubmit = function (e) {
    e.preventDefault();
    var avoid = [];
    var a = app.querySelectorAll('input[name=avoid]');
    for (var i = 0; i < a.length; i++) if (a[i].checked) avoid.push(a[i].value);
    var data = {};
    var d = app.querySelectorAll('input[name=data]');
    for (var j = 0; j < d.length; j++) data[d[j].value] = d[j].checked;
    settings = {
      budgetPerOrder: Number(document.getElementById('budget').value) || 10000,
      maxDetourMin: Number(document.getElementById('detour').value) || 0,
      arriveAt: document.getElementById('arrive').value || '19:05',
      avoid: avoid, data: data
    };
    buyerRank();
  };
}

// ② 에이전트 추천 1~3순위
function buyerRank() {
  api('buyer', { reset: true, now: '18:20', settings: settings }).then(function (res) {
    lastBuyer = res;
    var rank = 0;
    picks = [];
    for (var i = 0; i < res.ranked.length; i++) {
      if (!res.ranked[i].excluded) { rank++; res.ranked[i].rank = rank; if (picks.length < 3) picks.push(res.ranked[i]); }
    }
    var html = steps(BUYER_STEPS, 1) + '<h2>오늘 퇴근길 추천 ' + picks.length + '개</h2>' +
      '<p class="lead">동네 마감 상품 ' + res.offers.length + '개를 맡긴 범위로 거르고, 식습관 40 · 동선 25 · 할인 20 · 단골 15로 점수를 매겼어요. 순위를 눌러 자세히 보세요.</p>' +
      mapSvg(res.ranked, null) + '<p class="small">주황 추천 3순위 안 · 녹색 후보 · 회색 제외</p><div class="picks">';
    for (var p = 0; p < picks.length; p++) {
      var o = picks[p].offer;
      html += '<button type="button" class="pickcard appear" data-pick="' + p + '"><span class="small">' + (p + 1) + '순위 · ' + o.shopName + ' · ' + o.detourMin + '분 더</span>' +
        '<span class="pname">' + o.item + '</span><span><span class="price">' + won(o.sale) + '</span> <span class="was">' + won(o.price) + '</span></span>' +
        '<span class="badge">' + picks[p].score + '점 · 자세히 보기</span></button>';
    }
    if (picks.length === 0) html += '<p class="lead">맡긴 범위에 맞는 상품이 없어요. 범위를 넓혀 보세요.</p>';
    html += '</div><h3 style="margin-top:24px">제외된 상품과 이유</h3><table><tr><th>가게</th><th>상품</th><th>이유</th></tr>';
    for (var x = 0; x < res.ranked.length; x++) {
      if (res.ranked[x].excluded) html += '<tr class="out"><td>' + res.ranked[x].offer.shopName + '</td><td>' + res.ranked[x].offer.item + '</td><td>' + res.ranked[x].excluded + '</td></tr>';
    }
    html += '</table><button type="button" class="ghost" id="editBtn">' + PENCIL + ' 맡긴 범위 다시 고치기</button>';
    app.innerHTML = html;
    var btns = app.querySelectorAll('[data-pick]');
    for (var b = 0; b < btns.length; b++) btns[b].onclick = function () { buyerDetail(Number(this.getAttribute('data-pick'))); };
    document.getElementById('editBtn').onclick = buyerStart;
  });
}

// ③ 순위별 상세: 퇴근길 위 가게 위치 + 고른 이유 + 승인
function buyerDetail(idx) {
  var r = picks[idx], o = r.offer;
  var dec = Engine.decide(r, lastBuyer.user);
  var tabs = '<div class="tabs" role="tablist">';
  for (var t = 0; t < picks.length; t++) {
    tabs += '<button type="button" role="tab" class="tab' + (t === idx ? ' on' : '') + '" data-tab="' + t + '" aria-selected="' + (t === idx) + '">' + (t + 1) + '순위 · ' + picks[t].offer.shopName + '</button>';
  }
  tabs += '</div>';
  var html = steps(BUYER_STEPS, 2) + tabs +
    '<div class="detail"><div>' + mapSvg(null, o.shopId) +
    '<p class="small">주황 선이 퇴근길에서 ' + o.shopName + '로 빠지는 길이에요 · ' + o.detourMin + '분 더 걸려요</p></div>' +
    '<div class="dark appear" style="margin:0"><p class="small">18:21 · 지하철에서 받은 알림</p>' +
    '<p style="font-size:20px;font-weight:800;margin:4px 0">' + o.item + '</p>' +
    '<p class="small">' + o.shopName + ' · 마감 ' + o.closeAt + ' · 남은 수량 ' + o.left + '개</p>' +
    '<div><span class="price" style="font-size:28px;font-weight:800">' + won(o.sale) + '</span> <span class="was">' + won(o.price) + '</span> <span class="badge">' + r.score + '점</span></div>' +
    '<ul class="reasons" aria-label="고른 이유">';
  for (var q = 0; q < r.reasons.length; q++) html += '<li><span>' + r.reasons[q].label + '</span>' + r.reasons[q].text + '<em>+' + r.reasons[q].point + '</em></li>';
  html += '</ul><p class="small">' + dec.message + ' · 지갑 잔액 ' + won(lastBuyer.user.wallet) + '</p>' +
    '<div class="actions"><button type="button" class="primary" id="payBtn">' + won(o.sale) + ' 결제 승인</button>' +
    '<button type="button" class="ghost" id="backBtn">추천 목록으로</button></div></div></div>';
  app.innerHTML = html;
  var tb = app.querySelectorAll('[data-tab]');
  for (var k = 0; k < tb.length; k++) tb[k].onclick = function () { buyerDetail(Number(this.getAttribute('data-tab'))); };
  document.getElementById('payBtn').onclick = function () { buyerPaid(o); };
  document.getElementById('backBtn').onclick = buyerRank;
}

// ④ 픽업과 서비스: 길찾기, 결제 취소, 환불·문의, 가게 연락, 영수증
function buyerPaid(offer) {
  api('pay', { offer: offer }).then(function (r) {
    var shop = null;
    for (var i = 0; i < Engine.SHOPS.length; i++) if (Engine.SHOPS[i].id === offer.shopId) shop = Engine.SHOPS[i];
    app.innerHTML = steps(BUYER_STEPS, 3) +
      '<div class="detail"><div class="dark appear" style="margin:0">' +
      '<p class="small">결제 완료 · ' + r.settledTo + '</p><h2 style="color:var(--paper)">19:05에 가게 앞에서 보여 주세요</h2>' +
      '<div class="qr" role="img" aria-label="픽업 QR 코드">' + qrSvg() + '</div>' +
      '<p>픽업 코드 <b>' + r.pickupCode + '</b> · ' + offer.item + '</p>' +
      '<p class="small">에이전트 지갑에서 ' + won(r.paid) + ' 결제 · 남은 한도 ' + won(r.walletLeft) + '<br>사장님께 바로 정산 · 단골 포인트 ' + r.points + 'P 적립<br>안 찾아가면 자동 처리, 가게 사정이면 자동 환불</p></div>' +
      '<div><div class="services">' +
      '<button type="button" class="svc" data-svc="route">길찾기</button>' +
      '<button type="button" class="svc" data-svc="time">픽업 시간 변경</button>' +
      '<button type="button" class="svc" data-svc="call">가게 연락처</button>' +
      '<button type="button" class="svc" data-svc="receipt">영수증 보기</button>' +
      '<button type="button" class="svc" data-svc="cancel">결제 취소</button>' +
      '<button type="button" class="svc" data-svc="ask">환불 · 문의</button>' +
      '</div><div id="svcPanel" class="slip" aria-live="polite">' + routePanel(shop, offer) + '</div></div></div>' +
      '<div class="actions" style="max-width:360px;margin-top:18px"><button type="button" class="ghost" id="toOwner">사장님 쪽도 보기</button><button type="button" class="primary" id="homeAgain">처음으로</button></div>';

    var panel = document.getElementById('svcPanel');
    var cancelled = false;
    var svcs = app.querySelectorAll('[data-svc]');
    for (var s = 0; s < svcs.length; s++) {
      svcs[s].onclick = function () {
        var k = this.getAttribute('data-svc');
        if (k === 'route') panel.innerHTML = routePanel(shop, offer);
        if (k === 'time') {
          panel.innerHTML = '<h3>픽업 시간 변경</h3><p class="small">가게 마감 ' + offer.closeAt + ' 전까지 바꿀 수 있어요.</p>' +
            '<div class="row"><label for="newTime">새 픽업 시간</label><input id="newTime" type="time" value="19:05" max="' + offer.closeAt + '"></div>' +
            '<button type="button" class="primary" id="saveTime">사장님께 변경 요청</button>';
          document.getElementById('saveTime').onclick = function () {
            panel.innerHTML += '<p class="done-msg">' + document.getElementById('newTime').value + '로 변경 요청을 보냈어요. 사장님 에이전트가 확인하면 알려 드릴게요.</p>';
            this.disabled = true;
          };
        }
        if (k === 'call') panel.innerHTML = '<h3>' + offer.shopName + '</h3><div class="row"><span>전화번호</span><b>02-000-0000 시연용</b></div><div class="row"><span>마감 시간</span><b>' + offer.closeAt + '</b></div><div class="row"><span>위치</span><b>퇴근길에서 ' + offer.detourMin + '분</b></div>';
        if (k === 'receipt') panel.innerHTML = '<h3>영수증</h3><div class="row"><span>' + offer.item + '</span><b>' + won(offer.price) + '</b></div><div class="row"><span>마감 할인</span><b>-' + won(offer.price - offer.sale) + '</b></div><div class="row"><span>결제 수단</span><b>에이전트 지갑</b></div><div class="row"><span>결제 금액</span><b>' + won(r.paid) + '</b></div><div class="row"><span>적립 포인트</span><b>' + r.points + 'P</b></div>';
        if (k === 'cancel') {
          if (cancelled) { panel.innerHTML = '<h3>결제 취소</h3><p>이미 취소된 주문이에요.</p>'; return; }
          panel.innerHTML = '<h3>결제 취소</h3><p class="small">픽업 전이라 바로 취소할 수 있어요. 금액은 에이전트 지갑으로 즉시 돌아가고, 상품은 다른 손님에게 다시 제안돼요.</p><button type="button" class="primary" id="doCancel">' + won(r.paid) + ' 결제 취소</button>';
          document.getElementById('doCancel').onclick = function () {
            var c = local('cancel', { paid: r.paid, offer: offer });
            cancelled = true;
            panel.innerHTML = '<h3>취소 완료</h3><p class="done-msg">' + won(c.refunded) + '을 에이전트 지갑으로 돌려받았어요. 남은 한도 ' + won(c.walletLeft) + '</p>';
          };
        }
        if (k === 'ask') {
          panel.innerHTML = '<h3>환불 · 문의</h3><div class="row"><label for="askType">유형</label><select id="askType"><option>상품 상태가 이상해요</option><option>가게가 문을 닫았어요</option><option>수량이 달라요</option><option>기타 문의</option></select></div>' +
            '<label for="askText" class="small">내용</label><textarea id="askText" rows="3" placeholder="예: 픽업했는데 계란말이가 빠져 있었어요"></textarea>' +
            '<button type="button" class="primary" id="sendAsk">문의 접수</button>';
          document.getElementById('sendAsk').onclick = function () {
            panel.innerHTML = '<h3>접수됐어요</h3><p class="done-msg">' + document.getElementById('askType').value + ' 문의가 접수됐어요. 가게 사정으로 판매가 어려운 경우는 결제 조건에 따라 자동 환불돼요.</p>';
          };
        }
      };
    }
    document.getElementById('toOwner').onclick = ownerStart;
    document.getElementById('homeAgain').onclick = home;
  });
}

// 길찾기 안내 (시연용 약도와 단계 안내)
function routePanel(shop, offer) {
  return '<h3>길찾기</h3>' + mapSvg(null, shop.id) +
    '<ol class="route-steps"><li>18:20 회사에서 출발</li><li>지하철역 근처에서 퇴근길을 벗어나 ' + offer.shopName + '로 · ' + offer.detourMin + '분</li><li>가게 앞에서 픽업 QR 보여 주기</li><li>다시 퇴근길로 돌아와 19:05쯤 집 도착</li></ol>' +
    '<p class="small">실제 서비스에서는 지도 앱 길안내와 연결됩니다.</p>';
}

// 픽업 QR 모양 (시연용 무늬, 실제로 스캔되지 않습니다)
function qrSvg() {
  var html = '<svg viewBox="0 0 21 21">';
  for (var y = 0; y < 21; y++) {
    for (var x = 0; x < 21; x++) {
      var corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      var on = false;
      if (corner) {
        var cx = x > 13 ? x - 14 : x;
        var cy = y > 13 ? y - 14 : y;
        on = cx === 0 || cx === 6 || cy === 0 || cy === 6 || (cx > 1 && cx < 5 && cy > 1 && cy < 5);
      } else {
        on = ((x * 7 + y * 13 + x * y) % 5) < 2;
      }
      if (on) html += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#1C1A17"/>';
    }
  }
  return html + '</svg>';
}

document.getElementById('homeBtn').onclick = home;
home();

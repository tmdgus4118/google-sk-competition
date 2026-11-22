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
var BUYER_STEPS = ['내 퇴근길과 맡길 범위', '에이전트 추천', '승인 한 번', '픽업'];
var settings = null; // 사용자가 화면에서 고친 맡긴 범위

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

// 평소 퇴근길과 가게 위치를 그린 지도 (시연용 약도)
function mapSvg(ranked) {
  var R = Engine.ROUTE;
  var svg = '<svg viewBox="0 0 600 270" class="map" role="img" aria-label="평소 퇴근길과 마감 상품이 있는 가게 위치">';
  svg += '<rect width="600" height="270" fill="#EFE7D6"/>';
  for (var g = 1; g < 6; g++) svg += '<line x1="' + g * 100 + '" y1="0" x2="' + g * 100 + '" y2="270" stroke="#E2D8C3"/>';
  svg += '<polyline points="' + R[0].x + ',' + R[0].y + ' ' + R[1].x + ',' + R[1].y + ' ' + R[2].x + ',' + R[2].y + '" fill="none" stroke="#1F3D2E" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 12"/>';
  for (var i = 0; i < R.length; i++) {
    svg += '<circle cx="' + R[i].x + '" cy="' + R[i].y + '" r="8" fill="#1F3D2E"/>';
    svg += '<text x="' + R[i].x + '" y="' + (R[i].y + 26) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#1F3D2E">' + R[i].label + '</text>';
  }
  for (var j = 0; j < Engine.SHOPS.length; j++) {
    var shop = Engine.SHOPS[j];
    var state = 'none';
    if (ranked) {
      for (var k = 0; k < ranked.length; k++) {
        if (ranked[k].offer.shopId !== shop.id) continue;
        if (!ranked[k].excluded && ranked[k].rank <= 3) state = 'top';
        else if (!ranked[k].excluded && state !== 'top') state = 'ok';
        else if (state === 'none') state = 'out';
      }
    }
    var color = state === 'top' ? '#E2622B' : (state === 'ok' ? '#2E5642' : (state === 'out' ? '#A9A291' : '#5A564C'));
    svg += '<circle cx="' + shop.x + '" cy="' + shop.y + '" r="11" fill="' + color + '" stroke="#FBF8F1" stroke-width="3"/>';
    svg += '<text x="' + (shop.x + 16) + '" y="' + (shop.y + 5) + '" font-size="13" fill="#1C1A17">' + shop.name + ' · ' + shop.detourMin + '분</text>';
  }
  svg += '</svg>';
  var legend = ranked ? '<p class="small">주황 추천 3순위 안 · 녹색 후보 · 회색 제외 · 숫자는 퇴근길에서 더 걸리는 시간</p>' : '<p class="small">평소 퇴근길 18:20 회사 출발 → 19:05 집 도착 · 숫자는 퇴근길에서 더 걸리는 시간</p>';
  return svg + legend;
}

function buyerStart() {
  if (!settings) settings = defaultSettings();
  var st = settings;
  var allergens = ['땅콩', '새우', '우유'];
  var chk = '';
  for (var i = 0; i < allergens.length; i++) {
    chk += '<label><input type="checkbox" name="avoid" value="' + allergens[i] + '"' + (st.avoid.indexOf(allergens[i]) >= 0 ? ' checked' : '') + '> ' + allergens[i] + '</label>';
  }
  var dataNames = { route: '출퇴근 시간과 동선', search: '검색 기록', buy: '구매 이력', pay: '결제 이력' };
  var dchk = '';
  for (var key in dataNames) {
    dchk += '<label><input type="checkbox" name="data" value="' + key + '"' + (st.data[key] ? ' checked' : '') + '> ' + dataNames[key] + '</label>';
  }
  app.innerHTML = steps(BUYER_STEPS, 0) +
    '<h2>지은 님의 평소 퇴근길</h2>' + mapSvg(null) +
    '<form id="setForm" class="slip appear" style="margin-top:16px"><h3>에이전트에게 맡긴 범위 · 직접 고칠 수 있어요</h3>' +
    '<div class="row"><label for="budget">한 번에 결제 한도</label><span><input id="budget" type="number" min="1000" step="500" value="' + st.budgetPerOrder + '"> 원</span></div>' +
    '<div class="row"><label for="detour">퇴근길에서 돌아가도 되는 시간</label><span><input id="detour" type="number" min="0" max="15" value="' + st.maxDetourMin + '"> 분까지</span></div>' +
    '<div class="row"><label for="arrive">평소 도착 시간</label><span><input id="arrive" type="time" value="' + st.arriveAt + '"></span></div>' +
    '<div class="row"><span>못 먹는 재료</span><span class="chips light">' + chk + '</span></div>' +
    '<div class="row"><span>에이전트가 써도 되는 데이터</span><span class="chips light">' + dchk + '</span></div>' +
    '<p class="small">검색, 구매, 결제 이력을 모두 끄면 식습관을 모르는 상태로 추천해요.</p>' +
    '<button type="submit" class="primary" style="margin-top:10px">이 범위로 18:20 퇴근 시작</button></form>';
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

function buyerRank() {
  api('buyer', { reset: true, now: '18:20', settings: settings }).then(function (res) {
    var rank = 0;
    for (var i = 0; i < res.ranked.length; i++) {
      if (!res.ranked[i].excluded) { rank++; res.ranked[i].rank = rank; }
    }
    var picks = [];
    for (var k = 0; k < res.ranked.length && picks.length < 3; k++) if (!res.ranked[k].excluded) picks.push(res.ranked[k]);

    var html = steps(BUYER_STEPS, 1) + '<h2>오늘 퇴근길 추천 ' + picks.length + '개</h2>' +
      '<p class="lead">동네 마감 상품 ' + res.offers.length + '개를 맡긴 범위로 거르고, 식습관 40 · 동선 25 · 할인 20 · 단골 15로 점수를 매겼어요. 마음에 드는 걸 골라 승인하세요.</p>' +
      mapSvg(res.ranked) + '<div class="picks">';
    for (var p = 0; p < picks.length; p++) {
      var r = picks[p], o = r.offer;
      var dec = Engine.decide(r, res.user);
      html += '<div class="dark pick appear"><p class="small">' + (p + 1) + '순위 · ' + o.shopName + ' · 퇴근길에서 ' + o.detourMin + '분 더 · 마감 ' + o.closeAt + '</p>' +
        '<p style="font-size:19px;font-weight:800;margin:4px 0">' + o.item + '</p>' +
        '<div><span class="price">' + won(o.sale) + '</span> <span class="was">' + won(o.price) + '</span> <span class="badge">' + r.score + '점</span></div>' +
        '<ul class="reasons" aria-label="고른 이유">';
      for (var q = 0; q < r.reasons.length; q++) html += '<li><span>' + r.reasons[q].label + '</span>' + r.reasons[q].text + '<em>+' + r.reasons[q].point + '</em></li>';
      html += '</ul><p class="small">' + dec.message + '</p><button type="button" class="primary" data-pick="' + p + '">' + won(o.sale) + ' 결제 승인</button></div>';
    }
    if (picks.length === 0) html += '<p class="lead">맡긴 범위에 맞는 상품이 없어요. 범위를 넓혀 보세요.</p>';
    html += '</div><h3 style="margin-top:24px">제외된 상품과 이유</h3><table><tr><th>가게</th><th>상품</th><th>이유</th></tr>';
    for (var x = 0; x < res.ranked.length; x++) {
      if (res.ranked[x].excluded) html += '<tr class="out"><td>' + res.ranked[x].offer.shopName + '</td><td>' + res.ranked[x].offer.item + '</td><td>' + res.ranked[x].excluded + '</td></tr>';
    }
    html += '</table><button type="button" class="ghost" id="editBtn">맡긴 범위 다시 고치기</button>';
    app.innerHTML = html;
    var btns = app.querySelectorAll('[data-pick]');
    for (var b = 0; b < btns.length; b++) {
      btns[b].onclick = function () { buyerPaid(picks[Number(this.getAttribute('data-pick'))].offer); };
    }
    document.getElementById('editBtn').onclick = buyerStart;
  });
}

function buyerPaid(offer) {
  api('pay', { offer: offer }).then(function (r) {
    app.innerHTML = steps(BUYER_STEPS, 3) + '<div class="dark appear">' +
      '<p class="small">결제 완료 · ' + r.settledTo + '</p><h2 style="color:var(--paper)">19:05에 가게 앞에서 보여 주세요</h2>' +
      '<div class="qr" role="img" aria-label="픽업 QR 코드">' + qrSvg() + '</div>' +
      '<p>픽업 코드 <b>' + r.pickupCode + '</b></p>' +
      '<p class="small">에이전트 지갑에서 ' + won(r.paid) + ' 결제 · 남은 한도 ' + won(r.walletLeft) + '<br>사장님께 바로 정산 · 단골 포인트 ' + r.points + 'P 적립<br>안 찾아가면 자동 처리, 가게 사정이면 자동 환불</p>' +
      '<div class="actions" style="max-width:360px"><button type="button" class="ghost" id="toOwner">사장님 쪽도 보기</button><button type="button" class="primary" id="homeAgain">처음으로</button></div></div>';
    document.getElementById('toOwner').onclick = ownerStart;
    document.getElementById('homeAgain').onclick = home;
  });
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

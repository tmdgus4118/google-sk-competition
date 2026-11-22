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
var BUYER_STEPS = ['맡길 범위와 데이터', '에이전트가 고르기', '승인 한 번', '픽업'];

function buyerStart() {
  var u = Engine.freshUser();
  app.innerHTML = steps(BUYER_STEPS, 0) +
    '<h2>지은 님이 에이전트에게 맡긴 것</h2>' +
    '<div class="dark appear">' +
    '<p class="small">쓸 데이터는 직접 고르고 언제든 끌 수 있어요</p>' +
    '<div class="chips"><label><input type="checkbox" checked> 출퇴근 시간과 동선</label><label><input type="checkbox" checked> 검색 기록</label><label><input type="checkbox" checked> 구매 이력</label><label><input type="checkbox" checked> 결제 이력</label></div>' +
    '<div class="slip" style="color:var(--ink);margin:12px 0 0"><h3>맡긴 범위</h3>' +
    '<div class="row"><span>한 번에 결제 한도</span><b>' + won(u.budgetPerOrder) + '</b></div>' +
    '<div class="row"><span>퇴근길에서 돌아가도 되는 시간</span><b>' + u.maxDetourMin + '분까지</b></div>' +
    '<div class="row"><span>평소 도착 시간</span><b>' + u.arriveAt + '</b></div>' +
    '<div class="row"><span>못 먹는 재료</span><b>' + u.avoid.join(', ') + '</b></div>' +
    '<div class="row"><span>에이전트 지갑 이번 주 한도</span><b>' + won(u.wallet) + '</b></div>' +
    '<div class="row"><span>파악된 식습관</span><b>반찬 90% · 빵 60% · 만두 50%</b></div></div></div>' +
    '<button type="button" class="primary" id="goBtn">18:20 퇴근 시작</button>';
  document.getElementById('goBtn').onclick = buyerRank;
}

function buyerRank() {
  api('buyer', { reset: true, now: '18:20' }).then(function (res) {
    var html = steps(BUYER_STEPS, 1) + '<h2>동네 마감 상품 ' + res.offers.length + '개를 살펴봤어요</h2>' +
      '<p class="lead">1단계 맡긴 범위로 거르고, 2단계 식습관 40 · 동선 25 · 할인 20 · 단골 15로 점수를 매겼어요.</p>' +
      '<table><tr><th>가게</th><th>상품</th><th>마감가</th><th>결과</th><th>점수</th></tr>';
    for (var i = 0; i < res.ranked.length; i++) {
      var r = res.ranked[i];
      var cls = r.excluded ? 'out' : (i === 0 ? 'top' : '');
      html += '<tr class="' + cls + ' appear"><td>' + r.offer.shopName + '</td><td>' + r.offer.item + '</td><td>' + won(r.offer.sale) + '</td><td>' + (r.excluded ? '제외 · ' + r.excluded : (i === 0 ? '1순위 추천' : '후보')) + '</td><td class="score">' + (r.excluded ? '-' : r.score) + '</td></tr>';
    }
    html += '</table><button type="button" class="primary" id="nextBtn">1순위 확인하기</button>';
    app.innerHTML = html;
    document.getElementById('nextBtn').onclick = function () { buyerApprove(res); };
  });
}

function buyerApprove(res) {
  var top = res.ranked[0];
  var o = top.offer;
  var html = steps(BUYER_STEPS, 2) + '<div class="dark appear">' +
    '<p class="small">18:21 · 지하철에서 받은 알림</p><h2 style="color:var(--paper)">퇴근길에 하나 잡아 뒀어요</h2>' +
    '<div class="offer"><p class="small" style="margin:0">' + o.shopName + ' · 퇴근길에서 ' + o.detourMin + '분 더 · 마감 ' + o.closeAt + '</p>' +
    '<p style="font-size:20px;font-weight:800;margin:4px 0">' + o.item + '</p>' +
    '<span class="price">' + won(o.sale) + '</span><span class="was">' + won(o.price) + '</span>' +
    '<ul class="reasons" aria-label="고른 이유">';
  for (var i = 0; i < top.reasons.length; i++) {
    var r = top.reasons[i];
    html += '<li><span>' + r.label + '</span>' + r.text + '<em>+' + r.point + '</em></li>';
  }
  html += '</ul></div><p class="small">' + res.decision.message + ' · 지갑 잔액 ' + won(res.user.wallet) + '</p>' +
    '<div class="actions"><button type="button" class="primary" id="payBtn">' + won(o.sale) + ' 결제 승인</button><button type="button" class="ghost" id="skipBtn">이번엔 건너뛰기</button></div></div>';
  app.innerHTML = html;
  document.getElementById('payBtn').onclick = function () { buyerPaid(o); };
  document.getElementById('skipBtn').onclick = function () {
    app.innerHTML = '<div class="dark appear"><h2 style="color:var(--paper)">건너뛰었어요</h2><p class="small">예약을 풀고 다른 손님에게 넘겼어요. 내일 퇴근길에 다시 찾아볼게요.</p><button type="button" class="primary" id="homeAgain">처음으로</button></div>';
    document.getElementById('homeAgain').onclick = home;
  };
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

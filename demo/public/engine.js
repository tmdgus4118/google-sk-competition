// 퇴근길 마감 에이전트 엔진
// 서버(Node)와 브라우저가 같은 파일을 씁니다.
// 서버가 꺼져 있어도 브라우저에서 같은 로직으로 데모가 돌아갑니다.

(function (root) {

  // 동네 가게 예시 데이터 (시연용)
  var SHOPS = [
    {
      id: 'banchan', name: '정다운 반찬', type: '반찬', closeAt: '20:00', detourMin: 3,
      items: [
        { name: '멸치볶음 + 계란말이', price: 9000, left: 3, allergens: [] },
        { name: '잡채', price: 6000, left: 2, allergens: [] }
      ],
      floorRate: 0.55 // 정가의 55% 아래로는 안 팔기
    },
    {
      id: 'bakery', name: '아침빵집', type: '빵', closeAt: '21:00', detourMin: 2,
      items: [
        { name: '소금빵 3개', price: 7500, left: 4, allergens: [] },
        { name: '땅콩 크림빵', price: 4000, left: 3, allergens: ['땅콩'] }
      ],
      floorRate: 0.5
    },
    {
      id: 'mandu', name: '골목 손만두', type: '만두', closeAt: '19:30', detourMin: 9,
      items: [
        { name: '고기만두 1판', price: 8000, left: 5, allergens: [] }
      ],
      floorRate: 0.6
    }
  ];

  // 지은 씨가 동의한 데이터로 만든 식습관 프로필 (시연용)
  var USER = {
    name: '지은',
    budgetPerOrder: 10000,      // 한 번에 맡긴 한도
    maxDetourMin: 5,            // 퇴근길에서 최대 몇 분까지 돌아가도 되나
    arriveAt: '19:05',          // 평소 퇴근 동선상 도착 시간
    avoid: ['땅콩'],            // 못 먹는 재료
    habits: { '반찬': 0.9, '빵': 0.6, '만두': 0.5 }, // 검색·구매·결제 이력에서 본 선호도 0~1
    visits: { banchan: 2, bakery: 0, mandu: 1 },     // 가게별 방문 횟수
    recentItems: ['잡채'],      // 최근 사흘 안에 산 메뉴
    wallet: 30000               // 이번 주 에이전트 지갑 한도
  };

  // 사장님 화면 시연용 다른 손님들
  var BUYERS = [
    USER,
    { name: '민수', budgetPerOrder: 8000, maxDetourMin: 4, arriveAt: '19:20', avoid: [],
      habits: { '반찬': 0.3, '빵': 0.9, '만두': 0.7 }, visits: { bakery: 3 }, recentItems: [], wallet: 20000 },
    { name: '하린', budgetPerOrder: 12000, maxDetourMin: 6, arriveAt: '18:50', avoid: [],
      habits: { '반찬': 0.7, '빵': 0.4, '만두': 0.9 }, visits: { banchan: 1, mandu: 2 }, recentItems: [], wallet: 25000 }
  ];

  // 추천 점수 비율
  var WEIGHTS = { habit: 40, detour: 25, discount: 20, regular: 15 };

  // "19:05" 같은 시간을 분으로 바꿉니다
  function toMin(t) {
    var p = t.split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  // 1. 판매자 에이전트: 남은 수량과 마감까지 남은 시간으로 할인율을 정합니다
  function priceOffers(shop, now) {
    var minutesLeft = toMin(shop.closeAt) - toMin(now);
    var rate = 0.2;
    if (minutesLeft <= 120) rate = 0.3;
    if (minutesLeft <= 60) rate = 0.4;

    var offers = [];
    for (var i = 0; i < shop.items.length; i++) {
      var item = shop.items[i];
      var r = rate;
      if (item.left >= 4) r = r + 0.05; // 많이 남았으면 조금 더 깎습니다
      var sale = Math.round(item.price * (1 - r) / 100) * 100;
      var floor = Math.round(item.price * shop.floorRate / 100) * 100;
      if (sale < floor) sale = floor; // 사장님이 정한 최저가 아래로는 안 내려갑니다
      offers.push({
        shopId: shop.id, shopName: shop.name, type: shop.type, closeAt: shop.closeAt,
        detourMin: shop.detourMin, item: item.name, allergens: item.allergens,
        price: item.price, sale: sale, left: item.left,
        discountRate: Math.round((1 - sale / item.price) * 100) / 100
      });
    }
    return offers;
  }

  // 2. 구매자 에이전트: 맡긴 범위로 거르고, 남은 후보에 점수를 매깁니다
  function rankOffers(offers, user) {
    var result = [];
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      var reasons = [];

      // 1단계: 거르기
      var excluded = '';
      if (o.sale > user.budgetPerOrder) excluded = '한도 ' + user.budgetPerOrder.toLocaleString() + '원 초과';
      else if (o.detourMin > user.maxDetourMin) excluded = '퇴근길에서 ' + o.detourMin + '분 돌아감';
      else if (toMin(user.arriveAt) >= toMin(o.closeAt)) excluded = '도착 전에 가게가 닫음';
      else if (hasAny(o.allergens, user.avoid)) excluded = '못 먹는 재료 포함';
      else if (user.recentItems.indexOf(o.item) >= 0) excluded = '최근 사흘 안에 산 메뉴';

      if (excluded) {
        result.push({ offer: o, excluded: excluded, score: 0 });
        continue;
      }

      // 2단계: 점수 매기기
      var habit = (user.habits[o.type] || 0) * WEIGHTS.habit;
      var detour = (1 - o.detourMin / user.maxDetourMin) * WEIGHTS.detour;
      var discount = Math.min(o.discountRate / 0.5, 1) * WEIGHTS.discount;
      var visits = user.visits[o.shopId] || 0;
      var regular = Math.min(visits / 3, 1) * WEIGHTS.regular;
      var score = Math.round(habit + detour + discount + regular);

      reasons.push({ label: '식습관', text: o.type + ' 선호 ' + Math.round(user.habits[o.type] * 100) + '%', point: Math.round(habit) });
      reasons.push({ label: '동선', text: '퇴근길에서 ' + o.detourMin + '분 더', point: Math.round(detour) });
      reasons.push({ label: '할인', text: '정가 대비 ' + Math.round(o.discountRate * 100) + '% 할인', point: Math.round(discount) });
      reasons.push({ label: '단골', text: visits > 0 ? visits + '번 방문한 가게' : '처음 가는 가게', point: Math.round(regular) });

      result.push({ offer: o, excluded: '', score: score, reasons: reasons });
    }

    // 점수 높은 순으로 정렬 (제외된 후보는 맨 뒤)
    result.sort(function (a, b) { return b.score - a.score; });
    return result;
  }

  // 3단계: 사람에게 물어야 하는지 정합니다
  function decide(ranked, user) {
    var visits = user.visits[ranked.offer.shopId] || 0;
    if (ranked.offer.sale > user.wallet) return { mode: 'blocked', message: '지갑 잔액이 부족해요' };
    if (visits === 0) return { mode: 'ask', message: '처음 가는 가게라 한 번 더 확인할게요' };
    return { mode: 'one_tap', message: '맡긴 범위 안이라 승인 한 번이면 돼요' };
  }

  // 결제: 에이전트 지갑에서 빠지고 사장님께 바로 정산됩니다
  function pay(offer, user) {
    if (offer.sale > user.wallet) return { ok: false, message: '지갑 잔액 부족' };
    user.wallet = user.wallet - offer.sale;
    user.visits[offer.shopId] = (user.visits[offer.shopId] || 0) + 1;
    return {
      ok: true,
      paid: offer.sale,
      walletLeft: user.wallet,
      settledTo: offer.shopName,
      pickupCode: 'TG-' + Math.floor(1000 + Math.random() * 9000),
      points: Math.round(offer.sale / 100)
    };
  }

  function hasAny(list, avoid) {
    for (var i = 0; i < list.length; i++) {
      if (avoid.indexOf(list[i]) >= 0) return true;
    }
    return false;
  }

  // 사장님 흐름: 한 가게의 마감 상품을 내보내면 손님 에이전트들이 각자 골라 예약합니다
  function sellerFlow(shopId, now) {
    var shop = null;
    for (var i = 0; i < SHOPS.length; i++) if (SHOPS[i].id === shopId) shop = SHOPS[i];
    var offers = priceOffers(shop, now);
    var left = {};
    for (var j = 0; j < offers.length; j++) left[offers[j].item] = offers[j].left;

    var reservations = [];
    var buyers = JSON.parse(JSON.stringify(BUYERS));
    for (var b = 0; b < buyers.length; b++) {
      var buyer = buyers[b];
      buyer.maxDetourMin = Math.max(buyer.maxDetourMin, shop.detourMin); // 이 가게 근처 손님이라고 가정
      var ranked = rankOffers(offers, buyer);
      for (var k = 0; k < ranked.length; k++) {
        var r = ranked[k];
        if (r.excluded || left[r.offer.item] <= 0) continue;
        left[r.offer.item] = left[r.offer.item] - 1;
        reservations.push({ buyer: buyer.name, item: r.offer.item, sale: r.offer.sale, score: r.score, decision: decide(r, buyer) });
        break;
      }
    }
    return { shop: shop, offers: offers, reservations: reservations, left: left };
  }

  // 구매자 흐름: 동네 모든 가게의 마감 상품 중에서 내 에이전트가 고릅니다
  function buyerFlow(user, now) {
    var offers = [];
    for (var i = 0; i < SHOPS.length; i++) {
      var list = priceOffers(SHOPS[i], now);
      for (var j = 0; j < list.length; j++) offers.push(list[j]);
    }
    var ranked = rankOffers(offers, user);
    var decision = null;
    if (ranked.length > 0 && !ranked[0].excluded) decision = decide(ranked[0], user);
    return { offers: offers, ranked: ranked, decision: decision };
  }

  // 데모를 처음 상태로 돌리기 위한 복사본
  function freshUser() { return JSON.parse(JSON.stringify(USER)); }

  var api = { SHOPS: SHOPS, BUYERS: BUYERS, sellerFlow: sellerFlow, buyerFlow: buyerFlow, freshUser: freshUser, WEIGHTS: WEIGHTS, priceOffers: priceOffers, rankOffers: rankOffers, decide: decide, pay: pay };

  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node
  else root.Engine = api;                                                     // 브라우저

})(this);

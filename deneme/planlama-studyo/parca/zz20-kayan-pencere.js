/* ---------- Büyük veride kayan pencereli arama ----------
   500 iş emri / 2.639 adımda bir plan çözümü yaklaşık 60 ms sürüyor; motorun yerel araması her adayı bütün planı baştan çözerek
   ölçtüğü için 10 saniyede yüz kadar aday deneyebiliyordu, üstelik baştan çözümün kendi sapması (aynı sırayla bile birkaç saatlik
   gecikme farkı) tek hamlenin kazancını yutuyor, arama 0-1 iyileşmede kalıyordu. Adım sayısı eşiği aşınca plan zaman pencerelerine
   bölünür: pencere başından önceki işlemler olduğu gibi sabit kalır (dondurma sınırı pencere başına çekilir), aday yalnız pencere
   başından sonrası yeniden çözülerek ölçülür, hamleler yalnız penceredeki işlemlere yapılır. Pencere zamanla ilerler, plan sonuna
   gelince başa döner; konum aynı çözüm içinde çağrılar arasında korunur. Saat bir tam çözüm kadar iş birikince okunur: işçinin sabit
   adımlı saati bir okumayı bir tam çözüm sayar, böylece süre seçimi ve "aynı girdi, aynı sonuç" korunur. Eşiğin altında motorun
   kendi araması birebir çalışır. İşçide de çalışır. */
/* eşik: örnek ve yerleşik veri setleri (en çok birkaç yüz adım) eşiğin çok altında; orada tam çözüm ucuz, davranış değişmesin */
var KP_ESIK = 1000;
function kayanPencereKur() {
  if (self.__kayanP) return; self.__kayanP = 1;
  const ESIK = KP_ESIK, PENCERE = 160, GRUP = 8, DOGRULA = 2;
  const l0 = lns; const KONUM = new WeakMap(), BAS = new WeakMap();
  lns = function (st, start, ref, opt = {}) {
    const cx = (start && start.cx) || compile(st);
    if (!cx || !cx.ops || cx.ops.length < ESIK) return l0(st, start, ref, opt);
    return ara(st, start, ref, opt, cx);
  };
  function ara(st, start, ref, opt, cx) {
    const t0 = Date.now(), budget = opt.ms || 1500, maxChg = opt.maxChg == null ? Infinity : opt.maxChg;
    const R = rng(opt.seed || 17), free = opt.free != null ? !!opt.free : !ref, frz = free ? st.now : st.now + (st.w.dondurma || 0);
    const nTop = cx.ops.length;
    let cur = start, E = evaluate(cur, st, ref); const E0 = E, failN = (cur.fail || []).length;
    let dec = 0, acc = 0, is = 0, bitti = false; const log = [];
    const sure = () => { if (bitti) return true; if (is < 1) return false; is = 0; bitti = Date.now() - t0 > budget; return bitti; };
    let HT = BAS.get(cx); if (!HT) { HT = lbHeadsTails(st, cx); BAS.set(cx, HT); }
    const ok = (p, e) => (p.fail || []).length <= failN && e.chg <= maxChg;
    const pw = j => PW[cx.jobs[j].oncelik] || 1;
    /* pencere çözümü işlemleri dondurulmuş diye işaretler; asıl dondurma sınırının ötesindekiler sonraki pencerelerde yine oynar */
    const temizle = p => { for (const id in p.ops) { const r = p.ops[id]; if (r.frz && !r.act && !r.done && (free || r.S >= frz - 1e-9)) { const q = { ...r }; delete q.pin; delete q.frz; p.ops[id] = q; } } return p; };
    const hareketli = r => r && !r.act && !r.done && (free || !r.pin) && !r.fas && r.S >= frz - 1e-9 && !st.locks[r.id];
    const sira = () => Object.values(cur.ops).filter(hareketli).sort((x, y) => x.S - y.S);
    let konum = KONUM.get(cx);
    /* çözümün ilk çağrısında motor gibi plan baştan çözülür, iyileştikçe tekrarlanır: yeni veriyle yeniden kurulan plan (ör. malzeme günü değişince) bu adımlarda toparlanır */
    if (konum == null) { konum = frz; for (let k = 0; k < 6 && !sure(); k++) { const p = lnsDecode(st, cur, [], cx, free), e = evaluate(p, st, ref); dec++; is += 1; const d = cmpEv(e, E); if (ok(p, e) && d >= 0) { slack(p, cx); cur = p; E = e; } if (d <= 0) break; } }
    let bosPencere = 0, nPencere = 1;
    while (!sure()) {
      const L = sira(); if (L.length < 2) break;
      nPencere = Math.max(1, Math.ceil(L.length / (PENCERE / 2)));
      let i0 = L.findIndex(r => r.S >= konum - 1e-9); if (i0 < 0 || i0 >= L.length - 1) { i0 = 0; }
      const a = Math.max(frz, L[i0].S), b = i0 + PENCERE < L.length ? L[i0 + PENCERE].S : Infinity;
      const sonra = i0 + PENCERE / 2 < L.length ? L[Math.floor(i0 + PENCERE / 2)].S - 1e-6 : frz;
      const stW = { ...st, w: { ...st.w, dondurma: a - st.now } };
      const nFrom = Object.values(cur.ops).filter(r => r.S >= a - 1e-9).length;
      const pay = 0.15 + 0.85 * nFrom / nTop;
      const icinde = r => hareketli(r) && r.S >= a - 1e-9 && r.S < b;
      const byM = {}; for (const r of Object.values(cur.ops)) if (!r.fas) (byM[r.m] = byM[r.m] || []).push(r); for (const m in byM) byM[m].sort((x, y) => x.S - y.S);
      /* hedef konumun anahtarı: tezgâh kuyruğunda hedef zamandan sonraki ilk işin hemen önü; pencere dışına taşmaz */
      const yer = (m, id, tgt) => { const q = (byM[m] || []).filter(z => z.id !== id); let i = q.findIndex(z => z.S >= tgt - 1e-9); if (i < 0) i = q.length;
        while (i > 0 && !icinde(q[i - 1]) && q[i - 1].S >= tgt) i--;
        const lo = i > 0 ? Math.max(q[i - 1].S, a) : a, hi = i < q.length ? q[i].S : lo + 48; return i < q.length ? Math.min(hi - 1e-3, Math.max(lo, tgt)) : Math.max(lo, tgt) + 1e-3; };
      const gruplar = [];
      const gec = Object.values(E.J).filter(x => x.T > 0 && cx.jobs[x.id]).sort((x, y) => y.T * pw(y.id) - x.T * pw(x.id));
      for (const J of gec) {
        const ops = cx.jobs[J.id].ops.map(o => cur.ops[o.id]).filter(icinde); if (!ops.length) continue;
        const g = [];
        for (const v of ['ayni', 'hizli']) { const mods = [];
          for (const r of ops) { const o = cx.byId[r.id]; let m = r.m;
            if (v === 'hizli') { const ms = o.c.filter(c => !c.fas && !c.opt && (!st.pref[o.id] || st.pref[o.id] === c.m)); if (ms.length) m = ms.reduce((x, y) => y.run + y.su < x.run + x.su ? y : x).m; }
            mods.push([r.id, m, yer(m, r.id, Math.max(a, HT.head[r.id] || a))]); }
          if (v === 'hizli' && mods.every((x, k) => x[1] === ops[k].m)) continue; g.push(mods); }
        /* tek işlem: kritik işlem tezgâh kuyruğunda bir-üç sıra öne alınır */
        for (const r of ops) { if (r.sl == null || r.sl > .5) continue; const q = (byM[r.m] || []).filter(z => z.id !== r.id); let p = q.findIndex(z => z.S > r.S); if (p < 0) p = q.length;
          for (let k = p - 1; k >= Math.max(0, p - 3); k--) { if (!icinde(q[k])) break; const lo = k > 0 ? Math.max(q[k - 1].S, a) : a; g.push([[r.id, r.m, (lo + q[k].S) / 2]]); } }
        gruplar.push({ tur: 'pencere zincir', id: J.id, g });
        if (gruplar.length >= GRUP) break;
      }
      /* gecikme olmasa da ayar ve maliyet için: penceredeki rastgele bir tezgâhta ardışık üç işlemin sırası */
      const msW = Object.keys(byM).filter(m => byM[m].filter(icinde).length >= 3);
      if (msW.length) { const m = msW[Math.floor(R.u() * msW.length)]; const q = byM[m].filter(icinde); const s0 = Math.floor(R.u() * (q.length - 2)); const w = q.slice(s0, s0 + 3); const k = w.map(r => r.S);
        const g = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [1, 2, 0], [2, 0, 1]].map(p => p.map((v, i) => [w[v].id, m, k[i]])); gruplar.push({ tur: 'pencere sıra ' + m, id: w[0].id, g }); }
      /* eleme: aday önce yalnız pencere sonuna kadar çözülür (tam çözümün yedide biri kadar iş); penceredeki işlerin bitişindeki
         kayma işin bugünkü bitişine eklenir, tezgâhın pencere sonundaki kayması o tezgâhta sonra gelen geciken işlere yansıtılır.
         Tahmin yalnız ayıklar; aday pencere başından sonrası tam çözülüp motorun ölçüsüyle karşılaştırılmadan kabul edilmez. */
      const kesik = {}; for (const id in cur.ops) if (cur.ops[id].S < b) kesik[id] = cur.ops[id];
      const cxW = { ...cx, ops: cx.ops.filter(o => kesik[o.id]) }; const curW = { ...cur, ops: kesik };
      const kes = mods => { const p = lnsDecode(stW, curW, mods, cxW, false); dec++; is += 0.15; return p; };
      const Q0 = kes([]); const fail0 = (Q0.fail || []).length;
      const isW = new Set(); for (const id in kesik) { const r = kesik[id]; if (r.S >= a - 1e-9 && !r.done && !r.act) isW.add(r.job); }
      const kuyruk = {}; for (const m in byM) { let w = 0; const g = new Set(); for (const r of byM[m]) if (r.S >= b && !isW.has(r.job) && !g.has(r.job) && E.J[r.job] && E.J[r.job].T > 0) { g.add(r.job); w += pw(r.job); } kuyruk[m] = w; }
      const son = Q => { const jC = {}, mC = {}; for (const id in Q.ops) { const r = Q.ops[id]; if (isW.has(r.job) && !(jC[r.job] >= r.C)) jC[r.job] = r.C; if (!r.fas && !(mC[r.m] >= r.C)) mC[r.m] = r.C; } return { jC, mC }; };
      const s0 = son(Q0);
      const skor = Q => { const { jC, mC } = son(Q); let v = 0;
        for (const j of isW) { const J = E.J[j]; if (!J || !isFinite(J.C)) continue; const due = cx.jobs[j].due; if (due == null) continue; v += pw(j) * Math.max(0, J.C + (jC[j] || 0) - (s0.jC[j] || 0) - due); }
        for (const m in mC) if (kuyruk[m]) v += kuyruk[m] * Math.max(0, mC[m] - (s0.mC[m] || 0));
        return v; };
      const v0 = skor(Q0);
      let iyi = false;
      for (const G of gruplar) {
        const aday = [];
        for (const mods of G.g) { if (sure()) break; const Q = kes(mods); if ((Q.fail || []).length > fail0) continue; const v = skor(Q); if (v < v0 - .5) aday.push({ mods, v }); }
        aday.sort((x, y) => x.v - y.v);
        let en = null;
        for (const x of aday.slice(0, DOGRULA)) { if (sure()) break; const p = lnsDecode(stW, cur, x.mods, cx, false); dec++; is += pay + 0.1; const e = evaluate(p, st, ref, true);
          if (ok(p, e) && cmpEv(e, E) > 0 && (!en || cmpEv(e, en.e) > 0)) en = { p, e }; }
        if (en) { log.push({ tur: G.tur, id: G.id, by: lexWhy(en.e, E), dW: E.wT - en.e.wT, dChg: en.e.chg - E.chg, dSu: E.suH - en.e.suH }); cur = temizle(en.p); slack(cur, cx); E = en.e; acc++; iyi = true; break; }
        if (bitti) break;
      }
      /* iyileşen pencere bir kez daha denenir, yoksa pencere yarım boy ilerler */
      konum = iyi ? a : sonra; KONUM.set(cx, konum); is += 0.02;
      if (iyi) bosPencere = 0; else if (++bosPencere > nPencere) break;
    }
    return { plan: cur, e: evaluate(cur, st, ref), e0: E0, dec, acc, log, ms: Date.now() - t0 };
  }
}
kayanPencereKur();
ISCI_EK.push(`var KP_ESIK = ${KP_ESIK};\n${kayanPencereKur}\nkayanPencereKur();`);
/* Büyük veride ilk çözümden sonra plana bağlı girdiler değişince motor bir tur daha çözüyor (ozetTazele'nin yanındaki sarma);
   iki tur da seçilen sürenin tamamını kullanınca 10 sn seçimi 15-20 sn sürüyordu. Büyük veride ilk tur sürenin %70'ini alır,
   ardından gelen ikinci tur kalanını (en az %15); ilerleme çubuğu iki turu tek süre gibi gösterir. Eşiğin altında dokunulmaz. */
{ const c0 = coz; let zBas = 0, zSon = -1e9;
  coz = function (kip) {
    const simdi = performance.now(); const cx = calisan || kip === 'ekip' ? null : cxAl();
    if (!cx || !cx.ops || cx.ops.length < KP_ESIK) return c0.apply(this, arguments);
    const sure = +S.w.sure || 10;
    /* ikinci tur, önceki çözümün bitiş işleyicisinden 30 ms sonra istenir; kullanıcının yeni çözümü bu kadar yakın gelemez */
    const zincir = simdi - zSon < 400; if (!zincir) zBas = simdi;
    const pay = zincir ? Math.max(0.15 * sure, sure - (simdi - zBas) / 1000) : 0.7 * sure, ofs = zincir ? sure - pay : 0;
    const s0 = S.w.sure; S.w.sure = Math.round(pay * 10) / 10;
    try { c0.apply(this, arguments); } finally { S.w.sure = s0; }
    const w = calisan; if (!w) return;
    const om = w.onmessage;
    w.onmessage = e => { const m = e.data || {}, t = m.t; if (t === 'ilerleme' && ofs) m.sn = Math.min(sure, ofs + (m.sn || 0)); om(e); if (t === 'bitti' || t === 'hata') zSon = performance.now(); };
  };
}

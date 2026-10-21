/* ---------- çözüm ---------- */
const ISCI_KODU = `
self.onmessage = e => {
  const d = e.data; const t0 = Date.now();
  try {
    if (d.tur === 'bedel') {
      const bir = st => { const cx = compile(st); const p = schedule(st, 'dagit', null, { cx }); const L = lns(st, p, null, { ms: d.ms, seed: 17, free: true }); return { wT: L.e.wT, late: L.e.late, suH: L.e.suH, Cmax: L.e.Cmax }; };
      self.postMessage({ t: 'bedel-ilerleme', i: 0, n: d.liste.length + 1, ad: 'Temel plan' });
      bir(d.temel);
      const temel = bir(d.temel); const liste = [];
      d.liste.forEach((x, i) => { self.postMessage({ t: 'bedel-ilerleme', i: i + 1, n: d.liste.length + 1, ad: x.ad }); const r = bir(x.st); liste.push({ id: x.id, ...r, dW: temel.wT - r.wT }); });
      self.postMessage({ t: 'bedel-bitti', temel, liste });
      return;
    }
    const st = d.st, ms = d.ms;
    const refE = d.canli ? { ops: d.canli } : null;
    const refL = d.kip === 'onar' ? refE : null;
    const free = d.kip !== 'onar';
    const cx = compile(st);
    let cur = d.kip === 'sifir' ? schedule(st, 'dagit', null, { cx }) : lnsDecode(st, { ops: d.taban, fail: [] }, [], cx, free);
    slack(cur, cx);
    let E = evaluate(cur, st, refL, true);
    const lbx = lowerBound(st, cx); const lb = lbx.wT;
    const lbC = {}; for (const j in lbx.C) lbC[j] = isFinite(lbx.C[j]) ? lbx.C[j] : null;
    const gunluk = { kip: d.kip, ilkAd: d.kip === 'sifir' ? 'Kural tabanlı ilk plan (ATCS)' : d.kip === 'onar' ? 'Canlı plan, yeni veriyle yeniden kuruldu' : 'Mevcut plan, yeniden kuruldu', ilk: { wT: E.wT, late: E.late, suH: E.suH }, adim: [], dec: 0 };
    const ilk = E.wT;
    const bildir = () => self.postMessage({ t: 'ilerleme', kip: d.kip, sn: (Date.now() - t0) / 1000, wT: E.wT, late: E.late, n: E.n, lb, ilk, adim: gunluk.adim.length });
    bildir();
    let seed = 17, durgun = 0;
    while (Date.now() - t0 < ms && durgun < 4) {
      const kal = ms - (Date.now() - t0);
      const L = lns(st, cur, refL, { ms: Math.max(250, Math.min(1500, kal)), seed: seed++, free, maxChg: d.kip === 'onar' ? d.maxChg : null });
      gunluk.dec += L.dec;
      if (cmpEv(L.e, E) > 0) {
        let w = E.wT;
        for (const x of L.log) { w -= x.dW; if (gunluk.adim.length < 80) gunluk.adim.push({ sn: (Date.now() - t0) / 1000, tur: x.tur, id: x.id, by: x.by, dW: x.dW, dSu: x.dSu, dChg: x.dChg, wT: w }); }
        cur = L.plan; E = L.e; durgun = 0;
      } else durgun++;
      bildir();
    }
    gunluk.sn = (Date.now() - t0) / 1000;
    const k = planKaydi(cur, st, refE);
    self.postMessage({ t: 'bitti', ...k, lb, lbC, ilk, sn: gunluk.sn, gunluk });
  } catch (err) { self.postMessage({ t: 'hata', msg: String(err && err.message || err) }); }
};`;
function isciAc() {
  const src = document.getElementById('motor').textContent + '\n' + opKaydi.toString() + '\n' + planKaydi.toString() + '\n' + ISCI_KODU;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  let w;
  try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); bildir('Motor başlatılamadı: ' + e.message, 'hata'); return null; }
  w.bitir = () => { w.terminate(); URL.revokeObjectURL(url); calisan = null; U.ilerleme = null; };
  w.onerror = e => { w.bitir(); render(); bildir('Motor hatası: ' + (e.message || 'bilinmiyor'), 'hata'); };
  return w;
}
function coz(kip) {
  if (!yetkili('plan.yaz')) { bildir('Yetkiniz yok (plan.yaz).', 'hata'); return; }
  if (calisan) return;
  if (kip === 'ekip') { ekipCoz(); return; }
  const canli = canliSen();
  if (kip !== 'sifir' && !S.plan) kip = 'sifir';
  if (kip === 'onar' && !(canli && canli.plan)) { bildir('Onarım için canlı plan gerekir.', 'hata'); return; }
  const bul = denetimBulgulari().filter(b => ['personel', 'tezgah', 'hata'].includes(b.k));
  const w = isciAc(); if (!w) return;
  calisan = w; U.cozAcik = false; U.hamle = null; U.kipCoz = kip;
  const st = dengeKilit(stOf()); const dv = S.dataVer;
  const taban = kip === 'onar' ? canli.plan.ops : kip === 'iyilestir' ? S.plan.ops : null;
  U.ilerleme = { kip, sn: 0, wT: null, late: 0, n: S.D.siparisler.length, lb: null, ilk: null };
  render();
  if (bul.length) bildir(`Veri denetiminde ${bul.length} ciddi bulgu var; bazı işler yerleşmeyebilir.`, 'hata', { metin: 'Denetim', act: 'git-denetim' });
  w.onmessage = e => {
    const m = e.data;
    if (m.t === 'ilerleme') { U.ilerleme = m; const el = document.querySelector('.pm-ilerleme'); if (el) el.outerHTML = ilerlemeHtml(); else render(); return; }
    w.bitir();
    if (m.t === 'hata') { render(); bildir('Çözüm hatası: ' + m.msg, 'hata'); return; }
    delete m.t;
    /* Kod çözücü mevcut planı birebir yeniden kuramayabilir; iyileştirme ya da onarım mevcut plandan kötü biterse plan değişmez. */
    if (kip !== 'sifir' && S.plan && planGuncel() && m.ozet.wT > S.plan.ozet.wT + 0.05) {
      render(); bildir(`${KIP_AD[kip]}: bulunan plan (${saat(m.ozet.wT)}) mevcut planı (${saat(S.plan.ozet.wT)}) geçemedi; plan aynı kaldı.`, 'hata');
      return;
    }
    if (S.plan) { planGeri.push({ plan: S.plan, locks: S.locks, guncel: planGuncel() }); if (planGeri.length > 20) planGeri.shift(); }
    const once = S.plan ? S.plan.ozet : null;
    S.plan = { ...m, dataVer: dv === S.dataVer ? dv : -1, kim: kim().ad, zaman: Date.now(), kaynak: kip, oncekiOzet: once, kapali: S.kapali.slice() };
    iz('Plan çözüldü', `${KIP_AD[kip]} · gecikme ${sayi(m.ozet.wT, 1)} sa, geciken ${m.ozet.late}/${m.ozet.n}, ${sayi(m.sn, 1)} sn${S.kapali.length ? ' · kapalı kısıt: ' + kapaliAdlar().join(', ') : ''}`);
    kaydet(); render();
    bildir(`Plan hazır: ağırlıklı gecikme ${saat(m.ozet.wT)} (başlangıç ${saat(m.ilk)}).`, 'tamam', once ? { metin: 'Geri al', act: 'plan-geri' } : undefined);
  };
  w.postMessage({ st, ms: (+S.w.sure || 10) * 1000, kip, taban, canli: canli && canli.plan ? canli.plan.ops : null, maxChg: +S.param.maxChg });
}
function bedelHesapla() {
  if (!yetkili('plan.yaz')) { bildir('Yetkiniz yok (plan.yaz).', 'hata'); return; }
  if (calisan) return;
  const w = isciAc(); if (!w) return;
  calisan = w;
  const ids = GEVSEK_IDS.filter(id => !S.kapali.includes(id) && !(id === 'malzeme' && S.w.mat !== 'sert'));
  const nOp = (cxAl() || { ops: [] }).ops.length;
  const ms = nOp > 250 ? 700 : nOp > 120 ? 900 : 1100;
  const dv = S.dataVer;
  U.ilerleme = { bedel: true, i: 0, n: ids.length + 1, ad: '' }; render();
  w.onmessage = e => {
    const m = e.data;
    if (m.t === 'bedel-ilerleme') { U.ilerleme = { bedel: true, ...m }; const el = document.querySelector('.pm-ilerleme'); if (el) el.outerHTML = ilerlemeHtml(); return; }
    w.bitir();
    if (m.t === 'hata') { render(); bildir('Bedel hesaplanamadı: ' + m.msg, 'hata'); return; }
    if (dv !== S.dataVer) { render(); bildir('Hesap sırasında veri değişti; yeniden hesaplayın.', 'hata'); return; }
    S.bedel = { dataVer: dv, temel: m.temel, liste: m.liste, zaman: Date.now() };
    const enCok = m.liste.slice().sort((a, b) => b.dW - a.dW)[0];
    iz('Kısıt bedeli hesaplandı', enCok ? `en pahalı: ${(KATALOG_DUZ[enCok.id] || {}).ad} −${sayi(enCok.dW, 1)} sa` : '');
    kaydet(); render();
    bildir(enCok && enCok.dW > bedelEsik(S.bedel) ? `En pahalı kısıt: ${(KATALOG_DUZ[enCok.id] || {}).ad} (${saat(enCok.dW)} gecikme).` : 'Hiçbir kısıt tek başına gecikmeyi azaltmıyor.', 'tamam');
  };
  w.postMessage({ tur: 'bedel', ms, temel: stOf(), liste: ids.map(id => ({ id, ad: KATALOG_DUZ[id].ad, st: stOf([id]) })) });
}

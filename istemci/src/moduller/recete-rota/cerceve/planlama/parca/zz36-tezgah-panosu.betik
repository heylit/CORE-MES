/* ---------- Tezgâh panosu: stüdyonun Plan sekmesi (kullanıcı 21.10; kararlar 50 a, 51, 52 b, 53, 55 b) ----------
   Çizelge ekranın kendisidir: işi tutup başka saate ya da tezgâha sürükle, etkisi bırakmadan görünür; sipariş listesi solda,
   seçilen siparişin akışı ve çözüm yolları listede açılır. Pano planın ayrı bir kopyası değildir: çalışma planı (S.plan) okunur ve her
   karar ona yazılır (tpYaz). Tezgâh, Sipariş, Kriz masası ve Senaryo sekmelerinin işi panoya geçti (Y3: olay türleri, üç tepki, ek mesai,
   adlı denemeler); sekmeler menüden kalktı, kodları durur ve onlara giden düğmeler panoya yönlenir. Eski Plan sekmesinin (zz31) kodu
   durur ama çizilmez: zz22, zz34 ve zz35 onun durumunu (psSek, psSec, sStudyoAc) kullanır. Pano kendi adlarını bir kapsam içinde tutar;
   uygulamanın adlarına yalnız tpDis üzerinden erişir. */
/* motor durumu panonun verisiyle kurulur: denemede veri, ek mesai ve olaylar çalışma planınınkinden ayrılabilir */
function tpSt(o) { const e = { D: S.D, ekMesai: S.ekMesai, olaylar: S.olaylar }; if (o.D) S.D = o.D; if (o.ekMesai) S.ekMesai = o.ekMesai; if (o.olaylar) S.olaylar = o.olaylar; try { return stOf(); } finally { Object.assign(S, e); } }
/* pano kararı çalışma planına yazar: önceki plan "Planı geri al" için saklanır, veri (bölme, acil, arıza, kilit, gerçekleşen) planla birlikte değişir */
function tpYaz(ad, L, geriYok) {
  if (!geriYok) { planGeri.push({ plan: S.plan, locks: S.locks, guncel: planGuncel(), ekMesai: S.ekMesai }); if (planGeri.length > 20) planGeri.shift(); }
  const once = S.plan ? S.plan.ozet : null;
  S.D = L.D; S.down = clone(L.down); S.locks = clone(L.locks); S.gercek = clone(L.gercek); S.ekMesai = clone(L.ekMesai || []); S.olaylar = clone(L.olaylar || []); S.tpSira = L.sira.slice(); S.dataVer++;
  const st = stOf(); const c = canliSen();
  const k = planKaydi(L.plan, st, c && c.plan ? { ops: c.plan.ops } : null);
  S.plan = { ...k, lb: S.plan && S.plan.lb, lbC: S.plan && S.plan.lbC, ilk: S.plan && S.plan.ilk, gunluk: S.plan && S.plan.gunluk, dataVer: S.dataVer, kim: kim().ad, zaman: Date.now(), kaynak: 'elle', oncekiOzet: once, kapali: S.kapali.slice() };
  U.hamle = null;
  iz('Plan elle değişti', `${ad}${once ? ` · gecikme ${sayi(once.wT, 1)} → ${sayi(S.plan.ozet.wT, 1)} sa` : ''}`); kaydet();
  return S.plan;
}
const tpDis = {
  G: () => S, stX: o => tpSt(o), cxAl: () => cxAl(), canli: () => canliSen(), yaz: (ad, L, g) => tpYaz(ad, L, g),
  kayit: (p, st) => { const c = canliSen(); return planKaydi(p, st, c && c.plan ? { ops: c.plan.ops } : null); },
  olayAd: ev => olayAd(ev), kim: () => kim().ad, kaydet: () => kaydet(), iz: (a, b) => iz(a, b), senKirp: s => senKirp(10, s),
  mesaiButce: () => (typeof MESAI_BUTCE === 'function' ? MESAI_BUTCE() : null),
  ic: (a, b) => ic(a, b), yetki: () => yetkili('plan.yaz'), calisan: () => !!calisan, basladi: j => basladiMi(j),
  onaya: () => paOnayaGonder(), onayda: () => paOnayda().length, farkli: () => paCalismaFarkli(), iyilestir: () => coz('iyilestir'),
  sekme: v => tekEylem('ps-sek', v), render: () => render(), bildir: (m, t, e) => bildir(m, t, e),
};
const TP = (function (dis) {
  'use strict';
  const $ = (s, k = document) => k.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (ad, sinif = '') => dis.ic(ad, 'k').replace('class="tc-simge', `class="tp-ic ${sinif} tc-simge`);
  const GUNK = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const NEDEN = { tezgah: 'tezgâh dolu', personel: 'operatör yok', yetkin: 'yetkin operatör yok', ayarci: 'ayarcı yok', aparat: 'aparat dolu', malzeme: 'malzeme bekliyor',
    program: 'NC program bekliyor', serbest: 'serbest bırakma tarihi', rota: 'önceki adımı bekliyor', kilit: 'kilitli saat', ariza: 'arıza', simdi: 'hemen başlıyor', plan: 'plan', uyari: 'uyarı',
    'fason-cikis': 'fasoncu çıkış günü', 'fason-kap': 'fasoncu dolu', oneri: 'öneri saati' };
  const SNAP = 0.25;

  /* S panonun görünümüdür: D, arızalar, kilitler ve gerçekleşen çalışmadakilerin aynısıdır; plan, motorun kod çözücüsünün sabit noktasıdır ki boş hamle sıfır etki göstersin */
  const S = { D: null, down: [], locks: {}, sira: [], ekMesai: [], olaylar: [], plan: null, e: null, canli: null, canliE: null, geri: [], ileri: [], gercek: {}, kaynak: null, dv: -1, durum: 'taslak' };
  Object.defineProperty(S, 'frz', { get: () => +dis.G().w.dondurma || 0 });
  const OLCEK = [[24, 'Gün'], [72, '3 gün'], [168, 'Hafta'], [720, 'Ay'], [8760, 'Yıl']];
  const U = { suz: null, zoom: innerWidth < 768 ? 24 : 72, secOp: null, secJob: null, kart: null, ara: '', surukle: null, onizleme: null, rayAcik: false };
  const yazar = () => dis.yetki() && !dis.calisan();

  /* ---------- motor koprusu ---------- */
  /* motorun durumu uygulamanınkidir (stOf); önizleme yalnız veri, arıza, kilit ve gerçekleşeni değiştirir */
  function stKur(ek = {}) {
    const st = dis.stX({ D: ek.D || S.D, ekMesai: ek.ekMesai || S.ekMesai, olaylar: ek.olaylar || S.olaylar });
    st.down = (ek.down || S.down).map((d, i) => ({ ...d, id: 'd' + i }));
    st.locks = clone(ek.locks || S.locks);
    st.gercek = clone(ek.gercek || S.gercek);
    return st;
  }
  /* çalışma planındayken derleme uygulamanınkidir; denemede panonun verisi farklı olabilir, kendi derlemesi tutulur */
  let cxY = { k: null, cx: null };
  function cxAl() {
    if (!dnAktif()) return dis.cxAl();
    const k = [S.D, S.down, S.locks, S.gercek, S.ekMesai, S.olaylar, S.frz];
    if (!cxY.k || k.some((x, i) => x !== cxY.k[i])) cxY = { k, cx: compile(stKur()) };
    return cxY.cx;
  }
  function bagla(p, cx) { Object.defineProperty(p, 'cx', { value: cx, enumerable: false, writable: true }); return p; }
  /* bölünen siparişin gecikmesi motorun saydığı gibidir (parça başına); sipariş başına bir kez sayma kararı 35'te bekliyor */
  function degerle(p, st) { return evaluate(p, st, null, true); }
  function kozet(e) { let kar = 0; for (const j in e.J) if (e.J[j].kar != null) kar += e.J[j].kar; return { wT: e.wT, late: e.late, kar }; }
  /* bir hamlenin plani: dondurma bolgesi korunur, kilitler motorda alt sinirdir */
  function coz(mods, ek = {}) {
    const st = stKur(ek); const cx = ek.D || ek.down || ek.gercek || ek.locks || ek.ekMesai || ek.olaylar ? compile(st) : cxAl();
    /* yeni islemler kod cozucunun sirasina ancak kimlikleriyle girer; yoksa planin sonuna kalir */
    let ops = S.plan.ops; if (mods.some(([id]) => !ops[id])) { ops = { ...ops }; for (const [id, m, k] of mods) if (!ops[id]) ops[id] = { id, job: id.slice(0, id.lastIndexOf('.')), m, S: k }; }
    const p = lnsDecode(st, { ops, fail: S.plan.fail || [] }, mods, cx, false, true); slack(p, cx); bagla(p, cx);
    return { p, st, e: degerle(p, st) };
  }
  /* çalışma planı başka yerden değiştiyse (Onay, Kriz, Planı kur, geri al) pano ondan yeniden kurulur */
  function esitle() {
    const G = dis.G(); if (!G.plan) { S.plan = null; return false; }
    if (dnAktif() && S.plan) return true;
    if (S.kaynak === G.plan && S.dv === G.dataVer && S.plan) return true;
    Object.assign(S, { D: G.D, down: clone(G.down), locks: clone(G.locks), gercek: clone(G.gercek || {}), ekMesai: clone(G.ekMesai || []), olaylar: clone(G.olaylar || []), sira: (G.tpSira || []).filter(j => G.D.siparisler.some(x => x.id === j)) });
    const cx = cxAl(); if (!cx) { S.plan = null; return false; }
    S.plan = bagla({ ops: G.plan.ops, fail: G.plan.fail || [] }, cx); S.e = degerle(S.plan, stKur());
    for (let i = 0; i < 4; i++) { const z = coz([]); const ayni = Object.keys(z.p.ops).every(id => { const a = S.plan.ops[id], b = z.p.ops[id]; return a && a.m === b.m && Math.abs(a.S - b.S) < 1e-6; }); S.plan = z.p; S.e = z.e; if (ayni) break; }
    const c = dis.canli();
    if (c && c.plan) { S.canli = { ops: c.plan.ops, down: c.down || [] }; S.canliE = degerle(bagla({ ops: c.plan.ops, fail: [] }, cx), stKur()); } else { S.canli = null; S.canliE = null; }
    if (S.kaynak && S.kaynak !== G.plan) { S.geri = []; S.ileri = []; }
    S.kaynak = G.plan; S.dv = G.dataVer;
    return true;
  }

  /* ---------- zaman ---------- */
  function t2d(t) { const [y, m, d] = S.D.meta.baslangic.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + t * 3600000); }
  function zs(t) { if (t == null || !isFinite(t)) return '—'; const d = t2d(t); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }
  function gs(t) { if (t == null || !isFinite(t)) return '—'; const d = t2d(t); return `${GUNK[d.getUTCDay()]} ${d.getUTCDate()}`; }
  function ga(t) { if (t == null || !isFinite(t)) return '—'; const d = t2d(t); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
  function tz(t) { return t == null || !isFinite(t) ? '—' : `${gs(t)} ${zs(t)}`; }
  function sure(h) { if (h == null || !isFinite(h)) return '—'; const a = Math.abs(h); return a >= 48 ? `${(a / 24).toFixed(1).replace('.', ',')} g` : `${Math.round(a)} sa`; }
  const tl = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('tr-TR') + ' TL';
  function tIso(t) { const d = t2d(t), p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; }

  /* ---------- siparis bilgisi ---------- */
  function sipBilgi(jid, p = S.plan, e = S.e) {
    const cx = p.cx, j = cx.jobs[jid]; if (!j) return null;
    const ops = j.ops.map(o => p.ops[o.id]).filter(Boolean);
    const ur = ops.length ? Math.min(...ops.map(r => r.S)) : null;
    const mr = cx.mat.res[jid]; let bas = 7; if (j.rel != null) bas = Math.max(bas, j.rel); if (mr && isFinite(mr.ready)) bas = Math.max(bas, mr.ready);
    const J = e.J[jid] || {}; const C = J.C, due = j.due;
    const pay = due != null && isFinite(C) ? due - C : null;
    const durum = J.T > 0.01 || !isFinite(C) ? 'gec' : pay != null && pay < 8 ? 'risk' : 'iyi';
    return { id: jid, j, ops, bas, ur, C, due, T: J.T, pay, durum, kar: J.kar, ad: (S.D.urunler.find(u => u.id === j.urun) || {}).ad || j.urun };
  }
  function siparisler() {
    const cx = S.plan.cx; const L = Object.keys(cx.jobs).map(id => sipBilgi(id));
    const sira = S.sira.length ? S.sira : null;
    if (sira) return L.sort((a, b) => sira.indexOf(a.id) - sira.indexOf(b.id));
    return L.sort((a, b) => (b.T || 0) - (a.T || 0) || (a.pay ?? 1e9) - (b.pay ?? 1e9));
  }

  /* ---------- etki: iki plan arasinda siparis bitisi farki ---------- */
  function etki(e0, e1) {
    const L = []; for (const j in e1.J) { const a = e0.J[j] ? e0.J[j].C : null, b = e1.J[j].C; if (a == null || !isFinite(a) || !isFinite(b)) continue; const d = b - a; if (Math.abs(d) >= 0.25) L.push({ j, d, gec: (e0.J[j].T <= 0.01 && e1.J[j].T > 0.01) ? 'gecikmeye düşer' : (e0.J[j].T > 0.01 && e1.J[j].T <= 0.01) ? 'zamanına girer' : '' }); }
    const a = kozet(e0), b = kozet(e1);
    /* kar yalniz iki planda da hesaplanabilen siparislerde karsilastirilir: eksik fiyat farki kar farki gibi gorunmesin */
    let dKar = 0; for (const j in e1.J) { const x = e0.J[j], y = e1.J[j]; if (x && x.kar != null && y.kar != null) dKar += y.kar - x.kar; }
    return { L: L.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)), dW: b.wT - a.wT, dLate: b.late - a.late, dKar };
  }
  function etkiMetni(x, hedef) {
    const h = hedef && x.L.find(z => z.j === hedef);
    const diger = x.L.filter(z => z.j !== hedef && z.d > 0);
    const p = [];
    if (h) p.push(`${hedef} bitişi <b class="${h.d < 0 ? 'iyi' : 'kotu'}">${h.d < 0 ? '−' : '+'}${sure(h.d)}</b>${h.gec ? ', ' + h.gec : ''}`);
    if (diger.length) p.push(`${diger.length} sipariş geç kalıyor (en çok +${sure(Math.max(...diger.map(z => z.d)))})`);
    const gecen = x.L.filter(z => z.gec === 'gecikmeye düşer' && z.j !== hedef); if (gecen.length) p.push(`<span class="rozet gec">${gecen.map(z => z.j).join(', ')} gecikmeye düşer</span>`);
    p.push(`toplam gecikme <b class="${x.dW > 0.1 ? 'kotu' : x.dW < -0.1 ? 'iyi' : ''}">${x.dW > 0 ? '+' : x.dW < 0 ? '−' : '±'}${sure(x.dW)}</b>`);
    if (Math.abs(x.dKar) >= 1) p.push(`kâr <b class="${x.dKar < 0 ? 'kotu' : 'iyi'}">${x.dKar > 0 ? '+' : ''}${tl(x.dKar)}</b>`);
    return p.join(' · ');
  }

  /* ---------- karar ve geri al ----------
     Her karar çalışma planına yazılır (dis.yaz). Geri almak panonun kendi listesidir: önceki görünüm geri gelir ve çalışma planına yazılır. */
  function anlik() { return { D: S.D, down: S.down, locks: S.locks, sira: S.sira, gercek: S.gercek, ekMesai: S.ekMesai, olaylar: S.olaylar, plan: S.plan, e: S.e }; }
  function geriYukle(a) { Object.assign(S, { D: a.D, down: a.down, locks: a.locks, sira: a.sira, gercek: a.gercek || {}, ekMesai: a.ekMesai || [], olaylar: a.olaylar || [], plan: a.plan, e: a.e }); }
  /* karar çalışma planına yazılır; denemedeyken yalnız denemenin kaydına */
  function yansit(ad, geriYok) {
    if (dnAktif()) { bagla(S.plan, cxAl()); S.e = degerle(S.plan, stKur()); dnKaydet(); return; }
    const k = dis.yaz(ad, S, geriYok); S.kaynak = k; S.dv = dis.G().dataVer; bagla(S.plan, cxAl()); S.e = degerle(S.plan, stKur());
  }
  function uygula(ad, yeni) {
    if (!yazar()) { bildir('Yetkiniz yok ya da motor çalışıyor.'); return; }
    const once = kozet(S.e);
    S.geri.push({ ...anlik(), ad, t: Date.now(), once: once.wT }); if (S.geri.length > 40) S.geri.shift(); S.ileri = [];
    for (const k of ['D', 'down', 'locks', 'sira', 'gercek', 'ekMesai', 'olaylar']) if (yeni[k] !== undefined) S[k] = yeni[k];
    S.plan = yeni.p; S.e = yeni.e;
    const son = kozet(S.e); S.geri[S.geri.length - 1].son = son.wT; U.bugunDurum = {};
    yansit(ad);
    bildir(`${ad} · gecikme ${sure(once.wT)} → ${sure(son.wT)}`, true);
    ciz();
  }
  function geriAl() { if (!S.geri.length || !yazar()) return; const g = S.geri.pop(); S.ileri.push({ ...anlik(), ad: g.ad, t: g.t, once: g.once, son: g.son }); geriYukle(g); yansit(`Geri alındı: ${g.ad}`, true); U.bugunDurum = {}; bildir(`Geri alındı: ${g.ad}`); ciz(); }
  function geriDon(i) { if (!yazar()) return; let n = S.geri.length - i; while (n-- > 0) { const g = S.geri.pop(); S.ileri.push({ ...anlik(), ad: g.ad, t: g.t, once: g.once, son: g.son }); geriYukle(g); } yansit('Seçilen karardan öncesine dönüldü', true); U.bugunDurum = {}; bildir('Seçilen karardan öncesine dönüldü'); ciz(); }
  function yinele() { if (!S.ileri.length || !yazar()) return; const g = S.ileri.pop(); S.geri.push({ ...anlik(), ad: g.ad, t: g.t, once: g.once, son: g.son }); geriYukle(g); yansit(`Yinelendi: ${g.ad}`, true); bildir('Yinelendi'); ciz(); }
  /* taslağı sıfırlamak çalışma planını canlı plana döndürür; tek adım değildir, ikinci tıkla olur ve geri alınabilir */
  function taslakSifirla() {
    const c = dis.canli(); if (!c || !c.plan) { bildir('Canlı plan yok; sıfırlanacak taban yok.'); return; }
    const D = c.D ? clone(c.D) : S.D, down = clone(c.down || []), locks = clone(c.locks || {}), ekMesai = clone(c.ekMesai || []);
    const st = stKur({ D, down, locks, ekMesai }), cx = compile(st), p = bagla({ ops: clone(c.plan.ops), fail: [] }, cx);
    uygula('Taslak sıfırlandı: çalışma canlı plana döndü', { p, e: degerle(p, st), D, down, locks, ekMesai, sira: [] });
  }
  function bildir(m, geri) { dis.bildir(m.replace(/<[^>]+>/g, ''), geri ? 'tamam' : '', geri ? { metin: 'Geri al', act: 'tp-geri' } : undefined); }

  /* canli plan ile calisma farki: tezgahi ya da 15 dk'dan fazla saati degisen islem sayisi */
  function farkSay() {
    if (!S.canli) return 0; let n = Math.abs(S.down.length - (S.canli.down || []).length);
    for (const id in S.plan.ops) { const a = S.canli.ops[id], b = S.plan.ops[id]; if (!a || a.m !== b.m || Math.abs(a.S - b.S) > 0.25) n++; }
    return n;
  }
  /* ---------- cizim ---------- */
  function ciz() {
    const kok = $('#tp-kok'); if (!kok || !S.plan) return;
    const lst = $('#tp-liste'); if (lst) U.listeY = lst.scrollTop;
    kok.innerHTML = `<div class="tp">${cizUst()}${dnAktif() ? cizDnSerit() : ''}<div class="tp-govde ${U.rayAcik ? 'ray-acik' : ''}">${cizRay()}<div class="tp-pano" id="tp-pano">${cizPano()}</div>${cizBugun()}</div></div>`;
    const pano = $('#tp-pano'); if (U.kaydir) { pano.scrollLeft = U.kaydir.x; pano.scrollTop = U.kaydir.y; } else { pano.scrollLeft = Math.max(0, 5 * pph()); }
    pano.addEventListener('scroll', () => { U.kaydir = { x: pano.scrollLeft, y: pano.scrollTop }; }, { passive: true });
    cizKart(); cizOklar(); bugunHesapla();
    const l2 = $('#tp-liste'); if (l2 && U.listeY != null) l2.scrollTop = U.listeY;
  }
  function cizUst() {
    const o = kozet(S.e), f = farkSay(), c = S.canliE ? kozet(S.canliE) : null, yaz = yazar(), farkli = dis.farkli(), ony = dis.onayda(), dn = dnAktif();
    const dW = c ? o.wT - c.wT : 0;
    const durum = dn ? `<span class="tp-durum deneme dn-${dn.renk}" title="Deneme: çalışma planı değişmez">${ic('lab')} Deneme ${dn.harf}</span>` : !c ? `<span class="tp-durum taslak" title="Henüz canlıya alınmış plan yok">${ic('edit')} Çalışma<span class="ikincil"> · canlı yok</span></span>`
      : f ? `<span class="tp-durum taslak" title="Canlı plandan farklı">${ic('edit')} Taslak · ${f}<span class="ikincil"> değişiklik</span></span>` : `<span class="tp-durum ayni" title="Çalışma planı canlı planla aynı">${ic('check')} Canlı planla aynı</span>`;
    return `<header class="tp-ust">
      <button class="tp-tus yalin tp-dar-tus" data-a="ray" aria-label="Siparişler">${ic('list')}</button>
      ${durum}${ony ? `<button class="tp-durum onayda" data-a="onayGit" title="Onay sekmesini aç">${ic('clock')} ${ony} onayda</button>` : ''}
      <div class="tp-olc">
        <span title="Geciken sipariş"><b class="${o.late ? 'kotu' : 'iyi'}">${o.late}</b> <span class="ad">geciken</span></span>
        <span><b>${sure(o.wT)}</b> <span class="ad">gecikme</span>${c && Math.abs(dW) > 0.1 ? ` <span class="${dW > 0 ? 'kotu' : 'iyi'}">${dW > 0 ? '+' : '−'}${sure(dW)}</span>` : ''}</span>
        <span class="ek kar"><b>${tl(o.kar)}</b> <span class="ad">kâr</span></span>
      </div>
      <span class="tp-bosluk"></span>
      <div class="tp-grup" role="group" aria-label="Ölçek">${OLCEK.map(([z, a]) => `<button data-a="zoom" data-v="${z}" aria-pressed="${U.zoom === z}">${a}</button>`).join('')}</div>
      <button class="tp-tus yalin ${U.suz ? 'suz-acik' : ''}" data-a="suz" aria-label="Süz: tezgâh, istasyon, üretim emri" title="Süz">${ic('eye')}${U.suz ? `<span class="say">${Object.values(U.suz).filter(Boolean).length}</span>` : ''}</button>
      <div class="tp-grup geri-grup" role="group" aria-label="Geri al"><button data-a="geri" aria-label="Geri al" title="Geri al (Ctrl+Z)" ${S.geri.length && yaz ? '' : 'disabled'}>${ic('back')}</button><button data-a="geriMenu" aria-label="Karar geçmişi ve taslağı sıfırla" title="Karar geçmişi, taslağı sıfırla">${ic('down')}</button></div>
      <button class="tp-tus ${dn ? 'deneme dn-' + dn.renk : ''}" data-a="dnAc" aria-label="Şu olursa: denemeler" title="Çalışma planını bozmadan farklı yollar dene ve karşılaştır">${ic('lab')}<span class="metin ikincil">Dene</span>${U.dn && U.dn.L.length ? `<span class="say">${U.dn.L.length}</span>` : ''}</button>
      <button class="tp-tus" data-a="olay" aria-label="Olay: arıza, acil sipariş, malzeme, personel ya da fason" ${yaz ? '' : 'disabled'}>${ic('plus')}<span class="metin ikincil">Olay</span></button>
      <button class="tp-tus" data-a="iyilestir" aria-label="İyileştir" ${yaz && !dn ? '' : 'disabled'} title="Motor planı kısa sürede iyileştirir; sonucu alttaki Sonuç kutusunda sen seçersin">${ic('bolt')}<span class="metin ikincil">İyileştir</span></button>
      ${farkli && yaz && !dn ? `<button class="tp-tus ana" data-a="gonder" aria-label="Onaya gönder">${ic('upload')}<span class="metin">Onaya gönder</span>${f ? `<span class="say">${f}</span>` : ''}</button>` : ''}
      <button class="tp-tus yalin" data-a="dahasi" aria-label="Diğer">${ic('more')}</button>
    </header>`;
  }
  function cizRay() {
    const L = siparisler().filter(s => (!U.ara || (s.id + ' ' + s.ad).toLocaleLowerCase('tr').includes(U.ara.toLocaleLowerCase('tr'))) && (!U.suz || s.ops.some(suzUyar)));
    const sat = s => {
      const ac = U.secJob === s.id;
      const roz = s.durum === 'gec' ? `<span class="rozet gec">${sure(s.T)} geç</span>` : s.durum === 'risk' ? `<span class="rozet risk">${sure(s.pay)} pay</span>` : '';
      return `<div class="tp-sip ${s.durum === 'iyi' ? '' : s.durum} ${ac ? 'sec' : ''}" data-a="sip" data-j="${s.id}" draggable="${yazar()}" title="Sürükleyerek sırasını değiştir">
        <div class="tp-sip-ad"><b>${ic(ac ? 'down' : 'chev-right', 'ok-ac')}${esc(s.id).replace(/\/(\d+)$/, '<i class="parca">/$1</i>')}</b>${roz}<small>${esc(s.ad)} · ${s.j.adet} ad${s.j.oncelik === 1 ? ' · acil' : ''}</small></div>
        <div class="tp-t ${s.bas > s.ur + 0.25 ? 'uyar' : ''}" ${s.bas > s.ur + 0.25 ? 'title="Malzeme tahmini üretim başlangıcından sonra geliyor"' : ''}>${ga(s.bas)}<b>${zs(s.bas)}</b></div>
        <div class="tp-t">${ga(s.ur)}<b>${zs(s.ur)}</b></div>
        <div class="tp-t ${s.durum === 'gec' ? 'gec' : ''}">${ga(s.C)}<b>${zs(s.C)}</b></div>
        <div class="tp-t">${ga(s.due)}<b>${zs(s.due)}</b></div>
        ${ac ? cizSipAc(s, U.yeniAcilan === s.id) : ''}
      </div>`;
    };
    return `<aside class="tp-ray" aria-label="Siparişler">
      <div class="tp-ray-bas">${ic('search')}<input id="tp-ara" placeholder="Sipariş ara" value="${esc(U.ara)}" aria-label="Sipariş ara">
        ${S.sira.length ? `<button class="tp-tus kucuk" data-a="siraSifirla" title="Elle sırayı bırak, riske göre sırala">${ic('sort')}</button>` : ''}</div>
      <div class="tp-ray-sutun"><span title="${S.sira.length ? 'Elle sıra' : 'En riskli üstte'}">Sipariş</span><span>Başl.</span><span>Üretim</span><span>Bitiş</span><span>Termin</span></div>
      <div class="tp-liste" id="tp-liste">${!L.length ? `<p class="tp-not" style="padding:var(--b-3)">${ic('search')} ${U.suz ? 'Süzgece' : 'Aramaya'} uyan sipariş yok.</p>` : ''}${S.sira.length || U.ara ? L.map(sat).join('') : [['gec', 'Geciken', 'alert'], ['risk', 'Riskli · 8 sa’ten az pay', 'clock'], ['iyi', 'Zamanında', 'check']].map(([d, ad, ik]) => { const G = L.filter(x => x.durum === d); return G.length ? `<div class="tp-ayrac ${d}">${ic(ik)} ${ad}<span>${G.length}</span></div>${G.map(sat).join('')}` : ''; }).join('')}</div>
    </aside>`;
  }
  /* secilen siparis: rota adimlari ve hazir hesaplanmis cozum secenekleri */
  /* siparisin akisi: rota sirasiyla islemler, her birinin oncullerinden hazir oldugu an, bekleme ve nedeni, kritik zincir */
  function akis(jid, p = S.plan) {
    const cx = p.cx, j = cx.jobs[jid], tas = +cx.A.tasimaSaat || 0;
    const L = j.ops.map(o => ({ o, r: p.ops[o.id] })).filter(x => x.r && isFinite(x.r.C));
    const mr = cx.mat.res[jid]; let bas0 = 7; if (j.rel != null) bas0 = Math.max(bas0, j.rel); if (mr && isFinite(mr.ready)) bas0 = Math.max(bas0, mr.ready);
    for (const x of L) {
      let h = x.o.pr.length ? -Infinity : bas0, kim = null;
      for (const [pid, ty] of x.o.pr) { const q = p.ops[pid]; if (!q) continue; const t = (ty === 'o' && !q.fas ? q.lot1 : q.C) + (q.fas || x.r.fas ? 0 : tas); if (t > h) { h = t; kim = pid; } }
      x.hazir = isFinite(h) ? h : bas0; x.onc = kim; x.bek = Math.max(0, x.r.S - x.hazir);
      const w = x.r.why; x.neden = w && !['simdi', 'rota', 'plan'].includes(w.t) ? (NEDEN[w.t] || w.t) + (w.r && w.t !== 'tezgah' ? ` (${w.r})` : w.t === 'tezgah' && w.r ? ` (${w.r} bitişini bekliyor)` : '') : null;
    }
    L.sort((a, b) => a.r.S - b.r.S || a.o.k.localeCompare(b.o.k));
    const by = Object.fromEntries(L.map(x => [x.o.id, x]));
    let son = L.reduce((a, b) => (!a || b.r.C > a.r.C ? b : a), null); const kritik = new Set();
    while (son) { kritik.add(son.o.id); son = son.onc ? by[son.onc] : null; }
    for (const x of L) x.kritik = kritik.has(x.o.id);
    return { L, bas0, mr };
  }
  /* cozum yollari ayri parca: hesap bitince yalniz bu kutu yenilenir, sayfa yeniden cizilmez (titreme olmasin) */
  function cizSecenekler(s) {
    const hesap = U.secenek && U.secenek.j === s.id && !U.secenek.L;
    const sec = U.secenek && U.secenek.j === s.id ? U.secenek.L || [] : [];
    const enIyi = sec.filter(x => x.ok && x.x.dW < -0.1 && x.x.dKar >= 0).sort((a, b) => a.x.dW - b.x.dW)[0];
    const dar = (() => { const son = s.ops.slice().sort((a, b) => b.C - a.C); const w = son.map(r => r.why).find(w => w && !['rota', 'simdi', 'plan'].includes(w.t)); return w ? (NEDEN[w.t] || w.t) + (w.r ? ' (' + w.r + ')' : '') : null; })();
    return hesap && s.durum !== 'iyi' ? `<p class="tp-not">${ic('rotate')} Çözüm yolları hesaplanıyor…</p>` : s.durum === 'iyi' && !sec.length ? `<p class="tp-not">${ic('check')} Termine ${sure(s.pay)} pay var.</p>`
      : !sec.length ? `<p class="tp-not uyari">${ic('alert')} Öne almak da tezgâh değiştirmek de bitişi kısaltmıyor${dar ? '; asıl bekleme: ' + esc(dar) : ''}. Kalan yol termini konuşmak.</p>`
      : sec.map(x => `<div class="tp-secenek ${x === enIyi ? 'onerilen' : ''}"><div><span class="ust">${esc(x.ad)}</span><small>${etkiMetni(x.x, s.id)}</small>
          ${x.x.dKar < -1 ? '<small class="tp-not uyari">Kâr düşüyor: öneri yok, karar senin.</small>' : ''}</div>
          <button class="tp-tus kucuk ${x === enIyi ? 'ana' : ''}" data-a="secenek" data-i="${sec.indexOf(x)}" ${x.ok ? '' : 'disabled'}>Uygula</button></div>`).join('');
  }
  function cizSipAc(s, anim) {
    const A = akis(s.id);
    const ad = (A.mr && A.mr.det && A.mr.det.length ? `<div class="tp-akis-uc">${ic('box')} Malzeme hazır <b>${tz(A.bas0)}</b></div>` : '') + A.L.map((x, i) => {
      const r = x.r, o = x.o;
      const bek = x.bek >= 0.25 ? `<div class="tp-akis-bek ${x.kritik ? 'kritik' : ''}">${ic('clock')} ${sure(x.bek)} bekleme${x.neden ? ' · ' + esc(x.neden) : ''}</div>` : '';
      return `${bek}<button class="tp-akis-op ${x.kritik ? 'kritik' : ''} ${U.secOp === o.id ? 'sec' : ''}" data-a="opGit" data-id="${esc(o.id)}" title="Çizelgede göster">
        <i>${esc(o.k)}</i><span><b>${esc(o.ad || '')}</b><small>${esc(r.fas ? 'Fason ' + r.m.slice(1) : r.m)} · ${tz(r.S)} → ${Math.floor(r.S / 24) === Math.floor(r.C / 24) ? zs(r.C) : tz(r.C)} · ${sure(r.C - r.S)}</small></span>${S.locks[o.id] ? ic('lock') : ''}</button>`;
    }).join('') + `<div class="tp-akis-uc ${s.durum === 'gec' ? 'gec' : ''}">${ic('flag')} Bitiş <b>${tz(s.C)}</b> · termin ${tz(s.due)} · ${s.durum === 'gec' ? sure(s.T) + ' geç' : sure(s.pay) + ' pay'}</div>`;
    return `<div class="tp-ac ${anim ? 'yeni' : ''}" data-a="yok">
      ${cizSipDetay(s)}
      <div class="tp-akis">${ad}</div><p class="tp-not">Kalın çizgili adımlar bitişi belirleyen zincir. Adıma dokun, çizelgede açılsın.</p>
      <div id="tp-secenekler">${cizSecenekler(s)}</div>
      <div class="eylem" style="margin-top:var(--b-2)">${s.j.adet > 1 && !/\/\d+$/.test(s.id) && yazar() && !dis.basladi(s.id) ? `<button class="tp-tus kucuk" data-a="bolAc" data-j="${esc(s.id)}">${ic('layers')} Böl</button>` : ''}<button class="tp-tus kucuk" data-a="kapat">${ic('x')} Kapat</button></div>
    </div>`;
  }

  /* secili siparisin oncul-ardil oklari: cubuklarin yerinden olculur, kritik zincir belirgin, bekleme bosluklari etiketli */
  function cizOklar() {
    if (U.zoom >= 8760) { const o = $('#tp-oklar'); if (o) o.remove(); return; }
    const alan = $('.tp-ic-alan'); if (!alan) return; const eski = $('#tp-oklar'); if (eski) eski.remove();
    if (!U.secJob || !S.plan.cx.jobs[U.secJob]) return;
    const A = akis(U.secJob), ar = alan.getBoundingClientRect(); const yer = {};
    for (const x of A.L) { const el = alan.querySelector(`.tp-cubuk[data-id="${CSS.escape(x.o.id)}"]`); if (!el) continue; const b = el.getBoundingClientRect(); yer[x.o.id] = { x0: b.left - ar.left, x1: b.right - ar.left, y: b.top - ar.top + b.height / 2 }; }
    let yol = '', yazi = '';
    for (const x of A.L) for (const [pid] of x.o.pr) {
      const a = yer[pid], b = yer[x.o.id]; if (!a || !b) continue;
      const kr = x.kritik && x.onc === pid; const dx = Math.max(24, Math.abs(b.x0 - a.x1) / 2);
      yol += `<path class="${kr ? 'kritik' : ''}" d="M${a.x1},${a.y} C${a.x1 + dx},${a.y} ${b.x0 - dx},${b.y} ${b.x0 - 3},${b.y}" marker-end="url(#tp-uc${kr ? 'K' : ''})"/>`;
      if (x.onc === pid && x.bek >= 1 && b.x0 - a.x1 > 40) yazi += `<text x="${(a.x1 + b.x0) / 2}" y="${(a.y + b.y) / 2 - 6}" class="${kr ? 'kritik' : ''}">${sure(x.bek)}</text>`;
    }
    const k = pph(), H = alan.offsetHeight, ofs = etiketGen(); let cizgi = '';
    const b = sipBilgi(U.secJob);
    if (b.due != null) cizgi += `<line class="termin" x1="${ofs + b.due * k}" x2="${ofs + b.due * k}" y1="0" y2="${H}"/><text class="termin" x="${ofs + b.due * k + 4}" y="14">Termin ${esc(U.secJob)}</text>`;
    if (A.mr && A.mr.det && A.mr.det.length && A.bas0 > 7.01) cizgi += `<line class="malzeme" x1="${ofs + A.bas0 * k}" x2="${ofs + A.bas0 * k}" y1="0" y2="${H}"/><text class="malzeme" x="${ofs + A.bas0 * k + 4}" y="28">Malzeme</text>`;
    alan.insertAdjacentHTML('beforeend', `<svg id="tp-oklar" class="tp-oklar" width="${alan.offsetWidth}" height="${H}" aria-hidden="true"><defs>
      <marker id="tp-uc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="uc"/></marker>
      <marker id="tp-ucK" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="uc kritik"/></marker></defs>${cizgi}${yol}${yazi}</svg>`);
  }
  function opGit(id) {
    const r = S.plan.ops[id]; if (!r) return; U.secOp = id; U.secJob = r.job;
    if (innerWidth < 1024 && U.rayAcik) { U.rayAcik = false; ciz(); } else cizHafif();
    const pano = $('#tp-pano'), el = pano && pano.querySelector(`.tp-cubuk[data-id="${CSS.escape(id)}"]`); if (!el) return;
    const satir = el.closest('.tp-satir');
    pano.scrollTo({ left: Math.max(0, r.S * pph() - pano.clientWidth / 3), top: Math.max(0, satir.offsetTop - pano.clientHeight / 3), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('parla'); setTimeout(() => el.classList.remove('parla'), 1600);
  }

  /* bugun cozulecekler: geciken ve riskli siparisler, her biri icin yol durumu arka planda hesaplanir; yol yoksa durustce soylenir */
  function cizBugun() {
    const L = siparisler().filter(x => x.durum !== 'iyi'); const gec = L.filter(x => x.durum === 'gec').length;
    const son = S.geri[S.geri.length - 1];
    const bas = `<button class="tp-bugun-bas" data-a="bugun" aria-expanded="${!!U.bugunAcik}">${ic(U.bugunAcik ? 'down' : 'up')}<b>Bugün</b><span>${gec} geciken · ${L.length - gec} riskli${S.down.length ? ` · ${S.down.length} arıza` : ''}</span>${son ? `<span class="son">Son: ${esc(son.ad)}</span>` : ''}</button>`;
    const ustB = `<div class="tp-bugun-ust">${bas}</div>`;
    if (!U.bugunAcik) return `<section class="tp-bugun">${ustB}</section>`;
    const D = U.bugunDurum || {};
    const sat = L.map(x => { const d = D[x.id];
      const dur = !d ? `<span class="tp-not">${ic('rotate')} bakılıyor</span>` : d.n ? `<span class="rozet iyi">${d.n} yol · en iyi ${d.en}</span>` : `<span class="rozet risk">karar senin${d.dar ? ' · ' + esc(d.dar) : ''}</span>`;
      return `<button class="tp-bugun-sat" data-a="sipGoster" data-j="${esc(x.id)}"><b>${esc(x.id)}</b><span class="rozet ${x.durum}">${x.durum === 'gec' ? sure(x.T) + ' geç' : sure(x.pay) + ' pay'}</span>${dur}</button>`; }).join('') || '<p class="tp-not">Geciken ya da riskli sipariş yok.</p>';
    const kar = S.geri.slice().reverse().slice(0, 8).map((g, i) => `<div class="tp-bugun-kar"><span>${esc(g.ad)}<small>gecikme ${sure(g.once)} → ${sure(g.son)}</small></span><button class="tp-tus kucuk" data-a="geriDon" data-i="${S.geri.length - 1 - i}" ${S.durum === 'onayda' ? 'disabled' : ''}>${ic('back')} Öncesine dön</button></div>`).join('') || '<p class="tp-not">Bu oturumda karar yok.</p>';
    return `<section class="tp-bugun acik">${ustB}<div class="tp-bugun-ic"><div><h4>Çözülecekler</h4>${sat}</div><div><h4>Son kararlar</h4>${kar}</div></div></section>`;
  }
  function bugunHesapla() {
    if (!U.bugunAcik) return; U.bugunDurum = U.bugunDurum || {};
    const sira = siparisler().filter(x => x.durum !== 'iyi' && !U.bugunDurum[x.id]).map(x => x.id); if (!sira.length) return;
    const tok = U.bugunTok = {}; let jid = sira.shift(), it = secenekGen(jid);
    const adim = () => { if (U.bugunTok !== tok || !U.bugunAcik) return; const t0 = performance.now(); let r;
      while (performance.now() - t0 < 30) { r = it.next(); if (r.done) {
          const L = r.value || [], h = L.map(x => x.x.L.find(q => q.j === jid)).filter(Boolean).sort((a, b) => a.d - b.d)[0];
          const A = akis(jid), w = A.L.filter(x => x.kritik && x.neden).pop();
          U.bugunDurum[jid] = { n: L.length, en: h ? '−' + sure(h.d) : '', dar: w ? w.neden.replace(/ \(.*\)$/, '') : null };
          const el = document.querySelector('.tp-bugun'); if (el) el.outerHTML = cizBugun();
          if (!sira.length) return; jid = sira.shift(); it = secenekGen(jid); } }
      setTimeout(adim, 0); };
    setTimeout(adim, 0);
  }

  /* siparisin ayrintisi: kimlik, malzeme, kisitlar, kar dokumu ve motor uyarilari; katlanir, varsayilan kapali */
  function cizSipDetay(s) {
    const cx = S.plan.cx, j = cx.jobs[s.id], J = S.e.J[s.id] || {}, A = S.D;
    const onc = { 1: 'acil', 2: 'normal', 3: 'düşük' }[j.onc0 ?? j.oncelik] || '—';
    const mr = cx.mat.res[s.id];
    const malz = mr && mr.det && mr.det.length ? mr.det.map(d => {
      const kay = (d.use || []).map(u => u.k === 'sa' ? (() => { const p = (A.satinalma || [])[u.i] || {}; const t = (A.tedarikciler || []).find(x => x.id === p.tedarikci); return `${Math.round(u.q)} ${esc(d.birim || '')} satın alma, ${p.gelis ? esc(p.gelis.slice(8, 10) + '.' + p.gelis.slice(5, 7) + ' ' + p.gelis.slice(11)) : '?'}${t ? ' · ' + esc(t.ad) : ''}`; })() : `${Math.round(u.q)} ${esc(d.birim || '')} stoktan`).join('; ');
      return `<div class="satir"><span>${esc(d.ad || d.kod)} · ${Math.round(d.need)} ${esc(d.birim || '')}</span><b class="${d.eksikQ > 0 ? 'rozet gec' : ''}">${d.eksikQ > 0 ? 'eksik ' + Math.round(d.eksikQ) : 'hazır ' + tz(d.t)}</b></div>${kay ? `<p class="tp-not">${kay}</p>` : ''}`;
    }).join('') : '<p class="tp-not">Malzeme tanımı yok.</p>';
    const kis = [];
    if (j.rel != null) kis.push(`serbest bırakma ${tz(j.rel)}`);
    if (j.buf > 0.05) kis.push(`termin tamponu ${sure(j.buf)}`);
    for (const o of j.ops) { const r = S.plan.ops[o.id];
      if (S.locks[o.id]) kis.push(`${o.k} kilitli ${tz(S.locks[o.id].S)}`);
      if (o.aparat) kis.push(`${o.k} aparat ${esc(o.aparat)}`);
      if (o.fai) kis.push(`${o.k} ilk parça onayı`);
      if (!o.program) kis.push(`${o.k} NC program bekliyor`);
      if (r && r.fas) kis.push(`${o.k} fason ${esc(r.m.slice(1))}`);
      const tz2 = o.c.filter(c => !c.fas).map(c => c.m); if (tz2.length > 1) kis.push(`${o.k} ${tz2.length} tezgâhta yapılabilir (${tz2.join(', ')})`); }
    const kar = J.kar != null ? [['Gelir', j.gelir], ['Malzeme', -(J.mf || 0)], ['Tezgâh', -(J.mc || 0)], ['Ayar', -(J.sc || 0)], ['Fason', -(J.fc || 0)], ['Gecikme bedeli', -(J.p || 0)], ['Erken bekleme', -(J.h || 0)]].filter(([, v]) => Math.abs(v) >= 1).map(([a, v]) => `<div class="satir"><span>${a}</span><b>${tl(v)}</b></div>`).join('') + `<div class="satir"><span><b>Kâr</b></span><b>${tl(J.kar)}</b></div>` : `<p class="tp-not">Kâr hesaplanamıyor: ${esc((J.miss || []).join(', ') || 'eksik veri')}.</p>`;
    if (!U.uyari || U.uyari.plan !== S.plan) U.uyari = { plan: S.plan, L: evaluate(S.plan, stKur(), null, false).warn };
    const uy = U.uyari.L.filter(w => w.j === s.id).map(w => `<p class="tp-not uyari">${ic('alert')} ${esc(w.txt)}</p>`).join('');
    return `<details class="tp-detay" ${U.detayAcik ? 'open' : ''}><summary data-a="detay">${ic('clipboard-check')} Ayrıntı · ${j.adet} adet · ${onc}${j.gelir != null ? ' · ' + tl(j.gelir) : ''}${uy ? ` · <span class="rozet risk">${U.uyari.L.filter(w => w.j === s.id).length} uyarı</span>` : ''}</summary>
      <div class="tp-detay-ic">${uy}
        <h5>Malzeme</h5>${malz}
        <h5>Kısıtlar</h5>${kis.length ? '<ul>' + kis.map(k => `<li>${k}</li>`).join('') + '</ul>' : '<p class="tp-not">Özel kısıt yok.</p>'}
        <h5>Kâr dökümü</h5>${kar}
        ${j.cezaGun ? `<p class="tp-not">Gecikme bedeli günde ${tl(j.cezaGun)}.</p>` : ''}</div></details>`;
  }

  /* ---------- ay ve yil olcegi ---------- */
  /* ay: gun numaralari; yil: ay adlari ve haftalik doluluk hucreleri (cubuklar okunmaz kadar kucuk) */
  function olcekUzun(H, k, cx) {
    const L = [];
    if (U.zoom <= 720) { for (let d = 0; d * 24 < H; d++) { const t = t2d(d * 24), tat = cx.days[d] && (cx.days[d].tatil || !cx.days[d].vard.length);
      L.push(`<div class="tp-gun kisa ${tat ? 'tatil' : ''} ${t.getUTCDay() === 1 ? 'hafta-bas' : ''}" style="left:${d * 24 * k}px;width:${24 * k}px" title="${tz(d * 24).slice(0, -6)}">${t.getUTCDate()}</div>`); }
      return L; }
    const b = t2d(0); let y = b.getUTCFullYear(), m = b.getUTCMonth();
    for (;;) { const x0 = (Date.UTC(y, m, 1) - b) / 36e5; if (x0 >= H) break; const x1 = Math.min(H, (Date.UTC(y, m + 1, 1) - b) / 36e5), a = Math.max(0, x0);
      L.push(`<div class="tp-gun kisa" style="left:${a * k}px;width:${(x1 - a) * k}px">${AYK[m]}${m === 0 ? ' ' + y : ''}</div>`); if (++m > 11) { m = 0; y++; } }
    return L;
  }
  const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  function haftaHucre(ops, M, H, k) {
    let h = ''; for (let w0 = 0; w0 < Math.min(H, HDAYS * 24); w0 += 168) {
      const w1 = w0 + 168, ac = M ? workIn(M.rw, w0, w1) : 168; let is = 0; for (const r of ops) is += Math.max(0, Math.min(r.C, w1) - Math.max(r.S, w0)); if (is < 0.05) continue;
      const o = Math.min(1, is / Math.max(1, ac)), y = Math.round(o * 100);
      h += `<button class="tp-hafta ${o >= 0.85 ? 'dolu' : ''}" data-a="haftaGit" data-v="${w0}" style="left:${w0 * k}px;width:${Math.max(4, 168 * k - 1)}px;--yuk:${Math.max(12, y)}%" title="${gs(w0)} haftası · doluluk %${y} · haftaya git"></button>`; }
    return h;
  }

  /* ---------- suzgec ---------- */
  /* istasyon (tezgah grubu), tezgah ve uretim emri; uymayan is ve satir soluklasir, liste daralir, plan degismez */
  function suzUyar(r) { const f = U.suz; if (!f) return true; const g = tezGrup(r.m);
    return (!f.g || g === f.g) && (!f.m || r.m === f.m) && (!f.j || r.job === f.j || r.job.startsWith(f.j + '/')); }
  function tezGrup(m) { const t = S.D.tezgahlar.find(x => x.id === m); return t ? t.grup : 'fason'; }
  function grupAd(g) { return g[0].toLocaleUpperCase('tr') + g.slice(1); }
  function suzKoy(k, v) { const f = { ...(U.suz || {}) }; f[k] = f[k] === v ? null : v;
    if (k === 'g' && f.m && f.g && tezGrup(f.m) !== f.g) f.m = null;
    U.suz = Object.values(f).some(Boolean) ? f : null; cizHafif(); }
  /* ---------- pano ---------- */
  function pph() { const p = $('#tp-pano'); const w = (p ? p.clientWidth : innerWidth - (innerWidth >= 1024 ? 348 : 0)) - etiketGen(); return Math.max(U.zoom > 168 ? 0.01 : 4, w / U.zoom); }
  function etiketGen() { return innerWidth < 768 ? 72 : 115; }
  function ufuk() { let mx = 0; for (const r of Object.values(S.plan.ops)) if (isFinite(r.C)) mx = Math.max(mx, r.C); const h = Math.min(HDAYS * 24, Math.ceil((mx + 24) / 24) * 24 + 24); return U.zoom > 168 ? Math.max(h, U.zoom) : h; }
  function satirlar() {
    const cx = S.plan.cx; const R = S.D.tezgahlar.map(m => ({ m: m.id, ad: m.ad, grup: m.grup }));
    const fas = new Set(Object.values(S.plan.ops).filter(r => r.fas).map(r => r.m));
    for (const f of S.D.fasoncular || []) if (fas.has('@' + f.id)) R.push({ m: '@' + f.id, ad: f.ad, grup: 'fason' });
    R.forEach((r, i) => r.son = !R[i + 1] || R[i + 1].grup !== r.grup);
    return R;
  }
  function cizPano(on) {
    const P = on || null; const plan = P ? P.p : S.plan; const e = P ? P.e : S.e;
    const k = pph(), H = ufuk(), W = H * k, cx = plan.cx;
    const gunler = U.zoom > 168 ? olcekUzun(H, k, cx) : []; for (let d = 0; U.zoom <= 168 && d * 24 < H; d++) {
      const x = d * 24 * k, tat = cx.days[d] && (cx.days[d].tatil || !cx.days[d].vard.length);
      const adim = U.zoom <= 24 ? 2 : U.zoom <= 72 ? 6 : 12;
      let s = ''; for (let h = adim; h < 24; h += adim) s += `<span class="tp-saat" style="left:${x + h * k}px">${String(h).padStart(2, '0')}</span>`;
      gunler.push(`<div class="tp-gun ${tat ? 'tatil' : ''}" style="left:${x}px;width:${24 * k}px">${gs(d * 24)}${tat ? ' · kapalı' : ''}</div>${s}`);
    }
    const bil = {}; for (const j in e.J) bil[j] = sipBilgi(j, plan, e);
    /* doluluk gorunen ufukta: islenen saat / acik saat; en dolu tezgah %85 ustundeyse darbogaz */
    const u0 = 7, u1 = 7 + U.zoom; const yuk = {}; for (const r of Object.values(plan.ops)) if (isFinite(r.C) && r.S < u1) yuk[r.m] = (yuk[r.m] || 0) + Math.max(0, Math.min(r.C, u1) - Math.max(r.S, u0));
    const oranOf = m => { const M = cx.M[m]; return M ? Math.min(1, (yuk[m] || 0) / Math.max(1, workIn(M.rw, u0, u1))) : 0; };
    let dar = null, darO = 0.85; for (const m of S.D.tezgahlar) { const o = oranOf(m.id); if (o >= darO) { darO = o; dar = m.id; } }
    const eskiler = P ? P.eski : null, yil = U.zoom >= 8760, f = U.suz, dnk = P || yil ? {} : dnKatman(k);
    const emirTez = f && f.j ? new Set(Object.values(plan.ops).filter(r => r.job === f.j || r.job.startsWith(f.j + '/')).map(r => r.m)) : null;
    const sat = satirlar().map(R => {
      const M = cx.M[R.m];
      let kap = ''; if (M && !yil) { let t = 0; for (const [a, b] of M.rw) { if (a >= H) break; if (a > t) kap += `<div class="tp-kapali" style="left:${t * k}px;width:${(a - t) * k}px"></div>`; t = b; } if (t < H) kap += `<div class="tp-kapali" style="left:${t * k}px;width:${(H - t) * k}px"></div>`; }
      const ar = (P && P.down ? P.down : S.down).filter(d => d.m === R.m).map(d => `<div class="tp-ariza" style="left:${d.from * k}px;width:${(d.to - d.from) * k}px">${ic('alert')} Arıza</div>`).join('');
      const ops = Object.values(plan.ops).filter(r => r.m === R.m && isFinite(r.C));
      const cub = yil ? haftaHucre(ops, M, H, k) : ops.map(r => cizCubuk(r, k, bil[r.job], P)).join('');
      const soluk = f && ((f.g && R.grup !== f.g) || (f.m && R.m !== f.m) || (emirTez && !emirTez.has(R.m)));
      const eski = eskiler ? Object.values(eskiler).filter(x => x.m === R.m).map(x => `<div class="tp-eski" style="left:${x.S * k}px;width:${Math.max(2, (x.C - x.S) * k)}px"></div>`).join('') : '';
      const hedef = U.surukle && U.surukle.m === R.m ? (U.surukle.yasak ? 'yasak' : 'hedef') : '';
      const oran = oranOf(R.m), darb = dar === R.m;
      return `<div class="tp-satir ${R.son ? 'grup-son' : ''} ${hedef} ${soluk ? 'soluk' : ''}" data-m="${esc(R.m)}">
        <div class="tp-m ${darb ? 'darbogaz' : ''}" data-a="tezgah" data-m="${esc(R.m)}" title="${esc(R.ad)} · görünen sürede doluluk %${Math.round(oran * 100)}${darb ? ' · darboğaz' : ''}"><b>${esc(R.m[0] === '@' ? R.m.slice(1) : R.m)}${M ? `<span class="yuzde">${darb ? ic('fire') : ''}%${Math.round(oran * 100)}</span>` : ''}</b><small>${esc(R.ad)}</small>${M ? `<span class="yuk"><i style="width:${oran * 100}%"></i></span>` : ''}</div>
        <div class="tp-zaman" style="width:${W}px">${kap}${ar}${eski}${cub}${dnk[R.m] || ''}</div></div>`;
    }).join('');
    const now = 7, frz = now + S.frz, sol = `calc(${etiketGen()}px + `;
    return `<div class="tp-ic-alan" style="width:${W + etiketGen()}px">
      <div class="tp-olcek"><div class="tp-olcek-bos"><button class="tp-tus kucuk yalin" data-a="dondurma" title="İlk saatler donuk: bu bölgedeki işler taşınmaz">${ic('lock')} ${S.frz} sa</button></div><div class="tp-olcek-zaman" style="width:${W}px">${gunler.join('')}</div></div>
      ${sat}
      <div class="tp-donuk" style="left:${sol}${now * k}px);width:${S.frz * k}px;top:0"></div>
      <div class="tp-simdi" style="left:${sol}${now * k}px)" title="Şimdi"></div>
      ${H > HDAYS * 24 ? `<div class="tp-ufuk" style="left:${sol}${HDAYS * 24 * k}px)"><span>${ic('alert')} Motor ${HDAYS / 7} hafta planlar; ötesi için talep tahmini gerekir</span></div>` : ''}
      ${P && P.hayalet ? P.hayalet : ''}
    </div>`;
  }
  function cizCubuk(r, k, b, P) {
    const w = Math.max(3, (r.C - r.S) * k), x = r.S * k;
    const sabit = r.done || r.act || r.S < 7 + S.frz - 1e-6;
    const sec = U.secOp === r.id, vur = U.secJob && U.secJob === r.job;
    const sol = (U.secJob && !vur && !(U.surukle && U.surukle.id === r.id)) || (U.suz && !suzUyar(r));
    const durum = b ? b.durum : 'iyi';
    const o = S.plan.cx.byId[r.id] || {};
    const kayan = P && P.eski && P.eski[r.id];
    const yz = w > 46 ? `<span class="yazi"><b>${esc(r.job)}</b>${w > 80 ? ' · ' + esc(o.k || '') : ''}${w > 110 ? `<small>${esc(o.ad || '')}</small>` : ''}</span>` : w > 22 ? `<span class="yazi"><b>${esc(String(r.job).replace(/^\D+-?/, '').slice(-3))}</b></span>` : '';
    const ayar = r.su > 0 && r.Su > r.S ? `<span class="ayar" style="width:${Math.min(w, (r.Su - r.S) * k)}px"></span>` : '';
    /* calisan is: sayim varsa islenen adet, yoksa gecen sure oraninda dolar (391 a) */
    const g = S.gercek[r.id];
    const calisiyor = !r.done && !r.fas && (g || (r.S < 7 - 1e-6 && r.C > 7));
    const ilr = calisiyor ? (g && g.n != null && o.adet ? g.n / o.adet : g ? 0 : (7 - r.S) / Math.max(1e-6, r.C - r.S)) : null;
    const sap = g && g.plan != null ? g.S - g.plan : 0;
    const dolum = ilr != null ? `<span class="ilerleme" style="width:${Math.min(100, ilr * 100)}%" title="İlerleme %${Math.round(ilr * 100)}"></span>` : '';
    let etk = '';
    if (P && P.etki) { const z = P.etki[r.job] ?? (U.surukle && U.surukle.id === r.id ? 0 : null); if (z != null && P.son[r.job] === r.id) etk = `<span class="tp-etki ${z > 0.24 ? 'kotu' : z < -0.24 ? 'iyi' : 'notr'}" style="left:${x + w}px;top:0">${Math.abs(z) < 0.25 ? '±0' : (z > 0 ? '+' : '−') + sure(z)}</span>`; }
    return `<div class="tp-cubuk ${durum === 'iyi' ? '' : durum} ${r.done ? 'bitti' : ''} ${sabit ? 'sabit' : ''} ${r.fas ? 'fason' : ''} ${sol ? 'soluk' : ''} ${vur ? 'vurgu' : ''} ${sec ? 'secili' : ''} ${kayan ? 'kayan' : ''} ${S.locks[r.id] && S.locks[r.id].tur === 'onay' ? 'onay-kilit' : ''}"
      data-a="op" data-id="${esc(r.id)}" style="left:${x}px;width:${w}px" title="${esc(r.job)} · ${esc(o.ad || '')} · ${tz(r.S)} → ${tz(r.C)}${ilr != null ? ' · ilerleme %' + Math.round(ilr * 100) : ''}">${dolum}${ayar}${yz}${g ? `<span class="gercek ${sap > 0.5 ? 'sapma' : ''}" title="Atölyeden geldi${sap > 0.5 ? ', plandan ' + Math.round(sap * 60) + ' dk geç' : ''}">${ic('play')}${sap > 0.5 ? '+' + Math.round(sap * 60) + 'dk' : ''}</span>` : ''}${S.locks[r.id] && !S.locks[r.id].kim ? `<span class="kilit">${ic('lock')}</span>` : ''}</div>${etk}`;
  }

  /* ---------- kart (secilen oge, tezgah olayi, gonderim) ---------- */
  function kartAc(tur, veri, ankraj) { U.kart = { tur, veri, ankraj }; cizKart(); }
  function kartKapat() { U.kart = null; cizKart(); }
  function cizKart() {
    /* odaktaki secim kutusu kaldirilirken blur yeniden cizim tetiklemesin */
    let k = $('#tp-kart'); if (k && k.contains(document.activeElement)) document.activeElement.blur(); k = $('#tp-kart'); if (k) k.remove(); let p = $('#tp-perde'); if (p) p.remove();
    if (!U.kart) return;
    const h = KART[U.kart.tur](U.kart.veri); if (!h) { U.kart = null; return; }
    document.body.insertAdjacentHTML('beforeend', `<div class="tp-perde" id="tp-perde" data-a="kapatPerde"></div><div class="tp-kart" id="tp-kart" role="dialog">${h}</div>`);
    k = $('#tp-kart'); const a = U.kart.ankraj;
    if (a && innerWidth >= 768) {
      const kw = k.offsetWidth, kh = k.offsetHeight; let x = a.x, y = a.y + 8;
      if (x + kw > innerWidth - 16) x = innerWidth - 16 - kw; if (y + kh > innerHeight - 16) y = Math.max(64, a.y - kh - 8);
      k.style.left = Math.max(16, x) + 'px'; k.style.top = Math.max(64, y) + 'px';
    } else if (innerWidth >= 768) { k.style.right = '16px'; k.style.top = '72px'; }
    const f = k.querySelector('[data-oto]'); if (f) f.focus();
  }
  /* plan ve gerceklesen: donuk bolgedeki is icin baslama ve sayim girisi (atolyeden gelecek verinin yerine); sapma 30 dk'yi gecerse uyari */
  function cizGercek(id, r, o) {
    const g = S.gercek[id]; if (r.fas || r.done) return '';
    if (!g) { if (r.S > 7 + S.frz + 1e-6) return '';
      return `<label>Atölyeden (deneme): gerçek başlama</label><div class="tp-cipler">${[[0, 'Planlı saatte'], [0.5, '+30 dk'], [1, '+1 sa'], [2, '+2 sa']].map(([v, a]) => `<button class="tp-cip" data-a="basladi" data-id="${esc(id)}" data-v="${v}">${a}</button>`).join('')}</div>`; }
    const sap = g.S - (g.plan ?? g.S);
    return `<div class="satir"><span>Gerçek başlama</span><b class="${sap > 0.5 ? 'rozet risk' : ''}">${tz(g.S)}${Math.abs(sap) >= 0.25 ? ` (${sap > 0 ? '+' : '−'}${Math.round(Math.abs(sap) * 60)} dk)` : ''}</b></div>
      ${sap > 0.5 ? `<p class="tp-not uyari">${ic('alert')} Plandan ${Math.round(sap * 60)} dk sapma; ardındaki işler kaydı.</p>` : ''}
      <label for="tp-sayim-n">Sayım: işlenen adet (toplam ${o.adet})</label><div class="tp-cipler" style="flex-wrap:nowrap"><input id="tp-sayim-n" type="number" min="0" max="${o.adet}" value="${g.n ?? 0}"><button class="tp-tus kucuk" data-a="sayim" data-id="${esc(id)}">${ic('check')} Kaydet</button></div>
      ${g.n != null ? `<p class="tp-not">Kalan ${o.adet - g.n} adet, motor bitişi ${tz(r.C)} hesapladı.</p>` : ''}`;
  }
  const BOL_MAKS = 20;
  const KART = {
    op(id) {
      const r = S.plan.ops[id]; if (!r) return '';
      const o = S.plan.cx.byId[id], b = sipBilgi(r.job);
      const ok = S.locks[id] && S.locks[id].kim ? S.locks[id] : null;
      const sabit = r.done || r.act || r.S < 7 + S.frz - 1e-6 || !!ok;
      const alt = U.alt && U.alt.id === id ? U.alt.L : [];
      const neden = r.why && NEDEN[r.why.t] ? NEDEN[r.why.t] + (r.why.t === 'tezgah' && r.why.r ? ` (${r.why.r} bitişini bekliyor)` : '') : '—';
      return `<h3>${ic('cube')} ${esc(r.job)} · ${esc(o.k)}<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <p class="tp-not">${esc(o.ad || '')} · ${esc(b.ad)}</p>
        <div class="satir"><span>Tezgâh</span><b>${esc(r.fas ? r.m.slice(1) : r.m)}</b></div>
        <div class="satir"><span>Başlangıç → bitiş</span><b>${tz(r.S)} → ${tz(r.C)}</b></div>
        <div class="satir"><span>Neden bu saatte</span><b>${esc(neden)}</b></div>
        ${S.locks[id] && r.S > S.locks[id].S + 0.25 ? `<p class="tp-not uyari">${ic('alert')} Kilit saati ${tz(S.locks[id].S)} tutmadı: ${esc(neden)}.</p>` : ''}
        <div class="satir"><span>Sipariş bitişi / termin</span><b class="${b.durum === 'gec' ? 'rozet gec' : ''}">${tz(b.C)} / ${tz(b.due)}</b></div>
        ${alt.length ? `<label>Başka tezgâhta (sipariş bitişine etkisi)</label><div class="tp-cipler">${alt.map((x, i) => `<button class="tp-cip" data-a="alt" data-i="${i}" title="${esc(x.metin)}">${esc(x.m)} <b class="${x.d < 0 ? 'rozet iyi' : x.d > 0 ? 'rozet gec' : ''}">${Math.abs(x.d) < 0.25 ? '±0' : (x.d < 0 ? '−' : '+') + sure(x.d)}</b></button>`).join('')}</div>` : ''}
        ${ok ? `<p class="tp-not uyari" style="margin-top:var(--b-2)">${ic('lock')} ${ok.kim} (taklit) ${ok.tur === 'onay' ? 'bu değişikliği onaya gönderdi; onay bekliyor, kilitli' : 'değişikliği onaylandı; canlı planda'}.</p>` : sabit ? `<p class="tp-not" style="margin-top:var(--b-2)">${ic('lock')} Donuk bölgede ya da başlamış; taşınmaz.</p>` : ''}
        ${cizGercek(id, r, o)}
        <div class="eylem">
          ${sabit ? '' : S.locks[id] ? `<button class="tp-tus kucuk" data-a="kilitAc" data-id="${esc(id)}">${ic('lock')} Kilidi aç</button>` : `<button class="tp-tus kucuk" data-a="kilitle" data-id="${esc(id)}" title="Bu saat ve tezgâhta sabit kalır">${ic('lock')} Bu saatte kilitle</button>`}
          <button class="tp-tus kucuk" data-a="sipGoster" data-j="${esc(r.job)}">${ic('list')} Siparişi aç</button>
        </div>
        ${sabit ? '' : '<p class="tp-not" style="margin-top:var(--b-2)">İpucu: çubuğu sürükleyerek başka saate ya da tezgâha taşı; etkisi bırakmadan önce görünür.</p>'}`;
    },
    suz() {
      const f = U.suz || {}, R = satirlar(), G = [...new Set(R.map(x => x.grup))];
      return `<h3>${ic('eye')} Süz<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <p class="tp-not">Seçilene uymayan işler soluklaşır, sipariş listesi daralır; plan değişmez.</p>
        <label>İstasyon</label><div class="tp-cipler">${G.map(g => `<button class="tp-cip" data-a="suzG" data-v="${esc(g)}" aria-pressed="${f.g === g}">${esc(grupAd(g))}</button>`).join('')}</div>
        <label>Tezgâh</label><div class="tp-cipler">${R.filter(x => !f.g || x.grup === f.g).map(x => `<button class="tp-cip" data-a="suzM" data-v="${esc(x.m)}" aria-pressed="${f.m === x.m}" title="${esc(x.ad)}">${esc(x.m[0] === '@' ? x.m.slice(1) : x.m)}</button>`).join('')}</div>
        <label for="tp-suz-j">Üretim emri</label><select id="tp-suz-j" data-ch="suzJ"><option value="">Hepsi</option>${S.D.siparisler.map(x => x.id).sort().map(j => `<option ${f.j === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select>
        <div class="eylem"><button class="tp-tus" data-a="suzTemizle" ${U.suz ? '' : 'disabled'}>${ic('x')} Temizle</button></div>`;
    },
    geri() {
      const saat = t => t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
      const yaz = yazar(), c = dis.canli();
      const L = S.geri.slice().reverse().slice(0, 10).map((g, i) => `<div class="tp-bugun-kar"><span>${esc(g.ad)}<small>${saat(g.t)} · gecikme ${sure(g.once)} → ${sure(g.son)}</small></span><button class="tp-tus kucuk" data-a="geriDon" data-i="${S.geri.length - 1 - i}" ${yaz ? '' : 'disabled'}>${ic('back')} Öncesine dön</button></div>`).join('');
      return `<h3>${ic('back')} Geri al<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        ${L || '<p class="tp-not">Bu panoda geri alınacak karar yok.</p>'}
        <div class="eylem"><button class="tp-tus" data-a="yinele" ${S.ileri.length && yaz ? '' : 'disabled'}>${ic('next')} Yinele</button>
          <button class="tp-tus ${U.sifirOnay ? 'tehlike' : ''}" data-a="taslakSifirla" ${c && c.plan && yaz ? '' : 'disabled'}>${ic('rotate')} ${U.sifirOnay ? 'Eminim, sıfırla' : 'Taslağı sıfırla'}</button></div>
        <p class="tp-not">${!c || !c.plan ? 'Canlı plan yok: sıfırlanacak taban yok.' : U.sifirOnay ? 'Çalışma planı canlı plana döner; bütün taslak değişiklikleri gider. Bu da bir karar olarak listelenir, geri alınabilir.' : 'Sıfırlama tek adım değildir: çalışmayı canlı plana döndürür, onay ister.'}</p>`;
    },
    acil(v) {
      const on = U.onizleme && U.onizleme.tur === 'acil' ? U.onizleme : null;
      const b = on ? on.b : null;
      return `<h3>${ic('fire')} Acil sipariş<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <label for="tp-ac-u">Ürün</label><select id="tp-ac-u" data-ch="acil" data-oto>${S.D.urunler.map(u => `<option value="${u.id}" ${u.id === v.urun ? 'selected' : ''}>${esc(u.ad)}</option>`).join('')}</select>
        <label for="tp-ac-a">Adet</label><input id="tp-ac-a" type="number" min="1" max="999" value="${v.adet}" data-ch="acil">
        <label>Termin</label><div class="tp-cipler">${[[2, '2 gün'], [3, '3 gün'], [5, '5 gün'], [7, '1 hafta']].map(([x, a]) => `<button class="tp-cip" data-a="acilTermin" data-v="${x}" aria-pressed="${v.gun === x}">${a}</button>`).join('')}</div>
        ${on ? on.Y.map(y => `<div class="tp-secenek ${y.k === on.oner ? 'onerilen' : ''}" data-a="acilSec" data-v="${y.k}" aria-pressed="${y.k === on.sec}" style="cursor:pointer"><div><span class="ust">${y.k === on.sec ? ic('check') + ' ' : ''}${y.ad}</span>
          <small>bitiş <b>${tz(y.b.C)}</b> ${y.b.durum === 'gec' ? `<span class="rozet gec">${sure(y.b.T)} geç</span>` : '<span class="rozet iyi">zamanında</span>'}</small><small>diğerleri: ${etkiMetni(y.x)}</small></div></div>`).join('')
          + (on.oner ? '' : '<p class="tp-not uyari">İki yerleşimde de termin tutmuyor: öneri yok, karar senin.</p>') : '<div class="tp-ozet">Hesaplanıyor…</div>'}
        <div class="eylem"><button class="tp-tus ${on && on.sec === on.oner ? 'ana' : ''}" data-a="acilUygula" ${on ? '' : 'disabled'}>${ic('check')} Seçileni plana ekle</button><button class="tp-tus" data-a="kapat">Vazgeç</button></div>`;
    },
    gonder() {
      const f = farkSay(), b = kozet(S.e), a = S.canliE ? kozet(S.canliE) : null, x = S.canliE ? etki(S.canliE, S.e) : null;
      return `<h3>${ic('upload')} Onaya gönder<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <p class="tp-not">Canlı plan onaylanana kadar değişmez. Çalışma planı kontrolden geçer ve onaya gider; sonucu Onay sekmesinde görürsün.</p>
        ${a ? `<div class="satir"><span>Değişen işlem</span><b>${f}</b></div>
        <div class="satir"><span>Bitişi değişen sipariş</span><b>${x.L.length}</b></div>
        <div class="satir"><span>Geciken sipariş</span><b>${a.late} → ${b.late}</b></div>
        <div class="satir"><span>Toplam gecikme</span><b>${sure(a.wT)} → ${sure(b.wT)}</b></div>
        <div class="satir"><span>Kâr</span><b>${tl(a.kar)} → ${tl(b.kar)}</b></div>` : `<p class="tp-not">Henüz canlı plan yok; bu plan ilk canlı plan olarak onaya gider.</p>`}
        <div class="eylem"><button class="tp-tus ana" data-a="gonderOnay" data-oto>${ic('upload')} Gönder</button><button class="tp-tus" data-a="kapat">Vazgeç</button></div>`;
    },
    bol(v) {
      const on = U.onizleme && U.onizleme.tur === 'bol' ? U.onizleme : null, j = S.D.siparisler.find(x => x.id === v.j);
      const top = v.adetler.reduce((x, y) => x + y, 0), hata = v.adetler.some(a => !(a >= 1)) ? 'Her parça en az 1 adet olmalı.' : top !== j.adet ? `Toplam ${top}; ${j.adet} olmalı (${top > j.adet ? top - j.adet + ' fazla' : j.adet - top + ' eksik'}).` : '';
      const roz = b => b.durum === 'gec' ? `<span class="rozet gec">${sure(b.T)} geç</span>` : '<span class="rozet iyi">zamanında</span>';
      const nMax = Math.min(BOL_MAKS, j.adet), n = v.adetler.length;
      const enGec = on ? on.P.reduce((a, q) => (!a || (q.b.C ?? 1e9) > (a.b.C ?? 1e9) ? q : a), null) : null;
      return `<h3>${ic('layers')} ${esc(v.j)} böl · ${j.adet} adet<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <p class="tp-not">İlk parça bugünkü tezgâhında kalır; diğerleri her adımda sıradaki en hızlı başka tezgâha gider. Adlar ${esc(v.j)}/1, /2 …</p>
        <label for="tp-bol-n">Parça sayısı</label><div class="tp-cipler">${[2, 3, 4].filter(x => x <= nMax).map(x => `<button class="tp-cip" data-a="bolSay" data-v="${x}" aria-pressed="${n === x}">${x} parça</button>`).join('')}${nMax > 4 ? `<select id="tp-bol-n" data-ch="bolN" aria-label="Parça sayısı">${Array.from({ length: nMax - 1 }, (_, i) => i + 2).map(x => `<option value="${x}" ${x === n ? 'selected' : ''}>${x}</option>`).join('')}</select>` : ''}</div>
        <label>Adetler</label><div class="tp-bol">${v.adetler.map((a, i) => { const q = on && on.P[i]; return `<div class="tp-bol-sat"><span>${i + 1}.</span><input type="number" min="1" max="${j.adet}" value="${a}" data-ch="bol" data-i="${i}" aria-label="${i + 1}. parça adedi"><small>${q ? `${esc(q.m)} · bitiş <b>${tz(q.b.C)}</b> ${roz(q.b)}` : ''}</small></div>`; }).join('')}</div>
        ${hata ? `<p class="tp-not uyari">${ic('alert')} ${hata}</p>` : on ? `<div class="tp-ozet">${ic('target')} Bölmeden bitiş ${tz(on.b0.C)} ${roz(on.b0)}${enGec ? ` · bölünce en geç parça ${tz(enGec.b.C)}` : ''}<br>Diğer siparişler: ${etkiMetni(on.x)}</div>
          <p class="tp-not">Toplam gecikme her parçanın gecikmesini ayrı sayar; sipariş başına bir kez sayma kararı bekleniyor (35).</p>
          ${on.x.dW > 0.1 || on.x.dKar < -1 ? '<p class="tp-not uyari">Bölme toplamda iyileştirmiyor ya da kârı düşürüyor: öneri yok, karar senin.</p>' : ''}` : '<div class="tp-ozet">Hesaplanıyor…</div>'}
        <div class="eylem"><button class="tp-tus ${on && on.x.dW < -0.1 && on.x.dKar >= -1 ? 'ana' : ''}" data-a="bolUygula" ${on && !hata ? '' : 'disabled'}>${ic('check')} ${n} parçaya böl</button><button class="tp-tus" data-a="kapat">Vazgeç</button></div>`;
    },
    menu() {
      return `<h3>${ic('more')} Diğer<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <label>Ölçek</label><div class="tp-cipler">${OLCEK.map(([z, a]) => `<button class="tp-cip" data-a="zoom" data-v="${z}" aria-pressed="${U.zoom === z}">${a}</button>`).join('')}</div>
        <label>Donuk bölge</label><div class="tp-cipler">${[0, 2, 4, 8, 16, 24].map(x => `<button class="tp-cip" data-a="frz" data-v="${x}" aria-pressed="${S.frz === x}" ${yazar() ? '' : 'disabled'}>${x} sa</button>`).join('')}</div>
        <label>Stüdyo</label><div class="tp-cipler"><button class="tp-cip" data-a="sekmeGit" data-v="onay">${ic('check')} Onay ve canlı</button><button class="tp-cip" data-a="sekmeGit" data-v="pg">${ic('chart')} Plan ve gerçekleşen</button></div>
        <label>Kısayollar</label><p class="tp-not">Ctrl+Z geri al · Ctrl+Y yinele · Esc kapat · 1-5 ölçek · / ara · taşırken Alt: mıknatıs kapalı</p>
        <p class="tp-not">Her karar çalışma planına yazılır; canlı plan yalnız Onay sekmesinden değişir.</p>
        <p class="tp-not">Lejant: kırmızı geç, turuncu riskli (8 sa'ten az pay), çizgili baş ayar, kesikli çerçeve fason, mavi bölge donuk.</p>`;
    },
    dondurma() {
      return `<h3>${ic('lock')} Donuk bölge<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
        <p class="tp-not">Şimdiden itibaren bu kadar saatlik işler yerinde kalır; taşıma ve iyileştirme dokunmaz.</p>
        <div class="tp-cipler">${[0, 2, 4, 8, 16, 24].map(x => `<button class="tp-cip" data-a="frz" data-v="${x}" aria-pressed="${S.frz === x}">${x} sa</button>`).join('')}</div>`;
    },
  };

  /* ---------- olaylar ve üç tepki (eski Kriz masası) ----------
     Olay önce önizlenir; üç tepki aynı olayla hesaplanır: sırayı koru (işler kendi kuyruğunda kayar), motor toparlasın (donuk bölge
     dışı kısa sürede yeniden düzenlenir), ek mesaiyle toparla (en yakın boş vardiyalar açılır). Plana yalnız seçilen tepki girer. */
  const OLAY = [['ariza', 'Arıza ya da bakım', 'alert', 'Tezgâh duruyor'], ['acil', 'Acil sipariş', 'fire', 'Ekle, nereye sığdığını gör'], ['malzeme', 'Malzeme gecikti', 'box', 'Satın alma geç geliyor'],
    ['eksik', 'Personel eksik', 'user', 'Bir vardiyada kişi eksik'], ['fason', 'Fason gecikti', 'truck', 'Fasoncu geç teslim ediyor']];
  const hmx = s => { const [a, b] = String(s || '0').split(':').map(Number); return a + (b || 0) / 60; };
  function vardiyaSa(id) { const v = S.D.vardiyalar.find(x => x.id === id); if (!v) return 0; const a = hmx(v.bas); let b = hmx(v.bit); if (b <= a) b += 24; return b - a; }
  function olayVarsayilan(tip, m) {
    const D = S.D, t = D.tezgahlar.find(x => x.id === m);
    if (tip === 'ariza') return { tip, m: m || (U.secOp ? S.plan.ops[U.secOp].m : (D.tezgahlar[1] || D.tezgahlar[0]).id), bas: 0, saat: 4 };
    if (tip === 'malzeme') return { tip, kod: (D.malzemeler || []).length ? D.malzemeler[0].kod : null, gun: 2 };
    if (tip === 'eksik') return { tip, gun: Math.floor(7 / 24), vardiya: D.vardiyalar[0].id, grup: (t || D.tezgahlar[0]).grup, n: 1 };
    return { tip: 'fason', f: (D.fasoncular || []).length ? D.fasoncular[0].id : null, gun: 2 };
  }
  /* arıza çalışma planının arızalarına, diğerleri uygulamanın olay listesine eklenir; ikisi de motorun bildiği biçimdir */
  function olayEk(v) {
    if (v.tip === 'ariza') { const bas = 7 + v.bas; return { down: [...S.down, { m: v.m, from: bas, to: bas + v.saat }] }; }
    return { olaylar: [...S.olaylar, { ...v }] };
  }
  const olayAdi = v => v.tip === 'ariza' ? `${v.m} arıza ${v.saat} sa` : dis.olayAd(v);
  const olayEksik = v => (v.tip === 'malzeme' && !v.kod) || (v.tip === 'fason' && !v.f);
  const mesaiAdi = L => L.map(e => `${e.m} ${gs(e.gun * 24)} ${e.vardiya}`).join(', ');
  /* boş vardiya: tezgâhın çalışmadığı, donuk bölgeden sonra başlayan ve henüz açılmamış vardiyalar */
  function vardiyaBos(m, g0, n, em) {
    const D = S.D, t = D.tezgahlar.find(x => x.id === m); if (!t || !(t.vardiyalar || []).length) return [];
    const L = [];
    for (let g = g0; g < g0 + 5 && L.length < n; g++) for (const v of D.vardiyalar)
      if (L.length < n && !t.vardiyalar.includes(v.id) && g * 24 + hmx(v.bas) >= 7 + S.frz && !em.some(e => e.m === m && e.gun === g && e.vardiya === v.id)) L.push({ m, gun: g, vardiya: v.id });
    return L;
  }
  function yukSirasi(p, grup) {
    const y = {}; for (const r of Object.values(p.ops)) if (!r.fas && isFinite(r.C) && r.S < 127) y[r.m] = (y[r.m] || 0) + Math.max(0, Math.min(r.C, 127) - Math.max(r.S, 7));
    return S.D.tezgahlar.filter(t => !grup || t.grup === grup).map(t => t.id).sort((a, b) => (y[b] || 0) - (y[a] || 0));
  }
  /* ek mesai tepkisi: arızada arızalı tezgâh ve grubu, personelde o grup, diğerlerinde en dolu tezgâh; olaydan sonraki ilk iki boş vardiya */
  function mesaiAday(v, p) {
    const g0 = Math.floor((v.tip === 'ariza' ? 7 + v.bas + v.saat : 7) / 24);
    const grup = v.tip === 'ariza' ? (S.D.tezgahlar.find(x => x.id === v.m) || {}).grup : v.tip === 'eksik' && v.grup !== 'ayar' ? v.grup : null;
    for (const m of [...(v.tip === 'ariza' ? [v.m] : []), ...yukSirasi(p, grup)]) { const l = vardiyaBos(m, g0, 2, S.ekMesai); if (l.length) return l; }
    return [];
  }
  /* motor kısa süre toparlar; donuk bölgeye ve kilitlere dokunmaz, sonuç daha iyi değilse plan olduğu gibi kalır */
  function toparla(z, ms = 600) {
    const L = lns(z.st, z.p, null, { ms, seed: 7, free: false });
    if (cmpEv(L.e, z.e) <= 0 || (L.plan.fail || []).length > (z.p.fail || []).length) return z;
    slack(L.plan, z.p.cx); bagla(L.plan, z.p.cx); return { p: L.plan, st: z.st, e: degerle(L.plan, z.st) };
  }
  function* tepkiGen(v) {
    const ek = olayEk(v), z0 = coz([], ek);
    yield { k: 'koru', ad: 'Sırayı koru', acik: 'Kimse yer değiştirmez; olaydan etkilenen işler kendi kuyruğunda kayar.', z: z0, ek };
    const z1 = toparla(z0);
    yield { k: 'motor', ad: 'Motor toparlasın', acik: 'Donuk bölge dışındaki işler kısa sürede yeniden düzenlenir; başka işlerin sırası da değişebilir.', z: z1, ek };
    const mes = mesaiAday(v, z1.p);
    if (!mes.length) { yield { k: 'mesai', ad: 'Ek mesaiyle toparla', acik: 'Uygun boş vardiya yok: ilgili tezgâhlar bütün vardiyalarda çalışıyor.', yok: true }; return; }
    const ek2 = { ...ek, ekMesai: [...S.ekMesai, ...mes] }, st2 = stKur(ek2), cx2 = compile(st2);
    const p0 = lnsDecode(st2, { ops: z1.p.ops, fail: z1.p.fail || [] }, [], cx2, false, true); slack(p0, cx2); bagla(p0, cx2);
    yield { k: 'mesai', ad: 'Ek mesaiyle toparla', acik: `Ek vardiya açılır: ${mesaiAdi(mes)}.`, z: toparla({ p: p0, st: st2, e: degerle(p0, st2) }), ek: ek2 };
  }
  const tepkiSecili = T => T && (T.L.find(t => t.k === T.sec) || T.L.find(t => t.k === T.oner) || T.L[0]);
  function tepkiBaslat() {
    const v = U.kart.veri, tok = {}; U.tepki = { tok, L: [], bitti: false, sec: null, oner: null };
    if (olayEksik(v)) { U.tepki.bitti = true; cizKart(); return; }
    const it = tepkiGen(v);
    const adim = () => {
      const T = U.tepki; if (!T || T.tok !== tok) return;
      let r; try { r = it.next(); } catch (e) { T.bitti = true; T.hata = String(e.message || e); cizKart(); return; }
      if (r.done) T.bitti = true; else { const t = r.value; if (t.z) t.x = etki(S.e, t.z.e); T.L.push(t); }
      /* öneri en az gecikmedir; fark 0,1 saatten azsa önceki (daha az değişiklik) kalır */
      if (T.bitti) { const iyi = T.L.filter(t => t.z); T.oner = iyi.length ? iyi.reduce((a, b) => (b.z.e.wT < a.z.e.wT - 0.1 ? b : a)).k : null; }
      if (U.kart && U.kart.tur === 'olay3') { cizKart(); const s = tepkiSecili(T); if (s && s.z) { U.onizleme = { tur: 'olay3' }; onizlemeCiz(s.z, s.ek.down); } }
      if (!T.bitti) setTimeout(adim, 0);
    };
    setTimeout(adim, 0);
  }
  KART.olay3 = v => {
    const D = S.D, T = U.tepki, tip = v.tip, gruplar = [...new Set(D.tezgahlar.map(m => m.grup))];
    const cip = (k, val, ad, cur) => `<button class="tp-cip" data-a="olayDeg" data-k="${k}" data-v="${esc(val)}" aria-pressed="${String(cur) === String(val)}">${ad}</button>`;
    const sec = (k, id, ad, L, cur) => `<label for="${id}">${ad}</label><select id="${id}" data-ch="olayDeg" data-k="${k}">${L.map(([x, a]) => `<option value="${esc(x)}" ${String(x) === String(cur) ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
    let alan = '';
    if (tip === 'ariza') alan = sec('m', 'tp-ol-m', 'Tezgâh', D.tezgahlar.map(m => [m.id, `${m.id} · ${m.ad}`]), v.m)
      + `<label>Başlangıç</label><div class="tp-cipler">${[[0, 'Şimdi'], [2, '+2 sa'], [8, '+8 sa'], [24, 'Yarın']].map(([x, a]) => cip('bas', x, a, v.bas)).join('')}</div>`
      + `<label>Süre</label><div class="tp-cipler">${[2, 4, 8, 16, 24].map(x => cip('saat', x, x + ' sa', v.saat)).join('')}</div>`;
    else if (tip === 'malzeme') alan = (D.malzemeler || []).length ? sec('kod', 'tp-ol-k', 'Malzeme', D.malzemeler.map(m => [m.kod, `${m.kod} · ${m.ad}`]), v.kod)
      + `<label>Gecikme</label><div class="tp-cipler">${[1, 2, 3, 5, 7].map(x => cip('gun', x, x + ' gün', v.gun)).join('')}</div>` : '<p class="tp-not">Bu veride malzeme yok.</p>';
    else if (tip === 'eksik') alan = `<label>Gün</label><div class="tp-cipler">${[0, 1, 2].map(x => cip('gun', x, x === 0 ? 'Bugün' : x === 1 ? 'Yarın' : gs(x * 24), v.gun)).join('')}</div>`
      + sec('vardiya', 'tp-ol-v', 'Vardiya', D.vardiyalar.map(x => [x.id, `${x.id} · ${x.bas}-${x.bit}`]), v.vardiya)
      + sec('grup', 'tp-ol-g', 'Kimler', [...gruplar.map(g => [g, grupAd(g) + ' operatörü']), ['ayar', 'Ayarcı']], v.grup)
      + `<label>Eksik kişi</label><div class="tp-cipler">${[1, 2, 3].map(x => cip('n', x, String(x), v.n)).join('')}</div>`;
    else alan = (D.fasoncular || []).length ? sec('f', 'tp-ol-f', 'Fasoncu', D.fasoncular.map(f => [f.id, `${f.id} · ${f.ad}`]), v.f)
      + `<label>Ek gün</label><div class="tp-cipler">${[1, 2, 3, 5].map(x => cip('gun', x, x + ' gün', v.gun)).join('')}</div>` : '<p class="tp-not">Bu veride fasoncu yok.</p>';
    const s = tepkiSecili(T);
    const kart = t => t.yok ? `<div class="tp-secenek"><div><span class="ust">${esc(t.ad)}</span><small>${esc(t.acik)}</small></div></div>`
      : `<div class="tp-secenek ${t.k === T.oner ? 'onerilen' : ''}" data-a="tepkiSec" data-v="${t.k}" aria-pressed="${s === t}" role="button" tabindex="0"><div><span class="ust">${s === t ? ic('check') + ' ' : ''}${esc(t.ad)}${t.k === T.oner ? ' <span class="rozet iyi">önerilen</span>' : ''}</span>
        <small>${esc(t.acik)}</small><small>gecikme <b>${sure(t.z.e.wT)}</b> · geciken ${t.z.e.late} · ${etkiMetni(t.x)}</small></div></div>`;
    const bek = T && !T.bitti ? Array.from({ length: Math.max(0, 3 - T.L.length) }, () => `<div class="tp-ozet">${ic('rotate')} Hesaplanıyor…</div>`).join('') : '';
    return `<h3>${ic((OLAY.find(o => o[0] === tip) || OLAY[0])[2])} ${esc((OLAY.find(o => o[0] === tip) || OLAY[0])[1])}<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
      <div class="tp-cipler">${OLAY.map(([k, ad, sm]) => `<button class="tp-cip" data-a="olayAc" data-v="${k}" aria-pressed="${k === tip}" title="${esc(ad)}">${ic(sm)}</button>`).join('')}</div>
      ${alan}
      <label>Üç tepki</label>
      ${T && T.hata ? `<p class="tp-not uyari">${ic('alert')} Hesaplanamadı: ${esc(T.hata)}</p>` : ''}
      ${T ? T.L.map(kart).join('') + bek : ''}
      <p class="tp-not">Olay plana yalnız seçilen tepkiyle birlikte girer; Vazgeç dersen hiçbir şey değişmez.</p>
      <div class="eylem"><button class="tp-tus ana" data-a="tepkiUygula" ${s && s.z && T.bitti ? '' : 'disabled'}>${ic('check')} Plana işle</button><button class="tp-tus" data-a="kapat">Vazgeç</button></div>`;
  };

  /* ---------- ek mesai (eski Tezgâh sekmesi) ----------
     Tezgâhın çalışmadığı bir vardiyayı açmak ya da açılmış ek mesaiyi kaldırmak önce önizlenir; haftalık sınır uyarı olarak gösterilir. */
  function mesaiHafta(em) { const w = {}; for (const e of em) { const k = Math.floor(e.gun / 7); w[k] = (w[k] || 0) + vardiyaSa(e.vardiya); } return w; }
  function mesaiOnizle() {
    const v = U.kart.veri; if (v.ekle == null && v.kaldir == null) { U.onizleme = null; cizKart(); return; }
    const adaylar = vardiyaBos(v.m, Math.floor(7 / 24), 10, S.ekMesai);
    const em = v.ekle != null ? [...S.ekMesai, adaylar[v.ekle]] : S.ekMesai.filter((e, i) => i !== v.kaldir);
    const z = toparla(coz([], { ekMesai: em }), 500);
    U.onizleme = { tur: 'mesai', z, em, x: etki(S.e, z.e), ad: v.ekle != null ? `Ek mesai: ${mesaiAdi([adaylar[v.ekle]])}` : `Ek mesai kaldırıldı: ${mesaiAdi([S.ekMesai[v.kaldir]])}` };
    cizKart(); onizlemeCiz(z);
  }
  KART.mesai = v => {
    const m = v.m, t = S.D.tezgahlar.find(x => x.id === m) || {}, on = U.onizleme && U.onizleme.tur === 'mesai' ? U.onizleme : null;
    const adaylar = vardiyaBos(m, Math.floor(7 / 24), 10, S.ekMesai), acik = S.ekMesai.map((e, i) => [e, i]).filter(([e]) => e.m === m);
    const butce = dis.mesaiButce(), hafta = mesaiHafta(on ? on.em : S.ekMesai), asan = butce ? Object.entries(hafta).filter(([, h]) => h > butce + 1e-9) : [];
    const buH = hafta[Math.floor(7 / 24 / 7)] || 0;
    return `<h3>${ic('clock')} Ek mesai · ${esc(m)}<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button></h3>
      <p class="tp-not">${esc(t.ad || '')} · çalıştığı vardiyalar: ${esc((t.vardiyalar || []).join(', ') || '—')}</p>
      <label>Açılabilecek vardiya</label>${adaylar.length ? `<div class="tp-cipler">${adaylar.map((x, i) => `<button class="tp-cip" data-a="mesaiSec" data-v="${i}" aria-pressed="${v.ekle === i}">${gs(x.gun * 24)} ${esc(x.vardiya)}</button>`).join('')}</div>` : '<p class="tp-not">Önümüzdeki beş günde boş vardiya yok.</p>'}
      ${acik.length ? `<label>Açılmış ek mesai</label><div class="tp-cipler">${acik.map(([e, i]) => `<button class="tp-cip" data-a="mesaiKaldir" data-v="${i}" aria-pressed="${v.kaldir === i}" title="Kaldırmayı dene">${ic('x')} ${gs(e.gun * 24)} ${esc(e.vardiya)}</button>`).join('')}</div>` : ''}
      ${on ? `<div class="tp-ozet">${ic('target')} ${esc(on.ad)}<br>${etkiMetni(on.x)}</div>` : '<p class="tp-not">Bir vardiya seç; motor kısa süre toparlar ve etkisi burada görünür.</p>'}
      <p class="tp-not ${asan.length ? 'uyari' : ''}">${asan.length ? ic('alert') + ' Haftalık ek mesai sınırı aşılıyor' : `Bu hafta ek mesai ${sure(buH)}`}${butce ? ` · haftalık sınır ${sure(butce)}` : ''}</p>
      <div class="eylem"><button class="tp-tus ana" data-a="mesaiUygula" ${on ? '' : 'disabled'}>${ic('check')} Plana işle</button><button class="tp-tus" data-a="kapat">Vazgeç</button></div>`;
  };

  /* ---------- denemeler (eski Senaryo sekmesi) ----------
     Her deneme ana plandan başlar ve adıyla, karar notuyla senaryo olarak saklanır (S.senaryolar, kaynak 'pano'); çalışma planı değişmez.
     En çok üç deneme çizelgede kendi renginde görünür, yan yana karşılaştırılır; biri tek kararla ana plan olur. */
  const DN_AD = ['A', 'B', 'C'];
  function dnAktif() { return U.dn && U.dn.aktif != null ? U.dn.L[U.dn.aktif] : null; }
  const dnKayit = id => dis.G().senaryolar.find(x => x.id === id);
  function dnKur() {
    if (U.dn) { U.dn.L = U.dn.L.filter(t => dnKayit(t.id)); if (!U.dn.L.length && U.dn.aktif == null) U.dn = null; return U.dn; }
    const R = dis.G().senaryolar.filter(x => x.kaynak === 'pano' && x.durum === 'acik' && x.plan).slice(0, 3); if (!R.length) return null;
    U.dn = { ana: null, L: R.map(r => ({ id: r.id, harf: r.dn, renk: Math.max(0, DN_AD.indexOf(r.dn)), snap: null })), aktif: null, gizli: {} };
    return U.dn;
  }
  function dnSnap(r) {
    const o = { D: r.D, down: r.down || [], locks: r.locks || {}, sira: r.sira || [], gercek: r.gercek || {}, ekMesai: r.ekMesai || [], olaylar: r.olaylar || [] };
    const st = stKur(o), cx = compile(st), p = bagla({ ops: r.plan.ops, fail: r.plan.fail || [] }, cx);
    return { ...o, plan: p, e: degerle(p, st), geri: [], ileri: [] };
  }
  function dnKaydet() {
    const t = dnAktif(), r = t && dnKayit(t.id); if (!r) return;
    const k = dis.kayit(S.plan, stKur());
    Object.assign(r, { D: S.D, down: S.down, locks: S.locks, sira: S.sira, gercek: S.gercek, ekMesai: S.ekMesai, olaylar: S.olaylar, plan: k, ozet: k.ozet, J: k.J, zaman: Date.now(), hamle: S.geri.length });
    dis.kaydet();
  }
  function dnAnaYukle() {
    const a = U.dn && U.dn.ana; if (a) { geriYukle(a); S.geri = a.geri; S.ileri = a.ileri; S.kaynak = a.kaynak; S.dv = a.dv; } else S.kaynak = null;
    esitle();
  }
  function dnSakla() { const d = U.dn; if (!d || d.aktif == null) return; dnKaydet(); d.L[d.aktif].snap = { ...anlik(), geri: S.geri, ileri: S.ileri }; d.aktif = null; dnAnaYukle(); }
  function dnAnaAl() { U.dn.ana = { ...anlik(), geri: S.geri, ileri: S.ileri, kaynak: S.kaynak, dv: S.dv }; }
  function dnYeni() {
    const d = dnKur() || (U.dn = { ana: null, L: [], aktif: null, gizli: {} });
    dnSakla();
    if (d.L.length >= 3) { bildir('En çok üç deneme; önce birini sil.'); return; }
    const harf = DN_AD.find(a => !d.L.some(t => t.harf === a)), G = dis.G();
    const r = { id: 'tp' + Date.now().toString(36), ad: `Deneme ${harf}`, dn: harf, not: '', durum: 'acik', kaynak: 'pano', yazar: dis.kim(), zaman: Date.now(), tabanSurum: G.canliSurum, pref: clone(G.pref || {}), w: clone(G.w) };
    G.senaryolar.push(r); dis.senKirp(r);
    dnAnaAl(); d.L.push({ id: r.id, harf, renk: DN_AD.indexOf(harf), snap: null }); d.aktif = d.L.length - 1;
    S.geri = []; S.ileri = []; U.secJob = U.secOp = null; U.secenek = null;
    dnKaydet(); kartKapat(); bildir(`Deneme ${harf} ana plandan başladı: taşı, böl, olay ya da ek mesai dene; çalışma planı değişmez.`); ciz();
  }
  function dnDuzenle(i) {
    dnSakla(); const t = U.dn.L[i], r = dnKayit(t.id); if (!r) return;
    const x = t.snap || dnSnap(r); dnAnaAl(); geriYukle(x); S.geri = x.geri || []; S.ileri = x.ileri || []; U.dn.aktif = i;
    U.secJob = U.secOp = null; U.secenek = null; kartKapat(); ciz();
  }
  function dnSil(i) {
    const d = U.dn, t = d.L[i]; if (d.aktif === i) { d.aktif = null; dnAnaYukle(); } else if (d.aktif != null && d.aktif > i) d.aktif--;
    const G = dis.G(), k = G.senaryolar.findIndex(x => x.id === t.id); if (k >= 0) G.senaryolar.splice(k, 1);
    d.L.splice(i, 1); if (!d.L.length) U.dn = null; dis.kaydet();
  }
  function dnPlan(i) { const d = U.dn, t = d.L[i]; if (i === d.aktif) return { plan: S.plan, e: S.e, n: S.geri.length }; const r = dnKayit(t.id); if (!r) return null; if (!t.snap) t.snap = dnSnap(r); return { plan: t.snap.plan, e: t.snap.e, n: r.hamle || 0 }; }
  function dnUygula(i) {
    dnSakla(); const t = U.dn.L[i], r = dnKayit(t.id); if (!r) return; const x = t.snap || dnSnap(r);
    dnSil(i); kartKapat();
    uygula(`${r.ad} ana plana alındı`, { p: x.plan, e: x.e, D: x.D, down: x.down, locks: x.locks, sira: x.sira, gercek: x.gercek, ekMesai: x.ekMesai, olaylar: x.olaylar });
    dis.iz('Deneme ana plana alındı', `${r.ad}${r.not ? ' · ' + r.not : ''}`);
  }
  /* çizelge katmanı: denemede yer değiştiren işler kendi renginde ana planın üstünde; deneme düzenlenirken ana plandaki yerleri kesik çizgiyle */
  function dnKatman(k) {
    const d = U.dn, K = {}; if (!d) return K;
    const ekle = (m, h) => { K[m] = (K[m] || '') + h; };
    if (d.aktif != null) { const A = d.ana ? d.ana.plan.ops : {};
      for (const id in A) { const a = A[id], b = S.plan.ops[id]; if (!isFinite(a.C) || (b && b.m === a.m && Math.abs(b.S - a.S) < 0.25)) continue;
        ekle(a.m, `<div class="tp-eski ana" style="left:${a.S * k}px;width:${Math.max(2, (a.C - a.S) * k)}px" title="Ana planda: ${esc(a.job)} ${tz(a.S)}"></div>`); }
      return K; }
    d.L.forEach(t => { const r = dnKayit(t.id); if (!r || !r.plan || d.gizli[t.harf]) return; const B = r.plan.ops;
      for (const id in B) { const b = B[id], a = S.plan.ops[id]; if (!isFinite(b.C) || (a && a.m === b.m && Math.abs(a.S - b.S) < 0.25)) continue;
        const w = Math.max(3, (b.C - b.S) * k);
        ekle(b.m, `<div class="tp-dn dn-${t.renk}" style="left:${b.S * k}px;width:${w}px" title="${esc(r.ad)}: ${esc(b.job)} · ${tz(b.S)} → ${tz(b.C)}">${w > 18 ? `<b>${t.harf}</b>${w > 70 ? `<span>${esc(b.job)}</span>` : ''}` : ''}</div>`); } });
    return K;
  }
  function cizDnSerit() {
    const d = U.dn, t = dnAktif(), r = dnKayit(t.id) || {}, a = d.ana ? kozet(d.ana.e) : kozet(S.e), b = kozet(S.e), dw = b.wT - a.wT;
    return `<div class="tp-serit dn dn-${t.renk}">${ic('lab')} <b>${esc(r.ad || 'Deneme ' + t.harf)}</b><span><span class="ek">ana plandan · </span>${S.geri.length} hamle · gecikme ${sure(a.wT)} → <b class="${dw > 0.1 ? 'kotu' : dw < -0.1 ? 'iyi' : ''}">${sure(b.wT)}</b><span class="ek"> · çalışma planı değişmez</span></span>
      <span class="tp-bosluk"></span><button class="tp-tus kucuk" data-a="dnKarsi" aria-label="Karşılaştır">${ic('list')}<span class="metin">Karşılaştır</span></button><button class="tp-tus kucuk" data-a="dnCik" aria-label="Ana plana dön">${ic('back')}<span class="metin">Ana plana dön</span></button></div>`;
  }
  KART.dn = () => {
    const d = dnKur(), kap = `<span class="tp-bosluk"></span><button class="tp-tus kucuk yalin" data-a="kapat" aria-label="Kapat">${ic('x')}</button>`;
    if (!d || !d.L.length) return `<h3>${ic('lab')} Şu olursa${kap}</h3>
      <p class="tp-not">Çalışma planını bozmadan farklı yollar dene. Her deneme ana plandan başlar, adı ve karar notuyla saklanır; en çok üç deneme çizelgede renkleriyle görünür ve yan yana karşılaştırılır.</p>
      <div class="eylem"><button class="tp-tus ana" data-a="dnYeni" data-oto ${yazar() ? '' : 'disabled'}>${ic('plus')} Deneme A'yı başlat</button></div>`;
    const ana = d.aktif == null ? { e: S.e } : d.ana, ka = kozet(ana.e), cn = S.canliE ? kozet(S.canliE) : null;
    const C = d.L.map((t, i) => { const x = dnPlan(i), r = dnKayit(t.id); if (!x || !r) return null; return { t, i, r, n: x.n, k: kozet(x.e), et: etki(ana.e, x.e) }; }).filter(Boolean);
    const en = C.filter(c => c.et.dW < -0.1 && c.et.dKar >= -1).sort((a, b) => a.et.dW - b.et.dW)[0];
    const sinif = (v, a, ters) => Math.abs(v - a) < 0.1 ? '' : (v < a) !== !!ters ? 'iyi' : 'kotu';
    const sut = `<span></span>${cn ? '<b>Canlı</b>' : ''}<b>Çalışma</b>${C.map(c => `<b class="dn-ad dn-${c.t.renk}">${c.t.harf}</b>`).join('')}`;
    const sat = (ad, f, g, ters) => `<span>${ad}</span>${cn ? `<b>${g(f(cn))}</b>` : ''}<b>${g(f(ka))}</b>${C.map(c => `<b class="${sinif(f(c.k), f(ka), ters)}">${g(f(c.k))}</b>`).join('')}`;
    const yaz = yazar();
    return `<h3>${ic('lab')} Denemeler${kap}</h3>
      <div class="tp-karsi" style="grid-template-columns:1fr repeat(${C.length + 1 + (cn ? 1 : 0)},auto)">${sut}
        ${sat('Geciken', k => k.late, v => v)}${sat('Toplam gecikme', k => k.wT, sure)}${sat('Kâr', k => k.kar, tl, true)}
        <span>Bitişi değişen</span>${cn ? '<b>—</b>' : ''}<b>—</b>${C.map(c => `<b>${c.et.L.length}</b>`).join('')}
        <span>Hamle</span>${cn ? '<b>—</b>' : ''}<b>—</b>${C.map(c => `<b>${c.n}</b>`).join('')}</div>
      ${C.map(c => `<div class="tp-dn-sat"><b class="dn-ad dn-${c.t.renk}">${c.t.harf}</b><input value="${esc(c.r.ad)}" data-ch="dnAd" data-i="${c.i}" aria-label="Deneme ${c.t.harf} adı" ${yaz ? '' : 'readonly'}>
        <textarea rows="2" data-ch="dnNot" data-i="${c.i}" placeholder="Karar notu: neden bu deneme?" aria-label="Deneme ${c.t.harf} karar notu" ${yaz ? '' : 'readonly'}>${esc(c.r.not || '')}</textarea>
        <span class="ozet">${c === en ? '<span class="rozet iyi">en iyi</span> ' : ''}${c.et.L.slice(0, 3).map(q => `${esc(q.j)} <span class="${q.d > 0 ? 'kotu' : 'iyi'}">${q.d > 0 ? '+' : '−'}${sure(q.d)}</span>`).join(' · ') || 'fark yok'}${c.et.dKar < -1 ? ' · <span class="kotu">kâr düşüyor, öneri yok</span>' : ''}</span>
        <span class="eylem-ic"><button class="tp-tus kucuk yalin" data-a="dnGoster" data-v="${c.t.harf}" aria-pressed="${!d.gizli[c.t.harf]}" title="Çizelgede göster ya da gizle">${ic('eye')}</button>${c.i === d.aktif ? '<span class="tp-not">açık</span>' : `<button class="tp-tus kucuk" data-a="dnDuzenle" data-i="${c.i}" ${yaz ? '' : 'disabled'}>${ic('edit')} Devam et</button>`}<button class="tp-tus kucuk ${c === en ? 'ana' : ''}" data-a="dnUygula" data-i="${c.i}" ${yaz ? '' : 'disabled'}>${ic('check')} Ana plan yap</button><button class="tp-tus kucuk yalin" data-a="dnSil" data-i="${c.i}" aria-label="Sil" ${yaz ? '' : 'disabled'}>${ic('trash')}</button></span></div>`).join('')}
      <p class="tp-not">"Ana plan yap" denemeyi çalışma planına alır; canlı plan yine yalnız Onay sekmesinden değişir.</p>
      <div class="eylem"><button class="tp-tus" data-a="dnYeni" ${d.L.length >= 3 || !yaz ? 'disabled' : ''}>${ic('plus')} Yeni deneme</button>${d.aktif != null ? `<button class="tp-tus yalin" data-a="dnCik">${ic('back')} Ana plana dön</button>` : ''}</div>`;
  };

  /* uygulamanın başka yerlerinden gelen istek (eski stüdyo düğmeleri): pano çizildikten sonra ilgili kart ya da sipariş açılır */
  let istekBekleyen = null;
  function istek(tur, v) { istekBekleyen = { tur, v }; }
  function istekIsle() {
    const x = istekBekleyen; istekBekleyen = null; if (!x) return;
    if (x.tur === 'sip' && x.v && S.plan.cx.jobs[x.v]) { U.rayAcik = true; if (U.secJob === x.v && !U.secOp) U.secJob = null; sipSec(x.v); }
    else if (x.tur === 'tez' && x.v) { U.suz = { m: x.v }; cizHafif(); if (yazar()) kartAc('mesai', { m: x.v, ekle: null, kaldir: null }); }
    else if (x.tur === 'kriz' && yazar()) { kartAc('olay3', olayVarsayilan('ariza')); tepkiBaslat(); }
    else if (x.tur === 'sen') kartAc('dn', null);
  }

  /* ---------- eylemler ---------- */
  function opSec(id, ank) {
    U.secOp = id; const r = S.plan.ops[id]; U.secJob = r.job; U.alt = null;
    const o = S.plan.cx.byId[id]; const sabit = r.done || r.act || r.S < 7 + S.frz - 1e-6 || !!(S.locks[id] && S.locks[id].kim);
    if (!sabit && !r.fas) {
      const L = []; for (const c of o.c) { if (c.fas || c.m === r.m) continue;
        const lk = { ...S.locks }; delete lk[id]; const z = coz([[id, c.m, r.S]], { locks: lk });
        const x = etki(S.e, z.e); const h = x.L.find(q => q.j === r.job); L.push({ m: c.m, d: h ? h.d : 0, metin: etkiMetni(x, r.job), z, lk }); }
      U.alt = { id, L: L.sort((a, b) => a.d - b.d) };
    }
    cizHafif(); kartAc('op', id, ank);
  }
  /* secim degisince yalniz liste ve pano yenilenir; ust bar, alt panel ve kaydirma yerinde kalir */
  function cizHafif() {
    const lst = $('#tp-liste'), pano = $('#tp-pano'); if (!lst || !pano || !S.plan) return ciz();
    const ly = lst.scrollTop, px = pano.scrollLeft, py = pano.scrollTop;
    const t = document.createElement('div'); t.innerHTML = cizRay(); lst.innerHTML = t.querySelector('#tp-liste').innerHTML; lst.scrollTop = ly;
    const ust = $('.tp-ust'); if (ust) ust.outerHTML = cizUst();
    pano.innerHTML = cizPano(); pano.scrollLeft = px; pano.scrollTop = py;
    cizKart(); cizOklar();
  }
  function sipSec(jid) {
    if (U.secJob === jid && !U.secOp) { U.secJob = null; U.secenek = null; cizHafif(); return; }
    U.yeniAcilan = jid;
    U.secJob = jid; U.secOp = null; U.kart = null;
    secenekBaslat(jid);
    cizHafif(); U.yeniAcilan = null;
    const el = document.querySelector(`.tp-sip[data-j="${CSS.escape(jid)}"]`), l = $('#tp-liste');
    if (el && l) { const a = el.getBoundingClientRect(), c = l.getBoundingClientRect(); if (a.top < c.top || a.top > c.bottom - 40) el.scrollIntoView({ block: 'nearest' }); }
    /* pano yalniz siparisin uretim baslangici gorunmuyorsa kayar */
    const b = sipBilgi(jid), p = $('#tp-pano'); if (p && b.ur != null) { const x = b.ur * pph(), g = p.scrollLeft, w = p.clientWidth - etiketGen(); if (x < g || x > g + w - 40) p.scrollTo({ left: Math.max(0, (b.ur - 4) * pph()), behavior: 'smooth' }); }
  }
  /* siparisi one almanin iki yolu: ayni tezgahlarda sirada one, ya da en hizli tezgahlarda one. Sonuc hesaplanmis olarak gosterilir. */
  function oneAlMods(jid, hizli, sira, p = S.plan) {
    const cx = p.cx, frz = 7 + S.frz, tas = +cx.A.tasimaSaat || 0;
    return cx.jobs[jid].ops.map(o => {
      const r = p.ops[o.id]; if (!r || r.done || r.act || r.fas || r.S < frz || (S.locks[o.id] && S.locks[o.id].kim)) return null;
      let m = r.m; if (hizli) { const ms = o.c.filter(c => !c.fas && !c.opt); if (ms.length) m = ms.reduce((a, b) => (b.run + b.su < a.run + a.su ? b : a)).m; }
      let hazir = frz; for (const [pid, ty] of o.pr) { const q = p.ops[pid]; if (q) hazir = Math.max(hazir, (ty === 'o' && !q.fas ? q.lot1 : q.C) + (q.fas ? 0 : tas)); }
      return [o.id, m, Math.min(r.S, hazir) - 1e-3];
    }).filter(Boolean);
  }
  /* one alma iki turdur: ilk turda oncullerin yeni bitisleri belli olur, ikinci tur anahtarlari onlara gore kurar */
  function oneAlCoz(jid, hizli) {
    let mods = oneAlMods(jid, hizli); if (!mods.length) return null;
    const lk = { ...S.locks }; for (const [id] of mods) delete lk[id];
    let z = coz(mods, { locks: lk });
    for (let i = 0; i < 2; i++) { const m2 = oneAlMods(jid, hizli, null, z.p); if (!m2.length) break; const z2 = coz(m2, { locks: lk }); if (z2.e.J[jid].C < z.e.J[jid].C - 0.25) { z = z2; mods = m2; } else break; }
    return { z, lk };
  }
  function* secenekGen(jid) {
    const b = sipBilgi(jid); if (b.durum === 'iyi') return [];
    const krit = new Set(akis(jid).L.filter(x => x.kritik).map(x => x.o.id));
    const L = [];
    for (const [hizli, ad] of [[false, 'Öne al (aynı tezgâhlarda)'], [true, 'Öne al ve en hızlı tezgâhlara ver']]) {
      const y = oneAlCoz(jid, hizli); yield; if (!y) continue;
      const x = etki(S.e, y.z.e); const h = x.L.find(q => q.j === jid);
      if (!h || h.d > -0.25) continue;
      L.push({ ad, z: y.z, lk: y.lk, x, ok: true, sira: [jid, ...siparisler().map(s => s.id).filter(i => i !== jid)] });
    }
    if (L.length === 2 && Math.abs(L[0].x.dW - L[1].x.dW) < 0.1 && Math.abs(L[0].x.L.length - L[1].x.L.length) < 1) L.pop();
    /* tek adimi baska tezgaha vermek: siparisin bitisini en cok kisaltan ilk iki tasima */
    const cx = S.plan.cx, frz = 7 + S.frz, tek = [];
    for (const o of cx.jobs[jid].ops) { const r = S.plan.ops[o.id]; if (!r || r.done || r.act || r.fas || r.S < frz || !krit.has(o.id)) continue;
      for (const c of o.c) { if (c.fas || c.m === r.m) continue; const lk = { ...S.locks }; delete lk[o.id];
        const z = coz([[o.id, c.m, r.S - 1e-3]], { locks: lk }); yield; const x = etki(S.e, z.e); const h = x.L.find(q => q.j === jid);
        if (h && h.d < -0.25) tek.push({ ad: `${o.k} ${o.ad || ''}: ${r.m} yerine ${c.m}`, z, lk, x, ok: true }); } }
    tek.sort((a, b) => a.x.L.find(q => q.j === jid).d - b.x.L.find(q => q.j === jid).d);
    return L.concat(tek.slice(0, 2));
  }
  /* secenekler adim adim hesaplanir: siparis hemen acilir, hesap arada ekrani kilitlemez */
  function secenekler(jid) { const it = secenekGen(jid); let r; while (!(r = it.next()).done); return r.value; }
  function secenekBaslat(jid) {
    const it = secenekGen(jid), tok = {}; U.secenek = { j: jid, L: null, tok };
    const adim = () => { if (!U.secenek || U.secenek.tok !== tok) return; const t0 = performance.now(); let r;
      do { r = it.next(); } while (!r.done && performance.now() - t0 < 30);
      if (r.done) { U.secenek = { j: jid, L: r.value }; if (U.secJob === jid) { const el = $('#tp-secenekler'), sp = siparisler().find(x => x.id === jid); if (el && sp) el.innerHTML = cizSecenekler(sp); else ciz(); } } else setTimeout(adim, 0); };
    setTimeout(adim, 0);
  }

  function sirayaKoy(jid, onceki) {
    const L = siparisler().map(s => s.id).filter(i => i !== jid);
    const i = onceki ? L.indexOf(onceki) : L.length; L.splice(i < 0 ? L.length : i, 0, jid);
    const y = oneAlCoz(jid, false);
    if (!y) { S.sira = L; ciz(); return; }
    uygula(`${jid} sırası değişti`, { p: y.z.p, e: y.z.e, locks: y.lk, sira: L });
  }
  function acilOnizle() {
    const v = U.kart.veri; const D = clone(S.D); let n = D.siparisler.length + 1; while (D.siparisler.some(x => x.id === 'AC-' + String(n).padStart(3, '0'))) n++; const id = 'AC-' + String(n).padStart(3, '0');
    const u = D.urunler.find(x => x.id === v.urun);
    D.siparisler.push({ id, ad: u.ad, urun: v.urun, adet: Math.max(1, +v.adet || 1), termin: tIso(7 + v.gun * 24 + 10), oncelik: 1, gelir: null, cezaGun: null, serbest: null, malzeme: [] });
    /* iki yerlesim hesaplanir: herkesin onune gecer (acil) ya da siradaki bos yerlere girer; secim planlamacinindir */
    /* yeni siparisin islemleri kod cozucunun sirasina anahtarla girer: acilde donuk bolgenin hemen ardina, digerinde termine gore geriden */
    const cxY = compile(stKur({ D })), ops = cxY.jobs[id].ops, frz = 7 + S.frz;
    const sure1 = o => { const c = o.c.filter(q => !q.fas); return c.length ? Math.min(...c.map(q => q.su + q.run)) : 48; };
    const mOf = o => { const c = o.c.filter(q => !q.fas); return c.length ? c.reduce((x, y) => (y.su + y.run < x.su + x.run ? y : x)).m : o.c[0].m; };
    const toplam = ops.reduce((t, o) => t + sure1(o), 0), due = cxY.jobs[id].due;
    const modsAcil = ops.map((o, i) => [o.id, mOf(o), frz + i * 1e-3]);
    let kal = toplam; const modsSira = ops.map(o => { const k = Math.max(frz, (due ?? frz + toplam) - kal * 1.5); kal -= sure1(o); return [o.id, mOf(o), k]; });
    const Y = [['acil', 'Öne geçir', modsAcil], ['sira', 'Termine göre araya al', modsSira]].map(([k, ad, mods]) => { const z = coz(mods, { D }); return { k, ad, z, b: sipBilgi(id, z.p, z.e), x: etki(S.e, z.e) }; });
    const zam = Y.filter(y => y.b.durum !== 'gec').sort((a, b) => a.x.dW - b.x.dW);
    const sec = v.sec && Y.find(y => y.k === v.sec) || zam[0] || Y[0];
    U.onizleme = { tur: 'acil', Y, oner: zam[0] ? zam[0].k : null, sec: sec.k, z: sec.z, D, id, b: sec.b, x: sec.x }; U.secJob = id;
    cizKart(); onizlemeCiz(sec.z);
  }
  /* siparisi ikiye bolmek: ilk parca eski yerinde kalir, ikinci parca her adimda en hizli baska tezgaha gider; adlar v96 bolme kuralindadir (SP-1/1, SP-1/2) */
  /* bolme: parca sayisi ve adetleri kullanici verir; ilk parca yerinde kalir, digerleri her adimda siradaki en hizli baska tezgaha gider */
  function bolAdet(j, n) { const L = []; let k = j.adet; for (let i = 0; i < n; i++) { const a = Math.round(k / (n - i)); L.push(a); k -= a; } return L; }
  function bolOnizle() {
    const v = U.kart.veri, j = S.D.siparisler.find(x => x.id === v.j); if (!j) return;
    const A = v.adetler; if (A.length < 2 || A.some(a => !(a >= 1)) || A.reduce((x, y) => x + y, 0) !== j.adet) { U.onizleme = null; cizKart(); return; }
    const P = A.map((a, i) => ({ id: j.id + '/' + (i + 1), a }));
    const D = clone(S.D); let gk = 0;
    D.siparisler = D.siparisler.flatMap(x => x.id !== j.id ? [x] : P.map((q, i) => { const g = x.gelir == null ? null : i === P.length - 1 ? x.gelir - gk : Math.round(x.gelir * q.a / j.adet); if (g != null) gk += g; return { ...x, id: q.id, adet: q.a, gelir: g }; }));
    const cx = S.plan.cx, mods = [], tz0 = {};
    for (const o of cx.jobs[j.id].ops) { const r = S.plan.ops[o.id]; if (!r) continue;
      const al = r.fas ? [] : o.c.filter(c => !c.fas && c.m !== r.m).sort((x, y) => (x.run + x.su) - (y.run + y.su)).map(c => c.m);
      P.forEach((q, i) => { const m = i === 0 || !al.length ? r.m : al[(i - 1) % al.length]; mods.push([q.id + '.' + o.k, m, Math.max(7 + S.frz, r.S) + i * 1e-3]); if (!tz0[q.id]) tz0[q.id] = new Set(); tz0[q.id].add(r.fas ? 'fason' : m); }); }
    const z = coz(mods, { D });
    const b0 = sipBilgi(j.id), B = P.map(q => ({ ...q, b: sipBilgi(q.id, z.p, z.e), m: [...tz0[q.id]].join(', ') }));
    U.onizleme = { tur: 'bol', j: j.id, P: B, z, D, b0, x: etki(S.e, z.e) }; U.secJob = B[0].id;
    cizKart(); onizlemeCiz(z);
  }
  function onizlemeCiz(z, down) {
    const eski = {}; for (const id in z.p.ops) { const a = S.plan.ops[id], b = z.p.ops[id]; if (a && (a.m !== b.m || Math.abs(a.S - b.S) > 0.25)) eski[id] = a; }
    const x = etki(S.e, z.e), et = {}, son = {};
    for (const q of x.L) et[q.j] = q.d;
    for (const r of Object.values(z.p.ops)) if (!son[r.job] || z.p.ops[son[r.job]].C < r.C) son[r.job] = r.id;
    const pano = $('#tp-pano'); if (!pano) return;
    const sx = pano.scrollLeft, sy = pano.scrollTop;
    pano.innerHTML = cizPano({ p: z.p, e: z.e, eski, etki: et, son, down });
    pano.scrollLeft = sx; pano.scrollTop = sy;
  }

  /* ---------- surukle-birak (pano) ---------- */
  function panoKonum(ev) {
    const pano = $('#tp-pano'), rc = pano.getBoundingClientRect();
    const x = ev.clientX - rc.left + pano.scrollLeft - etiketGen();
    const satir = document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el.classList && el.classList.contains('tp-satir'));
    return { t: Math.max(0, Math.round(x / pph() / SNAP) * SNAP), m: satir ? satir.dataset.m : null };
  }
  function surukleBasla(ev, id) {
    const r = S.plan.ops[id]; if (!r || S.durum === 'onayda') return;
    const sabit = r.done || r.act || r.S < 7 + S.frz - 1e-6 || r.fas || !!(S.locks[id] && S.locks[id].kim);
    if (S.locks[id] && S.locks[id].kim) bildir(`${S.locks[id].kim} (taklit) ${S.locks[id].tur === 'onay' ? 'onay bekliyor' : 'onaylandı'}: bu iş kilitli`);
    const k0 = panoKonum(ev);
    U.surukle = { id, x0: ev.clientX, y0: ev.clientY, basladi: false, sabit, ofs: k0.t - r.S, m: r.m, t: r.S, son: null, z: null };
  }
  function surukleHareket(ev) {
    const s = U.surukle; if (!s) return;
    if (!s.basladi) { if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < 6) return; if (s.sabit) { bildir('Bu iş donuk bölgede, başlamış ya da fason; taşınmaz.'); U.surukle = null; return; } s.basladi = true; kartKapat(); U.secOp = s.id; U.secJob = S.plan.ops[s.id].job; }
    ev.preventDefault();
    const k = panoKonum(ev); const m = k.m || s.m; let t = Math.max(7 + S.frz, k.t - s.ofs);
    /* miknatis: hedef satirdaki onceki isin bitisine ve vardiya basina 12 px icinde yapisir; Alt basiliyken kapali */
    s.hiza = null;
    if (!ev.altKey) { const esik = 12 / pph(), M = S.plan.cx.M[m]; const aday = [];
      for (const r of Object.values(S.plan.ops)) if (r.m === m && r.id !== s.id && isFinite(r.C)) aday.push([r.C, 'bitiş ' + r.job]);
      if (M) for (const [a] of M.rw) { if (a > t + 48) break; aday.push([a, 'vardiya başı']); }
      let en = null; for (const [x, ad] of aday) { const d = Math.abs(x - t); if (d <= esik && x >= 7 + S.frz - 1e-9 && (!en || d < en.d)) en = { x, ad, d }; }
      if (en) { t = en.x; s.hiza = en; } }
    s.ev = { x: ev.clientX, y: ev.clientY }; kenarKaydir();
    if (s.son && s.son.m === m && Math.abs(s.son.t - t) < 1e-6) { bilgiCiz(); return; }
    s.son = { m, t }; s.m = m; s.t = t;
    cancelAnimationFrame(s.raf); s.raf = requestAnimationFrame(() => surukleOnizle());
  }
  /* tasirken imlec panonun kenarina gelince pano o yone kayar; hedef saat ve tezgah kaydikca yeniden hesaplanir */
  function kenarKaydir() {
    const s = U.surukle; if (!s || s.kaydir) return;
    const tur = () => {
      const s2 = U.surukle; if (!s2 || !s2.basladi) { if (s2) s2.kaydir = null; return; }
      const pano = $('#tp-pano'); const rc = pano.getBoundingClientRect(); const e = s2.ev, P = 48;
      const sol = rc.left + etiketGen(), ust = rc.top + 44;
      const dx = e.x < sol + P ? -(sol + P - e.x) : e.x > rc.right - P ? e.x - (rc.right - P) : 0;
      const dy = e.y < ust + P ? -(ust + P - e.y) : e.y > rc.bottom - P ? e.y - (rc.bottom - P) : 0;
      if (!dx && !dy) { s2.kaydir = null; return; }
      const x0 = pano.scrollLeft, y0 = pano.scrollTop;
      pano.scrollLeft += Math.max(-24, Math.min(24, dx / 2)); pano.scrollTop += Math.max(-18, Math.min(18, dy / 2));
      if (pano.scrollLeft !== x0 || pano.scrollTop !== y0) surukleHareket({ clientX: e.x, clientY: e.y, preventDefault() {} });
      s2.kaydir = requestAnimationFrame(tur);
    };
    s.kaydir = requestAnimationFrame(tur);
  }
  function surukleOnizle() {
    const s = U.surukle; if (!s) return;
    const r = S.plan.ops[s.id], o = S.plan.cx.byId[s.id];
    const c = o.c.find(q => q.m === s.m && !q.fas);
    const k = pph(), w = Math.max(3, (r.C - r.S) * k);
    if (!c) { s.yasak = true; s.z = null; const z = { p: S.plan, e: S.e }; onizlemeCiz(z); hayalet(s, w, true); bilgiCiz(); return; }
    s.yasak = false;
    const lk = { ...S.locks, [s.id]: { m: s.m, S: s.t } };
    const z = coz([[s.id, s.m, s.t]], { locks: lk }); s.z = z; s.lk = lk;
    onizlemeCiz(z); hayalet(s, w, false); bilgiCiz();
  }
  function hayalet(s, w, yasak) {
    const satir = document.querySelector(`.tp-satir[data-m="${CSS.escape(s.m)}"] .tp-zaman`); if (!satir) return;
    satir.insertAdjacentHTML('beforeend', `<div class="tp-hayalet ${yasak ? 'yasak' : ''}" style="left:${s.t * pph()}px;width:${w}px"></div>${s.hiza && !yasak ? `<div class="tp-hiza" style="left:${s.t * pph()}px"><span>${esc(s.hiza.ad)}</span></div>` : ''}`);
    document.querySelectorAll('.tp-satir').forEach(el => el.classList.toggle(yasak ? 'yasak' : 'hedef', el.dataset.m === s.m));
  }
  function bilgiCiz() {
    const s = U.surukle; let b = $('#tp-sbilgi'); if (!s || !s.basladi) { if (b) b.remove(); return; }
    if (!b) { document.body.insertAdjacentHTML('beforeend', '<div class="tp-surukle-bilgi" id="tp-sbilgi"></div>'); b = $('#tp-sbilgi'); }
    const r = S.plan.ops[s.id];
    b.innerHTML = s.yasak ? `${ic('x')} <b>${esc(s.m)}</b> bu işi yapamaz` : s.z ? `<b>${esc(s.m)} · ${tz(s.t)}</b><br>${etkiMetni(etki(S.e, s.z.e), r.job)}` : '';
    const x = Math.min(innerWidth - 340, s.ev.x + 16), y = Math.min(innerHeight - 90, s.ev.y + 20);
    b.style.left = Math.max(8, x) + 'px'; b.style.top = y + 'px';
  }
  function surukleBit() {
    const s = U.surukle; U.surukle = null; const b = $('#tp-sbilgi'); if (b) b.remove();
    if (!s) return false;
    if (!s.basladi) return false;
    cancelAnimationFrame(s.raf);
    if (s.z && !s.yasak) { const r = S.plan.ops[s.id]; uygula(`${r.job} · ${S.plan.cx.byId[s.id].k} → ${s.m} ${tz(s.t)}`, { p: s.z.p, e: s.z.e, locks: s.lk }); }
    else ciz();
    return true;
  }

  /* ---------- olay baglama ----------
     Dinleyiciler belgeye bir kez bağlanır ve yalnız pano açıkken iş görür; uygulamanın data-act düğmeleri panonun data-a düğmelerinden ayrıdır. */
  const acik = () => !!document.getElementById('tp-kok') && !!S.plan;
  const bizim = el => !!(el && el.closest && el.closest('#tp-kok, #tp-kart, #tp-perde, #tp-menu, #tp-mperde'));
  const YAZMA = new Set(['secenek', 'alt', 'kilitle', 'kilitAc', 'frz', 'olayAc', 'olayDeg', 'tepkiUygula', 'mesaiAc', 'mesaiSec', 'mesaiKaldir', 'mesaiUygula', 'iyilestir', 'acilUygula', 'olay', 'bolAc', 'bolUygula', 'basladi', 'sayim',
    'gonder', 'gonderOnay', 'taslakSifirla', 'geri', 'geriDon', 'yinele', 'dnYeni', 'dnDuzenle', 'dnUygula', 'dnSil']);
  /* denemede yalnız plan denenir: atölye kaydı, donuk bölge, onay ve motorun çalışma planı üstündeki işleri ana plandadır */
  const DN_YASAK = new Set(['iyilestir', 'gonder', 'gonderOnay', 'taslakSifirla', 'frz', 'basladi', 'sayim']);
  const OLAY_SAYI = new Set(['bas', 'saat', 'gun', 'n']);
  function bagla2() {
    document.addEventListener('click', ev => {
      if (!acik() || !bizim(ev.target)) return;
      const a = ev.target.closest('[data-a]'); if (!a) return;
      const ad = a.dataset.a, rc = a.getBoundingClientRect(), ank = { x: rc.left, y: rc.bottom };
      if (YAZMA.has(ad) && !yazar()) { bildir(dis.calisan() ? 'Motor çalışıyor; bitince yeniden deneyin.' : 'Yetkiniz yok (plan.yaz).'); return; }
      if (DN_YASAK.has(ad) && dnAktif()) { bildir('Denemedesin: bu iş ana plandadır. Önce "Ana plana dön" ya da denemeyi ana plan yap.'); return; }
      switch (ad) {
        case 'op': if (U.yeniSurukle) { U.yeniSurukle = false; return; } opSec(a.dataset.id, { x: ev.clientX, y: ev.clientY }); break;
        case 'sip': if (ev.target.closest('.tp-ac')) return; sipSec(a.dataset.j); break;
        case 'sipGoster': U.rayAcik = true; sipSec(a.dataset.j); break;
        case 'opGit': opGit(a.dataset.id); break;
        case 'suz': kartAc('suz', null, ank); break;
        case 'suzG': suzKoy('g', a.dataset.v); break;
        case 'suzM': suzKoy('m', a.dataset.v); break;
        case 'suzTemizle': U.suz = null; cizHafif(); break;
        case 'haftaGit': { const w0 = +a.dataset.v; U.zoom = 168; U.kaydir = null; ciz(); const p = $('#tp-pano'); if (p) p.scrollLeft = Math.max(0, w0 * pph()); break; }
        case 'geriMenu': U.sifirOnay = false; kartAc('geri', null, ank); break;
        case 'yinele': yinele(); if (U.kart && U.kart.tur === 'geri') cizKart(); break;
        case 'bolAc': { const j = S.D.siparisler.find(x => x.id === a.dataset.j); kartAc('bol', { j: j.id, adetler: bolAdet(j, 2) }, ank); bolOnizle(); break; }
        case 'bolSay': { const v = U.kart.veri; v.adetler = bolAdet(S.D.siparisler.find(x => x.id === v.j), +a.dataset.v); bolOnizle(); break; }
        case 'bolUygula': { const o = U.onizleme; U.onizleme = null; U.kart = null; U.secJob = o.P[0].id; uygula(`${o.j} ${o.P.length} parçaya bölündü (${o.P.map(q => q.a).join('+')})`, { p: o.z.p, e: o.z.e, D: o.D }); secenekBaslat(o.P[0].id); ciz(); break; }
        case 'basladi': { const id = a.dataset.id, r = S.plan.ops[id], gs2 = r.S + (+a.dataset.v); const g = { ...S.gercek, [id]: { m: r.m, S: gs2, plan: r.S } };
          const z = coz([], { gercek: g }); kartKapat(); uygula(`${r.job} · ${S.plan.cx.byId[id].k} başladı ${zs(gs2)}`, { p: z.p, e: z.e, gercek: g }); break; }
        case 'sayim': { const id = a.dataset.id, r = S.plan.ops[id], o = S.plan.cx.byId[id], n = Math.max(0, Math.min(o.adet, +($('#tp-sayim-n') || {}).value || 0)), c = o.c.find(q => q.m === r.m);
          const kalan = c && c.cyc ? (o.adet - n) * c.cyc : null; const g0 = S.gercek[id]; const g = { ...S.gercek, [id]: { ...g0, n, kalan, sayim: Math.max(g0.S, 7) } };
          const z = coz([], { gercek: g }); kartKapat(); uygula(`${r.job} · ${o.k} sayım ${n}/${o.adet}`, { p: z.p, e: z.e, gercek: g }); break; }
        case 'taslakSifirla': if (!U.sifirOnay) { U.sifirOnay = true; cizKart(); break; } U.sifirOnay = false; kartKapat(); taslakSifirla(); break;
        case 'detay': ev.preventDefault(); U.detayAcik = !U.detayAcik; a.parentElement.open = U.detayAcik; break;
        case 'bugun': U.bugunAcik = !U.bugunAcik; { const el = document.querySelector('.tp-bugun'); if (el) el.outerHTML = cizBugun(); } bugunHesapla(); break;
        case 'geriDon': geriDon(+a.dataset.i); if (U.kart && U.kart.tur === 'geri') cizKart(); break;
        case 'kapat': case 'kapatPerde': U.tepki = null; kartKapat(); if (U.onizleme) { U.onizleme = null; U.secJob = U.secJob && S.plan.cx.jobs[U.secJob] ? U.secJob : null; ciz(); } if (ad === 'kapat' && !U.kart && a.closest('.tp-ac')) { U.secJob = null; U.secenek = null; cizHafif(); } break;
        case 'menuKapat': menuKapat(); break;
        case 'ray': U.rayAcik = !U.rayAcik; ciz(); break;
        case 'zoom': U.zoom = +a.dataset.v; U.kaydir = null; ciz(); break;
        case 'geri': geriAl(); break;
        case 'olay': menuAc(a); break;
        case 'olayAc': { const tip = a.dataset.v, m = a.dataset.m; menuKapat(); U.onizleme = null; U.tepki = null; if (U.kart) ciz();
          if (tip === 'acil') { kartAc('acil', { urun: S.D.urunler[0].id, adet: 20, gun: 3 }); acilOnizle(); } else { kartAc('olay3', olayVarsayilan(tip, m)); tepkiBaslat(); } break; }
        case 'olayDeg': { const k = a.dataset.k; U.kart.veri[k] = OLAY_SAYI.has(k) ? +a.dataset.v : a.dataset.v; tepkiBaslat(); break; }
        case 'tepkiSec': { if (!U.tepki) break; U.tepki.sec = a.dataset.v; const t = tepkiSecili(U.tepki); cizKart(); if (t && t.z) { U.onizleme = { tur: 'olay3' }; onizlemeCiz(t.z, t.ek.down); } break; }
        case 'tepkiUygula': { const v = U.kart.veri, t = tepkiSecili(U.tepki); if (!t || !t.z) break; U.tepki = null; U.onizleme = null; U.kart = null;
          uygula(`${olayAdi(v)} · ${t.ad}`, { p: t.z.p, e: t.z.e, down: t.ek.down, olaylar: t.ek.olaylar, ekMesai: t.ek.ekMesai }); break; }
        case 'mesaiAc': menuKapat(); U.onizleme = null; kartAc('mesai', { m: a.dataset.m, ekle: null, kaldir: null }); break;
        case 'mesaiSec': { const v = U.kart.veri, i = +a.dataset.v; v.kaldir = null; v.ekle = v.ekle === i ? null : i; mesaiOnizle(); break; }
        case 'mesaiKaldir': { const v = U.kart.veri, i = +a.dataset.v; v.ekle = null; v.kaldir = v.kaldir === i ? null : i; mesaiOnizle(); break; }
        case 'mesaiUygula': { const o = U.onizleme; if (!o || o.tur !== 'mesai') break; U.onizleme = null; U.kart = null; uygula(o.ad, { p: o.z.p, e: o.z.e, ekMesai: o.em }); break; }
        case 'dnAc': case 'dnKarsi': kartAc('dn', null, ank); break;
        case 'dnYeni': dnYeni(); break;
        case 'dnCik': dnSakla(); kartKapat(); ciz(); break;
        case 'dnDuzenle': dnDuzenle(+a.dataset.i); break;
        case 'dnUygula': dnUygula(+a.dataset.i); break;
        case 'dnSil': dnSil(+a.dataset.i); ciz(); break;
        case 'dnGoster': U.dn.gizli[a.dataset.v] = !U.dn.gizli[a.dataset.v]; cizHafif(); break;
        case 'acilTermin': U.kart.veri.gun = +a.dataset.v; U.kart.veri.sec = null; acilOnizle(); break;
        case 'acilSec': U.kart.veri.sec = a.dataset.v; acilOnizle(); break;
        case 'acilUygula': { const o = U.onizleme; U.onizleme = null; U.kart = null; U.secJob = o.id; uygula(`${o.id} eklendi (${o.sec === 'acil' ? 'öne geçti' : 'boşluklara'})`, { p: o.z.p, e: o.z.e, D: o.D }); secenekBaslat(o.id); ciz(); break; }
        case 'secenek': { const x = U.secenek.L[+a.dataset.i]; uygula(`${U.secenek.j}: ${x.ad}`, { p: x.z.p, e: x.z.e, locks: x.lk, sira: x.sira || S.sira }); secenekBaslat(U.secenek.j); ciz(); break; }
        case 'alt': { const x = U.alt.L[+a.dataset.i]; const r = S.plan.ops[U.alt.id]; kartKapat(); uygula(`${r.job} → ${x.m}`, { p: x.z.p, e: x.z.e, locks: x.lk }); break; }
        case 'kilitle': { const id = a.dataset.id, r = S.plan.ops[id]; const lk = { ...S.locks, [id]: { m: r.m, S: r.S } }; const z = coz([[id, r.m, r.S]], { locks: lk }); kartKapat(); uygula(`${r.job} kilitlendi`, { p: z.p, e: z.e, locks: lk }); break; }
        case 'kilitAc': { const id = a.dataset.id; const lk = { ...S.locks }; delete lk[id]; const z = coz([], { locks: lk }); kartKapat(); uygula('Kilit açıldı', { p: z.p, e: z.e, locks: lk }); break; }
        case 'iyilestir': kartKapat(); dis.iyilestir(); break;
        case 'gonder': kartAc('gonder', null, ank); break;
        case 'gonderOnay': kartKapat(); dis.onaya(); break;
        case 'onayGit': kartKapat(); dis.sekme('onay'); break;
        case 'sekmeGit': kartKapat(); dis.sekme(a.dataset.v); break;
        case 'dahasi': kartAc('menu', null, ank); break;
        case 'dondurma': kartAc('dondurma', null, ank); break;
        case 'frz': { const v = +a.dataset.v; if (v === S.frz) break; dis.G().w.dondurma = v; const st = stKur(), p = bagla({ ops: S.plan.ops, fail: S.plan.fail || [] }, cxAl()); kartKapat(); uygula(`Donuk bölge ${v} sa`, { p, e: degerle(p, st) }); break; }
        case 'tezgah': menuAc(a, a.dataset.m); break;
        case 'siraSifirla': S.sira = []; yansit('Sipariş sırası riske göre', true); ciz(); break;
      }
    });
    document.addEventListener('input', ev => {
      if (!acik()) return;
      if (ev.target.id === 'tp-ara') { U.ara = ev.target.value; cizHafif(); }
    });
    document.addEventListener('change', ev => {
      if (!acik() || !bizim(ev.target)) return;
      const c = ev.target.dataset.ch; if (!c) return;
      ev.stopImmediatePropagation();
      if (c === 'olayDeg') { U.kart.veri[ev.target.dataset.k] = ev.target.value; tepkiBaslat(); }
      if (c === 'dnAd' || c === 'dnNot') { const t = U.dn && U.dn.L[+ev.target.dataset.i], r = t && dnKayit(t.id);
        if (r && yazar()) { r[c === 'dnAd' ? 'ad' : 'not'] = ev.target.value.trim() || (c === 'dnAd' ? 'Deneme ' + t.harf : ''); dis.kaydet(); if (c === 'dnAd' && dnAktif() === t) { const b = $('.tp-serit.dn > b'); if (b) b.textContent = r.ad; } } }
      if (c === 'acil') { U.kart.veri.sec = null; if (ev.target.id === 'tp-ac-u') U.kart.veri.urun = ev.target.value; else U.kart.veri.adet = +ev.target.value; acilOnizle(); }
      if (c === 'bolN') { const v = U.kart.veri; v.adetler = bolAdet(S.D.siparisler.find(x => x.id === v.j), +ev.target.value); bolOnizle(); }
      /* son parca, degistirilen disindaki parcalardan kalan adedi alir; toplam her zaman siparis adedi kalir */
      if (c === 'bol') { const v = U.kart.veri, j = S.D.siparisler.find(x => x.id === v.j), i = +ev.target.dataset.i, n = v.adetler.length;
        v.adetler[i] = Math.max(1, Math.round(+ev.target.value || 0)); const k = i === n - 1 ? n - 2 : n - 1;
        v.adetler[k] = j.adet - v.adetler.reduce((x, y, q) => q === k ? x : x + y, 0); bolOnizle(); }
      if (c === 'suzJ') { suzKoy('j', ev.target.value || null); if (!ev.target.value && U.suz) { U.suz.j = null; if (!Object.values(U.suz).some(Boolean)) U.suz = null; cizHafif(); } }
    }, true);
    document.addEventListener('pointerdown', ev => {
      if (!acik()) return;
      const c = ev.target.closest('.tp-cubuk'); if (!c || ev.button > 0 || !yazar()) return;
      surukleBasla(ev, c.dataset.id); try { c.setPointerCapture(ev.pointerId); } catch (e) { /* yok */ }
    });
    document.addEventListener('pointermove', ev => { if (U.surukle) surukleHareket(ev); });
    document.addEventListener('pointerup', () => { if (surukleBit()) U.yeniSurukle = true; setTimeout(() => { U.yeniSurukle = false; }, 0); });
    document.addEventListener('pointercancel', () => { if (U.surukle) { U.surukle = null; ciz(); } });
    /* siparis listesinde surukle: elle sira (381 a) */
    document.addEventListener('dragstart', ev => { const s = ev.target.closest && ev.target.closest('.tp-sip'); if (!s || !acik()) return; U.raySurukle = s.dataset.j; s.classList.add('surukle'); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', s.dataset.j); } catch (e) { /* yok */ } });
    document.addEventListener('dragover', ev => { const s = ev.target.closest && ev.target.closest('.tp-sip'); if (!s || !U.raySurukle) return; ev.preventDefault(); document.querySelectorAll('.hedef-ust').forEach(x => x.classList.remove('hedef-ust')); s.classList.add('hedef-ust'); });
    document.addEventListener('drop', ev => { const s = ev.target.closest && ev.target.closest('.tp-sip'); const j = U.raySurukle; if (!j) return; U.raySurukle = null; if (!s || s.dataset.j === j || !yazar()) { ciz(); return; } ev.preventDefault(); sirayaKoy(j, s.dataset.j); });
    document.addEventListener('dragend', () => { if (U.raySurukle) { U.raySurukle = null; ciz(); } });
    /* pano açıkken kısayollar panonundur: uygulamanın aynı tuşlara bağlı işleri (Esc, Ctrl+Z) çalışmaz */
    document.addEventListener('keydown', ev => {
      if (!acik()) return;
      const yut = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      if (ev.target.matches('input, select, textarea')) { if (ev.key === 'Escape' && bizim(ev.target)) { yut(); ev.target.blur(); if (ev.target.closest('#tp-kart')) { U.tepki = null; kartKapat(); if (U.onizleme) { U.onizleme = null; ciz(); } } } return; }
      if (ev.target.closest && ev.target.closest('dialog')) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { yut(); ev.shiftKey ? yinele() : geriAl(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { yut(); yinele(); }
      else if (ev.key === 'Escape') { yut(); if (U.surukle) { U.surukle = null; ciz(); return; } menuKapat(); U.tepki = null; kartKapat(); U.onizleme = null; U.secOp = null; U.secJob = null; U.secenek = null; ciz(); }
      else if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey) { yut(); const i = $('#tp-ara'); if (i) i.focus(); }
      else if (['1', '2', '3', '4', '5'].includes(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { yut(); U.zoom = OLCEK[+ev.key - 1][0]; U.kaydir = null; ciz(); }
    }, true);
    let zz; addEventListener('resize', () => { if (!acik()) return; clearTimeout(zz); zz = setTimeout(() => { U.kaydir = null; boyut(); ciz(); }, 120); });
  }
  function menuAc(a, m) {
    menuKapat(); const rc = a.getBoundingClientRect(), t = m && S.D.tezgahlar.find(x => x.id === m);
    const L = t ? [['olayAc', 'ariza', 'alert', `Arıza bildir · ${m}`, 'Tezgâh duruyor; üç tepkiyi gör'], ...((t.vardiyalar || []).length ? [['mesaiAc', '', 'clock', `Ek mesai · ${m}`, 'Boş vardiyayı açmayı dene']] : []),
      ['olayAc', 'eksik', 'user', 'Personel eksik', `${grupAd(t.grup)} operatörü`]] : OLAY.map(([k, ad, sm, alt]) => ['olayAc', k, sm, ad, alt]);
    document.body.insertAdjacentHTML('beforeend', `<div class="tp-perde" id="tp-mperde" data-a="menuKapat"></div><div class="tp-menu" id="tp-menu" role="menu">
      ${L.map(([x, v, sm, ad, alt]) => `<button data-a="${x}" data-v="${v}" ${m ? `data-m="${esc(m)}"` : ''}>${ic(sm)}<span>${esc(ad)}<small>${esc(alt)}</small></span></button>`).join('')}
    </div>`);
    const mn = $('#tp-menu'); mn.style.left = Math.max(8, Math.min(innerWidth - mn.offsetWidth - 8, rc.left)) + 'px'; mn.style.top = (rc.bottom + 4) + 'px';
  }
  function menuKapat() { const m = $('#tp-menu'); if (m) m.remove(); const p = $('#tp-mperde'); if (p) p.remove(); }
  /* pano kabın kalan yüksekliğini alır: üstte stüdyonun başlığı, altta telefonda alt menü; Sonuç kutusu panonun altına akar */
  function boyut() {
    const k = $('#tp-kok'); if (!k) return;
    const alt = document.querySelector('.tc-kabuk-alt');
    const altH = alt && alt.offsetParent ? alt.offsetHeight : 0;
    k.style.setProperty('--tp-yuk', Math.max(320, innerHeight - k.getBoundingClientRect().top - altH - 8) + 'px');
  }
  /* uygulama sayfayı her çizdiğinde pano yeniden takılır; çalışma planı değiştiyse önce ondan kurulur */
  function tak() {
    const k = $('#tp-kok');
    if (!k) { kartKapat(); menuKapat(); U.surukle = null; return; }
    if (!esitle()) { k.innerHTML = ''; return; }
    dnKur(); boyut(); ciz(); istekIsle();
  }
  bagla2();
  return { tak, geriAl, istek };
})(tpDis);

/* Plan sekmesi panodur; plan yoksa stüdyonun boş plan ekranı kalır */
{ const sp0 = sPlanStudyo; sPlanStudyo = function () { return S.plan ? '<div class="tp-kap" id="tp-kok"></div>' : sp0.apply(this, arguments); }; }
PS_IPUCU.plan = 'İşi tutup başka saate ya da tezgâha sürükleyin; etkisi bırakmadan görünür. Siparişe dokunun, akışı ve çözüm yolları açılsın. Her karar çalışma planına yazılır, geri alınabilir.';
{ const r0 = render; render = function () { const x = r0.apply(this, arguments); TP.tak(); return x; }; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'tp-geri') { TP.geriAl(); return true; }
  return te0(act, v, el, e);
}; }
/* Tezgâh, Sipariş, Kriz masası ve Senaryo sekmeleri menüden kalkar (Y3); onlara giden düğmeler (tahtada çift tık, tezgâh stüdyosu, Kriz masasında
   karşılaştır) Plan sekmesine gelir ve pano ilgili şeyi açar: tezgâhta ek mesai, siparişte akış, krizde olay, senaryoda denemeler. Eski sekmelerin kodu durur. */
const TP_ESKI = ['tez', 'sip', 'kriz', 'sen'];
for (const k of TP_ESKI) { const i = PS_SEK.findIndex(x => x[0] === k); if (i >= 0) PS_SEK.splice(i, 1); }
{ const sa0 = stAc; stAc = function (tur, v) {
  if (!TP_ESKI.includes(tur) || !S.plan) return sa0.apply(this, arguments);
  U.sayfa = 'studyo'; U.psSek = 'plan'; U.studyo = null; U.pencere = null; TP.istek(tur, v); render();
}; }
/* kalan iki sekme panoyla birlikte çalışır: Onay ve Plan-gerçekleşen tablolarındaki sipariş numarası siparişi panoda açar */
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if ((act === 'tp-sip' || act === 'sip-ac') && v && U.sayfa === 'studyo') { stAc('sip', v); return true; }
  return te0(act, v, el, e);
}; }
{ const pt0 = pgTablo; pgTablo = function () {
  return pt0.apply(this, arguments).replace(/<tr data-is="([^"]+)"><th scope="row"><span class="mono">([^<]*)<\/span>/g,
    (m, j, ad) => `<tr data-is="${j}"><th scope="row"><button type="button" class="pm-pa-link mono" data-act="tp-sip" data-v="${j}" title="Panoda aç">${ad}</button>`);
}; }

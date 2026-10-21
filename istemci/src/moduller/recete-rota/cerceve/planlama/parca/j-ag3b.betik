/* ---------- akış ağı (3B): verinin kısıta, kısıtın çözücüye, çözücünün karara, kararın plana nasıl aktığı ----------
   Kütüphane yok: noktalar elle döndürülür, perspektifle düzleme izdüşürülür, uzaktan yakına sıralanıp canvas'a çizilir. */
const AG_AZ = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const AG_BAS = { rx: -0.22, ry: 0.3 };
const AG = { kip: 'karar', rx: AG_BAS.rx, ry: AG_BAS.ry, faz: 0, ryBas: AG_BAS.ry, uz: 1, oto: !AG_AZ, sec: null, ust: null, tur: -1, surukle: null, raf: null, sahne: null, anahtar: '', kirli: true };
const AG_KATMAN = [
  ['veri', 'Veri', 'Tezgâh, rota, takvim, personel, malzeme ve sipariş verisi girilir. Her kısıt hangi veriden beslendiğini bilir; veri denetimi çözücüden önce koşar.'],
  ['kisit', 'Kısıtlar', 'On altı kısıt tek katalogda tanımlıdır. Her kısıt her çözücüde ya tam, ya yaklaşık, ya gevşek ya da hiç yoktur; çizginin kalınlığı bunu gösterir.'],
  ['cozucu', 'Çözücüler', 'Motor planı kurar ve hakemdir: bütün kısıtları tam uygular. HiGHS ek mesai önerir; HiGHS ayrıca alt sınırı hesaplar.'],
  ['karar', 'Kararlar', 'Her öneri motorun takviminde ölçülür. Planı iyileştiren alınır, iyileştirmeyen ya da bütçeyi aşan alınmaz; hepsi kayıtlıdır.'],
  ['plan', 'Plan ve siparişler', 'Alınan kararlar tek planda birleşir. Siparişin rengi termine göre durumunu, büyüklüğü gecikmesini gösterir.'],
];
const AG_VERI = [
  ['tezgah', 'Tezgâhlar', /tezgahlar|down/], ['rota', 'Ürün ve rota', /rota|urunler/], ['takvim', 'Takvim ve vardiya', /vardiya|tatil|calismaGun|ekMesai/],
  ['personel', 'Personel', /personel|devamsizlik|eksik/], ['ayarm', 'Ayar matrisi', /ayarMatrisi|famK/], ['aparat', 'Aparat', /aparat/],
  ['fason', 'Fason', /fason/], ['malzeme', 'Malzeme ve satın alma', /malzeme|satinalma|tedarik/], ['siparis', 'Siparişler', /siparisler|oncelik|termin|gercek|locks/],
  ['param', 'Parametreler ve bütçe', /ayarlar\.|w\.|Butce/],
];
const AG_COZ = [['motor', 'Motor (hakem)', 'motor'], ['cerceve', 'HiGHS · ek mesai', 'cerceve'], ['sinir', 'HiGHS · alt sınır', 'sinir']];
const AG_X = [-1.1, -0.6, -0.1, 0.4, 1.1];
const AG_GUC = { tam: 1, yaklasik: 0.5, gevsek: 0.5, karar: 0.5, yok: 0 };

function agRenk() {
  const cs = getComputedStyle(document.documentElement); const v = n => cs.getPropertyValue(n).trim();
  return { ink: v('--ink'), muted: v('--muted'), edge: v('--edge2'), zemin: v('--panel-solid'), grafik: v('--grafik'), grafik2: v('--grafik-2'), run: v('--run'), hold: v('--hold'), stop: v('--stop'), done: v('--done'), hazard: v('--hazard'), is: Array.from({ length: 10 }, (_, i) => v('--is-' + i)) };
}

/* Karar kipi: beş katman x ekseninde; katman içinde düğümler y-z düzleminde bir ızgaraya dizilir. */
function agKararSahne() {
  const son = studyoSon(); const N = [], E = [];
  const yer = (i, k, n) => { const sut = Math.ceil(Math.sqrt(n)), sat = Math.ceil(n / sut); const a = k % sut, b = Math.floor(k / sut);
    return [AG_X[i], sat > 1 ? -0.8 + (1.6 * b) / (sat - 1) : 0, sut > 1 ? -0.8 + (1.6 * a) / (sut - 1) : 0]; };
  const ekle = (id, katman, ad, alt, tur, boy) => { N.push({ id, katman, ad, alt, tur, boy: boy || 1 }); };
  AG_VERI.forEach(([id, ad]) => ekle('v:' + id, 0, ad, 'Veri', 'veri'));
  KISITLAR.forEach(k => ekle('k:' + k.id, 1, k.ad, k.not || 'Kısıt', 'kisit'));
  AG_COZ.forEach(([id, ad]) => ekle('c:' + id, 2, ad, id === 'motor' ? 'Bütün kısıtları tam uygular' : 'Öneri getirir; hakemden geçer', 'cozucu', id === 'motor' ? 1.5 : 1.2));
  const kr = son ? son.kararlar.slice().sort((a, b) => (b.durum === 'alindi') - (a.durum === 'alindi') || (b.dW ?? -1e9) - (a.dW ?? -1e9)).slice(0, 12) : [];
  if (kr.length) kr.forEach(k => ekle('d:' + k.id, 3, k.ad, `${KARAR_DURUM[k.durum][0]} · ${k.dW == null ? 'ölçülmedi' : (k.dW >= 0 ? '−' : '+') + sayi(Math.abs(k.dW), 1) + ' sa'}`, 'karar:' + k.durum));
  else ekle('d:yok', 3, 'Ekip henüz çalışmadı', '"Ekip olarak çöz" ile kararlar burada belirir', 'karar:yok');
  ekle('p:plan', 4, 'Plan', son ? `Ağırlıklı gecikme ${sayi(son.wT, 1)} sa · alt sınır ${sayi(son.lb, 1)} sa` : (S.plan ? `Ağırlıklı gecikme ${sayi(S.plan.ozet.wT, 1)} sa` : 'Plan yok'), 'plan', 1.6);
  const J = son ? son.J : S.plan ? Object.fromEntries(Object.entries(S.plan.J || {}).map(([j, x]) => [j, [null, x.T || 0]])) : {};
  const sl = Object.entries(J).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0)).slice(0, 15);
  sl.forEach(([j, [a, b]]) => ekle('s:' + j, 4, j, `Gecikme ${a == null ? '' : sayi(a, 1) + ' → '}${sayi(b || 0, 1)} sa`, (b || 0) > 0.05 ? 'siparis:gec' : 'siparis:zaman', 0.8 + Math.min(1.2, (b || 0) / 24)));
  const say = [0, 0, 0, 0, 0]; const top = [0, 0, 0, 0, 0]; N.forEach(n => top[n.katman]++);
  N.filter(n => n.id !== 'p:plan').forEach(n => { n.p = yer(n.katman, say[n.katman]++, top[n.katman] - (n.katman === 4 ? 1 : 0)); });
  N.find(n => n.id === 'p:plan').p = [0.78, 0, 0];
  for (const k of KISITLAR) {
    for (const [id, , re] of AG_VERI) if (re.test(k.veri)) E.push({ a: 'v:' + id, b: 'k:' + k.id, g: 0.6, tur: 'veri' });
    for (const [id, , alan] of AG_COZ) { const g = AG_GUC[k[alan]] ?? 0; if (g) E.push({ a: 'k:' + k.id, b: 'c:' + id, g, tur: g === 1 ? 'tam' : 'yaklasik', not: KDURUM[k[alan]] }); }
  }
  for (const k of kr) {
    E.push({ a: 'c:' + (k.tur === 'cpsat' ? 'cpsat' : k.tur === 'mesai' ? 'cerceve' : 'motor'), b: 'd:' + k.id, g: 0.8, tur: 'oneri' });
    if (k.tur !== 'motor') E.push({ a: 'c:motor', b: 'd:' + k.id, g: 0.5, tur: 'hakem' });
    if (k.durum === 'alindi') E.push({ a: 'd:' + k.id, b: 'p:plan', g: 1, tur: 'alindi' });
  }
  if (!kr.length) E.push({ a: 'c:motor', b: 'd:yok', g: 0.4, tur: 'hakem' });
  E.push({ a: 'c:sinir', b: 'p:plan', g: 0.5, tur: 'sinir' });
  sl.forEach(([j]) => E.push({ a: 'p:plan', b: 's:' + j, g: 0.6, tur: 'plan' }));
  return { N, E };
}

/* Üretim kipi: x zaman, y tezgâh, z sipariş; her işlem bir çubuk, rota bağları ince çizgi. */
function agUretimSahne() {
  const N = [], E = []; const p = S.plan; if (!p) return { N, E, bos: true };
  const ops = Object.values(p.ops).filter(o => !o.fas).sort((a, b) => a.S - b.S).slice(0, 700);
  if (!ops.length) return { N, E, bos: true };
  const tz = [...new Set(ops.map(o => o.m))].sort(), sp = [...new Set(ops.map(o => o.job))];
  // ufuk en geç işe değil yüzde 95'e göre ölçeklenir: tek uzun kuyruk bütün planı sola sıkıştırmasın
  const Cs = ops.map(o => o.C).sort((a, b) => a - b); const t0 = Math.min(...ops.map(o => o.S)), t1 = Cs[Math.floor(Cs.length * 0.95)]; const T = t => Math.min(1.15, -1 + (2 * (t - t0)) / Math.max(1, t1 - t0));
  const Y = m => tz.length > 1 ? -0.9 + (1.8 * tz.indexOf(m)) / (tz.length - 1) : 0, Z = j => sp.length > 1 ? -0.9 + (1.8 * sp.indexOf(j)) / (sp.length - 1) : 0;
  const J = p.J || {};
  for (const o of ops) N.push({ id: 'o:' + o.id, katman: 0, ad: o.id, alt: `${o.m} · ${fmtDT(S.D, o.S)} → ${fmtDT(S.D, o.C)}${J[o.job] && J[o.job].T > 0.05 ? ` · sipariş ${sayi(J[o.job].T, 1)} sa gecikiyor` : ''}`, tur: 'is', renk: sp.indexOf(o.job) % 10, p: [(T(o.S) + T(o.C)) / 2, Y(o.m), Z(o.job)], u: [T(o.S), T(o.C)], boy: 0.7, job: o.job });
  const by = Object.fromEntries(ops.map(o => [o.id, o]));
  const cxx = cxAl();
  for (const o of ops) for (const [pid] of ((cxx && cxx.byId[o.id]) || { pr: [] }).pr) if (by[pid]) E.push({ a: 'o:' + pid, b: 'o:' + o.id, g: 0.5, tur: 'rota', uc: 1 });
  return { N, E, tz, sp, t0, t1 };
}

function agSahne() {
  const son = studyoSon();
  const k = [AG.kip, S.dataVer, son ? son.zaman : 0, S.plan ? S.plan.ozet.wT : -1, S.plan ? Object.keys(S.plan.ops).length : 0].join('|');
  if (AG.anahtar !== k || !AG.sahne) { AG.sahne = AG.kip === 'atolye' ? agAtolyeSahne() : AG.kip === 'uretim' ? agUretimSahne() : agKararSahne(); AG.anahtar = k; AG.sahne.ix = Object.fromEntries(AG.sahne.N.map(n => [n.id, n])); }
  return AG.sahne;
}

function agKart() {
  const tur = AG.tur; const s = agSahne();
  const kipler = `<div class="pm-seg" role="tablist" aria-label="Ağ görünümü">${[['atolye', 'Atölye akışı', 'cube'], ['uretim', 'Zaman ağı', 'gantt'], ['karar', 'Karar akışı', 'layers']].map(([id, ad, sm]) => `<button type="button" role="tab" data-act="ag-kip" data-v="${id}" aria-selected="${AG.kip === id}" aria-pressed="${AG.kip === id}">${ic(sm, 'k')}${ad}</button>`).join('')}</div>`;
  const arac = `<div class="pm-dugmeler">${dugme('', 'ag-oto', { simge: AG.oto ? 'pause' : 'play', kucuk: true, ad: AG.oto ? 'Dönmeyi durdur' : 'Kendiliğinden döndür' })}${dugme('', 'ag-sifirla', { simge: 'rotate', kucuk: true, ad: 'Görünümü sıfırla' })}${AG.kip === 'karar' ? dugme(tur < 0 ? 'Akışı adım adım göster' : 'Turu bitir', 'ag-tur', { simge: tur < 0 ? 'next' : 'x', kucuk: true, veri: `data-v="${tur < 0 ? 0 : 'bitir'}"` }) : ''}</div>`;
  const zaman = AG.kip === 'atolye' && !s.bos ? `<div class="pm-ag-zaman">${dugme('', 'ag-oynat', { simge: AG.oynat ? 'pause' : 'play', kucuk: true, ad: AG.oynat ? 'Durdur' : 'Planı oynat' })}<input type="range" id="ag-zaman" min="${s.now}" max="${s.t1}" step="0.25" value="${AG.zaman != null ? AG.zaman : s.now}" aria-label="Plan saati"><span class="pm-kucuk" id="ag-zaman-ozet" role="status"></span></div>` : '';
  const anlat = AG.kip === 'karar' && tur >= 0 ? `<div class="pm-ag-tur" role="status"><span class="mono">${tur + 1} / ${AG_KATMAN.length}</span><b>${esc(AG_KATMAN[tur][1])}</b><p>${esc(AG_KATMAN[tur][2])}</p><div class="pm-dugmeler">${dugme('', 'ag-tur', { simge: 'back', kucuk: true, ad: 'Önceki adım', veri: `data-v="${Math.max(0, tur - 1)}"` })}${dugme('', 'ag-tur', { simge: 'next', kucuk: true, ad: 'Sonraki adım', veri: `data-v="${Math.min(AG_KATMAN.length - 1, tur + 1)}"` })}</div></div>` : '';
  const lejant = AG.kip === 'karar'
    ? `<div class="pm-lejant"><span><i data-tur="veri"></i>Veri</span><span><i data-tur="kisit"></i>Kısıt</span><span><i data-tur="cozucu"></i>Çözücü</span><span><i data-tur="azal"></i>Alınan karar</span><span><i data-tur="aday"></i>Alınmayan</span><span><i data-tur="art"></i>Geciken sipariş</span><span><i data-tur="zaman"></i>Zamanında</span><span class="pm-kucuk">Kalın çizgi: kısıt o çözücüde tam; ince: yaklaşık ya da gevşek.</span></div>`
    : AG.kip === 'atolye' ? `<div class="pm-lejant"><span><i data-tur="tezgah"></i>Tezgâh</span><span><i data-tur="calisiyor"></i>Çalışıyor</span><span><i data-tur="ayarda"></i>Ayarda</span><span><i data-tur="bos"></i>Boş</span><span><i data-tur="gec"></i>Geciken sipariş</span><span class="pm-kucuk">Yığın: sıradaki işler · yay: parça akışı · nokta: yoldaki parti</span></div>`
    : `<div class="pm-lejant"><span class="pm-kucuk">Yatay eksen zaman, yükseklik tezgâh, derinlik sipariş; renk siparişi, ince çizgi rota bağını gösterir. ${s.bos ? '' : `${s.N.length} işlem, ${s.tz.length} tezgâh, ${s.sp.length} sipariş.`}</span></div>`;
  const katmanAd = AG.kip === 'karar' ? `<div class="pm-ag-katmanlar" aria-hidden="true">${AG_KATMAN.map(([, ad], i) => `<span data-etkin="${tur < 0 || tur === i}">${esc(ad)}</span>`).join('')}</div>` : '';
  const bos = AG.kip !== 'karar' && s.bos ? '<p class="pm-alt">Plan yok. Önce bir plan çözün.</p>' : '';
  const gov = `<div class="pm-ag-ust">${kipler}${arac}</div>${zaman}${anlat}${bos || `<div class="pm-ag-kap">${katmanAd}<div class="pm-ag"><canvas id="ag-cv" tabindex="0" role="img" aria-label="${AG.kip === 'karar' ? 'Veriden plana akış ağı: veri, kısıt, çözücü, karar ve sipariş katmanları' : 'Planın üç boyutlu görünümü: zaman, tezgâh ve sipariş'}. Sürükleyerek döndürün, tekerlekle yakınlaştırın; ok tuşları ve artı eksi da çalışır."></canvas><div class="pm-ag-ipucu" id="ag-ipucu" hidden></div></div><div class="pm-ag-detay" id="ag-detay">${agDetay()}</div></div>`}${lejant}`;
  return kart(`${ic('cube', 'k')} ${AG.kip === 'karar' ? 'Veriden plana: akış ağı' : AG.kip === 'atolye' ? 'Atölye akışı' : 'Planın zaman ağı'}`, gov, '', '<span class="pm-kucuk">sürükle: döndür · tekerlek: yakınlaştır</span>');
}

function agDetay() {
  const s = AG.sahne; const n = s && AG.sec && s.ix[AG.sec];
  if (s && s.atolye) return n ? agAtolyeDetay(n) : '<p class="pm-kucuk">Bir tezgâha tıklayın: şu an ne çalıştığı ve sıradaki işler burada listelenir.</p>';
  if (!n) return `<p class="pm-kucuk">${AG.kip === 'karar' ? 'Bir düğüme tıklayın: neye bağlı olduğu ve neyi etkilediği burada listelenir.' : 'Bir işleme tıklayın: tezgâhı, saati ve rota bağları burada listelenir.'}</p>`;
  const gel = s.E.filter(e => e.b === n.id).map(e => s.ix[e.a]).filter(Boolean), git = s.E.filter(e => e.a === n.id).map(e => s.ix[e.b]).filter(Boolean);
  const liste = (b, l) => l.length ? `<div class="pm-ag-bag"><span class="pm-kucuk">${b} (${l.length})</span><div>${l.slice(0, 16).map(x => `<button type="button" class="pm-fis" data-act="ag-sec" data-v="${esc(x.id)}">${esc(x.ad)}</button>`).join('')}${l.length > 16 ? `<span class="pm-kucuk">+${l.length - 16}</span>` : ''}</div></div>` : '';
  const kat = AG.kip === 'karar' ? AG_KATMAN[n.katman][1] : 'İşlem';
  const git2 = n.id.startsWith('s:') ? dugme('Plan masasında gör', 'sec-is-masa', { kucuk: true, simge: 'gantt', veri: `data-v="${esc(n.id.slice(2))}"` }) : n.id.startsWith('o:') ? dugme('Plan masasında gör', 'sec-is-masa', { kucuk: true, simge: 'gantt', veri: `data-v="${esc(n.job)}"` }) : n.id.startsWith('k:') ? dugme('Kısıtlar', 'git', { kucuk: true, simge: 'target', veri: 'data-v="kisitlar"' }) : '';
  return `<div class="pm-ag-sec"><span class="pm-kucuk">${esc(kat)}</span><b>${esc(n.ad)}</b><p class="pm-kucuk">${esc(n.alt || '')}</p>${liste(AG.kip === 'karar' ? 'Beslendiği' : 'Önceki işlem', gel)}${liste(AG.kip === 'karar' ? 'Etkilediği' : 'Sonraki işlem', git)}<div class="pm-dugmeler">${git2}${dugme('Seçimi kaldır', 'ag-sec', { kucuk: true, hayalet: true, simge: 'x', veri: 'data-v=""' })}</div></div>`;
}

/* izdüşüm: önce y ekseni etrafında, sonra x ekseni etrafında döndür; göz z=+D'de */
function agIzdus(p, W, H) {
  const cy = Math.cos(AG.ry), sy = Math.sin(AG.ry), cx = Math.cos(AG.rx), sx = Math.sin(AG.rx);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
  const D = 3.4, f = (Math.min(W, H) * 0.42 * AG.uz * D) / (D - z2);
  return [W / 2 + x1 * f, H / 2 - y2 * f, z2, f];
}

function agRenkOf(n, R) {
  if (n.tur === 'veri') return R.grafik2; if (n.tur === 'kisit') return R.muted; if (n.tur === 'cozucu') return R.grafik; if (n.tur === 'plan') return R.hazard;
  if (n.tur === 'is') return R.is[n.renk]; if (n.tur === 'siparis:gec') return R.stop; if (n.tur === 'siparis:zaman') return R.run;
  if (n.tur === 'karar:alindi') return R.run; if (n.tur === 'karar:butce' || n.tur === 'karar:haric') return R.hold; return R.edge;
}

function agCiz() {
  const cv = document.getElementById('ag-cv'); if (!cv) return false;
  const s = agSahne(); const R = AG.renk || (AG.renk = agRenk());
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return true;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (s.atolye) { agAtolyeCiz(g, W, H, s, R); return true; }
  const tur = AG.kip === 'karar' ? AG.tur : -1; const sec = AG.sec, ust = AG.ust;
  const komsu = new Set(); if (sec || ust) for (const e of s.E) { const h = sec || ust; if (e.a === h) komsu.add(e.b); if (e.b === h) komsu.add(e.a); }
  const sonuk = n => (tur >= 0 && n.katman !== tur) || ((sec || ust) && n.id !== (sec || ust) && !komsu.has(n.id));
  for (const n of s.N) { n.q = agIzdus(n.p, W, H); if (n.u) { n.q0 = agIzdus([n.u[0], n.p[1], n.p[2]], W, H); n.q1 = agIzdus([n.u[1], n.p[1], n.p[2]], W, H); } }
  // zemin ızgarası: karar kipinde katman çerçeveleri, üretimde zaman ekseni
  g.lineWidth = 1; g.strokeStyle = R.edge; g.globalAlpha = 0.5;
  if (AG.kip === 'karar') for (let i = 0; i < 5; i++) { const x = AG_X[i]; const k = [[x, -1, -1], [x, -1, 1], [x, 1, 1], [x, 1, -1]].map(p => agIzdus(p, W, H)); g.beginPath(); k.forEach((q, j) => j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.stroke(); }
  else { const k = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]].map(p => agIzdus(p, W, H)); g.beginPath(); k.forEach((q, j) => j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.stroke(); }
  g.globalAlpha = 1;
  // kenarlar uzaktan yakına
  const es = s.E.map(e => ({ e, a: s.ix[e.a], b: s.ix[e.b] })).filter(x => x.a && x.b).sort((x, y) => (x.a.q[2] + x.b.q[2]) - (y.a.q[2] + y.b.q[2]));
  for (const { e, a, b } of es) {
    const vurgu = (sec || ust) && (e.a === (sec || ust) || e.b === (sec || ust)); const dim = !vurgu && ((sec || ust) || (tur >= 0 && a.katman !== tur && b.katman !== tur));
    const qa = a.q1 || a.q, qb = b.q0 || b.q;
    g.globalAlpha = dim ? 0.08 : vurgu ? 0.95 : 0.22 + 0.4 * e.g; g.strokeStyle = e.tur === 'alindi' ? R.run : e.tur === 'tam' || e.tur === 'oneri' ? R.grafik : e.tur === 'rota' ? R.muted : R.muted;
    g.lineWidth = (e.tur === 'tam' || e.tur === 'alindi' ? 2 : 1) * (vurgu ? 1.5 : 1); g.setLineDash(e.tur === 'yaklasik' || e.tur === 'hakem' || e.tur === 'sinir' ? [4, 4] : []);
    g.beginPath(); g.moveTo(qa[0], qa[1]); g.lineTo(qb[0], qb[1]); g.stroke();
  }
  g.setLineDash([]);
  // düğümler uzaktan yakına; 2 px zemin halkası örtüşmeyi ayırır
  const ns = s.N.slice().sort((a, b) => a.q[2] - b.q[2]);
  for (const n of ns) {
    const dim = sonuk(n); const r = Math.max(3, n.boy * (AG.kip === 'karar' ? 6 : 3.2) * (n.q[3] / (Math.min(W, H) * 0.42 * AG.uz)) * AG.uz);
    g.globalAlpha = dim ? 0.18 : 1; const c = agRenkOf(n, R);
    if (n.u) { g.strokeStyle = R.zemin; g.lineWidth = r * 1.6 + 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(n.q0[0], n.q0[1]); g.lineTo(n.q1[0], n.q1[1]); g.stroke(); g.strokeStyle = c; g.lineWidth = r * 1.6; g.stroke(); g.lineCap = 'butt'; }
    else { g.fillStyle = R.zemin; g.beginPath(); g.arc(n.q[0], n.q[1], r + 2, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(n.q[0], n.q[1], r, 0, 7); g.fill();
      if (n.tur === 'karar:alinmadi' || n.tur === 'karar:yok') { g.fillStyle = R.zemin; g.beginPath(); g.arc(n.q[0], n.q[1], r * 0.45, 0, 7); g.fill(); } }
    if (n.id === sec || n.id === ust) { g.strokeStyle = R.ink; g.lineWidth = 2; g.beginPath(); g.arc(n.q[0], n.q[1], r + 5, 0, 7); g.stroke(); }
    n.r = r;
  }
  // yalnız seçili katmanın, çözücülerin ve planın adı yazılır; gerisi ipucunda
  g.globalAlpha = 1; g.fillStyle = R.ink; g.font = '600 12px ' + (getComputedStyle(cv).fontFamily || 'sans-serif'); g.textBaseline = 'middle';
  for (const n of ns) { const yaz = AG.kip === 'karar' && (n.tur === 'cozucu' || n.tur === 'plan' || (tur >= 0 && n.katman === tur) || n.id === sec || komsu.has(n.id) && sec); if (!yaz || (sonuk(n) && n.id !== sec)) continue;
    const t = n.ad.length > 28 ? n.ad.slice(0, 27) + '…' : n.ad; g.fillStyle = R.zemin; g.globalAlpha = 0.85; const w = g.measureText(t).width; g.fillRect(n.q[0] + n.r + 4, n.q[1] - 8, w + 6, 16); g.globalAlpha = 1; g.fillStyle = R.ink; g.fillText(t, n.q[0] + n.r + 7, n.q[1]); }
  return true;
}

function agBul(cv, x, y) { const s = AG.sahne; if (!s) return null; let en = null, ed = 1e9;
  for (const n of s.N) { if (!n.q) continue; let d;
    if (n.u) { const [ax, ay] = n.q0, [bx, by] = n.q1; const vx = bx - ax, vy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1))); d = Math.hypot(x - ax - t * vx, y - ay - t * vy); }
    else d = Math.hypot(x - n.q[0], y - n.q[1]);
    const lim = Math.max(10, (n.r || 4) + 4); if (d < lim && (d < ed || (n.q[2] > (en && en.q[2]) && d < lim))) { ed = d; en = n; } }
  return en; }

function agDongu() {
  if (!agCiz()) { AG.raf = null; return; }
  // kendiliğinden dönüş tam tur değil, salınım: katman sırası soldan sağa okunur kalır
  if (AG.oto && !AG.surukle) { AG.faz += 0.008; AG.ry = AG.ryBas + 0.5 * Math.sin(AG.faz); AG.kirli = true; }
  if (AG.kirli) { AG.kirli = false; }
  AG.raf = requestAnimationFrame(() => { if (AG.oto || AG.kirli || AG.surukle) agDongu(); else AG.raf = null; });
}
function agTetikle() { AG.kirli = true; if (!AG.raf) agDongu(); }

function agBagla() {
  const cv = document.getElementById('ag-cv'); if (!cv || cv.dataset.bagli) return;
  cv.dataset.bagli = '1'; AG.renk = agRenk();
  const ipucu = document.getElementById('ag-ipucu');
  const nokta = o => { const r = cv.getBoundingClientRect(); return [o.clientX - r.left, o.clientY - r.top]; };
  cv.addEventListener('pointerdown', o => { AG.surukle = { x: o.clientX, y: o.clientY, rx: AG.rx, ry: AG.ry, oynadi: false }; cv.setPointerCapture(o.pointerId); });
  cv.addEventListener('pointermove', o => {
    const d = AG.surukle;
    if (d) { const dx = o.clientX - d.x, dy = o.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3 && !d.oynadi) { d.oynadi = true; agOtoKapat(); } AG.ry = d.ry + dx * 0.008; AG.rx = Math.max(-1.45, Math.min(1.45, d.rx + dy * 0.008)); agTetikle(); return; }
    const [x, y] = nokta(o); const n = agBul(cv, x, y); const id = n ? n.id : null;
    if (id !== AG.ust) { AG.ust = id; agTetikle(); }
    if (n && ipucu) { ipucu.hidden = false; ipucu.innerHTML = `<b>${esc(n.ad)}</b><span>${esc(n.alt || '')}</span>`; const w = cv.clientWidth; ipucu.style.setProperty('--x', `${Math.min(x + 14, w - 220)}px`); ipucu.style.setProperty('--y', `${y + 14}px`); }
    else if (ipucu) ipucu.hidden = true;
  });
  const birak = o => { const d = AG.surukle; AG.surukle = null; if (d && !d.oynadi) { const [x, y] = nokta(o); const n = agBul(cv, x, y); agSecYap(n ? n.id : null); } agTetikle(); };
  cv.addEventListener('pointerup', birak); cv.addEventListener('pointercancel', () => { AG.surukle = null; });
  cv.addEventListener('pointerleave', () => { if (AG.ust) { AG.ust = null; agTetikle(); } if (ipucu) ipucu.hidden = true; });
  cv.addEventListener('wheel', o => { o.preventDefault(); AG.uz = Math.max(0.5, Math.min(3.5, AG.uz * Math.exp(-o.deltaY * (o.deltaMode === 1 ? 0.05 : 0.0015)))); agTetikle(); }, { passive: false });
  cv.addEventListener('keydown', o => {
    const k = o.key; let ok = true;
    if (k === 'ArrowLeft') AG.ry -= 0.12; else if (k === 'ArrowRight') AG.ry += 0.12; else if (k === 'ArrowUp') AG.rx = Math.max(-1.45, AG.rx - 0.12); else if (k === 'ArrowDown') AG.rx = Math.min(1.45, AG.rx + 0.12);
    else if (k === '+' || k === '=') AG.uz = Math.min(3.5, AG.uz * 1.15); else if (k === '-') AG.uz = Math.max(0.5, AG.uz / 1.15); else ok = false;
    if (ok) { o.preventDefault(); agOtoKapat(); agTetikle(); }
  });
  const zr = document.getElementById('ag-zaman'); if (zr) zr.addEventListener('input', () => { AG.zaman = +zr.value; agTetikle(); });
  agTetikle();
}
function agOtoKapat() {
  if (!AG.oto) return; AG.oto = false; AG.ryBas = AG.ry;
  const b = document.querySelector('[data-act="ag-oto"]'); if (b) b.outerHTML = dugme('', 'ag-oto', { simge: 'play', kucuk: true, ad: 'Kendiliğinden döndür' });
}
function agSecYap(id) {
  AG.sec = id || null; const d = document.getElementById('ag-detay'); if (d) d.innerHTML = agDetay(); agTetikle();
}

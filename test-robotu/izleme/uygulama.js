// Robot izleme arayüzü. Koşu verisi başka süreçten gelir: metin yalnız textContent ile yazılır, HTML olarak işlenmez.

const icerik = document.getElementById('icerik');
const YENILEME_MS = 3000;
const SONUC_ADI = { gecti: 'Geçti', dustu: 'Düştü', 'ara-sira': 'Ara sıra', baglanmamis: 'Bağlanmamış' };
const SONUC_IKONU = { gecti: 'i-gecti', dustu: 'i-dustu', 'ara-sira': 'i-ara', baglanmamis: 'i-baglanmamis' };
const DURUM_ADI = { kosuyor: 'Koşuyor', bitti: 'Bitti', durdu: 'Durdu' };

let zamanlayici = null;
let grafik = null;

function el(etiket, ozellik = {}, ...cocuklar) {
  const d = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellik)) {
    if (deger === null || deger === undefined || deger === false) continue;
    if (ad === 'sinif') d.className = deger;
    else if (ad.startsWith('on')) d.addEventListener(ad.slice(2), deger);
    else d.setAttribute(ad, deger === true ? '' : String(deger));
  }
  for (const c of cocuklar.flat()) {
    if (c === null || c === undefined || c === false) continue;
    d.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return d;
}

function ikon(ad) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ikon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${ad}`);
  svg.append(use);
  return svg;
}

const rozet = (sonuc, sayi) => el('span', { sinif: `rozet rozet-${sonuc}`, title: SONUC_ADI[sonuc] },
  ikon(SONUC_IKONU[sonuc]), sayi === undefined ? SONUC_ADI[sonuc] : String(sayi));

const sayacRozetleri = (sayac) => el('span', { sinif: 'rozetler' }, Object.keys(SONUC_ADI).map((s) => rozet(s, sayac?.[s] ?? 0)));

const tarih = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' }) : '-');
const saat = (iso) => (iso ? new Date(iso).toLocaleTimeString('tr-TR') : '-');

function sure(bas, bit) {
  if (!bas) return '-';
  const ms = (bit ? new Date(bit) : new Date()) - new Date(bas);
  const dk = Math.floor(ms / 60000);
  const sn = Math.floor((ms % 60000) / 1000);
  return dk >= 60 ? `${String(Math.floor(dk / 60))} sa ${String(dk % 60)} dk` : `${String(dk)} dk ${String(sn)} sn`;
}

async function al(yol) {
  const c = await fetch(yol, { headers: { accept: 'application/json' } });
  const govde = await c.json().catch(() => ({}));
  if (!c.ok) throw new Error(govde.hata ?? `HTTP ${String(c.status)}`);
  return govde;
}

const kutu = (baslik, ikonAdi, ...cocuklar) => el('section', { sinif: 'kutu' },
  el('h2', {}, ikonAdi ? ikon(ikonAdi) : null, baslik), ...cocuklar);

const bos = (metin) => el('p', { sinif: 'bos' }, metin);
const hataGoster = (e) => el('p', { sinif: 'hata', role: 'alert' }, ikon('i-dustu'), e.message);

// Dar ekranda tablo satırı karta döner; her hücre başlığını data-baslik ile taşır.
function tablo(basliklar, satirlar, satirTiklama) {
  return el('div', { sinif: 'tablo-kap' }, el('table', { sinif: 'tablo' },
    el('thead', {}, el('tr', {}, basliklar.map((b) => el('th', { scope: 'col' }, b)))),
    el('tbody', {}, satirlar.map((hucreler, i) => el('tr', satirTiklama ? {
      sinif: 'tiklanir', tabindex: 0,
      onclick: () => satirTiklama(i),
      onkeydown: (o) => { if (o.key === 'Enter') satirTiklama(i); },
    } : {}, hucreler.map((h, j) => el('td', { 'data-baslik': basliklar[j] }, h)))))));
}

function menuIsaretle(ad) {
  for (const a of document.querySelectorAll('[data-menu]')) a.classList.toggle('secili', a.dataset.menu === ad);
}

function yenidenKur(fn) {
  if (zamanlayici !== null) clearTimeout(zamanlayici);
  zamanlayici = setTimeout(fn, YENILEME_MS);
}

function temizle() {
  if (zamanlayici !== null) clearTimeout(zamanlayici);
  zamanlayici = null;
  if (grafik !== null) grafik.destroy();
  grafik = null;
}

async function kosularEkrani() {
  menuIsaretle('kosular');
  const { kok, kosular } = await al('/api/kosular');
  const govde = kutu('Koşular', 'i-liste', el('p', { sinif: 'ince' }, `Kök: ${kok}`));
  if (kosular.length === 0) govde.append(bos('Henüz koşu yok. "npm run robot" ile bir koşu başlatın.'));
  else {
    govde.append(tablo(['Koşu', 'Başlangıç', 'Taban', 'Süre', 'Gün', 'Durum', 'Sayaç'], kosular.map((k) => (k.ozet ? [
      k.kosuId, tarih(k.ozet.baslangic), k.ozet.taban ?? '-', sure(k.ozet.baslangic, k.ozet.bitis),
      `${String(k.ozet.gun)}/${String(k.ozet.gunSayisi)}`,
      el('span', { sinif: `durum durum-${k.ozet.durum}` }, DURUM_ADI[k.ozet.durum]), sayacRozetleri(k.ozet.sayac),
    ] : [k.kosuId, el('span', { sinif: 'hata' }, k.hata), '-', '-', '-', '-', '-'])),
    (i) => { location.hash = `#/kosu/${kosular[i].kosuId}`; }));
  }
  icerik.replaceChildren(govde);
  if (kosular.some((k) => k.ozet?.durum === 'kosuyor')) yenidenKur(goster);
}

const suzgecDurumu = { sonuc: '', rol: '', senaryo: '', gun: '', sayfa: 0 };

function secim(ad, etiket, secenekler, adlar = {}) {
  return el('label', { sinif: 'secim' }, el('span', {}, etiket), el('select', {
    onchange: (o) => { suzgecDurumu[ad] = o.target.value; suzgecDurumu.sayfa = 0; goster(); },
  }, el('option', { value: '' }, 'Hepsi'), secenekler.map((s) => el('option', {
    value: String(s), selected: String(s) === suzgecDurumu[ad],
  }, adlar[s] ?? String(s)))));
}

async function kosuEkrani(id) {
  menuIsaretle('kosular');
  const q = new URLSearchParams();
  for (const ad of ['sonuc', 'rol', 'senaryo', 'gun']) if (suzgecDurumu[ad] !== '') q.set(ad, suzgecDurumu[ad]);
  q.set('sayfa', String(suzgecDurumu.sayfa));
  const [k, liste] = await Promise.all([al(`/api/kosular/${encodeURIComponent(id)}`), al(`/api/kosular/${encodeURIComponent(id)}/adimlar?${q.toString()}`)]);
  const o = k.ozet;
  const ust = el('div', { sinif: 'baslik-satiri' },
    el('a', { href: '#/', sinif: 'dugme' }, ikon('i-geri'), 'Koşular'),
    el('h2', {}, `Koşu ${o.kosuId}`),
    el('span', { sinif: `durum durum-${o.durum}` }, DURUM_ADI[o.durum]),
    k.yorumVar ? el('a', { href: `#/kosu/${id}/yorum`, sinif: 'dugme' }, ikon('i-yorum'), 'Model yorumu') : null);
  const ozet = el('dl', { sinif: 'ozet' },
    ...[['Başlangıç', tarih(o.baslangic)], ['Süre', sure(o.baslangic, o.bitis)], ['Gün', `${String(o.gun)}/${String(o.gunSayisi)}`],
      ['Taban', o.taban ?? '-'], ['Tohum', String(o.tohum)], ['Model', `${o.model.kip} (${String(o.model.cagri)}/${String(o.model.ustSinir)})`],
      ['Adım', String(k.adimSayisi)]].map(([a, d]) => el('div', {}, el('dt', {}, a), el('dd', {}, d))),
    el('div', {}, el('dt', {}, 'Sayaç'), el('dd', {}, sayacRozetleri(o.sayac))));
  const uyarilar = [
    o.ileti ? el('p', { sinif: 'uyari' }, o.ileti) : null,
    k.bozuk.length > 0 ? el('p', { sinif: 'hata' }, `${String(k.bozuk.length)} bozuk satır okunamadı (ilki satır ${String(k.bozuk[0].satir)}: ${k.bozuk[0].neden}).`) : null,
  ];
  const canli = kutu(o.durum === 'kosuyor' ? `Canlı: gün ${String(o.gun)}, rollerin son adımı` : 'Rollerin son adımı', 'i-canli',
    k.sonAdimlar.length === 0 ? bos('Henüz adım yok.') : tablo(['Rol', 'Saat', 'Senaryo / adım', 'Sonuç', 'Süre'],
      k.sonAdimlar.map((a) => [a.rol, saat(a.zaman), `${a.senaryo} / ${a.adim}`, rozet(a.sonuc), `${String(a.sureMs)} ms`]),
      (i) => { location.hash = `#/kosu/${id}/adim/${String(k.sonAdimlar[i].sira)}`; }));
  const suzgecler = el('div', { sinif: 'suzgecler' },
    secim('sonuc', 'Sonuç', Object.keys(SONUC_ADI), SONUC_ADI), secim('rol', 'Rol', k.roller),
    secim('senaryo', 'Senaryo', k.senaryolar), secim('gun', 'Gün', k.gunler));
  const sayfaSayisi = Math.max(1, Math.ceil(liste.toplam / liste.sayfaBoyu));
  const sayfalama = el('div', { sinif: 'sayfalama' },
    el('button', { type: 'button', disabled: liste.sayfa === 0, onclick: () => { suzgecDurumu.sayfa -= 1; goster(); } }, 'Önceki'),
    el('span', {}, `${String(liste.sayfa + 1)} / ${String(sayfaSayisi)} (${String(liste.toplam)} adım, yeniden eskiye)`),
    el('button', { type: 'button', disabled: liste.sayfa + 1 >= sayfaSayisi, onclick: () => { suzgecDurumu.sayfa += 1; goster(); } }, 'Sonraki'));
  const adimlar = kutu('Adımlar', 'i-liste', suzgecler, liste.adimlar.length === 0 ? bos('Süzgece uyan adım yok.')
    : tablo(['Gün', 'Saat', 'Rol', 'Senaryo / adım', 'Tür', 'Sonuç', 'Süre', 'İstek'], liste.adimlar.map((a) => [
      String(a.gun), saat(a.zaman), a.rol, `${a.senaryo} / ${a.adim}`, a.tur, rozet(a.sonuc), `${String(a.sureMs)} ms`,
      a.yol ? `${a.yontem ?? ''} ${a.yol}` : '-',
    ]), (i) => { location.hash = `#/kosu/${id}/adim/${String(liste.adimlar[i].sira)}`; }), sayfalama);
  const uclar = kutu('En yavaş uçlar (p95)', 'i-egilim', k.uclar.length === 0 ? bos('İstek adımı yok.')
    : tablo(['Uç', 'Adet', 'p50', 'p95'], k.uclar.map((u) => [u.uc, String(u.adet), `${String(u.p50)} ms`, `${String(u.p95)} ms`])));
  icerik.replaceChildren(ust, ozet, ...uyarilar.filter(Boolean), canli, adimlar, uclar);
  if (o.durum === 'kosuyor') yenidenKur(goster);
}

async function adimEkrani(id, sira) {
  menuIsaretle('kosular');
  const a = await al(`/api/kosular/${encodeURIComponent(id)}/adimlar/${encodeURIComponent(sira)}`);
  const alan = (ad, deger) => el('div', {}, el('dt', {}, ad), el('dd', {}, deger ?? '-'));
  const ekler = a.ek.length === 0 ? bos('Ek yok.') : el('div', { sinif: 'ekler' }, a.ek.map((e) => {
    const adres = `/api/kosular/${encodeURIComponent(id)}/ek?yol=${encodeURIComponent(e.yol)}`;
    if (!e.var) return el('p', { sinif: 'hata' }, `${e.yol}: bulunamadı ya da koşu klasörü dışında`);
    return e.tur.startsWith('image/')
      ? el('figure', {}, el('a', { href: adres, target: '_blank', rel: 'noopener' }, el('img', { src: adres, alt: e.yol, loading: 'lazy' })), el('figcaption', {}, e.yol))
      : el('a', { href: adres, sinif: 'dugme', download: '' }, ikon('i-ek'), e.yol);
  }));
  icerik.replaceChildren(
    el('div', { sinif: 'baslik-satiri' }, el('a', { href: `#/kosu/${id}`, sinif: 'dugme' }, ikon('i-geri'), `Koşu ${id}`),
      el('h2', {}, `${a.senaryo} / ${a.adim}`), rozet(a.sonuc)),
    el('dl', { sinif: 'ozet' }, alan('Gün', String(a.gun)), alan('Zaman', tarih(a.zaman)), alan('Rol', a.rol), alan('Tür', a.tur),
      alan('Süre', `${String(a.sureMs)} ms`), alan('İstek', a.yol ? `${a.yontem ?? ''} ${a.yol}` : null)),
    a.ileti ? el('p', { sinif: a.sonuc === 'dustu' ? 'hata' : 'uyari' }, a.ileti) : null,
    el('div', { sinif: 'kiyas' },
      kutu('Beklenen', 'i-gecti', el('pre', {}, a.beklenen ?? '-')),
      kutu('Gelen', a.sonuc === 'dustu' ? 'i-dustu' : 'i-gecti', el('pre', {}, a.gelen ?? '-'))),
    kutu('Ekler', 'i-ek', ekler));
}

async function yorumEkrani(id) {
  menuIsaretle('kosular');
  const { yorum } = await al(`/api/kosular/${encodeURIComponent(id)}/yorum`);
  icerik.replaceChildren(
    el('div', { sinif: 'baslik-satiri' }, el('a', { href: `#/kosu/${id}`, sinif: 'dugme' }, ikon('i-geri'), `Koşu ${id}`), el('h2', {}, 'Model yorumu')),
    el('p', { sinif: 'ince' }, 'Yorum karar değildir; bulgu kullanıcı onayıyla karta geçer.'),
    kutu('Yorum', 'i-yorum', yorum === null ? bos('Bu koşuda model yorumu yok (model kapalı ya da koşu sürüyor).') : el('pre', { sinif: 'yorum' }, yorum)));
}

const renk = (ad) => getComputedStyle(document.documentElement).getPropertyValue(ad).trim();

async function egilimEkrani() {
  menuIsaretle('egilim');
  const { kosular } = await al('/api/egilim');
  if (kosular.length === 0) { icerik.replaceChildren(kutu('Eğilim', 'i-egilim', bos('Okunabilen koşu yok.'))); return; }
  const tuval = el('canvas', { 'aria-label': 'Koşudan koşuya düşen, ara sıra düşen ve p95 süre' });
  const degisim = kosular.slice().reverse().filter((k) => k.yeniDusen.length + k.duzelen.length + k.yavaslayan.length > 0);
  icerik.replaceChildren(
    kutu('Koşudan koşuya', 'i-egilim', el('div', { sinif: 'grafik' }, tuval)),
    kutu('Değişenler (yeniden eskiye)', 'i-ara', degisim.length === 0 ? bos('Önceki koşuya göre yeni düşen, düzelen ya da yavaşlayan yok.')
      : el('div', {}, degisim.map((k) => el('div', { sinif: 'degisim' },
        el('h3', {}, el('a', { href: `#/kosu/${k.kosuId}` }, k.kosuId), ` ${tarih(k.baslangic)}`),
        k.yeniDusen.length ? el('p', {}, rozet('dustu'), ' Yeni düşen: ', k.yeniDusen.join(', ')) : null,
        k.duzelen.length ? el('p', {}, rozet('gecti'), ' Düzelen: ', k.duzelen.join(', ')) : null,
        k.yavaslayan.length ? el('ul', {}, k.yavaslayan.map((y) => el('li', {}, `${y.uc}: p95 ${String(y.onceki)} ms → ${String(y.simdi)} ms`))) : null)))));
  if (typeof window.Chart !== 'function') return;
  grafik = new window.Chart(tuval, {
    type: 'line',
    data: {
      labels: kosular.map((k) => k.kosuId),
      datasets: [
        { label: 'Düştü', data: kosular.map((k) => k.sayac.dustu), borderColor: renk('--dustu'), backgroundColor: renk('--dustu'), yAxisID: 'adet' },
        { label: 'Ara sıra', data: kosular.map((k) => k.sayac['ara-sira']), borderColor: renk('--ara-sira'), backgroundColor: renk('--ara-sira'), yAxisID: 'adet' },
        { label: 'p95 (ms)', data: kosular.map((k) => k.p95), borderColor: renk('--vurgu'), backgroundColor: renk('--vurgu'), borderDash: [6, 4], yAxisID: 'sure' },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      color: renk('--yazi'),
      scales: {
        adet: { position: 'left', beginAtZero: true, ticks: { precision: 0, color: renk('--ince') }, grid: { color: renk('--cizgi') } },
        sure: { position: 'right', beginAtZero: true, ticks: { color: renk('--ince') }, grid: { display: false } },
        x: { ticks: { color: renk('--ince') }, grid: { color: renk('--cizgi') } },
      },
    },
  });
}

async function araSiraEkrani() {
  menuIsaretle('ara-sira');
  const { adimlar } = await al('/api/ara-sira');
  icerik.replaceChildren(kutu('Ara sıra düşenler', 'i-ara',
    el('p', { sinif: 'ince' }, 'İlk denemede düşüp ikincide geçen yan etkisiz adımlar, son koşular boyunca. Çok koşuda görülen kırılganlık ya da gerçek yarıştır.'),
    adimlar.length === 0 ? bos('Ara sıra düşen adım yok.') : tablo(['Senaryo / adım', 'Koşu sayısı', 'Toplam', 'Roller', 'Son görülme', 'Son ileti'],
      adimlar.map((a) => [a.adim, String(a.kosuSayisi), String(a.adet), a.roller.join(', '),
        el('a', { href: `#/kosu/${a.son.kosuId}` }, `${a.son.kosuId}, gün ${String(a.son.gun)}`), a.son.ileti ?? '-']))));
}

async function goster() {
  temizle();
  const yol = location.hash.replace(/^#/, '') || '/';
  const p = yol.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (p.length === 0) await kosularEkrani();
    else if (p[0] === 'egilim') await egilimEkrani();
    else if (p[0] === 'ara-sira') await araSiraEkrani();
    else if (p[0] === 'kosu' && p.length === 2) await kosuEkrani(p[1]);
    else if (p[0] === 'kosu' && p[2] === 'adim' && p.length === 4) await adimEkrani(p[1], p[3]);
    else if (p[0] === 'kosu' && p[2] === 'yorum') await yorumEkrani(p[1]);
    else icerik.replaceChildren(bos('Sayfa yok.'));
  } catch (e) {
    icerik.replaceChildren(hataGoster(e));
  }
}

let sonKosu = null;
window.addEventListener('hashchange', () => {
  const kosu = /^#\/kosu\/([^/]+)/.exec(location.hash)?.[1] ?? null;
  if (kosu !== sonKosu) Object.assign(suzgecDurumu, { sonuc: '', rol: '', senaryo: '', gun: '', sayfa: 0 });
  sonKosu = kosu;
  void goster();
});
sonKosu = /^#\/kosu\/([^/]+)/.exec(location.hash)?.[1] ?? null;
void goster();

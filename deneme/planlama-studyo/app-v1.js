'use strict';
/* Planlama modülü (deneme). Bütün veri uydurmadır. Motor aynı sayfada, ayrı iş parçacığında koşar; dış servis yok. */
const ANAHTAR = 'tmi-planlama-modulu-v1';
const KULLANICILAR = [
  { id: 'u1', ad: 'Planlamacı A', rol: 'planlamaci' },
  { id: 'u2', ad: 'Planlamacı B', rol: 'planlamaci' },
  { id: 'u3', ad: 'Üretim müdürü', rol: 'mudur' },
  { id: 'u4', ad: 'Operatör (T1)', rol: 'operator', tezgah: 'T1' },
  { id: 'u5', ad: 'Yönetici', rol: 'yonetici' },
];
const ROL_AD = { planlamaci: 'Planlamacı', mudur: 'Üretim müdürü', operator: 'Operatör', yonetici: 'Yönetici' };
const YETKI = {
  planlamaci: ['veri.yaz', 'plan.yaz', 'plan.kilitle'],
  mudur: ['plan.kilitle', 'plan.canliya-al'],
  operator: [],
  yonetici: ['veri.yaz', 'plan.yaz', 'plan.kilitle', 'plan.canliya-al'],
};
const ONCELIK = { 1: 'Yüksek', 2: 'Normal', 3: 'Düşük' };
const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const NEDEN = {
  simdi: 'Plan başlangıcında hazırdı; ilk boş anda başladı.',
  serbest: 'Siparişin serbest bırakılma anını bekledi.',
  malzeme: 'Malzemenin gelişini bekledi (malzeme kuralı: sert).',
  program: 'NC programının hazırlanmasını bekledi.',
  kilit: 'Kilitli saatine bağlı.',
  ariza: 'Tezgâhın arıza ya da bakımının bitmesini bekledi.',
  ayarci: 'Boş ayarcı bekledi.',
  personel: 'Boş operatör bekledi.',
  yetkin: 'Bu tezgâh grubunda yetkin boş operatör bekledi.',
  aparat: 'Aparatın boşalmasını bekledi.',
  'fason-kap': 'Fasoncunun kapasitesi doluydu; sonraki çıkışa kaldı.',
  'fason-cikis': 'Fasoncunun çıkış gününü bekledi.',
};

const kok = document.getElementById('kok');
const katman = document.getElementById('katman');
const bildirimler = document.getElementById('bildirimler');

/* ---------- yardımcılar ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (ad, b = 'o') => `<svg class="tc-simge tc-simge-${b}" viewBox="0 0 24 24" aria-hidden="true" ${DOLGU.has(ad) ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}><path d="${IC[ad] || IC.help}"/></svg>`;
const sayi = (x, k = 1) => x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 });
const saat = x => x == null || !isFinite(x) ? '—' : sayi(x, 1) + ' sa';
const yuzde = x => x == null || !isFinite(x) ? '—' : '%' + sayi(x * 100, 0);
const zamanYaz = ms => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const rozet = (metin, ton) => `<span class="tc-rozet${ton ? ' tc-rozet-' + ton : ''}"><i></i>${esc(metin)}</span>`;
const td = (b, v, cls = '') => `<td data-baslik="${esc(b)}"${cls ? ` class="${cls}"` : ''}>${v}</td>`;
const kart = (baslik, govde, sag = '', ek = '') => `<section class="tc-kart"><div class="tc-kart-ust tc-kart-ust-zengin"><div class="tc-kart-bas"><h2 class="tc-kart-baslik">${baslik}</h2>${ek ? `<div class="tc-kart-ek">${ek}</div>` : ''}</div><div class="tc-kart-sag">${sag}</div></div>${govde}</section>`;
const dar = () => window.innerWidth < 768;
const kip = () => dar() ? ' data-kip="kart"' : '';
const dugme = (metin, act, o = {}) => {
  const izin = !o.yetki || yetkili(o.yetki);
  const cls = 'tc-dugme' + (o.birincil ? ' tc-dugme-birincil' : '') + (o.tehlike ? ' tc-dugme-tehlike' : '') + (o.kucuk ? ' tc-dugme-kucuk' : '') + (o.hayalet ? ' tc-dugme-hayalet' : '') + (o.simge && !metin ? ' tc-dugme-simge' : '') + (o.cls ? ' ' + o.cls : '');
  const t = !izin ? `Yetkiniz yok (${o.yetki})` : (o.ipucu || (!metin ? o.ad || '' : ''));
  return `<button type="button" class="${cls}" ${izin ? `data-act="${act}"` : 'aria-disabled="true"'} ${o.veri || ''} ${t ? `title="${esc(t)}"` : ''} ${!metin && (o.ad || t) ? `aria-label="${esc(o.ad || t)}"` : ''}>${o.simge ? ic(o.simge, 'k') : ''}${metin ? esc(metin) : ''}</button>`;
};
const durumRenk = jid => { const i = S.D.siparisler.findIndex(s => s.id === jid); return `var(--is-${((i % 10) + 10) % 10})`; };
const tStr = t => (t == null || !isFinite(t)) ? '' : isoT(S.D, t);
const girdiDT = s => s ? String(s).replace(' ', 'T') : '';
const DTgirdi = v => v ? String(v).replace('T', ' ') : null;
const gunIndeks = s => Math.floor(parseT(S.D, s) / 24);
const gunTarih = d => isoT(S.D, d * 24).slice(0, 10);

/* ---------- durum ---------- */
let S = null;
const U = { sayfa: 'pano', zoom: 10, grup: '', yalnizGec: false, secili: null, urun: null, pencere: null, onay: null, menu: false, tum: false, karsilastir: [], izKim: '', sipFiltre: 'hepsi', kuyrukM: null, ilerleme: null, dar: dar() };
const geriAl = [];
let cxOnbellek = { v: -1, cx: null };
let calisan = null;

function yeniCalisma(setId) {
  const v = VERI[setId];
  return {
    surum: 1, setId, D: clone(v.veri), down: clone(v.ariza || []), ekMesai: [], locks: {}, pref: {},
    w: { dondurma: 4, famK: 0.3, mat: 'uyari', sure: 10 },
    plan: null, dataVer: 1, senaryolar: [], canli: null, canliSurum: 0, tabanSurum: 0, iz: [], kullanici: (S && S.kullanici) || 'u1',
  };
}
function yukle() {
  try { const x = JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); if (x && x.surum === 1 && x.D) return x; } catch (e) { /* tarayıcı belleği kapalı olabilir */ }
  return null;
}
function kaydet() {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) {
    if (S.senaryolar.length > 2) { S.senaryolar.shift(); try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e2) { /* yer yok */ } }
  }
  try { localStorage.setItem(ANAHTAR + '-ui', JSON.stringify({ sayfa: U.sayfa, zoom: U.zoom })); } catch (e) { /* yok */ }
}
const kim = () => KULLANICILAR.find(k => k.id === S.kullanici) || KULLANICILAR[0];
const yetkili = y => (YETKI[kim().rol] || []).includes(y);
function iz(ne, ayrinti) { const k = kim(); S.iz.unshift({ t: Date.now(), kim: k.ad, rol: ROL_AD[k.rol], sayfa: SAYFA_AD[U.sayfa] || U.sayfa, ne, ayrinti: ayrinti || '' }); if (S.iz.length > 400) S.iz.length = 400; }

function stOf(Dx) {
  const D = Dx || S.D;
  return {
    D, now: 7, down: (Dx ? [] : S.down).map((d, i) => ({ ...d, id: 'd' + i })), ekMesai: Dx ? [] : S.ekMesai, eksik: [],
    locks: Dx ? {} : S.locks, pref: Dx ? {} : S.pref, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {},
    w: { ...clone(W0), famK: +S.w.famK, mat: S.w.mat, dondurma: +S.w.dondurma },
  };
}
function cxAl() {
  if (cxOnbellek.v !== S.dataVer) { try { cxOnbellek = { v: S.dataVer, cx: compile(stOf()) }; } catch (e) { cxOnbellek = { v: S.dataVer, cx: null, hata: String(e.message || e) }; } }
  return cxOnbellek.cx;
}
const planGuncel = () => S.plan && S.plan.dataVer === S.dataVer;

/* Ana veriye her yazış buradan geçer: yetki, geri alma, değişiklik izi, plan bayatlığı. */
function degistir(ne, ayrinti, fn, yetki = 'veri.yaz') {
  if (!yetkili(yetki)) { bildir(`Yetkiniz yok (${yetki}).`, 'hata'); return false; }
  geriAl.push(JSON.stringify({ D: S.D, down: S.down, ekMesai: S.ekMesai, locks: S.locks, pref: S.pref, w: S.w, dataVer: S.dataVer }));
  if (geriAl.length > 30) geriAl.shift();
  const sonuc = fn();
  if (sonuc === false) { geriAl.pop(); return false; }
  S.dataVer++; iz(ne, ayrinti); kaydet(); render();
  bildir(ne + (S.plan ? '. Plan yeniden çözülünce güncellenir.' : '.'), 'tamam', { metin: 'Geri al', act: 'geri-al' });
  return true;
}

/* ---------- bildirim ---------- */
function bildir(mesaj, tur = '', eylem) {
  const el = document.createElement('div');
  el.className = 'tc-bildirim' + (tur ? ' tc-bildirim-' + tur : '');
  el.setAttribute('role', tur === 'hata' ? 'alert' : 'status');
  el.innerHTML = `${ic(tur === 'hata' ? 'alert' : tur === 'tamam' ? 'check' : 'bell', 'k')}<span class="tc-bildirim-mesaj">${esc(mesaj)}</span>${eylem ? `<button type="button" class="tc-dugme tc-dugme-kucuk" data-act="${eylem.act}">${esc(eylem.metin)}</button>` : ''}<button type="button" class="tc-bildirim-kapat" data-act="bildirim-kapat" aria-label="Kapat">${ic('x', 'k')}</button>`;
  bildirimler.appendChild(el);
  while (bildirimler.children.length > 2) bildirimler.firstChild.remove();
  setTimeout(() => el.remove(), eylem ? 8000 : 4500);
}

/* ---------- sayfalar ---------- */
const SAYFALAR = [
  { grup: 'Plan', liste: [['pano', 'Pano', 'dash'], ['cizelge', 'Çizelge', 'gantt'], ['siparisler', 'Siparişler', 'list'], ['kuyruk', 'Tezgâh kuyruğu', 'play']] },
  { grup: 'Ana veri', liste: [['tezgahlar', 'Tezgâhlar', 'cpu'], ['rotalar', 'Ürün ve rota', 'layers'], ['takvim', 'Takvim', 'clock'], ['personel', 'Personel', 'user'], ['malzeme', 'Malzeme', 'box'], ['fason', 'Fason ve aparat', 'truck'], ['ayar', 'Ayar matrisi', 'grid']] },
  { grup: 'Çözüm', liste: [['denetim', 'Veri denetimi', 'scan'], ['senaryolar', 'Senaryolar', 'flag'], ['cozucu', 'Çözücü', 'gear'], ['iz', 'Değişiklik izi', 'book']] },
];
const SAYFA_AD = Object.fromEntries(SAYFALAR.flatMap(g => g.liste.map(([id, ad]) => [id, ad])));
function sayfaListesi() {
  if (kim().rol === 'operator') return [{ grup: 'Plan', liste: [['kuyruk', 'Tezgâh kuyruğu', 'play'], ['cizelge', 'Çizelge', 'gantt']] }];
  return SAYFALAR;
}

/* ---------- kabuk ---------- */
function render() {
  const icerik = document.getElementById('icerik');
  const kaydir = icerik ? icerik.scrollTop : 0;
  const g = document.querySelector('.pm-gantt');
  const gk = g ? [g.scrollLeft, g.scrollTop] : null;
  const gruplar = sayfaListesi();
  if (!gruplar.some(gr => gr.liste.some(([id]) => id === U.sayfa))) U.sayfa = gruplar[0].liste[0][0];
  const u = kim();
  kok.innerHTML = `<div class="tc-kabuk-cati"><div class="tc-kabuk" data-ikinci>
    <nav class="tc-kabuk-menu" aria-label="Ana menü">${anaMenu()}</nav>
    <header class="tc-kabuk-ust">${ustCubuk(u)}</header>
    <div class="tc-ikinci-kap"><nav class="tc-ikinci" aria-label="Planlama sayfaları">${ikinciMenu(gruplar)}</nav></div>
    <main class="tc-kabuk-icerik" id="icerik">${sayfaHtml()}</main>
    <nav class="tc-kabuk-alt" aria-label="Alt menü">${altCubuk(gruplar)}</nav>
  </div></div>${U.tum ? tumSayfalar(gruplar) : ''}${U.ilerleme ? ilerlemeHtml() : ''}`;
  const yeni = document.getElementById('icerik'); if (yeni) yeni.scrollTop = kaydir;
  const g2 = document.querySelector('.pm-gantt');
  if (g2 && gk && U.gKoru) { g2.scrollLeft = gk[0]; g2.scrollTop = gk[1]; }
  U.gKoru = true;
  katmanCiz();
}
function anaMenu() {
  const bag = (ad, simge, acik, kapali) => `<a class="tc-kabuk-bag${acik ? ' tc-kabuk-bag-acik' : ''}" ${kapali ? 'aria-disabled="true" title="Bu denemede kapalı"' : 'aria-current="page"'} href="#" data-act="${kapali ? 'yok' : 'git'}" data-v="pano">${ic(simge, 'k')}<span class="tc-kabuk-bag-metin">${ad}</span></a>`;
  return `<div class="tc-kabuk-marka"><span class="tc-kabuk-marka-isaret">TMI</span><span class="tc-kabuk-marka-metin">CORE</span></div>
  <div class="tc-kabuk-surum">V2 · deneme</div>
  <div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Üretim</div>${bag('Üretim emirleri', 'list', 0, 1)}${bag('İstasyonlar', 'cpu', 0, 1)}${bag('Reçete ve Rota', 'layers', 0, 1)}</div>
  <div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Planlama</div>${bag('Planlama motoru', 'gantt', 1, 0)}</div>
  <p class="pm-deneme">Deneme sayfası. Uygulamaya bağlı değil; bütün veri uydurmadır.</p>`;
}
function ustCubuk(u) {
  const guncel = planGuncel();
  const durum = !S.plan ? rozet('Plan yok', 'pasif') : guncel ? rozet('Plan güncel', 'tamam') : rozet('Veri değişti', 'uyari');
  const coz = yetkili('plan.yaz')
    ? `<span class="pm-coz"><button type="button" class="tc-dugme tc-dugme-birincil${S.plan && !guncel ? ' pm-nabiz' : ''}" data-act="coz" ${calisan ? 'disabled' : ''}>${ic('play', 'k')}<span>${calisan ? 'Çözülüyor' : 'Çöz'}</span></button><select aria-label="Çözüm süresi" data-chg="sure">${[5, 10, 20, 40].map(s => `<option value="${s}"${+S.w.sure === s ? ' selected' : ''}>${s} sn</option>`).join('')}</select></span>` : '';
  return `<h1 class="tc-kabuk-baslik">${esc(SAYFA_AD[U.sayfa] || 'Planlama')}</h1>
  <div class="pm-ust-sag"><span class="pm-durum">${durum}</span>${coz}
  <button type="button" class="tc-kabuk-tema" data-act="tema" aria-label="Tema değiştir" title="Tema">${ic(temaKoyu() ? 'sun' : 'moon', 'k')}</button>
  <div class="tc-kabuk-hesap pm-hesap"><button type="button" class="tc-menu-dugme" data-act="menu" aria-expanded="${U.menu}" title="${esc(u.ad)} · ${esc(ROL_AD[u.rol])}"><span class="tc-kabuk-kisi-avatar">${esc(u.ad.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ]/g, '').split(' ').filter(Boolean).map(x => x[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR'))}</span><span class="tc-kabuk-kisi-ad">${esc(u.ad)}</span></button>
  ${U.menu ? `<div class="pm-acilir" role="menu"><div class="pm-acilir-baslik">Kullanıcı değiştir (deneme)</div>${KULLANICILAR.map(k => `<button type="button" role="menuitem" data-act="kullanici" data-v="${k.id}" aria-current="${k.id === u.id}">${ic('user', 'k')}<span>${esc(k.ad)}<small>${esc(ROL_AD[k.rol])} · ${(YETKI[k.rol] || []).length ? esc(YETKI[k.rol].join(', ')) : 'yalnız okur'}</small></span></button>`).join('')}</div>` : ''}</div></div>`;
}
function ikinciMenu(gruplar) {
  const sayac = id => {
    if (id === 'siparisler') return S.D.siparisler.length;
    if (id === 'denetim') { const n = denetimBulgulari().length; return n || null; }
    if (id === 'senaryolar') return S.senaryolar.length || null;
    return null;
  };
  return gruplar.map(gr => `<div class="tc-ikinci-grup" role="group" aria-label="${esc(gr.grup)}">${gr.liste.map(([id, ad, simge]) => {
    const n = sayac(id);
    return `<a href="#${id}" class="tc-ikinci-madde${U.sayfa === id ? ' tc-ikinci-madde-etkin' : ''}" data-act="git" data-v="${id}" ${U.sayfa === id ? 'aria-current="page"' : ''}>${ic(simge, 'k')}<span class="tc-ikinci-madde-ad">${ad}</span>${n != null ? `<span class="tc-ikinci-sayi">${n}</span>` : ''}</a>`;
  }).join('')}</div>`).join('');
}
function altCubuk(gruplar) {
  const tum = gruplar.flatMap(g => g.liste);
  const ilk = tum.slice(0, 4);
  return ilk.map(([id, ad, simge]) => `<a href="#${id}" class="tc-kabuk-bag${U.sayfa === id ? ' tc-kabuk-bag-acik' : ''}" data-act="git" data-v="${id}">${ic(simge, 'k')}<span>${ad}</span></a>`).join('')
    + (tum.length > 4 ? `<button type="button" class="tc-kabuk-bag" data-act="tum">${ic('more', 'k')}<span>Tümü</span></button>` : '');
}
function tumSayfalar(gruplar) {
  return `<div class="pm-tum" role="dialog" aria-label="Bütün sayfalar"><div class="pm-sira"><strong class="pm-sira-ara">Planlama sayfaları</strong>${dugme('', 'tum-kapat', { simge: 'x', ad: 'Kapat' })}</div>
  ${gruplar.map(g => `<div class="pm-tum-grup"><div class="tc-kabuk-grup-ad">${g.grup}</div>${g.liste.map(([id, ad, simge]) => `<a href="#${id}" class="tc-kabuk-bag${U.sayfa === id ? ' tc-kabuk-bag-acik' : ''}" data-act="git" data-v="${id}">${ic(simge, 'k')}<span class="tc-kabuk-bag-metin">${ad}</span></a>`).join('')}</div>`).join('')}</div>`;
}
function temaKoyu() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return !window.matchMedia('(prefers-color-scheme: light)').matches;
}
function ilerlemeHtml() {
  const p = U.ilerleme; const o = Math.min(100, (p.sn / (+S.w.sure || 10)) * 100);
  return `<div class="pm-ilerleme" role="status"><div class="pm-sira"><strong class="pm-sira-ara">${ic('cpu', 'k')} Motor çözüyor</strong><span class="mono">${sayi(p.sn, 1)} / ${S.w.sure} sn</span>${dugme('Durdur', 'durdur', { kucuk: true })}</div>
  <div class="pm-ilerleme-yol"><div class="pm-ilerleme-dolu" style="--o:${o}%"></div></div>
  <div class="pm-alt">Ağırlıklı gecikme <b class="mono">${saat(p.wT)}</b> (ilk plan ${saat(p.ilk)}) · geciken ${p.late}/${p.n} · alt sınır ${saat(p.lb)}</div></div>`;
}

function sayfaHtml() {
  try {
    const f = { pano: sPano, cizelge: sCizelge, siparisler: sSiparisler, kuyruk: sKuyruk, tezgahlar: sTezgahlar, rotalar: sRotalar, takvim: sTakvim, personel: sPersonel, malzeme: sMalzeme, fason: sFason, ayar: sAyar, denetim: sDenetim, senaryolar: sSenaryolar, cozucu: sCozucu, iz: sIz }[U.sayfa];
    return `<div class="pm-sayfa">${seritler()}${f()}</div>`;
  } catch (e) {
    console.error(e);
    return `<div class="pm-serit" data-ton="hata">${ic('alert', 'k')}<span class="pm-serit-metin">Sayfa çizilemedi: ${esc(e.message)}</span></div>`;
  }
}
function seritler() {
  const out = [];
  const canli = S.senaryolar.find(s => s.id === S.canli);
  if (canli && ['pano', 'cizelge', 'senaryolar', 'kuyruk'].includes(U.sayfa)) out.push(`<div class="pm-serit" data-ton="tamam">${ic('flag', 'k')}<span class="pm-serit-metin">Canlı plan: <b>${esc(canli.ad)}</b> · sürüm ${S.canliSurum} · ${esc(canli.canliKim || canli.yazar)} aldı, ${zamanYaz(canli.canliZaman || canli.zaman)}</span>${U.sayfa !== 'senaryolar' ? dugme('Senaryolar', 'git', { kucuk: true, veri: 'data-v="senaryolar"' }) : ''}</div>`);
  if (S.plan && !planGuncel() && ['pano', 'cizelge', 'kuyruk', 'siparisler'].includes(U.sayfa)) out.push(`<div class="pm-serit" data-ton="uyari">${ic('alert', 'k')}<span class="pm-serit-metin">Plan çözüldükten sonra veri ya da kilit değişti. Gösterilen plan eski veriyle hesaplandı.</span>${dugme('Yeniden çöz', 'coz', { kucuk: true, birincil: true, yetki: 'plan.yaz' })}</div>`);
  if (kim().rol === 'mudur' && U.sayfa !== 'senaryolar' && ['pano'].includes(U.sayfa)) out.push(`<div class="pm-serit">${ic('lock', 'k')}<span class="pm-serit-metin">Üretim müdürü planı okur, kilitler ve senaryoyu canlıya alır; ana veriyi değiştirmez.</span></div>`);
  return out.join('');
}

/* ---------- Pano ---------- */
function sPano() {
  const cx = cxAl();
  const D = S.D;
  if (!S.plan) {
    return `<div class="pm-bos">${ic('gantt', 'b')}<strong>Henüz plan yok</strong><span>${esc(D.meta.ad)}: ${D.tezgahlar.length} tezgâh, ${D.siparisler.length} sipariş, ${cx ? cx.ops.length : '—'} işlem, ${D.personel.length} personel. Veriyi denetleyip çözün.</span><div class="pm-dugmeler">${dugme('Çöz', 'coz', { birincil: true, simge: 'play', yetki: 'plan.yaz' })}${dugme('Veri denetimi', 'git', { simge: 'scan', veri: 'data-v="denetim"' })}</div></div>${veriOzeti(cx)}`;
  }
  const p = S.plan, o = p.ozet;
  const lb = p.lb;
  const kartlar = [
    sayiKart('Ağırlıklı gecikme', saat(o.wT), o.wT > 0.5 ? 'hata' : '', 'clock', `ilk plan ${saat(p.ilk)} · öncelik ağırlıklı`),
    sayiKart('Geciken sipariş', `${o.late} / ${o.n}`, o.late ? 'uyari' : '', 'flag', `zamanında ${yuzde(o.n ? o.onT / o.n : null)}`),
    sayiKart('Alt sınır', saat(lb), '', 'target', 'kritik yoldan; bundan iyisi olamaz'),
    sayiKart('Toplam ayar', saat(o.suH), '', 'wrench', `${o.suN} ayar · ${o.famN} aynı aile`),
    sayiKart('Son bitiş', esc(fmtDT(D, o.Cmax)), '', 'check', `${saat(o.Cmax - 7)} sonra`),
    o.chg != null ? sayiKart('Canlıya göre değişen', `${o.chg} işlem`, o.chg > 20 ? 'uyari' : '', 'rotate', 'tezgâhı, sırası ya da 8 saatten çok yeri değişen') : sayiKart('Çözüm', `${sayi(p.sn, 1)} sn`, '', 'cpu', `${esc(p.kim)} · ${zamanYaz(p.zaman)}`),
  ].join('');
  const util = Object.entries(p.util || {}).filter(([m, v]) => v.n > 0 || v.open > 0).sort((a, b) => b[1].u - a[1].u);
  const cubuklar = util.map(([m, v]) => `<div class="pm-cubuk" data-ton="${v.u > 0.85 ? 'uyari' : v.u < 0.15 ? 'bos' : ''}"><span class="mono" title="${esc((cx && cx.M[m] && cx.M[m].ad) || m)}">${esc(m)}</span><div class="pm-cubuk-yol" role="img" aria-label="${esc(m)} doluluk ${yuzde(v.u)}"><div class="pm-cubuk-dolu" style="--o:${Math.round(v.u * 100)}%"></div></div><span class="mono">${yuzde(v.u)}</span></div>`).join('');
  const gec = Object.entries(p.J).filter(([j, x]) => x.T == null || x.T > 0.01).map(([j, x]) => { const s = D.siparisler.find(z => z.id === j) || {}; return { j, x, s, w: (x.T || 9999) * (PW[s.oncelik] || 1) }; }).sort((a, b) => b.w - a.w).slice(0, 10);
  const gecTablo = gec.length ? `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Sipariş</th><th>Ürün</th><th>Öncelik</th><th>Termin</th><th>Bitiş</th><th class="pm-num">Gecikme</th></tr></thead><tbody>${gec.map(({ j, x, s }) => `<tr class="tc-tablo-secilir" data-act="siparis-cizelge" data-v="${esc(j)}">${td('Sipariş', `<b class="mono">${esc(j)}</b>`)}${td('Ürün', esc(urunAd(s.urun)))}${td('Öncelik', oncelikRozet(s.oncelik))}${td('Termin', esc(s.termin || '—'), 'tc-tablo-kirilmaz')}${td('Bitiş', esc(x.C == null ? '—' : fmtDT(D, x.C)), 'tc-tablo-kirilmaz')}${td('Gecikme', x.T == null ? rozet('Planlanmadı', 'hata') : saat(x.T), 'pm-num')}</tr>`).join('')}</tbody></table></div>` : `<div class="pm-serit" data-ton="tamam">${ic('check', 'k')}<span class="pm-serit-metin">Bütün siparişler termininde.</span></div>`;
  const uyar = uyarilar(p);
  return `<div class="pm-sayilar">${kartlar}</div>
  <div class="pm-iki">${kart('Geciken siparişler', gecTablo, dugme('Hepsi', 'git', { kucuk: true, veri: 'data-v="siparisler"' }))}
  ${kart('Uyarılar', uyar || `<p class="pm-alt">Uyarı yok.</p>`)}</div>
  <div class="pm-iki">${kart('Tezgâh doluluğu', `<div class="pm-cubuklar">${cubuklar}</div><p class="pm-kucuk">Plan başlangıcından son bitişe kadar açık saatlere göre çalışma oranı. %85 üstü darboğaz adayıdır.</p>`)}${veriOzeti(cx)}</div>`;
}
function sayiKart(baslik, deger, ton, simge, alt) {
  return `<div class="tc-sayi-karti"${ton ? ` data-ton="${ton}"` : ''}><span class="tc-sayi-simge">${ic(simge)}</span><span class="tc-sayi-govde"><span class="tc-sayi-baslik">${baslik}</span><span class="tc-sayi-deger mono">${deger}</span>${alt ? `<span class="tc-sayi-alt">${alt}</span>` : ''}</span></div>`;
}
function uyarilar(p) {
  const w = p.warn || [];
  if (!w.length && !(p.fail || []).length) return '';
  const tip = { malzeme: ['box', 'uyari', 'Malzeme'], program: ['tool', 'bilgi', 'NC programı'], plan: ['alert', 'hata', 'Planlanamadı'] };
  const grup = {};
  for (const x of w) (grup[x.t] = grup[x.t] || []).push(x);
  return `<ul class="pm-olaylar">${Object.entries(grup).map(([t, l]) => { const [s, ton, ad] = tip[t] || ['alert', 'uyari', t]; return l.slice(0, 6).map(x => `<li class="pm-olay" data-ton="${ton}">${ic(s, 'k')}<span class="pm-olay-metin"><b>${ad}.</b> ${esc(x.txt)}</span></li>`).join('') + (l.length > 6 ? `<li class="pm-kucuk">${ad}: ${l.length - 6} uyarı daha</li>` : ''); }).join('')}</ul>`;
}
function veriOzeti(cx) {
  const D = S.D; const n = denetimBulgulari().length;
  return kart('Veri', `<dl class="pm-dl"><dt>Veri seti</dt><dd>${esc(D.meta.ad)}</dd><dt>Başlangıç</dt><dd>${esc(D.meta.baslangic)} 07:00</dd><dt>Tezgâh</dt><dd>${D.tezgahlar.length} · ${new Set(D.tezgahlar.map(t => t.grup)).size} grup</dd><dt>Sipariş · işlem</dt><dd>${D.siparisler.length} · ${cx ? cx.ops.length : '—'}</dd><dt>Personel</dt><dd>${D.personel.length} · ${D.personel.filter(p => p.ayar).length} ayarcı</dd><dt>Arıza, bakım</dt><dd>${S.down.length}</dd><dt>Denetim</dt><dd>${n ? rozet(n + ' bulgu', 'uyari') : rozet('Temiz', 'tamam')}</dd></dl>`, dugme('Denetle', 'git', { kucuk: true, simge: 'scan', veri: 'data-v="denetim"' }));
}
const urunAd = id => { const u = S.D.urunler.find(x => x.id === id); return u ? u.ad : (id || '—'); };
const oncelikRozet = o => rozet(ONCELIK[o] || '—', o === 1 ? 'hata' : o === 3 ? 'pasif' : '');

/* ---------- Çizelge ---------- */
function sCizelge() {
  if (!S.plan) return `<div class="pm-bos">${ic('gantt', 'b')}<strong>Çizelge için plan gerekir</strong>${dugme('Çöz', 'coz', { birincil: true, simge: 'play', yetki: 'plan.yaz' })}</div>`;
  const cx = cxAl(); const D = S.D; const p = S.plan;
  const px = U.zoom;
  const ops = Object.values(p.ops);
  const Cmax = Math.max(p.ozet.Cmax || 24, ...ops.map(r => r.C).filter(isFinite));
  const gunN = Math.min(HDAYS, Math.ceil(Cmax / 24) + 1);
  const W = gunN * 24 * px;
  const gruplar = {};
  for (const m of D.tezgahlar) (gruplar[m.grup] = gruplar[m.grup] || []).push(m);
  const fasonlar = (D.fasoncular || []).filter(f => ops.some(r => r.m === '@' + f.id));
  const secGrup = U.grup;
  const gecJ = new Set(Object.entries(p.J).filter(([, x]) => x.T == null || x.T > 0.01).map(([j]) => j));
  const secOp = U.secili && p.ops[U.secili];
  const secJob = secOp ? secOp.job : null;
  const byM = {};
  for (const r of ops) (byM[r.m] = byM[r.m] || []).push(r);
  const bar = r => {
    if (!isFinite(r.C)) return '';
    if (U.yalnizGec && !gecJ.has(r.job)) return '';
    const L = r.S * px, Wd = Math.max(3, (r.C - r.S) * px);
    const a = r.C > r.S ? Math.max(0, Math.min(100, ((r.Su - r.S) / (r.C - r.S)) * 100)) : 0;
    const kilit = S.locks[r.id], tercih = S.pref[r.id];
    const etiket = Wd > 56 ? `<span>${esc(r.job)}·${esc(r.id.slice(r.id.lastIndexOf('.') + 1))}</span>` : '';
    return `<button type="button" class="pm-is" data-act="op" data-v="${esc(r.id)}" data-job="${esc(r.job)}" style="left:${L}px;width:${Wd}px;--c:${durumRenk(r.job)};--a:${a}%" ${gecJ.has(r.job) ? 'data-gec' : ''} ${secJob && r.job !== secJob ? 'data-soluk' : ''} ${U.secili === r.id ? 'data-secili' : ''} title="${esc(r.id)} · ${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C))}${gecJ.has(r.job) ? ' · gecikiyor' : ''}"><i class="pm-is-ayar" aria-hidden="true"></i>${kilit ? ic('lock', 'k') : tercih ? ic('target', 'k') : ''}${etiket}</button>`;
  };
  const kapali = m => {
    const M = cx && cx.M[m]; if (!M) return '';
    let out = '', t = 0; const son = gunN * 24;
    for (const [a, b] of M.rw) { if (a > son) break; if (a > t) out += `<i class="pm-g-kapali" style="left:${t * px}px;width:${(Math.min(a, son) - t) * px}px"></i>`; t = Math.max(t, b); }
    if (t < son) out += `<i class="pm-g-kapali" style="left:${t * px}px;width:${(son - t) * px}px"></i>`;
    for (const d of S.down.filter(x => x.m === m)) out += `<i class="pm-g-ariza" style="left:${d.from * px}px;width:${(d.to - d.from) * px}px" title="Arıza/bakım ${esc(fmtDT(D, d.from))} → ${esc(fmtDT(D, d.to))}"></i>`;
    return out;
  };
  const termin = secJob ? (() => { const s = D.siparisler.find(z => z.id === secJob); const t = s && parseT(D, s.termin); return t != null ? `<i class="pm-g-termin" style="left:${t * px}px" title="Termin ${esc(s.termin)}"></i>` : ''; })() : '';
  const gunCizgi = Array.from({ length: gunN }, (_, d) => `<i class="pm-g-gunc" style="left:${d * 24 * px}px"></i>`).join('');
  const satir = (id, ad, alt) => {
    const u = p.util && p.util[id];
    return `<div class="pm-g-satir"><div class="pm-g-etiket"><b>${esc(id)}</b><span title="${esc(ad)}">${esc(ad)}${u && !dar() ? ` · ${yuzde(u.u)}` : ''}</span></div><div class="pm-g-serit" style="width:${W}px">${alt}${gunCizgi}<i class="pm-g-simdi" style="left:${7 * px}px"></i>${termin}${(byM[id] || []).map(bar).join('')}</div></div>`;
  };
  let govde = '';
  for (const g of Object.keys(gruplar)) {
    if (secGrup && secGrup !== g) continue;
    govde += `<div class="pm-g-grup">${esc(g)}</div>` + gruplar[g].map(m => satir(m.id, m.ad, kapali(m.id))).join('');
  }
  if (fasonlar.length && (!secGrup || secGrup === '@fason')) govde += `<div class="pm-g-grup">fason</div>` + fasonlar.map(f => satir('@' + f.id, f.ad, '')).join('');
  const gunler = Array.from({ length: gunN }, (_, d) => {
    const dy = cx && cx.days[d]; const t = gunTarih(d);
    const saatler = px >= 20 ? [6, 12, 18].map(h => `<span class="pm-g-saat" style="left:${h * px}px">${String(h).padStart(2, '0')}</span>`).join('') : '';
    return `<div class="pm-g-gun" style="left:${d * 24 * px}px;width:${24 * px}px" ${dy && dy.tatil ? 'data-tatil' : ''}>${px >= 4 ? esc(fmtDT(D, d * 24).slice(0, 9)) : esc(t.slice(8))}${dy && dy.tatil ? ' · tatil' : ''}${saatler}</div>`;
  }).join('');
  const grupSec = `<select class="tc-alan-kutu" style="width:auto" data-chg="grup" aria-label="Tezgâh grubu"><option value="">Bütün gruplar</option>${Object.keys(gruplar).map(g => `<option${secGrup === g ? ' selected' : ''}>${esc(g)}</option>`).join('')}${fasonlar.length ? `<option value="@fason"${secGrup === '@fason' ? ' selected' : ''}>fason</option>` : ''}</select>`;
  return `<div class="pm-sira"><div class="pm-seg" role="group" aria-label="Ölçek">${[[3, '4 hafta'], [10, 'Hafta'], [40, 'Gün']].map(([z, ad]) => `<button type="button" data-act="zoom" data-v="${z}" aria-pressed="${U.zoom === z}">${ad}</button>`).join('')}</div>${grupSec}
  <label class="tc-isaret"><input type="checkbox" data-chg="yalniz-gec" ${U.yalnizGec ? 'checked' : ''}> Yalnız gecikenler</label>
  <input class="tc-alan-kutu pm-sira-ara" type="search" placeholder="Sipariş ara (ör. SP-203)" data-inp="ara-is" aria-label="Sipariş ara" style="max-width:260px">
  ${dugme('', 'simdiye', { simge: 'target', ad: 'Bugüne git' })}</div>
  <div class="pm-gantt" tabindex="0" aria-label="Plan çizelgesi"><div class="pm-g-ic" style="width:calc(var(--pm-etiket) + ${W}px)"><div class="pm-g-ust"><div class="pm-g-kose">Tezgâh</div><div class="pm-g-zaman" style="width:${W}px">${gunler}</div></div>${govde}</div></div>
  <div class="pm-lejant"><span><i class="pm-l-ayar"></i>Ayar</span><span><i class="pm-l-gec"></i>Geciken sipariş</span><span><i class="pm-l-kapali"></i>Tezgâh kapalı</span><span><i class="pm-l-ariza"></i>Arıza, bakım</span><span>${ic('lock', 'k')}Kilitli</span><span>${ic('target', 'k')}Tezgâh tercihi</span><span>Bir işe tıklayın: aynı siparişin bütün adımları ve termini görünür.</span></div>`;
}

function opPaneli(id) {
  const p = S.plan; const r = p && p.ops[id]; const cx = cxAl();
  if (!r || !cx) return null;
  const o = cx.byId[id]; const D = S.D;
  const s = D.siparisler.find(z => z.id === r.job) || {};
  const j = p.J[r.job] || {};
  const why = r.why || {};
  let neden = NEDEN[why.t] || 'Bilinmiyor.';
  if (why.t === 'rota') neden = why.o === 2 ? `Son parti kuralı: önceki adım ${why.r} bitmeden son partiyi bitiremezdi.` : why.o === 1 ? `Önceki adım ${why.r} ilk partisini bitirince örtüşmeli başladı.` : `Önceki adım ${why.r} bitince başladı (taşıma payı dahil).`;
  if (why.t === 'tezgah') neden = `Tezgâhta önceki iş ${why.r} bitince başladı.`;
  const zincir = (cx.jobs[r.job] ? cx.jobs[r.job].ops : []).map(x => { const q = p.ops[x.id]; return `<li><button type="button" data-act="op" data-v="${esc(x.id)}" aria-current="${x.id === id}"><b class="mono">${esc(x.k)}</b><span>${esc(x.ad)}<br><small class="pm-kucuk">${q ? esc(q.m.replace('@', 'fason ')) + ' · ' + esc(fmtDT(D, q.S)) : 'planlanmadı'}</small></span><span class="mono">${q ? saat(q.C - q.S) : '—'}</span></button></li>`; }).join('');
  const alt = (o ? o.c : []).map(c => {
    const ad = c.fas ? (cx.FS[c.m.slice(1)] || {}).ad || c.m : `${c.m} · ${(cx.M[c.m] || {}).ad || ''}`;
    const sure = c.fas ? 'fason' : saat(c.su + c.run);
    const simdi = r.m === c.m; const tercih = S.pref[id] === c.m;
    return `<tr${simdi ? ' data-secili' : ''}>${td('Tezgâh', esc(ad))}${td('Süre', sure, 'pm-num')}${td('', simdi ? rozet('Planda', 'tamam') : tercih ? rozet('Tercih', 'uyari') : dugme('Burada yap', 'tercih', { kucuk: true, yetki: 'plan.yaz', veri: `data-v="${esc(id)}" data-m="${esc(c.m)}"` }))}</tr>`;
  }).join('');
  const kilit = S.locks[id];
  const govde = `<div class="pm-bolum"><dl class="pm-dl"><dt>Sipariş</dt><dd><b class="mono">${esc(r.job)}</b> · ${esc(urunAd(s.urun))} · ${s.adet} adet</dd><dt>Adım</dt><dd>${esc(o ? o.k + ' ' + o.ad : id)}</dd><dt>Tezgâh</dt><dd>${esc(r.fas ? 'Fason: ' + ((cx.FS[r.m.slice(1)] || {}).ad || r.m) : r.m + ' · ' + ((cx.M[r.m] || {}).ad || ''))}</dd><dt>Başla</dt><dd class="mono">${esc(fmtDT(D, r.S))}</dd>${r.su > 0 ? `<dt>Ayar biter</dt><dd class="mono">${esc(fmtDT(D, r.Su))} · ${saat(r.su)}${r.famHit ? ' · aynı aile' : ''}</dd>` : ''}<dt>Biter</dt><dd class="mono">${esc(fmtDT(D, r.C))}</dd><dt>Termin</dt><dd class="mono">${esc(s.termin || '—')} ${j.T > 0.01 ? rozet(saat(j.T) + ' gecikme', 'hata') : j.T != null ? rozet('Zamanında', 'tamam') : ''}</dd><dt>Bolluk</dt><dd>${r.sl == null ? '—' : r.sl <= 0.5 ? rozet('Kritik', 'hata') + ' kayarsa sipariş ya da sonraki iş gecikir' : saat(r.sl) + ' kayabilir'}</dd></dl></div>
  <div class="pm-bolum"><h3>Neden bu saatte</h3><div class="pm-neden">${ic('help', 'k')}<span>${esc(neden)}</span></div></div>
  ${alt ? `<div class="pm-bolum"><h3>Uygun tezgâhlar</h3><div class="tc-tablo-kap"><table class="tc-tablo"><tbody>${alt}</tbody></table></div><p class="pm-kucuk">"Burada yap" tercihi bir sonraki çözümde uygulanır; motor tercih edilen tezgâhla yeniden hesaplar.</p></div>` : ''}
  <div class="pm-bolum"><h3>Siparişin adımları</h3><ul class="pm-zincir">${zincir}</ul></div>`;
  const alt2 = `${kilit ? dugme('Kilidi aç', 'kilit-ac', { simge: 'lock', yetki: 'plan.kilitle', veri: `data-v="${esc(id)}"` }) : dugme('Tezgâh ve saati kilitle', 'kilitle', { simge: 'lock', yetki: 'plan.kilitle', veri: `data-v="${esc(id)}"` })}${S.pref[id] ? dugme('Tercihi kaldır', 'tercih-kaldir', { veri: `data-v="${esc(id)}"`, yetki: 'plan.yaz' }) : ''}${dugme('Kapat', 'pencere-kapat')}`;
  return { baslik: `${r.job} · adım ${o ? o.k : ''}`, govde, alt: alt2, yan: true };
}

/* ---------- Genel liste tanımları ---------- */
const GUN_AD2 = { pzt: 'Pzt', sal: 'Sal', car: 'Çar', per: 'Per', cum: 'Cum', cmt: 'Cmt', paz: 'Paz' };
const TANIM = {
  tezgah: {
    ad: 'Tezgâh', al: () => S.D.tezgahlar, kimlik: 'id',
    alanlar: () => [
      { k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1, ipucu: 'Ör. T6' },
      { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: 1 },
      { k: 'grup', ad: 'Grup', tur: 'metin', zorunlu: 1, liste: [...new Set(S.D.tezgahlar.map(t => t.grup))], ipucu: 'Personel yetkinliği bu gruba göre aranır' },
      { k: 'vardiyalar', ad: 'Çalıştığı vardiyalar', tur: 'cok', secenek: () => S.D.vardiyalar.map(v => [v.id, `${v.id} ${v.bas}-${v.bit}`]), ipucu: 'Boş: fabrikanın bütün açık vardiyaları' },
      { k: 'verim', ad: 'Verim', tur: 'sayi', min: 0.1, max: 3, adim: 0.05, vars: 1, ipucu: '1: çevrim süresi aynen; 1,2: %20 hızlı' },
      { k: 'opOran', ad: 'Operatör oranı', tur: 'sayi', min: 0, max: 1, adim: 0.1, vars: 1, ipucu: '0,5: bir operatör iki tezgâha bakar' },
      { k: 'isiksiz', ad: 'Işıksız çalışır (vardiya dışında da işler)', tur: 'evet' },
      { k: 'ucret', ad: 'Saat ücreti (TL)', tur: 'sayi', min: 0 },
      { k: 'arizaGun', ad: 'Ortalama arıza aralığı (gün)', tur: 'sayi', min: 0 },
      { k: 'onarimSaat', ad: 'Ortalama onarım (sa)', tur: 'sayi', min: 0 },
    ],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['ad', 'Ad'], ['grup', 'Grup', x => rozet(x.grup, 'pasif')], ['v', 'Vardiya', x => (x.vardiyalar && x.vardiyalar.length ? x.vardiyalar.join(', ') : 'hepsi') + (x.isiksiz ? ' · ışıksız' : '')], ['verim', 'Verim', x => sayi(x.verim ?? 1, 2), 1], ['opOran', 'Operatör', x => sayi(x.opOran ?? 1, 2), 1], ['ucret', 'TL/sa', x => sayi(x.ucret, 0), 1]],
    silKontrol: x => { const u = S.D.urunler.filter(u => u.rota.some(o => (o.tezgahlar || []).some(t => t.id === x.id))); return u.length ? `${x.id} şu ürünlerin rotasında: ${u.map(z => z.id).join(', ')}. Önce rotadan çıkarın.` : null; },
  },
  personel: {
    ad: 'Personel', al: () => S.D.personel, kimlik: 'id',
    alanlar: () => [
      { k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1 },
      { k: 'ad', ad: 'Ad (uydurma)', tur: 'metin', zorunlu: 1 },
      { k: 'vardiya', ad: 'Vardiya', tur: 'secim', zorunlu: 1, secenek: () => S.D.vardiyalar.map(v => [v.id, `${v.id} ${v.bas}-${v.bit}`]) },
      { k: 'gruplar', ad: 'Yetkinlik (tezgâh grupları)', tur: 'cok', secenek: () => [...new Set(S.D.tezgahlar.map(t => t.grup))].map(g => [g, g]) },
      { k: 'ayar', ad: 'Ayar yapabilir (ayarcı)', tur: 'evet' },
    ],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['ad', 'Ad'], ['vardiya', 'Vardiya'], ['gruplar', 'Yetkinlik', x => `<span class="pm-cipler">${(x.gruplar || []).map(g => `<span class="pm-cip">${esc(g)}</span>`).join('')}</span>`], ['ayar', 'Ayarcı', x => x.ayar ? rozet('Ayarcı', 'tamam') : '—']],
    silKontrol: () => null,
  },
  vardiya: {
    ad: 'Vardiya', al: () => S.D.vardiyalar, kimlik: 'id',
    alanlar: () => [{ k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'bas', ad: 'Başlangıç', tur: 'saat', zorunlu: 1 }, { k: 'bit', ad: 'Bitiş', tur: 'saat', zorunlu: 1, ipucu: 'Gece vardiyası ertesi gün biter' }],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['bas', 'Başlangıç'], ['bit', 'Bitiş'], ['s', 'Süre', x => { let h = hm(x.bit) - hm(x.bas); if (h <= 0) h += 24; return saat(h); }, 1]],
    silKontrol: x => { const p = S.D.personel.filter(p => p.vardiya === x.id).length; return p ? `${p} personel bu vardiyada. Önce personeli taşıyın.` : null; },
  },
  malzeme: {
    ad: 'Malzeme', al: () => S.D.malzemeler, kimlik: 'kod',
    alanlar: () => [{ k: 'kod', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: 1 }, { k: 'birim', ad: 'Birim', tur: 'metin', zorunlu: 1, liste: ['kg', 'adet', 'm'] }, { k: 'stok', ad: 'Serbest stok', tur: 'sayi', min: 0, zorunlu: 1 }, { k: 'birimFiyat', ad: 'Birim fiyat (TL)', tur: 'sayi', min: 0 }, { k: 'muayeneGun', ad: 'Giriş muayenesi (gün)', tur: 'sayi', min: 0, adim: 0.5 }, { k: 'tedarikGun', ad: 'Tedarik süresi (gün)', tur: 'sayi', min: 0 }],
    sutunlar: [['kod', 'Kod', x => `<b class="mono">${esc(x.kod)}</b>`], ['ad', 'Ad'], ['stok', 'Stok', x => `${sayi(x.stok, 1)} ${esc(x.birim)}`, 1], ['birimFiyat', 'TL/birim', x => sayi(x.birimFiyat, 2), 1], ['tedarikGun', 'Tedarik', x => x.tedarikGun != null ? x.tedarikGun + ' gün' : '—', 1]],
    silKontrol: x => { const s = S.D.siparisler.filter(s => (s.malzeme || []).some(m => m.kod === x.kod)); return s.length ? `${s.length} sipariş bu malzemeyi kullanıyor.` : null; },
  },
  satinalma: {
    ad: 'Satın alma', al: () => S.D.satinalma, kimlik: null,
    alanlar: () => [{ k: 'kod', ad: 'Malzeme', tur: 'secim', zorunlu: 1, secenek: () => S.D.malzemeler.map(m => [m.kod, `${m.kod} · ${m.ad}`]) }, { k: 'miktar', ad: 'Miktar', tur: 'sayi', min: 0, zorunlu: 1 }, { k: 'gelis', ad: 'Söz verilen geliş', tur: 'tarihsaat', zorunlu: 1 }, { k: 'tedarikci', ad: 'Tedarikçi', tur: 'secim', secenek: () => (S.D.tedarikciler || []).map(t => [t.id, t.ad]) }],
    sutunlar: [['kod', 'Malzeme', x => `<b class="mono">${esc(x.kod)}</b>`], ['miktar', 'Miktar', x => sayi(x.miktar, 1), 1], ['gelis', 'Geliş'], ['tedarikci', 'Tedarikçi', x => esc(((S.D.tedarikciler || []).find(t => t.id === x.tedarikci) || {}).ad || x.tedarikci || '—')]],
    silKontrol: () => null,
  },
  tedarikci: {
    ad: 'Tedarikçi', al: () => (S.D.tedarikciler = S.D.tedarikciler || []), kimlik: 'id',
    alanlar: () => [{ k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'ad', ad: 'Ad (uydurma)', tur: 'metin', zorunlu: 1 }, { k: 'ortGecikmeGun', ad: 'Ortalama gecikme (gün)', tur: 'sayi', min: 0, adim: 0.5, vars: 0 }, { k: 'sapmaGun', ad: 'Gecikme sapması (gün)', tur: 'sayi', min: 0, adim: 0.5, vars: 0 }],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['ad', 'Ad'], ['ortGecikmeGun', 'Ort. gecikme', x => sayi(x.ortGecikmeGun, 1) + ' gün', 1]],
    silKontrol: x => S.D.satinalma.some(p => p.tedarikci === x.id) ? 'Bu tedarikçiye bağlı satın alma var.' : null,
  },
  fasoncu: {
    ad: 'Fasoncu', al: () => (S.D.fasoncular = S.D.fasoncular || []), kimlik: 'id',
    alanlar: () => [{ k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'ad', ad: 'Ad (uydurma)', tur: 'metin', zorunlu: 1 }, { k: 'kapasite', ad: 'Aynı anda iş', tur: 'sayi', min: 1, zorunlu: 1, vars: 1 }, { k: 'sureGun', ad: 'Süre (gün)', tur: 'sayi', min: 0.5, adim: 0.5, zorunlu: 1, vars: 1 }, { k: 'cikisGunleri', ad: 'Çıkış günleri', tur: 'cok', secenek: () => GUNLER.map(g => [g, GUN_AD2[g]]) }, { k: 'cikisSaat', ad: 'Çıkış saati', tur: 'sayi', min: 0, max: 23, vars: 16 }, { k: 'fiyat', ad: 'Adet fiyatı (TL)', tur: 'sayi', min: 0 }],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['ad', 'Ad'], ['kapasite', 'Kapasite', x => x.kapasite, 1], ['sureGun', 'Süre', x => sayi(x.sureGun, 1) + ' gün', 1], ['cikis', 'Çıkış', x => (x.cikisGunleri || []).map(g => GUN_AD2[g]).join(', ') + ' · ' + (x.cikisSaat ?? 16) + ':00']],
    silKontrol: x => { const u = S.D.urunler.filter(u => u.rota.some(o => o.fason === x.id)); return u.length ? `${u.map(z => z.id).join(', ')} rotasında kullanılıyor.` : null; },
  },
  aparat: {
    ad: 'Aparat', al: () => (S.D.aparatlar = S.D.aparatlar || []), kimlik: 'id',
    alanlar: () => [{ k: 'id', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: 1 }, { k: 'adet', ad: 'Adet', tur: 'sayi', min: 1, zorunlu: 1, vars: 1 }],
    sutunlar: [['id', 'Kod', x => `<b class="mono">${esc(x.id)}</b>`], ['ad', 'Ad'], ['adet', 'Adet', x => x.adet, 1]],
    silKontrol: x => { const u = S.D.urunler.filter(u => u.rota.some(o => o.aparat === x.id)); return u.length ? `${u.map(z => z.id).join(', ')} rotasında kullanılıyor.` : null; },
  },
  siparis: {
    ad: 'Sipariş', al: () => S.D.siparisler, kimlik: 'id',
    alanlar: () => [
      { k: 'id', ad: 'Sipariş no', tur: 'metin', zorunlu: 1, ipucu: 'Ör. SP-301' },
      { k: 'urun', ad: 'Ürün', tur: 'secim', zorunlu: 1, secenek: () => S.D.urunler.map(u => [u.id, `${u.id} · ${u.ad}`]) },
      { k: 'ad', ad: 'Açıklama (uydurma)', tur: 'metin' },
      { k: 'adet', ad: 'Adet', tur: 'sayi', min: 1, zorunlu: 1, tam: 1 },
      { k: 'termin', ad: 'Termin', tur: 'tarihsaat', zorunlu: 1 },
      { k: 'oncelik', ad: 'Öncelik', tur: 'secim', zorunlu: 1, secenek: () => [[1, 'Yüksek (ağırlık 4)'], [2, 'Normal (ağırlık 2)'], [3, 'Düşük (ağırlık 1)']], sayisal: 1, vars: 2 },
      { k: 'serbest', ad: 'Serbest bırakma', tur: 'tarihsaat', ipucu: 'Boş: hemen başlayabilir' },
      { k: 'gelir', ad: 'Gelir (TL)', tur: 'sayi', min: 0 },
      { k: 'malzeme', ad: 'Adet başına malzeme', tur: 'malzeme' },
    ],
    sutunlar: [],
    silKontrol: () => null,
  },
};

/* Genel tablo: sütunlar tanımdan, satır tıklanınca düzenleme çekmecesi açılır. */
function listeTablosu(tur, liste, ek = {}) {
  const T = TANIM[tur]; const yaz = yetkili('veri.yaz');
  const satirlar = liste.map((x, i) => {
    const anahtar = T.kimlik ? x[T.kimlik] : i;
    return `<tr class="tc-tablo-secilir" data-act="duzenle" data-tur="${tur}" data-v="${esc(anahtar)}">${T.sutunlar.map(([k, b, f, num]) => td(b, f ? f(x) : esc(x[k] ?? '—'), num ? 'pm-num' : '')).join('')}${td('', `<div class="pm-dugmeler">${yaz ? dugme('', 'sil', { simge: 'trash', hayalet: true, ad: 'Sil', veri: `data-tur="${tur}" data-v="${esc(anahtar)}"` }) : ''}</div>`)}</tr>`;
  }).join('');
  return `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr>${T.sutunlar.map(([, b, , num]) => `<th${num ? ' class="pm-num"' : ''}>${b}</th>`).join('')}<th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${satirlar || `<tr><td colspan="${T.sutunlar.length + 1}" class="tc-tablo-yok">Kayıt yok.</td></tr>`}</tbody></table></div>`;
}
function bul(tur, v) {
  const T = TANIM[tur]; const l = T.al();
  return T.kimlik ? l.find(x => String(x[T.kimlik]) === String(v)) : l[+v];
}
function formHtml(tur, x) {
  const T = TANIM[tur]; const yeni = !x;
  return `<form class="tc-form" data-form="${tur}" data-v="${esc(yeni ? '' : (T.kimlik ? x[T.kimlik] : T.al().indexOf(x)))}" novalidate>${T.alanlar().map(a => alanHtml(a, x ? x[a.k] : a.vars, yeni, T)).join('')}<p class="pm-form-hata tc-form-tam" data-hata hidden></p></form>`;
}
function alanHtml(a, v, yeni, T) {
  const id = 'f-' + a.k;
  const etiket = `<span class="tc-alan-etiket">${esc(a.ad)}${a.zorunlu ? ' <span class="tc-alan-zorunlu">*</span>' : ''}</span>`;
  const alt = a.ipucu ? `<span class="tc-alan-alt">${esc(a.ipucu)}</span>` : '';
  const kilitli = !yeni && T && a.k === T.kimlik;
  if (a.tur === 'evet') return `<label class="tc-isaret tc-form-tam"><input type="checkbox" name="${a.k}" ${v ? 'checked' : ''}> ${esc(a.ad)}</label>`;
  if (a.tur === 'cok') { const s = new Set(v || []); return `<fieldset class="tc-alan tc-form-tam" style="border:0;padding:0;margin:0"><legend class="tc-alan-etiket">${esc(a.ad)}</legend><div class="pm-secimler">${a.secenek().map(([k, ad]) => `<label><input type="checkbox" name="${a.k}" value="${esc(k)}" ${s.has(k) ? 'checked' : ''}> ${esc(ad)}</label>`).join('')}</div>${alt}</fieldset>`; }
  if (a.tur === 'secim') return `<label class="tc-alan">${etiket}<select class="tc-alan-kutu" name="${a.k}" id="${id}" ${a.sayisal ? 'data-sayisal' : ''}><option value="">Seçin</option>${a.secenek().map(([k, ad]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(ad)}</option>`).join('')}</select>${alt}</label>`;
  if (a.tur === 'malzeme') {
    const satir = (m = {}) => `<div class="pm-alt-satir pm-alt-satir-2" data-satir><select class="tc-alan-kutu" name="mkod" aria-label="Malzeme"><option value="">Malzeme</option>${S.D.malzemeler.map(z => `<option value="${esc(z.kod)}" ${m.kod === z.kod ? 'selected' : ''}>${esc(z.kod)} · ${esc(z.ad)}</option>`).join('')}</select><input class="tc-alan-kutu" type="number" step="0.01" min="0" name="mmiktar" value="${m.miktar ?? ''}" placeholder="Miktar" aria-label="Adet başına miktar"><button type="button" class="tc-dugme tc-dugme-simge tc-dugme-hayalet" data-act="satir-sil" aria-label="Satırı sil">${ic('x', 'k')}</button></div>`;
    return `<div class="tc-alan tc-form-tam"><span class="tc-alan-etiket">${esc(a.ad)}</span><div class="pm-satirlar" data-malzemeler>${(v || []).map(satir).join('')}</div><template data-sablon>${satir()}</template><button type="button" class="tc-dugme tc-dugme-kucuk pm-satir-ekle" data-act="satir-ekle">${ic('plus', 'k')}Malzeme ekle</button></div>`;
  }
  const tip = a.tur === 'sayi' ? 'number' : a.tur === 'tarihsaat' ? 'datetime-local' : a.tur === 'tarih' ? 'date' : a.tur === 'saat' ? 'time' : 'text';
  const deger = a.tur === 'tarihsaat' ? girdiDT(v) : (v ?? '');
  const dl = a.liste ? `<datalist id="dl-${a.k}">${a.liste.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
  return `<label class="tc-alan">${etiket}<input class="tc-alan-kutu" type="${tip}" name="${a.k}" id="${id}" value="${esc(deger)}" ${a.min != null ? `min="${a.min}"` : ''} ${a.max != null ? `max="${a.max}"` : ''} ${a.tur === 'sayi' ? `step="${a.adim || (a.tam ? 1 : 'any')}"` : ''} ${a.liste ? `list="dl-${a.k}"` : ''} ${kilitli ? 'readonly title="Kod değişmez; yeni kayıt açın"' : ''} ${a.ipucu && tip === 'text' ? `placeholder="${esc(a.ipucu)}"` : ''}>${alt}${dl}</label>`;
}
function formOku(form, tur) {
  const T = TANIM[tur]; const x = {}; const hata = [];
  for (const a of T.alanlar()) {
    if (a.tur === 'evet') { x[a.k] = form.querySelector(`[name="${a.k}"]`).checked; continue; }
    if (a.tur === 'cok') { x[a.k] = [...form.querySelectorAll(`[name="${a.k}"]:checked`)].map(i => i.value); continue; }
    if (a.tur === 'malzeme') {
      x[a.k] = [...form.querySelectorAll('[data-satir]')].map(r => ({ kod: r.querySelector('[name="mkod"]').value, miktar: parseFloat(r.querySelector('[name="mmiktar"]').value) })).filter(m => m.kod);
      for (const m of x[a.k]) if (!(m.miktar > 0)) hata.push(`${m.kod} için miktar girin.`);
      continue;
    }
    const el = form.querySelector(`[name="${a.k}"]`); let v = el.value.trim();
    if (v === '') { if (a.zorunlu) hata.push(`${a.ad} boş olamaz.`); x[a.k] = null; continue; }
    if (a.tur === 'sayi') { v = Number(v); if (!isFinite(v)) { hata.push(`${a.ad} sayı olmalı.`); continue; } if (a.min != null && v < a.min) hata.push(`${a.ad} en az ${a.min}.`); if (a.max != null && v > a.max) hata.push(`${a.ad} en çok ${a.max}.`); if (a.tam && !Number.isInteger(v)) hata.push(`${a.ad} tam sayı olmalı.`); }
    if (a.tur === 'secim' && a.sayisal) v = Number(v);
    if (a.tur === 'tarihsaat') { v = DTgirdi(v); if (parseT(S.D, v) == null) hata.push(`${a.ad} geçerli bir tarih değil.`); else if (parseT(S.D, v) < 0) hata.push(`${a.ad} planın başlangıcından (${S.D.meta.baslangic}) önce olamaz.`); }
    x[a.k] = v;
  }
  return { x, hata };
}

/* ---------- Siparişler ---------- */
function sSiparisler() {
  const D = S.D, p = S.plan;
  const f = U.sipFiltre;
  const J = p ? p.J : {};
  let l = D.siparisler.slice();
  if (f === 'gec') l = l.filter(s => J[s.id] && (J[s.id].T == null || J[s.id].T > 0.01));
  if (f === 'yuksek') l = l.filter(s => s.oncelik === 1);
  const yaz = yetkili('veri.yaz');
  const durum = s => { const j = J[s.id]; if (!p) return '—'; if (!j) return rozet('Planda yok', 'pasif'); if (j.T == null) return rozet('Planlanmadı', 'hata'); return j.T > 0.01 ? rozet(saat(j.T) + ' geç', 'hata') : rozet('Zamanında', 'tamam'); };
  const rows = l.map(s => `<tr class="tc-tablo-secilir" data-act="duzenle" data-tur="siparis" data-v="${esc(s.id)}" data-ara="${esc((s.id + ' ' + s.urun + ' ' + urunAd(s.urun)).toLowerCase())}">${td('Sipariş', `<b class="mono">${esc(s.id)}</b>`)}${td('Ürün', esc(urunAd(s.urun)))}${td('Adet', sayi(s.adet, 0), 'pm-num')}${td('Termin', esc(s.termin || '—'), 'tc-tablo-kirilmaz')}${td('Öncelik', oncelikRozet(s.oncelik))}${td('Serbest', esc(s.serbest || 'hemen'), 'tc-tablo-kirilmaz')}${td('Planlanan bitiş', esc(J[s.id] && J[s.id].C != null ? fmtDT(D, J[s.id].C) : '—'), 'tc-tablo-kirilmaz')}${td('Durum', durum(s))}${td('', `<div class="pm-dugmeler">${p ? dugme('', 'siparis-cizelge', { simge: 'gantt', hayalet: true, ad: 'Çizelgede göster', veri: `data-v="${esc(s.id)}"` }) : ''}${yaz ? dugme('', 'sil', { simge: 'trash', hayalet: true, ad: 'Sil', veri: `data-tur="siparis" data-v="${esc(s.id)}"` }) : ''}</div>`)}</tr>`).join('');
  return `<div class="pm-sira"><div class="pm-seg" role="group" aria-label="Süzgeç">${[['hepsi', 'Hepsi'], ['gec', 'Gecikenler'], ['yuksek', 'Yüksek öncelik']].map(([k, ad]) => `<button type="button" data-act="sip-filtre" data-v="${k}" aria-pressed="${f === k}">${ad}</button>`).join('')}</div><input class="tc-alan-kutu pm-sira-ara" type="search" placeholder="Sipariş no ya da ürün ara" data-inp="ara-satir" aria-label="Sipariş ara" style="max-width:320px">${dugme('Yeni sipariş', 'yeni', { birincil: true, simge: 'plus', yetki: 'veri.yaz', veri: 'data-tur="siparis"' })}</div>
  ${kart(`Siparişler <span class="pm-kucuk">${l.length} / ${D.siparisler.length}</span>`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Sipariş</th><th>Ürün</th><th class="pm-num">Adet</th><th>Termin</th><th>Öncelik</th><th>Serbest</th><th>Planlanan bitiş</th><th>Durum</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="tc-tablo-yok">Kayıt yok.</td></tr>'}</tbody></table></div>`)}
  <p class="pm-kucuk">Öncelik gecikmenin ağırlığıdır: yüksek önceliğin bir saati normalin iki, düşüğün dört saati sayılır. Bir satıra tıklayınca düzenleme açılır.</p>`;
}

/* ---------- Tezgâh kuyruğu (operatör görünümü) ---------- */
function sKuyruk() {
  const D = S.D; const u = kim();
  const m = u.rol === 'operator' ? u.tezgah : (U.kuyrukM || D.tezgahlar[0].id);
  const M = D.tezgahlar.find(t => t.id === m) || D.tezgahlar[0];
  const sec = u.rol === 'operator' ? `<span class="pm-cip">${ic('lock', 'k')} ${esc(M.id)} · ${esc(M.ad)}</span>` : `<select class="tc-alan-kutu" style="width:auto" data-chg="kuyruk-m" aria-label="Tezgâh">${D.tezgahlar.map(t => `<option value="${esc(t.id)}" ${t.id === M.id ? 'selected' : ''}>${esc(t.id)} · ${esc(t.ad)}</option>`).join('')}</select>`;
  if (!S.plan) return `<div class="pm-sira">${sec}</div><div class="pm-bos">${ic('play', 'b')}<strong>Bu tezgâh için plan yok</strong><span>Planlamacı planı çözünce iş listesi burada görünür.</span></div>`;
  const cx = cxAl();
  const ops = Object.values(S.plan.ops).filter(r => r.m === M.id).sort((a, b) => a.S - b.S);
  const now = 7;
  const durum = r => r.C <= now ? ['bitti', 'Bitti'] : r.S <= now && now < r.Su ? ['ayar', 'Ayarda'] : r.Su <= now && now < r.C ? ['calisiyor', 'Çalışıyor'] : ['sirada', 'Sırada'];
  const gunler = {};
  for (const r of ops) { const d = Math.floor(r.S / 24); (gunler[d] = gunler[d] || []).push(r); }
  const bolumler = Object.entries(gunler).slice(0, 14).map(([d, l]) => kart(esc(fmtDT(D, d * 24).slice(0, 9)), `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Sıra</th><th>Sipariş · adım</th><th class="pm-num">Adet</th><th>Başla</th><th class="pm-num">Ayar</th><th>Bitiş</th><th>Durum</th></tr></thead><tbody>${l.map(r => { const o = cx && cx.byId[r.id]; const [ds, dad] = durum(r); const s = D.siparisler.find(z => z.id === r.job) || {}; return `<tr class="tc-tablo-secilir" data-act="op" data-v="${esc(r.id)}">${td('Sıra', ops.indexOf(r) + 1, 'pm-num')}${td('Sipariş · adım', `<b class="mono">${esc(r.job)}</b> · ${esc(o ? o.k + ' ' + o.ad : r.id)}<br><span class="pm-kucuk">${esc(urunAd(s.urun))}</span>`)}${td('Adet', sayi(s.adet, 0), 'pm-num')}${td('Başla', `<span class="mono">${esc(fmtDT(D, r.S).slice(10))}</span>`)}${td('Ayar', r.su > 0 ? saat(r.su) : '—', 'pm-num')}${td('Bitiş', `<span class="mono">${esc(fmtDT(D, r.C))}</span>`)}${td('Durum', `<span data-durum="${ds}" class="tc-rozet" style="--c:var(--sig)"><i></i>${dad}</span>`)}</tr>`; }).join('')}</tbody></table></div>`, '', `<span class="pm-kucuk">${l.length} iş · ayar ${saat(l.reduce((a, r) => a + r.su, 0))}</span>`)).join('');
  return `<div class="pm-sira">${sec}<span class="pm-alt">${ops.length} iş planlı. ${u.rol === 'operator' ? 'Bu görünüm yalnız okunur; başlatma ve bitirme uygulamada terminalden yapılır.' : 'Operatörün göreceği liste.'}</span></div>${bolumler || `<p class="pm-alt">Bu tezgâhta planlı iş yok.</p>`}`;
}

/* ---------- Tezgâhlar ---------- */
function sTezgahlar() {
  const l = S.D.tezgahlar;
  return `<div class="pm-sira"><span class="pm-alt pm-sira-ara">${l.length} tezgâh, ${new Set(l.map(t => t.grup)).size} grup. Tezgâh kodu rotada kullanılır; kod değişmez.</span>${dugme('Yeni tezgâh', 'yeni', { birincil: true, simge: 'plus', yetki: 'veri.yaz', veri: 'data-tur="tezgah"' })}</div>${kart('Tezgâhlar', listeTablosu('tezgah', l))}`;
}

/* ---------- Ürün ve rota ---------- */
function sRotalar() {
  const D = S.D;
  if (!U.urun || !D.urunler.find(u => u.id === U.urun)) U.urun = D.urunler[0] && D.urunler[0].id;
  const u = D.urunler.find(x => x.id === U.urun);
  const liste = `<div class="pm-urunler">${D.urunler.map(x => `<button type="button" class="pm-urun" data-act="urun" data-v="${esc(x.id)}" aria-current="${x.id === U.urun}"><span><b class="mono">${esc(x.id)}</b><br><span class="pm-kucuk">${esc(x.ad)}</span></span><span class="tc-ikinci-sayi">${x.rota.length}</span></button>`).join('')}</div>`;
  let sag = '<p class="pm-alt">Ürün yok.</p>';
  if (u) {
    const ordered = u.rota.slice();
    const akis = ordered.map((o, i) => {
      const bag = (o.bag || []).map(([k, t]) => t).join('');
      const ok = i ? `<span class="pm-ok" data-tip="${(o.bag || []).some(([, t]) => t === 'o') ? 'o' : 'b'}" aria-hidden="true"><i></i>${(o.bag || []).some(([, t]) => t === 'o') ? 'örtüşmeli' : ''}</span>` : '';
      const ne = o.fason ? 'Fason: ' + (((D.fasoncular || []).find(f => f.id === o.fason) || {}).ad || o.fason) : (o.tezgahlar || []).map(t => t.id).join(' / ');
      return `${ok}<button type="button" class="pm-adim" data-act="adim" data-v="${esc(o.k)}"><b>${esc(o.k)}</b><span>${esc(o.ad)}</span><small>${esc(ne)}${o.aile ? ' · ' + esc(o.aile) : ''}</small></button>`;
    }).join('');
    const satirlar = ordered.map(o => `<tr class="tc-tablo-secilir" data-act="adim" data-v="${esc(o.k)}">${td('Sıra', `<b class="mono">${esc(o.k)}</b>`)}${td('Adım', esc(o.ad))}${td('Tezgâh · çevrim · ayar', o.fason ? rozet('Fason ' + o.fason, 'uyari') : (o.tezgahlar || []).map(t => `<span class="pm-cip">${esc(t.id)} · ${sayi(t.cevrim, 1)} dk · ${sayi(t.ayar, 0)} dk</span>`).join(' '))}${td('Öncül', (o.bag || []).map(([k, t]) => `${esc(k)} ${t === 'o' ? '(örtüşmeli)' : '(bitince)'}`).join(', ') || '—')}${td('Aile', esc(o.aile || '—'))}${td('Ek', [o.aparat ? 'aparat ' + o.aparat : '', o.fai ? 'ilk parça onayı' : '', o.program === false ? 'NC program yok' : '', o.fasonIzin ? 'fasona verilebilir' : ''].filter(Boolean).map(z => `<span class="pm-cip">${esc(z)}</span>`).join(' ') || '—')}${td('', `<div class="pm-dugmeler">${yetkili('veri.yaz') ? dugme('', 'adim-sil', { simge: 'trash', hayalet: true, ad: 'Adımı sil', veri: `data-v="${esc(o.k)}"` }) : ''}</div>`)}</tr>`).join('');
    const kul = D.siparisler.filter(s => s.urun === u.id).length;
    sag = kart(`<span class="mono">${esc(u.id)}</span> · ${esc(u.ad)}`, `<div class="pm-dik"><div class="pm-kap"><div class="pm-akis">${akis || '<span class="pm-alt">Rotada adım yok.</span>'}</div></div>
      <div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Sıra</th><th>Adım</th><th>Tezgâh · çevrim · ayar</th><th>Öncül</th><th>Aile</th><th>Ek</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${satirlar || '<tr><td colspan="7" class="tc-tablo-yok">Adım yok.</td></tr>'}</tbody></table></div>
      <p class="pm-kucuk">${kul} sipariş bu ürünü kullanıyor. Çevrim adet başına dakikadır. Aile, sıraya bağlı ayarı belirler (Ayar matrisi). Örtüşmeli geçişte sonraki adım ilk transfer partisi bitince başlar.</p></div>`,
      `${dugme('Adım ekle', 'adim-yeni', { simge: 'plus', yetki: 'veri.yaz' })}${dugme('', 'urun-sil', { simge: 'trash', ad: 'Ürünü sil', yetki: 'veri.yaz' })}`);
  }
  return `<div class="pm-yan">${kart('Ürünler', liste, dugme('', 'urun-yeni', { simge: 'plus', ad: 'Yeni ürün', yetki: 'veri.yaz' }))}${sag}</div>`;
}
function adimFormu(u, o) {
  const D = S.D; const yeni = !o; o = o || { k: String(((Math.max(0, ...u.rota.map(x => +x.k || 0)) / 10 | 0) + 1) * 10), ad: '', tezgahlar: [], bag: u.rota.length ? [[u.rota[u.rota.length - 1].k, 'b']] : [], aile: '' };
  const fason = !!o.fason;
  const tSatir = (t = {}) => `<div class="pm-alt-satir" data-satir><select class="tc-alan-kutu" name="tid" aria-label="Tezgâh"><option value="">Tezgâh</option>${D.tezgahlar.map(m => `<option value="${esc(m.id)}" ${t.id === m.id ? 'selected' : ''}>${esc(m.id)} · ${esc(m.ad)}</option>`).join('')}</select><input class="tc-alan-kutu" type="number" min="0" step="any" name="tcevrim" value="${t.cevrim ?? ''}" placeholder="0" aria-label="Çevrim dakika"><input class="tc-alan-kutu" type="number" min="0" step="any" name="tayar" value="${t.ayar ?? ''}" placeholder="0" aria-label="Ayar dakika"><button type="button" class="tc-dugme tc-dugme-simge tc-dugme-hayalet" data-act="satir-sil" aria-label="Satırı sil">${ic('x', 'k')}</button></div>`;
  const diger = u.rota.filter(x => x.k !== o.k);
  const bagMap = Object.fromEntries((o.bag || []).map(([k, t]) => [k, t]));
  const aileler = [...new Set(D.urunler.flatMap(z => z.rota.map(x => x.aile)).filter(Boolean))];
  return `<form class="tc-form" data-form="adim" data-v="${esc(yeni ? '' : o.k)}" novalidate>
    <label class="tc-alan"><span class="tc-alan-etiket">Sıra no <span class="tc-alan-zorunlu">*</span></span><input class="tc-alan-kutu" name="k" value="${esc(o.k)}" ${yeni ? '' : 'readonly'}></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Adım adı <span class="tc-alan-zorunlu">*</span></span><input class="tc-alan-kutu" name="ad" value="${esc(o.ad)}"></label>
    <fieldset class="tc-alan tc-form-tam" style="border:0;padding:0;margin:0"><legend class="tc-alan-etiket">Nerede yapılır</legend><div class="pm-secimler"><label><input type="radio" name="tur" value="tezgah" ${fason ? '' : 'checked'} data-chg="adim-tur"> Tezgâhta</label><label><input type="radio" name="tur" value="fason" ${fason ? 'checked' : ''} data-chg="adim-tur"> Fasonda</label></div></fieldset>
    <div class="tc-alan tc-form-tam" data-bolum="tezgah" ${fason ? 'hidden' : ''}><span class="tc-alan-etiket">Uygun tezgâhlar (biri seçilir)</span><div class="pm-alt-satir pm-kucuk" aria-hidden="true"><span>Tezgâh</span><span>Çevrim dk/adet</span><span>Ayar dk</span><span></span></div><div class="pm-satirlar" data-tezgahlar>${(o.tezgahlar || []).map(tSatir).join('') || tSatir()}</div><template data-sablon>${tSatir()}</template><button type="button" class="tc-dugme tc-dugme-kucuk pm-satir-ekle" data-act="satir-ekle">${ic('plus', 'k')}Alternatif tezgâh</button><span class="tc-alan-alt">Çevrim: adet başına dakika. Ayar: tam ayar dakikası; aile geçişinde matris uygulanır.</span></div>
    <label class="tc-alan tc-form-tam" data-bolum="fason" ${fason ? '' : 'hidden'}><span class="tc-alan-etiket">Fasoncu</span><select class="tc-alan-kutu" name="fason"><option value="">Seçin</option>${(D.fasoncular || []).map(f => `<option value="${esc(f.id)}" ${o.fason === f.id ? 'selected' : ''}>${esc(f.ad)}</option>`).join('')}</select></label>
    <fieldset class="tc-alan tc-form-tam" style="border:0;padding:0;margin:0"><legend class="tc-alan-etiket">Öncül adımlar</legend>${diger.length ? `<div class="pm-satirlar">${diger.map(x => `<div class="pm-sira"><label class="tc-isaret"><input type="checkbox" name="bag" value="${esc(x.k)}" ${bagMap[x.k] ? 'checked' : ''}> ${esc(x.k)} ${esc(x.ad)}</label><select class="tc-alan-kutu" style="width:auto" name="bagtip-${esc(x.k)}" aria-label="Geçiş türü"><option value="b" ${bagMap[x.k] !== 'o' ? 'selected' : ''}>bitince</option><option value="o" ${bagMap[x.k] === 'o' ? 'selected' : ''}>örtüşmeli</option></select></div>`).join('')}</div>` : '<span class="pm-alt">İlk adım.</span>'}</fieldset>
    <label class="tc-alan"><span class="tc-alan-etiket">Aile</span><input class="tc-alan-kutu" name="aile" value="${esc(o.aile || '')}" list="dl-aile" placeholder="Boş: aile yok"><datalist id="dl-aile">${aileler.map(a => `<option value="${esc(a)}">`).join('')}</datalist></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Aparat</span><select class="tc-alan-kutu" name="aparat"><option value="">Yok</option>${(D.aparatlar || []).map(a => `<option value="${esc(a.id)}" ${o.aparat === a.id ? 'selected' : ''}>${esc(a.ad)} (${a.adet})</option>`).join('')}</select></label>
    <label class="tc-isaret"><input type="checkbox" name="fai" ${o.fai ? 'checked' : ''}> İlk parça onayı gerekir</label>
    <label class="tc-isaret"><input type="checkbox" name="programYok" ${o.program === false ? 'checked' : ''}> NC programı henüz hazır değil</label>
    <label class="tc-isaret tc-form-tam"><input type="checkbox" name="fasonIzin" ${o.fasonIzin ? 'checked' : ''}> Gerekirse talaşlı fasona verilebilir</label>
    <p class="pm-form-hata tc-form-tam" data-hata hidden></p></form>`;
}

/* ---------- Takvim ---------- */
function sTakvim() {
  const D = S.D; const yaz = yetkili('veri.yaz');
  const vs = D.vardiyalar;
  const gunIzgara = `<div class="pm-kap"><table class="pm-izgara"><thead><tr><th scope="col">Vardiya</th>${GUNLER.map(g => `<th scope="col">${GUN_AD2[g]}</th>`).join('')}</tr></thead><tbody>${vs.map(v => `<tr><th scope="row">${esc(v.id)} <span class="pm-kucuk">${esc(v.bas)}-${esc(v.bit)}</span></th>${GUNLER.map(g => `<td><input type="checkbox" aria-label="${GUN_AD2[g]} ${esc(v.id)}" data-chg="calisma" data-g="${g}" data-v="${esc(v.id)}" ${(D.calismaGunleri[g] || []).includes(v.id) ? 'checked' : ''} ${yaz ? '' : 'disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const tatil = `<div class="pm-dik"><div class="pm-cipler">${(D.tatiller || []).map(t => `<span class="pm-cip">${esc(t)}${yaz ? `<button type="button" data-act="tatil-sil" data-v="${esc(t)}" aria-label="${esc(t)} tatilini sil">${ic('x', 'k')}</button>` : ''}</span>`).join('') || '<span class="pm-alt">Tatil yok.</span>'}</div>${yaz ? `<div class="pm-sira"><input class="tc-alan-kutu" type="date" data-tatil-gir aria-label="Tatil günü" style="max-width:200px">${dugme('Ekle', 'tatil-ekle', { simge: 'plus', kucuk: true })}</div>` : ''}</div>`;
  const ariza = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th>Başlangıç</th><th>Bitiş</th><th class="pm-num">Süre</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${S.down.map((d, i) => `<tr>${td('Tezgâh', `<b class="mono">${esc(d.m)}</b>`)}${td('Başlangıç', esc(fmtDT(D, d.from)))}${td('Bitiş', esc(fmtDT(D, d.to)))}${td('Süre', saat(d.to - d.from), 'pm-num')}${td('', yaz ? `<div class="pm-dugmeler">${dugme('', 'ariza-sil', { simge: 'trash', hayalet: true, ad: 'Sil', veri: `data-v="${i}"` })}</div>` : '')}</tr>`).join('') || '<tr><td colspan="5" class="tc-tablo-yok">Kayıt yok.</td></tr>'}</tbody></table></div>
  ${yaz ? `<form class="tc-form" data-form="ariza" novalidate style="margin-top:var(--b-3)"><label class="tc-alan"><span class="tc-alan-etiket">Tezgâh</span><select class="tc-alan-kutu" name="m">${D.tezgahlar.map(t => `<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.ad)}</option>`).join('')}</select></label><label class="tc-alan"><span class="tc-alan-etiket">Başlangıç</span><input class="tc-alan-kutu" type="datetime-local" name="from" value="${girdiDT(tStr(31))}"></label><label class="tc-alan"><span class="tc-alan-etiket">Bitiş</span><input class="tc-alan-kutu" type="datetime-local" name="to" value="${girdiDT(tStr(39))}"></label><div class="tc-alan" style="justify-content:end"><button type="submit" class="tc-dugme">${ic('plus', 'k')}Arıza ya da bakım ekle</button></div><p class="pm-form-hata tc-form-tam" data-hata hidden></p></form>` : ''}`;
  const mesai = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th>Gün</th><th>Vardiya</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${S.ekMesai.map((e, i) => `<tr>${td('Tezgâh', `<b class="mono">${esc(e.m)}</b>`)}${td('Gün', esc(fmtDT(D, e.gun * 24).slice(0, 9)))}${td('Vardiya', esc(e.vardiya))}${td('', yaz ? `<div class="pm-dugmeler">${dugme('', 'mesai-sil', { simge: 'trash', hayalet: true, ad: 'Sil', veri: `data-v="${i}"` })}</div>` : '')}</tr>`).join('') || '<tr><td colspan="4" class="tc-tablo-yok">Ek mesai yok.</td></tr>'}</tbody></table></div>
  ${yaz ? `<form class="tc-form" data-form="mesai" novalidate style="margin-top:var(--b-3)"><label class="tc-alan"><span class="tc-alan-etiket">Tezgâh</span><select class="tc-alan-kutu" name="m">${D.tezgahlar.map(t => `<option value="${esc(t.id)}">${esc(t.id)}</option>`).join('')}</select></label><label class="tc-alan"><span class="tc-alan-etiket">Gün</span><input class="tc-alan-kutu" type="date" name="gun" value="${gunTarih(5)}"></label><label class="tc-alan"><span class="tc-alan-etiket">Vardiya</span><select class="tc-alan-kutu" name="vardiya">${vs.map(v => `<option>${esc(v.id)}</option>`).join('')}</select></label><div class="tc-alan" style="justify-content:end"><button type="submit" class="tc-dugme">${ic('plus', 'k')}Ek mesai ekle</button></div><p class="pm-kucuk tc-form-tam">Ek mesai o vardiyada tezgâhı, bir operatörü ve bir ayarcıyı açar.</p></form>` : ''}`;
  return `<div class="pm-iki-esit pm-iki">${kart('Vardiyalar', listeTablosu('vardiya', vs), dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="vardiya"' }))}${kart('Çalışma günleri', gunIzgara + `<p class="pm-kucuk">İşaretli vardiyada fabrika açıktır. Tezgâhın kendi vardiyası Tezgâhlar sayfasında daraltılır.</p>`)}</div>
  <div class="pm-iki">${kart('Arıza ve planlı bakım', ariza)}${kart('Tatiller', tatil)}</div>${kart('Ek mesai', mesai)}`;
}

/* ---------- Personel ---------- */
function sPersonel() {
  const D = S.D; const yaz = yetkili('veri.yaz');
  const gruplar = [...new Set(D.tezgahlar.map(t => t.grup))];
  const vs = D.vardiyalar.map(v => v.id);
  const acik = (g, v) => D.tezgahlar.some(t => t.grup === g && (t.opOran == null || +t.opOran > 0) && (!t.vardiyalar || !t.vardiyalar.length || t.vardiyalar.includes(v))) && GUNLER.some(gn => (D.calismaGunleri[gn] || []).includes(v));
  const say = (g, v) => D.personel.filter(p => p.vardiya === v && (p.gruplar || []).includes(g)).length;
  const tez = (g, v) => D.tezgahlar.filter(t => t.grup === g && (!t.vardiyalar || !t.vardiyalar.length || t.vardiyalar.includes(v))).reduce((a, t) => a + (t.opOran == null ? 1 : +t.opOran), 0);
  const matris = `<div class="pm-kap"><table class="pm-izgara"><thead><tr><th scope="col">Grup</th>${vs.map(v => `<th scope="col">${esc(v)}</th>`).join('')}</tr></thead><tbody>${gruplar.map(g => `<tr><th scope="row">${esc(g)}</th>${vs.map(v => { const n = say(g, v), t = tez(g, v), a = acik(g, v); const ton = a && n === 0 ? 'hata' : a && n < t ? 'uyari' : ''; return `<td ${ton ? `data-ton="${ton}"` : ''} title="${n} kişi · operatör ihtiyacı ${sayi(t, 1)}">${a ? `${n} <span class="pm-kucuk">/ ${sayi(t, 1)}</span>` : '<span class="pm-kucuk">kapalı</span>'}</td>`; }).join('')}</tr>`).join('')}<tr><th scope="row">Ayarcı</th>${vs.map(v => { const n = D.personel.filter(p => p.vardiya === v && p.ayar).length; const a = GUNLER.some(gn => (D.calismaGunleri[gn] || []).includes(v)); return `<td ${a && !n ? 'data-ton="hata"' : ''}>${a ? n : '<span class="pm-kucuk">kapalı</span>'}</td>`; }).join('')}</tr></tbody></table></div><p class="pm-kucuk">Hücre: yetkin kişi / o vardiyada açık tezgâhların operatör ihtiyacı. Kırmızı: tezgâh açık ama kimse yok, o vardiyada iş yerleşmez. Sarı: kişi tezgâhtan az, tezgâhlar sırayla çalışır.</p>`;
  const devam = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Personel</th><th>Gün</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${(D.devamsizlik || []).map((d, i) => `<tr>${td('Personel', `<b class="mono">${esc(d.personel)}</b>`)}${td('Gün', esc(d.gun))}${td('', yaz ? `<div class="pm-dugmeler">${dugme('', 'devam-sil', { simge: 'trash', hayalet: true, ad: 'Sil', veri: `data-v="${i}"` })}</div>` : '')}</tr>`).join('') || '<tr><td colspan="3" class="tc-tablo-yok">Devamsızlık yok.</td></tr>'}</tbody></table></div>${yaz ? `<form class="tc-form" data-form="devam" novalidate style="margin-top:var(--b-3)"><label class="tc-alan"><span class="tc-alan-etiket">Personel</span><select class="tc-alan-kutu" name="personel">${D.personel.map(p => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.ad)}</option>`).join('')}</select></label><label class="tc-alan"><span class="tc-alan-etiket">Gün</span><input class="tc-alan-kutu" type="date" name="gun" value="${gunTarih(1)}"></label><div class="tc-alan tc-form-tam"><button type="submit" class="tc-dugme">${ic('plus', 'k')}Devamsızlık ekle</button></div></form>` : ''}`;
  return `<div class="pm-iki">${kart('Vardiya ve yetkinlik kapasitesi', matris)}${kart('Devamsızlık', devam)}</div>${kart(`Personel <span class="pm-kucuk">${D.personel.length}</span>`, listeTablosu('personel', D.personel), dugme('Yeni personel', 'yeni', { simge: 'plus', birincil: true, yetki: 'veri.yaz', veri: 'data-tur="personel"' }))}`;
}

/* ---------- Malzeme ---------- */
function sMalzeme() {
  const D = S.D; const cx = cxAl();
  let karsilama = '';
  if (cx) {
    const satir = [];
    for (const s of D.siparisler) { const r = cx.mat.res[s.id]; if (!r) continue; for (const d of r.det) satir.push({ s, d }); }
    karsilama = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Sipariş</th><th>Malzeme</th><th class="pm-num">İhtiyaç</th><th>Kaynak</th><th>Hazır</th></tr></thead><tbody>${satir.map(({ s, d }) => `<tr>${td('Sipariş', `<b class="mono">${esc(s.id)}</b>`)}${td('Malzeme', esc(d.kod))}${td('İhtiyaç', `${sayi(d.need, 1)} ${esc(d.birim)}`, 'pm-num')}${td('Kaynak', d.kaynak === 'eksik' ? rozet(`Eksik ${sayi(d.eksikQ, 1)}`, 'hata') : d.kaynak === 'stok' ? rozet('Stok', 'tamam') : rozet('Satın alma', 'uyari'))}${td('Hazır', esc(d.t == null ? '—' : fmtDT(D, d.t)))}</tr>`).join('') || '<tr><td colspan="5" class="tc-tablo-yok">Malzemeli sipariş yok.</td></tr>'}</tbody></table></div><p class="pm-kucuk">Dağıtım önce önceliğe, sonra termine göre. Hazır anı: söz tarihi + tedarikçinin ortalama gecikmesi + giriş muayenesi. Malzeme kuralı: ${S.w.mat === 'sert' ? 'sert (iş malzemesiz başlamaz)' : 'uyarı (iş başlar, uyarı verilir; K3 kararı)'}.</p>`;
  }
  return `<div class="pm-iki">${kart('Malzemeler', listeTablosu('malzeme', D.malzemeler), dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="malzeme"' }))}${kart('Tedarikçiler', listeTablosu('tedarikci', D.tedarikciler || []), dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="tedarikci"' }))}</div>
  ${kart('Açık satın almalar', listeTablosu('satinalma', D.satinalma), dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="satinalma"' }))}${kart('Siparişlere karşılama', karsilama)}`;
}

/* ---------- Fason ve aparat ---------- */
function sFason() {
  return `<div class="pm-iki">${kart('Fasoncular', listeTablosu('fasoncu', S.D.fasoncular || []) + `<p class="pm-kucuk">Fason iş yalnız çıkış gününde ve saatinde gider, süre sonunda döner; aynı anda en çok "kapasite" kadar iş alır.</p>`, dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="fasoncu"' }))}${kart('Aparatlar', listeTablosu('aparat', S.D.aparatlar || []) + `<p class="pm-kucuk">Aynı aparatı isteyen adımlar aparat adedinden fazla aynı anda çalışmaz.</p>`, dugme('Yeni', 'yeni', { simge: 'plus', kucuk: true, yetki: 'veri.yaz', veri: 'data-tur="aparat"' }))}</div>`;
}

/* ---------- Ayar matrisi ---------- */
function sAyar() {
  const D = S.D; const yaz = yetkili('veri.yaz');
  const aileler = [...new Set(D.urunler.flatMap(u => u.rota.map(o => o.aile)).filter(Boolean))].sort();
  const mx = {}; for (const e of D.ayarMatrisi || []) mx[e.den + '|' + e.ye] = e.dk;
  let bos = 0;
  const govde = aileler.map(a => `<tr><th scope="row">${esc(a)}</th>${aileler.map(b => { if (a === b) return `<td data-kosegen title="Aynı aile: tam ayar × ${S.w.famK}">× ${sayi(S.w.famK, 2)}</td>`; const v = mx[a + '|' + b]; if (v == null) bos++; return `<td ${v == null ? 'data-ton="uyari"' : ''}><input type="number" min="0" step="5" value="${v ?? ''}" placeholder="tam" aria-label="${esc(a)} sonra ${esc(b)} ayar dakikası" data-chg="matris" data-a="${esc(a)}" data-b="${esc(b)}" ${yaz ? '' : 'disabled'}></td>`; }).join('')}</tr>`).join('');
  return kart('Aileler arası ayar süresi (dakika)', `<div class="pm-kap"><table class="pm-izgara"><thead><tr><th scope="col">Önceki ↓ / sonraki →</th>${aileler.map(a => `<th scope="col">${esc(a)}</th>`).join('')}</tr></thead><tbody>${govde}</tbody></table></div><p class="pm-kucuk">Satır: tezgâhtaki önceki işin ailesi; sütun: sıradaki işin ailesi. Boş hücre (sarı) tam ayar alır. Köşegen aynı aile kısalmasıdır; katsayı Çözücü sayfasında. ${bos} geçiş tanımsız.</p>`, '', `<span class="pm-kucuk">${aileler.length} aile</span>`);
}

/* ---------- Veri denetimi ---------- */
let denOnbellek = { v: -1, l: [] };
function denetimBulgulari() {
  if (denOnbellek.v === S.dataVer) return denOnbellek.l;
  let l = [];
  try {
    const cx = cxAl();
    if (cx) l = veriDenetimi(stOf(), cx);
    for (const s of S.D.siparisler) { if (!S.D.urunler.find(u => u.id === s.urun)) l.push({ k: 'tezgah', t: `${s.id}: ürün ${s.urun} tanımlı değil; sipariş planlanmaz.` }); if (!s.termin) l.push({ k: 'amac', t: `${s.id}: termin yok; gecikmesi ölçülemez.` }); }
    for (const u of S.D.urunler) if (!u.rota.length) l.push({ k: 'rota', t: `${u.id}: rotada adım yok.` });
  } catch (e) { l.push({ k: 'hata', t: 'Veri derlenemedi: ' + e.message }); }
  denOnbellek = { v: S.dataVer, l };
  return l;
}
function sDenetim() {
  const l = denetimBulgulari();
  const sayfa = { personel: 'personel', ayarci: 'personel', tezgah: 'rotalar', aparat: 'fason', rota: 'rotalar', ayar: 'ayar', malzeme: 'malzeme', fason: 'fason', amac: 'siparisler' };
  const ad = Object.fromEntries(KISITLAR.map(k => [k.id, k.ad]));
  const grup = {}; for (const b of l) (grup[b.k] = grup[b.k] || []).push(b);
  const icerik = l.length ? Object.entries(grup).map(([k, bs]) => kart(esc(ad[k] || k), `<ul class="pm-olaylar">${bs.map(b => `<li class="pm-olay" data-ton="${['personel', 'tezgah', 'rota', 'hata'].includes(k) ? 'hata' : 'uyari'}">${ic('alert', 'k')}<span class="pm-olay-metin">${esc(b.t)}</span></li>`).join('')}</ul>`, sayfa[k] ? dugme('Düzelt', 'git', { kucuk: true, simge: 'edit', veri: `data-v="${sayfa[k]}"` }) : '', rozet(bs.length + '', 'uyari'))).join('')
    : `<div class="pm-serit" data-ton="tamam">${ic('check', 'k')}<span class="pm-serit-metin">Bulgu yok. Kısıtlar birlikte tutarlı.</span></div>`;
  return `<div class="pm-serit">${ic('scan', 'k')}<span class="pm-serit-metin">Denetim çözücüden önce kısıtları birlikte sınar: açık vardiyada yetkin personel ve ayarcı, rotadaki tezgâh ve öncül, tanımsız aparat, ayar matrisinde olmayan aile geçişi, karşılanmayan malzeme, çıkış günü olmayan fasoncu. Veri her değiştiğinde yeniden koşar.</span></div>${icerik}`;
}

/* ---------- Senaryolar ---------- */
function ozetSatir(p) { return p ? { wT: p.ozet.wT, late: p.ozet.late, n: p.ozet.n, suH: p.ozet.suH, Cmax: p.ozet.Cmax, chg: p.ozet.chg } : null; }
function sSenaryolar() {
  const D = S.D; const yazP = yetkili('plan.yaz');
  const calisma = S.plan ? `<dl class="pm-dl"><dt>Gecikme</dt><dd class="mono">${saat(S.plan.ozet.wT)} · ${S.plan.ozet.late}/${S.plan.ozet.n} sipariş</dd><dt>Ayar</dt><dd class="mono">${saat(S.plan.ozet.suH)}</dd><dt>Son bitiş</dt><dd class="mono">${esc(fmtDT(D, S.plan.ozet.Cmax))}</dd><dt>Çözen</dt><dd>${esc(S.plan.kim)} · ${zamanYaz(S.plan.zaman)}</dd><dt>Durum</dt><dd>${planGuncel() ? rozet('Güncel', 'tamam') : rozet('Veri değişti', 'uyari')}</dd></dl>` : '<p class="pm-alt">Çalışmada plan yok. Önce çözün.</p>';
  const kaydetForm = yazP ? `<form class="pm-sira" data-form="senaryo-kaydet" novalidate style="margin-top:var(--b-3)"><input class="tc-alan-kutu pm-sira-ara" name="ad" placeholder="Senaryo adı (ör. T2 bakımı ileri)" aria-label="Senaryo adı" ${S.plan ? '' : 'disabled'}><button type="submit" class="tc-dugme tc-dugme-birincil" ${S.plan && planGuncel() ? '' : 'disabled title="Güncel plan gerekir"'}>${ic('flag', 'k')}Senaryo olarak kaydet</button></form>` : '';
  const sec = new Set(U.karsilastir);
  const satirlar = S.senaryolar.slice().reverse().map(s => {
    const o = s.ozet; const canli = s.id === S.canli;
    const durum = canli ? rozet('Canlı', 'tamam') : s.durum === 'vazgecildi' ? rozet('Vazgeçildi', 'pasif') : rozet('Açık', '');
    const eski = canli || s.durum === 'vazgecildi' ? false : s.tabanSurum !== S.canliSurum && S.canli;
    return `<tr>${td('Seç', `<input type="checkbox" data-chg="karsilastir" data-v="${esc(s.id)}" ${sec.has(s.id) ? 'checked' : ''} aria-label="${esc(s.ad)} karşılaştır" style="width:22px;height:22px;accent-color:var(--hazard)">`)}${td('Senaryo', `<b>${esc(s.ad)}</b><br><span class="pm-kucuk">${esc(s.yazar)} · ${zamanYaz(s.zaman)} · canlı s.${s.tabanSurum} üstünde${eski ? ' · ' : ''}</span>${eski ? rozet('Canlı değişti', 'uyari') : ''}`)}${td('Durum', durum)}${td('Gecikme', saat(o.wT), 'pm-num')}${td('Geciken', `${o.late}/${o.n}`, 'pm-num')}${td('Ayar', saat(o.suH), 'pm-num')}${td('', `<div class="pm-dugmeler">${dugme('Aç', 'sen-ac', { kucuk: true, veri: `data-v="${esc(s.id)}"`, ipucu: 'Veriyi ve planı çalışmaya yükler' })}${!canli && s.durum !== 'vazgecildi' ? dugme('Canlıya al', 'sen-canli', { kucuk: true, birincil: true, yetki: 'plan.canliya-al', veri: `data-v="${esc(s.id)}"` }) : ''}${!canli && s.durum !== 'vazgecildi' ? dugme('', 'sen-vazgec', { simge: 'x', hayalet: true, ad: 'Vazgeç', yetki: 'plan.yaz', veri: `data-v="${esc(s.id)}"` }) : ''}${!canli ? dugme('', 'sen-sil', { simge: 'trash', hayalet: true, ad: 'Sil', yetki: 'plan.yaz', veri: `data-v="${esc(s.id)}"` }) : ''}</div>`)}</tr>`;
  }).join('');
  const tablo = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th><span class="tc-gizli-etiket">Seç</span></th><th>Senaryo</th><th>Durum</th><th class="pm-num">Gecikme</th><th class="pm-num">Geciken</th><th class="pm-num">Ayar</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${satirlar || '<tr><td colspan="7" class="tc-tablo-yok">Senaryo yok. Çalışmayı kaydedin; farklı veri ya da kararla ikinci bir senaryo kurup karşılaştırın.</td></tr>'}</tbody></table></div>`;
  return `<div class="pm-iki">${kart('Çalışma', calisma + kaydetForm, '', '<span class="pm-kucuk">kaydedilmemiş</span>')}${kart('Nasıl işler', `<ul class="pm-olaylar"><li class="pm-olay" data-ton="bilgi">${ic('flag', 'k')}<span class="pm-olay-metin">Planlamacı çalışmayı çözer, senaryo olarak kaydeder. Birden çok senaryo yan yana karşılaştırılır.</span></li><li class="pm-olay" data-ton="bilgi">${ic('lock', 'k')}<span class="pm-olay-metin">Canlıya almayı üretim müdürü ya da yönetici yapar (plan.canliya-al). Canlı plan sürümü artar.</span></li><li class="pm-olay" data-ton="uyari">${ic('alert', 'k')}<span class="pm-olay-metin">Senaryo, canlının eski sürümü üstünde kurulduysa canlıya alırken uyarı çıkar; başkasının aldığı plan sessizce ezilmez.</span></li></ul>`)}</div>
  ${kart('Senaryolar', tablo, U.karsilastir.length >= 2 ? '' : '<span class="pm-kucuk">Karşılaştırmak için iki ya da üç senaryo seçin</span>')}${U.karsilastir.length >= 2 ? karsilastirma() : ''}`;
}
function karsilastirma() {
  const l = U.karsilastir.map(id => S.senaryolar.find(s => s.id === id)).filter(Boolean);
  if (l.length < 2) return '';
  const D = S.D;
  const satir = (ad, f, fmt, kucukIyi = true) => { const v = l.map(f); const best = kucukIyi ? Math.min(...v.filter(isFinite)) : Math.max(...v.filter(isFinite)); return `<tr><th scope="row">${ad}</th>${v.map((x, i) => `<td class="pm-num${x === best && v.filter(y => y === best).length < v.length ? ' pm-en-iyi' : ''}">${fmt(x)}${i > 0 && isFinite(x) && isFinite(v[0]) && Math.abs(x - v[0]) > 1e-6 ? ` <span class="${(x < v[0]) === kucukIyi ? 'pm-fark-iyi' : 'pm-fark-kotu'}">${x > v[0] ? '+' : ''}${sayi(x - v[0], 1)}</span>` : ''}</td>`).join('')}</tr>`; };
  const tumJ = [...new Set(l.flatMap(s => Object.keys(s.J || {})))];
  const farkli = tumJ.filter(j => { const t = l.map(s => (s.J[j] || {}).T); return t.some(x => Math.abs((x ?? -1) - (t[0] ?? -1)) > 0.5); }).slice(0, 20);
  return kart('Karşılaştırma', `<div class="pm-kap"><table class="tc-tablo"><thead><tr><th></th>${l.map(s => `<th class="pm-num">${esc(s.ad)}</th>`).join('')}</tr></thead><tbody>
    ${satir('Ağırlıklı gecikme (sa)', s => s.ozet.wT, x => sayi(x, 1))}${satir('Geciken sipariş', s => s.ozet.late, x => sayi(x, 0))}${satir('Toplam ayar (sa)', s => s.ozet.suH, x => sayi(x, 1))}${satir('Son bitiş (sa)', s => s.ozet.Cmax - 7, x => sayi(x, 1))}${satir('Sipariş', s => s.D.siparisler.length, x => sayi(x, 0), false)}${satir('Tezgâh', s => s.D.tezgahlar.length, x => sayi(x, 0), false)}
  </tbody></table></div>${farkli.length ? `<h3 class="pm-kucuk" style="margin-top:var(--b-4)">Gecikmesi değişen siparişler</h3><div class="pm-kap"><table class="tc-tablo"><thead><tr><th>Sipariş</th>${l.map(s => `<th class="pm-num">${esc(s.ad)}</th>`).join('')}</tr></thead><tbody>${farkli.map(j => `<tr><th scope="row" class="mono">${esc(j)}</th>${l.map(s => { const x = s.J[j]; return `<td class="pm-num">${!x ? '—' : x.T == null ? 'planlanmadı' : x.T > 0.01 ? saat(x.T) : 'zamanında'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : ''}<p class="pm-kucuk">İlk sütun başvurudur; yeşil fark iyileşme, kırmızı kötüleşmedir.</p>`);
}

/* ---------- Çözücü ---------- */
function sCozucu() {
  const yazP = yetkili('plan.yaz');
  const ayar = `<form class="tc-form" data-form="cozucu" novalidate>
    <label class="tc-alan"><span class="tc-alan-etiket">Çözüm süresi</span><select class="tc-alan-kutu" name="sure" ${yazP ? '' : 'disabled'}>${[5, 10, 20, 40].map(s => `<option value="${s}" ${+S.w.sure === s ? 'selected' : ''}>${s} saniye</option>`).join('')}</select><span class="tc-alan-alt">Motor önce kural tabanlı plan kurar, kalan sürede iyileştirir.</span></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Dondurma ufku (sa)</span><input class="tc-alan-kutu" type="number" min="0" max="72" name="dondurma" value="${S.w.dondurma}" ${yazP ? '' : 'disabled'}><span class="tc-alan-alt">Bu süre içinde başlayan işler yeniden planda yerinden oynamaz.</span></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Aynı aile ayar katsayısı</span><input class="tc-alan-kutu" type="number" min="0" max="1" step="0.05" name="famK" value="${S.w.famK}" ${yazP ? '' : 'disabled'}><span class="tc-alan-alt">0,3: aynı aileden sonra ayar tam ayarın %30'u.</span></label>
    <label class="tc-alan"><span class="tc-alan-etiket">Malzeme kuralı</span><select class="tc-alan-kutu" name="mat" ${yazP ? '' : 'disabled'}><option value="uyari" ${S.w.mat === 'uyari' ? 'selected' : ''}>Uyarı: iş başlar, uyarı verilir (K3)</option><option value="sert" ${S.w.mat === 'sert' ? 'selected' : ''}>Sert: malzeme gelmeden başlamaz</option></select></label>
    ${yazP ? `<div class="tc-form-tam pm-dugmeler"><button type="submit" class="tc-dugme tc-dugme-birincil">${ic('check', 'k')}Ayarları kaydet</button></div>` : ''}</form>`;
  const amac = `<ol class="pm-olaylar" style="list-style:none">${['Ağırlıklı gecikme (öncelik ağırlığıyla)', 'Termin tamponu ihlali', 'Canlı plana göre değişiklik sayısı', 'Toplam ayar süresi', 'Bilinen maliyet (TL)'].map((x, i) => `<li class="pm-olay" data-ton="bilgi"><b class="mono">${i + 1}</b><span class="pm-olay-metin">${x}</span></li>`).join('')}</ol><p class="pm-kucuk">Sıralı amaç: bir üst ölçüt eşitse alttakine bakılır. Ağırlıkla karıştırılmaz; böylece bir saat gecikme hiçbir ayar kazancıyla takas edilmez.</p>`;
  const durumRoz = d => d === 'tam' ? rozet('tam', 'tamam') : d === 'yaklasik' ? rozet('yaklaşık', 'uyari') : d === 'gevsek' ? rozet('gevşek', '') : d === 'karar' ? rozet('karar', '') : rozet('yok', 'pasif');
  const katalog = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Kısıt</th><th>Veri</th><th>Motor</th><th>Alt sınır</th><th>CP-SAT</th></tr></thead><tbody>${KISITLAR.map(k => `<tr title="${esc(k.not)}">${td('Kısıt', `<b>${esc(k.ad)}</b>${k.not ? `<br><span class="pm-kucuk">${esc(k.not)}</span>` : ''}`)}${td('Veri', `<span class="pm-kucuk mono">${esc(k.veri)}</span>`)}${td('Motor', durumRoz(k.motor))}${td('Alt sınır', durumRoz(k.sinir))}${td('CP-SAT', durumRoz(k.cpsat))}</tr>`).join('')}</tbody></table></div>`;
  const cozuculer = `<ul class="pm-olaylar"><li class="pm-olay" data-ton="bilgi">${ic('cpu', 'k')}<span class="pm-olay-metin"><b>Motor</b> bu sayfada, tarayıcıda ayrı iş parçacığında koşar. Bütün kısıtları tam uygular; plana yalnız motor yazar.</span>${rozet('Etkin', 'tamam')}</li><li class="pm-olay">${ic('chart', 'k')}<span class="pm-olay-metin"><b>HiGHS</b> alt sınır ve kaba kararlar için. Yalnız deneme sayfasında onaylı; bu modülde yok.</span>${rozet('Kapalı', 'pasif')}</li><li class="pm-olay">${ic('layers', 'k')}<span class="pm-olay-metin"><b>CP-SAT</b> ayrıntılı sıra ve aile ayarı için. Yalnız bulut deneme ortamında onaylı; uygulamaya girmesi ayrı onay ister.</span>${rozet('Kapalı', 'pasif')}</li></ul>`;
  const veri = `<div class="pm-dik"><div class="pm-dugmeler">${Object.entries(VERI).map(([id, v]) => dugme(v.veri.meta.ad.replace(' (uydurma veri)', ''), 'set-yukle', { kucuk: true, veri: `data-v="${id}"`, yetki: 'veri.yaz', cls: S.setId === id ? 'tc-dugme-birincil' : '' })).join('')}</div><p class="pm-kucuk">Örnek veri setini yüklemek çalışmadaki veriyi değiştirir; senaryolar ve değişiklik izi kalır.</p>
  <div class="pm-dugmeler">${dugme('Veriyi kopyala (JSON)', 'disari', { simge: 'download', kucuk: true })}${dugme('İçe aktar', 'iceri-ac', { simge: 'upload', kucuk: true, yetki: 'veri.yaz' })}${dugme('Denemeyi sıfırla', 'sifirla', { simge: 'rotate', kucuk: true, tehlike: true, yetki: 'veri.yaz' })}</div></div>`;
  return `<div class="pm-iki">${kart('Ayarlar', ayar)}${kart('Amaç sırası', amac)}</div><div class="pm-iki pm-iki-esit">${kart('Çözücüler', cozuculer)}${kart('Veri seti', veri)}</div>${kart('Kısıt kataloğu', katalog + '<p class="pm-kucuk">Tek kısıt hattı: her kısıt bir kez tanımlanır; hangi çözücü ne kadarını kullanıyor burada yazılıdır. Hakem (motor) hepsini tam uygular.</p>')}`;
}

/* ---------- Değişiklik izi ---------- */
function sIz() {
  const kimler = [...new Set(S.iz.map(x => x.kim))];
  const l = S.iz.filter(x => !U.izKim || x.kim === U.izKim).slice(0, 200);
  return `<div class="pm-sira"><select class="tc-alan-kutu" style="width:auto" data-chg="iz-kim" aria-label="Kişi"><option value="">Herkes</option>${kimler.map(k => `<option ${U.izKim === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><span class="pm-alt">${S.iz.length} kayıt. Bu denemede iz tarayıcıda tutulur; uygulamada denetim kaydına yazılır.</span></div>
  ${kart('Değişiklik izi', `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Zaman</th><th>Kişi</th><th>Rol</th><th>Sayfa</th><th>İşlem</th><th>Ayrıntı</th></tr></thead><tbody>${l.map(x => `<tr>${td('Zaman', `<span class="mono">${zamanYaz(x.t)}</span>`, 'tc-tablo-kirilmaz')}${td('Kişi', esc(x.kim))}${td('Rol', esc(x.rol))}${td('Sayfa', esc(x.sayfa))}${td('İşlem', `<b>${esc(x.ne)}</b>`)}${td('Ayrıntı', `<span class="pm-kucuk">${esc(x.ayrinti)}</span>`)}</tr>`).join('') || '<tr><td colspan="6" class="tc-tablo-yok">Kayıt yok.</td></tr>'}</tbody></table></div>`)}`;
}

/* ---------- katman: pencere, çekmece, onay ---------- */
function katmanCiz() {
  let h = '';
  const p = U.pencere;
  if (p) {
    let d = p;
    if (p.tur === 'op') d = opPaneli(p.id) || { baslik: 'İş', govde: '<p class="pm-alt">Bu iş artık planda yok.</p>', alt: dugme('Kapat', 'pencere-kapat'), yan: true };
    h += `<div class="tc-perde" data-act="perde"><div class="tc-pencere${d.yan ? ' tc-pencere-yan' : ''}" role="dialog" aria-modal="true" aria-label="${esc(d.baslik)}"><div class="tc-pencere-ust"><h2 class="tc-pencere-baslik">${d.baslik}</h2><button type="button" class="tc-pencere-kapat" data-act="pencere-kapat" aria-label="Kapat">${ic('x', 'k')}</button></div><div class="tc-pencere-govde">${d.govde}</div>${d.alt ? `<div class="tc-pencere-alt">${d.alt}</div>` : ''}</div></div>`;
  }
  if (U.onay) {
    const o = U.onay;
    h += `<div class="tc-perde" data-act="onay-hayir"><div class="tc-pencere" role="alertdialog" aria-modal="true" aria-label="${esc(o.baslik)}"><div class="tc-pencere-ust"><h2 class="tc-pencere-baslik">${esc(o.baslik)}</h2></div><div class="tc-pencere-govde"><p class="tc-pencere-ileti">${esc(o.metin)}</p></div><div class="tc-pencere-alt"><button type="button" class="tc-dugme" data-act="onay-hayir">Vazgeç</button><button type="button" class="tc-dugme ${o.tehlike ? 'tc-dugme-tehlike' : 'tc-dugme-birincil'}" data-act="onay-evet">${esc(o.evet || 'Evet')}</button></div></div></div>`;
  }
  const odak = katman.innerHTML === '' && h !== '';
  katman.innerHTML = h;
  if (odak) { const el = katman.querySelector('.tc-pencere input:not([readonly]), .tc-pencere select, .tc-pencere textarea, .tc-pencere button'); if (el) el.focus({ preventScroll: true }); }
}
function onayla(baslik, metin, fn, o = {}) { U.onay = { baslik, metin, fn, ...o }; katmanCiz(); }
function formPenceresi(tur, x) {
  const T = TANIM[tur];
  U.pencere = { baslik: `${x ? esc(T.ad) + ' · ' + esc(T.kimlik ? x[T.kimlik] : '') : 'Yeni ' + esc(T.ad.toLowerCase())}`, govde: formHtml(tur, x), alt: yetkili('veri.yaz') ? `<button type="button" class="tc-dugme" data-act="pencere-kapat">Vazgeç</button><button type="button" class="tc-dugme tc-dugme-birincil" data-act="form-gonder">${ic('check', 'k')}Kaydet</button>` : `<span class="pm-alt">Yalnız okuma yetkiniz var.</span>${dugme('Kapat', 'pencere-kapat')}`, yan: true };
  katmanCiz();
  if (!yetkili('veri.yaz')) katman.querySelectorAll('.tc-pencere input, .tc-pencere select').forEach(i => i.disabled = true);
}

/* ---------- çözüm ---------- */
const ISCI_KODU = `
self.onmessage = e => {
  const { st, ms, ref } = e.data; const t0 = Date.now();
  try {
    const cx = compile(st);
    const p0 = schedule(st, 'dagit', null, { cx });
    const e0 = evaluate(p0, st, null, true);
    const lb = lowerBound(st, cx).wT;
    self.postMessage({ t: 'ilerleme', sn: 0, wT: e0.wT, late: e0.late, n: e0.n, lb, ilk: e0.wT });
    let cur = p0, E = e0, seed = 17, durgun = 0;
    while (Date.now() - t0 < ms && durgun < 4) {
      const kal = ms - (Date.now() - t0);
      const L = lns(st, cur, null, { ms: Math.max(250, Math.min(1500, kal)), seed: seed++, free: true });
      if (cmpEv(L.e, E) > 0) { cur = L.plan; E = L.e; durgun = 0; } else durgun++;
      self.postMessage({ t: 'ilerleme', sn: (Date.now() - t0) / 1000, wT: E.wT, late: E.late, n: E.n, lb, ilk: e0.wT });
    }
    const ef = evaluate(cur, st, ref ? { ops: ref } : null, false);
    const ops = {};
    for (const id in cur.ops) { const r = cur.ops[id]; ops[id] = { id, job: r.job, m: r.m, S: r.S, Su: r.Su, C: r.C, su: r.su, run: r.run, fas: r.fas ? 1 : 0, why: r.why || null, sl: r.sl, famHit: !!r.famHit }; }
    const J = {}; for (const k in ef.J) { const x = ef.J[k]; J[k] = { C: isFinite(x.C) ? x.C : null, T: x.T }; }
    const util = {}; for (const m in ef.util) util[m] = ef.util[m];
    self.postMessage({ t: 'bitti', ops, fail: cur.fail || [], ozet: { wT: ef.wT, onT: ef.onT, late: ef.late, n: ef.n, suH: ef.suH, suN: ef.suN, famN: ef.famN, Cmax: ef.Cmax, tl: ef.tl, chg: ref ? ef.chg : null }, J, util, warn: ef.warn.slice(0, 300), lb, ilk: e0.wT, sn: (Date.now() - t0) / 1000 });
  } catch (err) { self.postMessage({ t: 'hata', msg: String(err && err.message || err) }); }
};`;
function coz() {
  if (!yetkili('plan.yaz')) { bildir('Yetkiniz yok (plan.yaz).', 'hata'); return; }
  if (calisan) return;
  const bul = denetimBulgulari().filter(b => ['personel', 'tezgah', 'hata'].includes(b.k));
  const src = document.getElementById('motor').textContent + '\n' + ISCI_KODU;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  let w;
  try { w = new Worker(url); } catch (e) { bildir('Motor başlatılamadı: ' + e.message, 'hata'); return; }
  calisan = w;
  const st = stOf();
  const canli = S.senaryolar.find(s => s.id === S.canli);
  const ref = canli && canli.plan ? canli.plan.ops : null;
  const dv = S.dataVer;
  U.ilerleme = { sn: 0, wT: null, late: 0, n: S.D.siparisler.length, lb: null, ilk: null };
  render();
  if (bul.length) bildir(`Veri denetiminde ${bul.length} ciddi bulgu var; bazı işler yerleşmeyebilir.`, 'hata', { metin: 'Denetim', act: 'git-denetim' });
  w.onmessage = e => {
    const m = e.data;
    if (m.t === 'ilerleme') { U.ilerleme = m; const el = document.querySelector('.pm-ilerleme'); if (el) el.outerHTML = ilerlemeHtml(); else render(); return; }
    w.terminate(); URL.revokeObjectURL(url); calisan = null; U.ilerleme = null;
    if (m.t === 'hata') { render(); bildir('Çözüm hatası: ' + m.msg, 'hata'); return; }
    const k = kim();
    S.plan = { ops: m.ops, fail: m.fail, ozet: m.ozet, J: m.J, util: m.util, warn: m.warn, lb: m.lb, ilk: m.ilk, sn: m.sn, dataVer: dv, kim: k.ad, zaman: Date.now() };
    if (dv !== S.dataVer) S.plan.dataVer = -1;
    iz('Plan çözüldü', `gecikme ${sayi(m.ozet.wT, 1)} sa, geciken ${m.ozet.late}/${m.ozet.n}, ${sayi(m.sn, 1)} sn`);
    kaydet(); render();
    bildir(`Plan hazır: ağırlıklı gecikme ${saat(m.ozet.wT)} (ilk plan ${saat(m.ilk)}).`, 'tamam');
  };
  w.onerror = e => { w.terminate(); calisan = null; U.ilerleme = null; render(); bildir('Motor hatası: ' + (e.message || 'bilinmiyor'), 'hata'); };
  w.postMessage({ st: { ...st }, ms: (+S.w.sure || 10) * 1000, ref });
}

/* ---------- olaylar ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (U.menu && !e.target.closest('.pm-hesap')) { U.menu = false; if (!el || el.dataset.act !== 'menu') render(); }
  if (!el) return;
  const act = el.dataset.act, v = el.dataset.v;
  if (act === 'perde' && e.target !== el) return;
  if (act === 'onay-hayir' && e.target !== el && !e.target.closest('button')) return;
  if (el.tagName === 'A') e.preventDefault();
  eylem(act, v, el, e);
});
function eylem(act, v, el, e) {
  switch (act) {
    case 'yok': return;
    case 'git': U.sayfa = v; U.tum = false; U.pencere = null; U.gKoru = false; render(); { const i = document.getElementById('icerik'); if (i) i.scrollTop = 0; } return;
    case 'git-denetim': return eylem('git', 'denetim');
    case 'tum': U.tum = true; render(); return;
    case 'tum-kapat': U.tum = false; render(); return;
    case 'menu': U.menu = !U.menu; render(); return;
    case 'kullanici': { S.kullanici = v; U.menu = false; U.pencere = null; iz('Oturum değişti', kim().ad + ' olarak'); kaydet(); render(); bildir(`${kim().ad} (${ROL_AD[kim().rol]}) olarak devam ediyorsunuz.`); return; }
    case 'tema': document.documentElement.setAttribute('data-theme', temaKoyu() ? 'light' : 'dark'); try { localStorage.setItem(ANAHTAR + '-tema', document.documentElement.getAttribute('data-theme')); } catch (x) { /* yok */ } render(); return;
    case 'coz': return coz();
    case 'durdur': if (calisan) { calisan.terminate(); calisan = null; U.ilerleme = null; render(); bildir('Çözüm durduruldu; önceki plan duruyor.'); } return;
    case 'bildirim-kapat': el.closest('.tc-bildirim').remove(); return;
    case 'geri-al': {
      const s = geriAl.pop(); if (!s) { bildir('Geri alınacak değişiklik yok.'); return; }
      const x = JSON.parse(s); Object.assign(S, { D: x.D, down: x.down, ekMesai: x.ekMesai, locks: x.locks, pref: x.pref, w: x.w }); S.dataVer = Math.max(S.dataVer + 1, x.dataVer + 1);
      if (S.plan && S.plan.dataVer === x.dataVer) S.plan.dataVer = S.dataVer;
      iz('Geri alındı', ''); kaydet(); el.closest('.tc-bildirim') && el.closest('.tc-bildirim').remove(); render(); bildir('Son değişiklik geri alındı.', 'tamam'); return;
    }
    case 'zoom': U.zoom = +v; U.gKoru = false; render(); return;
    case 'simdiye': { const g = document.querySelector('.pm-gantt'); if (g) g.scrollTo({ left: Math.max(0, 7 * U.zoom - 60), behavior: 'smooth' }); return; }
    case 'op': U.secili = v; U.pencere = { tur: 'op', id: v }; if (U.sayfa === 'cizelge') { document.querySelectorAll('.pm-is').forEach(b => { const job = S.plan.ops[v] && S.plan.ops[v].job; b.toggleAttribute('data-soluk', b.dataset.job !== job); b.toggleAttribute('data-secili', b.dataset.v === v); }); } katmanCiz(); return;
    case 'siparis-cizelge': { const ilk = Object.values(S.plan ? S.plan.ops : {}).filter(r => r.job === v).sort((a, b) => a.S - b.S)[0]; U.sayfa = 'cizelge'; U.grup = ''; U.yalnizGec = false; U.secili = ilk ? ilk.id : null; U.gKoru = false; render(); if (ilk) { const g = document.querySelector('.pm-gantt'); if (g) g.scrollLeft = Math.max(0, ilk.S * U.zoom - 80); } return; }
    case 'pencere-kapat': case 'perde': U.pencere = null; katmanCiz(); return;
    case 'onay-hayir': U.onay = null; katmanCiz(); return;
    case 'onay-evet': { const f = U.onay && U.onay.fn; U.onay = null; katmanCiz(); if (f) f(); return; }
    case 'kilitle': { const r = S.plan.ops[v]; degistir('İş kilitlendi', `${v} → ${r.m} ${fmtDT(S.D, r.S)}`, () => { S.locks[v] = { m: r.m, S: r.S }; }, 'plan.kilitle'); return; }
    case 'kilit-ac': degistir('Kilit açıldı', v, () => { delete S.locks[v]; }, 'plan.kilitle'); return;
    case 'tercih': degistir('Tezgâh tercihi', `${v} → ${el.dataset.m}`, () => { S.pref[v] = el.dataset.m; }, 'plan.yaz'); return;
    case 'tercih-kaldir': degistir('Tezgâh tercihi kaldırıldı', v, () => { delete S.pref[v]; }, 'plan.yaz'); return;
    case 'sip-filtre': U.sipFiltre = v; render(); return;
    case 'yeni': formPenceresi(el.dataset.tur, null); return;
    case 'duzenle': if (e && e.target.closest('button,input,select')) return; formPenceresi(el.dataset.tur, bul(el.dataset.tur, v)); return;
    case 'sil': {
      const tur = el.dataset.tur, T = TANIM[tur], x = bul(tur, v); if (!x) return;
      const engel = T.silKontrol(x); if (engel) { bildir(engel, 'hata'); return; }
      onayla(`${T.ad} silinsin mi?`, `${T.kimlik ? x[T.kimlik] : ''} ${x.ad || ''} silinecek. Geri al ile döndürebilirsiniz.`, () => degistir(`${T.ad} silindi`, T.kimlik ? x[T.kimlik] : JSON.stringify(x).slice(0, 80), () => { const l = T.al(); l.splice(l.indexOf(x), 1); if (tur === 'personel') S.D.devamsizlik = (S.D.devamsizlik || []).filter(d => d.personel !== x.id); }), { evet: 'Sil', tehlike: true });
      return;
    }
    case 'form-gonder': { const f = katman.querySelector('form[data-form]'); if (f) f.requestSubmit(); return; }
    case 'satir-ekle': { const kap = el.parentElement; const t = kap.querySelector('template[data-sablon]'); const l = kap.querySelector('.pm-satirlar'); l.insertAdjacentHTML('beforeend', t.innerHTML); const s = l.lastElementChild.querySelector('select,input'); if (s) s.focus(); return; }
    case 'satir-sil': el.closest('[data-satir]').remove(); return;
    case 'urun': U.urun = v; render(); return;
    case 'urun-yeni': U.pencere = { baslik: 'Yeni ürün', govde: `<form class="tc-form" data-form="urun" novalidate><label class="tc-alan"><span class="tc-alan-etiket">Ürün kodu <span class="tc-alan-zorunlu">*</span></span><input class="tc-alan-kutu" name="id" placeholder="Ör. U-YENI"></label><label class="tc-alan"><span class="tc-alan-etiket">Ad <span class="tc-alan-zorunlu">*</span></span><input class="tc-alan-kutu" name="ad"></label><label class="tc-alan tc-form-tam"><span class="tc-alan-etiket">Rotayı kopyala</span><select class="tc-alan-kutu" name="kopya"><option value="">Boş rota</option>${S.D.urunler.map(u => `<option value="${esc(u.id)}">${esc(u.id)} · ${esc(u.ad)}</option>`).join('')}</select></label><p class="pm-form-hata tc-form-tam" data-hata hidden></p></form>`, alt: `<button type="button" class="tc-dugme" data-act="pencere-kapat">Vazgeç</button><button type="button" class="tc-dugme tc-dugme-birincil" data-act="form-gonder">${ic('check', 'k')}Oluştur</button>`, yan: true }; katmanCiz(); return;
    case 'urun-sil': { const u = S.D.urunler.find(x => x.id === U.urun); if (!u) return; const n = S.D.siparisler.filter(s => s.urun === u.id).length; if (n) { bildir(`${n} sipariş bu ürünü kullanıyor; önce siparişleri değiştirin.`, 'hata'); return; } onayla('Ürün silinsin mi?', `${u.id} ve rotası silinecek.`, () => degistir('Ürün silindi', u.id, () => { S.D.urunler.splice(S.D.urunler.indexOf(u), 1); U.urun = null; }), { evet: 'Sil', tehlike: true }); return; }
    case 'adim': case 'adim-yeni': { const u = S.D.urunler.find(x => x.id === U.urun); if (!u) return; const o = act === 'adim' ? u.rota.find(x => x.k === v) : null; U.pencere = { baslik: o ? `${esc(u.id)} · adım ${esc(o.k)}` : `${esc(u.id)} · yeni adım`, govde: adimFormu(u, o), alt: yetkili('veri.yaz') ? `<button type="button" class="tc-dugme" data-act="pencere-kapat">Vazgeç</button><button type="button" class="tc-dugme tc-dugme-birincil" data-act="form-gonder">${ic('check', 'k')}Kaydet</button>` : dugme('Kapat', 'pencere-kapat'), yan: true }; katmanCiz(); if (!yetkili('veri.yaz')) katman.querySelectorAll('.tc-pencere input, .tc-pencere select').forEach(i => i.disabled = true); return; }
    case 'adim-sil': { const u = S.D.urunler.find(x => x.id === U.urun); const o = u && u.rota.find(x => x.k === v); if (!o) return; onayla('Adım silinsin mi?', `${u.id} rotasından ${o.k} ${o.ad} silinecek; bu adıma bağlı öncüller kaldırılır.`, () => degistir('Rota adımı silindi', `${u.id} ${o.k}`, () => { u.rota.splice(u.rota.indexOf(o), 1); for (const x of u.rota) x.bag = (x.bag || []).filter(([k]) => k !== o.k); }), { evet: 'Sil', tehlike: true }); return; }
    case 'tatil-ekle': { const i = document.querySelector('[data-tatil-gir]'); const t = i && i.value; if (!t) { bildir('Tarih seçin.', 'hata'); return; } if ((S.D.tatiller || []).includes(t)) { bildir('Bu gün zaten tatil.'); return; } degistir('Tatil eklendi', t, () => { (S.D.tatiller = S.D.tatiller || []).push(t); S.D.tatiller.sort(); }); return; }
    case 'tatil-sil': degistir('Tatil silindi', v, () => { S.D.tatiller = S.D.tatiller.filter(t => t !== v); }); return;
    case 'ariza-sil': { const d = S.down[+v]; degistir('Arıza/bakım silindi', `${d.m} ${fmtDT(S.D, d.from)}`, () => { S.down.splice(+v, 1); }); return; }
    case 'mesai-sil': degistir('Ek mesai silindi', '', () => { S.ekMesai.splice(+v, 1); }); return;
    case 'devam-sil': degistir('Devamsızlık silindi', '', () => { S.D.devamsizlik.splice(+v, 1); }); return;
    case 'sen-ac': { const s = S.senaryolar.find(x => x.id === v); if (!s) return; const ac = () => { geriAl.length = 0; Object.assign(S, { D: clone(s.D), down: clone(s.down || []), ekMesai: clone(s.ekMesai || []), locks: clone(s.locks || {}), pref: clone(s.pref || {}), w: { ...S.w, ...(s.w || {}) } }); S.dataVer++; S.plan = clone(s.plan); S.plan.dataVer = S.dataVer; iz('Senaryo açıldı', s.ad); kaydet(); U.sayfa = 'pano'; render(); bildir(`"${s.ad}" çalışmaya yüklendi.`, 'tamam'); }; if (S.plan && !S.senaryolar.some(x => x.plan && x.plan.zaman === S.plan.zaman)) onayla('Çalışma değişsin mi?', 'Kaydedilmemiş çalışmanın yerine bu senaryo yüklenecek.', ac, { evet: 'Yükle' }); else ac(); return; }
    case 'sen-canli': {
      const s = S.senaryolar.find(x => x.id === v); if (!s || !yetkili('plan.canliya-al')) return;
      const al = () => { S.canli = s.id; S.canliSurum++; s.durum = 'canli'; s.canliKim = kim().ad; s.canliZaman = Date.now(); for (const x of S.senaryolar) if (x.id !== s.id && x.durum === 'canli') x.durum = 'acik'; iz('Senaryo canlıya alındı', `${s.ad} · sürüm ${S.canliSurum}`); kaydet(); render(); bildir(`"${s.ad}" canlı plan oldu (sürüm ${S.canliSurum}).`, 'tamam'); };
      if (S.canli && s.tabanSurum !== S.canliSurum) onayla('Canlı plan bu senaryodan sonra değişti', `Senaryo canlı planın ${s.tabanSurum}. sürümü üstünde kuruldu; canlı şimdi ${S.canliSurum}. sürümde. Yine de alınırsa aradaki canlı değişiklikleri bu senaryoda yok.`, al, { evet: 'Yine de canlıya al' });
      else onayla('Canlıya alınsın mı?', `"${s.ad}" canlı plan olacak; tezgâh kuyrukları bu plana göre görünür.`, al, { evet: 'Canlıya al' });
      return;
    }
    case 'sen-vazgec': { const s = S.senaryolar.find(x => x.id === v); if (!s) return; s.durum = 'vazgecildi'; iz('Senaryodan vazgeçildi', s.ad); kaydet(); render(); return; }
    case 'sen-sil': { const s = S.senaryolar.find(x => x.id === v); if (!s) return; onayla('Senaryo silinsin mi?', `"${s.ad}" silinecek.`, () => { S.senaryolar = S.senaryolar.filter(x => x.id !== v); U.karsilastir = U.karsilastir.filter(x => x !== v); iz('Senaryo silindi', s.ad); kaydet(); render(); }, { evet: 'Sil', tehlike: true }); return; }
    case 'set-yukle': onayla('Örnek veri yüklensin mi?', `${VERI[v].veri.meta.ad} çalışmaya yüklenecek; çalışmadaki veri ve plan değişir.`, () => { const k = S.kullanici, sen = S.senaryolar, izL = S.iz, canli = S.canli, cs = S.canliSurum; S = yeniCalisma(v); Object.assign(S, { kullanici: k, senaryolar: sen, iz: izL, canli, canliSurum: cs, tabanSurum: cs }); geriAl.length = 0; iz('Örnek veri yüklendi', VERI[v].veri.meta.ad); kaydet(); U.sayfa = 'pano'; render(); }, { evet: 'Yükle' }); return;
    case 'disari': { const metin = JSON.stringify({ veri: S.D, ariza: S.down, ekMesai: S.ekMesai }, null, 1); const ok = () => bildir('Veri panoya kopyalandı.', 'tamam'); try { navigator.clipboard.writeText(metin).then(ok, () => metinGoster(metin)); } catch (x) { metinGoster(metin); } return; }
    case 'iceri-ac': U.pencere = { baslik: 'Veri içe aktar', govde: `<form data-form="iceri" novalidate class="pm-dik"><label class="tc-alan"><span class="tc-alan-etiket">JSON (Veriyi kopyala ile alınan biçim)</span><textarea class="tc-alan-kutu" name="json" rows="12"></textarea></label><p class="pm-kucuk">Yalnız uydurma veri yapıştırın. Gerçek müşteri, parça ya da kişi adı girmeyin.</p><p class="pm-form-hata" data-hata hidden></p></form>`, alt: `<button type="button" class="tc-dugme" data-act="pencere-kapat">Vazgeç</button><button type="button" class="tc-dugme tc-dugme-birincil" data-act="form-gonder">İçe aktar</button>`, yan: true }; katmanCiz(); return;
    case 'sifirla': onayla('Deneme sıfırlansın mı?', 'Bu tarayıcıdaki veri, senaryolar ve değişiklik izi silinir; orta boy örnek veri yüklenir.', () => { const k = S.kullanici; S = yeniCalisma('orta'); S.kullanici = k; geriAl.length = 0; iz('Deneme sıfırlandı', ''); kaydet(); U.sayfa = 'pano'; render(); }, { evet: 'Sıfırla', tehlike: true }); return;
  }
}
function metinGoster(metin) { U.pencere = { baslik: 'Veri (JSON)', govde: `<textarea class="tc-alan-kutu" rows="16" readonly style="width:100%">${esc(metin)}</textarea><p class="pm-kucuk">Pano erişimi kapalı; metni seçip kopyalayın.</p>`, alt: dugme('Kapat', 'pencere-kapat'), yan: true }; katmanCiz(); const t = katman.querySelector('textarea'); if (t) t.select(); }

document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]'); if (!el) return;
  const c = el.dataset.chg;
  if (c === 'sure') { S.w.sure = +el.value; kaydet(); return; }
  if (c === 'grup') { U.grup = el.value; U.gKoru = false; render(); return; }
  if (c === 'yalniz-gec') { U.yalnizGec = el.checked; render(); return; }
  if (c === 'kuyruk-m') { U.kuyrukM = el.value; render(); return; }
  if (c === 'iz-kim') { U.izKim = el.value; render(); return; }
  if (c === 'karsilastir') { const v = el.dataset.v; U.karsilastir = el.checked ? [...U.karsilastir.filter(x => x !== v), v].slice(-3) : U.karsilastir.filter(x => x !== v); render(); return; }
  if (c === 'adim-tur') { const f = el.closest('form'); const fas = f.querySelector('[name="tur"]:checked').value === 'fason'; f.querySelector('[data-bolum="tezgah"]').hidden = fas; f.querySelector('[data-bolum="fason"]').hidden = !fas; return; }
  if (c === 'calisma') { const g = el.dataset.g, v = el.dataset.v, on = el.checked; degistir('Çalışma günü', `${GUN_AD2[g]} ${v} ${on ? 'açıldı' : 'kapandı'}`, () => { const l = new Set(S.D.calismaGunleri[g] || []); on ? l.add(v) : l.delete(v); S.D.calismaGunleri[g] = S.D.vardiyalar.map(x => x.id).filter(x => l.has(x)); }); return; }
  if (c === 'matris') {
    const a = el.dataset.a, b = el.dataset.b, val = el.value.trim();
    if (val !== '' && !(Number(val) >= 0)) { bildir('Ayar süresi sıfır ya da pozitif dakika olmalı.', 'hata'); render(); return; }
    degistir('Ayar matrisi', `${a} → ${b}: ${val === '' ? 'tam ayar' : val + ' dk'}`, () => { const l = (S.D.ayarMatrisi = S.D.ayarMatrisi || []); const i = l.findIndex(x => x.den === a && x.ye === b); if (val === '') { if (i >= 0) l.splice(i, 1); } else if (i >= 0) l[i].dk = Number(val); else l.push({ den: a, ye: b, dk: Number(val) }); });
    return;
  }
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-inp]'); if (!el) return;
  const q = el.value.trim().toLowerCase();
  if (el.dataset.inp === 'ara-is') {
    let ilk = null;
    document.querySelectorAll('.pm-is').forEach(b => { const hit = !q || b.dataset.job.toLowerCase().includes(q); b.toggleAttribute('data-soluk', !hit); if (hit && q && !ilk) ilk = b; });
    if (ilk) { const g = document.querySelector('.pm-gantt'); const L = parseFloat(ilk.style.left); if (g && (L < g.scrollLeft || L > g.scrollLeft + g.clientWidth - 200)) g.scrollLeft = Math.max(0, L - 80); }
  }
  if (el.dataset.inp === 'ara-satir') document.querySelectorAll('tr[data-ara]').forEach(r => { r.hidden = !!q && !r.dataset.ara.includes(q); });
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const tur = f.dataset.form;
  const hataGoster = h => { const p = f.querySelector('[data-hata]'); if (p) { p.hidden = !h.length; p.textContent = h.join(' '); } else bildir(h.join(' '), 'hata'); };
  if (TANIM[tur]) {
    const T = TANIM[tur]; const { x, hata } = formOku(f, tur);
    const eski = f.dataset.v !== '' ? bul(tur, f.dataset.v) : null;
    if (T.kimlik && x[T.kimlik] && T.al().some(z => z !== eski && String(z[T.kimlik]) === String(x[T.kimlik]))) hata.push(`${x[T.kimlik]} zaten var.`);
    if (tur === 'vardiya' && x.bas && x.bas === x.bit) hata.push('Başlangıç ve bitiş aynı olamaz.');
    if (hata.length) { hataGoster(hata); return; }
    for (const k of Object.keys(x)) if (x[k] === null) delete x[k];
    if (tur === 'tezgah') { if (!x.vardiyalar.length) delete x.vardiyalar; if (!x.isiksiz) delete x.isiksiz; }
    const ok = degistir(eski ? `${T.ad} güncellendi` : `${T.ad} eklendi`, T.kimlik ? x[T.kimlik] : '', () => {
      if (eski) { for (const a of T.alanlar()) if (!(a.k in x)) delete eski[a.k]; Object.assign(eski, x); }
      else { T.al().push(x); if (tur === 'vardiya') for (const g of ['pzt', 'sal', 'car', 'per', 'cum']) (S.D.calismaGunleri[g] = S.D.calismaGunleri[g] || []).push(x.id); }
    });
    if (ok) { U.pencere = null; katmanCiz(); }
    return;
  }
  if (tur === 'urun') {
    const id = f.id.value.trim(), ad = f.ad.value.trim(), kopya = f.kopya.value; const h = [];
    if (!id) h.push('Kod boş olamaz.'); if (!ad) h.push('Ad boş olamaz.'); if (S.D.urunler.some(u => u.id === id)) h.push(`${id} zaten var.`);
    if (h.length) return hataGoster(h);
    const src = S.D.urunler.find(u => u.id === kopya);
    if (degistir('Ürün eklendi', id, () => { S.D.urunler.push({ id, ad, rota: src ? clone(src.rota) : [] }); U.urun = id; })) { U.pencere = null; katmanCiz(); }
    return;
  }
  if (tur === 'adim') {
    const u = S.D.urunler.find(x => x.id === U.urun); const eski = f.dataset.v ? u.rota.find(x => x.k === f.dataset.v) : null; const h = [];
    const k = f.k.value.trim(), ad = f.ad.value.trim(); const fas = f.querySelector('[name="tur"]:checked').value === 'fason';
    if (!k) h.push('Sıra no boş olamaz.'); if (!ad) h.push('Adım adı boş olamaz.'); if (!eski && u.rota.some(x => x.k === k)) h.push(`${k} sıra no zaten var.`);
    const tez = fas ? [] : [...f.querySelectorAll('[data-tezgahlar] [data-satir]')].map(r => ({ id: r.querySelector('[name="tid"]').value, cevrim: parseFloat(r.querySelector('[name="tcevrim"]').value), ayar: parseFloat(r.querySelector('[name="tayar"]').value) || 0 })).filter(t => t.id);
    if (!fas && !tez.length) h.push('En az bir tezgâh seçin.');
    for (const t of tez) if (!(t.cevrim > 0)) h.push(`${t.id} için çevrim süresi girin.`);
    if (new Set(tez.map(t => t.id)).size !== tez.length) h.push('Aynı tezgâh iki kez seçilmiş.');
    if (fas && !f.fason.value) h.push('Fasoncu seçin.');
    const bag = [...f.querySelectorAll('[name="bag"]:checked')].map(i => [i.value, f.querySelector(`[name="bagtip-${CSS.escape(i.value)}"]`).value]);
    const tmp = u.rota.map(x => x === eski ? { ...x, k, bag } : x); if (!eski) tmp.push({ k, bag });
    const dongu = (() => { const g = Object.fromEntries(tmp.map(x => [x.k, (x.bag || []).map(b => b[0])])); const ziy = {}; const dfs = n => { if (ziy[n] === 1) return true; if (ziy[n] === 2) return false; ziy[n] = 1; for (const p of g[n] || []) if (dfs(p)) return true; ziy[n] = 2; return false; }; return tmp.some(x => dfs(x.k)); })();
    if (dongu) h.push('Öncüller döngü oluşturuyor.');
    if (h.length) return hataGoster(h);
    const o = { k, ad, bag, aile: f.aile.value.trim() };
    if (fas) o.fason = f.fason.value; else o.tezgahlar = tez;
    if (f.aparat.value) o.aparat = f.aparat.value; if (f.fai.checked) o.fai = true; if (f.programYok.checked) o.program = false; if (f.fasonIzin.checked) o.fasonIzin = true;
    if (degistir(eski ? 'Rota adımı güncellendi' : 'Rota adımı eklendi', `${u.id} ${k}`, () => { if (eski) u.rota[u.rota.indexOf(eski)] = o; else u.rota.push(o); u.rota.sort((a, b) => (+a.k || 0) - (+b.k || 0)); })) { U.pencere = null; katmanCiz(); }
    return;
  }
  if (tur === 'ariza') {
    const m = f.m.value, a = parseT(S.D, DTgirdi(f.from.value)), b = parseT(S.D, DTgirdi(f.to.value)); const h = [];
    if (a == null || b == null) h.push('Başlangıç ve bitişi girin.'); else if (b <= a) h.push('Bitiş başlangıçtan sonra olmalı.'); else if (a < 0) h.push('Plan başlangıcından önce olamaz.');
    if (h.length) return hataGoster(h);
    degistir('Arıza/bakım eklendi', `${m} ${fmtDT(S.D, a)} → ${fmtDT(S.D, b)}`, () => { S.down.push({ m, from: a, to: b }); S.down.sort((x, y) => x.from - y.from); });
    return;
  }
  if (tur === 'mesai') {
    const g = gunIndeks(f.gun.value); if (!(g >= 0 && g < HDAYS)) return hataGoster(['Gün plan ufku içinde olmalı.']);
    if (S.ekMesai.some(x => x.m === f.m.value && x.gun === g && x.vardiya === f.vardiya.value)) return hataGoster(['Bu ek mesai zaten var.']);
    degistir('Ek mesai eklendi', `${f.m.value} ${f.gun.value} ${f.vardiya.value}`, () => { S.ekMesai.push({ m: f.m.value, gun: g, vardiya: f.vardiya.value }); });
    return;
  }
  if (tur === 'devam') {
    if (!f.gun.value) return bildir('Gün seçin.', 'hata');
    if ((S.D.devamsizlik || []).some(d => d.personel === f.personel.value && d.gun === f.gun.value)) return bildir('Bu kayıt zaten var.');
    degistir('Devamsızlık eklendi', `${f.personel.value} ${f.gun.value}`, () => { (S.D.devamsizlik = S.D.devamsizlik || []).push({ personel: f.personel.value, gun: f.gun.value }); });
    return;
  }
  if (tur === 'cozucu') {
    const d = Number(f.dondurma.value), k = Number(f.famK.value);
    if (!(d >= 0 && d <= 72)) return bildir('Dondurma ufku 0-72 saat.', 'hata');
    if (!(k >= 0 && k <= 1)) return bildir('Katsayı 0 ile 1 arasında.', 'hata');
    degistir('Çözücü ayarları', `süre ${f.sure.value} sn, dondurma ${d} sa, aile ${k}, malzeme ${f.mat.value}`, () => { S.w = { ...S.w, sure: +f.sure.value, dondurma: d, famK: k, mat: f.mat.value }; }, 'plan.yaz');
    return;
  }
  if (tur === 'senaryo-kaydet') {
    const ad = f.ad.value.trim() || `Senaryo ${S.senaryolar.length + 1}`;
    if (!S.plan || !planGuncel()) return bildir('Önce güncel veriyle çözün.', 'hata');
    const s = { id: 's' + Date.now().toString(36), ad, durum: 'acik', yazar: kim().ad, zaman: Date.now(), tabanSurum: S.canliSurum, D: clone(S.D), down: clone(S.down), ekMesai: clone(S.ekMesai), locks: clone(S.locks), pref: clone(S.pref), w: clone(S.w), plan: clone(S.plan), ozet: clone(S.plan.ozet), J: clone(S.plan.J) };
    S.senaryolar.push(s); if (S.senaryolar.length > 8) S.senaryolar.shift();
    iz('Senaryo kaydedildi', ad); kaydet(); render(); bildir(`"${ad}" kaydedildi.`, 'tamam');
    return;
  }
  if (tur === 'iceri') {
    let x; try { x = JSON.parse(f.json.value); } catch (er) { return hataGoster(['JSON okunamadı: ' + er.message]); }
    const D = x.veri || x; const h = [];
    for (const k of ['meta', 'vardiyalar', 'calismaGunleri', 'tezgahlar', 'personel', 'urunler', 'siparisler']) if (!D[k]) h.push(`"${k}" alanı yok.`);
    if (h.length) return hataGoster(h);
    for (const k of ['malzemeler', 'satinalma', 'tedarikciler', 'fasoncular', 'aparatlar', 'ayarMatrisi', 'tatiller', 'devamsizlik']) D[k] = D[k] || [];
    D.ayarlar = D.ayarlar || { tasimaSaat: 0.5, transferOran: 0.25, faiSaat: 2, programSaat: 6 };
    if (degistir('Veri içe aktarıldı', D.meta.ad || '', () => { S.D = D; S.down = x.ariza || []; S.ekMesai = x.ekMesai || []; S.locks = {}; S.pref = {}; })) { U.pencere = null; katmanCiz(); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (U.onay) { U.onay = null; katmanCiz(); } else if (U.pencere) { U.pencere = null; katmanCiz(); } else if (U.menu || U.tum) { U.menu = false; U.tum = false; render(); } }
});
let yenidenBoyut = 0;
window.addEventListener('resize', () => { clearTimeout(yenidenBoyut); yenidenBoyut = setTimeout(() => { if (dar() !== U.dar) { U.dar = dar(); render(); } }, 150); });

/* ---------- açılış ---------- */
(function ac() {
  try { const t = localStorage.getItem(ANAHTAR + '-tema'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { /* yok */ }
  S = yukle() || yeniCalisma('orta');
  try { const u = JSON.parse(localStorage.getItem(ANAHTAR + '-ui') || 'null'); if (u) { U.sayfa = u.sayfa || 'pano'; U.zoom = u.zoom || 10; } } catch (e) { /* yok */ }
  if (location.hash && SAYFA_AD[location.hash.slice(1)]) U.sayfa = location.hash.slice(1);
  if (!S.iz.length) iz('Deneme açıldı', S.D.meta.ad);
  render();
})();

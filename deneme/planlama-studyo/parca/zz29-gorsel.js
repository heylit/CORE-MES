/* ---------- Görsel sayfa: işin kendisi ortada, düzenleme yanda ----------
   Kullanıcı 20.10 13:13: Özet / Veri gir / Tüm ayrıntılar sekmeleri bir şey anlatmıyor; "Görsel ana alan" seçildi. Sayfa üstte tek cümlelik durum,
   ortada çizelge, tıklanan kalem için yanda (dar ekranda alttan çıkan) panel olur. Panel sayfanın kendi sade formlarını o kaleme dolu açar;
   kayıt aynı degistir çağrısıyla yapılır. Asıl sayfa en altta katlı durur. Önce Terminler sayfası. */
const GORSEL = {};
U.gvSec = U.gvSec || {};
const gvYuzde = (t, a, b) => t == null || !isFinite(t) ? null : Math.max(0, Math.min(100, (t - a) / (b - a) * 100));
const gvY = x => x == null ? '' : x.toFixed(2);
/* zaman ekseni: bugünden biraz önce başlar, en geç tarihe kadar; çok uzak tarihler kenarda kalır */
function gvEksen(ts, now) {
  const l = ts.filter(t => t != null && isFinite(t)); const a = Math.max(now - 14 * 24, Math.min(now - 24, ...l.map(t => t - 24)));
  const b = Math.min(now + 120 * 24, Math.max(now + 14 * 24, ...l.map(t => t + 24)));
  const n = 5; const tik = Array.from({ length: n }, (_, i) => a + (b - a) * (i + 0.5) / n);
  return { a, b, tik };
}
const gvEksenHtml = E => `<div class="pm-gv-eksen" aria-hidden="true"><span></span><div class="pm-gv-eksen-iz">${E.tik.map(t => `<span style="--x:${gvY(gvYuzde(t, E.a, E.b))}">${esc(stkGun(t))}</span>`).join('')}</div></div>`;
/* satır: solda ad, sağda iz; çubuk geliş aralığı (kesik: tahmini), bayrak gerekli gün, dikey çizgi bugün */
function gvSatir(id, k, x, E, secili) {
  const a = gvYuzde(x.bas, E.a, E.b), b = gvYuzde(x.son, E.a, E.b), g = gvYuzde(x.ger, E.a, E.b), n = gvYuzde(E.now, E.a, E.b);
  const cubuk = a != null && b != null ? `<span class="pm-gv-cubuk" ${x.tahmini ? 'data-tahmini' : ''}></span>` : `<span class="pm-gv-yok">${esc(x.yok || 'tarih yok')}</span>`;
  const st = [`--n:${gvY(n)}`, a != null && b != null ? `--a:${gvY(a)};--b:${gvY(Math.max(b, a + 0.6))}` : '', g != null ? `--g:${gvY(g)}` : ''].filter(Boolean).join(';');
  return `<button type="button" class="pm-gv-sat" data-act="gv-sec" data-v="${esc(id + '|' + k)}" data-ton="${x.ton}" aria-pressed="${secili}" aria-label="${esc(x.ad + ': ' + x.durum)}">
    <span class="pm-gv-sat-ad"><span class="pm-gv-sat-sm">${ic(x.ton === 'tamam' ? 'check' : x.ton === 'hata' ? 'alert' : 'clock', 'k')}</span><span class="pm-gv-sat-m"><b class="mono">${esc(x.ad)}</b><small>${esc(x.alt)}</small></span></span>
    <span class="pm-gv-iz" style="${st}">${cubuk}${g != null ? `<span class="pm-gv-bayrak">${ic('flag', 'k')}</span>` : ''}</span></button>`;
}
function gvSayfa(id, asil) {
  const G = GORSEL[id]; const d = SADE[id]; const sec = U.gvSec[id] || null;
  let ust = null, cz = '', panel = '';
  try { ust = G.durum(); cz = G.cizelge(sec); }
  catch (e) { console.error(e); cz = `<div class="pm-serit" data-ton="hata">${ic('alert', 'k')}<span class="pm-serit-metin">Çizelge çizilemedi: ${esc(e.message)}</span></div>`; }
  const formAcik = U.sdForm && U.sdForm.sayfa === id; const sonAcik = U.sdSon && U.sdSon.sayfa === id;
  if (sec || formAcik || sonAcik) { try { panel = gvPanel(id, sec); } catch (e) { console.error(e); panel = ''; } }
  const genel = sdFormlar(id).filter(f => !f.gizli);
  const dg = genel.map(f => dugme(f.kisa || f.ad, 'sd-form', { kucuk: true, hayalet: true, simge: f.simge || 'plus', veri: `data-v="${esc(id + ':' + f.id)}"` })).join('');
  let tum = ''; try { tum = asil(); } catch (e) { console.error(e); }
  return `<div class="pm-gv" data-panel="${panel ? 'acik' : 'kapali'}"><header class="pm-gv-ust"><h2>${ic(d.simge || 'list', 'k')}${esc(d.ad || SAYFA_AD[id] || id)}</h2>
    ${ust ? `<p class="pm-gv-durum" data-ton="${ust.ton || ''}" role="status">${ic(ust.simge || 'dash', 'k')}<span>${esc(ust.metin)}</span>${ust.eylem || ''}</p>` : ''}
    ${dg ? `<div class="pm-dugmeler pm-gv-genel">${dg}</div>` : ''}</header>
    <div class="pm-gv-ana"><section class="pm-gv-cz" aria-label="Çizelge">${cz}</section>${panel}</div>
    ${tum ? `<details class="pm-gv-tum" ${(U.gvTum || {})[id] ? 'open' : ''} data-gv-tum="${esc(id)}"><summary>${ic('list', 'k')}Bütün tablolar ve ayrıntılar</summary><div class="pm-gv-tum-ic">${tum}</div></details>` : ''}</div>`;
}
function gvPanel(id, sec) {
  const G = GORSEL[id]; const k = sec ? G.kalem(sec) : null;
  const son = U.sdSon && U.sdSon.sayfa === id ? sdSonKart() : '';
  const f = U.sdForm && U.sdForm.sayfa === id ? sdFormlar(id).find(x => x.id === U.sdForm.id) : null;
  /* panelde kalem zaten seçili: ilk adıma (kalem seçimi) geri dönülmez */
  let form = f ? sdSihirbaz(id, f) : ''; if (f && sec && (U.sdForm.adim || 0) <= 1) form = form.replace(/<button[^>]*data-act="sd-geri"[^>]*>[^]*?<\/button>/, '');
  const bas = k ? `<div class="pm-gv-p-bas"><span class="pm-gv-sat-sm" data-ton="${k.ton}">${ic(k.simge || 'list', 'k')}</span><span class="pm-gv-sat-m"><b class="mono">${esc(k.ad)}</b><small>${esc(k.alt)}</small></span></div>` : f ? `<div class="pm-gv-p-bas"><span class="pm-gv-sat-sm">${ic(f.simge || 'plus', 'k')}</span><span class="pm-gv-sat-m"><b>${esc(f.ad)}</b>${f.ne ? `<small>${esc(f.ne)}</small>` : ''}</span></div>` : '';
  const govde = k ? `<p class="pm-gv-neden" data-ton="${k.ton}"><span class="pm-gv-rozet">${esc(k.durum)}</span>${esc(k.neden)}</p>
    <dl class="pm-gv-dl">${k.bilgi.map(([a, v]) => `<div><dt>${esc(a)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${k.eylem ? `<div class="pm-dugmeler">${k.eylem}</div>` : ''}
    ${!form && k.form ? (sdFormlar(id).some(x => x.id === k.form.id) ? dugme(k.form.ad, 'gv-form', { birincil: true, simge: 'edit', veri: `data-v="${esc(id + '|' + sec)}"` }) : `<p class="pm-kucuk">${ic('lock', 'k')} Bu kalemi değiştirme yetkiniz yok.</p>`) : ''}` : '';
  const teknik = k && k.teknik && k.teknik.length ? `<details class="pm-gv-teknik"><summary>${ic('gear', 'k')}Teknik ayrıntılar</summary><dl class="pm-gv-dl">${k.teknik.map(([a, v]) => `<div><dt>${esc(a)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>` : '';
  return `<aside class="pm-gv-panel" aria-label="Seçilen kalem"><div class="pm-gv-p-ust">${bas}${dugme('', 'gv-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Paneli kapat', veri: `data-v="${esc(id)}"` })}</div>
    ${son}${govde}${form}${teknik}</aside>`;
}
/* kalemin formunu o kaleme dolu, tarih adımında aç */
function gvFormAc(id, sec) {
  const k = GORSEL[id].kalem(sec); if (!k || !k.form) return;
  const f = sdFormlar(id).find(x => x.id === k.form.id); if (!f) return;
  const deg = Object.assign({}, k.form.deg); if (f.ileri) f.ileri(deg, 0);
  U.sdForm = { sayfa: id, id: f.id, adim: Math.min(1, f.adimlar.length), deg }; U.sdSon = null;
}
{ const sh0 = sdSayfa; sdSayfa = function (id, asil) { return GORSEL[id] ? gvSayfa(id, asil) : sh0(id, asil); }; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'gv-sec': { const s = String(v); const i = s.indexOf('|'); const id = s.slice(0, i), k = s.slice(i + 1);
      const ayni = U.gvSec[id] === k; U.gvSec[id] = ayni ? null : k; U.sdSon = null; U.sdForm = null;
      if (!ayni) gvFormAc(id, k); render();
      const p = document.querySelector('.pm-gv-panel'); if (p && p.scrollIntoView && innerWidth >= 1100) p.scrollIntoView({ block: 'nearest' });
      return true; }
    case 'gv-form': { const s = String(v); const i = s.indexOf('|'); gvFormAc(s.slice(0, i), s.slice(i + 1)); render(); return true; }
    case 'gv-kapat': U.gvSec[v] = null; U.sdForm = null; U.sdSon = null; render(); return true;
    case 'sd-form': { const [id] = String(v).split(':'); if (GORSEL[id]) U.gvSec[id] = null; break; }
    case 'sd-vazgec': { const f = U.sdForm; if (f && GORSEL[f.sayfa] && U.gvSec[f.sayfa]) { U.sdForm = null; render(); return true; } break; }
  }
  return te0(act, v, el, e);
}; }
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.gvTum) (U.gvTum = U.gvTum || {})[d.dataset.gvTum] = d.open; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.pm-gv-panel')) { const id = U.sayfa; if (GORSEL[id]) { U.gvSec[id] = null; U.sdForm = null; U.sdSon = null; render(); } } });

/* ---------- Terminler ---------- */
function gvTmKalemler() {
  const v = tmMalzeme(); const f = tmFason(); if (!v && !f) return null; const now = (v || f).now; const out = [];
  for (const r of v ? v.L : []) {
    const [d, ton] = tmDurum(r, now); const termin = r.tm === 'termin'; const po = r.po || {};
    const bas = parseT(S.D, po.verildi); const tahminGelis = r.etkin != null ? r.etkin : r.tg != null ? now + r.tg * r.kat * 24 : null;
    const ted = ((S.D.tedarikciler || []).find(t => t.id === (po.tedarikci || r.tedarikci)) || {}).ad || po.tedarikci || r.tedarikci || '';
    let neden;
    if (r.plan == null) neden = 'Bu alım plandaki bir işe gitmiyor; stoğa girer.';
    else if (r.tm === 'siparis-yok' || r.tm === 'sure-yok') neden = `Plan bu malzemeyi ${stkGun(r.plan)} günü istiyor ama sipariş verilmedi.${r.siparisGun != null ? ` Zamanında gelmesi için en geç ${stkGun(r.siparisGun)} günü sipariş verilmeli.` : ''}${tahminGelis != null ? ` Bugün verilirse ${stkGun(tahminGelis)} gelir.` : ''}`;
    else if (r.tm === 'yok') neden = `Gerekmesine bir haftadan az kaldı ve tedarikçi tarih vermedi, sipariş yok sayıldı. Plan malzemeyi ${stkGun(r.etkin)} varsayıyor; bağlı işler kayabilir.`;
    else if (r.tm === 'tahmini') neden = `Tedarikçi tarih vermedi; plan tedarik süresinden ${stkGun(r.etkin)} gelir varsayıyor. Plan ${stkGun(r.plan)} günü istiyor.`;
    else neden = mpDurum(r, now)[2] || '';
    out.push({ k: 'm:' + stkMalAnah(r), grup: 'mal', ad: r.kod, simge: 'box', alt: `${stkMatAd(r.kod)} · ${stkBirim(r.miktar, r.kod)}`, durum: d, ton: ton === 'pasif' ? 'uyari' : ton,
      bas: r.etkin != null || tahminGelis != null ? Math.max(now - 24, bas ?? now) : null, son: tahminGelis, ger: r.plan, tahmini: !termin, yok: 'sipariş yok', neden,
      bilgi: [['Gerekli', stkGun(r.plan)], [termin ? 'Geliş (tedarikçi)' : 'Geliş (tahmini)', stkGun(tahminGelis)], ['Sipariş gecikmeden en geç', stkGun(r.enGec)], ['Miktar', stkBirim(r.miktar, r.kod)], ['Tedarikçi', ted || '—'], ['Bağlı siparişler', (r.jobs || []).join(', ') || '—']],
      teknik: [['Satın alma satırı', po.no || (r.src == null ? 'henüz yok' : String(r.src))], ['Tedarik süresi', r.tg == null ? '—' : `${sayi(r.tg, 1)} gün × ${sayi(r.kat, 2)}`], ['Muayene', r.mu ? `${sayi(r.mu / 24, 1)} gün` : '—'], ['Sipariş verildi', po.verildi || '—'], ['Durum kodu', r.tm]],
      form: { id: termin ? 'malDegis' : 'mal', ad: termin ? 'Geliş tarihini değiştir' : r.src == null ? 'Sipariş ver ve tarih gir' : 'Tedarikçi tarihini gir', deg: { sat: stkMalAnah(r), t: tahminGelis != null ? mpTarihGir(tahminGelis) : '' } },
      eylem: r.src == null ? dugme('Satın alma planı', 'git', { kucuk: true, hayalet: true, simge: 'box', veri: 'data-v="malzplan"' }) : '' });
  }
  for (const x of f ? f.L : []) {
    const [d, ton] = tmFasonDurum(x); const don = x.T ?? x.r.C;
    const neden = x.T == null ? `Fasoncu dönüş tarihi vermedi; plan fasoncunun süresinden ${stkGun(x.r.C)} döner varsayıyor. Sonraki adım ${stkGun(x.ger)} başlıyor.`
      : d === 'Siparişi geciktirir' ? `Dönüş ${stkGun(don)}; sipariş gecikmeden en geç ${stkGun(x.enGec)} dönmeliydi. Fasoncuyla tarihi öne çekin.`
        : d === 'Plandan geç' ? `Dönüş ${stkGun(don)}, sonraki adım ${stkGun(x.ger)} başlıyor; iş kayar ama sipariş termini tutar.` : `Dönüş ${stkGun(don)}, sonraki adım ${stkGun(x.ger)} başlıyor.`;
    out.push({ k: 'f:' + x.id, grup: 'fas', ad: x.id, simge: 'truck', alt: `${x.f.ad || x.r.m} · ${sayi(x.o.adet, 0)} adet`, durum: d, ton,
      bas: x.r.S, son: don, ger: x.ger, tahmini: x.T == null, neden,
      bilgi: [['Çıkış', stkGun(x.r.S)], [x.T == null ? 'Dönüş (tahmini)' : 'Dönüş (fasoncu)', stkGun(don)], ['Gerekli dönüş', stkGun(x.ger)], ['Sipariş gecikmeden en geç', stkGun(x.enGec)], ['Sipariş', x.r.job]],
      teknik: [['Fasoncu süresi', `${sayi(+(x.f.sureGun) || 1, 1)} gün`], ['Planın tahmini dönüşü', stkGun(x.tahmini)], ['Bir hafta içinde çıkıyor', x.yakin ? 'evet' : 'hayır']],
      form: { id: 'fason', ad: x.T == null ? 'Dönüş tarihini gir' : 'Dönüş tarihini değiştir', deg: { is: x.id } } });
  }
  return { L: out, now };
}
const GV_SIRA = { hata: 0, uyari: 1, tamam: 2 };
GORSEL.terminler = {
  durum() {
    const K = gvTmKalemler(); const yaz = stkYaz();
    if (!S.plan || !K) return { simge: 'play', ton: 'uyari', metin: 'Henüz plan yok; malzemenin ve fasonun ne zaman gerektiği plandan çıkar.', eylem: yaz ? dugme('Planı kur', 'coz', { kucuk: true, birincil: true, simge: 'play', veri: 'data-v="sifir"' }) : '' };
    const m = K.L.filter(x => x.grup === 'mal' && x.tahmini), fz = K.L.filter(x => x.grup === 'fas' && x.tahmini); const hata = K.L.filter(x => x.ton === 'hata');
    const u = stkTmUyari(); let eylem = '';
    if (u && yaz) eylem = dugme(`${u.js.length} işi ileri at`, 'tm-ileri', { kucuk: true, simge: 'next', veri: `data-v="${esc(u.js.join(',') + '|' + u.g)}"` });
    else if (!planGuncel() && yaz) eylem = dugme('Planı iyileştir', 'ekip', { kucuk: true, birincil: true, simge: 'play' });
    if (!m.length && !fz.length && !hata.length) return { simge: 'check', ton: 'tamam', metin: 'Bütün malzeme ve fason işlerinin tarihi var ve zamanında geliyor.', eylem };
    const ilk = K.L.filter(x => x.tahmini || x.ton === 'hata').sort((a, b) => (a.ger ?? 1e12) - (b.ger ?? 1e12))[0];
    const par = [m.length ? `${m.length} malzemenin` : '', fz.length ? `${fz.length} fason işinin` : ''].filter(Boolean);
    const metin = `${par.length ? par.join(' ve ') + ' tarihi yok' : 'Tarihler girildi'}${hata.length ? `, ${hata.length} kalem işi kaydırabilir` : ''}${ilk && ilk.ger != null ? `. İlk gereken ${ilk.ad}, ${stkGun(ilk.ger)}.` : '.'}`;
    return { simge: hata.length ? 'alert' : 'clock', ton: hata.length ? 'hata' : 'uyari', metin, eylem };
  },
  kalem(k) { const K = gvTmKalemler(); return K ? K.L.find(x => x.k === k) || null : null; },
  cizelge(sec) {
    const K = gvTmKalemler(); if (!K) return `<p class="pm-sd-bos">${ic('gantt', 'k')}Plan kurulunca malzeme ve fason kalemleri burada zaman çizelgesinde görünür.</p>`;
    const E = Object.assign(gvEksen(K.L.flatMap(x => [x.bas, x.son, x.ger]), K.now), { now: K.now });
    const sira = (a, b) => GV_SIRA[a.ton] - GV_SIRA[b.ton] || (a.ger ?? 1e12) - (b.ger ?? 1e12);
    const grup = (g, ad, sm) => { const l = K.L.filter(x => x.grup === g).sort(sira); if (!l.length) return '';
      const sor = l.filter(x => x.ton !== 'tamam' || x.k === sec), tam = l.filter(x => x.ton === 'tamam' && x.k !== sec);
      return `<div class="pm-gv-grup"><h3 class="pm-sd-bas">${ic(sm, 'k')}${ad}<small>${sor.length ? `${sor.length} kalem bakılmalı` : 'hepsi zamanında'}</small></h3>
        ${sor.map(x => gvSatir('terminler', x.k, x, E, x.k === sec)).join('')}
        ${tam.length ? `<details class="pm-gv-tamam" ${(U.gvTamam || {})[g] ? 'open' : ''} data-gv-tamam="${g}"><summary>${ic('check', 'k')}Zamanında gelen ${tam.length} kalem</summary>${tam.map(x => gvSatir('terminler', x.k, x, E, false)).join('')}</details>` : ''}</div>`; };
    const lej = `<p class="pm-gv-lejant" aria-hidden="true"><span><i class="pm-gv-l-cubuk"></i>Geliş, tarih girildi</span><span><i class="pm-gv-l-cubuk" data-tahmini></i>Geliş, tahmini</span><span>${ic('flag', 'k')}Plan istiyor</span><span><i class="pm-gv-l-bugun"></i>Bugün</span></p>`;
    return `${lej}${gvEksenHtml(E)}${grup('mal', 'Malzeme', 'box')}${grup('fas', 'Fason', 'truck')}`;
  },
};
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.gvTamam) (U.gvTamam = U.gvTamam || {})[d.dataset.gvTamam] = d.open; }, true);
/* tarihi girilmiş satın almanın tarihini kalemin panelinden değiştirmek: asıl sayfadaki tablo girişiyle aynı kayıt */
{ const f0 = SADE.terminler.formlar; SADE.terminler.formlar = function () {
  return [...f0.call(this), { id: 'malDegis', gizli: true, ad: 'Geliş tarihini değiştir', simge: 'box', yetki: 'veri.yaz',
    alanlar: () => { const v = tmMalzeme(); const L = v ? v.L.filter(r => r.tm === 'termin' && r.src != null) : [];
      return [{ k: 'sat', ad: 'Malzeme', tur: 'secim', zorunlu: 1, secenek: () => L.map(r => [stkMalAnah(r), `${r.kod} · ${stkMatAd(r.kod)}`]) },
        { k: 't', ad: 'Yeni geliş tarihi', tur: 'tarih', zorunlu: 1, ipucu: 'Tedarikçinin yeni söz verdiği gün' }]; },
    adimlar: [{ ad: 'Hangi malzeme', k: ['sat'] }, { ad: 'Geliş tarihi', k: ['t'] }],
    kontrol: (x, i, d) => { if (i !== -1) return null; const r = gvTmMalBul(x.sat || d.sat); if (!r) return 'Bu malzeme listede yok; plan değişmiş olabilir.'; const po = S.D.satinalma[r.src]; return po && String(po.gelis || '').slice(0, 10) === x.t ? 'Hiçbir şey değişmedi.' : null; },
    sonuc: 'satın alma siparişinin geliş tarihi değişir; plan yeni tarihi bir sonraki çözümde kullanır.',
    kaydet: x => { const r = gvTmMalBul(x.sat); const po = r && (S.D.satinalma || [])[r.src]; if (!po) return false; const saat = (String(po.gelis || '').split(' ')[1]) || '08:00'; const yeni = `${x.t} ${saat}`;
      return degistir('Satın alma termini değişti', `${po.kod} ${po.miktar}: ${po.gelis || '—'} → ${yeni}`, () => { po.gelis = yeni; U.mpV = null; }); },
    bitti: x => `${String(x.sat).split(':')[1]} geliş tarihi ${x.t} oldu` }];
}; }
function gvTmMalBul(a) { const v = tmMalzeme(); return v ? v.L.find(r => r.tm === 'termin' && r.src != null && stkMalAnah(r) === a) || null : null; }

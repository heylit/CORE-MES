/* ---------- Kart bölgeleri: kartlar üst üste gelmez ----------
   Her kartın tahtada kendi yeri vardır. Atölye bölgeleri ve öteki kartlar dolu sayılır; yeni açılan kart atölyenin sağındaki
   kart şeridinde ilk boş yere oturur, bırakılan kart başka bir kartın ya da atölyenin üstüne düşerse en yakın boş yere kayar. */
const TK_ARA = 24;
function tkDunyaKutu(c) {
  const el = document.querySelector(`.pm-tk-pano[data-tur="${c.tur}"]`);
  const w = (el ? el.offsetWidth : TK_TUR[c.tur][3]) / TK_KREF, h = (c.kucuk ? 48 : (TK_BOY[c.tur] || 480)) / TK_KREF;
  return { x: c.x, y: c.y, w, h };
}
function tkAtolyeKutu() { const s = atSahne(); return s.bolge.map(b => ({ x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 })); }
const tkCakisir = (a, b, g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
/* c kartı için (x, y)'ye en yakın boş yer; adım tahtada 30 birim */
function tkBosYer(c, x, y) {
  const engel = [...tkAtolyeKutu(), ...(U.tkKart || []).filter(o => o !== c).map(tkDunyaKutu)];
  const k0 = tkDunyaKutu(c); const g = TK_ARA / TK_KREF; const adim = 30;
  const bos = (px, py) => !engel.some(e => tkCakisir({ x: px, y: py, w: k0.w, h: k0.h }, e, g));
  if (bos(x, y)) return [x, y];
  for (let r = 1; r < 140; r++) {
    let en = null, ed = Infinity;
    for (let i = -r; i <= r; i++) for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
      const px = x + dx * adim, py = y + dy * adim; if (!bos(px, py)) continue;
      const d = dx * dx + dy * dy; if (d < ed) { ed = d; en = [px, py]; }
    }
    if (en) return en;
  }
  return [x, y];
}
function tkCozus(c) { [c.x, c.y] = tkBosYer(c, c.x, c.y); }
/* atölyenin sağındaki şeridin başı */
function tkSeritBasi() { const b = tkAtolyeKutu(); return [Math.max(...b.map(e => e.x + e.w)) + TK_ARA / TK_KREF, Math.min(...b.map(e => e.y))]; }
/* kart ekranda değilse kamera kaydırılır; yakınlık değişmez */
function tkGoster(c) {
  if (!AT.kam || !AT.boyut || tkDar()) return; const [W, H] = AT.boyut;
  const ray = document.querySelector('.pm-tk-ray'); const sol = ray ? ray.offsetWidth + 24 : 16; const ust = ((document.querySelector('.pm-at-ust') || {}).offsetHeight || 0) + 48, alt = ((document.querySelector('.pm-at-alt') || {}).offsetHeight || 0) + 8;
  const b = tkDunyaKutu(c); const at = tkAtolyeKutu();
  /* önce atölye ve kart birlikte, kart okunur kalıyorsa; olmazsa yalnız kart */
  const x0 = Math.min(b.x, ...at.map(e => e.x)), x1 = Math.max(b.x + b.w, ...at.map(e => e.x + e.w)), y0 = Math.min(b.y, ...at.map(e => e.y)), y1 = Math.max(...at.map(e => e.y + e.h), b.y + Math.min(b.h, 600 / TK_KREF));
  const kb = Math.min(1.4 * TK_KREF, (W - sol - 24) / (x1 - x0), (H - ust - alt) / (y1 - y0));
  const [sx, sy] = atEk(b.x, b.y); const k0 = AT.kam.k; const gorunur = k0 / TK_KREF >= 0.7 && sx >= sol && sx + b.w * k0 <= W - 8 && sy >= ust - 8 && sy < H - alt - 200;
  if (gorunur) return;
  if (kb / TK_KREF >= 0.62) AT.kam = { x: (x0 + x1) / 2 - (sol - 16) / 2 / kb, y: (y0 + y1) / 2 - (ust - alt) / 2 / kb, k: kb };
  /* kart ekranın sağına yaslanır; solda atölyenin bitişik kısmı görünür kalır */
  else { const k = TK_KREF; AT.kam = { x: b.x + b.w - (W / 2 - 16) / k, y: b.y + (H / 2 - ust) / k, k }; }
  atTetikle();
}
tkAc = function (tur) {
  U.tkKart = U.tkKart || []; let c = U.tkKart.find(k => k.tur === tur);
  if (c) { c.kucuk = false; U.tkKart = [...U.tkKart.filter(k => k !== c), c]; }
  else { const [x, y] = AT.kam ? tkSeritBasi() : [0, 0]; c = { tur, x, y, k: TK_KREF, kucuk: false }; U.tkKart.push(c); }
  tkKaydet(); render();
  if (AT.kam) { tkCozus(c); tkKaydet(); tkKonumla(); requestAnimationFrame(() => { tkGoster(c); tkKonumla(); }); }
};
/* kartları şeritte sütun sütun dizer; sonra atölye ve kartların hepsi ekrana sığar */
tkToparla = function () {
  const l = U.tkKart || []; if (!l.length || !AT.kam) return;
  const [x0, y0] = tkSeritBasi(); const yuk = Math.max(...tkAtolyeKutu().map(e => e.y + e.h)) - y0; const g = TK_ARA / TK_KREF;
  let x = x0, y = y0, kolW = 0;
  for (const c of l) { const b = tkDunyaKutu(c); if (y > y0 && y + b.h > y0 + Math.max(yuk, b.h)) { x += kolW + g; y = y0; kolW = 0; } c.x = x; c.y = y; c.k = TK_KREF; y += b.h + g; kolW = Math.max(kolW, b.w); }
  tkKaydet(); tkSigdirHepsi(); render();
};
function tkSigdirHepsi() {
  if (!AT.boyut) return; const [W, H] = AT.boyut; const kutu = [...tkAtolyeKutu(), ...(U.tkKart || []).map(tkDunyaKutu)];
  const x0 = Math.min(...kutu.map(b => b.x)), x1 = Math.max(...kutu.map(b => b.x + b.w)), y0 = Math.min(...kutu.map(b => b.y)), y1 = Math.max(...kutu.map(b => b.y + b.h));
  const ray = document.querySelector('.pm-tk-ray'); const sol = ray ? ray.offsetWidth + 24 : 0;
  const ust = ((document.querySelector('.pm-at-ust') || {}).offsetHeight || 0) + 40, alt = (document.querySelector('.pm-at-alt') || {}).offsetHeight || 0;
  const k = Math.max(0.15, Math.min(1.5, Math.min((W - sol - 24) / (x1 - x0), (H - ust - alt - 16) / (y1 - y0))));
  AT.kam = { x: (x0 + x1) / 2 - sol / 2 / k, y: (y0 + y1) / 2 - (ust - alt) / 2 / k, k }; atTetikle();
}

/* ---------- Reçete ve Rota tahtada ----------
   Yukarıdan aşağı akar: hammadde, adımlar sırasıyla, en altta bitmiş ürün. Her adımda istasyon, uygun makineler (seçilenler dolu),
   çevrim ve ayar, kısıtlar (aile, aparat, ilk parça onayı, NC programı, fasona verilebilir). Kart açıkken ürünün rotası tahtada yanar:
   seçilen makineler adım numarasıyla işaretlenir, adımlar sırayla çizgiyle bağlanır; üstüne gelinen adım ya da makine öne çıkar.
   Değişiklik veriyi değiştirir; plan yeniden kurulunca etkisi görünür. Reçete deneme verisinde ürün üzerinde tutulur (u.recete). */
const RT_GRUP_AD = { testere: 'Testere', torna: 'Torna', freze: 'Freze', '5eksen': '5 eksen', taslama: 'Taşlama', tesviye: 'Tesviye', yikama: 'Yıkama', olcum: 'Ölçüm' };
function rtUrun() {
  const D = S.D; const sj = typeof mzSecJobEski === 'function' ? mzSecJobEski() : U.secJob; const sp = sj && D.siparisler.find(x => x.id === sj);
  if (!U.rtUrun || !D.urunler.find(u => u.id === U.rtUrun)) U.rtUrun = (sp && sp.urun) || (D.urunler[0] && D.urunler[0].id);
  return D.urunler.find(u => u.id === U.rtUrun);
}
function rtRecete(u) {
  if (!u.recete) { const sp = S.D.siparisler.find(s => s.urun === u.id && s.malzeme && s.malzeme.length); u.recete = sp ? sp.malzeme.map(m => ({ kod: m.kod, miktar: m.miktar, adim: u.rota[0] ? u.rota[0].k : '' })) : []; }
  return u.recete;
}
const rtGruplar = o => [...new Set((o.tezgahlar || []).map(t => (S.D.tezgahlar.find(m => m.id === t.id) || {}).grup).filter(Boolean))];
const rtYer = (o, t) => o.fason ? '@' + o.fason : t;
function rtKart() {
  const D = S.D; const u = rtUrun(); const yaz = yetkili('veri.yaz');
  if (!u) return '<p class="pm-kucuk">Ürün yok.</p>';
  const kul = D.siparisler.filter(s => s.urun === u.id && !s.havuz);
  const sec = `<div class="pm-rt-ust"><label class="pm-mz-sirala"><span>Ürün</span><select class="pm-mz-sec" data-chg="rt-urun">${D.urunler.map(x => `<option value="${esc(x.id)}" ${x.id === u.id ? 'selected' : ''}>${esc(x.id)} · ${esc(x.ad)}</option>`).join('')}</select></label><label class="pm-mz-sirala" title="Partiler bu adedin katı olur; adım kendi değeriyle ezebilir"><span>Kasa</span><input type="number" class="pm-rt-sayi" min="1" step="1" value="${esc(u.kasa || '')}" placeholder="1" data-chg="rt-urun-kasa" aria-label="Ürün kasa adedi" ${yaz ? '' : 'disabled'}></label><small class="pm-kucuk">${kul.length} sipariş kullanıyor</small></div>`;
  const bayat = S.plan && !planGuncel() ? `<p class="pm-mz-bayat">${ic('alert', 'k')}<span>Rota ya da reçete değişti; tahtadaki plan eski.</span>${dugme('Planı yeniden kur', 'coz', { kucuk: true, birincil: true, simge: 'bolt', yetki: 'plan.yaz' })}</p>` : '';
  const rec = rtRecete(u); const dis = yaz ? '' : 'disabled';
  const malz = rec.map((m, i) => { const mm = (D.malzemeler || []).find(x => x.kod === m.kod) || {};
    return `<li class="pm-rt-malz"><select class="pm-mz-sec" data-chg="rt-malz" data-i="${i}" data-f="kod" aria-label="Malzeme" ${dis}>${(D.malzemeler || []).map(x => `<option value="${esc(x.kod)}" ${x.kod === m.kod ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select>
      <input type="number" class="pm-rt-sayi" min="0" step="0.1" value="${esc(m.miktar)}" data-chg="rt-malz" data-i="${i}" data-f="miktar" aria-label="Adet başına miktar" ${dis}><small>${esc(mm.birim || '')}/adet → adım</small>
      <select class="pm-mz-sec pm-rt-dar" data-chg="rt-malz" data-i="${i}" data-f="adim" aria-label="Hangi adıma girer" ${dis}>${u.rota.map(o => `<option value="${esc(o.k)}" ${o.k === m.adim ? 'selected' : ''}>${esc(o.k)}</option>`).join('')}</select>
      ${yaz ? `<button type="button" class="pm-rt-x" data-act="rt-malz-sil" data-v="${i}" title="Malzemeyi çıkar" aria-label="Malzemeyi çıkar">${ic('x', 'k')}</button>` : ''}</li>`; }).join('');
  const ust = `<li class="pm-rt-dugum pm-rt-ham"><header>${ic('box', 'k')}<b>Reçete</b><small>hammadde ve parçalar</small></header>
    <ul class="pm-rt-malzler">${malz || '<li class="pm-kucuk">Reçetede malzeme yok.</li>'}</ul>${yaz ? `<button type="button" class="pm-at-link" data-act="rt-malz-ekle">${ic('plus', 'k')} Malzeme ekle</button>` : ''}</li>`;
  const adimlar = u.rota.map((o, i) => {
    const gr = rtGruplar(o); const secili = new Set((o.tezgahlar || []).map(t => t.id)); const hov = U.rtHov === o.k;
    const aday = o.fason ? [] : D.tezgahlar.filter(m => gr.includes(m.grup) || secili.has(m.id));
    const cips = aday.map(m => { const t = (o.tezgahlar || []).find(x => x.id === m.id); const on = !!t;
      return `<li class="pm-rt-tez" data-rt-m="${esc(m.id)}" ${on ? 'data-on' : ''}><button type="button" class="mono" data-act="rt-tez" data-v="${esc(o.k)}" data-m="${esc(m.id)}" aria-pressed="${on}" ${dis} title="${on ? 'Alternatiften çıkar' : 'Alternatif olarak ekle'}">${esc(m.id)}</button>${on ? `<label><input type="number" class="pm-rt-sayi" min="0" step="0.1" value="${esc(t.cevrim)}" data-chg="rt-sure" data-v="${esc(o.k)}" data-m="${esc(m.id)}" data-f="cevrim" aria-label="${esc(m.id)} çevrim dk" ${dis}><small>dk</small></label><label><input type="number" class="pm-rt-sayi" min="0" step="5" value="${esc(t.ayar)}" data-chg="rt-sure" data-v="${esc(o.k)}" data-m="${esc(m.id)}" data-f="ayar" aria-label="${esc(m.id)} ayar dk" ${dis}><small>ayar</small></label>` : ''}</li>`; }).join('');
    const digerM = o.fason ? [] : D.tezgahlar.filter(m => !aday.includes(m));
    const istasyon = `<select class="pm-mz-sec" data-chg="rt-grup" data-v="${esc(o.k)}" aria-label="İstasyon" ${dis}>${Object.keys(RT_GRUP_AD).filter(g => D.tezgahlar.some(m => m.grup === g)).map(g => `<option value="${g}" ${!o.fason && gr[0] === g ? 'selected' : ''}>${esc(RT_GRUP_AD[g] || g)}</option>`).join('')}${(D.fasoncular || []).map(f => `<option value="@${esc(f.id)}" ${o.fason === f.id ? 'selected' : ''}>Fason · ${esc(f.ad.replace(' (fason)', ''))}</option>`).join('')}${!o.fason && !gr.length ? '<option value="" selected>Seçin</option>' : ''}</select>`;
    const kis = `<div class="pm-rt-kisit">
      <label title="Aynı ailede ayar kısalır (Ayar matrisi)"><small>Aile</small><input class="pm-rt-metin" value="${esc(o.aile || '')}" list="rt-aileler" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="aile" ${dis}></label>
      <label><small>Aparat</small><select class="pm-mz-sec" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="aparat" ${dis}><option value="">Yok</option>${(D.aparatlar || []).map(a => `<option value="${esc(a.id)}" ${o.aparat === a.id ? 'selected' : ''}>${esc(a.ad)}</option>`).join('')}</select></label>
      <label title="Bu adımda bir parti en az bu adet olur; boşsa ayarın iki katı kuralı"><small>En küçük parti</small><input type="number" class="pm-rt-sayi" min="1" step="1" value="${esc(o.minParti || '')}" placeholder="${typeof pqQminOran === 'function' ? pqQminOran(o) : ''}" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="minParti" ${dis}></label>
      <label title="Bu adımda kasa adedi; boşsa ürünün kasası"><small>Kasa</small><input type="number" class="pm-rt-sayi" min="1" step="1" value="${esc(o.kasa || '')}" placeholder="${esc(u.kasa || 1)}" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="kasa" ${dis}></label>
      ${i ? `<label class="pm-rt-onay" title="Geciken iş emrinde motor bu bağı örtüşmeye çevirebilir"><input type="checkbox" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="ortusebilir" ${o.ortusebilir ? 'checked' : ''} ${dis}><span>Örtüşebilir</span></label>` : ''}
      <label class="pm-rt-onay"><input type="checkbox" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="fai" ${o.fai ? 'checked' : ''} ${dis}><span>İlk parça onayı</span></label>
      <label class="pm-rt-onay"><input type="checkbox" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="programYok" ${o.program === false ? 'checked' : ''} ${dis}><span>NC programı hazır değil</span></label>
      ${o.fason ? '' : `<label class="pm-rt-onay"><input type="checkbox" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="fasonIzin" ${o.fasonIzin ? 'checked' : ''} ${dis}><span>Fasona verilebilir</span></label>`}</div>`;
    const uyari = !o.fason && !(o.tezgahlar || []).length ? `<p class="pm-rt-uyari">${ic('alert', 'k')} Makine seçilmedi; bu adım planlanamaz.</p>` : '';
    const ok = i ? (() => { const t = rtTur(u, i); const bk = (o.bag || []).map(b => b[0]); const dogrusal = t === 'x' || bk.join() === rtOnculler(u, i).join();
      return `<li class="pm-rt-ok" data-tip="${t}"><button type="button" data-act="rt-bag" data-v="${esc(o.k)}" ${dis} title="Geçiş türünü değiştir: bitince, örtüşmeli, bağımsız">${ic(t === 'x' ? 'layers' : 'down', 'k')}<span>${RT_TUR_AD[t]}${dogrusal ? (bk.length > 1 ? ' · bekler: ' + esc([...bk].reverse().join(', ')) : '') : ' · öncül: ' + esc(bk.join(', '))}</span></button></li>`; })() : `<li class="pm-rt-ok" aria-hidden="true">${ic('down', 'k')}</li>`;
    return `${ok}<li class="pm-rt-dugum pm-rt-adim" data-rt-k="${esc(o.k)}" ${hov ? 'data-hov' : ''} ${o.fason ? 'data-fason' : ''}>
      <header><b class="mono pm-rt-no">${esc(o.k)}</b><input class="pm-rt-metin pm-rt-ad" value="${esc(o.ad)}" data-chg="rt-alan" data-v="${esc(o.k)}" data-f="ad" aria-label="Adım adı" ${dis}>
        ${yaz ? `<span class="pm-rt-islem"><button type="button" data-act="rt-sira" data-v="${esc(o.k)}" data-y="-1" ${i ? '' : 'disabled'} title="Yukarı" aria-label="Yukarı">${ic('up', 'k')}</button><button type="button" data-act="rt-sira" data-v="${esc(o.k)}" data-y="1" ${i < u.rota.length - 1 ? '' : 'disabled'} title="Aşağı" aria-label="Aşağı">${ic('down', 'k')}</button><button type="button" data-act="rt-sil" data-v="${esc(o.k)}" title="Adımı sil" aria-label="Adımı sil">${ic('trash', 'k')}</button></span>` : ''}</header>
      <div class="pm-rt-sat"><small>İstasyon</small>${istasyon}</div>
      ${o.fason ? `<p class="pm-kucuk">${ic('truck', 'k')} Dış tedarikçide; kapasite ve çıkış günleri Fason sayfasında.</p>` : `<ul class="pm-rt-tezler" aria-label="Makineler">${cips}${yaz && digerM.length ? `<li><select class="pm-mz-sec pm-rt-dar" data-chg="rt-tez-ekle" data-v="${esc(o.k)}" aria-label="Başka istasyondan makine ekle"><option value="">+ başka</option>${digerM.map(m => `<option value="${esc(m.id)}">${esc(m.id)} · ${esc(RT_GRUP_AD[m.grup] || m.grup)}</option>`).join('')}</select></li>` : ''}</ul>`}
      ${uyari}${kis}</li>`;
  }).join('');
  const son = `<li class="pm-rt-ok" aria-hidden="true">${ic('down', 'k')}</li><li class="pm-rt-dugum pm-rt-bitmis"><header>${ic('check', 'k')}<b>${esc(u.ad)}</b><small>bitmiş ürün</small></header></li>`;
  const aileler = [...new Set(D.urunler.flatMap(z => z.rota.map(x => x.aile)).filter(Boolean))];
  return `${sec}${bayat}<ol class="pm-rt-akis" aria-label="${esc(u.ad)} reçete ve rotası">${ust}${adimlar}${yaz ? `<li class="pm-rt-ekle"><button type="button" class="tc-dugme tc-dugme-kucuk" data-act="rt-ekle">${ic('plus', 'k')}<span>Adım ekle</span></button></li>` : ''}${son}</ol>
    <datalist id="rt-aileler">${aileler.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <p class="pm-kucuk">Dolu makine adımın alternatifidir; motor en uygununu seçer. Kart açıkken bu ürünün rotası tahtada yanar. Reçete bu deneme verisinde siparişlerin malzeme ihtiyacına da yazılır.</p>`;
}
/* rota değişiklikleri: sıra numarası korunur, doğrusal öncül yeniden kurulur */
function rtDegis(ne, ayr, fn) { const u = rtUrun(); if (!u) return; degistir(ne, `${u.id} · ${ayr}`, () => fn(u), 'veri.yaz'); }
/* geçiş türü: b bitince, o örtüşmeli, x bağımsız. Bağımsız adımın öncülü yoktur, bir önceki adımla aynı anda çalışabilir;
   ardından gelen adım hem onu hem de onun yanında koşan adımları bekler, yani kollar orada birleşir. */
const RT_TUR_AD = { b: 'bitince başlar', o: 'örtüşmeli: ilk parti bitince başlar', x: 'bağımsız: öncekini beklemez' };
function rtTur(u, i) { const o = u.rota[i]; if (!i) return 'b'; if (o.gecis) return o.gecis; if (!(o.bag || []).length) return 'x'; return o.bag.some(([, x]) => x === 'o') ? 'o' : 'b'; }
function rtOnculler(u, i) { const ks = []; let j = i - 1; ks.push(u.rota[j].k); while (j > 0 && rtTur(u, j) === 'x') { j--; ks.push(u.rota[j].k); } return ks; }
function rtDogrusal(u) { const tur = u.rota.map((o, i) => rtTur(u, i));
  u.rota.forEach((o, i) => { if (!i) { delete o.gecis; o.bag = []; return; } o.gecis = tur[i]; });
  u.rota.forEach((o, i) => { if (i && tur[i] !== 'x') o.bag = rtOnculler(u, i).map(k => [k, tur[i]]); else o.bag = []; }); }
function rtReceteYaz(u) { for (const s of S.D.siparisler) if (s.urun === u.id) s.malzeme = u.recete.map(m => ({ kod: m.kod, miktar: +m.miktar || 0 })); }
const rtOp = (u, k) => u.rota.find(o => o.k === k);
const rtTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  const d = el && el.dataset || {};
  switch (act) {
    case 'rt-tez': rtDegis('Rota değişti', `${v}: ${d.m}`, u => { const o = rtOp(u, v); const i = o.tezgahlar.findIndex(t => t.id === d.m);
      if (i >= 0) o.tezgahlar.splice(i, 1); else { const ilk = o.tezgahlar[0] || { cevrim: 5, ayar: 30 }; o.tezgahlar.push({ id: d.m, cevrim: ilk.cevrim, ayar: ilk.ayar }); } }); return true;
    case 'rt-bag': rtDegis('Rota değişti', `${v}: geçiş türü`, u => { const o = rtOp(u, v); const i = u.rota.indexOf(o); if (!i) return false; rtDogrusal(u); o.gecis = { b: 'o', o: 'x', x: 'b' }[rtTur(u, i)]; rtDogrusal(u); }); return true;
    case 'rt-sira': rtDegis('Rota sırası değişti', `${v} ${+d.y < 0 ? 'yukarı' : 'aşağı'}`, u => { const i = u.rota.findIndex(o => o.k === v); const j = i + +d.y; if (j < 0 || j >= u.rota.length) return false; [u.rota[i], u.rota[j]] = [u.rota[j], u.rota[i]]; rtDogrusal(u); }); return true;
    case 'rt-sil': rtDegis('Rota adımı silindi', v, u => { if (u.rota.length < 2) { bildir('Rotada en az bir adım kalmalı.', 'hata'); return false; } u.rota = u.rota.filter(o => o.k !== v); rtDogrusal(u); if (u.recete) u.recete.forEach(m => { if (m.adim === v) m.adim = u.rota[0].k; }); }); return true;
    case 'rt-ekle': rtDegis('Rota adımı eklendi', 'yeni adım', u => { const k = String(((Math.max(0, ...u.rota.map(x => +x.k || 0)) / 10 | 0) + 1) * 10); const son = u.rota[u.rota.length - 1];
      u.rota.push({ k, ad: 'Yeni adım', tezgahlar: son && son.tezgahlar.length ? [{ ...son.tezgahlar[0] }] : [], bag: son ? [[son.k, 'b']] : [], aile: '' }); rtDogrusal(u); }); return true;
    case 'rt-malz-ekle': rtDegis('Reçete değişti', 'malzeme eklendi', u => { const m = (S.D.malzemeler || [])[0]; if (!m) return false; rtRecete(u).push({ kod: m.kod, miktar: 1, adim: u.rota[0].k }); rtReceteYaz(u); }); return true;
    case 'rt-malz-sil': rtDegis('Reçete değişti', 'malzeme çıkarıldı', u => { rtRecete(u).splice(+v, 1); rtReceteYaz(u); }); return true;
  }
  return rtTekEski(act, v, el, e);
};
/* alan değişiklikleri */
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('rt-')) return;
  e.stopImmediatePropagation(); const d = el.dataset; const v = d.v;
  if (c === 'rt-urun') { U.rtUrun = el.value; render(); atTetikle(); return; }
  if (c === 'rt-grup') return rtDegis('Rota değişti', `${v}: istasyon`, u => { const o = rtOp(u, v); const ilk = o.tezgahlar[0] || { cevrim: 5, ayar: 30 };
    if (el.value[0] === '@') { o.fason = el.value.slice(1); o.tezgahlar = []; delete o.fasonIzin; }
    else { delete o.fason; o.tezgahlar = S.D.tezgahlar.filter(m => m.grup === el.value).slice(0, 1).map(m => ({ id: m.id, cevrim: ilk.cevrim, ayar: ilk.ayar })); } });
  if (c === 'rt-tez-ekle') { if (!el.value) return; return rtDegis('Rota değişti', `${v}: ${el.value}`, u => { const o = rtOp(u, v); const ilk = o.tezgahlar[0] || { cevrim: 5, ayar: 30 }; o.tezgahlar.push({ id: el.value, cevrim: ilk.cevrim, ayar: ilk.ayar }); }); }
  if (c === 'rt-sure') { const n = Number(el.value); if (!isFinite(n) || n < 0) { bildir('Süre sıfır ya da pozitif olmalı.', 'hata'); render(); return; }
    return rtDegis('Rota süresi değişti', `${v} · ${d.m} ${d.f === 'ayar' ? 'ayar' : 'çevrim'} ${n} dk`, u => { const t = rtOp(u, v).tezgahlar.find(x => x.id === d.m); if (!t) return false; t[d.f] = n; }); }
  if (c === 'rt-alan') { const f = d.f;
    return rtDegis('Rota değişti', `${v}: ${f === 'programYok' ? 'NC programı' : f === 'fai' ? 'ilk parça onayı' : f}`, u => { const o = rtOp(u, v);
      if (f === 'ad') { if (!el.value.trim()) return false; o.ad = el.value.trim(); }
      else if (f === 'aile') o.aile = el.value.trim();
      else if (f === 'aparat') { if (el.value) o.aparat = el.value; else delete o.aparat; }
      else if (f === 'fai') { if (el.checked) o.fai = true; else delete o.fai; }
      else if (f === 'programYok') { if (el.checked) o.program = false; else delete o.program; }
      else if (f === 'fasonIzin') { if (el.checked) o.fasonIzin = true; else delete o.fasonIzin; }
      else if (f === 'ortusebilir') o.ortusebilir = !!el.checked;
      else if (f === 'minParti' || f === 'kasa') { const n = Math.round(Number(el.value)); if (el.value === '') delete o[f]; else if (!(n >= 1)) { bildir('1 ya da daha büyük bir tam sayı girin.', 'hata'); return false; } else o[f] = n; } }); }
  if (c === 'rt-urun-kasa') { const n = Math.round(Number(el.value)); if (el.value !== '' && !(n >= 1)) { bildir('Kasa 1 ya da daha büyük bir tam sayı olmalı.', 'hata'); render(); return; }
    return rtDegis('Ürün kasası değişti', el.value === '' ? 'kasa yok' : `kasa ${n}`, u => { if (el.value === '') delete u.kasa; else u.kasa = n; }); }
  if (c === 'rt-malz') { const i = +d.i;
    return rtDegis('Reçete değişti', `${d.f}`, u => { const m = rtRecete(u)[i]; if (!m) return false; if (d.f === 'miktar') { const n = Number(el.value); if (!isFinite(n) || n < 0) return false; m.miktar = n; } else m[d.f] = el.value; rtReceteYaz(u); }); }
}, true);
/* üstüne gelinen adım ve makine tahtada öne çıkar */
document.addEventListener('pointerover', e => {
  const kart = e.target.closest && e.target.closest('.pm-tk-pano[data-tur="rota"]'); const a = kart && e.target.closest('[data-rt-k]'); const m = kart && e.target.closest('[data-rt-m]');
  const k = a ? a.dataset.rtK : null, mm = m ? m.dataset.rtM : null;
  if (k !== (U.rtHov || null) || mm !== (U.rtHovM || null)) { U.rtHov = k; U.rtHovM = mm; document.querySelectorAll('.pm-rt-adim').forEach(x => x.toggleAttribute('data-hov', x.dataset.rtK === k)); atTetikle(); }
});
/* rota katmanı: kart açıkken ürünün adımları tahtada yanar */
function rtCiz() {
  if (!(U.tkKart || []).some(c => c.tur === 'rota' && !c.kucuk) || !AT.kam || !AT.cv) return;
  const u = rtUrun(); if (!u) return; const s = atSahne(); const R = atRenkler(); const g = AT.g; const k = AT.kam.k; const dpr = window.devicePixelRatio || 1;
  g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const merkez = [];
  u.rota.forEach((o, i) => {
    const yerler = o.fason ? [rtYer(o)] : (o.tezgahlar || []).map(t => t.id); const sonuk = U.rtHov && U.rtHov !== o.k;
    const nok = [];
    yerler.forEach((m, j) => { const a = s.ist[m]; if (!a) return; const [x, y] = atEk(a.x, a.y); const w = AT_KW * k, h = AT_KH * k; nok.push([x, y]);
      const vurgu = U.rtHovM === m || U.rtHov === o.k;
      g.globalAlpha = sonuk ? 0.25 : 1; g.lineWidth = vurgu ? 4 : 2.5; g.strokeStyle = R.done; g.setLineDash(j ? [6, 4] : []);
      atYuvarlak(g, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 12 * k + 6); g.stroke(); g.setLineDash([]);
      if (vurgu) { g.globalAlpha = sonuk ? 0.1 : 0.16; g.fillStyle = R.done; g.fill(); g.globalAlpha = 1; }
      const t = j ? `${o.k} alt.` : `OP ${o.k}`; g.font = `700 ${Math.max(11, 13 * Math.min(1.4, k / 0.5))}px ui-monospace, monospace`; const tw = g.measureText(t).width + 10, th = Math.max(16, 18 * Math.min(1.4, k / 0.5));
      const bx = x - w / 2 - 6 + (j ? 0 : 0), by = y - h / 2 - 6 - th / 2;
      g.globalAlpha = sonuk ? 0.3 : 1; g.fillStyle = j ? R.panel : R.done; atYuvarlak(g, bx, by - th / 2, tw, th, th / 2); g.fill(); g.strokeStyle = R.done; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = j ? R.done : R.panel; g.textBaseline = 'middle'; g.fillText(t, bx + 5, by + 1); g.globalAlpha = 1; });
    merkez.push(nok[0] || null);
  });
  g.strokeStyle = R.done; g.lineWidth = 2; g.globalAlpha = U.rtHov ? 0.35 : 0.7; g.setLineDash([2, 6]); g.lineCap = 'round';
  for (let i = 1; i < merkez.length; i++) { const a = merkez[i - 1], b = merkez[i]; if (!a || !b) continue; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 40 * k, b[0], b[1]); g.stroke(); }
  g.restore();
}
const rtCizEski = atCiz;
atCiz = function () { const r = rtCizEski.apply(this, arguments); try { rtCiz(); } catch (er) { /* katman çizimi tahtayı durdurmasın */ } return r; };
/* tahtadaki tezgâhı seçince açık rota kartı o tezgâhı kullanan adımı öne çıkarır */
const rtTekEski2 = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'tk-toparla') { tkToparla(); return true; }
  if (act === 'tk-hepsi') { tkSigdirHepsi(); return true; }
  return rtTekEski2(act, v, el, e);
};
/* uzaktan bakınca kart yalnız adıyla bölge olarak görünür; basınca kart okunur yakınlığa gelir */
document.addEventListener('pointerdown', e => {
  const el = e.target.closest && e.target.closest('.pm-tk-pano[data-uzak]'); if (!el || !AT.kam) return;
  const c = (U.tkKart || []).find(x => x.tur === el.dataset.tur); if (!c) return; e.preventDefault(); e.stopPropagation();
  const b = tkDunyaKutu(c); const k = TK_KREF; const [W, H] = AT.boyut; const h = Math.min(b.h * k, H * 0.8);
  AT.kam = { x: b.x + b.w / 2, y: b.y + h / 2 / k, k }; atTetikle();
}, true);

/* ---------- Plan ekranı ----------
   Tek çalışma yeri: üstte dört gösterge, solda süzgeç, ortada aynı planın görünümleri, sağda karar paneli.
   Her değişiklik aynı yoldan geçer: öneri, etki, kullanıcının kararı. Görünümler yalnız seçim ve süzgeci paylaşır. */
function planEkrani() {
  if (!S.plan) return bosPlan();
  const p = gosterilen();
  const gor = ekranlar()[0][3];
  const sekme = planSekme();
  const karar = kararPaneli();
  const acik = U.kararAcik || U.hamle || U.secili || U.secJob;
  return `${gostergeler(p)}<div class="pm-p">
    <aside class="pm-p-suz" aria-label="Süzgeç">${suzgec(p)}</aside>
    <section class="pm-p-orta" aria-label="Plan görünümü">${sekme}${seritler()}<div class="pm-p-gor">${gorunumIcerik(p)}</div></section>
    <aside class="pm-p-karar" id="denetci" aria-label="Karar paneli" ${acik ? 'data-acik' : ''}>${karar}</aside></div>`;
}
function planSekme() {
  const gor = ekranlar()[0][3]; const hesap = HESAP_GOR.some(([id]) => id === U.sayfa);
  return `<div class="pm-ekran-sekme" role="tablist" aria-label="Görünüm">${gor.map(([id, ad, sm]) => `<button type="button" role="tab" data-act="git" data-v="${id}" aria-selected="${U.sayfa === id || (id === 'studyo' && hesap)}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('')}</div>`;
}
function bosPlan() {
  const D = S.D; const cx = cxAl();
  const adim = (n, b, m) => `<li><b class="pm-adim-no mono">${n}</b><span><b>${b}</b><br><span class="pm-kucuk">${m}</span></span></li>`;
  return `<div class="pm-bos pm-bos-genis">${ic('gantt', 'b')}<strong>Plan henüz kurulmadı</strong>
    <span>${esc(D.meta.ad)}: ${D.tezgahlar.length} tezgâh, ${D.siparisler.length} sipariş, ${cx ? cx.ops.length : '—'} işlem, ${D.personel.length} personel.</span>
    <ol class="pm-adimlar">${adim(1, 'Planı kur', 'Motor bütün kısıtlarla ilk planı kurar, kalan sürede iyileştirir.')}${adim(2, 'Sorunlara bak', 'Sağdaki karar paneli gecikeni, malzemesi eksik olanı ve darboğazı sıralar.')}${adim(3, 'Karar ver', 'Her öneri önce önizlenir; Uygula demeden plan değişmez.')}</ol>
    <div class="pm-dugmeler">${dugme('Planı kur', 'coz', { birincil: true, simge: 'play', yetki: 'plan.yaz', veri: 'data-v="sifir"' })}${dugme('Veri ve kısıtlar', 'git', { simge: 'layers', veri: 'data-v="siparisler"' })}</div></div>`;
}

/* ---------- göstergeler: her biri planı süzer ya da ilgili görünümü açar ---------- */
function grupDoluluk(p) {
  const g = {};
  for (const m of S.D.tezgahlar) { const u = p.util && p.util[m.id]; if (!u) continue; const x = (g[m.grup] = g[m.grup] || { b: 0, o: 0, n: 0, en: null }); x.b += u.busy || 0; x.o += u.open || 0; x.n++; if (!x.en || u.u > x.en.u) x.en = { m: m.id, u: u.u }; }
  return Object.entries(g).map(([ad, x]) => ({ ad, u: x.o ? x.b / x.o : 0, n: x.n, en: x.en })).sort((a, b) => b.u - a.u);
}
function bugunAdet(p) {
  const v = gunlukDagilim(p); if (!v) return null;
  let isle = 0, hazir = 0;
  for (const m in v.tez) { const h = v.tez[m][v.d0]; if (h) isle += h.adet; }
  for (const j in v.sip) { const h = v.sip[j][v.d0]; if (h) hazir += h.adet; }
  return { isle, hazir };
}
function gostergeler(p) {
  const o = p.ozet, on = U.hamle ? S.plan.ozet : null;
  const once = (a, b, k = 1) => (on && b != null && Math.abs(a - b) > (k ? 0.05 : 0.5)) ? `<span class="pm-g-once mono">önce ${k ? sayi(b, k) : b}</span>${fark(a, b, k)}` : '';
  const bg = bugunAdet(p), bgOn = on ? bugunAdet(S.plan) : null;
  const dol = grupDoluluk(p)[0];
  const sor = sorunlar(p); const agir = sor.filter(x => x.ton === 'hata').length;
  const kutu = (act, v, ton, simge, ad, deger, alt, secili) => `<button type="button" class="pm-gos" data-act="${act}" data-v="${esc(v || '')}" ${ton ? `data-ton="${ton}"` : ''} aria-pressed="${!!secili}"><span class="pm-gos-ust">${ic(simge, 'k')}<span>${ad}</span></span><span class="pm-gos-deger mono">${deger}</span><span class="pm-gos-alt">${alt}</span></button>`;
  return `<div class="pm-goslar" role="group" aria-label="Plan özeti">
    ${kutu('suz-gec', '', o.late ? 'hata' : 'tamam', 'flag', 'Geciken sipariş', `${o.late}<small>/${o.n}</small>`, `ağırlıklı gecikme ${saat(o.wT)} ${once(o.wT, on && on.wT)}`, U.yalnizGec)}
    ${kutu('git', 'matris', '', 'box', 'Bugün işlenecek', bg ? `${sayi(Math.round(bg.isle), 0)}<small> adet</small>` : '—', bg ? `teslime hazır ${sayi(Math.round(bg.hazir), 0)} adet${bgOn && Math.abs(bgOn.isle - bg.isle) >= 1 ? ` · önce ${sayi(Math.round(bgOn.isle), 0)}` : ''}` : '', false)}
    ${kutu('suz-grup', dol ? dol.ad : '', dol && dol.u > 0.9 ? 'uyari' : '', 'gauge', 'En dolu grup', dol ? `${esc(dol.ad)} <small>%${Math.round(dol.u * 100)}</small>` : '—', dol && dol.en ? `en dolu tezgâh ${esc(dol.en.m)} %${Math.round(dol.en.u * 100)}` : '', dol && U.grup === dol.ad)}
    ${kutu('karar-ac', '', agir ? 'hata' : sor.length ? 'uyari' : 'tamam', 'alert', 'Bekleyen sorun', `${sor.length}`, sor.length ? esc(sor[0].baslik) : 'Karar bekleyen sorun yok', U.kararAcik)}
  </div>`;
}

/* ---------- süzgeç: bütün görünümler aynı süzgeci kullanır ---------- */
function suzgec(p) {
  const D = S.D; const gruplar = grupDoluluk(p);
  const grup = `<label class="tc-alan"><span class="tc-alan-etiket">Tezgâh grubu</span><select class="tc-alan-kutu" data-chg="grup"><option value="">Bütün gruplar (${D.tezgahlar.length})</option>${gruplar.map(g => `<option value="${esc(g.ad)}" ${U.grup === g.ad ? 'selected' : ''}>${esc(g.ad)} · ${g.n} tezgâh · %${Math.round(g.u * 100)}</option>`).join('')}${(D.fasoncular || []).length ? `<option value="@fason"${U.grup === '@fason' ? ' selected' : ''}>fason</option>` : ''}</select></label>`;
  const gec = `<label class="pm-anahtar"><input type="checkbox" data-chg="yalniz-gec" ${U.yalnizGec ? 'checked' : ''}><i></i>Yalnız geciken siparişler</label>`;
  const temiz = U.grup || U.yalnizGec || U.secJob ? dugme('Süzgeci temizle', 'suz-temizle', { simge: 'x', kucuk: true, hayalet: true }) : '';
  const ac = `<button type="button" class="tc-dugme tc-dugme-kucuk pm-sip-ac" data-act="sip-ac" aria-expanded="${!!U.sipAcik}">${ic('list', 'k')}Siparişler (${D.siparisler.length})</button>`;
  return `<div class="pm-suz-ust">${grup}${gec}${ac}${temiz}</div><div class="pm-suz-liste" ${U.sipAcik ? 'data-acik' : ''}>${siparisListesi(p)}</div>`;
}

/* ---------- görünümler ---------- */
function gorunumIcerik(p) {
  if (HESAP_GOR.some(([id]) => id === U.sayfa)) {
    const seg = `<div class="pm-seg" role="tablist" aria-label="Hesabın ayrıntısı">${HESAP_GOR.map(([id, ad, sm]) => `<button type="button" role="tab" data-act="git" data-v="${id}" aria-selected="${U.sayfa === id}">${ic(sm, 'k')}${ad}</button>`).join('')}</div>`;
    return `<div class="pm-sira">${seg}</div>${GORUNUM[U.sayfa]()}`;
  }
  if (U.sayfa === 'masa') return `${zamanAraclari()}${gantt(p)}${lejant()}`;
  return GORUNUM[U.sayfa]();
}
function zamanAraclari() {
  const canli = canliSen();
  const anahtar = (chg, on, metin, kapali) => `<label class="pm-anahtar"${kapali ? ' aria-disabled="true"' : ''}><input type="checkbox" data-chg="${chg}" ${on ? 'checked' : ''} ${kapali ? 'disabled' : ''}><i></i>${metin}</label>`;
  return `<div class="pm-sira pm-arac"><div class="pm-seg" role="group" aria-label="Ölçek">${[[3, '4 hafta'], [10, 'Hafta'], [40, 'Gün']].map(([z, ad]) => `<button type="button" data-act="zoom" data-v="${z}" aria-pressed="${U.zoom === z}">${ad}</button>`).join('')}</div>
  ${anahtar('yuk', U.yuk, 'Kaynak yükü')}${canli && canli.plan ? anahtar('canli-goster', U.canliGoster, 'Canlı planla karşılaştır') : ''}
  <span class="pm-sira-ara"></span>${dugme('', 'g-katla-hepsi', { simge: 'layers', ad: 'Grupları katla ya da aç', hayalet: true, kucuk: true })}${dugme('', 'simdiye', { simge: 'target', ad: 'Şimdiye git', hayalet: true, kucuk: true })}${dugme('Planı geri al', 'plan-geri', { simge: 'back', kucuk: true, yetki: 'plan.yaz', cls: planGeri.length ? '' : 'pm-pasif' })}</div>`;
}

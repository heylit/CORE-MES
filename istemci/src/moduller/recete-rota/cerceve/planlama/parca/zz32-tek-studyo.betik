/* ---------- Tek stüdyo: planın bütün düzenleme ve onay işleri bir sayfada ----------
   Akış: düzenle → sonuç paneli → onay. Plan sekmesi kaynak şeritleridir; Tezgâh, Sipariş, Kriz masası ve Senaryo eski
   stüdyolardır (q-studyo, r-studyolar), Onay sekmesi plan onayıdır (zz22, pa*). Hiçbiri yeniden yazılmadı; burada yalnız
   sekme olarak bir araya gelir. Değişiklik hangi sekmede yapılırsa yapılsın plana yalnız sonuç panelinden girer. */
const PS_SEK = [['plan', 'layers', 'Plan'], ...ST_TUR.map(([k, sm, ad]) => [k, sm, ad]), ['onay', 'check', 'Onay ve canlı']];
const psStSek = s => ST_TUR.some(x => x[0] === s);

function psAkis(s) {
  const d = S.plan && paCalismaFarkli(); const n = paOnayda().length;
  const an = s === 'onay' ? 2 : U.hamle ? 1 : 0;
  const l = [['edit', 'Düzenle', 'Bir işi taşıyın, komut yazın ya da bir sekmede deneyin'], ['eye', 'Sonuç', 'Motorun hesabını görün; Uygula ya da Vazgeç'], ['check', 'Onay ve canlı', n ? `${n} plan onay bekliyor` : d ? 'Canlıya alınmamış değişiklik var' : 'Canlı plan ve çalışma aynı']];
  return `<ol class="pm-ps-akis" aria-label="Akış">${l.map(([sm, ad, alt], i) => `<li ${i === an ? 'aria-current="step"' : i < an ? 'data-bitti' : ''}>${i === 2 ? `<button type="button" data-act="ps-sek" data-v="onay">` : '<span>'}<i aria-hidden="true">${i + 1}</i>${ic(sm, 'k')}<b>${ad}</b><small>${esc(alt)}</small>${i === 2 && (n || d) ? `<em class="pm-ps-akis-nokta" aria-hidden="true">${n || ''}</em>` : ''}${i === 2 ? '</button>' : '</span>'}</li>`).join('')}</ol>`;
}
function sTekStudyo() {
  if (!S.plan) return bosPlan();
  let s = U.psSek || 'plan';
  if (!PS_SEK.some(x => x[0] === s)) s = 'plan';
  /* eski stüdyo Esc ya da "kapat" ile kapandıysa plan sekmesine dönülür */
  if (psStSek(s) && (!U.studyo || U.studyo.tur !== s)) s = 'plan';
  U.psSek = s;
  const n = paOnayda().length;
  const sek = `<div class="pm-st-sek pm-ps-sekler" role="tablist" aria-label="Stüdyo sekmeleri">${PS_SEK.map(([k, sm, ad]) => `<button type="button" role="tab" aria-selected="${s === k}" data-act="ps-sek" data-v="${k}">${ic(sm, 'k')}<span>${ad}</span>${k === 'onay' && n ? `<b class="pm-pa-say">${n}</b>` : ''}</button>`).join('')}</div>`;
  const geride = psTabanNo() < psCanliNo();
  const kip = U.psCak3 ? ['alert', 'Çakışma: yeniden hesaplandı', 'uyari'] : U.hamle ? ['eye', 'Önizleme: plan henüz değişmedi', 'onizle'] : U.psBen ? ['user', 'Benzetim açık', ''] : ['edit', 'Düzenleme', ''];
  const kimlik = `<div class="pm-ps-kimlik">${dugme('', 'ps-kapat', { simge: 'chev-left', kucuk: true, hayalet: true, ad: 'Planlama motoruna dön' })}<span class="pm-ps-surum" data-yer="canli-surum" ${geride ? 'data-geride' : ''} title="Uyguladığın değişiklik bu sürüme göre hesaplanır">${ic('flag', 'k')}Canlı sürüm ${psCanliNo()}${geride ? ` · senin planın sürüm ${psTabanNo()} üstünde` : ''}${U.psBen ? ' (benzetim)' : ''}</span><span class="pm-ps-kip" data-yer="kip" ${kip[2] ? `data-ton="${kip[2]}"` : ''}>${ic(kip[0], 'k')}${kip[1]}</span>${sapmaRozet()}</div>`;
  const ust = `<div class="pm-ps-sayfa-ust">${kimlik}${sek}${psAkis(s)}</div><p class="pm-ps-ipucu" data-yer="ipucu">${ic('help', 'k')}<span>${PS_IPUCU[s]}</span></p>`;
  const govde = s === 'plan' ? sPlanStudyo() : s === 'onay' ? sPlanAtolye() : `<div class="pm-ps-st">${sStudyoAc()}</div>`;
  /* sonuç her sekmede aynı yerde: sayfanın altında sabit karar kutusu; Uygula ve Vazgeç hep görünür */
  const sonuc = psSonuc();
  return `<div class="pm-ps-sayfa" data-sek="${s}">${ust}${govde}${sonuc ? `<div class="pm-ps-dok">${sonuc}</div>` : ''}</div>`;
}
const PS_IPUCU = {
  plan: 'İşi tutup sürükleyin: saat ızgaraya oturur, hedef ve saat gösterilir, Esc vazgeçer. Shift ile çoklu seçim. Telefonda işe dokunup alttaki araçları kullanın. Her değişiklik önce alttaki Sonuç kutusuna gelir.',
  tez: 'Sırayı sürükleyerek ya da ↑ ↓ tuşlarıyla değiştirin; çizelgede bir saate bırakarak işi o saate alın. Seçili işi başka tezgâha taşıyabilirsiniz.',
  sip: 'Siparişin her adımda neden beklediğini görün; öne almanın bedelini deneyin.',
  kriz: 'Ne olduğunu girin ve üç tepkiyi hesaplayın; birini önizleyin, alttaki Sonuç kutusunda Uygula ya da Vazgeç deyin.',
  sen: 'En çok üç planı yan yana karşılaştırın; ilk seçilen tabandır.',
  onay: 'Çalışma planını canlıyla karşılaştırın, onaya gönderin ya da canlıya alın. Canlıya alınmış planlar silinmez; Geçmiş planlar listesindedir.',
};
GORUNUM.studyo = sTekStudyo;

/* tahtadaki çift tıklama ve stüdyo düğmeleri ilgili sekmeyi açar */
{ const sa0 = stAc; stAc = function (tur) { U.sayfa = 'studyo'; U.psSek = tur; U.pencere = null; return sa0.apply(this, arguments); }; }
{ const r0 = render; render = function () {
  if (U.sayfa === 'patolye') { U.sayfa = 'studyo'; U.psSek = 'onay'; }
  if (U.sayfa !== 'studyo' && U.studyo) U.studyo = null;
  return r0.apply(this, arguments);
}; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'ps-sek') {
    U.psCak = null;
    if (psStSek(v)) { stAc(v); return true; }
    U.psSek = v; U.studyo = null; U.sayfa = 'studyo'; render(); { const i = document.getElementById('icerik'); if (i) i.scrollTop = 0; } return true;
  }
  return te0(act, v, el, e);
}; }

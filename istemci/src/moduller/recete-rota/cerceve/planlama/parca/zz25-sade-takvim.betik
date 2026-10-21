/* ---------- Sade sayfa: takvim grubu (Terminler, Termin ve kâr, Yıllık plan, Sevkiyat) ----------
   Çerçeve zz24-sade.js. Formlar asıl sayfanın kendi değişiklik işleyicisiyle aynı degistir çağrısını, aynı yetki ve alanlarla yapar. */
const stkGun = t => t == null || !isFinite(t) ? '—' : fmtDT(S.D, t).slice(0, 9);
const stkBirim = (q, kod) => `${sayi(q, q < 10 ? 1 : 0)} ${(S.D.malzemeler.find(m => m.kod === kod) || {}).birim || ''}`.trim();
const stkMatAd = kod => (S.D.malzemeler.find(m => m.kod === kod) || {}).ad || '';
const stkYaz = () => yetkili('plan.yaz');

/* ---------- Terminler ---------- */
function stkTmUyari() {
  const w = ((gosterilen() || {}).warn || []).filter(x => x.t === 'Termin yok' && x.gelis != null);
  if (!w.length) return null; const js = [...new Set(w.map(x => x.j))]; return { js, g: Math.max(...w.map(x => x.gelis)) };
}
SADE.terminler = {
  ad: 'Malzeme ve fason terminleri', simge: 'flag',
  ne: 'Satın alınan malzemenin ve fasona giden işin ne zaman geleceği. Termin girilmeyen iş plana tahmini tarihle girer.',
  durum() {
    const v = tmMalzeme(); const f = tmFason();
    if (!v) return [{ simge: 'box', ad: 'Termin bekleyen malzeme', deger: null, not: 'plan yok' }, { simge: 'truck', ad: 'Termin bekleyen fason', deger: null, not: 'plan yok' }];
    const bek = v.L.filter(r => r.tm !== 'termin'); const acil = bek.filter(r => tmDurum(r, v.now)[1] === 'hata');
    const yeni = v.L.filter(r => r.src == null); const gecti = yeni.filter(r => r.siparisGun != null && r.siparisGun < v.now).length;
    const fb = f ? f.L.filter(x => x.T == null) : []; const fy = fb.filter(x => x.yakin).length;
    const u = stkTmUyari();
    return [
      { simge: 'box', ad: 'Termin bekleyen malzeme', deger: sayi(bek.length, 0), ton: acil.length ? 'hata' : bek.length ? 'uyari' : 'tamam', not: acil.length ? `${acil.length} tanesi acil` : bek.length ? 'tedarikçiden tarih alın' : 'hepsinin termini var' },
      { simge: 'lira', ad: 'Siparişi verilmemiş', deger: sayi(yeni.length, 0), ton: gecti ? 'hata' : yeni.length ? 'uyari' : 'tamam', not: gecti ? `${gecti} tanesinin günü geçti` : yeni.length ? 'satın alma bekliyor' : 'yok' },
      { simge: 'truck', ad: 'Termin bekleyen fason', deger: f ? sayi(fb.length, 0) : null, ton: fy ? 'hata' : fb.length ? 'uyari' : 'tamam', not: fy ? `${fy} tanesi bir hafta içinde çıkıyor` : fb.length ? 'dönüş tarihi girilmedi' : 'hepsinin termini var' },
      { simge: 'clock', ad: 'Malzeme yüzünden kayabilecek iş', deger: sayi(u ? u.js.length : 0, 0), ton: u ? 'hata' : 'tamam', not: u ? `malzeme en erken ${stkGun(u.g)}` : 'yok' },
    ];
  },
  yapilacak() {
    const l = []; const veri = yetkili('veri.yaz'); const v = tmMalzeme();
    if (!S.plan) { l.push({ simge: 'play', metin: 'Henüz plan yok', neden: 'Malzemenin ne zaman gerektiği plandan çıkar.', act: stkYaz() ? 'coz' : null, v: 'sifir', dugme: 'Planı kur', dsimge: 'play', birincil: true }); return l; }
    if (!planGuncel()) l.push({ simge: 'rotate', ton: 'uyari', metin: 'Veri plandan sonra değişti', neden: 'Girdiğiniz terminler plana yeni çözümde girer.', act: stkYaz() ? 'ekip' : null, dugme: 'Planı iyileştir', dsimge: 'play', birincil: true });
    const u = stkTmUyari();
    if (u) l.push({ simge: 'alert', ton: 'hata', metin: `${u.js.length} iş malzemesi gelmeden başlıyor`, neden: `${u.js.slice(0, 4).join(', ')}${u.js.length > 4 ? '…' : ''}: termin girilmediği için sipariş yok sayıldı, malzeme en erken ${stkGun(u.g)}. Termin girin ya da işleri o güne atın.`, act: stkYaz() ? 'tm-ileri' : null, v: `${u.js.join(',')}|${u.g}`, dugme: 'İşleri ileri at', dsimge: 'next' });
    if (v) { const bek = v.L.filter(r => r.tm !== 'termin').sort((a, b) => (a.plan ?? 1e9) - (b.plan ?? 1e9));
      if (bek.length) { const r = bek[0]; l.push({ simge: 'box', ton: tmDurum(r, v.now)[1] === 'hata' ? 'hata' : 'uyari', metin: `${bek.length} malzemenin termini girilmedi`, neden: `İlk gereken ${r.kod} ${stkMatAd(r.kod)}: ${stkGun(r.plan)} günü elde olmalı. Tedarikçinin verdiği tarihi girin.`, act: veri ? 'sd-form' : null, v: 'terminler:mal', dugme: 'Termin gir', dsimge: 'edit', birincil: !u }); }
      const yeni = v.L.filter(r => r.src == null);
      if (yeni.length) l.push({ simge: 'lira', ton: 'uyari', metin: `${yeni.length} malzemenin siparişi verilmedi`, neden: 'Siparişi toplu vermek için Malzeme satın alma planı sayfasına gidin; tarihi biliniyorsa buradan termin girmek de siparişi verir.', act: 'git', v: 'malzplan', dugme: 'Satın alma planı', dsimge: 'box' }); }
    const f = tmFason(); const fb = f ? f.L.filter(x => x.T == null) : [];
    if (fb.length) l.push({ simge: 'truck', ton: fb.some(x => x.yakin) ? 'hata' : 'uyari', metin: `${fb.length} fason işinin dönüş tarihi yok`, neden: `İlk çıkan ${fb[0].id}, ${stkGun(fb[0].r.S)}. Fasoncudan dönüş tarihini alıp girin.`, act: veri ? 'sd-form' : null, v: 'terminler:fason', dugme: 'Dönüş gir', dsimge: 'edit' });
    return l;
  },
  nasil: [
    'Plan her malzemenin hangi gün gerektiğini, onu kullanan ilk işin başlangıcından bulur.',
    'Tedarikçi tarih vermeden önce geliş, malzemenin tedarik süresinden tahmin edilir. Tarih gelince girin; plan artık o tarihi kullanır.',
    'Gerekmesine bir haftadan az kalan ve tarihi girilmeyen malzeme hiç sipariş edilmemiş sayılır; o işler kayabilir, ekranda kırmızı görünür.',
    'Fasona giden işin dönüş tarihi de aynı biçimde girilir; girilmezse fasoncunun süresinden tahmin edilir.',
    'Tahmin süresini uzatıp kısaltan katsayılar Veri gir ya da Tüm ayrıntılar sekmesindedir.',
  ],
  formlar() {
    return [
      { id: 'mal', ad: 'Malzeme termini gir', simge: 'box', ne: 'Tedarikçinin verdiği geliş tarihi.', yetki: 'veri.yaz',
        alanlar: () => { const v = tmMalzeme(); const L = v ? v.L.filter(r => r.tm !== 'termin').sort((a, b) => (a.plan ?? 1e9) - (b.plan ?? 1e9)) : [];
          const sec = U.sdForm && U.sdForm.deg ? L.find(r => stkMalAnah(r) === U.sdForm.deg.sat) : null;
          return [
            { k: 'sat', ad: 'Malzeme', tur: 'secim', zorunlu: 1, secenek: () => L.map(r => [stkMalAnah(r), `${r.kod} · ${stkMatAd(r.kod)} · ${stkBirim(r.miktar, r.kod)} · gerekli ${stkGun(r.plan)}${r.src == null ? ' · sipariş de verilir' : ''}`]) },
            { k: 't', ad: 'Geliş tarihi', tur: 'tarih', zorunlu: 1, ipucu: sec ? `Gerekli geliş ${stkGun(sec.plan)}; tahmini ${stkGun(sec.etkin)}` : 'Tedarikçinin söz verdiği gün' },
          ]; },
        adimlar: [{ ad: 'Hangi malzeme', ne: 'Listede termini girilmemiş malzemeler, ilk gereken başta.', k: ['sat'] }, { ad: 'Geliş tarihi', ne: 'Tedarikçinin söz verdiği günü girin.', k: ['t'] }],
        kontrol: (x, i, d) => { if (i === 0 || i === -1) { if (!stkMalBul(x.sat || d.sat)) return 'Bu malzeme listede yok; plan değişmiş olabilir. Yeniden seçin.'; } return null; },
        sonuc: 'tarih satın alma siparişine yazılır; siparişi verilmemişse sipariş de bu tarihle verilir.',
        kaydet: x => { const r = stkMalBul(x.sat); if (!r) return false;
          if (r.src == null) return tmSiparisVer([r], x.t);
          const po = (S.D.satinalma || [])[r.src]; if (!po) return false; const saat = (String(po.gelis || '').split(' ')[1]) || '08:00'; const yeni = `${x.t} ${saat}`;
          return degistir('Satın alma termini değişti', `${po.kod} ${po.miktar}: ${po.gelis || '—'} → ${yeni}`, () => { po.gelis = yeni; U.mpV = null; }); },
        bitti: x => `${String(x.sat).split(':')[1]} termini ${x.t} oldu` },
      { id: 'fason', ad: 'Fason dönüş tarihi gir', simge: 'truck', ne: 'Fasoncunun söz verdiği dönüş günü.', yetki: 'veri.yaz',
        alanlar: () => { const f = tmFason(); const L = f ? f.L.slice().sort((a, b) => (a.T == null ? 0 : 1) - (b.T == null ? 0 : 1) || a.r.S - b.r.S) : [];
          const sec = U.sdForm && U.sdForm.deg ? L.find(x => x.id === U.sdForm.deg.is) : null;
          return [
            { k: 'is', ad: 'Fason işi', tur: 'secim', zorunlu: 1, secenek: () => L.map(x => [x.id, `${x.id} · ${x.f.ad || x.r.m} · çıkış ${stkGun(x.r.S)} · ${x.T == null ? 'tarih yok' : 'dönüş ' + stkGun(x.T)}`]) },
            { k: 't', ad: 'Dönüş tarihi', tur: 'tarih', zorunlu: 1, ipucu: sec ? `Sonraki adım ${stkGun(sec.ger)} başlıyor; sipariş gecikmeden en geç ${stkGun(sec.enGec)}` : 'Fasoncunun söz verdiği gün' },
          ]; },
        adimlar: [{ ad: 'Hangi iş', ne: 'Tarihi olmayanlar başta.', k: ['is'] }, { ad: 'Dönüş tarihi', k: ['t'] }],
        ileri: (d, i) => { if (i !== 0) return; const x = (tmFason() || { L: [] }).L.find(z => z.id === d.is); if (x) d.t = mpTarihGir(x.T); },
        sonuc: 'iş plana bu dönüş tarihiyle girer.',
        kaydet: x => { const id = x.is; return degistir('Fason dönüş termini girildi', `${id}: ${x.t}`, () => { const k = { ...(S.D.fasonTermin || {}) }; k[id] = `${x.t} 16:00`; S.D.fasonTermin = k;
          const r = S.plan && S.plan.ops[id]; if (r && !(S.D.fasonRef || {})[id]) S.D.fasonRef = { ...(S.D.fasonRef || {}), [id]: tmYaz(r.C) }; }); },
        bitti: x => `${x.is} dönüşü ${x.t} oldu` },
      { id: 'ayar', ad: 'Tahmini süreyi ayarla', simge: 'gear', ne: 'Tarih gelene kadar planın varsaydığı süre.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'katMal', ad: 'Malzeme: tedarik süresinin kaç katı', tur: 'sayi', zorunlu: 1, min: 0.1, max: 10, adim: 0.1, ipucu: '1: tedarik süresi kadar; 1,5: yarısı kadar daha uzun' },
          { k: 'ekMal', ad: 'Malzeme: her 100 birim için ek gün', tur: 'sayi', zorunlu: 1, min: 0, max: 100, adim: 0.1 },
          { k: 'katFas', ad: 'Fason: fasoncu süresinin kaç katı', tur: 'sayi', zorunlu: 1, min: 0.1, max: 10, adim: 0.1 },
          { k: 'ekFas', ad: 'Fason: her 100 adet için ek gün', tur: 'sayi', zorunlu: 1, min: 0, max: 100, adim: 0.1 },
          { k: 'esik', ad: 'Tarih kaç gün önceden zorunlu', tur: 'sayi', zorunlu: 1, min: 1, max: 60, tam: 1, ipucu: 'Gerekmesine bu kadar gün kalan ve tarihi olmayan sipariş yok sayılır' },
        ],
        adimlar: [{ ad: 'Malzeme', ne: 'Tedarikçi tarih vermeden planın varsaydığı süre.', k: ['katMal', 'ekMal'] }, { ad: 'Fason', k: ['katFas', 'ekFas'] }, { ad: 'Zorunlu tarih', k: ['esik'] }],
        ilk: () => { const A = tmAyar(); return Object.fromEntries(['katMal', 'ekMal', 'katFas', 'ekFas', 'esik'].map(k => [k, String(A[k])])); },
        kontrol: (x, i, d) => { if (i !== -1) return null; const A = tmAyar(); return Object.keys(TM0).every(k => +x[k] === +A[k]) ? 'Hiçbir şey değişmedi.' : null; },
        sonuc: 'tarihi girilmemiş malzeme ve fason için tahmini süre yeniden hesaplanır.',
        kaydet: x => { const A = tmAyar(); const d = Object.keys(TM0).filter(k => +x[k] !== +A[k]);
          return degistir('Varsayılan termin ayarı', d.map(k => `${k}: ${A[k]} → ${x[k]}`).join(', '), () => { S.D.terminAyar = { ...(S.D.terminAyar || {}), ...Object.fromEntries(d.map(k => [k, +x[k]])) }; }); },
        bitti: () => 'Tahmini süre ayarı kaydedildi' },
    ];
  },
};
const stkMalAnah = r => `${r.src == null ? 'y' : 'a' + r.src}:${r.kod}`;
function stkMalBul(a) { const v = tmMalzeme(); return v ? v.L.find(r => r.tm !== 'termin' && stkMalAnah(r) === a) || null : null; }

/* ---------- Termin ve kâr dengesi ---------- */
const STK_DENGE = [[0, 'Termin önce'], [25, 'Termine yakın'], [50, 'Dengeli'], [75, 'Kâra yakın'], [100, 'Kâr önce']];
const stkDengeEtkin = () => ymAyar().amac === 'tl' && agAyar().kip === 'bedel';
SADE.denge = {
  ad: 'Termin ve kâr dengesi', simge: 'gauge',
  ne: () => agFiyatGorur() ? 'Plan termine mi kâra mı öncelik versin; müşteriye hangi termini söz verebilirsiniz.' : 'Müşteriye hangi termini söz verebilirsiniz; hangi siparişte termin uzatmak planı rahatlatır.',
  durum() {
    const d = pdDenge(); const gec = sdGecikenler(); const P = U.pdSec && U.pdSec.dv === S.dataVer ? U.pdSec : null;
    const k = [
      { simge: 'gauge', ad: 'Plan dengesi', deger: pdAd(d), ton: stkDengeEtkin() ? '' : 'uyari', not: stkDengeEtkin() ? `bir saat gecikme ${pdKatYaz(d)} önemli sayılır` : 'şimdiki ayarlarda etkisiz' },
      { simge: 'clock', ad: 'Geç bitecek sipariş', deger: S.plan ? sayi(gec.length, 0) : null, ton: S.plan ? (gec.length ? 'hata' : 'tamam') : '', not: S.plan ? (gec.length ? `en çok ${gec[0].s.id}` : 'hepsi zamanında') : 'plan yok' },
      { simge: 'layers', ad: 'Plan seçenekleri', deger: P ? sayi(P.l.length, 0) : null, not: U.pdIs ? pdIsYaz() : P ? 'hesaplandı, karşılaştırılabilir' : 'henüz hesaplanmadı' },
    ];
    if (agFiyatGorur() && P) { const en = P.l.reduce((a, x) => x.o.net > a.o.net ? x : a, P.l[0]); k.push({ simge: 'lira', ad: 'En kârlı seçenek', deger: pdAd(en.d), not: agTL(en.o.net) + ' net kâr' }); }
    return k;
  },
  yapilacak() {
    const l = []; const fg = agFiyatGorur(); const veri = yetkili('veri.yaz');
    if (!S.plan) { l.push({ simge: 'play', metin: 'Henüz plan yok', neden: 'Seçenekler ve teklif bugünkü planın üstünde denenir.', act: stkYaz() ? 'coz' : null, v: 'sifir', dugme: 'Planı kur', dsimge: 'play', birincil: true }); return l; }
    if (U.pdIs) l.push({ simge: 'cpu', metin: pdIsYaz(), neden: 'Hesap bitince sonuç Tüm ayrıntılar sekmesinde görünür.' });
    const P = U.pdSec && U.pdSec.dv === S.dataVer ? U.pdSec : null;
    if (!U.pdIs) {
      if (P) l.push({ simge: 'layers', metin: 'Plan seçenekleri hazır', neden: fg ? 'Termin önce, dengeli ve kâr önce planları yan yana görün; birini seçip çalışmaya alabilirsiniz.' : 'Üç planın kaç siparişi geciktirdiğini yan yana görün.', act: 'sd-sek', v: 'denge:tum', dugme: 'Karşılaştır', dsimge: 'eye', birincil: true });
      else l.push({ simge: 'layers', metin: 'Üç plan seçeneğini hesapla', neden: 'Aynı veriyle termin önce, dengeli ve kâr önce planlar kurulur. Birkaç saniye sürer.', act: calisan ? null : 'pd-secenek', dugme: 'Hesapla', dsimge: 'play' });
    }
    const gec = sdGecikenler(); const Z = U.pdUz && U.pdUz.dv === S.dataVer ? U.pdUz : null;
    if (Z && Z.sat.length) { for (const x of Z.sat.filter(x => x.dNet != null ? x.dNet > 0.5 : x.dSa > 0.05).slice(0, 2)) l.push({ simge: 'flag', ton: 'uyari', metin: `${x.id} için ${Z.gun} gün termin uzatması planı rahatlatır`, neden: `Plandaki toplam gecikme ${sayi(Math.abs(x.dSa), 1)} sa ${x.dSa >= 0 ? 'azalır' : 'artar'}. Müşteri kabul ederse uzatın.`, act: veri ? 'pd-uz-al' : null, v: `${x.id}|${Z.gun}`, dugme: 'Müşteri kabul etti', dsimge: 'check' }); }
    else if (gec.length && !U.pdIs) l.push({ simge: 'clock', ton: 'hata', metin: `${gec.length} sipariş geç bitiyor`, neden: 'Hangi siparişte termin uzatmanın planı en çok rahatlattığını hesaplayın; müşteriyle konuşmak için dayanak olur.', act: calisan ? null : 'pd-uzat', dugme: 'Uzatma öner', dsimge: 'play' });
    const hv = S.D.siparisler.find(s => s.havuz);
    if (hv && !U.pdIs) l.push({ simge: 'tag', metin: `${hv.id} teklif aşamasında (havuzda)`, neden: 'Söz verilebilecek en erken termini ve daha geç seçenekleri hesaplayın; plan değişmez.', act: calisan ? null : 'pd-teklif', v: hv.id, dugme: 'Termin seçenekleri', dsimge: 'play' });
    if (fg && !stkDengeEtkin()) l.push({ simge: 'alert', ton: 'uyari', metin: 'Denge ayarı şu an plana etki etmiyor', neden: 'Etki için Maliyetler sayfasında plan amacı "Tek TL toplamı", Öncelik ve ağırlık sayfasında kip "bedel" olmalı.', act: 'git', v: 'maliyet', dugme: 'Maliyetler', dsimge: 'lira' });
    return l;
  },
  nasil: [
    'Plan, geç kalmanın bedeli ile üretim maliyetinin toplamını en aza indirir.',
    '"Termin önce" seçilirse plan pahalı yoldan da olsa siparişi yetiştirmeye çalışır; "Kâr önce" seçilirse ucuz yolu seçer, gecikmeyi kabul eder.',
    'Dengeyi müdür ve yönetici seçer; kâr ve tutarlar yalnız onlarda görünür.',
    'Teklif: havuzdaki bir siparişe söz verilebilecek en erken tarih ve daha geç seçenekler bugünkü planın üstünde denenir; plan değişmez.',
    'Termin uzatma: geç kalan siparişlerde termini birkaç gün uzatmanın plana etkisi hesaplanır. Termin ancak müşteri kabul ederse değişir.',
  ],
  formlar() {
    return [
      { id: 'denge', ad: 'Dengeyi seç', simge: 'gauge', ne: 'Termin mi kâr mı önce gelsin.', yetki: () => agFiyatGorur() && yetkili('plan.kilitle'),
        alanlar: () => { const d = pdDenge(); const l = STK_DENGE.some(([v]) => v === d) ? STK_DENGE : [...STK_DENGE, [d, pdAd(d)]].sort((a, b) => a[0] - b[0]);
          return [{ k: 'd', ad: 'Denge', tur: 'secim', zorunlu: 1, sayisal: 1, secenek: () => l.map(([v, ad]) => [v, `${ad} · bir saat gecikme ${pdKatYaz(v)} önemli`]), ipucu: stkDengeEtkin() ? 'Ortadaki Dengeli, gecikmeyi gerçek bedeliyle sayar' : 'Şimdiki ayarlarda etkisiz; plan amacı "Tek TL toplamı", kip "bedel" olmalı' }]; },
        adimlar: [{ ad: 'Denge', ne: 'Termine kaydıkça plan gecikmeyi daha pahalı sayar.', k: ['d'] }],
        ilk: () => ({ d: String(pdDenge()) }),
        kontrol: (x, i) => (i === 0 || i === -1) && +x.d === pdDenge() ? 'Hiçbir şey değişmedi.' : null,
        sonuc: 'yeni denge plana bir sonraki çözümde girer.',
        kaydet: x => { const d = +x.d, d0 = pdDenge(); return degistir('Plan dengesi değişti', `${pdAd(d0)} ${pdKatYaz(d0)} → ${pdAd(d)} ${pdKatYaz(d)}`, () => { S.D.planDenge = d; }, 'plan.kilitle'); },
        bitti: x => `Denge ${pdAd(+x.d)} oldu` },
      { id: 'uzat', ad: 'Termin uzatmasını gir', simge: 'flag', ne: 'Müşteri termini birkaç gün uzatmayı kabul ettiğinde.', yetki: 'veri.yaz',
        alanlar: () => { const p = S.plan; const gec = s => p && p.J[s.id] && p.J[s.id].T > 0.05 ? p.J[s.id].T : 0;
          const L = S.D.siparisler.filter(s => !s.havuz && parseT(S.D, s.termin) != null).sort((a, b) => gec(b) - gec(a));
          return [
            { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: 1, secenek: () => L.map(s => [s.id, `${s.id} · termin ${stkGun(parseT(S.D, s.termin))}${gec(s) ? ` · ${sayi(gec(s), 1)} sa geç` : ''}`]) },
            { k: 'gun', ad: 'Kaç gün uzasın', tur: 'secim', zorunlu: 1, sayisal: 1, secenek: () => [1, 2, 3, 5].map(g => [g, `${g} gün`]) },
          ]; },
        adimlar: [{ ad: 'Hangi sipariş', ne: 'Geç bitenler başta.', k: ['sip'] }, { ad: 'Kaç gün', ne: 'Müşterinin kabul ettiği uzatma.', k: ['gun'] }],
        ilk: () => ({ gun: '2' }),
        sonuc: 'siparişin termini uzatılır; plan yeniden çözülünce yeni terminle yerleşir.',
        kaydet: x => { const s = S.D.siparisler.find(z => z.id === x.sip); const t = s && parseT(S.D, s.termin); if (t == null) return false;
          return degistir('Termin uzatıldı', `${s.id}: ${s.termin} → ${tmYaz(t + +x.gun * 24)} (müşteri kabul etti)`, () => { s.termin = tmYaz(t + +x.gun * 24); U.pdUz = null; }); },
        bitti: x => `${x.sip} termini ${x.gun} gün uzadı` },
    ];
  },
};

/* ---------- Yıllık plan ---------- */
let stkYlC = { v: -1, x: null };
const stkYlV = () => { if (stkYlC.v !== S.dataVer || stkYlC.s !== S) { let x = null; try { x = ylVeri(); } catch (e) { console.error(e); } stkYlC = { v: S.dataVer, s: S, x }; } return stkYlC.x; };
function stkYlAylar() { const b = new Date(baseMs(S.D)); const l = []; for (let i = 0; i < 13; i++) { const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + i, 1)); l.push([`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, `${OL_AY[d.getUTCMonth()]} ${d.getUTCFullYear()}`]); } return l; }
function stkYlOzet() {
  const y = U.yl; if (!y || y.durum !== 'bitti' || y.anah !== ylAnah()) return null;
  const { v, P, sonuc: s } = y; const F = v.aileler, G = v.gruplar;
  const topD = F.reduce((a, f) => a + s.aile[f].reduce((b, x) => b + x.d, 0), 0);
  const zam = topD > 0 ? 1 - F.reduce((a, f) => a + s.aile[f].reduce((b, x, t) => b + Math.max(0, x.B - (t ? s.aile[f][t - 1].B : 0)), 0), 0) / topD : null;
  const acil = G.reduce((a, g) => a + s.grup[g].reduce((b, x) => b + x.e, 0), 0);
  const mesai = G.reduce((a, g) => a + s.grup[g].reduce((b, x) => b + x.o, 0), 0);
  const gr = G.map(g => { const l = s.grup[g]; const kap = l.reduce((a, x) => a + x.kap, 0); return { g, ort: kap > 0 ? l.reduce((a, x) => a + x.yuk, 0) / kap : null, e: l.reduce((a, x) => a + x.e, 0) }; }).sort((a, b) => b.e - a.e || (b.ort ?? 0) - (a.ort ?? 0));
  return { topD, zam, acil, mesai, gr, yat: s.yat, P };
}
SADE.yillik = {
  ad: 'Yıllık plan', simge: 'chart',
  ne: 'Önümüzdeki bir yılda hangi tezgâh grubunun yeteceğini, nerede ek mesai ya da yeni tezgâh gerektiğini kabaca gösterir.',
  durum() {
    const y = U.yl; const A = ylAyar(); const o = stkYlOzet(); const bayat = y && y.anah !== ylAnah();
    const dr = !y ? ['çözülmedi', 'uyari', 'Yıllık planı çöz ile hesaplanır'] : y.durum === 'hesap' ? ['hesaplanıyor', '', y.adim || ''] : y.durum === 'hata' ? ['çözülemedi', 'hata', y.hata] : bayat ? ['eski', 'uyari', 'veri ya da varsayım değişti'] : ['güncel', 'tamam', `${o.P.length} dönem`];
    const k = [{ simge: 'chart', ad: 'Yıllık plan', deger: dr[0], ton: dr[1], not: dr[2] },
      { simge: 'edit', ad: 'Talep tahmini', deger: A.tahmin === 'elle' ? 'Elle' : 'Geçmişten', not: A.tahmin === 'elle' ? 'aylık adetler elle girilir' : `yıllık büyüme %${sayi(A.buyume || 0, 0)}` }];
    if (o) {
      k.push({ simge: 'check', ad: 'Zamanında karşılanan', deger: o.zam == null ? null : `%${sayi(o.zam * 100, 1)}`, ton: o.zam != null && o.zam < 0.95 ? 'uyari' : 'tamam', not: `${sayi(o.topD, 0)} adet yıllık talep` });
      k.push({ simge: 'alert', ad: 'Kapasite açığı', deger: `${sayi(o.acil, 0)} sa`, ton: o.acil > 0.5 ? 'hata' : 'tamam', not: o.acil > 0.5 ? `en çok ${o.gr[0].g}` : o.mesai > 0.5 ? `${sayi(o.mesai, 0)} sa ek mesaiyle yetiyor` : 'kapasite yetiyor' });
      if (o.gr.length) k.push({ simge: 'gauge', ad: 'En yüklü grup', deger: o.gr.slice().sort((a, b) => (b.ort ?? 0) - (a.ort ?? 0))[0].g, not: `ortalama %${sayi((o.gr.slice().sort((a, b) => (b.ort ?? 0) - (a.ort ?? 0))[0].ort || 0) * 100, 0)} dolu` });
    }
    return k;
  },
  yapilacak() {
    const l = []; const y = U.yl; const A = ylAyar(); const o = stkYlOzet(); const yaz = yetkili('plan.kilitle');
    if (y && y.durum === 'hesap') { l.push({ simge: 'cpu', metin: 'Yıllık plan hesaplanıyor', neden: y.adim || '' }); return l; }
    if (A.tahmin === 'elle' && !Object.values(A.elle || {}).some(m => Object.keys(m || {}).length)) l.push({ simge: 'edit', ton: 'uyari', metin: 'Elle tahmin seçili ama hiç adet girilmedi', neden: 'Boş ay tahminsiz sayılır; yalnız eldeki siparişler hesaba girer.', act: yaz ? 'sd-form' : null, v: 'yillik:elle', dugme: 'Tahmin gir', dsimge: 'edit', birincil: true });
    if (!o) { l.push({ simge: 'play', ton: y && y.durum === 'hata' ? 'hata' : 'uyari', metin: !y ? 'Yıllık plan henüz hesaplanmadı' : y.durum === 'hata' ? 'Yıllık plan çözülemedi' : 'Yıllık plan eski', neden: 'Bir yıllık talebe göre tezgâh gruplarının yükü hesaplanır; birkaç saniye sürer.', act: 'yl-coz', dugme: 'Yıllık planı çöz', dsimge: 'cpu', birincil: true }); return l; }
    for (const g of o.gr.filter(x => x.e > 0.5).slice(0, 2)) l.push({ simge: 'alert', ton: 'hata', metin: `${g.g} grubunda kapasite yetmiyor`, neden: `Ek mesai ve yatırımla da karşılanmayan ${sayi(g.e, 0)} sa yük var. Hangi dönemde sıkıştığını ayrıntıda görün.`, act: 'sd-sek', v: 'yillik:tum', dugme: 'Ayrıntı', dsimge: 'eye' });
    for (const x of o.yat.slice(0, 2)) l.push({ simge: 'cpu', ton: 'uyari', metin: `${x.g} grubuna bir tezgâh önerisi`, neden: `${o.P[x.t].uzun} başından devreye girerse yıllık plan rahatlar.`, act: 'sd-sek', v: 'yillik:tum', dugme: 'Ayrıntı', dsimge: 'eye' });
    const h = A.hedef || ylHedefKur();
    if (A.hedef) l.push({ simge: 'target', ton: 'tamam', metin: 'Haftalık hedef planlama motorunda', neden: 'Öne üretilecek siparişler hedef haftaya çekildi. Kaldırırsanız motor yalnız terminlere bakar.', act: yaz ? 'yl-hedef' : null, v: '0', dugme: 'Hedefi kaldır', dsimge: 'x' });
    else if (h && h.hedef.length) l.push({ simge: 'target', metin: 'İleride kapasite yetmediği için bazı işler öne alınmalı', neden: `${h.hedef.length} hafta için öne üretim hedefi var. Motora verilince bu siparişler öne alınır.`, act: yaz ? 'yl-hedef' : null, v: '1', dugme: 'Hedefi motora ver', dsimge: 'target' });
    if (!l.length) l.push({ simge: 'check', ton: 'tamam', metin: 'Bir yıl boyunca kapasite yetiyor', neden: o.mesai > 0.5 ? `Toplam ${sayi(o.mesai, 0)} sa ek mesai ile.` : 'Ek mesai gerekmiyor.' });
    return l;
  },
  nasil: [
    'Ürünler ailelere, tezgâhlar gruplara toplanır; plan sıra değil, her dönemde ne kadar iş yapılabileceğini gösterir.',
    'İlk 13 hafta haftalık, sonrası aylık bakılır. Her dönemin talebi o döneme düşen sipariş ile tahminin büyüğüdür.',
    'Tahmin ya eldeki siparişlerin hızından (büyüme oranıyla) ya da sizin girdiğiniz aylık adetlerden gelir.',
    'Kapasite yetmezse önce ek mesai (sınıra kadar), sonra yeni tezgâh denenir; o da yetmezse "kapasite açığı" görünür.',
    'Varsayım ya da veri değişince plan eskir; yeniden çözün.',
  ],
  formlar() {
    const fg = agFiyatGorur();
    return [
      { id: 'varsayim', ad: 'Talep ve kapasite varsayımları', simge: 'gear', ne: 'Tahmin nereden gelsin, ek mesai ne kadar olsun.', yetki: 'plan.kilitle',
        alanlar: () => [
          { k: 'tahmin', ad: 'Talep tahmini', tur: 'secim', zorunlu: 1, secenek: () => [['gecmis', 'Geçmişten: eldeki siparişlerin hızı'], ['elle', 'Elle: aylık adetleri ben girerim']] },
          { k: 'buyume', ad: 'Yıllık büyüme (%)', tur: 'sayi', zorunlu: 1, min: -50, max: 200, adim: 1, ipucu: 'Yalnız Geçmişten tahmininde kullanılır' },
          { k: 'mesaiMaks', ad: 'Ek mesai sınırı (kapasitenin %)', tur: 'sayi', zorunlu: 1, min: 0, max: 60, adim: 1 },
          { k: 'yatirim', ad: 'Yeni tezgâh önerilsin mi', tur: 'secim', zorunlu: 1, secenek: () => [['true', 'Evet, dene'], ['false', 'Hayır']] },
          ...(fg ? [{ k: 'teslimAy', ad: 'Yeni tezgâh en erken kaçıncı ay gelir', tur: 'sayi', zorunlu: 1, min: 1, max: 12, tam: 1 },
            { k: 'gecTL', ad: 'Geç teslim bedeli (değerin %/gün)', tur: 'sayi', zorunlu: 1, min: 0, max: 5, adim: 0.01 },
            { k: 'stokTL', ad: 'Stok taşıma (değerin %/ay)', tur: 'sayi', zorunlu: 1, min: 0, max: 20, adim: 0.1 }] : []),
        ],
        adimlar: [{ ad: 'Talep', ne: 'Gelecek talep nereden tahmin edilsin.', k: ['tahmin', 'buyume'] }, { ad: 'Kapasite', ne: 'Kapasite yetmezse plan önce ek mesai, sonra yeni tezgâh dener.', k: fg ? ['mesaiMaks', 'yatirim', 'teslimAy'] : ['mesaiMaks', 'yatirim'] }, ...(fg ? [{ ad: 'Bedeller', ne: 'Geç teslim ve stokta bekleme ne kadar pahalı.', k: ['gecTL', 'stokTL'] }] : [])],
        ilk: () => { const A = ylAyar(); return { tahmin: A.tahmin, buyume: String(A.buyume ?? 0), mesaiMaks: String(A.mesaiMaks), yatirim: String(!!A.yatirim), teslimAy: String(A.teslimAy ?? 3), gecTL: String(A.gecTL), stokTL: String(A.stokTL) }; },
        kontrol: (x, i) => i === -1 && !stkYlFark(x).length ? 'Hiçbir şey değişmedi.' : null,
        sonuc: 'yıllık plan eskir; yeniden çözünce yeni varsayımlarla hesaplanır.',
        kaydet: x => { const d = stkYlFark(x); const A = ylAyar();
          return degistir('Yıllık plan ayarı', d.map(([k, v]) => `${k}: ${A[k]} → ${v}`).join(', '), () => { for (const [k, v] of d) A[k] = v; }, 'plan.kilitle', { planKoru: true }); },
        bitti: () => 'Yıllık plan varsayımları kaydedildi' },
      { id: 'elle', ad: 'Aylık talep tahmini gir', simge: 'edit', ne: 'Bir ürün ailesi için önümüzdeki 13 ayın adedi.', yetki: 'plan.kilitle',
        alanlar: () => { const v = stkYlV(); const A = ylAyar(); const f = U.sdForm && U.sdForm.deg ? U.sdForm.deg.aile : null; const hiz = v && f ? Math.round((v.haftalik[f] || 0) * 4.33) : null;
          return [
            { k: 'aile', ad: 'Ürün ailesi', tur: 'secim', zorunlu: 1, secenek: () => (v ? v.aileler : []).map(a => [a, `${a} · ${S.D.urunler.filter(u => v.urunAile[u.id] === a).map(u => u.id).join(', ')}`]) },
            ...stkYlAylar().map(([, ad], i) => ({ k: 'm' + i, ad: `${ad} (adet)`, tur: 'sayi', min: 0, max: 1e6, tam: 1, ipucu: hiz != null && i === 0 ? `Şimdiki hız ayda yaklaşık ${sayi(hiz, 0)} adet; boş ay tahminsiz sayılır` : '' })),
            ...(A.tahmin !== 'elle' ? [{ k: 'kullan', ad: 'Yıllık planda elle tahmini kullan', tur: 'evet', vars: true }] : []),
          ]; },
        adimlar: [{ ad: 'Hangi aile', k: ['aile'] }, { ad: 'Aylık adetler', ne: 'Girilmiş adetler dolu geldi; boş bırakılan ay tahminsiz sayılır.', k: [...stkYlAylar().map((_, i) => 'm' + i), ...(ylAyar().tahmin !== 'elle' ? ['kullan'] : [])] }],
        ilk: () => (ylAyar().tahmin !== 'elle' ? { kullan: true } : {}),
        ileri: (d, i) => { if (i !== 0) return; const e = ylAyar().elle[d.aile] || {}; stkYlAylar().forEach(([k], j) => { d['m' + j] = e[k] == null ? '' : String(e[k]); }); },
        kontrol: (x, i) => i === -1 && !stkYlAylar().some((_, j) => x['m' + j] != null) && !x.kullan ? 'En az bir ay için adet girin.' : null,
        sonuc: 'tahmin kaydedilir; yıllık plan yeniden çözülünce kullanılır.',
        kaydet: x => { const A = ylAyar(); const f = x.aile; const ay = stkYlAylar();
          return degistir('Elle tahmin', `${f}: ${ay.map(([k], j) => x['m' + j] == null ? null : `${k} ${x['m' + j]}`).filter(Boolean).join(', ') || 'boş'}${x.kullan ? ', elle tahmin seçildi' : ''}`, () => {
            const e = { ...(A.elle[f] || {}) }; ay.forEach(([k], j) => { if (x['m' + j] == null) delete e[k]; else e[k] = x['m' + j]; }); A.elle[f] = e; if (x.kullan) A.tahmin = 'elle'; }, 'plan.kilitle', { planKoru: true }); },
        bitti: x => `${x.aile} tahmini kaydedildi` },
    ];
  },
};
function stkYlFark(x) {
  const A = ylAyar(); const d = [];
  for (const k of ['tahmin', 'buyume', 'mesaiMaks', 'yatirim', 'teslimAy', 'gecTL', 'stokTL']) { if (x[k] === undefined || x[k] === null) continue;
    const v = k === 'tahmin' ? x[k] : k === 'yatirim' ? x[k] === 'true' : +x[k]; if (v !== A[k]) d.push([k, v]); }
  return d;
}

/* ---------- Sevkiyat ---------- */
function stkSv() {
  const v = svListe(); if (!v) return null; const l = v.L.filter(x => x.C != null);
  const gun = svAnahtar(mpTarih(v.now), 'gun')[0], hafta = svAnahtar(mpTarih(v.now), 'hafta')[0];
  const gec = l.filter(x => x.T > 0.05); const son = l.filter(x => !(x.T > 0.05) && x.due != null && x.due - x.C < 24);
  const sv = S.sevkEdildi || {}; const sevk = l.filter(x => sv[x.s.id] && sv[x.s.id].t);
  const hazir = l.filter(x => !(sv[x.s.id] && sv[x.s.id].t) && (svGercek(x) != null || x.bitti));
  return { v, l, gec, son, sevk, hazir, bugun: l.filter(x => svAnahtar(mpTarih(x.C), 'gun')[0] === gun), buHafta: l.filter(x => svAnahtar(mpTarih(x.C), 'hafta')[0] === hafta) };
}
SADE.sevkiyat = {
  ad: 'Sevkiyat', simge: 'truck',
  ne: 'Plana göre hangi sipariş hangi gün bitip sevke hazır olur, hangisi termini kaçırır.',
  durum() {
    const x = stkSv();
    if (!x) return [{ simge: 'truck', ad: 'Bu hafta bitecek', deger: null, not: 'plan yok' }, { simge: 'alert', ad: 'Termini geçecek', deger: null, not: 'plan yok' }];
    return [
      { simge: 'truck', ad: 'Bu hafta bitecek', deger: sayi(x.buHafta.length, 0), not: `bugün ${x.bugun.length}, planda toplam ${x.l.length} sipariş` },
      { simge: 'alert', ad: 'Termini geçecek', deger: sayi(x.gec.length, 0), ton: x.gec.length ? 'hata' : 'tamam', not: x.gec.length ? 'müşteriye haber verin' : 'yok' },
      { simge: 'clock', ad: 'Son gün bitecek', deger: sayi(x.son.length, 0), ton: x.son.length ? 'uyari' : '', not: 'termine 24 saatten az kala' },
      { simge: 'check', ad: 'Sevk edildi', deger: sayi(x.sevk.length, 0), ton: x.hazir.length ? 'uyari' : '', not: x.hazir.length ? `${x.hazir.length} sipariş bitti, sevk girilmedi` : 'sevk tarihi girilenler' },
    ];
  },
  yapilacak() {
    const l = []; const x = stkSv(); const veri = yetkili('veri.yaz');
    if (!S.plan) { l.push({ simge: 'play', metin: 'Henüz plan yok', neden: 'Bitiş günleri plandan çıkar.', act: stkYaz() ? 'coz' : null, v: 'sifir', dugme: 'Planı kur', dsimge: 'play', birincil: true }); return l; }
    if (!planGuncel()) l.push({ simge: 'rotate', ton: 'uyari', metin: 'Veri plandan sonra değişti', neden: 'Bitiş günleri eski veriyle hesaplı.', act: stkYaz() ? 'ekip' : null, dugme: 'Planı iyileştir', dsimge: 'play', birincil: true });
    if (!x) return l;
    if (x.hazir.length) l.push({ simge: 'truck', ton: 'uyari', metin: `${x.hazir.length} siparişin üretimi bitti, sevk tarihi girilmedi`, neden: `${x.hazir.slice(0, 3).map(z => z.s.id).join(', ')}${x.hazir.length > 3 ? '…' : ''}. Gönderince sevk tarihini girin.`, act: veri ? 'sd-form' : null, v: 'sevkiyat:sevk', dugme: 'Sevk gir', dsimge: 'check', birincil: true });
    for (const z of x.gec.slice().sort((a, b) => b.T - a.T).slice(0, 3)) l.push({ simge: 'alert', ton: 'hata', metin: `${z.s.id} termini ${saat(z.T)} geçecek`, neden: `${z.mu}, ${sayi(z.s.adet, 0)} adet. Termin ${stkGun(z.due)}, plana göre bitiş ${fmtDT(S.D, z.C)}. Müşteriye haber verin ya da tahtada öne alın.`, act: 'siparis-cizelge', v: z.s.id, dugme: 'Tahtada göster', dsimge: 'gantt' });
    if (x.bugun.length) l.push({ simge: 'flag', metin: `Bugün ${x.bugun.length} sipariş sevke hazır olacak`, neden: x.bugun.slice(0, 4).map(z => `${z.s.id} ${fmtDT(S.D, z.C).slice(-5)}`).join(', '), act: 'sd-sek', v: 'sevkiyat:tum', dugme: 'Listeyi aç', dsimge: 'list' });
    if (veri && !x.hazir.length && x.l.length) l.push({ simge: 'check', metin: 'Gönderilen siparişin sevk tarihini girin', neden: 'Sevk edilenler özet grafiğinde ayrı görünür.', act: 'sd-form', v: 'sevkiyat:sevk', dugme: 'Sevk gir', dsimge: 'check' });
    return l;
  },
  nasil: [
    'Her sipariş, son adımının plana göre bittiği güne düşer; sevkiyat o günden sonra yapılabilir.',
    'Bitiş termini geçiyorsa sipariş kırmızı görünür; müşteriye önceden haber verin.',
    'Plan değişince eski bitiş silinmez; Tüm ayrıntılar sekmesinde siparişin bitişinin nasıl kaydığı görünür.',
    'Gönderilen siparişin sevk tarihini girin; özet grafiğinde plan, termin ve sevk yan yana görünür.',
  ],
  formlar() {
    return [
      { id: 'sevk', ad: 'Sevk tarihi gir', simge: 'truck', ne: 'Gönderilen siparişi işaretleyin.', yetki: 'veri.yaz',
        alanlar: () => { const x = stkSv(); const sv = S.sevkEdildi || {};
          const L = x ? x.l.slice().sort((a, b) => (x.hazir.includes(b) ? 1 : 0) - (x.hazir.includes(a) ? 1 : 0) || a.C - b.C) : [];
          return [
            { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: 1, secenek: () => L.map(z => [z.s.id, `${z.s.id} · ${z.mu} · ${sayi(z.s.adet, 0)} adet · ${sv[z.s.id] && sv[z.s.id].t ? 'sevk ' + sv[z.s.id].t : x.hazir.includes(z) ? 'üretim bitti' : 'bitiş ' + stkGun(z.C)}`]) },
            { k: 't', ad: 'Sevk tarihi', tur: 'tarih', zorunlu: 1, ipucu: 'Siparişin gönderildiği gün' },
          ]; },
        adimlar: [{ ad: 'Hangi sipariş', ne: 'Üretimi bitenler başta.', k: ['sip'] }, { ad: 'Sevk tarihi', k: ['t'] }],
        ileri: (d, i) => { if (i !== 0) return; const sv = (S.sevkEdildi || {})[d.sip]; const c = cxAl(); d.t = sv && sv.t ? sv.t : c ? mpTarihGir(c.st.now) : ''; },
        kontrol: (x, i, d) => { if (i !== 1 && i !== -1) return null; const sv = (S.sevkEdildi || {})[x.sip || d.sip]; return sv && sv.t === x.t ? 'Hiçbir şey değişmedi.' : null; },
        sonuc: 'sipariş sevk edildi olarak işaretlenir; plan değişmez.',
        kaydet: x => { const id = x.sip; return degistir('Sevk tarihi girildi', `${id}: ${x.t}`, () => { const k = { ...(S.sevkEdildi || {}) }; k[id] = { t: x.t, kim: kim().ad }; S.sevkEdildi = k; }, 'veri.yaz', { planKoru: true }); },
        bitti: x => `${x.sip} ${x.t} günü sevk edildi` },
    ];
  },
};

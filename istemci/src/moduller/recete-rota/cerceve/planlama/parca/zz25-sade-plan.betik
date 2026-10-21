/* ---------- Sade sayfa: ek mesai, fason ve malzeme satın alma planı ----------
   Özet ilk ekrandır: ne öneriliyor, ne kadar tutar (yalnız müdür ve yönetici), gecikmeyi ne kadar azaltır, kimin onayı bekleniyor.
   Kayıtlar asıl sayfanın kullandığı yoldan geçer: aynı degistir mesajı, aynı yetki, aynı alanlar ya da aynı eylem. */
const sdGunYaz = t => t == null || !isFinite(t) ? '—' : fmtDT(S.D, t).slice(0, 9).trim();
const sdTlTop = l => l.reduce((a, x) => a + (+x || 0), 0);
/* bir eylemi sayfanın kendi işleyicisiyle çalıştırır; veri değiştiyse kayıt olmuştur */
function sdEylem(act, v) { const v0 = S.dataVer; tekEylem(act, String(v), null, null); return S.dataVer !== v0; }
function sdPlanIsleri(l, yaz) {
  if (!S.plan) { l.push({ simge: 'play', metin: 'Henüz plan yok', neden: 'Öneri plandan çıkar; önce plan kurulmalı.', act: yaz ? 'coz' : null, v: 'sifir', dugme: 'Planı kur', dsimge: 'play', birincil: true }); return false; }
  if (!planGuncel()) { l.push({ simge: 'rotate', ton: 'uyari', metin: 'Veri plandan sonra değişti', neden: 'Öneri için güncel plan gerekir.', act: yaz ? 'ekip' : null, dugme: 'Planı iyileştir', dsimge: 'play', birincil: true }); return false; }
  return true;
}

/* ---------- Ek mesai planı ---------- */
const sdMsOneri = () => { const m = U.ymMs; return m && m.liste && m.dv === S.dataVer ? m : null; };
const sdMsAd = a => `${a.m} · ${fmtDT(S.D, a.gun * 24).slice(0, 9).trim()} · ${a.vardiya}`;
function sdMsIhlal() { try { return msAtama().liste.filter(a => a.ihlal.length).length; } catch (e) { return null; } }
SADE.mesaiplan = {
  ad: 'Ek mesai planı', simge: 'clock',
  ne: () => agFiyatGorur() ? 'Hangi tezgâha ne zaman ek vardiya açılmalı, ne kadar tutar ve gecikmeyi ne kadar azaltır.' : 'Hangi tezgâha ne zaman ek vardiya açılmalı ve gecikmeyi ne kadar azaltır.',
  durum() {
    const D = S.D; const fg = agFiyatGorur(); const o = sdMsOneri(); const iyi = o ? o.liste.filter(a => a.net > 0) : [];
    const topH = S.ekMesai.reduce((a, e) => a + ymVH(D, e.vardiya), 0); const cx = cxAl(); const ih = sdMsIhlal();
    const k = [
      { simge: 'clock', ad: 'Planlı ek mesai', deger: `${sayi(topH, 1)} sa`, not: `${S.ekMesai.length} ek vardiya` },
      { simge: 'target', ad: 'Önerilen ek vardiya', deger: o ? sayi(iyi.length, 0) : null, ton: o ? (iyi.length ? 'uyari' : 'tamam') : '',
        not: o ? (iyi.length ? `gecikme ${saat(sdTlTop(iyi.map(a => a.dT)))} azalır` : 'açılması gereken yok') : U.ymMs && U.ymMs.run ? 'hesaplanıyor' : 'henüz hesaplanmadı' },
    ];
    if (fg) k.push({ simge: 'lira', ad: 'Önerilerin tutarı', deger: o ? agTL(sdTlTop(iyi.map(a => a.tl))) : null, not: o && iyi.length ? `net kazanç ${agTL(sdTlTop(iyi.map(a => a.net)))}` : `planlı mesai ${cx ? agTL(sdTlTop(S.ekMesai.map(e => ymMesaiTL(D, cx, e)))) : '—'}` });
    k.push({ simge: 'flag', ad: 'Onay', deger: o ? (iyi.length ? (ymKarar() ? 'sizde' : 'müdürde') : 'gerekmiyor') : null, not: o ? `${o.liste.length} denemeden ${iyi.length} tanesi kazandırıyor` : 'kararı müdür verir', ton: o && iyi.length ? 'uyari' : '' });
    k.push({ simge: 'user', ad: 'Kişi sınırı aşımı', deger: ih == null ? null : sayi(ih, 0), not: ih ? 'ek vardiyada sınır aşımı ya da eksik kişi' : ih == null ? '' : 'ek vardiyalar uygun', ton: ih ? 'hata' : ih == null ? '' : 'tamam' });
    return k;
  },
  yapilacak() {
    const l = []; const fg = agFiyatGorur(); const kr = ymKarar() && yetkili('plan.kilitle');
    if (sdPlanIsleri(l, yetkili('plan.yaz'))) {
      const o = sdMsOneri();
      if (U.ymMs && U.ymMs.run) l.push({ simge: 'cpu', metin: 'Öneriler hesaplanıyor', neden: U.ymMs.run });
      else if (!o) l.push({ simge: 'target', metin: 'Ek mesai önerilerini hesapla', neden: 'Plan gecikmeye yol açan tezgâhlara ek vardiya açmayı tek tek dener ve gecikmenin ne kadar azaldığını ölçer. Birkaç saniye sürer.', act: 'ym-mesai-oner', dugme: 'Hesapla', dsimge: 'play', birincil: true });
      else {
        const iyi = o.liste.map((a, i) => ({ a, i })).filter(x => x.a.net > 0);
        for (const { a, i } of iyi.slice(0, 3)) l.push({ simge: 'clock', ton: 'uyari', metin: `${sdMsAd(a)}: ek vardiya açılsın`, neden: `Gecikme ${saat(a.dT)} azalır${fg ? `; mesai ${agTL(a.tl)}, net kazanç ${agTL(a.net)}` : ''}.${kr ? '' : ' Kararı müdür verir.'}`, act: kr ? 'ym-mesai-kabul' : null, v: i, dugme: 'Kabul et', dsimge: 'check', birincil: true });
        if (!iyi.length) l.push({ simge: 'check', ton: 'tamam', metin: 'Açılması kârlı ek vardiya yok', neden: 'Ölçülen ek vardiyalar gecikmeyi tutarına değecek kadar azaltmıyor.' });
        if (kr && o.liste.length) l.push({ simge: 'flag', metin: 'Öneriyi reddet ya da diğerlerine bak', neden: 'Reddedilen öneri tekrar gelmez.', act: 'sd-form', v: 'mesaiplan:karar', dugme: 'Karar ver', dsimge: 'edit' });
      }
    }
    const ih = sdMsIhlal();
    if (ih) l.push({ simge: 'alert', ton: 'hata', metin: `${ih} ek vardiyada kişi sınırı aşılıyor`, neden: 'Vardiya bu hâliyle yasal ya da uygulanabilir olmayabilir; kimin geleceği Tüm ayrıntılar sekmesinde.', act: 'sd-sek', v: 'mesaiplan:tum', dugme: 'Ayrıntıya bak', dsimge: 'list' });
    return l;
  },
  nasil: [
    'Plan gecikmeye en çok yol açan tezgâhları bulur ve oralara ek vardiya açmayı tek tek dener.',
    'Her deneme için gecikmenin ne kadar azaldığı ölçülür. Müdür ve yönetici mesainin tutarını ve net kazancı da görür.',
    'Öneriyi müdür kabul ederse ek vardiya plana girer; plan yeniden kurulunca kullanılır. Reddedilen öneri tekrar gelmez.',
    'Planlamacı ek mesaiyi elle de ekleyebilir; elle girilen mesai listede "Elle girildi" diye görünür.',
    'Ek vardiyaya kimin geleceği, kişi ücretleri ve yasal sınırlar Tüm ayrıntılar sekmesindedir.',
  ],
  formlar() {
    const D = S.D; const fg = agFiyatGorur(); const o = sdMsOneri(); const m = mesSis(D);
    return [
      { id: 'ekle', ad: 'Ek mesai ekle', simge: 'plus', ne: 'Bir tezgâha belli bir gün ek vardiya açar.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'm', ad: 'Tezgâh', tur: 'secim', zorunlu: 1, secenek: () => D.tezgahlar.map(t => [t.id, `${t.id} · ${t.ad}`]) },
          { k: 'gun', ad: 'Gün', tur: 'tarih', zorunlu: 1 },
          { k: 'vardiya', ad: 'Vardiya', tur: 'secim', zorunlu: 1, secenek: () => D.vardiyalar.map(v => [v.id, `${v.id} · ${v.bas}-${v.bit} (${sayi(ymVH(D, v.id), 1)} sa)`]) },
        ],
        adimlar: [{ ad: 'Hangi tezgâh', k: ['m'] }, { ad: 'Ne zaman', ne: 'Ek vardiya o gün seçilen vardiyada tezgâhı, bir operatörü ve bir ayarcıyı açar.', k: ['gun', 'vardiya'] }],
        ilk: () => ({ gun: gunTarih(5), vardiya: (D.vardiyalar[0] || {}).id }),
        kontrol: (x, i, d) => { if (i === 0) return null; const g = gunIndeks(x.gun || d.gun); if (!(g >= 0 && g < HDAYS)) return 'Gün plan ufku içinde olmalı.';
          const mm = x.m || d.m, v = x.vardiya || d.vardiya; return S.ekMesai.some(e => e.m === mm && e.gun === g && e.vardiya === v) ? 'Bu ek mesai zaten var.' : null; },
        sonuc: 'ek vardiya listeye "Elle girildi" olarak eklenir; plan yeniden kurulunca kullanılır.',
        kaydet: x => { const g = gunIndeks(x.gun); return degistir('Ek mesai eklendi', `${x.m} ${x.gun} ${x.vardiya}`, () => { S.ekMesai.push({ m: x.m, gun: g, vardiya: x.vardiya }); }); },
        bitti: x => `${x.m} için ${x.gun} ${x.vardiya} ek vardiyası eklendi` },
      ...(o && o.liste.length ? [{ id: 'karar', ad: 'Öneriye karar ver', simge: 'flag', ne: 'Planın önerdiği ek vardiyayı kabul ya da reddedin.', yetki: () => ymKarar() && yetkili('plan.kilitle'),
        alanlar: () => [
          { k: 'oneri', ad: 'Öneri', tur: 'secim', zorunlu: 1, secenek: () => o.liste.map((a, i) => [String(i), `${sdMsAd(a)} · gecikme −${saat(a.dT)}${fg ? ` · net ${agTL(a.net)}` : ''}`]) },
          { k: 'karar', ad: 'Karar', tur: 'secim', zorunlu: 1, secenek: () => [['kabul', 'Kabul: ek vardiya açılsın'], ['red', 'Red: açılmasın, bir daha önerilmesin']] },
        ],
        adimlar: [{ ad: 'Hangi öneri', ne: 'Liste en çok kazandırandan başlar.', k: ['oneri'] }, { ad: 'Karar', k: ['karar'] }],
        ilk: () => ({ oneri: '0' }),
        ileri: (d, i) => { if (i !== 0) return; const a = o.liste[+d.oneri]; if (a && !d.karar) d.karar = a.net > 0 ? 'kabul' : 'red'; },
        sonuc: 'karar kaydedilir; kabul edilen ek vardiya plana girer.',
        kaydet: x => sdEylem(x.karar === 'kabul' ? 'ym-mesai-kabul' : 'ym-mesai-red', x.oneri),
        bitti: x => { const a = o.liste[+x.oneri]; return `${a ? sdMsAd(a) : 'Öneri'}: ${x.karar === 'kabul' ? 'kabul edildi' : 'reddedildi'}`; } }] : []),
      ...(fg && D.personel.length ? [{ id: 'kisi', ad: 'Kişi ücreti ve yapılan mesai', simge: 'user', ne: 'Ek vardiyanın bedeli ve yıllık sınır bunlardan hesaplanır.', yetki: 'plan.kilitle',
        alanlar: () => [
          { k: 'p', ad: 'Kişi', tur: 'secim', zorunlu: 1, secenek: () => D.personel.map(p => [p.id, `${p.ad} · ${p.vardiya}`]) },
          { k: 'brut', ad: 'Brüt aylık ücret (TL)', tur: 'sayi', min: 0, adim: 500 },
          { k: 'yil', ad: 'Bu yıl yaptığı fazla mesai (sa)', tur: 'sayi', min: 0, max: 2000, ipucu: 'Bordrodan' },
        ],
        adimlar: [{ ad: 'Hangi kişi', k: ['p'] }, { ad: 'Ücret ve mesai', ne: 'Şimdiki değer dolu geldi; yalnız değişeni düzeltin.', k: ['brut', 'yil'] }],
        ileri: (d, i) => { if (i !== 0) return; const u = (m.ucret || {})[d.p] || {}; d.brut = u.brut == null ? '' : String(u.brut); d.yil = u.yil == null ? '' : String(u.yil); },
        kontrol: (x, i, d) => { if (i === 0) return null; const u = (m.ucret || {})[x.p || d.p] || {}; return (x.brut ?? null) === (u.brut ?? null) && (x.yil ?? null) === (u.yil ?? null) ? 'Hiçbir şey değişmedi.' : null; },
        sonuc: 'ek vardiyanın bedeli ve kişinin yıllık sınırı yeniden hesaplanır.',
        kaydet: x => { const mm = mesSis(); const u = (mm.ucret[x.p] = mm.ucret[x.p] || {}); let ok = true;
          if ((x.brut ?? null) !== (u.brut ?? null)) ok = degistir('Kişi ücreti', `${x.p}: ${agTL(u.brut)} → ${agTL(x.brut)}`, () => { u.brut = x.brut; }, 'plan.kilitle');
          if (ok && (x.yil ?? null) !== (u.yil ?? null)) ok = msDeg('Yapılan fazla mesai', `${x.p}: ${u.yil ?? 0} → ${x.yil ?? 0} sa`, () => { u.yil = x.yil; });
          return ok; },
        bitti: x => `${(D.personel.find(p => p.id === x.p) || {}).ad || x.p} kaydedildi` }] : []),
    ];
  },
};

/* ---------- Fason planı ---------- */
const sdFsOneri = () => { const m = U.ymFs; return m && m.liste && m.dv === S.dataVer ? m : null; };
function sdFsAdaylar() {
  const p = S.plan; const cx = cxAl(); if (!p || !cx) return []; const k = S.D.fasonKarar || {};
  return Object.values(p.ops).filter(r => { const o = cx.byId[r.id]; return o && !r.done && !r.act && (k[r.id] || o.c.some(c => c.opt)); }).sort((a, b) => a.S - b.S).map(r => ({ r, o: cx.byId[r.id], k: k[r.id] }));
}
SADE.fasonplan = {
  ad: 'Fason planı', simge: 'truck',
  ne: () => agFiyatGorur() ? 'Hangi iş dışarıda (fasonda) yapılmalı, ne zaman döner, ne kadar tutar ve gecikmeyi ne kadar azaltır.' : 'Hangi iş dışarıda (fasonda) yapılmalı, ne zaman döner ve gecikmeyi ne kadar azaltır.',
  durum() {
    const fg = agFiyatGorur(); const p = S.plan; const cx = cxAl(); const o = sdFsOneri(); const iyi = o ? o.liste.filter(a => a.net > 0) : [];
    const fas = p && cx ? Object.values(p.ops).filter(r => r.fas) : null; const tf = tmFason();
    const bos = tf ? tf.L.filter(x => x.T == null) : null; const yakin = bos ? bos.filter(x => x.yakin).length : 0;
    const azal = iyi.filter(a => a.yon === 'disari').reduce((s, a) => s + Math.max(0, a.dT), 0);
    const k = [
      { simge: 'truck', ad: 'Fasondaki iş', deger: fas ? sayi(fas.length, 0) : null, not: fas ? (n => `${fas.length - n} rotada fason${n ? `, ${n} tanesini plan seçti` : ''}`)(fas.filter(r => r.m === '@' + cx.A.fasonTalas).length) : 'plan yok' },
      { simge: 'flag', ad: 'Dönüş termini eksik', deger: bos ? sayi(bos.length, 0) : null, ton: bos ? (yakin ? 'hata' : bos.length ? 'uyari' : 'tamam') : '', not: bos ? (yakin ? `${yakin} tanesi bir hafta içinde çıkıyor` : bos.length ? 'fasoncudan tarih alın' : 'hepsinin termini var') : '' },
      { simge: 'target', ad: 'Öneri', deger: o ? sayi(iyi.length, 0) : null, ton: o ? (iyi.length ? 'uyari' : 'tamam') : '', not: o ? (azal > 0.05 ? `gecikme ${saat(azal)} azalır` : iyi.length ? 'fasonda kalsın önerisi' : 'değişiklik gerekmiyor') : U.ymFs && U.ymFs.run ? 'hesaplanıyor' : 'henüz hesaplanmadı' },
    ];
    if (fg) k.push({ simge: 'lira', ad: 'Fason tutarı', deger: fas ? agTL(sdTlTop(fas.map(r => ymFasonTL(cx, r)))) : null, not: o && iyi.length ? `öneri net kazanç ${agTL(sdTlTop(iyi.map(a => a.net)))}` : 'taşıma dahil' });
    k.push({ simge: 'user', ad: 'Onay', deger: o ? (iyi.length ? (ymKarar() ? 'sizde' : 'müdürde') : 'gerekmiyor') : null, not: o ? `${o.liste.length} denemeden ${iyi.length} tanesi kazandırıyor` : 'kararı müdür verir', ton: o && iyi.length ? 'uyari' : '' });
    return k;
  },
  yapilacak() {
    const l = []; const fg = agFiyatGorur(); const kr = ymKarar() && yetkili('plan.kilitle'); const yaz = yetkili('veri.yaz');
    const tf = tmFason();
    const bos = tf ? tf.L.filter(x => x.T == null && x.yakin) : [];
    if (bos.length) { const x = bos[0]; l.push({ simge: 'flag', ton: 'hata', metin: bos.length > 1 ? `${bos.length} fason işinin dönüş termini girilmedi` : `${x.id} fason dönüş termini girilmedi`, neden: `${bos.length > 1 ? 'İlki ' : ''}${x.id}: ${x.f.ad || x.r.m}, çıkış ${sdGunYaz(x.r.S)}. Bir hafta içinde çıkıyor; termin yoksa dönüş tahminle hesaplanır.${yaz ? '' : ' Termini planlamacı girer.'}`, act: yaz ? 'sd-form' : null, v: 'fasonplan:termin', dugme: 'Termin gir', dsimge: 'edit' }); }
    if (sdPlanIsleri(l, yetkili('plan.yaz'))) {
      const o = sdFsOneri();
      if (U.ymFs && U.ymFs.run) l.push({ simge: 'cpu', metin: 'Öneriler hesaplanıyor', neden: U.ymFs.run });
      else if (!o) l.push({ simge: 'target', metin: 'Fason önerilerini hesapla', neden: 'Plan, tezgâhı dolu olan işleri tek tek fasona vermeyi dener ve gecikmenin ne kadar azaldığını ölçer. Birkaç saniye sürer.', act: 'ym-fason-oner', dugme: 'Hesapla', dsimge: 'play', birincil: true });
      else {
        const iyi = o.liste.map((a, i) => ({ a, i })).filter(x => x.a.net > 0);
        for (const { a, i } of iyi.slice(0, 3)) { const dis = a.yon === 'disari';
          l.push({ simge: 'truck', ton: 'uyari', metin: dis ? `${a.id} fasona verilsin` : `${a.id} fasonda kalsın`, neden: `${a.ad}, ${sayi(a.adet, 0)} adet. ${dis ? `Gecikme ${saat(Math.max(0, a.dT))} azalır` : `İçeride yapılırsa gecikme ${saat(Math.abs(a.dT))} artar`}${fg ? `; fason ${agTL(a.fasonTL)}, net kazanç ${agTL(a.net)}` : ''}.${kr ? '' : ' Kararı müdür verir.'}`, act: kr ? 'ym-fason-kabul' : null, v: i, dugme: 'Fasona ver', dsimge: 'check', birincil: true }); }
        if (!iyi.length) l.push({ simge: 'check', ton: 'tamam', metin: 'Fasona verilmesi kârlı iş yok', neden: 'Ölçülen işlerde fason gecikmeyi tutarına değecek kadar azaltmıyor.' });
        if (kr && o.liste.length) l.push({ simge: 'flag', metin: 'Bir işi fasona ver ya da içeride yaptır', neden: 'Önerilmeyen işler için de karar verebilirsiniz.', act: 'sd-form', v: 'fasonplan:karar', dugme: 'Karar ver', dsimge: 'edit' });
      }
    }
    return l;
  },
  nasil: [
    'Rotada "gerekirse fasona verilebilir" işaretli adımlar dışarıdaki bir atölyeye (fasoncuya) gönderilebilir.',
    'Plan, tezgâhı dolu olan işleri tek tek fasona vermeyi dener ve gecikmenin ne kadar azaldığını ölçer. Müdür ve yönetici tutarı ve net kazancı da görür.',
    'Kararı müdür verir: "Fasona ver" o adımı yalnız fasonda, "İçeride yap" yalnız tezgâhta planlatır. Karar yoksa plan kendisi seçer.',
    'Fasoncunun söylediği dönüş günü (termin) girilmelidir; girilmezse dönüş fasoncunun ortalama süresinden tahmin edilir.',
  ],
  formlar() {
    const fg = agFiyatGorur(); const tf = tmFason(); const ad = sdFsAdaylar();
    return [
      ...(tf && tf.L.length ? [{ id: 'termin', ad: 'Fason dönüş termini gir', simge: 'flag', ne: 'Fasoncunun söylediği dönüş günü.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'is', ad: 'Fasondaki iş', tur: 'secim', zorunlu: 1, secenek: () => tf.L.map(x => [x.id, `${x.id} · ${x.f.ad || x.r.m} · çıkış ${sdGunYaz(x.r.S)} · ${x.T == null ? 'termin yok' : 'termin ' + sdGunYaz(x.T)}`]) },
          { k: 't', ad: 'Dönüş günü', tur: 'tarih', zorunlu: 1, ipucu: 'Saat 16:00 sayılır' },
        ],
        adimlar: [{ ad: 'Hangi iş', ne: 'Termini olmayanlar "termin yok" yazar.', k: ['is'] }, { ad: 'Dönüş günü', ne: 'Girilen gün kesin süre sayılır; plan onu kullanır.', k: ['t'] }],
        ilk: () => { const x = tf.L.filter(z => z.T == null).sort((a, b) => b.yakin - a.yakin)[0]; return x ? { is: x.id } : {}; },
        ileri: (d, i) => { if (i !== 0) return; const x = tf.L.find(z => z.id === d.is); d.t = x ? mpTarihGir(x.T) : ''; },
        kontrol: (x, i, d) => { if (i === 0) return null; const z = tf.L.find(y => y.id === (x.is || d.is)); return z && z.T != null && mpTarihGir(z.T) === x.t ? 'Hiçbir şey değişmedi.' : null; },
        sonuc: 'dönüş termini kaydedilir; plan yeniden kurulunca bu günü kullanır.',
        kaydet: x => { const id = x.is; return degistir('Fason dönüş termini girildi', `${id}: ${x.t}`, () => { const k = { ...(S.D.fasonTermin || {}) }; k[id] = `${x.t} 16:00`; S.D.fasonTermin = k;
          const r = S.plan && S.plan.ops[id]; if (r && !(S.D.fasonRef || {})[id]) S.D.fasonRef = { ...(S.D.fasonRef || {}), [id]: tmYaz(r.C) }; }); },
        bitti: x => `${x.is} dönüş termini ${x.t} oldu` }] : []),
      ...(ad.length ? [{ id: 'karar', ad: 'Fasona ver ya da içeride yap', simge: 'truck', ne: 'Bir adımın nerede yapılacağına müdür karar verir.', yetki: () => ymKarar() && yetkili('plan.kilitle'),
        alanlar: () => [
          { k: 'is', ad: 'İş', tur: 'secim', zorunlu: 1, secenek: () => ad.map(({ r, o, k }) => [r.id, `${r.id} · ${o.ad || ''} · ${sayi(o.adet, 0)} adet · şimdi ${r.fas ? 'fasonda' : 'tezgâhta'}${k ? ` · karar: ${k.karar === 'kabul' ? 'fasonda' : 'içeride'}` : ''}`]) },
          { k: 'karar', ad: 'Karar', tur: 'secim', zorunlu: 1, secenek: () => [['kabul', 'Fasona ver'], ['red', 'İçeride yap'], ['geri', 'Kararı kaldır, plan seçsin']] },
        ],
        adimlar: [{ ad: 'Hangi iş', ne: 'Yalnız fasona verilebilir işaretli adımlar listede.', k: ['is'] }, { ad: 'Karar', ne: 'Karar plana kural olarak girer; plan yeniden kurulunca uygulanır.', k: ['karar'] }],
        kontrol: (x, i, d) => { if (i === 0) return null; const id = x.is || d.is; const k = (S.D.fasonKarar || {})[id];
          if (x.karar === 'geri' && !k) return 'Bu işte kaldırılacak karar yok.'; if (k && k.karar === x.karar) return 'Karar zaten bu.'; return null; },
        sonuc: 'karar kaydedilir; plan yeniden kurulunca uygulanır.',
        kaydet: x => { const id = x.is;
          if (x.karar === 'geri') return degistir('Fason kararı kaldırıldı', id, () => { const k = { ...S.D.fasonKarar }; delete k[id]; S.D.fasonKarar = k; }, 'plan.kilitle');
          const kab = x.karar === 'kabul'; const a = (sdFsOneri() || { liste: [] }).liste.find(z => z.id === id);
          return degistir(kab ? 'Fason kararı: fasona ver' : 'Fason kararı: içeride yap', `${id}${fg && a ? ` · net ${agTL(a.net)}` : ''}`, () => { S.D.fasonKarar = { ...(S.D.fasonKarar || {}), [id]: { karar: kab ? 'kabul' : 'red', kim: kim().ad, t: Date.now() } }; }, 'plan.kilitle'); },
        bitti: x => `${x.is}: ${x.karar === 'kabul' ? 'fasona verilecek' : x.karar === 'red' ? 'içeride yapılacak' : 'kararı plan verecek'}` }] : []),
    ];
  },
};

/* ---------- Malzeme satın alma planı ---------- */
function sdMp() {
  const v = tmMalzeme(); if (!v) return null; const mats = Object.fromEntries((S.D.malzemeler || []).map(m => [m.kod, m]));
  const tutar = (kod, q) => { const m = mats[kod]; return m && m.birimFiyat != null ? m.birimFiyat * q : null; };
  const yeni = v.L.filter(r => r.src == null).sort((a, b) => (a.siparisGun ?? 1e9) - (b.siparisGun ?? 1e9));
  const acik = v.L.filter(r => r.src != null).sort((a, b) => (a.plan ?? 1e9) - (b.plan ?? 1e9));
  return { ...v, mats, tutar, yeni, acik, durum: r => tmDurum(r, v.now) };
}
const sdMpMiktar = (q, kod) => { const m = (S.D.malzemeler || []).find(z => z.kod === kod) || {}; return `${sayi(q, q < 10 ? 1 : 0)} ${m.birim || ''}`.trim(); };
function sdMoOzet() {
  const d = U.moCek; if (!d || d.durum !== 'bitti' || d.anah !== moAnah()) return null; const fg = agFiyatGorur();
  const l = d.liste.filter(r => fg ? r.g[3].tl >= MO_GURULTU : r.g[3].sa >= 0.5);
  return { n: l.length, tl: sdTlTop(l.map(r => r.g[3].tl)), sa: sdTlTop(l.map(r => r.g[3].sa)) };
}
SADE.malzplan = {
  ad: 'Malzeme satın alma planı', simge: 'box',
  ne: () => `Hangi malzeme ne zaman ve ne kadar sipariş edilmeli${agFiyatGorur() ? ', ne tutar' : ''}; geç gelen malzeme hangi siparişi geciktirir.`,
  durum() {
    const fg = agFiyatGorur(); const v = sdMp(); const mo = sdMoOzet();
    if (!v) return [{ simge: 'box', ad: 'Sipariş verilmeli', deger: null, not: 'plan yok' }];
    const gec = v.yeni.filter(r => r.siparisGun != null && r.siparisGun < v.now).length;
    const bek = v.acik.filter(r => r.tm === 'tahmini' || r.tm === 'yok'); const geciktir = v.acik.filter(r => v.durum(r)[0] === 'Siparişi geciktirir').length;
    const k = [{ simge: 'box', ad: 'Sipariş verilmeli', deger: `${sayi(v.yeni.length, 0)} malzeme`, ton: gec ? 'hata' : v.yeni.length ? 'uyari' : 'tamam', not: gec ? `${gec} tanesinin son günü geçti` : v.yeni.length ? 'son güne kadar verin' : 'ihtiyaç karşılanıyor' }];
    if (fg) { const t = v.yeni.map(r => v.tutar(r.kod, Math.ceil(r.miktar))); const fs = t.filter(x => x == null).length;
      k.push({ simge: 'lira', ad: 'Yeni alım tutarı', deger: v.yeni.length && fs === t.length ? null : agTL(sdTlTop(t)), not: fs ? `${fs} malzemenin fiyatı yok` : 'birim fiyat × miktar', ton: fs ? 'uyari' : '' }); }
    k.push({ simge: 'clock', ad: 'Termin bekleniyor', deger: sayi(bek.length, 0), ton: bek.some(r => r.tm === 'yok') ? 'hata' : bek.length ? 'uyari' : 'tamam', not: bek.some(r => r.tm === 'yok') ? `${bek.filter(r => r.tm === 'yok').length} tanesi bir hafta içinde gerekiyor` : 'tedarikçiden tarih alın' });
    k.push({ simge: 'alert', ad: 'Siparişi geciktirir', deger: sayi(geciktir, 0), ton: geciktir ? 'hata' : 'tamam', not: geciktir ? 'termin en geç günden sonra' : 'terminler planı tutuyor' });
    k.push({ simge: 'up', ad: 'Öne çekilirse', deger: mo ? (fg ? agTL(mo.tl) : saat(mo.sa)) : null, not: mo ? (mo.n ? `${mo.n} sipariş 3 gün erken gelirse${fg ? `, gecikme ${saat(mo.sa)} azalır` : ' gecikme azalır'}` : 'öne çekmek kazandırmıyor') : 'henüz hesaplanmadı' });
    return k;
  },
  yapilacak() {
    const l = []; const fg = agFiyatGorur(); const yaz = yetkili('veri.yaz'); const v = sdMp();
    if (!v) { sdPlanIsleri(l, yetkili('plan.yaz')); return l; }
    const ted = id => ((S.D.tedarikciler || []).find(t => t.id === id) || {}).ad || id || 'tedarikçi seçilmedi';
    for (const r of v.yeni.slice(0, 3)) { const q = Math.ceil(r.miktar); const gec = r.siparisGun != null && r.siparisGun < v.now;
      const t = U.tmSec[r.kod + '|ted'] || (v.mats[r.kod] || {}).tedarikci || ((S.D.tedarikciler || [])[0] || {}).id;
      l.push({ simge: 'box', ton: gec ? 'hata' : 'uyari', metin: `${r.kod} için sipariş ver: ${sdMpMiktar(q, r.kod)}`, neden: `${r.siparisGun == null ? 'Tedarik süresi yok' : `En geç ${sdGunYaz(r.siparisGun)}${gec ? ' (geçti)' : ''}`}; ${(r.jobs || []).join(', ') || 'stok'} için. Tedarikçi: ${ted(t)}${fg && v.tutar(r.kod, q) != null ? `, ${agTL(v.tutar(r.kod, q))}` : ''}.${yaz ? '' : ' Siparişi planlamacı verir.'}`, act: yaz ? 'tm-ver' : null, v: r.kod, dugme: 'Sipariş ver', dsimge: 'truck', birincil: gec }); }
    if (yaz && v.yeni.length > 1) l.push({ simge: 'list', metin: 'Birkaç malzemeye birlikte sipariş ver', neden: 'Tedarikçi ve termini bir kez seçin; aynı tedarikçiye gidenler tek sipariş numarasında toplanır.', act: 'sd-form', v: 'malzplan:siparis', dugme: 'Seç', dsimge: 'edit' });
    const bek = v.acik.filter(r => r.tm === 'tahmini' || r.tm === 'yok' || v.durum(r)[0] === 'Siparişi geciktirir');
    if (bek.length) { const r = bek[0]; const d = v.durum(r); const po = r.po || {};
      l.push({ simge: 'clock', ton: bek.some(z => v.durum(z)[1] === 'hata') ? 'hata' : 'uyari', metin: bek.length > 1 ? `${bek.length} açık siparişin termini sorunlu` : `${r.kod}${po.no ? ` (${po.no})` : ''}: ${d[0].toLocaleLowerCase('tr-TR')}`, neden: `${bek.length > 1 ? `İlki ${r.kod}${po.no ? ` (${po.no})` : ''}, ${d[0].toLocaleLowerCase('tr-TR')}. ` : ''}Gerekli geliş ${sdGunYaz(r.plan)}; ${(r.jobs || []).join(', ') || 'stok'} için. Tedarikçiden aldığınız tarihi girin.`, act: yaz ? 'sd-form' : null, v: 'malzplan:termin', dugme: 'Termin gir', dsimge: 'edit' }); }
    if (S.plan && !sdMoOzet() && !(U.moCek && U.moCek.durum === 'hesap') && moAdaylar().length) l.push({ simge: 'up', metin: 'Hangi açık siparişi öne çekmeli', neden: 'Her açık siparişin 1, 3 ve 5 gün erken gelmesi denenir; tedarikçiyle konuşmadan önce bakılacak liste.', act: 'mo-hesapla', dugme: 'Hesapla', dsimge: 'play' });
    return l.slice(0, 6);
  },
  nasil: [
    'Her siparişin malzemesi, ilk işinin plandaki başlangıcında gerekir. İhtiyaç önce stoktan, sonra verilmiş siparişlerden karşılanır; kalan yeni alımdır.',
    'En geç sipariş günü: tedarik süresi düşülerek, malzemenin zamanında gelmesi için siparişin verilmesi gereken son gün.',
    'Sipariş termin olmadan verilebilir; termin gelene kadar geliş tedarik süresinden tahmin edilir. İhtiyaca bir hafta kalmış ve termini olmayan sipariş yok sayılır.',
    'Tedarikçinin verdiği termin girilince plan buna göre denetlenir: geç gelen malzeme hangi siparişi geciktiriyorsa listede görünür.',
    'Tutarı yalnız müdür ve yönetici görür; grafik, dağılım ve öne çekme listesi Tüm ayrıntılar sekmesindedir.',
  ],
  formlar() {
    const v = sdMp(); const D = S.D; const ted = D.tedarikciler || [];
    const sa = (D.satinalma || []).map((po, i) => ({ po, i })).sort((a, b) => (parseT(D, a.po.gelis) == null ? 0 : 1) - (parseT(D, b.po.gelis) == null ? 0 : 1));
    return [
      ...(v && v.yeni.length ? [{ id: 'siparis', ad: 'Malzeme siparişi ver', simge: 'truck', ne: 'Miktar plandan gelir; tedarikçi ve termin seçilir.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'kod', ad: 'Malzemeler', tur: 'cok', secenek: () => v.yeni.map(r => [r.kod, `${r.kod} · ${(v.mats[r.kod] || {}).ad || ''} · ${sdMpMiktar(Math.ceil(r.miktar), r.kod)} · en geç ${sdGunYaz(r.siparisGun)}`]) },
          { k: 'ted', ad: 'Tedarikçi', tur: 'secim', secenek: () => ted.map(t => [t.id, t.ad]), ipucu: 'Boş bırakırsanız her malzemenin kendi tedarikçisi' },
          { k: 'termin', ad: 'Termin (biliniyorsa)', tur: 'tarih', ipucu: 'Boşsa sipariş "termin bekleniyor" olarak kaydedilir' },
        ],
        adimlar: [{ ad: 'Hangi malzemeler', ne: 'En acil olan seçili geldi. Miktar plandan hesaplandı.', k: ['kod'] }, { ad: 'Tedarikçi ve termin', ne: 'Aynı tedarikçiye gidenler tek sipariş numarasında toplanır.', k: ['ted', 'termin'] }],
        ilk: () => ({ kod: [v.yeni[0].kod] }),
        kontrol: (x, i, d) => i === 0 || i === -1 ? ((x.kod || d.kod || []).length ? null : 'En az bir malzeme seçin.') : null,
        sonuc: 'sipariş satın alma listesine eklenir; plan malzemenin gelişini buna göre hesaplar.',
        kaydet: x => { const l = v.yeni.filter(r => x.kod.includes(r.kod)); if (!l.length) return false; if (x.ted) for (const r of l) U.tmSec[r.kod + '|ted'] = x.ted; return tmSiparisVer(l, x.termin || ''); },
        bitti: x => `${x.kod.length} malzemeye sipariş verildi` }] : []),
      ...(sa.length ? [{ id: 'termin', ad: 'Satın alma termini gir', simge: 'flag', ne: 'Tedarikçinin söylediği geliş günü.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'po', ad: 'Satın alma siparişi', tur: 'secim', zorunlu: 1, ipucu: 'Termini olmayanlar başta', secenek: () => sa.map(({ po, i }) => [String(i), `${po.no || '—'} · ${po.kod} · ${sdMpMiktar(+po.miktar || 0, po.kod)} · ${parseT(D, po.gelis) == null ? 'termin yok' : 'termin ' + sdGunYaz(parseT(D, po.gelis))}`]) },
          { k: 't', ad: 'Geliş günü', tur: 'tarih', zorunlu: 1 },
        ],
        adimlar: [{ ad: 'Hangi sipariş', ne: 'Sorunlu olan seçili geldi.', k: ['po'] }, { ad: 'Geliş günü', ne: 'Girilen gün kesin süre sayılır; durum hemen yeniden hesaplanır.', k: ['t'] }],
        ilk: () => { const r = v && v.acik.find(z => z.tm === 'tahmini' || z.tm === 'yok' || v.durum(z)[0] === 'Siparişi geciktirir'); return r && r.src != null ? { po: String(r.src) } : sa[0] ? { po: String(sa[0].i) } : {}; },
        ileri: (d, i) => { if (i !== 0) return; const po = (D.satinalma || [])[+d.po]; d.t = po ? mpTarihGir(parseT(D, po.gelis)) : ''; },
        kontrol: (x, i, d) => { if (i === 0) return null; const po = (D.satinalma || [])[+(x.po ?? d.po)]; return po && mpTarihGir(parseT(D, po.gelis)) === x.t ? 'Hiçbir şey değişmedi.' : null; },
        sonuc: 'termin kaydedilir; malzemenin plana uyup uymadığı yeniden hesaplanır.',
        kaydet: x => { const po = (S.D.satinalma || [])[+x.po]; if (!po) return false; const saat0 = (String(po.gelis || '').split(' ')[1]) || '08:00'; const yeni = `${x.t} ${saat0}`;
          return degistir('Satın alma termini değişti', `${po.kod} ${po.miktar}: ${po.gelis || '—'} → ${yeni}`, () => { po.gelis = yeni; U.mpV = null; }); },
        bitti: x => { const po = (S.D.satinalma || [])[+x.po] || {}; return `${po.no || po.kod} termini ${x.t} oldu`; } }] : []),
    ];
  },
};

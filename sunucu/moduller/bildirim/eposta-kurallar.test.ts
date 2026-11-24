import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EPOSTA_KONULARI, EPOSTA_VARSAYILAN_DUZEN, EPOSTA_YER_TUTUCULARI, adrestekiOnayEylemi, onayEylemiYolu, turKonusu, turOnayi } from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { basliktanKayitNo } from './eposta.ts';
import {
  EPOSTA_LOGO_EN_BUYUK, VARSAYILAN_SABLONLAR, bildirimAcikMi, epostaLogosu, kademeDegeri, sablonIcerigi, sablonYerTutucuHatasi, seritRengi, disKipMi, epostaKipi, bilinmeyenYerTutucular, epostaKur, kayitBaglantisi, kisiEpostaAlir, sablonDoldur, sessizMi,
  konuEtiketi, sonrakiDenemeDk, turKademesi, varsayilanTetikleyici, yukseltmeCumlesi, type EpostaDegerleri,
} from './kurallar.ts';

const DEGER: EpostaDegerleri = {
  alici_adi: 'Deneme Kişi', olay: 'Satın alma talebi onay bekliyor', kayit_no: 'ORN-TLP-0042', tarih: '17.11.2026 09:30', gecikme_gunu: null,
  istasyon: null, kayit_baglantisi: 'http://10.0.0.5:4100/satin-alma/onaylar', onem: 'Uyarı', kademe: null, kayit_basligi: null, zaman_araligi: null, yer: null, duzenleyen: null,
};

describe('e-posta kuralları (3397)', () => {
  test('BIL-40: her konunun varsayılan şablonu yalnız izinli yer tutucu kullanır', () => {
    for (const konu of EPOSTA_KONULARI) {
      const s = VARSAYILAN_SABLONLAR[konu];
      assert.deepEqual(bilinmeyenYerTutucular(`${s.konuKalibi}\n${s.govde}`), [], konu);
      assert.ok(s.konuKalibi.length <= 150 && s.govde.length <= 2000, konu);
    }
  });

  test('BIL-40: tür konusu kaynak modülden gelir; bilinmeyen modül genel', () => {
    assert.equal(turKonusu('satin-alma.talep-onay-bekliyor'), 'satin-alma');
    assert.equal(turKonusu('siparisler.termin-yaklasiyor'), 'satis');
    assert.equal(turKonusu('istasyonlar.makine-durdu'), 'uretim');
    assert.equal(turKonusu('yok.boyle'), 'genel');
  });

  test('BIL-41: bilinmeyen yer tutucu adıyla döner, izinliler geçer', () => {
    assert.deepEqual(bilinmeyenYerTutucular(EPOSTA_YER_TUTUCULARI.map((y) => `{${y}}`).join(' ')), []);
    assert.deepEqual(bilinmeyenYerTutucular('Merhaba {musteri_adi}, {fiyat} {olay} {musteri_adi}'), ['musteri_adi', 'fiyat']);
    assert.equal(sablonDoldur('{olay} · {gecikme_gunu} · {bilinmeyen}', DEGER), 'Satın alma talebi onay bekliyor ·  · {bilinmeyen}');
  });

  test('BIL-42: bağlantı yalnız http(s) kök adresinden kurulur', () => {
    assert.equal(kayitBaglantisi('http://10.0.0.5:4100/', '/stok'), 'http://10.0.0.5:4100/stok');
    assert.equal(kayitBaglantisi('https://mes.ornek.local', null), 'https://mes.ornek.local/');
    assert.equal(kayitBaglantisi('', '/stok'), null);
    assert.equal(kayitBaglantisi('javascript:alert(1)', '/stok'), null);
    assert.equal(kayitBaglantisi('http://10.0.0.5/yol', '/stok'), null);
  });

  test('BIL-43: tablo yalnız seçili ve dolu alanlardan; HTML kaçışlanır, simge cid ile gömülüdür', () => {
    const g = epostaKur({
      sablon: { konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n<b>{olay}</b>', tabloAlanlari: ['kayit_no', 'gecikme_gunu', 'tarih'] },
      degerler: { ...DEGER, alici_adi: '<script>x</script>' }, baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', simgeVar: true,
    });
    assert.equal(g.konu, '[CORE MES] Satın alma talebi onay bekliyor · ORN-TLP-0042');
    assert.match(g.metin, /Kayıt no: ORN-TLP-0042/);
    assert.match(g.metin, /Tarih: 17\.11\.2026 09:30/);
    assert.doesNotMatch(g.metin, /Gecikme günü/);
    assert.match(g.metin, /Kayda git: http:\/\/10\.0\.0\.5:4100\/satin-alma\/onaylar/);
    assert.ok(!g.html.includes('<script>'));
    assert.ok(g.html.includes('&lt;script&gt;'));
    assert.ok(g.html.includes('&lt;b&gt;'));
    assert.ok(g.html.includes('src="cid:simge"'));
    assert.doesNotMatch(g.html, /src="https?:/);
  });

  test('BIL-43: boş kayıt no konuda artık ayraç bırakmaz; bağlantı yoksa düğme yok', () => {
    const g = epostaKur({
      sablon: VARSAYILAN_SABLONLAR.genel, degerler: { ...DEGER, kayit_no: null, kayit_baglantisi: null }, baslik: 'Olay', onem: 'bilgi', simgeVar: false,
    });
    assert.doesNotMatch(g.konu, /·\s*$/);
    assert.doesNotMatch(g.html, /Kayda git/);
    assert.doesNotMatch(g.html, /cid:simge/);
  });

  test('BIL-44: sessiz saat gece yarısını aşabilir; eşit ya da boş sınır sessiz saat değildir', () => {
    assert.equal(sessizMi(23, 22, 7), true);
    assert.equal(sessizMi(3, 22, 7), true);
    assert.equal(sessizMi(7, 22, 7), false);
    assert.equal(sessizMi(12, 22, 7), false);
    assert.equal(sessizMi(13, 12, 14), true);
    assert.equal(sessizMi(3, 5, 5), false);
    assert.equal(sessizMi(3, null, 7), false);
  });

  test('BIL-45: ayarsız tür türün e-posta varsayılanıyla, hemen, tekrarsız ve kademesiz', () => {
    assert.deepEqual(varsayilanTetikleyici('satin-alma.talep-onay-bekliyor'), {
      eposta: true, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], sablonId: null,
    });
    assert.equal(varsayilanTetikleyici('satin-alma.talep-onaylandi').eposta, false);
  });

  test('BIL-46: operatör e-posta almaz; tür kapalıysa kimse almaz; kişi tercihi yoktur (3435-1)', () => {
    assert.equal(kisiEpostaAlir(true, ['satin-alma.onayla']), true);
    assert.equal(kisiEpostaAlir(false, ['satin-alma.onayla']), false);
    assert.equal(kisiEpostaAlir(true, ['arkon.operator']), false);
  });

  test('BIL-47: görev yapılınca, bilgi okununca, her sınıf arşivlenince kapanır', () => {
    const b = { okundu: null, arsivlendi: null, yapildi: null };
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev' }), true);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev', okundu: 'x' }), true);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'gorev', yapildi: 'x' }), false);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'bilgi', okundu: 'x' }), false);
    assert.equal(bildirimAcikMi({ ...b, sinif: 'hatirlatma', arsivlendi: 'x' }), false);
  });

  test('BIL-48: geçici hatada 5 ve 15 dakika sonra; üçüncü denemeden sonra durur', () => {
    assert.equal(sonrakiDenemeDk(1), 5);
    assert.equal(sonrakiDenemeDk(2), 15);
    assert.equal(sonrakiDenemeDk(3), null);
  });

  test('BIL-50: bilinmeyen kip kurum içi sayılır; dış servise yalnız açık seçimle çıkılır', () => {
    assert.equal(epostaKipi('yerel-aktarici'), 'yerel-aktarici');
    assert.equal(epostaKipi('dis'), 'kurum-ici');
    assert.equal(disKipMi('dis-servis'), true);
    assert.equal(disKipMi('yerel-aktarici'), false);
    assert.equal(disKipMi(''), false);
  });

  test('BIL-49: başlıktan kayıt no yalnız ":" sonrası belge numarasıysa alınır; serbest metin alınmaz', () => {
    assert.equal(basliktanKayitNo('Satın alma talebi onay bekliyor: ORN-TLP-0042'), 'ORN-TLP-0042');
    assert.equal(basliktanKayitNo('Talep onaylandı: Rulman alımı'), null);
    assert.equal(basliktanKayitNo('ORN-TLP-0042'), null);
    assert.equal(basliktanKayitNo('Emir: 2026/118'), '2026/118');
  });

  test('BIL-51 (3431 a): konu etiketi yalnız acil, onay ve kademede; kademe türden okunur', () => {
    assert.equal(konuEtiketi({ onem: 'uyari' }), null);
    assert.equal(konuEtiketi({ onem: 'bilgi', onay: null, kademe: null }), null);
    assert.equal(konuEtiketi({ onem: 'acil', onay: { reddet: true } }), '[ACİL · Onay]');
    assert.equal(konuEtiketi({ onem: 'uyari', kademe: { no: 3, toplam: 5, ad: 'Gecikti' } }), '[Kademe 3/5]');
    assert.deepEqual(turKademesi('malzemeler.kademe-kart-onay-gecikti'), { no: 3, toplam: 5, ad: 'Gecikti' });
    assert.equal(turKademesi('satin-alma.talep-onay-bekliyor'), null);
    const g = epostaKur({
      sablon: VARSAYILAN_SABLONLAR['satin-alma'], degerler: DEGER, baslik: 'Satın alma talebi onay bekliyor', onem: 'acil', simgeVar: false,
      onay: { reddet: true }, kademe: { no: 3, toplam: 5, ad: 'Gecikti' },
    });
    assert.equal(g.konu, '[ACİL · Onay · Kademe 3/5] [CORE MES] Satın alma talebi onay bekliyor · ORN-TLP-0042');
    assert.match(g.metin, /Kademe 3 \/ 5: Gecikti/);
    assert.match(g.html, /Kademe 3 \/ 5: Gecikti/);
    assert.match(g.html, />Acil</);
  });

  test('BIL-52 (3431 a): yükseltme cümlesi rol adıyla; kişi adı yazılmaz; yükseltme yoksa cümle yok', () => {
    assert.equal(yukseltmeCumlesi(0, null, ['ORN Müdür'], false), null);
    assert.equal(yukseltmeCumlesi(0, 2, ['ORN Müdür'], false), '2 gün içinde kapanmazsa ORN Müdür rolü de alır.');
    assert.equal(yukseltmeCumlesi(0, 2, ['ORN A', 'ORN B'], true), '2 gün içinde kapanmazsa ORN A, ORN B rolleri de alır.');
    assert.equal(yukseltmeCumlesi(0, 3, [], true), '3 gün içinde kapanmazsa yöneticiler de alır.');
    assert.equal(yukseltmeCumlesi(0, 3, [], false), null);
    assert.equal(yukseltmeCumlesi(1, 3, ['ORN Müdür'], false), 'Bu kayıt 3 gündür kapanmadığı için sana da gönderildi.');
  });

  test('BIL-53 (3431 a): onay türünde düğmeler kaydı eylemle açar; ret yalnız ret olan türde; bağlantısız e-postada düğme yok', () => {
    assert.deepEqual(turOnayi('ik.izin-onay-bekliyor'), { reddet: true });
    assert.deepEqual(turOnayi('siparisler.iskonto-onay-bekliyor'), { reddet: false });
    assert.equal(turOnayi('satin-alma.talep-onaylandi'), null);
    assert.equal(onayEylemiYolu('/malzemeler?kart=k1', 'reddet'), '/malzemeler?kart=k1&eylem=reddet');
    assert.equal(onayEylemiYolu('/siparisler/4', 'onayla'), '/siparisler/4?eylem=onayla');
    assert.equal(adrestekiOnayEylemi('?talep=1&eylem=onayla'), 'onayla');
    assert.equal(adrestekiOnayEylemi('?eylem=sil'), null);
    const kur = (onay: { reddet: boolean }, baglanti: string | null) => epostaKur({
      sablon: VARSAYILAN_SABLONLAR['satin-alma'], degerler: { ...DEGER, kayit_baglantisi: baglanti }, baslik: 'Onay bekliyor', onem: 'uyari', simgeVar: false, onay,
    });
    const tam = kur({ reddet: true }, 'http://10.0.0.5:4100/satin-alma/onaylar?talep=t1');
    assert.ok(tam.html.includes('href="http://10.0.0.5:4100/satin-alma/onaylar?talep=t1&amp;eylem=onayla"'));
    assert.ok(tam.html.includes('eylem=reddet'));
    assert.match(tam.metin, /Onayla: http:\/\/10\.0\.0\.5:4100\/satin-alma\/onaylar\?talep=t1&eylem=onayla/);
    assert.match(tam.metin, /iletmek kimseye onay yetkisi vermez/);
    const retsiz = kur({ reddet: false }, 'http://10.0.0.5:4100/siparisler/4');
    assert.ok(retsiz.html.includes('eylem=onayla') && !retsiz.html.includes('eylem=reddet'));
    assert.match(tam.metin, /Reddet: http:\/\/10\.0\.0\.5:4100\/satin-alma\/onaylar\?talep=t1&eylem=reddet/);
    assert.match(tam.metin, /Kaydı aç: http:\/\/10\.0\.0\.5:4100\/satin-alma\/onaylar\?talep=t1$/m);
    for (const satir of ['Kayıt no: ORN-TLP-0042', 'Olay: Satın alma talebi onay bekliyor', 'Tarih: 17.11.2026 09:30']) {
      assert.ok(tam.metin.includes(satir), satir);
      assert.ok(tam.html.includes(satir.split(': ')[1] ?? ''), satir);
    }
    assert.match(retsiz.metin, /Onayla: /);
    assert.doesNotMatch(retsiz.metin, /Reddet:/);
    for (const tur of ['siparisler.onay-bekliyor', 'siparisler.iskonto-onay-bekliyor', 'siparisler.termin-onay-bekliyor'] as const) assert.deepEqual(turOnayi(tur), { reddet: false }, tur);
    for (const tur of ['satin-alma.talep-onay-bekliyor', 'malzemeler.kart-onay-bekliyor', 'ik.izin-onay-bekliyor'] as const) assert.deepEqual(turOnayi(tur), { reddet: true }, tur);
    const baglantisiz = kur({ reddet: true }, null);
    assert.doesNotMatch(baglantisiz.html, /eylem=|>Onayla</);
  });

  test('3431 a: alt bilgi kipten bağımsızdır, kişi tercihine yol göstermez (3435-1); üst bilgi gönderen adını taşır', () => {
    const g = epostaKur({ sablon: VARSAYILAN_SABLONLAR.genel, degerler: DEGER, baslik: 'Olay', onem: 'bilgi', simgeVar: false, gonderenAdi: 'ORN Makina' });
    assert.doesNotMatch(g.metin, /kurum içi/);
    assert.doesNotMatch(g.metin, /Tercih/);
    assert.match(g.metin, /sistem yöneticin belirler/);
    assert.match(g.metin, /CORE MES tarafından ORN Makina adına gönderildi/);
    assert.ok(g.html.includes('>ORN Makina<'));
  });

  test('BIL-55 (3435-2): kayıtlı şablonun boş sütunu konunun varsayılanıdır; bilinmeyen simge, alan ve şerit düşer', () => {
    const v = VARSAYILAN_SABLONLAR.uretim;
    assert.equal(sablonIcerigi(v, null), v);
    const eski = sablonIcerigi(v, {
      simge: 'yok-boyle', konuKalibi: 'K', baslikKalibi: null, govde: 'G', tabloAlanlari: ['olay', 'fiyat'], dugmeYazisi: null, onayDugmesi: null, altBilgi: null, serit: null, logo: null,
    });
    assert.deepEqual(eski, { ...v, konuKalibi: 'K', govde: 'G', tabloAlanlari: ['olay'] });
    const yeni = sablonIcerigi(v, {
      simge: 'alert', konuKalibi: 'K', baslikKalibi: 'B', govde: 'G', tabloAlanlari: [], dugmeYazisi: 'Aç', onayDugmesi: false, altBilgi: 'A', serit: 'kirmizi', logo: true,
    });
    assert.deepEqual(yeni, { simge: 'alert', konuKalibi: 'K', baslikKalibi: 'B', govde: 'G', tabloAlanlari: [], dugmeYazisi: 'Aç', onayDugmesi: false, altBilgi: 'A', serit: 'kirmizi', logo: true, duzen: EPOSTA_VARSAYILAN_DUZEN });
    const duzenli = sablonIcerigi(v, {
      simge: 'alert', konuKalibi: 'K', baslikKalibi: null, govde: 'G', tabloAlanlari: [], dugmeYazisi: null, onayDugmesi: null, altBilgi: null, serit: null, logo: null,
      duzen: { ustBant: 'Satış', onemRozeti: false, dugmeRengi: 'mavi', tabloAdlari: { kayit_no: 'Sipariş no', fiyat: 'x' }, altSatir: null },
    });
    assert.deepEqual(duzenli.duzen, { ustBant: 'Satış', onemRozeti: false, altSatir: null, tabloAdlari: { kayit_no: 'Sipariş no' }, dugmeRengi: 'mavi' });
  });

  test('3639: üst bant, önem rozeti, başlık altı satırı, tablo satır adı ve sırası, düğme rengi şablondan; boşsa varsayılan', () => {
    const temel = { degerler: DEGER, baslik: 'Olay adı', onem: 'uyari' as const, simgeVar: false };
    const varsayilan = epostaKur({ ...temel, sablon: VARSAYILAN_SABLONLAR.satis });
    assert.match(varsayilan.html, /<td style="color:#ffffff;font-weight:bold;font-size:14px">CORE MES<\/td>/);
    assert.match(varsayilan.html, />Uyarı</);
    assert.match(varsayilan.html, /background:#1c1a14;color:#f6c400;border:2px solid #f6c400/);
    const ozel = epostaKur({
      ...temel,
      sablon: {
        ...VARSAYILAN_SABLONLAR.satis, tabloAlanlari: ['tarih', 'kayit_no'],
        duzen: { ustBant: 'CORE MES Satış', onemRozeti: false, altSatir: '{olay} · {kayit_no}', tabloAdlari: { kayit_no: 'Sipariş no' }, dugmeRengi: 'yesil' },
      },
    });
    assert.match(ozel.html, />CORE MES Satış</);
    assert.doesNotMatch(ozel.html, />Uyarı</);
    assert.match(ozel.html, /background:#1f7a4a;color:#ffffff;border:2px solid #1f7a4a/);
    assert.ok(ozel.html.indexOf('Tarih') < ozel.html.indexOf('Sipariş no'), 'satır sırası şablondaki sıradır');
    assert.match(ozel.html, /Satın alma talebi onay bekliyor · ORN-TLP-0042/);
    assert.match(ozel.metin, /Sipariş no: /);
    // Yer tutucu denetimi yeni metin alanlarını da kapsar; sistem cümlesi ve düğme bağlantısı düzenlenmez.
    const s = { konuKalibi: '{olay}', baslikKalibi: null, govde: 'G', altBilgi: null };
    assert.deepEqual(sablonYerTutucuHatasi({ ...s, duzen: { ustBant: '{musteri}', altSatir: null } }), { alan: 'duzen.ustBant', bilinmeyen: ['musteri'] });
    assert.deepEqual(sablonYerTutucuHatasi({ ...s, duzen: { ustBant: null, altSatir: '{fiyat}' } }), { alan: 'duzen.altSatir', bilinmeyen: ['fiyat'] });
    assert.match(ozel.metin, /sistem yöneticin belirler/);
    assert.match(ozel.metin, /Bu e-posta CORE MES gönderildi/);
  });

  test('BIL-56 (3435-2): başlık ve alt bilgide de yalnız izinli yer tutucu', () => {
    const s = { konuKalibi: '{olay}', baslikKalibi: '{onem} · {kademe}', govde: '{alici_adi}', altBilgi: null };
    assert.equal(sablonYerTutucuHatasi(s), null);
    assert.deepEqual(sablonYerTutucuHatasi({ ...s, altBilgi: '{musteri}' }), { alan: 'altBilgi', bilinmeyen: ['musteri'] });
    assert.deepEqual(sablonYerTutucuHatasi({ ...s, baslikKalibi: '{fiyat}' }), { alan: 'baslikKalibi', bilinmeyen: ['fiyat'] });
  });

  test('3435-2: başlık, düğme yazısı, alt bilgi, onay düğmesi ve şerit şablondan; boşsa varsayılan', () => {
    const temel = { degerler: DEGER, baslik: 'Olay adı', onem: 'uyari' as const, simgeVar: false };
    const varsayilan = epostaKur({ ...temel, sablon: VARSAYILAN_SABLONLAR.genel });
    assert.match(varsayilan.html, /Olay adı/);
    assert.match(varsayilan.metin, /Kayda git: http/);
    assert.match(varsayilan.metin, /sistem yöneticin belirler/);
    const ozel = epostaKur({
      ...temel, onay: { reddet: true },
      sablon: { ...VARSAYILAN_SABLONLAR.genel, baslikKalibi: '{onem}: {olay}', dugmeYazisi: 'Talebi aç', altBilgi: 'Satın alma birimi', onayDugmesi: false, serit: 'yesil' },
    });
    assert.match(ozel.html, /Uyarı: Satın alma talebi onay bekliyor/);
    assert.match(ozel.metin, /Talebi aç: http/);
    assert.doesNotMatch(ozel.metin, /Onayla:/);
    assert.match(ozel.metin, /Satın alma birimi/);
    assert.doesNotMatch(ozel.metin, /sistem yöneticin belirler/);
    assert.match(ozel.html, /background:#1f7a4a"><\/td>/);
    const seritsiz = epostaKur({ ...temel, sablon: { ...VARSAYILAN_SABLONLAR.genel, serit: 'yok' } });
    assert.doesNotMatch(seritsiz.html, /height:6px;background:/);
    assert.equal(seritRengi('onem', 'acil'), '#c62f45');
    assert.equal(seritRengi('yok', 'acil'), null);
  });

  test('BIL-57 (3435-2 logo a): kurum logosu yalnız PNG veri adresinden ve sınır içindeyse gömülür; varsayılan şablonlarda kapalı', () => {
    assert.equal(epostaLogosu(null), null);
    assert.equal(epostaLogosu('data:image/jpeg;base64,AAAA'), null);
    assert.equal(epostaLogosu('https://ornek.local/logo.png'), null);
    assert.deepEqual([...epostaLogosu('data:image/png;base64,iVBORw0KGgo=') ?? []], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(epostaLogosu('data:image/png;base64,iVBORw=='), null, 'PNG imzası eksik');
    assert.equal(epostaLogosu(`data:image/png;base64,${Buffer.from('<svg></svg>').toString('base64')}`), null, 'içerik PNG değil');
    assert.equal(epostaLogosu(`data:image/png;base64,${Buffer.concat([Buffer.from('iVBORw0KGgo=', 'base64'), Buffer.alloc(EPOSTA_LOGO_EN_BUYUK)]).toString('base64')}`), null, 'sınırı aşan PNG');
    assert.ok(Object.values(VARSAYILAN_SABLONLAR).every((s) => !s.logo));
    const temel = { degerler: DEGER, baslik: 'Olay adı', onem: 'uyari' as const, simgeVar: false, gonderenAdi: 'ORN Makina' };
    const logolu = epostaKur({ ...temel, sablon: VARSAYILAN_SABLONLAR.genel, logoVar: true });
    assert.match(logolu.html, /<img src="cid:logo"[^>]*alt="ORN Makina"/);
    assert.doesNotMatch(logolu.html, /src="http/);
    assert.doesNotMatch(epostaKur({ ...temel, sablon: VARSAYILAN_SABLONLAR.genel }).html, /cid:logo/);
  });

  test('3435-2: {kademe} yalnız kademeli uyarı türünde dolar', () => {
    assert.equal(kademeDegeri('bildirim.deneme'), null);
    assert.equal(kademeDegeri('malzemeler.kademe-kart-onay-gecikti'), '3 / 5: Gecikti');
  });
});

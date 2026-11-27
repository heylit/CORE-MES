import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tezgahAdresiOku } from './ayar.ts';
import {
  akislariOku, anlamliDegisim, baslikOku, cihazSayisiOku, diziyiDurumaCevir, dolulukSeviyesi, dolulukYuzdesi, durumaIsle, durumdanDiziye, eskiMi, etkinAralikMs, farklar,
  gecmisiBosalt, gecmisiSuz, ozetle, sayaciArttir, sayaciOzetle, tanimlariOku, takimDegisenleri, takimTablosunuCoz, varliklariOku, yeniSatirSayaci,
} from './kurallar.ts';
import type { GecmisKategorisi, GecmisSuzgeci, SuzulecekOge, TezgahOzeti } from './kurallar.ts';
import { currentMetni, probeMetni } from './sahte-mtconnect.ts';
import { AZAMI_CEVAP_UZUNLUGU, XmlHatasi, xmlAyristir } from './xml.ts';

const ozet = (ek: Partial<TezgahOzeti> = {}): TezgahOzeti => ({
  durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1001', sayac: 10, takim: '4', isMiliHizi: 2000, isMiliYuku: 40, ilerleme: 100, alarm: null, ...ek,
});

describe('tezgah-baglantisi kuralları (kart 3373)', () => {
  test('adres: yoksa null; kurum dışı, kimlik bilgili, sorgulu ya da http olmayan adres reddedilir ve ileti değeri söylemez', () => {
    assert.equal(tezgahAdresiOku({}), null);
    assert.equal(tezgahAdresiOku({ TMIV2_TEZGAH_MTCONNECT_ADRESI: ' http://10.0.0.5:5001/ ' }), 'http://10.0.0.5:5001');
    assert.equal(tezgahAdresiOku({ TMIV2_TEZGAH_MTCONNECT_ADRESI: 'http://orn-sunucu:5001/mt' }), 'http://orn-sunucu:5001/mt');
    for (const kotu of ['http://ornek.example.com:5001', 'http://kisi:parola@10.0.0.5', 'http://10.0.0.5/?a=1', 'ftp://10.0.0.5', 'adres degil']) {
      assert.throws(() => tezgahAdresiOku({ TMIV2_TEZGAH_MTCONNECT_ADRESI: kotu }), (h: Error) => h.message.includes('TMIV2_TEZGAH_MTCONNECT_ADRESI') && !h.message.includes(kotu));
    }
  });

  test('XML: DTD ve ENTITY reddedilir, boy sınırı ayrıştırmadan önce uygulanır, yarım cevap reddedilir', () => {
    assert.throws(() => xmlAyristir('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'), XmlHatasi);
    assert.throws(() => xmlAyristir(`<a>${'x'.repeat(AZAMI_CEVAP_UZUNLUGU)}</a>`), /çok büyük/);
    assert.throws(() => xmlAyristir('<!DOCTYPE a><a/>'), XmlHatasi, 'iç altkümesiz DTD de reddedilir');
    assert.throws(() => xmlAyristir('<?xml version="1.0"?><!DOCTYPE a SYSTEM "http://ornek.invalid/a.dtd"><a/>'), XmlHatasi);
    assert.throws(() => xmlAyristir('<a><b></a>'), XmlHatasi);
    assert.throws(() => xmlAyristir('<a>'), XmlHatasi);
    const kok = xmlAyristir('<?xml version="1.0"?><m:a xmlns:m="u" k="1 &amp; 2"><b>&lt;x&gt; &tanimsiz;</b><c/></m:a>');
    assert.equal(kok.ad, 'a');
    assert.equal(kok.nitelikler['k'], '1 & 2');
    assert.equal(kok.cocuklar[0]?.metin, '<x> &tanimsiz;');
    assert.equal(kok.cocuklar.length, 2);
  });

  test('akış: cihaz ve öğeler okunur; UNAVAILABLE değer boştur; iş mili yükü eksen yüküyle karışmaz', () => {
    const okumalar = akislariOku(xmlAyristir(currentMetni([
      { ad: 'ORN-T01', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1001', sayac: '148', takim: '7', hiz: '2350', yuk: '42', eksenYuku: '11', ilerleme: '180' },
      { ad: 'ORN-T02', erisim: 'UNAVAILABLE', calisma: 'UNAVAILABLE', sayac: 'UNAVAILABLE' },
    ])));
    assert.equal(okumalar?.length, 2);
    const bir = ozetle(okumalar?.[0]?.ogeler ?? []);
    assert.deepEqual(bir, { durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1001', sayac: 148, takim: '7', isMiliHizi: 2350, isMiliYuku: 42, ilerleme: 180, alarm: null });
    const iki = ozetle(okumalar?.[1]?.ogeler ?? []);
    assert.equal(iki.durum, 'baglanti-yok');
    assert.equal(iki.sayac, null);
    assert.equal(iki.calisma, null);
  });

  test('durum: hata koşulu alarmdır; bekleyen ve tanınmayan çalışma hali ayrılır; MTConnect olmayan kök null döner', () => {
    const o = (t: Parameters<typeof currentMetni>[0][number]) => ozetle(akislariOku(xmlAyristir(currentMetni([t])))?.[0]?.ogeler ?? []);
    const alarm = o({ ad: 'ORN-T05', calisma: 'STOPPED', kosullar: [['LOGIC_PROGRAM', 'Normal', ''], ['MOTION_PROGRAM', 'Fault', 'ORN hata']] });
    assert.equal(alarm.durum, 'alarm');
    assert.equal(alarm.alarm, 'MOTION_PROGRAM: ORN hata');
    // Uyarı koşulu alarm değildir: tezgah çalışmaya devam eder.
    const uyari = o({ ad: 'ORN-T06', calisma: 'ACTIVE', kosullar: [['MOTION_PROGRAM', 'Warning', 'ORN uyari'], ['SYSTEM', 'Unavailable', '']] });
    assert.equal(uyari.durum, 'calisiyor');
    assert.equal(uyari.alarm, null);
    assert.equal(o({ ad: 'ORN-T', calisma: 'READY' }).durum, 'bekliyor');
    assert.equal(o({ ad: 'ORN-T', calisma: 'ORN-BILINMEYEN' }).durum, 'bilinmiyor');
    assert.equal(o({ ad: 'ORN-T' }).durum, 'bilinmiyor');
    assert.equal(akislariOku(xmlAyristir('<html><body/></html>')), null);
    assert.equal(cihazSayisiOku(xmlAyristir(probeMetni([{ ad: 'ORN-T01' }, { ad: 'ORN-T02' }]))), 2);
    assert.equal(cihazSayisiOku(xmlAyristir('<html/>')), null);
  });

  test('fark: durum, program, sayaç birebir; hız yüzde 2, yük 5 puan eşiğiyle; boş yan karşılaştırılmaz', () => {
    const s = { durum: 'calisiyor', program: 'O1001', sayac: 10, isMiliHizi: 2000, isMiliYuku: 40 };
    assert.deepEqual(farklar(ozet(), s), []);
    assert.deepEqual(farklar(ozet({ isMiliYuku: 45, isMiliHizi: 2040 }), s), []);
    assert.deepEqual(farklar(ozet({ isMiliYuku: 46, isMiliHizi: 2050 }), s), ['isMiliHizi', 'isMiliYuku']);
    assert.deepEqual(farklar(ozet({ durum: 'bekliyor', sayac: 11, program: 'O2' }), s), ['durum', 'program', 'sayac']);
    assert.deepEqual(farklar(ozet({ program: null, sayac: null, isMiliHizi: null }), { ...s, isMiliYuku: null }), []);
    assert.deepEqual(farklar(ozet({ durum: 'baglanti-yok', sayac: 99 }), { ...s, durum: 'kapali' }), []);
    assert.deepEqual(farklar(ozet({ durum: 'baglanti-yok' }), s), ['durum']);
  });

  test('eski okuma: okuma aralığının iki katından eskiyse', () => {
    const simdi = new Date('2026-11-10T09:10:00Z');
    assert.equal(eskiMi('2026-11-10T09:08:00Z', simdi, 60), false);
    assert.equal(eskiMi('2026-11-10T09:07:59Z', simdi, 60), true);
    assert.equal(eskiMi('2026-11-10T09:09:50Z', simdi, 5), false);
    assert.equal(eskiMi('2026-11-10T09:09:49Z', simdi, 5), true);
  });

  test('aralık: art arda hatada iki katına çıkar, 60 saniyede durur; hatasızken ayardaki değerdedir', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((h) => etkinAralikMs(5000, h)), [5000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
    assert.deepEqual([0, 1, 2].map((h) => etkinAralikMs(30_000, h)), [30_000, 60_000, 60_000]);
    assert.equal(etkinAralikMs(60_000, 3), 60_000);
  });

  test('alan sayısı sınırsızdır: 400\'den çok öğe okunur; cevap boyu sınırı yine geçerlidir', () => {
    const cok = Array.from({ length: 450 }, (_, i) => `<Load dataItemId="l${i}" timestamp="2026-11-10T09:00:00Z" sequence="${i + 1}">${i}</Load>`).join('');
    const xml = `<MTConnectStreams><Header nextSequence="451" firstSequence="1" lastSequence="450" instanceId="7"/><Streams><DeviceStream name="ORN-T01"><ComponentStream component="Rotary"><Samples>${cok}</Samples></ComponentStream></DeviceStream></Streams></MTConnectStreams>`;
    const kok = xmlAyristir(xml);
    assert.equal(akislariOku(kok)?.[0]?.ogeler.length, 450);
    assert.deepEqual(baslikOku(kok), { instanceId: '7', firstSequence: 1, lastSequence: 450, nextSequence: 451 });
    assert.equal(akislariOku(kok)?.[0]?.ogeler[449]?.sira, 450);
  });

  test('probe: bileşen ağacındaki alan tanımları (tür, alt tür, bileşen, birim, kategori) okunur; bilinmeyen kategori atlanır', () => {
    const t = tanimlariOku(xmlAyristir(probeMetni([{ ad: 'ORN-T01' }])));
    assert.equal(t?.length, 1);
    const alanlar = t?.[0]?.alanlar ?? [];
    assert.deepEqual(alanlar.find((a) => a.kimlik === 'sspeed'), { kimlik: 'sspeed', tur: 'SPINDLE_SPEED', altTur: null, bilesen: 'Rotary', bilesenAdi: 'S', birim: 'REVOLUTION/MINUTE', kategori: 'SAMPLE' });
    assert.equal(alanlar.find((a) => a.kimlik === 'k')?.kategori, 'CONDITION');
    assert.equal(alanlar.find((a) => a.kimlik === 'avail')?.bilesen, 'Device');
    const kotu = tanimlariOku(xmlAyristir('<MTConnectDevices><Devices><Device name="ORN-T"><DataItems><DataItem id="a" type="X" category="BILINMEYEN"/></DataItems></Device></Devices></MTConnectDevices>'));
    assert.deepEqual(kotu?.[0]?.alanlar, []);
    assert.equal(tanimlariOku(xmlAyristir('<html/>')), null);
  });

  test('varlıklar: takım no ve ömür değerleri sınırlarıyla okunur; ömür yoksa liste boştur', () => {
    const xml = `<MTConnectAssets><Assets><CuttingTool assetId="ORN-A1" timestamp="2026-11-10T09:00:00Z" toolId="T7"><CuttingToolLifeCycle><ProgramToolNumber>7</ProgramToolNumber>
      <ToolLife type="MINUTES" countDirection="DOWN" initial="120" warning="10" limit="0">85.5</ToolLife></CuttingToolLifeCycle></CuttingTool><CuttingTool assetId="ORN-A2"/></Assets></MTConnectAssets>`;
    const v = varliklariOku(xmlAyristir(xml));
    assert.deepEqual(v?.[0], { kimlik: 'ORN-A1', tur: 'CuttingTool', takimNo: 'T7', zaman: '2026-11-10T09:00:00Z', omurler: [{ tur: 'MINUTES', yon: 'DOWN', deger: 85.5, baslangic: 120, uyari: 10, sinir: 0 }] });
    assert.deepEqual(v?.[1]?.omurler, []);
    assert.equal(v?.[1]?.takimNo, null);
    assert.equal(varliklariOku(xmlAyristir('<html/>')), null);
  });

  test('durum birleştirme: aynı kimlikli öğenin yeni değeri eskisinin yerine geçer', () => {
    const o = (kimlik: string, deger: string, sira: number) => ({ tur: 'Execution', ad: null, bilesen: null, deger, zaman: null, kosul: null, kimlik, sira });
    const d = diziyiDurumaCevir([o('a', 'READY', 1), o('b', 'x', 2)]);
    durumaIsle(d, [o('a', 'ACTIVE', 3)]);
    assert.deepEqual(durumdanDiziye(d).map((e) => [e.kimlik, e.deger]), [['a', 'ACTIVE'], ['b', 'x']]);
  });

  describe('geçmiş süzgeci (kart 3680)', () => {
    const T0 = Date.parse('2026-11-25T08:00:00Z');
    const oge = (kimlik: string, tur: string, deger: string | null, sn: number, kategori: GecmisKategorisi | null = 'SAMPLE', sira = sn + 1): SuzulecekOge => ({
      kayit: { cihazAdi: 'ORN-T01', kimlik, sira, zaman: new Date(T0 + sn * 1000), deger, kosul: null }, tur, kategori,
    });
    const bos: GecmisSuzgeci = new Map();

    test('yük 40 → 43 saklanmaz, 40 → 46 saklanır; hız 1000 → 1015 saklanmaz, 1000 → 1025 saklanır; öteki sayısal yüzde 1', () => {
      assert.equal(anlamliDegisim('Load', '40', '43'), false);
      assert.equal(anlamliDegisim('Load', '40', '46'), true);
      assert.equal(anlamliDegisim('Load', '40', '34'), true);
      assert.equal(anlamliDegisim('SpindleSpeed', '1000', '1015'), false);
      assert.equal(anlamliDegisim('SpindleSpeed', '1000', '1025'), true);
      assert.equal(anlamliDegisim('ROTARY_VELOCITY', '1000', '1025'), true);
      assert.equal(anlamliDegisim('Position', '100', '100.9'), false);
      assert.equal(anlamliDegisim('Position', '100', '101.5'), true);
      assert.equal(anlamliDegisim('Position', '0', '0.001'), true);
      assert.equal(anlamliDegisim('Position', '5', '5.0'), false);
    });

    test('sayıya çevrilemeyen ya da UNAVAILABLE (null) değer her değişimde anlamlıdır', () => {
      assert.equal(anlamliDegisim('Position', '10', null), true);
      assert.equal(anlamliDegisim('Position', null, '10'), true);
      assert.equal(anlamliDegisim('Position', null, null), false);
      assert.equal(anlamliDegisim('Message', 'a', 'b'), true);
      assert.equal(anlamliDegisim('Message', 'a', 'a'), false);
    });

    test('EVENT, CONDITION ve tanımsız öğe her değişimde saklanır; süzgeç durumu tutmaz', () => {
      const girdi = [oge('exec', 'Execution', 'ACTIVE', 0, 'EVENT'), oge('exec', 'Execution', 'READY', 1, 'EVENT'), oge('k', 'SYSTEM', 'x', 2, 'CONDITION'), oge('bil', 'Foo', '1', 3, null)];
      const s = gecmisiSuz(bos, girdi, new Date(T0));
      assert.equal(s.yazilacak.length, 4);
      assert.equal(s.atlanan, 0);
      assert.equal(s.suzgec.size, 0);
    });

    test('ilk değer saklanır; eşik altı değişim atlanır; eşik üstü değişim saklanır', () => {
      let s = gecmisiSuz(bos, [oge('yuk', 'Load', '40', 0)], new Date(T0));
      assert.deepEqual(s.yazilacak.map((k) => k.deger), ['40']);
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '43', 6)], new Date(T0 + 6000));
      assert.deepEqual([s.yazilacak.length, s.atlanan], [0, 1]);
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '46', 12)], new Date(T0 + 12_000));
      assert.deepEqual(s.yazilacak.map((k) => k.deger), ['46']);
    });

    test('aynı öğe 1 sn arayla 10 kez büyük değişirse 6 sn içinde en çok bir satır yazılır; son değer 6 sn dolunca yazılır', () => {
      const girdi = Array.from({ length: 10 }, (_, i) => oge('xpos', 'Position', String(100 * (i + 1)), i));
      const s = gecmisiSuz(bos, girdi, new Date(T0 + 9000));
      assert.deepEqual(s.yazilacak.map((k) => k.deger), ['100', '700'], 'ilk değer ve 6 sn sonraki değer; ara değerler yazılmaz');
      assert.equal(s.atlanan, 7, 'yazılan 2 + bekleyen 1 + atlanan 7 = 10');
      assert.equal(s.suzgec.get('ORN-T01\u0000xpos')?.bekleyen?.deger, '1000');
      const ayni = gecmisiBosalt(s.suzgec, new Date(T0 + 9000));
      assert.equal(ayni.yazilacak.length, 0, 'tur anında 6 sn dolmadı');
      const sonra = gecmisiBosalt(s.suzgec, new Date(T0 + 15_000));
      assert.deepEqual(sonra.yazilacak.map((k) => k.deger), ['1000']);
      assert.equal(gecmisiBosalt(sonra.suzgec, new Date(T0 + 21_000)).yazilacak.length, 0, 'bekleyen yazıldıktan sonra tekrar yazılmaz');
    });

    test('6 sn içinde gidip dönen tepe kaybolmaz: pencerenin en uç değeri kendi zamanıyla, dönüş değeri sonraki pencerede yazılır', () => {
      let s = gecmisiSuz(bos, [oge('yuk', 'Load', '20', 0)], new Date(T0));
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '40', 10)], new Date(T0 + 10_000));
      assert.deepEqual(s.yazilacak.map((k) => k.deger), ['40']);
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '95', 12), oge('yuk', 'Load', '96', 13), oge('yuk', 'Load', '41', 14)], new Date(T0 + 14_000));
      assert.equal(s.yazilacak.length, 0, 'pencere dolmadı');
      let b = gecmisiBosalt(s.suzgec, new Date(T0 + 20_000));
      assert.deepEqual(b.yazilacak.map((k) => [k.deger, k.zaman.getTime()]), [['96', T0 + 13_000]], 'tepe kendi zamanıyla');
      b = gecmisiBosalt(b.suzgec, new Date(T0 + 21_000));
      assert.equal(b.yazilacak.length, 0, 'dönüş değeri 6 sn dolunca yazılır');
      b = gecmisiBosalt(b.suzgec, new Date(T0 + 26_000));
      assert.deepEqual(b.yazilacak.map((k) => k.deger), ['41']);
      assert.equal(gecmisiBosalt(b.suzgec, new Date(T0 + 40_000)).yazilacak.length, 0);
    });

    test('6 sn dolduktan sonra yeni değer gelince önce bekleyen tepe yazılır; dönüş değeri bekler (pencere başına en çok bir satır)', () => {
      let s = gecmisiSuz(bos, [oge('yuk', 'Load', '20', 0)], new Date(T0));
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '90', 2)], new Date(T0 + 2000));
      assert.equal(s.yazilacak.length, 0);
      // 8. sn: son saklanandan (0. sn) 6 sn geçti; yeni değer tepeden daha az uç.
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '50', 8)], new Date(T0 + 8000));
      assert.deepEqual(s.yazilacak.map((k) => [k.deger, k.zaman.getTime()]), [['90', T0 + 2000]], 'önce tepe, kendi zamanıyla');
      assert.equal(s.suzgec.get('ORN-T01\u0000yuk')?.bekleyen?.deger, '50', 'dönüş değeri sonraki pencerede');
      const b = gecmisiBosalt(s.suzgec, new Date(T0 + 14_000));
      assert.deepEqual(b.yazilacak.map((k) => k.deger), ['50']);
    });

    test('6 sn dolduktan sonra gelen değer bekleyenden daha uçtaysa yalnız o yazılır', () => {
      let s = gecmisiSuz(bos, [oge('yuk', 'Load', '20', 0)], new Date(T0));
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '50', 2)], new Date(T0 + 2000));
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '90', 8)], new Date(T0 + 8000));
      assert.deepEqual(s.yazilacak.map((k) => k.deger), ['90']);
      assert.equal(s.suzgec.get('ORN-T01\u0000yuk')?.bekleyen, null);
    });

    test('bekleyen sapma geri dönerse de tepe yazılır; hiç sapmayan öğe için bekleyen oluşmaz', () => {
      let s = gecmisiSuz(bos, [oge('yuk', 'Load', '40', 0)], new Date(T0));
      s = gecmisiSuz(s.suzgec, [oge('yuk', 'Load', '60', 1), oge('yuk', 'Load', '41', 2)], new Date(T0 + 2000));
      assert.equal(s.yazilacak.length, 0);
      assert.deepEqual(gecmisiBosalt(s.suzgec, new Date(T0 + 8000)).yazilacak.map((k) => k.deger), ['60']);
      const sakin = gecmisiSuz(gecmisiSuz(bos, [oge('yuk', 'Load', '40', 0)], new Date(T0)).suzgec, [oge('yuk', 'Load', '41', 2)], new Date(T0 + 2000));
      assert.equal(gecmisiBosalt(sakin.suzgec, new Date(T0 + 8000)).yazilacak.length, 0);
    });

    test('değişmeyen SAMPLE öğesi 60 sn\'de bir güncel değerini yazar; EVENT için tekrar yazılmaz', () => {
      let s = gecmisiSuz(bos, [oge('hiz', 'SpindleSpeed', '2000', 0), oge('exec', 'Execution', 'ACTIVE', 0, 'EVENT')], new Date(T0));
      assert.equal(s.yazilacak.length, 2);
      assert.equal(gecmisiBosalt(s.suzgec, new Date(T0 + 59_000)).yazilacak.length, 0);
      let b = gecmisiBosalt(s.suzgec, new Date(T0 + 60_000));
      assert.deepEqual(b.yazilacak.map((k) => [k.kimlik, k.deger, k.zaman.getTime()]), [['hiz', '2000', T0 + 60_000]]);
      b = gecmisiBosalt(b.suzgec, new Date(T0 + 119_000));
      assert.equal(b.yazilacak.length, 0);
      b = gecmisiBosalt(b.suzgec, new Date(T0 + 120_000));
      assert.equal(b.yazilacak.length, 1);
      s = gecmisiSuz(b.suzgec, [oge('hiz', 'SpindleSpeed', '2005', 130)], new Date(T0 + 130_000));
      assert.equal(s.yazilacak.length, 0, 'tekrar satırı da son saklanan değer sayılır');
    });

    test('süzgeç girdi durumunu değiştirmez (işlem geri alınırsa bellek eski kalır)', () => {
      const s1 = gecmisiSuz(bos, [oge('yuk', 'Load', '40', 0)], new Date(T0));
      const kopya = new Map(s1.suzgec);
      gecmisiSuz(s1.suzgec, [oge('yuk', 'Load', '90', 10)], new Date(T0 + 10_000));
      gecmisiBosalt(s1.suzgec, new Date(T0 + 100_000));
      assert.deepEqual([...s1.suzgec], [...kopya]);
      assert.equal(bos.size, 0);
    });

    test('doluluk: yüzde 80 uyarı, 95 kritik; sayaç son bir saati kapsar', () => {
      assert.equal(dolulukYuzdesi(1_500_000, 2_000_000), 75);
      assert.deepEqual([79.9, 80, 94.9, 95, 120].map(dolulukSeviyesi), ['normal', 'uyari', 'uyari', 'kritik', 'kritik']);
      assert.equal(sayaciOzetle(yeniSatirSayaci(), T0), null, 'ölçülmediyse null');
      let c = sayaciArttir(yeniSatirSayaci(), T0, 30, 270);
      c = sayaciArttir(c, T0 + 60_000, 30, 270);
      assert.deepEqual(sayaciOzetle(c, T0 + 60_000), { pencereDakika: 2, yazilan: 60, atlanan: 540, yazilanDakikada: 30, atlananDakikada: 270 });
      const sonra = sayaciOzetle(c, T0 + 3 * 3_600_000);
      assert.equal(sonra?.yazilan, 0);
      assert.equal(sonra?.pencereDakika, 60);
    });
  });
});

describe('Heidenhain takım tablosu çözümü (kart 3790)', () => {
  test('sabit genişlikli sütunlar adla bulunur; CUR.TIME eski adı da okunur; boş hücre null, kilit TL "L"', () => {
    const metin = ['BEGIN TOOL.T MM', 'T   NAME        L        R       TL  TIME1  CUR.TIME', '5   ORN-A       +40.25   +2      L   15     3', '6               +10      +1          ', 'x   bozuk', '[END]', '7   sonra       +1       +1'].join('\r\n');
    assert.deepEqual(takimTablosunuCoz(metin), [
      { no: 5, ad: 'ORN-A', boy: 40.25, yaricap: 2, omur: 15, kullanilan: 3, kilitli: true },
      { no: 6, ad: null, boy: 10, yaricap: 1, omur: null, kullanilan: null, kilitli: false },
    ]);
  });

  test('integer sütuna sığmayan ya da eksi takım numarası atlanır (yazımı düşürmez)', () => {
    const metin = ['BEGIN TOOL.T MM', 'T            NAME   L', '3000000000   ORN-A  +1', '-1           ORN-B  +1', '2147483647   ORN-C  +1', '[END]'].join('\n');
    assert.deepEqual(takimTablosunuCoz(metin)?.map((t) => t.no), [2147483647]);
  });

  test('başlık ya da T sütunu yoksa null', () => {
    assert.equal(takimTablosunuCoz('T NAME\n1 A\n[END]'), null);
    assert.equal(takimTablosunuCoz('BEGIN TOOL.T MM\nNAME L\nA 1\n[END]'), null);
  });

  test('geçmiş yalnız ömür, kullanılan süre ya da kilit değişen var olan takım için; ilk okumada boş', () => {
    const a = { no: 1, ad: 'ORN', boy: 1, yaricap: 1, omur: 10, kullanilan: 1, kilitli: false };
    const onceki = new Map([[1, a], [2, { ...a, no: 2 }], [3, { ...a, no: 3 }]]);
    const yeni = [{ ...a, ad: 'ORN-B', boy: 2 }, { ...a, no: 2, kilitli: true }, { ...a, no: 3, omur: 5 }, { ...a, no: 4, kullanilan: 2 }, { ...a, no: 9 }];
    assert.deepEqual(takimDegisenleri(onceki, yeni).map((t) => t.no), [2, 3], 'kullanılan süre tek başına geçmiş yazmaz');
    assert.deepEqual(takimDegisenleri(null, yeni), []);
  });
});

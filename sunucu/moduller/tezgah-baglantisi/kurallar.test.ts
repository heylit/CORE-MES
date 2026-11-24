import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tezgahAdresiOku } from './ayar.ts';
import {
  akislariOku, baslikOku, cihazSayisiOku, diziyiDurumaCevir, durumaIsle, durumdanDiziye, eskiMi, etkinAralikMs, farklar, ozetle, tanimlariOku, varliklariOku,
} from './kurallar.ts';
import type { TezgahOzeti } from './kurallar.ts';
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
});

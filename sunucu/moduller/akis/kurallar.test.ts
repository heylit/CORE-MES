import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adimAraliklari, emirAkisi, fasonAraligi, sevkAni, statuKalislari, type AkisAdimi, type AkisGirdisi, type AkisHareketi } from './kurallar.ts';

// Saat 08:00'den dakika sayar; okunaklı örnek için.
const z = (dakika: number): string => new Date(Date.UTC(2026, 0, 5, 8, 0) + dakika * 60_000).toISOString();
const SIMDI = 10_000;

const adim = (a: Partial<AkisAdimi> & { id: number; opNo: number }): AkisAdimi => ({
  sira: a.opNo, istasyon: 'Torna 1', fason: false, terminGun: null, baslama: null, bitis: null, birimSureDk: null, ayarSuresiDk: null,
  bagimlilik: 'bekleyen', devirAdedi: null, ...a,
});
let hid = 0;
const hareket = (h: Partial<AkisHareketi> & { zaman: string; tur: AkisHareketi['tur']; miktar: string }): AkisHareketi => ({
  id: ++hid, malzemeId: 100, partiId: 1, kaynakStatuId: null, hedefStatuId: null, cikisNedeni: null, ...h,
});
const STATULER = new Map([[11, { ad: 'HM', tur: 'HM' as const }], [12, { ad: 'YM-OP10', tur: 'YM' as const }], [13, { ad: 'MM', tur: 'MM' as const }]]);

const girdi = (g: Partial<AkisGirdisi>): AkisGirdisi => ({
  simdi: z(SIMDI),
  emir: { id: 1, emirNo: 'UE-1', malzemeNo: 100, adet: 10, durum: 'basladi', baslama: null, teslim: null },
  adimlar: [], olaylar: [], sayimlar: [], fason: [], hareketler: [], statuler: STATULER, partiGirisleri: new Map(), sevk: null,
  ...g,
});

describe('AKS-1 adım aralıkları', () => {
  test('hazırlık, işleme, duraklama, duruş ve bitiş sırayla bölümlenir', () => {
    const a = adim({ id: 1, opNo: 10, bitis: z(100) });
    const sonuc = adimAraliklari(a, [
      { zaman: z(0), olay: 'ayar' }, { zaman: z(20), olay: 'baslat' }, { zaman: z(50), olay: 'duraklat' },
      { zaman: z(55), olay: 'devam' }, { zaman: z(70), olay: 'durdur' }, { zaman: z(80), olay: 'devam' }, { zaman: z(100), olay: 'bitir' },
    ], Date.parse(z(SIMDI)));
    assert.deepEqual(sonuc.map((s) => [s.tur, (s.bit - s.bas) / 60_000]), [
      ['hazirlik', 20], ['isleme', 30], ['duraklama', 5], ['isleme', 15], ['durus', 10], ['isleme', 20],
    ]);
  });

  test('bitmemiş adımın son durumu şimdiye kadar açık sürer', () => {
    const sonuc = adimAraliklari(adim({ id: 1, opNo: 10 }), [{ zaman: z(0), olay: 'baslat' }], Date.parse(z(30)));
    assert.equal(sonuc.length, 1);
    assert.equal(sonuc[0]?.acik, true);
    assert.equal((sonuc[0]!.bit - sonuc[0]!.bas) / 60_000, 30);
  });

  test('olayı olmayan adımda başlama-bitiş işleme sayılır; başlamamış adımda bölüm yok', () => {
    assert.deepEqual(adimAraliklari(adim({ id: 1, opNo: 10, baslama: z(0), bitis: z(45) }), [], 0).map((s) => s.tur), ['isleme']);
    assert.deepEqual(adimAraliklari(adim({ id: 1, opNo: 10 }), [], 0), []);
  });
});

describe('AKS-2 fason aralığı', () => {
  test('ilk gidişten son dönüşe; eksik dönüşte şimdiye kadar açık', () => {
    const tam = fasonAraligi([{ yon: 'gidis', zaman: z(0), adet: 10 }, { yon: 'donus', zaman: z(60), adet: 4 }, { yon: 'donus', zaman: z(90), adet: 6 }], Date.parse(z(500)));
    assert.equal(tam?.acik, false);
    assert.equal((tam!.bit - tam!.bas) / 60_000, 90);
    const eksik = fasonAraligi([{ yon: 'gidis', zaman: z(0), adet: 10 }, { yon: 'donus', zaman: z(60), adet: 4 }], Date.parse(z(500)));
    assert.equal(eksik?.acik, true);
    assert.equal((eksik!.bit - eksik!.bas) / 60_000, 500);
    assert.equal(fasonAraligi([], 0), null);
  });
});

describe('AKS-4 statüde kalış (ilk giren ilk çıkar)', () => {
  test('parça parça giren adet, sonraki adımın çevirmesiyle sırayla eşleşir', () => {
    const s = statuKalislari([
      hareket({ zaman: z(0), tur: 'giris', miktar: '30', hedefStatuId: 12 }),
      hareket({ zaman: z(60), tur: 'giris', miktar: '20', hedefStatuId: 12 }),
      // Sonraki adım 40 adedi kendi statüsüne çevirir: 30 sabahki (100 dk), 10 öğlenki (40 dk).
      hareket({ zaman: z(100), tur: 'transfer', miktar: '40', kaynakStatuId: 12, hedefStatuId: 13 }),
    ], STATULER, Date.parse(z(200)));
    const ym = s.find((x) => x.statuId === 12)!;
    assert.equal(ym.girenAdet, 50);
    assert.equal(ym.cikanAdet, 40);
    assert.equal(ym.bekleyenAdet, 10);
    assert.equal(ym.ortalamaKalisDk, (30 * 100 + 10 * 40) / 40);
    assert.equal(ym.enUzunKalisDk, 100);
    assert.equal(ym.enEskiBekleyenDk, 140);
    const mm = s.find((x) => x.statuId === 13)!;
    assert.equal(mm.girenAdet, 40);
    assert.equal(mm.ortalamaKalisDk, null);
  });

  test('aynı statüde konum değiştirmek kalışı bozmaz; geri alma en son girişten düşer ve kalış yazmaz', () => {
    const s = statuKalislari([
      hareket({ zaman: z(0), tur: 'giris', miktar: '10', hedefStatuId: 12 }),
      hareket({ zaman: z(5), tur: 'giris', miktar: '5', hedefStatuId: 12 }),
      hareket({ zaman: z(6), tur: 'geri_alma', miktar: '5', kaynakStatuId: 12 }),
      hareket({ zaman: z(10), tur: 'transfer', miktar: '10', kaynakStatuId: 12, hedefStatuId: 12 }),
      hareket({ zaman: z(30), tur: 'cikis', miktar: '10', kaynakStatuId: 12, cikisNedeni: 'sevk' }),
    ], STATULER, Date.parse(z(40)));
    const ym = s.find((x) => x.statuId === 12)!;
    assert.equal(ym.girenAdet, 10);
    assert.equal(ym.cikanAdet, 10);
    assert.equal(ym.bekleyenAdet, 0);
    assert.equal(ym.ortalamaKalisDk, 30);
  });
});

describe('AKS-3 / AKS-5 / AKS-6 emir akışı', () => {
  const adimlar = [adim({ id: 1, opNo: 10, bitis: z(300), birimSureDk: 5 }), adim({ id: 2, opNo: 20, fason: true, istasyon: null }), adim({ id: 3, opNo: 30, bitis: z(2000) })];
  const temel = girdi({
    emir: { id: 1, emirNo: 'UE-1', malzemeNo: 100, adet: 10, durum: 'bitti', baslama: null, teslim: null },
    adimlar,
    olaylar: [
      { isEmriId: 1, zaman: z(0), olay: 'ayar' }, { isEmriId: 1, zaman: z(30), olay: 'baslat' }, { isEmriId: 1, zaman: z(300), olay: 'bitir' },
      { isEmriId: 3, zaman: z(1900), olay: 'baslat' }, { isEmriId: 3, zaman: z(2000), olay: 'bitir' },
    ],
    sayimlar: [{ isEmriId: 1, zaman: z(100), tur: 'saglam', adet: 4 }, { isEmriId: 1, zaman: z(300), tur: 'saglam', adet: 6 }, { isEmriId: 3, zaman: z(2000), tur: 'saglam', adet: 10 }],
    fason: [{ isEmriId: 2, yon: 'gidis', zaman: z(400), adet: 10 }, { isEmriId: 2, yon: 'donus', zaman: z(1600), adet: 10 }],
    // Hammadde partisi 7 (malzeme 900) mal kabulle -1000. dakikada geldi, 10. dakikada sarf edildi.
    hareketler: [hareket({ zaman: z(10), tur: 'cikis', miktar: '10', malzemeId: 900, partiId: 7, cikisNedeni: 'uretime_sarf' })],
    partiGirisleri: new Map([[7, { lotNo: 'LT-000007', malKabul: z(-1000) }]]),
    sevk: { hazir: z(2100), sevk: z(2400) },
  });

  test('damgalar ve uçtan uca ölçüler: mal kabulden sevke', () => {
    const s = emirAkisi(temel);
    assert.equal(s.damgalar.malKabul, z(-1000));
    assert.equal(s.damgalar.uretimBasladi, z(0));
    assert.equal(s.damgalar.uretimBitti, z(2000));
    assert.deepEqual(s.olculer.uctanUca, { dk: 3400, acik: false });
    assert.deepEqual(s.olculer.hammaddeBekleme, { dk: 1000, acik: false });
    assert.deepEqual(s.olculer.uretimAkis, { dk: 2000, acik: false });
    assert.deepEqual(s.olculer.sevkBekleme, { dk: 300, acik: false });
    assert.equal(s.olculer.islemeToplamDk, 270 + 100);
    assert.equal(s.olculer.akisVerimi, 0.185);
  });

  test('adım ölçüleri: bekleyen adımın beklemesi önceki adımın bitişinden (fasonda bütün dönüşten) başlar; çevrim işleme ÷ sağlam', () => {
    const [op10, op20, op30] = emirAkisi(temel).adimlar;
    assert.equal(op10?.hazirlikDk, 30);
    assert.equal(op10?.islemeDk, 270);
    assert.equal(op10?.cevrimBirimDk, 27);
    assert.equal(op10?.beklemeDk, null);
    assert.equal(op20?.beklemeDk, 100, 'OP10 300. dakikada biter, fason 400. dakikada gider; ilk sayım (100) sayılmaz');
    assert.equal(op20?.fasonDk, 1200);
    assert.equal(op20?.islemeDk, null);
    assert.equal(op30?.beklemeDk, 300, 'fason 1600. dakikada tamam döner, OP30 1900. dakikada başlar');
  });

  // OP10 08:00-12:00 çalışır, parçaları tek tek sayar; OP20 13:00'te başlar. Bağımlılığa göre bekleme değişir.
  const ikiAdim = (op20: Partial<AkisAdimi>) => girdi({
    adimlar: [adim({ id: 1, opNo: 10, bitis: z(240) }), adim({ id: 2, opNo: 20, bitis: z(420), ...op20 })],
    olaylar: [
      { isEmriId: 1, zaman: z(0), olay: 'baslat' }, { isEmriId: 1, zaman: z(240), olay: 'bitir' },
      { isEmriId: 2, zaman: z(300), olay: 'baslat' }, { isEmriId: 2, zaman: z(420), olay: 'bitir' },
    ],
    sayimlar: [
      { isEmriId: 1, zaman: z(10), tur: 'saglam', adet: 1 }, { isEmriId: 1, zaman: z(60), tur: 'saglam', adet: 4 },
      { isEmriId: 1, zaman: z(100), tur: 'saglam', adet: -1 }, { isEmriId: 1, zaman: z(120), tur: 'saglam', adet: 6 },
    ],
  });
  const op20Beklemesi = (op20: Partial<AkisAdimi>) => emirAkisi(ikiAdim(op20)).adimlar[1]?.beklemeDk;

  test('bekleyen adım: önceki adımın ilk sayımı beklemeyi başlatmaz, bitişi başlatır', () => {
    assert.equal(op20Beklemesi({}), 60);
  });

  test('akışlı adım: önceki adımdan devir adedi kadar sağlam çıkınca bekleme başlar; düzeltme toplamdan düşer', () => {
    assert.equal(op20Beklemesi({ bagimlilik: 'akisli', devirAdedi: 5 }), 240, '1 + 4 = 5 adet 60. dakikada');
    assert.equal(op20Beklemesi({ bagimlilik: 'akisli', devirAdedi: 6 }), 180, '-1 düzeltmesiyle 6. adet 120. dakikada');
    assert.equal(op20Beklemesi({ bagimlilik: 'akisli', devirAdedi: 50 }), 60, 'adede ulaşmadan biterse bitişten');
    assert.equal(op20Beklemesi({ bagimlilik: 'akisli', devirAdedi: null }), 290, 'devir adedi yoksa ilk sağlam');
  });

  test('bağımsız adımda önceki adım beklenmez', () => {
    assert.equal(op20Beklemesi({ bagimlilik: 'bagimsiz' }), null);
  });

  test('yeniden açılan adım: bitir ile yeniden başlama arası bekleme; başlamadıysa şimdiye kadar açık, iptalde yok', () => {
    const yeniden = adim({ id: 1, opNo: 10, bitis: z(200) });
    const olaylar = [
      { zaman: z(0), olay: 'baslat' as const }, { zaman: z(100), olay: 'bitir' as const },
      { zaman: z(130), olay: 'ayar' as const }, { zaman: z(150), olay: 'baslat' as const }, { zaman: z(200), olay: 'bitir' as const },
    ];
    assert.deepEqual(adimAraliklari(yeniden, olaylar, Date.parse(z(SIMDI))).map((s) => [s.tur, (s.bit - s.bas) / 60_000]),
      [['isleme', 100], ['bekleme', 30], ['hazirlik', 20], ['isleme', 50]]);
    const acik = adimAraliklari(adim({ id: 1, opNo: 10 }), olaylar.slice(0, 2), Date.parse(z(160)));
    assert.deepEqual(acik.map((s) => [s.tur, (s.bit - s.bas) / 60_000, s.acik]), [['isleme', 100, false], ['bekleme', 60, true]]);
    assert.deepEqual(adimAraliklari(adim({ id: 1, opNo: 10 }), olaylar.slice(0, 2), Date.parse(z(160)), false).map((s) => s.tur), ['isleme']);
    const g = girdi({
      adimlar: [yeniden, adim({ id: 2, opNo: 20, bitis: z(400) })],
      olaylar: [...olaylar.map((o) => ({ ...o, isEmriId: 1 })), { isEmriId: 2, zaman: z(300), olay: 'baslat' }, { isEmriId: 2, zaman: z(400), olay: 'bitir' }],
    });
    const [op10, op20] = emirAkisi(g).adimlar;
    assert.equal(op10?.beklemeDk, 30);
    assert.equal(op10?.islemeDk, 150);
    assert.equal(op20?.beklemeDk, 200, 'sonraki adımın beklemesi önceki adımın ilk bitişinden');
  });

  test('hammadde: sarf yoksa HM statüsünden çevirme kullanım sayılır; mal kabulü bilinmeyen partide bekleme uydurulmaz', () => {
    const g = girdi({
      adimlar: [adim({ id: 1, opNo: 10 })],
      olaylar: [{ isEmriId: 1, zaman: z(500), olay: 'baslat' }],
      hareketler: [
        hareket({ zaman: z(200), tur: 'transfer', miktar: '5', malzemeId: 900, partiId: 7, kaynakStatuId: 11, hedefStatuId: 12 }),
        hareket({ zaman: z(300), tur: 'transfer', miktar: '5', malzemeId: 901, partiId: 8, kaynakStatuId: null, hedefStatuId: null }),
      ],
      partiGirisleri: new Map([[7, { lotNo: 'LT-1', malKabul: z(0) }], [8, { lotNo: 'LT-2', malKabul: null }]]),
    });
    const h = emirAkisi(g).hammadde;
    assert.deepEqual(h.map((p) => [p.partiId, p.kullanim, p.beklemeDk]), [[7, z(200), 200], [8, z(500), null]]);
  });

  test('sürmekte olan emirde ölçüler şimdiye kadar açık; iptal emirde açık ölçü yok', () => {
    const acik = girdi({
      adimlar: [adim({ id: 1, opNo: 10 })],
      olaylar: [{ isEmriId: 1, zaman: z(0), olay: 'baslat' }],
    });
    assert.deepEqual(emirAkisi(acik).olculer.uretimAkis, { dk: SIMDI, acik: true });
    assert.deepEqual(emirAkisi(acik).olculer.uctanUca, { dk: null, acik: false });
    const iptal = { ...acik, emir: { ...acik.emir, durum: 'iptal' } };
    assert.deepEqual(emirAkisi(iptal).olculer.uretimAkis, { dk: null, acik: false });
  });

  test('şeritler: hammadde, her adım ve sevk; bekleme bölümü adımın önünde', () => {
    const s = emirAkisi(temel).seritler;
    assert.deepEqual(s.map((x) => x.anahtar), ['hammadde', 'adim-1', 'adim-2', 'adim-3', 'sevk']);
    assert.deepEqual(s[2]?.bolumler.map((b) => b.tur), ['bekleme', 'fason']);
    assert.deepEqual(s[4]?.bolumler.map((b) => b.tur), ['bekleme', 'sevk']);
  });
});

describe('AKS-7 sevk anı', () => {
  test('tamamlanan iş sevk sayılır; yoldaki sayılmaz; kaldırılan kayıt kaldırıldığı an sevk sayılır', () => {
    assert.deepEqual(sevkAni({ hazirZamani: z(0), kaldirildi: null, isDurumu: 'tamamlandi', isDurumZamani: z(90), isIptalEdildi: false }), { hazir: z(0), sevk: z(90) });
    assert.deepEqual(sevkAni({ hazirZamani: z(0), kaldirildi: null, isDurumu: 'tamamlandi', isDurumZamani: z(90), isIptalEdildi: true }), { hazir: z(0), sevk: null });
    assert.deepEqual(sevkAni({ hazirZamani: z(0), kaldirildi: null, isDurumu: 'yolda', isDurumZamani: z(60), isIptalEdildi: false }), { hazir: z(0), sevk: null });
    assert.deepEqual(sevkAni({ hazirZamani: z(0), kaldirildi: z(30), isDurumu: null, isDurumZamani: null, isIptalEdildi: false }), { hazir: z(0), sevk: z(30) });
    assert.equal(sevkAni(null), null);
  });
});

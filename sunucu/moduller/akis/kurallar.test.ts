import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adimAraliklari, emirAkisi, fasonAraligi, kartAnlari, kartKonumu, kartPenceresi, kartSarfi, sevkAni, statuKalislari, type AkisAdimi, type AkisGirdisi, type AkisHareketi,
} from './kurallar.ts';

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

  test('AKS-8: kartın anları zamana göre; aynı anda kabul, açılış, teslim, adım, sevk sırası; iptal teslim kapanmaz, red kapanır', () => {
    const anlar = kartAnlari({
      acilis: z(10),
      hammadde: [{ partiId: 1, lotNo: 'LT-1', malKabul: z(0), kullanim: null, beklemeDk: null }, { partiId: 2, lotNo: 'LT-2', malKabul: null, kullanim: null, beklemeDk: null }],
      teslimler: [
        { durum: 'teslim', gonderim: z(10), kapanis: z(20), miktar: '10.000', alinan: '9.000', kaynak: 'Kabul', hedef: 'Torna 1', gonderen: 'Depo A', kapatan: 'Operatör B' },
        { durum: 'red', gonderim: z(30), kapanis: z(35), miktar: '1.000', alinan: null, kaynak: 'Kabul', hedef: 'Torna 1' },
        { durum: 'iptal', gonderim: z(40), kapanis: z(41), miktar: '2.000', alinan: null, kaynak: 'Kabul', hedef: 'Freze 1' },
      ],
      adimlar: [{ id: 7, opNo: 10, istasyon: 'Torna 1', fason: false }, { id: 8, opNo: 20, istasyon: null, fason: true }],
      olaylar: [{ isEmriId: 7, zaman: z(20), olay: 'baslat', kisiId: 5 }, { isEmriId: 99, zaman: z(50), olay: 'bitir' }, { isEmriId: 7, zaman: z(47), olay: 'durdur', kisiId: 6, durusNedeniId: 3 }],
      sayimlar: [{ isEmriId: 7, zaman: z(45), tur: 'saglam', adet: 4 }, { isEmriId: 7, zaman: z(46), tur: 'saglam', adet: -1 }, { isEmriId: 7, zaman: z(48), tur: 'hurda', adet: 1, kisiId: 5, hurdaNedeniId: 4 }],
      fason: [{ isEmriId: 8, yon: 'gidis', zaman: z(60), adet: 3 }],
      sevk: { hazir: z(90), sevk: null },
      adlar: { kisi: new Map([[5, 'Operatör A']]), durus: new Map([[3, 'Takım değişimi']]), hurda: new Map([[4, 'Çap dışı']]) },
    });
    assert.deepEqual(anlar.filter((a) => a.kim !== null || a.neden !== null).map((a) => [a.tur, a.kim, a.neden]), [
      ['teslim_gonderildi', 'Depo A', null], ['teslim_alindi', 'Operatör B', null], ['baslat', 'Operatör A', null], ['durdur', null, 'Takım değişimi'], ['hurda', 'Operatör A', 'Çap dışı'],
    ], 'kişi ve neden adı haritadan; haritada olmayan null');
    assert.deepEqual(anlar.filter((a) => a.tur !== 'durdur' && a.tur !== 'hurda').map((a) => [a.zaman, a.tur, a.opNo, a.yer, a.miktar]), [
      [z(0), 'mal_kabul', null, 'LT-1', null],
      [z(10), 'kart_acildi', null, null, null],
      [z(10), 'teslim_gonderildi', null, 'Kabul → Torna 1', '10.000'],
      [z(20), 'teslim_alindi', null, 'Kabul → Torna 1', '9.000'],
      [z(20), 'baslat', 10, 'Torna 1', null],
      [z(30), 'teslim_gonderildi', null, 'Kabul → Torna 1', '1.000'],
      [z(35), 'teslim_reddedildi', null, 'Kabul → Torna 1', '1.000'],
      [z(40), 'teslim_gonderildi', null, 'Kabul → Freze 1', '2.000'],
      [z(45), 'saglam', 10, 'Torna 1', '4'],
      [z(46), 'saglam', 10, 'Torna 1', '-1'],
      [z(50), 'bitir', null, null, null],
      [z(60), 'fason_gidis', 20, 'Fason', '3'],
      [z(90), 'sevke_hazir', null, null, null],
    ]);
  });
});

describe('AKS-9 kartın adımdaki penceresi', () => {
  const adimi = { baslama: z(0), bitis: z(100) };
  test('kartın tek kartı: pencere adımın tamamı, hazırlık kartın', () => {
    assert.deepEqual(kartPenceresi(adimi, [{ zaman: z(10), kartin: true }, { zaman: z(20), kartin: true }]), { baslama: z(0), bitis: z(100), hazirlikKartin: true });
  });
  test('önce başka kart sayıldıysa pencere onun son sayımında açılır, hazırlık kartın değil; sonra sayıldıysa kartın son sayımında kapanır', () => {
    const sayimlar = [{ zaman: z(10), kartin: false }, { zaman: z(30), kartin: false }, { zaman: z(40), kartin: true }, { zaman: z(60), kartin: true }, { zaman: z(70), kartin: false }];
    assert.deepEqual(kartPenceresi(adimi, sayimlar), { baslama: z(30), bitis: z(60), hazirlikKartin: false });
  });
  test('kartın sayımı yoksa ya da adım başlamadıysa adımın penceresi', () => {
    assert.deepEqual(kartPenceresi(adimi, [{ zaman: z(10), kartin: false }]), { baslama: z(0), bitis: z(100), hazirlikKartin: true });
    assert.deepEqual(kartPenceresi({ baslama: null, bitis: null }, [{ zaman: z(10), kartin: true }]), { baslama: null, bitis: null, hazirlikKartin: true });
  });
  test('sürmekte olan adımda sonra sayım yoksa bitiş açık kalır (null)', () => {
    assert.deepEqual(kartPenceresi({ baslama: z(0), bitis: null }, [{ zaman: z(5), kartin: true }]), { baslama: z(0), bitis: null, hazirlikKartin: true });
  });
});

describe('AKS-10 kartın yeri, rotası ve lead', () => {
  const an = (dk: number, tur: Parameters<typeof kartKonumu>[1][number]['tur'], isEmriId: number | null = null) =>
    ({ zaman: z(dk), tur, isEmriId, opNo: isEmriId === null ? null : isEmriId * 10, yer: isEmriId === null ? null : 'Torna 1', miktar: null, kim: null, neden: null });
  const adimlar = [{ id: 1, opNo: 10, baslama: z(5), bitis: z(50) }, { id: 2, opNo: 20, baslama: z(60), bitis: null }, { id: 3, opNo: 30, baslama: null, bitis: null }];
  test('son an yeri söyler; sayım yeri değiştirmez; rota geçti, şimdi, sırada; lead açılıştan şimdiye açık', () => {
    const r = kartKonumu({ durum: 'acik', acilis: z(0) }, [an(0, 'kart_acildi'), an(5, 'baslat', 1), an(50, 'bitir', 1), an(60, 'ayar', 2), an(61, 'saglam', 2)], adimlar, z(100));
    assert.deepEqual(r.konum, { durum: 'ayarda', isEmriId: 2, opNo: 20, yer: 'Torna 1', beri: z(60) });
    assert.deepEqual(r.rota.map((x) => x.durum), ['gecti', 'simdi', 'sirada']);
    assert.deepEqual(r.rota.map((x) => [x.baslama, x.bitis]), [[z(5), z(50)], [z(60), null], [null, null]]);
    const h = kartKonumu({ durum: 'acik', acilis: z(0) }, [{ ...an(10, 'hurda', 1), miktar: '2' }, { ...an(11, 'hurda', 1), miktar: '1' }], adimlar, z(100));
    assert.deepEqual(h.rota.map((x) => x.hurdaAdet), [3, 0, 0], 'kartın hurda anları adımına toplanır');
    assert.deepEqual(r.lead, { dk: 100, acik: true });
    assert.equal(r.sonAn?.tur, 'saglam');
  });
  test('teslim gönderimi yolda, alınması bekliyor; anı yoksa depoda', () => {
    assert.equal(kartKonumu({ durum: 'acik', acilis: z(0) }, [an(1, 'teslim_gonderildi')], adimlar, z(10)).konum.durum, 'yolda');
    assert.equal(kartKonumu({ durum: 'acik', acilis: z(0) }, [an(1, 'teslim_gonderildi'), an(2, 'teslim_alindi')], adimlar, z(10)).konum.durum, 'bekliyor');
    assert.deepEqual(kartKonumu({ durum: 'acik', acilis: z(0) }, [], adimlar, z(10)).konum, { durum: 'depoda', isEmriId: null, opNo: null, yer: null, beri: z(0) });
  });
  test('sevk lead\'i kapatır; açık olmayan kart kapandı, lead son anına kadar', () => {
    assert.deepEqual(kartKonumu({ durum: 'acik', acilis: z(0) }, [an(80, 'sevk')], adimlar, z(100)).lead, { dk: 80, acik: false });
    const k = kartKonumu({ durum: 'iptal', acilis: z(0) }, [an(30, 'baslat', 1)], adimlar, z(100));
    assert.equal(k.konum.durum, 'kapandi');
    assert.deepEqual(k.lead, { dk: 30, acik: false });
  });
});

describe('kartın lotundan sarf', () => {
  test('yalnız kartın lotundan üretime sarf toplanır; yoksa null', () => {
    const h = [
      hareket({ zaman: z(0), tur: 'cikis', miktar: '2.500', cikisNedeni: 'uretime_sarf' }),
      hareket({ zaman: z(1), tur: 'cikis', miktar: '1.000', cikisNedeni: 'uretime_sarf', partiId: 2 }),
      hareket({ zaman: z(2), tur: 'cikis', miktar: '0.250', cikisNedeni: 'uretime_sarf' }),
      hareket({ zaman: z(3), tur: 'transfer', miktar: '5.000' }),
    ];
    assert.equal(kartSarfi(h, 1), '2.750');
    assert.equal(kartSarfi(h, 3), null);
    assert.equal(kartSarfi(h, null), null);
  });
});

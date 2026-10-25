import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  araliktanCikar, arkaArkaya, ayarVeGecikme, ekMesaiButcesi, haftaBasi, vardiyaSaati, bosluk, calisilanParcalar, calismaBasiGeri, calismaBitisi, dondurulacaklar, emirSirasi, enErkenBaslangic, enErkenBitis, gostergeler, isSuresi, karsilastir, kesisimDk, oner,
  adetPayi, bedelCarpani, bolmeAdetleri, kapasiteBollugu, kapasiteKesri, onayGecisiReddi, onayGecisleri, elleCarpanSiniri, tlIyilestir, tlKosuSiniri, emirTutari, verimliSure, gecikmeBedeli, gecikmeMaliyeti, katkiPaylari, bantSinirlari, motorUyarilari, PERSONEL_TANIMSIZ, oncelikSiniflari, planMaliyeti, personelYuku, sinirliGunSayisi, TABAN_BEDEL_SAAT, takvimliBosluk, VARSAYILAN_MOTOR, uyarilar, yukYuzdesi,
} from './kurallar.ts';
import type { MaliyetSatiri, MotorIsi, PersonelMerkezi } from './kurallar.ts';

const M1 = { tur: 'makine' as const, id: 1 };
const M2 = { tur: 'makine' as const, id: 2 };
const GUN = 1440;
const VARDIYA_2 = [{ baslangic: 480, bitis: 960 }, { baslangic: 1920, bitis: 2400 }];
const is = (p: Partial<MotorIsi>): MotorIsi => ({
  id: 1, uretimEmriId: 1, sira: 1, teslimDk: null, kaynak: M1, adaylar: [], sureDk: 60, bagimlilik: 'bekleyen', devirDk: null, ...p,
});

describe('plan kuralları', () => {
  test('PL-01: kaynakta boşluk dolu aralıklara değmez; süre ayar + adet x birimdir, birim yoksa bilinmez', () => {
    assert.equal(bosluk([{ baslangic: 0, bitis: 30 }, { baslangic: 50, bitis: 100 }], 0, 20), 30);
    assert.equal(bosluk([{ baslangic: 0, bitis: 30 }, { baslangic: 50, bitis: 100 }], 0, 30), 100);
    assert.equal(isSuresi(10, 2, 5), 20);
    assert.equal(isSuresi(10, null, 5), null);
  });

  test('PL-02: bekleyen öncül bitince, akışlı devir kadar sonra, bağımsız hemen başlar', () => {
    const o = { baslangic: 10, bitis: 100 };
    assert.equal(enErkenBaslangic({ bagimlilik: 'bekleyen', devirDk: null }, o, 0), 100);
    assert.equal(enErkenBaslangic({ bagimlilik: 'akisli', devirDk: 25 }, o, 0), 35);
    assert.equal(enErkenBaslangic({ bagimlilik: 'bagimsiz', devirDk: null }, o, 0), 0);
  });

  test('PL-02 akışlı: ardıl ilk devir partisi gelince başlar, öncülünden önce bitemez; son devir partisi öncül bitince işlenir', () => {
    // Yazılım değerlendirmesi P5: OP10 100 adet x 10 dk [0, 1000); OP20 100 adet x 1 dk, devir 1 adet. OP20 [10, 110) çıkıyordu.
    // Ekran (prototip) ardılı ilk partiyle başlatır ve parça bekleyerek öncül bitince bitirir: [10, 1001).
    const s = oner([is({ id: 1, sureDk: 1000 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 100, bagimlilik: 'akisli', devirDk: 10, devirSonDk: 1 })], [], 0);
    assert.deepEqual(s.yerlesimler.find((y) => y.isEmriId === 2), { isEmriId: 2, kaynak: M2, baslangic: 10, bitis: 1001 });
    // Gölge senaryosu akisli-devir: OP10 ayar 10 + 10 x 6 [0, 70); OP20 ayar 10 + 10 x 4, devir 2: ilk parti 10 + 2 x 6 = 22'de, bitiş 70 + 2 x 4.
    const g = oner([is({ id: 1, sureDk: 70 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 50, bagimlilik: 'akisli', devirDk: 22, devirSonDk: 8 })], [], 0);
    assert.deepEqual(g.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]), [[1, 0, 70], [2, 22, 78]]);
    // Uzayan iş kaynağı baştan sona tutar: aradaki boşluğa başka iş girmez, sığmazsa ilk uygun yerden başlar.
    const dolu = oner([is({ id: 1, sureDk: 70 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 50, bagimlilik: 'akisli', devirDk: 22, devirSonDk: 8 })],
      [{ isEmriId: 9, uretimEmriId: 9, sira: 1, kaynak: M2, baslangic: 40, bitis: 45 }], 0);
    assert.deepEqual(dolu.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]), [[1, 0, 70], [2, 45, 95]]);
    // Ardıl yavaşsa devirden sonra başlar, öncülden sonra biter: sınır başlangıcı geri itmez.
    const yavas = oner([is({ id: 1, sureDk: 100 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 500, bagimlilik: 'akisli', devirDk: 10, devirSonDk: 5 })], [], 0);
    assert.deepEqual(yavas.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]), [[1, 0, 100], [2, 10, 510]]);
    assert.equal(enErkenBitis({ bagimlilik: 'akisli', devirSonDk: 30 }, { baslangic: 480, bitis: 940 }, VARDIYA_2), 1930);
    assert.equal(enErkenBitis({ bagimlilik: 'bekleyen', devirSonDk: 30 }, { baslangic: 0, bitis: 100 }), Number.NEGATIVE_INFINITY);
    assert.deepEqual(uyarilar({ baslangic: 20, bitis: 120, kaynak: M1 }, { teslimDk: null, enErken: 10, enErkenBitis: 1001, rotaKaynaklari: [] }),
      ['Önceki iş emri bitmeden bitiyor (akışlı devir).']);
  });

  test('PL-02 akışlı devir öncülün takviminde ve veriminde sayılır: vardiya dışı beklenir, yavaş makinede devir uzar', () => {
    // Öncül M1 08-16 vardiyalı, %50 verimli: 300 dk'lık iş 600 çalışma dakikası, [480, 2040). Devir 250 dk = 500 çalışma dakikası:
    // ertesi sabah 08:20'de (1940) dolar. Duvar saatinde 480 + 250 = 730 çıkıyordu.
    assert.equal(enErkenBaslangic({ bagimlilik: 'akisli', devirDk: 250 }, { baslangic: 480, bitis: 2040 }, 0, VARDIYA_2, 0.5), 1940);
    assert.equal(enErkenBaslangic({ bagimlilik: 'akisli', devirDk: 5000 }, { baslangic: 480, bitis: 2040 }, 0, VARDIYA_2, 0.5), 2040, 'devir öncülün bitişini geçmez');
    const takvim = (k: { id: number }) => (k.id === 1 ? VARDIYA_2 : null);
    const verim = (k: { id: number }) => (k.id === 1 ? 0.5 : 1);
    const s = oner([is({ id: 1, sureDk: 300 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 200, bagimlilik: 'akisli', devirDk: 250, devirSonDk: 0 })], [], 0, undefined, takvim, verim);
    assert.deepEqual(s.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]), [[1, 480, 2040], [2, 1940, 2140]]);
  });

  test('verim yalnız işleme süresine uygulanır, ayara uygulanmaz (prototip): ayar 10 + işleme 40, %80 verim 60 dk; devirde de öncülün ayarı verimsiz', () => {
    const verim = (k: { id: number }) => (k.id === 1 ? 0.8 : 1);
    const s = oner([is({ id: 1, sureDk: 50, ayarDk: 10 }), is({ id: 2, sira: 2, kaynak: M2, sureDk: 30, ayarDk: 10 })], [], 0, undefined, undefined, verim);
    assert.deepEqual(s.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]), [[1, 0, 60], [2, 60, 90]]);
    assert.equal(verimliSure(50, 10, 0.8), 60);
    assert.equal(verimliSure(50, null, 0.5), 100, 'ayarsız işte bütün süre işlemedir');
    // Devir: öncülün ayarı 10 + 2 adet x 8 dk; %50 verimde 10 + 16 / 0,5 = 42.
    assert.equal(enErkenBaslangic({ bagimlilik: 'akisli', devirDk: 26, devirAyarDk: 10 }, { baslangic: 0, bitis: 500 }, 0, null, 0.5), 42);
  });

  test('PL-FSN: fason adım atölye kaynağını tüketmez; sonraki adım öncülün bitişinden termin kadar sonra başlar, bağımsız adım beklemez', () => {
    const gun = 24 * 60;
    const s = oner([is({ id: 1 }), is({ id: 2, sira: 3, fasonBekleDk: 2 * gun }), is({ id: 3, uretimEmriId: 2, sira: 1, oncelik: 9 })], [], 0);
    assert.deepEqual(s.yerlesimler.map((y) => [y.isEmriId, y.baslangic]), [[1, 0], [2, 60 + 2 * gun], [3, 60]], 'fason beklemesi makineyi boş bırakır');
    const ilk = oner([is({ id: 4, fasonBekleDk: gun })], [], 0);
    assert.equal(ilk.yerlesimler[0]?.baslangic, gun, 'öncülü olmayan adım şimdiden termin kadar bekler');
    const bagimsiz = oner([is({ id: 1 }), is({ id: 2, sira: 3, kaynak: M2, bagimlilik: 'bagimsiz', fasonBekleDk: gun })], [], 0);
    assert.equal(bagimsiz.yerlesimler.find((y) => y.isEmriId === 2)?.baslangic, 0);
  });

  test('B7: parti kolu üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler; kol önce sıralansa da', () => {
    const ust = (p: Partial<MotorIsi>) => is({ uretimEmriId: 1, oncelik: 2, ...p });
    const kol = (p: Partial<MotorIsi>) => is({ id: 20, uretimEmriId: 2, sira: 2, oncelik: 1, kaynak: M2, sureDk: 30, bagli: [10], ...p });
    const s = oner([ust({ id: 10 }), ust({ id: 11, sira: 3, bagli: [20] }), kol({})], [], 0);
    assert.deepEqual(s.yerlesimler.map((y) => [y.isEmriId, y.baslangic, y.bitis]).sort((a, b) => a[0]! - b[0]!), [[10, 0, 60], [11, 90, 150], [20, 60, 90]]);
    const akis = oner([ust({ id: 10 }), ust({ id: 11, sira: 3, bagli: [20], bagimlilik: 'akisli', devirDk: 10 }), kol({})], [], 0);
    assert.equal(akis.yerlesimler.find((y) => y.isEmriId === 11)?.baslangic, 70);
    const yok = oner([ust({ id: 10 }), ust({ id: 11, sira: 3, bagli: [20] }), kol({ sureDk: null })], [], 0);
    assert.deepEqual(yok.yerlesmeyen, [{ isEmriId: 20, neden: 'Süre bilinmiyor.' }, { isEmriId: 11, neden: 'Bağlı parti yerleşmedi.' }]);
    const dongu = oner([is({ id: 30, bagli: [40] }), is({ id: 40, uretimEmriId: 2, bagli: [30] })], [], 0);
    assert.deepEqual(dongu.yerlesmeyen.map((y) => [y.isEmriId, y.neden]), [[30, 'Bağlı parti yerleşmedi.'], [40, 'Bağlı parti yerleşmedi.']]);
    const sabit = oner([is({ id: 50, bagli: [9] })], [{ isEmriId: 9, uretimEmriId: 9, sira: 1, kaynak: M2, baslangic: 0, bitis: 45 }], 0);
    assert.equal(sabit.yerlesimler[0]?.baslangic, 45);
  });

  test('P1: motor sabitleri yerinde bırakır, adaylardan en erken bitireni seçer; kaynaksız ve süresiz iş yerleşmez', () => {
    const s = oner([
      is({ id: 1 }),
      is({ id: 2, uretimEmriId: 2, kaynak: M1, adaylar: [M2] }),
      is({ id: 3, uretimEmriId: 3, kaynak: null, adaylar: [] }),
      is({ id: 4, uretimEmriId: 4, sureDk: null }),
    ], [{ isEmriId: 9, uretimEmriId: 9, sira: 1, kaynak: M1, baslangic: 0, bitis: 30 }], 0);
    assert.deepEqual(s.yerlesimler.map((y) => [y.isEmriId, y.kaynak.id, y.baslangic]), [[1, 1, 30], [2, 2, 0]]);
    assert.deepEqual(s.yerlesmeyen.map((y) => y.isEmriId).sort(), [3, 4]);
  });

  test('Verim: süre kaynağın istasyon verimine bölünür; adaylardan verimli olan en erken bitirir', () => {
    const verim = (k: { id: number }) => (k.id === 1 ? 0.5 : 1);
    assert.deepEqual(oner([is({ id: 1 })], [], 0, undefined, undefined, verim).yerlesimler.map((y) => [y.kaynak.id, y.bitis]), [[1, 120]]);
    assert.deepEqual(oner([is({ id: 1, adaylar: [M2] })], [], 0, undefined, undefined, verim).yerlesimler.map((y) => [y.kaynak.id, y.bitis]), [[2, 60]]);
    assert.deepEqual(oner([is({ id: 1 })], [], 0).yerlesimler.map((y) => y.bitis), [60]);
  });

  test('P5 uyarı: teslim gecikmesi, sıraya aykırı başlangıç, rota dışı kaynak; sıralama arka arkaya dizer', () => {
    const y = { baslangic: 50, bitis: 120, kaynak: M2 };
    const u = uyarilar(y, { teslimDk: 100, enErken: 60, rotaKaynaklari: [M1] });
    assert.equal(u.length, 3);
    assert.deepEqual(uyarilar(y, { teslimDk: null, enErken: null, rotaKaynaklari: [] }), []);
    assert.deepEqual(arkaArkaya([10, 20], 5), [{ baslangic: 5, bitis: 15 }, { baslangic: 15, bitis: 35 }]);
  });

  // Gündüz 08:00-16:00 iki gün: [480, 960], [1920, 2400].
  const VARDIYA = [{ baslangic: 480, bitis: 960 }, { baslangic: 1920, bitis: 2400 }];

  test('PL-04: iş çalışma aralığında başlar, vardiya bitince ertesi vardiyada sürer; takvimsiz sürekli', () => {
    assert.equal(calismaBitisi(VARDIYA, 900, 120), 1980);
    assert.equal(calismaBitisi(null, 900, 120), 1020);
    assert.deepEqual(takvimliBosluk([], VARDIYA, 0, 60), { baslangic: 480, bitis: 540 });
    assert.deepEqual(takvimliBosluk([{ baslangic: 480, bitis: 940 }], VARDIYA, 0, 60), { baslangic: 940, bitis: 1960 });
  });

  test('Z4: elle sıralama ve taşıma takvimle dizer; vardiya dışındaki başlangıç ilk çalışma anına kayar, ufka sığmayan null', () => {
    assert.deepEqual(arkaArkaya([120, 60], 900, VARDIYA), [{ baslangic: 900, bitis: 1980 }, { baslangic: 1980, bitis: 2040 }]);
    assert.deepEqual(arkaArkaya([30], 1000, VARDIYA), [{ baslangic: 1920, bitis: 1950 }]);
    assert.equal(arkaArkaya([600], 900, VARDIYA), null);
  });

  test('PL-05: ufukta çalışma zamanı bulamayan iş yerleşmez; ardılı da yerleşmez, emir zamanında sayılmaz', () => {
    assert.equal(takvimliBosluk([], VARDIYA, 0, 2000), null);
    const s = oner([is({ id: 1, sureDk: 2000 }), is({ id: 2, sira: 2, sureDk: 10 })], [], 0, undefined, () => VARDIYA);
    assert.deepEqual(s.yerlesimler, []);
    assert.deepEqual(s.yerlesmeyen.map((x) => [x.isEmriId, x.neden]), [[1, 'Plan ufkunda çalışma zamanı bulunamadı.'], [2, 'Önceki iş emri yerleşmedi.']]);
    const g = gostergeler([], [{ id: 1, teslimDk: 5000, isSayisi: 2 }], 3 * GUN);
    assert.equal(g.zamanindaYuzde, 0);
    assert.equal(g.geciken, 1);
  });

  test('PL-07: öncelik kuralı teslimi erken olanı, eşitse acili önce (karar: elle > teslim > öncelik), EDD en erken teslimi, SPT en kısa işi, CR en sıkışık emri önce alır', () => {
    const e = [
      { id: 1, oncelik: 3, teslimDk: 1000, sureDk: 600, elleSira: null },
      { id: 2, oncelik: 1, teslimDk: 5000, sureDk: 60, elleSira: null },
      { id: 3, oncelik: 2, teslimDk: 2000, sureDk: 1900, elleSira: null },
    ];
    assert.deepEqual(emirSirasi(e, 'oncelik', 0).map((x) => x.id), [1, 3, 2]);
    assert.deepEqual(emirSirasi([...e, { id: 4, oncelik: 1, teslimDk: 1000, sureDk: 10, elleSira: null }], 'oncelik', 0).map((x) => x.id), [4, 1, 3, 2]);
    assert.deepEqual(emirSirasi(e, 'edd', 0).map((x) => x.id), [1, 3, 2]);
    assert.deepEqual(emirSirasi(e, 'spt', 0).map((x) => x.id), [2, 1, 3]);
    assert.deepEqual(emirSirasi(e, 'cr', 0).map((x) => x.id), [3, 1, 2]);
  });

  test('72 b: kaynak boş kalmaz; boşalan kaynağa o an hazır işlerden kural seçer, sonra gelecek acil iş için yer tutulmaz', () => {
    // E1 (teslimi erken): 1. adım M2'de 200 dk, 2. adım M1'de. E2 (teslimi geç): M1'de 380 dk, hemen hazır. M1 0'da boş: E2 başlar, E1'in 2. adımı arkasında.
    const isler = [
      is({ id: 1, uretimEmriId: 1, sira: 1, kaynak: M2, sureDk: 200, teslimDk: 1000 }), is({ id: 2, uretimEmriId: 1, sira: 2, kaynak: M1, sureDk: 100, teslimDk: 1000 }),
      is({ id: 3, uretimEmriId: 2, sira: 1, kaynak: M1, sureDk: 380, teslimDk: 5000 }),
    ];
    const y = oner(isler, [], 0).yerlesimler;
    assert.deepEqual(y.map((x) => [x.isEmriId, x.baslangic]), [[1, 0], [2, 380], [3, 0]]);
  });

  test('S1 a: SPT o adımın süresine, FIFO adımın hazır olduğu ana bakar (emrin toplamına ya da açılışına değil)', () => {
    // E1: kısa toplam (M2 10 + M1 300). E2: tek adım M1 100. İkisinin M1 adımı 10'da hazır yarışır: SPT kısa adımı (E2) seçer.
    const spt = oner([
      is({ id: 1, uretimEmriId: 1, sira: 1, kaynak: M2, sureDk: 10 }), is({ id: 2, uretimEmriId: 1, sira: 2, kaynak: M1, sureDk: 300 }),
      is({ id: 3, uretimEmriId: 2, sira: 1, kaynak: M1, sureDk: 100, emirBaslangicDk: 10 }),
    ], [], 0, { kural: 'spt', yon: 'ileri', tamponDk: 0 }).yerlesimler;
    assert.deepEqual(spt.map((x) => [x.isEmriId, x.baslangic]).sort((a, b) => a[0]! - b[0]!), [[1, 0], [2, 110], [3, 10]]);
    // FIFO: E1 önce açılmış ama M1 adımı 50'de hazır; E2 sonra açılmış, M1 adımı 20'de hazır. M1 50'ye dek E3 ile dolu: 50'de önce hazır olan E2.
    const fifo = oner([
      is({ id: 1, uretimEmriId: 1, sira: 1, kaynak: M2, sureDk: 50, acilmaDk: -100 }), is({ id: 2, uretimEmriId: 1, sira: 2, kaynak: M1, sureDk: 10, acilmaDk: -100 }),
      is({ id: 3, uretimEmriId: 2, sira: 1, kaynak: M1, sureDk: 10, acilmaDk: -50, emirBaslangicDk: 20 }),
    ], [{ isEmriId: 99, uretimEmriId: 99, sira: 1, kaynak: M1, baslangic: 0, bitis: 50 }], 0, { kural: 'fifo', yon: 'ileri', tamponDk: 0 }).yerlesimler;
    assert.deepEqual(fifo.map((x) => [x.isEmriId, x.baslangic]).sort((a, b) => a[0]! - b[0]!), [[1, 0], [2, 60], [3, 50]]);
  });

  test('218 a: CR teslime kalan süreyi kaynağın vardiya takviminde sayar', () => {
    // İkisi 0'da M1'de yarışır; vardiya 480-960 ve 1920-2400. E1: teslim 1900 (gece), kalan iş 120: takvimde kalan 480 dk, oran 4. E2: teslim 960,
    // kalan iş 100: takvimde 480 dk, oran 4,8. Düz dakikayla E2 önde olurdu (960/100 = 9,6 < 1900/120 = 15,8).
    const isler = [
      is({ id: 1, uretimEmriId: 1, sureDk: 120, teslimDk: 1900 }), is({ id: 2, uretimEmriId: 2, sureDk: 100, teslimDk: 960 }),
    ];
    const y = oner(isler, [], 0, { kural: 'cr', yon: 'ileri', tamponDk: 0 }, () => VARDIYA_2).yerlesimler;
    assert.deepEqual(y.map((x) => [x.isEmriId, x.baslangic]).sort((a, b) => a[0]! - b[0]!), [[1, 480], [2, 600]]);
  });

  test('196 a: gecikme bedeli tutar x günlük ceza / 24, en az taban; elle öncelik çarpandır; tutarsız, cezasız, satırsız ve TL dışı satır taban alır', () => {
    const satir = (tutar: string, cezaOraniGun: string | null, paraBirimi = 'TRY') => ({ tutar, paraBirimi, cezaOraniGun });
    assert.equal(gecikmeBedeli(satir('2400000', '1'), 3), 1000);
    assert.equal(gecikmeBedeli(satir('2400000', '1'), 1), 2000);
    assert.equal(gecikmeBedeli(satir('2400000', '1'), 4), 500);
    assert.equal(gecikmeBedeli(satir('2400000', '1', 'EUR'), 3), TABAN_BEDEL_SAAT);
    assert.equal(gecikmeBedeli(satir('2400000', null), 3), TABAN_BEDEL_SAAT);
    assert.equal(gecikmeBedeli(satir('1000', '1'), 3), TABAN_BEDEL_SAAT, 'küçük ceza tabanın altına inmez');
    assert.equal(gecikmeBedeli(null, 2), 2 * TABAN_BEDEL_SAAT);
    assert.equal(gecikmeBedeli(null, null), TABAN_BEDEL_SAAT);
  });

  test('201 a: fiyatsız sipariş satırı (tutar boş) 0 değil taban bedel alır; elle öncelik çarpanı yine uygulanır', () => {
    assert.equal(gecikmeBedeli({ tutar: null, paraBirimi: 'TRY', cezaOraniGun: '1' }, 3), TABAN_BEDEL_SAAT);
    assert.equal(gecikmeBedeli({ tutar: null, paraBirimi: 'TRY', cezaOraniGun: '1' }, 1), 2 * TABAN_BEDEL_SAAT);
  });

  test('6a: elle çarpan varsa öncelik çarpanının yerine geçer; sınır plan.yaz için 2, siparisler.onayla için 3', () => {
    const satir = { tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1' };
    assert.equal(gecikmeBedeli(satir, 4, 3), 3000);
    assert.equal(gecikmeBedeli(null, 1, 0.5), 0.5 * TABAN_BEDEL_SAAT);
    assert.equal(gecikmeBedeli(null, 1, null), 2 * TABAN_BEDEL_SAAT);
    assert.equal(elleCarpanSiniri(false), 2);
    assert.equal(elleCarpanSiniri(true), 3);
  });

  test('6b: taban ve sınıf eşikleri ayardan verilir; verilmezse bugünkü değerler', () => {
    assert.equal(gecikmeBedeli(null, 3, null, 200), 200);
    assert.equal(gecikmeBedeli({ tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1' }, 3, null, 2000), 2000, 'taban bedelden büyükse taban');
    const bedeller = new Map([[1, 100], [2, 150], [3, 200], [4, 60], [5, 90]]);
    assert.deepEqual([...oncelikSiniflari(bedeller, { yuksek: 2, dusuk: 0.5 })], [[1, 2], [2, 2], [3, 1], [4, 2], [5, 2]]);
  });

  test('6c: maliyet = çarpan × (en az(taban × gecikme, ceza + kâr riski × gecikme) + finansman × bitiş ya da termine kadar saat); vade terminde başlar (3b), ceza tavandan sonra son oranla sürer (2b)', () => {
    const ayar = { tabanSaat: 150, finansmanOraniGun: 0.12, karRiskiOraniGun: 0.3 };
    const satir = (o: Partial<MaliyetSatiri> = {}): MaliyetSatiri => ({ tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1', cezaTavaniOrani: null, katkiPayi: '480000', ...o });
    // Saatlik: ceza 2.400.000 × %1 / 24 = 1.000; finansman 2.400.000 × %0,12 / 24 = 120; kâr riski 480.000 × %0,3 / 24 = 60.
    // Teslimden 10 saat geç, şimdiden 50 saat sonra biten emir: gecikme 10 × 1.060, finansman 50 × 120.
    assert.equal(gecikmeMaliyeti(satir(), 1, { bitisSaat: 50, teslimSaat: 40 }, ayar), 10600 + 6000);
    assert.equal(gecikmeMaliyeti(satir(), 2, { bitisSaat: 50, teslimSaat: 40 }, ayar), 2 * 16600, 'elle çarpan bütün maliyeti çarpar');
    assert.equal(gecikmeMaliyeti(satir(), 1, { bitisSaat: 30, teslimSaat: 40 }, ayar), 4800, '3b: erken bitiş tahsilatı öne çekmez; mamul termine kadar bekler, finansman termine kadar');
    assert.equal(gecikmeMaliyeti(satir(), 1, { bitisSaat: 30, teslimSaat: null }, ayar), 3600, 'teslimsiz emir gecikmez');
    assert.equal(gecikmeMaliyeti(satir(), 1, { bitisSaat: -2, teslimSaat: -5 }, ayar), 0 + 3 * 1060, 'geçmişte biten emre finansman yazılmaz');
    // Tavan tutarın %0,5'i = 12.000 TL; 2b: tavan dolunca bedel tabana düşmez, ceza son oranıyla (1.000/sa) sürer: 24 saatte 24.000.
    assert.equal(gecikmeMaliyeti(satir({ cezaTavaniOrani: '0.5' }), 1, { bitisSaat: 24, teslimSaat: 0 }, ayar), 24000 + 60 * 24 + 120 * 24);
    assert.equal(gecikmeMaliyeti(satir({ cezaOraniGun: null, katkiPayi: null }), 1, { bitisSaat: 10, teslimSaat: 0 }, { ...ayar, finansmanOraniGun: null }), 1500, 'boş oranlar girmez, taban kalır');
    assert.equal(gecikmeMaliyeti(satir({ paraBirimi: 'EUR' }), 1, { bitisSaat: 10, teslimSaat: 0 }, ayar), 1500);
    assert.equal(gecikmeMaliyeti(satir({ tutar: null, katkiPayi: null }), 1, { bitisSaat: 10, teslimSaat: 0 }, ayar), 1500, '201 a: fiyatsız satır tabanda');
    assert.equal(gecikmeMaliyeti(null, 0.5, { bitisSaat: 10, teslimSaat: 0 }, ayar), 750);
  });

  test('35 b: taban emrin sipariş satırı adedindeki payıyla ağırlanır; iki yarım emir bir bütün emir kadar taban sayar', () => {
    const ayar = { tabanSaat: 150, finansmanOraniGun: null, karRiskiOraniGun: 0.3 };
    const fiyatsiz: MaliyetSatiri = { tutar: null, paraBirimi: 'TRY', cezaOraniGun: null, cezaTavaniOrani: null, katkiPayi: null };
    assert.equal(adetPayi({ miktar: '20' }, 10), 0.5);
    assert.equal(adetPayi({ miktar: '20' }, 30), 1, 'satırdan büyük emir payı 1');
    assert.equal(adetPayi({ miktar: '0' }, 10), 1, 'miktarı bilinmeyen satır');
    assert.equal(adetPayi(null, 10), 1, 'satırsız emir');
    assert.equal(gecikmeMaliyeti(fiyatsiz, 1, { bitisSaat: 10, teslimSaat: 0 }, ayar, 0.5), 750);
    assert.equal(gecikmeMaliyeti(fiyatsiz, 1, { bitisSaat: 10, teslimSaat: 0 }, ayar), 1500, 'pay verilmezse 1');
    const yarim = { bitDk: 10 * 60, teslimDk: 0, satir: fiyatsiz, carpan: 1, pay: 0.5 };
    assert.equal(planMaliyeti([yarim, yarim], ayar), planMaliyeti([{ ...yarim, pay: 1 }], ayar), 'bölünen sipariş tabanı iki kez saymaz');
    // Ceza tabanı aşınca pay cezaya ikinci kez uygulanmaz: ceza emrin tutar payıyla zaten ağırlıdır (225).
    const cezali: MaliyetSatiri = { tutar: '1200000', paraBirimi: 'TRY', cezaOraniGun: '1', cezaTavaniOrani: null, katkiPayi: null };
    assert.equal(gecikmeMaliyeti(cezali, 1, { bitisSaat: 10, teslimSaat: 0 }, ayar, 0.5), 5000);
  });

  test('6c: planın TL toplamı yerleşen emirlerin maliyet toplamıdır; yerleşmemiş emrin bitişi bilinmez, toplama girmez; çarpan elle yoksa öncelikten', () => {
    const ayar = { tabanSaat: 150, finansmanOraniGun: 0.12, karRiskiOraniGun: 0.3 };
    const satir: MaliyetSatiri = { tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1', cezaTavaniOrani: null, katkiPayi: null };
    // 1. emir teslimden 10 saat geç, şimdiden 50 saat sonra biter: 10 × 1.000 + 50 × 120. 2. emir satırsız, 2 saat geç, öncelik 1 (çarpan 2).
    const emirler = [
      { bitDk: 50 * 60, teslimDk: 40 * 60, satir, carpan: bedelCarpani(3, null) },
      { bitDk: 5 * 60, teslimDk: 3 * 60, satir: null, carpan: bedelCarpani(1, null) },
    ];
    assert.equal(planMaliyeti(emirler, ayar), 10000 + 6000 + 2 * 150 * 2);
    assert.equal(planMaliyeti([...emirler, { bitDk: null, teslimDk: 0, satir, carpan: 1 }], ayar), 10000 + 6000 + 2 * 150 * 2);
    assert.equal(planMaliyeti([], ayar), 0);
    assert.equal(bedelCarpani(4, 2.5), 2.5, 'elle çarpan önceliğin yerine geçer');
    assert.equal(bedelCarpani(null, null), 1);
  });

  test('denetim #21, 265 a: öncelik ve müşteri sınıfı çarpanı ayardan; sınıf elle çarpanla da çarpılır; sınıfı boş müşteri 1', () => {
    const c = { yuksekCarpani: 3, normalCarpani: 1.2, dusukCarpani: 0.4, sinifACarpani: 2, sinifBCarpani: 1, sinifCCarpani: 0.5 };
    assert.deepEqual([1, 2, 3, 4, null].map((o) => bedelCarpani(o, null, null, c)), [3, 3, 1.2, 0.4, 1.2]);
    assert.deepEqual([1, 2, 3, 4, null].map((o) => bedelCarpani(o, null)), [2, 2, 1, 0.5, 1], 'varsayılan bugünkü sabitler (195 a)');
    assert.deepEqual((['A', 'B', 'C', null] as const).map((x) => bedelCarpani(3, null, x, c)), [2.4, 1.2, 0.6, 1.2]);
    assert.deepEqual((['A', 'B', 'C'] as const).map((x) => bedelCarpani(3, null, x)), [1.5, 1, 0.7], 'varsayılan A 1,5, B 1, C 0,7');
    assert.equal(bedelCarpani(4, 2.5, 'A', c), 5, 'elle çarpan önceliğin yerine geçer, sınıfla çarpılır');
    assert.equal(gecikmeBedeli(null, 1, null, 100, 'C', c), 150);
  });

  test('denetim #21, 203 a: TL amacı kural planından başlar, kaynağı paylaşan ardışık emirleri değiştirip TL toplamı düşerse tutar; elle sıralı emir yerinde kalır; koşu sınırlı', () => {
    // Tek makine. A teslimi 5 sa, ucuz (150 TL/sa); B teslimi 6 sa, pahalı (1.000 TL/sa); ikisi de 6 sa. Kural A'yı öne alır: A 1 sa, B 6 sa geç (6.150 TL).
    // B önce: B zamanında, A 7 sa geç (1.050 TL).
    const isler = [is({ id: 1, uretimEmriId: 1, teslimDk: 300, sureDk: 360 }), is({ id: 2, uretimEmriId: 2, teslimDk: 360, sureDk: 360 })];
    const bedel = new Map([[1, 150], [2, 1000]]);
    const teslim = new Map([[1, 300], [2, 360]]);
    let kosu = 0;
    const kos = (sira?: ReadonlyMap<number, number>) => { kosu += 1; return oner(isler, [], 0, { ...VARSAYILAN_MOTOR, ...(sira ? { sira } : {}) }); };
    const maliyet = (r: ReturnType<typeof kos>) => r.yerlesimler.reduce((t, y) => t + bedel.get(y.isEmriId)! * Math.max(0, y.bitis - teslim.get(y.isEmriId)!) / 60, 0);
    const kural = kos();
    assert.deepEqual(kural.yerlesimler.map((y) => [y.isEmriId, y.baslangic]), [[1, 0], [2, 360]]);
    assert.equal(maliyet(kural), 6150);
    const tl = tlIyilestir(kos, maliyet, (id) => id, new Set());
    assert.deepEqual(tl.yerlesimler.map((y) => [y.isEmriId, y.baslangic]).sort((a, b) => a[0]! - b[0]!), [[1, 360], [2, 0]]);
    assert.equal(maliyet(tl), 1050);
    kosu = 0;
    assert.equal(maliyet(tlIyilestir(kos, maliyet, (id) => id, new Set([1]))), 6150, 'elle sıralı emir yer değiştirmez');
    kosu = 0;
    tlIyilestir(kos, maliyet, (id) => id, new Set(), 2);
    assert.equal(kosu, 2, 'sınır kural koşusunu da sayar');
    assert.deepEqual([1, 200, 400, 2000, 8000, 100000].map(tlKosuSiniri), [40, 40, 20, 4, 2, 2], 'koşu sayısı iş sayısıyla küçülür, en az 2');
  });

  test('225: emrin tutarı satırın birim fiyatı × emrin adedi; miktarı sıfır ya da tutarı boş satırda bilinmez', () => {
    assert.equal(emirTutari({ tutar: '2400000', miktar: '10' }, 4), '960000');
    assert.equal(emirTutari({ tutar: '2400000', miktar: '10.000' }, 10), '2400000');
    assert.equal(emirTutari({ tutar: null, miktar: '10' }, 4), null);
    assert.equal(emirTutari({ tutar: '2400000', miktar: '0' }, 4), null);
  });

  test('227 a: katkı payı = emrin tutarı − emrin açık iş emirlerinin tahmini maliyeti − emrin malzeme maliyeti; bir kalem bilinmiyorsa, TL değilse ya da fiyatsızsa bilinmez', () => {
    const emirler = new Map([
      [1, { tutar: '100000', paraBirimi: 'TRY' }], [2, { tutar: '50000', paraBirimi: 'TRY' }], [3, { tutar: '9000', paraBirimi: 'EUR' }],
      [4, { tutar: null, paraBirimi: 'TRY' }], [5, { tutar: '1000', paraBirimi: 'TRY' }],
    ]);
    const isler = [
      { id: 11, uretimEmriId: 1 }, { id: 12, uretimEmriId: 1 }, { id: 21, uretimEmriId: 2 }, { id: 22, uretimEmriId: 2 },
      { id: 31, uretimEmriId: 3 }, { id: 41, uretimEmriId: 4 }, { id: 51, uretimEmriId: 5 }, { id: 61, uretimEmriId: 6 },
    ];
    const maliyet = new Map<number, number | null>([[11, 30000], [12, 20000.5], [21, 1000], [22, null], [31, 10], [41, 10], [51, 10], [61, 10]]);
    const malzeme = new Map<number, number | null>([[1, 9999.5], [2, 0], [3, 0], [4, 0], [5, null]]);
    assert.deepEqual([...katkiPaylari(emirler, isler, maliyet, malzeme)], [[1, '40000'], [2, null], [3, null], [4, null], [5, null]]);
    assert.deepEqual([...katkiPaylari(emirler, [{ id: 99, uretimEmriId: 1 }], maliyet, malzeme)], [[1, null]], 'haritada olmayan iş emri bilinmez');
    assert.deepEqual([...katkiPaylari(emirler, [{ id: 11, uretimEmriId: 1 }], maliyet, new Map())], [[1, null]], 'malzeme maliyeti bilinmeyen emirde katkı bilinmez');
  });

  test('195 a: öncelik sınıfı ortanca bedelden: 1,5 katı ve üstü Yüksek, 0,6 katı ve altı Düşük, arası Normal; veri yokken elle öncelik sınıfı korur', () => {
    const s = oncelikSiniflari(new Map([[1, 100], [2, 150], [3, 200], [4, 60], [5, 90]]));
    assert.deepEqual([...s], [[1, 2], [2, 1], [3, 1], [4, 3], [5, 2]]);
    assert.deepEqual([...oncelikSiniflari(new Map([[1, 150], [2, 300], [3, 75], [4, 150]]))], [[1, 2], [2, 1], [3, 3], [4, 2]], 'çift sayıda ortanca iki ortanın ortalaması');
    assert.deepEqual([...oncelikSiniflari(new Map())], []);
  });

  test('PL-07: FIFO en eski açılan emri önce alır; eşitlikte emir numarası, elle sıra yine önde', () => {
    const e = [
      { id: 1, oncelik: 1, teslimDk: 100, sureDk: 10, elleSira: null, acilmaDk: -10 },
      { id: 2, oncelik: 3, teslimDk: 900, sureDk: 90, elleSira: null, acilmaDk: -500 },
      { id: 3, oncelik: 2, teslimDk: 500, sureDk: 50, elleSira: null, acilmaDk: -500 },
      { id: 4, oncelik: 4, teslimDk: 700, sureDk: 70, elleSira: 1, acilmaDk: -1 },
    ];
    assert.deepEqual(emirSirasi(e, 'fifo', 0).map((x) => x.id), [4, 2, 3, 1]);
  });

  test('PL-07: geri yönde emir teslimden tampon ve süre kadar önce başlar; ileri yönde hemen', () => {
    const isler = [is({ id: 1, teslimDk: 3000, sureDk: 100 })];
    assert.equal(oner(isler, [], 0, { kural: 'oncelik', yon: 'geri', tamponDk: 500 }).yerlesimler[0]?.baslangic, 2400);
    assert.equal(oner(isler, [], 0, { kural: 'oncelik', yon: 'ileri', tamponDk: 500 }).yerlesimler[0]?.baslangic, 0);
  });

  test('K2: geri yönde gece ve vardiya dışı düşülür; adımlar sondan geriye kendi takviminde sayılır', () => {
    // Gündüz 08:00-16:00 iki gün: [480, 960], [1920, 2400]. Teslim ikinci gün 10:00 (2040): 120 dk o sabah, 60 dk önceki akşam.
    const V = [{ baslangic: 480, bitis: 960 }, { baslangic: 1920, bitis: 2400 }];
    assert.equal(calismaBasiGeri(V, 2040, 180), 900);
    assert.equal(calismaBasiGeri(null, 2040, 180), 1860);
    assert.equal(calismaBasiGeri(V, 2040, 1000), null);
    const isler = [is({ id: 1, sira: 1, teslimDk: 2040, sureDk: 60 }), is({ id: 2, sira: 2, teslimDk: 2040, sureDk: 180 })];
    const y = oner(isler, [], 0, { kural: 'oncelik', yon: 'geri', tamponDk: 0 }, () => V).yerlesimler;
    assert.deepEqual(y.map((x) => [x.isEmriId, x.baslangic, x.bitis]), [[1, 840, 900], [2, 900, 2040]], 'teslimde biter, gece sayılmaz');
  });

  test('241 a: geri yönde makine doluysa emir önce erkene kaydırılır, ancak sığmazsa ileri itilir', () => {
    // E1 140-200'de; E2'nin geri başlangıcı (160) E1'e çarpar. Eskiden E2 200-260 (40 dk geç); şimdi ikisi de teslimde biter.
    const isler = [is({ id: 1, uretimEmriId: 1, teslimDk: 200, sureDk: 60 }), is({ id: 2, uretimEmriId: 2, teslimDk: 220, sureDk: 60 })];
    const y = oner(isler, [], 0, { kural: 'oncelik', yon: 'geri', tamponDk: 0 }).yerlesimler;
    assert.deepEqual(y.map((x) => [x.isEmriId, x.baslangic, x.bitis]), [[1, 100, 160], [2, 160, 220]]);
    // Erkene yer yoksa (şimdiden önce olamaz) ileri itilir.
    const dar = [is({ id: 1, uretimEmriId: 1, teslimDk: 60, sureDk: 60 }), is({ id: 2, uretimEmriId: 2, teslimDk: 80, sureDk: 60 })];
    assert.deepEqual(oner(dar, [], 0, { kural: 'oncelik', yon: 'geri', tamponDk: 0 }).yerlesimler.map((x) => [x.isEmriId, x.baslangic, x.bitis]), [[1, 0, 60], [2, 60, 120]]);
  });

  test('KY-03: elle sırası olan emir kural sırasından önce yerleşir; elle sıra yoksa kural', () => {
    const isler = [is({ id: 1, uretimEmriId: 1, oncelik: 1 }), is({ id: 2, uretimEmriId: 2, oncelik: 4, elleSira: 1 })];
    assert.deepEqual(oner(isler, [], 0).yerlesimler.map((y) => [y.isEmriId, y.baslangic]), [[2, 0], [1, 60]]);
    const kural = [is({ id: 1, uretimEmriId: 1, oncelik: 1 }), is({ id: 2, uretimEmriId: 2, oncelik: 4 })];
    assert.deepEqual(oner(kural, [], 0).yerlesimler.map((y) => [y.isEmriId, y.baslangic]), [[1, 0], [2, 60]]);
  });

  test('denetim #19: elle sıra makinede korunur; elle 2. iş, başlangıcı ileride olan elle 1. işin önündeki boşluğa geçmez', () => {
    const isler = [
      is({ id: 1, uretimEmriId: 1, sureDk: 100, elleSira: 1, emirBaslangicDk: 600 }),
      is({ id: 2, uretimEmriId: 2, sureDk: 300, elleSira: 2 }),
      is({ id: 3, uretimEmriId: 3, sureDk: 200 }),
    ];
    const y = new Map(oner(isler, [], 0).yerlesimler.map((x) => [x.isEmriId, [x.baslangic, x.bitis]]));
    assert.deepEqual(y.get(1), [600, 700]);
    assert.deepEqual(y.get(2), [700, 1000], 'elle 2. iş elle 1. işten sonra');
    assert.deepEqual(y.get(3), [0, 200], 'elle sırasız iş boşluğu doldurur');
    // Başka kaynakta elle 1. iş yoksa elle 2. iş beklemez.
    const ayri = [is({ id: 1, uretimEmriId: 1, sureDk: 100, elleSira: 1, emirBaslangicDk: 600 }), is({ id: 2, uretimEmriId: 2, kaynak: M2, sureDk: 300, elleSira: 2 })];
    assert.deepEqual(oner(ayri, [], 0).yerlesimler.find((x) => x.isEmriId === 2)!.baslangic, 0);
  });

  test('276 a: elle sıra işin kendi sırasıdır, emrinki değil; aynı makinede elle 2. iş, emrinin elle 3. işinden önce gelir', () => {
    const isler = [
      is({ id: 1, uretimEmriId: 1, sira: 1, sureDk: 50, elleSira: 1 }),
      is({ id: 2, uretimEmriId: 1, sira: 2, sureDk: 50, elleSira: 3, fasonBekleDk: 2000 }),
      is({ id: 3, uretimEmriId: 2, sira: 1, sureDk: 50, elleSira: 2 }),
      is({ id: 4, uretimEmriId: 2, sira: 2, sureDk: 50, elleSira: 4, fasonBekleDk: 2000 }),
    ];
    const y = new Map(oner(isler, [], 0).yerlesimler.map((x) => [x.isEmriId, [x.baslangic, x.bitis]]));
    assert.deepEqual([1, 3, 2, 4].map((id) => y.get(id)), [[0, 50], [50, 100], [2050, 2100], [2100, 2150]]);
  });

  test('282 a: personel kısıtı açıkken kişi-dakikası dolan güne o merkeze yeni iş konmaz, ilk uygun güne kayar', () => {
    const isler = [is({ id: 1, uretimEmriId: 1, sureDk: 60 }), is({ id: 2, uretimEmriId: 2, kaynak: M2, sureDk: 30 })];
    // İki makine aynı merkezde, makine başına bir kişi; ilk gün 60 kişi-dakikası var, ilk iş onu doldurur.
    const personel = { gun0: 0, merkezi: () => ({ id: 7, operator: 1 }), kapasite: new Map([[7, [60, 1000]]]) };
    const yer = (ayar: Parameters<typeof oner>[3]) => new Map(oner(isler, [], 0, ayar).yerlesimler.map((x) => [x.isEmriId, [x.baslangic, x.bitis]]));
    assert.deepEqual(yer({ kural: 'oncelik', yon: 'ileri', tamponDk: 0 }).get(2), [0, 30], 'kısıt yokken aynı gün');
    const k = yer({ kural: 'oncelik', yon: 'ileri', tamponDk: 0, personel });
    assert.deepEqual(k.get(1), [0, 60]);
    assert.deepEqual(k.get(2), [1440, 1470], 'dolu günden sonraki ilk gün');
    // Başka merkezin işi etkilenmez.
    const ayri = { ...personel, merkezi: (x: { id: number }) => ({ id: x.id === 1 ? 7 : 8, operator: 1 }) };
    assert.deepEqual(yer({ kural: 'oncelik', yon: 'ileri', tamponDk: 0, personel: ayri }).get(2), [0, 30]);
  });

  test('PL-11: darboğaz en dolu istasyondur; makine sayısı doluluğu böler; iş yoksa darboğaz yok', () => {
    const y = [
      { isEmriId: 1, uretimEmriId: 1, anahtar: 'makine:1', ad: 'M1', istasyon: { id: 10, ad: 'Torna' }, baslangic: 0, bitis: 600 },
      { isEmriId: 2, uretimEmriId: 2, anahtar: 'makine:2', ad: 'M2', istasyon: { id: 20, ad: 'Freze' }, baslangic: 0, bitis: 400 },
    ];
    const em = [{ id: 1, teslimDk: 700, isSayisi: 1 }, { id: 2, teslimDk: 300, isSayisi: 1 }];
    const g = gostergeler(y, em, 1000);
    assert.deepEqual(g.darbogaz, { istasyonId: 10, ad: 'Torna', dolulukYuzde: 60 });
    assert.equal(gostergeler(y, em, 1000, (id) => (id === 10 ? 2 : 1)).darbogaz?.ad, 'Freze');
    assert.equal(g.zamanindaYuzde, 50);
    assert.equal(g.ortAtolyeGun, 0.3);
    assert.equal(gostergeler([], [], 1000).darbogaz, null);
  });

  test('PL-04 göstergeler: doluluk çalışma dakikasıyla; gece ve hafta sonu yük de kapasite de sayılmaz, kapasitesi olmayan sıralanmaz', () => {
    // M1 08-16, 2. gün kapalı (hafta sonu); iş 1. gün 15:00 - 3. gün 09:00, 120 çalışma dakikası. Duvar saatinde 2520 dk sayılıyordu.
    const takvim = [{ baslangic: 480, bitis: 960 }, { baslangic: 3360, bitis: 3840 }];
    const y = [{ isEmriId: 1, uretimEmriId: 1, anahtar: 'makine:1', ad: 'M1', istasyon: { id: 10, ad: 'Torna' }, baslangic: 900, bitis: 3420 }];
    const g = gostergeler(y, [{ id: 1, teslimDk: null, isSayisi: 1 }], 3 * GUN, undefined, { takvim: () => takvim, istasyon: () => 960 });
    assert.deepEqual([g.enDoluKaynak, g.darbogaz], [{ ad: 'M1', dolulukYuzde: 13 }, { istasyonId: 10, ad: 'Torna', dolulukYuzde: 13 }]);
    const kapasitesiz = gostergeler(y, [], 3 * GUN, undefined, { takvim: () => [], istasyon: () => 0 });
    assert.deepEqual([kapasitesiz.enDoluKaynak, kapasitesiz.darbogaz], [null, null]);
  });

  test('Doluluk: kapasite yoksa bilinmez (null), sıfır değil; önizleme ve senaryo aynı yuvarlamayla', () => {
    assert.equal(yukYuzdesi([30, 0], [0, 0]), null);
    assert.equal(yukYuzdesi([], []), null);
    assert.equal(yukYuzdesi([100, 141], [480, 480]), 25);
    assert.equal(yukYuzdesi([0], [480]), 0);
  });

  test('Dondurma: şimdiden N gün içinde başlayan değişebilir işler donar; başlamış ve sonraki işler donmaz', () => {
    const y = [{ isEmriId: 1, baslangic: 100, bitis: 200 }, { isEmriId: 2, baslangic: 3 * GUN, bitis: 3 * GUN + 10 }, { isEmriId: 3, baslangic: 50, bitis: 60 }];
    assert.deepEqual(dondurulacaklar(y, 2, 0, (id) => id !== 3).map((x) => x.isEmriId), [1]);
    assert.deepEqual(dondurulacaklar(y, 0, 0, () => true), []);
  });

  test('Seçenekleri karşılaştır: her kural için son bitiş ve bugünkü plana göre başlangıcı değişen emir sayısı', () => {
    const isler = [is({ id: 1, uretimEmriId: 1, oncelik: 2, sureDk: 100 }), is({ id: 2, uretimEmriId: 2, oncelik: 1, sureDk: 10 })];
    const simdiki = new Map([[1, 0], [2, 100]]);
    const r = karsilastir(['oncelik', 'spt'], (k) => oner(isler, [], 0, { kural: k, yon: 'ileri', tamponDk: 0 }), simdiki, (id) => id, () => ({ geciken: 0, darbogaz: null }));
    assert.deepEqual(r.map((x) => [x.kural, x.sonBitisDk, x.etkilenenEmir]), [['oncelik', 110, 2], ['spt', 110, 2]]);
    const ayni = karsilastir(['edd'], () => ({ yerlesimler: [{ isEmriId: 1, kaynak: M1, baslangic: 0, bitis: 100 }] }), simdiki, (id) => id, () => ({ geciken: 0, darbogaz: null }));
    assert.equal(ayni[0]?.etkilenenEmir, 0);
  });

  test('PL-04: kapalı aralık çalışmadan çıkar; kesişim yalnız çalışma dakikasını sayar, takvimsiz kaynak sürekli', () => {
    const t = [{ baslangic: 0, bitis: 100 }, { baslangic: 200, bitis: 300 }];
    assert.deepEqual(araliktanCikar(t, [{ baslangic: 50, bitis: 250 }]), [{ baslangic: 0, bitis: 50 }, { baslangic: 250, bitis: 300 }]);
    assert.deepEqual(araliktanCikar(t, [{ baslangic: 100, bitis: 200 }]), t, 'değmeyen aralık kalır');
    assert.deepEqual(araliktanCikar(t, [{ baslangic: 210, bitis: 220 }]), [{ baslangic: 0, bitis: 100 }, { baslangic: 200, bitis: 210 }, { baslangic: 220, bitis: 300 }]);
    assert.equal(kesisimDk(t, 50, 250), 100);
    assert.equal(kesisimDk(null, 50, 250), 200);
    // Vardiya sonunu aşan işin gece süresi yük sayılmaz (#641): 50..250 işi 0..100 ve 200..300 vardiyalarında 100 dakika çalışır.
    assert.deepEqual(calisilanParcalar(t, { baslangic: 50, bitis: 250 }), [{ baslangic: 50, bitis: 100 }, { baslangic: 200, bitis: 250 }]);
    assert.deepEqual(calisilanParcalar(null, { baslangic: 50, bitis: 250 }), [{ baslangic: 50, bitis: 250 }]);
    assert.equal(kesisimDk(calisilanParcalar(t, { baslangic: 50, bitis: 250 }), 0, 1440), 100);
  });

  test('PL-09: kişi ihtiyacı yük x operatör, kapasite kişi takvimlerinin toplamı; sınırlı gün iş merkezleri arasında bir kez sayılır', () => {
    const tam = { calismaDk: [480, 480, 0], pay: 1 };
    const y = personelYuku([
      { isMerkeziId: 1, gunSayisi: 3, kisiler: [tam, tam], istasyonlar: [{ yuk: [400, 100, 0], operator: 1.5 }, { yuk: [200], operator: 1 }] },
      { isMerkeziId: 2, gunSayisi: 3, kisiler: [{ calismaDk: [480, 480, 480], pay: 1 }], istasyonlar: [{ yuk: [0, 0, 10], operator: 1 }] },
    ]);
    assert.deepEqual(y, [{ isMerkeziId: 1, ihtiyac: [800, 150, 0], kapasite: [960, 960, 0] }, { isMerkeziId: 2, ihtiyac: [0, 0, 10], kapasite: [480, 480, 480] }]);
    assert.equal(sinirliGunSayisi(y), 0);
    assert.equal(sinirliGunSayisi([{ ihtiyac: [10, 0, 5], kapasite: [5, 0, 1] }, { ihtiyac: [9, 0], kapasite: [1, 0] }]), 2);
    assert.equal(sinirliGunSayisi([{ ihtiyac: [1], kapasite: [] }]), 1, 'kapasitesi olmayan günde ihtiyaç sınırlıdır');
  });

  // Kart #1324: kişi takvimi Vardiya'dan gelir; izinli gün 0, planlı fazla mesai eklenmiştir. Pay atama yüzdesidir.
  test('PL-09 (#1324): izinli kişi havuzu düşürür, fazla mesai günü artırır, %50 atanan yarım sayılır', () => {
    const merkez = (kisiler: PersonelMerkezi['kisiler']) => personelYuku([{ isMerkeziId: 1, gunSayisi: 3, kisiler, istasyonlar: [] }])[0]!.kapasite;
    assert.deepEqual(merkez([{ calismaDk: [450, 450, 450], pay: 1 }, { calismaDk: [450, 0, 450], pay: 1 }]), [900, 450, 900], 'ikinci gün izinli kişi sayılmaz');
    assert.deepEqual(merkez([{ calismaDk: [450, 570, 450], pay: 1 }]), [450, 570, 450], 'fazla mesai günü kapasite artar');
    assert.deepEqual(merkez([{ calismaDk: [450, 450, 450], pay: 0.5 }]), [225, 225, 225], '%50 atanan kişi yarımdır');
  });

  test('PL-09 (#1324): operatör/makine 0,33 iken bir kişi üç makineyi tam besler, 1 iken beslemez', () => {
    const uc = (operator: number) => personelYuku([{
      isMerkeziId: 1, gunSayisi: 1, kisiler: [{ calismaDk: [450], pay: 1 }], istasyonlar: [{ yuk: [3 * 450], operator }],
    }]);
    const y = uc(0.33);
    assert.ok(y[0]!.ihtiyac[0]! <= y[0]!.kapasite[0]!, `ihtiyaç ${y[0]!.ihtiyac[0]} kapasite ${y[0]!.kapasite[0]}`);
    assert.equal(sinirliGunSayisi(y), 0);
    assert.equal(sinirliGunSayisi(uc(1)), 1);
  });
});

describe('tampon bolluğu vardiya kapasitesiyle (481 a)', () => {
  // Gün 10 (00:00 = 14400): 08:00-12:00 ve 13:00-17:00 (480 dk). Gün 9: 22:00-06:00 gece vardiyası, 02:00-02:30 mola (450 dk).
  const g0 = 10 * GUN;
  const gunler = new Map<number, { baslangic: number; bitis: number }[]>([
    [9, [{ baslangic: 9 * GUN + 1320, bitis: g0 + 120 }, { baslangic: g0 + 150, bitis: g0 + 360 }]],
    [10, [{ baslangic: g0 + 480, bitis: g0 + 720 }, { baslangic: g0 + 780, bitis: g0 + 1020 }]],
    [11, []],
  ]);
  const al = (g: number) => gunler.get(g);
  test('an, o gün başlayan vardiyaların dolan payıyla gün kesridir; mola ve vardiya dışı saymaz', () => {
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 840), 10 + 300 / 480);
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 1020), 11, 'son vardiyanın sonu ertesi günün başıdır (eski advance)');
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 1300), 11);
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 420), 10, 'vardiya başlamadan');
  });
  test('önceki günün gece vardiyası bitmeden gelen an o güne düşer', () => {
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 240), 9 + 330 / 450);
    assert.equal(kapasiteKesri(al, 10, g0, g0 + 360), 10, 'gece vardiyası bitti: bugünün başı');
  });
  test('takvimsiz kaynak ve okunmamış gün duvar saatiyle; vardiyasız gün kesirsiz', () => {
    assert.equal(kapasiteKesri(null, 10, g0, g0 + 720), 10.5);
    assert.equal(kapasiteKesri(al, 12, 12 * GUN, 12 * GUN + 360), 12.25);
    assert.equal(kapasiteKesri(al, 11, 11 * GUN, 11 * GUN + 600), 11);
  });
  test('bolluk teslim günü sonu eksi en geç kesir; teslim ya da adım yoksa null', () => {
    assert.equal(kapasiteBollugu(12, [10 + 300 / 480, 9.7]), 13 - 10.625);
    assert.equal(kapasiteBollugu(9, [10.625]), -0.625);
    assert.equal(kapasiteBollugu(null, [10]), null);
    assert.equal(kapasiteBollugu(12, []), null);
  });
});

describe('bölme adetleri (493 1 a)', () => {
  test('oran adım adedine en büyük kalanla dağıtılır; toplamı adım adedi', () => {
    assert.deepEqual(bolmeAdetleri([4, 6], 10), [4, 6]);
    assert.deepEqual(bolmeAdetleri([4, 6], 9), [4, 5]);
    assert.deepEqual(bolmeAdetleri([1, 1, 1], 10), [4, 3, 3]);
  });
  test('adım adedi tam sayı değilse, parçadan azsa ya da bir parça bir adetten az kalırsa yazılamaz', () => {
    assert.equal(bolmeAdetleri([4, 6], 9.5), null);
    assert.equal(bolmeAdetleri([1, 1, 1], 2), null);
    assert.equal(bolmeAdetleri([1, 999], 10), null);
    assert.equal(bolmeAdetleri([10], 10), null);
  });
});

describe('motor uyarıları (307 a)', () => {
  test('personel kısıtı açık ama personel verisi olan iş merkezi yoksa uyarılır; kısıt kapalıyken ya da veri varken uyarı yok', () => {
    assert.deepEqual(motorUyarilari({ personelKisiti: true, personelMerkeziSayisi: 0 }), [PERSONEL_TANIMSIZ]);
    assert.deepEqual(motorUyarilari({ personelKisiti: false, personelMerkeziSayisi: 0 }), []);
    assert.deepEqual(motorUyarilari({ personelKisiti: true, personelMerkeziSayisi: 2 }), []);
  });
});

describe('öncelik bandı sınırları (306 a)', () => {
  test('sınırlar ortanca bedelin eşik katlarıdır; sınıflar aynı sınırlardan çıkar', () => {
    const bedeller = new Map([[1, 150], [2, 150], [3, 450], [4, 100]]);
    const s = bantSinirlari(bedeller, { yuksek: 1.5, dusuk: 0.6 });
    assert.deepEqual(s, { yuksek: 225, dusuk: 90 });
    assert.deepEqual([...oncelikSiniflari(bedeller, { yuksek: 1.5, dusuk: 0.6 })], [[1, 2], [2, 2], [3, 1], [4, 2]]);
    assert.deepEqual(bantSinirlari(new Map(), { yuksek: 1.5, dusuk: 0.6 }), { yuksek: 0, dusuk: 0 });
  });

  test('PL-ONAY (146): sahip açık taslağı gönderir ve onaydakini çeker; onaylayan onaydakini alır ya da geri gönderir; dört göz gönderenin onayını keser', () => {
    const b = { durum: 'acik' as const, sahipMi: true, gonderenMi: false, studyo: true, canliyaAlir: true, dortGozAcik: false };
    assert.deepEqual(onayGecisleri(b), { onayaGonder: true, onaydanCek: false, geriGonder: false, canliyaAl: false });
    assert.match(onayGecisiReddi('canliya-al', b)!, /onayda değil/);
    assert.match(onayGecisiReddi('onaya-gonder', { ...b, sahipMi: false })!, /başka bir planlamacının/);
    assert.match(onayGecisiReddi('onaya-gonder', { ...b, studyo: false })!, /stüdyosu yetkisi/);
    const onayda = { ...b, durum: 'onayda' as const, gonderenMi: true };
    assert.deepEqual(onayGecisleri(onayda), { onayaGonder: false, onaydanCek: true, geriGonder: true, canliyaAl: true }, 'dört göz kapalı: gönderen de onaylar');
    assert.deepEqual(onayGecisleri({ ...onayda, dortGozAcik: true }), { onayaGonder: false, onaydanCek: true, geriGonder: false, canliyaAl: false });
    assert.match(onayGecisiReddi('canliya-al', { ...onayda, dortGozAcik: true })!, /Dört göz/);
    assert.equal(onayGecisiReddi('canliya-al', { ...onayda, dortGozAcik: true, sahipMi: false, gonderenMi: false }), null, 'başkası onaylar');
    assert.match(onayGecisiReddi('geri-gonder', { ...onayda, canliyaAlir: false })!, /canlıya alma yetkisi/);
    assert.match(onayGecisiReddi('onaya-gonder', onayda)!, /onaydan çek/);
    for (const durum of ['canliya_alindi', 'vazgecildi'] as const) {
      assert.deepEqual(onayGecisleri({ ...b, durum }), { onayaGonder: false, onaydanCek: false, geriGonder: false, canliyaAl: false });
    }
  });
});

describe('plan kuralları: 507 1 a ayar saati ve öncelik ağırlıklı gecikme', () => {
  test('PL-507-K: ayar parça başına toplanır; gecikme yalnız bütün işleri yerleşmiş, teslimli emirde; ağırlık 4/2/1, diğer 1, adet payıyla', () => {
    const y = [
      { isEmriId: 1, uretimEmriId: 1, ayarDk: 30, baslangic: 0, bitis: 600 }, { isEmriId: 1, uretimEmriId: 1, ayarDk: 30, baslangic: 0, bitis: 700 },
      { isEmriId: 2, uretimEmriId: 2, ayarDk: null, baslangic: 0, bitis: 400 }, { isEmriId: 3, uretimEmriId: 3, ayarDk: 15, baslangic: 0, bitis: 900 },
      { isEmriId: 4, uretimEmriId: 4, ayarDk: 0, baslangic: 0, bitis: 900 },
    ];
    const e = [
      { id: 1, teslimDk: 100, isSayisi: 1, oncelik: 1, pay: 0.5 }, { id: 2, teslimDk: 460, isSayisi: 1, oncelik: 2, pay: 1 },
      { id: 3, teslimDk: 300, isSayisi: 2, oncelik: 1, pay: 1 }, { id: 4, teslimDk: 300, isSayisi: 1, oncelik: 4, pay: 1 },
      { id: 5, teslimDk: null, isSayisi: 1, oncelik: 1, pay: 1 },
    ];
    // emir 1: 600 dk geç x 4 x 0,5 = 20 sa; emir 2 zamanında; emir 3 eksik yerleşmiş; emir 4: 600 dk x 1 = 10 sa.
    assert.deepEqual(ayarVeGecikme(y, e), { ayarSaat: 1.3, agirlikliGecikmeSaat: 30 });
    assert.deepEqual(ayarVeGecikme([], []), { ayarSaat: 0, agirlikliGecikmeSaat: 0 });
  });

  test('PL-507-2K: vardiya süresi gece yarısını geçer; hafta pazartesi başlar; bütçe hafta başına, sınırı aşan hafta döner', () => {
    assert.deepEqual([vardiyaSaati('22:00', '06:00'), vardiyaSaati('06:00', '08:30'), vardiyaSaati('08:00', '08:00')], [8, 2.5, 24]);
    assert.deepEqual([haftaBasi('2026-10-25'), haftaBasi('2026-10-26'), haftaBasi('2026-11-01')], ['2026-10-19', '2026-10-26', '2026-10-26']);
    const b = ekMesaiButcesi([{ gun: '2026-10-26', saat: 8 }, { gun: '2026-10-28', saat: 2.5 }, { gun: '2026-11-02', saat: 8 }], 8);
    assert.deepEqual(b, {
      toplamSaat: 18.5, haftaSiniriSaat: 8, haftalar: [{ hafta: '2026-10-26', saat: 10.5 }, { hafta: '2026-11-02', saat: 8 }],
      asanHaftalar: [{ hafta: '2026-10-26', saat: 10.5 }], asildi: true,
    });
    assert.equal(ekMesaiButcesi([{ gun: '2026-10-26', saat: 1 }], 0).asildi, true, 'sınır 0: her ek vardiya aşım');
    assert.equal(ekMesaiButcesi([], 0).asildi, false);
  });
});

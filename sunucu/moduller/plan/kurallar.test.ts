import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  araliklaraEkle, araliktanCikar, arkaArkaya, ayarVeGecikme, ekMesaiButcesi, haftaBasi, vardiyaSaati, bosluk, calisilanParcalar, calismaBitisi, dondurulacaklar, enErkenBaslangic, gostergeler, isSuresi, kesisimDk,
  adetPayi, bolmeAdetleri, kapasiteBollugu, kapasiteKesri, onayGecisiReddi, onayGecisleri, emirTutari, gecikmeMaliyeti, katkiPaylari, motorUyarilari, PERSONEL_TANIMSIZ, oncelikCarpani, oncelikSinifi, planMaliyeti, personelYuku, sinirliGunSayisi, takvimliBosluk, uyarilar, yukYuzdesi,
} from './kurallar.ts';
import type { MaliyetSatiri, PersonelMerkezi } from './kurallar.ts';

const M1 = { tur: 'makine' as const, id: 1 };
const M2 = { tur: 'makine' as const, id: 2 };
const GUN = 1440;

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

  test('815 (699/3 a): emrin önceliği motor sınıfına ve gecikme çarpanına çevrilir (195 a: 1 ve 2 Yüksek, 3 Normal, 4 Düşük); önceliksiz emir sınıfsız', () => {
    assert.deepEqual([1, 2, 3, 4, null, 7].map((o) => oncelikSinifi(o)), [1, 1, 2, 3, null, null]);
    assert.deepEqual([1, 2, 3, 4, null].map((o) => oncelikCarpani(o)), [2, 2, 1, 0.5, 1], 'varsayılan bugünkü sabitler');
    const c = { yuksekCarpani: 3, normalCarpani: 1.2, dusukCarpani: 0.4 };
    assert.deepEqual([1, 2, 3, 4, null].map((o) => oncelikCarpani(o, c)), [3, 3, 1.2, 0.4, 1.2], 'denetim #21: çarpanlar bedel ayarından');
  });

  test('6c: maliyet = çarpan × (en az(taban × gecikme, ceza + kâr riski × gecikme) + finansman × bitiş ya da termine kadar saat); vade terminde başlar (3b), ceza tavandan sonra son oranla sürer (2b)', () => {
    const ayar = { tabanSaat: 150, finansmanOraniGun: 0.12, karRiskiOraniGun: 0.3 };
    const satir = (o: Partial<MaliyetSatiri> = {}): MaliyetSatiri => ({ tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1', cezaTavaniOrani: null, katkiPayi: '480000', ...o });
    // Saatlik: ceza 2.400.000 × %1 / 24 = 1.000; finansman 2.400.000 × %0,12 / 24 = 120; kâr riski 480.000 × %0,3 / 24 = 60.
    // Teslimden 10 saat geç, şimdiden 50 saat sonra biten emir: gecikme 10 × 1.060, finansman 50 × 120.
    assert.equal(gecikmeMaliyeti(satir(), 1, { bitisSaat: 50, teslimSaat: 40 }, ayar), 10600 + 6000);
    assert.equal(gecikmeMaliyeti(satir(), 2, { bitisSaat: 50, teslimSaat: 40 }, ayar), 2 * 16600, 'öncelik çarpanı bütün maliyeti çarpar');
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

  test('6c: planın TL toplamı yerleşen emirlerin maliyet toplamıdır; yerleşmemiş emrin bitişi bilinmez, toplama girmez; çarpan emrin önceliğinden', () => {
    const ayar = { tabanSaat: 150, finansmanOraniGun: 0.12, karRiskiOraniGun: 0.3 };
    const satir: MaliyetSatiri = { tutar: '2400000', paraBirimi: 'TRY', cezaOraniGun: '1', cezaTavaniOrani: null, katkiPayi: null };
    // 1. emir teslimden 10 saat geç, şimdiden 50 saat sonra biter: 10 × 1.000 + 50 × 120. 2. emir satırsız, 2 saat geç, öncelik 1 (çarpan 2).
    const emirler = [
      { bitDk: 50 * 60, teslimDk: 40 * 60, satir, carpan: oncelikCarpani(3) },
      { bitDk: 5 * 60, teslimDk: 3 * 60, satir: null, carpan: oncelikCarpani(1) },
    ];
    assert.equal(planMaliyeti(emirler, ayar), 10000 + 6000 + 2 * 150 * 2);
    assert.equal(planMaliyeti([...emirler, { bitDk: null, teslimDk: 0, satir, carpan: 1 }], ayar), 10000 + 6000 + 2 * 150 * 2);
    assert.equal(planMaliyeti([], ayar), 0);
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

describe('plan onayı (146)', () => {
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

  test('PL-507-2K: vardiya süresi gece yarısını geçer; hafta pazartesi başlar; bütçe hafta başına, sınırı aşan hafta döner; 0 sınırsız', () => {
    assert.deepEqual([vardiyaSaati('22:00', '06:00'), vardiyaSaati('06:00', '08:30'), vardiyaSaati('08:00', '08:00')], [8, 2.5, 24]);
    assert.deepEqual([haftaBasi('2026-10-25'), haftaBasi('2026-10-26'), haftaBasi('2026-11-01')], ['2026-10-19', '2026-10-26', '2026-10-26']);
    const b = ekMesaiButcesi([{ gun: '2026-10-26', saat: 8 }, { gun: '2026-10-28', saat: 2.5 }, { gun: '2026-11-02', saat: 8 }], 8);
    assert.deepEqual(b, {
      toplamSaat: 18.5, haftaSiniriSaat: 8, haftalar: [{ hafta: '2026-10-26', saat: 10.5 }, { hafta: '2026-11-02', saat: 8 }],
      asanHaftalar: [{ hafta: '2026-10-26', saat: 10.5 }], asildi: true,
    });
    const sinirsiz = ekMesaiButcesi([{ gun: '2026-10-26', saat: 24 }, { gun: '2026-10-27', saat: 24 }], 0);
    assert.deepEqual([sinirsiz.asildi, sinirsiz.asanHaftalar, sinirsiz.haftalar], [false, [], [{ hafta: '2026-10-26', saat: 48 }]], 'sınır 0: sınır yok (eski motor)');
    assert.equal(ekMesaiButcesi([], 0).asildi, false);
  });

  test('PL-512K: ek vardiya penceresi takvime eklenir; çakışan ve bitişik aralık birleşir, sıra korunur', () => {
    const takvim = [{ baslangic: 0, bitis: 240 }, { baslangic: 1440, bitis: 1680 }];
    assert.deepEqual(araliklaraEkle(takvim, [{ baslangic: 240, bitis: 720 }]), [{ baslangic: 0, bitis: 720 }, { baslangic: 1440, bitis: 1680 }], 'bitişik');
    assert.deepEqual(araliklaraEkle(takvim, [{ baslangic: 1600, bitis: 1900 }, { baslangic: 3000, bitis: 3100 }]),
      [{ baslangic: 0, bitis: 240 }, { baslangic: 1440, bitis: 1900 }, { baslangic: 3000, bitis: 3100 }], 'çakışan ve ayrık');
    assert.deepEqual(araliklaraEkle(takvim, [{ baslangic: 60, bitis: 120 }]), takvim, 'içte kalan değiştirmez');
    assert.deepEqual(araliklaraEkle([], []), []);
    assert.deepEqual(takvim, [{ baslangic: 0, bitis: 240 }, { baslangic: 1440, bitis: 1680 }], 'girdi değişmez');
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aralik, araliklardanCikar, atamaPayi, durusAraliklari, fazlaMesaiHatasi, fazlaMesaiUyanlar, fazlaMesaiVardiyasi, gunNetDakikasiEk, izinliKisim, onayliIzinGunleri, durusHatasi, durusuDuzenle, gecmisMi, gunFarki, gunNetDakikasi, gununCalismaAraliklari, gununMolaAraliklari, gununSonDakikasi, kaynagaUyanlar, gunlukDakika, gununVardiyalari, haftaGunu, haftaKopyasi, kisininIstasyonu, topluMatris, molaDenetle, netDakika, takvimGunleriniBirlestir,
  kisiTakvimiGorunur, takvimAraliklari, tarihEkle, vardiyaKadrosu, vardiyaParcalari,
} from './kurallar.ts';

const GUNDUZ = { id: 1, baslangic: '08:00', bitis: '16:00', aktif: true, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 };
const GECE = { id: 2, baslangic: '22:00', bitis: '06:00', aktif: true, molalar: [{ baslangic: '02:00', bitis: '02:30' }], netDakika: 450 };
const PASIF = { id: 3, baslangic: '16:00', bitis: '00:00', aktif: false, molalar: [], netDakika: 480 };
const VARDIYALAR = new Map([GUNDUZ, GECE, PASIF].map((v) => [v.id, v]));

describe('vardiya kuralları', () => {
  test('VR-01: net süre vardiyadan molalar düşülerek bulunur; gece yarısını geçen vardiya doğru sayılır', () => {
    assert.equal(netDakika('08:00', '16:00', [{ baslangic: '12:00', bitis: '12:30' }]), 450);
    assert.equal(aralik('22:00', '06:00'), 480);
    assert.equal(netDakika('22:00', '06:00', [{ baslangic: '02:00', bitis: '02:30' }]), 450);
  });

  test('VR-05: mola vardiyanın içinde olmalı ve molalar çakışmamalı', () => {
    assert.equal(molaDenetle('08:00', '16:00', [{ baslangic: '12:00', bitis: '12:30' }]), null);
    assert.match(molaDenetle('08:00', '16:00', [{ baslangic: '15:45', bitis: '16:15' }]) ?? '', /içinde/);
    assert.match(molaDenetle('08:00', '16:00', [{ baslangic: '12:00', bitis: '12:30' }, { baslangic: '12:15', bitis: '12:45' }]) ?? '', /çakış/);
    assert.equal(molaDenetle('22:00', '06:00', [{ baslangic: '02:00', bitis: '02:30' }]), null);
  });

  test('VR-01, VR-02: günlük süre o günün açık ve aktif vardiyalarının toplamıdır; tatil ve kapalı günde sıfırdır', () => {
    const m = [{ isMerkeziId: 5, gun: 3, vardiyaId: 1 }, { isMerkeziId: 5, gun: 3, vardiyaId: 2 }, { isMerkeziId: 5, gun: 3, vardiyaId: 3 }];
    assert.equal(haftaGunu('2026-10-07'), 3);
    assert.equal(haftaGunu('2026-10-11'), 7);
    assert.equal(gunlukDakika('2026-10-07', 5, m, VARDIYALAR, new Set()), 900);
    assert.equal(gunlukDakika('2026-10-08', 5, m, VARDIYALAR, new Set()), 0);
    assert.equal(gunlukDakika('2026-10-07', 5, m, VARDIYALAR, new Set(['2026-10-07'])), 0);
    assert.equal(gunlukDakika('2026-10-07', 6, m, VARDIYALAR, new Set()), 0);
  });

  test('VR-08: kişinin vardiyası verilirse yalnız o vardiya sayılır', () => {
    const m = [{ isMerkeziId: 5, gun: 3, vardiyaId: 1 }, { isMerkeziId: 5, gun: 3, vardiyaId: 2 }];
    assert.deepEqual(gununVardiyalari('2026-10-07', 5, m, VARDIYALAR, new Set(), 2).map((v) => v.id), [2]);
    assert.deepEqual(gununVardiyalari('2026-10-07', 5, m, VARDIYALAR, new Set(), null).map((v) => v.id), [1, 2]);
    assert.equal(gunlukDakika('2026-10-08', 5, m, VARDIYALAR, new Set(), 2), 0);
  });

  test('VR-07: vardiya parçaları molayı dışarıda bırakır; gece vardiyası 24:00\'ı geçer', () => {
    assert.deepEqual(vardiyaParcalari(GUNDUZ), [{ bas: 480, bit: 720 }, { bas: 750, bit: 960 }]);
    assert.deepEqual(vardiyaParcalari(GECE), [{ bas: 1320, bit: 1560 }, { bas: 1590, bit: 1800 }]);
    assert.deepEqual(vardiyaParcalari({ baslangic: '06:00', bitis: '14:00', molalar: [] }), [{ bas: 360, bit: 840 }]);
  });

  test('VR-07: takvim aralıkları önceki günden taşan gece vardiyasını alır, aralık dışını keser, bitişik parçaları birleştirir', () => {
    // Pazartesi 2026-10-05; matris: her gün gündüz, pazar gece.
    const gunu = (tarih: string) => (haftaGunu(tarih) === 7 ? [GECE] : [GUNDUZ]);
    const a = takvimAraliklari('2026-10-05', 1, gunu);
    // Pazar gecesinin pazartesiye taşan kısmı (00:00-02:00, 02:30-06:00) ve pazartesi gündüzü.
    assert.deepEqual(a, [{ bas: 0, bit: 120 }, { bas: 150, bit: 360 }, { bas: 480, bit: 720 }, { bas: 750, bit: 960 }]);
    // Son günün gece vardiyası aralığın sonunda kesilir.
    assert.deepEqual(takvimAraliklari('2026-10-11', 1, () => [GECE]), [{ bas: 0, bit: 120 }, { bas: 150, bit: 360 }, { bas: 1320, bit: 1440 }]);
    // Art arda iki vardiya tek aralıktır; açık vardiyası olmayan gün aralık vermez.
    const ard = [{ baslangic: '06:00', bitis: '14:00', molalar: [] }, { baslangic: '14:00', bitis: '22:00', molalar: [] }];
    assert.deepEqual(takvimAraliklari('2026-10-05', 2, (t) => (t === '2026-10-05' ? ard : [])), [{ bas: 360, bit: 1320 }]);
    assert.deepEqual(takvimAraliklari('2026-10-05', 3, () => []), []);
  });

  test('VR-06: haftayı uygula kaynağın satırlarını hedeflere kopyalar, hedefin eski satırları gelmez, kaynak kendine kopyalanmaz', () => {
    const m = [{ isMerkeziId: 1, gun: 1, vardiyaId: 1 }, { isMerkeziId: 1, gun: 2, vardiyaId: 2 }, { isMerkeziId: 2, gun: 7, vardiyaId: 1 }];
    assert.deepEqual(haftaKopyasi(m, 1, [1, 2, 3]), [
      { isMerkeziId: 2, gun: 1, vardiyaId: 1 }, { isMerkeziId: 2, gun: 2, vardiyaId: 2 },
      { isMerkeziId: 3, gun: 1, vardiyaId: 1 }, { isMerkeziId: 3, gun: 2, vardiyaId: 2 },
    ]);
    assert.deepEqual(haftaKopyasi(m, 9, [1, 2]), []);
  });

  test('VR-18: toplu matris ekler, kaldırır ve ayarlar; seçilmeyen gün ve merkez değişmez', () => {
    const m = [{ isMerkeziId: 1, gun: 1, vardiyaId: 1 }, { isMerkeziId: 1, gun: 2, vardiyaId: 2 }, { isMerkeziId: 2, gun: 1, vardiyaId: 2 }];
    assert.deepEqual(topluMatris(m, [1], [1, 3], [2], 'ekle'), [
      { isMerkeziId: 1, gun: 1, vardiyaId: 1 }, { isMerkeziId: 1, gun: 1, vardiyaId: 2 }, { isMerkeziId: 1, gun: 2, vardiyaId: 2 }, { isMerkeziId: 1, gun: 3, vardiyaId: 2 },
    ]);
    assert.deepEqual(topluMatris(m, [1, 2], [1], [2], 'kaldir'), [{ isMerkeziId: 1, gun: 1, vardiyaId: 1 }, { isMerkeziId: 1, gun: 2, vardiyaId: 2 }]);
    assert.deepEqual(topluMatris(m, [1], [1], [2], 'ayarla'), [{ isMerkeziId: 1, gun: 1, vardiyaId: 2 }, { isMerkeziId: 1, gun: 2, vardiyaId: 2 }]);
    assert.deepEqual(topluMatris(m, [1], [1, 2], [], 'ayarla'), []);
  });

  test('VR-08: kişinin istasyonu en büyük yüzdeli atamadır; eşitlikte küçük istasyon, atama yoksa null', () => {
    assert.equal(kisininIstasyonu([{ istasyonId: 4, yuzde: '30.00' }, { istasyonId: 7, yuzde: '70.00' }]), 7);
    assert.equal(kisininIstasyonu([{ istasyonId: 9, yuzde: '50.00' }, { istasyonId: 4, yuzde: '50.00' }]), 4);
    assert.equal(kisininIstasyonu([{ istasyonId: 9, yuzde: '33.34' }, { istasyonId: 4, yuzde: '33.33' }]), 9);
    assert.equal(kisininIstasyonu([]), null);
  });

  test('VR-28: takvim İK tatillerini ve Vardiya günlerini birleştirir; eski Vardiya tatili tatil kalır; aynı gün İK tatili kazanır', () => {
    assert.deepEqual(takvimGunleriniBirlestir(
      [{ tarih: '2026-10-29', tur: 'kapali', ad: 'Bakım' }, { tarih: '2026-05-01', tur: 'tatil', ad: 'Eski kayıt' }, { tarih: '2026-12-31', tur: 'kapali', ad: null }],
      [{ tarih: '2026-10-29', ad: 'Cumhuriyet Bayramı' }, { tarih: '2026-01-01', ad: 'Yılbaşı' }],
    ), [
      { tarih: '2026-01-01', tur: 'tatil', ad: 'Yılbaşı', kaynak: 'ik' }, { tarih: '2026-05-01', tur: 'tatil', ad: 'Eski kayıt' },
      { tarih: '2026-10-29', tur: 'tatil', ad: 'Cumhuriyet Bayramı', kaynak: 'ik' }, { tarih: '2026-12-31', tur: 'kapali', ad: null },
    ]);
    assert.deepEqual(takvimGunleriniBirlestir([], []), []);
  });

  test('VR-03: bugünden önceki tarih geçmiştir; tarih aritmetiği ay ve yıl geçer', () => {
    assert.equal(gecmisMi('2026-10-06', '2026-10-07'), true);
    assert.equal(gecmisMi('2026-10-07', '2026-10-07'), false);
    assert.equal(tarihEkle('2026-12-31', 1), '2027-01-01');
    assert.equal(tarihEkle('2026-03-01', -1), '2026-02-28');
    assert.equal(gunFarki('2026-10-01', '2026-10-31'), 31);
    assert.equal(gunFarki('2026-10-02', '2026-10-01'), 0);
  });

  describe('planlı duruş (kart #519)', () => {
    const TEMEL = {
      kapsam: 'istasyon' as const, isMerkeziId: null, istasyonId: 7, baslangic: '2099-10-07T10:00:00+03:00', bitis: '2099-10-07T11:00:00+03:00',
      tekrar: 'yok' as const, gunler: [] as number[], tekrarBitis: null,
    };

    test('VR-11: hedef kapsamla tutarlıdır; tesis hedefsiz, iş merkezi ve istasyon tek hedefli', () => {
      assert.equal(durusHatasi(TEMEL), null);
      assert.equal(durusHatasi({ ...TEMEL, kapsam: 'tesis', istasyonId: null }), null);
      assert.equal(durusHatasi({ ...TEMEL, kapsam: 'is-merkezi', isMerkeziId: 3, istasyonId: null }), null);
      assert.equal(durusHatasi({ ...TEMEL, kapsam: 'tesis' })?.alan, 'kapsam');
      assert.equal(durusHatasi({ ...TEMEL, istasyonId: null })?.alan, 'istasyonId');
      assert.equal(durusHatasi({ ...TEMEL, isMerkeziId: 3 })?.alan, 'isMerkeziId');
      assert.equal(durusHatasi({ ...TEMEL, kapsam: 'is-merkezi', isMerkeziId: null, istasyonId: null })?.alan, 'isMerkeziId');
      assert.equal(durusHatasi({ ...TEMEL, kapsam: 'is-merkezi', isMerkeziId: 3 })?.alan, 'istasyonId');
    });

    test('VR-12: bitiş sonra, dakika hassasiyeti; tekrar bir günden kısa, haftalıkta gün, tekrar bitişi başlangıçtan sonra', () => {
      assert.equal(durusHatasi({ ...TEMEL, bitis: TEMEL.baslangic })?.alan, 'bitis');
      assert.equal(durusHatasi({ ...TEMEL, baslangic: '2099-10-07T10:00:30+03:00' })?.alan, 'baslangic');
      assert.equal(durusHatasi({ ...TEMEL, bitis: '2099-10-08T11:00:00+03:00' }), null);
      assert.equal(durusHatasi({ ...TEMEL, tekrar: 'gunluk', bitis: '2099-10-08T10:00:00+03:00' })?.alan, 'bitis');
      assert.equal(durusHatasi({ ...TEMEL, tekrar: 'gunluk', bitis: '2099-10-08T09:59:00+03:00' }), null);
      assert.equal(durusHatasi({ ...TEMEL, tekrar: 'haftalik' })?.alan, 'gunler');
      assert.equal(durusHatasi({ ...TEMEL, tekrar: 'haftalik', gunler: [1] }), null);
      assert.equal(durusHatasi({ ...TEMEL, tekrar: 'gunluk', tekrarBitis: '2099-10-06T10:00:00+03:00' })?.alan, 'tekrarBitis');
      // Düzenleme: haftalık olmayan gün taşımaz, tekrar etmeyen bitiş taşımaz; günler sıralı ve tekil.
      assert.deepEqual(durusuDuzenle({ ...TEMEL, gunler: [5, 1], tekrarBitis: '2099-10-09T00:00:00+03:00' }), { ...TEMEL, gunler: [], tekrarBitis: null });
      assert.deepEqual(durusuDuzenle({ ...TEMEL, tekrar: 'haftalik', gunler: [5, 1, 5] }).gunler, [1, 5]);
    });

    test('VR-15: gerçekleşmeler tekrar türüne göre; aralık dışı kesilir, önceki günden taşan dahil, tekrar bitişinden sonra yok', () => {
      // 2099-10-07 çarşamba; eksen o günün 00:00'ı, üç gün okunur.
      const T = '2099-10-07';
      assert.deepEqual(durusAraliklari({ basDk: 600, sureDk: 60, sonDk: null, tekrar: 'yok', gunler: [] }, T, 3), [{ bas: 600, bit: 660 }]);
      assert.deepEqual(durusAraliklari({ basDk: -60, sureDk: 120, sonDk: null, tekrar: 'yok', gunler: [] }, T, 3), [{ bas: 0, bit: 60 }]);
      assert.deepEqual(durusAraliklari({ basDk: 10_000, sureDk: 60, sonDk: null, tekrar: 'yok', gunler: [] }, T, 3), []);
      // Günlük, iki gün önce başlamış, gece yarısını geçen (23:00-01:00): önceki günün tekrarı ilk güne taşar; dördüncü günün sabahı dahil.
      assert.deepEqual(durusAraliklari({ basDk: -2 * 1440 + 1380, sureDk: 120, sonDk: null, tekrar: 'gunluk', gunler: [] }, T, 3),
        [{ bas: 0, bit: 60 }, { bas: 1380, bit: 1500 }, { bas: 2820, bit: 2940 }, { bas: 4260, bit: 4380 }, { bas: 5700, bit: 5760 }]);
      // Tekrar bitişi ikinci günün başlangıcından önce: yalnız ilk gün.
      assert.deepEqual(durusAraliklari({ basDk: 600, sureDk: 30, sonDk: 1440 + 599, tekrar: 'gunluk', gunler: [] }, T, 3), [{ bas: 600, bit: 630 }]);
      // Haftalık, yalnız perşembe (4): ikinci gün.
      assert.deepEqual(durusAraliklari({ basDk: -7 * 1440 + 600, sureDk: 30, sonDk: null, tekrar: 'haftalik', gunler: [4] }, T, 3), [{ bas: 2040, bit: 2070 }]);
    });

    test('VR-15: duruş aralıktan ve gün dakikasından düşer; kaynağa yalnız tesis, kendi merkezi ve kendi istasyonu uyar', () => {
      assert.deepEqual(araliklardanCikar([{ bas: 480, bit: 720 }, { bas: 750, bit: 960 }], [{ bas: 600, bit: 780 }, { bas: 900, bit: 2000 }]),
        [{ bas: 480, bit: 600 }, { bas: 780, bit: 900 }]);
      assert.deepEqual(araliklardanCikar([{ bas: 480, bit: 720 }], []), [{ bas: 480, bit: 720 }]);
      assert.equal(gunNetDakikasi(0, [GUNDUZ], []), 450);
      assert.equal(gunNetDakikasi(0, [GUNDUZ], [{ bas: 600, bit: 660 }]), 390);
      // Mola ile örtüşen duruş iki kez düşmez; ertesi günün vardiyası kendi gününe sayılır.
      assert.equal(gunNetDakikasi(0, [GUNDUZ], [{ bas: 700, bit: 760 }]), 450 - 30);
      assert.equal(gunNetDakikasi(1, [GUNDUZ], [{ bas: 600, bit: 660 }]), 450);
      assert.equal(gunNetDakikasi(0, [GUNDUZ, GECE], [{ bas: 1440, bit: 1500 }]), 450 + 450 - 60);
      // Günlük mesai: o gün başlayan vardiyaların aralıkları; gece vardiyası ertesi sabaha uzanır, mola ve duruş dışarıda.
      assert.deepEqual(gununCalismaAraliklari(1, [GECE], [{ bas: 1440 + 1700, bit: 1440 + 1800 }]), [{ bas: 2760, bit: 3000 }, { bas: 3030, bit: 3140 }]);
      assert.deepEqual(gununCalismaAraliklari(0, [GUNDUZ, { ...GUNDUZ, baslangic: '16:00', bitis: '20:00', molalar: [] }], []),
        [{ bas: 480, bit: 720 }, { bas: 750, bit: 1200 }]);
      // Günün molaları: vardiyaların molaları; aynı dakikada çalışan başka vardiya ya da fazla mesai varsa o kısım mola değildir.
      assert.deepEqual(gununMolaAraliklari(0, [GUNDUZ, { ...GUNDUZ, baslangic: '18:00', bitis: '20:00', molalar: [] }]), [{ bas: 720, bit: 750 }]);
      assert.deepEqual(gununMolaAraliklari(0, [GUNDUZ, { ...GUNDUZ, baslangic: '12:00', bitis: '12:15', molalar: [] }]), [{ bas: 735, bit: 750 }]);
      assert.deepEqual(gununMolaAraliklari(1, [GECE]), [{ bas: 1440 + 1560, bit: 1440 + 1590 }]);
      // Gün kaydının kapanışı: o gün başlayan vardiyaların en geç bitişi; gece vardiyası ertesi sabah 06:00'dır; vardiya yoksa null.
      assert.equal(gununSonDakikasi(0, [GUNDUZ, GECE]), 1440 + 360);
      assert.equal(gununSonDakikasi(1, [GUNDUZ]), 1440 + 960);
      assert.equal(gununSonDakikasi(0, []), null);
      const d = [
        { kapsam: 'tesis' as const, isMerkeziId: null, istasyonId: null },
        { kapsam: 'is-merkezi' as const, isMerkeziId: 5, istasyonId: null },
        { kapsam: 'is-merkezi' as const, isMerkeziId: 6, istasyonId: null },
        { kapsam: 'istasyon' as const, isMerkeziId: null, istasyonId: 7 },
      ];
      assert.deepEqual(kaynagaUyanlar(d, 5, 7), [d[0], d[1], d[3]]);
      assert.deepEqual(kaynagaUyanlar(d, 5, null), [d[0], d[1]]);
      assert.deepEqual(kaynagaUyanlar(d, 6, 8), [d[0], d[2]]);
    });
  });
  describe('fazla mesai planı (kart #1324)', () => {
    const mesai = (ek: Partial<Parameters<typeof fazlaMesaiUyanlar>[0][number]>) =>
      ({ tarih: '2099-11-04', baslangic: '16:00', bitis: '20:00', kapsam: 'istasyon' as const, isMerkeziId: null, istasyonId: 7, kisiIdleri: [], ...ek });

    test('VR-21: hedef kapsamla tutarlıdır; başlangıç ve bitiş aynı olamaz', () => {
      assert.equal(fazlaMesaiHatasi(mesai({})), null);
      assert.equal(fazlaMesaiHatasi(mesai({ kapsam: 'is-merkezi', istasyonId: null, isMerkeziId: 3 })), null);
      assert.equal(fazlaMesaiHatasi(mesai({ istasyonId: null }))?.alan, 'istasyonId');
      assert.equal(fazlaMesaiHatasi(mesai({ isMerkeziId: 3 }))?.alan, 'istasyonId');
      assert.equal(fazlaMesaiHatasi(mesai({ kapsam: 'is-merkezi' }))?.alan, 'isMerkeziId');
      assert.equal(fazlaMesaiHatasi(mesai({ bitis: '16:00' }))?.alan, 'bitis');
    });

    test('VR-24: makine ve istasyon kendi istasyonunun ve merkezinin kaydını alır; başka kapsam almaz; kişi yalnız listedeyse', () => {
      const istasyonKaydi = mesai({ kisiIdleri: [5] });
      const merkezKaydi = mesai({ kapsam: 'is-merkezi', istasyonId: null, isMerkeziId: 3 });
      const baskaMerkez = mesai({ kapsam: 'is-merkezi', istasyonId: null, isMerkeziId: 4, kisiIdleri: [6] });
      const liste = [istasyonKaydi, merkezKaydi, baskaMerkez];
      assert.deepEqual(fazlaMesaiUyanlar(liste, { isMerkeziId: 3, istasyonId: 7, kisiId: null }), [istasyonKaydi, merkezKaydi]);
      assert.deepEqual(fazlaMesaiUyanlar(liste, { isMerkeziId: 3, istasyonId: 8, kisiId: null }), [merkezKaydi]);
      assert.deepEqual(fazlaMesaiUyanlar(liste, { isMerkeziId: 3, istasyonId: null, kisiId: null }), [merkezKaydi]);
      // Kişi 5 merkez 3'tedir ama merkez kaydının listesinde değildir; kişi 9 hiçbir listede yoktur.
      assert.deepEqual(fazlaMesaiUyanlar(liste, { isMerkeziId: 3, istasyonId: null, kisiId: 5 }), [istasyonKaydi]);
      assert.deepEqual(fazlaMesaiUyanlar(liste, { isMerkeziId: 3, istasyonId: null, kisiId: 9 }), []);
    });

    test('VR-24: gün dakikasına fazla mesainin vardiyayla örtüşmeyen kısmı eklenir; duruş düşer; gece yarısını geçen kayıt ertesi güne taşar', () => {
      const ek = (bas: string, bit: string) => fazlaMesaiVardiyasi({ baslangic: bas, bitis: bit });
      assert.equal(gunNetDakikasiEk(0, [GUNDUZ], [], []), 450);
      assert.equal(gunNetDakikasiEk(0, [GUNDUZ], [ek('16:00', '20:00')], []), 450 + 240);
      // 14:00-18:00 kaydının 14:00-16:00 kısmı vardiyadadır: yalnız 120 dakika eklenir. İki kayıt örtüşürse birleşir.
      assert.equal(gunNetDakikasiEk(0, [GUNDUZ], [ek('14:00', '18:00')], []), 450 + 120);
      assert.equal(gunNetDakikasiEk(0, [], [ek('16:00', '20:00'), ek('18:00', '21:00')], []), 300);
      assert.equal(gunNetDakikasiEk(0, [], [ek('16:00', '20:00')], [{ bas: 17 * 60, bit: 18 * 60 }]), 180);
      assert.equal(gunNetDakikasiEk(1, [], [ek('22:00', '02:00')], []), 240);
      const takvim = takvimAraliklari('2099-11-04', 2, (tarih) => (tarih === '2099-11-04' ? [ek('22:00', '02:00')] : []));
      assert.deepEqual(takvim, [{ bas: 22 * 60, bit: 26 * 60 }]);
    });

    test('VR-25: yalnız onaylı izin günleri, aralık içinde ve iki ucu dahil', () => {
      const izinler = [
        { baslangic: '2099-11-01', bitis: '2099-11-04', durum: 'Onaylandı' },
        { baslangic: '2099-11-06', bitis: '2099-11-06', durum: 'Beklemede' },
        { baslangic: '2099-11-07', bitis: '2099-11-09', durum: 'Onaylandı' },
        { baslangic: '2099-11-05', bitis: '2099-11-05', durum: 'Reddedildi' },
      ];
      assert.deepEqual([...onayliIzinGunleri(izinler, '2099-11-03', '2099-11-08').keys()], ['2099-11-03', '2099-11-04', '2099-11-07', '2099-11-08']);
      assert.deepEqual([...onayliIzinGunleri([], '2099-11-03', '2099-11-08')], []);
    });

    test('soru 54: tek günlük izinde gün sayısı 1den azsa oran odur; çok günlük izin ve eksik gün tam gündür; aynı güne iki izin 1i geçmez', () => {
      const izin = (baslangic: string, bitis: string, gun: number | null) => ({ baslangic, bitis, gun, durum: 'Onaylandı' });
      const oranlar = onayliIzinGunleri([izin('2099-11-03', '2099-11-03', 0.5), izin('2099-11-04', '2099-11-05', 1.5), izin('2099-11-06', '2099-11-06', null)], '2099-11-01', '2099-11-09');
      assert.deepEqual([...oranlar], [['2099-11-03', 0.5], ['2099-11-04', 1], ['2099-11-05', 1], ['2099-11-06', 1]]);
      assert.deepEqual([...onayliIzinGunleri([izin('2099-11-03', '2099-11-03', 0.5), izin('2099-11-03', '2099-11-03', 0.75)], '2099-11-01', '2099-11-09')], [['2099-11-03', 1]]);
    });

    test('soru 54: izinli kısım günün planlı çalışmasının oranı kadardır, günün sonundan alınır', () => {
      const plan = [{ bas: 480, bit: 720 }, { bas: 750, bit: 960 }];
      assert.deepEqual(izinliKisim(plan, 0.5), [{ bas: 705, bit: 720 }, { bas: 750, bit: 960 }]);
      assert.deepEqual(izinliKisim(plan, 0.2), [{ bas: 870, bit: 960 }]);
      assert.deepEqual(izinliKisim(plan, 1), plan);
      assert.deepEqual(izinliKisim([], 0.5), []);
    });

    test('VR-26: pay atama yüzdelerinin toplamıdır (1 tam zaman); atama yoksa null', () => {
      assert.equal(atamaPayi([{ yuzde: '30.00' }, { yuzde: '70.00' }]), 1);
      assert.equal(atamaPayi([{ yuzde: '33.33' }, { yuzde: '16.67' }]), 0.5);
      assert.equal(atamaPayi([]), null);
    });
  });

  test('Tek tanım: kişi atandığı her iş merkezinde sayılır; vardiyası olan yalnız kendi vardiyasında, olmayan merkezin her açık vardiyasında', () => {
    const atamalar = [
      { kisiId: 1, isMerkeziId: 10, yuzde: '60.00' }, { kisiId: 1, isMerkeziId: 20, yuzde: '40.00' },
      { kisiId: 2, isMerkeziId: 10, yuzde: '50.00' }, { kisiId: 2, isMerkeziId: 10, yuzde: '50.00' },
      { kisiId: 3, isMerkeziId: 10, yuzde: '100.00' },
    ];
    const acik = [{ isMerkeziId: 10, vardiyaId: 1 }, { isMerkeziId: 10, vardiyaId: 2 }, { isMerkeziId: 10, vardiyaId: 1 }, { isMerkeziId: 20, vardiyaId: 2 }];
    assert.deepEqual(vardiyaKadrosu(atamalar, new Map([[3, 1]]), acik), [
      { isMerkeziId: 10, vardiyaId: null, kisiIdleri: [1, 2], paySent: 16000 },
      { isMerkeziId: 10, vardiyaId: 1, kisiIdleri: [1, 2, 3], paySent: 26000 },
      { isMerkeziId: 10, vardiyaId: 2, kisiIdleri: [1, 2], paySent: 16000 },
      { isMerkeziId: 20, vardiyaId: null, kisiIdleri: [1], paySent: 4000 },
      { isMerkeziId: 20, vardiyaId: 2, kisiIdleri: [1], paySent: 4000 },
    ]);
    // Açık vardiyası olmayan merkezde vardiyasız kişi yalnız "seçilmedi" satırındadır; atama yoksa satır yoktur.
    assert.deepEqual(vardiyaKadrosu([{ kisiId: 4, isMerkeziId: 30, yuzde: '100.00' }], new Map(), []), [{ isMerkeziId: 30, vardiyaId: null, kisiIdleri: [4], paySent: 10000 }]);
    assert.deepEqual(vardiyaKadrosu([], new Map(), acik), []);
  });

  test('VR-27: kişi takvimi kendisine ve İK\'ya açık; amir ve planlama yalnız kapsamında görür', () => {
    const bos = { kendisi: false, ikOkur: false, amirVeyaPlanlama: false, kapsamda: false };
    assert.equal(kisiTakvimiGorunur(bos), false);
    assert.equal(kisiTakvimiGorunur({ ...bos, kendisi: true }), true);
    assert.equal(kisiTakvimiGorunur({ ...bos, ikOkur: true }), true);
    assert.equal(kisiTakvimiGorunur({ ...bos, amirVeyaPlanlama: true, kapsamda: true }), true);
    assert.equal(kisiTakvimiGorunur({ ...bos, amirVeyaPlanlama: true }), false);
    assert.equal(kisiTakvimiGorunur({ ...bos, kapsamda: true }), false);
  });
});

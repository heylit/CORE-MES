import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adetEksikMi, araliklariBirlestir, araliklariKes, beklenenTopla, girisYokAktifDakika, girisYokMu, isEmriBeklenenAdet, kaynakKarsilastir, kesinBeklenen, kesisimDakika, kisiBeklenen,
  makineIzinliMi, toplamOran, uretimOrani,
  ANOMALI_KAPANIS_GECIKMESI_MS, donemAraligi, donemTopla, gunEkle, isEmriBeklenenBirlestir, istasyonIsaretli, kapanacakGunler, performansOrani,
  emekVerimi, etkinGun, gunSiniri, mesaiSaniyesi,
  kalanAdet, planliUretim,
} from './kurallar.ts';
import type { NetAralik } from './kurallar.ts';

const SA = 3_600_000;
const GUN = 1_000_000_000_000;
// 08:00-12:00 ve 13:00-17:00 net aktif (öğle molası düşülmüş).
const VARDIYA: NetAralik[] = [{ bas: GUN + 8 * SA, bit: GUN + 12 * SA }, { bas: GUN + 13 * SA, bit: GUN + 17 * SA }];
const saat = (s: number): number => GUN + s * SA;

test('kesişim: mola düşülür, aralık dışı sayılmaz, ters ya da boş aralık sıfırdır', () => {
  assert.equal(kesisimDakika(VARDIYA, saat(8), saat(10)), 120);
  assert.equal(kesisimDakika(VARDIYA, saat(11), saat(14)), 120, 'öğle molası (12-13) sayılmaz');
  assert.equal(kesisimDakika(VARDIYA, saat(0), saat(24)), 480);
  assert.equal(kesisimDakika(VARDIYA, saat(12), saat(13)), 0);
  assert.equal(kesisimDakika(VARDIYA, saat(10), saat(10)), 0);
  assert.equal(kesisimDakika(VARDIYA, saat(10), saat(9)), 0);
  assert.equal(kesisimDakika([], saat(8), saat(17)), 0);
});

const emir = (aykiri: Partial<Parameters<typeof isEmriBeklenenAdet>[0]> = {}) => ({
  adet: 1000, birimSureDk: 2, verimYuzde: 100, baslangic: saat(8), bitis: saat(17), araliklar: VARDIYA, gunBasi: saat(0), simdi: saat(10), ...aykiri,
});

test('beklenen adet: yerleşim ile şu ana kadarki net sürenin kesişimi, süre / birim süre x verim', () => {
  assert.equal(isEmriBeklenenAdet(emir()), 60, '120 dk / 2 dk');
  assert.equal(isEmriBeklenenAdet(emir({ verimYuzde: 50 })), 30);
  assert.equal(isEmriBeklenenAdet(emir({ simdi: saat(14) })), 150, '12-13 molası düşülür: 300 dk net');
  assert.equal(isEmriBeklenenAdet(emir({ baslangic: saat(9) })), 30, 'yerleşim 9\'da başlar');
  assert.equal(isEmriBeklenenAdet(emir({ bitis: saat(9) })), 30, 'yerleşim 9\'da biter');
  assert.equal(isEmriBeklenenAdet(emir({ baslangic: saat(-30), simdi: saat(10) })), 60, 'dünden süren yerleşimde yalnız bugünkü kısım');
  assert.equal(isEmriBeklenenAdet(emir({ baslangic: saat(11), simdi: saat(10) })), 0, 'yerleşim başlamadı');
  assert.equal(isEmriBeklenenAdet(emir({ adet: 25 })), 25, 'toplam adedi aşmaz');
});

test('beklenen adet: yerleşimin başındaki ilk ayar net süreden düşülür (kart 783)', () => {
  assert.equal(isEmriBeklenenAdet(emir({ ayarKalanDk: 30 })), 45, '120 dk - 30 dk ayar = 90 dk / 2 dk');
  assert.equal(isEmriBeklenenAdet(emir({ ayarKalanDk: 0 })), 60);
  assert.equal(isEmriBeklenenAdet(emir({ ayarKalanDk: 150 })), 0, 'ayar sürüyor: henüz adet beklenmez, eksiye düşmez');
  assert.equal(isEmriBeklenenAdet(emir({ ayarKalanDk: -10 })), 60, 'eksi ayar yok sayılır');
  assert.equal(isEmriBeklenenAdet(emir({ simdi: saat(14), ayarKalanDk: 60 })), 120, 'mola net süreden önce düşülür: 300 - 60 = 240 dk');
});

test('beklenen adet: birim süre bilinmiyorsa ya da sıfırsa null; sıfır uydurulmaz', () => {
  assert.equal(isEmriBeklenenAdet(emir({ birimSureDk: null })), null);
  assert.equal(isEmriBeklenenAdet(emir({ birimSureDk: 0 })), null);
});

test('toplam: bilinmeyen parça sayılır ve toplamı kesin olmaktan çıkarır', () => {
  assert.deepEqual(beklenenTopla([10, 5.5, null, null]), { adet: 15.5, eksik: 2 });
  assert.equal(kesinBeklenen(beklenenTopla([10, 5.5])), 15.5);
  assert.equal(kesinBeklenen(beklenenTopla([10, null])), null);
  assert.equal(kesinBeklenen(beklenenTopla([])), 0, 'plan yoksa beklenen sıfırdır');
});

test('AR-AN-1: giriş yok süresi eşiğe varınca işaret; öncesinde, planı olmayan kaynakta ve bilinmeyen durumda işaret yok', () => {
  // Son giriş 9:00, şimdi 10:30 -> 90 dk net.
  const sure = girisYokAktifDakika(VARDIYA, saat(9), saat(0), saat(10.5));
  assert.equal(sure, 90);
  assert.equal(girisYokMu({ girisYokAktifDk: sure, esikDk: 60, beklenen: 40 }), true);
  assert.equal(girisYokMu({ girisYokAktifDk: 59, esikDk: 60, beklenen: 40 }), false);
  assert.equal(girisYokMu({ girisYokAktifDk: 60, esikDk: 60, beklenen: 40 }), true, 'eşik dahil');
  assert.equal(girisYokMu({ girisYokAktifDk: 600, esikDk: 60, beklenen: 0 }), false, 'planı olmayan kaynak giriş yapmak zorunda değil');
  assert.equal(girisYokMu({ girisYokAktifDk: null, esikDk: 60, beklenen: 40 }), null, 'son giriş bilinmiyor');
  assert.equal(girisYokMu({ girisYokAktifDk: 600, esikDk: null, beklenen: 40 }), null, 'eşik boş: kural kapalı');
  assert.equal(girisYokMu({ girisYokAktifDk: 600, esikDk: 60, beklenen: null }), null);
});

test('AR-AN-1: öğle molası giriş yok süresine sayılmaz; hiç giriş yoksa gün başından, dünkü giriş bugünü uzatmaz', () => {
  assert.equal(girisYokAktifDakika(VARDIYA, saat(11), saat(0), saat(14)), 120, '11-12 ve 13-14');
  assert.equal(girisYokAktifDakika(VARDIYA, null, saat(0), saat(10)), 120, 'bugün hiç giriş yok: 8\'den beri');
  assert.equal(girisYokAktifDakika(VARDIYA, saat(-5), saat(0), saat(10)), 120, 'dünkü giriş bugünün başından sayılır');
});

test('AR-AN-2: üretilen plandakinin altındaysa işaret; eşit ya da üstünde işaret yok', () => {
  assert.equal(adetEksikMi({ uretilen: 59, beklenen: 60, toleransYuzde: 0 }), true);
  assert.equal(adetEksikMi({ uretilen: 60, beklenen: 60, toleransYuzde: 0 }), false);
  assert.equal(adetEksikMi({ uretilen: 80, beklenen: 60, toleransYuzde: 0 }), false);
});

test('AR-AN-2: plandaki adet tam adede iner, tolerans eşiği düşürür, boş tolerans kuralı kapatır, bilinmeyen null kalır', () => {
  assert.equal(adetEksikMi({ uretilen: 12, beklenen: 12.9, toleransYuzde: 0 }), false, 'yarım parça beklenmez');
  assert.equal(adetEksikMi({ uretilen: 11, beklenen: 12.9, toleransYuzde: 0 }), true);
  assert.equal(adetEksikMi({ uretilen: 55, beklenen: 60, toleransYuzde: 10 }), false, 'hedef 54');
  assert.equal(adetEksikMi({ uretilen: 53, beklenen: 60, toleransYuzde: 10 }), true);
  assert.equal(adetEksikMi({ uretilen: 0, beklenen: 0, toleransYuzde: 0 }), false, 'plan yoksa eksik yok');
  assert.equal(adetEksikMi({ uretilen: 0, beklenen: 60, toleransYuzde: null }), null);
  assert.equal(adetEksikMi({ uretilen: null, beklenen: 60, toleransYuzde: 0 }), null);
  assert.equal(adetEksikMi({ uretilen: 5, beklenen: null, toleransYuzde: 0 }), null);
});

test('AR-AN-3: oran toplam üretilen / toplam plan; plan sıfırsa ya da biri bilinmiyorsa null', () => {
  assert.equal(uretimOrani(45, 60), 0.75);
  assert.equal(uretimOrani(90, 60), 1.5);
  assert.equal(uretimOrani(0, 60), 0, 'üretim sıfırsa oran gerçekten sıfırdır');
  assert.equal(uretimOrani(10, 0), null);
  assert.equal(uretimOrani(null, 60), null);
  assert.equal(uretimOrani(10, null), null);
});

test('AR-AN-3: toplam oran yalnız ikisi de bilinen satırlarla kurulur; satırların oranlarının ortalaması değildir', () => {
  const t = toplamOran([
    { uretilen: 10, beklenen: 20 },
    { uretilen: 90, beklenen: 80 },
    { uretilen: null, beklenen: 500 },
    { uretilen: 7, beklenen: null },
  ]);
  assert.deepEqual(t, { uretilen: 100, beklenen: 100, oran: 1 });
  assert.deepEqual(toplamOran([{ uretilen: null, beklenen: 5 }]), { uretilen: 0, beklenen: 0, oran: null });
  assert.deepEqual(toplamOran([]), { uretilen: 0, beklenen: 0, oran: null });
});

test('AR-AN-4: makine ya da kişi üretebilirdi / üretti; eksik üretimde işaret, yeterde normal, kırılım yoksa bilinmiyor', () => {
  assert.deepEqual(kaynakKarsilastir({ beklenen: 60, uretilen: 40, izinli: false, toleransYuzde: 0 }), { beklenen: 60, uretilen: 40, fark: -20, durum: 'isaret' });
  assert.deepEqual(kaynakKarsilastir({ beklenen: 60, uretilen: 65, izinli: false, toleransYuzde: 0 }), { beklenen: 60, uretilen: 65, fark: 5, durum: 'normal' });
  assert.deepEqual(kaynakKarsilastir({ beklenen: 60, uretilen: null, izinli: false, toleransYuzde: 0 }), { beklenen: 60, uretilen: null, fark: null, durum: 'bilinmiyor' });
  assert.deepEqual(kaynakKarsilastir({ beklenen: null, uretilen: 3, izinli: false, toleransYuzde: 0 }), { beklenen: null, uretilen: 3, fark: null, durum: 'bilinmiyor' });
});

test('AR-AN-4: izinli kişi beklenene girmez; üretimi sıfır olsa da işaret almaz', () => {
  assert.deepEqual(kaynakKarsilastir({ beklenen: 60, uretilen: 0, izinli: true, toleransYuzde: 0 }), { beklenen: 0, uretilen: 0, fark: null, durum: 'izinli' });
  // Karşı örnek: aynı veriyle izinli olmayan işaret alır.
  assert.equal(kaynakKarsilastir({ beklenen: 60, uretilen: 0, izinli: false, toleransYuzde: 0 }).durum, 'isaret');
});

test('AR-AN-4: kişinin beklenen adedi atandığı makinelerin beklenenlerinden payıdır; biri bilinmiyorsa kişininki de bilinmez', () => {
  // İki makineye yarı yarıya bakan tek kişi: iki makinenin toplamı.
  assert.equal(kisiBeklenen([{ beklenen: 30, yuzde: 50, makineToplamYuzde: 50 }, { beklenen: 25.5, yuzde: 50, makineToplamYuzde: 50 }], []), 55.5);
  // Karşı örnek (kart #1306): aynı makinede tam zamanlı iki kişi varsa ikisinden de makinenin bütün beklenen adedi istenmez.
  assert.equal(kisiBeklenen([{ beklenen: 60, yuzde: 100, makineToplamYuzde: 200 }], []), 30);
  assert.equal(kisiBeklenen([{ beklenen: 30, yuzde: 100, makineToplamYuzde: 100 }], [10]), 40, 'kişi kaynaklı yerleşim bütün olarak eklenir');
  assert.equal(kisiBeklenen([], []), 0);
  assert.equal(kisiBeklenen([{ beklenen: 30, yuzde: 100, makineToplamYuzde: 100 }, { beklenen: null, yuzde: 50, makineToplamYuzde: 50 }], []), null);
});

test('izinli kişi: makineye atananların hepsi izinliyse makine beklenene girmez; biri bile çalışıyorsa girer; atamasız makine izne bağlı değildir', () => {
  const izinli = new Set([1, 2]);
  assert.equal(makineIzinliMi([1, 2], izinli), true);
  assert.equal(makineIzinliMi([1, 3], izinli), false);
  assert.equal(makineIzinliMi([3], izinli), false);
  assert.equal(makineIzinliMi([], izinli), false);
});

test('AR-AN-1: planlı pencereyle kesilen aralıklar birleşir; aynı dakika iki kaynakta iki kez sayılmaz', () => {
  const a = araliklariKes(VARDIYA, saat(10), saat(14));
  assert.deepEqual(a, [{ bas: saat(10), bit: saat(12) }, { bas: saat(13), bit: saat(14) }]);
  assert.deepEqual(araliklariKes(VARDIYA, saat(12), saat(13)), [], 'mola penceresinde net aralık yok');
  assert.deepEqual(araliklariKes(VARDIYA, saat(10), saat(9)), [], 'ters pencere boş');
  const birlesik = araliklariBirlestir([...a, { bas: saat(11), bit: saat(13.5) }, { bas: saat(16), bit: saat(17) }]);
  assert.deepEqual(birlesik, [{ bas: saat(10), bit: saat(14) }, { bas: saat(16), bit: saat(17) }]);
  assert.equal(girisYokAktifDakika(birlesik, saat(9), saat(0), saat(16.5)), 270, 'pencere 10-14 ve 16-16:30, hepsi son girişten sonra');
  assert.deepEqual(araliklariBirlestir([]), []);
});

/* ---------------- gün kaydı ve dönem istatistiği (kart #1306) ---------------- */

test('AR-AN-5: dönem aralığı: gün kendisi, hafta Pazartesi-Pazar, ay takvim ayı (artık yıl dahil)', () => {
  assert.deepEqual(donemAraligi('gun', '2026-10-14'), { bas: '2026-10-14', bit: '2026-10-14' });
  // 2026-10-14 Çarşamba; Pazar ve Pazartesi sınırları.
  assert.deepEqual(donemAraligi('hafta', '2026-10-14'), { bas: '2026-10-12', bit: '2026-10-18' });
  assert.deepEqual(donemAraligi('hafta', '2026-10-18'), { bas: '2026-10-12', bit: '2026-10-18' }, 'Pazar önceki Pazartesiye bağlanır');
  assert.deepEqual(donemAraligi('hafta', '2026-10-19'), { bas: '2026-10-19', bit: '2026-10-25' });
  assert.deepEqual(donemAraligi('hafta', '2026-01-01'), { bas: '2025-12-29', bit: '2026-01-04' }, 'yıl sınırı');
  assert.deepEqual(donemAraligi('ay', '2028-02-10'), { bas: '2028-02-01', bit: '2028-02-29' });
  assert.deepEqual(donemAraligi('ay', '2026-02-10'), { bas: '2026-02-01', bit: '2026-02-28' });
  assert.equal(gunEkle('2026-03-28', 2), '2026-03-30', 'yaz saati geçişi takvim gününü kaydırmaz');
});

test('AR-AN-6: performans standart süre / çalışılan süre; çalışılan yok ya da sıfırsa null', () => {
  assert.equal(performansOrani(3600, 4000), 0.9);
  assert.equal(performansOrani(0, 4000), 0, 'çalışıp üretmeyen: sıfır');
  assert.equal(performansOrani(3600, 0), null);
  assert.equal(performansOrani(3600, null), null);
  assert.equal(performansOrani(null, 4000), null);
});

test('AR-AN-7: açık gün ertesi gün başından gecikme kadar sonra kapanır; kapanış anı gelmemiş ve bugünkü gün kapanmaz', () => {
  const gunBasi = (t: string): number => Date.parse(`${t}T00:00:00Z`);
  const kapanis = (t: string): number => gunBasi(gunEkle(t, 1));
  const simdi = gunBasi('2026-10-14') + ANOMALI_KAPANIS_GECIKMESI_MS;
  assert.deepEqual(kapanacakGunler({ aciklar: ['2026-10-13', '2026-10-11', '2026-10-14'], simdi, kapanis }), ['2026-10-11', '2026-10-13']);
  // Karşı örnek: gecikmenin bir an öncesinde dün henüz kapanmaz.
  assert.deepEqual(kapanacakGunler({ aciklar: ['2026-10-13'], simdi: simdi - 1, kapanis }), []);
});

test('Terminal kural 5/5: gece vardiyası olan gün, o gün başlayan son vardiya bitince kapanır; sonraki gün o andan başlar', () => {
  const gunBasi = (t: string): number => Date.parse(`${t}T00:00:00Z`);
  const ertesi = gunBasi('2026-10-14');
  const geceBitisi = ertesi + 6 * SA;
  assert.equal(gunSiniri(ertesi, [ertesi - 7 * SA, geceBitisi, null]), geceBitisi, 'en geç biten vardiya günü uzatır');
  assert.equal(gunSiniri(ertesi, [ertesi - 7 * SA, null]), ertesi, 'gün içinde biten vardiyada sınır takvim günüdür');
  assert.equal(gunSiniri(ertesi, []), ertesi);
  // Gece 02:00: dün başlayan vardiya sürüyor, etkin gün dün; 06:00'da bugün.
  assert.equal(etkinGun('2026-10-14', ertesi + 2 * SA, geceBitisi), '2026-10-13');
  assert.equal(etkinGun('2026-10-14', geceBitisi, geceBitisi), '2026-10-14');
  const kapanis = (t: string): number => (t === '2026-10-13' ? geceBitisi : gunBasi(gunEkle(t, 1)));
  assert.deepEqual(kapanacakGunler({ aciklar: ['2026-10-13'], simdi: ertesi + ANOMALI_KAPANIS_GECIKMESI_MS, kapanis }), [], 'gece vardiyası bitmeden kapanmaz');
  assert.deepEqual(kapanacakGunler({ aciklar: ['2026-10-13'], simdi: geceBitisi + ANOMALI_KAPANIS_GECIKMESI_MS, kapanis }), ['2026-10-13']);
});

test('Terminal kural 5/5: günün kendi aralıkları verilince gece vardiyasının gece yarısından sonraki kısmı başladığı güne sayılır', () => {
  // 0. gün 22:00-06:00 gece vardiyası; 1. gün izinli.
  const gece: NetAralik[] = [{ bas: GUN + 22 * SA, bit: GUN + 30 * SA }];
  const gunler = [
    { bas: GUN, bit: GUN + 30 * SA, izinli: false, araliklar: gece },
    { bas: GUN + 24 * SA, bit: GUN + 48 * SA, izinli: true, araliklar: [] },
  ];
  assert.equal(mesaiSaniyesi({ araliklar: [], gunler, simdi: GUN + 40 * SA }), 8 * 3600, 'izinli ertesi gün gece vardiyasını düşürmez');
  assert.equal(mesaiSaniyesi({ araliklar: [], gunler: [{ ...gunler[0]!, araliklar: null }], simdi: GUN + 40 * SA }), null, 'günün takvimi bilinmiyorsa null');
});

test('gün kaydı: hesapta olmayan (biten ya da plandan çıkan) iş emrinin kayıtlı beklenen adedi kalır; hesapta olanın bugünkü hesabı geçerlidir', () => {
  const b = isEmriBeklenenBirlestir(new Map([[1, 20], [2, null]]), new Map([[1, 35], [3, 12]]));
  assert.deepEqual([...b].sort(([x], [y]) => x - y), [[1, { beklenen: 20, kayittan: false }], [2, { beklenen: null, kayittan: false }], [3, { beklenen: 12, kayittan: true }]]);
  assert.equal(isEmriBeklenenBirlestir(new Map(), new Map()).size, 0);
});

test('istasyon günü: giriş yok ya da eksik adetten biri işaretliyse işaretli; ikisi de değilse değil; hüküm yoksa null', () => {
  assert.equal(istasyonIsaretli(true, false), true);
  assert.equal(istasyonIsaretli(null, true), true);
  assert.equal(istasyonIsaretli(false, null), false);
  assert.equal(istasyonIsaretli(null, null), null);
});

test('AR-AN-8: dönem toplamı Σ üretilen / Σ beklenen (günlük oranların ortalaması değil); performans Σ standart / Σ çalışılan', () => {
  const satir = (beklenen: number | null, uretilen: number | null, ek: Partial<Parameters<typeof donemTopla>[0][number]> = {}) =>
    ({ beklenen, uretilen, hurda: 1, standartSn: null, calisilanSn: null, isaret: false, ...ek });
  const t = donemTopla([satir(100, 90), satir(10, 0, { isaret: true }), satir(null, 5)]);
  // Günlük oranların ortalaması (0,9 + 0) / 2 = 0,45 olurdu; az işli gün sonucu çarpıtmaz.
  assert.ok(Math.abs((t.oran ?? 0) - 90 / 110) < 1e-9);
  assert.deepEqual([t.beklenen, t.uretilen, t.hurda, t.isaretliGun, t.gun], [110, 90, 3, 1, 3]);
  assert.equal(t.performans, null, 'ölçüm yoksa null');
  const p = donemTopla([satir(null, null, { standartSn: 3600, calisilanSn: 4000 }), satir(null, null, { standartSn: 1800, calisilanSn: 2000 })]);
  assert.equal(p.performans, 0.9);
  assert.equal(p.oran, null, 'plan yoksa oran null');
});

test('AR-AN-9: beklenenin tavanı kalan adettir: adet - önceki günlerin sağlamı, en az 0', () => {
  assert.equal(kalanAdet(500, 0), 500);
  assert.equal(kalanAdet(500, 480), 20);
  assert.equal(kalanAdet(500, 520), 0, 'fazla üretimde kalan eksi olmaz');
  // Son gün: 10 saatlik süre 300 adet ederdi, kalan 20 adet tavandır.
  assert.equal(isEmriBeklenenAdet({ adet: kalanAdet(500, 480), birimSureDk: 2, verimYuzde: 100, baslangic: GUN, bitis: GUN + 10 * SA, araliklar: [{ bas: GUN, bit: GUN + 10 * SA }], gunBasi: GUN, simdi: GUN + 10 * SA }), 20);
});

test('AR-AN-10: istasyonun üretileni plandaki iş emirlerinin sayımıdır; kalan sayım plan dışıdır', () => {
  assert.deepEqual(planliUretim(50, 30), { uretilen: 30, planDisi: 20 });
  assert.deepEqual(planliUretim(50, 50), { uretilen: 50, planDisi: 0 });
  assert.deepEqual(planliUretim(30, 45), { uretilen: 30, planDisi: 0 }, 'başka istasyona yazılan plan sayımı toplamı aşmaz');
  assert.deepEqual(planliUretim(50, null), { uretilen: 50, planDisi: null }, 'iş emri sayımı bilinmiyorsa plan dışı bilinmez');
  assert.deepEqual(planliUretim(0, 0), { uretilen: 0, planDisi: 0 });
});

test('AR-AN-11: mesai vardiya aralıklarının izinli olmayan günlerle kesişimidir; takvimi bilinmeyen kişide null', () => {
  const gun = (i: number, izinli = false) => ({ bas: GUN + i * 24 * SA, bit: GUN + (i + 1) * 24 * SA, izinli });
  // Her gün 08:00-17:00, 9 saat.
  const araliklar: NetAralik[] = [0, 1, 2].map((i) => ({ bas: GUN + i * 24 * SA + 8 * SA, bit: GUN + i * 24 * SA + 17 * SA }));
  const sonra = GUN + 10 * 24 * SA;
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [gun(0), gun(1), gun(2)], simdi: sonra }), 3 * 9 * 3600);
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [gun(0), gun(1, true), gun(2)], simdi: sonra }), 2 * 9 * 3600, 'izinli gün paydaya girmez');
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [gun(0)], simdi: GUN + 10 * SA }), 2 * 3600, 'bugün şimdiye kadar');
  assert.equal(mesaiSaniyesi({ araliklar: null, gunler: [gun(0)], simdi: sonra }), null);
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [gun(0, true)], simdi: sonra }), 0);
  // Takvim dışı onaylı fazla mesai eklenir; izinli günün fazla mesaisi sayılmaz.
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [{ ...gun(0), fazlaMesaiSn: 2 * 3600 }, gun(1)], simdi: sonra }), 2 * 9 * 3600 + 2 * 3600);
  assert.equal(mesaiSaniyesi({ araliklar, gunler: [{ ...gun(0, true), fazlaMesaiSn: 2 * 3600 }], simdi: sonra }), 0);
});

test('AR-AN-12: emek verimi = standart süre / mesai; üç makineye bakan kişide makine performansının üç katı; mesai yoksa null', () => {
  // Üç makine, her biri mesai boyunca çalışıyor ve 1 saatlik standart iş çıkarıyor; mesai 10 saat.
  const mesai = 10 * 3600;
  const makinePerformansi = 3600 / mesai;
  assert.ok(Math.abs((emekVerimi(3 * 3600, mesai) ?? 0) - 3 * makinePerformansi) < 1e-9);
  assert.equal(emekVerimi(0, mesai), 0, 'mesaisi olup üretmeyen kişi 0');
  assert.equal(emekVerimi(3600, 0), null, 'mesai 0: sıfıra bölünmez');
  assert.equal(emekVerimi(3600, null), null);
  assert.equal(emekVerimi(null, mesai), null);
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import {
  COK_OTURUM, DURMA_ESIGI_DK, HATALI_SERI, alarmGuncellemesi, cokOturumBulgulari, hataliSeriBulgulari, hedefliHesapBulgulari,
  hesapKilidiBulgulari, kapatilabilirMi, onaylanabilirMi, taramaDurduMu, vpnDisindakiler, yayilanDenemeBulgulari,
  SERTIFIKA_UYARI_GUN, denetimMaddesi, httpsMaddesi, imzaMaddesi, sertifikaMaddesi, yedekMaddesi,
} from './kurallar.ts';
import type { Bulgu, DenemeOzeti } from './kurallar.ts';

const T0 = '2026-10-14T10:00:00+00:00';
const T1 = '2026-10-14T10:05:00+00:00';
const ozet = (kullaniciAdi: string, ip: string | null, hataliSayi: number, sonHatali: string | null = T0): DenemeOzeti =>
  ({ kullaniciAdi, ip, hataliSayi, sonHatali: hataliSayi > 0 ? sonHatali : null });

describe('guvenlik kuralları (saf)', () => {
  test('G-02: aynı ad ve cihazdan 10 hatalı alarm (orta); 9 açmaz', () => {
    assert.deepEqual(hataliSeriBulgulari([ozet('a', '10.0.0.1', HATALI_SERI.esik - 1)]), []);
    assert.deepEqual(hataliSeriBulgulari([ozet('a', '10.0.0.1', HATALI_SERI.esik)]), [
      { sinyal: 'hatali-giris-serisi', onem: 'orta', kullaniciAdi: 'a', ip: '10.0.0.1', kisiId: null, sayi: 10, sonOlay: T0 },
    ]);
    assert.equal(HATALI_SERI.esik, 10);
    assert.equal(HATALI_SERI.pencereSn, 15 * 60);
  });

  test('G-04: cihazı boş denemeler G-02\'de kendi aralarında tek kaynaktır; G-03 ve G-20\'de sayılmaz', () => {
    assert.deepEqual(hataliSeriBulgulari([ozet('a', null, 10)]).map((b) => [b.kullaniciAdi, b.ip]), [['a', null]]);
    const bos = [ozet('a', null, 5), ozet('b', null, 5), ozet('c', null, 5)];
    assert.deepEqual(yayilanDenemeBulgulari(bos), []);
    assert.deepEqual(hedefliHesapBulgulari([ozet('a', null, 1), ozet('a', '10.0.0.1', 1), ozet('a', '10.0.0.2', 1)]), []);
  });

  test('G-03: bir cihazdan 3 farklı adla hatalı deneme alarm (yüksek); 2 ad ya da hatasız ad açmaz', () => {
    assert.deepEqual(yayilanDenemeBulgulari([ozet('a', '10.0.0.9', 1), ozet('b', '10.0.0.9', 1)]), []);
    assert.deepEqual(yayilanDenemeBulgulari([ozet('a', '10.0.0.9', 1), ozet('b', '10.0.0.9', 1), ozet('c', '10.0.0.9', 0)]), []);
    const [b, ...kalan] = yayilanDenemeBulgulari([ozet('a', '10.0.0.9', 1), ozet('b', '10.0.0.9', 2, T1), ozet('c', '10.0.0.9', 1)]);
    assert.deepEqual(kalan, []);
    assert.deepEqual(b, { sinyal: 'yayilan-deneme', onem: 'yuksek', kullaniciAdi: null, ip: '10.0.0.9', kisiId: null, sayi: 3, sonOlay: T1 });
  });

  test('G-20: bir ada 3 farklı cihazdan hatalı deneme alarm (yüksek); 2 cihaz açmaz', () => {
    assert.deepEqual(hedefliHesapBulgulari([ozet('a', '10.0.0.1', 1), ozet('a', '10.0.0.2', 1)]), []);
    assert.deepEqual(hedefliHesapBulgulari([ozet('a', '10.0.0.1', 1), ozet('a', '10.0.0.2', 1), ozet('a', '10.0.0.3', 1)]).map((b) => [b.sinyal, b.onem, b.kullaniciAdi, b.sayi]), [
      ['hedefli-hesap', 'yuksek', 'a', 3],
    ]);
  });

  test('G-05: 4 ya da daha çok geçerli oturum alarm (orta); 3 açmaz; olay anı taramanın anıdır', () => {
    assert.equal(COK_OTURUM.esik, 4);
    assert.deepEqual(cokOturumBulgulari([{ kisiId: 7, acikOturum: 3 }], T1), []);
    assert.deepEqual(cokOturumBulgulari([{ kisiId: 7, acikOturum: 4 }], T1), [
      { sinyal: 'cok-oturum', onem: 'orta', kullaniciAdi: null, ip: null, kisiId: 7, sayi: 4, sonOlay: T1 },
    ]);
  });

  test('G-07: yeni hatalı deneme ya da büyüyen sayı sayaçları günceller; aynı veri dokunmaz; oturumda yalnız büyüyen sayı', () => {
    const giris: Bulgu = { sinyal: 'hatali-giris-serisi', onem: 'orta', kullaniciAdi: 'a', ip: 'x', kisiId: null, sayi: 10, sonOlay: T0 };
    assert.equal(alarmGuncellemesi({ gozlenenSayi: 10, sonGoruldu: T0 }, giris), null);
    assert.deepEqual(alarmGuncellemesi({ gozlenenSayi: 12, sonGoruldu: T0 }, { ...giris, sonOlay: T1 }), { gozlenenSayi: 12, sonGoruldu: T1 });
    assert.deepEqual(alarmGuncellemesi({ gozlenenSayi: 10, sonGoruldu: T1 }, { ...giris, sayi: 11 }), { gozlenenSayi: 11, sonGoruldu: T1 });
    const oturum: Bulgu = { sinyal: 'cok-oturum', onem: 'orta', kullaniciAdi: null, ip: null, kisiId: 1, sayi: 4, sonOlay: T1 };
    assert.equal(alarmGuncellemesi({ gozlenenSayi: 4, sonGoruldu: T0 }, oturum), null);
    assert.deepEqual(alarmGuncellemesi({ gozlenenSayi: 4, sonGoruldu: T0 }, { ...oturum, sayi: 5 }), { gozlenenSayi: 5, sonGoruldu: T1 });
  });

  test('G-10: onay yalnız açıktan; kapatma açık ya da onaylanmıştan; kapanmış alarm ikisini de almaz', () => {
    assert.deepEqual(['acik', 'onaylandi', 'kapandi'].map((d) => onaylanabilirMi(d as 'acik')), [true, false, false]);
    assert.deepEqual(['acik', 'onaylandi', 'kapandi'].map((d) => kapatilabilirMi(d as 'acik')), [true, true, false]);
  });

  test('G-17: son tarama 5 dakikadan eskiyse ya da hiç yoksa tarama durmuştur; tam 5 dakika durmuş sayılmaz', () => {
    assert.equal(DURMA_ESIGI_DK, 5);
    assert.equal(taramaDurduMu(null, T1), true);
    assert.equal(taramaDurduMu(T0, T1), false);
    assert.equal(taramaDurduMu(T0, '2026-10-14T10:05:01+00:00'), true);
  });

  test('hesap kilidi: pencere içindeki kilit alarm açar (orta); kapanmış alarmın gördüğü kilit açmaz, ondan sonraki kilit açar', () => {
    const kilit = { kullaniciAdi: 'a', kilitSayisi: 1, sonKilit: T1 };
    assert.deepEqual(hesapKilidiBulgulari([kilit], new Map()), [
      { sinyal: 'hesap-kilidi', onem: 'orta', kullaniciAdi: 'a', ip: null, kisiId: null, sayi: 1, sonOlay: T1 },
    ]);
    assert.deepEqual(hesapKilidiBulgulari([kilit], new Map([['a', T1]])), []);
    assert.equal(hesapKilidiBulgulari([kilit], new Map([['a', T0]])).length, 1);
    assert.equal(hesapKilidiBulgulari([kilit], new Map([['b', T1]])).length, 1);
    const acik: Bulgu = { sinyal: 'hesap-kilidi', onem: 'orta', kullaniciAdi: 'a', ip: null, kisiId: null, sayi: 1, sonOlay: T0 };
    assert.equal(alarmGuncellemesi({ gozlenenSayi: 1, sonGoruldu: T0 }, acik), null);
    assert.deepEqual(alarmGuncellemesi({ gozlenenSayi: 1, sonGoruldu: T0 }, { ...acik, sayi: 2, sonOlay: T1 }), { gozlenenSayi: 2, sonGoruldu: T1 });
  });

  test('VPN muafiyeti: aralıktaki cihazın satırı ayıklanır, dışındaki ve cihazı boş kalır; boş aralık hiçbirini ayıklamaz', () => {
    const satirlar = [ozet('a', '10.30.0.5', 1), ozet('b', '10.40.0.5', 1), ozet('c', null, 1), ozet('d', '::ffff:10.30.9.9', 1)];
    const { araliklar } = agAraliklariniCoz('10.30.0.0/16');
    assert.deepEqual(vpnDisindakiler(satirlar, araliklar).map((x) => x.kullaniciAdi), ['b', 'c']);
    assert.deepEqual(vpnDisindakiler(satirlar, []).map((x) => x.kullaniciAdi), ['a', 'b', 'c', 'd']);
    const ayni = ['x', 'y', 'z'].map((ad) => ozet(ad, '10.30.0.5', 1));
    assert.deepEqual(yayilanDenemeBulgulari(vpnDisindakiler(ayni, araliklar)), []);
    assert.equal(yayilanDenemeBulgulari(vpnDisindakiler(ayni, [])).length, 1);
  });
});

describe('koruma durumu maddeleri (saf)', () => {
  const SIMDI = new Date('2026-10-21T12:00:00Z');
  const gunSonra = (gun: number) => new Date(SIMDI.getTime() + gun * 86_400_000);

  test('G-23: yedek açık ve uyarısızsa açık; sağlık uyarısı varsa uyarı; kapalıysa kapalı; okunamazsa bilinmiyor', () => {
    const son = new Date('2026-10-21T02:00:00Z');
    assert.deepEqual([yedekMaddesi({ durum: 'acik', sonYedek: son }, null).durum, yedekMaddesi({ durum: 'acik', sonYedek: son }, null).deger],
      ['acik', son.toISOString()]);
    assert.deepEqual(yedekMaddesi({ durum: 'acik', sonYedek: null }, 'Hiç yedek alınmamış.'),
      { durum: 'uyari', deger: null, aciklama: 'Hiç yedek alınmamış.' });
    assert.equal(yedekMaddesi({ durum: 'dizin-yok', sonYedek: null }, 'Yedek kapalı: yedek klasörü seçilmemiş ya da erişilemiyor.').durum, 'kapali');
    assert.equal(yedekMaddesi({ durum: 'anahtar-yok', sonYedek: son }, null).durum, 'kapali');
    assert.deepEqual(yedekMaddesi(null, null), { durum: 'bilinmiyor', deger: null, aciklama: 'Yedek durumu okunamadı.' });
  });

  test('G-24: yalnız geçerli anahtarla açık kanal açıktır; anahtarsız ya da klasörsüz kanal kapalı, geçersiz anahtar uyarı', () => {
    assert.equal(imzaMaddesi('acik').durum, 'acik');
    assert.equal(imzaMaddesi('anahtar-gecersiz').durum, 'uyari');
    assert.equal(imzaMaddesi('anahtar-yok').durum, 'kapali');
    assert.equal(imzaMaddesi('dizin-yok').durum, 'kapali');
    assert.deepEqual([imzaMaddesi(null).durum, imzaMaddesi(null).deger], ['bilinmiyor', null]);
  });

  test('G-25: HTTPS değişkenleri varsa açık, yoksa kapalı, okunamazsa bilinmiyor', () => {
    assert.equal(httpsMaddesi({ acik: true, sertifikaBitis: null }).durum, 'acik');
    assert.equal(httpsMaddesi({ acik: false, sertifikaBitis: null }).durum, 'kapali');
    assert.equal(httpsMaddesi(null).durum, 'bilinmiyor');
  });

  test(`G-26: sertifika ${String(SERTIFIKA_UYARI_GUN)} günden uzun geçerliyse açık, kısa kalmışsa uyarı, dolmuşsa kapalı`, () => {
    const s = (bitis: Date | null, acik = true) => sertifikaMaddesi({ acik, sertifikaBitis: bitis }, SIMDI);
    assert.deepEqual([s(gunSonra(SERTIFIKA_UYARI_GUN)).durum, s(gunSonra(SERTIFIKA_UYARI_GUN)).deger], ['acik', gunSonra(SERTIFIKA_UYARI_GUN).toISOString()]);
    assert.equal(s(gunSonra(SERTIFIKA_UYARI_GUN - 0.5)).durum, 'uyari');
    assert.equal(s(gunSonra(1)).aciklama, 'Sertifika 1 gün içinde bitiyor; yenileyin.');
    assert.equal(s(SIMDI).durum, 'kapali');
    assert.equal(s(gunSonra(-10)).durum, 'kapali');
    assert.deepEqual([s(null).durum, s(null).deger], ['bilinmiyor', null]);
    assert.deepEqual([s(gunSonra(400), false).durum, s(gunSonra(400), false).deger], ['kapali', null]);
    assert.equal(sertifikaMaddesi(null, SIMDI).durum, 'bilinmiyor');
  });

  test('G-27: denetim kaydı yazılır ve korumalıysa açık; koruma yoksa uyarı; yazılamıyorsa kapalı', () => {
    const son = '2026-10-21T11:59:00Z';
    assert.deepEqual([denetimMaddesi({ yazilir: true, degismez: true, sonKayit: son }).durum, denetimMaddesi({ yazilir: true, degismez: true, sonKayit: son }).deger],
      ['acik', son]);
    assert.equal(denetimMaddesi({ yazilir: true, degismez: false, sonKayit: null }).durum, 'uyari');
    assert.equal(denetimMaddesi({ yazilir: false, degismez: true, sonKayit: son }).durum, 'kapali');
    assert.equal(denetimMaddesi(null).durum, 'bilinmiyor');
  });
});

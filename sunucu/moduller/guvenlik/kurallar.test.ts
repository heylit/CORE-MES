import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import type { PaketTaramasi } from '#paylasilan/sozlesme/ayarlar.ts';
import {
  COK_OTURUM, DURMA_ESIGI_DK, HATALI_SERI, alarmGuncellemesi, cokOturumBulgulari, hataliSeriBulgulari, hedefliHesapBulgulari,
  hesapKilidiBulgulari, kapatilabilirMi, onaylanabilirMi, taramaDurduMu, vpnDisindakiler, yayilanDenemeBulgulari,
  SERTIFIKA_UYARI_GUN, denetimMaddesi, diskMaddesi, gunlukMaddesi, httpsMaddesi, imzaMaddesi, olayGunluguMaddesi, sertifikaMaddesi,
  sunucuSertifikaMaddesi, yedekMaddesi, ADRES_TARAMASI, SAYILAN_RET_NEDENLERI, YETKI_REDDI_SERISI, adresTaramasiBulgulari, alarmDuyuruMetni,
  duyurulurMu, yetkiReddiBulgulari, yeniOlayliBulgular,
  calisanSurumDenetimi, disBaglantiDenetimi, geceYedegiDenetimi, geriYuklemeDenetimi, guncellemeAnahtariDenetimi, ortamDenetimi,
  yedekAnahtariDenetimi, yedekDiskiDenetimi,
} from './kurallar.ts';
import { denemeUyarisi, diskDurumu } from '../saglik/disari.ts';
import type { Bulgu, DenemeOzeti } from './kurallar.ts';

const T0 = '2026-10-14T10:00:00+00:00';
const T1 = '2026-10-14T10:05:00+00:00';
const ozet = (kullaniciAdi: string, ip: string | null, hataliSayi: number, sonHatali: string | null = T0): DenemeOzeti =>
  ({ kullaniciAdi, ip, hataliSayi, sonHatali: hataliSayi > 0 ? sonHatali : null });

describe('guvenlik kuralları (saf)', () => {
  test('K27 a: kapanan alarmın kaynağında yeni olay yoksa bulgu düşer; yeni olay anı ya da oturumda büyüyen sayı açar', () => {
    const giris: Bulgu = { sinyal: 'hatali-giris-serisi', onem: 'orta', kullaniciAdi: 'a', ip: '10.0.0.1', kisiId: null, sayi: 10, sonOlay: T0 };
    const oturum: Bulgu = { sinyal: 'cok-oturum', onem: 'orta', kullaniciAdi: null, ip: null, kisiId: 7, sayi: 4, sonOlay: T1 };
    const kapanan = [
      { sinyal: 'hatali-giris-serisi' as const, kullaniciAdi: 'a', ip: '10.0.0.1', kisiId: null, gozlenenSayi: 10, sonGoruldu: T0 },
      { sinyal: 'cok-oturum' as const, kullaniciAdi: null, ip: null, kisiId: 7, gozlenenSayi: 4, sonGoruldu: T0 },
    ];
    assert.deepEqual(yeniOlayliBulgular([giris, oturum], kapanan), []);
    assert.deepEqual(yeniOlayliBulgular([{ ...giris, sonOlay: T1 }], kapanan).length, 1);
    assert.deepEqual(yeniOlayliBulgular([{ ...oturum, sayi: 5 }], kapanan).length, 1);
    assert.deepEqual(yeniOlayliBulgular([{ ...giris, ip: '10.0.0.2' }], kapanan).length, 1);
    assert.deepEqual(yeniOlayliBulgular([giris], []).length, 1);
  });

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
    // GUV-6 a: ayardan gelen eşik uygulanır.
    assert.deepEqual(cokOturumBulgulari([{ kisiId: 7, acikOturum: 5 }], T1, 6), []);
    assert.equal(cokOturumBulgulari([{ kisiId: 7, acikOturum: 6 }], T1, 6).length, 1);
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

  test('sunucu günlüğü: yazılıyorsa açık, yazılamıyorsa kapalı ve nedeni, hiç satır yoksa uyarı, kurulmamışsa bilinmiyor', () => {
    const an = new Date('2026-10-28T10:00:00Z');
    assert.deepEqual(gunlukMaddesi({ sonYazma: an, sonHata: null }, 60).durum, 'acik');
    assert.equal(gunlukMaddesi({ sonYazma: an, sonHata: null }, 60).deger, an.toISOString());
    assert.deepEqual(gunlukMaddesi({ sonYazma: an, sonHata: 'EACCES' }, 60),
      { durum: 'kapali', deger: an.toISOString(), aciklama: 'Günlük dosyasına yazılamıyor: EACCES' });
    assert.equal(gunlukMaddesi({ sonYazma: null, sonHata: null }, 60).durum, 'uyari');
    assert.equal(gunlukMaddesi(null, 60).durum, 'bilinmiyor');
  });

  test('olay günlüğü: Windows dışında ve hiç denenmemişse bilinmiyor; hata uyarı; yazıldıysa açık', () => {
    const an = new Date('2026-10-28T10:00:00Z');
    assert.equal(olayGunluguMaddesi({ sonYazma: an, sonHata: null }, false).durum, 'bilinmiyor');
    assert.equal(olayGunluguMaddesi(null, true).durum, 'bilinmiyor');
    assert.equal(olayGunluguMaddesi({ sonYazma: null, sonHata: null }, true).durum, 'bilinmiyor');
    assert.equal(olayGunluguMaddesi({ sonYazma: null, sonHata: 'Erişim reddedildi' }, true).durum, 'uyari');
    assert.equal(olayGunluguMaddesi({ sonYazma: an, sonHata: null }, true).durum, 'acik');
  });

  test('disk: az yer uyarı ve adı; okunamayan disk durumu düşürmez; hiçbiri okunamazsa bilinmiyor', () => {
    const iyi = { bosBayt: 50e9, toplamBayt: 100e9, az: false };
    const az = { bosBayt: 1e9, toplamBayt: 100e9, az: true };
    assert.deepEqual(diskMaddesi([{ ad: 'Yedek', disk: iyi }, { ad: 'Günlük', disk: null }]),
      { durum: 'acik', deger: 'Yedek: 50 GB boş / 100 GB', aciklama: 'Disklerde yer yeterli.' });
    assert.equal(diskMaddesi([{ ad: 'Yedek', disk: iyi }, { ad: 'Veritabanı', disk: az }]).durum, 'uyari');
    assert.match(diskMaddesi([{ ad: 'Veritabanı', disk: az }]).aciklama, /Veritabanı/);
    assert.equal(diskMaddesi([{ ad: 'Yedek', disk: null }]).durum, 'bilinmiyor');
    assert.equal(diskMaddesi([]).durum, 'bilinmiyor');
  });

  test('sunucu sertifikası: kapının kendi sertifikası önce; vekilde izlenen dosya; ikisi de yoksa bilinmiyor (kapalı denmez)', () => {
    const simdi = new Date('2026-10-28T10:00:00Z');
    const uzak = new Date('2027-10-28T10:00:00Z');
    assert.equal(sunucuSertifikaMaddesi({ acik: true, sertifikaBitis: uzak }, { tanimli: true, bitis: simdi }, simdi).durum, 'acik');
    assert.equal(sunucuSertifikaMaddesi({ acik: false, sertifikaBitis: null }, { tanimli: true, bitis: uzak }, simdi).durum, 'acik');
    assert.equal(sunucuSertifikaMaddesi({ acik: false, sertifikaBitis: null }, { tanimli: true, bitis: new Date('2026-10-01T00:00:00Z') }, simdi).durum, 'kapali');
    assert.equal(sunucuSertifikaMaddesi({ acik: false, sertifikaBitis: null }, { tanimli: true, bitis: null }, simdi).durum, 'bilinmiyor');
    assert.equal(sunucuSertifikaMaddesi({ acik: false, sertifikaBitis: null }, { tanimli: false, bitis: null }, simdi).durum, 'bilinmiyor');
    assert.equal(sunucuSertifikaMaddesi(null, null, simdi).durum, 'bilinmiyor');
  });
});

test('yetki reddi serisi: farklı uç ya da kapsam eşiğinden biri yeter; sayı aşılan ölçüdür', () => {
  const t = '2099-01-01T00:00:00.000Z';
  const b = yetkiReddiBulgulari([
    { kisiId: 1, farkliUc: YETKI_REDDI_SERISI.farkliUc, kapsam: 0, sonRet: t },
    { kisiId: 2, farkliUc: 1, kapsam: YETKI_REDDI_SERISI.kapsam, sonRet: t },
    { kisiId: 3, farkliUc: YETKI_REDDI_SERISI.farkliUc - 1, kapsam: YETKI_REDDI_SERISI.kapsam - 1, sonRet: t },
  ]);
  assert.deepEqual(b.map((x) => [x.kisiId, x.sayi, x.onem]), [[1, YETKI_REDDI_SERISI.farkliUc, 'yuksek'], [2, YETKI_REDDI_SERISI.kapsam, 'yuksek']]);
  assert.deepEqual([...SAYILAN_RET_NEDENLERI].sort(), ['dis-izleyici', 'kapsam', 'yetki']);
});

test('adres taraması kritiktir; yalnız kritik alarm duyurulur (1362 a, 1365 a)', () => {
  const t = '2099-01-01T00:00:00.000Z';
  const b = adresTaramasiBulgulari([
    { ip: '10.0.0.1', farkliYol: ADRES_TARAMASI.farkliYol, sonRet: t },
    { ip: '10.0.0.2', farkliYol: ADRES_TARAMASI.farkliYol - 1, sonRet: t },
  ]);
  assert.deepEqual(b.map((x) => [x.ip, x.onem]), [['10.0.0.1', 'kritik']]);
  assert.equal(duyurulurMu({ onem: 'kritik' }), true);
  assert.equal(duyurulurMu({ onem: 'yuksek' }), false);
  assert.equal(alarmDuyuruMetni({ sinyal: 'adres-taramasi', kullaniciAdi: null, ip: '10.0.0.1', sayi: 5 }, null), 'Adres taraması: 10.0.0.1 (5)');
});

describe('ayar denetimi (2164)', () => {
  const simdi = new Date('2026-11-06T09:00:00.000Z');
  const once = (gun: number): string => new Date(simdi.getTime() - gun * 86_400_000).toISOString();
  const durum = (r: { durum: string }): string => r.durum;

  test('gece yedeği: uyarı sağlıktan gelir; kapalı hata, okunamayan bilinmiyor', () => {
    assert.equal(durum(geceYedegiDenetimi({ durum: 'acik', sonYedek: new Date(once(0.5)) }, null, simdi)), 'uygun');
    const eski = geceYedegiDenetimi({ durum: 'acik', sonYedek: new Date(once(3)) }, 'Son yedek eski.', simdi);
    assert.deepEqual(eski, { durum: 'uyari', aciklama: 'Son yedek eski. (son yedek 3 gün önce)' });
    assert.equal(durum(geceYedegiDenetimi({ durum: 'anahtar-yok', sonYedek: null }, null, simdi)), 'hata');
    assert.equal(durum(geceYedegiDenetimi(null, null, simdi)), 'bilinmiyor');
  });

  test('yedek anahtarı: açık uygun, yok hata, klasör yoksa ve okunamazsa bilinmiyor', () => {
    assert.deepEqual(['acik', 'anahtar-yok', 'dizin-yok', null].map((d) => durum(yedekAnahtariDenetimi(d as never))),
      ['uygun', 'hata', 'bilinmiyor', 'bilinmiyor']);
  });

  test('yedek diski: eşik Sistem durumu kartındakiyle aynı (diskDurumu, 2164-2)', () => {
    const gb = 1024 ** 3;
    assert.equal(durum(yedekDiskiDenetimi(diskDurumu(50 * gb, 100 * gb))), 'uygun');
    assert.equal(durum(yedekDiskiDenetimi(diskDurumu(4 * gb, 20 * gb))), 'uyari');
    assert.equal(durum(yedekDiskiDenetimi(diskDurumu(8 * gb, 100 * gb))), 'uyari');
    assert.equal(durum(yedekDiskiDenetimi(null)), 'bilinmiyor');
  });

  test('geri yükleme: eşik ve metin sağlığın deneme uyarısından; başarısız hata, okunmamış kayıt bilinmiyor', () => {
    const deneme = (gun: number, sonuc: 'basarili' | 'basarisiz') =>
      ({ zaman: once(gun), yedek: 'y.dump', sonuc, sureSn: 1, kisiSayisi: null, gocSayisi: null, hata: null });
    const sinifla = (d: Parameters<typeof denemeUyarisi>[0] | undefined) =>
      geriYuklemeDenetimi(d, d === undefined ? null : denemeUyarisi(d, simdi), simdi);
    assert.equal(durum(sinifla(deneme(10, 'basarili'))), 'uygun');
    const eski = sinifla(deneme(40, 'basarili'));
    assert.deepEqual(eski, { durum: 'uyari', aciklama: denemeUyarisi(deneme(40, 'basarili'), simdi) });
    assert.equal(durum(sinifla(deneme(1, 'basarisiz'))), 'hata');
    assert.equal(durum(sinifla(null)), 'uyari');
    assert.equal(durum(sinifla(undefined)), 'bilinmiyor');
  });

  test('dış bağlantılar: yalnız açık/kapalı bilgi; adres taşımaz; hepsi okunamazsa bilinmiyor', () => {
    const b = disBaglantiDenetimi({ logo: true, smartes: false, etiketYazicisi: null });
    assert.deepEqual(b, { durum: 'bilgi', aciklama: 'Logo açık · SmartES kapalı · Etiket yazıcısı bilinmiyor' });
    assert.equal(durum(disBaglantiDenetimi({ logo: null, smartes: null, etiketYazicisi: null })), 'bilinmiyor');
  });

  test('ortam: canlıda test robotu anahtarı hata (ADR 0019); canlı olmayan bilgi', () => {
    assert.equal(durum(ortamDenetimi('canli', true)), 'hata');
    assert.equal(durum(ortamDenetimi('canli', false)), 'uygun');
    assert.equal(durum(ortamDenetimi('test', true)), 'bilgi');
    assert.equal(durum(ortamDenetimi(null, false)), 'bilinmiyor');
  });

  test('çalışan sürüm: bütün ağaçta kritik ya da yüksek uyarı; yapılamadı uyarı; taramasız paket bilgi', () => {
    const sayi = (k: number, y: number) => ({ kritik: k, yuksek: y, orta: 3, dusuk: 1 });
    const tamam = (tum: ReturnType<typeof sayi>) => ({ durum: 'tamam' as const, zaman: once(1), canli: sayi(0, 0), tum });
    const bilgi = (tarama: PaketTaramasi | null) =>
      ({ surum: '1.2.3', tarih: once(2), tarama });
    assert.equal(durum(calisanSurumDenetimi(bilgi(tamam(sayi(0, 0))), simdi)), 'uygun');
    assert.equal(durum(calisanSurumDenetimi(bilgi(tamam(sayi(0, 1))), simdi)), 'uyari');
    assert.equal(durum(calisanSurumDenetimi(bilgi(tamam(sayi(1, 0))), simdi)), 'uyari');
    assert.equal(durum(calisanSurumDenetimi(bilgi({ durum: 'yapilamadi', zaman: once(1) }), simdi)), 'uyari');
    assert.equal(durum(calisanSurumDenetimi(bilgi(null), simdi)), 'bilgi');
    assert.equal(durum(calisanSurumDenetimi({ surum: null, tarih: null, tarama: null }, simdi)), 'bilgi');
    assert.equal(durum(calisanSurumDenetimi(null, simdi)), 'bilinmiyor');
  });

  test('güncelleme anahtarı: açık uygun, geçersiz hata, yok uyarı, okunamayan bilinmiyor', () => {
    assert.deepEqual(['acik', 'anahtar-gecersiz', 'anahtar-yok', 'dizin-yok', null].map((k) => durum(guncellemeAnahtariDenetimi(k as never))),
      ['uygun', 'hata', 'uyari', 'uyari', 'bilinmiyor']);
  });
});

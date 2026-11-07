import { randomBytes, randomInt } from 'node:crypto';
import { cerezOku } from '#cekirdek/cerez.ts';
import { vtUlasilamadi } from '#cekirdek/db.ts';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { UygulamaHatasi, bulunamadi, cakisma, cokIstek, dogrulama, gecersiz, oturumYok, veritabaniYok, yetkiYok } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kimlik } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { CihazProfili } from '#paylasilan/kullanici.ts';
import type { CihazDurumu, CihazProfilleriCevabi, HesapKilidi, OrtakCihaz } from '#paylasilan/sozlesme/oturum.ts';
import {
  gizlilikTaahhuduVer, girisDogrula, ilkPiniYaz, kartGirisDurumu, kisiNoKullaniciAdindan, kendiParolasiniDegistir as parolayiDegistir, kendiPininiDegistir as piniDegistir, kisiKullaniciAdi, kullaniciAdiniDuzelt, kullaniciYukle,
  yeniPinHatasi,
} from '../kisiler/disari.ts';
import type { GirisSirri } from '../kisiler/disari.ts';
import { personelKartSahibi } from '../nizamiye/disari.ts';
import {
  AYNI_PAROLA, ayniParolaMi, AZAMI_SN, BOSTA_SN, CEREZ_ADI, CIHAZ_CEREZI, bostaSuresiSn, profilSayfalariHatasi, profilUygula, profilYonetebilirMi, CIHAZ_PENCERESI_DK, CIHAZ_SAKLAMA_GUN, CIHAZ_SINIRI, DENEME_SAKLAMA_GUN, GORULME_ARALIGI_SN,
  SAAT_BELIRTECI_SN, SAAT_ISTEGI_GENEL_SINIR, SAAT_ISTEGI_IP_SINIRI, SAAT_ISTEGI_SN, SAAT_SORU_ARALIGI_SN, anahtarOzeti, belirtecOku, hesapKilitlenirMi, kalanBeklemeSn, kartGirisAdi,
  beklemeIletisi, kilitKalanDk, BUYUYEN_KILIT_PENCERESI_SAAT, hesapKilidiIletisi, hesapKilidiSuresiDk, kilitBuyurMu, SURESIZ_KILIT_DK,
  saatBelirteciGecerMi, saatKoduUret, saatOnayAdi, saatSoruAdi, tarayiciMetni,
  NABIZ_EN_SIK_SN, NABIZ_SAKLAMA_GUN, esitlemeSuresi, nabizDurumu, SINIRLI_ORTAK_CIHAZ, sinirliOturumGecerMi,
} from './kurallar.ts';
import type { NabizDurumu } from './kurallar.ts';
import {
  cihazHataliBul, denemeEkle, denemeKilidiAl, eskiDenemeleriSil, eskiOturumCihaziniBosalt, etkinKilitSay, etkinKilitler, oturumVeProfilBul, gorulduYaz, hataliSeriBul,
  hesapKilidiAc, hesapKilidiEkle, hesapKilidiKalanSn, hesapSerisiSay, yakinKilitSay, kisiOturumlariniKapat, oturumEkle, oturumKapat,
  gecerliSaatBelirteciBul, kisiSaatBelirtecleriniKapat, saatBelirteciEkle, saatBelirteciKapat, saatBelirtecleri, saatIstegiAl, saatIstegiEkle,
  saatIstegiOnayla, saatIstekleriniTemizleSay, acikOrtakCihazAdiVar, acikOrtakCihazBul, acikOrtakCihazBulId, acikOrtakCihazlar, ortakCihazEkle, ortakCihazKapat,
  cihazAyari, cihazAyariYaz, cihazProfilleri, cihazProfiliCoz, profilAtamasiYaz, profilSayfalariYaz, defterKisisiniYaz,
  cihazNabizlari, eskiNabizlariSil, nabizYaz,
} from './sorgular.ts';
import type { CihazNabziSatiri, CihazProfiliSatiri, NabizGirdisi, OrtakCihazSatiri, SaatBelirteciSatiri, Simdi } from './sorgular.ts';

const HATALI_GIRIS = 'Kullanıcı adı, PIN ya da parola hatalı.';

export type GirisSonucu =
  | { anahtar: string; kullanici: Kullanici; pinBelirlenecek?: undefined }
  | { anahtar: null; kullanici: null; pinBelirlenecek: true };

export async function girisYap(
  db: Db,
  girdi: {
    kullaniciAdi: string; parola?: string | undefined; pin?: string | undefined; ip: string; tarayici?: string | null | undefined;
    gunluk?: Gunluk | undefined;
  },
  simdi: Simdi = null,
): Promise<GirisSonucu> {
  const ad = kullaniciAdiniDuzelt(girdi.kullaniciAdi);

  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);

  const sir: GirisSirri = girdi.pin !== undefined ? { pin: girdi.pin } : { parola: girdi.parola ?? '' };
  const sonuc = await girisDogrula(db, ad, sir);
  const kullanici = sonuc === null ? null : await kimlikYukle(db, sonuc.kisiId);
  if (sonuc === null || kullanici === null) {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    // Deneme kaydı reddedilen girişte de kalmalı; yoksa bekleme hiç artmaz.
    throw new UygulamaHatasi('OTURUM_YOK', HATALI_GIRIS, { yazilarKalir: true });
  }
  await denemeyiSifirla(db, ad, girdi.ip, simdi);
  if (sonuc.pinBelirlenecek) return { anahtar: null, kullanici: null, pinBelirlenecek: true };
  return { anahtar: await oturumAc(db, kullanici.id, girdi), kullanici };
}

async function oturumAc(db: Db, kisiId: number, girdi: { ip: string; tarayici?: string | null | undefined }): Promise<string> {
  const anahtar = randomBytes(32).toString('base64url');
  await oturumEkle(db, anahtarOzeti(anahtar), kisiId, { ip: girdi.ip.trim() === '' ? null : girdi.ip, tarayici: tarayiciMetni(girdi.tarayici ?? null) });
  return anahtar;
}

const HATALI_KART = 'Kart tanınmadı ya da bu kartla giriş kapalı.';

// İstasyonda PIN'siz kart (kart #1326, 1897 b). Yalnız İstasyon profilli ortak cihazda geçer (çağıran
// denetler); orada yetki rol ile cihaz profilinin kesişimidir. Kayıtsız kart, kaldırılmış kart ve kartla girişi kapalı hesap (parolalı
// yönetici, pasif kişi) aynı iletiyle reddedilir ve hatalı deneme sayılır: kart ve kullanıcı adı yolu tek sayaçtır, kilitli hesap kartla
// da giremez. İlk PIN'ini belirlememiş kişi önce kullanıcı adıyla PIN'ini belirler.
export async function kartlaGirisYap(
  db: Db,
  girdi: { kart: string; ip: string; tarayici?: string | null | undefined; gunluk?: Gunluk | undefined },
  simdi: Simdi = null,
): Promise<{ anahtar: string; kullanici: Kullanici }> {
  const kisiId = await personelKartSahibi(db, girdi.kart);
  const kullaniciAdi = kisiId === null ? null : await kisiKullaniciAdi(db, kisiId);
  const ad = kullaniciAdi === null ? kartGirisAdi(girdi.ip) : kullaniciAdiniDuzelt(kullaniciAdi);

  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);

  const durum = kullaniciAdi === null ? null : await kartGirisDurumu(db, ad);
  if (durum === 'pin-belirlenecek') throw oturumYok('İlk PIN\'inizi giriş ekranında kullanıcı adınızla belirleyin; sonra kartla girin.');
  const kullanici = durum === 'uygun' && kisiId !== null ? await kimlikYukle(db, kisiId) : null;
  if (kullanici === null) {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    throw new UygulamaHatasi('OTURUM_YOK', HATALI_KART, { yazilarKalir: true });
  }
  await denemeyiSifirla(db, ad, girdi.ip, simdi);
  return { anahtar: await oturumAc(db, kullanici.id, girdi), kullanici };
}

// İlk giriş: yöneticinin verdiği geçici PIN girişle aynı bekleme ve sayaçla doğrulanır, kişinin kendi PIN'i yazılır ve
// oturum açılır. Geçici PIN'i olmayan kişinin doğru PIN'i de hatalı deneme sayılır: bu yol PIN değiştirme yolu değildir.
export async function ilkPiniBelirle(
  db: Db,
  girdi: { kullaniciAdi: string; geciciPin: string; yeniPin: string; ip: string; tarayici?: string | null | undefined; gunluk?: Gunluk | undefined },
  simdi: Simdi = null,
): Promise<{ anahtar: string; kullanici: Kullanici }> {
  const ad = kullaniciAdiniDuzelt(girdi.kullaniciAdi);
  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);
  const kural = yeniPinHatasi(girdi.geciciPin, girdi.yeniPin);
  if (kural !== null) throw new UygulamaHatasi('DOGRULAMA', kural, { alan: 'yeniPin' });

  const sonuc = await girisDogrula(db, ad, { pin: girdi.geciciPin });
  const kullanici = sonuc?.pinBelirlenecek === true ? await kimlikYukle(db, sonuc.kisiId) : null;
  if (kullanici === null) {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    throw new UygulamaHatasi('OTURUM_YOK', 'Kullanıcı adı ya da geçici PIN hatalı.', { yazilarKalir: true });
  }
  // Uç oturumsuzdur; kişi geçici PIN'le kanıtlandı, defterde "Sistem" değil kendisi görünür.
  await defterKisisiniYaz(db, kullanici.id);
  await ilkPiniYaz(db, kullanici.id, girdi.yeniPin);
  await denemeyiSifirla(db, ad, girdi.ip, simdi);
  return { anahtar: await oturumAc(db, kullanici.id, girdi), kullanici };
}

// Bekleme ya da eşzamanlı deneme varsa fırlatır; parolaya bakılmadan, kayıt yazılmadan döner. ad kullaniciAdiniDuzelt'ten
// geçmiş olmalı. Yanlış parola kaydedilirken hata yazilarKalir taşımalıdır (yoksa kayıt geri alınır, bekleme artmaz).
export async function girisDenemesiniDenetle(db: Db, ad: string, ip: string, simdi: Simdi = null): Promise<void> {
  // Kullanıcıya ve parolaya bakılmadan, kayıt yazılmadan döner: cevap hesabın varlığını ele vermez.
  if (!(await denemeKilidiAl(db, ip))) {
    throw cokIstek('Aynı anda başka bir giriş denemesi sürüyor. Birazdan yeniden deneyin.');
  }
  // Kilitli ad sırra bakılmadan, kayıt yazılmadan reddedilir; doğru PIN de geçmez. Kilit olmayan adda da kurulabildiği için
  // cevap hesabın varlığını ele vermez.
  const kilitKalanSn = await hesapKilidiKalanSn(db, ad, simdi);
  if (kilitKalanSn !== null) {
    throw oturumYok(hesapKilidiIletisi(kilitKalanSn));
  }
  const cihaz = await cihazHataliBul(db, ip, CIHAZ_PENCERESI_DK, CIHAZ_SINIRI, simdi);
  if (cihaz.sayi >= CIHAZ_SINIRI && cihaz.kalanSn !== null && cihaz.kalanSn > 0) {
    throw oturumYok(`Bu cihazdan çok sayıda hatalı deneme. Giriş ${kilitKalanDk(cihaz.kalanSn)} dk sonra yeniden denenebilir.`);
  }
  // Bekleme dolmadan gelen deneme parolaya bakılmadan reddedilir, kaydedilmez ve sayılmaz: sabırsız
  // kullanıcı kendi beklemesini uzatmaz.
  const seri = await hataliSeriBul(db, ad, ip, simdi);
  const kalanSn = kalanBeklemeSn(seri.sayi, seri.gecen_sn);
  if (kalanSn > 0) throw oturumYok(beklemeIletisi(kalanSn));

  // Deneme temizliği zamanlanmış iş değildir; parolaya bakılan her denemede koşar.
  await eskiDenemeleriSil(db, DENEME_SAKLAMA_GUN, simdi);
}

// 398 a: girişte değil zamanlanmış işte koşar. Giriş oturum tablosuna yalnız kendi satırını yazar; başka oturumlara dokunan
// güncelleme girişin kilit sırasını bozar (kişi satırından önce oturum tablosunu kilitlerdi).
export async function eskiOturumCihaziniTemizle(db: Db): Promise<void> {
  await eskiOturumCihaziniBosalt(db, CIHAZ_SAKLAMA_GUN, { bostaSn: BOSTA_SN, azamiSn: AZAMI_SN }, null);
}

// Nabız oturum çerezinden bulunur; ortak cihaz çerezi varsa nabız o cihaza da bağlanır. Sık gelen nabız sessizce düşer (false).
export async function nabizKaydet(db: Db, anahtar: string, cihazBelirteci: string | null, girdi: NabizGirdisi): Promise<boolean> {
  return nabizYaz(
    db, anahtarOzeti(anahtar), cihazBelirteci ? anahtarOzeti(cihazBelirteci) : null,
    { ...girdi, sonEsitlemeSn: esitlemeSuresi(girdi.sonEsitlemeSn) }, NABIZ_EN_SIK_SN,
  );
}

// Panel bütün açık oturumlara bakar: istasyonun kısa boşta süresi burada uzun süreyle örtülür, kapanan oturum zaten düşer.
export async function cihazNabizDurumlari(db: Db): Promise<(CihazNabziSatiri & { durum: NabizDurumu })[]> {
  const satirlar = await cihazNabizlari(db, { bostaSn: BOSTA_SN, azamiSn: AZAMI_SN });
  return satirlar.map((s) => ({ ...s, durum: nabizDurumu(s.sonNabizdanBeriSn, s.kuyruk) }));
}

export async function eskiNabizlariTemizle(db: Db, simdi: Simdi = null): Promise<void> {
  await eskiNabizlariSil(db, NABIZ_SAKLAMA_GUN, simdi);
}

// Ada bütün cihazlardan gelen seri eşiğe varınca ad kilitlenir. Yöneticiye bildirim yolu yok (UYUM-BORCU): kilit tabloda
// ve sunucu günlüğünde görünür, liste ucundan okunur.
export async function basarisizDenemeKaydet(db: Db, ad: string, ip: string, simdi: Simdi = null, gunluk?: Gunluk): Promise<void> {
  await denemeEkle(db, ad, 'hatali', ip, simdi);
  if (!hesapKilitlenirMi(await hesapSerisiSay(db, ad))) return;
  const buyur = kilitBuyurMu(ad, await parolaHesabiMi(db, ad));
  const dakika = hesapKilidiSuresiDk(buyur, buyur ? await yakinKilitSay(db, ad, BUYUYEN_KILIT_PENCERESI_SAAT, simdi) : 0);
  if (await hesapKilidiEkle(db, ad, dakika, simdi)) {
    const sure = dakika === SURESIZ_KILIT_DK ? 'yönetici açana kadar' : `${dakika} dk`;
    gunluk?.uyar(`Hesap kilitlendi: ${JSON.stringify(ad)} art arda hatalı denemeden sonra ${sure} kilitli.`);
  }
}

// Var olan ve PIN'siz giren (parolalı) hesap. Var olmayan ad parolalı sayılmaz (kilitBuyurMu).
async function parolaHesabiMi(db: Db, ad: string): Promise<boolean> {
  if ((await kisiNoKullaniciAdindan(db, ad)) === null) return false;
  return (await kartGirisDurumu(db, ad)) === null;
}

// Başarılı deneme hatalı seriyi sıfırlar (seri son başarılı denemeden sonrasını sayar).
export function denemeyiSifirla(db: Db, ad: string, ip: string, simdi: Simdi = null): Promise<void> {
  return denemeEkle(db, ad, 'basarili', ip, simdi);
}

export function istektekiOturumOzeti(istek: { cerez(ad: string): string | null }): string | null {
  const anahtar = istek.cerez(CEREZ_ADI);
  return anahtar ? anahtarOzeti(anahtar) : null;
}

// Kişinin kendi parolası: eski parola girişle aynı bekleme ve sayaçla denetlenir; başarıyla değişince öbür oturumlar kapanır,
// istek yapanın oturumu kalır.
export async function kendiParolasiniDegistir(
  db: Db,
  kisiId: number,
  girdi: { eskiParola: string; yeniParola: string; ip: string; oturumOzeti: string | null; gunluk?: Gunluk | undefined },
  simdi: Simdi = null,
): Promise<void> {
  const kullaniciAdi = await kisiKullaniciAdi(db, kisiId);
  if (kullaniciAdi === null) throw gecersiz('Kişinin giriş hesabı yok.');
  const ad = kullaniciAdiniDuzelt(kullaniciAdi);
  if (ayniParolaMi(girdi.eskiParola, girdi.yeniParola)) throw dogrulama(AYNI_PAROLA, 'yeniParola');
  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);
  if ((await parolayiDegistir(db, kisiId, girdi.eskiParola, girdi.yeniParola)) === 'eski-yanlis') {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    // Deneme kaydı reddedilen komutta da kalmalı; yoksa bekleme hiç artmaz.
    throw new UygulamaHatasi('DOGRULAMA', 'Eski parola yanlış.', { alan: 'eskiParola', yazilarKalir: true });
  }
  await denemeyiSifirla(db, ad, girdi.ip, simdi);
  await kisiOturumlariniKapat(db, kisiId, girdi.oturumOzeti);
  await kisiSaatBelirtecleriniKapat(db, kisiId);
}

export function hesapKilitleri(
  db: Db,
  sorgu: { sayfa: number; sayfaBoyu?: number | undefined },
  simdi: Simdi = null,
): Promise<SayfaliListe<HesapKilidi>> {
  return sayfaliListe(sorgu, {
    say: () => etkinKilitSay(db, simdi),
    satirlar: (dilim) => etkinKilitler(db, simdi, dilim),
  });
}

export async function hesapKilidiniAc(db: Db, id: number, acanKisiId: number, simdi: Simdi = null): Promise<{ acilan: number }> {
  const acilan = await hesapKilidiAc(db, id, acanKisiId, simdi);
  if (acilan === 0) throw bulunamadi('Etkin hesap kilidi bulunamadı; süresi dolmuş ya da açılmış olabilir.');
  return { acilan };
}

// Kişinin kendi PIN'i: parola değişimiyle aynı bekleme ve sayaç; başarıyla değişince öbür oturumlar kapanır.
export async function kendiPininiDegistir(
  db: Db,
  kisiId: number,
  girdi: { eski: string; yeniPin: string; ip: string; oturumOzeti: string | null; gunluk?: Gunluk | undefined },
  simdi: Simdi = null,
): Promise<void> {
  const kullaniciAdi = await kisiKullaniciAdi(db, kisiId);
  if (kullaniciAdi === null) throw gecersiz('Kişinin giriş hesabı yok.');
  const ad = kullaniciAdiniDuzelt(kullaniciAdi);
  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);
  if ((await piniDegistir(db, kisiId, girdi.eski, girdi.yeniPin)) === 'eski-yanlis') {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    throw new UygulamaHatasi('DOGRULAMA', 'Eski PIN ya da parola yanlış.', { alan: 'eski', yazilarKalir: true });
  }
  await denemeyiSifirla(db, ad, girdi.ip, simdi);
  await kisiOturumlariniKapat(db, kisiId, girdi.oturumOzeti);
  await kisiSaatBelirtecleriniKapat(db, kisiId);
}

export async function cikisYap(db: Db, anahtar: string | null): Promise<void> {
  if (anahtar) await oturumKapat(db, anahtarOzeti(anahtar));
}

// Oturumun kişisi: yetkisi kişilerden. Dış izleyici işareti (1224 a) portal kapalıyken okunmaz: portal kullanılmadığı
// için her istekte portal tablosunu okumak gereksizdir; portal açılırsa işaret yeniden bağlanır.
async function kimlikYukle(db: Db, kisiId: number, oturumAcildi: string | null = null): Promise<Kullanici | null> {
  return kullaniciYukle(db, kisiId, oturumAcildi);
}

// Cihazın profili oturumdan değil her istekte cihaz çerezinden okunur (kart #1358): cihazın profili değişince ya da kişi aynı oturum
// çereziyle başka cihaza geçince bir sonraki istekte geçerlidir. İstasyonda boşta süre kısadır (1356 a).
export async function anahtardanKullanici(db: Db, anahtar: string, cihazBelirteci: string | null): Promise<Kullanici | null> {
  const { profil, oturum } = await oturumVeProfilBul(db, anahtarOzeti(anahtar), cihazBelirteci ? anahtarOzeti(cihazBelirteci) : null, {
    azamiSn: AZAMI_SN, gorulmeAraligiSn: GORULME_ARALIGI_SN,
  });
  if (oturum === null || oturum.bosta_gecen_sn >= bostaSuresiSn(profil.kod)) return null;
  // Kişi bu oturumdan sonra pasife alınmış ya da parolası başkasınca değişmişse oturum geçersizdir.
  const kullanici = await kimlikYukle(db, oturum.kisi_id, oturum.acildi_metin);
  if (kullanici === null) return null;
  // Görüldü yazısı geçerlilik denetiminden sonradır: süresi dolmuş oturum kendi boşta süresini sıfırlamasın.
  if (kullanici.sinirli !== undefined && !sinirliOturumGecerMi({
    bostaGecenSn: oturum.bosta_gecen_sn, acikGecenSn: oturum.acik_gecen_sn, kayitliCihaz: profil.cihazId !== null,
  })) return null;
  if (oturum.bayat) await gorulduYaz(db, oturum.id);
  return profilUygula(kullanici, profil);
}

// Girişin son adımı (kart 2158): sınırlı hesap kayıtlı ortak cihazda oturum açamaz. Hata transaction'ı geri alır: oturum yazılmaz.
export async function sinirliGirisiDenetle(db: Db, kullanici: Kullanici, cihazBelirteci: string | null): Promise<void> {
  if (kullanici.sinirli === undefined) return;
  const profil = await cihazProfiliCoz(db, cihazBelirteci ? anahtarOzeti(cihazBelirteci) : null);
  if (profil.cihazId !== null) throw yetkiYok(SINIRLI_ORTAK_CIHAZ);
}

// Sınırlı hesabın gizlilik taahhüdü (2158-5 a): onaylanınca kişi yeniden yüklenir, menü ve uçlar açılır.
export async function gizlilikTaahhuduOnayla(db: Db, kullanici: Kullanici, cihazBelirteci: string | null): Promise<Kullanici> {
  await gizlilikTaahhuduVer(db, kullanici.id);
  const yeni = await kimlikYukle(db, kullanici.id);
  if (yeni === null) throw oturumYok();
  return cihazaGoreKullanici(db, yeni, cihazBelirteci);
}

// Girişin döndürdüğü kişi menüyü ilk çizer: işlemleri de bu cihazın profiliyle süzülür.
export async function cihazaGoreKullanici(db: Db, kullanici: Kullanici, cihazBelirteci: string | null): Promise<Kullanici> {
  return profilUygula(kullanici, await cihazProfiliCoz(db, cihazBelirteci ? anahtarOzeti(cihazBelirteci) : null));
}

// Çerez önce gelir: tarayıcı belirteç göndermez, saat çerez göndermez. Belirteç yalnız saat uçlarında çözülür (saatBelirteciGecerMi); başka uçta
// kimlik yoktur ve uç kendi kuralıyla 401 verir.
export function kimlikCozucu(vt: Veritabani): Kimlik {
  return async (istek) => {
    const anahtar = cerezOku(istek.headers.cookie, CEREZ_ADI);
    if (anahtar) return anahtardanKullanici(vt, anahtar, cerezOku(istek.headers.cookie, CIHAZ_CEREZI));
    const belirtec = belirtecOku(istek.headers.authorization);
    if (belirtec === null || !saatBelirteciGecerMi(istek.method, istek.routeOptions.url)) return null;
    return saatBelirtecindenKullanici(vt, belirtec);
  };
}

/* ---------------- akıllı saat (kart #1632) ---------------- */

export async function saatBelirtecindenKullanici(db: Db, belirtec: string): Promise<Kullanici | null> {
  const satir = await gecerliSaatBelirteciBul(db, anahtarOzeti(belirtec));
  if (satir === null) return null;
  // Kişi pasife alınmış ya da parolası değişmişse belirteç de geçersizdir (oturumla aynı kural).
  return kimlikYukle(db, satir.kisi_id, satir.acildi_metin);
}

const URETIM_DENEMESI = 5;

// Saatin açtığı eşleşme isteği: gizli anahtar yalnız saatte kalır, kod ekranda gösterilir. Kod ya da anahtar bekleyen başka
// istekle çakışırsa yeniden üretilir.
export async function saatIstegiAc(db: Db, ip: string): Promise<{ istek: string; kod: string; son: string }> {
  const sayi = await saatIstekleriniTemizleSay(db, ip);
  if (sayi.cihaz >= SAAT_ISTEGI_IP_SINIRI || sayi.genel >= SAAT_ISTEGI_GENEL_SINIR) {
    throw cokIstek('Bekleyen eşleşme isteği çok. Birkaç dakika sonra yeniden deneyin.');
  }
  for (let i = 0; i < URETIM_DENEMESI; i += 1) {
    const istek = randomBytes(32).toString('base64url');
    const kod = saatKoduUret(randomInt);
    const yazilan = await saatIstegiEkle(db, { gizliOzeti: anahtarOzeti(istek), kodOzeti: anahtarOzeti(kod), ip, sureSn: SAAT_ISTEGI_SN });
    if (yazilan !== null) return { istek, kod, son: yazilan.son };
  }
  throw cokIstek('Şu an kod üretilemedi. Birazdan yeniden deneyin.');
}

// Oturumu açık kişi saatte gördüğü kodu onaylar. Hatalı kod kişinin kendi adına sayılır (bekleme ve kilit yalnız onu durdurur);
// başarı seriyi sıfırlamaz.
export async function saatIsteginiOnayla(
  db: Db,
  kisiId: number,
  girdi: { kod: string; ip: string; gunluk?: Gunluk | undefined },
  simdi: Simdi = null,
): Promise<void> {
  const ad = saatOnayAdi(kisiId);
  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);
  if (!(await saatIstegiOnayla(db, anahtarOzeti(girdi.kod), kisiId))) {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    throw new UygulamaHatasi('DOGRULAMA', 'Kod hatalı ya da süresi dolmuş.', { alan: 'kod', yazilarKalir: true });
  }
}

export type SaatIstegiSonucu =
  | { durum: 'bekliyor' }
  | { durum: 'onaylandi'; belirtec: string; son: string; kullanici: Kullanici };

// Saat onayı sorar. Onaylanmışsa belirteç bir kez verilir; onaylayan kişi bu arada pasife alındıysa istek boşa düşer.
const SAAT_ISTEGI_YOK = 'Eşleşme isteği bulunamadı ya da süresi doldu. Saatte yeni kod alın.';

// Bilinmeyen anahtar, erken soru ve geçersiz onaylayan hatadır; hata transaction'ı geri alır ve denetim satırı bırakmaz.
// Yalnız bilinmeyen anahtar cihazın hatalı denemesi sayılır (deneme kaydı geri alınmaz).
export async function saatIstegiSor(
  db: Db, girdi: { istek: string; ip: string; gunluk?: Gunluk | undefined }, simdi: Simdi = null,
): Promise<SaatIstegiSonucu> {
  const ad = saatSoruAdi(girdi.ip);
  await girisDenemesiniDenetle(db, ad, girdi.ip, simdi);
  const sonuc = await saatIstegiAl(db, anahtarOzeti(girdi.istek), SAAT_SORU_ARALIGI_SN);
  if (sonuc.durum === 'yok') {
    await basarisizDenemeKaydet(db, ad, girdi.ip, simdi, girdi.gunluk);
    throw new UygulamaHatasi('OTURUM_YOK', SAAT_ISTEGI_YOK, { yazilarKalir: true });
  }
  if (sonuc.durum === 'erken') throw cokIstek(`Eşleşme en çok ${SAAT_SORU_ARALIGI_SN} sn'de bir sorulur.`);
  if (sonuc.durum === 'bekliyor') return sonuc;
  const kullanici = await kimlikYukle(db, sonuc.kisiId);
  if (kullanici === null) throw oturumYok(SAAT_ISTEGI_YOK);
  const belirtec = randomBytes(32).toString('base64url');
  const { son } = await saatBelirteciEkle(db, anahtarOzeti(belirtec), kullanici.id, SAAT_BELIRTECI_SN);
  return { durum: 'onaylandi', belirtec, son, kullanici };
}

// Pasife alınmış ya da parolası başkasınca değişmiş kişinin belirteci geçersizdir; listede de görünmez.
export async function saatCihazlari(db: Db, kisiId: number | null): Promise<SaatBelirteciSatiri[]> {
  const sonuc: SaatBelirteciSatiri[] = [];
  for (const { acildiMetin, ...satir } of await saatBelirtecleri(db, kisiId)) {
    if ((await kullaniciYukle(db, satir.kisiId, acildiMetin)) !== null) sonuc.push(satir);
  }
  return sonuc;
}

// kisiId verilirse yalnız kişinin kendi saati kapanır; başkasının ya da geçersiz belirteç 404.
export async function saatCihaziniKapat(db: Db, id: number, kapatanKisiId: number, kisiId: number | null): Promise<void> {
  if (!(await saatBelirteciKapat(db, id, kapatanKisiId, kisiId))) throw bulunamadi('Açık saat eşleşmesi bulunamadı.');
}

// Uç transaction dışında koşar ve çekirdek kimlik çözümündeki ulaşılamama hatasını yutar; çerezli istekte kimlik
// null gelirse sebep ayırt edilemez. Çerez yeniden çözülür: veritabanı hâlâ yoksa 503, vardaysa gerçek sonuç.
export async function oturumKullanicisi(
  db: Db,
  cerez: string | null,
  cozulen: Kullanici | null,
  cihazBelirteci: string | null,
): Promise<Kullanici | null> {
  if (cozulen !== null || !cerez) return cozulen;
  try {
    return await anahtardanKullanici(db, cerez, cihazBelirteci);
  } catch (hata) {
    if (vtUlasilamadi(hata)) throw veritabaniYok();
    throw hata;
  }
}

/* ---------------- ortak cihaz (kart #739, karar 738 a) ve cihaz profili (kart #1358) ---------------- */

const ortakCihaz = ({ ozet, ...satir }: OrtakCihazSatiri, buOzet: string | null): OrtakCihaz => ({ ...satir, buCihaz: ozet === buOzet });

// Çerezi olmayan, bilinmeyen ya da iptal edilmiş cihaz kayıtsızdır; çağıran bayat çerezi siler. Ortak cihaz davranışı (kart girişi,
// çıkışta kalan yerel veri) yalnız istasyon profilli kayıtlı cihazdadır.
export async function cihazDurumu(db: Db, belirtec: string | null): Promise<CihazDurumu & { bayatCerez: boolean }> {
  const profil = await cihazProfiliCoz(db, belirtec ? anahtarOzeti(belirtec) : null);
  if (profil.cihazId === null) return { ortak: false, id: null, ad: null, profil: profil.kod, bayatCerez: belirtec !== null };
  return { ortak: profil.kod === 'istasyon', id: profil.cihazId, ad: profil.cihazAd, profil: profil.kod, bayatCerez: false };
}

function profilYonetimiDenetle(kullanici: Kullanici): void {
  if (!profilYonetebilirMi(kullanici)) throw yetkiYok('Cihaz profilleri yalnız Tam profilli bir cihazdan değiştirilir.');
}

// Yönetici kaydı ortak yapılacak cihazın kendisinden yapar: belirteç bu cihazın çerezine yazılır. Zaten kayıtlı cihaz yeniden kaydedilmez.
// Profil (verilmezse istasyon) yalnız kayıt şu an Tam profilli cihazdan yapılıyorsa atanır: telefondan giren yönetici telefonunu
// kaydedip genişletemez; o cihaz kayıtsız cihaz profilinde kalır, profili Tam profilli bir cihazdan atanır.
export async function ortakCihazKaydet(
  db: Db, kullanici: Kullanici, ad: string, profil: CihazProfili | undefined, mevcutBelirtec: string | null,
): Promise<{ cihaz: OrtakCihaz; belirtec: string }> {
  if (mevcutBelirtec && (await acikOrtakCihazBul(db, anahtarOzeti(mevcutBelirtec))) !== null) {
    throw cakisma('Bu cihaz zaten kayıtlı.');
  }
  if (await acikOrtakCihazAdiVar(db, ad)) throw cakisma('Bu adla kayıtlı bir cihaz var.');
  if (profil !== undefined) profilYonetimiDenetle(kullanici);
  const belirtec = randomBytes(32).toString('base64url');
  const ozet = anahtarOzeti(belirtec);
  const id = await ortakCihazEkle(db, ozet, ad, kullanici.id);
  if (id === null) throw new Error('Ortak cihaz yazılamadı.');
  if (profilYonetebilirMi(kullanici) && !(await profilAtamasiYaz(db, id, profil ?? 'istasyon', null, kullanici.id))) {
    throw new Error('Yeni cihazın profili yazılamadı.');
  }
  const satir = await acikOrtakCihazBulId(db, id);
  if (satir === null) throw new Error('Ortak cihaz okunamadı.');
  return { cihaz: ortakCihaz(satir, ozet), belirtec };
}

export async function ortakCihazlar(db: Db, belirtec: string | null): Promise<OrtakCihaz[]> {
  const buOzet = belirtec ? anahtarOzeti(belirtec) : null;
  return (await acikOrtakCihazlar(db)).map((s) => ortakCihaz(s, buOzet));
}

// İptal edilen cihaz bir sonraki bağlantıda kayıtsız sayılır ve yerel verisini siler. Dönen değer: iptal edilen bu cihaz mıydı.
export async function ortakCihaziKapat(db: Db, id: number, kapatanKisiId: number, belirtec: string | null): Promise<boolean> {
  const ozet = await ortakCihazKapat(db, id, kapatanKisiId);
  if (ozet === null) throw bulunamadi('Açık ortak cihaz bulunamadı.');
  return belirtec !== null && anahtarOzeti(belirtec) === ozet;
}

export async function profilAta(
  db: Db, kullanici: Kullanici, cihazId: number, girdi: { profil: CihazProfili; surum: number | null }, belirtec: string | null,
): Promise<OrtakCihaz> {
  profilYonetimiDenetle(kullanici);
  if ((await acikOrtakCihazBulId(db, cihazId)) === null) throw bulunamadi('Açık ortak cihaz bulunamadı.');
  if (!(await profilAtamasiYaz(db, cihazId, girdi.profil, girdi.surum, kullanici.id))) {
    throw cakisma('Cihazın profili bu arada değişmiş. Listeyi yenileyip yeniden deneyin.');
  }
  const satir = await acikOrtakCihazBulId(db, cihazId);
  if (satir === null) throw bulunamadi('Açık ortak cihaz bulunamadı.');
  return ortakCihaz(satir, belirtec ? anahtarOzeti(belirtec) : null);
}

export async function profilListesi(db: Db): Promise<CihazProfilleriCevabi> {
  return { profiller: await cihazProfilleri(db), ayar: await cihazAyari(db) };
}

export async function profilSayfalariniYaz(
  db: Db, kullanici: Kullanici, kod: 'istasyon' | 'telefon', girdi: { sayfalar: readonly string[]; surum: number },
): Promise<CihazProfiliSatiri> {
  profilYonetimiDenetle(kullanici);
  const hata = profilSayfalariHatasi(girdi.sayfalar);
  if (hata !== null) throw dogrulama(hata, 'sayfalar');
  const satir = await profilSayfalariYaz(db, kod, girdi.sayfalar, girdi.surum, kullanici.id);
  if (satir === null) throw cakisma('Profil bu arada değişmiş. Sayfayı yenileyip yeniden deneyin.');
  return satir;
}

export async function kayitsizProfiliYaz(
  db: Db, kullanici: Kullanici, girdi: { kayitsizProfil: CihazProfili; surum: number },
): Promise<{ kayitsizProfil: CihazProfili; surum: number }> {
  profilYonetimiDenetle(kullanici);
  const satir = await cihazAyariYaz(db, girdi.kayitsizProfil, girdi.surum, kullanici.id);
  if (satir === null) throw cakisma('Ayar bu arada değişmiş. Sayfayı yenileyip yeniden deneyin.');
  return satir;
}

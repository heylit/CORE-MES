import { randomBytes, randomInt } from 'node:crypto';
import { cerezOku } from '#cekirdek/cerez.ts';
import { vtUlasilamadi } from '#cekirdek/db.ts';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { UygulamaHatasi, bulunamadi, cakisma, cokIstek, gecersiz, oturumYok, veritabaniYok } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kimlik } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { CihazDurumu, HesapKilidi, OrtakCihaz } from '#paylasilan/sozlesme/oturum.ts';
import {
  girisDogrula, ilkPiniYaz, kendiParolasiniDegistir as parolayiDegistir, kendiPininiDegistir as piniDegistir, kisiKullaniciAdi, kullaniciAdiniDuzelt, kullaniciYukle,
  yeniPinHatasi,
} from '../kisiler/disari.ts';
import type { GirisSirri } from '../kisiler/disari.ts';
import { disIzleyiciKisiMi } from '../portal/disari.ts';
import {
  AZAMI_SN, BOSTA_SN, CEREZ_ADI, CIHAZ_PENCERESI_DK, CIHAZ_SAKLAMA_GUN, CIHAZ_SINIRI, DENEME_SAKLAMA_GUN, GORULME_ARALIGI_SN, HESAP_KILIDI_DK,
  SAAT_BELIRTECI_SN, SAAT_ISTEGI_GENEL_SINIR, SAAT_ISTEGI_IP_SINIRI, SAAT_ISTEGI_SN, SAAT_SORU_ARALIGI_SN, anahtarOzeti, belirtecOku, hesapKilitlenirMi, kalanBeklemeSn, kilitKalanDk,
  saatBelirteciGecerMi, saatKoduUret, saatOnayAdi, saatSoruAdi, tarayiciMetni,
} from './kurallar.ts';
import {
  cihazHataliBul, denemeEkle, denemeKilidiAl, eskiDenemeleriSil, eskiOturumCihaziniBosalt, etkinKilitSay, etkinKilitler, gecerliOturumBul, gorulduYaz, hataliSeriBul,
  hesapKilidiAc, hesapKilidiEkle, hesapKilidiKalanSn, hesapSerisiSay, kisiOturumlariniKapat, oturumEkle, oturumKapat,
  gecerliSaatBelirteciBul, kisiSaatBelirtecleriniKapat, saatBelirteciEkle, saatBelirteciKapat, saatBelirtecleri, saatIstegiAl, saatIstegiEkle,
  saatIstegiOnayla, saatIstekleriniTemizleSay, acikOrtakCihazAdiVar, acikOrtakCihazBul, acikOrtakCihazlar, ortakCihazEkle, ortakCihazKapat,
} from './sorgular.ts';
import type { OrtakCihazSatiri, SaatBelirteciSatiri, Simdi } from './sorgular.ts';

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
    throw oturumYok(`Çok sayıda hatalı deneme. Giriş ${kilitKalanDk(kilitKalanSn)} dk sonra yeniden denenebilir.`);
  }
  const cihaz = await cihazHataliBul(db, ip, CIHAZ_PENCERESI_DK, CIHAZ_SINIRI, simdi);
  if (cihaz.sayi >= CIHAZ_SINIRI && cihaz.kalanSn !== null && cihaz.kalanSn > 0) {
    throw oturumYok(`Bu cihazdan çok sayıda hatalı deneme. Giriş ${kilitKalanDk(cihaz.kalanSn)} dk sonra yeniden denenebilir.`);
  }
  // Bekleme dolmadan gelen deneme parolaya bakılmadan reddedilir, kaydedilmez ve sayılmaz: sabırsız
  // kullanıcı kendi beklemesini uzatmaz.
  const seri = await hataliSeriBul(db, ad, ip, simdi);
  const kalanSn = kalanBeklemeSn(seri.sayi, seri.gecen_sn);
  if (kalanSn > 0) throw oturumYok(`Çok sık deneme. ${kalanSn} sn sonra yeniden deneyin.`);

  // Deneme temizliği zamanlanmış iş değildir; parolaya bakılan her denemede koşar.
  await eskiDenemeleriSil(db, DENEME_SAKLAMA_GUN, simdi);
}

// 398 a: girişte değil zamanlanmış işte koşar. Giriş oturum tablosuna yalnız kendi satırını yazar; başka oturumlara dokunan
// güncelleme girişin kilit sırasını bozar (kişi satırından önce oturum tablosunu kilitlerdi).
export async function eskiOturumCihaziniTemizle(db: Db): Promise<void> {
  await eskiOturumCihaziniBosalt(db, CIHAZ_SAKLAMA_GUN, { bostaSn: BOSTA_SN, azamiSn: AZAMI_SN }, null);
}

// Ada bütün cihazlardan gelen seri eşiğe varınca ad kilitlenir. Yöneticiye bildirim yolu yok (UYUM-BORCU): kilit tabloda
// ve sunucu günlüğünde görünür, liste ucundan okunur.
export async function basarisizDenemeKaydet(db: Db, ad: string, ip: string, simdi: Simdi = null, gunluk?: Gunluk): Promise<void> {
  await denemeEkle(db, ad, 'hatali', ip, simdi);
  if (!hesapKilitlenirMi(await hesapSerisiSay(db, ad))) return;
  if (await hesapKilidiEkle(db, ad, HESAP_KILIDI_DK, simdi)) {
    gunluk?.uyar(`Hesap kilitlendi: ${JSON.stringify(ad)} art arda hatalı denemeden sonra ${HESAP_KILIDI_DK} dk kilitli.`);
  }
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

// Oturumun kişisi: yetkisi kişilerden, dış izleyici işareti (1224 a) portalın firma atamasından her istekte okunur; işaret
// kopyalanmadığı için atama değişince bir sonraki istekte geçerlidir. Yalnız işaretli kişide alan vardır.
async function kimlikYukle(db: Db, kisiId: number, oturumAcildi: string | null = null): Promise<Kullanici | null> {
  const kullanici = await kullaniciYukle(db, kisiId, oturumAcildi);
  if (kullanici === null || !(await disIzleyiciKisiMi(db, kullanici.id))) return kullanici;
  return { ...kullanici, disIzleyici: true };
}

export async function anahtardanKullanici(db: Db, anahtar: string): Promise<Kullanici | null> {
  const oturum = await gecerliOturumBul(db, anahtarOzeti(anahtar), {
    bostaSn: BOSTA_SN, azamiSn: AZAMI_SN, gorulmeAraligiSn: GORULME_ARALIGI_SN,
  });
  if (oturum === null) return null;
  if (oturum.bayat) await gorulduYaz(db, oturum.id);
  // Kişi bu oturumdan sonra pasife alınmış ya da parolası başkasınca değişmişse oturum geçersizdir.
  return kimlikYukle(db, oturum.kisi_id, oturum.acildi_metin);
}

// Çerez önce gelir: tarayıcı belirteç göndermez, saat çerez göndermez. Belirteç yalnız saat uçlarında çözülür (saatBelirteciGecerMi); başka uçta
// kimlik yoktur ve uç kendi kuralıyla 401 verir.
export function kimlikCozucu(vt: Veritabani): Kimlik {
  return async (istek) => {
    const anahtar = cerezOku(istek.headers.cookie, CEREZ_ADI);
    if (anahtar) return anahtardanKullanici(vt, anahtar);
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
): Promise<Kullanici | null> {
  if (cozulen !== null || !cerez) return cozulen;
  try {
    return await anahtardanKullanici(db, cerez);
  } catch (hata) {
    if (vtUlasilamadi(hata)) throw veritabaniYok();
    throw hata;
  }
}

/* ---------------- ortak cihaz (kart #739, karar 738 a) ---------------- */

const ortakCihaz = ({ ozet, ...satir }: OrtakCihazSatiri, buOzet: string | null): OrtakCihaz => ({ ...satir, buCihaz: ozet === buOzet });

// Cihazın çerezi yoksa, bilinmiyorsa ya da cihaz iptal edildiyse cihaz kişiseldir; çağıran bayat çerezi siler.
export async function cihazDurumu(db: Db, belirtec: string | null): Promise<CihazDurumu & { bayatCerez: boolean }> {
  const satir = belirtec ? await acikOrtakCihazBul(db, anahtarOzeti(belirtec)) : null;
  if (satir === null) return { ortak: false, id: null, ad: null, bayatCerez: belirtec !== null };
  return { ortak: true, id: satir.id, ad: satir.ad, bayatCerez: false };
}

// Yönetici kaydı ortak yapılacak cihazın kendisinden yapar: belirteç bu cihazın çerezine yazılır. Zaten ortak olan cihaz yeniden kaydedilmez.
export async function ortakCihazKaydet(db: Db, kisiId: number, ad: string, mevcutBelirtec: string | null): Promise<{ cihaz: OrtakCihaz; belirtec: string }> {
  if (mevcutBelirtec && (await acikOrtakCihazBul(db, anahtarOzeti(mevcutBelirtec))) !== null) {
    throw cakisma('Bu cihaz zaten ortak cihaz olarak kayıtlı.');
  }
  if (await acikOrtakCihazAdiVar(db, ad)) throw cakisma('Bu adla kayıtlı bir ortak cihaz var.');
  const belirtec = randomBytes(32).toString('base64url');
  const ozet = anahtarOzeti(belirtec);
  const satir = await ortakCihazEkle(db, ozet, ad, kisiId);
  if (satir === null) throw new Error('Ortak cihaz yazılamadı.');
  return { cihaz: ortakCihaz(satir, ozet), belirtec };
}

export async function ortakCihazlar(db: Db, belirtec: string | null): Promise<OrtakCihaz[]> {
  const buOzet = belirtec ? anahtarOzeti(belirtec) : null;
  return (await acikOrtakCihazlar(db)).map((s) => ortakCihaz(s, buOzet));
}

// İptal edilen cihaz bir sonraki bağlantıda kişisel sayılır ve yerel verisini siler. Dönen değer: iptal edilen bu cihaz mıydı.
export async function ortakCihaziKapat(db: Db, id: number, kapatanKisiId: number, belirtec: string | null): Promise<boolean> {
  const ozet = await ortakCihazKapat(db, id, kapatanKisiId);
  if (ozet === null) throw bulunamadi('Açık ortak cihaz bulunamadı.');
  return belirtec !== null && anahtarOzeti(belirtec) === ozet;
}

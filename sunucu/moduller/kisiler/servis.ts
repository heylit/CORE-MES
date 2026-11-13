import { randomBytes, randomInt } from 'node:crypto';
import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { UygulamaHatasi, bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { satirdaReddet } from '#cekirdek/toplu.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER, islemMi } from '#paylasilan/islemler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { aramaSade, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { KISI_SECIM_SAYFA_BOYU } from '#paylasilan/sozlesme/kisiler.ts';
import type { EksikBilgiOzetiCevabi, KisiEkIslemleriCevabi, KisiTopluKaydetCevabi, KisiTopluKaydetGirdisi, KisiOzeti, KisiSecimCevabi, RolIslemleriCevabi, RolOzeti } from '#paylasilan/sozlesme/kisiler.ts';
import {
  DEVREDILMEZ_ISLEMLER, ILETILER, korumaliMi, almaReddi, atamaReddi, ekIslemReddi, kisitReddi, bayrakliKisiReddi, hesapAcmaReddi, islemDegistirmeReddi, islemleriBirlestir, kisiAlanlariniDuzelt, kullaniciAdiHatasi, kullaniciAdiniDuzelt,
  girisYontemi, oturumKapatmaReddi, parolaBaskasiReddi, parolaHatasi, pasifeAlmaReddi, pinHatasi, pinVermeReddi,
  cikisliAktiflikReddi, cikisPasifiReddi, icHesapReddi, sinirliHesapReddi, sinirliRolReddi, ozlukDuzenlemeReddi, ozlukItmeReddi, bosKullaniciAdi, ikRolVerebilirMi, kullaniciAdiKoku, rastgelePin,
} from './kurallar.ts';
import type { KisiAlanlari, Ret } from './kurallar.ts';
import { parolaDogrula, parolaOzetle, yenidenOzetlenmeli } from './parola.ts';
import {
  aktifYaz, bayrakliKalanSayisi, bayrakliRolleriKilitle, bayrakliSayisiHaric, girisKaydiBul, hesapYaz, kisiBayrakliMi, sirOzetiniYenile,
  kisiEkIslemSatirlari, kisiGuncelle, kisiIslemiEkle, kisiIslemiSil, kisiKisitiEkle, kisiKisitiSil, kisininRolundeIslemVarMi, kisiKullaniciMi, kisiSatirlari, kisiVarMi, kisiYaz, girisBilgisiBul, oturumlariGecersizKil, parolaYaz, pinBilgisiBul, pinYaz, rolBul, rolEkle, rolIslemiEkle, rolIslemiSil, rolKuraliniHemenDenetle,
  eksikBilgiSayilari, cikisiGelenKisiler, gizlilikTaahhuduYaz, icHesapYaz, sinirliSorumluUygunMu, sinirliYaz, ozlukBaginiSil, ozlukYaz, rolIslemSatirlari, rolSatirlari, rolSil, rolVarMi, surumuIlerlet, yetkiKaydiBul, yoneticiEkle,
} from './sorgular.ts';
import type { KisiSatiri, RolSatiri } from './sorgular.ts';
import { ikRolSatirlari, kisiSecimAra as kisiSecimSatirlari, kokluKullaniciAdlari } from './sorgular.ts';

const SON_ROL_KISITI = 'kisi_giris_rol_ister';

// Kullanıcı bulunmasa da aynı maliyette bir doğrulama koşar: cevap süresi kullanıcı adının varlığını ele vermez.
let sahteOzet: Promise<string> | undefined;

export type GirisSirri = { parola: string } | { pin: string };

// pinBelirlenecek: doğru PIN yöneticinin verdiği geçici PIN'dir; oturum açılmaz, kişi önce kendi PIN'ini belirler.
export interface GirisSonucu {
  kisiId: number;
  pinBelirlenecek: boolean;
}

// Kişinin yöntemi dışındaki sır (PIN'i olanın parolası, yöneticinin PIN'i) aynı maliyetle reddedilir: cevap hangi
// yöntemin geçerli olduğunu ele vermez.
export async function girisDogrula(db: Db, kullaniciAdi: string, sir: GirisSirri): Promise<GirisSonucu | null> {
  const verilen = 'pin' in sir ? 'pin' : 'parola';
  const deger = 'pin' in sir ? sir.pin : sir.parola;
  const kayit = await girisKaydiBul(db, kullaniciAdiniDuzelt(kullaniciAdi));
  const yontem = kayit === null ? null : girisYontemi({ bayrakli: kayit.bayrakli, pinVar: kayit.pin_ozeti !== null });
  if (kayit === null || yontem !== verilen) {
    sahteOzet ??= parolaOzetle('kullanici-yok');
    await parolaDogrula(deger, await sahteOzet);
    return null;
  }
  const ozet = yontem === 'pin' ? kayit.pin_ozeti : kayit.parola_ozeti;
  if (ozet === null || !(await parolaDogrula(deger, ozet))) return null;
  if (yenidenOzetlenmeli(ozet)) await sirOzetiniYenile(db, kayit.id, yontem, ozet, await parolaOzetle(deger));
  return { kisiId: kayit.id, pinBelirlenecek: yontem === 'pin' && kayit.pin_belirlenecek };
}

// Kartla giriş (1897 b): istasyonda kart PIN'siz geçer. Yalnız PIN'le giren (bayraksız, PIN'i olan) etkin hesap uygundur; parolayla
// giren yönetici kartla giremez. Kişi henüz geçici PIN'deyse önce kendi PIN'ini belirler. Sır doğrulanmaz: kartın sahibi çağıranın işidir.
export async function kartGirisDurumu(db: Db, kullaniciAdi: string): Promise<'uygun' | 'pin-belirlenecek' | null> {
  const kayit = await girisKaydiBul(db, kullaniciAdiniDuzelt(kullaniciAdi));
  if (kayit === null || girisYontemi({ bayrakli: kayit.bayrakli, pinVar: kayit.pin_ozeti !== null }) !== 'pin') return null;
  return kayit.pin_belirlenecek ? 'pin-belirlenecek' : 'uygun';
}

// oturumAcildi: oturumun açılış zamanı (veritabanının verdiği metin). Kişinin "bundan önceki oturumlar geçersiz"
// zamanından eskiyse kullanıcı yüklenmez.
export async function kullaniciYukle(db: Db, kisiId: number, oturumAcildi: string | null = null): Promise<Kullanici | null> {
  const kayit = await yetkiKaydiBul(db, kisiId, oturumAcildi);
  if (kayit === null) return null;
  return {
    id: kayit.id, ad: kayit.ad, islemler: islemleriBirlestir(kayit.butun_islemler, kayit.islemler), acilisSayfasi: kayit.acilis_sayfasi,
    roller: kayit.roller,
    ...(kayit.sinirli_bitis === null ? {} : { sinirli: { bitis: kayit.sinirli_bitis, taahhut: kayit.taahhut } }),
  };
}

// "Bütün işlemler" bayrağı hangi rolün tam yetkili olduğunu söyler; yalnız rol yönetenlere gösterilir, ötekilere null. Kullanıcı adı
// da yalnız onlara gider: hesabı onlar açar, adı kişiye onlar söyler; listeyi gören herkese giriş adlarının dökümü verilmez.
function rolOzeti(rol: RolSatiri, bayrakGorur: boolean): RolOzeti {
  return { id: rol.id, ad: rol.ad, yonetici: bayrakGorur ? rol.yonetici : null };
}

function kisiOzeti(satir: KisiSatiri, bayrakGorur = true, aktorBayrakli = true): KisiOzeti {
  return {
    id: satir.id,
    ad: satir.ad,
    aktif: satir.aktif,
    girisVar: satir.giris_var,
    kullaniciAdi: bayrakGorur ? satir.kullanici_adi : null,
    pinVar: satir.pin_var,
    sicilNo: satir.sicil_no,
    gorev: satir.gorev,
    roller: satir.roller.map((r) => rolOzeti(r, bayrakGorur)),
    surum: satir.surum,
    ozlukIk: satir.ozluk_ik,
    ozlukCikisTarihi: satir.ozluk_cikis_tarihi,
    korumali: korumaliMi({ hedefBayrakli: satir.roller.some((r) => r.yonetici), aktorBayrakli }),
    sinirli: satir.sinirli_bitis === null || satir.sinirli_sorumlu_id === null
      ? null
      : { bitis: satir.sinirli_bitis, sorumluId: satir.sinirli_sorumlu_id, taahhut: satir.taahhut },
  };
}

export async function kisileriGetir(db: Db, bayrakGorur: boolean, aktorId: number): Promise<KisiOzeti[]> {
  const aktorBayrakli = await kisiBayrakliMi(db, aktorId);
  return (await kisiSatirlari(db)).map((s) => kisiOzeti(s, bayrakGorur, aktorBayrakli));
}

export function eksikBilgiOzeti(db: Db): Promise<EksikBilgiOzetiCevabi> {
  return eksikBilgiSayilari(db);
}

export async function kisileriListele(db: Db): Promise<{ id: number; ad: string; aktif: boolean }[]> {
  return (await kisiSatirlari(db)).map(({ id, ad, aktif }) => ({ id, ad, aktif }));
}

export async function rolleriGetir(db: Db, bayrakGorur: boolean): Promise<RolOzeti[]> {
  return (await rolSatirlari(db)).map((r) => rolOzeti(r, bayrakGorur));
}

// Rol başına girişte verilenle aynı işlem kümesi (islemleriBirlestir): bayraklı rol bütün kayıtlı işlemleri, kayıtsız satır hiçbir şeyi vermez.
export async function rolIslemleriGetir(db: Db, bayrakGorur: boolean): Promise<RolIslemleriCevabi> {
  const roller = (await rolIslemSatirlari(db)).map((r) => ({ ...rolOzeti(r, bayrakGorur), islemler: islemleriBirlestir(r.yonetici, r.islemler) }));
  return { islemler: [...ISLEMLER], roller };
}

export async function rolIslemiDegistir(
  db: Db, aktorId: number, rolId: number, islem: string, verildi: boolean,
): Promise<RolIslemleriCevabi> {
  const rol = await rolBul(db, rolId);
  if (rol === null) throw bulunamadi(ILETILER.rolBulunamadi);
  const ret = islemDegistirmeReddi({ aktorBayrakli: await kisiBayrakliMi(db, aktorId), rolBayrakli: rol.yonetici, islemKayitli: islemMi(islem) });
  if (ret !== null) reddet(ret);
  if (verildi) await rolIslemiEkle(db, rolId, islem);
  else await rolIslemiSil(db, rolId, islem);
  return rolIslemleriGetir(db, true);
}

// Kişi başına rolden gelen, ek verilen ve kişiden alınan işlemler (kart #1233, 3166); bayraklı kişinin rolden geleni bütün kayıtlı işlemlerdir.
export async function kisiEkIslemleriGetir(db: Db): Promise<KisiEkIslemleriCevabi> {
  const kisiler = (await kisiEkIslemSatirlari(db)).map((k) => ({
    id: k.id, ad: k.ad, kullaniciAdi: k.kullanici_adi, bayrakli: k.bayrakli,
    roldenGelen: islemleriBirlestir(k.bayrakli, k.rol_islemleri),
    // Kayıttan kalkmış işlem yetki vermez; listede de görünmez.
    ek: k.ek_islemler.filter((i): i is string => typeof i === 'string' && islemMi(i)),
    alinan: k.alinan_islemler.filter((i): i is string => typeof i === 'string' && islemMi(i)),
  }));
  return { islemler: [...ISLEMLER], devredilmez: [...DEVREDILMEZ_ISLEMLER], kisiler };
}

export async function kisiEkIslemiDegistir(
  db: Db, aktorId: number, kisiId: number, islem: string, verildi: boolean,
): Promise<KisiEkIslemleriCevabi> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(ILETILER.kisiYok);
  const ret = ekIslemReddi({
    aktorBayrakli: await kisiBayrakliMi(db, aktorId), kisiBayrakli: await kisiBayrakliMi(db, kisiId), kisiKullanici: await kisiKullaniciMi(db, kisiId),
    islemKayitli: islemMi(islem),
    devredilmez: (DEVREDILMEZ_ISLEMLER as readonly string[]).includes(islem), verildi,
  });
  if (ret !== null) reddet(ret);
  if (verildi) {
    // Ek vermek açık bir "bu kişi yapabilsin" kararıdır; eski kısıt kalırsa verilen yetki görünmeden etkisiz olurdu.
    await kisiKisitiSil(db, kisiId, islem);
    await kisiIslemiEkle(db, kisiId, islem, aktorId);
  } else await kisiIslemiSil(db, kisiId, islem);
  return kisiEkIslemleriGetir(db);
}

// KS-11 (kart 3166): alindi true ise rolden gelen işlem bu kişiden alınır, false ise kısıt kalkar ve rol yetkisi geri gelir.
export async function kisiIslemKisitiDegistir(
  db: Db, aktorId: number, kisiId: number, islem: string, alindi: boolean,
): Promise<KisiEkIslemleriCevabi> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(ILETILER.kisiYok);
  const ret = kisitReddi({
    aktorBayrakli: await kisiBayrakliMi(db, aktorId), kisiBayrakli: await kisiBayrakliMi(db, kisiId), kisiKullanici: await kisiKullaniciMi(db, kisiId),
    islemKayitli: islemMi(islem),
    devredilmez: (DEVREDILMEZ_ISLEMLER as readonly string[]).includes(islem),
    roldeVar: await kisininRolundeIslemVarMi(db, kisiId, islem), alindi,
  });
  if (ret !== null) reddet(ret);
  if (alindi) await kisiKisitiEkle(db, kisiId, islem, aktorId);
  else await kisiKisitiSil(db, kisiId, islem);
  return kisiEkIslemleriGetir(db);
}

export { kisiBayrakliMi, kisiVarMi };

// Komutun ilk adımı: kişi satırı kilitlenir ve sürüm artar; kayıt yoksa 404, beklenen sürüm eskiyse 409. Kilit hep
// kişiden rol satırlarına doğru alınır (pasife alma ve bayraklı rol alma da bu sırayla): ters sıra kilitlenmeye yol açar.
// beklenen null: sürüm sormadan artırır (kendi parolası, testlerin kurulumu); kayıt yine eskir, açık formlar 409 alır.
async function surumDenetle(db: Db, kisiId: number, beklenen: number | null): Promise<void> {
  await surumluGuncelle({
    guncelle: async () => ((await surumuIlerlet(db, kisiId, beklenen)) ? true : null),
    varMi: () => kisiVarMi(db, kisiId),
    bulunamadiIletisi: ILETILER.kisiYok,
  });
}

function reddet(ret: Ret): never {
  throw ret.tur === 'yetki' ? yetkiYok(ret.ileti) : gecersiz(ret.ileti);
}

async function kisiVeRol(db: Db, kisiId: number, rolId: number): Promise<RolSatiri> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(ILETILER.kisiYok);
  const rol = await rolBul(db, rolId);
  if (rol === null) throw bulunamadi(ILETILER.rolBulunamadi);
  return rol;
}

export async function rolAta(db: Db, aktorId: number, kisiId: number, rolId: number, beklenen: number | null = null): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const rol = await kisiVeRol(db, kisiId, rolId);
  const ret = atamaReddi({ rolBayrakli: rol.yonetici, aktorBayrakli: await kisiBayrakliMi(db, aktorId), kendiKendine: aktorId === kisiId })
    ?? sinirliRolReddi({ rolBayrakli: rol.yonetici, hedefSinirli: await hedefSinirliMi(db, kisiId) });
  if (ret !== null) reddet(ret);
  if (!(await rolEkle(db, kisiId, rolId))) throw cakisma(ILETILER.zatenVar);
  return kisiyiGetir(db, kisiId);
}

export async function rolAl(db: Db, aktorId: number, kisiId: number, rolId: number, beklenen: number | null = null): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const rol = await kisiVeRol(db, kisiId, rolId);
  if (!(await rolVarMi(db, kisiId, rolId))) throw bulunamadi(ILETILER.rolYok);
  // Kilit, kuralı besleyen okumalardan önce alınır: bekleyen komut öncekinin sonucunu görerek karar verir.
  if (rol.yonetici) await bayrakliRolleriKilitle(db);
  const ret = almaReddi({
    rolBayrakli: rol.yonetici,
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
    kendiKendine: aktorId === kisiId,
    kalanBayrakli: rol.yonetici ? await bayrakliKalanSayisi(db, kisiId, rolId) : 0,
  });
  if (ret !== null) reddet(ret);
  // Kilit beklerken başkası bağı silmiş olabilir; silinen satır yoksa bağ yoktur.
  if (!(await rolSil(db, kisiId, rolId))) throw bulunamadi(ILETILER.rolYok);
  try {
    await rolKuraliniHemenDenetle(db);
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === SON_ROL_KISITI) throw gecersiz(ILETILER.sonRol);
    throw hata;
  }
  return kisiyiGetir(db, kisiId);
}

async function hedefSinirliMi(db: Db, kisiId: number): Promise<boolean> {
  const [satir] = await kisiSatirlari(db, kisiId);
  return satir?.sinirli_bitis != null;
}

// Sınırlı hesap (kart 2158, 2158-1 a, 2158-5 a): kişi yalnız okur, bitişten sonra giremez. Aynı komut bitişi uzatır ve sorumluyu
// değiştirir. Yetki rol yönetimidir (kisiler.rol-yonet): hesabın türü yetki kararıdır.
export async function sinirliHesapYap(
  db: Db, aktorId: number, kisiId: number, girdi: { bitis: string; sorumluId: number }, beklenen: number | null,
): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = sinirliHesapReddi({
    kendiKendine: aktorId === kisiId,
    hedefBayrakli: hedef.roller.some((r) => r.yonetici),
    sorumluKendisi: girdi.sorumluId === kisiId,
    sorumluUygun: await sinirliSorumluUygunMu(db, girdi.sorumluId),
    bitis: girdi.bitis,
    bugun: tesisGunu(new Date()),
  });
  if (ret !== null) reddet(ret);
  await sinirliYaz(db, kisiId, girdi.bitis, girdi.sorumluId);
  return kisiyiGetir(db, kisiId);
}

export async function icHesapYap(db: Db, aktorId: number, kisiId: number, beklenen: number | null): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = icHesapReddi({ kendiKendine: aktorId === kisiId, hedefSinirli: hedef.sinirli_bitis !== null });
  if (ret !== null) reddet(ret);
  await icHesapYaz(db, kisiId);
  return kisiyiGetir(db, kisiId);
}

// Kişinin kendi onayı (2158-5 a): yalnız geçerli sınırlı hesapta; ilk onay zamanı kalır. Sürüm artar: açık Personel formu eskir.
export async function gizlilikTaahhuduVer(db: Db, kisiId: number): Promise<void> {
  await surumDenetle(db, kisiId, null);
  if (!(await gizlilikTaahhuduYaz(db, kisiId))) throw gecersiz(ILETILER.taahhutSinirliDegil);
}

// Yazma komutunun döndürdüğü satır: bayraklı kişide komut yalnız bayraklı aktörle geçer, satır okuyana korumalı değildir.
async function kisiyiGetir(db: Db, kisiId: number, bayrakGorur = true): Promise<KisiOzeti> {
  const [satir] = await kisiSatirlari(db, kisiId);
  if (satir === undefined) throw bulunamadi(ILETILER.kisiYok);
  return kisiOzeti(satir, bayrakGorur);
}

export async function yoneticiOlustur(db: Db, girdi: { ad: string; kullaniciAdi: string; parola: string }): Promise<number> {
  const ad = girdi.ad.trim();
  const kullaniciAdi = kullaniciAdiniDuzelt(girdi.kullaniciAdi);
  if (ad === '') throw dogrulama('Ad boş olamaz.', 'ad');
  const adHatasi = kullaniciAdiHatasi(kullaniciAdi);
  if (adHatasi !== null) throw dogrulama(adHatasi, 'kullaniciAdi');
  const parolaSorunu = parolaHatasi(girdi.parola);
  if (parolaSorunu !== null) throw dogrulama(parolaSorunu, 'parola');
  const parolaOzeti = await parolaOzetle(girdi.parola);
  try {
    return await yoneticiEkle(db, { ad, kullaniciAdi, parolaOzeti });
  } catch (hata) {
    // Benzersizliği kısıt tutar: önce bakıp sonra eklemek eşzamanlı iki çağrıyı ayıramaz.
    // Bu eklemede çakışabilecek tek değer kullanıcı adıdır.
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(ILETILER.kullaniciAdiVar);
    throw hata;
  }
}

const SICIL_KISITI = 'kisi_sicil_no_tek';

function alanlar(girdi: { ad: string; sicilNo?: string | null; gorev?: string | null }): KisiAlanlari {
  const sonuc = kisiAlanlariniDuzelt(girdi);
  if ('alan' in sonuc) throw dogrulama(sonuc.ileti, sonuc.alan);
  return sonuc.tamam;
}

// Benzersizliği kısıt tutar; önce bakıp sonra yazmak eşzamanlı iki komutu ayıramaz.
function sicilCakismasiniCevir(hata: unknown): never {
  if (kisitIhlali(hata)?.iz.kisit === SICIL_KISITI) throw cakisma(ILETILER.sicilVar);
  throw hata;
}

export async function kisiEkle(db: Db, girdi: { ad: string; sicilNo?: string | null; gorev?: string | null }): Promise<number> {
  const kayit = alanlar(girdi);
  try {
    return await kisiYaz(db, kayit);
  } catch (hata) {
    return sicilCakismasiniCevir(hata);
  }
}

export async function kisiEkleGetir(
  db: Db, girdi: { ad: string; sicilNo?: string | null; gorev?: string | null }, bayrakGorur: boolean,
): Promise<KisiOzeti> {
  return kisiyiGetir(db, await kisiEkle(db, girdi), bayrakGorur);
}

// Bayraklı kişinin kaydını yalnız bayraklı aktör düzenler; bayraklı kişi kendi kaydını da düzenleyebilir.
export async function kisiDuzenle(
  db: Db,
  aktorId: number,
  kisiId: number,
  girdi: { ad: string; sicilNo?: string | null; gorev?: string | null },
  bayrakGorur: boolean,
  beklenen: number | null = null,
): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = bayrakliKisiReddi({
    hedefBayrakli: hedef.roller.some((r) => r.yonetici),
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
  }, ILETILER.bayrakliKaydiYetkisiz);
  if (ret !== null) reddet(ret);
  const kayit = alanlar(girdi);
  const ozluk = ozlukDuzenlemeReddi({ ozlukIk: hedef.ozluk_ik, ad: hedef.ad, sicilNo: hedef.sicil_no, gorev: hedef.gorev }, kayit);
  if (ozluk !== null) reddet(ozluk);
  try {
    if (!(await kisiGuncelle(db, kisiId, kayit))) throw bulunamadi(ILETILER.kisiYok);
  } catch (hata) {
    if (hata instanceof UygulamaHatasi) throw hata;
    return sicilCakismasiniCevir(hata);
  }
  return kisiyiGetir(db, kisiId, bayrakGorur);
}

// Excel ile toplu giriş (2627, 1/2 b): her satır tek kişi ekleme ve düzenleme işleviyle, aynı kuralla (sicil tekliği, özlük, bayraklı
// kişi) yazılır. Uç tek transaction'dır; bir satır reddedilirse hiçbiri kalmaz ve ret satır numarasını taşır. Güncellemede gönderilmeyen
// alan kaydın güncel değerini korur. Eşleştirme istemcide sicil no ile yapılır; buraya kimlik ve okunan sürüm gelir.
export async function kisiTopluKaydet(db: Db, aktorId: number, g: KisiTopluKaydetGirdisi, bayrakGorur: boolean): Promise<KisiTopluKaydetCevabi> {
  let eklenen = 0;
  let guncellenen = 0;
  for (const [sira, s] of g.satirlar.entries()) {
    await satirdaReddet(sira, s.satir, async () => {
      if (s.islem === 'ekle') {
        await kisiEkle(db, { ad: s.ad, sicilNo: s.sicilNo ?? null, gorev: s.gorev ?? null });
        eklenen += 1;
        return;
      }
      const [mevcut] = await kisiSatirlari(db, s.id);
      if (mevcut === undefined) throw bulunamadi(ILETILER.kisiYok);
      await kisiDuzenle(db, aktorId, s.id, {
        ad: s.ad ?? mevcut.ad, sicilNo: s.sicilNo ?? mevcut.sicil_no, gorev: s.gorev ?? mevcut.gorev,
      }, bayrakGorur, s.surum);
      guncellenen += 1;
    });
  }
  return { eklenen, guncellenen };
}

export async function kisiPasifeAl(
  db: Db, aktorId: number, kisiId: number, bayrakGorur = true, beklenen: number | null = null,
): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  // Kilit, kuralı besleyen okumalardan önce alınır: iki yönetici birbirini aynı anda pasife alıp sistemi yöneticisiz bırakamaz.
  await bayrakliRolleriKilitle(db);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  if (!hedef.aktif) throw cakisma(ILETILER.zatenPasif);
  const hedefBayrakli = hedef.roller.some((r) => r.yonetici);
  const ret = pasifeAlmaReddi({
    kendiKendine: aktorId === kisiId,
    hedefBayrakli,
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
    hedefSayiliyor: hedefBayrakli && hedef.giris_var,
    kalanBayrakli: await bayrakliSayisiHaric(db, kisiId),
  });
  if (ret !== null) reddet(ret);
  if (!(await aktifYaz(db, kisiId, false))) throw cakisma(ILETILER.zatenPasif);
  await oturumlariGecersizKil(db, kisiId);
  return kisiyiGetir(db, kisiId, bayrakGorur);
}

export async function kisiAktifYap(
  db: Db, aktorId: number, kisiId: number, bayrakGorur = true, beklenen: number | null = null,
): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = bayrakliKisiReddi({ hedefBayrakli: hedef.roller.some((r) => r.yonetici), aktorBayrakli: await kisiBayrakliMi(db, aktorId) })
    ?? cikisliAktiflikReddi({ cikisGecti: hedef.cikis_gecti });
  if (ret !== null) reddet(ret);
  if (!(await aktifYaz(db, kisiId, true))) throw cakisma(ILETILER.zatenAktif);
  return kisiyiGetir(db, kisiId, bayrakGorur);
}

export type CikisSonucu = 'pasif' | 'zaten-pasif' | 'son-yonetici' | 'cikis-yok';

// Çıkış tarihi gelmiş kişiyi pasife alır (1302 a, 1315). Kendi başına kilit ve sayım: iki komut aynı anda son yöneticiyi
// pasife alamaz. Son bayraklı kullanıcıysa dokunmaz ve 'son-yonetici' döner; çağıran günlüğe yazar, iş yarın yeniden dener.
async function cikistanPasifeAl(db: Db, kisiId: number): Promise<CikisSonucu> {
  await bayrakliRolleriKilitle(db);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  if (!hedef.cikis_gecti) return 'cikis-yok';
  if (!hedef.aktif) return 'zaten-pasif';
  const hedefBayrakli = hedef.roller.some((r) => r.yonetici);
  if (cikisPasifiReddi({ hedefSayiliyor: hedefBayrakli && hedef.giris_var, kalanBayrakli: await bayrakliSayisiHaric(db, kisiId) })) return 'son-yonetici';
  if (!(await aktifYaz(db, kisiId, false))) return 'zaten-pasif';
  await oturumlariGecersizKil(db, kisiId);
  return 'pasif';
}

// İK'nın itmesi (1302 a): bağlı kişinin ad, sicil no ve görevi İK'dan yazılır, kişi İK'ya bağlı işaretlenir, çıkış tarihi (1315)
// saklanır; tarih geçmişse kişi hemen pasife alınır. Bayraklı kişiye yalnız bayraklı aktör iter (KS-10). Kayıt zamanı ve kişi
// yazma ucunun transaction'ından değişiklik defterine düşer.
export async function ozluguIkdenYaz(
  db: Db, aktorId: number, kisiId: number, girdi: { ad: string; sicilNo: string | null; gorev: string | null; cikisTarihi: string | null },
): Promise<CikisSonucu> {
  await surumDenetle(db, kisiId, null);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = ozlukItmeReddi({ hedefBayrakli: hedef.roller.some((r) => r.yonetici), aktorBayrakli: await kisiBayrakliMi(db, aktorId) });
  if (ret !== null) reddet(ret);
  const kayit = alanlar(girdi);
  try {
    if (!(await ozlukYaz(db, kisiId, kayit, girdi.cikisTarihi))) throw bulunamadi(ILETILER.kisiYok);
  } catch (hata) {
    if (hata instanceof UygulamaHatasi) throw hata;
    return sicilCakismasiniCevir(hata);
  }
  return cikistanPasifeAl(db, kisiId);
}

// İK'da açılan yeni personelin kişisi (1878 a): kişi girişsiz ve rolsüz açılır; ad, sicil no, görev ve çıkışı aynı transaction'da
// ozluguIkdenYaz yazar ve kişiyi İK'ya bağlar. Hesap, rol ve durum yalnız Kişiler uçlarından değişir.
export async function ikKisisiAc(db: Db, ad: string): Promise<number> {
  return kisiYaz(db, alanlar({ ad }));
}

// İK personel kartından bağ kalkınca (başka kişiye bağlandı, boşaltıldı ya da iptal edildi) alanlar yeniden Kişiler'de düzenlenir;
// sicil no kişiden düşer (İK'nındır, kartla birlikte gider).
export async function ozlukBaginiKaldir(db: Db, kisiId: number): Promise<void> {
  await ozlukBaginiSil(db, kisiId);
}

// Günlük iş: çıkış tarihi gelen aktif kişileri pasife alır; son yönetici olduğu için alınamayanlar döner.
export async function cikisiGelenleriPasifeAl(db: Db): Promise<{ pasif: number[]; sonYonetici: number[] }> {
  const sonuc = { pasif: [] as number[], sonYonetici: [] as number[] };
  for (const kisiId of await cikisiGelenKisiler(db)) {
    await surumDenetle(db, kisiId, null);
    const durum = await cikistanPasifeAl(db, kisiId);
    if (durum === 'pasif') sonuc.pasif.push(kisiId);
    if (durum === 'son-yonetici') sonuc.sonYonetici.push(kisiId);
  }
  return sonuc;
}

export async function hesapAc(
  db: Db,
  aktorId: number,
  kisiId: number,
  girdi: { kullaniciAdi: string; parola: string; rolId: number },
  bayrakGorur = true,
  beklenen: number | null = null,
): Promise<KisiOzeti> {
  await surumDenetle(db, kisiId, beklenen);
  const rol = await kisiVeRol(db, kisiId, girdi.rolId);
  const [hedef] = await kisiSatirlari(db, kisiId);
  const ret = hesapAcmaReddi({
    rolBayrakli: rol.yonetici,
    hedefBayrakli: hedef?.roller.some((r) => r.yonetici) === true,
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
  }) ?? sinirliRolReddi({ rolBayrakli: rol.yonetici, hedefSinirli: hedef?.sinirli_bitis != null });
  if (ret !== null) reddet(ret);
  const kullaniciAdi = kullaniciAdiniDuzelt(girdi.kullaniciAdi);
  const adHatasi = kullaniciAdiHatasi(kullaniciAdi);
  if (adHatasi !== null) throw dogrulama(adHatasi, 'kullaniciAdi');
  const parolaSorunu = parolaHatasi(girdi.parola);
  if (parolaSorunu !== null) throw dogrulama(parolaSorunu, 'parola');
  const ozet = await parolaOzetle(girdi.parola);
  try {
    if (!(await hesapYaz(db, kisiId, kullaniciAdi, ozet))) throw cakisma(ILETILER.girisVar);
  } catch (hata) {
    if (hata instanceof UygulamaHatasi) throw hata;
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(ILETILER.kullaniciAdiVar);
    throw hata;
  }
  // Rol, hesapla aynı transaction'da yazılır: rolsüz giriş hesabı kalıcı olamaz (ertelenmiş kısıt commit'te denetler).
  await rolEkle(db, kisiId, girdi.rolId);
  return kisiyiGetir(db, kisiId, bayrakGorur);
}

// 1925 a: İK'nın yeni personele açtığı hesap. Kullanıcı adı addan kurulur (doluysa sonuna sayı), giriş PIN'ledir: geçici PIN sistemce
// üretilir ve yalnız bu cevapla bir kez döner; kişi ilk girişte kendi PIN'ini belirler. Parola rastgeledir ve kimseye verilmez (hesap
// PIN'le girer). Rol, İK'nın verebileceği rollerden olmalıdır. Yetki (ik.hesap-ac) İK ucunda denetlenir.
export interface IkHesabi { kullaniciAdi: string; pin: string }

export async function ikRolSecenekleri(db: Db): Promise<{ id: number; kod: string; ad: string }[]> {
  return (await ikRolSatirlari(db)).filter(ikRolVerebilirMi).map((r) => ({ id: r.id, kod: r.kod, ad: r.ad }));
}

export async function ikHesabiAc(db: Db, kisiId: number, rolId: number): Promise<IkHesabi> {
  await surumDenetle(db, kisiId, null);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  if (hedef.giris_var) throw cakisma(ILETILER.girisVar);
  const rol = (await ikRolSatirlari(db)).find((r) => r.id === rolId);
  if (rol === undefined) throw bulunamadi(ILETILER.rolBulunamadi);
  if (!ikRolVerebilirMi(rol)) throw yetkiYok(ILETILER.ikRolVeremez);
  const kok = kullaniciAdiKoku(hedef.ad) || `kisi${kisiId}`;
  const kullaniciAdi = bosKullaniciAdi(kok, await kokluKullaniciAdlari(db, kok));
  const pin = rastgelePin(() => randomInt(10));
  try {
    if (!(await hesapYaz(db, kisiId, kullaniciAdi, await parolaOzetle(randomBytes(24).toString('base64url'))))) throw cakisma(ILETILER.girisVar);
  } catch (hata) {
    if (hata instanceof UygulamaHatasi) throw hata;
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(ILETILER.kullaniciAdiVar);
    throw hata;
  }
  await rolEkle(db, kisiId, rolId);
  if (!(await pinYaz(db, kisiId, await parolaOzetle(pin), true))) throw gecersiz(ILETILER.girisYok);
  return { kullaniciAdi, pin };
}

function yeniParolaDenetle(yeniParola: string): void {
  const sorun = parolaHatasi(yeniParola);
  if (sorun !== null) throw dogrulama(sorun, 'yeniParola');
}

export async function baskasininParolasiniDegistir(
  db: Db, aktorId: number, kisiId: number, yeniParola: string, beklenen: number | null = null,
): Promise<void> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = parolaBaskasiReddi({
    kendiKendine: aktorId === kisiId,
    hedefBayrakli: hedef.roller.some((r) => r.yonetici),
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
  });
  if (ret !== null) reddet(ret);
  if (!hedef.giris_var) throw gecersiz(ILETILER.girisYok);
  yeniParolaDenetle(yeniParola);
  if (!(await parolaYaz(db, kisiId, await parolaOzetle(yeniParola)))) throw gecersiz(ILETILER.girisYok);
  await oturumlariGecersizKil(db, kisiId);
}

// 2288-1 a (kayıp telefon, ayrılan kişi): kişiyi pasife almadan bütün oturumları düşer. Tek yol oturumlariGecersizKil;
// kimlik çözümü her oturumu açılış zamanıyla bu zamana göre düşürür (kullaniciYukle). Giriş bilgisi değişmez.
export async function baskasininOturumlariniKapat(
  db: Db, aktorId: number, kisiId: number, beklenen: number | null = null,
): Promise<void> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = oturumKapatmaReddi({
    kendiKendine: aktorId === kisiId,
    hedefBayrakli: hedef.roller.some((r) => r.yonetici),
    aktorBayrakli: await kisiBayrakliMi(db, aktorId),
  });
  if (ret !== null) reddet(ret);
  if (!hedef.giris_var) throw gecersiz(ILETILER.girisYok);
  await oturumlariGecersizKil(db, kisiId);
}

function pinDenetle(pin: string, alan: string): void {
  const sorun = pinHatasi(pin);
  if (sorun !== null) throw dogrulama(sorun, alan);
}

// Yöneticinin verdiği PIN geçicidir: kişi onunla oturum açamaz, ilk girişte kendi PIN'ini belirler. Açık oturumları kapanır.
export async function baskasinaPinVer(
  db: Db, aktorId: number, kisiId: number, pin: string, beklenen: number | null = null,
): Promise<void> {
  await surumDenetle(db, kisiId, beklenen);
  const [hedef] = await kisiSatirlari(db, kisiId);
  if (hedef === undefined) throw bulunamadi(ILETILER.kisiYok);
  const ret = pinVermeReddi({ kendiKendine: aktorId === kisiId, hedefBayrakli: hedef.roller.some((r) => r.yonetici) });
  if (ret !== null) reddet(ret);
  if (!hedef.giris_var) throw gecersiz(ILETILER.girisYok);
  pinDenetle(pin, 'pin');
  if (!(await pinYaz(db, kisiId, await parolaOzetle(pin), true))) throw gecersiz(ILETILER.girisYok);
  await oturumlariGecersizKil(db, kisiId);
}

// Yeni PIN'in kuralı geçici PIN doğrulanmadan sınanır (oturum): doğrulamadan sonra gelen ret geçici PIN'in doğru
// olduğunu bekleme sayacına yazılmadan söylerdi.
export function yeniPinHatasi(geciciPin: string, yeniPin: string): string | null {
  return pinHatasi(yeniPin) ?? (yeniPin === geciciPin ? 'Yeni PIN geçici PIN ile aynı olamaz.' : null);
}

// Geçici PIN'i doğrulanmış kişinin kendi PIN'i yazılır; çağıran (oturum) doğrulamayı ve beklemeyi yapmıştır.
export async function ilkPiniYaz(db: Db, kisiId: number, yeniPin: string): Promise<void> {
  pinDenetle(yeniPin, 'yeniPin');
  await surumDenetle(db, kisiId, null);
  if (!(await pinYaz(db, kisiId, await parolaOzetle(yeniPin), false))) throw gecersiz(ILETILER.girisYok);
}

export function kisiKullaniciAdi(db: Db, kisiId: number): Promise<string | null> {
  return girisBilgisiBul(db, kisiId).then((giris) => giris?.kullanici_adi ?? null);
}

// Kendi parolası: eski parola doğrulanır, yenisi yazılır. Yanlış eski parola hata değil sonuçtur: bekleme ve sayaç
// kuralı çağıranındır (oturum). Yeni parola geçersizse ya da giriş hesabı yoksa fırlatır.
export async function kendiParolasiniDegistir(
  db: Db, kisiId: number, eskiParola: string, yeniParola: string,
): Promise<'tamam' | 'eski-yanlis'> {
  const giris = await girisBilgisiBul(db, kisiId);
  if (giris === null) throw gecersiz(ILETILER.girisYok);
  yeniParolaDenetle(yeniParola);
  if (!(await parolaDogrula(eskiParola, giris.parola_ozeti))) return 'eski-yanlis';
  await surumDenetle(db, kisiId, null);
  if (!(await parolaYaz(db, kisiId, await parolaOzetle(yeniParola)))) throw gecersiz(ILETILER.girisYok);
  return 'tamam';
}

// Kendi PIN'i: eski olarak geçerli PIN ya da parola kabul edilir (PIN'ini unutan parolasıyla değiştirebilsin). Yanlış eski
// sonuçtur, hata değil: bekleme ve sayaç çağıranındır (oturum). Bayraklı kişi parolayla girer; PIN'i olmayana ilk PIN'i yetkili
// verir, yoksa kişi kendi giriş yöntemini parola yerine PIN'e çevirmiş olurdu.
export async function kendiPininiDegistir(db: Db, kisiId: number, eski: string, yeniPin: string): Promise<'tamam' | 'eski-yanlis'> {
  const giris = await pinBilgisiBul(db, kisiId);
  if (giris === null) throw gecersiz(ILETILER.girisYok);
  if (await kisiBayrakliMi(db, kisiId)) throw gecersiz(ILETILER.bayrakliKendiPin);
  if (giris.pin_ozeti === null) throw gecersiz(ILETILER.pinYok);
  pinDenetle(yeniPin, 'yeniPin');
  const eskiDogru = (await parolaDogrula(eski, giris.pin_ozeti))
    || (giris.parola_ozeti !== null && (await parolaDogrula(eski, giris.parola_ozeti)));
  if (!eskiDogru) return 'eski-yanlis';
  if (await parolaDogrula(yeniPin, giris.pin_ozeti)) throw dogrulama(ILETILER.ayniPin, 'yeniPin');
  await surumDenetle(db, kisiId, null);
  if (!(await pinYaz(db, kisiId, await parolaOzetle(yeniPin), false))) throw gecersiz(ILETILER.girisYok);
  return 'tamam';
}

// Başka modüle açık rol komutları: uç dışından çağrılınca da eylemi yapanın `kisiler.rol-yonet` işlemi sunucuda sorulur
// (karar T3r a). Bayraklı aktör bütün işlemleri taşır. Sürüm sorulmaz, artırılır.
async function rolYonetimiDenetle(db: Db, aktorId: number): Promise<void> {
  const aktor = await kullaniciYukle(db, aktorId);
  if (aktor === null || !aktor.islemler.includes('kisiler.rol-yonet')) throw yetkiYok(ILETILER.rolYonetimiYetkisiz);
}

export async function rolAtaYetkili(db: Db, aktorId: number, kisiId: number, rolId: number): Promise<KisiOzeti> {
  await rolYonetimiDenetle(db, aktorId);
  return rolAta(db, aktorId, kisiId, rolId);
}

export async function rolAlYetkili(db: Db, aktorId: number, kisiId: number, rolId: number): Promise<KisiOzeti> {
  await rolYonetimiDenetle(db, aktorId);
  return rolAl(db, aktorId, kisiId, rolId);
}

// Ortak seçici (kart #1320): yalnız kimlik, ad, sicil no ve aktiflik döner; rol, işlem, parola, özlük bayrağı dönmez.
export async function kisiSecimAra(db: Db, g: { q: string; pasifler: boolean; sayfa: number }): Promise<KisiSecimCevabi> {
  const satirlar = await kisiSecimSatirlari(db, {
    sade: aramaSade(g.q), icindeDeseni: icindeDeseni(g.q), pasifler: g.pasifler, sinir: KISI_SECIM_SAYFA_BOYU + 1, atla: (g.sayfa - 1) * KISI_SECIM_SAYFA_BOYU,
  });
  return {
    sonuclar: satirlar.slice(0, KISI_SECIM_SAYFA_BOYU).map((k) => ({ id: k.id, kod: k.sicilNo ?? '', ad: k.ad, aktif: k.aktif, ust: null })),
    dahaVar: satirlar.length > KISI_SECIM_SAYFA_BOYU,
  };
}

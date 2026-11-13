import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { sikParolaMi } from './sik-parolalar.ts';

// 2226-9 a: en az 10 karakter ve sık parola kökü yok. Kural yalnız yeni parola konurken uygulanır; var olan parolalar geçerli kalır.
export const PAROLA_EN_AZ = 10;
export const PIN_UZUNLUK = 6;
export const KULLANICI_ADI_DESENI = /^[a-z0-9._-]{3,40}$/;
export const SICIL_EN_FAZLA = 30;
export const GOREV_EN_FAZLA = 80;

export function kullaniciAdiniDuzelt(ham: string): string {
  return ham.trim().toLowerCase();
}

// Kişinin yetkisi rollerinin ve kişiye verilen ek işlemlerin birleşimidir. Bayraklı rol kayıtlı bütün işlemleri verir: yeni işlem
// eklendiğinde yönetici dışarıda kalmaz. Kayıtlı olmayan (kaldırılmış, yanlış yazılmış) işlem yetki vermez.
export function islemleriBirlestir(butunIslemler: boolean, rolIslemleri: readonly unknown[]): Islem[] {
  return ISLEMLER.filter((islem) => butunIslemler || rolIslemleri.includes(islem));
}

export interface Ret {
  tur: 'yetki' | 'gecersiz';
  ileti: string;
}

export const ILETILER = {
  bayrakliYetkisiz: 'Tüm yetkileri veren rolü yalnızca bu rolü olan kişi atayabilir ve alabilir.',
  kendiBayrakli: 'Tüm yetkileri veren rolü kendinizden alamazsınız; başka bir yetkili almalı.',
  sonBayrakli: 'Tüm yetkileri veren role sahip, girişi olan ve aktif en az bir kişi kalmalı.',
  sonRol: 'Girişi olan kişinin en az bir rolü olmalı.',
  zatenVar: 'Kişi bu role zaten sahip.',
  rolYok: 'Kişi bu role sahip değil.',
  kendiPasif: 'Kendinizi pasife alamazsınız; başka bir yetkili almalı.',
  zatenPasif: 'Kişi zaten pasif.',
  zatenAktif: 'Kişi zaten aktif.',
  bayrakliKisiYetkisiz: 'Tüm yetkileri veren role sahip kişiye bu işlemi yalnızca bu role sahip başka bir kişi yapabilir.',
  bayrakliKaydiYetkisiz: 'Tüm yetkileri veren role sahip kişinin kaydını yalnızca bu role sahip bir kişi düzenleyebilir.',
  girisVar: 'Kişinin giriş hesabı zaten var.',
  girisYok: 'Kişinin giriş hesabı yok.',
  kendiParolaYolu: 'Kendi parolanızı eski parolanızla birlikte kendi hesabınızdan değiştirin.',
  kendiOturumYolu: 'Kendi oturumlarınızı Profil > Oturumlar\'dan kapatın.',
  kendiPin: 'Kendinize PIN veremezsiniz; başka bir yetkili vermeli.',
  kendiRol: 'Kendinize rol atayamazsınız; başka bir yetkili atamalı.',
  bayrakliPin: 'Tüm yetkileri veren role sahip kişi parolayla girer; PIN verilmez.',
  bayrakliKendiPin: 'Hesabınız parolayla girer; PIN kullanılmaz.',
  pinYok: 'Hesabınızda PIN yok; ilk PIN yöneticinizden gelir.',
  ayniPin: 'Yeni PIN eskisiyle aynı olamaz.',
  sicilVar: 'Bu sicil numarası başka bir kişide kayıtlı.',
  kullaniciAdiVar: 'Bu kullanıcı adı kullanılıyor.',
  kisiYok: 'Kişi bulunamadı.',
  rolBulunamadi: 'Rol bulunamadı.',
  ikRolVeremez: 'Bu rol yetki dağıtan işlem taşıdığı için İK tarafından verilemez; rolü Personel\'de rol yöneten verir.',
  rolYonetimiYetkisiz: 'Rol atamak ve almak için rol yönetme yetkisi gerekir.',
  matrisYetkisiz: 'Rol yetkilerini yalnızca tüm yetkileri veren role sahip kişi değiştirebilir.',
  bayrakliMatris: 'Tüm yetkileri veren rol her işleme sahiptir; yetkileri tek tek değiştirilmez.',
  islemKayitsiz: 'Bu işlem kayıtlı değil.',
  ekIslemYetkisiz: 'Kişiye ek yetkiyi yalnızca tüm yetkileri veren role sahip kişi verebilir ve alabilir.',
  bayrakliEkIslem: 'Tüm yetkileri veren role sahip kişi her işleme sahiptir; ek yetki verilmez.',
  devredilmezIslem: 'Bu yetki kişiye ayrıca verilmez; yalnızca tüm yetkileri veren rolde kalır.',
  ekIslemKullaniciDegil: 'Ek yetki yalnızca aktif ve girişi olan kişiye verilir.',
  kisitYetkisiz: 'Kişiden yetkiyi yalnızca tüm yetkileri veren role sahip kişi alabilir ve geri verebilir.',
  bayrakliKisit: 'Tüm yetkileri veren role sahip kişiden yetki alınmaz.',
  devredilmezKisit: 'Bu yetki tek kişiden alınmaz; yalnızca rolüyle birlikte gelir ve gider.',
  kisitKullaniciDegil: 'Yetki yalnızca aktif ve girişi olan kişiden alınır.',
  kisitRoldeYok: 'Bu yetki kişinin rolünden gelmiyor; ek yetkiyse ek yetkiyi kaldırın.',
  ozlukIkte: 'Ad, sicil no ve görev bu kişide İK personel kartından gelir; İK\'da değiştirin.',
  cikisVar: 'Kişinin İK\'da çıkış tarihi geçmiş; aktif yapmak için önce İK\'da çıkışı kaldırın.',
  sinirliBayrakli: 'Tüm yetkileri veren role sahip kişi sınırlı hesap olamaz; sınırlı hesaba bu rol verilmez.',
  sinirliKendi: 'Kendi hesabınızın türünü değiştiremezsiniz; başka bir yetkili değiştirmeli.',
  sinirliSorumlu: 'Sorumlu, aktif ve girişi olan bir iç hesap olmalı; kişinin kendisi olamaz.',
  sinirliBitisGecmis: 'Bitiş tarihi bugünden önce olamaz.',
  sinirliBitisUzun: 'Bitiş tarihi en çok 90 gün sonrası olabilir; gerekirse sonra uzatılır.',
  sinirliDegil: 'Kişi zaten iç hesap.',
  taahhutSinirliDegil: 'Gizlilik taahhüdü yalnız sınırlı hesapta istenir.',
  ozlukBayrakliYetkisiz: 'Tüm yetkileri veren role sahip kişinin özlük bilgisini yalnızca bu role sahip bir kişi değiştirebilir.',
} as const;

// Bayraklı rolü yalnız bayraklı rolü olan kişi verir ve alır; kural rolün adına değil bayrağına bakar.
// Bayraksız aktör kendine rol atarsa rol yönetme yetkisiyle kendi yetkisini genişletir; bayraklı aktör zaten her işleme sahiptir.
export function atamaReddi(girdi: { rolBayrakli: boolean; aktorBayrakli: boolean; kendiKendine: boolean }): Ret | null {
  if (girdi.rolBayrakli && !girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.bayrakliYetkisiz };
  if (girdi.kendiKendine && !girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.kendiRol };
  return null;
}

// kalanBayrakli: bu alma sonrasında bayraklı rolü olan, girişi olan, aktif kişi sayısı (rol bayraksızsa kullanılmaz).
export function almaReddi(girdi: {
  rolBayrakli: boolean;
  aktorBayrakli: boolean;
  kendiKendine: boolean;
  kalanBayrakli: number;
}): Ret | null {
  if (!girdi.rolBayrakli) return null;
  if (!girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.bayrakliYetkisiz };
  if (girdi.kendiKendine) return { tur: 'gecersiz', ileti: ILETILER.kendiBayrakli };
  if (girdi.kalanBayrakli < 1) return { tur: 'gecersiz', ileti: ILETILER.sonBayrakli };
  return null;
}

// Uzunluğu tutan ama tek karakterin tekrarı ya da art arda artan/azalan dizi olan parola ("11111111", "12345678", "abcdefgh")
// ilk denenenlerdendir; PIN kuralıyla aynı ölçü. Harfin büyüklüğü diziyi bozmaz.
export function parolaHatasi(parola: string): string | null {
  if (parola.length < PAROLA_EN_AZ) return `Parola en az ${PAROLA_EN_AZ} karakter olmalı.`;
  // Dil bağımsız küçültme: Türkçe küçültme "I"yı "ı" yapar ve ABCDEFGHIJ dizisini bozardı.
  const kodlar = [...parola.toLowerCase()].map((h) => h.codePointAt(0) as number);
  const farklar = new Set(kodlar.slice(1).map((k, i) => k - (kodlar[i] as number)));
  if (farklar.size === 1 && [0, 1, -1].includes([...farklar][0] as number)) {
    return 'Parola tek karakterin tekrarı ya da sıralı karakterler (12345678, abcdefgh gibi) olamaz.';
  }
  if (sikParolaMi(parola)) return 'Bu parola çok sık kullanılan bir sözcük ya da diziden oluşuyor; başına ve sonuna rakam eklemek yetmez. Birkaç sözcükten oluşan bir cümle seçin.';
  return null;
}

// Altı rakam yaklaşık bir milyon olasılıktır; giriş beklemesi (ADR 0003) denemeyi yavaşlatır. Tek rakamın tekrarı ve
// art arda artan ya da azalan dizi ilk denenenlerdir, kabul edilmez.
export function pinHatasi(pin: string): string | null {
  if (!new RegExp(`^[0-9]{${PIN_UZUNLUK}}$`).test(pin)) return `PIN ${PIN_UZUNLUK} rakam olmalı.`;
  const rakamlar = [...pin].map(Number);
  const farklar = new Set(rakamlar.slice(1).map((r, i) => r - (rakamlar[i] as number)));
  if (farklar.size === 1 && [0, 1, -1].includes([...farklar][0] as number)) {
    return 'PIN tek rakamın tekrarı ya da sıralı rakamlar olamaz.';
  }
  return null;
}

// Bayraklı kişi her zaman parolayla girer (ADR 0012); ötekiler PIN verildiyse yalnız PIN'le, verilmediyse parolayla.
export function girisYontemi(girdi: { bayrakli: boolean; pinVar: boolean }): 'parola' | 'pin' {
  return !girdi.bayrakli && girdi.pinVar ? 'pin' : 'parola';
}

// Geçici PIN'i veren kişi onunla giremez (kişi ilk girişte kendi PIN'ini belirler); kendine verirse bu ayrım kalmaz.
export function pinVermeReddi(girdi: { kendiKendine: boolean; hedefBayrakli: boolean }): Ret | null {
  if (girdi.kendiKendine) return { tur: 'gecersiz', ileti: ILETILER.kendiPin };
  if (girdi.hedefBayrakli) return { tur: 'gecersiz', ileti: ILETILER.bayrakliPin };
  return null;
}

// İleti sorunlu karakteri adıyla söyler: kullanıcı Türkçe harfi ya da boşluğu kendisi göremeyebilir. Desen değişmez.
export function kullaniciAdiHatasi(kullaniciAdi: string): string | null {
  if (KULLANICI_ADI_DESENI.test(kullaniciAdi)) return null;
  const gecersiz = [...new Set([...kullaniciAdi].filter((h) => !/[a-z0-9._-]/.test(h)))];
  if (gecersiz.length > 0) {
    const liste = gecersiz.map((h) => (/\s/.test(h) ? 'boşluk' : `"${h}"`)).join(', ');
    return `Kullanıcı adında izin verilmeyen karakter var: ${liste}. Yalnız a-z harf, rakam, nokta, tire ve alt çizgi kullanın (ş, ı, ğ, ü, ö, ç yerine s, i, g, u, o, c).`;
  }
  return `Kullanıcı adı 3-40 karakter olmalı; şu an ${[...kullaniciAdi].length} karakter.`;
}

export interface KisiAlanlari {
  ad: string;
  sicilNo: string | null;
  gorev: string | null;
}

export type AlanSonucu = { tamam: KisiAlanlari } | { alan: 'ad' | 'sicilNo' | 'gorev'; ileti: string };

// Boş sicil ve görev yokluk demektir (null); aynı sicilin boşluklu yazımı ayrı kayıt sayılmaz.
export function kisiAlanlariniDuzelt(ham: { ad: string; sicilNo?: string | null; gorev?: string | null }): AlanSonucu {
  const ad = ham.ad.trim();
  const sicilNo = (ham.sicilNo ?? '').trim();
  const gorev = (ham.gorev ?? '').trim();
  if (ad === '') return { alan: 'ad', ileti: 'Ad boş olamaz.' };
  if (sicilNo.length > SICIL_EN_FAZLA) return { alan: 'sicilNo', ileti: `Sicil no en fazla ${SICIL_EN_FAZLA} karakter olabilir.` };
  if (gorev.length > GOREV_EN_FAZLA) return { alan: 'gorev', ileti: `Görev en fazla ${GOREV_EN_FAZLA} karakter olabilir.` };
  return { tamam: { ad, sicilNo: sicilNo === '' ? null : sicilNo, gorev: gorev === '' ? null : gorev } };
}

// hedefSayiliyor: hedef şu an "bayraklı, girişi olan, aktif" kişi sayısına dahil; kalanBayrakli onsuz kalan sayı.
// Bayraklı rolü taşıyan kişi üzerinde (pasife alma, yeniden aktif yapma, parola, hesap açma, kaydı düzenleme) yalnız
// bayraklı rolü taşıyan biri işlem yapar; aksi halde yetkili biri bayraklı kişiyi kilitleyebilir ya da hesabını ele geçirebilir.
// Düzenlemede kişi kendi kaydını da düzenler; başkası şartı olan işlemlerin iletisi bu yüzden ayrıdır.
// Ekran bayraklı kişinin satırında yapılamayacak işlemi göstermesin; bayrağı görmeyen okuyucu kendisi çıkaramaz.
export function korumaliMi(girdi: { hedefBayrakli: boolean; aktorBayrakli: boolean }): boolean {
  return bayrakliKisiReddi(girdi) !== null;
}

export function bayrakliKisiReddi(
  girdi: { hedefBayrakli: boolean; aktorBayrakli: boolean },
  ileti: string = ILETILER.bayrakliKisiYetkisiz,
): Ret | null {
  if (girdi.hedefBayrakli && !girdi.aktorBayrakli) return { tur: 'yetki', ileti };
  return null;
}

// Hesap, seçilen rol bayraklıysa ya da hedef kişi zaten bayraklı bir rol taşıyorsa yalnız bayraklı aktörce açılır:
// kullanıcı adını ve parolayı belirleyen kişi hesabın sahibidir.
export function hesapAcmaReddi(girdi: { rolBayrakli: boolean; hedefBayrakli: boolean; aktorBayrakli: boolean }): Ret | null {
  // Hesabı olan aktör kendine hesap açamaz (girisVar); açılan hesap başkasınındır.
  return atamaReddi({ rolBayrakli: girdi.rolBayrakli, aktorBayrakli: girdi.aktorBayrakli, kendiKendine: false })
    ?? bayrakliKisiReddi({ hedefBayrakli: girdi.hedefBayrakli, aktorBayrakli: girdi.aktorBayrakli });
}

export function pasifeAlmaReddi(girdi: {
  kendiKendine: boolean;
  hedefBayrakli: boolean;
  aktorBayrakli: boolean;
  hedefSayiliyor: boolean;
  kalanBayrakli: number;
}): Ret | null {
  if (girdi.kendiKendine) return { tur: 'gecersiz', ileti: ILETILER.kendiPasif };
  const bayrakli = bayrakliKisiReddi(girdi);
  if (bayrakli !== null) return bayrakli;
  if (girdi.hedefSayiliyor && girdi.kalanBayrakli < 1) return { tur: 'gecersiz', ileti: ILETILER.sonBayrakli };
  return null;
}

// Kendi parolası eski parolayla ayrı yoldan değişir; bu yol başkası içindir ve eski parola sormaz.
export function parolaBaskasiReddi(girdi: { kendiKendine: boolean; hedefBayrakli: boolean; aktorBayrakli: boolean }): Ret | null {
  if (girdi.kendiKendine) return { tur: 'gecersiz', ileti: ILETILER.kendiParolaYolu };
  return bayrakliKisiReddi(girdi);
}

// 2288-1 a: başkasının bütün oturumları ayrı işlemle kapanır. Kişi kendi oturumlarını bu yoldan kapatmaz: bu yol çağıranın
// oturumunu da düşürürdü; kendisi için o anki oturumu koruyan Profil yolu vardır.
export function oturumKapatmaReddi(girdi: { kendiKendine: boolean; hedefBayrakli: boolean; aktorBayrakli: boolean }): Ret | null {
  if (girdi.kendiKendine) return { tur: 'gecersiz', ileti: ILETILER.kendiOturumYolu };
  return bayrakliKisiReddi(girdi);
}

// Rolün işlemini yalnız bayraklı kişi değiştirir (kullanıcı kararı 12.10.2026, kart #684): rol yöneten ama bayraksız kişi
// kendi rolüne işlem ekleyip yetkisini büyütemez. Bayraklı rol zaten bütün işlemleri verir; satırı anlamsızdır.
export function islemDegistirmeReddi(girdi: { aktorBayrakli: boolean; rolBayrakli: boolean; islemKayitli: boolean }): Ret | null {
  if (!girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.matrisYetkisiz };
  if (girdi.rolBayrakli) return { tur: 'gecersiz', ileti: ILETILER.bayrakliMatris };
  if (!girdi.islemKayitli) return { tur: 'gecersiz', ileti: ILETILER.islemKayitsiz };
  return null;
}

// Kişiye ek verilemeyen işlemler (kart #1233): rol yönetimi ve başkasının parolası, yönetici olmayanın hesapları ele geçirmesine
// yol açar; Güvenlik Merkezi yalnız yöneticinindir (kullanıcı kararı 14.10.2026, "Verilemesin"). Bunlar yalnız bayraklı rolde
// kalır; daha önce verilmiş satır alınabilir.
// Başkasının bütün oturumlarını kapatmak da yalnız yöneticinindir (2288-1 a).
export const DEVREDILMEZ_ISLEMLER: readonly Islem[] = [
  'kisiler.rol-yonet', 'kisiler.parola-degistir', 'kisiler.oturum-kapat', 'guvenlik.oku', 'guvenlik.yonet',
];

// KS-4 (kart #1233): kişiye rolünün üstüne ek işlemi yalnız bayraklı kişi verir ve alır; bayraklı kişiye ek işlem anlamsızdır;
// kayıtsız ve devredilmez işlem verilmez. Pasif ya da girişsiz kişiye verilmez: ekran onu listelemez, verilen görünmez kalırdı.
// Var olan satır, rolleri gibi pasife almada korunur (aktif yapılınca geri gelir) ve her durumda alınabilir.
export function ekIslemReddi(girdi: {
  aktorBayrakli: boolean; kisiBayrakli: boolean; kisiKullanici: boolean; islemKayitli: boolean; devredilmez: boolean; verildi: boolean;
}): Ret | null {
  if (!girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.ekIslemYetkisiz };
  if (girdi.kisiBayrakli) return { tur: 'gecersiz', ileti: ILETILER.bayrakliEkIslem };
  if (girdi.verildi && !girdi.kisiKullanici) return { tur: 'gecersiz', ileti: ILETILER.ekIslemKullaniciDegil };
  if (!girdi.islemKayitli) return { tur: 'gecersiz', ileti: ILETILER.islemKayitsiz };
  if (girdi.verildi && girdi.devredilmez) return { tur: 'gecersiz', ileti: ILETILER.devredilmezIslem };
  return null;
}

// KS-11 (kart 3166): rolden gelen işlemi tek kişiden yalnız bayraklı kişi alır ve geri verir; kural ek işlemle aynı yetkiye bağlıdır.
// Bayraklı kişi kısıtlanmaz: alan da bayraklı olduğundan kimse kendi yetkisini alıp kilitlenemez, son yönetici de kısıtlanamaz.
// Devredilmez işlemler alınmaz: "rol yöneten ama parola değiştiremeyen" gibi yarım roller çıkmasın. Kısıt yalnız rolden gelen
// işleme konur; ek işlem zaten kendi komutuyla kaldırılır. Var olan kısıt her durumda kaldırılabilir (kaldırmak rol yetkisine döndürür).
export function kisitReddi(girdi: {
  aktorBayrakli: boolean; kisiBayrakli: boolean; kisiKullanici: boolean; islemKayitli: boolean; devredilmez: boolean; roldeVar: boolean; alindi: boolean;
}): Ret | null {
  if (!girdi.aktorBayrakli) return { tur: 'yetki', ileti: ILETILER.kisitYetkisiz };
  if (!girdi.alindi) return null;
  if (girdi.kisiBayrakli) return { tur: 'gecersiz', ileti: ILETILER.bayrakliKisit };
  if (!girdi.kisiKullanici) return { tur: 'gecersiz', ileti: ILETILER.kisitKullaniciDegil };
  if (!girdi.islemKayitli) return { tur: 'gecersiz', ileti: ILETILER.islemKayitsiz };
  if (girdi.devredilmez) return { tur: 'gecersiz', ileti: ILETILER.devredilmezKisit };
  if (!girdi.roldeVar) return { tur: 'gecersiz', ileti: ILETILER.kisitRoldeYok };
  return null;
}

// KS-8 (1302 a): İK'ya bağlı kişide ad, sicil no ve görev İK'nındır; Kişiler'den değiştirilmez. Aynı değerle gelen düzenleme
// (form bütün alanları gönderir) geçer.
export function ozlukDuzenlemeReddi(hedef: { ozlukIk: boolean } & KisiAlanlari, yeni: KisiAlanlari): Ret | null {
  if (!hedef.ozlukIk) return null;
  const ayni = hedef.ad === yeni.ad && hedef.sicilNo === yeni.sicilNo && hedef.gorev === yeni.gorev;
  return ayni ? null : { tur: 'gecersiz', ileti: ILETILER.ozlukIkte };
}

// KS-9 (1302 a, 1315): İK'daki çıkış tarihi geçmiş kişi Kişiler'den aktif yapılmaz; çıkış İK'da kaldırılınca İK yeniden iter.
export function cikisliAktiflikReddi(girdi: { cikisGecti: boolean }): Ret | null {
  return girdi.cikisGecti ? { tur: 'gecersiz', ileti: ILETILER.cikisVar } : null;
}

// KS-10 (1302 a): İK'dan itme bayraklı kişiye yalnız bayraklı aktörle yapılır; yoksa İK yetkisi yönetici hesabını yeniden
// adlandırır ya da çıkış tarihiyle kilitler (bayrakliKisiReddi ile aynı gerekçe).
export function ozlukItmeReddi(girdi: { hedefBayrakli: boolean; aktorBayrakli: boolean }): Ret | null {
  return girdi.hedefBayrakli && !girdi.aktorBayrakli ? { tur: 'yetki', ileti: ILETILER.ozlukBayrakliYetkisiz } : null;
}

// Çıkışla pasife almada son bayraklı kullanıcı korunur (pasifeAlmaReddi ile aynı sayım); aktör yoktur, kendi kendine kuralı uygulanmaz.
export function cikisPasifiReddi(girdi: { hedefSayiliyor: boolean; kalanBayrakli: number }): boolean {
  return girdi.hedefSayiliyor && girdi.kalanBayrakli < 1;
}

// 1925 a: İK'nın açtığı hesaba verebileceği rol. Tüm yetkileri veren rol ve yetki dağıtan işlem taşıyan rol İK'ya kapalıdır:
// İK kendine ya da başkasına rol yönetme, parola değiştirme ya da yeni hesap açma yetkisi veremez.
export const IK_VEREMEZ_ISLEMLER = ['kisiler.rol-yonet', 'kisiler.parola-degistir', 'kisiler.oturum-kapat', 'ik.hesap-ac'] as const satisfies readonly Islem[];

export function ikRolVerebilirMi(rol: { yonetici: boolean; islemler: readonly unknown[] }): boolean {
  return !rol.yonetici && !IK_VEREMEZ_ISLEMLER.some((islem) => rol.islemler.includes(islem));
}

const TURKCE: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

// Addan kullanıcı adı kökü (Personel'in hesap penceresindeki öneriyle aynı kural); 3 karakterden kısaysa boş.
export function kullaniciAdiKoku(ad: string): string {
  const kok = ad
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (h) => TURKCE[h] ?? h)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40)
    .replace(/\.+$/, '');
  return kok.length >= 3 ? kok : '';
}

// Kullanılan adlar arasında ilk boş aday: kök, sonra kök2, kök3... (40 karakteri aşmaz).
export function bosKullaniciAdi(kok: string, kullanilan: ReadonlySet<string>): string {
  for (let sira = 1; ; sira += 1) {
    const ek = sira === 1 ? '' : String(sira);
    const aday = `${kok.slice(0, 40 - ek.length).replace(/\.+$/, '')}${ek}`;
    if (!kullanilan.has(aday)) return aday;
  }
}

// Sistemin verdiği geçici PIN; PIN kuralını (tekrar, sıra) geçene kadar yeniden çekilir.
export function rastgelePin(rakam: () => number): string {
  for (;;) {
    const pin = Array.from({ length: PIN_UZUNLUK }, () => String(rakam())).join('');
    if (pinHatasi(pin) === null) return pin;
  }
}

// Sınırlı hesap (kart 2158, 2158-5 a): bitiş en çok 90 gün sonrasıdır; uzatma aynı sınırla yeniden verilir.
export const SINIRLI_EN_UZUN_GUN = 90;

// 'GGGG-AA-GG' tarihine gün ekler (takvim günü; saat dilimi karışmaz).
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10);
}

// bugun: tesis günü. Tarihler 'GGGG-AA-GG' olduğu için metin karşılaştırması takvim sırasıdır.
export function sinirliHesapReddi(girdi: {
  kendiKendine: boolean; hedefBayrakli: boolean; sorumluUygun: boolean; sorumluKendisi: boolean; bitis: string; bugun: string;
}): Ret | null {
  if (girdi.kendiKendine) return { tur: 'yetki', ileti: ILETILER.sinirliKendi };
  if (girdi.hedefBayrakli) return { tur: 'gecersiz', ileti: ILETILER.sinirliBayrakli };
  if (girdi.sorumluKendisi || !girdi.sorumluUygun) return { tur: 'gecersiz', ileti: ILETILER.sinirliSorumlu };
  if (girdi.bitis < girdi.bugun) return { tur: 'gecersiz', ileti: ILETILER.sinirliBitisGecmis };
  if (girdi.bitis > gunEkle(girdi.bugun, SINIRLI_EN_UZUN_GUN)) return { tur: 'gecersiz', ileti: ILETILER.sinirliBitisUzun };
  return null;
}

export function icHesapReddi(girdi: { kendiKendine: boolean; hedefSinirli: boolean }): Ret | null {
  if (girdi.kendiKendine) return { tur: 'yetki', ileti: ILETILER.sinirliKendi };
  if (!girdi.hedefSinirli) return { tur: 'gecersiz', ileti: ILETILER.sinirliDegil };
  return null;
}

// Sınırlı hesaba bayraklı rol verilmez (rol atama ve hesap açma).
export function sinirliRolReddi(girdi: { rolBayrakli: boolean; hedefSinirli: boolean }): Ret | null {
  return girdi.rolBayrakli && girdi.hedefSinirli ? { tur: 'gecersiz', ileti: ILETILER.sinirliBayrakli } : null;
}

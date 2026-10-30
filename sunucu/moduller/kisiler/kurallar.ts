import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Islem } from '#paylasilan/islemler.ts';

export const PAROLA_EN_AZ = 8;
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
  rolYonetimiYetkisiz: 'Rol atamak ve almak için rol yönetme yetkisi gerekir.',
  matrisYetkisiz: 'Rol yetkilerini yalnızca tüm yetkileri veren role sahip kişi değiştirebilir.',
  bayrakliMatris: 'Tüm yetkileri veren rol her işleme sahiptir; yetkileri tek tek değiştirilmez.',
  islemKayitsiz: 'Bu işlem kayıtlı değil.',
  ekIslemYetkisiz: 'Kişiye ek yetkiyi yalnızca tüm yetkileri veren role sahip kişi verebilir ve alabilir.',
  bayrakliEkIslem: 'Tüm yetkileri veren role sahip kişi her işleme sahiptir; ek yetki verilmez.',
  devredilmezIslem: 'Bu yetki kişiye ayrıca verilmez; yalnızca tüm yetkileri veren rolde kalır.',
  ekIslemKullaniciDegil: 'Ek yetki yalnızca aktif ve girişi olan kişiye verilir.',
  ozlukIkte: 'Ad, sicil no ve görev bu kişide İK personel kartından gelir; İK\'da değiştirin.',
  cikisVar: 'Kişinin İK\'da çıkış tarihi geçmiş; aktif yapmak için önce İK\'da çıkışı kaldırın.',
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

export function parolaHatasi(parola: string): string | null {
  return parola.length < PAROLA_EN_AZ ? `Parola en az ${PAROLA_EN_AZ} karakter olmalı.` : null;
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
export const DEVREDILMEZ_ISLEMLER: readonly Islem[] = ['kisiler.rol-yonet', 'kisiler.parola-degistir', 'guvenlik.oku', 'guvenlik.yonet'];

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

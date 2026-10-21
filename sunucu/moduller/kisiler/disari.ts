import type { Db } from '#cekirdek/db.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { islemleriBirlestir } from './kurallar.ts';
import {
  etkinKisiSecenekleri, kisiAdlariniBul, kisiGorevBul, kisiIslemSatirlari, kisiRolIslemSatirlari, kullaniciAdindanKisiNo, rolKodSatirlari,
  rollerdekiKisiSatirlari,
} from './sorgular.ts';

export { kullaniciAdiniDuzelt } from './kurallar.ts';
export {
  girisDogrula, ilkPiniYaz, kendiParolasiniDegistir, kendiPininiDegistir, kisiBayrakliMi, kisileriListele, kisiKullaniciAdi, kisiVarMi, kullaniciYukle, yoneticiOlustur, yeniPinHatasi,
} from './servis.ts';
export type { GirisSirri } from './servis.ts';
// Rol komutları başka modüllerin test kurulumunda kullanılır; dışarıdan çağrıda da eylemi yapanın rol yönetme işlemi sorulur.
// Kişi ekleme, hesap açma, pasife alma ve aktif yapma dışarı açılmaz: yalnız uçtan (yetki ve denetim kaydıyla) yapılır.
export { rolAlYetkili as rolAl, rolAtaYetkili as rolAta } from './servis.ts';

// Verilen kimliklerin adları tek sorguda. Boş dizide sorgu atılmaz; yinelenen kimlik tek kayıt, olmayan kimlik haritada yok,
// pasif kişi adıyla döner.
export async function kisiAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const benzersiz = [...new Set(idler)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await kisiAdlariniBul(db, benzersiz)).map((k) => [k.id, k.ad]));
}

// Aktif ve girişli her kişinin işlemleri tek sorguda; kullaniciYukle ile aynı sonuç (bayraklı rol bütün kayıtlı işlemleri verir).
// Pasif ve girişsiz kişi haritada yoktur; rolsüz girişli kişi boş liste alır.
export async function kisilerinIslemleri(db: Db): Promise<Map<number, Islem[]>> {
  return new Map((await kisiIslemSatirlari(db)).map((k) => [k.id, islemleriBirlestir(k.butun_islemler, k.islemler)]));
}

// kisilerinIslemleri gibi, ama yalnız rolden gelen işlemler: kişiye verilen ek işlem girmez. Arkon rolü rolden çözülür (kart #1233 isteği).
export async function kisilerinRolIslemleri(db: Db, kisiId?: number): Promise<Map<number, Islem[]>> {
  return new Map((await kisiRolIslemSatirlari(db, kisiId)).map((k) => [k.id, islemleriBirlestir(k.butun_islemler, k.islemler)]));
}

// Etkin kişilerin seçim listesi (kimlik, ad, sicil no). İK personel kartındaki "TMI kullanıcısı" alanı bununla dolar.
export function kisiSecenekleri(db: Db): Promise<{ id: number; ad: string; sicilNo: string | null }[]> {
  return etkinKisiSecenekleri(db);
}

// Kullanıcı adından kişi no; yoksa null. Örnek veri yükleyen modüller örnek kişiyi (ornek.planlama gibi) bununla bulur.
export function kisiNoKullaniciAdindan(db: Db, kullaniciAdi: string): Promise<number | null> {
  return kullaniciAdindanKisiNo(db, kullaniciAdi);
}

// Kişi kartındaki görev; görev boşsa ya da kişi yoksa null. Yetki denetlemez: çağıran modül kendi ucunda denetler (portal unvanı).
export function kisiGorevi(db: Db, kisiId: number): Promise<string | null> {
  return kisiGorevBul(db, kisiId);
}

// Bütün roller (kimlik, kod, ad); ekip çağrısı yönlendirmesinin seçenekleri (298 a). Yetki denetlemez: çağıran uç denetler.
export function rolSecenekleri(db: Db): Promise<{ id: number; kod: string; ad: string }[]> {
  return rolKodSatirlari(db);
}

// Verilen rollerden birini taşıyan etkin ve girişli kişiler, kimlik sırasıyla. Boş dizide sorgu atılmaz.
export async function rollerdekiKisiler(db: Db, rolIdleri: readonly number[]): Promise<number[]> {
  if (rolIdleri.length === 0) return [];
  return rollerdekiKisiSatirlari(db, rolIdleri);
}

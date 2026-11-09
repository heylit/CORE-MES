import type { Db } from '#cekirdek/db.ts';
import { FAZLA_MESAI_TURLERI, resmiTatilTarihleri } from './kurallar.ts';
import { departmanSatirlari, gunDevamKisiNolari, izinliKisiNolari, kisilerinCikisSatirlari, kisilerinDepartmanSatirlari, resmiTatilListesi } from './sorgular.ts';

// IK-54: o gün onaylı izinde ya da raporda olan kişilerin kimlikleri (kisi.id); anomali hesabında bu kişiler beklenene girmez.
// Eşleme personel kartındaki "TMI kullanıcısı" alanıdır (ik_personel.kisi_id); bu alanı boş personelin izni sayılmaz.
export function izinliKisiler(db: Db, tarih: string): Promise<number[]> {
  return izinliKisiNolari(db, tarih);
}

// IK-76 (İdari İşler yemek sayısı): o gün fazla mesai, hafta tatili ya da resmi tatil çalışması kaydı olan kişilerin kimlikleri (kisi.id).
// Onay beklemede olan da sayılır (yemek önceden planlanır); eşleme ve bağsız personel IK-54 ile aynı.
export function gununFazlaMesaisi(db: Db, tarih: string): Promise<number[]> {
  return gunDevamKisiNolari(db, tarih, FAZLA_MESAI_TURLERI);
}

// IK-80 (soru 142 b): resmî tatillerin sahibi İK'dır. Vardiya takvimi tatil günlerini buradan okur; bordro aynı listeyi kullanır.
// İK ayarı hiç kaydedilmediyse liste boştur: bordro motorunun varsayılan listesi kimsenin girmediği günleri takvimde kapatmasın.
// Tarihler YYYY-AA-GG, aralık iki ucu dahil, tarih sırasıyla. Yetki denetlemez.
export async function resmiTatilGunleri(db: Db, baslangic: string, bitis: string): Promise<{ tarih: string; ad: string | null }[]> {
  return resmiTatilTarihleri((await resmiTatilListesi(db)) ?? [], baslangic, bitis);
}

// W8 (18.1): işten çıkan kişi çıkış tarihinden sonra takvimde ve kapasitede yoktur; Vardiya bu tarihi buradan okur. Çıkış günü çalışma
// günüdür (puantaj da yalnız sonrasını reddeder). Personel kaydı olmayan kişi haritada yoktur; çıkışı girilmemiş personel null. Tek sorgu,
// boş dizide sorgu atılmaz. Yetki denetlemez.
export async function kisilerinCikisTarihleri(db: Db, kisiIdleri: readonly number[]): Promise<Map<number, string | null>> {
  const tekil = [...new Set(kisiIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await kisilerinCikisSatirlari(db, tekil)).map((r) => [r.kisi_id, r.cikis_tarihi]));
}

// 2452: Vardiya iş günü sorgusu kişinin departmanını (departman varsayılan vardiyası), vardiya ekranı departman listesini okur. Personel
// kaydı olmayan kişi haritada yoktur; departmanı boş ya da iptal ise null. Tek sorgu, boş dizide sorgu atılmaz. Yetki denetlemez.
export async function kisilerinDepartmanlari(db: Db, kisiIdleri: readonly number[]): Promise<Map<number, number | null>> {
  const tekil = [...new Set(kisiIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await kisilerinDepartmanSatirlari(db, tekil)).map((r) => [r.kisi_id, r.departman_no]));
}
export const departmanListesi = (db: Db): Promise<{ no: number; ad: string }[]> => departmanSatirlari(db);
// 2452 (S3 a): vardiyası bulunamayan kişinin iş günü İK ayarıyla sayılır (pazartesi-cuma, ayar açıksa cumartesi).
export { cumartesiIsGunu } from './servis.ts';

// Kart #1322 (Arkon Operatör Özetim): kişinin fazla mesaisi, izinleri ve kalan yıllık izni. Kişi `ik_personel.kisi_id` ile eşleşir; bağı yoksa
// null döner. Yetki ve kapsam çağıranın ucundadır. Tarihler YYYY-AA-GG, aralıklar iki ucu dahil.
export { kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni } from './servis.ts';
// kisininIzinleri'nin toplu hâli (Vardiya takvimi, yük testi 2026-10-18): tek sorgu; personel kaydı olmayan kişi haritada yoktur.
export { kisilerinIzinleri } from './servis.ts';
export type { FazlaMesaiOzeti, KalanIzin, KisiIzni } from './servis.ts';
// Takvim (891): aralıkta başlayan izinler, personel adıyla; reddedilen ve iptal gelmez. Yetki denetlemez; çağıran ik.oku'yu denetler.
export { takvimKayitlari } from './servis.ts';

// Profil sayfası (her çalışan, kendi kaydı): İK kartından çalışana açık alanlar; ücret, kimlik, banka ve sağlık alanı dönmez. Bağ yoksa null.
export { kisininPersonelKarti } from './servis.ts';
export type { PersonelKarti } from './servis.ts';
// Puantaj planı (kart #1571) ve kişi sayfasının Vardiya bölümü (soru 75): Vardiya İK'yı okuduğu için ters yöndedir; çözücüleri sunucu/kablolama.ts bağlar (ADR 0006).
export { isGunuCozucusu, puantajAralikCozucusu, puantajTakvimCozucusu, vardiyaMatrisCozucusu, vardiyaTanimCozucusu } from './servis.ts';
export type { IsGunuCozucusu, PuantajAralikCozucusu, PuantajTakvimCozucusu, VardiyaMatrisCozucusu, VardiyaTanimCozucusu } from './servis.ts';
// IK-74 çıkış uyarısı (244 a): açık zimmetler İdari İşler'den, aynı ters bağla.
export { acikZimmetCozucusu } from './servis.ts';
export type { AcikZimmetCozucusu } from './servis.ts';
// 2602-a (2603 a, 2606 a): departman başına, çalışılan saatle ağırlıklı grup saat maliyeti; kişi başı değer ve brüt İK dışına çıkmaz.
// Ay "YYYY-MM". Küçük grupta (3 kişiden az) ekrana gidebilen iki işlev null verir; `...YalnizHesapIcin` gerçek değeri yalnız sunucu içi
// toplam hesabı için verir (cevaba konmaz). Aynı istekte aynı ay için bir kez çağrılır (her çağrı ayın puantajını okur). Yetki denetlemez.
export { grupSaatMaliyetleri, kisilerinGrupSaatMaliyeti, kisilerinGrupSaatMaliyetiYalnizHesapIcin } from './saat-maliyeti/servis.ts';
export type { GrupDegeri, KisiGrupDegeri } from './saat-maliyeti/servis.ts';
// IK-87 (2653, 2657 a): küçük grupların tek havuz değeri, YALNIZ SUNUCU İÇİ TOPLAM İÇİN (cevaba konmaz); havuz 3 kişiden azsa null.
export { kucukGrupHavuzuYalnizHesapIcin } from './saat-maliyeti/servis.ts';
export type { HavuzDegeri } from './saat-maliyeti/servis.ts';

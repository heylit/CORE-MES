import type { Db } from '#cekirdek/db.ts';
import { FAZLA_MESAI_TURLERI, resmiTatilTarihleri } from './kurallar.ts';
import { gunDevamKisiNolari, izinliKisiNolari, resmiTatilListesi } from './sorgular.ts';

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

// Kart #1322 (Arkon Operatör Özetim): kişinin fazla mesaisi, izinleri ve kalan yıllık izni. Kişi `ik_personel.kisi_id` ile eşleşir; bağı yoksa
// null döner. Yetki ve kapsam çağıranın ucundadır. Tarihler YYYY-AA-GG, aralıklar iki ucu dahil.
export { kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni } from './servis.ts';
// kisininIzinleri'nin toplu hâli (Vardiya takvimi, yük testi 2026-10-18): tek sorgu; personel kaydı olmayan kişi haritada yoktur.
export { kisilerinIzinleri } from './servis.ts';
export type { FazlaMesaiOzeti, KalanIzin, KisiIzni } from './servis.ts';

// Profil sayfası (her çalışan, kendi kaydı): İK kartından çalışana açık alanlar; ücret, kimlik, banka ve sağlık alanı dönmez. Bağ yoksa null.
export { kisininPersonelKarti } from './servis.ts';
export type { PersonelKarti } from './servis.ts';
// Puantaj planı (kart #1571) ve kişi sayfasının Vardiya bölümü (soru 75): Vardiya İK'yı okuduğu için ters yöndedir; çözücüleri sunucu/kablolama.ts bağlar (ADR 0006).
export { puantajAralikCozucusu, puantajTakvimCozucusu, vardiyaMatrisCozucusu, vardiyaTanimCozucusu } from './servis.ts';
export type { PuantajAralikCozucusu, PuantajTakvimCozucusu, VardiyaMatrisCozucusu, VardiyaTanimCozucusu } from './servis.ts';
// IK-74 çıkış uyarısı (244 a): açık zimmetler İdari İşler'den, aynı ters bağla.
export { acikZimmetCozucusu } from './servis.ts';
export type { AcikZimmetCozucusu } from './servis.ts';

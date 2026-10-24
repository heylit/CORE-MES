import { AQL_DEGERLERI, aqlMetni, SEVIYELER, YUZDE_YUZ } from '../aql.ts';
import { CIDDIYET, D8, DEV_TIP, FAI_CHK, GIRIS_CHK, HATA, IZLEN, KAYNAK, MRB, NCR_DURUM, SERTS, SUP_KAT } from '../sabitler.ts';
import { DOF_DURUMLARI, DOF_TURLERI, ETKINLIKLER, KOK_NEDEN_YONTEMLERI } from '../dof/dof-kurallari.ts';

// Modül formlarının boş çıktısı (uygulamadaki blankFields / blankInsp): alan adı satırları, seçimli alanda işaret kutulu seçenekler.
// Seçenekleri kayıtlardan gelen alan (tedarikçi, ilgili NCR) ve evet/hayır alanı boş kalır.

export interface BosSatir {
  etiket: string;
  kutular?: readonly string[];
  uzun?: boolean;
}

export type BosEk = { tur: 'd8' } | { tur: 'kalibrasyon' } | { tur: 'aql' };

export type BosForm =
  | { tur: 'alanlar'; satirlar: readonly BosSatir[]; ek?: BosEk }
  | { tur: 'muayene'; maddeler: readonly string[] };

const satir = (etiket: string, kutular?: readonly string[]): BosSatir => (kutular ? { etiket, kutular } : { etiket });
const uzun = (etiket: string): BosSatir => ({ etiket, uzun: true });

const NCR: readonly BosSatir[] = [
  satir('NCR no'), satir('Tespit tarihi'), satir('Tespit yeri', KAYNAK), satir('Ciddiyet', CIDDIYET), satir('Parça no'), satir('Parça adı'), satir('Revizyon'),
  satir('Lot / seri no'), satir('Proje'), satir('İş emri / sipariş'), satir('Etkilenen miktar'), satir('Hata tipi', HATA), satir('İlgili tedarikçi'), satir('Sorumlu'),
  satir('Durum', NCR_DURUM), uzun('Uygunsuzluk tanımı: gereksinim ne, mevcut durum ne'), satir('MRB kararı', MRB), satir('Karar gerekçesi ve onay referansı'),
];

const DOF: readonly BosSatir[] = [
  satir('DÖF no'), satir('İlgili NCR'), satir('Açılış'), satir('Termin'), satir('Problem başlığı'), satir('Sorumlu'), satir('Tür', DOF_TURLERI),
  satir('Kök neden yöntemi', KOK_NEDEN_YONTEMLERI), satir('Tamamlanan 8D adımı', ['Başlanmadı', ...D8.map((d, i) => `D${i + 1}: ${d}`)]), satir('Durum', DOF_DURUMLARI),
  uzun('Kök neden: oluşma ve kaçma nedeni'), uzun('Kalıcı aksiyonlar'), satir('Etkinlik doğrulaması', ETKINLIKLER), satir('Doğrulama kanıtı (veri, süre, numune)'),
];

const CIHAZ: readonly BosSatir[] = [
  satir('Cihaz kodu'), satir('Cihaz adı'), satir('Tip', DEV_TIP), satir('Marka / model'), satir('Seri no'), satir('Lokasyon / sorumlu'), satir('Ölçüm aralığı'),
  satir('Çözünürlük'), satir('Son kalibrasyon'), satir('Periyot (ay)'), satir('Periyot gerekçesi'), satir('Kalibrasyon laboratuvarı'), satir('İzlenebilirlik kaynağı', IZLEN),
  satir('Son sertifika no'), satir('Kullanım durumu'),
];

const TEDARIKCI: readonly BosSatir[] = [
  satir('Tedarikçi kodu'), satir('Firma adı'), satir('Kategori', SUP_KAT), satir('Onay durumu', ['Onaylı', 'Şartlı onaylı', 'Aday', 'Askıda']),
  satir('Kritiklik', ['Kritik', 'Önemli', 'Standart']), satir('Yetkili üretici / distribütör', ['Uygulanamaz', 'Evet', 'Hayır']), satir('En yakın sertifika bitişi'),
  satir('Sertifikalar', SERTS), satir('Kalite skoru (0–100)'), satir('Zamanında teslimat (0–100)'), satir('Son tedarikçi denetimi'), satir('Kalite irtibatı'),
  uzun('Not / şartlar (flow-down)'),
];

const LOT: readonly BosSatir[] = [
  satir('Muayene tarihi'), satir('Parça no'), satir('Parça adı'), satir('Tedarikçi'), satir('Lot / parti no'), satir('İş emri / sipariş'), satir('Parti büyüklüğü (N)'),
  satir('Muayene seviyesi', SEVIYELER), satir('Kritik', [YUZDE_YUZ, ...AQL_DEGERLERI].map(aqlMetni)), satir('Majör AQL', AQL_DEGERLERI.map(aqlMetni)),
  satir('Minör AQL', AQL_DEGERLERI.map(aqlMetni)), satir('Muayeneci'), satir('Sunum'), satir('Bulunan kritik'), satir('Bulunan majör'), satir('Bulunan minör'),
  uzun('Hata açıklaması / not'),
];

export const BOS_FORMLAR: Readonly<Record<string, BosForm>> = {
  'KF-01': { tur: 'alanlar', satirlar: NCR },
  'KF-02': { tur: 'alanlar', satirlar: DOF, ek: { tur: 'd8' } },
  'KF-03': { tur: 'muayene', maddeler: GIRIS_CHK },
  'KF-04': { tur: 'muayene', maddeler: FAI_CHK },
  'KF-05': { tur: 'muayene', maddeler: [] },
  'KF-06': { tur: 'alanlar', satirlar: CIHAZ, ek: { tur: 'kalibrasyon' } },
  'KF-07': { tur: 'alanlar', satirlar: TEDARIKCI },
  'KF-12': { tur: 'alanlar', satirlar: LOT, ek: { tur: 'aql' } },
};

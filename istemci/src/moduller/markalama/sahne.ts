import { Quaternion, Vector3 } from 'three';
import type { MarkalamaAlani } from '#paylasilan/sozlesme/markalama.ts';

export type Yer = NonNullable<MarkalamaAlani['yer']>;

// Yeni seçilen yerin varsayılan ölçüsü (mm); kullanıcı alanın altında değiştirir.
export const VARSAYILAN_EN_MM = 40;
export const VARSAYILAN_BOY_MM = 8;

const yuvarla = (x: number, basamak: number): number => Math.round(x * 10 ** basamak) / 10 ** basamak || 0;

// Yer modelin sahne çerçevesindedir (Y yukarı, milimetre; model okuyucusunun çevirdiği eksen). Aynı revizyon her açılışta
// aynı çerçeveye oturur; revizyon değişirse yer yeniden seçilir (tanım revizyonu tutar).
export function yerOlustur(nokta: Vector3, normal: Vector3, enMm = VARSAYILAN_EN_MM, boyMm = VARSAYILAN_BOY_MM, aciDerece = 0): Yer {
  const n = normal.clone().normalize();
  return {
    merkez: [yuvarla(nokta.x, 2), yuvarla(nokta.y, 2), yuvarla(nokta.z, 2)],
    normal: [yuvarla(n.x, 4), yuvarla(n.y, 4), yuvarla(n.z, 4)],
    enMm,
    boyMm,
    aciDerece,
  };
}

// Markanın düzlemi (+Z normalli dikdörtgen) yüzeyin normaline çevrilir, sonra normal çevresinde açı kadar döner.
export function yonelim(yer: Yer): Quaternion {
  const n = new Vector3(...yer.normal);
  if (n.lengthSq() === 0) n.set(0, 0, 1);
  n.normalize();
  const yuze = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  const don = new Quaternion().setFromAxisAngle(n, (yer.aciDerece * Math.PI) / 180);
  return don.multiply(yuze);
}

import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ANAHTAR_DEGISKENI, SERTIFIKA_DEGISKENI } from '../../istemci/src/ortak/pwa/https.ts';

// Arayüz kapısının (4101) HTTPS'i ve sertifikanın bitişi, açılışta denetlenen aynı iki değişkenden okunur. Değişkenler yoksa
// kapı düz HTTP'dir. Önde HTTPS'i bitiren bir ters vekil varsa sertifika onundur; bu okuyucu onu göremez.
export interface HttpsDurumu {
  acik: boolean;
  // Sertifika okunamadıysa null: bitiş bilinmiyor, uydurulmaz.
  sertifikaBitis: Date | null;
}

export type DosyaOkuyucu = (yol: string) => Buffer;

export function httpsDurumuOku(ortam: Record<string, string | undefined> = process.env, oku: DosyaOkuyucu = readFileSync): HttpsDurumu {
  const sertifika = ortam[SERTIFIKA_DEGISKENI]?.trim() ?? '';
  const anahtar = ortam[ANAHTAR_DEGISKENI]?.trim() ?? '';
  if (sertifika === '' || anahtar === '') return { acik: false, sertifikaBitis: null };
  return { acik: true, sertifikaBitis: bitisOku(sertifika, oku) };
}

function bitisOku(dosya: string, oku: DosyaOkuyucu): Date | null {
  try {
    const bitis = new Date(new X509Certificate(oku(dosya)).validTo);
    return Number.isNaN(bitis.getTime()) ? null : bitis;
  } catch {
    return null;
  }
}

// Canlıda HTTPS'i ters vekil bitirir (IIS, kurulum/canli.md) ve sertifikası bu süreçten görünmez. Bilgi işlem vekilin sertifikasının
// açık kısmını (.cer, anahtarsız) bir dosyaya verir ve yolunu bu değişkene yazar; bitiş yalnız izlenir, kapı bu dosyayı kullanmaz.
export const IZLENEN_SERTIFIKA_DEGISKENI = 'TMIV2_IZLENEN_SERTIFIKA';

// Değişken boşsa tanımlı değildir; dosya okunamıyorsa bitiş bilinmiyor (null).
export function izlenenSertifikaOku(
  ortam: Record<string, string | undefined> = process.env, oku: DosyaOkuyucu = readFileSync,
): { tanimli: boolean; bitis: Date | null } {
  const dosya = ortam[IZLENEN_SERTIFIKA_DEGISKENI]?.trim() ?? '';
  return dosya === '' ? { tanimli: false, bitis: null } : { tanimli: true, bitis: bitisOku(dosya, oku) };
}

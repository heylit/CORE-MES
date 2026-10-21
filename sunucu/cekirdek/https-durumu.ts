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
  try {
    const bitis = new Date(new X509Certificate(oku(sertifika)).validTo);
    return { acik: true, sertifikaBitis: Number.isNaN(bitis.getTime()) ? null : bitis };
  } catch {
    return { acik: true, sertifikaBitis: null };
  }
}

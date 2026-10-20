import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createSecureContext } from 'node:tls';

// Telefonun bağlandığı kapı (4101, `vite preview` ve geliştirme sunucusu) HTTPS'i bu iki değişkenle sunar (kart #1278).
// İkisi de yoksa düz HTTP sürer; biri eksik ya da dosya kullanılamazsa açılış Türkçe iletiyle durur. Kurulum: kurulum/https.md.
export const SERTIFIKA_DEGISKENI = 'TMIV2_HTTPS_SERTIFIKA';
export const ANAHTAR_DEGISKENI = 'TMIV2_HTTPS_ANAHTAR';

export interface HttpsAyari { cert: Buffer; key: Buffer }

export interface DosyaIslemleri {
  varMi(yol: string): boolean;
  okunurMu(yol: string): boolean;
  oku(yol: string): Buffer;
  // Sertifika ile anahtarın birlikte kullanılabildiğini sınar; kullanılamazsa hata atar.
  dogrula(ayar: HttpsAyari): void;
}

const GERCEK: DosyaIslemleri = {
  varMi: existsSync,
  okunurMu: (yol) => {
    try { accessSync(yol, constants.R_OK); return true; } catch { return false; }
  },
  oku: (yol) => readFileSync(yol),
  dogrula: (ayar) => { createSecureContext(ayar); },
};

function dosyaAl(degisken: string, yol: string, d: DosyaIslemleri): Buffer {
  if (!isAbsolute(yol)) throw new Error(`${degisken} mutlak yol olmalı: ${yol}`);
  if (!d.varMi(yol)) throw new Error(`${degisken} dosyası bulunamadı: ${yol}`);
  if (!d.okunurMu(yol)) throw new Error(`${degisken} dosyası okunamıyor (izin yok): ${yol}`);
  return d.oku(yol);
}

export function httpsAyari(ortam: Record<string, string | undefined> = process.env, d: DosyaIslemleri = GERCEK): HttpsAyari | null {
  const sertifika = ortam[SERTIFIKA_DEGISKENI]?.trim() ?? '';
  const anahtar = ortam[ANAHTAR_DEGISKENI]?.trim() ?? '';
  if (sertifika === '' && anahtar === '') return null;
  if (sertifika === '' || anahtar === '') {
    const eksik = sertifika === '' ? SERTIFIKA_DEGISKENI : ANAHTAR_DEGISKENI;
    throw new Error(`HTTPS için ${SERTIFIKA_DEGISKENI} ve ${ANAHTAR_DEGISKENI} birlikte verilir; ${eksik} eksik.`);
  }
  const ayar = { cert: dosyaAl(SERTIFIKA_DEGISKENI, sertifika, d), key: dosyaAl(ANAHTAR_DEGISKENI, anahtar, d) };
  try {
    d.dogrula(ayar);
  } catch (hata) {
    const neden = hata instanceof Error ? hata.message : String(hata);
    throw new Error(`HTTPS sertifikası ya da anahtarı kullanılamadı (PEM biçiminde olmalı ve birbirine ait olmalı): ${neden}`);
  }
  return ayar;
}

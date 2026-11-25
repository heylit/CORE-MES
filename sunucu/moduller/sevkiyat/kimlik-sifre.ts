import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Şoför kimlik no'su (kullanıcı kararı 25.11, kart 3685: şifreli ve yetkili saklanır, loglara yazılmaz). Saf yardımcı: anahtarı çağıran verir; kimse çağırmaz,
// sütun, göç, uç ve okuma rolü kararı (kimin tam göreceği) bekliyor. AES-256-GCM, her değere yeni rastgele nonce; biçim `1.<nonce>.<etiket>.<şifreli>` (base64url).
const SURUM = '1';
const ANAHTAR_BAYT = 32;

// Anahtar 32 bayt, ortam değişkeninde base64 (ad: TMIV2_KISISEL_VERI_ANAHTARI; okuyan kablolama yapar). Bozuksa null: alan kapalı kalır.
export function anahtarCoz(base64: string | undefined): Buffer | null {
  if (base64 === undefined || base64.trim() === '') return null;
  const b = Buffer.from(base64.trim(), 'base64');
  return b.length === ANAHTAR_BAYT ? b : null;
}

export function kimlikSifrele(deger: string, anahtar: Buffer): string {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', anahtar, nonce);
  const sifreli = Buffer.concat([c.update(deger, 'utf8'), c.final()]);
  return [SURUM, nonce.toString('base64url'), c.getAuthTag().toString('base64url'), sifreli.toString('base64url')].join('.');
}

// Yanlış anahtar, bozuk ya da oynanmış değerde null; hata iletisine değer girmez.
export function kimlikCoz(metin: string, anahtar: Buffer): string | null {
  const [surum, nonce, etiket, sifreli] = metin.split('.');
  if (surum !== SURUM || nonce === undefined || etiket === undefined || sifreli === undefined) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', anahtar, Buffer.from(nonce, 'base64url'));
    d.setAuthTag(Buffer.from(etiket, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(sifreli, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

// Ekranda yalnız son üç hane görünür.
export const kimlikMaskele = (deger: string): string => (deger.length <= 3 ? '*'.repeat(deger.length) : `${'*'.repeat(deger.length - 3)}${deger.slice(-3)}`);

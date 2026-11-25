import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Şoför kimlik no'su (kullanıcı kararı 25.11, kart 3685: şifreli ve yetkili saklanır, loglara yazılmaz). Saf yardımcı: anahtarı çağıran verir; kimse çağırmaz,
// sütun, göç, uç ve okuma rolü kararı (kimin tam göreceği) bekliyor. AES-256-GCM, her değere yeni rastgele nonce; biçim `1.<nonce>.<etiket>.<şifreli>` (base64url).
const SURUM = '1';
const ANAHTAR_BAYT = 32;
// Kısaltılmış etiket sahtecilik payını düşürür (Risk N1): yalnız tam 16 bayt kabul edilir.
const ETIKET_BAYT = 16;

// Anahtar 32 bayt, ortam değişkeninde base64 (ad: TMIV2_KISISEL_VERI_ANAHTARI; okuyan kablolama yapar). Bozuksa null: alan kapalı kalır.
export function anahtarCoz(base64: string | undefined): Buffer | null {
  if (base64 === undefined || base64.trim() === '') return null;
  const b = Buffer.from(base64.trim(), 'base64');
  return b.length === ANAHTAR_BAYT ? b : null;
}

// ek: ek doğrulama verisi (AAD, Risk N2): şifreli değer yazıldığı satıra bağlanır; başka satıra kopyalanırsa çözülmez. Verilmezse eski davranış.
export function kimlikSifrele(deger: string, anahtar: Buffer, ek?: string): string {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', anahtar, nonce, { authTagLength: ETIKET_BAYT });
  if (ek !== undefined) c.setAAD(Buffer.from(ek, 'utf8'));
  const sifreli = Buffer.concat([c.update(deger, 'utf8'), c.final()]);
  return [SURUM, nonce.toString('base64url'), c.getAuthTag().toString('base64url'), sifreli.toString('base64url')].join('.');
}

// Yanlış anahtar, bozuk ya da oynanmış değerde null; hata iletisine değer girmez.
export function kimlikCoz(metin: string, anahtar: Buffer, ek?: string): string | null {
  const [surum, nonce, etiket, sifreli] = metin.split('.');
  if (surum !== SURUM || nonce === undefined || etiket === undefined || sifreli === undefined) return null;
  try {
    const e = Buffer.from(etiket, 'base64url');
    if (e.length !== ETIKET_BAYT) return null;
    const d = createDecipheriv('aes-256-gcm', anahtar, Buffer.from(nonce, 'base64url'), { authTagLength: ETIKET_BAYT });
    d.setAuthTag(e);
    if (ek !== undefined) d.setAAD(Buffer.from(ek, 'utf8'));
    return Buffer.concat([d.update(Buffer.from(sifreli, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

// Ekranda yalnız son üç hane görünür.
export const kimlikMaskele = (deger: string): string => (deger.length <= 3 ? '*'.repeat(deger.length) : `${'*'.repeat(deger.length - 3)}${deger.slice(-3)}`);

export const KIMLIK_ANAHTARI_DEGISKENI = 'TMIV2_KISISEL_VERI_ANAHTARI';
// Her istekte okunur (önbellek yok): anahtar yoksa ya da bozuksa alan kapalıdır (null).
export const kisiselVeriAnahtari = (env: Readonly<Record<string, string | undefined>> = process.env): Buffer | null => anahtarCoz(env[KIMLIK_ANAHTARI_DEGISKENI]);

// Biçim ve sağlama denetimi ekranla ortaktır (paylasilan/kimlik-no.ts).
export { kimlikGecerliMi } from '#paylasilan/kimlik-no.ts';
// Silme süresi: sevk tarihinden sonra bu kadar gün saklanır (VARSAYIM 90).
export const KIMLIK_SAKLAMA_GUN = 90;

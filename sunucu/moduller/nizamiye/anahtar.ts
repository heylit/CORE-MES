import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Cihaz anahtarı (ADR 0016): 32 rastgele bayt, onaltılık. Yalnız scrypt özeti saklanır; karşılaştırma sabit sürelidir.
const scryptAsync = promisify(scrypt) as (anahtar: string, tuz: Buffer, uzunluk: number) => Promise<Buffer>;
const OZET_UZUNLUGU = 64;

export const anahtarUret = (): string => randomBytes(32).toString('hex');

export async function anahtarOzeti(anahtar: string): Promise<string> {
  const tuz = randomBytes(16);
  return `scrypt$${tuz.toString('hex')}$${(await scryptAsync(anahtar, tuz, OZET_UZUNLUGU)).toString('hex')}`;
}

// Kayıtlı cihaz yoksa da aynı süre harcanır: yanıt süresinden adresin kayıtlı olup olmadığı okunmasın.
const BOS_OZET = `scrypt$${'0'.repeat(32)}$${'0'.repeat(OZET_UZUNLUGU * 2)}`;

export async function anahtarDogruMu(anahtar: string, ozet: string | null): Promise<boolean> {
  const [, tuz = '', beklenen = ''] = (ozet ?? BOS_OZET).split('$');
  const hesap = await scryptAsync(anahtar, Buffer.from(tuz, 'hex'), OZET_UZUNLUGU);
  const b = Buffer.from(beklenen, 'hex');
  return ozet !== null && b.length === hesap.length && timingSafeEqual(b, hesap);
}

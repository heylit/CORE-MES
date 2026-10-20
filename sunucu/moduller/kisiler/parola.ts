import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const UZUNLUK = 32;

function turet(parola: string, tuz: Buffer, n: number, r: number, p: number, uzunluk: number): Promise<Buffer> {
  return new Promise((coz, reddet) => {
    scrypt(parola.normalize('NFKC'), tuz, uzunluk, { N: n, r, p }, (hata, anahtar) => (hata ? reddet(hata) : coz(anahtar)));
  });
}

// Biçim: scrypt$N$r$p$tuz$ozet. Maliyet özetin içinde durur; ileride artırılırsa eski özetler doğrulanmaya devam eder.
export async function parolaOzetle(parola: string): Promise<string> {
  const tuz = randomBytes(16);
  const ozet = await turet(parola, tuz, N, R, P, UZUNLUK);
  return ['scrypt', N, R, P, tuz.toString('base64url'), ozet.toString('base64url')].join('$');
}

export async function parolaDogrula(parola: string, kayitli: string): Promise<boolean> {
  const [tur, n, r, p, tuz, ozet] = kayitli.split('$');
  if (tur !== 'scrypt' || !n || !r || !p || !tuz || !ozet) return false;
  const beklenen = Buffer.from(ozet, 'base64url');
  const hesaplanan = await turet(parola, Buffer.from(tuz, 'base64url'), Number(n), Number(r), Number(p), beklenen.length);
  return timingSafeEqual(hesaplanan, beklenen);
}

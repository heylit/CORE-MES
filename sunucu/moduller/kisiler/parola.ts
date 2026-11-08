import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// 2226-4 a: 16384'ten 4 kat. Bellek 128·N·r = 64 MB; Node'un varsayılan 32 MB sınırı bu yüzden açıkça yükseltilir. Eski özetler
// kendi maliyetiyle doğrulanır ve girişte bu maliyete yenilenir (yenidenOzetlenmeli).
export const URETIM_N = 65536;
// Testte düşük maliyet yalnız açık çağrıyla gelir (testParolaMaliyetiAyarla); hiçbir ortam değişkeni N'yi düşüremez.
export const TEST_N = 1024;
// Seçim saftır: istek yoksa ya da ortam test değilse üretim maliyeti. Canlı süreç ayarlayıcıyı hiç çağırmaz; çağırsa da
// TMIV2_ORTAM=test değilse yok sayılır.
export function maliyetSec(istenen: number | null, ortam: string | undefined): number {
  return istenen !== null && ortam === 'test' ? istenen : URETIM_N;
}
let N = URETIM_N;
// Yalnız test dosyalarından çağrılır; null üretim maliyetine döndürür.
export function testParolaMaliyetiAyarla(n: number | null = TEST_N): void {
  N = maliyetSec(n, process.env.TMIV2_ORTAM);
}
const R = 8;
const P = 1;
const UZUNLUK = 32;
// Özetteki N sınırsız güvenilmez: bozuk ya da kötü niyetli bir kayıt sunucuyu bellekten düşürmesin.
const AZAMI_N = 1 << 17;

function turet(parola: string, tuz: Buffer, n: number, r: number, p: number, uzunluk: number): Promise<Buffer> {
  return new Promise((coz, reddet) => {
    scrypt(parola.normalize('NFKC'), tuz, uzunluk, { N: n, r, p, maxmem: 256 * n * r }, (hata, anahtar) => (hata ? reddet(hata) : coz(anahtar)));
  });
}

// Biçim: scrypt$N$r$p$tuz$ozet. Maliyet özetin içinde durur; ileride artırılırsa eski özetler doğrulanmaya devam eder.
export async function parolaOzetle(parola: string, n = N): Promise<string> {
  const tuz = randomBytes(16);
  const ozet = await turet(parola, tuz, n, R, P, UZUNLUK);
  return ['scrypt', n, R, P, tuz.toString('base64url'), ozet.toString('base64url')].join('$');
}

export async function parolaDogrula(parola: string, kayitli: string): Promise<boolean> {
  const [tur, n, r, p, tuz, ozet] = kayitli.split('$');
  if (tur !== 'scrypt' || !n || !r || !p || !tuz || !ozet || Number(n) > AZAMI_N) return false;
  const beklenen = Buffer.from(ozet, 'base64url');
  const hesaplanan = await turet(parola, Buffer.from(tuz, 'base64url'), Number(n), Number(r), Number(p), beklenen.length);
  return timingSafeEqual(hesaplanan, beklenen);
}

// Özet bugünkü maliyetten düşükse doğru sır girildiğinde yeniden özetlenir; kimse parola değiştirmek zorunda kalmaz.
export function yenidenOzetlenmeli(kayitli: string, hedefN = N): boolean {
  const [tur, n, r, p] = kayitli.split('$');
  return tur === 'scrypt' && (Number(n) < hedefN || Number(r) !== R || Number(p) !== P);
}

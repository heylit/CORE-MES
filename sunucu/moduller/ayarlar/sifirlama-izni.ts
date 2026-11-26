import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';

// "Sıfırdan başla" imzalı izin (3728). Sunucu bir istek metni üretir; kullanıcı onu yalnız kendisinde duran gizli anahtarla
// (araclar/sifirlama-imza.mjs) imzalar; sunucu imzayı aşağıdaki açık anahtarla doğrular. Anahtar kodda durur: sunucu ayarından
// değiştirilebilseydi sunucuya erişen kendi anahtarını koyup kapıyı atlatırdı (karar 3728, açık anahtar istisnası kullanıcı onaylı).
// Anahtar yoksa (null) sıfırlama hiçbir ortamda açılmaz. Parmak izi 918B-1A03-FAF2-0737 (kullanıcının USB'deki anahtarıyla aynı olmalı).
export const SIFIRLAMA_ACIK_ANAHTARI: string | null =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAklKedAlKc4XO9JU6Q0jtfKIFNU6biFc0TLz16iCuCfo=\n-----END PUBLIC KEY-----\n';
export const SIFIRLAMA_PARMAK_IZI = '918B-1A03-FAF2-0737';

export const SIFIRLAMA_IZIN_SURESI_MS = 60 * 60_000;
export const SIFIRLAMA_ISTEK_TURU = 'coremes-sifirlama';

// Test kendi ürettiği anahtarı koyar. Yalnız aynı süreçteki kod çağırabilir (ayar ya da uç yolu yoktur) ve canlıda reddedilir.
let testAnahtari: string | null = null;
export function sifirlamaTestAnahtariKoy(pem: string | null): void {
  if (process.env['TMIV2_ORTAM'] === 'canli') throw new Error('Test anahtarı canlıda konmaz.');
  testAnahtari = pem;
}

export function sifirlamaDogrulamaAnahtari(): string | null {
  return testAnahtari ?? SIFIRLAMA_ACIK_ANAHTARI;
}

// Araçla aynı hesap: açık anahtarın SPKI DER özetinin ilk 16 hanesi, dörder gruplu. Kullanıcı USB'deki anahtarla karşılaştırır.
export function parmakIzi(pem: string): string {
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g)!.join('-');
}

export interface SifirlamaIstegi { kurulum: string; ortam: string; sayi: string; son: string }

// Alan sırası sabittir; metin saklanır ve imza bu baytlar üzerinden doğrulanır, yeniden üretilmez.
export function sifirlamaIstekMetni(i: SifirlamaIstegi): string {
  return JSON.stringify({ tur: SIFIRLAMA_ISTEK_TURU, surum: 1, kurulum: i.kurulum, ortam: i.ortam, sayi: i.sayi, son: i.son });
}

export function yeniSifirlamaIstegi(kurulum: string, ortam: string, simdi: Date): SifirlamaIstegi {
  return { kurulum, ortam, sayi: randomUUID(), son: new Date(simdi.getTime() + SIFIRLAMA_IZIN_SURESI_MS).toISOString() };
}

// İzin dosyasındaki istek metni ve imza; biçim bozuksa null (imza denetimine gelmeden reddedilir).
export function izniCoz(izin: { istek: string; imza: string }): { metin: string; imza: Buffer; istek: SifirlamaIstegi } | null {
  const metin = Buffer.from(izin.istek, 'base64').toString('utf8');
  const imza = Buffer.from(izin.imza, 'base64');
  if (imza.length !== 64) return null;
  let ham: unknown;
  try { ham = JSON.parse(metin); } catch { return null; }
  if (typeof ham !== 'object' || ham === null) return null;
  const a = ham as Record<string, unknown>;
  if (a['tur'] !== SIFIRLAMA_ISTEK_TURU || a['surum'] !== 1) return null;
  const { kurulum, ortam, sayi, son } = a;
  if (typeof kurulum !== 'string' || typeof ortam !== 'string' || typeof sayi !== 'string' || typeof son !== 'string') return null;
  if (!/^[0-9a-f-]{36}$/.test(sayi)) return null;
  return { metin, imza, istek: { kurulum, ortam, sayi, son } };
}

export function imzaGecerliMi(metin: string, imza: Buffer, pem: string): boolean {
  try {
    return verify(null, Buffer.from(metin, 'utf8'), createPublicKey(pem), imza);
  } catch {
    return false;
  }
}

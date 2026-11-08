import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';

// Cihaza bağlı oturum (DBSC, W3C webappsec-dbsc; 2226-6 a). Tarayıcı cihazın güvenlik çipinde dışarı çıkmayan bir anahtar
// üretir; kısa ömürlü bağ çerezi yalnız o anahtarla imzalanmış kanıtla yenilenir. Çalınan oturum çerezi bağ çerezi olmadan,
// çalınan bağ çerezi de ömrü dolunca işe yaramaz. Desteklemeyen tarayıcı kayıt başlığını yok sayar, oturumu bugünkü gibi sürer.

export const BAG_CEREZI = 'oturum_bagi';
export const BAG_CEREZ_SN = 10 * 60;
export const BAG_KAYIT_YOLU = '/api/oturum/cihaz-bagi/kayit';
export const BAG_YENILE_YOLU = '/api/oturum/cihaz-bagi/yenile';
// Meydan okuma, tarayıcının imzalayıp geri getirmesi için yeterince uzun yaşar; eskisi tekrar kullanılamaz.
export const MEYDAN_SN = 5 * 60;
export const DESTEKLENEN_ALG = ['ES256', 'RS256'] as const;
export type BagAlg = (typeof DESTEKLENEN_ALG)[number];

// Meydan okuma durumsuzdur: 403 cevabı transaction'ı geri aldığından sunucuda saklanamaz. Süreç başına gizli anahtarla
// imzalanır; süreç yeniden başlarsa eski meydan geçersiz olur, tarayıcı yenisini ister.
const SUREC_SIRRI = randomBytes(32);

function imza(amac: string, bag: string, zamanSn: number, rastgele: string): string {
  return createHmac('sha256', SUREC_SIRRI).update(`${amac}\n${bag}\n${zamanSn}\n${rastgele}`).digest('base64url');
}

export function meydanUret(amac: 'kayit' | 'yenile', bag: string, simdiMs = Date.now()): string {
  const zamanSn = Math.floor(simdiMs / 1000);
  const rastgele = randomBytes(12).toString('base64url');
  return `${zamanSn}.${rastgele}.${imza(amac, bag, zamanSn, rastgele)}`;
}

export function meydanGecerliMi(meydan: string, amac: 'kayit' | 'yenile', bag: string, simdiMs = Date.now()): boolean {
  const parca = meydan.split('.');
  if (parca.length !== 3) return false;
  const [zamanMetni = '', rastgele = '', gelen = ''] = parca;
  const zamanSn = Number(zamanMetni);
  if (!Number.isInteger(zamanSn)) return false;
  const yas = Math.floor(simdiMs / 1000) - zamanSn;
  if (yas < 0 || yas > MEYDAN_SN) return false;
  const beklenen = Buffer.from(imza(amac, bag, zamanSn, rastgele));
  const gelenTampon = Buffer.from(gelen);
  return beklenen.length === gelenTampon.length && timingSafeEqual(beklenen, gelenTampon);
}

// RFC 8941 sf-string: tırnaklı, içinde yalnız \" ve \\ kaçışı. Parametreler (;id=...) yok sayılır.
export function sfMetniCoz(baslik: string | null): string | null {
  if (baslik === null) return null;
  const m = /^\s*"((?:[^"\\]|\\["\\])*)"/.exec(baslik);
  return m?.[1] === undefined ? null : m[1].replace(/\\(["\\])/g, '$1');
}

function sfMetni(deger: string): string {
  return `"${deger.replace(/[\\"]/g, (k) => `\\${k}`)}"`;
}

export function kayitBasligi(meydan: string): string {
  return `(${DESTEKLENEN_ALG.join(' ')});path=${sfMetni(BAG_KAYIT_YOLU)};challenge=${sfMetni(meydan)}`;
}

export function meydanBasligi(meydan: string, oturumKimligi: string): string {
  return `${sfMetni(meydan)};id=${sfMetni(oturumKimligi)}`;
}

export interface BagTalimati {
  session_identifier: string;
  refresh_url: string;
  scope: { include_site: boolean };
  credentials: { type: 'cookie'; name: string; attributes: string }[];
}

// Öznitelikler kapının yazdığı bağ çereziyle aynı olmalıdır (cekirdek/cerez.ts); DBSC yalnız HTTPS'te çalışır, Secure hep vardır.
export function bagTalimati(oturumKimligi: string): BagTalimati {
  return {
    session_identifier: oturumKimligi,
    refresh_url: BAG_YENILE_YOLU,
    scope: { include_site: false },
    credentials: [{ type: 'cookie', name: BAG_CEREZI, attributes: 'Path=/; HttpOnly; SameSite=Strict; Secure' }],
  };
}

export interface KanitBasi { typ: string; alg: string; jwk?: JsonWebKey }
export interface Kanit { bas: KanitBasi; govde: Record<string, unknown>; imzali: string; imza: Buffer }

function parcaCoz(metin: string): Record<string, unknown> | null {
  try {
    const deger: unknown = JSON.parse(Buffer.from(metin, 'base64url').toString('utf8'));
    return typeof deger === 'object' && deger !== null && !Array.isArray(deger) ? deger as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function kanitCoz(jwt: string | null): Kanit | null {
  if (jwt === null) return null;
  const parca = jwt.trim().split('.');
  if (parca.length !== 3) return null;
  const [basMetni = '', govdeMetni = '', imzaMetni = ''] = parca;
  const bas = parcaCoz(basMetni);
  const govde = parcaCoz(govdeMetni);
  if (bas === null || govde === null || typeof bas.typ !== 'string' || typeof bas.alg !== 'string') return null;
  const jwk = typeof bas.jwk === 'object' && bas.jwk !== null ? bas.jwk as JsonWebKey : undefined;
  return {
    bas: { typ: bas.typ, alg: bas.alg, ...(jwk === undefined ? {} : { jwk }) },
    govde, imzali: `${basMetni}.${govdeMetni}`, imza: Buffer.from(imzaMetni, 'base64url'),
  };
}

function algDestekli(alg: string): alg is BagAlg {
  return (DESTEKLENEN_ALG as readonly string[]).includes(alg);
}

function imzaDogruMu(kanit: Kanit, alg: BagAlg, jwk: JsonWebKey): boolean {
  try {
    const anahtar = createPublicKey({ key: jwk, format: 'jwk' });
    if (alg === 'ES256') {
      if (anahtar.asymmetricKeyType !== 'ec' || anahtar.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return false;
      return verify('sha256', Buffer.from(kanit.imzali), { key: anahtar, dsaEncoding: 'ieee-p1363' }, kanit.imza);
    }
    if (anahtar.asymmetricKeyType !== 'rsa' || (anahtar.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return false;
    return verify('sha256', Buffer.from(kanit.imzali), anahtar, kanit.imza);
  } catch {
    return false;
  }
}

// Kayıt kanıtı: başlıkta açık anahtar (jwk) vardır, jti kayıt meydanıdır. "none" kabul edilmez: imzasız bağ bağ değildir.
export function kayitKanitiniDogrula(kanit: Kanit | null): { alg: BagAlg; jwk: JsonWebKey; jti: string } | null {
  if (kanit === null || kanit.bas.typ !== 'dbsc+jwt' || !algDestekli(kanit.bas.alg) || kanit.bas.jwk === undefined) return null;
  const jti = kanit.govde.jti;
  if (typeof jti !== 'string' || !imzaDogruMu(kanit, kanit.bas.alg, kanit.bas.jwk)) return null;
  const { kty, crv, x, y, n, e } = kanit.bas.jwk;
  const jwk: JsonWebKey = kanit.bas.alg === 'ES256' ? { kty, crv, x, y } : { kty, n, e };
  return { alg: kanit.bas.alg, jwk, jti };
}

// Yenileme kanıtı: başlıkta jwk olmaz; kayıtta saklanan anahtarla doğrulanır.
export function yenilemeKanitiniDogrula(kanit: Kanit | null, alg: string, jwk: JsonWebKey): string | null {
  if (kanit === null || kanit.bas.typ !== 'dbsc+jwt' || kanit.bas.alg !== alg || !algDestekli(alg) || kanit.bas.jwk !== undefined) return null;
  const jti = kanit.govde.jti;
  return typeof jti === 'string' && imzaDogruMu(kanit, alg, jwk) ? jti : null;
}

export function bagBelirteciUret(): string {
  return randomBytes(32).toString('base64url');
}

export function oturumKimligiUret(): string {
  return randomBytes(18).toString('base64url');
}

export function cihazBagiAcikMi(ortam: NodeJS.ProcessEnv = process.env): boolean {
  return ortam.TMIV2_CIHAZ_BAGI !== 'kapali';
}

import { createECDH, createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { Veritabani } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import * as s from './sorgular.ts';

// ADR 0031: uygulamanın internete istek attığı tek dosya. Yalnız izin listesindeki push servislerine, gövdesiz sinyal gider;
// başlık, metin, kişi adı, kayıt numarası ya da yol gönderilmez. Cihaz ayrıntıyı iç sunucudan kendisi çeker.
// Varsayılan kapalı: TMIV2_PUSH_ACIK=1 yoksa hiç istek atılmaz. Anahtar ve iletişim adresi yalnız ortam değişkenindedir.
export const PUSH_DEGISKENLERI = ['TMIV2_PUSH_ACIK', 'TMIV2_PUSH_VAPID_OZEL', 'TMIV2_PUSH_KONU'] as const;

// Yayımlanmış push servisi ana bilgisayarları (Chrome, Firefox, Safari, Edge). Tam ad ya da nokta ile başlayan sonek.
// Liste dışı adres kaydedilmez: sunucunun keyfi adrese istek atması engellenir.
export const PUSH_SERVISLERI: readonly string[] = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
];

export const ZAMAN_ASIMI_MS = 5000;
export const EN_SIK_SINYAL_SN = 60;
// Push servisi cihaz çevrim dışıyken sinyali bu süre tutar; daha eskisi anlamsızdır (ayrıntı zaten zilde).
export const SINYAL_OMRU_SN = 24 * 60 * 60;
const JWT_OMRU_SN = 12 * 60 * 60;

export interface PushAyari {
  ozel: KeyObject;
  // Uncompressed P-256 açık anahtarı, base64url (tarayıcının applicationServerKey'i).
  acikAnahtar: string;
  // VAPID "sub": mailto: ya da https: iletişim adresi.
  konu: string;
}

type Ortamlar = Record<string, string | undefined>;

const b64u = (b: Buffer): string => b.toString('base64url');

// Kapalıysa null. Açık ama anahtar ya da konu geçersizse açılış durur; ileti değişkenin adını söyler, değerini söylemez.
export function pushAyariOku(env: Ortamlar): PushAyari | null {
  if ((env['TMIV2_PUSH_ACIK']?.trim() ?? '') !== '1') return null;
  const ozelHam = env['TMIV2_PUSH_VAPID_OZEL']?.trim() ?? '';
  const konu = env['TMIV2_PUSH_KONU']?.trim() ?? '';
  if (ozelHam === '') throw new Error('Ortam değişkeni eksik: TMIV2_PUSH_VAPID_OZEL (Web Push açık)');
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(konu)) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PUSH_KONU (mailto: ya da https:// ile başlayan iletişim adresi olmalı)');
  }
  // Anahtar üreten araç baştaki sıfır baytları atmış olabilir; 32 bayta soldan tamamlanır.
  const ham = Buffer.from(ozelHam, 'base64url');
  if (ham.length < 30 || ham.length > 32 || !/^[A-Za-z0-9_-]+$/.test(ozelHam)) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PUSH_VAPID_OZEL (base64url, 32 baytlık P-256 özel anahtarı olmalı)');
  }
  const d = Buffer.concat([Buffer.alloc(32 - ham.length), ham]);
  let acik: Buffer;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    acik = ecdh.getPublicKey();
  } catch {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_PUSH_VAPID_OZEL (P-256 özel anahtarı değil)');
  }
  const ozel = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(acik.subarray(1, 33)), y: b64u(acik.subarray(33, 65)) },
    format: 'jwk',
  });
  return { ozel, acikAnahtar: b64u(acik), konu };
}

// Yalnız https, varsayılan kapı, kullanıcı ve parola taşımayan, izin listesindeki ana bilgisayar.
export function izinliUcNoktaMi(adres: string): boolean {
  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  const ad = url.hostname.toLowerCase();
  return PUSH_SERVISLERI.some((p) => (p.startsWith('.') ? ad.endsWith(p) && ad.length > p.length : ad === p));
}

// RFC 8292 VAPID: ES256 imzalı JWT, hedef kökene (aud) bağlı.
export function vapidBasligi(ayar: PushAyari, ucNokta: string, simdi: Date): string {
  const baslik = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const yuk = b64u(Buffer.from(JSON.stringify({
    aud: new URL(ucNokta).origin, exp: Math.floor(simdi.getTime() / 1000) + JWT_OMRU_SN, sub: ayar.konu,
  })));
  const imza = sign('sha256', Buffer.from(`${baslik}.${yuk}`), { key: ayar.ozel, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${baslik}.${yuk}.${b64u(imza)}, k=${ayar.acikAnahtar}`;
}

export type SinyalSonucu = 'tamam' | 'abonelik-bitti' | 'hata';
export type Getir = (adres: string, ayar: { method: 'POST'; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number }>;

// Gövdesiz istek (fetch gövdesiz POST'ta Content-Length 0 yazar), şifreleme gerekmez (RFC 8030). 404 ve 410 aboneliğin bittiğini söyler.
export async function sinyalGonder(ayar: PushAyari, ucNokta: string, getir: Getir, simdi: Date): Promise<SinyalSonucu> {
  if (!izinliUcNoktaMi(ucNokta)) return 'hata';
  try {
    const cevap = await getir(ucNokta, {
      method: 'POST',
      headers: { Authorization: vapidBasligi(ayar, ucNokta, simdi), TTL: String(SINYAL_OMRU_SN), Urgency: 'high' },
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
    if (cevap.status === 404 || cevap.status === 410) return 'abonelik-bitti';
    return cevap.status >= 200 && cevap.status < 300 ? 'tamam' : 'hata';
  } catch {
    return 'hata';
  }
}

const agGetir: Getir = (adres, ayar) => fetch(adres, ayar);

// Ortam değişkeni değişmedikçe aynı ayar döner (anahtar her çağrıda yeniden çözülmez). Açılışta bir kez çağrılır ki geçersiz değer
// sunucuyu açılışta durdursun; testler aynı süreçte ortamı değiştirebildiği için değer sabitlenmez.
let onbellek: { ham: string; ayar: PushAyari | null } | null = null;
export function ortamPushAyari(env: Ortamlar = process.env): PushAyari | null {
  const ham = JSON.stringify(PUSH_DEGISKENLERI.map((d) => env[d] ?? null));
  if (onbellek?.ham !== ham) onbellek = { ham, ayar: pushAyariOku(env) };
  return onbellek.ayar;
}
ortamPushAyari();

export interface PushTuruSonucu { kisi: number; tamam: number; silinen: number; hata: number }

// Zamanlanmış iş turu (ADR 0010 txDisi): sırası gelen kişiler kısa transaction'da alınır ve işaretlenir, istek transaction dışında atılır.
// Dönen kişi en çok dakikada bir sinyal alır; bekleyen bildirimler tek sinyalde toplanır.
export async function pushTuru(
  vt: Veritabani, ayar: PushAyari, gunluk: Gunluk, getir: Getir = agGetir, saat: () => Date = () => new Date(),
): Promise<PushTuruSonucu> {
  const hedefler = await vt.tx((db) => s.pushSirasiAl(db, EN_SIK_SINYAL_SN));
  const sonuc: PushTuruSonucu = { kisi: new Set(hedefler.map((h) => h.kisiId)).size, tamam: 0, silinen: 0, hata: 0 };
  const bitenler: number[] = [];
  const basarililar: number[] = [];
  for (const h of hedefler) {
    const r = await sinyalGonder(ayar, h.ucNokta, getir, saat());
    if (r === 'tamam') { sonuc.tamam += 1; basarililar.push(h.id); }
    else if (r === 'abonelik-bitti') { sonuc.silinen += 1; bitenler.push(h.id); }
    else sonuc.hata += 1;
  }
  if (bitenler.length > 0 || basarililar.length > 0) {
    await vt.tx(async (db) => {
      await s.pushAbonelikleriSil(db, bitenler);
      await s.pushBasariIsle(db, basarililar);
    });
  }
  if (sonuc.hata > 0) gunluk.uyar(`Web Push: ${String(sonuc.hata)} sinyal gönderilemedi`);
  return sonuc;
}

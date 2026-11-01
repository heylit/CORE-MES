import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HESAP_DOSYASI } from '../yollar.ts';
import { VARSAYILAN_SENARYO, adresDenetle, ortamDenetle, profilDagit, senaryoSemasi } from './senaryo.ts';
import type { Profil } from './senaryo.ts';

// Parola ve oturumlar depo dışında, koşuya özel geçici klasörde durur.
export const YUK_KLASORU = join(tmpdir(), 'tmiv2-yuk');
export const YUK_HESAP_DOSYASI = join(YUK_KLASORU, 'hesaplar.json');

const ISTEK_SURESI_MS = 30_000;

export interface Cevap { durum: number | null; govde: unknown; sureMs: number }

// Tarayıcının yerine geçen en küçük istemci: oturum çerezini tutar, her isteğin süresini ölçer. Cevap gelmezse durum null.
export class Istemci {
  private readonly cerezler = new Map<string, string>();
  private readonly kok: string;

  constructor(kok: string) {
    this.kok = kok;
  }

  async istek(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap> {
    const baslik: Record<string, string> = { Accept: 'application/json' };
    if (govde !== undefined) baslik['Content-Type'] = 'application/json';
    // Tekrar korumalı komut kimlik ister (ADR 0025 kural 5); her gönderim yeni komuttur.
    if (yontem === 'POST') baslik[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    if (this.cerezler.size > 0) baslik.Cookie = [...this.cerezler].map(([ad, deger]) => `${ad}=${deger}`).join('; ');
    const basla = performance.now();
    try {
      const cevap = await fetch(`${this.kok}/api${yol}`, {
        method: yontem,
        headers: baslik,
        ...(govde === undefined ? {} : { body: JSON.stringify(govde) }),
        signal: AbortSignal.timeout(ISTEK_SURESI_MS),
      });
      const metin = await cevap.text();
      const sureMs = Math.round(performance.now() - basla);
      for (const satir of cevap.headers.getSetCookie()) {
        const [cift] = satir.split(';');
        const esit = cift?.indexOf('=') ?? -1;
        if (cift !== undefined && esit > 0) this.cerezler.set(cift.slice(0, esit).trim(), cift.slice(esit + 1).trim());
      }
      let veri: unknown = null;
      try {
        veri = metin === '' ? null : JSON.parse(metin);
      } catch {
        veri = null;
      }
      return { durum: cevap.status, govde: veri, sureMs };
    } catch {
      return { durum: null, govde: null, sureMs: Math.round(performance.now() - basla) };
    }
  }

  async gir(kullaniciAdi: string, parola: string): Promise<Cevap> {
    const cevap = await this.istek('POST', '/oturum/giris', { kullaniciAdi, parola });
    const kullanici = (cevap.govde as { kullanici?: unknown } | null)?.kullanici;
    if (cevap.durum === 200 && (kullanici === null || kullanici === undefined)) {
      throw new Error(`${kullaniciAdi} girişi PIN istiyor; yük koşusu PIN akışını kurmaz.`);
    }
    return cevap;
  }
}

function yaz(ileti: string): void {
  process.stdout.write(`${ileti}\n`);
}

export function senaryoOku(): readonly Profil[] {
  const dosya = process.env.TMIV2_YUK_SENARYO;
  if (dosya === undefined || dosya.trim() === '') return VARSAYILAN_SENARYO;
  return senaryoSemasi.parse(JSON.parse(readFileSync(dosya, 'utf8')));
}

// Yönetici oturumuyla döner. Ortam iki yerden denetlenir: bu sürecin ortam değişkeni ve hedef sunucunun kendi bildirdiği ortam.
export async function hedefiDenetle(): Promise<{ kok: string; yonetici: Istemci }> {
  if (process.env.TMIV2_ORTAM === 'canli') throw new Error('TMIV2_ORTAM=canli: yük koşusu canlı ortamda açılmaz.');
  const adres = adresDenetle(process.env.TMIV2_YUK_ADRESI);
  if (!adres.tamam) throw new Error(adres.neden);
  if (!existsSync(HESAP_DOSYASI)) throw new Error('Örnek hesapların parolası yok: önce boş test veritabanında `npm run ekran:hazirla`.');
  const { parola } = JSON.parse(readFileSync(HESAP_DOSYASI, 'utf8')) as { parola: string };
  const yonetici = new Istemci(adres.kok);
  const giris = await yonetici.gir('ornek.yonetici', parola);
  if (giris.durum !== 200) throw new Error(`ornek.yonetici girişi başarısız (${neden(giris)}).`);
  const ayrinti = await yonetici.istek('GET', '/saglik/ayrinti');
  const ortam = ayrinti.durum === 200 ? (ayrinti.govde as { ortam?: unknown } | null)?.ortam : null;
  const red = ortamDenetle(process.env.TMIV2_ORTAM, typeof ortam === 'string' ? ortam : null);
  if (red !== null) throw new Error(red);
  return { kok: adres.kok, yonetici };
}

export interface YukHesaplari { parola: string; kisiler: Array<{ kullaniciAdi: string; profil: string }> }

interface KisiSatiri { id: number; kullaniciAdi: string | null; surum: number; roller: Array<{ id: number }> }

// Sunucunun ret iletisi hatayı anlatır; parola ve kimlik taşımaz.
const neden = (c: Cevap): string => {
  const mesaj = (c.govde as { mesaj?: unknown } | null)?.mesaj;
  return `durum ${String(c.durum)}${typeof mesaj === 'string' ? `: ${mesaj}` : ''}`;
};

const sirali = (i: number): string => String(i).padStart(4, '0');

async function paralel<T>(isler: readonly T[], esZamanli: number, yap: (is: T) => Promise<void>): Promise<void> {
  let sira = 0;
  const isci = async (): Promise<void> => {
    while (sira < isler.length) {
      const is = isler[sira];
      sira += 1;
      if (is !== undefined) await yap(is);
    }
  };
  await Promise.all(Array.from({ length: esZamanli }, isci));
}

// Sentetik kişiler kişi modülünün kendi uçlarıyla açılır (tabloya doğrudan yazılmaz); ad ve sicil yalnız "Yuk Kisi 0001" biçimindedir.
export async function hazirla(kisiSayisi: number): Promise<void> {
  const { yonetici } = await hedefiDenetle();
  const profiller = senaryoOku();
  const liste = await yonetici.istek('GET', '/kisiler');
  if (liste.durum !== 200) throw new Error(`Kişi listesi okunamadı (${neden(liste)}).`);
  const kisiler = (liste.govde as { kisiler: KisiSatiri[] }).kisiler;
  const adla = new Map(kisiler.filter((k) => k.kullaniciAdi !== null).map((k) => [k.kullaniciAdi as string, k]));
  const rolNo = new Map<string, number>();
  for (const p of profiller) {
    const rol = adla.get(p.ornekHesap)?.roller[0]?.id;
    if (rol === undefined) throw new Error(`${p.ad} profilinin örnek hesabı (${p.ornekHesap}) ya da rolü yok.`);
    rolNo.set(p.ad, rol);
  }

  const onceki = existsSync(YUK_HESAP_DOSYASI) ? (JSON.parse(readFileSync(YUK_HESAP_DOSYASI, 'utf8')) as YukHesaplari) : null;
  const parola = onceki?.parola ?? randomBytes(18).toString('base64url');
  const dagilim = profilDagit(kisiSayisi, profiller);
  const hedef = dagilim.map((profil, i) => ({ kullaniciAdi: `yuk.${sirali(i + 1)}`, profil, no: i + 1 }));
  let acilan = 0;
  let parolasiYenilenen = 0;
  await paralel(hedef, 8, async (h) => {
    const mevcut = adla.get(h.kullaniciAdi);
    if (mevcut !== undefined) {
      if (onceki !== null) return;
      // Parolası bilinmeyen önceki koşunun hesabı: yeni parola verilir.
      const c = await yonetici.istek('POST', `/kisiler/${String(mevcut.id)}/parola-degistir`, { surum: mevcut.surum, yeniParola: parola });
      if (c.durum !== 200) throw new Error(`${h.kullaniciAdi} parolası verilemedi (${neden(c)}).`);
      parolasiYenilenen += 1;
      return;
    }
    const kisi = await yonetici.istek('POST', '/kisiler', { ad: `Yuk Kisi ${sirali(h.no)}`, sicilNo: `YUK-${sirali(h.no)}` });
    if (kisi.durum !== 200) throw new Error(`${h.kullaniciAdi} açılamadı (${neden(kisi)}).`);
    const k = kisi.govde as KisiSatiri;
    const hesap = await yonetici.istek('POST', `/kisiler/${String(k.id)}/hesap-ac`, {
      surum: k.surum, kullaniciAdi: h.kullaniciAdi, parola, rolId: rolNo.get(h.profil),
    });
    if (hesap.durum !== 200) throw new Error(`${h.kullaniciAdi} hesabı açılamadı (${neden(hesap)}).`);
    acilan += 1;
  });
  mkdirSync(YUK_KLASORU, { recursive: true, mode: 0o700 });
  const kayit: YukHesaplari = { parola, kisiler: hedef.map(({ kullaniciAdi, profil }) => ({ kullaniciAdi, profil })) };
  writeFileSync(YUK_HESAP_DOSYASI, JSON.stringify(kayit), { mode: 0o600 });
  yaz(`Yük kişileri hazır: ${String(kisiSayisi)} (yeni ${String(acilan)}, parolası yenilenen ${String(parolasiYenilenen)}).`);
}

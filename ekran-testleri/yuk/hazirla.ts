import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HESAP_DOSYASI } from '../yollar.ts';
import { ornekYoneticiMi } from './ayar.ts';
import type { YukAyari } from './ayar.ts';
import type { Istasyon } from './sablon.ts';
import { VARSAYILAN_SENARYO, adresDenetle, karmaUygula, ortamDenetle, profilDagit, senaryoCoz } from './senaryo.ts';
import type { Profil, Senaryo } from './senaryo.ts';

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

export function senaryoOku(ayar: Pick<YukAyari, 'senaryo' | 'karma'>): Senaryo {
  const s = ayar.senaryo === null
    ? { profiller: VARSAYILAN_SENARYO, istasyonlar: [] }
    : senaryoCoz(JSON.parse(readFileSync(ayar.senaryo, 'utf8')));
  const profiller = karmaUygula(s.profiller, ayar.karma);
  if (profiller.length === 0) throw new Error('Senaryoda koşacak profil kalmadı.');
  return { profiller, istasyonlar: s.istasyonlar };
}

// Örnek yöneticinin parolası ekran hazırlığından gelir; başka yöneticininki yalnız `.env`'deki TMIV2_YUK_YONETICI_PAROLA'dan.
function yoneticiParolasi(ayar: Pick<YukAyari, 'yonetici'>): string {
  if (!ornekYoneticiMi(ayar)) {
    const parola = process.env.TMIV2_YUK_YONETICI_PAROLA;
    if (parola === undefined || parola === '') throw new Error(`${ayar.yonetici} için parola yok: .env'e TMIV2_YUK_YONETICI_PAROLA yazın.`);
    return parola;
  }
  if (!existsSync(HESAP_DOSYASI)) {
    throw new Error('Örnek hesapların parolası yok: boş test veritabanında `npm run ekran:hazirla` ya da --yonetici <ad> ile TMIV2_YUK_YONETICI_PAROLA.');
  }
  return (JSON.parse(readFileSync(HESAP_DOSYASI, 'utf8')) as { parola: string }).parola;
}

// Yönetici oturumuyla döner. Ortam iki yerden denetlenir: bu sürecin ortam değişkeni ve hedef sunucunun kendi bildirdiği ortam.
export async function hedefiDenetle(ayar: Pick<YukAyari, 'yonetici'>): Promise<{ kok: string; yonetici: Istemci }> {
  if (process.env.TMIV2_ORTAM === 'canli') throw new Error('TMIV2_ORTAM=canli: yük koşusu canlı ortamda açılmaz.');
  const adres = adresDenetle(process.env.TMIV2_YUK_ADRESI);
  if (!adres.tamam) throw new Error(adres.neden);
  const yonetici = new Istemci(adres.kok);
  const giris = await yonetici.gir(ayar.yonetici, yoneticiParolasi(ayar));
  if (giris.durum !== 200) throw new Error(`${ayar.yonetici} girişi başarısız (${neden(giris)}).`);
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

// Hesap adı profile bağlıdır: karma değişince önceki hesaplar başka rolle kullanılmaz, eksik olan profil için açılır.
export const yukHesabi = (profil: string, no: number): string => `yuk.${profil}.${sirali(no)}`;

// Koşunun istediği karma, hazır hesaplardan profil sırasıyla seçilir; eksik varsa ne kadar eksik olduğu söylenir.
export function hesaplariSec(hesaplar: YukHesaplari, dagilim: readonly string[]): Array<{ kullaniciAdi: string; profil: string }> {
  const gereken = new Map<string, number>();
  for (const p of dagilim) gereken.set(p, (gereken.get(p) ?? 0) + 1);
  const secilen: Array<{ kullaniciAdi: string; profil: string }> = [];
  const eksik: string[] = [];
  for (const [profil, sayi] of gereken) {
    const hazir = hesaplar.kisiler.filter((k) => k.profil === profil).slice(0, sayi);
    if (hazir.length < sayi) eksik.push(`${profil} ${String(hazir.length)}/${String(sayi)}`);
    secilen.push(...hazir);
  }
  if (eksik.length > 0) throw new Error(`Hazır yük kişisi eksik (${eksik.join(', ')}): aynı ayarla \`npm run yuk -- hazirla\`.`);
  return secilen;
}

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

// Başlamış emri olan her istasyon bir kez: terminal yükü gerçek istasyon ve emirle koşsun. Veri hedef sunucunun kendisinden okunur.
export async function istasyonlariKesfet(yonetici: Istemci): Promise<Istasyon[]> {
  const [emirler, istasyonlar] = await Promise.all([yonetici.istek('GET', '/uretim-emirleri?durum=basladi'), yonetici.istek('GET', '/istasyonlar')]);
  if (emirler.durum !== 200) throw new Error(`Başlamış emirler okunamadı (${neden(emirler)}).`);
  if (istasyonlar.durum !== 200) throw new Error(`İstasyonlar okunamadı (${neden(istasyonlar)}).`);
  const kodu = new Map((istasyonlar.govde as { istasyonlar: Array<{ id: number; kod: string }> }).istasyonlar.map((i) => [i.id, i.kod]));
  const bulunan = new Map<number, Istasyon>();
  for (const e of (emirler.govde as { emirler: Array<{ id: number; emirNo: string; istasyon: { id: number } }> }).emirler) {
    const kod = kodu.get(e.istasyon.id);
    if (kod !== undefined && !bulunan.has(e.istasyon.id)) bulunan.set(e.istasyon.id, { id: e.istasyon.id, kod, emirId: e.id, emirNo: e.emirNo });
  }
  if (bulunan.size === 0) throw new Error('Başlamış emri olan istasyon yok: senaryo istasyon istiyor.');
  return [...bulunan.values()];
}

// Rol adı /roller'dan, örnek hesabın rolü /kisiler'den çözülür.
async function rolleriCoz(yonetici: Istemci, profiller: readonly Profil[], kisiler: readonly KisiSatiri[]): Promise<Map<string, number>> {
  const adla = new Map(kisiler.filter((k) => k.kullaniciAdi !== null).map((k) => [k.kullaniciAdi as string, k]));
  let roller: Array<{ id: number; ad: string }> | null = null;
  const rolNo = new Map<string, number>();
  for (const p of profiller) {
    if (p.rol !== undefined) {
      if (roller === null) {
        const c = await yonetici.istek('GET', '/roller');
        if (c.durum !== 200) throw new Error(`Rol listesi okunamadı (${neden(c)}).`);
        roller = (c.govde as { roller: Array<{ id: number; ad: string }> }).roller;
      }
      const rol = roller.find((r) => r.ad === p.rol)?.id;
      if (rol === undefined) throw new Error(`${p.ad} profilinin rolü (${p.rol}) yok.`);
      rolNo.set(p.ad, rol);
      continue;
    }
    const rol = adla.get(p.ornekHesap ?? '')?.roller[0]?.id;
    if (rol === undefined) throw new Error(`${p.ad} profilinin örnek hesabı (${String(p.ornekHesap)}) ya da rolü yok.`);
    rolNo.set(p.ad, rol);
  }
  return rolNo;
}

// Sentetik kişiler kişi modülünün kendi uçlarıyla açılır (tabloya doğrudan yazılmaz); ad ve sicil yalnız "Yuk Kisi terminal 0001" biçimindedir.
export async function hazirla(ayar: YukAyari): Promise<void> {
  const { yonetici } = await hedefiDenetle(ayar);
  const { profiller } = senaryoOku(ayar);
  const liste = await yonetici.istek('GET', '/kisiler');
  if (liste.durum !== 200) throw new Error(`Kişi listesi okunamadı (${neden(liste)}).`);
  const kisiler = (liste.govde as { kisiler: KisiSatiri[] }).kisiler;
  const adla = new Map(kisiler.filter((k) => k.kullaniciAdi !== null).map((k) => [k.kullaniciAdi as string, k]));
  const rolNo = await rolleriCoz(yonetici, profiller, kisiler);

  const onceki = existsSync(YUK_HESAP_DOSYASI) ? (JSON.parse(readFileSync(YUK_HESAP_DOSYASI, 'utf8')) as YukHesaplari) : null;
  const parola = onceki?.parola ?? randomBytes(18).toString('base64url');
  const bilinen = new Set(onceki?.kisiler.map((k) => k.kullaniciAdi) ?? []);
  const sayac = new Map<string, number>();
  const hedef = profilDagit(ayar.kisi, profiller).map((profil) => {
    const no = (sayac.get(profil) ?? 0) + 1;
    sayac.set(profil, no);
    return { kullaniciAdi: yukHesabi(profil, no), profil, no };
  });
  let acilan = 0;
  let parolasiYenilenen = 0;
  await paralel(hedef, 8, async (h) => {
    const mevcut = adla.get(h.kullaniciAdi);
    if (mevcut !== undefined) {
      if (bilinen.has(h.kullaniciAdi)) return;
      // Parolası bilinmeyen önceki koşunun hesabı: yeni parola verilir.
      const c = await yonetici.istek('POST', `/kisiler/${String(mevcut.id)}/parola-degistir`, { surum: mevcut.surum, yeniParola: parola });
      if (c.durum !== 200) throw new Error(`${h.kullaniciAdi} parolası verilemedi (${neden(c)}).`);
      parolasiYenilenen += 1;
      return;
    }
    const kisi = await yonetici.istek('POST', '/kisiler', { ad: `Yuk Kisi ${h.profil} ${sirali(h.no)}`, sicilNo: `YUK-${h.profil.toUpperCase()}-${sirali(h.no)}` });
    if (kisi.durum !== 200) throw new Error(`${h.kullaniciAdi} açılamadı (${neden(kisi)}).`);
    const k = kisi.govde as KisiSatiri;
    const hesap = await yonetici.istek('POST', `/kisiler/${String(k.id)}/hesap-ac`, {
      surum: k.surum, kullaniciAdi: h.kullaniciAdi, parola, rolId: rolNo.get(h.profil),
    });
    if (hesap.durum !== 200) throw new Error(`${h.kullaniciAdi} hesabı açılamadı (${neden(hesap)}).`);
    acilan += 1;
  });
  mkdirSync(YUK_KLASORU, { recursive: true, mode: 0o700 });
  const hepsi = new Map((onceki?.kisiler ?? []).map((k) => [k.kullaniciAdi, k]));
  for (const { kullaniciAdi, profil } of hedef) hepsi.set(kullaniciAdi, { kullaniciAdi, profil });
  const kayit: YukHesaplari = { parola, kisiler: [...hepsi.values()].sort((x, y) => x.kullaniciAdi.localeCompare(y.kullaniciAdi)) };
  writeFileSync(YUK_HESAP_DOSYASI, JSON.stringify(kayit), { mode: 0o600 });
  yaz(`Yük kişileri hazır: ${String(ayar.kisi)} (yeni ${String(acilan)}, parolası yenilenen ${String(parolasiYenilenen)}).`);
}

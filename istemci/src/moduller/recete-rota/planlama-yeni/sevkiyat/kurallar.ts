import type { ExtraAlanlar, PlanlamaCalismasi } from '../tipler.ts';

// Sevkiyat hesapları (saf, 205 a): plana göre bitmesi gereken işler, dönem özeti ve bitiş tarihi akışı. Ölçüt bugünkü sayfadır
// (cerceve/planlama/parca/zx-sevkiyat.betik). Sipariş, son adımının planlanan bitişine göre döneme düşer ve terminiyle karşılaştırılır;
// tutar gösterilmez. Saat ekseni planın başlangıç günü 00:00'dan saattir; duvar saati UTC alanlarında taşınır (motor engine.betik baseMs).

const nesneMi = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const metin = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

// Geç sayılma eşiği ve "son gün" penceresi bugünkü sayfadakiyle aynı (saat).
export const GEC_ESIGI = 0.05;
export const SON_GUN_SAATI = 24;
// Bitişin yeni kayıt sayılması için en az oynama (saat) ve akışta gösterilen satır sınırı (bugünkü sayfa).
export const AYNI_BITIS = 0.5;
export const AKIS_SINIRI = 60;
// Dönem kartlarından ilk bu kadarı açık gelir.
export const ACIK_GRUP = 4;

const GUN_AD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const iki = (n: number): string => String(n).padStart(2, '0');

// Planın başlangıç günü (UTC ms); belge başlangıç taşımıyorsa null (saat tarihe çevrilemez, uydurulmaz).
export function tabanMs(c: PlanlamaCalismasi): number | null {
  const b = c.D.meta?.baslangic;
  const m = typeof b === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(b) : null;
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// "YYYY-AA-GG[ SS:DD]" -> plan saati (engine.betik parseT). Okunmayan ya da boş değer null.
export function saatOku(taban: number, s: unknown): number | null {
  if (sayiMi(s)) return s;
  if (typeof s !== 'string' || s.trim() === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0) - taban) / 3_600_000;
}

export const saatTarihi = (taban: number, t: number): Date => new Date(taban + t * 3_600_000);

// "GG.AA Gün SS:DD" (engine.betik fmtDT).
export function tarihSaatYaz(taban: number, t: number | null): string {
  if (t === null || !Number.isFinite(t)) return '—';
  const d = saatTarihi(taban, t);
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUN_AD[d.getUTCDay()]} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}

// Elle girilen sevk tarihi ("YYYY-AA-GG") -> "GG.AA".
export const sevkGunuYaz = (t: string): string => t.split('-').reverse().slice(0, 2).join('.');

export type Donem = 'gun' | 'hafta' | 'ay' | 'yil';
export const DONEMLER: readonly { deger: Donem; baslik: string }[] = [
  { deger: 'gun', baslik: 'Gün' }, { deger: 'hafta', baslik: 'Hafta' }, { deger: 'ay', baslik: 'Ay' }, { deger: 'yil', baslik: 'Yıl' },
];

// Dönemin sıralama anahtarı ve adı; hafta ISO haftasıdır (pazartesi başlar).
export function donemAnahtari(d: Date, k: Donem): { anahtar: string; ad: string } {
  const y = d.getUTCFullYear(), a = d.getUTCMonth(), g = d.getUTCDate();
  if (k === 'yil') return { anahtar: String(y), ad: String(y) };
  if (k === 'ay') return { anahtar: `${String(y)}-${iki(a + 1)}`, ad: `${AY_AD[a]} ${String(y)}` };
  if (k === 'hafta') {
    const pzt = new Date(Date.UTC(y, a, g - ((d.getUTCDay() + 6) % 7)));
    const persembe = new Date(pzt.getTime() + 3 * 86_400_000);
    const yil = persembe.getUTCFullYear();
    const no = 1 + Math.floor((persembe.getTime() - Date.UTC(yil, 0, 1)) / (7 * 86_400_000));
    return { anahtar: `${String(yil)}-${iki(no)}`, ad: `${String(no)}. hafta · ${iki(pzt.getUTCDate())}.${iki(pzt.getUTCMonth() + 1)}` };
  }
  return { anahtar: `${String(y)}-${iki(a + 1)}-${iki(g)}`, ad: `${iki(g)}.${iki(a + 1)} ${GUN_AD[d.getUTCDay()]}` };
}

// Bitiş akışının satırı (bugünkü sayfa svKaydet): plan kaydedildiğinde siparişin son bitişi öncekinden oynadıysa eklenir.
export interface BitisKaydi { C: number; t: number; kaynak: string; kim: string }
export interface SevkKaydi { t: string; kim: string | null }

export interface SevkSatiri {
  id: string;
  ad: string | null;
  musteri: string;
  adet: number | null;
  // Son adımın plana göre bitişi; plan siparişe bitiş vermediyse null.
  C: number | null;
  // Termin aşımı (saat); plan vermediyse 0 değil null.
  T: number | null;
  termin: number | null;
  adim: string | null;
  // Son adımın yeri: tezgâh ya da fason.
  yer: string | null;
  gercekBitis: number | null;
  sevk: SevkKaydi | null;
  gecmis: readonly BitisKaydi[];
}

export interface SevkListesi { satirlar: SevkSatiri[]; taban: number }

const bitisKaydi = (x: unknown): x is BitisKaydi => nesneMi(x) && sayiMi(x.C) && sayiMi(x.t);

function gecmisOku(c: PlanlamaCalismasi, id: string): BitisKaydi[] {
  const iz = c.sevkIz;
  if (!nesneMi(iz) || !Array.isArray(iz[id])) return [];
  return (iz[id] as unknown[]).filter(bitisKaydi).map((x) => ({ C: x.C, t: x.t, kaynak: metin(x.kaynak) ?? 'plan', kim: metin(x.kim) ?? '—' }));
}

function sevkOku(c: PlanlamaCalismasi, id: string): SevkKaydi | null {
  const k = nesneMi(c.sevkEdildi) ? c.sevkEdildi[id] : undefined;
  return nesneMi(k) && typeof k.t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.t) ? { t: k.t, kim: metin(k.kim) } : null;
}

// Plandaki (havuzda olmayan) siparişlerin listesi, plana göre bitişe göre sıralı (bitişsiz sonda). Plan, J ya da başlangıç günü yoksa null:
// ekran "önce plan kurulmalı" der.
export function sevkListesi(c: PlanlamaCalismasi): SevkListesi | null {
  const p = c.plan as (ExtraAlanlar & { J?: unknown; ops?: unknown }) | null;
  const taban = tabanMs(c);
  if (!p || !nesneMi(p.J) || taban === null) return null;
  const J = p.J;
  const ops = nesneMi(p.ops) ? p.ops : {};
  const son: Record<string, { id: string; r: Record<string, unknown> }> = {};
  for (const [id, r] of Object.entries(ops)) {
    if (!nesneMi(r) || typeof r.job !== 'string' || !sayiMi(r.C)) continue;
    const o = son[r.job];
    if (!o || (r.C) > (o.r.C as number)) son[r.job] = { id: metin(r.id) ?? id, r };
  }
  const urun = new Map(c.D.urunler.map((u) => [u.id, u]));
  const musteriler = Array.isArray(c.D.musteriler) ? (c.D.musteriler as unknown[]) : [];
  const musteri = new Map(musteriler.filter((m): m is Record<string, unknown> => nesneMi(m) && typeof m.id === 'string').map((m) => [m.id as string, metin(m.ad)]));
  const gercek = nesneMi(c.gercek) ? c.gercek : {};
  const satirlar: SevkSatiri[] = [];
  for (const s of c.D.siparisler) {
    if (s.havuz) continue;
    const j = J[s.id];
    if (!nesneMi(j)) continue;
    const o = son[s.id];
    const adim = o ? (urun.get(s.urun)?.rota ?? []).find((x) => o.id.endsWith(`.${x.k}`)) : undefined;
    const g = o ? gercek[o.id] : undefined;
    const mk = metin(s.musteri);
    satirlar.push({
      id: s.id,
      ad: metin(s.ad) ?? metin(s.urun),
      musteri: (mk && musteri.get(mk)) ?? mk ?? '—',
      adet: sayiMi(s.adet) ? s.adet : null,
      C: sayiMi(j.C) ? j.C : null,
      T: sayiMi(j.T) ? j.T : null,
      termin: saatOku(taban, s.termin),
      adim: adim ? metin(adim.ad) : null,
      yer: o ? (o.r.fas ? 'fason' : metin(o.r.m)) : null,
      gercekBitis: nesneMi(g) && sayiMi(g.C) ? g.C : null,
      sevk: sevkOku(c, s.id),
      gecmis: gecmisOku(c, s.id),
    });
  }
  satirlar.sort((a, b) => (a.C ?? Infinity) - (b.C ?? Infinity));
  return { satirlar, taban };
}

export const gecMi = (x: SevkSatiri): boolean => x.T !== null && x.T > GEC_ESIGI;
export const sonGunMu = (x: SevkSatiri): boolean => !gecMi(x) && x.C !== null && x.termin !== null && x.termin - x.C < SON_GUN_SAATI;

export type SevkDurumu = 'gec' | 'son-gun' | 'zamaninda';
export const sevkDurumu = (x: SevkSatiri): SevkDurumu => (gecMi(x) ? 'gec' : sonGunMu(x) ? 'son-gun' : 'zamaninda');

export interface SevkSayilari { bitecek: number; gec: number; sonGun: number; ertelenen: number }

// Üst sayılar: plana göre bitecek, termini geçecek, son gün bitecek; ilk planına göre ertelenen sipariş.
export function sevkSayilari(l: readonly SevkSatiri[]): SevkSayilari {
  const bitenler = l.filter((x) => x.C !== null);
  return {
    bitecek: bitenler.length,
    gec: bitenler.filter(gecMi).length,
    sonGun: bitenler.filter(sonGunMu).length,
    ertelenen: l.filter((x) => (ilkPlanaGore(x.gecmis) ?? 0) > AYNI_BITIS).length,
  };
}

export interface SevkGrubu { anahtar: string; ad: string; satirlar: SevkSatiri[]; adet: number; gec: number }

// Bitişi olan siparişler bitiş dönemine göre gruplanır; gruplar zaman sırasıyla.
export function sevkGruplari(l: readonly SevkSatiri[], taban: number, k: Donem): SevkGrubu[] {
  const G = new Map<string, SevkGrubu>();
  for (const x of l) {
    if (x.C === null) continue;
    const { anahtar, ad } = donemAnahtari(saatTarihi(taban, x.C), k);
    const g = G.get(anahtar) ?? { anahtar, ad, satirlar: [], adet: 0, gec: 0 };
    g.satirlar.push(x);
    g.adet += x.adet ?? 0;
    if (gecMi(x)) g.gec += 1;
    G.set(anahtar, g);
  }
  return [...G.values()].sort((a, b) => (a.anahtar < b.anahtar ? -1 : a.anahtar > b.anahtar ? 1 : 0));
}

export type Olcu = 'siparis' | 'adet';
export interface DonemOzeti { anahtar: string; ad: string; plan: number; termin: number; sevk: number; gec: number }

// Dönem başına üç seri (bugünkü sayfa svDonemler): plana göre bitecek, termini gelen, sevk edilen; ayrıca geç bitecek.
export function donemOzetleri(l: readonly SevkSatiri[], taban: number, k: Donem, olcu: Olcu): DonemOzeti[] {
  const B = new Map<string, DonemOzeti>();
  const ekle = (d: Date, alan: 'plan' | 'termin' | 'sevk' | 'gec', x: SevkSatiri): void => {
    const { anahtar, ad } = donemAnahtari(d, k);
    const b = B.get(anahtar) ?? { anahtar, ad, plan: 0, termin: 0, sevk: 0, gec: 0 };
    b[alan] += olcu === 'adet' ? x.adet ?? 0 : 1;
    B.set(anahtar, b);
  };
  for (const x of l) {
    if (x.C !== null) {
      ekle(saatTarihi(taban, x.C), 'plan', x);
      if (gecMi(x)) ekle(saatTarihi(taban, x.C), 'gec', x);
    }
    if (x.termin !== null) ekle(saatTarihi(taban, x.termin), 'termin', x);
    if (x.sevk) ekle(new Date(`${x.sevk.t}T12:00:00Z`), 'sevk', x);
  }
  return [...B.values()].sort((a, b) => (a.anahtar < b.anahtar ? -1 : a.anahtar > b.anahtar ? 1 : 0));
}

// Geçmişteki i. planın adı (bugünkü sayfa svAd).
export function planAdi(l: readonly BitisKaydi[], i: number): string {
  if (i === 0) return 'İlk plan';
  return (oncekineGore(l, i) ?? 0) > 0 ? `Ertelenmiş plan ${String(i)}` : `Öne çekilmiş plan ${String(i)}`;
}

// i. planın bir önceki plana göre farkı (saat, artı geç); ilk planda null.
export function oncekineGore(l: readonly BitisKaydi[], i: number): number | null {
  const x = l[i], o = l[i - 1];
  return i > 0 && x && o ? x.C - o.C : null;
}

// İlk plana göre fark (saat, artı geç); tek kayıtta null.
export function ilkPlanaGore(l: readonly BitisKaydi[]): number | null {
  const ilk = l[0], son = l.at(-1);
  return l.length < 2 || !ilk || !son ? null : son.C - ilk.C;
}

export interface AkisSatiri { id: string; kayit: BitisKaydi; sira: number; fark: number; ad: string }

// Bütün siparişlerin bitiş değişiklikleri tek akışta, en yenisi üstte (ilk plan değişiklik sayılmaz).
export function bitisAkisi(l: readonly SevkSatiri[]): AkisSatiri[] {
  const a: AkisSatiri[] = [];
  for (const x of l) {
    x.gecmis.forEach((k, i) => {
      const fark = oncekineGore(x.gecmis, i);
      if (fark !== null) a.push({ id: x.id, kayit: k, sira: i, fark, ad: planAdi(x.gecmis, i) });
    });
  }
  return a.sort((p, q) => q.kayit.t - p.kayit.t || q.sira - p.sira);
}

export const sayiYaz = (n: number, basamak = 0): string => n.toLocaleString('tr-TR', { maximumFractionDigits: basamak });

// Saat farkı "+1,5 sa" / "−2 sa".
export const farkYaz = (f: number): string => `${f > 0 ? '+' : '−'}${sayiYaz(Math.abs(f), 1)} sa`;

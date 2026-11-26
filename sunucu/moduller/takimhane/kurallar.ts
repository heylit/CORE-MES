import { kutuphaneKalemiSemasi, type KonumDagilimi, type KutuphaneKalemi, type TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';

// Saf iş kuralları (3613). Veritabanı ve zaman bilmez.
export type StokDurumu = 'sifir' | 'kritik' | 'yeterli' | 'esiksiz';

// Sipariş noktası girilmemişse (null) durum uydurulmaz: yalnız sıfır bilinir, gerisi "esiksiz" (tanımsız) sayılır.
export function stokDurumu(toplam: number, kritikSeviye: number | null): StokDurumu {
  if (toplam <= 0) return 'sifir';
  if (kritikSeviye === null) return 'esiksiz';
  return toplam <= kritikSeviye ? 'kritik' : 'yeterli';
}

// Stok konum türü -> takımhane konum grubu (bilemede/onarımda = fason). Başka türler (yolda, hurda...) gruba girmez.
export function konumGrubu(tur: string): keyof KonumDagilimi | null {
  switch (tur) {
    case 'raf_gozu': return 'raf';
    case 'istasyon': return 'tezgah';
    case 'kisi': return 'kisi';
    case 'fason': return 'bileme';
    case 'ara_alan': return 'ara';
    default: return null;
  }
}

export const bosDagilim = (): KonumDagilimi => ({ raf: null, tezgah: null, kisi: null, bileme: null, ara: null });

export function dagilimaEkle(d: KonumDagilimi, grup: keyof KonumDagilimi, adet: number): void {
  d[grup] = (d[grup] ?? 0) + adet;
}

// Toplam, konumların toplamıdır; hurda dahil değildir (hurda konum grubu yok).
export const dagilimToplami = (d: KonumDagilimi): number => (d.raf ?? 0) + (d.tezgah ?? 0) + (d.kisi ?? 0) + (d.bileme ?? 0) + (d.ara ?? 0);

export const kritikMi = (t: Pick<TakimSatiri, 'toplam' | 'kritikSeviye'>): boolean => stokDurumu(t.toplam, t.kritikSeviye) === 'kritik';

// Takım kartı: katalog kartının stok kodu TKM ile başlar (varsayım; kategori bu işte tanımlanmaz).
export const takimKoduMu = (kod: string): boolean => /^TKM/i.test(kod.trim());

// 3762: takım kartı = CNC kütüphanesine bağlı sarf ya da demirbaş kartı; kütüphaneye bağlanmamış eski TKM kartları da takımdır.
export const takimKartiMi = (k: { kod: string; kutuphaneKimligi: string | null }): boolean => k.kutuphaneKimligi !== null || takimKoduMu(k.kod);

// CNC kaydındaki atölye kalemleri (`custom`): geçersiz kalem düşer, kaydın geri kalanı okunmaz.
export function ozelKalemler(deger: unknown): KutuphaneKalemi[] {
  const d = typeof deger === 'string' ? (() => { try { return JSON.parse(deger) as unknown; } catch { return null; } })() : deger;
  const liste = d !== null && typeof d === 'object' && Array.isArray((d as { custom?: unknown }).custom) ? (d as { custom: unknown[] }).custom : [];
  return liste.flatMap((k) => { const r = kutuphaneKalemiSemasi.safeParse(k); return r.success ? [r.data] : []; });
}

// ---- Aparat ayırma (kart 3651): yazılmaz, canlı plan penceresinden türetilir ------------------------------------------------------
export type AparatDurumu = 'plan-bekliyor' | 'ayrildi' | 'yolda' | 'tezgahta' | 'kisi' | 'eksik';

export interface AparatIstegi {
  emirId: number; kartId: number; adet: number;
  // Canlı planın penceresi (ms); plan yerleştirmediyse null. Pencere ayrık adımların en erken başlangıcı ile en geç bitişidir (konservatif).
  baslangic: number | null; bitis: number | null;
  disarida: number; yolda: number; disaridaYeri: 'istasyon' | 'kisi' | null;
}
export interface AparatAyirmasi { emirId: number; kartId: number; kalan: number; ayrilan: number; eksik: number; durum: AparatDurumu }

const ortusur = (a: AparatIstegi, b: AparatIstegi): boolean =>
  a.baslangic !== null && a.bitis !== null && b.baslangic !== null && b.bitis !== null && a.baslangic < b.bitis && b.baslangic < a.bitis;

// Kart başına rafta duran adet `raf`. Penceresi örtüşen ve daha erken başlayan istekler rafı önce alır; zamanda ayrık istekler aynı adedi
// yeniden kullanır (aparat döner). Çıkmış adet raftan düşmüştür, tekrar sayılmaz. Plan yerleştirmemiş istek ayırma sayılmaz ("plan bekliyor").
export function aparatAyirmalari(istekler: readonly AparatIstegi[], rafAdetleri: ReadonlyMap<number, number>): AparatAyirmasi[] {
  const sirali = [...istekler].sort((a, b) => (a.baslangic ?? Infinity) - (b.baslangic ?? Infinity) || a.emirId - b.emirId);
  const sonuc = new Map<AparatIstegi, AparatAyirmasi>();
  const kalanOf = (i: AparatIstegi): number => Math.max(0, i.adet - i.disarida);
  for (const i of sirali) {
    const kalan = kalanOf(i);
    const durumBos = { emirId: i.emirId, kartId: i.kartId, kalan, ayrilan: 0, eksik: 0 };
    if (kalan === 0) { sonuc.set(i, { ...durumBos, durum: i.disaridaYeri === 'kisi' ? 'kisi' : 'tezgahta' }); continue; }
    if (i.baslangic === null) { sonuc.set(i, { ...durumBos, durum: 'plan-bekliyor' }); continue; }
    let onceki = 0;
    for (const j of sirali) { if (j === i) break; if (j.kartId === i.kartId && ortusur(i, j)) onceki += sonuc.get(j)!.ayrilan; }
    const bos = Math.max(0, (rafAdetleri.get(i.kartId) ?? 0) - onceki);
    const ayrilan = Math.min(kalan, bos);
    const eksik = kalan - ayrilan;
    sonuc.set(i, { ...durumBos, ayrilan, eksik, durum: eksik > 0 ? 'eksik' : i.yolda >= kalan ? 'yolda' : 'ayrildi' });
  }
  return istekler.map((i) => sonuc.get(i)!);
}

// Planın aparat kapasitesi ile fiziksel stok yan yana. Karar vermez, yalnız işaretler (plan etkilenmez).
export type AparatUyumu = 'uyumlu' | 'plan-fazla' | 'bakimda';
export function aparatUyumu(planKapasitesi: number, stokta: number, bakimda: number): AparatUyumu {
  if (planKapasitesi > stokta) return 'plan-fazla';
  return bakimda > 0 ? 'bakimda' : 'uyumlu';
}

// Aparat plan saatinden bu kadar önce çıkmışsa plan sonradan kaymış sayılır (plan geçmişi tutulmaz; çıkış zamanıyla pencere başı karşılaştırılır).
export const PLAN_KAYMA_ESIGI_MS = 24 * 3_600_000;
export const planKaydiMi = (cikisMs: number | null, baslangicMs: number | null): boolean =>
  cikisMs !== null && baslangicMs !== null && baslangicMs - cikisMs > PLAN_KAYMA_ESIGI_MS;

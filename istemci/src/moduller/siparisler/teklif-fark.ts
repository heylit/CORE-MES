import type { TeklifSurumuCevabi as Surum } from '#paylasilan/sozlesme/siparisler.ts';

export type KosulAlani = 'iskonto' | 'kdv' | 'teslim' | 'termin' | 'odeme' | 'gecerlilik' | 'not';
export interface KosulFarki { alan: KosulAlani; eski: string | null; yeni: string | null }
export interface KalemFarki { satirId: number; eski: string | null; yeni: string | null; yuzde: number | null }
export interface ToplamFarki { eski: string; yeni: string; yuzde: number | null; kdvDahil: boolean }
export interface SurumFarki { kosullar: KosulFarki[]; kalemler: KalemFarki[]; toplam: ToplamFarki | null }

// İskonto fiyat kapsamındadır; fiyat görmeyen için hiç hesaplanmaz. KDV oranı fiyat sayılmaz (kullanıcı kararı 24.11), herkese görünür;
// KDV tutarı ve toplamlar fiyat yetkisine bağlı kalır.
export const FIYAT_KOSULLARI: ReadonlySet<KosulAlani> = new Set<KosulAlani>(['iskonto']);

const SAYISAL: ReadonlySet<KosulAlani> = new Set<KosulAlani>(['iskonto', 'kdv']);

function ayriMi(alan: KosulAlani, e: string | null, y: string | null): boolean {
  if (e === null || y === null) return e !== y;
  return SAYISAL.has(alan) ? Number(e) !== Number(y) : e !== y;
}

function yuzde(e: string, y: string): number | null {
  const a = Number(e);
  return a > 0 ? ((Number(y) - a) / a) * 100 : null;
}

// Ardışık iki sürümün farkı (3635). Saftır; veri istemcide zaten vardır, sunucudan ek bir şey istenmez.
export function surumFarki(onceki: Surum, yeni: Surum, fiyatGorur: boolean): SurumFarki {
  const alanlar: [KosulAlani, string | null, string | null][] = [
    ['iskonto', onceki.iskontoOrani, yeni.iskontoOrani],
    ['kdv', onceki.kdvOrani, yeni.kdvOrani],
    ['teslim', onceki.teslimGun === null ? null : String(onceki.teslimGun), yeni.teslimGun === null ? null : String(yeni.teslimGun)],
    ['termin', onceki.terminTarihi, yeni.terminTarihi],
    ['odeme', onceki.odemeKosulu, yeni.odemeKosulu],
    ['gecerlilik', onceki.gecerlilik, yeni.gecerlilik],
    ['not', onceki.aciklama, yeni.aciklama],
  ];
  const kosullar = alanlar
    .filter(([alan]) => fiyatGorur || !FIYAT_KOSULLARI.has(alan))
    .filter(([alan, e, y]) => ayriMi(alan, e, y))
    .map(([alan, eski, yeniDeger]) => ({ alan, eski, yeni: yeniDeger }));
  if (!fiyatGorur) return { kosullar, kalemler: [], toplam: null };
  const eskiFiyat = new Map(onceki.fiyatlar.map((f) => [f.satirId, f.birimFiyat]));
  const kalemler = yeni.fiyatlar.flatMap((f) => {
    const e = eskiFiyat.get(f.satirId) ?? null;
    if (e === f.birimFiyat || (e !== null && f.birimFiyat !== null && Number(e) === Number(f.birimFiyat))) return [];
    return [{ satirId: f.satirId, eski: e, yeni: f.birimFiyat, yuzde: e === null || f.birimFiyat === null ? null : yuzde(e, f.birimFiyat) }];
  });
  // Yalnız iki tarafta da genel toplam varsa genel toplamlar, yoksa ikisinde de KDV hariç toplam karşılaştırılır; KDV'li ile KDV'siz toplam karıştırılmaz.
  const genel = onceki.genelToplam !== null && yeni.genelToplam !== null;
  const e = genel ? onceki.genelToplam : onceki.toplam;
  const y = genel ? yeni.genelToplam : yeni.toplam;
  const toplam = e === null || y === null || Number(e) === Number(y) ? null : { eski: e, yeni: y, yuzde: yuzde(e, y), kdvDahil: genel };
  return { kosullar, kalemler, toplam };
}

export const farkVarMi = (f: SurumFarki): boolean => f.kosullar.length > 0 || f.kalemler.length > 0 || f.toplam !== null;

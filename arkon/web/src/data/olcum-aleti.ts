// Kullanıcı kararı 150 a: ölçüm ölçü aletiyle girilir; kalibrasyonu geçmiş ya da kullanım dışı alet seçilemez. Kapı sunucudadır
// (sunucu/moduller/arkon/kurallar.ts olcumAletleri); burası aynı kuralın ekran karşılığıdır. Aletler TMI'nin Kalibrasyon sayfasından gelir.

export interface OlcumAleti { id: string; no: string; type?: string; status?: string; last?: number; interval?: number }
export interface OlcumAletDamgasi { gid: string; gno: string }

export const ALET_ZORUNLU_ILETISI = 'Ölçü aleti seçilmeden ölçüm kaydedilmez.';
export const ALET_YOK_ILETISI = 'Kalibrasyonu geçerli ölçü aleti yok · Kalibrasyon sayfasına bakın.';

const GUN_MS = 864e5;
const kucuk = (m: unknown): string => String(m ?? '').toLocaleLowerCase('tr-TR').trim();

export const aletVadesi = (g: OlcumAleti): number => (g.last ?? 0) + (g.interval ?? 365) * GUN_MS;

// Kalibrasyon kaydı olmayan alet geçerli sayılmaz (TMI'de "kayıtsız").
export const aletGecerliMi = (g: OlcumAleti, simdi: number): boolean => g.status !== 'out' && typeof g.last === 'number' && aletVadesi(g) >= simdi;

const turaUyar = (g: OlcumAleti, tool: unknown): boolean => {
  const t = kucuk(tool), y = kucuk(g.type);
  return y !== '' && (y.includes(t) || t.includes(y));
};

// Kontrol planındaki alet serbest metindir: türü uyan geçerli aletler önce gelir; türü uyan alet yoksa bütün geçerli aletler seçilebilir,
// ölçüm yine belirli bir aletle kayda geçer.
export function secilebilirAletler(aletler: readonly OlcumAleti[], tool: unknown, simdi: number): OlcumAleti[] {
  const gecerli = aletler.filter((g) => aletGecerliMi(g, simdi)).sort((a, b) => a.no.localeCompare(b.no, 'tr'));
  const uyan = kucuk(tool) === '' ? [] : gecerli.filter((g) => turaUyar(g, tool));
  return uyan.length > 0 ? uyan : gecerli;
}

export const aletSecimAnahtari = (tool: unknown): string => 'olcum-aleti:' + kucuk(tool);

// Cihazın o alet türü için son seçtiği alet hâlâ seçilebiliyorsa döner; yoksa null (ölçüm kaydedilmez).
export function seciliAlet(aletler: readonly OlcumAleti[], tool: unknown, seciliId: unknown, simdi: number): OlcumAleti | null {
  return secilebilirAletler(aletler, tool, simdi).find((g) => g.id === seciliId) ?? null;
}

export const olcumAletDamgasi = (g: OlcumAleti): OlcumAletDamgasi => ({ gid: g.id, gno: g.no });

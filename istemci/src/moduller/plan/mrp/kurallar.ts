import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';

// Malzeme ihtiyacı (MRP) ekranının saf yardımcıları (1560, 1564 a).

export type MrpSatiri = MrpIhtiyaciCevabi['satirlar'][number];
export type MrpSuzgeci = 'tum' | 'eksik' | 'agac';

// Katalog türünün ekrandaki adı; listede olmayan tür olduğu gibi yazılır.
const TUR_ADI: Readonly<Record<string, string>> = {
  hammadde: 'Hammadde', yarimamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş', hizmet: 'Hizmet', ticari_mal: 'Ticari mal',
};
export const turAdi = (tur: string | null) => (tur === null ? null : TUR_ADI[tur] ?? tur);

// Miktar sunucuda dört haneye yuvarlanmıştır; ekran fazlasını yazmaz.
export const sayiMetni = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

// Gün (YYYY-AA-GG) tesis günüdür: saat dilimine çevrilmeden yazılır.
export const gunMetni = (gun: string | null) => (gun === null ? null : `${gun.slice(8, 10)}.${gun.slice(5, 7)}.${gun.slice(0, 4)}`);

export const zamanMetni = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// 1545 a: net ve eksik günü ancak stok da satın alma da görünürken bilinir.
export const netGorunur = (c: Pick<MrpIhtiyaciCevabi, 'stokGorunur' | 'satinAlmaGorunur'>) => c.stokGorunur && c.satinAlmaGorunur;

// Satın alınacak eksik: ağaçla açılan yarı mamulün kalanı üretilir, eksik sayılmaz.
const eksikMi = (s: MrpSatiri) => s.net !== null && s.net > 0 && !s.acildi;

export interface MrpOzeti {
  malzeme: number;
  // Görmeyene null (kart "Veri yok" der).
  eksik: number | null;
  // Görmeyene null; görüp eksiği olmayana 'yok'.
  ilkEksikGunu: string | 'yok' | null;
}

export function mrpOzeti(c: MrpIhtiyaciCevabi): MrpOzeti {
  if (!netGorunur(c)) return { malzeme: c.satirlar.length, eksik: null, ilkEksikGunu: null };
  const eksikler = c.satirlar.filter(eksikMi);
  const gunler = eksikler.flatMap((s) => (s.eksikTarihi === null ? [] : [s.eksikTarihi])).sort();
  return { malzeme: c.satirlar.length, eksik: eksikler.length, ilkEksikGunu: gunler[0] ?? 'yok' };
}

// Görünmeyen alanların notu; hepsi görünürse null.
export function yetkiNotu(c: Pick<MrpIhtiyaciCevabi, 'stokGorunur' | 'satinAlmaGorunur'>): { baslik: string; metin: string } | null {
  if (netGorunur(c)) return null;
  const gizli = [!c.stokGorunur && 'stok', !c.satinAlmaGorunur && 'satın alma'].filter((x): x is string => x !== false).join(' ve ');
  const alanlar = [!c.stokGorunur && 'Serbest stok ve emniyet payı', !c.satinAlmaGorunur && (c.stokGorunur ? 'Açık sipariş' : 'açık sipariş')]
    .filter((x): x is string => x !== false).join(', ');
  return {
    baslik: `${gizli.charAt(0).toLocaleUpperCase('tr-TR')}${gizli.slice(1)} okuma yetkiniz yok.`,
    metin: `${alanlar}, net ihtiyaç ve eksik günü gösterilmez; brüt ihtiyaç ve günleri tam.`,
  };
}

export function suz(satirlar: readonly MrpSatiri[], suzgec: MrpSuzgeci, ara: string): MrpSatiri[] {
  const aranan = ara.trim().toLocaleLowerCase('tr-TR');
  return satirlar.filter((s) => (suzgec !== 'eksik' || (s.net !== null && s.net > 0))
    && (suzgec !== 'agac' || s.acildi || s.acilanlar.length > 0)
    && (aranan === '' || `${s.malzeme.kod ?? ''} ${s.malzeme.ad ?? ''}`.toLocaleLowerCase('tr-TR').includes(aranan)));
}

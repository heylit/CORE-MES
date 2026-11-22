import type {
  AlternatifSeti, KartAlternatifleriCevabi, KullanimYeri, MuadilTuru, SeciliAlternatif, ZarfKarti,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { FORM_ADLARI } from '#paylasilan/sozlesme/stok-kontrol-sabitleri.ts';

// 3572 a: kartın tek Alternatifler tablosu. Sıralı setler ve elle eklenen kartlar kullanıcının sırasıyla; sonra kuraldan gelenler
// (eşdeğer, elle eklenen, önerilmeyen ve bir sete uyan kart kuraldan tekrar edilmez: K4), sonra önerilmeyenler, en altta eşdeğerler.
// Öncelik sunucuda hesaplanır; burada yalnız gösterim sırası kurulur.
export type TabloSatiri =
  | { tur: 'set'; anahtar: string; set: AlternatifSeti }
  | { tur: 'elle'; anahtar: string; secili: SeciliAlternatif }
  | { tur: 'kural'; anahtar: string; kart: ZarfKarti }
  | { tur: 'onerilmez'; anahtar: string; secili: SeciliAlternatif }
  | { tur: 'esdeger'; anahtar: string; kart: { no: number; kod: string | null; ad: string | null } };

export function tabloSatirlari(b: KartAlternatifleriCevabi, kuraldan: readonly ZarfKarti[]): TabloSatiri[] {
  const sirali: { sira: number; tur: number; satir: TabloSatiri }[] = [
    ...b.setler.map((set) => ({ sira: set.sira, tur: 1, satir: { tur: 'set' as const, anahtar: `set-${String(set.id)}`, set } })),
    ...b.secili.filter((x) => !x.onerilmez).map((secili) => ({ sira: secili.sira ?? 0, tur: 0, satir: { tur: 'elle' as const, anahtar: `kart-${String(secili.alternatifNo)}`, secili } })),
  ].sort((a, c) => a.sira - c.sira || a.tur - c.tur);
  const disarida = new Set([
    ...b.esdegerler.map((e) => e.no), ...b.secili.map((x) => x.alternatifNo), ...b.setler.flatMap((t) => t.uyanlar.map((u) => u.no)),
  ]);
  return [
    ...sirali.map((x) => x.satir),
    ...kuraldan.filter((k) => !disarida.has(k.no)).map((kart) => ({ tur: 'kural' as const, anahtar: `kural-${String(kart.no)}`, kart })),
    ...b.secili.filter((x) => x.onerilmez).map((secili) => ({ tur: 'onerilmez' as const, anahtar: `onerilmez-${String(secili.alternatifNo)}`, secili })),
    ...b.esdegerler.map((kart) => ({ tur: 'esdeger' as const, anahtar: `esdeger-${String(kart.no)}`, kart })),
  ];
}

// Yukarı ya da aşağı taşınan öğeyle sunucuya giden tam sıra (setler ve elle kartlar).
export function siraDegisimi(satirlar: readonly TabloSatiri[], anahtar: string, yon: -1 | 1): { tur: 'set' | 'kart'; no: number }[] | null {
  const ogeler = satirlar.filter((s): s is Extract<TabloSatiri, { tur: 'set' | 'elle' }> => s.tur === 'set' || s.tur === 'elle');
  const i = ogeler.findIndex((s) => s.anahtar === anahtar);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= ogeler.length) return null;
  const yeni = [...ogeler];
  [yeni[i], yeni[j]] = [yeni[j]!, yeni[i]!];
  return yeni.map((s) => (s.tur === 'set' ? { tur: 'set', no: s.set.id } : { tur: 'kart', no: s.secili.alternatifNo }));
}

export const TUR_ADI: Record<MuadilTuru, string> = { tam: 'Tam', ust: 'Üst', sartli: 'Şartlı' };
export const YER_ADI: Record<KullanimYeri, string> = { talep: 'Talep', satin_alma: 'Satın alma', uretim: 'Üretim' };
export const YERLER: readonly KullanimYeri[] = ['talep', 'satin_alma', 'uretim'];
export const yerMetni = (l: readonly KullanimYeri[] | null): string =>
  l === null ? 'Hiçbir yerde' : l.length === YERLER.length ? 'Hepsi' : YERLER.filter((y) => l.includes(y)).map((y) => YER_ADI[y]).join(' · ');

export const formAdi = (f: string): string => (FORM_ADLARI as Readonly<Record<string, string>>)[f] ?? f;
const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });

// Setin tek satırlık özeti: "Çubuk · d 40–46 · 6082, 6061 · T6".
export function setOzeti(n: AlternatifSeti['nitelikler']): string {
  return n.map((x) => {
    if (x.degerler !== null) return x.nitelik === 'form' ? x.degerler.map(formAdi).join(', ') : x.degerler.join(', ');
    return `${x.nitelik} ${x.alt === null ? '…' : sayi(x.alt)}–${x.ust === null ? '…' : sayi(x.ust)}`;
  }).join(' · ');
}

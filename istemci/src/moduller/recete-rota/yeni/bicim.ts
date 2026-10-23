// Ortak biçimler (bütün parçalar). Veri yoksa "—" yazılır; sıfır uydurulmaz.
export const YOK = '—';

const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
const tarihBicimi = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const zamanBicimi = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const sayi = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? YOK : sayiBicimi.format(v));

// Miktar ve birim ("12,5 kg"); birim yoksa yalnız sayı.
export const miktar = (v: number | null | undefined, birim: string | null | undefined): string =>
  (v === null || v === undefined || !Number.isFinite(v) ? YOK : `${sayiBicimi.format(v)}${birim ? ` ${birim}` : ''}`);

// Dakika ("90 dk"); süreler sunucuda dakikadır.
export const dakika = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? YOK : `${sayiBicimi.format(v)} dk`);

// Tarih: ISO tarih ("2026-10-23") ya da ms (epoch).
export function tarih(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return YOK;
  const d = typeof v === 'number' ? new Date(v) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? YOK : tarihBicimi.format(d);
}

export function zaman(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return YOK;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? YOK : zamanBicimi.format(d);
}

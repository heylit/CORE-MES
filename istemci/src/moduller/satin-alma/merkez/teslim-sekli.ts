import { DELIVERY } from './constants.ts';

const kac = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Teslim şekli seçimi: açılır liste (datalist değil). Metin kutusundaki datalist, kutu doluyken yalnız eşleşen seçeneği gösterir;
// varsayılan dolu geldiği için liste açılmıyordu. Listede olmayan eski değer kaybolmaz, seçenek olarak eklenir.
export function teslimSekliSecenekleri(deger: string): string {
  const d = deger.trim();
  const liste = d === '' || DELIVERY.includes(d) ? DELIVERY : [d, ...DELIVERY];
  return `<option value="">Belirtilmedi</option>${liste.map((x) => `<option value="${kac(x)}"${x === d ? ' selected' : ''}>${kac(x)}</option>`).join('')}`;
}

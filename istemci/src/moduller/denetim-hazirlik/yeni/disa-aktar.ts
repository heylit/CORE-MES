import { denetimAciklamasi, denetimBasligi } from './kurallar/denetim-takvimi.ts';
import { gunEkle } from './tarih.ts';
import type { Denetim, Profil } from './tipler.ts';

// Dışa aktarma (.ics, .csv, indirme, yazdırma) prototipteki gibi kalır (envanter 7 son satır). Dosya tarayıcıda üretilir; dış servis yok.

const icsKacis = (v: string): string => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545: satır 75 sekizliği geçmez; devam satırı boşlukla başlar (UTF-8 karakter bölünmez).
export function icsKatla(satir: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let n = 0;
  let sinir = 75;
  for (const ch of satir) {
    const b = enc.encode(ch).length;
    if (n + b > sinir) { out.push(cur); cur = ch; n = b; sinir = 74; } else { cur += ch; n += b; }
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function icsOlayi(a: Denetim, profil: Profil, simdi: Date = new Date()): string[] {
  const damga = simdi.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const baslik = icsKacis(denetimBasligi(a, profil));
  const L = [
    'BEGIN:VEVENT', `UID:${a.id}@denetim-hazirlik`, `DTSTAMP:${damga}`, `DTSTART;VALUE=DATE:${a.date.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${gunEkle(a.end || a.date, 1).replace(/-/g, '')}`, `SUMMARY:${baslik}`, `DESCRIPTION:${icsKacis(denetimAciklamasi(a))}`,
    `TRANSP:${a.kind === 'deadline' ? 'TRANSPARENT' : 'OPAQUE'}`,
  ];
  for (const tr of a.kind === 'deadline' ? ['-P3D', '-P1D'] : ['-P14D', '-P1D']) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${tr}`, `DESCRIPTION:${baslik}`, 'END:VALARM');
  L.push('END:VEVENT');
  return L;
}

export function icsDosyasi(liste: readonly { a: Denetim; profil: Profil }[], simdi: Date = new Date()): string {
  let L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Denetim Hazirlik//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const o of liste) L = L.concat(icsOlayi(o.a, o.profil, simdi));
  L.push('END:VCALENDAR');
  return `${L.map(icsKatla).join('\r\n')}\r\n`;
}

export const guvenliAd = (v: string): string => v.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');

// Excel'in Türkçe ayarı: noktalı virgül ayraç, BOM ile UTF-8.
export function csvMetni(satirlar: readonly (readonly (string | number | null | undefined)[])[]): string {
  const hucre = (c: string | number | null | undefined): string => {
    const s = c == null ? '' : String(c);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\ufeff${satirlar.map((r) => r.map(hucre).join(';')).join('\r\n')}`;
}

export function indir(ad: string, icerik: string | Blob, tur: string): void {
  const url = URL.createObjectURL(typeof icerik === 'string' ? new Blob([icerik], { type: tur }) : icerik);
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 4000);
}

export const htmlKacis = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export const YAZDIRMA_SINIFI = 'tc-dhy-yazdiriliyor';

// Yazdırma alanı (prototip #printArea): sayfanın geri kalanı baskıda gizlenir. `html` çağıranın kurduğu, kullanıcı metni `htmlKacis` ile
// kaçırılmış işarettir; betik içermez.
export function yazdir(html: string, baslik: string): void {
  const alan = document.createElement('div');
  alan.className = 'tc-dhy-yazdirma-alani';
  alan.setAttribute('aria-hidden', 'true');
  alan.innerHTML = html;
  const eskiBaslik = document.title;
  document.title = baslik;
  document.body.appendChild(alan);
  document.body.classList.add(YAZDIRMA_SINIFI);
  const bitir = () => {
    window.removeEventListener('afterprint', bitir);
    alan.remove();
    document.body.classList.remove(YAZDIRMA_SINIFI);
    document.title = eskiBaslik;
  };
  window.addEventListener('afterprint', bitir);
  setTimeout(() => { window.print(); }, 60);
}

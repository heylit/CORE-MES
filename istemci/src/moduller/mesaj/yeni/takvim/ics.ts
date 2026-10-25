import { M } from '../bicim.ts';
import { toplantiBitisi } from '../kurallar.ts';
import type { Gorev, Toplanti } from '../tipler.ts';

// Prototipin .ics üretimi (icsEvent, icsWrap, calAdd, calAddTask, calAddAll) birebir: telefon ve takvim uygulamaları
// dosyayı hatırlatmasıyla ekler. Dış takvim adresi (Google, Outlook) yok (208 a).
const icsTarihi = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsKacis = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const katla = (satir: string) => {
  const parcalar: string[] = [];
  let kalan = satir;
  while (kalan.length > 72) { parcalar.push(kalan.slice(0, 72)); kalan = ` ${kalan.slice(72)}`; }
  parcalar.push(kalan);
  return parcalar.join('\r\n');
};

export function icsOlayi(o: {
  uid: string; baslangic: number; bitis: number; baslik: string; aciklama?: string; yer?: string; hatirlatDk: number | null; simdi: number;
}): string {
  return [
    'BEGIN:VEVENT', `UID:${o.uid}@mesai`, `DTSTAMP:${icsTarihi(o.simdi)}`, `DTSTART:${icsTarihi(o.baslangic)}`, `DTEND:${icsTarihi(o.bitis)}`,
    `SUMMARY:${icsKacis(o.baslik)}`, o.aciklama ? `DESCRIPTION:${icsKacis(o.aciklama)}` : '', o.yer ? `LOCATION:${icsKacis(o.yer)}` : '',
    ...(o.hatirlatDk !== null
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsKacis(o.baslik)}`, `TRIGGER:-PT${o.hatirlatDk}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
  ].filter(Boolean).map(katla).join('\r\n');
}

export const icsTakvimi = (olaylar: readonly string[]) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mesai//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mesai', ...olaylar, 'END:VCALENDAR',
].join('\r\n');

const toplantiAciklamasi = (mt: Toplanti, ad: (id: string) => string) =>
  [mt.agenda, mt.link ? `Bağlantı: ${mt.link}` : '', `Düzenleyen: ${ad(mt.by)}`].filter(Boolean).join('\n\n');

export const toplantiOlayi = (mt: Toplanti & { id: string }, ad: (id: string) => string, simdi: number) => icsOlayi({
  uid: mt.id, baslangic: mt.start, bitis: toplantiBitisi(mt), baslik: mt.title, aciklama: toplantiAciklamasi(mt, ad),
  yer: mt.loc || mt.link, hatirlatDk: mt.remind ? mt.remind : null, simdi,
});

// Görev olayı hatırlatma ya da son tarih anında, yarım saatlik; hatırlatma olayın kendisidir (0 dk).
export function gorevOlayi(t: Gorev & { id: string }, aciklama: string, simdi: number): string | null {
  const an = t.remind ?? t.due;
  if (!an) return null;
  return icsOlayi({ uid: `t${t.id}`, baslangic: an, bitis: an + 30 * M, baslik: `✅ ${t.title}`, aciklama, hatirlatDk: 0, simdi });
}

// Dosya adı prototipin `slug`ı: Türkçe harf sadeleşir, harf ve rakam dışı tireye döner.
const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
export const dosyaAdi = (s: string) => String(s).replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c] ?? c).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kanal';

export function icsIndir(ad: string, metin: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([metin], { type: 'text/calendar;charset=utf-8' }));
  a.download = ad;
  a.click();
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => birak(a.href), 1000);
}

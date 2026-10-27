import { M } from '../bicim.ts';
import { benimYanitim, katilimciMi, toplantiBitisi } from '../kurallar.ts';
import type { Gorev, Kayit, Toplanti } from '../tipler.ts';

// Prototip `calAddAll`: yaklaşan toplantılarım ve görevlerim tek .ics dosyasında, hatırlatmalarıyla (RFC 5545).

const icsTarih = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsKacis = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Uzun satır katlanır (RFC 5545); devam satırı boşlukla başlar.
function katla(satir: string): string {
  const parcalar: string[] = [];
  let kalan = satir;
  while (kalan.length > 72) { parcalar.push(kalan.slice(0, 72)); kalan = ` ${kalan.slice(72)}`; }
  parcalar.push(kalan);
  return parcalar.join('\r\n');
}

function olay(uid: string, bas: number, bit: number, baslik: string, aciklama: string, yer: string, hatirlatmaDk: number | null, simdi: number): string {
  return [
    'BEGIN:VEVENT', `UID:${uid}@mesai`, `DTSTAMP:${icsTarih(simdi)}`, `DTSTART:${icsTarih(bas)}`, `DTEND:${icsTarih(bit)}`,
    `SUMMARY:${icsKacis(baslik)}`, aciklama ? `DESCRIPTION:${icsKacis(aciklama)}` : '', yer ? `LOCATION:${icsKacis(yer)}` : '',
    ...(hatirlatmaDk !== null ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsKacis(baslik)}`, `TRIGGER:-PT${String(hatirlatmaDk)}M`, 'END:VALARM'] : []),
    'END:VEVENT',
  ].filter(Boolean).map(katla).join('\r\n');
}

const sarmala = (olaylar: readonly string[]) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mesai//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mesai', ...olaylar, 'END:VCALENDAR',
].join('\r\n');

// Aktarılacak bir şey yoksa null.
export function takvimimMetni(g: {
  toplantilar: readonly Kayit<Toplanti>[];
  gorevler: readonly Kayit<Gorev>[];
  ben: string;
  ad: (id: string) => string;
  simdi: number;
}): string | null {
  const toplantilar = g.toplantilar.filter((mt) => !mt.cancelled && katilimciMi(mt, g.ben) && toplantiBitisi(mt) > g.simdi && benimYanitim(mt, g.ben) !== 'no');
  const gorevler = g.gorevler.filter((t) => t.to === g.ben && t.status !== 'done' && (t.remind || t.due) && (t.remind || t.due)! > g.simdi);
  if (!toplantilar.length && !gorevler.length) return null;
  const aciklama = (mt: Toplanti) => [mt.agenda, mt.link ? `Bağlantı: ${mt.link}` : '', `Düzenleyen: ${g.ad(mt.by)}`].filter(Boolean).join('\n\n');
  return sarmala([
    ...toplantilar.map((mt) => olay(mt.id, mt.start, toplantiBitisi(mt), mt.title, aciklama(mt), mt.loc || mt.link || '', mt.remind ? mt.remind : null, g.simdi)),
    ...gorevler.map((t) => {
      const an = (t.remind || t.due)!;
      return olay(`t${t.id}`, an, an + 30 * M, `✅ ${t.title}`, 'Mesai görevi', '', 0, g.simdi);
    }),
  ]);
}

export function dosyaIndir(ad: string, metin: string, tur: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([metin], { type: tur }));
  a.download = ad;
  a.click();
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => birak(a.href), 1000);
}

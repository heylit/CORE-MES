// Tarih yardımcıları. Prototip tarihleri yerel saatle 'YYYY-AA-GG' metni olarak tutar ve hesaplar; aynı sonuç için burada da yerel saat
// kullanılır (UTC'ye çevrilirse gece yarısına yakın gün kayardı).

export const ISO_TARIH = /^\d{4}-\d{2}-\d{2}$/;
const GUN_MS = 86_400_000;

const iki = (n: number): string => (n < 10 ? '0' : '') + String(n);
const yerel = (v: string): Date => new Date(`${v}T00:00:00`);

export const isoTarih = (d: Date): string => `${String(d.getFullYear())}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
export const bugunTarihi = (): string => isoTarih(new Date());

export function gunEkle(v: string, n: number): string {
  const d = yerel(v);
  d.setDate(d.getDate() + n);
  return isoTarih(d);
}

// Ay sonu kısalır: 31 Ocak + 1 ay = 28/29 Şubat.
export function ayEkle(v: string, n: number): string {
  const d = yerel(v);
  const gun = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const son = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(gun, son));
  return isoTarih(d);
}

// Bugünden v'ye gün (geçmiş eksi).
export function gunFarki(v: string, bugun: Date = new Date()): number {
  const t = new Date(bugun);
  t.setHours(0, 0, 0, 0);
  return Math.round((yerel(v).getTime() - t.getTime()) / GUN_MS);
}

export const gunArasi = (a: string, b: string): number => Math.round((yerel(b).getTime() - yerel(a).getTime()) / GUN_MS);

export function pazartesi(v: string): string {
  const d = yerel(v);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoTarih(d);
}

export const tariheGore = (a: { date: string }, b: { date: string }): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function tarihMetni(iso: string): string {
  if (!iso) return '';
  const d = yerel(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function tarihSaatMetni(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Haftanın aralığı: "3–9 Kas" ya da "28 Eki – 3 Kas".
export function haftaAraligi(m: string): string {
  const a = yerel(m);
  const b = yerel(gunEkle(m, 6));
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return a.getMonth() === b.getMonth() ? `${String(a.getDate())}–${b.toLocaleDateString('tr-TR', o)}` : `${a.toLocaleDateString('tr-TR', o)} – ${b.toLocaleDateString('tr-TR', o)}`;
}

// Bu aydan başlayan ya da biten ay listesi ('YYYY-AA').
export function aylar(adet: number, ileri: boolean, bugun: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < adet; i++) {
    const k = ileri ? i : i - adet + 1;
    const x = new Date(bugun.getFullYear(), bugun.getMonth() + k, 1);
    out.push(`${String(x.getFullYear())}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

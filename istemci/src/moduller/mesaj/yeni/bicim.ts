// Zaman ve sayı biçimleri eski ekranla aynı metni üretir (tr-TR). Saf işlevler; "şimdi" dışarıdan verilebilir.

export const M = 60_000;
export const H = 3_600_000;
export const D = 86_400_000;

const fSaat = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const fGun = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
const fKisa = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const fTam = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full', timeStyle: 'short' });
const fSayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export const saatDakika = (ts: number): string => fSaat.format(ts);
export const gunAdi = (ts: number): string => fGun.format(ts);
export const kisaTarih = (ts: number): string => fKisa.format(ts);
export const tamTarih = (ts: number): string => fTam.format(ts);
export const sayi = (v: unknown): string => fSayi.format(Number(v) || 0);

export const ayniGun = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

export const gunEtiketi = (ts: number, simdi = Date.now()): string =>
  ayniGun(ts, simdi) ? 'Bugün' : ayniGun(ts, simdi - D) ? 'Dün' : gunAdi(ts);

export const kisaZaman = (ts: number, simdi = Date.now()): string =>
  ayniGun(ts, simdi) ? saatDakika(ts) : ayniGun(ts, simdi - D) ? 'dün' : kisaTarih(ts);

const iki = (n: number): string => String(n).padStart(2, '0');

// Tarih girdisinin değeri (yyyy-aa-gg, yerel saat).
export const isoGun = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
};

// Yalnız tarih seçilen son tarih günün 18:00'idir (eski ekranla aynı).
export const gundenZaman = (deger: string): number | null => (deger ? new Date(`${deger}T18:00`).getTime() : null);

// Tarih-saat girdisinin değeri (yyyy-aa-ggTss:dd, yerel saat).
export const isoTarihSaat = (ts: number): string => {
  const d = new Date(ts);
  return `${isoGun(ts)}T${iki(d.getHours())}:${iki(d.getMinutes())}`;
};

export const boyutEtiketi = (bayt: number | null | undefined): string => {
  if (!bayt) return '';
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1_048_576) return `${(bayt / 1024).toFixed(0)} KB`;
  return `${(bayt / 1_048_576).toFixed(1)} MB`;
};

// Prototipin tarih, para ve sayı biçimleri (portal.html "yardımcılar"); ekran aynı metni yazar. Zamana bağlı her işlev şimdiki
// anı bağımsız değişken olarak alır: hesap ve test saate bağlı kalmaz.

export const GUN_MS = 864e5;
export const YOK = '—';

const iki = (n: number): string => String(n).padStart(2, '0');

// Yerel gün (YYYY-AA-GG). Prototip günleri yerel saatle sayar.
export function isoGun(t: number | string | Date): string {
  const x = new Date(t);
  return `${String(x.getFullYear())}-${iki(x.getMonth() + 1)}-${iki(x.getDate())}`;
}

export const bugun = (simdi: number): string => isoGun(simdi);
export const gunEkle = (simdi: number, n: number): string => isoGun(simdi + n * GUN_MS);
export const gunSonra = (gun: string, n: number): string => isoGun(new Date(`${gun}T12:00:00`).getTime() + n * GUN_MS);

export function gunBasi(simdi: number): number {
  const d = new Date(simdi);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Zaman damgası ya da gün; gün kısmı döner.
export const gunu = (s: string | null | undefined): string | null => (s ? (s.length > 10 ? isoGun(s) : s) : null);

// Bugünden o güne kalan gün (geçmişte eksi); gün yoksa null.
export function kalanGun(gun: string | null | undefined, simdi: number): number | null {
  const g = gunu(gun);
  if (g === null) return null;
  return Math.round((new Date(`${g}T00:00:00`).getTime() - gunBasi(simdi)) / GUN_MS);
}

export function gunFarki(a: string, b: string): number {
  return Math.round((new Date(`${gunu(a) ?? a}T12:00:00`).getTime() - new Date(`${gunu(b) ?? b}T12:00:00`).getTime()) / GUN_MS);
}

const tarihNesnesi = (s: string): Date => new Date(s.length === 10 ? `${s}T12:00:00` : s);

export function tarih(s: string | null | undefined): string {
  if (!s) return YOK;
  return tarihNesnesi(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function kisaTarih(s: string | null | undefined): string {
  if (!s) return YOK;
  return tarihNesnesi(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function tarihSaat(s: string | null | undefined): string {
  if (!s) return YOK;
  const d = new Date(s);
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function once(s: string, simdi: number): string {
  const dk = Math.round((simdi - new Date(s).getTime()) / 6e4);
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${String(dk)} dk önce`;
  const sa = Math.round(dk / 60);
  if (sa < 24) return `${String(sa)} sa önce`;
  const g = Math.round(sa / 24);
  if (g < 45) return `${String(g)} gün önce`;
  return tarih(s);
}

export function sureMetni(gun: string | null | undefined, simdi: number): string {
  const d = kalanGun(gun, simdi);
  if (d === null) return YOK;
  if (d < 0) return `${String(-d)} gün geçti`;
  if (d === 0) return 'bugün';
  return `${String(d)} gün kaldı`;
}

export function sayi(n: number | null | undefined, hane?: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: hane ?? 2, minimumFractionDigits: 0 }).format(n ?? 0);
}

export const yuzde = (n: number, hane?: number): string => `%${sayi(n, hane ?? 1)}`;

export function para(n: number | null | undefined, birim?: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return YOK;
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: birim ?? 'TRY', maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${birim ?? ''}`;
  }
}

// Kısa para: pano kartları ve grafik eksenleri.
export function kisaPara(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return YOK;
  const a = Math.abs(n);
  if (a >= 1e6) return `₺${sayi(n / 1e6, 1)} mn`;
  if (a >= 1e3) return `₺${sayi(n / 1e3, 0)} bin`;
  return `₺${sayi(n, 0)}`;
}

// Kullanıcının yazdığı sayı: "1.250,5" ve "1250.5" ikisi de okunur; boş ya da bozuksa NaN.
export function sayiOku(v: unknown): number {
  if (v === null || v === undefined) return Number.NaN;
  let s = String(v).trim().replace(/\s/g, '');
  if (s === '') return Number.NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number.parseFloat(s);
}

export const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;

export interface Ay { anahtar: string; etiket: string }

export function sonAylar(n: number, simdi: number): Ay[] {
  const d = new Date(simdi);
  d.setDate(1);
  const sonuc: Ay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    sonuc.push({ anahtar: `${String(x.getFullYear())}-${iki(x.getMonth() + 1)}`, etiket: AYLAR[x.getMonth()] ?? '' });
  }
  return sonuc;
}

export const ayAnahtari = (s: string): string => (gunu(s) ?? s).slice(0, 7);

export function selam(simdi: number): string {
  const s = new Date(simdi).getHours();
  return s < 6 ? 'İyi geceler' : s < 12 ? 'Günaydın' : s < 18 ? 'İyi günler' : 'İyi akşamlar';
}

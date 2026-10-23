// Uygulamanın "Tek tek sor" odak akışı (focusify): adımlı formun alanları sırayla, birer soru olarak sorulur. Burada yalnız saf kurallar.
import type { FormVerisi, KmAdim, KmAlan, KmMadde, KmSecenek } from './AdimliForm.tsx';

export type KmSoru = { tur: 'alan'; alan: KmAlan; adim: number } | { tur: 'madde'; madde: KmMadde; no: number; adim: number } | { tur: 'ek'; adim: number };

// Kontrol maddesi yanıtları ve notları kayıttaki gibi `liste` ve `listeNot` nesnelerinde tutulur.
export const maddeYaniti = (d: FormVerisi, k: string): string => String((d.liste as Record<string, unknown> | undefined)?.[k] ?? '');
export const maddeNotu = (d: FormVerisi, k: string): string => String((d.listeNot as Record<string, unknown> | undefined)?.[k] ?? '');

// Koşullu sorular: bağlı alan gerektirmedikçe sorulmaz (uygulamadaki FQ_WHEN).
const KOSUL: Record<string, (d: FormVerisi) => boolean> = {
  mrbGerekce: (d) => !!d.mrb && d.mrb !== 'Karar bekliyor',
  etkinlikKanit: (d) => !!d.etkinlik && d.etkinlik !== 'Doğrulanmadı',
  faiNeden: (d) => d.tur == null || d.tur === 'FAI',
  faiKapsam: (d) => d.tur == null || d.tur === 'FAI',
  kapanis: (d) => d.durum === 'Kapalı',
};
// Yeni kayıtta kendiliğinden dolan alanlar sorulmaz, özette düzenlenebilir.
const OTOMATIK = new Set(['no', 'tarih', 'acilis', 'muayeneci', 'dolduran']);
const ILERI_TARIH = /termin|bitis|bitiş|gecerlilik|sertBitis|sonraki/i;

const dolu = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== '');

export function sorular(adimlar: readonly KmAdim[], alanlar: readonly KmAlan[], alanAdimi: ReadonlyMap<string, number>): KmSoru[] {
  const out: KmSoru[] = [];
  adimlar.forEach((s, i) => {
    const K = s.alanlar ?? [];
    const sira = (k: string) => { const n = K.indexOf(k); return n < 0 ? 999 : n; };
    alanlar.filter((a) => alanAdimi.get(a.k) === i).sort((x, y) => sira(x.k) - sira(y.k)).forEach((alan) => out.push({ tur: 'alan', alan, adim: i }));
    (s.maddeler ?? []).forEach((madde, no) => out.push({ tur: 'madde', madde, no, adim: i }));
    if (s.icerik) out.push({ tur: 'ek', adim: i });
  });
  return out;
}

export function otomatikMi(s: KmSoru, yeni: boolean, acilis: FormVerisi, onDolgu: FormVerisi | null): boolean {
  if (!yeni || s.tur !== 'alan') return false;
  const k = s.alan.k;
  if (OTOMATIK.has(k) && s.alan.tur !== 'evet' && dolu(acilis[k])) return true;
  return k !== 'durum' && onDolgu !== null && dolu(onDolgu[k]);
}

export const soruGorunur = (s: KmSoru, d: FormVerisi): boolean => s.tur !== 'alan' || !KOSUL[s.alan.k] || KOSUL[s.alan.k]!(d);

export const zorunluSoru = (s: KmSoru | undefined): boolean => s?.tur === 'alan' && !!s.alan.zorunlu;

const secenekDegeri = (s: KmSecenek): string => String(Array.isArray(s) ? s[0] : s);
const secenekBasligi = (s: KmSecenek): string => String(Array.isArray(s) ? s[1] : s);

// Özet ve nokta durumu için sorunun yanıt metni; boşsa ''.
export function yanitMetni(s: KmSoru, d: FormVerisi): string {
  if (s.tur === 'ek') return 'x';
  if (s.tur === 'madde') return maddeYaniti(d, s.madde.k);
  const a = s.alan;
  const v = d[a.k];
  if (a.tur === 'evet') return v === true ? 'Evet' : 'Hayır';
  if (a.tur === 'isaretler') return Array.isArray(v) ? v.join(', ') : '';
  if (a.tur === 'secim') {
    const o = (a.secenekler ?? []).find((x) => secenekDegeri(x) === String(v ?? ''));
    return o && secenekDegeri(o) !== '' ? secenekBasligi(o) : '';
  }
  return v === null || v === undefined ? '' : String(v).trim();
}

// Seçim düğmeleri: en çok 8 seçenekli seçim ve evet/hayır (uygulamadaki fq-chips).
export function secimDugmeleri(a: KmAlan): { deger: string; baslik: string }[] | null {
  if (a.tur === 'evet') return [{ deger: '1', baslik: 'Evet' }, { deger: '0', baslik: 'Hayır' }];
  if (a.tur === 'secim' && (a.secenekler ?? []).length <= 8) return (a.secenekler ?? []).map((s) => ({ deger: secenekDegeri(s), baslik: secenekBasligi(s) || '—' }));
  return null;
}

export function hizliTarihler(k: string): { baslik: string; gun: number }[] {
  return ILERI_TARIH.test(k) ? [{ baslik: '+1 hafta', gun: 7 }, { baslik: '+1 ay', gun: 30 }, { baslik: '+3 ay', gun: 91 }] : [{ baslik: 'Bugün', gun: 0 }, { baslik: 'Dün', gun: -1 }];
}

export function gunEkle(gun: number, simdi = new Date()): string {
  const d = new Date(simdi);
  d.setDate(d.getDate() + gun);
  return d.toISOString().slice(0, 10);
}

// Yazılan metne uyan en çok 6 öneri; tam eşleşen önerilmez.
export function oneriler(liste: readonly string[], yazilan: string): string[] {
  const q = yazilan.trim().toLocaleLowerCase('tr');
  return liste.filter((v) => { const x = v.toLocaleLowerCase('tr'); return v && x !== q && (!q || x.includes(q)); }).slice(0, 6);
}

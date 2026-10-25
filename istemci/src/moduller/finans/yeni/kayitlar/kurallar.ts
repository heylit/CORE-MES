import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { kisaTarih } from '../bicim.ts';
import { diffDays, gross, ymLong, type Islem } from '../motor.ts';

// Kayıtlar ekranının saf kuralları (prototipte VIEWS.kayit ve exportCsv). Sıra, süzgeç ve durum metni prototipteki gibidir.

export const KAYIT_SUZGECLERI = [['tum', 'Tümü'], ['satis', 'Satışlar'], ['alis', 'Alış ve giderler'], ['acik', 'Açık'], ['geciken', 'Geciken']] as const;
export type KayitSuzgeci = (typeof KAYIT_SUZGECLERI)[number][0];
// Prototipte ilk 50 satır görünür, "Daha fazla göster" 60 satır ekler.
export const ILK_SINIR = 50;
export const SINIR_ADIMI = 60;

const gecikti = (t: Islem, bugun: string): boolean => t.status === 'acik' && t.due < bugun;

export function suzgectenGecer(t: Islem, suzgec: KayitSuzgeci, bugun: string): boolean {
  if (suzgec === 'satis') return t.type === 'gelir';
  if (suzgec === 'alis') return t.type === 'gider';
  if (suzgec === 'acik') return t.status === 'acik';
  if (suzgec === 'geciken') return gecikti(t, bugun);
  return true;
}

export function suzgecSayilari(tx: readonly Islem[], bugun: string): Record<KayitSuzgeci, number> {
  const s = { tum: 0, satis: 0, alis: 0, acik: 0, geciken: 0 };
  for (const t of tx) for (const [k] of KAYIT_SUZGECLERI) if (suzgectenGecer(t, k, bugun)) s[k] += 1;
  return s;
}

// Arama cari, açıklama ve kategoride, Türkçe küçük harfle.
export function kayitlariSuz(tx: readonly Islem[], suzgec: KayitSuzgeci, arama: string, bugun: string): Islem[] {
  const q = arama.trim().toLocaleLowerCase('tr');
  return tx
    .filter((t) => suzgectenGecer(t, suzgec, bugun))
    .filter((t) => !q || `${t.party} ${t.desc ?? ''} ${t.cat}`.toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface AyGrubu { ay: string; baslik: string; satirlar: Islem[] }
// Sıralı satırlar ay ay bölünür (tablodaki ay başlığı satırı).
export function aylaraBol(satirlar: readonly Islem[]): AyGrubu[] {
  const gruplar: AyGrubu[] = [];
  for (const t of satirlar) {
    const ay = t.date.slice(0, 7);
    const son = gruplar[gruplar.length - 1];
    if (son && son.ay === ay) son.satirlar.push(t);
    else gruplar.push({ ay, baslik: ymLong(ay), satirlar: [t] });
  }
  return gruplar;
}

export function kayitDurumu(t: Islem, bugun: string): { metin: string; ton: RozetTonu } {
  if (t.status === 'odendi') return { metin: t.type === 'gelir' ? 'Tahsil edildi' : 'Ödendi', ton: 'tamam' };
  if (t.status === 'cek') return { metin: 'Çek / senetle', ton: 'pasif' };
  if (t.due < bugun) return { metin: `${diffDays(bugun, t.due)} gün gecikti`, ton: 'hata' };
  return { metin: `Vade ${kisaTarih(t.due)}`, ton: 'uyari' };
}

export const kategoriEtiketi = (t: Islem): string => (t.np ? (t.desc === 'Açılış bakiyesi' ? 'Açılış bakiyesi' : 'Avans') : t.cat);
export const isaretliTutar = (t: Islem): number => (t.type === 'gider' ? -1 : 1) * gross(t);

// "Excel'e aktar": bütün kayıtlar, süzgeçsiz (prototipteki sütunlar). Tarih gg.aa.yyyy, tutar sayı.
export const CSV_BASLIKLARI = ['Tarih', 'Tür', 'Kategori', 'Cari', 'Açıklama', 'KDV hariç', 'KDV %', 'KDV dahil', 'Vade', 'Durum', 'Ödeme tarihi'] as const;
const gun = (s: string | null | undefined): string => (s ? s.split('-').reverse().join('.') : '');
const DURUM_CSV = { acik: 'açık', odendi: 'ödendi', cek: 'çek' } as const;
export function kayitCsvSatirlari(tx: readonly Islem[]): (string | number)[][] {
  return tx.map((t) => [gun(t.date), t.type, t.cat, t.party, t.desc ?? '', t.amount, t.kdv ?? 0, Math.round(gross(t) * 100) / 100, gun(t.due), DURUM_CSV[t.status], gun(t.paidDate)]);
}

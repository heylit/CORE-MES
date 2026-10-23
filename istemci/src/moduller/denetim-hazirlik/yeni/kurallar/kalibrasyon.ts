import { kalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';
import type { OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { KDUR } from '../icerik/kalibrasyon.ts';
import { bugunTarihi, gunArasi } from '../tarih.ts';
import type { Cihaz } from '../tipler.ts';

// Ölçü aletleri Kalibrasyon modülündedir (329 a): liste oradan salt okunur gelir, durum ve vade onun tek kuralıyla hesaplanır.

// Prototipin cihaz kaydına çevrilir; Kalibrasyonda karşılığı olmayan alanlar boş metindir (olcu-aleti.ts ile aynı).
export const cihazlar = (aletler: OlcuAletleriCevabi['aletler']): Cihaz[] => aletler.map((a) => ({
  id: a.id, no: a.no, ad: a.ad, marka: '', seri: '', aralik: a.aralik, coz: '', yer: a.yer, sorumlu: '', lab: '', cert: a.cert, kabul: '', note: '',
  tur: 'dis', st: a.st, res: a.res, per: a.per, last: a.last, nx: a.nx, hist: a.hist,
}));

const kural = (d: Cihaz) => kalibrasyonDurumu({ kullanimDisi: false, sonTarih: d.last || null, periyotAy: d.per, vade: d.nx || null, bugun: bugunTarihi() });

export const cihazVadesi = (d: Cihaz): string => kural(d).vade ?? '';

export type CihazDurumKodu = 'pasif' | 'yok' | 'gec' | 'ok' | 'bugun' | 'cokyak' | 'yak';
// ton: gösterim tonu (kötü, uyarı, iyi, soluk).
export interface CihazDurumu { k: CihazDurumKodu; t: string; ton: 'kotu' | 'uyari' | 'iyi' | 'soluk'; dd: number | null }

export function cihazDurumu(d: Cihaz): CihazDurumu {
  if (d.st !== 'aktif') return { k: 'pasif', t: KDUR[d.st], ton: 'soluk', dd: null };
  const r = kural(d);
  if (r.durum === 'kayit-yok') return { k: 'yok', t: 'Kalibrasyon kaydı yok', ton: 'kotu', dd: null };
  const dd = r.kalanGun ?? 0;
  if (r.durum === 'gecmis') return { k: 'gec', t: `${String(-dd)} gün gecikti`, ton: 'kotu', dd };
  if (r.durum === 'gecerli') return { k: 'ok', t: `${String(dd)} gün kaldı`, ton: 'iyi', dd };
  if (dd === 0) return { k: 'bugun', t: 'Bugün', ton: 'kotu', dd: 0 };
  if (dd <= 7) return { k: 'cokyak', t: `${String(dd)} gün kaldı`, ton: 'kotu', dd };
  return { k: 'yak', t: `${String(dd)} gün kaldı`, ton: 'uyari', dd };
}

// Periyodun geçen oranı (0-1); kayıt ya da vade yoksa 0.
export function cihazCevrimi(d: Cihaz): number {
  const n = cihazVadesi(d);
  if (!d.last || !n) return 0;
  const tot = gunArasi(d.last, n);
  const gecen = gunArasi(d.last, bugunTarihi());
  return tot > 0 ? Math.max(0, Math.min(1, gecen / tot)) : 1;
}

export interface KalibrasyonIstatistigi { n: number; gec: number; yak: number; ok: number; pasif: number; yok: number; ay: number; uyum: number | null }

export function kalibrasyonIstatistigi(liste: readonly Cihaz[]): KalibrasyonIstatistigi {
  const s = { n: 0, gec: 0, yak: 0, ok: 0, pasif: 0, yok: 0, ay: 0, uyum: null as number | null };
  const m = bugunTarihi().slice(0, 7);
  for (const d of liste) {
    const st = cihazDurumu(d);
    if (st.k === 'pasif') { s.pasif++; continue; }
    s.n++;
    if (st.k === 'gec' || st.k === 'yok') {
      s.gec++;
      if (st.k === 'yok') s.yok++;
    } else if (st.k === 'bugun' || st.k === 'cokyak' || st.k === 'yak') s.yak++;
    else s.ok++;
    if (cihazVadesi(d).slice(0, 7) === m) s.ay++;
  }
  s.uyum = s.n ? Math.round(((s.n - s.gec) / s.n) * 100) : null;
  return s;
}

// Liste süzgeci ve sırası (prototip kList): pasifler sonda, vadesi yakın önce.
export function cihazListesi(liste: readonly Cihaz[], suzgec: string, ara: string): Cihaz[] {
  const q = ara.toLocaleLowerCase('tr');
  return liste.filter((d) => {
    const st = cihazDurumu(d);
    if (suzgec === 'gec' && !(st.k === 'gec' || st.k === 'yok')) return false;
    if (suzgec === 'yak' && !(st.k === 'bugun' || st.k === 'cokyak' || st.k === 'yak')) return false;
    if (suzgec === 'ok' && st.k !== 'ok') return false;
    if (suzgec === 'pasif' && st.k !== 'pasif') return false;
    if (suzgec !== 'pasif' && suzgec !== 'all' && st.k === 'pasif') return false;
    if (q && ![d.no, d.ad, d.marka, d.seri, d.yer, d.sorumlu, d.lab].join(' ').toLocaleLowerCase('tr').includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const pa = cihazDurumu(a).k === 'pasif';
    const pb = cihazDurumu(b).k === 'pasif';
    if (pa !== pb) return pa ? 1 : -1;
    const na = cihazVadesi(a) || '0000';
    const nb = cihazVadesi(b) || '0000';
    return na < nb ? -1 : na > nb ? 1 : a.no < b.no ? -1 : 1;
  });
}

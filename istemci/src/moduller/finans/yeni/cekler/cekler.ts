import type { Komut } from '../akislar.ts';
import type { HazirVeri, SunucuCeki } from '../donustur.ts';
import { addDays, diffDays, fmtD, sum, type Cek, type FinansMotoru } from '../motor.ts';

// Çek ve senet bölümünün saf hesapları (prototipte VIEWS.cek ve VIEWS.cek.after). Çekler motor durumundan okunur:
// tutar TL, vade sonuçlanmış çekte sonuç tarihi (durumKur).

export type CekYonSuzgeci = 'tum' | 'alinan' | 'verilen';
export const YON_SUZGECLERI: readonly (readonly [CekYonSuzgeci, string])[] = [['tum', 'Tümü'], ['alinan', 'Alınan'], ['verilen', 'Verilen']];

export const CEK_DURUM_ADI: Record<string, string> = {
  portfoy: 'Portföyde', tahsilde: 'Bankada tahsilde', ciro: 'Ciro edildi', tahsil: 'Tahsil edildi', karsiliksiz: 'Karşılıksız',
  bekliyor: 'Ödenecek', odendi: 'Ödendi',
};
const KAPANAN = ['tahsil', 'odendi', 'ciro'];
const SONUCLANAN = [...KAPANAN, 'karsiliksiz'];

// Vadeye kalan gün yazısı; sonuçlanmış çekte yazılmaz.
export function kalanGunMetni(q: Cek, bugun: string): string {
  if (SONUCLANAN.includes(q.status)) return '';
  const g = diffDays(q.due, bugun);
  return g < 0 ? `${Math.abs(g)} gün geçti` : g === 0 ? 'Bugün' : `${g} gün kaldı`;
}

// Takipteki (sonuçlanmamış) çekler vadeye göre; son kapananlar en yeni 12'si.
export function cekListeleri(motor: FinansMotoru, yon: CekYonSuzgeci): { takipte: Cek[]; kapanan: Cek[] } {
  let liste = motor.durum.cheques.slice().sort((a, b) => (a.due < b.due ? -1 : 1));
  if (yon !== 'tum') liste = liste.filter((q) => q.dir === yon);
  return { takipte: liste.filter((q) => !KAPANAN.includes(q.status)), kapanan: liste.filter((q) => KAPANAN.includes(q.status)).reverse().slice(0, 12) };
}

export interface CekOzeti {
  portfoy: { tutar: number; adet: number };
  odenecek: { tutar: number; adet: number };
  net30: number;
  karsiliksiz: { tutar: number; adet: number };
  // En büyük keşideci ve portföydeki payı; portföy boşsa null.
  enBuyuk: { firma: string; pay: number } | null;
}
export function cekOzeti(motor: FinansMotoru): CekOzeti {
  const c = motor.durum.cheques, bugun = motor.bugun, sinir = addDays(bugun, 30);
  const giren = c.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status));
  const cikan = c.filter((q) => q.dir === 'verilen' && q.status === 'bekliyor');
  const kotu = c.filter((q) => q.status === 'karsiliksiz');
  const firmaya: Record<string, number> = {};
  for (const q of giren) firmaya[String(q.party)] = (firmaya[String(q.party)] ?? 0) + q.amount;
  const ilk = Object.entries(firmaya).sort((a, b) => b[1] - a[1])[0];
  const portfoy = sum(giren, (q) => q.amount);
  return {
    portfoy: { tutar: portfoy, adet: giren.length },
    odenecek: { tutar: sum(cikan, (q) => q.amount), adet: cikan.length },
    net30: sum(giren.filter((q) => q.due <= sinir), (q) => q.amount) - sum(cikan.filter((q) => q.due <= sinir), (q) => q.amount),
    karsiliksiz: { tutar: sum(kotu, (q) => q.amount), adet: kotu.length },
    enBuyuk: ilk && portfoy ? { firma: ilk[0], pay: ilk[1] / portfoy } : null,
  };
}

// Önümüzdeki 12 haftanın vade takvimi: alınan artı, verilen eksi; siparişten beklenen ödeme ayrı dilimdir (KDV hariç
// tahmin, çek toplamlarına karışmaz).
export interface VadeHaftasi { baslangic: string; etiket: string; giren: number; cikan: number; siparis: number }
export function vadeTakvimi(motor: FinansMotoru, siparisHaftalari: readonly { tutar: number }[]): { haftalar: VadeHaftasi[]; siparisVar: boolean } {
  const bugun = motor.bugun;
  const haftalar: VadeHaftasi[] = Array.from({ length: 12 }, (_, i) => {
    const b = addDays(bugun, i * 7);
    return { baslangic: b, etiket: fmtD(b), giren: 0, cikan: 0, siparis: -(siparisHaftalari[i]?.tutar ?? 0) };
  });
  for (const q of motor.durum.cheques) {
    const d = diffDays(q.due, bugun);
    if (d < 0 || d >= 84) continue;
    const w = haftalar[Math.floor(d / 7)]!;
    if (q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status)) w.giren += q.amount;
    if (q.dir === 'verilen' && q.status === 'bekliyor') w.cikan -= q.amount;
  }
  return { haftalar, siparisVar: siparisHaftalari.slice(0, 12).some((w) => w.tutar) };
}

/* ---------- Düzeltme ve iptal (prototipte chqForm ve iptal düğmesi; tam kipte yalnız banka, seri no ve vade düzelir) ---------- */
export interface CekDuzeltDegerleri { banka: string; seriNo: string; vade: string }
export const duzeltIlk = (c: SunucuCeki): CekDuzeltDegerleri => ({ banka: c.banka ?? '', seriNo: c.seriNo ?? '', vade: c.vade });
export function cekDuzeltKomutu(c: SunucuCeki, d: CekDuzeltDegerleri): Komut {
  return {
    uc: 'POST /finans/cekler/:id/duzelt', parametre: { id: c.id }, tekrar: false, basari: 'Çek düzeltildi.',
    govde: { surum: c.surum, banka: d.banka.trim() || null, seriNo: d.seriNo.trim() || null, vade: d.vade },
  };
}
export const cekIptalKomutu = (c: SunucuCeki): Komut =>
  ({ uc: 'POST /finans/cekler/:id/iptal', parametre: { id: c.id }, govde: { surum: c.surum }, tekrar: false, basari: 'Çek iptal edildi.' });

// Motordaki satırın sunucu çeki (yalnız sunucudan gelen çekin kaydı vardır).
export const sunucuCeki = (V: HazirVeri, q: Cek): SunucuCeki | null => (q._cekId === undefined ? null : V.cekById.get(q._cekId) ?? null);

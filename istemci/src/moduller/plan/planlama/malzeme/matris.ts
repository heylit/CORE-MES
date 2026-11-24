import { kovaBasi, type AlimPlaniSatiri } from './kurallar.ts';
import { LISTE_ADI, LISTE_TONU, type ListeDurumu, type ListeTonu } from './liste.ts';
import type { TuketimSatiri } from './toplu-talep.ts';

// 3666: malzeme ihtiyacı ve satın alma tek sayfasının matrisi (satır malzeme, sütun gün). Burası yalnız sözcük ve işaretleri üretir; sayılar
// toplu-talep.ts gunlukTuketim ve liste.ts malzemeListesi hesabındandır, burada yeni hesap yoktur (saf).

const ESIK = 1e-9;
const GUN = 24;
// "Stok yeter" sütununun bakış ufku: bugünden başlayarak bu kadar gün.
export const STOK_UFKU = 14;

export interface MatrisDurumu { ad: string; ton: ListeTonu }

// Satırdaki durum rozeti. Açık talep eksiği karşılıyorsa "Talepte", karşılamıyorsa "Talepte, yetmiyor"; plandan düşülen eksik `eksik` (talep düşülmüş).
export function matrisDurumu(liste: ListeDurumu | null, eksik: number, talepte: number): MatrisDurumu {
  const acik = eksik > ESIK;
  if (talepte > ESIK && acik) return { ad: 'Talepte, yetmiyor', ton: 'uyari' };
  if (talepte > ESIK && (liste === 'gecti' || liste === 'eksik' || liste === 'verilmeli' || liste === null)) return { ad: 'Talepte', ton: 'bilgi' };
  if (liste === null) return acik ? { ad: LISTE_ADI.verilmeli, ton: LISTE_TONU.verilmeli } : { ad: 'Yetiyor', ton: 'tamam' };
  if (liste === 'stokta') return { ad: 'Yetiyor', ton: 'tamam' };
  return { ad: LISTE_ADI[liste], ton: LISTE_TONU[liste] };
}

// Stok yeter: bugünden ilk eksik güne kadar geçen gün; ufukta eksik yoksa null. Eksik, açık sipariş ve açık talep düşülmüş eksiktir.
export function stokYeterGunu(s: TuketimSatiri | undefined, bugun: number): number | null {
  if (!s) return null;
  const g = [...s.gunler].filter(([, h]) => h.eksik > ESIK).map(([gun]) => gun).sort((a, b) => a - b)[0];
  return g === undefined ? null : Math.max(0, Math.round((g - bugun) / GUN));
}
export function stokYeterMetni(gun: number | null, stokBilinmiyor: boolean): string {
  if (stokBilinmiyor) return '—';
  return gun === null ? `${String(STOK_UFKU)}+ gün` : `${String(gun)} gün`;
}

// Açık siparişlerin geliş günü ve miktarı (gün başı saat -> miktar). Teslimi geçmiş ya da termini olmayan sipariş günü olmadığı için girmez.
export function gelisGunleri(alimlar: readonly AlimPlaniSatiri[], taban: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of alimlar) {
    if (r.src === null || r.etkin === null || !(r.miktar > ESIK)) continue;
    const gun = kovaBasi(taban, 'gun', r.etkin);
    m.set(gun, (m.get(gun) ?? 0) + r.miktar);
  }
  return m;
}

// Üstteki nabız cümlesi: stok yetmeyen malzeme sayısı, ilk eksik gün ve en geç sipariş günü geçenler.
export function nabizMetni(eksikMalzeme: number, ilkEksik: string | null, gecen: number): string {
  if (eksikMalzeme === 0) return `Plana göre ${String(STOK_UFKU)} günde stok yetmeyen malzeme yok.`;
  const gecti = gecen > 0 ? ` ${String(gecen)} malzemenin en geç sipariş günü geçti.` : '';
  return `${String(eksikMalzeme)} malzemede stok plana yetmiyor${ilkEksik === null ? '' : `, ilk eksik ${ilkEksik}`}.${gecti}`;
}

// Bakış ufkundaki özet: stok yetmeyen (eksik ya da eksiği açık talepte) malzeme sayısı ve ilk eksik gün (gün başı saat).
export function ufukOzeti(satirlar: readonly TuketimSatiri[]): { eksikMalzeme: number; ilkEksikGunu: number | null } {
  let ilk: number | null = null;
  let eksikMalzeme = 0;
  for (const s of satirlar) {
    if (s.eksik + s.talepte > ESIK) eksikMalzeme += 1;
    for (const [g, h] of s.gunler) if (h.eksik > ESIK && (ilk === null || g < ilk)) ilk = g;
  }
  return { eksikMalzeme, ilkEksikGunu: ilk };
}

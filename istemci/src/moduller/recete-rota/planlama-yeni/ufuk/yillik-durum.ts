import { useSyncExternalStore } from 'react';
import { ApiHatasi, api } from '../../../../ortak/veri/api.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  yatirimTL, yillikAyarOku, yillikDonemler, yillikModel, yillikSonuc, yillikTalep, yillikVeri, zamanKur,
  type CozumCevabi, type Donem, type YillikModel, type YillikSonuc, type YillikTalep, type YillikVeri,
} from './kurallar.ts';

// Yıllık planın çözüm durumu (eski sayfanın U.yl'si). Görünümden çıkınca kaybolmasın diye sayfa açık kaldıkça modülde durur; anahtarı
// veri sürümü ve yıllık ayardır (zz9 ylAnah): biri değişince sonuç "eski" olur, yeniden çözülür.
export type YillikDurum =
  | { durum: 'yok'; anah: string }
  | { durum: 'hesap'; anah: string; adim: string }
  | { durum: 'hata'; anah: string; hata: string }
  | { durum: 'bitti'; anah: string; v: YillikVeri; P: Donem[]; T: YillikTalep; m: YillikModel; sn: number; sonuc: YillikSonuc };

export type Cozucu = (lp: string, sure: number, want: readonly string[]) => Promise<CozumCevabi>;

// Tarayıcıda çözücü yok (454/6 a): model sayfada kurulur, HiGHS sunucuda çözer. Çözüm uzun sürebilir: başlatma iş kimliği döner, sonuç
// kimlikle beklenir. Sözleşme sunucu yamasındadır (#583); bu parça ona derlemeyle bağlı olmasın diye gövde ve cevap burada yerel tiptir.
export const YILLIK_COZ_YOLU = '/recete-rota/yillik-plan/coz';
export const COZUCU_YOK = 'Yıllık plan çözücüsü sunucuya bağlanınca açılır.';
type CozDurumu = { durum: 'suruyor' } | { durum: 'bitti'; cozum: CozumCevabi } | { durum: 'hata'; mesaj: string };
class CozucuYok extends Error {}
const BEKLEME_MS = 400;
const bekle = (ms: number): Promise<void> => new Promise((t) => { setTimeout(t, ms); });
export const sunucuCoz: Cozucu = async (lp, sure, want) => {
  let is: string;
  try {
    ({ is } = await api.post<{ is: string }>(YILLIK_COZ_YOLU, { lp, sure, want: [...want] }, { zamanAsimiMs: 30_000 }));
  } catch (e) {
    if (e instanceof ApiHatasi && (e.durum === 404 || e.durum === 405)) throw new CozucuYok(COZUCU_YOK);
    throw e;
  }
  // Sunucu süre aşımında işi kendisi hata sonucuna çevirir; bu sınır yalnız sunucu sonucu hiç vermezse bekleyişi bitirir.
  const son = Date.now() + (sure + 60) * 1000;
  while (Date.now() < son) {
    const d = await api.get<CozDurumu>(`${YILLIK_COZ_YOLU}/${is}`, { zamanAsimiMs: 30_000 });
    if (d.durum === 'bitti') return d.cozum;
    if (d.durum === 'hata') throw new Error(d.mesaj);
    await bekle(BEKLEME_MS);
  }
  throw new Error('Sunucu yıllık planın sonucunu vermedi; yeniden çözün.');
};

let guncel: YillikDurum | null = null;
const dinleyiciler = new Set<() => void>();
const koy = (d: YillikDurum | null): void => { guncel = d; for (const f of dinleyiciler) f(); };

export const yillikAnahtari = (c: PlanlamaCalismasi): string => `${c.dataVer}|${JSON.stringify(yillikAyarOku(c.D))}`;

export function useYillikDurum(): YillikDurum | null {
  return useSyncExternalStore((f) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; }, () => guncel);
}

// Testler için: modüldeki sonucu boşaltır.
export function yillikDurumSifirla(): void { koy(null); }

// Üç çözüm: yatırımsız; yatırım adaylarıyla (MIP); yatırım kararı sabit doğrusal model (gölge fiyat). Dönen ileti hata ya da null.
export async function yillikCoz(c: PlanlamaCalismasi, coz: Cozucu = sunucuCoz): Promise<string | null> {
  const z = zamanKur(c.D);
  if (z === null) return 'Planın başlangıç günü yok; yıllık plan kurulamıyor.';
  const A = yillikAyarOku(c.D);
  const v = yillikVeri(c, z, A);
  const P = yillikDonemler(z);
  const T = yillikTalep(v, P, A, z);
  if (!v.aileler.length || !v.gruplar.length) return 'Yıllık plan için sipariş ya da tahmin gerekiyor.';
  const anah = yillikAnahtari(c);
  const yaz = (adim: string): void => { if (guncel?.anah === anah && guncel.durum === 'hesap') koy({ durum: 'hesap', anah, adim }); };
  koy({ durum: 'hesap', anah, adim: 'Model kuruluyor' });
  const yatAday = (g: string, s: number): boolean => {
    const p = P[s];
    return A.yatirim && p !== undefined && p.tur === 'ay' && p.a >= (A.teslimAy || 3) * 30.4 && yatirimTL(c.D, g) !== null;
  };
  const t0 = performance.now();
  try {
    yaz('Yatırımsız plan çözülüyor');
    const m0 = yillikModel(c.D, v, P, T, A, { yat: false });
    const r0 = await coz(m0.lp, 30, m0.want);
    let r1 = r0; let m1 = m0;
    if (A.yatirim) {
      yaz('Yatırım adaylarıyla çözülüyor');
      m1 = yillikModel(c.D, v, P, T, A, { yat: true, yatAday });
      r1 = await coz(m1.lp, 60, m1.want);
    }
    yaz('Gölge fiyatlar hesaplanıyor');
    let r2 = r0;
    if (A.yatirim) { const m2 = yillikModel(c.D, v, P, T, A, { yat: true, yatAday, sabit: r1.val ?? {} }); r2 = await coz(m2.lp, 30, m2.want); }
    if (guncel?.anah !== anah) return null;
    koy({ durum: 'bitti', anah, v, P, T, m: m1, sn: (performance.now() - t0) / 1000, sonuc: yillikSonuc(c.D, v, P, T, r1, r2, m1, r0) });
  } catch (e) {
    if (e instanceof CozucuYok) { koy({ durum: 'yok', anah }); return null; }
    koy({ durum: 'hata', anah, hata: e instanceof Error ? e.message : String(e) });
  }
  return null;
}

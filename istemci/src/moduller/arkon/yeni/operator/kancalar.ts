import { useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { merkezKontrolIstegi, merkezUyarilari, type MerkezDosyasi } from '../../../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import { kayitIlgili, seyrelt } from '../../../../../../arkon/web/src/data/log-tepki.ts';
import type { DurumOlayi, SayimKaydi } from '../cekirdek/oee.ts';
import { anlikVardiya, type AnlikVardiya } from '../cekirdek/vardiya.ts';
import { ArkonDarAlanKaynagi, useArkon } from '../veri/baglam.ts';

// Operatör ekranının veri kancaları (operator-parcalar.ts useShiftLog, cizim-merkezi.ts useMerkezUyarilari, baslat.ts useFit).

export interface VardiyaKaydi { ev: DurumOlayi[]; cn: SayimKaydi[]; sh: AnlikVardiya; ok: boolean }

// Bu vardiyanın durum ve sayım kayıtları: kayıt eklenince çeyrek saniye içinde, yoksa yarım dakikada bir tazelenir.
// Durum kayıtları yedi gün geriden okunur: vardiya başındaki durumu vardiyadan önceki son kayıt söyler.
export function useVardiyaKaydi(istasyon: string, kapali: boolean): VardiyaKaydi {
  const { depo, ayarlar } = useArkon();
  const { vardiyalar, tatiller } = ayarlar;
  const [d, dYaz] = useState<VardiyaKaydi>(() => ({ ev: [], cn: [], sh: anlikVardiya(Date.now(), vardiyalar, tatiller), ok: false }));
  const oku = useCallback(async () => {
    if (kapali) return;
    const sh = anlikVardiya(Date.now(), vardiyalar, tatiller);
    try {
      const [ev, cn] = await Promise.all([
        depo.Log.query('events', { machine: istasyon, from: sh.s - 7 * 864e5, to: sh.e }),
        depo.Log.query('counts', { machine: istasyon, from: sh.s, to: sh.e }),
      ]);
      dYaz({ ev: ev as unknown as DurumOlayi[], cn: cn as unknown as SayimKaydi[], sh, ok: true });
    } catch { /* okunamadı: önceki okuma kalır */ }
  }, [depo, istasyon, kapali, vardiyalar, tatiller]);
  useEffect(() => {
    void oku();
    const s = seyrelt(() => { void oku(); }, 250);
    const birak = depo.Log.on((k, r) => { if (kayitIlgili(k, r, ['events', 'counts'], istasyon)) s.tetikle(); });
    const t = setInterval(() => { void oku(); }, 30000);
    return () => { birak(); s.birak(); clearInterval(t); };
  }, [oku, depo, istasyon]);
  return d;
}

const MERKEZ_YENILEME_MS = 60000;

// Paketteki merkez dosyalarının durumu (belge no -> eskilik). Yalnız TMI'ye bağlıyken sorulur; hata sessizdir, rozet çıkmaz.
export function useMerkezUyarilari(dosyalar: readonly MerkezDosyasi[] | null | undefined): Record<number, string> {
  const { depo } = useArkon();
  const [uyari, uyariYaz] = useState<Record<number, string>>({});
  const istek = depo.status().mode === 'server' ? merkezKontrolIstegi(dosyalar || []) : [];
  const imza = istek.map((x) => `${x.belgeId}:${x.ozet}`).join(',');
  useEffect(() => {
    if (!imza) { uyariYaz({}); return; }
    let canli = true;
    const sor = () => depo.Server.merkezKontrol(imza.split(',').map((c) => { const [b, o] = c.split(':'); return { belgeId: Number(b), ozet: o ?? '' }; }))
      .then((d) => { if (canli) uyariYaz(merkezUyarilari(d)); }, () => { if (canli) uyariYaz({}); });
    void sor();
    const t = setInterval(() => { void sor(); }, MERKEZ_YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [imza, depo]);
  return uyari;
}

// Dar ekran (eski ekranın mobil düzeni): 900 pikselden dar ya da 1200'den dar ve dik tutulan alan. Alt gezinme çubuklu görünüm açılır.
// Kök sayfa alanını ölçer (eskide iframe kendi genişliğini görürdü); kökün dışında, ölçüm yokken pencereye bakılır.
const darMi = (): boolean => { const W = window.innerWidth; const H = window.innerHeight; return W < 900 || (W < 1200 && H > W * 1.05); };
export function useDarEkran(): boolean {
  const alan = useContext(ArkonDarAlanKaynagi);
  const [dar, darYaz] = useState(darMi);
  useEffect(() => {
    if (alan !== null) return undefined;
    const f = () => darYaz(darMi());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [alan]);
  return alan ?? dar;
}

// Öğenin piksel genişliği: çizim yazısı ekran genişledikçe büyümesin diye çizim alanı ölçüye göre kurulur.
export function useGenislik<T extends HTMLElement>(yedek: number): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [en, enYaz] = useState(yedek);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const olc = () => { const w = el.clientWidth; if (w > 0) enYaz(w); };
    olc();
    if (typeof ResizeObserver === 'undefined') return;
    const g = new ResizeObserver(olc);
    g.observe(el);
    return () => g.disconnect();
  }, []);
  return [ref, en];
}

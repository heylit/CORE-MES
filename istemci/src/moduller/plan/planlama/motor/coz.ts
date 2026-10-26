import { useCallback, useSyncExternalStore } from 'react';
import type { DegerlendirmeCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { CozulmusPlan, PlanlamaCalismasi } from '../tipler.ts';
import { degerlendirmeHatasi, degerlendirmeIste } from '../siparis/degerlendirme.ts';

// Planı kur (576, eski e-coz coz 'sifir'): motor sunucuda koşar (288 a, ADR 0018), plan değerlendirme ucunun `plan-kur` turuyla; ekran
// sonucu kendi yazma yoluyla çalışmaya alır (geri alınabilir). Kayıtlı planı iyileştirme HiGHS gelene kadar pasiftir (579 b).
// Hesap sürerken sayfanın bütün "Planı kur" düğmeleri tek durumu görür; aynı anda tek hesap.

export const KURULUYOR = 'Plan kuruluyor; bir dakikaya kadar sürebilir.';
export const KAYDEDILEMEDI = 'Çalışma kaydedilemedi; plan kurulmadı. Sayfayı yenileyip yeniden deneyin.';
export const VERI_DEGISTI = 'Plan kurulurken veri değişti; plan alınmadı. Sayfayı yenileyip yeniden kurun.';

let suruyor = false;
const dinleyiciler = new Set<() => void>();
const koy = (x: boolean): void => { suruyor = x; for (const f of dinleyiciler) f(); };
const abone = (f: () => void) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; };

// Sunucunun planı çalışmaya alınır (eski coz'un S.plan kaydı). Plan, değişikliğin artırdığı veri sürümüyle güncel sayılır (degistir dataVer'i
// fn'den sonra bir artırır). Plan başka veri sürümünden kurulduysa false: plan bayat olurdu.
export function kurulanPlaniAl(t: PlanlamaCalismasi, plan: Record<string, unknown>, dataVer: number, kim: string, zaman: number): boolean {
  if (dataVer !== t.dataVer) return false;
  const once = t.plan === null ? null : (t.plan.ozet ?? null);
  t.plan = { ...plan, dataVer: t.dataVer + 1, kim, zaman, kaynak: 'sifir', oncekiOzet: once, kapali: t.kapali.slice() } as CozulmusPlan;
  return true;
}

export interface PlanKurmaAyari {
  komut: CalismaKomutu;
  kim: string;
  iste?: (surum: number, istek: { tur: 'plan-kur' }) => Promise<DegerlendirmeCevabi>;
  simdi?: () => number;
}
// Dönen: hata iletisi; plan alındıysa null (bildirim ve Geri al değişikliğin kendisinden gelir).
export async function planKur(a: PlanKurmaAyari): Promise<string | null> {
  if (suruyor) return null;
  koy(true);
  try {
    const surum = await a.komut.kaydet();
    if (surum === null) return KAYDEDILEMEDI;
    const c = await (a.iste ?? degerlendirmeIste)(surum, { tur: 'plan-kur' });
    if (c.sonuc.tur !== 'plan-kur') return VERI_DEGISTI;
    const { plan } = c.sonuc;
    const ozet = plan.ozet as { wT?: number; late?: number; n?: number } | undefined;
    let alindi = false;
    a.komut.degistir('Plan çözüldü', (t) => (alindi = kurulanPlaniAl(t, plan, c.dataVer, a.kim, (a.simdi ?? Date.now)())), {
      ayrinti: ozet?.wT != null ? `Sıfırdan kur · gecikme ${ozet.wT.toFixed(1)} sa, geciken ${String(ozet.late ?? 0)}/${String(ozet.n ?? 0)}` : 'Sıfırdan kur',
      planKoru: true,
    });
    return alindi ? null : VERI_DEGISTI;
  } catch (h) {
    return degerlendirmeHatasi(h).metin;
  } finally {
    koy(false);
  }
}

// Düğmelerin yüzü: yazamayan ya da çalışması olmayan için null (düğme yerinde pasif kalır).
export interface PlanKurucu { kur: () => void; suruyor: boolean }
export function usePlanKur(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'calisma' | 'depo'>, uyar: (ileti: string) => void): PlanKurucu | null {
  const s = useSyncExternalStore(abone, () => suruyor);
  const { komut, calisma } = o; const kim = o.depo.ben?.kisi.ad ?? '';
  const kur = useCallback(() => {
    if (!komut) return;
    void planKur({ komut, kim }).then((h) => { if (h) uyar(h); });
  }, [komut, kim, uyar]);
  return komut && calisma && o.yetki.planYaz ? { kur, suruyor: s } : null;
}

// Testler için: modüldeki durumu boşaltır.
export function planKurSifirla(): void { koy(false); }

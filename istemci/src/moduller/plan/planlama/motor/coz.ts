import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { DegerlendirmeCevabi, DegerlendirmeIstegi } from '#paylasilan/sozlesme/planlama.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { bekleyenler, bekleyenListesi, type CalismaKomutu } from '../kayit.ts';
import type { BekleyenDegisiklik, CozulmusPlan, PlanlamaCalismasi } from '../tipler.ts';
import { degerlendirmeHatasi, degerlendirmeIste } from '../siparis/degerlendirme.ts';

// Planı kur (576, eski e-coz coz 'sifir'): motor sunucuda koşar (288 a, ADR 0018), plan değerlendirme ucunun `plan-kur` turuyla; ekran
// sonucu kendi yazma yoluyla çalışmaya alır (geri alınabilir). Kayıtlı planı iyileştirme ve öne alma önizlemelidir (2129-1 b, hamle/).
// Hesap sürerken sayfanın bütün motor düğmeleri tek durumu görür; aynı anda tek hesap.

export const KURULUYOR = 'Plan kuruluyor; bir dakikaya kadar sürebilir.';
export const KAYDEDILEMEDI = 'Çalışma kaydedilemedi; plan kurulmadı. Sayfayı yenileyip yeniden deneyin.';
export const VERI_DEGISTI = 'Plan kurulurken veri değişti; plan alınmadı. Sayfayı yenileyip yeniden kurun.';

let suruyor = false;
const dinleyiciler = new Set<() => void>();
export const koy = (x: boolean): void => { suruyor = x; for (const f of dinleyiciler) f(); };
export const abone = (f: () => void) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; };
export const hesapSuruyor = (): boolean => suruyor;

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
  iste?: (surum: number, istek: Extract<DegerlendirmeIstegi, { tur: 'plan-kur' | 'plan-uygula' }>) => Promise<DegerlendirmeCevabi>;
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
      ayrinti: ozet?.wT != null ? `Sıfırdan kur · ağırlıklı gecikme ${ozet.wT.toFixed(1)} sa, geciken ${String(ozet.late ?? 0)}/${String(ozet.n ?? 0)}` : 'Sıfırdan kur',
      planKoru: true,
    });
    return alindi ? null : VERI_DEGISTI;
  } catch (h) {
    return degerlendirmeHatasi(h).metin;
  } finally {
    koy(false);
  }
}

// Bekleyen değişikliği uygula (755 a): sunucu kayıtlı planı taban alıp yalnız seçilen değişikliklerin etkilediği işleri yeniden dizer.
// Uygulananlar bekleyenden düşer; bekleyen kalmazsa plan güncel olur, kalırsa bayat kalır (onaya gönderme kapalı). Planı kur gibi tek hesap.
export const UYGULANACAK_YOK = 'Uygulanacak bekleyen değişiklik yok; sayfayı yenileyin.';
export function uygulananiAl(t: PlanlamaCalismasi, plan: Record<string, unknown>, dataVer: number, idler: readonly string[], kim: string, zaman: number): boolean {
  if (dataVer !== t.dataVer || t.plan === null) return false;
  const sec = new Set(idler);
  const kalan = bekleyenler(t).filter((e) => !sec.has(e.id));
  const once = t.plan.ozet ?? null;
  t.plan = { ...plan, dataVer: kalan.length === 0 ? t.dataVer + 1 : t.plan.dataVer, kim, zaman, kaynak: 'uygula', oncekiOzet: once, kapali: t.kapali.slice() } as CozulmusPlan;
  t.bekleyen = kalan;
  return true;
}
// `liste` atölyenin gördüğü listedir (kayit.ts bekleyenListesi), `idler` seçilenler.
export async function planUygula(a: PlanKurmaAyari & { liste: readonly BekleyenDegisiklik[]; idler: readonly string[]; komutunDevami?: boolean }): Promise<string | null> {
  if (suruyor) return null;
  const secilen = a.liste.filter((e) => a.idler.includes(e.id));
  if (secilen.length === 0) return UYGULANACAK_YOK;
  const tum = [...new Set(secilen.flatMap((e) => e.isler))];
  const isler = tum.length === 0 || tum.includes('*') ? ['*'] : tum;
  koy(true);
  try {
    const surum = await a.komut.kaydet();
    if (surum === null) return KAYDEDILEMEDI;
    const cv = await (a.iste ?? degerlendirmeIste)(surum, { tur: 'plan-uygula', isler });
    if (cv.sonuc.tur !== 'plan-uygula') return VERI_DEGISTI;
    const { plan } = cv.sonuc;
    let alindi = false;
    const n = secilen.length;
    a.komut.degistir(n > 1 ? `${String(n)} bekleyen değişiklik uygulandı` : 'Bekleyen değişiklik uygulandı',
      (t) => (alindi = uygulananiAl(t, plan, cv.dataVer, secilen.map((e) => e.id), a.kim, (a.simdi ?? Date.now)())), { ayrinti: isler.includes('*') ? 'Bütün işler' : isler.join(', '), planKoru: true, ...(a.komutunDevami ? { komutunDevami: true } : {}) });
    if (alindi) a.komut.uygulananlariBildir?.(secilen.map((e) => e.id));
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

// Atölyenin bekleyen değişiklik düğmeleri: uygula sunucuda, reddet çalışmada. Yazamayan için null.
export interface BekleyenKarari { uygula: (liste: readonly BekleyenDegisiklik[], idler: readonly string[]) => void; reddet: (idler: readonly string[], gerekce: string) => boolean; suruyor: boolean }
export function useBekleyenKarari(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'calisma' | 'depo'>, uyar: (ileti: string) => void): BekleyenKarari | null {
  const s = useSyncExternalStore(abone, () => suruyor);
  const { komut, calisma } = o; const kim = o.depo.ben?.kisi.ad ?? '';
  const uygula = useCallback((liste: readonly BekleyenDegisiklik[], idler: readonly string[]) => {
    if (!komut) return;
    void planUygula({ komut, kim, liste, idler }).then((h) => { if (h) uyar(h); });
  }, [komut, kim, uyar]);
  const reddet = useCallback((idler: readonly string[], gerekce: string) => (komut?.bekleyeniReddet ? komut.bekleyeniReddet(idler, gerekce) === null : false), [komut]);
  return komut && calisma && o.yetki.planYaz ? { uygula, reddet, suruyor: s } : null;
}

// 1786 (PLN-2): plan varken açılan emir ve öteki değişiklikler bekleyen olur; plan çubuğu hepsini tek düğmeyle uygular (önceden tek yol
// Onay sekmesindeki satırdı). Uygula sunucuda yalnız etkilenen işleri yeniden dizer; elle kararlar korunur. Plan güncelse ya da kişi
// yazamıyorsa null.
// `komutunDevami`: sunucu komutundan sonra kendiliğinden uygulama; komutla tek geri alma adımıdır.
export interface BekleyenUygulayici { uygula: (komutunDevami?: boolean) => void; suruyor: boolean; say: number }
export function useBekleyenUygula(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'calisma' | 'depo'>, uyar: (ileti: string) => void): BekleyenUygulayici | null {
  const s = useSyncExternalStore(abone, () => suruyor);
  const { komut, calisma } = o; const kim = o.depo.ben?.kisi.ad ?? '';
  const liste = useMemo(() => (calisma && calisma.plan !== null && calisma.plan.dataVer !== calisma.dataVer ? bekleyenListesi(calisma) : []), [calisma]);
  const uygula = useCallback((komutunDevami?: boolean) => {
    if (!komut || liste.length === 0) return;
    void planUygula({ komut, kim, liste, idler: liste.map((e) => e.id), ...(komutunDevami === true ? { komutunDevami: true } : {}) }).then((h) => { if (h) uyar(h); });
  }, [komut, kim, liste, uyar]);
  return komut && calisma && o.yetki.planYaz && liste.length > 0 ? { uygula, suruyor: s, say: liste.length } : null;
}

// Testler için: modüldeki durumu boşaltır.
export function planKurSifirla(): void { koy(false); }

import { useCallback, useState } from 'react';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../tipler.ts';
import { useEtki, type EtkiDurumu } from './etki.tsx';
import type { TaslakYazici } from './taslak.ts';

// Tek veri değişikliğinin etkisi (3317 a, 2. adım): satırın emirleri için kişinin taslağına "yeniden planla" isteği yazılır, sunucu planı
// taslağın görünümünde yalnız o emirlerle yeniden dizer, önce ve sonra gösterilir. "Uygula" o dizmeyi taslağa yazar (satır görünümde
// bekleyenden düşer, Geri geri alır, ortak plan taslak yazılınca değişir); "Vazgeç" isteği taslaktan geri alır.

// Seçilenle birlikte uygulanmış sayılanlar: işleri seçilenin işlerinin içinde kalan öteki satırlar (aynı emirler yeniden dizilince onların
// değişikliği de plana girer; sunucunun dizme kuralı da onları düşer). Seçilen bütün planı etkiliyorsa hepsi.
export function birlikteUygulananlar(liste: readonly BekleyenDegisiklik[], id: string): string[] {
  const tum = new Set(liste.filter((e) => e.id === id).flatMap((e) => e.isler));
  const hepsi = tum.size === 0 || tum.has('*');
  return liste.filter((e) => e.id === id || hepsi || e.isler.every((x) => tum.has(x))).map((e) => e.id);
}
// Satırın yeniden dizilecek emirleri: çalışmada olanlar; işi olmayan, bütün planı etkileyen ya da emirleri çalışmadan çıkmış satırda '*'.
export function satirIsleri(c: PlanlamaCalismasi, b: BekleyenDegisiklik): string[] {
  if (b.isler.length === 0 || b.isler.includes('*')) return ['*'];
  const var_ = new Set(c.D.siparisler.map((s) => s.id));
  const l = [...new Set(b.isler)].filter((x) => var_.has(x));
  return l.length === 0 ? ['*'] : l;
}

export interface SatirEtkisiYuzu {
  // Etkisi açık satırın bekleyen kimliği; durum 'duzen' iken açık satır yoktur.
  id: string | null;
  durum: EtkiDurumu;
  // Açık satırla birlikte uygulanacak öteki satır sayısı ve bütün planın dizilip dizilmeyeceği.
  birlikte: number;
  butun: boolean;
  gor: (id: string) => void;
  uygula: () => void;
  vazgec: () => void;
  mesgul: boolean;
}

// c: gösterilen çalışma (taslak varsa görünümü); liste: listede görünen veri değişiklikleri. Yazamayan kişide ya da plan yokken null.
export function useSatirEtkisi({ c, taslak, liste }: { c: PlanlamaCalismasi; taslak: TaslakYazici | null; liste: readonly BekleyenDegisiklik[] }): SatirEtkisiYuzu | null {
  const [acik, setAcik] = useState<{ id: string; birlikte: number; butun: boolean } | null>(null);
  const { durum, setDurum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => { setAcik(null); } });
  const gor = useCallback((id: string) => {
    const b = liste.find((x) => x.id === id);
    if (b === undefined) return;
    const isler = satirIsleri(c, b);
    const butun = isler.includes('*');
    setAcik({ id, butun, birlikte: (butun ? liste.length : birlikteUygulananlar(liste, id).length) - 1 });
    void dene({ tur: 'yeniden-planla', isler }, isler);
  // dene her çizimde yenidir; taslağın ve çalışmanın o anki hâlini okur.
  }, [liste, c, dene]);
  if (taslak === null || c.plan === null) return null;
  return {
    id: durum.tur === 'duzen' ? null : acik?.id ?? null, durum, birlikte: acik?.birlikte ?? 0, butun: acik?.butun ?? false, gor,
    uygula: () => { if (durum.tur === 'etki') void uygula(durum.e); },
    // Hata iletisi kapatılır: istek taslakta kaldıysa taslak çubuğundaki Geri ile alınır (ileti söyler).
    vazgec: () => { if (durum.tur === 'hata') { setDurum({ tur: 'duzen' }); setAcik(null); } else void vazgec(); },
    mesgul: taslak.mesgul || taslak.diziliyor,
  };
}

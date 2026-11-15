import { useRef, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { bekleyenListesi, type CalismaKomutu } from '../kayit.ts';
import { hesapSuruyor, koy, uygulananiAl } from '../motor/coz.ts';
import { degerlendirmeHatasi, degerlendirmeIste } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { etkiSatirlari, ozetOku, type PlanOzeti } from './ayarlar.ts';

// Ayar ya da emrin yönü gibi planı yeniden dizen değişiklik önce etkisiyle gösterilir (3282 1b, 1c): değişiklik çalışmaya bekleyen olarak
// yazılır, sunucu planı bekleyenlerle yeniden dizer (plan-uygula, ADR 0018), önce ve sonra gösterilir. "Uygula" hesaplanan planı alır,
// "Vazgeç" değişikliği geri alır. Plan yoksa değişiklik yalnız yazılır.

export type Etki = { plan: Record<string, unknown>; dataVer: number; once: PlanOzeti | null; sonra: PlanOzeti; idler: string[]; oteki: number };
export type EtkiDurumu = { tur: 'duzen' } | { tur: 'hesap' } | { tur: 'etki'; e: Etki } | { tur: 'hata'; ileti: string };

export interface EtkiSecenekleri {
  c: PlanlamaCalismasi;
  komut: CalismaKomutu | null;
  kim: string;
  // Uygula başarılıysa ('uygulandi'), değişiklik planı olmadan yazıldıysa ya da geri alındıysa ('tazele').
  sonuc: (s: 'uygulandi' | 'tazele') => void;
  iste?: typeof degerlendirmeIste | undefined;
}

export function useEtki({ c, komut, kim, sonuc, iste }: EtkiSecenekleri) {
  // Hesap beklenirken çalışma değişir; sonuç en son çalışmayla eşlenir.
  const son = useRef(c); son.current = c;
  const [durum, setDurum] = useState<EtkiDurumu>({ tur: 'duzen' });

  const dene = async (ne: string, yaz: (x: PlanlamaCalismasi) => boolean, ayrinti: string) => {
    if (komut === null || hesapSuruyor()) return;
    const once = c.plan === null ? null : ozetOku(c.plan);
    const onceki = new Set(bekleyenListesi(c).map((b) => b.id));
    if (!komut.degistir(ne, yaz, { ayrinti })) return;
    if (c.plan === null) { sonuc('tazele'); setDurum({ tur: 'duzen' }); return; }
    setDurum({ tur: 'hesap' }); koy(true);
    try {
      const surum = await komut.kaydet();
      if (surum === null) { setDurum({ tur: 'hata', ileti: 'Çalışma kaydedilemedi; etki hesaplanmadı. Değişiklik bekleyen olarak kaldı.' }); return; }
      const cv = await (iste ?? degerlendirmeIste)(surum, { tur: 'plan-uygula', isler: ['*'] });
      const sonra = cv.sonuc.tur === 'plan-uygula' ? ozetOku(cv.sonuc.plan) : null;
      if (cv.sonuc.tur !== 'plan-uygula' || sonra === null) { setDurum({ tur: 'hata', ileti: 'Plan hesaplanırken veri değişti; etki gösterilemedi.' }); return; }
      const tum = bekleyenListesi(son.current).map((b) => b.id);
      setDurum({ tur: 'etki', e: { plan: cv.sonuc.plan, dataVer: cv.dataVer, once, sonra, idler: tum.filter((id) => !onceki.has(id)), oteki: onceki.size } });
    } catch (h) {
      setDurum({ tur: 'hata', ileti: degerlendirmeHatasi(h).metin });
    } finally { koy(false); }
  };
  const uygula = (ne: string, e: Etki) => {
    if (komut === null) return;
    let alindi = false;
    komut.degistir(ne, (x) => (alindi = uygulananiAl(x, e.plan, e.dataVer, bekleyenListesi(x).map((b) => b.id), kim, Date.now())), { planKoru: true, ayrinti: 'Bütün işler' });
    if (alindi) { setDurum({ tur: 'duzen' }); sonuc('uygulandi'); } else setDurum({ tur: 'hata', ileti: 'Plan bu arada değişti; değişiklik bekleyen olarak kaldı. Plan çubuğundan uygulanabilir.' });
  };
  const vazgec = (e: Etki) => {
    const geri = e.idler.length > 0 && komut?.bekleyeniReddet ? komut.bekleyeniReddet(e.idler, 'Etkisi görüldü; vazgeçildi') === null : komut?.geriAl() ?? false;
    if (geri) { sonuc('tazele'); setDurum({ tur: 'duzen' }); } else setDurum({ tur: 'hata', ileti: 'Değişiklik geri alınamadı; Geri ile ya da plan çubuğundaki bekleyenlerden geri alın.' });
  };
  return { durum, setDurum, dene, uygula, vazgec };
}

export function EtkiBolumu({ ad, e, uygula, vazgec }: { ad: string; e: Etki; uygula: () => void; vazgec: () => void }) {
  return (
    <section className="tc-pyq-ayar-etki" aria-label={ad}>
      <h3>Etkisi</h3>
      <dl>
        {etkiSatirlari(e.once, e.sonra).map((s) => (
          <div key={s.ad}><dt>{s.ad}</dt><dd data-yon={s.yon}>{s.once === null ? s.sonra : `${s.once} → ${s.sonra}`}</dd></div>
        ))}
      </dl>
      {e.oteki > 0 && <p className="tc-pyq-not">{`Plan çubuğunda bekleyen ${String(e.oteki)} değişiklik de bu hesaba katıldı; Uygula onları da uygular.`}</p>}
      <div className="tc-pyq-ayar-dugmeler">
        <Dugme tur="birincil" simge="check" onClick={uygula}>Uygula</Dugme>
        <Dugme tur="ikincil" simge="x" onClick={vazgec}>Vazgeç</Dugme>
      </div>
    </section>
  );
}

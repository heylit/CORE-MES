import { useState } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { bekleyenListesi } from '../kayit.ts';
import { degerlendirmeHatasi } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { etkiSatirlari, ozetOku, type PlanOzeti } from './ayarlar.ts';
import type { TaslakYazici } from './taslak.ts';

// Ayar ya da emrin yönü gibi planı yeniden dizen değişiklik önce etkisiyle gösterilir (3282 1b, 1c, 1d-2b): değişiklik kişinin taslağına
// komut olarak yazılır, sunucu planı taslağın görünümünde yeniden dizer (plan-uygula), önce ve sonra gösterilir. "Uygula" o dizmeyi
// taslağa yazar, "Vazgeç" komutu taslaktan geri alır. Ortak çalışma taslak "Plana yaz"ılınca değişir. Plan yoksa değişiklik yalnız yazılır.

export type Etki = { is: string; once: PlanOzeti | null; sonra: PlanOzeti; oteki: number };
export type EtkiDurumu = { tur: 'duzen' } | { tur: 'hesap' } | { tur: 'etki'; e: Etki } | { tur: 'hata'; ileti: string };

export interface EtkiSecenekleri {
  c: PlanlamaCalismasi;
  taslak: TaslakYazici | null;
  // Uygula başarılıysa ('uygulandi'), değişiklik planı olmadan yazıldıysa ya da geri alındıysa ('tazele').
  sonuc: (s: 'uygulandi' | 'tazele') => void;
}

export function useEtki({ c, taslak, sonuc }: EtkiSecenekleri) {
  const [durum, setDurum] = useState<EtkiDurumu>({ tur: 'duzen' });

  // isler: yeniden dizilecek siparişler; verilmezse bütün plan.
  const dene = async (k: TaslakKomutu, isler: readonly string[] = ['*']) => {
    if (taslak === null || taslak.mesgul) return;
    const once = c.plan === null ? null : ozetOku(c.plan);
    const oteki = bekleyenListesi(c).length;
    if (!(await taslak.yaz(k, false))) return;
    if (c.plan === null) { sonuc('tazele'); setDurum({ tur: 'duzen' }); return; }
    setDurum({ tur: 'hesap' });
    try {
      const d = await taslak.degerlendir({ tur: 'plan-uygula', isler: [...isler] });
      const sonra = d.cevap.sonuc.tur === 'plan-uygula' ? ozetOku(d.cevap.sonuc.plan) : null;
      if (sonra === null) { setDurum({ tur: 'hata', ileti: 'Plan hesaplanırken veri değişti; etki gösterilemedi. Değişiklik taslakta kaldı.' }); return; }
      setDurum({ tur: 'etki', e: { is: d.is, once, sonra, oteki } });
    } catch (h) {
      setDurum({ tur: 'hata', ileti: degerlendirmeHatasi(h).metin });
    }
  };
  const uygula = async (e: Etki) => {
    if (taslak === null) return;
    if (await taslak.dizmeyiYaz(e.is)) { setDurum({ tur: 'duzen' }); sonuc('uygulandi'); }
    else setDurum({ tur: 'hata', ileti: 'Taslak bu arada değişti; değişiklik taslakta kaldı, plan yeniden dizilince görünür.' });
  };
  const vazgec = async () => {
    if (taslak !== null && (await taslak.geriAl(false))) { sonuc('tazele'); setDurum({ tur: 'duzen' }); }
    else setDurum({ tur: 'hata', ileti: 'Değişiklik geri alınamadı; taslak çubuğundaki Geri al ile alın.' });
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
      {e.oteki > 0 && <p className="tc-pyq-not">{`Taslakta dizilmeyi bekleyen ${String(e.oteki)} değişiklik de bu hesaba katıldı.`}</p>}
      <div className="tc-pyq-ayar-dugmeler">
        <Dugme tur="birincil" simge="check" onClick={uygula}>Uygula</Dugme>
        <Dugme tur="ikincil" simge="x" onClick={vazgec}>Vazgeç</Dugme>
      </div>
    </section>
  );
}

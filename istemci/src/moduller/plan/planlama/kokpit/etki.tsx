import { useRef, useState } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { bekleyenListesi } from '../kayit.ts';
import { degerlendirmeHatasi } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { etkiSatirlari, ozetOku, type PlanOzeti } from '../ayarlar/alanlar.ts';
import { dizmeMi, type TaslakYazici } from './taslak.ts';

// Ayar ya da emrin yönü gibi planı yeniden dizen değişiklik önce etkisiyle gösterilir (3282 1b, 1c, 1d-2b): değişiklik kişinin taslağına
// komut olarak yazılır, sunucu planı taslağın görünümünde yeniden dizer (plan-uygula), önce ve sonra gösterilir. "Uygula" o dizmeyi
// taslağa yazar, "Vazgeç" komutu taslaktan geri alır. Ortak çalışma taslak "Plana yaz"ılınca değişir. Plan yoksa değişiklik yalnız yazılır.

// plan: sunucunun döndüğü bütün plan (3792: Planda böl tahtada taslak olarak gösterir); yalnız özet isteyenler yok sayar.
export type Etki = { is: string; once: PlanOzeti | null; sonra: PlanOzeti; oteki: number; plan?: Record<string, unknown> };
export type EtkiDurumu = { tur: 'duzen' } | { tur: 'hesap' } | { tur: 'etki'; e: Etki } | { tur: 'hata'; ileti: string };

export interface EtkiSecenekleri {
  c: PlanlamaCalismasi;
  taslak: TaslakYazici | null;
  // Uygula başarılıysa ('uygulandi'), değişiklik planı olmadan yazıldıysa ya da geri alındıysa ('tazele').
  sonuc: (s: 'uygulandi' | 'tazele') => void;
}

// Geri alma son değişikliği alır (LIFO); araya başka komut yazıldıysa Vazgeç onu geri almasın: taslağın son (dizme olmayan) değişikliği
// bu etkinin yazdığı komut mu? Komutlar tür ve (varsa) iş / emir kimliğiyle eşlenir.
export function sonKomutAyniMi(taslak: Pick<TaslakYazici, 'cevap'>, k: TaslakKomutu | null): boolean {
  const son = [...(taslak.cevap?.taslak?.satirlar ?? [])].reverse().find((x) => !dizmeMi(x));
  // Taslakta değişiklik görünmüyorsa karşılaştıracak bir şey yoktur (geri alma zaten bir şey almaz).
  if (son === undefined) return true;
  if (k === null) return false;
  const a = son.komut as Record<string, unknown>, b = k as Record<string, unknown>;
  return a['tur'] === b['tur'] && a['isId'] === b['isId'] && a['emirId'] === b['emirId'];
}
export const SON_KOMUT_FARKLI = 'Taslağa bu arada başka bir değişiklik yazıldı; Vazgeç onu geri almaz. Değişiklik taslakta kaldı: taslak çubuğundaki Geri al ile sırayla alın.';

export function useEtki({ c, taslak, sonuc }: EtkiSecenekleri) {
  const [durum, setDurum] = useState<EtkiDurumu>({ tur: 'duzen' });
  const yazilan = useRef<TaslakKomutu | null>(null);

  // isler: yeniden dizilecek siparişler; verilmezse bütün plan.
  const dene = async (k: TaslakKomutu, isler: readonly string[] = ['*']) => {
    if (taslak === null || taslak.mesgul) return;
    const once = c.plan === null ? null : ozetOku(c.plan);
    const oteki = bekleyenListesi(c).length;
    if (!(await taslak.yaz(k, false))) return;
    yazilan.current = k;
    if (c.plan === null) { sonuc('tazele'); setDurum({ tur: 'duzen' }); return; }
    setDurum({ tur: 'hesap' });
    try {
      const d = await taslak.degerlendir({ tur: 'plan-uygula', isler: [...isler] });
      const plan = d.cevap.sonuc.tur === 'plan-uygula' ? d.cevap.sonuc.plan : null;
      const sonra = plan === null ? null : ozetOku(plan);
      if (sonra === null) { setDurum({ tur: 'hata', ileti: 'Plan hesaplanırken veri değişti; etki gösterilemedi. Değişiklik taslakta kaldı.' }); return; }
      setDurum({ tur: 'etki', e: { is: d.is, once, sonra, oteki, ...(plan === null ? {} : { plan }) } });
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
    if (taslak !== null && !sonKomutAyniMi(taslak, yazilan.current)) { setDurum({ tur: 'hata', ileti: SON_KOMUT_FARKLI }); return; }
    if (taslak !== null && (await taslak.geriAl(false, false))) { sonuc('tazele'); setDurum({ tur: 'duzen' }); }
    else setDurum({ tur: 'hata', ileti: 'Değişiklik geri alınamadı; taslak çubuğundaki Geri al ile alın.' });
  };
  return { durum, setDurum, dene, uygula, vazgec, yazilan };
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

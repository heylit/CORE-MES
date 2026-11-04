import { useState } from 'react';
import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../../tipler.ts';
import { seritListesi, seritMetni, seritOzeti } from './kurallar.ts';

const saat = (t: number): string => (t > 0 ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// 1965 a: sayfanın en üstünde tek satır; liste düğmeyle altında açılır. Uygulama ve ret Onay ve canlı sekmesindedir (755 a), burada yalnız görünür.
export function DegisiklikSeridi({ calisma, dis }: { calisma: PlanlamaCalismasi | null; dis: BekleyenDegisiklik | null }) {
  const [acik, setAcik] = useState(false);
  if (calisma === null || calisma.plan === null) return null;
  const liste = seritListesi(calisma, dis);
  const ozet = seritOzeti(liste);
  return (
    <section className="tc-py-ds" data-durum={ozet.toplam > 0 ? 'eski' : 'guncel'} aria-label="Değişiklik akışı">
      <div className="tc-py-ds-satir" role="status">
        <Simge ad="clock" boyut="k" />
        <span className="tc-py-ds-metin">{seritMetni(ozet)}</span>
        {ozet.toplam > 0 && (
          <Dugme simge={acik ? 'up' : 'down'} aria-expanded={acik} onClick={() => { setAcik((x) => !x); }}>
            {acik ? 'Gizle' : 'Göster'}
          </Dugme>
        )}
      </div>
      {acik && ozet.toplam > 0 && (
        <ul className="tc-py-ds-liste">
          {liste.map((b) => (
            <li key={b.id}>
              <span className="tc-py-ds-ne">
                {b.dis === true ? <Rozet ton="uyari">Başka sayfa</Rozet> : <Rozet ton="bilgi">Bu sayfa</Rozet>}
                <b>{b.ne}</b>
              </span>
              <span className="tc-py-ds-kim">{[saat(b.t), b.kim === '' ? 'Kim: bilinmiyor' : b.kim].filter(Boolean).join(' · ')}</span>
              {b.ayrinti !== '' && <span className="tc-py-ds-ayrinti">{b.ayrinti}</span>}
            </li>
          ))}
          <li className="tc-py-ds-not">Değişiklikler Onay ve canlı sekmesinde plana uygulanır ya da reddedilir; başka sayfadan geleni yalnız uygulanır.</li>
        </ul>
      )}
    </section>
  );
}

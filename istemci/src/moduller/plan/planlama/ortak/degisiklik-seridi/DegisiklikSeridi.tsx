import { useState } from 'react';
import { Dugme, Rozet, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../../tipler.ts';
import './degisiklik-seridi.css';
import { canliBayatKaynagi, canliBayatMetni, canliBayatSatiri, seritListesi, seritMetni, seritOzeti, type CanliBayatlik } from './kurallar.ts';

const saat = (t: number): string => (t > 0 ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// 1965 a: sayfanın en üstünde tek satır (yalnız söyleyecek bir şey varken); liste düğmeyle altında açılır. Uygulama ve ret Onay ve canlı sekmesindedir (755 a), burada yalnız görünür.
// 2319: canli verilirse ve bayatsa canlı planın eskidiği ikinci satırda söylenir (yalnız işaret).
export function DegisiklikSeridi({ calisma, dis, canli = null, bosGizle = false }: { calisma: PlanlamaCalismasi | null; dis: BekleyenDegisiklik | null; canli?: CanliBayatlik | null; bosGizle?: boolean }) {
  const [acik, setAcik] = useState(false);
  const [canliAcik, setCanliAcik] = useState(false);
  if (calisma === null || calisma.plan === null) return null;
  const canliMetin = canli === null ? null : canliBayatMetni(canli);
  const liste = seritListesi(calisma, dis);
  const ozet = seritOzeti(liste);
  // Motor ve Stüdyo'da "güncel" plan çubuğunun rozetindedir; boş satır tahtadan yer almasın diye orada çizilmez. Öteki sayfalarda satır kalır.
  if (bosGizle && ozet.toplam === 0 && canliMetin === null) return null;
  return (
    <section className="tc-py-ds" data-durum={ozet.toplam > 0 || canliMetin !== null ? 'eski' : 'guncel'} aria-label="Değişiklik akışı">
      {/* 3258: canlı plan eskimişken "değişiklik yok" satırı çelişik okunur; yalnız bekleyen değişiklik varsa ya da canlı satır yoksa çizilir. */}
      {(ozet.toplam > 0 || canliMetin === null) && (
      <div className="tc-py-ds-satir" role="status">
        <Simge ad="clock" boyut="k" />
        <span className="tc-py-ds-metin">{seritMetni(ozet)}</span>
        {ozet.toplam > 0 && (
          <Dugme className="tc-py-ds-ac" simge={acik ? 'up' : 'down'} aria-expanded={acik} onClick={() => { setAcik((x) => !x); }}>
            {acik ? 'Gizle' : 'Göster'}
          </Dugme>
        )}
      </div>
      )}
      {canli !== null && canliMetin !== null && (
        <div className="tc-py-ds-satir" role="status" data-canli="eski">
          <Simge ad="alert" boyut="k" />
          <span className="tc-py-ds-metin">{canliMetin}</span>
          <Dugme className="tc-py-ds-ac" simge={canliAcik ? 'up' : 'down'} aria-expanded={canliAcik} onClick={() => { setCanliAcik((x) => !x); }}>
            {canliAcik ? 'Gizle' : 'Olaylar'}
          </Dugme>
        </div>
      )}
      {canli !== null && canliMetin !== null && canliAcik && (
        <ul className="tc-py-ds-liste tc-py-ds-canli" aria-label="Canlı planı eskiten olaylar">
          {canli.olaylar.map((o, i) => (
            <li key={`${o.neden}-${o.zaman}-${String(i)}`}>
              <span className="tc-py-ds-ne"><Rozet ton="uyari">{canliBayatKaynagi(o.neden)}</Rozet><b>{canliBayatSatiri(o)}</b></span>
              <span className="tc-py-ds-kim">{saat(Date.parse(o.zaman))}</span>
            </li>
          ))}
          <li className="tc-py-ds-not">Plan kendiliğinden değişmez; yeniden planlayıp canlıya alınca işaret kalkar.</li>
        </ul>
      )}
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

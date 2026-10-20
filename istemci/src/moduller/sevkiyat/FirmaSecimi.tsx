// Noktanın firması: müşteri ve tedarikçiler finanstan aranır. Başka noktası olan firma seçilemez (firmanın tek aktif noktası olur).
import { useEffect, useId, useState } from 'react';
import type { FirmaSecenegi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useFirmaArama } from './veri.ts';

const TUR_ADI: Record<FirmaSecenegi['tur'], string> = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', ikisi: 'Müşteri ve tedarikçi' };

export function FirmaSecimi({ noktaId, sec }: { noktaId: number | null; sec: (firma: FirmaSecenegi) => void }) {
  const [metin, setMetin] = useState(''), [sorgu, setSorgu] = useState('');
  const [acik, setAcik] = useState(false);
  useEffect(() => { const h = setTimeout(() => setSorgu(metin), 250); return () => clearTimeout(h); }, [metin]);
  const arama = useFirmaArama(sorgu, acik);
  const liste = useId();
  const firmalar = arama.data?.firmalar ?? [];
  const secilebilir = (f: FirmaSecenegi) => f.noktaId === null || f.noktaId === noktaId;
  const secVeKapat = (f: FirmaSecenegi) => { sec(f); setMetin(''); setAcik(false); };
  return (
    <div className="tc-sevkiyat-arama">
      <Girdi etiket="Firmadan al" type="search" value={metin} aria-controls={liste} placeholder="Müşteri ya da tedarikçi adı veya kodu"
        onFocus={() => setAcik(true)} onChange={(e) => { setMetin(e.target.value); setAcik(true); }}
        onKeyDown={(e) => { const ilk = firmalar.find(secilebilir); if (e.key === 'Enter' && ilk) { e.preventDefault(); secVeKapat(ilk); } }} />
      {arama.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(arama.error, 'Firmalar alınamadı')}</p>}
      {acik && arama.data && !firmalar.length && <p role="status" className="tc-sevkiyat-not">Firma bulunamadı. Finans &gt; Firmalar ekranından ekleyin.</p>}
      {acik && firmalar.length > 0 && (
        <ul id={liste} className="tc-sevkiyat-arama-sonuclari" aria-label="Firmalar">
          {firmalar.map((f) => (
            <li key={f.id}>
              <button type="button" disabled={!secilebilir(f)} onClick={() => secVeKapat(f)}>
                <b>{f.ad}</b>
                <em>{[f.kod, f.fason ? 'Fason' : TUR_ADI[f.tur], f.il, secilebilir(f) ? null : 'Noktası var'].filter(Boolean).join(' · ')}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

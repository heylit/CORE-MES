import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MusteriSecenekleriCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import type { AcilDeneme, AcilMusteri } from './kopru.ts';

type Firma = MusteriSecenekleriCevabi['firmalar'][number];
interface Ozellikler { denemeler: AcilDeneme[]; bitir: (secim: AcilMusteri[] | null) => void }

// Bir acil denemenin müşterisi: ad ya da kodla aranır, listeden tek müşteri seçilir. Arama değişince seçim korunur ve altta yazılır.
function DenemeMusterisi({ deneme, secili, sec }: { deneme: AcilDeneme; secili: Firma | undefined; sec: (f: Firma) => void }) {
  const [ara, setAra] = useState('');
  const q = useQuery({
    queryKey: ['plan', 'musteri-secenekleri', ara.trim()],
    queryFn: () => api.get<MusteriSecenekleriCevabi>(`/plan/musteri-secenekleri?ara=${encodeURIComponent(ara.trim())}`),
    retry: false,
  });
  const firmalar = q.data?.firmalar ?? [];
  const ipucu = q.isPending ? 'Müşteriler aranıyor…' : q.isError ? 'Müşteriler okunamadı.' : firmalar.length === 0 ? 'Eşleşen müşteri yok; adı ya da kodu kısaltın.'
    : secili ? `Seçili: ${secili.ad}` : 'Listeden müşteriyi seçin.';
  return (
    <fieldset className="tc-rr-secenekler">
      <legend>{deneme.ozet}</legend>
      <Girdi etiket="Müşteri ara" ipucu={ipucu} value={ara} placeholder="Ad ya da kod" onChange={(e) => { setAra(e.target.value); }} />
      {firmalar.map((f) => (
        <label key={f.id} className="tc-rr-secenek">
          <input type="radio" name={`acil-musteri-${String(deneme.degisiklikId)}`} checked={f.id === secili?.id} onChange={() => { sec(f); }} />
          <strong>{f.ad}</strong>
          <span>{f.kod ?? '—'}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Acil sipariş denemesi canlıya alınınca seçilen müşteriye taslak sipariş açılır; üretim emri sipariş onaylanınca açılır (286 b, 287 b).
export function AcilMusteriSecimi({ denemeler, bitir }: Ozellikler) {
  const [secim, setSecim] = useState<ReadonlyMap<number, Firma>>(new Map());
  const hazir = denemeler.every((d) => secim.has(d.degisiklikId));
  const vazgec = () => { bitir(null); };
  return (
    <Pencere
      acik
      kapat={vazgec}
      baslik="Acil sipariş için müşteri"
      alt={(
        <>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!hazir}
            onClick={() => { if (hazir) bitir(denemeler.map((d) => ({ degisiklikId: d.degisiklikId, firmaId: secim.get(d.degisiklikId)!.id }))); }}>
            Canlıya al
          </Dugme>
        </>
      )}
    >
      <div className="tc-rr-secim">
        <p>Her acil deneme seçilen müşteriye taslak sipariş olarak açılır; üretim emri sipariş onaylanınca açılır.</p>
        {denemeler.map((d) => (
          <DenemeMusterisi key={d.degisiklikId} deneme={d} secili={secim.get(d.degisiklikId)}
            sec={(f) => { setSecim((m) => new Map(m).set(d.degisiklikId, f)); }} />
        ))}
      </div>
    </Pencere>
  );
}

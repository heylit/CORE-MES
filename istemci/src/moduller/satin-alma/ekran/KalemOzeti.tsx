import { Simge } from '../../../ortak/arayuz/index.ts';
import type { RequestItem } from '../merkez/tipler.ts';
import { AlternatifOzeti } from './AlternatifOzeti.tsx';

// 3571 (Z5, Z6, Y3): ilk tablodaki malzeme hücresinin alt satırları tek bileşendedir. "Kart:" malzeme kartının bugünkü hâli,
// "Talep notu" talep edenin kaleme yazdığı, "Alternatif:" kartlı kalemde talep edenin sınırı (3572-0). "İstenen:" satırı talep edenin
// kabul sınırı satın almaya geldiğinde buraya eklenir; bugün satın almanın okumasında yok.
const KART_ALANLARI = ['kalite', 'olcu', 'durum'] as const;

export function KalemOzeti({ kalem, talepId }: { kalem: RequestItem; talepId: string }) {
  const m = kalem.malzeme;
  const kart = m ? KART_ALANLARI.flatMap((k) => (m[k] ? [m[k]] : [])).join(' · ') : '';
  const not = kalem.spec.trim();
  const satir = (ad: string, deger: string) => <small key={ad} className="sa-kalem-ozeti-satir" title={deger}><span>{ad}:</span> {deger}</small>;
  if (!kart && !not && !m?.ayrinti.length && !m?.ic?.length && !kalem.materialId && !kalem.alternatifler?.length) return null;
  return (
    <span className="sa-kalem-ozeti">
      {kart && satir('Kart', kart)}
      {kalem.materialId && <AlternatifOzeti talepId={talepId} kalemId={kalem.id} />}
      {kalem.alternatifler?.map((a) => satir(`${a.ad}${a.tur === 'sartli' ? ' (şartlı)' : ''}`, a.ozet))}
      {not && satir('Talep notu', not)}
      {m?.ayrinti.length || m?.ic?.length ? (
        // Satıra basınca talep açılır; ayrıntıyı açmak satırı seçmesin.
        <details className="sa-kalem-ozeti-ayrinti" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <summary><Simge ad="list" boyut="k" /> Kart ayrıntısı</summary>
          <dl>
            {m.ayrinti.map((x) => <div key={x.ad}><dt>{x.ad}</dt><dd>{x.deger}</dd></div>)}
            {m.ic?.length ? (
              <>
                <dt className="sa-kart-ic-baslik" data-sa-kart-ic="">Satın alma iç bilgisi (tedarikçiye gitmez)</dt>
                {m.ic.map((x) => <div key={x.ad}><dt>{x.ad}</dt><dd>{x.deger}</dd></div>)}
              </>
            ) : null}
          </dl>
        </details>
      ) : null}
    </span>
  );
}

// Talebin çizim sayısı talep numarasının yanında kenarlı küçük etiket; sayı metinle yazılır ("3 çizim"), ada karışmaz.
export function CizimSayisi({ sayi }: { sayi: number | undefined }) {
  if (!sayi) return null;
  return <span className="sa-is-cizim"><Simge ad="file" boyut="k" />{`${String(sayi)} çizim`}</span>;
}

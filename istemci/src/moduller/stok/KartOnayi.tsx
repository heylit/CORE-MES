import type { KartOnayiAyrintisi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { miktarMetni } from './gorunum.ts';

export type KartOnayi = KartOnayiAyrintisi['kartOnayi'];

// Emre giden malzeme kartla gider (632 a): sunucu kartsız gönderimi ONAY_GEREKLI ile durdurur ve ayrıntıda kartı söyler.
export function kartOnayiBilgisi(hata: unknown): KartOnayi | null {
  if (!(hata instanceof ApiHatasi) || hata.govde.kod !== 'ONAY_GEREKLI') return null;
  const k = (hata.govde as { ayrinti?: Partial<KartOnayiAyrintisi> }).ayrinti?.kartOnayi;
  return k && (k.tur === 'lot' || k.tur === 'istisna') && typeof k.emirNo === 'string' && typeof k.miktar === 'string' ? k : null;
}

export const kartOnayiDugmesi = (k: KartOnayi): string =>
  (k.kart !== null ? `${k.kart} kartına ekle ve gönder` : k.tur === 'lot' ? 'Refakat kartı aç ve gönder' : 'Lot bekleyen istisna kartı aç ve gönder');

export function KartOnayiPenceresi({ bilgi, yukleniyor, onayla, vazgec }: { bilgi: KartOnayi | null; yukleniyor: boolean; onayla: () => void; vazgec: () => void }) {
  return (
    <Pencere acik={bilgi !== null} kapat={vazgec} baslik="Refakat kartıyla gönder"
      alt={(
        <>
          <Dugme onClick={vazgec} disabled={yukleniyor} data-ilk-odak>Vazgeç</Dugme>
          {bilgi && <Dugme tur="birincil" simge="tag" onClick={onayla} yukleniyor={yukleniyor}>{kartOnayiDugmesi(bilgi)}</Dugme>}
        </>
      )}>
      {bilgi && (
        <div className="tc-stok-form">
          <p className="tc-stok-not">
            {bilgi.kart !== null
              ? 'Bu emir ve lot için açık kart var; malzeme o kartla gider.'
              : bilgi.tur === 'lot'
                ? 'Emre giden lot refakat kartıyla gider. Kart açılır, kartı Refakat kartı düğmesinden basın.'
                : 'Lotsuz malzeme lot bekleyen istisna kartıyla gider; depo kartı sonra lota bağlar.'}
          </p>
          <ul className="tc-stok-kart-onayi">
            <li><span>Emir</span><strong>{bilgi.emirNo}</strong></li>
            {bilgi.malzeme !== null && <li><span>Malzeme</span><strong>{bilgi.malzeme}</strong></li>}
            <li><span>Lot</span><strong>{bilgi.lotNo ?? 'Lotsuz'}</strong></li>
            <li><span>Miktar</span><strong>{miktarMetni(bilgi.miktar)}</strong></li>
            {bilgi.kart !== null && <li><span>Kart</span><strong>{bilgi.kart}</strong></li>}
          </ul>
        </div>
      )}
    </Pencere>
  );
}

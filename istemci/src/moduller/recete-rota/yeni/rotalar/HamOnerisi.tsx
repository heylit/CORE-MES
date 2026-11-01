import type { HamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { miktar, sayi } from '../bicim.ts';
import { useHamOnerisi } from '../veri.ts';
import { hamGirdisiVar, hamOneriMiktari, onerilebilirKartlar, turKisa, type Adim, type Malzeme } from './kurallar.ts';

const NEDEN: Partial<Record<NonNullable<HamOnerisiCevabi['neden']>, string>> = {
  'analiz-yok': '3B modelin analizi henüz yok; hammadde önerisi analizden sonra gelir.',
  'stok-listesi-yok': '3B analizi var ama ölçülü aktif hammadde kartı yok.',
  'sigan-yok': '3B analizine göre parçaya sığan hammadde kartı yok.',
};
const FORM_ADI = { cubuk: 'Çubuk', altigen: 'Altıgen', lama: 'Lama', levha: 'Levha', blok: 'Blok' } as const;
const olcuMetni = (o: Record<string, number>): string => Object.entries(o).map(([k, v]) => `${k} ${sayi(v)}`).join(' · ');

interface Ozellikler {
  urunId: string;
  adimlar: readonly Adim[];
  malzeme: ReadonlyMap<string, Malzeme>;
  ekle: (m: Malzeme, n: number) => void;
}

// 1726 a: yalnız düzenlemede ve ürünün rotasında ham madde girdisi yokken; öneri kendiliğinden eklenmez. 1727 a: miktar kartın
// biriminden hesaplanır, bilinmiyorsa boş (0) eklenir ve kullanıcı yazar. Model yoksa hiçbir şey gösterilmez.
export function HamOnerisi({ urunId, adimlar, malzeme, ekle }: Ozellikler) {
  const gerekli = !hamGirdisiVar(adimlar, malzeme);
  const { data } = useHamOnerisi(urunId, gerekli);
  if (!gerekli || data === undefined || data.model === null) return null;
  const kartlar = onerilebilirKartlar(data.oneriler, malzeme);
  if (kartlar.length === 0) {
    const neden = data.neden === null ? null : NEDEN[data.neden];
    return neden ? <p className="tc-rr1-ipucu">{neden}</p> : null;
  }
  return (
    <div className="tc-rr1-qt" role="group" aria-label="Önerilen hammadde">
      <p className="tc-rr1-ipucu">Önerilen hammadde: {data.model.belgeAdi} ({data.model.harf}) 3B analizinden, en az talaş önce.</p>
      {kartlar.map(({ oneri, kart }) => {
        const n = hamOneriMiktari(oneri, kart.unit);
        return (
          <div key={kart.id} className="tc-rr1-qtr">
            <span className="tc-rr1-qtn">
              <span className={`tc-rr1-slot tc-rr1-slot-${kart.type}`}>{turKisa(kart.type)}</span>
              <b>{kart.code}</b> <small>{FORM_ADI[oneri.form]} {olcuMetni(oneri.olcu)}</small>
            </span>
            <small>{n === null ? 'Miktar: siz yazın' : miktar(n, kart.unit)}</small>
            <Dugme simge="plus" aria-label={`${kart.code} önerisini giren olarak ekle`} onClick={() => { ekle(kart, n ?? 0); }}>Ekle</Dugme>
          </div>
        );
      })}
    </div>
  );
}

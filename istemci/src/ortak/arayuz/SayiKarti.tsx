import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import { useSifirBildir } from './pano-baglami.ts';
import './sayi-karti.css';

// Ayırma yalnız kısa birimde yapılır; "3 makine bekliyor" gibi cümle yazı olarak kalır.
const SAYI_BIRIM = /^([₺$€]?%?[-+]?\d[\d.,]*%?)\s+(\S{1,8})$/u;
const SAYI_YALIN = /^[₺$€]?%?[-+]?\d[\d.,]*%?$/u;

export type SayiTonu = 'bilgi' | 'uyari' | 'hata';

interface Ozellikler {
  baslik: string;
  simge: SimgeAdi;
  // undefined: yükleniyor; null: veri yok (sıfır uydurulmaz).
  sayi?: number | null;
  // Sayı olmayan özet (vardiya adı, kısayol) yazıyla verilir; verilince sayının yerine geçer.
  metin?: string;
  altMetin?: string;
  // Verilirse kartın tamamı o sayfaya gider.
  yol?: string;
  // Ton yalnız sayı sıfırdan büyükken görünür: "0 düşük stok" uyarı rengi taşımaz.
  ton?: SayiTonu;
  hata?: boolean;
}

// Ana sayfa panosunun sayı kartı. Veri modülündür; kart yalnız gösterir.
export function SayiKarti({ baslik, simge, sayi, metin, altMetin, yol, ton = 'bilgi', hata = false }: Ozellikler) {
  const yukleniyor = !hata && metin === undefined && sayi === undefined;
  // Yalnız gelmiş sıfır "iş yok"tur; yükleniyor, veri yok ve hata gizlenmez.
  useSifirBildir(!hata && metin === undefined && sayi === 0);
  const bos = (metin === undefined && sayi === null) || hata;
  const deger = metin ?? (sayi === undefined ? '…' : sayi === null ? '' : sayi.toLocaleString('tr-TR'));
  // Sayıyla başlayan özet ("12,5 sa", "%85") sayı ve birim olarak ayrılır: sayı büyük, birim küçük okunur.
  const bolunmus = metin === undefined ? null : SAYI_BIRIM.exec(metin);
  const sayisal = metin === undefined || bolunmus !== null || SAYI_YALIN.test(metin);
  const icerik = (
    <>
      <span className="tc-sayi-simge" aria-hidden="true"><Simge ad={simge} /></span>
      <span className="tc-sayi-govde">
        <span className="tc-sayi-baslik">{baslik}</span>
        <span className="tc-sayi-deger" data-sayisal={sayisal && !bos ? '' : undefined} data-bos={bos ? '' : undefined}>
          {bos ? (
            <>
              <span className="tc-sayi-tire" aria-hidden="true">—</span>
              <span className="tc-sayi-bos">{hata ? 'Alınamadı' : 'Veri yok'}</span>
            </>
          ) : bolunmus ? (
            // Okunan ve aranan metin tek parçadır; büyük sayı ve küçük birim yalnız görünüştür.
            <>
              <span className="tc-sayi-okunan">{metin}</span>
              <span aria-hidden="true">
                {bolunmus[1]}
                <span className="tc-sayi-birim">{` ${bolunmus[2]}`}</span>
              </span>
            </>
          ) : deger}
        </span>
        {altMetin && <span className="tc-sayi-alt">{altMetin}</span>}
      </span>
      {yol !== undefined && <span className="tc-sayi-git" aria-hidden="true"><Simge ad="chev-right" boyut="k" /></span>}
    </>
  );
  const ortak = {
    className: 'tc-sayi-karti',
    'data-ton': !hata && typeof sayi === 'number' && sayi > 0 ? ton : undefined,
    'aria-busy': yukleniyor || undefined,
  };
  return yol === undefined ? <div {...ortak}>{icerik}</div> : <Link to={yol} {...ortak}>{icerik}</Link>;
}

import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import { useSifirBildir } from './pano-baglami.ts';
import './sayi-karti.css';

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
  const deger = hata ? 'Alınamadı' : metin ?? (sayi === undefined ? '…' : sayi === null ? 'Veri yok' : sayi.toLocaleString('tr-TR'));
  const icerik = (
    <>
      <span className="tc-sayi-simge" aria-hidden="true"><Simge ad={simge} /></span>
      <span className="tc-sayi-govde">
        <span className="tc-sayi-baslik">{baslik}</span>
        <span className={metin === undefined ? 'tc-sayi-deger mono' : 'tc-sayi-deger'} data-bos={(metin === undefined && sayi === null) || hata ? '' : undefined}>
          {deger}
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

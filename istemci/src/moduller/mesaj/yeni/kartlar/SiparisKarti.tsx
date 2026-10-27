import { useMesaj } from '../durum.tsx';
import { teslimEtiketi } from '../kurallar.ts';
import { DurumRozeti } from '../ortak/index.ts';
import type { SiparisOzeti } from '../tipler.ts';
import { TeslimEtiketi } from './parcalar.tsx';
import './kartlar.css';

const sayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

// İlerleme ancak hedef ve üretilen biliniyorsa çizilir; bilinmeyen değer "–" yazılır, sıfır sayılmaz.
export function SiparisIlerlemesi({ siparis: o, buyuk }: { siparis: SiparisOzeti; buyuk?: boolean }) {
  const yuzde = o.hedef && o.uretilen !== null ? Math.max(0, Math.min(100, (o.uretilen / o.hedef) * 100)) : null;
  return (
    <>
      {yuzde !== null && (
        <progress
          className={`tc-mi-ilerleme${yuzde >= 100 ? ' tc-mi-ilerleme-tam' : ''}`} max={100} value={yuzde}
          aria-label={`#${o.no} ilerleme yüzde ${Math.round(yuzde)}`}
        />
      )}
      <span className={buyuk ? 'tc-mi-adet-buyuk' : undefined}>
        <b>{o.uretilen === null ? '–' : sayi.format(o.uretilen)}</b> / {o.hedef === null ? '–' : sayi.format(o.hedef)} {o.birim || 'adet'}
      </span>
    </>
  );
}

// Prototipin orderCard'ı; Mesaj sipariş yazmaz (212 a), "Üretim gir" yoktur (311 a).
export function SiparisKarti({ siparis: o, kisa }: { siparis: SiparisOzeti; kisa?: boolean }) {
  const { ayrintiAc } = useMesaj();
  const sevk = o.durum === 'sevk';
  return (
    <div className="tc-mi-siparis" onClick={() => ayrintiAc({ tur: 'siparis', id: o.id })}>
      <div className="tc-mi-siparis-ust">
        <button type="button" className="tc-mi-siparis-no" onClick={(e) => { e.stopPropagation(); ayrintiAc({ tur: 'siparis', id: o.id }); }}>
          #{o.no}
        </button>
        {o.durum ? <DurumRozeti tur="siparis" durum={o.durum} /> : <span>–</span>}
      </div>
      <div className="tc-mi-siparis-musteri">{o.musteri}</div>
      {!kisa && o.urun && <div className="tc-mi-siparis-urun">{o.urun}</div>}
      <div className="tc-mi-siparis-alt">
        <SiparisIlerlemesi siparis={o} />
        {sevk ? <span>Teslim edildi</span> : <TeslimEtiketi etiket={teslimEtiketi(o.teslim, Date.now())} />}
      </div>
    </div>
  );
}

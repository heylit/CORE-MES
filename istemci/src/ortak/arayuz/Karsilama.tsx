import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { SIMGELER } from '../tasarim/simgeler.ts';
import { useGosteriSuruyor } from '../veri/gorunum.ts';
import { karsilamaDonemi, karsilamaGoruldu, karsilamaGorulduMu, useKarsilama } from '../veri/karsilama.ts';
import { Dugme } from './Dugme.tsx';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './karsilama.css';

// Okumaya yetecek kadar durur; düğme, Esc ya da perdeye dokunmak daha önce kapatır.
export const KARSILAMA_SURESI_MS = 8000;

const disliler = (
  <>
    <g transform="translate(26 52) scale(2.2)">
      <g className="tc-karsilama-disli"><path d={SIMGELER.gear} /></g>
    </g>
    <g transform="translate(176 40) scale(1.6)">
      <g className="tc-karsilama-disli tc-karsilama-disli-ters"><path d={SIMGELER.gear} /></g>
    </g>
  </>
);

// Yerel çizim: dişliler arasından doğan güneş. Renkler stil dosyasındaki tasarım değişkenlerinden gelir.
function Gunes() {
  const isinlar = [-60, -30, 0, 30, 60];
  return (
    <svg className="tc-karsilama-gorsel" viewBox="0 0 240 110" aria-hidden="true" focusable="false">
      <g className="tc-karsilama-isinlar">
        {isinlar.map((aci) => (
          <line key={aci} x1="120" y1="40" x2="120" y2="18" transform={`rotate(${String(aci)} 120 92)`} />
        ))}
      </g>
      {/* Ufkun üstündeki yarım daire: güneş doğuyor; tam daire ufkun altına taşıp tarihin üstüne biniyordu. */}
      <path className="tc-karsilama-gunes" d="M86 92 A34 34 0 0 1 154 92 Z" />
      {disliler}
      <line className="tc-karsilama-ufuk" x1="8" y1="92" x2="232" y2="92" />
    </svg>
  );
}

// Gece çizimi: aynı ufukta hilal ve yanıp sönen yıldızlar; dişliler gece de döner (atölye çalışıyor).
const YILDIZLAR: readonly (readonly [number, number, number])[] = [
  [62, 18, 1], [92, 8, 0.7], [160, 14, 0.8], [196, 74, 0.6], [44, 84, 0.6], [214, 22, 0.9], [138, 4, 0.5],
];
function Gece() {
  return (
    <svg className="tc-karsilama-gorsel" viewBox="0 0 240 110" aria-hidden="true" focusable="false">
      <g className="tc-karsilama-yildizlar">
        {YILDIZLAR.map(([x, y, b]) => (
          <path
            key={`${String(x)}-${String(y)}`}
            d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4 Z"
            transform={`translate(${String(x)} ${String(y)}) scale(${String(b)})`}
          />
        ))}
      </g>
      <path className="tc-karsilama-ay" d="M128 30 A32 32 0 1 0 150 86 A26 26 0 1 1 128 30 Z" />
      {disliler}
      <line className="tc-karsilama-ufuk" x1="8" y1="92" x2="232" y2="92" />
    </svg>
  );
}

const bugun = (): string =>
  new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

// Girişten sonraki ilk açılışta bir kez çıkar; ayar kapalıyken, okunamazken ya da aynı sekmede görülmüşken hiç çıkmaz.
export function Karsilama({ kisiId, ad }: { kisiId: number; ad: string }) {
  const [bekliyor, bekliyorYaz] = useState(() => !karsilamaGorulduMu(kisiId));
  const veri = useKarsilama(bekliyor).data;
  // Açılış gösterisi oynarken karşılama bekler, ardından gelir; ikisi üst üste binmez.
  const gosteriSuruyor = useGosteriSuruyor();
  const acik = bekliyor && veri?.acik === true && !gosteriSuruyor;
  const kapat = () => { bekliyorYaz(false); };
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const baslikKimlik = useId();
  const adKimlik = useId();

  // Göründüğü an işaretlenir: kapatılmadan yenilenen sayfada da ikinci kez çıkmaz.
  useEffect(() => {
    if (!acik) return undefined;
    karsilamaGoruldu(kisiId);
    const zaman = window.setTimeout(() => { bekliyorYaz(false); }, KARSILAMA_SURESI_MS);
    return () => { window.clearTimeout(zaman); };
  }, [acik, kisiId]);

  // Açılış anının tesis saati (tarayıcının saat dilimi değil): karşılama kısa sürer, açıkken dönem değişmez.
  const [saat] = useState(() => Number(tesisSaati(Date.now()).slice(11, 13)));
  if (!acik || veri === undefined) return null;
  const gece = karsilamaDonemi(saat, veri.gunduzBaslangic, veri.geceBaslangic) === 'gece';
  const metin = gece ? veri.geceMetni : veri.metin;
  return createPortal(
    <div className="tc-karsilama-perde" onMouseDown={(o) => { if (o.target === o.currentTarget) kapat(); }}>
      <div
        ref={kutu}
        className="tc-karsilama"
        // Gece kartı kişinin temasından bağımsız koyu çizilir: tasarım değişkenleri koyu temanın değerlerini alır.
        data-theme={gece ? 'dark' : undefined}
        data-donem={gece ? 'gece' : 'gunduz'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikKimlik}
        aria-describedby={adKimlik}
        tabIndex={-1}
      >
        {gece ? <Gece /> : <Gunes />}
        <p className="tc-karsilama-tarih">{bugun()}</p>
        <h2 className="tc-karsilama-metin" id={baslikKimlik}>{metin}</h2>
        <p className="tc-karsilama-ad" id={adKimlik}><Simge ad="user" />{ad}</p>
        <Dugme tur="birincil" boyut="ana" simge="check" onClick={kapat} data-ilk-odak>Başlayalım</Dugme>
      </div>
    </div>,
    document.body,
  );
}

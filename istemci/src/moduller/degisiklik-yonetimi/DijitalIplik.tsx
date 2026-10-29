import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AileIpligi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { IPLIK_KATMAN_ADLARI, IPLIK_OLCU, ipligiYerlestir, kisalt, soyZinciri, type AileDugumu } from './analiz.ts';
import './analiz.css';

interface Ozellikler {
  iplik: AileIpligi;
  // Düğümün açılacağı adres; null ise "Kaydı aç" çizilmez.
  baglanti: (hedef: NonNullable<AileDugumu['hedef']>) => string | null;
}

const KATMAN_SIRASI = Object.keys(IPLIK_KATMAN_ADLARI) as AileDugumu['katman'][];

// As-designed, as-planned, emir ve as-built zinciri. Kutuya tıklayınca o kaydın kaynağı ve ondan doğan her şey vurgulanır.
export function AileIpligiGrafigi({ iplik, baglanti }: Ozellikler) {
  const [secili, seciliYaz] = useState<string | null>(null);
  if (iplik.dugumler.length === 0) return <p className="tc-dy-bos">Bu ürün ailesinde iplik kaydı yok.</p>;
  const y = ipligiYerlestir(iplik);
  const secim = secili !== null && y.dugumler.some((d) => d.dugum.anahtar === secili) ? secili : null;
  const zincir = secim === null ? null : soyZinciri(iplik.baglar, secim);
  const sec = (anahtar: string) => seciliYaz((s) => (s === anahtar ? null : anahtar));
  const tus = (o: KeyboardEvent, anahtar: string) => {
    if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(anahtar); }
  };
  const secilen = secim === null ? null : y.dugumler.find((d) => d.dugum.anahtar === secim)?.dugum ?? null;
  const adres = secilen?.hedef ? baglanti(secilen.hedef) : null;
  const { en, boy } = IPLIK_OLCU;
  return (
    <>
      <div className="tc-dy-aile" data-odak={secim !== null || undefined}>
        <svg viewBox={`0 0 ${y.en} ${y.boy}`} width={y.en} height={y.boy} role="group" aria-label="Dijital iplik">
          {KATMAN_SIRASI.map((k, i) => (
            <g key={k}>
              <text className="tc-dy-aile-bas" x={i * IPLIK_OLCU.sutun} y={16}>{IPLIK_KATMAN_ADLARI[k].baslik}</text>
              <text className="tc-dy-aile-alt" x={i * IPLIK_OLCU.sutun} y={32}>{IPLIK_KATMAN_ADLARI[k].alt}</text>
            </g>
          ))}
          {y.baglar.map(({ bag, yol }) => (
            <path
              key={`${bag.kaynak}>${bag.hedef}`} className="tc-dy-aile-bag" d={yol}
              data-kesikli={bag.kesikli || undefined} data-yanik={(zincir?.has(bag.kaynak) && zincir.has(bag.hedef)) || undefined}
            />
          ))}
          {y.dugumler.map(({ dugum, x, y: dy }) => (
            <g
              key={dugum.anahtar} className="tc-dy-aile-dugum" data-hal={dugum.hal} transform={`translate(${x},${dy})`}
              data-secili={secim === dugum.anahtar || undefined} data-yanik={zincir?.has(dugum.anahtar) || undefined}
              role="button" tabIndex={0} aria-pressed={secim === dugum.anahtar} aria-label={`${dugum.etiket}, ${dugum.ayrinti}`}
              onClick={() => sec(dugum.anahtar)} onKeyDown={(o) => tus(o, dugum.anahtar)}
            >
              <title>{`${dugum.etiket}\n${dugum.ayrinti}`}</title>
              <rect className="tc-dy-aile-kutu" width={en} height={boy} rx={4} />
              <rect className="tc-dy-aile-kenar" width={4} height={boy} rx={2} />
              <text className="tc-dy-aile-a" x={14} y={19}>{kisalt(dugum.etiket, 34)}</text>
              <text className="tc-dy-aile-b" x={14} y={36}>{kisalt(dugum.ayrinti, 40)}</text>
            </g>
          ))}
        </svg>
      </div>
      {secilen && zincir ? (
        <div className="tc-dy-not tc-dy-aile-ayrinti">
          <div>
            <strong>{secilen.etiket}</strong>
            <div className="tc-dy-soluk">{secilen.ayrinti}</div>
            <div className="tc-dy-soluk">Vurgulanan zincir: bu kaydın kaynağı ve ondan doğan her şey ({zincir.size - 1} bağlantılı kayıt).</div>
          </div>
          <div className="tc-dy-satir">
            {adres && <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={adres}>Kaydı aç</Link>}
            <Dugme onClick={() => seciliYaz(null)}>Vurguyu kaldır</Dugme>
          </div>
        </div>
      ) : (
        <p className="tc-dy-soluk">
          Bir kutuya tıklayın: o revizyonun hangi rota ile planlandığı, hangi emirlerde kullanıldığı ve hangi serilerin onunla üretildiği vurgulanır.
          Kesikli çizgi: karma rota veya sistem öncesi kayıt.
        </p>
      )}
    </>
  );
}

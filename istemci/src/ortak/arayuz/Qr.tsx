import { useMemo } from 'react';
import { QR_SESSIZ_PAY, qrKareleri } from './qr.ts';
import './qr.css';

// Ekranda okutulacak kod: koyu temada da açık zemin üstüne koyu basılır, ters renkli kodu okuyucuların çoğu okumaz.
export function Qr({ metin, boyut = 96 }: { metin: string; boyut?: number }) {
  const { modul, yol } = useMemo(() => qrKareleri(metin), [metin]);
  const k = modul + 2 * QR_SESSIZ_PAY;
  return (
    <svg className="tc-qr" width={boyut} height={boyut} viewBox={`0 0 ${k} ${k}`} role="img" aria-label={`QR: ${metin}`} shapeRendering="crispEdges">
      <rect width={k} height={k} className="tc-qr-zemin" />
      <path d={yol} className="tc-qr-kare" />
    </svg>
  );
}

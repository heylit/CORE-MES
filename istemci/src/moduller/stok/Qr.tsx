import qrcode from 'qrcode-generator';

// QR kodu SVG olarak çizer (fiş ve etiketler); metin ekran okuyucuya etiket olarak verilir.
export function Qr({ metin, boyut = 96 }: { metin: string; boyut?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(metin);
  qr.make();
  const n = qr.getModuleCount();
  const kareler: string[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) kareler.push(`M${x + 2} ${y + 2}h1v1h-1z`);
  return (
    <svg className="tc-stok-qr" width={boyut} height={boyut} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label={`QR: ${metin}`} shapeRendering="crispEdges">
      <rect width={n + 4} height={n + 4} className="tc-stok-qr-zemin" />
      <path d={kareler.join('')} className="tc-stok-qr-kare" />
    </svg>
  );
}

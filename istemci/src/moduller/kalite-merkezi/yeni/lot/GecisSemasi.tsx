// Muayene sıkılığı geçiş kuralları (ISO 2859-1): normal, sıkılaştırılmış, durdurma ve indirgenmiş. Dar ekranda liste gösterilir.
function Kutu({ x, y, en, boy, satirlar, tur }: { x: number; y: number; en: number; boy: number; satirlar: string[]; tur: string }) {
  const bas = y + boy / 2 - (satirlar.length - 1) * 7.5 + 4;
  return (
    <g>
      <rect x={x} y={y} width={en} height={boy} rx={4} className={`tc-km2-sema-kutu tc-km2-sema-${tur}`} />
      {satirlar.map((s, i) => <text key={s} x={x + en / 2} y={bas + i * 15} textAnchor="middle" className="tc-km2-sema-yazi tc-km2-sema-kalin">{s}</text>)}
    </g>
  );
}

function Ok({ d, kesik, kotu }: { d: string; kesik?: boolean; kotu?: boolean }) {
  return <path d={d} className={`tc-km2-sema-ok${kesik ? ' tc-km2-sema-kesik' : ''}${kotu ? ' tc-km2-sema-kotu' : ''}`} markerEnd="url(#tc-km2-ok)" />;
}

function Yazi({ x, y, children }: { x: number; y: number; children: string }) {
  return <text x={x} y={y} textAnchor="middle" className="tc-km2-sema-yazi tc-km2-sema-kucuk">{children}</text>;
}

export function GecisSemasi() {
  return (
    <>
      <div className="tc-km2-sema">
        <svg viewBox="0 0 900 200" role="img" aria-label="Muayene sıkılığı geçiş kuralları">
          <defs>
            <marker id="tc-km2-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="tc-km2-sema-uc" />
            </marker>
          </defs>
          <rect x={20} y={70} width={170} height={60} rx={4} className="tc-km2-sema-kutu tc-km2-sema-kesik" />
          <text x={105} y={96} textAnchor="middle" className="tc-km2-sema-yazi">İndirgenmiş</text>
          <Yazi x={105} y={113}>sorumlu otorite onayı</Yazi>
          <Kutu x={320} y={70} en={150} boy={60} satirlar={['Normal', '(başlangıç)']} tur="normal" />
          <Kutu x={600} y={70} en={150} boy={60} satirlar={['Sıkılaştırılmış']} tur="siki" />
          <Kutu x={790} y={70} en={100} boy={60} satirlar={['Durdurma']} tur="dur" />
          <Ok d="M470 88 L598 88" /><Yazi x={534} y={80}>5 lot içinde 2 ret</Yazi>
          <Ok d="M600 114 L472 114" /><Yazi x={534} y={132}>5 ardışık kabul</Yazi>
          <Ok d="M750 100 L788 100" kotu /><Yazi x={770} y={160}>sıkılaştırılmışta toplam 5 ret</Yazi>
          <Ok d="M320 88 L192 88" kesik /><Yazi x={256} y={58}>10 ardışık kabul + geçiş puanı</Yazi>
          <Ok d="M190 114 L318 114" kesik /><Yazi x={256} y={150}>1 ret veya düzensiz üretim</Yazi>
          <Ok d="M840 70 L840 30 L675 30 L675 68" kesik /><Yazi x={757} y={24}>tedarikçi DÖF doğrulandı → yeniden başlat</Yazi>
        </svg>
      </div>
      <ul className="tc-km2-kurallar">
        <li><b>Normal → Sıkılaştırılmış:</b> ardışık 5 lot içinde 2 ret</li>
        <li><b>Sıkılaştırılmış → Normal:</b> 5 ardışık kabul</li>
        <li><b>Durdurma:</b> sıkılaştırılmışta toplam 5 ret; tedarikçi DÖF'ü doğrulanınca yeniden başlar</li>
        <li><b>İndirgenmiş:</b> 10 ardışık kabul ve sorumlu otorite onayı (bu sistemde hesaplanmaz)</li>
      </ul>
    </>
  );
}

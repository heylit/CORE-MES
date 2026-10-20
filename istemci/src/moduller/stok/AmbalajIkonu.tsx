import type { AmbalajTuru } from '#paylasilan/sozlesme/stok.ts';

// Önizlemedeki ambalaj simgeleri (PACK_IC) birebir çizim; renkler tasarım değişkenlerinden (stok.css, .tc-pk-*).
// "yok": ambalajsız (kesik çerçeve), "oto": malzemenin kayıtlı ambalajı.
export function AmbalajIkonu({ tur }: { tur: AmbalajTuru | 'yok' | 'oto' }) {
  const ortak = { className: 'tc-pk', viewBox: '0 0 44 34', 'aria-hidden': true, strokeLinejoin: 'round' as const };
  switch (tur) {
    case 'kasa': return (
      <svg {...ortak}>
        <path d="M5 12h34l-3 18H8z" className="tc-pk-mavi tc-pk-mavi-cizgi" strokeWidth={2} />
        <path d="M8 12l3-6h22l3 6" fill="none" className="tc-pk-mavi-cizgi" strokeWidth={2} />
        <circle cx={16} cy={11} r={2.2} className="tc-pk-gri-acik" /><circle cx={22} cy={10} r={2.2} className="tc-pk-gri" /><circle cx={28} cy={11} r={2.2} className="tc-pk-gri-acik" />
        <rect x={17} y={18} width={10} height={5} rx={1} className="tc-pk-beyaz" />
      </svg>);
    case 'koli': return (
      <svg {...ortak}>
        <path d="M8 11l14-6 14 6v16l-14 6-14-6z" className="tc-pk-karton tc-pk-ahsap-cizgi" strokeWidth={1.6} />
        <path d="M8 11l14 6 14-6M22 17v16" fill="none" className="tc-pk-ahsap-cizgi" strokeWidth={1.6} />
        <path d="M15 8l14 6v5" fill="none" className="tc-pk-bant" strokeWidth={3} />
        <rect x={25} y={21} width={7} height={5} className="tc-pk-beyaz" transform="skewY(-22) translate(0 11)" />
      </svg>);
    case 'palet': return (
      <svg {...ortak}>
        {[[9, 7], [22, 7]].map(([x, y]) => <rect key={`u${x}`} x={x} y={y} width={12} height={9} className="tc-pk-karton tc-pk-ahsap-cizgi" strokeWidth={1.4} />)}
        {[[9, 16], [22, 16]].map(([x, y]) => <rect key={`a${x}`} x={x} y={y} width={12} height={9} className="tc-pk-karton-koyu tc-pk-ahsap-cizgi" strokeWidth={1.4} />)}
        <rect x={5} y={25} width={34} height={3} className="tc-pk-ahsap tc-pk-ahsap-cizgi" strokeWidth={1.2} />
        {[6, 19.5, 33].map((x) => <rect key={x} x={x} y={28} width={5} height={4} className="tc-pk-ahsap-koyu" />)}
        <rect x={5} y={31} width={34} height={2} className="tc-pk-ahsap" />
      </svg>);
    case 'bidon': return (
      <svg {...ortak}>
        <rect x={8} y={5} width={12} height={25} rx={2} className="tc-pk-mavi tc-pk-mavi-cizgi" strokeWidth={1.4} />
        <rect x={24} y={5} width={12} height={25} rx={2} className="tc-pk-mavi tc-pk-mavi-cizgi" strokeWidth={1.4} />
        <path d="M8 12h12M8 22h12M24 12h12M24 22h12" fill="none" className="tc-pk-mavi-cizgi" strokeWidth={1.4} />
        <rect x={11} y={3} width={3} height={3} className="tc-pk-mavi-koyu" /><rect x={27} y={3} width={3} height={3} className="tc-pk-mavi-koyu" />
      </svg>);
    case 'makara': return (
      <svg {...ortak}>
        <ellipse cx={22} cy={17} rx={7} ry={14} className="tc-pk-ahsap tc-pk-ahsap-cizgi" strokeWidth={1.4} />
        <rect x={15} y={8} width={16} height={18} className="tc-pk-kirmizi" />
        <path d="M15 11h16M15 14h16M15 17h16M15 20h16M15 23h16" fill="none" className="tc-pk-kirmizi-cizgi" strokeWidth={1} />
        <ellipse cx={31} cy={17} rx={7} ry={14} className="tc-pk-ahsap-acik tc-pk-ahsap-cizgi" strokeWidth={1.4} />
        <circle cx={31} cy={17} r={2.5} className="tc-pk-ahsap-koyu" />
      </svg>);
    case 'oto': return (
      <svg {...ortak}>
        <rect x={9} y={6} width={26} height={22} rx={3} fill="none" className="tc-pk-cizgi" strokeWidth={1.6} />
        <path d="M16 22l6-12 6 12M18.5 18h7" fill="none" className="tc-pk-cizgi" strokeWidth={2} strokeLinecap="round" />
      </svg>);
    default: return (
      <svg {...ortak}>
        <path d="M7 27c4-9 10-14 15-14s11 5 15 14z" className="tc-pk-gri-acik tc-pk-cizgi" strokeWidth={1.4} />
        <rect x={5} y={6} width={34} height={23} rx={2} fill="none" className="tc-pk-cizgi" strokeWidth={1.2} strokeDasharray="3 3" />
      </svg>);
  }
}

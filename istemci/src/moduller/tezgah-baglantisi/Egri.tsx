import type { TezgahAyrintisiCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { BOSLUK_NEDENI, dakikaMetni } from './gosterim.ts';

type Ayrinti = TezgahAyrintisiCevabi;

// Son saatin dakikalık değerleri; veri boşlukları kesikli çizgiyle işaretlenir.
export function Egri({ nokta, basi, sonu, bosluklar }: { nokta: Ayrinti['alanlar'][number]['egri']; basi: string; sonu: string; bosluklar: Ayrinti['bosluklar'] }) {
  const b = new Date(basi).getTime();
  const genislik = Math.max(1, new Date(sonu).getTime() - b);
  const x = (z: string): number => Math.min(100, Math.max(0, ((new Date(z).getTime() - b) / genislik) * 100));
  const degerler = nokta.map((n) => n.deger);
  const enAz = Math.min(...degerler);
  const aralik = Math.max(...degerler) - enAz || 1;
  const y = (v: number): number => 26 - ((v - enAz) / aralik) * 22;
  return (
    <svg className="tc-tzb-egri" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={`Son bir saatin eğrisi, ${nokta.length} nokta`} focusable="false">
      {bosluklar.filter((g) => new Date(g.zaman).getTime() >= b).map((g) => <line key={g.zaman} className="tc-tzb-bosluk-cizgi" x1={x(g.zaman)} x2={x(g.zaman)} y1="0" y2="28"><title>{BOSLUK_NEDENI[g.neden]}</title></line>)}
      {nokta.length === 1
        ? <circle cx={x(nokta[0]?.zaman ?? basi)} cy={y(nokta[0]?.deger ?? 0)} r="2" />
        : <polyline points={nokta.map((n) => `${x(n.zaman)},${y(n.deger)}`).join(' ')} />}
    </svg>
  );
}

// Son bir saatin zaman çizgisi: eksenin iki ucu saat olarak yazılır; servis tamponundan düşen ya da servisin yeniden başladığı anlar kesikli işaretle gösterilir.
export function ZamanCizgisi({ basi, sonu, bosluklar }: { basi: string; sonu: string; bosluklar: Ayrinti['bosluklar'] }) {
  const b = new Date(basi).getTime();
  const genislik = Math.max(1, new Date(sonu).getTime() - b);
  const icinde = bosluklar.filter((g) => new Date(g.zaman).getTime() >= b);
  return (
    <svg className="tc-tzb-cizgi" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={icinde.length === 0 ? 'Son bir saatte veri boşluğu yok' : `Son bir saatte ${icinde.length} veri boşluğu`} focusable="false">
      <line className="tc-tzb-cizgi-eksen" x1="0" x2="100" y1="4" y2="4" />
      {icinde.map((g) => {
        const x = ((new Date(g.zaman).getTime() - b) / genislik) * 100;
        return <line key={g.zaman} className="tc-tzb-bosluk-cizgi" x1={x} x2={x} y1="0" y2="8"><title>{BOSLUK_NEDENI[g.neden]}</title></line>;
      })}
    </svg>
  );
}

// Çizginin iki ucu: pencerenin başı ve şimdi.
export function ZamanEkseni({ basi, sonu }: { basi: string; sonu: string }) {
  return <span className="tc-tzb-eksen tc-tzb-alt" aria-hidden="true"><span>{dakikaMetni(basi)}</span><span>{dakikaMetni(sonu)} (şimdi)</span></span>;
}

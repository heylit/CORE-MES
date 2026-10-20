import { useMemo } from 'react';
import type { GorunumKutusu } from './PlanCizimi.tsx';
import { metreMetni, svgDonusumu, uzaklik } from './kroki.ts';
import type { Hizalama, Nokta, NoktaYapismasi } from './kroki.ts';
import type { KrokiSayfasi } from './sahne/kroki-pdf.ts';
import { useKrokiAltligi } from './KrokiPaneli.tsx';
import { useKroki } from './veri.ts';
import type { KrokiKapsami } from './veri.ts';

// Planın kroki katmanları (SVG, birim metre): altta kroki (sayfa görüntüsü ve vektör çizgileri), üstte stüdyo
// işaretleri (yapışma noktası, kılavuz, çizim önizlemesi, ölçü). Yazı ve işaret boyu ekran pikselinden metreye
// çevrilir (`pm`: bir pikselin metresi); yakınlaştırınca küçülmez.

// Çok parçalı krokide vektör çizgi çizilmez (görüntü yeter); yapışma yine çalışır.
const AZAMI_VEKTOR = 60_000;

export function KrokiAltligi({ sayfa, hizalama, saydamlik, parcalar }: {
  sayfa: KrokiSayfasi;
  hizalama: Hizalama;
  saydamlik: number;
  // Salon metresinde çizgiler (x1 z1 x2 z2 ...).
  parcalar: Float32Array | null;
}) {
  const yol = useMemo(() => {
    if (!parcalar || parcalar.length / 4 > AZAMI_VEKTOR) return null;
    const p: string[] = [];
    for (let i = 0; i + 3 < parcalar.length; i += 4) {
      p.push(`M${(parcalar[i] ?? 0).toFixed(3)} ${(parcalar[i + 1] ?? 0).toFixed(3)}L${(parcalar[i + 2] ?? 0).toFixed(3)} ${(parcalar[i + 3] ?? 0).toFixed(3)}`);
    }
    return p.join('');
  }, [parcalar]);
  return (
    <g className="tc-kroki" opacity={saydamlik} aria-hidden="true">
      <image href={sayfa.url} x={0} y={0} width={sayfa.genislik} height={sayfa.yukseklik} preserveAspectRatio="none" transform={svgDonusumu(hizalama)} />
      {yol && <path className="tc-kroki-cizgi" d={yol} />}
    </g>
  );
}

// Öbür kapsamın hizalanmış krokisi (yalnız görüntü): fabrikada bölümlerin krokileri, bölümde fabrika krokisi.
// Hizalama bu planın metresine `donustur` ile getirilir.
export function EkKroki({ kapsam, donustur, saydamlik }: { kapsam: KrokiKapsami; donustur: (h: Hizalama) => Hizalama; saydamlik: number }) {
  const k = useKroki(kapsam).data?.kroki;
  const kh = k?.tamam ? k.hizalama : null;
  const { sayfa } = useKrokiAltligi(kh ? k : null);
  if (!sayfa || !kh) return null;
  const h = { olcek: Number(kh.olcek), donus: Number(kh.donus), x: Number(kh.x), z: Number(kh.z) };
  return <KrokiAltligi sayfa={sayfa} hizalama={donustur(h)} saydamlik={saydamlik} parcalar={null} />;
}

export interface StudyoIsaretleri {
  imlec: NoktaYapismasi | null;
  kilavuz: { x: number | null; z: number | null } | null;
  // Çizilen dikdörtgen (ya da duvarda çizgi).
  cizim: { a: Nokta; b: Nokta; cizgi: boolean } | null;
  // Ölçü ve hizalama noktaları: ikinci nokta yoksa imleçle birlikte çizilir.
  noktalar: Nokta[];
  noktaRengi: 'olc' | 'hiza';
}

const yazi = (n: number): string => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function StudyoUstu({ isaret, kutu, pm }: { isaret: StudyoIsaretleri; kutu: GorunumKutusu; pm: number }) {
  const { imlec, kilavuz, cizim, noktalar } = isaret;
  const boy = 12 * pm;
  const etiket = (x: number, z: number, metin: string, anahtar: string) => (
    <g key={anahtar} className="tc-studyo-etiket">
      <rect x={x - (metin.length * boy * 0.3)} y={z - boy * 1.25} width={metin.length * boy * 0.6} height={boy * 1.5} rx={boy * 0.3} />
      <text x={x} y={z - boy * 0.15} fontSize={boy} textAnchor="middle">{metin}</text>
    </g>
  );
  const son = noktalar.length === 1 && imlec ? [...noktalar, imlec.nokta] : noktalar;
  return (
    <g className="tc-studyo" pointerEvents="none">
      {kilavuz?.x != null && <line className="tc-studyo-kilavuz" x1={kilavuz.x} y1={kutu.y} x2={kilavuz.x} y2={kutu.y + kutu.d} />}
      {kilavuz?.z != null && <line className="tc-studyo-kilavuz" x1={kutu.x} y1={kilavuz.z} x2={kutu.x + kutu.g} y2={kilavuz.z} />}
      {cizim && (cizim.cizgi ? (
        <>
          <line className="tc-studyo-cizim" x1={cizim.a.x} y1={cizim.a.z} x2={cizim.b.x} y2={cizim.b.z} />
          {etiket((cizim.a.x + cizim.b.x) / 2, (cizim.a.z + cizim.b.z) / 2, metreMetni(uzaklik(cizim.a, cizim.b)), 'c')}
        </>
      ) : (
        <>
          <rect
            className="tc-studyo-cizim"
            x={Math.min(cizim.a.x, cizim.b.x)}
            y={Math.min(cizim.a.z, cizim.b.z)}
            width={Math.abs(cizim.b.x - cizim.a.x)}
            height={Math.abs(cizim.b.z - cizim.a.z)}
          />
          {etiket((cizim.a.x + cizim.b.x) / 2, Math.min(cizim.a.z, cizim.b.z), `${yazi(Math.abs(cizim.b.x - cizim.a.x))} × ${yazi(Math.abs(cizim.b.z - cizim.a.z))} m`, 'c')}
        </>
      ))}
      {son.length === 2 && son[0] && son[1] && (
        <g className={`tc-studyo-olcu tc-studyo-${isaret.noktaRengi}`}>
          <line x1={son[0].x} y1={son[0].z} x2={son[1].x} y2={son[1].z} />
          {etiket(
            (son[0].x + son[1].x) / 2, (son[0].z + son[1].z) / 2,
            `${metreMetni(uzaklik(son[0], son[1]))}  (Δx ${yazi(Math.abs(son[1].x - son[0].x))} · Δz ${yazi(Math.abs(son[1].z - son[0].z))})`, 'o',
          )}
        </g>
      )}
      {noktalar.map((n, i) => <circle key={i} className={`tc-studyo-nokta tc-studyo-${isaret.noktaRengi}`} cx={n.x} cy={n.z} r={4 * pm} />)}
      {imlec && (
        <g className="tc-studyo-imlec" data-tur={imlec.tur ?? 'serbest'}>
          <circle cx={imlec.nokta.x} cy={imlec.nokta.z} r={6 * pm} />
          <line x1={imlec.nokta.x - 10 * pm} y1={imlec.nokta.z} x2={imlec.nokta.x + 10 * pm} y2={imlec.nokta.z} />
          <line x1={imlec.nokta.x} y1={imlec.nokta.z - 10 * pm} x2={imlec.nokta.x} y2={imlec.nokta.z + 10 * pm} />
        </g>
      )}
    </g>
  );
}

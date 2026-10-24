import { thumb } from '../sahne/gl.ts';
import { toolById } from '../secici.ts';
import type { Kalem } from '../veri/tipler.ts';
import type { Secenek } from './hazirlik-eylem.ts';

// Hazırlık adımının küçük resmi (prototipin prIcon / prImg'i 21211-21232). Kalem resmi çekirdeğin küçük resminden gelir ve
// prototipteki gibi kimliğe göre saklanır; malzeme ve program simgeleri renkleri tasarım değişkeninden alan SVG'dir.
const ONBELLEK = new Map<string, string>();
const kalemMi = (v: unknown): v is Kalem => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';
const metin = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

// Simgesi olmayan seçenek bir kalemdir (program ve malzeme öğeleri hep simge taşır).
export function kalemResmi(o: Secenek): string {
  const tid = metin(o['tid']), k = `t:${tid ?? o.id}`, var0 = ONBELLEK.get(k);
  if (var0 !== undefined) return var0;
  let c: HTMLCanvasElement | null = null;
  try { c = thumb(tid ? toolById(tid) : o as Kalem); } catch { /* resim çizilemezse boş kalır (prototipte de) */ }
  const adres = c ? c.toDataURL() : '';
  ONBELLEK.set(k, adres);
  return adres;
}

const ISO = new Set(['P', 'M', 'K', 'N', 'S', 'H']);
function MalzemeSimgesi({ iso }: { iso: string }) {
  const g = ISO.has(iso) ? iso : 'H';
  return (
    <svg viewBox="0 0 240 240" className={`tc-ck-hs tc-ck-hs-mat tc-ck-hs-${g}`} aria-hidden="true">
      <polygon className="tc-ck-hs-ust" points="40,90 130,50 205,85 115,128" />
      <polygon className="tc-ck-hs-sol" points="40,90 115,128 115,200 40,160" />
      <polygon className="tc-ck-hs-sag" points="115,128 205,85 205,155 115,200" />
      <circle className="tc-ck-hs-iso" cx="196" cy="44" r="30" />
      <text className="tc-ck-hs-isoyazi" x="196" y="56" fontSize="34" textAnchor="middle">{iso || '?'}</text>
    </svg>
  );
}

function BelgeSimgesi({ tur }: { tur: 'prog' | 'up' | 'none' }) {
  return (
    <svg viewBox="0 0 240 240" className={`tc-ck-hs tc-ck-hs-belge tc-ck-hs-${tur}`} aria-hidden="true">
      <path className="tc-ck-hs-kagit" d="M60 30 L150 30 L185 65 L185 210 L60 210 Z" />
      {tur === 'up' && <text className="tc-ck-hs-isaret" x="122" y="140" fontSize="44" textAnchor="middle">↑</text>}
      {tur === 'none' && <text className="tc-ck-hs-isaret" x="122" y="140" fontSize="44" textAnchor="middle">∅</text>}
      {tur === 'prog' && (
        <>
          <text className="tc-ck-hs-nc" x="122" y="110" fontSize="40" textAnchor="middle">NC</text>
          {[0, 1, 2, 3].map((i) => <rect key={i} className="tc-ck-hs-satir" x="80" y={130 + i * 18} width={60 + (i * 23) % 40} height="7" />)}
        </>
      )}
    </svg>
  );
}

export function HazirlikSimgesi({ tur, nesne }: { tur: string; nesne?: unknown }) {
  if (tur === 'mat') return <MalzemeSimgesi iso={typeof (nesne as { iso?: unknown } | undefined)?.iso === 'string' ? (nesne as { iso: string }).iso : ''} />;
  if (tur === 'prog' || tur === 'up' || tur === 'none') return <BelgeSimgesi tur={tur} />;
  if (!kalemMi(nesne)) return null;
  const adres = kalemResmi(nesne);
  return adres ? <img src={adres} alt="" /> : null;
}

// Kalemin kendi simge türü varsa onunla, yoksa kalem resmiyle çizilir (prototipin prImg'i).
export function KalemSimgesi({ o }: { o: Secenek }) { return <HazirlikSimgesi tur={metin(o['icon']) ?? 't'} nesne={o} />; }

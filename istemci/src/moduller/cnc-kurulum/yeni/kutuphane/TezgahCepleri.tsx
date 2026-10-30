import { state } from '../depo.ts';
import { fmtN } from '../bicim.ts';
import { allMachines, byId, invKey, stockOf, toolLib } from '../secici.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import { KucukResim } from './Liste.tsx';

// Kütüphanenin "Tezgâhlara göre" bölümü (karar kartı 1276 a): her tezgâhın magazin ya da taret cepleri sırayla, cepteki takımın resmi,
// çapı ve stok durumu. 3D modda resim tek çizicinin küçük resmidir; 2B modda takım türünün çizgi çizimi (grafik birimi gerekmez).

// 24x48 kutuda takım türünün yan görünüşü.
const CIZIM: Record<string, string> = {
  parmak: 'M8 2h8v22H8z M7 24h10v20l-2 2H9l-2-2z M7 29l10 4 M7 35l10 4 M7 41l10 3',
  kuresel: 'M8 2h8v22H8z M7 24h10v16a5 5 0 0 1-10 0z M7 29l10 4 M7 35l10 4',
  tarama: 'M9 2h6v18H9z M3 20h18v10H3z M4 30l2 3 2-3 M10 30l2 3 2-3 M16 30l2 3 2-3',
  matkap: 'M9 2h6v22H9z M8 24h8v16l-4 6-4-6z M8 29l8 4 M8 35l8 4',
  kilavuz: 'M9 2h6v20H9z M8 22h8v20l-2 3h-4l-2-3z M8 27h8 M8 30h8 M8 33h8 M8 36h8 M8 39h8',
  prob: 'M9 2h6v12H9z M11 14h2v24h-2z M12 44a3 3 0 1 0 0.01 0',
  kater: 'M6 2h10v30H6z M6 32h10l-4 8H6z M8 40l-2 4',
  delik: 'M9 2h6v20H9z M10 22h4v18h-4z M14 38h4v3h-4z',
  kanal: 'M6 2h10v30H6z M8 32h4v12H8z',
};
const TUR: Record<string, string> = {
  ball: 'kuresel', taperball: 'kuresel', lollipop: 'kuresel', bullnose: 'kuresel', barrel: 'kuresel',
  drill: 'matkap', spot: 'matkap', reamer: 'matkap', center: 'matkap', csink: 'matkap', stepdrill: 'matkap', idrill: 'matkap',
  tap: 'kilavuz', threadmill: 'kilavuz',
  facemill: 'tarama', facemill45: 'tarama', shoulder: 'tarama', hfmi: 'tarama', roundins: 'tarama', disc: 'tarama',
  probe: 'prob', boring: 'delik', boring2: 'delik',
  lt_ext: 'kater', lt_thread: 'kater', lt_knurl: 'kater', lt_bore: 'delik', lt_ithread: 'delik', lt_udrill: 'matkap',
  lt_groove: 'kanal', lt_part: 'kanal', lt_igroove: 'kanal', lt_facegroove: 'kanal',
};
export const takimCizimi = (t: Pick<Kalem, 'kind'>): string => CIZIM[TUR[t.kind] ?? 'parmak']!;

export function TakimCizimi({ it, sinif }: { it: Pick<Kalem, 'kind'>; sinif?: string }) {
  return (
    <svg className={sinif ?? 'tc-cl-cizim'} viewBox="0 0 24 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d={takimCizimi(it)} />
    </svg>
  );
}

const DURUM_ADI = { none: 'stok girilmedi', ok: 'stok yeterli', low: 'stok kritik', short: 'stok eksik' } as const;
const kisaAd = (t: Kalem): string => (t.d == null ? '' : (t.kind === 'tap' ? 'M' : 'Ø') + fmtN(t.d, t.d % 1 ? 1 : 0));

interface Cep { no: number; kalem: Kalem | null }
interface TezgahSatiri { m: Tezgah; cepler: Cep[] | null; dolu: number; sorun: number }

function satirlar(): TezgahSatiri[] {
  return allMachines().map((m) => {
    const arr = state.tools[m.id] as string[] | undefined;
    if (!arr) return { m, cepler: null, dolu: 0, sorun: 0 };
    const lib = toolLib(m);
    let dolu = 0, sorun = 0;
    const cepler: Cep[] = [];
    for (let i = 0; i < m.pockets; i++) {
      const id = arr[i];
      const t = id && id !== 'empty' ? byId(lib, id) : null;
      if (t) { dolu++; const st = stockOf(invKey(t)).st; if (st === 'low' || st === 'short') sorun++; }
      cepler.push({ no: i + 1, kalem: t });
    }
    return { m, cepler, dolu, sorun };
  });
}

interface Ozellikler {
  // 3D modda küçük resim, 2B modda çizgi çizimi.
  resimli: boolean;
  yalnizSorunlu: boolean;
  seciliId: string | null;
  sec: (it: Kalem) => void;
}

export function TezgahCepleri({ resimli, yalnizSorunlu, seciliId, sec }: Ozellikler) {
  const liste = satirlar();
  return (
    <div className="tc-cl-tezgahlar-cep">
      {liste.map(({ m, cepler, dolu, sorun }) => (
        <section key={m.id} className="tc-cl-tz" aria-label={m.name}>
          <header className="tc-cl-tz-ust">
            <div className="tc-cl-tz-ad">
              <b>{m.name}</b>
              <small>{`${m.type === 'lathe' ? 'Taret' : 'Magazin'} ${String(m.pockets)} cep · ${m.taper}`}</small>
            </div>
            {cepler && (
              <div className="tc-cl-tz-doluluk">
                {sorun > 0 && <span className="tc-cl-tz-sorun">{`${String(sorun)} stok uyarısı`}</span>}
                <span><b>{dolu}</b>{` / ${String(m.pockets)} cep dolu`}</span>
              </div>
            )}
          </header>
          {cepler
            ? (
              <div className="tc-cl-cepler">
                {cepler.map(({ no, kalem }) => {
                  if (!kalem) return <div key={no} className="tc-cl-cep" data-bos=""><span className="tc-cl-cep-no">T{no}</span><span>boş</span></div>;
                  const st = stockOf(invKey(kalem)).st, soluk = yalnizSorunlu && st !== 'low' && st !== 'short';
                  return (
                    <button
                      key={no} type="button" className="tc-cl-cep" data-soluk={soluk ? '' : undefined} aria-pressed={kalem.id === seciliId}
                      aria-label={`T${String(no)} ${kalem.name}, ${DURUM_ADI[st]}`} title={kalem.name} onClick={() => { sec(kalem); }}
                    >
                      <span className="tc-cl-cep-no">T{no}</span>
                      <i className={`tc-cl-cep-durum tc-cl-cep-${st}`} aria-hidden="true" />
                      {resimli ? <KucukResim it={kalem} /> : <TakimCizimi it={kalem} />}
                      <span className="tc-cl-cep-ad">{kisaAd(kalem)}</span>
                    </button>
                  );
                })}
              </div>
            )
            : <p className="tc-cl-not">Bu tezgâhın magazini henüz girilmedi; Kurulum görünümünde tezgâh seçilince dolar.</p>}
        </section>
      ))}
    </div>
  );
}

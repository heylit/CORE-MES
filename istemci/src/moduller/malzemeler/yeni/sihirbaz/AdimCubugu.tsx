import { Simge } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { Taslak } from './durum.ts';
import type { TurAdimi, UyumSorunu } from '../kurallar/index.ts';

export interface SihirbazAdimi {
  ad: string;
  help?: string;
  ozel?: string;
  // Adımın yerinde iş: adım numarası (hammaddede 0-6), genel türlerde turAdimlari sırası (0 tür seçimi).
  no: number;
  tamam: boolean;
  sorunlu: boolean;
  gidilir: boolean;
}

// Prototipte `curSteps` + `renderSteps`: hammadde STEPS (7 adım), öteki türler "Malzeme türü" + turAdimlari.
export function adimlariKur(d: Taslak, b: KuralBaglami, etkin?: number): SihirbazAdimi[] {
  const genel = K.isGen(d, b);
  const ham: TurAdimi[] = genel ? [{ ad: 'Malzeme türü', help: 'Ne oluşturacağını seç.' }, ...(K.turAdimlari(d, b))] : S.STEPS;
  const son = ham.length - 1;
  const sorunlu = new Set(K.compatIssues(d, b).filter((i) => i.s === 'no').map((i) => i.step));
  const adim = etkin ?? -1;
  const gezildi = (i: number) => (genel
    ? i < adim || K.stepOk(i, d, b)
    : i < adim || (i === 2 && !!d.form) || (i === 1 && !!d.grade) || (i === 0 && !!d.fam));
  return ham.map((s, i) => ({
    ad: s.ad,
    help: s.help,
    ozel: typeof s.ozel === 'string' ? s.ozel : undefined,
    no: i,
    tamam: i !== adim && K.stepOk(i, d, b) && K.canGo(d, i, b) && i < son && gezildi(i),
    sorunlu: genel ? sorunlu.has(i) : (i === 2 || i === 3) && sorunlu.has(i),
    gidilir: K.canGo(d, i, b),
  }));
}

export function AdimCubugu({ adimlar, etkin, git }: { adimlar: readonly SihirbazAdimi[]; etkin: number; git: (i: number) => void }) {
  return (
    <nav className="tc-my-adimlar" aria-label="Adımlar">
      <ol>
        {adimlar.map((s, i) => {
          const tamam = i !== etkin && s.tamam;
          const sinif = ['tc-my-adim', tamam && 'tc-my-adim-tamam', s.sorunlu && 'tc-my-adim-sorun'].filter(Boolean).join(' ');
          return (
            <li key={`${String(i)}-${s.ad}`}>
              <button
                type="button" className={sinif} aria-current={i === etkin ? 'step' : undefined} disabled={!s.gidilir}
                onClick={() => { git(i); }}
              >
                <span className="tc-my-adim-no" aria-hidden="true">{tamam ? <Simge ad="check" /> : i + 1}</span>
                <span className="tc-my-adim-ad">{s.ad}</span>
                {s.sorunlu && <span className="tc-my-gizli">(uyumsuz seçim var)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

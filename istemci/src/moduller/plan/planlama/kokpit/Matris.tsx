import type { Derleme } from '../motor/kurallar.ts';
import { aralikYuku, durumYazisi, matrisSirasi, satirKimligi, yukSinifi, yukYuzdesi, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Matris: plana iki tablodan bakış. Emir × adım: her adım hangi tezgâhta, ne zaman (sorunlular üstte). Tezgâh × gün: 14 günün doluluğu.
// Matris bakış ve geçittir; hücre tahtaya götürür, taşıma tahtada yapılır.
export type MatrisTuru = 'E' | 'T';
export const MATRIS_GUNU = 14;
export interface MatrisOzellikleri {
  m: KokpitModeli; cx: Derleme; tur: MatrisTuru; turSec: (t: MatrisTuru) => void;
  emirler: readonly KokpitEmri[];
  secEmir: string | null;
  zaman: (t: number) => string;
  emirAc: (job: string, isId: string | null) => void;
  gunAc: (gun: number) => void;
}

export function Matris({ m, cx, tur, turSec, emirler, secEmir, zaman, emirAc, gunAc }: MatrisOzellikleri) {
  const em = tur === 'E';
  return (
    <div className="tc-pyq-mat-kap">
      <div className="tc-pyq-mat-ust">
        <span className="tc-pyq-seg" role="group" aria-label="Matris">
          <button type="button" aria-pressed={em} onClick={() => { turSec('E'); }}>Emir × adım</button>
          <button type="button" aria-pressed={!em} onClick={() => { turSec('T'); }}>Tezgâh × gün</button>
        </span>
        <span className="tc-pyq-lej">
          {em ? <><span data-d="sur">Sürüyor</span><span data-d="gec">Terminden sonra biter</span><span data-d="plansiz">Plansız</span></>
            : <><span data-yuk="orta">%50 üstü</span><span data-yuk="dolu">%85 üstü</span><span data-yuk="asim">Aşım</span><span data-yuk="kapali">Kapalı</span></>}
        </span>
        <span className="tc-pyq-not">{em ? 'Hücre işi tahtada açar' : 'Hücre o günü tahtada açar'}</span>
      </div>
      <div className="tc-pyq-mat-govde" tabIndex={0} role="region" aria-label={em ? 'Emir × adım matrisi' : 'Tezgâh × gün matrisi'}>
        {em ? <EmirAdim m={m} emirler={emirler} secEmir={secEmir} zaman={zaman} emirAc={emirAc} /> : <TezgahGun m={m} cx={cx} zaman={zaman} gunAc={gunAc} />}
      </div>
    </div>
  );
}

function EmirAdim({ m, emirler, secEmir, zaman, emirAc }: Pick<MatrisOzellikleri, 'm' | 'emirler' | 'secEmir' | 'zaman' | 'emirAc'>) {
  const l = matrisSirasi(emirler);
  if (!l.length) return <p className="tc-pyq-not">Süzgece uyan emir yok.</p>;
  const n = l.reduce((x, e) => Math.max(x, e.adimlar.length), 0);
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  return (
    <table className="tc-pyq-mat" data-tur="E">
      <thead><tr><th scope="col">Emir</th>{Array.from({ length: n }, (_, j) => <th scope="col" key={j}>{j + 1}. adım</th>)}<th scope="col">Bitiş</th></tr></thead>
      <tbody>
        {l.map((e) => (
          <tr key={e.id} data-emir={e.id}>
            <th scope="row">
              <button type="button" aria-current={secEmir === e.id} onClick={() => { emirAc(e.id, null); }}>
                <b>{e.no}</b><small>{e.urun}{e.termin === null ? '' : ` · termin ${zaman(e.termin).slice(0, 9)}`}</small>
              </button>
            </th>
            {Array.from({ length: n }, (_, j) => {
              const a = e.adimlar[j];
              if (!a) return <td key={j} />;
              const x = m.isler[a.id];
              if (!x) return <td key={j} data-d="plansiz"><button type="button" onClick={() => { emirAc(e.id, null); }}><b>{a.ad}</b><small>plansız</small></button></td>;
              const yer = `${kod.get(satirKimligi(x)) ?? x.m} · ${zaman(x.S).slice(6)}`;
              return (
                <td key={j} data-d={x.basladi ? 'sur' : e.termin !== null && x.C > e.termin + 0.01 ? 'gec' : undefined}>
                  <button type="button" data-hucre={a.id} title={`${a.ad} · ${kod.get(satirKimligi(x)) ?? x.m} · ${zaman(x.S)} – ${zaman(x.C).slice(6)}`} onClick={() => { emirAc(e.id, a.id); }}>
                    <b>{a.ad}</b><small>{yer}</small>
                  </button>
                </td>
              );
            })}
            <td data-son="" data-d={e.durum}><b>{durumYazisi(e)}</b><small>{e.bitis === null ? '–' : `biter ${zaman(e.bitis).slice(0, 9)}`}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TezgahGun({ m, cx, zaman, gunAc }: Pick<MatrisOzellikleri, 'm' | 'cx' | 'zaman' | 'gunAc'>) {
  const gunler = Array.from({ length: MATRIS_GUNU }, (_, g) => g), isler = Object.values(m.isler);
  return (
    <table className="tc-pyq-mat" data-tur="T">
      <thead><tr><th scope="col">Tezgâh</th>{gunler.map((g) => <th scope="col" key={g}>{zaman(m.bas + g * 24).slice(6, 9)} {zaman(m.bas + g * 24).slice(0, 2)}</th>)}<th scope="col">Ort.</th></tr></thead>
      <tbody>
        {m.tezgahlar.filter((t) => !t.fason).map((t) => {
          let acik = 0, plan = 0;
          return (
            <tr key={t.id} data-tezgah={t.id}>
              <th scope="row"><span><b>{t.kod}</b><small>{t.ad}</small></span></th>
              {gunler.map((g) => {
                const y = aralikYuku(cx, isler, t.id, m.bas + g * 24, m.bas + (g + 1) * 24), yuzde = yukYuzdesi(y);
                acik += y.acik; plan += y.plan;
                if (yuzde === null) return <td key={g} data-yuk="kapali"><span>kapalı</span></td>;
                const bilgi = `${t.kod} · ${zaman(m.bas + g * 24).slice(0, 9)} · %${String(yuzde)} dolu (${String(Math.round(y.plan))} / ${String(Math.round(y.acik))} sa)`;
                return (
                  <td key={g} data-yuk={yukSinifi(y)}>
                    <button type="button" data-gun={g} title={bilgi} aria-label={bilgi} onClick={() => { gunAc(g); }}><b>%{yuzde}</b><small>{Math.round(y.plan)}/{Math.round(y.acik)} sa</small></button>
                  </td>
                );
              })}
              <td data-son=""><b>{acik > 0 ? `%${String(Math.round((plan / acik) * 100))}` : '–'}</b></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

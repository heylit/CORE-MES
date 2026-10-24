import { IsaretKutusu } from '../../../../ortak/arayuz/index.ts';
import { FAI_CHK, GIRIS_CHK } from '../sabitler.ts';
import type { MuayeneDegeri } from './hesap.ts';

function Isaretler({ ad, liste, secili, degistir }: { ad: string; liste: readonly string[]; secili: readonly string[]; degistir: (v: string[]) => void }) {
  return (
    <fieldset className="tc-km2-isaretler">
      <legend>{ad}</legend>
      {liste.map((c) => (
        <IsaretKutusu
          key={c} etiket={c} checked={secili.includes(c)}
          onChange={(e) => { degistir(e.target.checked ? [...secili, c] : secili.filter((x) => x !== c)); }}
        />
      ))}
    </fieldset>
  );
}

// Giriş muayenesinde belge ve kaynak kontrolleri, FAI'de AS9102 Form 1-2-3 (FAI nedeni ve kapsamı adımın alanlarında); diğer türlerde belge kontrolü yok.
export function BelgeKontrolu({ d, degistir }: { d: MuayeneDegeri; degistir: (alan: string, deger: unknown) => void }) {
  if (d.tur === 'Giriş') {
    return <Isaretler ad="Belge ve kaynak kontrolü (giriş)" liste={GIRIS_CHK} secili={d.gchk ?? []} degistir={(v) => { degistir('gchk', v); }} />;
  }
  if (d.tur === 'FAI') {
    return (
      <div className="tc-km2-fai">
        <h4>AS9102 ilk parça muayenesi</h4>
        <Isaretler ad="AS9102 formları" liste={FAI_CHK} secili={d.fchk ?? []} degistir={(v) => { degistir('fchk', v); }} />
      </div>
    );
  }
  return <p className="tc-km2-not tc-km2-not-tamam">Bu muayene türünde belge kontrolü yok; ileri geçebilirsiniz.</p>;
}

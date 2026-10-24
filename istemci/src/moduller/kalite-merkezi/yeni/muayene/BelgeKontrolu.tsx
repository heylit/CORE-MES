import { IsaretKutusu, Secim } from '../../../../ortak/arayuz/index.ts';
import { FAI_CHK, FAI_NEDEN, GIRIS_CHK } from '../sabitler.ts';
import type { MuayeneDegeri } from './hesap.ts';

const FAI_KAPSAM = ['Tam FAI', 'Kısmi FAI (yalnız değişen karakteristikler)'] as const;

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

// Giriş muayenesinde belge ve kaynak kontrolleri, FAI'de AS9102 Form 1-2-3; diğer türlerde belge kontrolü yok.
export function BelgeKontrolu({ d, degistir }: { d: MuayeneDegeri; degistir: (alan: string, deger: unknown) => void }) {
  if (d.tur === 'Giriş') {
    return <Isaretler ad="Belge ve kaynak kontrolü (giriş)" liste={GIRIS_CHK} secili={d.gchk ?? []} degistir={(v) => { degistir('gchk', v); }} />;
  }
  if (d.tur === 'FAI') {
    return (
      <div className="tc-km2-fai">
        <h4>AS9102 ilk parça muayenesi</h4>
        <div className="tc-km2-izgara">
          <Secim
            etiket="FAI nedeni" required value={d.faiNeden ?? ''} bosSecenek="Seçin"
            secenekler={FAI_NEDEN.map((o) => ({ deger: o, baslik: o }))} onChange={(e) => { degistir('faiNeden', e.target.value); }}
          />
          <Secim
            etiket="Kapsam" value={d.faiKapsam || FAI_KAPSAM[0]}
            secenekler={FAI_KAPSAM.map((o) => ({ deger: o, baslik: o }))} onChange={(e) => { degistir('faiKapsam', e.target.value); }}
          />
        </div>
        <Isaretler ad="AS9102 formları" liste={FAI_CHK} secili={d.fchk ?? []} degistir={(v) => { degistir('fchk', v); }} />
      </div>
    );
  }
  return <p className="tc-km2-not tc-km2-not-tamam">Bu muayene türünde belge kontrolü yok; ileri geçebilirsiniz.</p>;
}

import type { ReactNode } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { fmtN } from '../bicim.ts';
import { hamTipiAdi, type Geometri, type HamSonuc } from '../hesap/ham.ts';

// Ham Malzeme sonuc bolumu: prototipin sRenderResults'u (metinler aynen).
export type SonucEylemi = 'toSim' | 'toSetup' | 'csv';

export interface ModelOzeti { area: number; tris: number; solids: number }
export interface GovdeSatiri { name: string; vol: number }

interface Ozellikler {
  r: HamSonuc | null;
  geo: Geometri | null;
  otomatikEksen: boolean;
  malzeme: string;
  model: ModelOzeti | null;
  govdeler: readonly GovdeSatiri[] | null;
  govdeSecili: number;
  govdeSec: (i: number) => void;
  eylem: (a: SonucEylemi) => void;
  yazabilir: boolean;
}

const kg = (v: number) => fmtN(v, v < 10 ? 3 : 2);
const olcu = (v: number) => fmtN(v, v % 1 ? 1 : 0);

function Satir({ k, children }: { k: string; children: ReactNode }) {
  return <div className="tc-ch-kv"><span>{k}</span><b>{children}</b></div>;
}

function Not({ children, uyari = false }: { children: ReactNode; uyari?: boolean }) {
  return <p className={uyari ? 'tc-ch-not tc-ch-not-uyari' : 'tc-ch-not'}>{uyari && <Simge ad="alert" boyut="k" />}{children}</p>;
}

export function HamSonucu({ r, geo, otomatikEksen, malzeme, model, govdeler, govdeSecili, govdeSec, eylem, yazabilir }: Ozellikler) {
  if (!r) return <Not>STEP / STL yükleyin, örnek parçayı açın ya da aşağıdan parça ölçülerini elle girin.</Not>;
  const yuzde = r.ratio * 100;
  return (
    <div className="tc-ch-sonuc">
      <div className="tc-ch-buyuk">
        <small>Hammadde ölçüsü · {hamTipiAdi(r)}</small>
        <b>{r.label}</b>
        <span>{malzeme} · ρ {fmtN(r.rho, 2)} g/cm³</span>
      </div>
      <div className="tc-ch-kutular">
        <div><small>Hammadde</small><b>{kg(r.ms)}</b><i>kg</i></div>
        <div><small>Parça</small><b>{r.Vp ? kg(r.mp) : '—'}</b><i>kg</i></div>
        <div><small>Talaş</small><b className="tc-ch-talas">{r.Vp ? kg(r.mc) : '—'}</b><i>kg</i></div>
      </div>
      {r.Vp > 0 && (
        <>
          <progress className="tc-ch-oran" max={100} value={100 - yuzde} aria-label="Parça oranı" />
          <Satir k="Talaş oranı">%{fmtN(yuzde, 1)} talaş · %{fmtN(100 - yuzde, 1)} parça</Satir>
        </>
      )}
      <Satir k="Parça zarf ölçüsü">{r.dim.map((v) => fmtN(v, 1)).join(' × ')} mm</Satir>
      {r.type === 'bar' && <Satir k="Parça çapı / boyu">Ø{fmtN(r.partD!, 2)} × {fmtN(r.partLen!, 1)} mm</Satir>}
      {r.tube && (r.ID || 0) > 0 && (
        <Satir k="İç çap">Ø{olcu(r.ID!)}{r.idMan ? ' · elle girildi' : ' · deliğin Ø' + fmtN(2 * (r.thr || 0), 1) + ' çapından pay düşüldü'}</Satir>
      )}
      {r.tube && r.idBad && <Not uyari>İç çap parçanın deliğinden (Ø{fmtN(2 * (r.thr || 0), 1)}) büyük: parça bu borudan çıkmaz.</Not>}
      {r.tube && !r.idBad && !((r.ID || 0) > 0) && (
        <Not uyari>{(r.thr || 0) > 0 ? 'Delik iç çap payına yetmiyor' : 'Parçada boydan boya eksenel delik bulunamadı'}: dolu çubuk gibi hesaplandı. İç çapı elle girebilirsiniz.</Not>
      )}
      {geo && (
        <>
          <Satir k="Dönme ekseni">{'XYZ'[r.ai != null ? r.ai : geo.ai]}{otomatikEksen ? ' · otomatik' : ' · elle'} · dairesel kesit %{fmtN(geo.circ * 100, 0)}</Satir>
          <Satir k="Yöntem (geometriden)">
            {geo.method === 'mill' ? 'Freze · dönel değil' : geo.method === 'turn' ? 'Torna · freze gerekmez' : 'Torna + freze · yüzeylerin %' + fmtN(geo.millFrac * 100, 0) + '\'i freze'}
          </Satir>
        </>
      )}
      <Satir k="Hammadde hacmi">{fmtN(r.Vs / 1000, 1)} cm³</Satir>
      {r.Vp > 0 && <Satir k="Parça hacmi">{fmtN(r.Vp / 1000, 2)} cm³</Satir>}
      {model && (
        <>
          <Satir k="Yüzey alanı">{fmtN(model.area / 100, 1)} cm²</Satir>
          <Satir k="Model">{fmtN(model.tris)} üçgen{model.solids > 1 ? ' · ' + model.solids + ' gövde' : ''}</Satir>
        </>
      )}
      {govdeler && (
        <fieldset className="tc-ch-govdeler">
          <legend>Gövdeler · {govdeler.length} <em>parçayı seçin</em></legend>
          {govdeler.map((b, k) => (
            <label key={k} className={govdeSecili === k ? 'tc-ch-govde tc-ch-govde-secili' : 'tc-ch-govde'}>
              <input type="radio" name="stbody" checked={govdeSecili === k} onChange={() => { govdeSec(k); }} />
              <span>{b.name}</span><small>{fmtN(b.vol / 1000, 1)} cm³</small>
            </label>
          ))}
          <label className={govdeSecili < 0 ? 'tc-ch-govde tc-ch-govde-secili' : 'tc-ch-govde'}>
            <input type="radio" name="stbody" checked={govdeSecili < 0} onChange={() => { govdeSec(-1); }} />
            <span>Hepsi birlikte</span><small>{govdeler.length} gövde</small>
          </label>
        </fieldset>
      )}
      {(r.qty > 1 || r.price > 0) && (
        <>
          <h3 className="tc-ch-bolum">Parti · {r.qty} adet</h3>
          <Satir k="Toplam hammadde">{fmtN(r.ms * r.qty, 1)} kg</Satir>
          {r.Vp > 0 && <Satir k="Toplam talaş">{fmtN(r.mc * r.qty, 1)} kg</Satir>}
          {r.type === 'bar' && <Satir k={r.tube ? 'Toplam boru boyu' : 'Toplam çubuk boyu'}>{fmtN((r.L || 0) * r.qty / 1000, 2)} m</Satir>}
          {r.price > 0 && <Satir k="Hammadde maliyeti">{fmtN(r.ms * r.price, 2)} TL/adet · {fmtN(r.ms * r.price * r.qty, 0)} TL toplam</Satir>}
        </>
      )}
      <div className="tc-ch-dugmeler">
        <Dugme tur="birincil" simge="play" onClick={() => { eylem('toSim'); }}>G-Kod simülasyonunda kullan</Dugme>
        {yazabilir && <Dugme simge="clipboard-check" onClick={() => { eylem('toSetup'); }}>Kurulum kartına aktar</Dugme>}
        <Dugme simge="download" onClick={() => { eylem('csv'); }}>CSV</Dugme>
      </div>
    </div>
  );
}

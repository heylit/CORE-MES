import { useState } from 'react';
import { Dugme, IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { fmt, parseNum } from '../bicim.ts';
import * as K from '../kurallar/index.ts';
import { FASETLER } from '../sabitler/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { fasetDegerleri, type FiltreSecimi } from './liste.ts';

interface Faset { k: string; ad: string; et?: (v: string) => string }

const SINIR = 6;

// Prototipin süzgeç değişiklikleri (filtreDegis) saf haliyle: her işlem yeni seçim döner.
export function degerDegistir(sec: FiltreSecimi, k: string, v: string): FiltreSecimi {
  const y: FiltreSecimi = { ...sec };
  const a = [...fasetDegerleri(sec, k)];
  const i = a.indexOf(v);
  if (i >= 0) a.splice(i, 1); else a.push(v);
  if (a.length) y[k] = a; else delete y[k];
  if (k === 'form') delete y.olcu;
  return y;
}

export function fasetTemizle(sec: FiltreSecimi, k: string): FiltreSecimi {
  const y: FiltreSecimi = { ...sec };
  delete y[k];
  if (k === 'form') delete y.olcu;
  return y;
}

export function olcuSil(sec: FiltreSecimi, k: string): FiltreSecimi {
  const olcu = { ...(sec.olcu ?? {}) };
  delete olcu[k];
  const y: FiltreSecimi = { ...sec, olcu };
  if (!Object.keys(olcu).length) delete y.olcu;
  return y;
}

export function olcuYaz(sec: FiltreSecimi, k: string, sinir: 'min' | 'max', metin: string): FiltreSecimi {
  const n = parseNum(metin);
  const olcu = { ...(sec.olcu ?? {}) };
  const r = { ...(olcu[k] ?? {}) };
  if (typeof n === 'number' && Number.isFinite(n)) r[sinir] = n; else delete r[sinir];
  if (r.min === undefined && r.max === undefined) delete olcu[k]; else olcu[k] = r;
  const y: FiltreSecimi = { ...sec, olcu };
  if (!Object.keys(olcu).length) delete y.olcu;
  return y;
}

export function etiketiKaldir(sec: FiltreSecimi, k: string, v: string): FiltreSecimi {
  return k === 'olcu' ? olcuSil(sec, v) : degerDegistir(sec, k, v);
}

interface Ozellikler {
  liste: readonly KartKaydi[];
  sec: FiltreSecimi;
  degistir: (sec: FiltreSecimi) => void;
  b: KuralBaglami;
}

// Faset içinde VEYA, fasetler arasında VE; sayılar öteki seçimlere göre (prototipin fasetHTML'i).
export function Suzgecler({ liste, sec, degistir, b }: Ozellikler) {
  const [tumu, tumuYaz] = useState<ReadonlySet<string>>(new Set());
  const say = K.fasetSayilari(liste, sec, b);
  const olculer = K.filtreOlcuAnahtarlari(sec, b);
  const fasetler = (FASETLER as readonly Faset[]).map((f) => {
    const vals = say[f.k] ?? [];
    if (!vals.length) return null;
    const secili = new Set(fasetDegerleri(sec, f.k));
    if (vals.length === 1 && !secili.size && f.k !== 'onay' && liste.length > 1 && (f.k === 'birim' || f.k === 'tur')
      && vals[0]![1] === K.filtreUygula(liste, sec, f.k, b).length) return null;
    const acik = tumu.has(f.k);
    const goster = acik ? vals : vals.slice(0, SINIR);
    const et = (v: string) => String(f.et ? f.et(v) : v);
    return (
      <fieldset key={f.k} className="tc-mk-faset">
        <legend className="tc-mk-faset-bas">
          <span>{f.ad}</span>
          {secili.size > 0 && <button type="button" className="tc-mk-bag" onClick={() => degistir(fasetTemizle(sec, f.k))}>Temizle</button>}
        </legend>
        {goster.map(([v, n]) => (
          <div key={v} className="tc-mk-faset-deger" data-bos={n ? undefined : ''}>
            <IsaretKutusu etiket={et(v)} checked={secili.has(v)} onChange={() => degistir(degerDegistir(sec, f.k, v))} />
            <span className="tc-mk-faset-sayi">{n}</span>
          </div>
        ))}
        {vals.length > SINIR && (
          <button
            type="button" className="tc-mk-bag"
            onClick={() => tumuYaz((s) => { const y = new Set(s); if (y.has(f.k)) y.delete(f.k); else y.add(f.k); return y; })}
          >
            {acik ? 'Daha az göster' : `Tümünü göster (${vals.length})`}
          </button>
        )}
      </fieldset>
    );
  });
  const form = fasetDegerleri(sec, 'form')[0];
  return (
    <div className="tc-mk-fasetler" aria-label="Süzgeçler" role="group">
      {fasetler}
      {olculer && form && (
        <fieldset className="tc-mk-faset">
          <legend className="tc-mk-faset-bas">
            <span>Ölçü aralığı · {b.t.FORMS[form]?.ad ?? form}</span>
            {sec.olcu && <button type="button" className="tc-mk-bag" onClick={() => degistir(fasetTemizle(sec, 'olcu'))}>Temizle</button>}
          </legend>
          {olculer.map(([k, ad, u]) => {
            const vs = K.filtreUygula(liste, sec, 'olcu', b).filter((x: KartKaydi) => x.form === form)
              .map((x: KartKaydi) => (x.dims ?? {})[k]).filter((n: unknown): n is number => typeof n === 'number');
            const r = sec.olcu?.[k] ?? {};
            const yaz = (n?: number) => (typeof n === 'number' ? String(n).replace('.', ',') : '');
            const etiket = `${ad}${u && u !== 'mm' ? ` (${u})` : ''}`;
            return (
              <div key={k} className="tc-mk-olcu">
                <span>{etiket}</span>
                <input
                  key={`min-${yaz(r.min)}`} className="tc-alan-kutu" inputMode="decimal" aria-label={`${ad} en az`} defaultValue={yaz(r.min)}
                  placeholder={vs.length ? fmt(Math.min(...vs)) : 'en az'} onBlur={(o) => degistir(olcuYaz(sec, k, 'min', o.target.value))}
                />
                <span aria-hidden="true">–</span>
                <input
                  key={`max-${yaz(r.max)}`} className="tc-alan-kutu" inputMode="decimal" aria-label={`${ad} en çok`} defaultValue={yaz(r.max)}
                  placeholder={vs.length ? fmt(Math.max(...vs)) : 'en çok'} onBlur={(o) => degistir(olcuYaz(sec, k, 'max', o.target.value))}
                />
              </div>
            );
          })}
        </fieldset>
      )}
      {fasetler.every((f) => f === null) && !olculer && <p className="tc-mk-ipucu">Süzülecek bir özellik yok.</p>}
    </div>
  );
}

// Seçili süzgeçler çip olarak; dokununca kalkar. Sayı prototipteki gibi her zaman yazılır.
export function AktifSuzgecler({ sec, adet, degistir, b }: { sec: FiltreSecimi; adet: number; degistir: (s: FiltreSecimi) => void; b: KuralBaglami }) {
  const l = K.filtreEtiketleri(sec, b);
  return (
    <div className="tc-mk-aktif" aria-live="polite">
      <span className="tc-mk-aktif-sayi">{adet} kart</span>
      {l.map((e) => (
        <Dugme key={`${e.k}|${e.v}`} className="tc-mk-cip" onClick={() => degistir(etiketiKaldir(sec, e.k, e.v))} aria-label={`${e.ad}: ${e.et} süzgecini kaldır`}>
          {e.ad}: <b>{e.et}</b> <Simge ad="x" />
        </Dugme>
      ))}
      {l.length > 0 && <button type="button" className="tc-mk-bag" onClick={() => degistir({})}>Tüm süzgeçleri temizle</button>}
    </div>
  );
}

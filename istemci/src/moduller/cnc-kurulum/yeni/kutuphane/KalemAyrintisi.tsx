import type { InputHTMLAttributes } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { state } from '../depo.ts';
import { upTR } from '../bicim.ts';
import { allMachines, invKey, stockOf, usage } from '../secici.ts';
import { useCncYetkisi } from '../veri.ts';
import { KalemFormu } from './KalemFormu.tsx';
import { bagliKart, StokKarti } from './StokKarti.tsx';
import {
  bumpMin, bumpQty, rafRengi, setActive, setLoc, setMin, setQty, type Duzenleme, type DuzenlemeAlanlari, type Kalem, type Raf, type StokKaydi,
} from './raf.ts';

// Prototipteki gibi değer alan bırakılınca (ya da Enter ile) yazılır, her tuşta değil.
export function BirakincaYaz({ deger, yaz, ...geri }: { deger: string; yaz: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue'>) {
  return (
    <input
      key={deger} defaultValue={deger} {...geri}
      onBlur={(o) => { if (o.target.value !== deger) yaz(o.target.value); }}
      onKeyDown={(o) => { if (o.key === 'Enter') { o.preventDefault(); o.currentTarget.blur(); } }}
    />
  );
}

export function rafSinifi(key: string): string {
  return `tc-cl-renk-${rafRengi(key).slice(2)}`;
}

interface Ozellikler {
  it: Kalem;
  raf: Raf;
  duzenleme: Duzenleme | null;
  duzenle: (d: Duzenleme | null) => void;
  kaydet: (alanlar: DuzenlemeAlanlari) => void;
  sablonDegistir: (raf: string, kalemId: string) => void;
  sil: () => void;
}

// Prototipin libDetailHTML'i ve köprünün stok kartı bölümü (bölüm stok ızgarasının hemen altında).
export function KalemAyrintisi({ it, raf, duzenleme, duzenle, kaydet, sablonDegistir, sil }: Ozellikler) {
  const yetki = useCncYetkisi();
  const key = invKey(it);
  const s = stockOf(key);
  const iv: Partial<StokKaydi> = (state.inv as Record<string, StokKaydi | undefined>)[key] ?? {};
  const u = usage()[key];
  const bag = bagliKart(key);
  const yaz = yetki.yazabilir;

  const ust = (
    <>
      <div className={`tc-cl-kategori ${rafSinifi(raf.key)}`}>{upTR(raf.title) + (it.custom ? ' · ÖZEL' : '')}</div>
      <h3 className="tc-cl-ad">{it.name}</h3>
      <div className="tc-cl-kod mono">{it.code ?? ''}</div>
    </>
  );
  if (duzenleme) return <>{ust}<KalemFormu duzenleme={duzenleme} sablonDegistir={sablonDegistir} kaydet={kaydet} vazgec={() => { duzenle(null); }} /></>;

  return (
    <>
      {ust}
      {(it.tags || it.desc) && <p className="tc-cl-aciklama">{[it.tags, it.desc].filter(Boolean).join(' · ')}</p>}
      <div className="tc-cl-izgara">
        <div>
          <small>Toplam adet</small>
          <div className="tc-cl-adim">
            {yaz && (bag === null || yetki.stokDusebilir) && <button type="button" aria-label="Azalt" onClick={() => { bumpQty(key, -1); }}><Simge ad="minus" boyut="k" /></button>}
            <BirakincaYaz
              aria-label="Toplam adet" type="number" min="0" placeholder="—" deger={iv.qty != null ? String(iv.qty) : ''}
              readOnly={!yaz || bag !== null} title={bag !== null ? 'Adet Stok modülünden gelir.' : undefined} yaz={(v) => { setQty(key, v); }}
            />
            {yaz && bag === null && <button type="button" aria-label="Artır" onClick={() => { bumpQty(key, 1); }}><Simge ad="plus" boyut="k" /></button>}
          </div>
        </div>
        <div>
          <small>Kritik seviye</small>
          <div className="tc-cl-adim">
            {yaz && <button type="button" aria-label="Kritik seviyeyi azalt" onClick={() => { bumpMin(key, -1); }}><Simge ad="minus" boyut="k" /></button>}
            <BirakincaYaz aria-label="Kritik seviye" type="number" min="0" placeholder="0" deger={iv.min ? String(iv.min) : ''} readOnly={!yaz} yaz={(v) => { setMin(key, v); }} />
            {yaz && <button type="button" aria-label="Kritik seviyeyi artır" onClick={() => { bumpMin(key, 1); }}><Simge ad="plus" boyut="k" /></button>}
          </div>
        </div>
        <div><small>Tezgâhlarda aktif</small><b>{s.used}</b></div>
        <div><small>Depoda</small><b className={`tc-cl-st-${s.st}`}>{s.avail == null ? '—' : s.avail}</b></div>
      </div>
      <StokKarti kimlik={key} />
      <label className="tc-cl-konum">
        Konum
        <BirakincaYaz deger={iv.loc ?? ''} placeholder="Örn. Takım dolabı A · Çekmece 3" readOnly={!yaz} yaz={(v) => { setLoc(key, v); }} />
      </label>
      {s.st === 'short'
        ? <div className="tc-cl-uyari"><Simge ad="alert" boyut="k" /> Tezgâhlardaki kullanım stoktan fazla — {-(s.avail ?? 0)} adet eksik</div>
        : s.st === 'low'
          ? <div className="tc-cl-uyari">Kritik seviyede — sipariş zamanı</div>
          : s.st === 'none' && s.used
            ? <div className="tc-cl-uyari">Tezgâhlarda {s.used} adet kullanılıyor, stok girilmemiş</div>
            : null}
      <div className="tc-cl-ara-baslik">Hangi tezgâhta aktif</div>
      <div className="tc-cl-tezgahlar">
        {(allMachines() as { id: string; name: string }[]).map((m) => {
          const b = u?.by[m.id] ?? { mag: 0, man: 0 };
          return (
            <div key={m.id} className="tc-cl-tezgah" data-on={b.mag + b.man ? '' : undefined}>
              <span>{m.name}{b.mag ? <em>magazinde {b.mag}</em> : null}</span>
              <div className="tc-cl-adim tc-cl-adim-k">
                {yaz && <button type="button" aria-label={`${m.name}: azalt`} onClick={() => { setActive(m.id, key, -1); }}><Simge ad="minus" boyut="k" /></button>}
                <b>{b.man}</b>
                {yaz && <button type="button" aria-label={`${m.name}: artır`} onClick={() => { setActive(m.id, key, 1); }}><Simge ad="plus" boyut="k" /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="tc-cl-not">“Magazinde” sayısı Kurulum sayfasındaki takım ceplerinden otomatik gelir (tutucular dahil). ± ile tezgâha elle atama yaparsın.</p>
      {yaz && (
        <div className="tc-cl-dugmeler">
          <Dugme simge="plus" onClick={() => { duzenle({ mode: 'new', base: it, shelf: it.shelf && it.custom ? it.shelf : raf.key }); }}>Bundan yeni malzeme</Dugme>
          {it.custom && <Dugme simge="edit" onClick={() => { duzenle({ mode: 'edit', base: it }); }}>Düzenle</Dugme>}
          {it.custom && <Dugme tur="tehlike" simge="trash" onClick={sil}>Sil</Dugme>}
        </div>
      )}
    </>
  );
}

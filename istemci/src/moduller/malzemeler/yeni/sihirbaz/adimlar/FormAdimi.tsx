import { useState } from 'react';
import { fmt, fmtD, kgFmt, parseNum, perM2Fmt, perMFmt, r4 } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import type { Taslak } from '../durum.ts';
import { aileler, formlar } from '../turler.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { Alanlar, BagDugmesi, Cip, CipGrubu, MetinAlani, Uyari, Yardim } from '../parcalar.tsx';

// Hammadde 3. adım (prototipte `s2`): form, standart ölçü hazırları, toplu varyant, ölçüler ve tolerans, canlı ağırlık.
export function FormAdimi() {
  const { taslak: d, b, degistir, secim, secimYaz, bildir } = useSihirbaz();
  const f = d.fam ? aileler(b)[d.fam] : undefined;
  if (!f) return <p className="tc-my-bos">Önce bir malzeme ailesi seç.</p>;
  const durum = (k: string) => K.formStatus(k, d, b);
  const formSec = (k: string) => {
    const fs = durum(k);
    if (fs.s === 'no') bildir(`${fs.m} Yine de seçildi.`);
    degistir((t) => {
      if (t.form === k) return;
      t.form = k;
      t.dims = { ...(formlar()[k]?.def ?? {}) };
      t.vsel = {};
      if (!t.com.birim || Object.values(S.DEFBIRIM).includes(t.com.birim) || t.com.birim === 'adet') t.com.birim = '';
    });
  };
  const dugme = (k: string) => {
    const x = durum(k);
    const fm = formlar()[k];
    if (!fm) return null;
    return (
      <button
        key={k} type="button" className={x.s === 'no' ? 'tc-my-form tc-my-form-uyumsuz' : 'tc-my-form'} aria-pressed={d.form === k}
        title={x.s === 'no' ? x.m : undefined} onClick={() => { formSec(k); }}
      >
        <KatalogSimgesi yol={S.ICON[k]} />{fm.ad}
        {x.s === 'rec' && <span className="tc-my-form-etiket">En yaygın</span>}
      </button>
    );
  };
  const uygun = (f.forms ?? []).filter((k) => durum(k).s !== 'no' || d.form === k);
  const tipikDegil = (f.forms ?? []).filter((k) => durum(k).s === 'no' && d.form !== k);
  const fm = d.form ? formlar()[d.form] : undefined;
  const vm = !!d.vmode && !d.id;
  return (
    <>
      <div className="tc-my-formlar">{uygun.map(dugme)}</div>
      {tipikDegil.length > 0 && (
        <details className="tc-my-daha" open={secim.tumFormlar} onToggle={(e) => { secimYaz({ tumFormlar: e.currentTarget.open }); }}>
          <summary>Bu kalite için tipik olmayan formlar ({tipikDegil.length})</summary>
          <div className="tc-my-formlar">{tipikDegil.map(dugme)}</div>
        </details>
      )}
      {d.form && fm && durum(d.form).s === 'no' && (
        <Uyari ton="uyumsuz"><b>Uyumsuz form:</b> {fm.ad}. {durum(d.form).m}</Uyari>
      )}
      {fm && (
        <>
          <div className="tc-my-olcu-ust">
            <h4>{vm ? 'Varyant ölçüleri' : 'Standart ölçüler'}</h4>
            {d.id
              ? <span className="tc-my-kucuk">Düzenlenen kayıtta toplu varyant kapalı; kopyasını oluşturarak kullanabilirsin.</span>
              : (
                <label className="tc-my-isaret">
                  <input type="checkbox" checked={vm} onChange={(e) => { const v = e.target.checked; degistir((t) => { t.vmode = v; t.vsel = t.vsel ?? {}; }); }} />
                  <span>Birden çok ölçüyü tek seferde ekle</span>
                </label>
              )}
          </div>
          <OlcuHazirlari />
          {vm && <VaryantTablosu />}
          <h4 className="tc-my-alt-baslik">{vm ? 'Sabit ölçüler ve tolerans' : 'Ölçüler'}</h4>
          <Alanlar>
            {fm.dims.map(([k, ad, u]) => (
              <MetinAlani
                key={k} etiket={ad} sayi birim={u || 'mm'} deger={d.dims[k]}
                yaz={(v) => { degistir((t) => { t.dims = { ...t.dims, [k]: v }; }); }}
              />
            ))}
            <MetinAlani etiket="Tolerans" deger={d.tol} ipucu="ör. EN 10029 sınıf A, h9, ±0,1 mm" yaz={(v) => { degistir((t) => { t.tol = String(v); }); }} />
          </Alanlar>
          <ToleransCipleri />
          <OlcuNotlari />
          {!vm && <><CanliAgirlik d={d} /><BenzerIpucu /></>}
        </>
      )}
    </>
  );
}

function ToleransCipleri() {
  const { taslak: d, degistir } = useSihirbaz();
  const l = d.form && d.fam ? S.TOLP[d.form]?.[d.fam] : undefined;
  if (!l) return null;
  return (
    <CipGrubu etiket="Tolerans normu">
      {l.map((x) => <Cip key={x} basili={d.tol === x} tikla={() => { degistir((t) => { t.tol = t.tol === x ? '' : x; }); }}>{x}</Cip>)}
    </CipGrubu>
  );
}

function OlcuNotlari() {
  const { taslak: d, b } = useSihirbaz();
  const hata = d.form ? K.dimsErr(d, b) : '';
  const uyarilar = K.dimWarns(d, b) as string[];
  return (
    <>
      {hata && Object.keys(d.dims).length > 0 && <p className="tc-my-hata" role="alert">{hata}</p>}
      {uyarilar.map((m) => <p key={m} className="tc-my-dikkat">{m}</p>)}
      {b.birim === 'imp' && d.form && !hata && <p className="tc-my-kucuk">Girişler mm; inç karşılığı: {K.dimsStr(d, undefined, b)}</p>}
    </>
  );
}

// Prototipte `liveWeight`.
export function CanliAgirlik({ d }: { d: Taslak }) {
  const { b } = useSihirbaz();
  const fm = d.form ? formlar()[d.form] : undefined;
  if (!fm) return null;
  const w = K.weight(d, b);
  if (!w) {
    return (
      <div className="tc-my-canli">
        <div><small>Parça ağırlığı</small><b>—</b></div>
        <div className="tc-my-canli-not">{K.dimsErr(d, b) ? 'Ölçüleri tamamla.' : 'Hesap için yoğunluk değeri gerekli (5. adım).'}</div>
      </div>
    );
  }
  return (
    <div className="tc-my-canli" aria-live="polite">
      <div><small>{fm.mass ? 'Ambalaj / rulo ağırlığı' : 'Parça ağırlığı'}</small><b>{kgFmt(w.kg, b.birim)}</b></div>
      {typeof w.perM === 'number' && <div><small>Metre ağırlığı</small><b>{perMFmt(w.perM, b.birim)}</b></div>}
      {typeof w.perM2 === 'number' && <div><small>Metrekare ağırlığı</small><b>{perM2Fmt(w.perM2, b.birim)}</b></div>}
    </div>
  );
}

// Prototipte `#dupHint`: aynı kalite ve ölçüde kart varsa ölçü adımında da söylenir.
function BenzerIpucu() {
  const { taslak: d, b, kartiAc } = useSihirbaz();
  const l = !d.id && !K.dimsErr(d, b) ? K.benzerKartlar(d, undefined, b) : [];
  const ilk = l[0];
  if (!ilk) return null;
  return (
    <p className="tc-my-dikkat">
      {ilk.seviye === 'ayni' ? 'Bu kalite ve ölçüde kart zaten var' : 'Benzer kart var'}:{' '}
      <BagDugmesi tikla={() => { kartiAc(String(ilk.x.id)); }}>{ilk.x.com.kod}</BagDugmesi> ({ilk.neden})
      {l.length > 1 ? ` ve ${String(l.length - 1)} kart daha` : ''}
    </p>
  );
}

// Prototipte `presetsHTML` ve `addCustomPreset`.
function OlcuHazirlari() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const gruplar = K.presetGroups(d, b);
  if (!gruplar.length) return null;
  const vm = !!d.vmode && !d.id;
  return (
    <div className="tc-my-hazirlar">
      {gruplar.map((g) => {
        const sec = d.vsel?.[g.id] ?? [];
        const hepsi = [...g.vals];
        sec.forEach((v) => { if (!hepsi.some((x) => K.vkey(x, b) === K.vkey(v, b))) hepsi.push(v); });
        const basili = (v: readonly number[]) => (vm ? sec.some((x) => K.vkey(x, b) === K.vkey(v, b)) : g.keys.every((k, i) => d.dims[k] === v[i]));
        const etiket = (v: readonly number[]) => {
          const i = g.vals.findIndex((x) => K.vkey(x, b) === K.vkey(v, b));
          if (g.labels && i >= 0) return g.labels[i] ?? '';
          if (g.inch) return `${fmt(r4((v[0] ?? 0) / 25.4), 3)}"`;
          return v.map((n) => fmtD(n)).join(' × ');
        };
        const tikla = (v: readonly number[]) => {
          degistir((t) => {
            if (t.vmode && !t.id) {
              t.vsel = t.vsel ?? {};
              const a = [...(t.vsel[g.id] ?? [])];
              const i = a.findIndex((x) => K.vkey(x, b) === K.vkey(v, b));
              if (i >= 0) a.splice(i, 1); else a.push([...v]);
              t.vsel[g.id] = a;
            } else g.keys.forEach((k, i) => { t.dims[k] = v[i] ?? ''; });
          });
        };
        return (
          <div key={g.id} className="tc-my-hazir">
            <span className="tc-my-etiket">{g.ad}{vm && sec.length > 0 && <span className="tc-my-sayac">{sec.length} seçili</span>}</span>
            <CipGrubu etiket={g.ad}>
              {hepsi.map((v) => <Cip key={K.vkey(v, b)} basili={basili(v)} tikla={() => { tikla(v); }}>{etiket(v)}</Cip>)}
              {vm && g.custom && <OzelDeger grupId={g.id} ad={g.ad} inc={!!g.inch} />}
            </CipGrubu>
          </div>
        );
      })}
    </div>
  );
}

function OzelDeger({ grupId, ad, inc }: { grupId: string; ad: string; inc: boolean }) {
  const { degistir, bildir, b } = useSihirbaz();
  const [metin, metinYaz] = useState('');
  const ekle = () => {
    let n = parseNum(metin);
    if (inc && typeof n === 'number') n = K.mmi(n, b) as number;
    if (typeof n !== 'number' || n <= 0) { bildir('Sıfırdan büyük bir sayı gir.'); return; }
    const deger = n;
    degistir((t) => {
      t.vsel = t.vsel ?? {};
      const a = [...(t.vsel[grupId] ?? [])];
      if (!a.some((x) => x[0] === deger)) a.push([deger]);
      a.sort((x, y) => (x[0] ?? 0) - (y[0] ?? 0));
      t.vsel[grupId] = a;
    });
    metinYaz('');
  };
  return (
    <span className="tc-my-ozel-deger">
      <input
        inputMode="decimal" value={metin} aria-label={`${ad} için değer ekle`} placeholder={inc ? 'Başka değer (inç)' : 'Başka değer'}
        onChange={(e) => { metinYaz(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ekle(); } }}
      />
      <Cip basili={false} tikla={ekle}>Ekle</Cip>
    </span>
  );
}

// Prototipte `variantTableHTML`: seçilen değerlerin bütün birleşimleri ayrı kalem olur; en çok VMAX kaydedilir.
export function VaryantTablosu() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const vs = K.variantList(d, b);
  if (!vs.length) {
    return <Yardim>Yukarıdaki listelerden birden çok değer seç; seçimlerin tüm kombinasyonları ayrı katalog kalemi olur. Seçmediğin ölçüler aşağıdaki sabit değerlerden alınır.</Yardim>;
  }
  const gecerli = vs.filter((v) => !K.dimsErr(v, b)).length;
  const kodlar: string[] = [];
  return (
    <>
      <div className="tc-my-vozet">
        <b>{vs.length} varyant</b>
        <span>{K.variantSummary(d, b)}</span>
        {gecerli < vs.length && <span className="tc-my-hata">{vs.length - gecerli} geçersiz, kaydedilmeyecek</span>}
        {vs.length > S.VMAX && <span className="tc-my-hata">En fazla {S.VMAX} varyant kaydedilir</span>}
        <BagDugmesi tikla={() => { degistir((t) => { t.vsel = {}; }); }}>Seçimleri temizle</BagDugmesi>
      </div>
      <div className="tc-my-tablo">
        <table>
          <thead><tr><th>Kod</th><th>Ölçü</th><th className="tc-my-sayi">Ağırlık</th><th><span className="tc-my-gizli">Not</span></th></tr></thead>
          <tbody>
            {vs.slice(0, S.VMAX).map((vd) => {
              const kod = K.variantKod(d, vd, kodlar, b);
              kodlar.push(kod);
              const hata = K.dimsErr(vd, b);
              const w = K.weight(vd, b);
              const dw = K.dimWarns(vd, b);
              return (
                <tr key={K.dimsStr(vd, undefined, b)} className={hata ? 'tc-my-gecersiz' : undefined}>
                  <td className="tc-my-kod">{kod}</td>
                  <td>{K.dimsStr(vd, undefined, b)}</td>
                  <td className="tc-my-sayi">{w ? kgFmt(w.kg, b.birim) : '—'}</td>
                  <td>{hata ? <span className="tc-my-hata">{hata}</span> : dw.length ? <span className="tc-my-dikkat" title={dw.join(' ')}>Dikkat</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

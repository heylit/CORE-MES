import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import { fmt } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { Kutu, MetinAlani, Yardim } from '../parcalar.tsx';
import type { Ozellik } from '../../kurallar/index.ts';


// Prototipte `propRow`: değer kaliteden (ya da işlemden) gelir; değiştirilen işaretlenir ve geri alınabilir.
function OzellikSatiri({ p }: { p: Ozellik }) {
  const { taslak: d, b, degistir } = useSihirbaz();
  const f = d.fam ? b.t.FAMS[d.fam] : undefined;
  const hesap = K.computed(p.k, d, b);
  const ov = d.ov[p.k];
  const degisti = ov !== undefined && ov !== '';
  const u = p.sel ? '' : K.unitOf(p, d.fam, b);
  const yaz = (v: string | number) => {
    degistir((t) => {
      if (v === '' || v === K.computed(p.k, t, b)) delete t.ov[p.k];
      else t.ov[p.k] = v;
    });
  };
  let girdi;
  if (p.sel) {
    const liste: readonly string[] = p.sel === 'yanma' ? (f?.yanma ?? S.UL94) : Array.isArray(p.sel) ? p.sel : [];
    const cur = String(K.val(p.k, d, b) ?? '');
    girdi = (
      <span className="tc-my-girdi">
        <select aria-label={p.ad} value={cur} onChange={(e) => { yaz(e.target.value); }}>
          <option value="">—</option>
          {liste.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </span>
    );
  } else {
    girdi = <MetinAlani etiket={<span className="tc-my-gizli">{p.ad}</span>} deger={K.val(p.k, d, b)} sayi birim={u} ipucu="—" yaz={yaz} />;
  }
  const v = K.val(p.k, d, b);
  const inc = b.birim === 'imp' && !p.sel && typeof v === 'number' && u && S.PCONV[u] ? K.propDisp(v, u, b) : null;
  let kaynak;
  if (degisti) {
    kaynak = (
      <>
        <span className="tc-my-etiket-k tc-my-etiket-degisti">Değiştirildi</span>
        <button
          type="button" className="tc-my-sifirla" aria-label={`${p.ad} değerini geri al`}
          title={`Kaliteden gelen değere dön${hesap !== undefined ? `: ${String(fmt(hesap))}` : ''}`}
          onClick={() => { degistir((t) => { delete t.ov[p.k]; }); }}
        ><Simge ad="back" />
        </button>
      </>
    );
  } else if (hesap !== undefined && hesap !== '' && hesap !== null) {
    kaynak = <span className="tc-my-etiket-k">{K.modded(p.k, d, b) ? 'İşlemden' : 'Kaliteden'}</span>;
  } else kaynak = <span className="tc-my-etiket-k">Boş</span>;
  return (
    <div className={degisti ? 'tc-my-ozellik tc-my-ozellik-degisti' : 'tc-my-ozellik'}>
      <span className="tc-my-ozellik-ad">
        {p.ad}
        {inc && <small>≈ {inc}</small>}
        {p.sel === 'yanma' && <small>{f?.yanma === S.EN13501 ? 'EN 13501-1' : 'UL 94'}</small>}
      </span>
      {girdi}
      <span className="tc-my-ozellik-kaynak">{kaynak}</span>
    </div>
  );
}

// Hammadde 5. adım (prototipte `s4`).
export function TeknikAdimi() {
  const { taslak: d, b, degistir } = useSihirbaz();
  if (!d.fam || !b.t.FAMS[d.fam]) return <p className="tc-my-bos">Önce bir malzeme ailesi seç.</p>;
  const ekler = d.extra ?? [];
  const ekYaz = (i: number, k: 'ad' | 'v' | 'u', v: string) => {
    degistir((t) => { const e = t.extra?.[i]; if (e) e[k] = v; });
  };
  return (
    <>
      <div className="tc-my-ozellikler">{K.propsFor(d.fam, b).map((p) => <OzellikSatiri key={p.k} p={p} />)}</div>
      <Kutu baslik="Ek özellikler">
        <Yardim>Sürtünme katsayısı, renk kodu, test sonucu gibi listede olmayan her şey.</Yardim>
        {ekler.map((e, i) => (
          // Satırın kimliği yok; sıra kimliktir (prototipte de silme sıraya göredir).
          <div key={i} className="tc-my-ek">
            <input value={e.ad} placeholder="Özellik adı" aria-label="Özellik adı" onChange={(x) => { ekYaz(i, 'ad', x.target.value); }} />
            <input value={e.v} placeholder="Değer" aria-label="Değer" onChange={(x) => { ekYaz(i, 'v', x.target.value); }} />
            <input value={e.u} placeholder="Birim" aria-label="Birim" onChange={(x) => { ekYaz(i, 'u', x.target.value); }} />
            <button type="button" className="tc-my-sifirla" aria-label="Satırı sil" onClick={() => { degistir((t) => { t.extra?.splice(i, 1); }); }}>
              <Simge ad="x" />
            </button>
          </div>
        ))}
        <Dugme simge="plus" onClick={() => { degistir((t) => { t.extra = [...(t.extra ?? []), { ad: '', v: '', u: '' }]; }); }}>Özellik ekle</Dugme>
      </Kutu>
    </>
  );
}

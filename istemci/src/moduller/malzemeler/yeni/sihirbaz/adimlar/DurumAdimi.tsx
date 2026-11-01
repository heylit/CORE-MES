import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import { tlc } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { aileler, formlar } from '../turler.ts';
import type { AileSecenegi } from '../../kurallar/index.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { BagDugmesi, Cip, CipGrubu, MetinAlani, SecenekGrubu, Uyari, type CipTonu } from '../parcalar.tsx';

type Secenek = AileSecenegi;

const TON: Record<string, CipTonu | undefined> = { rec: 'yaygin', warn: 'dikkat', no: 'uyumsuz' };

// Hammadde 4. adım (prototipte `s3`): seçenekler kalite ve forma göre süzülür; uyumsuz olanlar istenirse görünür.
export function DurumAdimi() {
  const { taslak: d, b, degistir, yenisiniKur, secim, secimYaz, bildir } = useSihirbaz();
  const f = d.fam ? aileler(b)[d.fam] : undefined;
  if (!f) return <p className="tc-my-bos">Önce bir malzeme ailesi seç.</p>;
  const c = d.fam && d.cls ? f.classes[d.cls] : undefined;
  const gruplar: { ad: string; ogeler: Secenek[] }[] = [];
  f.opts.forEach((o) => {
    const ad = o.grp || 'Diğer';
    let g = gruplar.find((x) => x.ad === ad);
    if (!g) { g = { ad, ogeler: [] }; gruplar.push(g); }
    g.ogeler.push(o);
  });
  let gizli = 0;
  const liste = (o: Secenek): readonly string[] => {
    if (!o.from) return o.opts ?? [];
    const l = c?.[o.from];
    return Array.isArray(l) ? l.map(String) : [];
  };
  const sec = (o: Secenek, v: string) => {
    const st = K.optStatus(o.k, v, d, b);
    if (o.type === 'select') {
      if (st.s === 'no' && d.opts[o.k] !== v) bildir(`Uyumsuz: ${st.m}`);
      degistir((t) => { t.opts[o.k] = t.opts[o.k] === v ? '' : v; });
      return;
    }
    const cur = d.opts[o.k];
    if (st.s === 'no' && !(Array.isArray(cur) && cur.includes(v))) bildir(`Uyumsuz: ${st.m}`);
    degistir((t) => {
      const a = new Set(Array.isArray(t.opts[o.k]) ? (t.opts[o.k] as string[]) : []);
      if (a.has(v)) a.delete(v); else a.add(v);
      t.opts[o.k] = [...a];
    });
  };
  const bilgi = (k: string, degerler: readonly string[]) => {
    const v = degerler.filter((x) => S.INFO[x] || K.optStatus(k, x, d, b).m);
    if (!v.length) return null;
    return (
      <div className="tc-my-sbilgi">
        {v.map((x) => {
          const [acik = '', oneri] = (S.INFO[x] ?? '').split('||');
          const st = K.optStatus(k, x, d, b);
          return (
            <p key={x}>
              <b>{x}:</b> {acik}
              {oneri && <span className="tc-my-oneri">Öneri: {oneri}</span>}
              {st.m && <span className={st.s === 'no' ? 'tc-my-hata' : 'tc-my-dikkat'}>{st.s === 'no' ? 'Uyumsuz' : 'Dikkat'}: {st.m}</span>}
            </p>
          );
        })}
      </div>
    );
  };
  const baslik = (o: Secenek) => (S.LINFO[o.k]
    ? <span className="tc-my-ipucu" tabIndex={0} title={S.LINFO[o.k]}>{o.ad}<span className="tc-my-ipucu-isaret" aria-hidden="true">?</span></span>
    : o.ad);
  const bir = (o: Secenek) => {
    if (o.type === 'select' || o.type === 'multi') {
      const cur = o.type === 'select' ? (d.opts[o.k] ? [String(d.opts[o.k])] : []) : ((d.opts[o.k] as string[] | undefined) ?? []);
      const l = liste(o);
      const gorunen = l.filter((x) => secim.tumSecenekler || cur.includes(x) || K.optStatus(o.k, x, d, b).s !== 'no');
      gizli += l.length - gorunen.length;
      if (!gorunen.length) return null;
      const mods = gorunen.filter((x) => S.MODS[x]);
      return (
        <SecenekGrubu key={o.k} baslik={baslik(o)} ikon={K.optIcon(d.fam, o, b)} ikonAcik={cur.length > 0} sayac={o.type === 'multi' ? cur.length : undefined}>
          <CipGrubu etiket={o.ad} radyo={o.type === 'select'}>
            {gorunen.map((x) => (
              <Cip
                key={x} radyo={o.type === 'select'} basili={cur.includes(x)} ton={TON[K.optStatus(o.k, x, d, b).s]} ipucu
                baslik={S.INFO[x]?.split('||')[0]} tikla={() => { sec(o, x); }}
              >{x}
              </Cip>
            ))}
          </CipGrubu>
          {mods.length > 0 && <p className="tc-my-kucuk">{mods.join(', ')} seçimi teknik değerleri otomatik günceller.</p>}
          {bilgi(o.k, cur)}
        </SecenekGrubu>
      );
    }
    const v = d.opts[o.k];
    return (
      <SecenekGrubu key={o.k} baslik={baslik(o)} ikon={K.optIcon(d.fam, o, b)} ikonAcik={v !== undefined && v !== ''}>
        <MetinAlani
          etiket={o.ad} deger={v} sayi={o.type === 'number'} ipucu={o.ph} girdiSinifi="tc-my-dar"
          yaz={(x) => { degistir((t) => { t.opts[o.k] = x; }); }}
        />
      </SecenekGrubu>
    );
  };
  const govde = gruplar.map((g) => {
    const ic = g.ogeler.map(bir).filter(Boolean);
    if (!ic.length) return null;
    const ik = S.GRP_ICON[g.ad];
    return (
      <section key={g.ad} className="tc-my-sbolum">
        <h4>{ik && <KatalogSimgesi yol={S.OPT_ICON[ik]} />}{g.ad}</h4>
        {ic}
      </section>
    );
  });
  const sorunlar = K.compatIssues(d, b).filter((i) => i.step === 3);
  const uyumsuz = sorunlar.filter((i) => i.s === 'no').length;
  const g = K.grade(d, b);
  return (
    <>
      <p className="tc-my-ipucu-satir">
        <span aria-hidden="true">?</span>
        Seçenekler {g?.ad ?? 'seçtiğin kalite'}{d.form ? ` ve ${tlc(formlar()[d.form]?.ad ?? '')}` : ''} için süzüldü. Üzerine gelince ne anlama geldiğini görürsün.
      </p>
      <div className="tc-my-lejant">
        <span className="tc-my-lj tc-my-lj-yaygin">Yaygın seçim</span>
        <span className="tc-my-lj tc-my-lj-dikkat">Dikkat gerektirir</span>
        {secim.tumSecenekler && <span className="tc-my-lj tc-my-lj-uyumsuz">Uyumsuz</span>}
        {(gizli > 0 || secim.tumSecenekler) && (
          <BagDugmesi tikla={() => { secimYaz({ tumSecenekler: !secim.tumSecenekler }); }}>
            {secim.tumSecenekler ? 'Uyumsuz seçenekleri gizle' : `Gizlenen ${String(gizli)} uyumsuz seçeneği göster`}
          </BagDugmesi>
        )}
      </div>
      {sorunlar.length > 0 && (
        <Uyari ton={uyumsuz ? 'uyumsuz' : 'dikkat'}>
          <b>{uyumsuz ? `${String(uyumsuz)} seçim bu kalite veya formla uyumsuz` : 'Dikkat gerektiren seçimler var'}</b>
          <ul>{sorunlar.map((i) => <li key={`${i.t}|${i.m}`}><b>{i.t}</b>: {i.m}</li>)}</ul>
          {uyumsuz > 0 && (
            <Dugme onClick={() => {
              const n = K.compatIssues(d, b).filter((i) => i.s === 'no' && i.k).length;
              yenisiniKur(K.uyumsuzlariKaldir(d, b));
              bildir(n ? `${String(n)} uyumsuz seçim kaldırıldı.` : 'Kaldırılacak uyumsuz seçim yok.');
            }}
            >Uyumsuz seçimleri kaldır
            </Dugme>
          )}
        </Uyari>
      )}
      {govde}
    </>
  );
}

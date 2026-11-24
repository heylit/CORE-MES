import { useMemo, useState } from 'react';
import { Dugme, Girdi } from '../../../../../ortak/arayuz/index.ts';
import { tlc } from '../../bicim.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { aileler, formlar } from '../turler.ts';
import type { AileSecenegi } from '../../kurallar/index.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { kartStandardi, secenekEtiketleri, standartAdlari, standartEtiketi, standartlaEslesir } from '../../standart-adlari.ts';
import { BagDugmesi, Cip, CipGrubu, MetinAlani, SecenekGrubu, Uyari, type CipTonu } from '../parcalar.tsx';

type Secenek = AileSecenegi;

const TON: Record<string, CipTonu | undefined> = { rec: 'yaygin', warn: 'dikkat', no: 'uyumsuz' };

// Eksen düzeninde (3476) adım bölümlere ayrılır; bir bölüm seçenek anahtarlarını ve gerekirse değer süzgecini taşır.
export interface DurumBolumu { no: string; ad: string; anahtarlar: readonly string[]; degerSuz?: (k: string, v: string) => boolean }
interface DurumAdimiOzellikleri {
  /** Yalnız bu anahtarlar; başlık, arama ve uyarı olmadan (başka adıma taşınan seçenekler). */
  anahtarlar?: readonly string[];
  /** Adım bölümlü çizilir; hiçbir bölüme düşmeyen anahtar "Diğer seçimler" bölümüne gider. */
  bolumler?: readonly DurumBolumu[];
  /** Başka adımda gösterilen anahtarlar bu adımda çizilmez. */
  haric?: readonly string[];
}

// Hammadde 4. adım (prototipte `s3`): seçenekler kalite ve forma göre süzülür; uyumsuz olanlar istenirse görünür.
export function DurumAdimi({ anahtarlar, bolumler, haric = [] }: DurumAdimiOzellikleri = {}) {
  const { taslak: d, b, degistir, yenisiniKur, secim, secimYaz, bildir } = useSihirbaz();
  const standart = kartStandardi(d);
  const [ara, araYaz] = useState('');
  const [stdAcik, stdAcikYaz] = useState(false);
  const adlar = useMemo(() => standartAdlari(b.ortam.malzemeAyari), [b.ortam.malzemeAyari]);
  const f = d.fam ? aileler(b)[d.fam] : undefined;
  if (!f) return <p className="tc-my-bos">Önce bir malzeme ailesi seç.</p>;
  const c = d.fam && d.cls ? f.classes[d.cls] : undefined;
  const grupla = (secenekler: readonly Secenek[]) => {
    const gruplar: { ad: string; ogeler: Secenek[] }[] = [];
    secenekler.forEach((o) => {
      const ad = o.grp || 'Diğer';
      let g = gruplar.find((x) => x.ad === ad);
      if (!g) { g = { ad, ogeler: [] }; gruplar.push(g); }
      g.ogeler.push(o);
    });
    return gruplar;
  };
  const gorunenler = f.opts.filter((o) => (anahtarlar ? anahtarlar.includes(o.k) : !haric.includes(o.k)));
  let gizli = 0;
  const liste = (o: Secenek, suz?: DurumBolumu['degerSuz']): readonly string[] => {
    const l = hamListe(o);
    return suz ? l.filter((x) => suz(o.k, x)) : l;
  };
  const hamListe = (o: Secenek): readonly string[] => {
    if (!o.from) return o.opts ?? [];
    if (o.k === 'mekstd') return K.mekanikStandartlari(c, d.form);
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
  const bilgi = (k: string, degerler: readonly string[], etiket: (x: string) => string) => {
    const v = degerler.filter((x) => S.INFO[x] || K.optStatus(k, x, d, b).m);
    if (!v.length) return null;
    return (
      <div className="tc-my-sbilgi">
        {v.map((x) => {
          const [acik = '', oneri] = (S.INFO[x] ?? '').split('||');
          const st = K.optStatus(k, x, d, b);
          return (
            <p key={x}>
              <b>{etiket(x)}:</b> {acik}
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
  const bir = (o: Secenek, suz?: DurumBolumu['degerSuz']) => {
    if (o.type === 'select' || o.type === 'multi') {
      const tum = o.type === 'select' ? (d.opts[o.k] ? [String(d.opts[o.k])] : []) : ((d.opts[o.k] as string[] | undefined) ?? []);
      const l = liste(o, suz);
      const cur = suz ? tum.filter((x) => suz(o.k, x)) : tum;
      const uyanlar = l.filter((x) => secim.tumSecenekler || cur.includes(x) || K.optStatus(o.k, x, d, b).s !== 'no');
      gizli += l.length - uyanlar.length;
      // Arama değerin kendisinde, ASTM ve EN adında bakar; seçili değer süzülse de görünür kalır.
      // EN / ASTM adları yalnız durum ve işlem listelerindedir; öteki listelerde (yüzey, üretim...) aynı metin başka anlam taşır.
      const esli = o.k === 'durum' || o.k === 'islem' ? adlar : {};
      const etiketler = secenekEtiketleri(l, esli, standart);
      const etiket = (x: string) => etiketler.get(x) ?? standartEtiketi(x, esli, standart);
      // Seçilmeyen tarafın adı çipte yazmaz; fare ve ekran okuyucu için ipucunda durur (aramada neden eşleştiği de buradan okunur).
      const ipucuMetni = (x: string, bilgi?: string) => {
        const diger = standart === 'astm' ? esli[x]?.en : esli[x]?.astm;
        if (diger) return `${standart === 'astm' ? 'EN' : 'ASTM'}: ${diger} · ${bilgi ?? x}`;
        return bilgi ?? (etiket(x) === x ? undefined : x);
      };
      const gorunen = uyanlar.filter((x) => cur.includes(x) || standartlaEslesir(x, esli, ara));
      if (!gorunen.length) return null;
      const mods = gorunen.filter((x) => S.MODS[x]);
      return (
        <SecenekGrubu key={o.k} baslik={baslik(o)} ikon={K.optIcon(d.fam, o, b)} ikonAcik={cur.length > 0} sayac={o.type === 'multi' ? cur.length : undefined}>
          <CipGrubu etiket={o.ad} radyo={o.type === 'select'}>
            {gorunen.map((x) => (
              <Cip
                key={x} radyo={o.type === 'select'} basili={cur.includes(x)} ton={TON[K.optStatus(o.k, x, d, b).s]} ipucu
                baslik={ipucuMetni(x, S.INFO[x]?.split('||')[0])} tikla={() => { sec(o, x); }}
              >{etiket(x)}
              </Cip>
            ))}
          </CipGrubu>
          {mods.length > 0 && <p className="tc-my-kucuk">{mods.join(', ')} seçimi teknik değerleri otomatik günceller.</p>}
          {bilgi(o.k, cur, etiket)}
        </SecenekGrubu>
      );
    }
    // Sayı ve metin alanı aramada yalnız adı uyarsa görünür; yoksa her arama sonucunda kalırdı.
    if (ara.trim() && !o.ad.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr'))) return null;
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
  const grupCiz = (secenekler: readonly Secenek[], suz?: DurumBolumu['degerSuz']) => grupla(secenekler).map((g) => {
    if (g.ad === 'Standartlar' && !stdAcik && !ara.trim() && !anahtarlar) {
      return <StandartOzeti key={g.ad} ogeler={g.ogeler} ac={() => { stdAcikYaz(true); }} />;
    }
    const ic = g.ogeler.map((o) => bir(o, suz)).filter(Boolean);
    if (!ic.length) return null;
    const ik = S.GRP_ICON[g.ad];
    return (
      <section key={g.ad} className="tc-my-sbolum">
        <h4>{ik && <KatalogSimgesi yol={S.OPT_ICON[ik]} />}{g.ad}</h4>
        {ic}
      </section>
    );
  });
  const bolumluCiz = (bl: readonly DurumBolumu[]) => {
    const kapsanan = new Set(bl.flatMap((x) => x.anahtarlar));
    const artan = gorunenler.filter((o) => !kapsanan.has(o.k));
    const tum = artan.length ? [...bl, { no: '', ad: 'Diğer seçimler', anahtarlar: artan.map((o) => o.k) }] : bl;
    return tum.map((x) => {
      const ic = grupCiz(gorunenler.filter((o) => x.anahtarlar.includes(o.k)), x.degerSuz).filter(Boolean);
      if (!ic.length) return null;
      return (
        <section key={x.ad} className="tc-ek-bolum" aria-label={x.ad}>
          <h3 className="tc-ek-bolum-baslik">{x.no && <span className="tc-ek-no">{x.no}</span>}{x.ad}</h3>
          {ic}
        </section>
      );
    });
  };
  const govde = bolumler ? bolumluCiz(bolumler) : grupCiz(gorunenler);
  if (anahtarlar) return <>{govde}</>;
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
      <Girdi
        etiket="Durum ve işlemde ara" type="search" value={ara} onChange={(e) => { araYaz(e.target.value); }}
        placeholder="Ad, ASTM ya da EN adı (ör. H1025, P1070)" autoComplete="off"
      />
      {ara.trim() !== '' && !govde.some(Boolean) && <p className="tc-my-bos">Aramaya uyan seçenek yok.</p>}
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

// Kimyasal ve mekanik standart kendiliğinden seçilir; kutu seçimi özetler, "Değiştir" iki listeyi açar.
function StandartOzeti({ ogeler, ac }: { ogeler: readonly Secenek[]; ac: () => void }) {
  const { taslak: d, b } = useSihirbaz();
  const ik = S.GRP_ICON['Standartlar'];
  const durumStd = d.cls ? K.DURUM_ADI_STANDARDI[d.cls] : undefined;
  const durum = typeof d.opts['durum'] === 'string' ? d.opts['durum'] : '';
  const sorun = (k: string) => {
    const v = d.opts[k];
    return typeof v === 'string' && v ? K.optStatus(k, v, d, b) : null;
  };
  return (
    <section className="tc-my-sbolum">
      <h4>{ik && <KatalogSimgesi yol={S.OPT_ICON[ik]} />}Standartlar</h4>
      <div className="tc-my-std-ozet">
        <dl>
          {ogeler.map((o) => {
            const v = d.opts[o.k];
            const st = sorun(o.k);
            return (
              <div key={o.k}>
                <dt>{o.ad}</dt>
                <dd>
                  <b className="tc-my-std-kod">{typeof v === 'string' && v ? v : '—'}</b>
                  {st?.s === 'no' && <span className="tc-my-hata">Uyumsuz: {st.m}</span>}
                </dd>
              </div>
            );
          })}
          {durumStd && durum && (
            <div>
              <dt>Durum adı</dt>
              <dd><b className="tc-my-std-kod">{durumStd} · {durum}</b></dd>
            </div>
          )}
        </dl>
        <BagDugmesi tikla={ac}>Değiştir</BagDugmesi>
      </div>
      <p className="tc-my-kucuk">Sınıf, kalite ve forma göre seçildi; form değişince elle seçmediğin standart yenisiyle değişir.</p>
    </section>
  );
}

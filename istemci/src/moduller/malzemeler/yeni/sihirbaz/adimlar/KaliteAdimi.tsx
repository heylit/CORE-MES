import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { BagDugmesi, Cip, CipGrubu, Kutu, MetinAlani, Alanlar, Yardim } from '../parcalar.tsx';
import { aileler, girdiler } from '../turler.ts';
import type { Aile, Kalite, Sinif } from '../../kurallar/index.ts';
import { FavoriCipleri, SonKullanilanCipleri, yakinKaliteler } from './Baslangic.tsx';


function Esdegerler({ eq }: { eq: Record<string, string> | undefined }) {
  const e = Object.entries(eq ?? {});
  if (!e.length) return null;
  return <span className="tc-my-esler">{e.map(([k, v]) => <span key={k} className="tc-my-es"><i>{k}</i>{v}</span>)}</span>;
}

function KaliteSatiri({ fam, cls, g, nerede }: { fam: string; cls: string; g: Kalite; nerede: boolean }) {
  const { taslak: d, b, kaliteSec } = useSihirbaz();
  const f = aileler(b)[fam];
  const c = f?.classes[cls];
  if (!f || !c) return null;
  return (
    <button type="button" className="tc-my-kalite" aria-pressed={d.fam === fam && d.grade === g.kod} onClick={() => { kaliteSec(fam, cls, g.kod); }}>
      <span className="tc-my-kalite-ana">
        <b>{g.ad}</b>
        {nerede && <span className="tc-my-nerede" data-aile={fam}>{f.ad} / {c.ad}</span>}
        <Esdegerler eq={g.eq} />
      </span>
      <span className="tc-my-kalite-std">{g.std || c.std || ''}</span>
      <span className="tc-my-kalite-deger">{K.keyFigure(d, g, fam, b)}</span>
    </button>
  );
}

function OzelSatir() {
  const { taslak: d, b, kaliteSec } = useSihirbaz();
  return (
    <button type="button" className="tc-my-kalite tc-my-kalite-ozel" aria-pressed={d.grade === '__ozel'} onClick={() => { kaliteSec(d.fam ?? '', null, '__ozel'); }}>
      <b>+ Özel kalite tanımla</b>
      <span className="tc-my-kalite-std">Listede olmayan bir kalite, ticari ad ya da kendi formülün</span>
    </button>
  );
}

// Prototipte `gradeListHTML`: arama varken bütün ailelerde ad, kod, norm, sınıf ve eşdeğerlerde arar.
function KaliteListesi() {
  const { taslak: d, b, secim } = useSihirbaz();
  const q = K.normQ(secim.kaliteArama, b);
  if (q) {
    const bulunan: { fam: string; cls: string; g: Kalite }[] = [];
    for (const [fk, f] of girdiler<Aile>(b.t.FAMS)) {
      for (const [ck, c] of girdiler<Sinif>(f.classes)) {
        for (const g of c.grades) {
          if (g.gizli || c.gizli || f.gizli) continue;
          const saman = K.normQ([g.ad, g.kod, g.std, c.ad, ...Object.values(g.eq ?? {})].join(' '), b);
          if (saman.includes(q)) bulunan.push({ fam: fk, cls: ck, g });
        }
      }
    }
    if (!bulunan.length) {
      return (
        <>
          <p className="tc-my-bos">“{secim.kaliteArama}” için kalite bulunamadı. Aşağıdan özel kalite olarak tanımlayabilirsin.</p>
          <div className="tc-my-kaliteler"><OzelSatir /></div>
        </>
      );
    }
    return (
      <>
        <p className="tc-my-kucuk">{bulunan.length} sonuç</p>
        <div className="tc-my-kaliteler">{bulunan.map((x) => <KaliteSatiri key={`${x.fam}|${x.cls}|${x.g.kod}`} fam={x.fam} cls={x.cls} g={x.g} nerede />)}</div>
      </>
    );
  }
  const c = d.fam && d.cls ? aileler(b)[d.fam]?.classes[d.cls] : undefined;
  if (!c || !d.fam || !d.cls) return null;
  const fam = d.fam;
  const cls = d.cls;
  return (
    <div className="tc-my-kaliteler">
      {c.grades.filter((g) => !g.gizli).map((g) => <KaliteSatiri key={g.kod} fam={fam} cls={cls} g={g} nerede={false} />)}
      <OzelSatir />
    </div>
  );
}

// Prototipte `stdBoxHTML`: kalitenin uygun olduğu standartlardan birden çoğu seçilebilir (çift sertifikalı tedarik).
function StandartKutusu() {
  const { taslak: d, b, degistir } = useSihirbaz();
  const g = K.grade(d, b);
  if (!g || !g.stds || g.stds.length < 1 || d.grade === '__ozel') return null;
  const sec = d.stds ?? [];
  const degis = (v: string) => {
    degistir((t) => {
      const a = new Set(t.stds ?? []);
      if (a.has(v)) a.delete(v); else a.add(v);
      t.stds = [...a];
    });
  };
  return (
    <Kutu baslik="Standart">
      <Yardim>
        Malzemenin uygun olacağı standartları seç. Birden fazlasını seçmek, her iki standardı da karşılayan çift sertifikalı tedarik anlamına gelir (ör. EN 10083-3 ve ASTM A29).
      </Yardim>
      <CipGrubu etiket="Standart">
        {g.stds.map((x) => <Cip key={x} basili={sec.includes(x)} tikla={() => { degis(x); }}>{x}</Cip>)}
      </CipGrubu>
      <Yardim>
        Katalog adında görünecek: <b>{K.gradeLabel(d, b)}</b>
        {sec.length ? '' : ` (standart seçilmediyse ana norm kullanılır: ${g.std || '—'})`}
      </Yardim>
    </Kutu>
  );
}

interface Muadil { sinif: string; kod: string; ad: string; tip: string; not?: string }

// Prototipte `muadilBoxHTML`.
function MuadilKutusu() {
  const { taslak: d, b, kaliteSec, bildir } = useSihirbaz();
  const l = K.muadilKaliteler(d, b);
  if (!l.length) return null;
  return (
    <Kutu baslik="Muadil kaliteler" sinif="tc-my-muadil">
      <Yardim>
        Bu kalite bulunamazsa yerine kullanılabilecek kaliteler. Tam muadil doğrudan, üst muadil genelde sorunsuz (çoğu zaman daha pahalı), şartlı muadil uygulamaya bağlı olarak kullanılabilir.
      </Yardim>
      <ul className="tc-my-muadil-liste">
        {l.map((m) => (
          <li key={`${m.sinif}|${m.kod}`}>
            <span className={`tc-my-mtip tc-my-mtip-${m.tip}`}>{S.MTIP[m.tip]?.ad ?? m.tip}</span>
            <b>{m.ad}</b>
            <small>{m.not}</small>
            <BagDugmesi tikla={() => { kaliteSec(d.fam ?? '', m.sinif || null, m.kod); bildir('Kalite değiştirildi.'); }}>Bu kaliteyi seç</BagDugmesi>
          </li>
        ))}
      </ul>
    </Kutu>
  );
}

// Hammadde 2. adım (prototipte `s1`).
export function KaliteAdimi() {
  const { taslak: d, b, secim, secimYaz, degistir, sonKullanilanlar } = useSihirbaz();
  const f = d.fam ? aileler(b)[d.fam] : undefined;
  if (!f) return <p className="tc-my-bos">Önce bir malzeme ailesi seç.</p>;
  const siniflar = girdiler<Sinif>(f.classes).filter(([k, c]) => !c.gizli || d.cls === k);
  const yakinlar = yakinKaliteler(sonKullanilanlar, b);
  const ara = secim.kaliteArama;
  const sinifSec = (k: string) => {
    secimYaz({ kaliteArama: '' });
    degistir((t) => {
      t.cls = k;
      if (t.grade !== '__ozel' && K.clsOfGrade(t.fam, t.grade, b) !== k) {
        t.grade = null;
        t.ov = {};
      }
    });
  };
  return (
    <>
      <FavoriSatiri />
      {yakinlar.length > 0 && (
        <div className="tc-my-satir"><span className="tc-my-etiket">Son kullanılanlar</span><SonKullanilanCipleri liste={yakinlar} ilerle={false} /></div>
      )}
      <MetinAlani
        etiket="Kalite ara (tüm ailelerde)" tip="search" deger={ara} yaz={(v) => { secimYaz({ kaliteArama: String(v) }); }} genis
        ipucu="Ad, W.Nr, AISI, UNS, JIS veya ticari ad: ör. SUS304, A36, 1.2379, Delrin"
      />
      {!ara.trim() && siniflar.length > 1 && (
        <CipGrubu etiket="Sınıf">
          {siniflar.map(([k, c]) => (
            <Cip key={k} basili={d.cls === k} tikla={() => { sinifSec(k); }}>
              {c.ad} <span className="tc-my-soluk">{c.grades.filter((g) => !g.gizli).length || ''}</span>
            </Cip>
          ))}
        </CipGrubu>
      )}
      <KaliteListesi />
      {d.grade && d.grade !== '__ozel' && !ara && <><StandartKutusu /><MuadilKutusu /></>}
      {d.grade === '__ozel' && <OzelKalite />}
    </>
  );
}

function FavoriSatiri() {
  const { ortam } = useSihirbaz();
  if (!(ortam.malzemeAyari.favoriler ?? []).length) return null;
  return <div className="tc-my-satir"><span className="tc-my-etiket">Sık kullanılanlar</span><FavoriCipleri /></div>;
}

// "Claude ile doldur" taşınmaz (envanter 9): TMI içinde çalışmıyor; teknik değerler 5. adımda girilir.
function OzelKalite() {
  const { taslak: d, degistir } = useSihirbaz();
  const yaz = (k: 'ad' | 'kod' | 'std' | 'eq') => (v: string | number) => { degistir((t) => { t.custom = { ...t.custom, [k]: String(v) }; }); };
  return (
    <Kutu baslik="Özel kalite">
      <Alanlar>
        <MetinAlani etiket="Kalite adı" deger={d.custom.ad} yaz={yaz('ad')} ipucu="ör. Hardox 450, PA6 + MoS₂" kimlik="tc-my-ozel-ad" />
        <MetinAlani etiket="Kısa kod" deger={d.custom.kod} yaz={yaz('kod')} ipucu="ör. HX450" />
        <MetinAlani etiket="Standart / norm" deger={d.custom.std} yaz={yaz('std')} ipucu="ör. EN 10029" />
        <MetinAlani etiket="Eşdeğerler / diğer adlar" deger={d.custom.eq} yaz={yaz('eq')} ipucu="ör. W.Nr 1.8714; ASTM ≈ A514" genis />
      </Alanlar>
      <Yardim>Teknik değerleri 5. adımda gireceksin.</Yardim>
    </Kutu>
  );
}

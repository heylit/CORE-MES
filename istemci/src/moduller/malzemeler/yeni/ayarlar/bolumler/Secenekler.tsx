// Hammaddenin seçim listeleri: durum ve işlem seçenekleri, sınıf varsayılanları, tolerans normları.
import { Secim } from '../../../../../ortak/arayuz/index.ts';
import { gecerliAileSinif, type Duzen } from '../duzen.ts';
import { FORMS, type Aile, type Deger, type AileSecenegi } from '../kaynak.ts';
import { sinifVarsayilanlari, varsayilanYaz } from '../islemler.ts';
import { ListeDuzenleyici } from '../ListeDuzenleyici.tsx';
import { BolumBasligi, Secici } from '../parcalar.tsx';
import { aileSecenekleri } from './Kaliteler.tsx';

export function DurumSecenekleri({ d }: { d: Duzen }) {
  const { aile } = gecerliAileSinif(d);
  const F = d.t.FAMS[aile] as Aile;
  const gruplar = new Map<string, AileSecenegi[]>();
  F.opts.forEach((o) => { const g = o.grp ?? 'Durum'; gruplar.set(g, [...(gruplar.get(g) ?? []), o]); });
  return (
    <>
      <BolumBasligi
        baslik="Durum ve işlem seçenekleri"
        aciklama={'Hammaddenin "Durum ve işlem" adımındaki listeler. Aileyi seç, listeyi aç; kullanmadığın değerleri kapat, yenilerini üstteki kutudan ekle. Sınıfa bağlı listelere (ör. teslim durumu) eklenen değer ailenin tüm sınıflarında görünür.'}
      />
      <Secici<string>
        satirlar={[{ anahtar: 'aile', baslik: 'Aile', secenekler: aileSecenekleri(d, false), secili: aile, sec: (k) => d.sec({ aile: k, sinif: '' }) }]}
        ozet={<>Seçili aile: <b data-aile={aile}>{F.ad}</b></>}
      />
      {[...gruplar].map(([g, os]) => (
        <section key={g} className="tc-ma-grup">
          <h4>{g}</h4>
          {os.map((o) => <ListeDuzenleyici key={`${aile}|${o.k}`} d={d} id={`opt|${aile}|${o.k}`} baslik={o.ad} />)}
        </section>
      ))}
    </>
  );
}

export function SinifVarsayilanlari({ d }: { d: Duzen }) {
  const { aile, sinif } = gecerliAileSinif(d);
  const F = d.t.FAMS[aile] as Aile;
  const c = F.classes[sinif];
  const secili = sinifVarsayilanlari(d.v, aile, sinif);
  const dolu = Object.entries(d.v.varsayilanlar).filter(([, x]) => Object.keys(x?.opts ?? {}).length);
  const alanlar = c ? F.opts.filter((o) => o.type === 'select').map((o) => {
    const degerler = (o.from ? (c[o.from] as Deger[] | undefined) ?? [] : o.opts ?? []).map(String);
    return { o, degerler };
  }).filter((x) => x.degerler.length) : [];
  return (
    <>
      <BolumBasligi
        baslik="Sınıf varsayılanları"
        aciklama={'Bu sınıftan yeni kart açılınca (sihirbaz, hızlı arama, Excel) boş seçimlere bu değerler yazılır; kullanıcı istediğinde değiştirir. Örneğin paslanmaz levhada yüzey "2B", ambalaj "folyolu".'}
      />
      <Secici<string>
        satirlar={[
          { anahtar: 'aile', baslik: 'Aile', secenekler: aileSecenekleri(d, false), secili: aile, sec: (k) => d.sec({ aile: k, sinif: '' }) },
          {
            anahtar: 'sinif', baslik: 'Sınıf', secili: sinif, sec: (k) => d.sec({ sinif: k }),
            secenekler: Object.entries(F.classes).filter(([, x]) => !x.gizli).map(([k, x]) => {
              const n = Object.keys(sinifVarsayilanlari(d.v, aile, k)).length;
              return { deger: k, baslik: x.ad, alt: n ? String(n) : undefined };
            }),
          },
        ]}
        ozet={c && <><b data-aile={aile}>{F.ad}</b> › <b>{c.ad}</b></>}
      />
      {c && (
        <div className="tc-ma-alanlar">
          {alanlar.length ? alanlar.map(({ o, degerler }) => (
            <Secim
              key={o.k} etiket={o.ad} bosSecenek="— varsayılan yok —" disabled={d.ro} value={secili[o.k] ?? ''}
              onChange={(e) => d.degis(varsayilanYaz(d.v, aile, sinif, o.k, e.target.value))}
              secenekler={degerler.map((x) => ({ deger: x, baslik: x }))}
            />
          )) : <p className="tc-ma-yardim">Bu sınıfta seçim listesi yok.</p>}
        </div>
      )}
      {dolu.length > 0 && (
        <p className="tc-ma-yardim">
          Varsayılanı olan sınıflar: {dolu.map(([k]) => { const [f = '', cc = ''] = k.split('|'); return d.t.FAMS[f]?.classes[cc]?.ad ?? ''; }).filter(Boolean).join(', ')}
        </p>
      )}
    </>
  );
}

export function ToleransNormlari({ d }: { d: Duzen }) {
  const { aile } = gecerliAileSinif(d);
  const formlar = Object.keys(d.taban.TOLP);
  const form = formlar.includes(d.secim.form) ? d.secim.form : formlar[0] ?? '';
  const formAdi = FORMS[form]?.ad ?? form;
  const F = d.t.FAMS[aile] as Aile;
  return (
    <>
      <BolumBasligi baslik="Tolerans normları" aciklama="Form ve ölçü adımındaki tolerans hızlı seçimleri; form ve aileye göre ayrı listelerdir." />
      <Secici<string>
        satirlar={[
          { anahtar: 'form', baslik: 'Form', secili: form, sec: (k) => d.sec({ form: k }), secenekler: formlar.map((k) => ({ deger: k, baslik: FORMS[k]?.ad ?? k })) },
          { anahtar: 'aile', baslik: 'Aile', secili: aile, sec: (k) => d.sec({ aile: k, sinif: '' }), secenekler: aileSecenekleri(d, false) },
        ]}
        ozet={<><b>{formAdi}</b> › <b>{F.ad}</b></>}
      />
      <ListeDuzenleyici key={`${form}|${aile}`} d={d} id={`tol|${form}|${aile}`} baslik={`${formAdi} · ${F.ad}`} hepAcik />
    </>
  );
}

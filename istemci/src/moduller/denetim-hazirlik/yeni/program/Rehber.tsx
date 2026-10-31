import { Dugme, Kart } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { prototipSimgesi } from '../gorunumler.ts';
import { aktifSorular, dokumanIstatistigi, puanHesapla } from '../kurallar/puan.ts';
import { useNavigate } from 'react-router-dom';
import { Cark } from './grafikler.tsx';
import { Halka, IpucuKutusu, ProgramBandi, PSimge, useProgramEkrani } from './ortak.tsx';
import { useIsaret } from './paylasilan.tsx';
import { OLCU_ALETI_YOLU } from '../veri.ts';
import { AS9100_GUN_NOTU, BULGU_ORNEGI, DENETIM_GUNU, EYDEP_GUNU } from './rehber-metni.ts';


// Zaman çizelgesinde "Bugün" işareti (prototip todayMark): iki olay arasındaki yer, olay hücresi içinde onda bir adımla.
function bugunKonumu(ds: readonly number[], t: number): { i: number; k: number } | null {
  const n = ds.length;
  const ilk = ds[0], son = ds[n - 1];
  if (ilk === undefined || son === undefined || t < ilk || t > son) return null;
  for (let i = 0; i < n - 1; i++) {
    const a = ds[i] ?? 0, b = ds[i + 1] ?? 0;
    if (t <= b) return { i, k: Math.round(((t - a) / Math.max(1, b - a)) * 10) };
  }
  return null;
}

// Denetim rehberi (prototip vRehber + rehberExtra): aşamalar, madde çarkı, bulgu seviyeleri, zorunlu dokümanlar, zaman çizelgesi, denetim günü.
export function Rehber() {
  const d = useDenetim();
  const gezin = useNavigate();
  const [e, ekranYaz] = useProgramEkrani();
  const isaret = useIsaret();
  const kb = d.kb;
  const pg = kb.pg;
  const w = kb.calisma;
  const ey = d.program === 'eydep';
  const r = puanHesapla(aktifSorular(pg, w.def), w.ans, pg);
  const asama = pg.STAGES[e.stage] ?? pg.STAGES[0];
  const maddeKodu = pg.CL[e.clause] ? e.clause : pg.defClause;
  const madde = pg.CL[maddeKodu];
  const ds = dokumanIstatistigi(kb);
  const ara = e.docq.toLocaleLowerCase('tr');
  const dokumanlar = pg.DOCS.filter((x) => !ara || `${x[1]} ${x[2]}`.toLocaleLowerCase('tr').includes(ara));
  const I = pg.info;
  const olaylar = I.ev ?? [];
  const bugunIsareti = bugunKonumu(olaylar.map((x) => Date.parse(`${x[3]}T00:00:00`)), Date.now());
  const gun = ey ? EYDEP_GUNU : DENETIM_GUNU;

  const maddeSorulari = () => {
    const i = aktifSorular(pg, w.def).findIndex((x) => x.g === maddeKodu);
    ekranYaz((p) => { p.mode = 'full'; if (i >= 0) p.cur = i; });
    d.git('sim');
  };

  return (
    <div className="tc-dhp">
      <ProgramBandi r={r} />
      <p className="tc-dhy-ton-soluk">{pg.rehberSub}</p>
      {asama && (
        <Kart simge={prototipSimgesi('award')} baslik={pg.stageTitle} sag={<small className="tc-dhy-ton-soluk">Bir aşamaya tıklayın</small>}>
          <div className="tc-dhp-yolculuk" role="group" aria-label={pg.stageTitle}>
            {pg.STAGES.map((s, i) => (
              <button key={s.n} type="button" aria-pressed={s === asama} onClick={() => { ekranYaz((p) => { p.stage = i; }); }}>
                <PSimge ad={s.ic} /><b>{s.n}</b><small>{s.w}</small>
              </button>
            ))}
          </div>
          <div className="tc-dhp-iki">
            <div>
              <span className="tc-dhp-ust-etiket">{asama.w}</span>
              <h3>{asama.n}</h3>
              <p>{asama.d}</p>
              <IpucuKutusu simge="bulb">{asama.t}</IpucuKutusu>
            </div>
            <div>
              <span className="tc-dhp-ust-etiket">{ey ? 'Heyetin odağı' : 'Denetçinin odağı'}</span>
              <ul className="tc-dhp-madde-liste">{asama.f.map((x) => <li key={x}><span className="tc-dhy-ton-iyi"><PSimge ad="check" /></span>{x}</li>)}</ul>
            </div>
          </div>
        </Kart>
      )}

      <Kart simge={prototipSimgesi('repeat')} baslik={pg.wheelTitle} sag={<ul className="tc-dhp-lejant">{pg.PHASES.map((p) => <li key={p.n}><i className={`tc-dhp-lejant-renk tc-dhp-cizim-${p.ton}`} />{p.n}</li>)}</ul>}>
        <div className="tc-dhp-cark-alan">
          <Cark pg={pg} secili={maddeKodu} sec={(k) => { ekranYaz((p) => { p.clause = k; }); }} />
          {madde && (
            <div className="tc-dhp-cark-detay">
              <span className="tc-dhp-ust-etiket">{`${pg.unit} ${ey ? madde.s : maddeKodu} · ${pg.PHASES[madde.ph]?.n ?? ''}`}</span>
              <h3><PSimge ad={madde.ic} /> {madde.n}</h3>
              <div className="tc-dhp-iki">
                <div>
                  <span className="tc-dhp-ust-etiket">{ey ? 'Heyet neye bakar' : 'Denetçi neye bakar'}</span>
                  <ul className="tc-dhp-madde-liste">{madde.looks.map((x) => <li key={x}><span className="tc-dhy-ton-bilgi"><PSimge ad="eye" /></span>{x}</li>)}</ul>
                </div>
                <div>
                  <span className="tc-dhp-ust-etiket">{ey ? 'Sık görülen zayıflıklar' : 'Sık görülen bulgular'}</span>
                  <ul className="tc-dhp-madde-liste">{madde.pit.map((x) => <li key={x}><span className="tc-dhy-ton-uyari"><PSimge ad="alert" /></span>{x}</li>)}</ul>
                </div>
              </div>
              <Dugme simge="clipboard-check" onClick={maddeSorulari}>{`Bu ${pg.unitGen} sorularını çöz`}</Dugme>
            </div>
          )}
        </div>
      </Kart>

      <section className="tc-dhp-bolum" aria-label={pg.sevTitle}>
        <h2 className="tc-dhp-bolum-baslik">{pg.sevTitle}</h2>
        <div className="tc-dhp-seviyeler">
          {pg.sev.map((s) => (
            <div key={s.k} className={`tc-dhp-seviye tc-dhp-seviye-${s.k}`}>
              <Kart baslik={s.n} sag={s.k === 'good' ? undefined : <span className={`tc-dhp-olcer tc-dhp-olcer-${s.k}`} aria-hidden="true"><i /><i /><i /></span>}>
                <p className="tc-dhy-ton-soluk">{s.d}</p>
                <span className="tc-dhp-ust-etiket">{ey ? 'Anlamı' : 'Örnekler'}</span>
                <ul className="tc-dhp-madde-liste">{s.ex.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="tc-dhp-sonuc">{s.cons}</p>
              </Kart>
            </div>
          ))}
        </div>
      </section>

      <div id="tc-dhp-dokumanlar">
        <Kart
          simge={prototipSimgesi('file')} baslik={pg.docsTitle}
          sag={(
            <>
              <input type="search" className="tc-dhp-ara" aria-label="Doküman ara" placeholder={ey ? 'Ara: finans, makine…' : 'Ara: kalibrasyon, 8.7…'} value={e.docq}
                onChange={(ev) => { const v = ev.target.value; ekranYaz((p) => { p.docq = v; }); }} />
              <Halka yuzde={ds.n ? (ds.k / ds.n) * 100 : 0} ton="iyi" boyut="k" />
            </>
          )}
        >
          <p className="tc-dhy-ton-soluk">{pg.docsDesc}</p>
          {dokumanlar.length ? (
            <ul className="tc-dhp-dokumanlar">
              {dokumanlar.map(([id, c, ad, tur]) => (
                <li key={id} className={w.docs[id] ? 'tc-dhp-gorev-tamam' : undefined}>
                  <label>
                    <input type="checkbox" checked={!!w.docs[id]} disabled={!d.yetki.yazabilir} onChange={(ev) => { isaret('docs', id, ev.target.checked); }} />
                    <span className="tc-dhp-madde">{c}</span>
                    <span>{ad}</span>
                    <small className="tc-dhy-ton-soluk">{tur}</small>
                  </label>
                </li>
              ))}
            </ul>
          ) : <p className="tc-dhy-ton-soluk">Eşleşen doküman yok.</p>}
        </Kart>
      </div>

      <Kart simge={prototipSimgesi('info')} baslik={I.t}>
        {olaylar.length > 0 && (
          <ol className="tc-dhp-zaman">
            {olaylar.map((x, i) => (
              <li key={x[3]} className={x[2] ? 'tc-dhp-zaman-onemli' : undefined}>
                {bugunIsareti?.i === i && <span className={`tc-dhp-bugun tc-dhp-bugun-${String(bugunIsareti.k)}`}>Bugün</span>}
                <b>{x[0]}</b><span>{x[1]}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="tc-dhy-ton-soluk">{I.p}</p>
      </Kart>

      <Kart simge={prototipSimgesi('clock')} baslik={ey ? 'Bir EYDEP değerlendirme günü nasıl geçer?' : 'Bir denetim günü nasıl geçer?'} sag={<small className="tc-dhy-ton-soluk">Tipik bir gün; saatler örnektir</small>}>
        <ol className="tc-dhp-gun">
          {gun.map(([saat, baslik, metin, ipucu]) => (
            <li key={saat}>
              <span className="tc-dhp-gun-saat">{saat}</span>
              <div><b>{baslik}</b><p>{metin}</p><IpucuKutusu simge="bulb">{ipucu}</IpucuKutusu></div>
            </li>
          ))}
        </ol>
        {d.program === 'as9100' && <p className="tc-dhy-ton-soluk">{AS9100_GUN_NOTU}</p>}
      </Kart>

      <Kart simge={prototipSimgesi('alert')} baslik="Bulgu nasıl yazılır, nasıl cevaplanır? Örnekle">
        <p className="tc-dhy-ton-soluk">Denetçi bir bulguyu üç parçayla yazar: şart, kanıt ve uygunsuzluk ifadesi. Sizden beklenen yalnızca hatayı düzeltmek değil, neden olduğunu bulup tekrarını önlemektir.</p>
        <div className="tc-dhp-bulgu">
          <div className="tc-dhp-balon-kim"><b className="tc-dhy-ton-uyari">{BULGU_ORNEGI.seviye}</b><span>{BULGU_ORNEGI.madde}</span></div>
          <dl className="tc-dhp-satirlar">{BULGU_ORNEGI.satirlar.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <small className="tc-dhy-ton-soluk">{BULGU_ORNEGI.neden}</small>
        </div>
        <div className="tc-dhp-iki">
          <div className="tc-dhp-cevap tc-dhp-cevap-zayif">
            <span className="tc-dhp-ust-etiket tc-dhy-ton-kotu"><PSimge ad="x" /> Zayıf cevap</span>
            <q>{BULGU_ORNEGI.zayif.replace(/[“”]/g, '')}</q>
            <ul className="tc-dhp-madde-liste">{BULGU_ORNEGI.zayifNeden.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="tc-dhp-cevap tc-dhp-cevap-guclu">
            <span className="tc-dhp-ust-etiket tc-dhy-ton-iyi"><PSimge ad="check" /> Güçlü cevap</span>
            <ol>{BULGU_ORNEGI.guclu.map(([k, v]) => <li key={k}><b>{`${k}:`}</b>{` ${v}`}</li>)}</ol>
          </div>
        </div>
        <p className="tc-dhy-ton-soluk">{BULGU_ORNEGI.son}</p>
        <div className="tc-dhp-dugmeler">
          <Dugme simge="ruler" onClick={() => { void gezin(OLCU_ALETI_YOLU); }}>Kalibrasyon sayfası</Dugme>
          <Dugme simge="file" onClick={() => { d.git('kys', { kys: 'uret', dokuman: 'f_dof' }); }}>Uygunsuzluk ve DÖF formu</Dugme>
        </div>
      </Kart>
    </div>
  );
}

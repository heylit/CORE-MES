import { useState } from 'react';
import { Dugme, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { prototipSimgesi } from '../gorunumler.ts';
import { htmlKacis, yazdir } from '../disa-aktar.ts';
import { CRIT } from '../icerik/iso9001.ts';
import { seviyeAdi } from '../icerik/programlar.ts';
import { siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import { aktifSorular, gecerliCevaplar, grupYuzdesi, kapananlar, puanHesapla } from '../kurallar/puan.ts';
import { tarihMetni } from '../tarih.ts';
import type { Seviye } from '../tipler.ts';
import { kararTonu, puanTonu, raporMetni } from './hesaplar.ts';
import { Dagilim, HazirlikKadrani, Radar } from './grafikler.tsx';
import { Halka, OrnekBandi, ProgramBandi, PSimge, rozetTonu, tonSinifi, useProgramEkrani } from './ortak.tsx';
import { useIsaret, useSoruyaGit } from './paylasilan.tsx';

type Suzgec = 'risk' | 'all' | Seviye;
const SEVIYE_TONU = { major: 'kotu', minor: 'uyari', obs: 'bilgi' } as const;

export function Aksiyonlar() {
  const d = useDenetim();
  const [e, ekranYaz] = useProgramEkrani();
  const soruyaGit = useSoruyaGit();
  const isaret = useIsaret();
  const [yedekMetin, yedekYaz] = useState<string | null>(null);
  const kb = d.kb;
  const pg = kb.pg;
  const w = kb.calisma;
  const yaz = d.yetki.yazabilir;
  const qs = aktifSorular(pg, w.def);
  const A = gecerliCevaplar(kb);
  const dm = kapananlar(kb);
  const r = puanHesapla(qs, A, pg);
  const P = d.profil.profile;
  const na = siradakiDenetim(d.profil, d.program);
  const lv = (l: string) => seviyeAdi(pg, l);
  const perfDugmesi = <Dugme simge="layers" onClick={() => { d.git('perf'); }}>Tüm programların performansı</Dugme>;

  if (r.pct == null) {
    return (
      <div className="tc-dhp">
        <ProgramBandi r={r} ek={perfDugmesi} />
        <Kart>
          <div className="tc-dhp-bos-durum">
          <span className="tc-dhp-bos-simge"><PSimge ad="chart" /></span>
          <h2>Rapor, simülasyonu cevapladıkça oluşur</h2>
          <p>Genel puan, madde bazında radar ve ısı haritası, majör ve minör bulgu riskleri ve her açık için denetimden önce yapılacak aksiyon listesi.</p>
          <div className="tc-dhp-dugmeler tc-dhp-orta">
            <Dugme tur="birincil" simge="play" onClick={() => { d.git('sim'); }}>Simülasyona başla</Dugme>
            {yaz && <Dugme simge="eye" onClick={() => { d.degistir(null, (t) => { t.pw[d.program].example = true; t.pw[d.program].exDone = {}; }); }}>Örnek bir raporu göster</Dugme>}
          </div>
          </div>
        </Kart>
      </div>
    );
  }

  const v = r.verdict;
  const meta = [pg.n, P.firma, P.tesis, na?.type, na ? tarihMetni(na.date) : ''].filter(Boolean);
  const metin = () => raporMetni(kb, r);
  const kopyala = () => {
    const t = metin();
    navigator.clipboard.writeText(t).then(() => { yedekYaz(null); d.bildir('Rapor panoya kopyalandı'); }, () => { yedekYaz(t); });
  };
  const yazdirRapor = () => { yazdir(`<pre class="tc-dhy-yazdirma-metin">${htmlKacis(metin())}</pre>`, `${pg.s} hazırlık raporu`); };
  const f = (e.filter || 'risk') as Suzgec;
  const liste = r.risks.filter((x) => f === 'all' || (f === 'risk' ? x.lvl !== 'obs' : x.lvl === f));
  const kapanan = r.risks.filter((x) => dm[x.q.id]).length;
  const suzgecler: [Suzgec, string, number][] = [['risk', 'Öncelikli', r.major + r.minor], ['all', 'Tümü', r.risks.length], ['major', lv('major'), r.major], ['minor', lv('minor'), r.minor], ['obs', lv('obs'), r.obs]];

  return (
    <div className="tc-dhp">
      <ProgramBandi r={r} ek={perfDugmesi} />
      <OrnekBandi />
      <Kart>
        <div className="tc-dhp-rapor-ust">
          <HazirlikKadrani pct={r.pct} karar={v?.k} pg={pg} />
          <div className="tc-dhp-hero-metin">
            {v && <Rozet ton={rozetTonu(kararTonu(v.k))}>{v.t}</Rozet>}
            {meta.length > 0 && <small className="tc-dhy-ton-soluk">{meta.join(' · ')}</small>}
            {v && <h2 className="tc-dhp-hero-baslik">{pg.headline(r, v)}</h2>}
            {v && <p>{v.d}</p>}
            {pg.note && <small className="tc-dhy-ton-soluk">{pg.note}</small>}
            {pg.hasDef && w.def && r.defPct != null && <small className="tc-dhy-ton-soluk">{`AS9100 / AQAP 2110 ek şartları: %${String(r.defPct)} (ISO 9001 puanına katılmadı)`}</small>}
            {r.answered < r.total && <small className="tc-dhy-ton-soluk">{`${String(r.total - r.answered)} soru cevaplanmadı; puan cevaplananlara göre hesaplandı.`}</small>}
            <div className="tc-dhp-dugmeler">
              <Dugme simge="file" onClick={kopyala}>Raporu kopyala</Dugme>
              <Dugme simge="printer" onClick={yazdirRapor}>Yazdır / PDF</Dugme>
              <Dugme simge="clipboard-check" onClick={() => { d.git('sim'); }}>Simülasyona dön</Dugme>
            </div>
          </div>
          <Dagilim r={r} adlar={lv} />
        </div>
      </Kart>
      {yedekMetin !== null && (
        <Kart baslik="Metni seçip kopyalayın">
          <textarea className="tc-dhp-kopya" readOnly value={yedekMetin} aria-label="Rapor metni" onFocus={(ev) => { ev.currentTarget.select(); }} />
        </Kart>
      )}
      <div className="tc-dhp-iki">
        <Kart simge={prototipSimgesi('target')} baslik={`${pg.unit} bazında puan`} sag={<span className="tc-dhp-lejant"><span><i className="tc-dhp-lejant-cizgi" />Puanınız</span><span><i className="tc-dhp-lejant-cizgi tc-dhp-lejant-kesik" />{d.program === 'eydep' ? 'A eşiği (85)' : 'Hedef %85'}</span></span>}>
          <Radar r={r} pg={pg} def={w.def} />
        </Kart>
        <Kart simge={prototipSimgesi('layers')} baslik="Soru ısı haritası" sag={<small className="tc-dhy-ton-soluk">Hücreye tıklayın</small>}>
          <div className="tc-dhp-isi">
            {pg.GORDER.filter((g) => r.groups[g]).map((g) => {
              const p = grupYuzdesi(r.groups[g]);
              return (
                <div key={g} className="tc-dhp-isi-satir">
                  <span className="tc-dhp-isi-ad"><PSimge ad={pg.CL[g]?.ic ?? 'file'} /> {pg.CL[g]?.s ?? g}</span>
                  <span className="tc-dhp-hucreler">
                    {qs.filter((x) => x.g === g).map((x) => {
                      const a = A[x.id];
                      return <button key={x.id} type="button" className={`tc-dhp-isi-hucre${a !== undefined ? ` tc-dhp-p${a}` : ''}`} title={`${x.c} · ${a === undefined ? 'cevaplanmadı' : a === 'na' ? 'N/A' : `puan ${a}`}: ${x.q}`} aria-label={`${x.c}, ${a === undefined ? 'cevaplanmadı' : a === 'na' ? 'N/A' : `puan ${a}`}`} onClick={() => { soruyaGit(x.id); }} />;
                    })}
                  </span>
                  <b className={tonSinifi(puanTonu(p))}>{p == null ? '–' : `%${String(p)}`}</b>
                </div>
              );
            })}
          </div>
          <ul className="tc-dhp-lejant">
            {(['0', '1', '2', '3', 'na'] as const).map((k) => <li key={k}><i className={`tc-dhp-isi-hucre tc-dhp-p${k}`} />{k === 'na' ? 'N/A' : k}</li>)}
            <li><i className="tc-dhp-isi-hucre" />Cevaplanmadı</li>
          </ul>
        </Kart>
      </div>
      <Kart
        simge={prototipSimgesi('flag')} baslik="Aksiyon planı"
        sag={(
          <>
            <div className="tc-dhp-segment" role="group" aria-label="Süzgeç">
              {suzgecler.map(([k, ad, n]) => (
                <button key={k} type="button" aria-pressed={f === k} onClick={() => { ekranYaz((p) => { p.filter = k; }); }}>{k !== 'all' && k !== 'risk' && <i className={`tc-dhp-risk-nokta ${tonSinifi(SEVIYE_TONU[k])}`} aria-hidden="true" />}{`${ad} `}<b>{n}</b></button>
              ))}
            </div>
            <Halka yuzde={r.risks.length ? (kapanan / r.risks.length) * 100 : 0} ton="iyi" boyut="k" />
          </>
        )}
      >
        {liste.length === 0 ? <p className="tc-dhy-ton-soluk">Bu filtrede açık yok.</p> : (
          <ul className="tc-dhp-aksiyonlar">
            {liste.map((x) => {
              const kapali = !!dm[x.q.id];
              const not = w.example ? '' : w.notes[x.q.id];
              return (
                <li key={x.q.id} className={`tc-dhp-aksiyon tc-dhp-aksiyon-${x.lvl}${kapali ? ' tc-dhp-gorev-tamam' : ''}`}>
                  <input type="checkbox" checked={kapali} disabled={!yaz} aria-label={`${x.q.c} kapatıldı`} onChange={(ev) => { isaret('done', x.q.id, ev.target.checked, 'Aksiyon kapatıldı'); }} />
                  <div className="tc-dhp-aksiyon-govde">
                    <div className="tc-dhp-balon-kim">
                      <b className={tonSinifi(SEVIYE_TONU[x.lvl])}>{lv(x.lvl)}</b>
                      <span className="tc-dhp-madde">{x.q.c}</span>
                      {x.q.g === 'S' && <span className="tc-dhp-madde">AS9100 / AQAP</span>}
                      <small className="tc-dhy-ton-soluk">{`Puan ${String(x.v)} · ${CRIT[x.q.w] ?? ''}`}</small>
                    </div>
                    <p>{x.q.q}</p>
                    <p className="tc-dhp-ipucu"><PSimge ad="bulb" /><span>{x.q.fix}</span></p>
                    {not && <small className="tc-dhy-ton-soluk">{`Not: ${not}`}</small>}
                  </div>
                  <button type="button" className="tc-dhp-baglanti" aria-label="Soruya git" onClick={() => { soruyaGit(x.q.id); }}><PSimge ad="chev" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Kart>
    </div>
  );
}

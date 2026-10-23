import { useMemo } from 'react';
import { Dugme, Girdi, Kadran, Kart, type MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { seviyeAdi } from '../icerik/programlar.ts';
import { denetimTarihiAyarla, siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import { haftalariKur } from '../kurallar/hafta.ts';
import { aktifSorular, dokumanIstatistigi, gecerliCevaplar, hazirlikIstatistigi, kapananlar, puanHesapla } from '../kurallar/puan.ts';
import { ISO_TARIH, haftaAraligi } from '../tarih.ts';
import { siradakiAdimlar } from './hesaplar.ts';
import { Halka, OrnekBandi, ProgramBandi, PSimge } from './ortak.tsx';
import { HaftaMaddesiSatiri, useHizliTur } from './paylasilan.tsx';

const KADRAN: Record<'ok' | 'warn' | 'bad', MakineDurumu> = { ok: 'calisiyor', warn: 'durakli', bad: 'durdu' };

export function GenelBakis() {
  const d = useDenetim();
  const programEkrani = d.ekranDegistir;
  const kb = d.kb;
  const qs = aktifSorular(kb.pg, kb.calisma.def);
  const r = puanHesapla(qs, gecerliCevaplar(kb), kb.pg);
  const ps = hazirlikIstatistigi(kb);
  const ds = dokumanIstatistigi(kb);
  const dm = kapananlar(kb);
  const na = siradakiDenetim(d.profil, d.program);
  const adimlar = useMemo(() => siradakiAdimlar(kb, d.cihazlar, r), [kb, d.cihazlar, r]);
  const plan = useMemo(() => haftalariKur(kb), [kb]);
  const buHafta = plan?.weeks.find((x) => x.cur);
  const hizliTur = useHizliTur();
  const acik = r.risks.filter((x) => !dm[x.q.id]).length;
  const kapali = r.risks.length ? Math.round(((r.risks.length - acik) / r.risks.length) * 100) : 0;
  const v = r.verdict;
  const lv = (l: string) => seviyeAdi(kb.pg, l);

  const tarihGir = (deger: string) => {
    if (!ISO_TARIH.test(deger)) return;
    d.degistir(null, (t) => { denetimTarihiAyarla(t, d.program, deger); });
    programEkrani((e) => { e.pw[d.program].phase = -1; });
  };
  const hazirligaGit = (ph?: number) => {
    if (ph != null) programEkrani((e) => { e.pw[d.program].phase = ph; e.pw[d.program].prepView = 'phase'; });
    d.git('hazirlik');
  };

  return (
    <div className="tc-dhp">
      <ProgramBandi r={r} />
      <OrnekBandi />
      <Kart>
        <div className="tc-dhp-hero">
          <div className="tc-dhp-hero-metin">
            <span className="tc-dhp-ust-etiket">{`${kb.pg.s} hazırlık durumu`}</span>
            <h2 className="tc-dhp-hero-baslik">{v ? v.t : 'Hazırlığınızı ölçmeye başlayın'}</h2>
            <p>{v ? v.d : 'Simülasyonda denetçinin sorularını cevaplayın. Puanınız, madde bazında zayıf noktalarınız ve denetimden önce kapatmanız gereken açıklar burada belirecek.'}</p>
            {!na && d.yetki.yazabilir && (
              <div className="tc-dhp-tarih">
                <Girdi etiket={`Sıradaki ${kb.pg.s} denetimi`} type="date" ipucu="Tarihi girin; haftalık program ve geri sayım buna göre kurulur." onChange={(e) => { tarihGir(e.target.value); }} />
              </div>
            )}
            <div className="tc-dhp-dugmeler">
              {r.answered < r.total
                ? <Dugme tur="birincil" simge="play" onClick={() => { d.git('sim'); }}>{r.answered ? 'Simülasyona devam et' : 'Simülasyonu başlat'}</Dugme>
                : <Dugme tur="birincil" simge="chart" onClick={() => { d.git('rapor'); }}>Raporu aç</Dugme>}
              {d.yetki.yazabilir && <Dugme simge="bolt" onClick={hizliTur}>10 soruluk hızlı tur</Dugme>}
            </div>
          </div>
          <div className="tc-dhp-hero-kadran">
            <Kadran deger={r.pct} hedef={100} etiket="Hazırlık puanı" birim="puan" durum={v ? KADRAN[v.k] : 'sirada'} />
            <small className="tc-dhy-ton-soluk">{`Hedef ${kb.program === 'eydep' ? 'A eşiği 85' : '%85'}`}</small>
          </div>
        </div>
      </Kart>

      <div className="tc-dhp-kpiler">
        <button type="button" className="tc-dhp-kpi" onClick={() => { hazirligaGit(); }}>
          <Halka yuzde={ps.tot ? (ps.done / ps.tot) * 100 : 0} />
          <span><small><PSimge ad="calcheck" /> Hazırlık görevleri</small><b>{`${String(ps.done)} / ${String(ps.tot)}`}</b><small>Takvimdeki görevler</small></span>
        </button>
        <button type="button" className="tc-dhp-kpi" onClick={() => { d.git('sim'); }}>
          <Halka yuzde={r.total ? (r.answered / r.total) * 100 : 0} />
          <span><small><PSimge ad="clip" /> Simülasyon</small><b>{`${String(r.answered)} / ${String(r.total)}`}</b><small>Cevaplanan soru</small></span>
        </button>
        <button type="button" className="tc-dhp-kpi" onClick={() => { d.git('rapor'); }}>
          <Halka yuzde={kapali} etiket={String(acik)} ton="iyi" />
          <span>
            <small><PSimge ad="alert" /> Açık riskler</small>
            <b className="tc-dhp-riskler">
              <span className="tc-dhy-ton-kotu" title={lv('major')}>{`${lv('major')} ${String(r.major)}`}</span>
              <span className="tc-dhy-ton-uyari" title={lv('minor')}>{`${lv('minor')} ${String(r.minor)}`}</span>
              <span className="tc-dhy-ton-bilgi" title={lv('obs')}>{`${lv('obs')} ${String(r.obs)}`}</span>
            </b>
            <small>{r.risks.length ? `%${String(kapali)} kapatıldı` : `${lv('major')} · ${lv('minor')} · ${lv('obs')}`}</small>
          </span>
        </button>
        <button type="button" className="tc-dhp-kpi" onClick={() => { d.git('rehber'); }}>
          <Halka yuzde={ds.n ? (ds.k / ds.n) * 100 : 0} ton="iyi" />
          <span><small><PSimge ad="file" /> {kb.pg.docsKpi}</small><b>{`${String(ds.k)} / ${String(ds.n)}`}</b><small>Hazır olarak işaretli</small></span>
        </button>
      </div>

      <div className={buHafta ? 'tc-dhp-iki' : undefined}>
        <Kart baslik="Sıradaki adımlar" sag={r.risks.length ? <Dugme simge="next" onClick={() => { d.git('rapor'); }}>Tüm açıklar</Dugme> : undefined}>
          {adimlar.length ? (
            <ul className="tc-dhp-adimlar">
              {adimlar.map((s, i) => (
                <li key={`${s.go}-${String(i)}`}>
                  <button type="button" className={`tc-dhp-adim${s.risk ? ' tc-dhp-adim-risk' : ''}`} onClick={() => { if (s.go === 'hazirlik') hazirligaGit(s.ph); else d.git(s.go); }}>
                    <span className="tc-dhp-adim-simge"><PSimge ad={s.ic} /></span>
                    <span><b>{s.t}</b><small>{s.s}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="tc-dhy-ton-soluk">Açık adım yok. Simülasyonu cevapladıkça kapatmanız gereken açıklar buraya gelir.</p>}
        </Kart>
        {buHafta && (
          <Kart baslik={`Bu hafta · ${haftaAraligi(buHafta.m)}`} sag={<Dugme simge="next" onClick={() => { programEkrani((e) => { e.pw[d.program].prepView = 'week'; }); d.git('hazirlik'); }}>Program</Dugme>}>
            <p className="tc-dhy-ton-soluk">
              {`${buHafta.ph === 4 ? (d.program === 'eydep' ? 'Değerlendirme haftası' : 'Denetim haftası') : buHafta.ph === 5 ? 'Denetim sonrası' : `Denetime ${String(buHafta.wBefore)} hafta`} · ${String(buHafta.k)}/${String(buHafta.tot)} tamamlandı`}
            </p>
            <ul className="tc-dhp-hafta-liste">
              {buHafta.items.slice().sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 5).map((it) => <HaftaMaddesiSatiri key={`${it.k}-${it.id}`} it={it} />)}
            </ul>
          </Kart>
        )}
      </div>
    </div>
  );
}

import { Girdi, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { KYSB, ROAD } from '../icerik/kys-yapi.ts';
import { yolAdimiDurumu, yolIstatistigi } from '../kurallar/kys.ts';
import { ayEkle, ISO_TARIH } from '../tarih.ts';
import { Bolum, KysBaglantisi, Nokta, OranCubugu } from './ortak.tsx';
import { useYapiTasinaGit } from './yapi-taslari.tsx';

// Kurulum yol haritası (prototip kysYol): yedi aşama, 38 adım; yapı taşına bağlı adım kendiliğinden kapanır.

export function YolHaritasi() {
  const d = useDenetim();
  const K = d.profil.kys;
  const rs = yolIstatistigi(d.profil);
  const tasaGit = useYapiTasinaGit();
  const acik = ROAD.find((f) => f.steps.some((s) => yolAdimiDurumu(s, d.profil) < 2))?.k ?? null;
  return (
    <>
      <Bolum baslik="KYS kurulum yol haritası" simge="flag" sag={(
        <Girdi etiket="Başlangıç" type="date" value={K.start} readOnly={!d.yetki.yazabilir}
          onChange={(e) => { const v = e.target.value; d.degistir(null, (t) => { t.kys.start = ISO_TARIH.test(v) ? v : ''; }); }} />
      )}>
        <p className="tc-dhk-not">
          Sıfırdan kurulumda tipik süre 6–9 aydır; belgelendirme denetimi öncesi sistemin en az 2–3 ay çalışmış ve kayıt biriktirmiş olması beklenir.
          Yapı taşlarına bağlı adımlar, o yapı taşları &quot;Yürürlükte&quot; olunca kendiliğinden tamamlanır.
        </p>
        <div className="tc-dhk-ilerleme">
          <OranCubugu etiket={`${String(rs.k)}/${String(rs.n)} adım tamam`} parcalar={[{ oran: rs.k / rs.n, ton: 'vurgu' }]} />
          <span>{`${String(rs.k)}/${String(rs.n)} adım tamam`}{rs.p ? ` · ${String(rs.p)} devam ediyor` : ''}</span>
        </div>
      </Bolum>
      <ol className="tc-dhk-yol">
        {ROAD.map((f, fi) => {
          const n = f.steps.length;
          const k = f.steps.filter((s) => yolAdimiDurumu(s, d.profil) === 2).length;
          const bitti = k === n;
          const zaman = K.start
            ? new Date(`${ayEkle(K.start, f.m)}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
            : f.m === 0 ? '1. ay' : `${String(f.m + 1)}. ay`;
          return (
            <li key={f.k} className="tc-dhk-asama" data-bitti={bitti || undefined} data-acik={f.k === acik || undefined}>
              <span className="tc-dhk-asama-no">{bitti ? <Simge ad="check" /> : fi + 1}</span>
              <div className="tc-dhk-asama-govde">
                <div className="tc-dhk-asama-ust">
                  <div><b>{f.n}</b><small>{f.d}</small></div>
                  <span className="tc-dhk-soluk">{`${zaman} · ${String(k)}/${String(n)}`}</span>
                </div>
                <ul className="tc-dhk-adimlar">
                  {f.steps.map((s) => {
                    const v = yolAdimiDurumu(s, d.profil);
                    const oto = s.bl.length > 0;
                    return (
                      <li key={s.id} className="tc-dhk-adim" data-durum={v}>
                        {oto
                          ? <span className="tc-dhk-adim-isaret" title="Yapı taşlarına göre otomatik" aria-label={v === 2 ? 'Tamam' : v === 1 ? 'Devam ediyor' : 'Başlamadı'}>{v === 2 ? <Simge ad="check" boyut="k" /> : v === 1 ? '◐' : ''}</span>
                          : (
                            <input type="checkbox" className="tc-dhk-adim-kutu" checked={v === 2} disabled={!d.yetki.yazabilir} aria-label={`${s.t}: tamamlandı`}
                              onChange={(e) => {
                                const isaret = e.target.checked;
                                d.degistir('Yol haritası', (t) => { if (isaret) t.kys.road[s.id] = true; else delete t.kys.road[s.id]; });
                              }} />
                          )}
                        <div className="tc-dhk-adim-metin">
                          <b>{s.t}</b>
                          {s.d && <small>{s.d}</small>}
                          {s.bl.length > 0 && (
                            <div className="tc-dhk-cipler">
                              {s.bl.map((id) => {
                                const b = KYSB.find((x) => x.id === id);
                                return b ? (
                                  <button key={id} type="button" className="tc-dhk-cip" onClick={() => { tasaGit(id); }}>
                                    <Nokta st={K.items[id]?.st ?? 0} />{`${b.c} ${b.n}`}
                                  </button>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                        <KysBaglantisi hedef={s.ln} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

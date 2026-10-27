import { useState } from 'react';
import { Dugme, Kart } from '../../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { fmt, pct, ymLabel } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { gelirCsvSatirlari, gelirTablosu, type GelirSatiri } from './hesap.ts';
import { Grafik, ortakSecenekler, saydam } from './Grafik.tsx';
import { Not, Serit } from './parcalar.tsx';
import { RaporAraclari } from './RaporAraclari.tsx';
import './raporlar.css';

const hucre = (v: number) => (v ? fmt(v) : '—');

// Gelir tablosu (prototip VIEWS.gelirtab): tamamlanmış 6 ya da 12 ay, kategori satırları, net kâr ve marj; iki grafik.
export function GelirTablosu({ finans }: EkranOzellikleri) {
  const [n, setN] = useState<6 | 12>(6);
  if (!finans) return null;
  const { motor } = finans;
  const T = gelirTablosu(motor, n);
  const satir = (s: GelirSatiri, toplam = false) => (
    <tr key={s.ad} data-toplam={toplam || undefined}>
      <th scope="row">{s.ad}</th>
      {s.aylar.map((v, i) => <td key={T.aylar[i]}>{hucre(v)}</td>)}
      <td><b>{fmt(s.toplam)}</b></td>
    </tr>
  );
  const csv = () => { const c = gelirCsvSatirlari(motor, n); csvIndir(`gelir-tablosu-${motor.bugun}.csv`, c.basliklar, c.satirlar); };
  const anahtar = `${n}|${T.aylar.join(',')}|${T.net.aylar.join(',')}`;
  return (
    <div className="tc-fr">
      <RaporAraclari>
        <Serit<6 | 12> etiket="Dönem" secenekler={[{ deger: 6, baslik: '6 ay' }, { deger: 12, baslik: '12 ay' }]} secili={n} sec={setN} />
        <Dugme tur="ikincil" simge="download" onClick={csv}>Excel&apos;e aktar</Dugme>
      </RaporAraclari>
      <Not>Tamamlanmış aylar, KDV hariç, fatura tarihine göre. Açılış bakiyeleri, avanslar, KDV ödemeleri ve kredi anaparası dahil değildir.</Not>
      <Kart>
        <div className="tc-fr-tablo-kutu">
          <table className="tc-fr-tablo">
            <caption className="tc-fr-gizli">Gelir tablosu</caption>
            <thead><tr><th scope="col"><span className="tc-fr-gizli">Kalem</span></th>{T.aylar.map((ym) => <th key={ym} scope="col">{ymLabel(ym)}</th>)}<th scope="col">Toplam</th></tr></thead>
            <tbody>
              <tr data-grup><th colSpan={n + 2} scope="rowgroup">Gelirler</th></tr>
              {T.gelirler.map((s) => satir(s))}
              {satir(T.toplamGelir, true)}
              <tr data-grup><th colSpan={n + 2} scope="rowgroup">Giderler</th></tr>
              {T.giderler.map((s) => satir(s))}
              {satir(T.toplamGider, true)}
              <tr data-net>
                <th scope="row">{T.net.ad}</th>
                {T.net.aylar.map((v, i) => <td key={T.aylar[i]} data-durum={v < 0 ? 'durdu' : undefined}><b>{fmt(v)}</b></td>)}
                <td data-durum={T.net.toplam < 0 ? 'durdu' : undefined}><b>{fmt(T.net.toplam)}</b></td>
              </tr>
              <tr data-soluk>
                <th scope="row">Net marj</th>
                {T.marj.map((v, i) => <td key={T.aylar[i]}>{v === null ? '—' : pct(v, 0)}</td>)}
                <td>{T.toplamMarj === null ? '—' : pct(T.toplamMarj, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Not>İçinde bulunulan ay tamamlanınca tabloya eklenir.</Not>
      </Kart>
      <div className="tc-fr-iki-genis">
        <Kart baslik="Aylık gelir, gider ve kâr">
          <Grafik
            etiket="Aylık gelir, gider ve kâr"
            anahtar={anahtar}
            kur={(r) => ({
              type: 'bar',
              data: {
                labels: T.aylar.map(ymLabel),
                datasets: [
                  { type: 'bar', label: 'Gelir', data: T.toplamGelir.aylar, backgroundColor: saydam(r.iyi, 0.8), borderRadius: 4, order: 2 },
                  { type: 'bar', label: 'Gider', data: T.toplamGider.aylar, backgroundColor: saydam(r.risk, 0.65), borderRadius: 4, order: 2 },
                  { type: 'line', label: 'Net kâr', data: T.net.aylar, borderColor: r.yazi, backgroundColor: r.yazi, tension: 0.3, pointRadius: 3, order: 1 },
                ],
              },
              options: ortakSecenekler(r),
            })}
          />
        </Kart>
        <Kart baslik="Gider dağılımı" sag={<small className="tc-fr-soluk">Seçili dönem</small>}>
          {T.gider.length
            ? <Grafik
                etiket="Gider dağılımı"
                anahtar={anahtar}
                kur={(r) => {
                  const toplam = T.gider.reduce((a, g) => a + g.tutar, 0);
                  const palet = [r.seri, r.iyi, r.dikkat, r.risk, saydam(r.seri, 0.55), saydam(r.iyi, 0.5), saydam(r.dikkat, 0.5), saydam(r.risk, 0.45), r.soluk];
                  return {
                    type: 'doughnut',
                    data: { labels: T.gider.map((g) => g.ad), datasets: [{ data: T.gider.map((g) => g.tutar), backgroundColor: palet, borderColor: r.zemin, borderWidth: 2 }] },
                    options: {
                      responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%',
                      plugins: {
                        legend: { position: 'bottom', labels: { color: r.soluk, boxWidth: 10 } },
                        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed)} (${pct(toplam ? c.parsed / toplam : 0, 0)})` } },
                      },
                    },
                  };
                }}
              />
            : <p className="tc-fr-bos">Bu dönemde gider yok.</p>}
        </Kart>
      </div>
    </div>
  );
}

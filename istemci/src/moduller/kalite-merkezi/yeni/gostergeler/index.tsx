import { useMemo, type ReactNode } from 'react';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { iki, sayiMetni, YOK } from '../bicim.ts';
import { icinde, karantina, type KmTon } from '../kurallar.ts';
import { CIDDIYET } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { aylar, Grafik, VeriYok, type RenkAdi } from './Grafik.tsx';
import { aylikIlkGecis, gostergeleriHesapla, oranTonu, pareto, ppmTonu } from './hesap.ts';
import './k4.css';

export function Kutucuk({ ton, deger, baslik, alt }: { ton: KmTon; deger: string; baslik: string; alt: string }) {
  return (
    <div className={`tc-km4-kpi${ton ? ` tc-km4-kpi-${ton}` : ''}`}>
      <span className="tc-km4-kpi-deger mono">{deger}</span>
      <span className="tc-km4-kpi-baslik">{baslik}</span>
      <span className="tc-km4-kpi-alt">{alt}</span>
    </div>
  );
}

export function Panel({ baslik, alt, children, sinif = '' }: { baslik: string; alt?: string; children: ReactNode; sinif?: string }) {
  return (
    <section className={`tc-km4-panel ${sinif}`}>
      <h2 className="tc-km4-panel-baslik">{baslik}</h2>
      {alt && <p className="tc-km-soluk">{alt}</p>}
      {children}
    </section>
  );
}

const SIDDET_RENGI: Record<string, RenkAdi> = { Kritik: 'kirmizi', Majör: 'amber', Minör: 'celik' };

export function Gostergeler({ veri, yetki, git }: EkranOzellikleri) {
  const g = useMemo(() => gostergeleriHesapla(veri), [veri]);
  const ay = useMemo(() => aylar(12), []);
  const bugunMetni = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const p = useMemo(() => pareto(veri.ncr.filter((n) => icinde(n.tarih, 365))), [veri.ncr]);
  const aylikNcr = CIDDIYET.map((c) => ay.map((a) => veri.ncr.filter((n) => n.ciddiyet === c && (n.tarih ?? '').startsWith(a.anahtar)).length));
  const ppmSatirlari = Object.entries(g.ppm.by)
    .map(([id, x]) => ({ ad: veri.sup.find((s) => s._id === id)?.ad ?? id, ppm: x.r ? Math.round((x.b / x.r) * 1e6) : 0 }))
    .sort((a, b) => b.ppm - a.ppm);
  const ilkGecisAylik = aylikIlkGecis(veri, ay.map((a) => a.anahtar));

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Kalite göstergeleri"
        simge="chart"
        alt={`${bugunMetni}. İlk geçiş oranı, PPM, uygunsuzluk ve süreç yeteneği eğilimleri.`}
        {...(yetki.yaz ? {
          birincil: { etiket: 'Muayene kaydet', simge: 'plus', yap: () => git('muayeneler', { ac: 'yeni' }) },
          eylemler: [{ anahtar: 'ncr', baslik: 'Uygunsuzluk', simge: 'alert', sec: () => git('uygunsuzluklar', { ac: 'yeni' }) }],
        } : {})}
      />
      {g.bos && (
        <div className="tc-km-not">
          <p>Henüz kayıt yok. Önce <b>Ölçüm cihazları</b> ve <b>Tedarikçi kalitesi</b> listelerini girin; muayene ve uygunsuzluk kayıtları bunlara bağlanır.</p>
        </div>
      )}
      <section className="tc-km4-kpiler" aria-label="Kalite göstergeleri">
        <Kutucuk ton={oranTonu(g.ilkGecis)} deger={g.ilkGecis === null ? YOK : `%${g.ilkGecis}`} baslik="İlk geçiş oranı" alt={`Son 30 gün, ${g.ilkGecisSayisi} muayene`} />
        <Kutucuk ton={oranTonu(g.lotKabul)} deger={g.lotKabul === null ? YOK : `%${g.lotKabul}`} baslik="Lot kabul oranı" alt={`Son 90 gün, ${g.lotSayisi} lot`} />
        <Kutucuk ton={ppmTonu(g.ppm.toplam)} deger={sayiMetni(g.ppm.toplam)} baslik="Tedarikçi PPM" alt={`${sayiMetni(g.ppm.b)} uygunsuz / ${sayiMetni(g.ppm.r)} alınan, 90 gün`} />
        <Kutucuk ton={g.karantinaTonu} deger={String(g.karantinaSayisi)} baslik="Karantinada bekleyen" alt={`${sayiMetni(g.karantinaMiktari)} adet ürün`} />
        <Kutucuk ton={g.kritikNcr ? 'kotu' : g.acikNcr ? 'uyari' : 'iyi'} deger={String(g.acikNcr)} baslik="Açık uygunsuzluk" alt={`${g.kritikNcr} kritik`} />
        <Kutucuk ton={g.gecersizCihaz ? 'kotu' : g.yaklasanCihaz ? 'uyari' : 'iyi'} deger={String(g.gecersizCihaz)} baslik="Geçersiz cihaz" alt={`${g.yaklasanCihaz} cihaz 30 gün içinde`} />
      </section>
      <Panel baslik="Kalite kapıları" alt="Son 90 gün. Bir kapıda ret birikmesi, önceki kapının hatayı yakalayamadığını gösterir.">
        <div className="tc-km4-kapilar">
          {g.kapilar.map((k) => (
            <div key={k.tur} className="tc-km4-kapi">
              <h3>{k.tur === 'FAI' ? 'İlk parça (FAI)' : `${k.tur} muayene`}</h3>
              <span className="tc-km4-kapi-n mono">{k.n}</span>
              <span className={k.ret ? 'tc-km4-kapi-ret tc-km4-kotu' : 'tc-km4-kapi-ret'}>{k.ret} ret</span>
            </div>
          ))}
          <div className="tc-km4-kapi tc-km4-kapi-son">
            <h3>Sevke hazır</h3>
            <span className="tc-km4-kapi-n mono">{g.sevkeHazir}</span>
            <span className="tc-km4-kapi-ret">final kabul</span>
          </div>
        </div>
      </Panel>
      <div className="tc-km4-izgara3">
        <Panel baslik="İlk geçiş oranı" alt="Aylık, muayene ve lot kabul birlikte; hedef %95">
          {veri.insp.length || veri.lot.length
            ? <Grafik etiket="Aylık ilk geçiş oranı" anahtar={JSON.stringify(ilkGecisAylik)} kur={(r) => ({
                type: 'line',
                data: { labels: ay.map((a) => a.etiket), datasets: [
                  { label: 'İlk geçiş %', data: ilkGecisAylik, borderColor: r('zeytin'), backgroundColor: r('zeytin'), spanGaps: true, tension: 0.2, pointRadius: 3 },
                  { label: 'Hedef', data: ay.map(() => 95), borderColor: r('soluk'), borderDash: [5, 4], pointRadius: 0, borderWidth: 1 },
                ] },
                options: { scales: { y: { min: 50, max: 100, ticks: { callback: (v) => `${v}%` } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } },
              })} />
            : <VeriYok />}
        </Panel>
        <Panel baslik="Hata tipi Pareto" alt="Son 12 ay; çizgi kümülatif yüzde">
          {veri.ncr.length
            ? <Grafik etiket="Hata tipi Pareto" anahtar={JSON.stringify(p)} kur={(r) => ({
                type: 'bar',
                data: { labels: p.map((x) => x.etiket), datasets: [
                  { type: 'bar', label: 'Adet', data: p.map((x) => x.adet), backgroundColor: r('celik'), yAxisID: 'y' },
                  { type: 'line', label: 'Kümülatif %', data: p.map((x) => x.kumulatif), borderColor: r('kirmizi'), backgroundColor: r('kirmizi'), pointRadius: 3, tension: 0, yAxisID: 'y1' },
                ] },
                options: { scales: {
                  x: { grid: { display: false }, ticks: { maxRotation: 50, minRotation: 30, autoSkip: false, font: { size: 11 } } },
                  y: { beginAtZero: true, ticks: { precision: 0 } },
                  y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: (v) => `${v}%` } },
                }, plugins: { legend: { position: 'bottom' } } },
              })} />
            : <VeriYok>Uygunsuzluk kaydı eklendiğinde Pareto oluşur.</VeriYok>}
        </Panel>
        <Panel baslik="Tedarikçi PPM" alt="Son 90 gün; uygunsuz adet / alınan adet">
          {ppmSatirlari.length
            ? <Grafik etiket="Tedarikçi PPM" anahtar={JSON.stringify(ppmSatirlari)} kur={(r) => ({
                type: 'bar',
                data: { labels: ppmSatirlari.map((x) => x.ad), datasets: [{ label: 'PPM', data: ppmSatirlari.map((x) => x.ppm), backgroundColor: ppmSatirlari.map((x) => (x.ppm > 2000 ? r('kirmizi') : x.ppm > 500 ? r('amber') : r('zeytin'))) }] },
                options: { indexAxis: 'y', scales: { x: { beginAtZero: true }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false } } },
              })} />
            : <VeriYok>Tedarikçili lot ve giriş muayenesi kaydedildiğinde oluşur.</VeriYok>}
        </Panel>
      </div>
      <div className="tc-km4-izgara2">
        <Panel baslik="Aylık uygunsuzluk" alt="Son 12 ay, ciddiyete göre">
          <Grafik etiket="Aylık uygunsuzluk" anahtar={JSON.stringify(aylikNcr)} kur={(r) => ({
            type: 'bar',
            data: { labels: ay.map((a) => a.etiket), datasets: CIDDIYET.map((c, i) => ({ label: c, data: aylikNcr[i] ?? [], backgroundColor: r(SIDDET_RENGI[c] ?? 'celik') })) },
            options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } },
          })} />
        </Panel>
        <Panel baslik="Süreç yeteneği uyarıları" alt="Cpk 1,33 altındaki karakteristikler (en az 10 ölçüm)">
          {g.yetenekUyarilari.length
            ? (
              <ul className="tc-km4-liste">
                {g.yetenekUyarilari.slice(0, 6).map((s) => (
                  <li key={s.k}>
                    <span className={`tc-km4-isaret tc-km4-g-${s.durum.ton || 'notr'}`} aria-hidden="true" />
                    <span>{s.pn}: {s.ad} <span className="tc-km-soluk">(n {s.n})</span></span>
                    <Dugme tur="ikincil" onClick={() => git('olcum-analizi', { ac: s.k })}>Cpk {iki(s.cpk)}</Dugme>
                  </li>
                ))}
              </ul>
            )
            : <p className="tc-km4-veri-yok"><b>Uyarı yok</b><br />{g.olculenVar ? 'Ölçülen karakteristikler yetenekli.' : 'Ölçüm serisi girildiğinde Cpk izlenir.'}</p>}
        </Panel>
      </div>
    </div>
  );
}

// Uygulamanın alt sekme sayacı: karantinada bekleyen ürün.
export const GostergelerSayaci: KmSayaci = (v) => {
  const q = karantina(v);
  return { n: q.length, kotu: q.some((x) => x.ton === 'kotu') };
};


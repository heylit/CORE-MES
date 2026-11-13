import { useState } from 'react';
import type { MakineBulgulariCevabi, MakineBulguTuru } from '#paylasilan/sozlesme/smartes.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { CizgiGrafikKarti, YatayCubukKarti, sayi } from '../../ortak/arayuz/grafik/grafikler.tsx';

type Grafikler = NonNullable<MakineBulgulariCevabi['grafikler']>;
type CizelgeTuru = Grafikler['cizelge']['satirlar'][number]['parcalar'][number]['tur'];

const CIZELGE: Record<CizelgeTuru, string> = {
  calisiyor: 'Çalışıyor', nedenli: 'Duruş (nedeni girildi)', nedensiz: 'Duruş (nedeni girilmedi)', alarm: 'Alarm', kapali: 'Kapalı',
};
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const G = 1000;
// Telefonda 1-2 dakikalık parça da görünsün diye çalışma dışı her parça ayrıca ölçeklenmeyen ince çizgiyle çizilir (Arayüz N11).

function ZamanCizelgesi({ v, sec }: { v: Grafikler['cizelge']; sec: (kod: string) => void }) {
  const bas = Date.parse(v.baslangic);
  const toplam = Math.max(1, Date.parse(v.bitis) - bas);
  const x = (iso: string) => ((Date.parse(iso) - bas) / toplam) * G;
  const dk = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
  const gecen = Math.max(1, dk(v.baslangic, v.simdi));
  const saatler: string[] = [];
  for (let t = bas; t <= Date.parse(v.bitis); t += 2 * 3_600_000) saatler.push(SAAT.format(new Date(t)));
  return (
    <section className="tc-kart tc-gp tc-mbg-cizelge" data-genis aria-label="Bugünkü makine zaman çizelgesi">
      <header className="tc-gp-bas">
        <span className="tc-gp-bas-simge" aria-hidden="true"><Simge ad="clock" /></span>
        <div className="tc-gp-bas-metin">
          <h3>Bugün makineler ne yaptı</h3>
          <p>{SAAT.format(new Date(v.baslangic))}–{SAAT.format(new Date(v.bitis))}; her şerit bir makine. Kırmızı: nedeni girilmemiş duruş; taralı: alarm.</p>
        </div>
      </header>
      <ul className="tc-gp-lejant" aria-label="Renkler">
        {(Object.keys(CIZELGE) as CizelgeTuru[]).map((t) => <li key={t}><i className="tc-seri-anahtar tc-mbg-renk" data-tur={t} aria-hidden="true" />{CIZELGE[t]}</li>)}
      </ul>
      <div className="tc-mbg-izgara">
        {v.satirlar.map((s) => {
          const calisma = s.parcalar.filter((p) => p.tur === 'calisiyor').reduce((t, p) => t + dk(p.baslangic, p.bitis), 0);
          const nedensiz = s.parcalar.filter((p) => p.tur === 'nedensiz').reduce((t, p) => t + dk(p.baslangic, p.bitis), 0);
          const ozet = `${s.makineKodu}: çalışma ${calisma} dk${nedensiz > 0 ? `, nedeni girilmemiş duruş ${nedensiz} dk` : ''}`;
          return (
            <div key={s.makineKodu} className="tc-mbg-satir">
              <button type="button" className="tc-mbg-ad tc-sm-kod" onClick={() => sec(s.makineKodu)} aria-label={`${ozet}. Makineyi aç`}>{s.makineKodu}</button>
              <svg className="tc-mbg-serit" viewBox={`0 0 ${G} 10`} preserveAspectRatio="none" role="img" aria-label={ozet}>
                <defs>
                  <pattern id="tc-mbg-tarama" width="8" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
                    <rect className="tc-mbg-tarama-zemin" width="8" height="10" />
                    <line className="tc-mbg-tarama-cizgi" x1="2" x2="2" y1="0" y2="10" />
                  </pattern>
                </defs>
                <rect className="tc-mbg-zemin" x="0" y="0" width={G} height="10" />
                {s.parcalar.map((p) => {
                  const bas = x(p.baslangic);
                  const gen = x(p.bitis) - bas;
                  return (
                    <g key={p.baslangic}>
                      <rect className="tc-mbg-parca" data-tur={p.tur} x={bas} y="0" width={gen} height="10">
                        <title>{`${CIZELGE[p.tur]} · ${SAAT.format(new Date(p.baslangic))}–${SAAT.format(new Date(p.bitis))}${p.not === '' ? '' : ` · ${p.not}`}`}</title>
                      </rect>
                      {p.tur !== 'calisiyor' && <line className="tc-mbg-ince" data-tur={p.tur} x1={bas + gen / 2} x2={bas + gen / 2} y1="0" y2="10" />}
                    </g>
                  );
                })}
                <line className="tc-mbg-simdi" x1={x(v.simdi)} x2={x(v.simdi)} y1="0" y2="10" />
              </svg>
              <span className="tc-mbg-yuzde mono">%{sayi((calisma / gecen) * 100, 0)}</span>
            </div>
          );
        })}
        <div className="tc-mbg-satir tc-mbg-eksen" aria-hidden="true"><span /><span className="tc-mbg-saatler">{saatler.map((h) => <span key={h}>{h}</span>)}</span><span /></div>
      </div>
    </section>
  );
}

// Grafik bulgu türüyle bağlıdır: kutu seçilince yalnız o türün grafikleri kalır. D1'de üç grafik var; öteki türler sonraki adımlarda.
export function MakineGrafikleri({ v, suzgec, makineAc }: { v: Grafikler; suzgec: MakineBulguTuru | null; makineAc: (kod: string) => void }) {
  // Telefonda grafikler kapalı gelir: kutular ve liste önce görünür.
  const [acik, acikYaz] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const goster = (...t: MakineBulguTuru[]) => suzgec === null || t.includes(suzgec);
  const kartlar = [
    goster('durum', 'durus', 'alarm') && v.cizelge.satirlar.length > 0 && <ZamanCizelgesi key="cizelge" v={v.cizelge} sec={makineAc} />,
    goster('durus') && v.duruslar.length > 0 && (
      <YatayCubukKarti key="duruslar" baslik="Duruş nedenleri" simge="pause" alt="Bugün, dakika; nedeni girilmemiş olan ayrı satırda" satirlar={v.duruslar} bicim={(n) => `${sayi(n, 0)} dk`} yuklendi />
    ),
    goster('sayim') && v.sayim !== null && (
      <CizgiGrafikKarti
        key="sayim" baslik={`Sayım: makine ve operatör (${v.sayim.makineKodu})`} simge="box"
        alt="Bugün, birikimli adet; aradaki açıklık sayım farkıdır. Operatör serisi makine CORE’da eşlenmişse gelir."
        etiketler={v.sayim.etiketler} seriler={v.sayim.seriler} bicim={(n) => sayi(n, 0)} yuklendi
      />
    ),
  ].filter(Boolean);
  if (kartlar.length === 0) return null;
  return (
    <details className="tc-sm-grup tc-mb-karne-ac" open={acik} onToggle={(o) => { acikYaz((o.target as HTMLDetailsElement).open); }} aria-label="Grafikler">
      <summary className="tc-smartes-baslik">Grafikler <span className="tc-sm-not">{kartlar.length} grafik · {suzgec === null ? 'bütün türler' : 'seçili tür'}</span></summary>
      <div className="tc-gp-izgarasi">{kartlar}</div>
    </details>
  );
}

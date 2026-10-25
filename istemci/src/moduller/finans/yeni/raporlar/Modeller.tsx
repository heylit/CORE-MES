import type { ReactNode } from 'react';
import { Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { clamp, fmt, fmtD, fmtK, METHOD_NAMES, MK_STATES, nf, pct, ymAdd, ymLabel, ymLong, type Analiz, type FinansMotoru } from '../motor.ts';
import { DERECE_TONU, modelCapasi, MODELLER, type ModelAnahtari } from './hesap.ts';
import { Grafik, ortakSecenekler, saydam } from './Grafik.tsx';
import { Aciklama, Formul, Not, Satir } from './parcalar.tsx';

// Teknik ayrıntılar (prototip VIEWS.modeller, Tahminler'in altında): altı modelin sonucu, parametresi ve yöntemi.
export function Modeller({ motor, A }: { motor: FinansMotoru; A: Analiz }) {
  const git = (m: ModelAnahtari) => document.getElementById(modelCapasi(m))?.scrollIntoView({ block: 'start' });
  return (
    <section className="tc-fr" aria-labelledby="tc-fr-teknik">
      <h2 id="tc-fr-teknik" className="tc-fr-baslik">Teknik ayrıntılar</h2>
      <Not>Danışmanın kullandığı modellerin sonuçları, parametreleri ve yöntemleri. Teknik ayrıntı isteyenler için.</Not>
      <nav className="tc-fr-dugmeler" aria-label="Modeller">
        {MODELLER.map(([k, ad]) => <button key={k} type="button" className="tc-fr-serit-dugme" onClick={() => git(k)}>{ad}</button>)}
      </nav>
      <MonteCarlo A={A} />
      <SatisTahmini motor={motor} A={A} />
      <Markov A={A} />
      <MusteriRiski A={A} />
      <AltmanDupont A={A} />
      <Anomaliler motor={motor} A={A} />
    </section>
  );
}

const Bolum = ({ m, baslik, sag, children }: { m: ModelAnahtari; baslik: string; sag?: string; children: ReactNode }) => (
  <div id={modelCapasi(m)} className="tc-fr-model"><Kart baslik={baslik} sag={sag ? <small className="tc-fr-soluk">{sag}</small> : undefined}>{children}</Kart></div>
);

function MonteCarlo({ A }: { A: Analiz }) {
  const mc = A.mc;
  if (!mc) return <Bolum m="mc" baslik="1. Monte Carlo nakit simülasyonu"><p className="tc-fr-bos">Hesaplanamadı.</p></Bolum>;
  return (
    <Bolum m="mc" baslik="1. Monte Carlo nakit simülasyonu" sag={`${nf(mc.N)} senaryo, 13 hafta`}>
      <div className="tc-fr-iki">
        <div>
          <Satir ad="Eksiye düşme olasılığı">{pct(mc.pNeg, 1)}</Satir>
          <Satir ad="Eşik altına inme olasılığı">{pct(mc.pBelow, 1)}</Satir>
          <Satir ad="Riskteki nakit, %5 (CFaR)">{fmt(mc.cfar5)}</Satir>
          <Satir ad="Riskteki nakit, %10">{fmt(mc.cfar10)}</Satir>
          <Satir ad="Ortanca en düşük bakiye">{fmt(mc.minP50)}</Satir>
          <Satir ad="Haftalık yeni satış ortalaması / oynaklık (σ)">{fmtK(mc.wkMean)} / {nf(mc.sig, 2)}</Satir>
          <Satir ad="Ortalama tahsil / ödeme günü">{nf(mc.profile.collectDays)} / {nf(mc.profile.payDays)} gün</Satir>
        </div>
        <div>
          <Grafik
            etiket="En düşük bakiyenin dağılımı" boy="kisa" anahtar={mc.hist.map((h) => h.n).join(',')}
            kur={(r) => {
              const o = ortakSecenekler(r);
              return {
                type: 'bar',
                data: { labels: mc.hist.map((h) => fmtK(h.x)), datasets: [{ label: 'Senaryo sayısı', data: mc.hist.map((h) => h.n), backgroundColor: mc.hist.map((h) => (h.x < mc.th ? saydam(r.risk, 0.75) : saydam(r.seri, 0.55))), borderRadius: 2, barPercentage: 1, categoryPercentage: 1 }] },
                options: { ...o, plugins: { ...o.plugins, legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} senaryo` } } } },
              };
            }}
          />
          <Not>Her senaryodaki en düşük bakiyenin dağılımı. Kırmızı çubuklar eşiğin altı.</Not>
        </div>
      </div>
      <Aciklama baslik="Yöntem">
        <p>Cash-Flow-at-Risk yaklaşımı: nakit akışını oluşturan kalemler tek tek olasılık dağılımlarıyla simüle edilir ve sonuçların dağılımından olasılıklar okunur.</p>
        <p><b>Açık alacaklar:</b> her fatura için ödeme gecikmesi, o müşterinin geçmiş gecikmelerinden yeniden örneklenir (bootstrap). Vadesi geçmiş faturalarda yalnızca mevcut gecikmeden uzun geçmiş gecikmeler kullanılır (koşullu örnekleme). Batma olasılığı Markov modelinden gelir.</p>
        <p><b>Yeni satışlar:</b> haftalık satış log-normal dağılımdan çekilir; ortalama Holt modelinin gelecek ay tahmininden, oynaklık son 26 haftanın değişim katsayısından türetilir.</p>
        <Formul>S = μ · exp(σZ − σ²/2),  σ = √ln(1 + CV²),  Z ~ N(0,1)</Formul>
        <p><b>Değişken giderler:</b> satışın geçmiş oranı kadar, ortalama ödeme gününe göre kaydırılarak düşülür. <b>Çekler:</b> her biri ayarlardaki olasılıkla karşılıksız çıkar. <b>Sabit kalemler:</b> düzenli ödemeler, açık borçlar ve tahmini KDV her senaryoda aynıdır. Rastgele sayı üreteci sabit tohumla çalışır; aynı veriyle aynı sonuç üretilir.</p>
      </Aciklama>
    </Bolum>
  );
}

function SatisTahmini({ motor, A }: { motor: FinansMotoru; A: Analiz }) {
  const hf = A.hf;
  const bu = motor.bugun.slice(0, 7);
  return (
    <Bolum m="holt" baslik="2. Satış tahmini" sag={hf ? `Kullanılan yöntem: ${METHOD_NAMES[hf.method ?? 'holt']} · Holt α ${nf(hf.alpha, 2)}, β ${nf(hf.beta, 2)}` : 'Yetersiz veri'}>
      {hf
        ? <>
            <Grafik
              etiket="Satış tahmini" anahtar={`${hf.fit.join(',')}|${hf.fc.map((f) => f.v).join(',')}`}
              kur={(r) => {
                const aylar = motor.completeMonths(12), n = aylar.length, kayma = n - hf.fit.length;
                const bos = <T,>(arr: T[]) => (new Array<T | null>(n).fill(null) as (T | null)[]).concat(arr);
                return {
                  type: 'bar',
                  data: {
                    labels: aylar.map((m) => ymLabel(m.ym)).concat(hf.fc.map((f) => ymLabel(ymAdd(bu, f.h - 1)))),
                    datasets: [
                      { type: 'bar', label: 'Gerçekleşen satış', data: aylar.map((m) => m.gelir), backgroundColor: saydam(r.iyi, 0.6), borderRadius: 4 },
                      { type: 'line', label: 'Holt uyumu', data: (new Array<number | null>(kayma).fill(null)).concat(hf.fit), borderColor: r.soluk, borderDash: [4, 4], pointRadius: 0, tension: 0.2 },
                      { type: 'line', label: '_üst', data: bos(hf.fc.map((f) => f.hi)), borderWidth: 0, pointRadius: 0, fill: false },
                      { type: 'line', label: '%80 aralık', data: bos(hf.fc.map((f) => f.lo)), borderWidth: 0, pointRadius: 0, backgroundColor: saydam(r.seri, 0.15), fill: '-1' },
                      { type: 'line', label: 'Tahmin', data: bos(hf.fc.map((f) => f.v)), borderColor: r.seri, pointRadius: 4, borderWidth: 2.5 },
                    ],
                  },
                  options: ortakSecenekler(r),
                };
              }}
            />
            <div className="tc-fr-tablo-kutu">
              <table className="tc-fr-tablo">
                <thead><tr><th scope="col">Ay</th><th scope="col">Tahmin</th><th scope="col">%80 alt sınır</th><th scope="col">%80 üst sınır</th></tr></thead>
                <tbody>{hf.fc.map((f) => <tr key={f.h}><th scope="row">{ymLong(ymAdd(bu, f.h - 1))}</th><td><b>{fmt(f.v)}</b></td><td>{fmt(f.lo)}</td><td>{fmt(f.hi)}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        : <p className="tc-fr-bos">En az 4 aylık satış verisi gerekiyor.</p>}
      <Aciklama baslik="Yöntem">
        <p>Seviye (L) ve eğilim (T) iki ayrı düzeltme katsayısıyla güncellenir. Katsayılar 0,05 adımlı ızgarada, bir adım ileri tahmin hatalarının kareleri toplamını en aza indirecek şekilde seçilir.</p>
        <Formul>Lₜ = α·yₜ + (1−α)(Lₜ₋₁ + Tₜ₋₁)   Tₜ = β(Lₜ − Lₜ₋₁) + (1−β)Tₜ₋₁   ŷₜ₊ₕ = Lₜ + h·Tₜ</Formul>
        <p>Sistem her analizde üç yöntemi geçmişe dönük sınar (Holt, son 3 ayın ortalaması, geçen ayın tekrarı) ve bir ay sonrasını en iyi tahmin edeni kullanır. Satışları dalgalı şirketlerde basit yöntemler sıklıkla daha iyi sonuç verir. Tahmin aralığı: ŷ ± 1,2816 · hata · √h (yaklaşık %80). MAPE, geçmiş tahminlerin ortalama mutlak yüzde hatasıdır; %10&apos;un altı iyi, %20&apos;nin üstü zayıf kabul edilir. 24 aydan uzun veride mevsimsellik için Holt-Winters&apos;a geçilebilir.</p>
      </Aciklama>
    </Bolum>
  );
}

// Isı tablosu hücresi: değer onda bir basamakla sınıfa iner (renk CSS'te tasarım değişkeninden).
const isi = (v: number) => Math.min(9, Math.max(0, Math.round(v * 10)));

function Markov({ A }: { A: Analiz }) {
  const M = A.mk;
  return (
    <Bolum m="markov" baslik="3. Alacak tahsil modeli: yutucu Markov zinciri" sag={M ? `${nf(M.obs)} aylık geçiş gözlemi` : undefined}>
      {M
        ? <div className="tc-fr-iki">
            <div>
              <h3 className="tc-fr-alt-baslik">Aylık geçiş olasılıkları</h3>
              <div className="tc-fr-tablo-kutu">
                <table className="tc-fr-tablo tc-fr-isi">
                  <thead><tr><th scope="col">Bu ay \ Gelecek ay</th>{MK_STATES.map((s) => <th key={s} scope="col">{s.replace(' gün', '')}</th>)}<th scope="col">Tahsil</th><th scope="col">Batık</th></tr></thead>
                  <tbody>{M.P.map((satir, i) => <tr key={MK_STATES[i]}><th scope="row">{MK_STATES[i]}</th>{satir.map((v, j) => <td key={j} data-isi={isi(v)}>{nf(v * 100, 0)}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <Not>Değerler yüzde. Satırlar 100&apos;e tamamlanır.</Not>
            </div>
            <div>
              <h3 className="tc-fr-alt-baslik">Nihai sonuç olasılıkları ve beklenen kayıp</h3>
              <div className="tc-fr-tablo-kutu">
                <table className="tc-fr-tablo">
                  <thead><tr><th scope="col">Yaş grubu</th><th scope="col">Bakiye</th><th scope="col">Tahsil</th><th scope="col">Batık</th><th scope="col">Beklenen kayıp</th><th scope="col">Ort. süre</th></tr></thead>
                  <tbody>
                    {M.B.map((s, i) => (
                      <tr key={MK_STATES[i]}>
                        <th scope="row">{MK_STATES[i]}</th><td>{fmt(M.bal[i]!)}</td><td>{pct(s[0]!, 0)}</td>
                        <td data-durum={s[1]! > 0.2 ? 'durdu' : undefined}>{pct(s[1]!, 1)}</td><td>{fmt(M.bal[i]! * s[1]!)}</td><td>{nf(M.tAbs[i], 1)} ay</td>
                      </tr>
                    ))}
                    <tr><th scope="row">{M.wo}+ gün (batık sayılan)</th><td>{fmt(M.written)}</td><td>—</td><td>%100</td><td>{fmt(M.written)}</td><td /></tr>
                    <tr data-toplam><th scope="row">Toplam</th><td><b>{fmt(M.totalOpen)}</b></td><td /><td /><td data-durum="durdu"><b>{fmt(M.loss)}</b></td><td /></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        : <p className="tc-fr-bos">Hesaplanamadı.</p>}
      <Aciklama baslik="Yöntem">
        <p>Her satış faturası her ay sonunda bir yaş grubunda bulunur ve bir sonraki ay sonunda ya tahsil edilmiş, ya başka bir yaş grubuna geçmiş, ya da {M ? M.wo : 180} günü aşarak batık sayılmıştır. Geçmiş faturalardaki bu geçişler sayılarak geçiş matrisi P tahmin edilir; az gözlemli satırlar için küçük bir ön bilgi (Laplace düzeltmesi) eklenir.</p>
        <Formul>P = [Q R; 0 I]   N = (I − Q)⁻¹   B = N·R   Beklenen kayıp = Σ bakiyeᵢ · Bᵢ,batık</Formul>
        <p>N temel matristir; satır toplamları, bir alacağın sonuçlanmasına kadar beklenen ay sayısını verir. Bu yaklaşım şüpheli alacak karşılığını tahmin etmek için geliştirilmiş klasik bir yöntemdir. Model, ödeme davranışının durağan olduğunu varsayar; davranış değişirse sonuçlar birkaç ay içinde yeni veriye uyum sağlar.</p>
      </Aciklama>
    </Bolum>
  );
}

const NOT_TONU: Record<string, keyof typeof DERECE_TONU> = { A: 'ok', B: 'ok', C: 'warn', D: 'risk' };

function MusteriRiski({ A }: { A: Analiz }) {
  const cs = A.cs;
  const yogunluk = cs.hhi > 2500 ? 'yüksek' : cs.hhi > 1500 ? 'orta' : 'düşük';
  return (
    <Bolum m="cust" baslik="4. Müşteri risk puanı ve yoğunlaşma" sag={`HHI ${nf(cs.hhi)} · ${yogunluk} yoğunlaşma · eşdeğer müşteri sayısı ${cs.hhi ? nf(10000 / cs.hhi, 1) : '—'}`}>
      <div className="tc-fr-tablo-kutu">
        <table className="tc-fr-tablo">
          <thead><tr><th scope="col">Müşteri</th><th scope="col">Not</th><th scope="col">Puan</th><th scope="col">Ağırlıklı ort. gecikme</th><th scope="col">15+ gün geç ödeme oranı</th><th scope="col">Olağan vade</th><th scope="col">Açık bakiye</th><th scope="col">Portföy çeki</th><th scope="col">12 ay satış payı</th></tr></thead>
          <tbody>
            {cs.list.map((c) => (
              <tr key={String(c.party)}>
                <th scope="row">{c.party}{c.bounced ? <> <Rozet ton="hata">karşılıksız çek</Rozet></> : null}</th>
                <td><Rozet ton={DERECE_TONU[NOT_TONU[c.grade] ?? 'neutral']}>{c.grade}</Rozet></td>
                <td>{c.score}</td>
                <td>{c.avgDelay === null ? '—' : `${nf(c.avgDelay, 1)} gün`}</td>
                <td>{c.lateShare === null ? '—' : pct(c.lateShare, 0)}</td>
                <td>{c.term ? `${nf(c.term)} gün` : '—'}</td>
                <td>{fmt(c.openBal)}</td><td>{fmt(c.chequeBal)}</td><td>{pct(c.share, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Aciklama baslik="Yöntem">
        <p>Puan 100&apos;den başlar; ödeme geçmişi yoksa 75&apos;ten. Kesintiler: ağırlıklı ortalama gecikme × 0,6 (en çok 40), 15 günden geç ödenen faturaların ağırlıklı payı × 25, mevcut en uzun gecikme × 0,2 (en çok 25), her karşılıksız çek için 30 (en çok 40). Ağırlıklar yarı ömrü 180 gün olan üstel azalmayla verilir; yakın tarihli davranış daha belirleyicidir. Not: A ≥ 80, B ≥ 65, C ≥ 45, D &lt; 45.</p>
        <Formul>wᵢ = 0,5^(gün önceᵢ / 180)    HHI = Σ (müşteri payı %)²</Formul>
        <p>Herfindahl-Hirschman endeksi 1.500&apos;ün altında dağınık, 1.500–2.500 arasında orta, 2.500&apos;ün üstünde yüksek yoğunlaşma olarak yorumlanır.</p>
      </Aciklama>
    </Bolum>
  );
}

const ALTMAN_BILESENLERI: [string, number][] = [
  ['X₁ İşletme sermayesi / toplam aktif', 6.56], ['X₂ Birikmiş kârlar / toplam aktif', 3.26],
  ['X₃ Faiz ve vergi öncesi kâr / toplam aktif', 6.72], ['X₄ Özkaynak / toplam borç', 1.05],
];

// Altman bölgeleri (0-1,1 sıkıntı, 1,1-2,6 gri, 2,6-5 güvenli) ve skorun yeri; SVG özniteliğiyle çizilir.
function AltmanBolgesi({ z }: { z: number }) {
  const x = clamp(z / 5, 0, 1) * 100;
  return (
    <figure className="tc-fr-bolge">
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`Bölge: Z'' ${nf(z, 2)}`}>
        <rect data-durum="durdu" className="tc-fr-bolge-dilim" x={0} y={2} width={22} height={6} />
        <rect data-durum="durakli" className="tc-fr-bolge-dilim" x={22} y={2} width={30} height={6} />
        <rect data-durum="calisiyor" className="tc-fr-bolge-dilim" x={52} y={2} width={48} height={6} />
        <rect className="tc-fr-bolge-imle" x={Math.max(0, x - 0.6)} y={0} width={1.2} height={10} />
      </svg>
      <figcaption className="tc-fr-bolge-olcek"><span>0</span><span>1,1</span><span>2,6</span><span>5+</span></figcaption>
    </figure>
  );
}

function AltmanDupont({ A }: { A: Analiz }) {
  const alt = A.alt, dp = A.dp;
  return (
    <Bolum m="altman" baslik="5. Finansal sıkıntı: Altman Z'' ve DuPont analizi">
      {alt
        ? <div className="tc-fr-iki">
            <div>
              <div className="tc-fr-buyuk">{nf(alt.z, 2)}</div>
              <p className="tc-fr-soluk">Gelişmekte olan piyasa sürümü (+3,25): {nf(alt.zEM, 2)}</p>
              <AltmanBolgesi z={alt.z} />
              <div className="tc-fr-tablo-kutu">
                <table className="tc-fr-tablo">
                  <thead><tr><th scope="col">Bileşen</th><th scope="col">Oran</th><th scope="col">Katsayı</th><th scope="col">Katkı</th></tr></thead>
                  <tbody>{ALTMAN_BILESENLERI.map(([ad, k], i) => <tr key={ad}><th scope="row">{ad}</th><td>{nf(alt.x[i], 3)}</td><td>{nf(k, 2)}</td><td><b>{nf(alt.parts[i], 2)}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div>
              {dp && <>
                <h3 className="tc-fr-alt-baslik">DuPont ayrıştırması</h3>
                <Satir ad="Net kâr marjı">{pct(dp.margin)}</Satir>
                <Satir ad="× Aktif devir hızı">{nf(dp.turnover, 2)}</Satir>
                <Satir ad="× Finansal kaldıraç (aktif / özkaynak)">{nf(dp.multiplier, 2)}</Satir>
                <Satir ad="= Özkaynak kârlılığı">{pct(dp.roe)}</Satir>
                <Not>Özkaynak kârlılığının kârlılıktan mı, varlık verimliliğinden mi, yoksa borçtan mı geldiğini gösterir. Kaldıraçtan gelen kârlılık daha risklidir.</Not>
              </>}
            </div>
          </div>
        : <p className="tc-fr-bos">Finansal sağlık ekranında bilanço özetini girin.</p>}
      <Aciklama baslik="Yöntem">
        <p>Z&apos;&apos; modeli, imalat dışı ve halka açık olmayan şirketler için piyasa değeri yerine defter değeri kullanır ve satış/aktif oranını dışarıda bırakır.</p>
        <Formul>Z&apos;&apos; = 6,56·X₁ + 3,26·X₂ + 6,72·X₃ + 1,05·X₄</Formul>
        <p>2,6&apos;nın üstü güvenli, 1,1–2,6 gri, 1,1&apos;in altı sıkıntı bölgesidir. Gelişmekte olan piyasalar için 3,25 sabiti eklenmiş sürüm bilgi amaçlı gösterilir. Faaliyet kârı, son 12 ay net kâr ile faiz giderinin toplamı olarak yaklaşık alınır. Model iflası öngörmek için tasarlanmış bir tarama aracıdır; zamanlamayı söylemez.</p>
      </Aciklama>
    </Bolum>
  );
}

function Anomaliler({ motor, A }: { motor: FinansMotoru; A: Analiz }) {
  const an = A.an;
  return (
    <Bolum m="anom" baslik="6. Gider anomalileri" sag={`Hassasiyet eşiği |z| > ${motor.durum.settings.anomalyZ}`}>
      {an.length
        ? <div className="tc-fr-tablo-kutu">
            <table className="tc-fr-tablo">
              <thead><tr><th scope="col">Tür</th><th scope="col">Kategori</th><th scope="col">Dönem / kayıt</th><th scope="col">Değer</th><th scope="col">Olağan (ortanca)</th><th scope="col">Ölçü</th></tr></thead>
              <tbody>
                {an.map((x) => (
                  <tr key={x.kind === 'ay' ? `ay-${x.cat}-${x.ym}` : `kayit-${x.id}`}>
                    <th scope="row">{x.kind === 'ay' ? 'Aylık toplam' : 'Tek kayıt'}</th>
                    <td>{x.cat}</td>
                    <td>{x.kind === 'ay' ? ymLong(x.ym) : `${fmtD(x.date)} · ${x.party}`}</td>
                    <td>{fmt(x.value)}</td><td>{fmt(x.median)}</td>
                    <td>{x.kind === 'ay' ? `z = ${nf(x.z, 1)}` : `sınır ${fmtK(x.limit)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        : <p className="tc-fr-bos">Olağan dışı bir gider bulunmadı.</p>}
      <Aciklama baslik="Yöntem">
        <p><b>Aylık toplamlar:</b> her gider kategorisinin son tamamlanmış ay toplamı, önceki 11 ayla karşılaştırılır. Ortalama ve standart sapma yerine ortanca ve ortanca mutlak sapma (MAD) kullanılır; böylece aykırı değerler kendilerini gizleyemez.</p>
        <Formul>Mᵢ = 0,6745 · (xᵢ − ortanca) / MAD</Formul>
        <p>|M| &gt; 3,5 olağan dışı kabul edilir (Iglewicz–Hoaglin kuralı). MAD sıfırsa ortalama mutlak sapma kullanılır. <b>Tek kayıtlar:</b> son 60 gündeki bir kayıt, kategorisindeki kayıtların üçüncü çeyreğine 3 × çeyrekler arası açıklık eklenmiş sınırı aşarsa işaretlenir; genellikle yazım hatalarını yakalar.</p>
      </Aciklama>
    </Bolum>
  );
}

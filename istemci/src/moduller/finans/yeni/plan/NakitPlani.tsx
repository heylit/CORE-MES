import { useCallback, useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { kisaTarih, paraMetni, sayiMetni, tarih, tl, YOK } from '../bicim.ts';
import { sayi, type BeklenenOdeme } from '../donustur.ts';
import { yelpaze } from '../gorunum.ts';
import { addDays, fmtK, pct, sum, type FinansMotoru, type Hafta, type Senaryo } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { FinansVerisi } from '../veri.ts';
import { Grafik, saydam, temelAyar, type Renkler } from './grafik.tsx';
import { OzetSeridi, SecimSeridi } from './parcalar.tsx';
import { kopruCubuklari, nakitKoprusu, siparisListesi } from './plan.ts';

type Gorunum = 'olasilik' | 'senaryo';
const GORUNUMLER: readonly (readonly [Gorunum, string])[] = [['olasilik', 'Genel görünüm'], ['senaryo', 'Hafta hafta plan']];

// Nakit planı (prototip VIEWS.nakit, tam kipte beklenen ödemeler paneliyle). Genel görünüm Monte Carlo yelpazesi ve nakit
// köprüsü; hafta hafta plan varsayım kaydırıcılı 13 haftalık tablo. Varsayımlar yalnız bu ekranda yaşar (prototipte de
// gömülü kipte saklanmaz).
export function NakitPlani({ finans }: EkranOzellikleri) {
  const [gorunum, gorunumYaz] = useState<Gorunum>('olasilik');
  if (!finans) return null;
  const { motor, V } = finans;
  return (
    <div className="tc-fy-bolum tc-fc">
      <p className="tc-fy-not">
        {gorunum === 'olasilik'
          ? 'Genel görünüm, binlerce olası senaryodan nakdin hangi aralıkta seyredeceğini gösterir. Hafta hafta plan, kalem kalem beklenen giriş ve çıkışları listeler.'
          : 'Beklenen giriş ve çıkışlar kalem kalem. Varsayımları değiştirerek "müşteriler 30 gün geç öderse?" gibi soruları deneyin.'}
      </p>
      <SecimSeridi etiket="Görünüm" secenekler={GORUNUMLER} secili={gorunum} sec={gorunumYaz} />
      {motor.durum.tx.length === 0
        ? <DurumKutusu durum="bos" mesaj="Tahmin için kayıt gerekiyor." />
        : gorunum === 'olasilik' ? <GenelGorunum finans={finans} /> : <HaftaHafta finans={finans} />}
      <BeklenenOdemeler liste={V.beklenenOdemeler} bugun={motor.bugun} />
    </div>
  );
}

function GenelGorunum({ finans }: { finans: FinansVerisi }) {
  const { motor } = finans;
  const A = motor.runAnalysis();
  const mc = A.mc;
  const th = Number(motor.durum.company.threshold) || 0;
  const riskTol = motor.durum.settings.riskTol;
  if (!mc) return <DurumKutusu durum="bos" mesaj="Tahmin için kayıt gerekiyor." />;
  return (
    <>
      <OzetSeridi etiket="Nakit riski" hucreler={[
        { etiket: 'Eksiye düşme olasılığı', deger: pct(mc.pNeg, 1), alt: `Risk toleransı %${riskTol}`, ton: mc.pNeg >= riskTol / 100 ? 'eksi' : null },
        { etiket: 'Eşik altına inme olasılığı', deger: pct(mc.pBelow, 0), alt: `Eşik ${tl(th)}`, ton: mc.pBelow >= 0.25 ? 'uyari' : null },
        { etiket: 'Ortanca en düşük bakiye', deger: tl(mc.minP50), alt: `Olası dip: ${kisaTarih(addDays(motor.bugun, mc.dipWeek * 7))} haftası` },
        {
          etiket: <span title="Cash-Flow-at-Risk: simülasyonların en kötü %5'inde görülen en düşük bakiye. 'Yüzde 95 olasılıkla nakit bunun altına inmez' diye okunur.">Kötü senaryoda en düşük</span>,
          deger: tl(mc.cfar5), alt: 'Kötümser senaryo', ton: mc.cfar5 < 0 ? 'eksi' : null,
        },
      ]} />
      <Kart baslik="Olası nakit seyri" baslikEki={<span className="tc-fy-not">{sayiMetni(mc.N)} simülasyon</span>}>
        <YelpazeGrafigi motor={motor} />
        <p className="tc-fy-not">
          Her simülasyonda müşterilerin ödeme günleri kendi geçmiş gecikmelerinden, yeni satışlar geçmiş oynaklıktan, çeklerin karşılıksız çıkması
          ayarlardaki olasılıktan rastgele çekilir. Sabit ödemeler, açık borçlar ve tahmini KDV her senaryoda aynıdır. Yöntemin ayrıntısı Tahminler ve doğruluk bölümündedir.
        </p>
      </Kart>
      <NakitKoprusu motor={motor} />
    </>
  );
}

function YelpazeGrafigi({ motor }: { motor: FinansMotoru }) {
  const kur = useCallback((r: Renkler): ChartConfiguration => {
    const mc = motor.runAnalysis().mc!;
    const y = yelpaze(mc);
    const yok = { borderWidth: 0, pointRadius: 0 };
    return {
      type: 'line',
      data: {
        labels: mc.bands.map((_, i) => `${i + 1}. hf · ${kisaTarih(addDays(motor.bugun, i * 7))}`),
        datasets: [
          { label: '_p90', data: y.p90, ...yok, fill: false },
          { label: '%10–90 aralığı', data: y.p10, ...yok, backgroundColor: saydam(r.bakiye, 0.12), fill: '-1' },
          { label: '_p75', data: y.p75, ...yok, fill: false },
          { label: '%25–75 aralığı', data: y.p25, ...yok, backgroundColor: saydam(r.bakiye, 0.2), fill: '-1' },
          {
            label: 'Ortanca', data: y.p50, borderColor: r.bakiye, backgroundColor: r.bakiye, borderWidth: 2.5, tension: 0.3, fill: false,
            pointRadius: y.p50.map((_, i) => (i === y.dipHafta ? 5 : 0)), pointBackgroundColor: y.p50.map((_, i) => (i === y.dipHafta ? r.cikis : r.bakiye)),
          },
          { label: 'Güvenlik eşiği', data: y.esik, borderColor: r.uyari, borderDash: [6, 5], pointRadius: 0, borderWidth: 1.5, fill: false },
        ],
      },
      options: temelAyar(r),
    };
  }, [motor]);
  return <Grafik etiket="Olası nakit seyri: 13 haftalık olasılık yelpazesi" boy="uzun" kur={kur} />;
}

// Grup adı 16 harflik satırlara bölünür; dar ekranda eksen yazısı kırpılmaz.
function satiraBol(ad: string): string | string[] {
  if (ad.length <= 16) return ad;
  return ad.split(' ').reduce<string[]>((acc, w) => {
    const son = acc[acc.length - 1];
    if (son !== undefined && `${son} ${w}`.length <= 16) acc[acc.length - 1] = `${son} ${w}`; else acc.push(w);
    return acc;
  }, []);
}

function NakitKoprusu({ motor }: { motor: FinansMotoru }) {
  const k = useMemo(() => nakitKoprusu(motor), [motor]);
  const girisler = k.parts.filter((p) => p.v > 0).sort((a, b) => b.v - a.v), cikislar = k.parts.filter((p) => p.v < 0).sort((a, b) => a.v - b.v);
  const kur = useCallback((r: Renkler): ChartConfiguration => {
    const cubuk = kopruCubuklari(k);
    const renk = { bakiye: r.bakiye, giris: saydam(r.giris, 0.85), cikis: saydam(r.cikis, 0.75) };
    return {
      type: 'bar',
      data: { labels: cubuk.map((c) => c.etiket), datasets: [{ label: 'Tutar', data: cubuk.map((c) => c.aralik), backgroundColor: cubuk.map((c) => renk[c.tur]), borderRadius: 4, borderSkipped: false }] },
      options: temelAyar(r, {
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: r.metin, titleColor: r.zemin, bodyColor: r.zemin, padding: 10,
            callbacks: {
              label: (c) => {
                const [a, z] = c.raw as [number, number];
                return ` ${c.dataIndex === 0 || c.dataIndex === cubuk.length - 1 ? tl(z) : (z - a >= 0 ? '+' : '') + tl(z - a)}`;
              },
            },
          },
        },
        // Yatay çizilir: sekiz grup adı 360 genişlikte yatay eksende üst üste biniyordu.
        indexAxis: 'y',
        scales: { y: { grid: { display: false }, ticks: { color: r.soluk, autoSkip: false, callback: (_v, i) => satiraBol(cubuk[i]?.etiket ?? '') } }, x: { grid: { color: r.izgara }, ticks: { color: r.soluk, callback: (v) => fmtK(Number(v)) } } },
      }),
    };
  }, [k]);
  return (
    <Kart baslik="Nakit nereden gelip nereye gidiyor?" baslikEki={<span className="tc-fy-not">Önümüzdeki 13 hafta, beklenen plan</span>}>
      <p className="tc-fc-cumle">
        Bugünkü {tl(k.start)} nakde {tl(sum(girisler, (p) => p.v))} girmesi, {tl(-sum(cikislar, (p) => p.v))} çıkması bekleniyor; 13 hafta sonunda {tl(k.end)} kalır.
        {girisler[0] ? ` En büyük giriş: ${girisler[0].g.toLocaleLowerCase('tr')}.` : ''}
        {cikislar[0] ? ` En büyük çıkış: ${cikislar[0].g.toLocaleLowerCase('tr')}.` : ''}
      </p>
      <Grafik etiket="Nakit köprüsü: bugünden 13. haftaya giriş ve çıkış grupları" boy="uzun" kur={kur} />
    </Kart>
  );
}

/* ---------- Hafta hafta plan ---------- */
const KAYDIRICILAR: readonly { k: Exclude<keyof Senaryo, 'newBiz'>; etiket: string; min: number; max: number; adim: number; birim: 'gün' | '%'; yardim: string }[] = [
  { k: 'delay', etiket: 'Tahsilat gecikmesi', min: 0, max: 60, adim: 5, birim: 'gün', yardim: 'Müşteriler vadeden ne kadar geç öder?' },
  { k: 'collect', etiket: 'Gecikmiş alacakların tahsili', min: 0, max: 100, adim: 10, birim: '%', yardim: 'Vadesi geçenlerin ne kadarı 2 hafta içinde gelir?' },
  { k: 'growth', etiket: 'Satış değişimi', min: -40, max: 40, adim: 5, birim: '%', yardim: 'Son 12 haftanın temposuna göre' },
  { k: 'chequeRisk', etiket: 'Çek karşılıksız riski', min: 0, max: 15, adim: 1, birim: '%', yardim: 'Portföydeki çeklerin ne kadarı karşılıksız çıkar?' },
];
const degerMetni = (v: number, birim: 'gün' | '%'): string => (birim === '%' ? `%${v}` : `${v} ${birim}`);

function HaftaHafta({ finans }: { finans: FinansVerisi }) {
  const { motor, V } = finans;
  const [senaryo, senaryoYaz] = useState<Senaryo>(() => ({ ...motor.durum.scen }));
  const [acikHafta, acikHaftaYaz] = useState<number | null>(null);
  const th = Number(motor.durum.company.threshold) || 0;
  const f = useMemo(() => motor.forecast(senaryo), [motor, senaryo]);
  const sp = useMemo(() => motor.siparisPlani(siparisListesi(V.beklenenOdemeler)), [motor, V]);
  const spVar = sp.toplam > 0 || sp.kursuz > 0 || sp.gecikmis > 0;
  const spK = useMemo(() => motor.siparisDahilKapanis(f, sp), [motor, f, sp]);
  const ton = (v: number) => (v < 0 ? 'eksi' as const : v < th ? 'uyari' as const : null);
  const spNotu = `Faturası gelmemiş siparişlerin ödeme planı da düşülür: siparişten ${tl(sp.toplam)}, KDV hariç tahmin.`
    + (sp.kursuz ? ` ${sp.kursuz} kalemin kuru girilmediği için katılmadı.` : '')
    + (sp.gecikmis ? ` Vadesi geçmiş ${sp.gecikmis} kalem katılmadı; listede kontrol edin.` : '')
    + ' Firmaya ödenmiş avans düşülür. Fatura gelince açık borç olarak plana zaten girer ve bu satırdan düşer.';

  const sutunlar: Sutun<Hafta>[] = [
    { anahtar: 'hafta', baslik: 'Hafta', kirilmaz: true, hucre: (w) => <span className="tc-fc-yigin"><span>{w.i + 1}. hafta</span><small className="tc-fy-not">{kisaTarih(w.start)}–{kisaTarih(w.end)}</small></span>, csv: (w) => `${w.i + 1}. hafta` },
    { anahtar: 'acilis', baslik: 'Açılış', hizala: 'sag', mono: true, hucre: (w) => tl(w.open) },
    { anahtar: 'giris', baslik: 'Giriş', hizala: 'sag', mono: true, hucre: (w) => <span className="tc-fc-arti">{tl(w.inflow)}</span>, csv: (w) => w.inflow },
    { anahtar: 'cikis', baslik: 'Çıkış', hizala: 'sag', mono: true, hucre: (w) => <span className="tc-fc-eksi">{tl(w.outflow)}</span>, csv: (w) => w.outflow },
    { anahtar: 'net', baslik: 'Net', hizala: 'sag', mono: true, hucre: (w) => tl(w.net) },
    {
      anahtar: 'kapanis', baslik: 'Kapanış', hizala: 'sag', mono: true,
      hucre: (w) => <b className={w.close < 0 ? 'tc-fc-eksi' : w.close < th ? 'tc-fc-uyari' : ''}>{tl(w.close)}</b>, csv: (w) => w.close,
    },
    ...(spVar ? [{
      anahtar: 'siparis', baslik: 'Siparişten (tahmin)', hizala: 'sag' as const, mono: true,
      hucre: (w: Hafta) => (sp.weeks[w.i]!.tutar ? <span className="tc-fc-eksi">{tl(-sp.weeks[w.i]!.tutar)}</span> : YOK), csv: (w: Hafta) => -sp.weeks[w.i]!.tutar,
    }] : []),
    { anahtar: 'esik', baslik: 'Eşik', hucre: (w) => (w.close < th ? <Rozet ton={w.close < 0 ? 'hata' : 'uyari'}>Eşik altı</Rozet> : null), csv: false },
  ];
  const secili = acikHafta === null ? null : f.weeks[acikHafta] ?? null;
  const seciliKalemler = secili ? [...secili.items, ...sp.weeks[secili.i]!.items].sort((a, b) => a.amt - b.amt) : [];

  return (
    <>
      <Kart baslik="Varsayımlar">
        <div className="tc-fc-varsayim">
          {KAYDIRICILAR.map((s) => (
            <label key={s.k} className="tc-fc-kaydirici">
              <span>{s.etiket}: <b>{degerMetni(senaryo[s.k], s.birim)}</b></span>
              <input
                type="range" min={s.min} max={s.max} step={s.adim} value={senaryo[s.k]}
                onChange={(e) => { const v = Number(e.target.value); senaryoYaz((o) => ({ ...o, [s.k]: v })); }}
              />
              <small className="tc-fy-not">{s.yardim}</small>
            </label>
          ))}
          <label className="tc-fc-onay">
            <input type="checkbox" checked={senaryo.newBiz} onChange={(e) => { const v = e.target.checked; senaryoYaz((o) => ({ ...o, newBiz: v })); }} />
            <span>Yeni satış ve alımları da kat<small className="tc-fy-not">Kapalıyken yalnızca kayıtlı faturalar ve sabit ödemeler hesaplanır</small></span>
          </label>
        </div>
        <div className="tc-fy-dugmeler"><button type="button" className="tc-fc-serit-dugme" onClick={() => senaryoYaz({ ...motor.emptyState().scen })}>Varsayılana dön</button></div>
      </Kart>
      <OzetSeridi etiket="13 haftalık plan" hucreler={[
        { etiket: 'Bugünkü nakit', deger: tl(f.open) },
        { etiket: '13 hafta giriş', deger: tl(sum(f.weeks, (w) => w.inflow)), ton: 'arti' },
        { etiket: '13 hafta çıkış', deger: tl(sum(f.weeks, (w) => w.outflow)), ton: 'eksi' },
        { etiket: 'En düşük nokta', deger: tl(f.min.close), alt: `${f.min.i + 1}. hafta, ${kisaTarih(f.min.start)}`, ton: ton(f.min.close) },
        {
          etiket: '13. hafta sonu', deger: tl(f.end),
          alt: spVar ? <span title={spNotu}>Siparişler dahil <b className={spK[12]! < 0 ? 'tc-fc-eksi' : spK[12]! < th ? 'tc-fc-uyari' : ''}>{tl(spK[12])}</b></span> : '',
        },
      ]} />
      <Kart baslik="Haftalık plan" baslikEki={<span className="tc-fy-not">Çubuklar giriş ve çıkış, çizgi hafta sonu bakiyesi</span>}>
        <HaftalikGrafik motor={motor} f={f} spK={spK} siparisVar={sp.toplam > 0} th={th} />
      </Kart>
      <Kart baslik="Hafta hafta" baslikEki={<span className="tc-fy-not">Satıra dokunarak kalemleri görün</span>}>
        <Tablo<Hafta>
          etiket="Hafta hafta nakit planı" sutunlar={sutunlar} satirlar={f.weeks} satirAnahtari={(w) => w.i}
          satirSec={(w) => acikHaftaYaz((o) => (o === w.i ? null : w.i))}
          arac={{ csv: { ad: 'nakit-plani' } }}
        />
        {secili && (
          <section className="tc-fc-kalemler" aria-label={`${secili.i + 1}. hafta kalemleri`}>
            <h3 className="tc-fy-alt-baslik">{secili.i + 1}. hafta kalemleri ({kisaTarih(secili.start)}–{kisaTarih(secili.end)})</h3>
            {seciliKalemler.length ? (
              <ul className="tc-fc-satirlar">
                {seciliKalemler.map((x, i) => (
                  <li key={i} className="tc-fc-satir"><span>{kisaTarih(x.date)} · {x.label}</span><b className={`tc-fc-tutar ${x.amt < 0 ? 'tc-fc-eksi' : 'tc-fc-arti'}`}>{tl(x.amt)}</b></li>
                ))}
              </ul>
            ) : <p className="tc-fy-not">Kalem yok</p>}
          </section>
        )}
      </Kart>
    </>
  );
}

function HaftalikGrafik({ motor, f, spK, siparisVar, th }: { motor: FinansMotoru; f: ReturnType<FinansMotoru['forecast']>; spK: number[]; siparisVar: boolean; th: number }) {
  const kur = useCallback((r: Renkler): ChartConfiguration => ({
    type: 'bar',
    data: {
      labels: f.weeks.map((w) => `${w.i + 1}. hf`),
      datasets: [
        ...(siparisVar ? [{ type: 'line' as const, label: 'Kapanış (siparişler dahil, tahmin)', data: spK, borderColor: r.cikis, backgroundColor: r.cikis, borderDash: [3, 4], tension: 0.3, borderWidth: 2, pointRadius: 2, order: 1 }] : []),
        { type: 'bar' as const, label: 'Giriş', data: f.weeks.map((w) => w.inflow), backgroundColor: saydam(r.giris, 0.7), borderRadius: 4, order: 3 },
        { type: 'bar' as const, label: 'Çıkış', data: f.weeks.map((w) => -w.outflow), backgroundColor: saydam(r.cikis, 0.6), borderRadius: 4, order: 3 },
        { type: 'line' as const, label: 'Kapanış bakiyesi', data: f.weeks.map((w) => w.close), borderColor: r.bakiye, backgroundColor: r.bakiye, tension: 0.3, borderWidth: 2.5, pointRadius: 3, order: 1 },
        { type: 'line' as const, label: 'Eşik', data: f.weeks.map(() => th), borderColor: r.uyari, borderDash: [6, 5], pointRadius: 0, borderWidth: 1.5, order: 2 },
      ],
    } as ChartConfiguration['data'],
    options: temelAyar(r),
  }), [motor, f, spK, siparisVar, th]);
  return <Grafik etiket="Haftalık plan: giriş, çıkış ve hafta sonu bakiyesi" boy="uzun" kur={kur} />;
}

/* ---------- Siparişten beklenen ödemeler (tam kip paneli, #1124, borç B15) ---------- */
const ODEME_SEKLI: Record<string, string> = { banka: 'Banka havalesi', nakit: 'Nakit', kredi_karti: 'Kredi kartı', cek: 'Çek', senet: 'Senet' };

function BeklenenOdemeler({ liste, bugun }: { liste: readonly BeklenenOdeme[]; bugun: string }) {
  const sutunlar: Sutun<BeklenenOdeme>[] = [
    { anahtar: 'vade', baslik: 'Vade', kirilmaz: true, hucre: (o) => <span className="tc-fc-yigin"><span>{tarih(o.vade)}</span>{o.vade < bugun && <Rozet ton="hata">Gecikmiş, kontrol edin</Rozet>}</span>, csv: (o) => o.vade },
    { anahtar: 'tedarikci', baslik: 'Tedarikçi', hucre: (o) => <span className="tc-fc-yigin"><b>{o.firmaAdi}</b>{o.bagsizFatura && <Rozet ton="uyari">Bağlanmamış fatura var</Rozet>}</span>, csv: (o) => o.firmaAdi },
    { anahtar: 'siparis', baslik: 'Sipariş', hucre: (o) => <span className="tc-fc-yigin"><span>{o.siparisNo || YOK}</span><Rozet>Siparişten beklenen</Rozet></span>, csv: (o) => o.siparisNo },
    { anahtar: 'tur', baslik: 'Ödeme', hucre: (o) => (o.tur === 'avans' ? 'Avans' : 'Vadeli') },
    { anahtar: 'sekil', baslik: 'Ödeme şekli', hucre: (o) => ODEME_SEKLI[o.yontem] ?? o.yontem },
    {
      anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', mono: true,
      hucre: (o) => (
        <span className="tc-fc-yigin">
          <span>{paraMetni(o.tutar, o.paraBirimi)}</span>
          {sayi(o.avansDusulenTl) > 0 && <small className="tc-fy-not">Ödenmiş avans düşüldü: {tl(sayi(o.avansDusulenTl))}</small>}
        </span>
      ),
      csv: (o) => sayi(o.tutar),
    },
  ];
  return (
    <Kart baslik="Siparişten beklenen ödemeler" baslikEki={<span className="tc-fy-not">Satın almanın siparişte girdiği vadeler</span>}>
      <Tablo<BeklenenOdeme> etiket="Siparişten beklenen ödemeler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(o) => o.id} bosMesaj="Siparişten beklenen ödeme yok." />
      <p className="tc-fy-not">
        Tutarlar KDV hariç tahminidir; hafta hafta planda, vade takviminde ve ana sayfada ayrı satır olarak görünür, öteki sayılara ve olasılık hesabına katılmaz.
        Fatura girilip siparişe bağlanınca ödeme açık borç olarak faturadan izlenir ve bu listeden düşer. Vadesi geçmiş satır tahmine girmez; ödendiyse ödemeyi girin.
        Firmaya ödenip faturaya dağıtılmamış para avans satırından düşülür. "Bağlanmamış fatura var" görünürse faturayı satın almada siparişe bağlayın; bağlanana kadar tutar düşülmez.
      </p>
    </Kart>
  );
}

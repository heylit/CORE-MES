import { Fragment, useMemo, useState } from 'react';
import { DurumKutusu, Dugme, IsaretKutusu, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  TALEP_GECMIS_ENAZ, gunAy, gunAyHafta, kullanilabilirlik, ufukAyarOku, ufukAyarYaz, ufukVerisi, yillikAyarOku, zamanKur,
  type MalzemeHaftasi, type MalzemeSatiri, type UfukAyar, type UfukKatmani, type UfukVerisi, type Zaman,
} from './kurallar.ts';
import { GostergeSeridi, Not, SayiGirdisi, SecimDugmeleri, sayi, tl, type Gosterge } from './parcalar.tsx';
import './ufuk.css';
import { ufukGunu } from '../ufuk-olcegi.ts';

// Ufuk (zz39-ufuk.betik): 26 ya da 52 haftaya plan, plan dışı sipariş ve öngörü yükü; malzeme netleştirmesi. Motoru çalıştırmaz: kayıtlı
// planı okur (357 b; eski sayfanın önizlenen planı yeni ekranda yoktur). Sayfa yazmaz; yalnız kendi ayarları (`D.ufuk`) plan.yaz ile değişir.

const KATMAN: [UfukKatmani, string][] = [['plan', 'Plan'], ['kaba', 'Plan dışı sipariş'], ['ongoru', 'Öngörü']];
const KATMAN_AD: Record<UfukKatmani, string> = { plan: 'Plan', kaba: 'Plan dışı sipariş', ongoru: 'Öngörü' };
const miktar = (q: number, b: string): string => `${sayi(q, q < 10 ? 1 : 0)} ${b}`.trim();

export function Ufuk({ calisma, komut, yetki, git }: PlanlamaEkranOzellikleri) {
  const [gor, gorYaz] = useState<'yuk' | 'malzeme'>('yuk');
  const [ongoru, ongoruYaz] = useState(true);
  const [sec, secYaz] = useState<{ g: string; w: number } | null>(null);
  const { bildir } = useBildirim();
  const z = useMemo(() => (calisma === null ? null : zamanKur(calisma.D)), [calisma]);
  const v = useMemo(() => (calisma === null || z === null ? null : ufukVerisi(calisma, z, ongoru)), [calisma, z, ongoru]);
  if (calisma === null) return <div className="tc-pyu"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok. Çalışma kurulunca ufuk burada görünür." /></div>;
  if (z === null) return <div className="tc-pyu"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı; ufuk kurulamıyor." /></div>;
  if (v === null) {
    return <div className="tc-pyu" data-parca="P5"><Kart baslik="Ufuk"><p className="tc-pyu-not">Önce plan kurulmalı.</p></Kart></div>;
  }
  const A = ufukAyarOku(calisma.D);
  const yaz = komut !== null;
  const fg = yetki.maliyetOku;
  const ayarDegistir = (ayrinti: string, fn: (u: UfukAyar) => void): void => {
    komut?.degistir('Ufuk ayarı', (t) => { fn(ufukAyarYaz(t.D)); }, { ayrinti, planKoru: true });
  };
  const notlar = ufukNotlari(calisma, v, ongoru);
  return (
    <div className="tc-pyu" data-parca="P5">
      <Kart baslik="Ufuk" baslikEki={<span className="tc-pyu-kucuk">{v.H[0]?.ad} – {gunAy(z, v.son - 1)} · {A.hafta} hafta · Atölyedeki plan</span>}>
        <div className="tc-pyu-sira">
          <SecimDugmeleri etiket="Görünüm" secili={gor} sec={gorYaz} secenekler={[['yuk', 'Yük', 'gauge'], ['malzeme', 'Malzeme', 'box']]} />
          <SecimDugmeleri etiket="Ufuk" kapali={!yaz} secili={String(A.hafta) as '26' | '52'} secenekler={[['26', '26 hafta'], ['52', '52 hafta']]}
            sec={(h) => { ayarDegistir(`hafta: ${A.hafta} → ${h}`, (u) => { u.hafta = Number(h); }); secYaz(null); }} />
          <IsaretKutusu etiket="Öngörüyü göster" checked={ongoru} onChange={(o) => { ongoruYaz(o.target.checked); }} />
        </div>
        {gor === 'yuk' ? <YukGorunumu v={v} elle={yillikAyarOku(calisma.D).tahmin === 'elle'} ongoru={ongoru} sec={sec} secYaz={secYaz} /> : <MalzemeGorunumu v={v} z={z} calisma={calisma} fg={fg} ongoru={ongoru} />}
        <p className="tc-pyu-not">{notlar}</p>
      </Kart>
      {gor === 'yuk' && sec && <HaftaSecimi v={v} calisma={calisma} sec={sec} kapat={() => { secYaz(null); }} ongoru={ongoru} />}
      <Kart baslik="Varsayımlar" sag={<Dugme simge="chart" onClick={() => { git('yillik'); }}>Yıllık plan</Dugme>}>
        <div className="tc-pyu-alanlar">
          <label className="tc-pyu-alan">
            <span>Adım başı bekleme, iş günü</span>
            <SayiGirdisi etiket="Adım başı bekleme, iş günü" deger={A.kuyruk} max={10} adim={0.5} kapali={!yaz}
              gecersiz={() => { bildir('hata', '0 ile 10 arasında bir sayı girin.'); }}
              yaz={(x) => { if (x === null) { bildir('hata', '0 ile 10 arasında bir sayı girin.'); return; } if (x !== A.kuyruk) ayarDegistir(`adım başı bekleme: ${A.kuyruk} → ${x} iş günü`, (u) => { u.kuyruk = x; }); }} />
          </label>
          <div className="tc-pyu-alan">
            <span>Öngörü malzeme talebine</span>
            <SecimDugmeleri etiket="Öngörü malzeme talebine" kapali={!yaz} secili={String(A.ongoruMalzeme) as 'true' | 'false'} secenekler={[['false', 'Girmesin'], ['true', 'Girsin']]}
              sec={(b) => { ayarDegistir(`öngörü malzeme talebine: ${b === 'true' ? 'girsin' : 'girmesin'}`, (u) => { u.ongoruMalzeme = b === 'true'; }); }} />
          </div>
        </div>
        <p className="tc-pyu-not">
          Plan dışı sipariş ve öngörü partisi terminden geriye zamanlanır: her adım en hızlı tezgâhında, tezgâhın günlük açık saatine bölünerek; üstüne adım başı
          bekleme. Gerçekleşen akış süreleri gelince bu bekleme ölçümden alınacak. Kapasite vardiya takviminden, tatil düşülerek, × kullanılabilirlik
          %{sayi(kullanilabilirlik(calisma.D), 0)}; kişi sınırı ve arıza payı yok.
        </p>
      </Kart>
    </div>
  );
}

function ufukNotlari(c: PlanlamaCalismasi, v: UfukVerisi, ongoru: boolean): string {
  const Y = yillikAyarOku(c.D);
  return [
    `Kaynak: Atölyedeki plan; ilk ${Math.round(ufukGunu() / 7)} hafta ondan, ötesi kaba.`,
    v.kaba.length ? `Planda olmayan ${v.kaba.length} sipariş (${v.kaba.filter((x) => x.havuz).length} havuzda) terminden geriye zamanlandı.` : 'Bütün siparişler planda.',
    v.failJ.size ? `Planda adımı planlanamayan ${v.failJ.size} sipariş var; o adımlar yüke girmedi.` : '',
    v.fasN ? `Fason işlemler (${v.fasN}) tezgâh yükü değildir, sayılmadı.` : '',
    !ongoru ? 'Öngörü gizli.'
      : Y.tahmin === 'elle' ? 'Öngörü: elle girilen aylık aile tahmini, ürüne sipariş payıyla bölündü; aynı ay ve üründeki sipariş tahmini tüketir. Ayarı Yıllık plan sayfasındadır.'
      : v.gec.hiz ? `Öngörü: kapanmış ve açık siparişlerin ${v.gec.dusuk ? `${sayi(v.gec.hafta, 0)} haftalık girişi, en az ${TALEP_GECMIS_ENAZ} haftaya bölündü (düşük güven, giriş geldikçe düzelir)` : `son ${sayi(v.gec.hafta, 0)} haftalık giriş hızı`}, yıllık büyüme %${sayi(Y.buyume || 0, 0)}; aynı ay ve üründeki sipariş tahmini tüketir. Termin ve plan hız sayılmaz. Ayarı Yıllık plan sayfasındadır.`
      : 'Öngörü yok: sipariş girişi yok. Termin ve plan hız sayılmaz. Yıllık plan sayfasında "Elle" seçip aylık tahmin girin.',
  ].filter(Boolean).join(' ');
}

function YukGorunumu({ v, elle, ongoru, sec, secYaz }: { v: UfukVerisi; elle: boolean; ongoru: boolean; sec: { g: string; w: number } | null; secYaz: (s: { g: string; w: number } | null) => void }) {
  const top = (k: UfukKatmani): number => v.sat.reduce((a, s) => a + s.w.reduce((b, c) => b + c[k], 0), 0);
  const asim = v.sat.reduce((a, s) => a + s.w.filter((c) => c.o > 1.0001).length, 0);
  const enDolu = v.sat.map((s) => ({ g: s.g, ...s.w.reduce((b, c, i) => (c.o > b.o ? { o: c.o, i } : b), { o: -1, i: 0 }) })).sort((a, b) => b.o - a.o)[0];
  const gec = v.kaba.filter((x) => x.gec > 0.05);
  const kpi: Gosterge[] = [
    { simge: 'gantt', ad: 'Plan yükü', deger: `${sayi(top('plan'), 0)} sa`, alt: `ilk ${Math.round(ufukGunu() / 7)} hafta, motorun planı` },
    { simge: 'list', ad: 'Plan dışı sipariş', deger: `${sayi(top('kaba'), 0)} sa`, alt: `${v.kaba.length} sipariş, kaba` },
    ...(!ongoru ? [] : !elle && !v.gec.hiz
      ? [{ simge: 'chart' as const, ad: 'Öngörü', deger: 'giriş yok', alt: 'sipariş girişi yok; Yıllık planda elle girilebilir', ton: 'uyari' as const }]
      : !elle && v.gec.dusuk
        ? [{ simge: 'chart' as const, ad: 'Öngörü', deger: `${sayi(top('ongoru'), 0)} sa`, alt: `düşük güven: ${sayi(v.gec.hafta, 0)} hafta giriş`, ton: 'uyari' as const }]
        : [{ simge: 'chart' as const, ad: 'Öngörü', deger: `${sayi(top('ongoru'), 0)} sa`, alt: `${v.ong.length} ürün-ay partisi` }]),
    { simge: 'alert', ad: 'Kapasiteyi aşan', deger: `${asim} hücre`, alt: enDolu && enDolu.o > 0 ? `en dolu: ${enDolu.g} ${v.H[enDolu.i]?.ad ?? ''} haftası %${sayi(enDolu.o * 100, 0)}` : 'yok', ton: asim ? 'uyari' : 'tamam' },
    { simge: 'clock', ad: 'Termine yetişmeyen', deger: `${gec.length} sipariş`, alt: gec.length ? 'plan dışı; bugün başlasa bile' : 'plan dışı siparişlerde yok', ton: gec.length ? 'hata' : 'tamam' },
  ];
  const sinir = v.H.findIndex((w) => !w.plan);
  const katmanlar = KATMAN.filter(([k]) => k !== 'ongoru' || ongoru);
  return (
    <>
      <GostergeSeridi l={kpi} />
      <div className="tc-pyu-kaydir">
        <table className="tc-pyu-matris tc-pyu-ufuk">
          <thead>
            <tr>
              <th scope="col">Grup</th>
              {v.H.map((w, i) => <th key={w.k} scope="col" data-kaba={w.plan ? undefined : ''} data-sinir={i === sinir ? '' : undefined} title={`${w.ad} haftası${w.plan ? ', plan ufkunda' : ', kaba'}`}>{w.ad}</th>)}
            </tr>
          </thead>
          <tbody>
            {v.sat.map((s) => (
              <tr key={s.g}>
                <th scope="row"><b>{s.g}</b><small>{s.n} tezgâh</small></th>
                {s.w.map((c, i) => {
                  const ton = !Number.isFinite(c.o) || c.o > 1.0001 ? 'hata' : c.o > 0.85 ? 'uyari' : c.o > 0.6 ? 'dolu' : undefined;
                  const bos = c.top < 0.05;
                  const t = `${s.g}, ${v.H[i]?.ad ?? ''} haftası: plan ${sayi(c.plan, 0)} sa, plan dışı ${sayi(c.kaba, 0)} sa${ongoru ? `, öngörü ${sayi(c.ongoru, 0)} sa` : ''}; kapasite ${sayi(c.kap, 0)} sa`;
                  let x = 0;
                  return (
                    <td key={i} data-sinir={i === sinir ? '' : undefined}>
                      <button type="button" className="tc-pyu-uf-h" data-ton={ton} data-kaba={v.H[i]?.plan ? undefined : ''} aria-pressed={sec?.g === s.g && sec.w === i} title={t} aria-label={t}
                        onClick={() => { secYaz(sec?.g === s.g && sec.w === i ? null : { g: s.g, w: i }); }}>
                        <span>{bos ? '·' : Number.isFinite(c.o) ? `%${sayi(c.o * 100, 0)}` : 'kapasite yok'}</span>
                        {!bos && (
                          <svg className="tc-pyu-uf-cubuk" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                            {katmanlar.map(([k]) => {
                              const pay = c.kap > 0 ? Math.min(100, c[k] / c.kap * 100) : 0;
                              if (pay <= 0) return null;
                              const r = <rect key={k} className={`tc-pyu-kat-${k}`} x={x} y={0} width={Math.min(pay, 100 - x)} height={4} />;
                              x += pay;
                              return r;
                            })}
                          </svg>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="tc-pyu-lejant">
        {katmanlar.map(([k, ad]) => <li key={k}><i className={`tc-pyu-kat-${k}`} />{ad}</li>)}
        <li><i className="tc-pyu-kat-kaba-desen" />{ufukGunu()}. günden sonrası kaba</li>
      </ul>
      <p className="tc-pyu-not">Hücre: haftanın yükü, kapasitenin %'si; alttaki çizgi katmanların payı. Taralı sütunlar motorun ufku dışıdır. Hücreye basınca o haftanın işleri aşağıda listelenir.</p>
    </>
  );
}

interface IsSatiri { kat: UfukKatmani; j: string; h: number; adim: Set<string> }

function HaftaSecimi({ v, calisma, sec, kapat, ongoru }: { v: UfukVerisi; calisma: PlanlamaCalismasi; sec: { g: string; w: number }; kapat: () => void; ongoru: boolean }) {
  const r = v.sat.find((x) => x.g === sec.g);
  const c = r?.w[sec.w]; const w = v.H[sec.w];
  if (!r || !c || !w) return null;
  const gr = new Map<string, IsSatiri>();
  for (const y of v.yuk) {
    if (y.g !== sec.g || y.w0 === null || y.w1 === null || y.w0 > sec.w || y.w1 < sec.w || (!ongoru && y.kat === 'ongoru')) continue;
    const k = `${y.kat}|${y.j}`;
    const x = gr.get(k) ?? { kat: y.kat, j: y.j, h: 0, adim: new Set<string>() };
    x.h += y.h * (y.w1 > y.w0 ? 1 / (y.w1 - y.w0 + 1) : 1);
    const ad = y.op ? y.op.split('.').slice(1).join('.') : y.adim;
    if (ad) x.adim.add(ad);
    gr.set(k, x);
  }
  const satirlar = [...gr.values()].sort((a, b) => b.h - a.h);
  const sutun: Sutun<IsSatiri>[] = [
    { anahtar: 'kat', baslik: 'Katman', hucre: (x) => <span className="tc-pyu-kat"><i className={`tc-pyu-kat-${x.kat}`} />{KATMAN_AD[x.kat]}</span> },
    { anahtar: 'is', baslik: 'İş', hucre: (x) => {
      const sp = calisma.D.siparisler.find((q) => q.id === x.j);
      return <span className="tc-pyu-grup"><b className="mono">{x.j}</b>{sp && <small>{calisma.D.urunler.find((u) => u.id === sp.urun)?.ad ?? sp.urun} · {sp.adet} adet · termin {String(sp.termin ?? '—').slice(0, 10)}</small>}</span>;
    } },
    { anahtar: 'adim', baslik: 'Adım', mono: true, hucre: (x) => [...x.adim].join(', ') },
    { anahtar: 'h', baslik: 'Saat', hizala: 'sag', hucre: (x) => `${sayi(x.h, 1)} sa` },
  ];
  const gec = v.kaba.filter((x) => x.gec > 0.05 && x.r.adim.some((a) => a.g === sec.g));
  return (
    <Kart baslik={`${sec.g} · ${w.ad} haftası`} baslikEki={<span className="tc-pyu-kucuk">{w.plan ? 'plan ufkunda' : 'kaba'} · yük {sayi(c.top, 0)} sa / kapasite {sayi(c.kap, 0)} sa</span>}
      sag={<Dugme simge="x" onClick={kapat} aria-label="Kapat" />}>
      {satirlar.length ? <Tablo etiket="Haftanın işleri" sutunlar={sutun} satirlar={satirlar} satirAnahtari={(x) => `${x.kat}|${x.j}`} />
        : <p className="tc-pyu-not">Bu hafta bu grupta iş yok.</p>}
      {gec.length > 0 && <Not ton="uyari">Termine yetişmeyen plan dışı sipariş: {gec.map((x) => `${x.s.id} (${sayi(x.gec / 24, 1)} gün)`).join(', ')}.</Not>}
    </Kart>
  );
}

function MalzemeGorunumu({ v, z, calisma, fg, ongoru }: { v: UfukVerisi; z: Zaman; calisma: PlanlamaCalismasi; fg: boolean; ongoru: boolean }) {
  const [ac, acYaz] = useState<string | null>(null);
  const A = ufukAyarOku(calisma.D);
  const M = v.mal;
  const gec = M.filter((m) => m.gec); const yakin = M.filter((m) => m.yakin);
  const yeniTL = M.some((m) => m.fiyat === null && m.yeniQ > 0) ? null : M.reduce((a, m) => a + (m.fiyat ?? 0) * m.yeniQ, 0);
  const kpi: Gosterge[] = [
    { simge: 'box', ad: 'Malzeme', deger: `${M.length} kalem`, alt: 'ufuktaki siparişlerin ve öngörünün' },
    { simge: 'cart', ad: 'Yeni alım', deger: fg ? tl(yeniTL) : `${M.filter((m) => m.yeniQ > 0).length} kalem`, alt: A.ongoruMalzeme ? 'öngörü dahil' : 'yalnız siparişler; öngörü dahil değil', ton: 'uyari' },
    { simge: 'truck', ad: 'Öne çekilecek açık sipariş', deger: String(M.reduce((a, m) => a + m.one.length, 0)), alt: 'söz tarihi ihtiyaçtan sonra' },
    { simge: 'alert', ad: 'Talep tarihi geçmiş', deger: `${gec.length} kalem`, alt: gec.length ? 'tedarik süresi yetmiyor' : 'yok', ton: gec.length ? 'hata' : 'tamam' },
    { simge: 'clock', ad: 'Bu hafta talep', deger: `${yakin.length} kalem`, alt: 'en geç talep 7 gün içinde', ton: yakin.length ? 'uyari' : 'tamam' },
  ];
  const sutunSayisi = ongoru ? 9 : 8;
  return (
    <>
      <GostergeSeridi l={kpi} />
      <div className="tc-pyu-kaydir">
        <table className="tc-pyu-matris tc-pyu-mal">
          <thead>
            <tr>
              <th scope="col">Malzeme</th><th scope="col">Plan</th><th scope="col">Plan dışı</th>{ongoru && <th scope="col">Öngörü</th>}
              <th scope="col">Eldeki</th><th scope="col">Yoldaki</th><th scope="col">Yeni alım</th><th scope="col">En geç talep</th><th scope="col">Durum</th>
            </tr>
          </thead>
          <tbody>
            {M.length === 0 && <tr><td colSpan={sutunSayisi} className="tc-pyu-kucuk">Ufukta malzeme ihtiyacı yok.</td></tr>}
            {M.map((m) => (
              <Fragment key={m.kod}>
                <tr data-ton={m.gec ? 'hata' : undefined}>
                  <th scope="row">
                    <button type="button" className="tc-pyu-mal-ac" aria-expanded={ac === m.kod} onClick={() => { acYaz(ac === m.kod ? null : m.kod); }}>
                      <Simge ad={ac === m.kod ? 'down' : 'chev-right'} boyut="k" /><b className="mono">{m.kod}</b>
                    </button>
                    <small>{m.ad}</small>
                  </th>
                  <td>{miktar(m.plan, m.birim)}</td><td>{miktar(m.kaba, m.birim)}</td>{ongoru && <td className="tc-pyu-ong">{miktar(m.ongoru, m.birim)}</td>}
                  <td>{miktar(m.stok, m.birim)}</td><td>{miktar(m.yol, m.birim)}</td>
                  <td><b>{miktar(m.yeniQ, m.birim)}</b>{fg && m.yeniQ > 0 && <small>{m.fiyat === null ? <span className="tc-pyu-ton" data-ton="uyari">fiyat yok</span> : tl(m.fiyat * m.yeniQ)}</small>}</td>
                  <td>{m.ilkTalep === null ? '—' : <span className="mono">{gunAyHafta(z, m.ilkTalep)}</span>}</td>
                  <td><MalzemeDurumu m={m} /></td>
                </tr>
                {ac === m.kod && <tr className="tc-pyu-mal-ayrinti"><td colSpan={sutunSayisi}><MalzemeAyrintisi v={v} z={z} m={m} fg={fg} ongoru={ongoru} dahil={A.ongoruMalzeme} calisma={calisma} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tc-pyu-not">
        İhtiyaç ilk adımın başındadır. Eldeki ve yoldaki zaman sırasıyla düşülür; yoldaki, söz tarihi + tedarikçinin ortalama gecikmesi + muayeneyle gelir. Yetmezse önce
        sonra gelecek açık sipariş öne çekilir, kalanı yeni alımdır. En geç talep = ihtiyaç − muayene − tedarik süresi.{' '}
        {A.ongoruMalzeme ? 'Öngörü talebe girer.' : 'Öngörü yalnız görünür, talebe girmez (Varsayımlar).'}
        {v.malzemesiz.size ? ` Malzemesi bilinmeyen öngörü: ${[...v.malzemesiz].join(', ')}.` : ''} Talep satın alma modülünde açılır; bağlamada bu satırdan.
      </p>
    </>
  );
}

function MalzemeDurumu({ m }: { m: MalzemeSatiri }) {
  if (m.gec) return <Rozet ton="hata">gecikti</Rozet>;
  if (m.yakin) return <Rozet ton="uyari">bu hafta</Rozet>;
  if (m.yeniQ > 0) return <Rozet ton="bilgi">ileride</Rozet>;
  return <Rozet ton="tamam">yeterli</Rozet>;
}

function MalzemeAyrintisi({ v, z, m, fg, ongoru, dahil, calisma }: { v: UfukVerisi; z: Zaman; m: MalzemeSatiri; fg: boolean; ongoru: boolean; dahil: boolean; calisma: PlanlamaCalismasi }) {
  const kol = v.H.filter((_, i) => { const s = m.satir[i]; return s && (s.plan || s.kaba || (ongoru && s.ongoru) || s.gelen || s.yeni || s.talep); });
  const sat = (ad: string, f: (s: MalzemeHaftasi) => number | null, sifir = false, ton?: string) => (
    <tr data-ton={ton}>
      <th scope="row">{ad}</th>
      {kol.map((w) => {
        const s = m.satir[w.k]; const x = s ? f(s) : null;
        return <td key={w.k}>{x === null || (!sifir && Math.abs(x) < 1e-6) ? '·' : sayi(x, x < 10 && x > -10 ? 1 : 0)}</td>;
      })}
    </tr>
  );
  const ted = (id: string): string => {
    const t = (Array.isArray(calisma.D.tedarikciler) ? calisma.D.tedarikciler as { id?: unknown; ad?: unknown }[] : []).find((x) => x.id === id);
    return typeof t?.ad === 'string' ? t.ad : id || '—';
  };
  const bugun = Math.floor(v.now / 24) * 24;
  return (
    <div className="tc-pyu-govde">
      {kol.length > 0 && (
        <div className="tc-pyu-kaydir">
          <table className="tc-pyu-matris">
            <thead><tr><th scope="col">{m.birim}</th>{kol.map((w) => <th key={w.k} scope="col" data-kaba={w.plan ? undefined : ''}>{w.ad}</th>)}</tr></thead>
            <tbody>
              {sat('İhtiyaç, plan', (s) => s.plan)}
              {sat('İhtiyaç, plan dışı', (s) => s.kaba)}
              {ongoru && sat(`Öngörü${dahil ? '' : ' (talebe girmez)'}`, (s) => s.ongoru)}
              {sat('Gelecek açık sipariş', (s) => s.gelen)}
              {sat('Yeni alım, ihtiyaç haftası', (s) => s.yeni)}
              {sat('Talep, en geç haftası', (s) => s.talep, false, 'uyari')}
              {sat('Hafta sonu eldeki', (s) => (s.son === null || Math.abs(s.son) < 1e-6 ? 0 : s.son), true)}
            </tbody>
          </table>
        </div>
      )}
      {m.one.length > 0 && (
        <p className="tc-pyu-not"><Simge ad="truck" boyut="k" /> Öne çekilecek: {m.one.map((o) => `açık sipariş #${o.po + 1} (${ted(o.ted)}) ${miktar(o.q, m.birim)}, gelişi ${gunAyHafta(z, o.geli)}, gereken ${gunAyHafta(z, o.ihtiyac)}`).join('; ')}.</p>
      )}
      {m.yeni.length ? (
        <ul className="tc-pyu-veri">
          {m.yeni.slice(0, 12).map((y) => (
            <li key={`${y.j}-${y.ihtiyac}`}>
              <span><b className="mono">{y.j}</b> <small>{KATMAN_AD[y.kat]}</small> · ihtiyaç {gunAyHafta(z, y.ihtiyac)}</span>
              <span>{miktar(y.q, m.birim)} · talep en geç <b className="mono tc-pyu-ton" data-ton={y.talep < bugun ? 'hata' : undefined}>{gunAyHafta(z, y.talep)}</b></span>
            </li>
          ))}
          {m.yeni.length > 12 && <li className="tc-pyu-kucuk">ve {m.yeni.length - 12} satır daha</li>}
        </ul>
      ) : <p className="tc-pyu-not">Yeni alım gerekmiyor.</p>}
      <p className="tc-pyu-not">Tedarik {sayi(m.tedarikGun, 1)} gün, muayene {sayi(m.muayeneGun, 1)} gün{fg && m.fiyat !== null ? `, birim fiyat ${tl(m.fiyat)}` : ''}.</p>
    </div>
  );
}

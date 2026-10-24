import { useMemo, useState } from 'react';
import {
  DurumKutusu, Dugme, FormPenceresi, Girdi, IsaretKutusu, Kart, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  HDAYS, HS_DURUM, TALEP_GECMIS_ENAZ, YL_ACIL, darbogazlar, kullanilabilirlik, planUretimi, urunAileleri, yillikAyarOku, yillikAyarYaz, yillikAylar,
  yillikHedefKur, yillikOzet, yillikVeri, zamanKur, type Darbogaz, type YillikAyar, type Zaman,
} from './kurallar.ts';
import { GostergeSeridi, Not, SayiGirdisi, SecimDugmeleri, sayi, tl, type Gosterge, type Ton } from './parcalar.tsx';
import { useYillikDurum, yillikAnahtari, yillikCoz, type YillikDurum } from './yillik-durum.ts';
import './ufuk.css';

// Yıllık plan (zz9-yillik.betik; sade sayfası zz25-sade-takvim.betik SADE.yillik): Özet, Veri gir ve Tüm ayrıntılar. Kaba kapasite planıdır:
// aile ve tezgâh grubu düzeyinde, sırasız. HiGHS tarayıcıda çözer (motor değildir, 357 b); sonuç yalnız ekranda tutulur. Ayarlar ve elle
// tahmin çalışmanın `D.yillik` alanına `komut.degistir` ile yazılır (plan.yaz, 223 a). TL yalnız maliyet okuyabilen görür.

type Sekme = 'ozet' | 'gir' | 'tum';
type Bitti = Extract<YillikDurum, { durum: 'bitti' }>;
const AYAR_ADI: Record<string, string> = {
  tahmin: 'Talep tahmini', buyume: 'Yıllık büyüme %', mesaiMaks: 'Ek mesai sınırı %', yatirim: 'Yatırım adayları', teslimAy: 'Yeni tezgâhın en erken geliş ayı',
  gecTL: 'Geç teslim bedeli %/gün', stokTL: 'Stok taşıma %/ay',
};
const ayarYaz = (k: string, v: unknown): string => (k === 'tahmin' ? (v === 'elle' ? 'Elle' : 'Geçmişten') : k === 'yatirim' ? (v ? 'Dene' : 'Deneme') : String(v));

export function YillikPlan({ calisma, komut, yetki, git }: PlanlamaEkranOzellikleri) {
  const [sek, sekYaz] = useState<Sekme>('ozet');
  const [form, formYaz] = useState<'varsayim' | 'elle' | null>(null);
  const durum = useYillikDurum();
  const { bildir } = useBildirim();
  if (calisma === null) return <div className="tc-pyu"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok. Çalışma kurulunca yıllık plan burada hesaplanır." /></div>;
  const z = zamanKur(calisma.D);
  if (z === null) return <div className="tc-pyu"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı; yıllık plan kurulamıyor." /></div>;
  const yaz = komut !== null;
  const fg = yetki.maliyetOku;
  const anah = yillikAnahtari(calisma);
  const y = durum !== null && durum.anah === anah ? durum : null;
  const bayat = durum !== null && durum.anah !== anah;
  const coz = (): void => { void yillikCoz(calisma).then((h) => { if (h) bildir('hata', h); }); };
  const ayarDegistir = (ne: string, ayrinti: string, fn: (A: YillikAyar) => void, planKoru = true): void => {
    komut?.degistir(ne, (t) => { fn(yillikAyarYaz(t.D)); }, { ayrinti, planKoru });
  };
  const ortak = { calisma, z, yaz, fg, durum, y, bayat, coz, ayarDegistir, bildir: (m: string) => { bildir('hata', m); } };
  const sekmeler = [
    { anahtar: 'ozet' as const, baslik: 'Özet', simge: 'eye' as const },
    ...(yaz ? [{ anahtar: 'gir' as const, baslik: 'Veri gir', simge: 'plus' as const }] : []),
    { anahtar: 'tum' as const, baslik: 'Tüm ayrıntılar', simge: 'list' as const },
  ];
  const secili = sek === 'gir' && !yaz ? 'ozet' : sek;
  return (
    <div className="tc-pyu" data-parca="P5">
      <header className="tc-pyu-ust">
        <div className="tc-pyu-baslik">
          <h2><Simge ad="chart" />Yıllık plan</h2>
          <p>Önümüzdeki bir yılda hangi tezgâh grubunun yeteceğini, nerede ek mesai ya da yeni tezgâh gerektiğini kabaca gösterir.</p>
        </div>
        <Sekmeler etiket="Yıllık plan bölümleri" sekmeler={sekmeler} secili={secili} sec={sekYaz} />
      </header>
      {secili === 'ozet' && <Ozet {...ortak} formAc={(f) => { sekYaz('gir'); formYaz(f); }} tumAc={() => { sekYaz('tum'); }} />}
      {secili === 'gir' && <VeriGir fg={fg} ac={formYaz} />}
      {secili === 'tum' && <TumAyrintilar {...ortak} git={() => { git('ufuk'); }} />}
      {yaz && form === 'varsayim' && <VarsayimFormu kapat={() => { formYaz(null); }} calisma={calisma} fg={fg} ayarDegistir={ayarDegistir} />}
      {yaz && form === 'elle' && <ElleFormu kapat={() => { formYaz(null); }} calisma={calisma} z={z} ayarDegistir={ayarDegistir} />}
    </div>
  );
}

interface Ortak {
  calisma: PlanlamaCalismasi; z: Zaman; yaz: boolean; fg: boolean; durum: YillikDurum | null; y: YillikDurum | null; bayat: boolean;
  coz: () => void; ayarDegistir: (ne: string, ayrinti: string, fn: (A: YillikAyar) => void, planKoru?: boolean) => void; bildir: (m: string) => void;
}

// ---------- Özet ----------
const NASIL = [
  'Ürünler ailelere, tezgâhlar gruplara toplanır; plan sıra değil, her dönemde ne kadar iş yapılabileceğini gösterir.',
  'İlk 13 hafta haftalık, sonrası aylık bakılır. Her dönemin talebi o döneme düşen sipariş ile tahminin büyüğüdür.',
  'Tahmin ya eldeki siparişlerin hızından (büyüme oranıyla) ya da sizin girdiğiniz aylık adetlerden gelir.',
  'Kapasite yetmezse önce ek mesai (sınıra kadar), sonra yeni tezgâh denenir; o da yetmezse "kapasite açığı" görünür.',
  'Varsayım ya da veri değişince plan eskir; yeniden çözün.',
];
interface Is { simge: SimgeAdi; metin: string; neden?: string; ton?: Ton; dugme?: { ad: string; simge: SimgeAdi; yap: () => void; birincil?: boolean } }

function Ozet({ calisma, yaz, durum, y, bayat, coz, ayarDegistir, formAc, tumAc }: Ortak & { formAc: (f: 'varsayim' | 'elle') => void; tumAc: () => void }) {
  const A = yillikAyarOku(calisma.D);
  const b = y?.durum === 'bitti' ? y : null;
  const o = b ? yillikOzet(b.v, b.sonuc) : null;
  const gr = b ? b.v.gruplar.map((g) => {
    const l = b.sonuc.grup[g] ?? []; const kap = l.reduce((a, x) => a + x.kap, 0);
    return { g, ort: kap > 0 ? l.reduce((a, x) => a + x.yuk, 0) / kap : null, e: l.reduce((a, x) => a + x.e, 0) };
  }).sort((p, q) => q.e - p.e || (q.ort ?? 0) - (p.ort ?? 0)) : [];
  const dr: [string, Ton | undefined, string] = durum === null ? ['çözülmedi', 'uyari', 'Yıllık planı çöz ile hesaplanır']
    : durum.durum === 'hesap' ? ['hesaplanıyor', undefined, durum.adim] : durum.durum === 'hata' ? ['çözülemedi', 'hata', durum.hata]
    : bayat ? ['eski', 'uyari', 'veri ya da varsayım değişti'] : ['güncel', 'tamam', `${b?.P.length ?? 0} dönem`];
  const k: Gosterge[] = [
    { simge: 'chart', ad: 'Yıllık plan', deger: dr[0], ton: dr[1], alt: dr[2] },
    { simge: 'edit', ad: 'Talep tahmini', deger: A.tahmin === 'elle' ? 'Elle' : 'Geçmişten', alt: A.tahmin === 'elle' ? 'aylık adetler elle girilir' : `yıllık büyüme %${sayi(A.buyume || 0, 0)}` },
  ];
  if (o) {
    k.push({ simge: 'check', ad: 'Zamanında karşılanan', deger: o.zamaninda === null ? '—' : `%${sayi(o.zamaninda * 100, 1)}`, ton: o.zamaninda !== null && o.zamaninda < 0.95 ? 'uyari' : 'tamam', alt: `${sayi(o.topD, 0)} adet yıllık talep` });
    k.push({ simge: 'alert', ad: 'Kapasite açığı', deger: `${sayi(o.acil, 0)} sa`, ton: o.acil > 0.5 ? 'hata' : 'tamam', alt: o.acil > 0.5 ? `en çok ${gr[0]?.g ?? ''}` : o.mesai > 0.5 ? `${sayi(o.mesai, 0)} sa ek mesaiyle yetiyor` : 'kapasite yetiyor' });
    const enY = [...gr].sort((p, q) => (q.ort ?? 0) - (p.ort ?? 0))[0];
    if (enY) k.push({ simge: 'gauge', ad: 'En yüklü grup', deger: enY.g, alt: `ortalama %${sayi((enY.ort ?? 0) * 100, 0)} dolu` });
  }
  const l: Is[] = [];
  if (durum?.durum === 'hesap') l.push({ simge: 'cpu', metin: 'Yıllık plan hesaplanıyor', neden: durum.adim });
  else {
    if (A.tahmin === 'elle' && !Object.values(A.elle).some((m) => Object.keys(m).length)) {
      l.push({ simge: 'edit', ton: 'uyari', metin: 'Elle tahmin seçili ama hiç adet girilmedi', neden: 'Boş ay tahminsiz sayılır; yalnız eldeki siparişler hesaba girer.',
        ...(yaz ? { dugme: { ad: 'Tahmin gir', simge: 'edit' as const, yap: () => { formAc('elle'); }, birincil: true } } : {}) });
    }
    if (!b || !o) {
      l.push({ simge: 'play', ton: durum?.durum === 'hata' ? 'hata' : 'uyari', metin: !durum ? 'Yıllık plan henüz hesaplanmadı' : durum.durum === 'hata' ? 'Yıllık plan çözülemedi' : 'Yıllık plan eski',
        neden: 'Bir yıllık talebe göre tezgâh gruplarının yükü hesaplanır; birkaç saniye sürer.', dugme: { ad: 'Yıllık planı çöz', simge: 'cpu', yap: coz, birincil: true } });
    } else {
      for (const g of gr.filter((x) => x.e > 0.5).slice(0, 2)) {
        l.push({ simge: 'alert', ton: 'hata', metin: `${g.g} grubunda kapasite yetmiyor`, neden: `Ek mesai ve yatırımla da karşılanmayan ${sayi(g.e, 0)} sa yük var. Hangi dönemde sıkıştığını ayrıntıda görün.`, dugme: { ad: 'Ayrıntı', simge: 'eye', yap: tumAc } });
      }
      for (const x of b.sonuc.yat.slice(0, 2)) {
        l.push({ simge: 'cpu', ton: 'uyari', metin: `${x.g} grubuna bir tezgâh önerisi`, neden: `${b.P[x.t]?.uzun ?? ''} başından devreye girerse yıllık plan rahatlar.`, dugme: { ad: 'Ayrıntı', simge: 'eye', yap: tumAc } });
      }
      const h = A.hedef ?? yillikHedefKur(calisma.D, b.v, b.P, b.sonuc);
      if (A.hedef) {
        l.push({ simge: 'target', ton: 'tamam', metin: 'Haftalık hedef planlama motorunda', neden: 'Öne üretilecek siparişler hedef haftaya çekildi. Kaldırırsanız motor yalnız terminlere bakar.',
          ...(yaz ? { dugme: { ad: 'Hedefi kaldır', simge: 'x' as const, yap: () => { ayarDegistir('Yıllık hedef kaldırıldı', '', (Y) => { Y.hedef = null; }, false); } } } : {}) });
      } else if (h.hedef.length) {
        l.push({ simge: 'target', metin: 'İleride kapasite yetmediği için bazı işler öne alınmalı', neden: `${h.hedef.length} hafta için öne üretim hedefi var. Motora verilince bu siparişler öne alınır.`,
          ...(yaz ? { dugme: { ad: 'Hedefi motora ver', simge: 'target' as const, yap: () => { ayarDegistir('Yıllık hedef motora verildi', `${h.hedef.length} hafta-aile hedefi`, (Y) => { Y.hedef = h; }, false); } } } : {}) });
      }
      if (!l.length) l.push({ simge: 'check', ton: 'tamam', metin: 'Bir yıl boyunca kapasite yetiyor', neden: o.mesai > 0.5 ? `Toplam ${sayi(o.mesai, 0)} sa ek mesai ile.` : 'Ek mesai gerekmiyor.' });
    }
  }
  return (
    <div className="tc-pyu-govde">
      <GostergeSeridi l={k} />
      <Kart baslik="Şimdi ne yapmalı">
        <ul className="tc-pyu-isler">
          {l.map((x) => (
            <li key={x.metin} data-ton={x.ton}>
              <span className="tc-pyu-is-simge"><Simge ad={x.simge} boyut="k" /></span>
              <span className="tc-pyu-is-metin"><b>{x.metin}</b>{x.neden && <small>{x.neden}</small>}</span>
              {x.dugme && <Dugme tur={x.dugme.birincil ? 'birincil' : 'ikincil'} simge={x.dugme.simge} onClick={x.dugme.yap}>{x.dugme.ad}</Dugme>}
            </li>
          ))}
        </ul>
      </Kart>
      <details className="tc-pyu-ac">
        <summary><Simge ad="help" boyut="k" />Nasıl çalışır</summary>
        <ul className="tc-pyu-liste">{NASIL.map((s) => <li key={s}>{s}</li>)}</ul>
      </details>
    </div>
  );
}

function VeriGir({ fg, ac }: { fg: boolean; ac: (f: 'varsayim' | 'elle') => void }) {
  return (
    <div className="tc-pyu-govde tc-pyu-kartlar">
      <Kart baslik="Talep ve kapasite varsayımları" sag={<Dugme tur="birincil" simge="gear" onClick={() => { ac('varsayim'); }}>Aç</Dugme>}>
        <p className="tc-pyu-not">Tahmin nereden gelsin, ek mesai ne kadar olsun{fg ? ', yeni tezgâh ne zaman gelir, geç teslim ve stok ne kadar pahalı' : ''}.</p>
      </Kart>
      <Kart baslik="Aylık talep tahmini gir" sag={<Dugme tur="birincil" simge="edit" onClick={() => { ac('elle'); }}>Aç</Dugme>}>
        <p className="tc-pyu-not">Bir ürün ailesi için önümüzdeki 13 ayın adedi.</p>
      </Kart>
    </div>
  );
}

// ---------- formlar (eski sayfanın adım adım sihirbazı; yeni ekranda ortak form penceresi) ----------
interface VarsayimDegerleri { tahmin: string; buyume: string; mesaiMaks: string; yatirim: string; teslimAy: string; gecTL: string; stokTL: string }
const SINIR: Record<string, [number, number]> = { buyume: [-50, 200], mesaiMaks: [0, 60], teslimAy: [1, 12], gecTL: [0, 5], stokTL: [0, 20] };

function varsayimFarki(A: YillikAyar, x: VarsayimDegerleri, fg: boolean): [keyof YillikAyar, unknown][] {
  const d: [keyof YillikAyar, unknown][] = [];
  const anahtarlar: (keyof VarsayimDegerleri & keyof YillikAyar)[] = ['tahmin', 'buyume', 'mesaiMaks', 'yatirim', ...(fg ? ['teslimAy', 'gecTL', 'stokTL'] as const : [])];
  for (const k of anahtarlar) {
    const v = k === 'tahmin' ? x.tahmin : k === 'yatirim' ? x.yatirim === 'true' : Number(x[k]);
    if (v !== A[k]) d.push([k, v]);
  }
  return d;
}

// Form yalnız açıkken kurulur: ilk değer açıldığı andaki ayardır.
function VarsayimFormu({ kapat, calisma, fg, ayarDegistir }: {
  kapat: () => void; calisma: PlanlamaCalismasi; fg: boolean; ayarDegistir: Ortak['ayarDegistir'];
}) {
  const ilk = (): VarsayimDegerleri => {
    const A = yillikAyarOku(calisma.D);
    return { tahmin: A.tahmin, buyume: String(A.buyume), mesaiMaks: String(A.mesaiMaks), yatirim: String(A.yatirim), teslimAy: String(A.teslimAy), gecTL: String(A.gecTL), stokTL: String(A.stokTL) };
  };
  const form = useForm<VarsayimDegerleri>({
    ilk: ilk(),
    hataIletisi: 'Varsayımlar kaydedilemedi.',
    dogrula: (x) => {
      const h: Record<string, string> = {};
      for (const [k, [a, b]] of Object.entries(SINIR) as [keyof VarsayimDegerleri, [number, number]][]) {
        if (!fg && ['teslimAy', 'gecTL', 'stokTL'].includes(k)) continue;
        const v = Number(x[k]);
        if (x[k].trim() === '' || !Number.isFinite(v) || v < a || v > b) h[k] = `${a} ile ${b} arasında bir sayı girin.`;
      }
      if (!Object.keys(h).length && !varsayimFarki(yillikAyarOku(calisma.D), x, fg).length) h.tahmin = 'Hiçbir şey değişmedi.';
      return h;
    },
    kaydet: (x) => {
      const A = yillikAyarOku(calisma.D);
      const d = varsayimFarki(A, x, fg);
      ayarDegistir('Yıllık plan ayarı', d.map(([k, v]) => `${AYAR_ADI[k] ?? k}: ${ayarYaz(k, A[k])} → ${ayarYaz(k, v)}`).join(', '), (Y) => {
        for (const [k, v] of d) (Y as unknown as Record<string, unknown>)[k] = v;
      });
      return Promise.resolve(null);
    },
    basarili: kapat,
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik="Talep ve kapasite varsayımları" form={form}>
      <Secim etiket="Talep tahmini" secenekler={[{ deger: 'gecmis', baslik: 'Geçmişten: eldeki siparişlerin hızı' }, { deger: 'elle', baslik: 'Elle: aylık adetleri ben girerim' }]} {...form.alan('tahmin')} />
      <Girdi etiket="Yıllık büyüme (%)" type="number" step={1} ipucu="Yalnız Geçmişten tahmininde kullanılır" {...form.alan('buyume')} />
      <Girdi etiket="Ek mesai sınırı (kapasitenin %)" type="number" step={1} {...form.alan('mesaiMaks')} />
      <Secim etiket="Yeni tezgâh önerilsin mi" secenekler={[{ deger: 'true', baslik: 'Evet, dene' }, { deger: 'false', baslik: 'Hayır' }]} {...form.alan('yatirim')} />
      {fg && (
        <>
          <Girdi etiket="Yeni tezgâh en erken kaçıncı ay gelir" type="number" step={1} {...form.alan('teslimAy')} />
          <Girdi etiket="Geç teslim bedeli (değerin %/gün)" type="number" step={0.01} {...form.alan('gecTL')} />
          <Girdi etiket="Stok taşıma (değerin %/ay)" type="number" step={0.1} {...form.alan('stokTL')} />
        </>
      )}
      <p className="tc-pyu-not">Kaydedince yıllık plan eskir; yeniden çözünce yeni varsayımlarla hesaplanır.</p>
    </FormPenceresi>
  );
}

type ElleDegerleri = { aile: string; kullan: boolean } & Partial<Record<`m${number}`, string>>;
const ayDegeri = (x: ElleDegerleri, i: number): string => (x[`m${i}`] ?? '').trim();

function ElleFormu({ kapat, calisma, z, ayarDegistir }: {
  kapat: () => void; calisma: PlanlamaCalismasi; z: Zaman; ayarDegistir: Ortak['ayarDegistir'];
}) {
  const aylar = useMemo(() => yillikAylar(z), [z]);
  const { urunAile } = useMemo(() => urunAileleri(calisma.D), [calisma.D]);
  const A = yillikAyarOku(calisma.D);
  const aileler = [...new Set(Object.values(urunAile))];
  const bos = (aile: string): ElleDegerleri => {
    const e = yillikAyarOku(calisma.D).elle[aile] ?? {};
    const d = { aile, kullan: yillikAyarOku(calisma.D).tahmin !== 'elle' } as ElleDegerleri;
    aylar.forEach(([k], i) => { d[`m${i}`] = e[k] === undefined ? '' : String(e[k]); });
    return d;
  };
  const form = useForm<ElleDegerleri>({
    ilk: bos(''),
    hataIletisi: 'Tahmin kaydedilemedi.',
    dogrula: (x) => {
      const h: Record<string, string> = {};
      if (!x.aile) h.aile = 'Ürün ailesi seçin.';
      aylar.forEach((_, i) => {
        const s = ayDegeri(x, i); const v = Number(s);
        if (s !== '' && (!Number.isInteger(v) || v < 0 || v > 1e6)) h[`m${i}`] = '0 ile 1.000.000 arasında tam sayı girin.';
      });
      if (!Object.keys(h).length && !aylar.some((_, i) => ayDegeri(x, i) !== '') && !(A.tahmin !== 'elle' && x.kullan)) h.m0 = 'En az bir ay için adet girin.';
      return h;
    },
    kaydet: (x) => {
      const ozet = aylar.map(([k], i) => (ayDegeri(x, i) === '' ? null : `${k} ${ayDegeri(x, i)}`)).filter(Boolean).join(', ') || 'boş';
      ayarDegistir('Elle tahmin', `${x.aile}: ${ozet}${A.tahmin !== 'elle' && x.kullan ? ', elle tahmin seçildi' : ''}`, (Y) => {
        const e = { ...(Y.elle[x.aile] ?? {}) };
        aylar.forEach(([k], i) => { const s = ayDegeri(x, i); if (s === '') delete e[k]; else e[k] = Number(s); });
        Y.elle[x.aile] = e;
        if (A.tahmin !== 'elle' && x.kullan) Y.tahmin = 'elle';
      });
      return Promise.resolve(null);
    },
    basarili: kapat,
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik="Aylık talep tahmini" form={form}>
      <Secim
        etiket="Ürün ailesi" bosSecenek="Seçiniz" value={form.degerler.aile} hata={form.hata('aile')}
        secenekler={aileler.map((a) => ({ deger: a, baslik: `${a} · ${calisma.D.urunler.filter((u) => urunAile[u.id] === a).map((u) => u.id).join(', ')}` }))}
        onChange={(o) => { form.degistir(bos(o.target.value)); }}
      />
      {form.degerler.aile !== '' && (
        <>
          <p className="tc-pyu-not">Girilmiş adetler dolu gelir; boş bırakılan ay tahminsiz sayılır.</p>
          <div className="tc-pyu-form-izgara">
            {aylar.map(([, ad], i) => (
              <Girdi key={ad} etiket={`${ad} (adet)`} type="number" min={0} step={1} value={form.degerler[`m${i}`] ?? ''} hata={form.hata(`m${i}`)}
                onChange={(o) => { form.degistir({ [`m${i}`]: o.target.value } as Partial<ElleDegerleri>); }} />
            ))}
          </div>
          {A.tahmin !== 'elle' && (
            <IsaretKutusu etiket="Yıllık planda elle tahmini kullan" checked={form.degerler.kullan} onChange={(o) => { form.degistir({ kullan: o.target.checked }); }} />
          )}
        </>
      )}
    </FormPenceresi>
  );
}

// ---------- Tüm ayrıntılar ----------
function TumAyrintilar(p: Ortak & { git: () => void }) {
  const { calisma, z, yaz, fg, y, bayat, coz, ayarDegistir, bildir } = p;
  const A = yillikAyarOku(calisma.D);
  const b = y?.durum === 'bitti' && !bayat ? y : null;
  const gecersiz = (): void => { bildir('Geçerli bir sayı girin.'); };
  const sayiAyari = (k: 'buyume' | 'mesaiMaks' | 'gecTL' | 'stokTL' | 'teslimAy', ad: string, min: number, max: number, adim: number) => (
    <label className="tc-pyu-alan">
      <span>{ad}</span>
      <SayiGirdisi etiket={ad} deger={A[k]} min={min} max={max} adim={adim} kapali={!yaz} gecersiz={gecersiz}
        yaz={(v) => { if (v !== null && v !== A[k]) ayarDegistir('Yıllık plan ayarı', `${AYAR_ADI[k] ?? k}: ${A[k]} → ${v}`, (Y) => { Y[k] = v; }); }} />
    </label>
  );
  const notMetni = gecmisNotu(calisma, z, A);
  return (
    <div className="tc-pyu-govde">
      <Kart baslik="Varsayımlar" sag={<Dugme tur="birincil" simge="cpu" onClick={coz} yukleniyor={y?.durum === 'hesap'}>{b ? 'Yeniden çöz' : 'Yıllık planı çöz'}</Dugme>}>
        <div className="tc-pyu-sira">
          <span className="tc-pyu-kucuk">Talep tahmini</span>
          <SecimDugmeleri etiket="Talep tahmini" kapali={!yaz} secili={A.tahmin} secenekler={[['gecmis', 'Geçmişten'], ['elle', 'Elle']]}
            sec={(v) => { ayarDegistir('Yıllık plan ayarı', `${AYAR_ADI.tahmin}: ${ayarYaz('tahmin', v)}`, (Y) => { Y.tahmin = v; }); }} />
          <span className="tc-pyu-kucuk">Yatırım adayları</span>
          <SecimDugmeleri etiket="Yatırım adayları" kapali={!yaz} secili={String(A.yatirim) as 'true' | 'false'} secenekler={[['true', 'Dene'], ['false', 'Deneme']]}
            sec={(v) => { ayarDegistir('Yıllık plan ayarı', `${AYAR_ADI.yatirim}: ${ayarYaz('yatirim', v === 'true')}`, (Y) => { Y.yatirim = v === 'true'; }); }} />
        </div>
        <div className="tc-pyu-alanlar">
          {A.tahmin === 'gecmis' && sayiAyari('buyume', 'Yıllık büyüme %', -50, 200, 1)}
          {sayiAyari('mesaiMaks', 'Ek mesai sınırı, kapasitenin %', 0, 60, 1)}
          {fg && sayiAyari('gecTL', 'Geç teslim bedeli, değerin %/gün', 0, 5, 0.01)}
          {fg && sayiAyari('stokTL', 'Stok taşıma, değerin %/ay', 0, 20, 0.1)}
          {fg && sayiAyari('teslimAy', 'Yeni tezgâhın en erken geliş ayı', 1, 12, 1)}
        </div>
        <Not>
          Kaba kapasite planıdır: aile ve tezgâh grubu düzeyinde, sırasız; malzeme, fason ve ayar sırası yok. Kapasite tezgâhın motor ufkundaki açık saatlerinin
          haftalık ortalaması × kullanılabilirlik %{sayi(kullanilabilirlik(calisma.D), 0)}; gruptaki kişilerin vardiya saati ÷ operatör oranı daha azsa o.{' '}
          {A.tahmin === 'gecmis' ? notMetni : 'Elle tahmin aşağıdaki tablodan, aylık adet.'} Bir dönemin talebi sipariş ile tahminin büyüğüdür.
        </Not>
        <Dugme simge="route" onClick={p.git}>Ufuk</Dugme>
      </Kart>
      {A.tahmin === 'elle' && <ElleKart calisma={calisma} z={z} yaz={yaz} ayarDegistir={ayarDegistir} gecersiz={gecersiz} bildir={bildir} />}
      {y?.durum === 'hesap' && <Kart baslik="Yıllık plan"><p className="tc-pyu-not" role="status"><Simge ad="cpu" boyut="k" /> {y.adim}…</p></Kart>}
      {y?.durum === 'hata' && <Kart baslik="Yıllık plan"><Not ton="hata">HiGHS çözemedi: {y.hata}</Not></Kart>}
      {(y === null || bayat) && (
        <Kart baslik="Yıllık plan">
          {bayat && <Not ton="uyari">Veri ya da varsayım değişti; yeniden çözülmeli.</Not>}
          <p className="tc-pyu-not">13 hafta haftalık, sonra bir yıla kadar aylık. HiGHS sayfanın içinde çözer.</p>
        </Kart>
      )}
      {b && <Sonuc b={b} calisma={calisma} fg={fg} yaz={yaz} ayarDegistir={ayarDegistir} />}
    </div>
  );
}

function gecmisNotu(c: PlanlamaCalismasi, z: Zaman, A: YillikAyar): string {
  const th = yillikVeri(c, z, A).th;
  if (!th.hiz) return 'Geçmiş tahmini yok: sipariş girişi yok; tahmin yalnız siparişlerden. Elle girilebilir.';
  return th.dusuk
    ? `Geçmiş tahmini düşük güvenli: ${sayi(th.hafta, 0)} hafta sipariş girişi var; giriş en az ${TALEP_GECMIS_ENAZ} haftaya bölündü, giriş geldikçe düzelir. Termin ve plan hız sayılmaz.`
    : `Geçmiş tahmini: kapanmış ve açık siparişlerin son ${sayi(th.hafta, 0)} haftalık giriş hızı; termin ve plan hız sayılmaz.`;
}

function ElleKart({ calisma, z, yaz, ayarDegistir, gecersiz, bildir }: {
  calisma: PlanlamaCalismasi; z: Zaman; yaz: boolean; ayarDegistir: Ortak['ayarDegistir']; gecersiz: () => void; bildir: (m: string) => void;
}) {
  const A = yillikAyarOku(calisma.D);
  const v = yillikVeri(calisma, z, A);
  const aylar = yillikAylar(z);
  const ayHizi = (f: string): number => (v.haftalik[f] ?? 0) * 4.33;
  const kopya = (): void => {
    if (!v.th.hiz) { bildir('Geçmiş hızı yok: sipariş girişi yok.'); return; }
    ayarDegistir('Elle tahmin', 'geçmiş hızından kopyalandı', (Y) => {
      for (const f of v.aileler) { const e = Y.elle[f] ?? {}; for (const [k] of aylar) e[k] = Math.round(ayHizi(f)); Y.elle[f] = e; }
    });
  };
  return (
    <Kart baslik="Elle tahmin" baslikEki={<span className="tc-pyu-kucuk">aylık adet; boş ay tahminsiz sayılır</span>}
      sag={yaz ? <Dugme simge="download" onClick={kopya}>Geçmiş hızını kopyala</Dugme> : undefined}>
      <div className="tc-pyu-kaydir">
        <table className="tc-pyu-matris">
          <thead><tr><th scope="col">Aile</th>{aylar.map(([k, ad]) => <th key={k} scope="col">{ad}</th>)}</tr></thead>
          <tbody>
            {v.aileler.map((f) => (
              <tr key={f}>
                <th scope="row"><b>{f}</b><small>geçmiş hızı {v.th.hiz ? `${sayi(ayHizi(f), 0)}/ay${v.th.dusuk ? ' · düşük güven' : ''}` : 'giriş yok'}</small></th>
                {aylar.map(([k, ad]) => (
                  <td key={k}>
                    <SayiGirdisi etiket={`${f} ${ad} tahmini`} deger={A.elle[f]?.[k] ?? null} max={1e6} adim={1} yer={sayi(ayHizi(f), 0)} kapali={!yaz} gecersiz={gecersiz}
                      yaz={(x) => {
                        ayarDegistir('Elle tahmin', `${f} ${k}: ${x ?? 'boş'}`, (Y) => {
                          const e = Y.elle[f] ?? {}; if (x === null) delete e[k]; else e[k] = x; Y.elle[f] = e;
                        });
                      }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Kart>
  );
}

function Sonuc({ b, calisma, fg, yaz, ayarDegistir }: { b: Bitti; calisma: PlanlamaCalismasi; fg: boolean; yaz: boolean; ayarDegistir: Ortak['ayarDegistir'] }) {
  const { v, P, sonuc: s } = b;
  const D = calisma.D;
  const A = yillikAyarOku(D);
  const o = yillikOzet(v, s);
  const kpi: Gosterge[] = [
    { simge: 'box', ad: 'Yıllık talep', deger: `${sayi(o.topD, 0)} adet`, alt: `${v.aileler.length} aile, ${P.length} dönem` },
    { simge: 'check', ad: 'Zamanında karşılanan', deger: o.zamaninda === null ? '—' : `%${sayi(o.zamaninda * 100, 1)}`, alt: 'dönem talebinin kendi döneminde üretilen payı', ton: o.zamaninda !== null && o.zamaninda < 0.95 ? 'uyari' : 'tamam' },
    { simge: 'clock', ad: 'Ek mesai', deger: `${sayi(o.mesai, 0)} sa`, alt: `sınır kapasitenin %${sayi(A.mesaiMaks, 0)}'i` },
    { simge: 'alert', ad: 'Kapasite açığı', deger: `${sayi(o.acil, 0)} sa`, alt: o.acil > 0.5 ? 'mesai ve yatırımla da karşılanmayan yük' : 'yok', ton: o.acil > 0.5 ? 'hata' : 'tamam' },
    ...(fg ? [{ simge: 'lira' as const, ad: 'Plan bedeli', deger: tl(s.tl - o.acil * YL_ACIL), alt: 'stok, geç teslim, mesai primi, yatırım' }] : []),
  ];
  const varsayilan = [
    ...(b.m.mesaiVarsayilan.length ? [`mesai saat bedeli bilinmeyen gruplarda (${b.m.mesaiVarsayilan.join(', ')}) 1.500 TL/sa`] : []),
    ...(v.degerVarsayilan.length ? [`geliri bilinmeyen ailelerde (${v.degerVarsayilan.join(', ')}) birim değer 1.000 TL`] : []),
  ];
  const db = darbogazlar(v, s);
  const dbSutun: Sutun<Darbogaz>[] = [
    { anahtar: 'g', baslik: 'Grup', hucre: (x) => (
      <span className="tc-pyu-grup"><b>{x.g}</b><small>{D.tezgahlar.filter((t) => t.grup === x.g).length} tezgâh · {v.sinir[x.g] === 'kisi'
        ? `kişi dar (${sayi(v.kapH[x.g], 0)} / ${sayi(v.tezKap[x.g], 0)} sa/hafta)` : `${sayi(v.kapH[x.g], 0)} sa/hafta`}</small></span>
    ) },
    { anahtar: 'ort', baslik: 'Ortalama yük', hizala: 'sag', hucre: (x) => `%${sayi(x.ort * 100, 0)}` },
    { anahtar: 'en', baslik: 'En yüklü dönem', hucre: (x) => `${P[x.enY.t]?.uzun ?? ''} · %${sayi(x.enY.o * 100, 0)}` },
    { anahtar: 'o', baslik: 'Ek mesai', hizala: 'sag', hucre: (x) => `${sayi(x.o, 0)} sa` },
    ...(fg ? [{ anahtar: 'gm', baslik: '1 saat ek kapasitenin değeri', hizala: 'sag' as const, hucre: (x: Darbogaz) => (x.gm >= YL_ACIL
      ? <span className="tc-pyu-ton" data-ton="hata">kapasite yetmiyor</span> : x.gm > 0.5 ? <span className="tc-pyu-grup"><b className="mono">{tl(x.gm)}</b><small>en yüksek dönem</small></span> : '0') }] : []),
    { anahtar: 'gd', baslik: 'Dar dönem', hizala: 'sag', hucre: (x) => `${x.gD} / ${P.length}` },
  ];
  // Motor hedefi: motor ufkundaki haftalar, kümülatif adet.
  const h = A.hedef ?? yillikHedefKur(D, v, P, s);
  const verildi = A.hedef !== null;
  const hw = P.map((p, t) => ({ p, t })).filter((x) => x.p.tur === 'hafta' && x.p.b <= HDAYS);
  const hedefAileleri = v.aileler.filter((f) => h.hedef.some((x) => x[0] === f));
  return (
    <>
      <Kart baslik="Yıllık plan" baslikEki={<span className="tc-pyu-kucuk">{P[0]?.uzun} – {P[P.length - 1]?.uzun} · HiGHS {sayi(b.sn, 1)} sn · {HS_DURUM[s.durum] ?? String(s.durum)}</span>}>
        <GostergeSeridi l={kpi} />
        {fg && varsayilan.length > 0 && <Not ton="uyari">Plan bedeli varsayılan model bedeli içerir: {varsayilan.join('; ')}.</Not>}
        <h3 className="tc-pyu-alt-baslik">Grup yükü, kapasitenin %'si</h3>
        <div className="tc-pyu-kaydir">
          <table className="tc-pyu-matris tc-pyu-isi">
            <thead><tr><th scope="col">Grup</th>{P.map((p) => <th key={p.a} scope="col" title={p.uzun}>{p.ad}</th>)}</tr></thead>
            <tbody>
              {v.gruplar.map((g) => (
                <tr key={g}>
                  <th scope="row"><b>{g}</b></th>
                  {(s.grup[g] ?? []).map((x, t) => {
                    const oran = x.kap > 0 ? x.yuk / x.kap : 0;
                    const ton = x.e > 0.5 ? 'hata' : oran > 1.0001 ? 'uyari' : oran > 0.85 ? 'dolu' : undefined;
                    const ipucu = `${P[t]?.uzun ?? ''}: yük ${sayi(x.yuk, 0)} sa, kapasite ${sayi(x.kap, 0)} sa${x.o > 0.5 ? `, ek mesai ${sayi(x.o, 0)} sa` : ''}${x.golge !== null && x.golge > 0.5 && fg ? `, 1 saat ek kapasitenin değeri ${tl(x.golge)}` : ''}`;
                    return <td key={P[t]?.a ?? t}><span className="tc-pyu-hucre" data-ton={ton} title={ipucu}>%{sayi(oran * 100, 0)}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tc-pyu-not">Yük %100'ü geçiyorsa ek mesai ya da yeni tezgâhla karşılanıyor; kırmızı hücrede onlar da yetmiyor.</p>
      </Kart>
      <Kart baslik="Darboğaz ve gölge fiyat">
        <Tablo etiket="Darboğaz" sutunlar={dbSutun} satirlar={db} satirAnahtari={(x) => x.g} />
        <p className="tc-pyu-not">
          "1 saat ek kapasitenin değeri" gölge fiyattır: o grupta o dönem bir saat daha olsaydı yıllık plan bedeli bu kadar düşerdi. Sıfırsa kapasite bağlayıcı değil;
          ek mesai primine eşitse plan mesaiyle kapatıyor; daha büyükse mesai sınırı da dolmuş. Dar dönem: gölge fiyatı sıfırdan büyük dönem sayısı.
        </p>
      </Kart>
      {A.yatirim && (
        <Kart baslik="Tezgâh yatırımı">
          {s.yat.length ? (
            <>
              <ul className="tc-pyu-veri">
                {s.yat.map((x) => <li key={`${x.g}-${x.t}`}><span><b>{x.g}</b> grubuna bir tezgâh, {P[x.t]?.uzun} başından</span>{fg && <b className="mono">{tl(x.ay)}/ay</b>}</li>)}
              </ul>
              {fg && <p>Yatırımla yıllık plan bedeli <b>{tl(s.tl0 - s.tl)}</b> düşüyor (yatırımsız {tl(s.tl0)}, yatırımlı {tl(s.tl)}; aylık bedel dahil).</p>}
            </>
          ) : <p><Simge ad="check" boyut="k" /> Hiçbir grupta yatırım bedelini karşılayacak kadar kapasite açığı yok.</p>}
          <p className="tc-pyu-not">
            Aylık bedel: Genel gider sayfasındaki tezgâh bedeli, ömrü ve hurdasından amortisman + iki vardiya operatör maliyeti (grubun kişi saat maliyeti × aylık saat ×
            operatör oranı × 2). Genel gider ayarı yoksa bedel bilinmez ve o grupta yatırım denenmez. Kapasite grubun ortalama tezgâhı kadar. En erken {A.teslimAy}. aydan.
          </p>
        </Kart>
      )}
      <Kart baslik="Motora haftalık hedef" baslikEki={<span className="tc-pyu-kucuk">motor ufkundaki haftalar, kümülatif adet</span>}
        sag={yaz ? (verildi
          ? <Dugme simge="x" onClick={() => { ayarDegistir('Yıllık hedef kaldırıldı', '', (Y) => { Y.hedef = null; }, false); }}>Hedefi kaldır</Dugme>
          : <Dugme tur="birincil" simge="target" disabled={!h.hedef.length}
            onClick={() => { ayarDegistir('Yıllık hedef motora verildi', `${h.hedef.length} hafta-aile hedefi`, (Y) => { Y.hedef = h; }, false); }}>Hedefi motora ver</Dugme>) : undefined}>
        <p className="tc-pyu-not">
          {verildi
            ? 'Hedef motorda: öne üretilecek siparişlerin tampon termini hedef haftanın sonuna çekildi. Kural onları öne alır; hedef aşılırsa tampon ihlali bedeli (gecikme bedelinin dörtte biri) işler, gerçek gecikme her zaman daha pahalıdır. Plan yeniden çözülünce etkisi görünür.'
            : 'Hedef henüz motorda değil. Hedef yalnız öne üretimdir: yıllık plan ileride kapasite yetmediği için bir aileyi termininden önce üretiyorsa, o hafta sonuna kadar termini gelenler ve öne üretilecek adet bitmiş olmalı. Verilince bu siparişlerin tampon termini hedef haftaya çekilir. Eldeki siparişlerle sınırlıdır.'}
        </p>
        {hedefAileleri.length ? (
          <div className="tc-pyu-kaydir">
            <table className="tc-pyu-matris">
              <thead><tr><th scope="col">Aile</th>{hw.map(({ p }) => <th key={p.a} scope="col">{p.ad}</th>)}</tr></thead>
              <tbody>
                {hedefAileleri.map((f) => (
                  <tr key={f}>
                    <th scope="row"><b>{f}</b></th>
                    {hw.map(({ p }) => {
                      const x = h.hedef.find((q) => q[0] === f && Math.abs(q[1] - (p.b * 24 - 0.01)) < 0.1);
                      if (!x) return <td key={p.a}>·</td>;
                      const yp = planUretimi(calisma, h, f, x[1]);
                      return <td key={p.a}><span className="tc-pyu-hedef"><b>{sayi(x[2], 0)}</b><small data-ton={yp !== null && yp < x[2] ? 'uyari' : undefined}>plan {yp === null ? '—' : sayi(yp, 0)}</small></span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="tc-pyu-not">Motor ufkunda öne üretim yok: siparişler terminlerine göre üretilebiliyor, motora ayrıca hedef gerekmiyor.</p>}
      </Kart>
      <Kart baslik="Aileler" baslikEki={<span className="tc-pyu-kucuk">aile rotadan: ürünün en çok süre tutan adımının ayar ailesi</span>}>
        {v.aileler.map((f) => <AileAyrintisi key={f} f={f} b={b} calisma={calisma} />)}
      </Kart>
    </>
  );
}

function AileAyrintisi({ f, b, calisma }: { f: string; b: Bitti; calisma: PlanlamaCalismasi }) {
  const [acik, acikYaz] = useState(false);
  const l = b.sonuc.aile[f] ?? [];
  const birik = Math.max(0, ...l.map((x) => x.B)); const stok = Math.max(0, ...l.map((x) => x.I));
  const etiket = `${f} · ${calisma.D.urunler.filter((u) => b.v.urunAile[u.id] === f).map((u) => u.id).join(', ')} · yıllık ${sayi(l.reduce((a, x) => a + x.d, 0), 0)} adet`
    + `${birik > 0.5 ? ` · en çok ${sayi(birik, 0)} adet geride` : ''}${stok > 0.5 ? ` · en çok ${sayi(stok, 0)} adet önceden` : ''}`;
  type Satir = (typeof l)[number] & { t: number };
  const sutun: Sutun<Satir>[] = [
    { anahtar: 'd', baslik: 'Dönem', hucre: (x) => b.P[x.t]?.uzun ?? '' },
    { anahtar: 'fir', baslik: 'Sipariş', hizala: 'sag', hucre: (x) => sayi(x.fir, 0) },
    { anahtar: 'tah', baslik: 'Tahmin', hizala: 'sag', hucre: (x) => sayi(x.tah, 0) },
    { anahtar: 'x', baslik: 'Üretim', hizala: 'sag', hucre: (x) => <b>{sayi(x.x, 0)}</b> },
    { anahtar: 'I', baslik: 'Stok', hizala: 'sag', hucre: (x) => sayi(x.I, 0) },
    { anahtar: 'B', baslik: 'Geride', hizala: 'sag', hucre: (x) => (x.B > 0.5 ? <span className="tc-pyu-ton" data-ton="uyari">{sayi(x.B, 0)}</span> : sayi(x.B, 0)) },
  ];
  return (
    <details className="tc-pyu-ac" onToggle={(o) => { acikYaz(o.currentTarget.open); }}>
      <summary>{etiket}</summary>
      {acik && <Tablo etiket={`${f} dönemleri`} sutunlar={sutun} satirlar={l.map((x, t) => ({ ...x, t }))} satirAnahtari={(x) => x.t} />}
    </details>
  );
}

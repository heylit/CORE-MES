import { useState } from 'react';
import { DurumKutusu, Dugme, Kart, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { SadeSayfa, type SadeGecis, type SadeIs, type SadeKutu, type SihirbazAlani, type SihirbazDegeri, type SihirbazTanimi } from '../ortak/sade/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  HDAYS, HS_DURUM, TALEP_GECMIS_ENAZ, YL_ACIL, darbogazlar, kullanilabilirlik, planUretimi, yillikAyarOku, yillikAyarYaz, yillikAylar,
  yillikHedefKur, yillikOzet, yillikVeri, zamanKur, type Darbogaz, type YillikAyar, type Zaman,
} from './kurallar.ts';
import { GostergeSeridi, Not, SayiGirdisi, SecimDugmeleri, sayi, tl, type Gosterge, type Ton } from './parcalar.tsx';
import { COZUCU_YOK, useYillikDurum, yillikAnahtari, yillikCoz, type YillikDurum } from './yillik-durum.ts';
import './ufuk.css';

// Yıllık plan (zz9-yillik.betik; sade sayfası zz25-sade-takvim.betik SADE.yillik, eski sade kabukta: Özet, Veri gir, Tüm ayrıntılar). Kaba kapasite
// planıdır: aile ve tezgâh grubu düzeyinde, sırasız. Model sayfada kurulur, HiGHS sunucuda çözer (454/6 a; tarayıcıda çözücü yok, 357 b); sonuç yalnız
// ekranda tutulur. Ayarlar ve elle tahmin çalışmanın `D.yillik` alanına `komut.degistir` ile yazılır (plan.yaz, 223 a). TL yalnız maliyet okuyabilen görür.

type Bitti = Extract<YillikDurum, { durum: 'bitti' }>;
const AYAR_ADI: Record<string, string> = {
  tahmin: 'Talep tahmini', buyume: 'Yıllık büyüme %', mesaiMaks: 'Ek mesai sınırı %', yatirim: 'Yatırım adayları', teslimAy: 'Yeni tezgâhın en erken geliş ayı',
  gecTL: 'Geç teslim bedeli %/gün', stokTL: 'Stok taşıma %/ay',
};
const ayarYaz = (k: string, v: unknown): string => (k === 'tahmin' ? (v === 'elle' ? 'Elle' : 'Geçmişten') : k === 'yatirim' ? (v ? 'Dene' : 'Deneme') : String(v));

export function YillikPlan({ calisma, komut, yetki }: PlanlamaEkranOzellikleri) {
  const durum = useYillikDurum();
  const { bildir } = useBildirim();
  if (calisma === null) return <div className="tc-pyu"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok. Çalışma kurulunca yıllık plan burada hesaplanır." /></div>;
  const z = zamanKur(calisma.D);
  if (z === null) return <div className="tc-pyu"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı; yıllık plan kurulamıyor." /></div>;
  const yaz = komut !== null;
  const fg = yetki.maliyetOku;
  const anah = yillikAnahtari(calisma);
  const yok = durum?.durum === 'yok';
  const y = durum !== null && !yok && durum.anah === anah ? durum : null;
  const bayat = durum !== null && !yok && durum.anah !== anah;
  const coz = (): void => { void yillikCoz(calisma).then((h) => { if (h) bildir('hata', h); }); };
  const ayarDegistir = (ne: string, ayrinti: string, fn: (A: YillikAyar) => void, planKoru = true): void => {
    komut?.degistir(ne, (t) => { fn(yillikAyarYaz(t.D)); }, { ayrinti, planKoru });
  };
  const ortak: Ortak = { calisma, z, yaz, fg, durum, y, bayat, yok, coz, ayarDegistir, bildir: (m: string) => { bildir('hata', m); } };
  return (
    <div className="tc-pyu" data-parca="P5">
      <SadeSayfa tanim={{
        ad: 'Yıllık plan', simge: 'chart',
        ne: 'Önümüzdeki bir yılda hangi tezgâh grubunun yeteceğini, nerede ek mesai ya da yeni tezgâh gerektiğini kabaca gösterir.',
        kutular: ozetKutulari(ortak), yapilacak: (g) => yapilacaklar(ortak, g), nasil: NASIL,
        formlar: yaz ? [varsayimFormu(calisma, fg, ayarDegistir), elleFormu(calisma, z, ayarDegistir)] : [],
        tum: () => <TumAyrintilar {...ortak} />,
      }} />
    </div>
  );
}

interface Ortak {
  calisma: PlanlamaCalismasi; z: Zaman; yaz: boolean; fg: boolean; durum: YillikDurum | null; y: YillikDurum | null; bayat: boolean; yok: boolean;
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

function ozetVerisi({ y }: Ortak) {
  const b = y?.durum === 'bitti' ? y : null;
  const o = b ? yillikOzet(b.v, b.sonuc) : null;
  const gr = b ? b.v.gruplar.map((g) => {
    const l = b.sonuc.grup[g] ?? []; const kap = l.reduce((a, x) => a + x.kap, 0);
    return { g, ort: kap > 0 ? l.reduce((a, x) => a + x.yuk, 0) / kap : null, e: l.reduce((a, x) => a + x.e, 0) };
  }).sort((p, q) => q.e - p.e || (q.ort ?? 0) - (p.ort ?? 0)) : [];
  return { b, o, gr };
}

function ozetKutulari(p: Ortak): SadeKutu[] {
  const { calisma, durum, bayat } = p;
  const A = yillikAyarOku(calisma.D);
  const { b, o, gr } = ozetVerisi(p);
  const dr: [string, Ton | undefined, string] = durum === null ? ['çözülmedi', 'uyari', 'Yıllık planı çöz ile hesaplanır']
    : durum.durum === 'yok' ? ['kapalı', 'uyari', COZUCU_YOK]
    : durum.durum === 'hesap' ? ['hesaplanıyor', undefined, durum.adim] : durum.durum === 'hata' ? ['çözülemedi', 'hata', durum.hata]
    : bayat ? ['eski', 'uyari', 'veri ya da varsayım değişti'] : ['güncel', 'tamam', `${b?.P.length ?? 0} dönem`];
  const k: SadeKutu[] = [
    { simge: 'chart', ad: 'Yıllık plan', deger: dr[0], ton: dr[1], not: dr[2] },
    { simge: 'edit', ad: 'Talep tahmini', deger: A.tahmin === 'elle' ? 'Elle' : 'Geçmişten', not: A.tahmin === 'elle' ? 'aylık adetler elle girilir' : `yıllık büyüme %${sayi(A.buyume || 0, 0)}` },
  ];
  if (o) {
    k.push({ simge: 'check', ad: 'Zamanında karşılanan', deger: o.zamaninda === null ? null : `%${sayi(o.zamaninda * 100, 1)}`, ton: o.zamaninda !== null && o.zamaninda < 0.95 ? 'uyari' : 'tamam', not: `${sayi(o.topD, 0)} adet yıllık talep` });
    k.push({ simge: 'alert', ad: 'Kapasite açığı', deger: `${sayi(o.acil, 0)} sa`, ton: o.acil > 0.5 ? 'hata' : 'tamam', not: o.acil > 0.5 ? `en çok ${gr[0]?.g ?? ''}` : o.mesai > 0.5 ? `${sayi(o.mesai, 0)} sa ek mesaiyle yetiyor` : 'kapasite yetiyor' });
    const enY = [...gr].sort((x, q) => (q.ort ?? 0) - (x.ort ?? 0))[0];
    if (enY) k.push({ simge: 'gauge', ad: 'En yüklü grup', deger: enY.g, not: `ortalama %${sayi((enY.ort ?? 0) * 100, 0)} dolu` });
  }
  return k;
}

function yapilacaklar(p: Ortak, gec: SadeGecis): SadeIs[] {
  const { calisma, yaz, durum, yok, coz, ayarDegistir } = p;
  const A = yillikAyarOku(calisma.D);
  const { b, o, gr } = ozetVerisi(p);
  const tumAc = (): void => { gec.sekme('tum'); };
  const l: SadeIs[] = [];
  if (durum?.durum === 'hesap') { l.push({ simge: 'cpu', metin: 'Yıllık plan hesaplanıyor', neden: durum.adim }); return l; }
  if (A.tahmin === 'elle' && !Object.values(A.elle).some((m) => Object.keys(m).length)) {
    l.push({ simge: 'edit', ton: 'uyari', metin: 'Elle tahmin seçili ama hiç adet girilmedi', neden: 'Boş ay tahminsiz sayılır; yalnız eldeki siparişler hesaba girer.',
      ...(yaz ? { dugme: { ad: 'Tahmin gir', simge: 'edit' as const, yap: () => { gec.form('elle'); }, birincil: true } } : {}) });
  }
  if (yok) { l.push({ simge: 'cpu', ton: 'uyari', metin: 'Yıllık plan şu an çözülemiyor', neden: COZUCU_YOK }); return l; }
  if (!b || !o) {
    l.push({ simge: 'play', ton: durum?.durum === 'hata' ? 'hata' : 'uyari', metin: !durum ? 'Yıllık plan henüz hesaplanmadı' : durum.durum === 'hata' ? 'Yıllık plan çözülemedi' : 'Yıllık plan eski',
      neden: 'Bir yıllık talebe göre tezgâh gruplarının yükü hesaplanır; birkaç saniye sürer.', dugme: { ad: 'Yıllık planı çöz', simge: 'cpu', yap: coz, birincil: true } });
    return l;
  }
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
  return l;
}

// ---------- Veri gir (eski sade sayfanın adım adım sihirbazı) ----------
const metin = (d: SihirbazDegeri, k: string): string => { const v = d[k]; return typeof v === 'string' ? v.trim() : ''; };
const VARSAYIM_ANAHTARI = ['tahmin', 'buyume', 'mesaiMaks', 'yatirim', 'teslimAy', 'gecTL', 'stokTL'] as const;

// Formda olmayan (maliyet göremeyenden saklanan) ayar değişmez.
function varsayimFarki(A: YillikAyar, x: SihirbazDegeri): [keyof YillikAyar, unknown][] {
  const d: [keyof YillikAyar, unknown][] = [];
  for (const k of VARSAYIM_ANAHTARI) {
    if (x[k] === undefined) continue;
    const v = k === 'tahmin' ? metin(x, k) : k === 'yatirim' ? metin(x, k) === 'true' : Number(metin(x, k).replace(',', '.'));
    if (v !== A[k]) d.push([k, v]);
  }
  return d;
}

type AyarYazici = Ortak['ayarDegistir'];

function varsayimFormu(calisma: PlanlamaCalismasi, fg: boolean, ayarDegistir: AyarYazici): SihirbazTanimi {
  const alanlar: SihirbazAlani[] = [
    { k: 'tahmin', ad: 'Talep tahmini', tur: 'secim', zorunlu: true, secenekler: [['gecmis', 'Geçmişten: eldeki siparişlerin hızı'], ['elle', 'Elle: aylık adetleri ben girerim']] },
    { k: 'buyume', ad: 'Yıllık büyüme (%)', tur: 'sayi', zorunlu: true, min: -50, max: 200, adim: 1, ipucu: 'Yalnız Geçmişten tahmininde kullanılır' },
    { k: 'mesaiMaks', ad: 'Ek mesai sınırı (kapasitenin %)', tur: 'sayi', zorunlu: true, min: 0, max: 60, adim: 1 },
    { k: 'yatirim', ad: 'Yeni tezgâh önerilsin mi', tur: 'secim', zorunlu: true, secenekler: [['true', 'Evet, dene'], ['false', 'Hayır']] },
    ...(fg ? [
      { k: 'teslimAy', ad: 'Yeni tezgâh en erken kaçıncı ay gelir', tur: 'sayi', zorunlu: true, min: 1, max: 12, tam: true },
      { k: 'gecTL', ad: 'Geç teslim bedeli (değerin %/gün)', tur: 'sayi', zorunlu: true, min: 0, max: 5, adim: 0.01 },
      { k: 'stokTL', ad: 'Stok taşıma (değerin %/ay)', tur: 'sayi', zorunlu: true, min: 0, max: 20, adim: 0.1 },
    ] satisfies SihirbazAlani[] : []),
  ];
  return {
    id: 'varsayim', ad: 'Talep ve kapasite varsayımları', simge: 'gear', ne: 'Tahmin nereden gelsin, ek mesai ne kadar olsun.',
    alanlar: () => alanlar,
    adimlar: [
      { ad: 'Talep', ne: 'Gelecek talep nereden tahmin edilsin.', k: ['tahmin', 'buyume'] },
      { ad: 'Kapasite', ne: 'Kapasite yetmezse plan önce ek mesai, sonra yeni tezgâh dener.', k: fg ? ['mesaiMaks', 'yatirim', 'teslimAy'] : ['mesaiMaks', 'yatirim'] },
      ...(fg ? [{ ad: 'Bedeller', ne: 'Geç teslim ve stokta bekleme ne kadar pahalı.', k: ['gecTL', 'stokTL'] }] : []),
    ],
    ilk: () => {
      const A = yillikAyarOku(calisma.D);
      return {
        tahmin: A.tahmin, buyume: String(A.buyume), mesaiMaks: String(A.mesaiMaks), yatirim: String(A.yatirim),
        ...(fg ? { teslimAy: String(A.teslimAy), gecTL: String(A.gecTL), stokTL: String(A.stokTL) } : {}),
      };
    },
    kontrol: (x, i) => (i === -1 && !varsayimFarki(yillikAyarOku(calisma.D), x).length ? 'Hiçbir şey değişmedi.' : null),
    sonuc: 'yıllık plan eskir; yeniden çözünce yeni varsayımlarla hesaplanır.',
    kaydet: (x) => {
      const A = yillikAyarOku(calisma.D);
      const d = varsayimFarki(A, x);
      ayarDegistir('Yıllık plan ayarı', d.map(([k, v]) => `${AYAR_ADI[k] ?? k}: ${ayarYaz(k, A[k])} → ${ayarYaz(k, v)}`).join(', '), (Y) => {
        for (const [k, v] of d) (Y as unknown as Record<string, unknown>)[k] = v;
      });
    },
    bitti: () => 'Yıllık plan varsayımları kaydedildi',
  };
}

function elleFormu(calisma: PlanlamaCalismasi, z: Zaman, ayarDegistir: AyarYazici): SihirbazTanimi {
  const aylar = yillikAylar(z);
  const A = yillikAyarOku(calisma.D);
  const kullanSor = A.tahmin !== 'elle';
  let onbellek: ReturnType<typeof yillikVeri> | null = null;
  const veri = (): ReturnType<typeof yillikVeri> => (onbellek ??= yillikVeri(calisma, z, A));
  const ayK = aylar.map((_, i) => `m${i}`);
  const doluAylar = (x: SihirbazDegeri): [string, string][] => aylar.flatMap(([k], i) => (metin(x, `m${i}`) === '' ? [] : [[k, metin(x, `m${i}`)] as [string, string]]));
  return {
    id: 'elle', ad: 'Aylık talep tahmini gir', simge: 'edit', ne: 'Bir ürün ailesi için önümüzdeki 13 ayın adedi.',
    alanlar: (d) => {
      const v = veri();
      const aile = metin(d, 'aile');
      const hiz = aile ? Math.round((v.haftalik[aile] ?? 0) * 4.33) : null;
      return [
        { k: 'aile', ad: 'Ürün ailesi', tur: 'secim', zorunlu: true,
          secenekler: v.aileler.map((a) => [a, `${a} · ${calisma.D.urunler.filter((u) => v.urunAile[u.id] === a).map((u) => u.id).join(', ')}`] as const) },
        ...aylar.map(([, ad], i): SihirbazAlani => ({
          k: `m${i}`, ad: `${ad} (adet)`, tur: 'sayi', min: 0, max: 1e6, tam: true,
          ...(hiz !== null && i === 0 ? { ipucu: `Şimdiki hız ayda yaklaşık ${sayi(hiz, 0)} adet; boş ay tahminsiz sayılır` } : {}),
        })),
        ...(kullanSor ? [{ k: 'kullan', ad: 'Yıllık planda elle tahmini kullan', tur: 'evet' } satisfies SihirbazAlani] : []),
      ];
    },
    adimlar: [
      { ad: 'Hangi aile', k: ['aile'] },
      { ad: 'Aylık adetler', ne: 'Girilmiş adetler dolu geldi; boş bırakılan ay tahminsiz sayılır.', k: [...ayK, ...(kullanSor ? ['kullan'] : [])] },
    ],
    ilk: (): SihirbazDegeri => (kullanSor ? { aile: '', kullan: true } : { aile: '' }),
    ileri: (d, i) => {
      if (i !== 0) return undefined;
      const e = yillikAyarOku(calisma.D).elle[metin(d, 'aile')] ?? {};
      const yeni = { ...d };
      aylar.forEach(([k], j) => { yeni[`m${j}`] = e[k] === undefined ? '' : String(e[k]); });
      return yeni;
    },
    kontrol: (x, i) => (i === -1 && !doluAylar(x).length && x.kullan !== true ? 'En az bir ay için adet girin.' : null),
    sonuc: 'tahmin kaydedilir; yıllık plan yeniden çözülünce kullanılır.',
    kaydet: (x) => {
      const aile = metin(x, 'aile');
      const dolu = doluAylar(x);
      const kullan = kullanSor && x.kullan === true;
      ayarDegistir('Elle tahmin', `${aile}: ${dolu.map(([k, s]) => `${k} ${s}`).join(', ') || 'boş'}${kullan ? ', elle tahmin seçildi' : ''}`, (Y) => {
        const e = { ...(Y.elle[aile] ?? {}) };
        for (const [k] of aylar) delete e[k];
        for (const [k, s] of dolu) e[k] = Number(s);
        Y.elle[aile] = e;
        if (kullan) Y.tahmin = 'elle';
      });
    },
    bitti: (x) => `${metin(x, 'aile')} tahmini kaydedildi`,
  };
}

// ---------- Tüm ayrıntılar ----------
function TumAyrintilar(p: Ortak) {
  const { calisma, z, yaz, fg, y, bayat, yok, coz, ayarDegistir, bildir } = p;
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
      <Kart baslik="Varsayımlar" sag={<Dugme tur="birincil" simge="cpu" onClick={coz} disabled={yok} yukleniyor={y?.durum === 'hesap'}>{b ? 'Yeniden çöz' : 'Yıllık planı çöz'}</Dugme>}>
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
      </Kart>
      {A.tahmin === 'elle' && <ElleKart calisma={calisma} z={z} yaz={yaz} ayarDegistir={ayarDegistir} gecersiz={gecersiz} bildir={bildir} />}
      {y?.durum === 'hesap' && <Kart baslik="Yıllık plan"><p className="tc-pyu-not" role="status"><Simge ad="cpu" boyut="k" /> {y.adim}…</p></Kart>}
      {y?.durum === 'hata' && <Kart baslik="Yıllık plan"><Not ton="hata">HiGHS çözemedi: {y.hata}</Not></Kart>}
      {(y === null || bayat) && (
        <Kart baslik="Yıllık plan">
          {bayat && <Not ton="uyari">Veri ya da varsayım değişti; yeniden çözülmeli.</Not>}
          {yok && <Not ton="uyari">{COZUCU_YOK}</Not>}
          <p className="tc-pyu-not">13 hafta haftalık, sonra bir yıla kadar aylık. HiGHS sunucuda çözer.</p>
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
    ...(fg ? [{ simge: 'lira' as const, ad: 'Plan bedeli', deger: tl(s.tl === null ? null : s.tl - o.acil * YL_ACIL), alt: 'stok, geç teslim, mesai primi, yatırım' }] : []),
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
              {fg && <p>Yatırımla yıllık plan bedeli <b>{tl(s.tl0 === null || s.tl === null ? null : s.tl0 - s.tl)}</b> düşüyor (yatırımsız {tl(s.tl0)}, yatırımlı {tl(s.tl)}; aylık bedel dahil).</p>}
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

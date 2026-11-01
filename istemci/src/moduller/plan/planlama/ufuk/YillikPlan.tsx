import { useState, type ReactNode } from 'react';
import { DurumKutusu, Dugme, Kart, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import {
  Acilim, BosHarita, IsiIzgarasi, IsiSayfasi, IzinYok, Lejant, grupAdi, hucreKoy, oranKademesi,
  type IsiHucresi, type IsiSatiri, type IsiSecimi, type IsiSutunu, type IsiUstDurumu,
} from '../ortak/isi/index.ts';
import { Sihirbaz, SonKart, type SihirbazAlani, type SihirbazDegeri, type SihirbazTanimi } from '../ortak/sade/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import {
  HS_DURUM, TALEP_GECMIS_ENAZ, YL_ACIL, bedelsizGruplar, darbogazlar, kullanilabilirlik, planUretimi, yillikAyarOku, yillikAyarYaz, yillikAylar,
  yillikHedefKur, yillikOzet, yillikVeri, zamanKur, type Darbogaz, type YillikAyar, type Zaman,
} from './kurallar.ts';
import { GostergeSeridi, Not, SayiGirdisi, SecimDugmeleri, sayi, tl, type Gosterge } from './parcalar.tsx';
import { COZUCU_YOK, useYillikDurum, yillikAnahtari, yillikCoz, type YillikDurum } from './yillik-durum.ts';
import './ufuk.css';
import { ufukGunu } from '../ufuk-olcegi.ts';

// Yıllık plan (bugünkü çerçeve: zz30-isi ISI.yillik ısı haritası, altında "Tüm satırlar" olarak zz9-yillik.betik). Kaba kapasite planıdır: aile
// ve tezgâh grubu düzeyinde, sırasız. Model sayfada kurulur, HiGHS sunucuda çözer (454/6 a; tarayıcıda çözücü yok, 357 b); sonuç yalnız ekranda
// tutulur. Ayarlar ve elle tahmin çalışmanın `D.yillik` alanına `komut.degistir` ile yazılır (plan.yaz, 223 a). TL yalnız maliyet okuyabilen görür.

type Bitti = Extract<YillikDurum, { durum: 'bitti' }>;
const AYAR_ADI: Record<string, string> = {
  tahmin: 'Talep tahmini', buyume: 'Yıllık büyüme %', mesaiMaks: 'Ek mesai sınırı %', yatirim: 'Yatırım adayları', teslimAy: 'Yeni tezgâhın en erken geliş ayı',
  gecTL: 'Geç teslim bedeli %/gün', stokTL: 'Stok taşıma %/ay',
};
const ayarYaz = (k: string, v: unknown): string => (k === 'tahmin' ? (v === 'elle' ? 'Elle' : 'Geçmişten') : k === 'yatirim' ? (v ? 'Dene' : 'Deneme') : String(v));

export function YillikPlan({ calisma, komut, yetki }: PlanlamaEkranOzellikleri) {
  const durum = useYillikDurum();
  const { bildir } = useBildirim();
  const [secim, sec] = useState<IsiSecimi | null>(null);
  const [son, sonYaz] = useState<string | null>(null);
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
  const b = y?.durum === 'bitti' ? y : null;
  const H = b ? isiVerisi(b) : null;
  const secili = H && secim && H.satirlar.some((r) => r.k === secim.satir) ? secim : null;
  const varsayim = yaz ? varsayimFormu(calisma, fg, ayarDegistir) : null;
  const sonKart = son !== null ? <SonKart metin={son} kapat={() => { sonYaz(null); }} /> : null;
  const cozDugmesi = (ad: string, birincil: boolean) => <Dugme tur={birincil ? 'birincil' : 'ikincil'} simge="cpu" onClick={coz} disabled={yok}>{ad}</Dugme>;
  return (
    <div className="tc-pyu" data-parca="P5">
      <IsiSayfasi
        simge="chart" baslik="Yıllık plan" alt={H ? 'Tezgâh grubu × dönem, kapasite kullanımı' : undefined} ust={H?.ust}
        eylem={H && yaz ? cozDugmesi('Yeniden çöz', false) : undefined}
        ayri={secili ? undefined : sonKart} tum={<TumAyrintilar {...ortak} />}
      >
        {H && b ? (
          <>
            <Lejant ogeler={[{ tur: 'kd', kd: 1, ad: '%50-75' }, { tur: 'kd', kd: 2, ad: '%75-90' }, { tur: 'kd', kd: 3, ad: '%90-100' }, { tur: 'kd', kd: 4, ad: 'Kapasite aşılıyor' }]}
              simgeler={[['clock', 'Ek mesai'], ['alert', 'Karşılanamıyor']]} />
            <IsiIzgarasi etiket="Tezgâh grubu × dönem, kapasite kullanımı" satirAd="Tezgâh grubu" genis="donem" sutunlar={H.sutunlar} satirlar={H.satirlar}
              secim={secili} sec={(s) => { sec(s); sonYaz(null); }}
              acilim={(r, ck, kapat) => (
                <YillikAcilim key={`${r.k}|${ck}`} r={r} ck={ck} b={b} varsayim={varsayim} yok={yok} coz={coz} kapat={kapat}
                  son={sonKart} bitti={sonYaz} />
              )} />
          </>
        ) : (
          <>
            <BosHarita simge="chart" metin={durum?.durum === 'hesap' ? 'Yıllık plan hesaplanıyor.' : 'Yıllık plan henüz hesaplanmadı; hesaplanınca tezgâh gruplarının dönem dönem doluluğu burada görünür.'}>
              {yaz && cozDugmesi('Yıllık planı çöz', true)}
            </BosHarita>
            {yok && <p className="tc-pyu-not">{COZUCU_YOK}</p>}
          </>
        )}
      </IsiSayfasi>
    </div>
  );
}

interface Ortak {
  calisma: PlanlamaCalismasi; z: Zaman; yaz: boolean; fg: boolean; durum: YillikDurum | null; y: YillikDurum | null; bayat: boolean; yok: boolean;
  coz: () => void; ayarDegistir: (ne: string, ayrinti: string, fn: (A: YillikAyar) => void, planKoru?: boolean) => void; bildir: (m: string) => void;
}

// ---------- Isı haritası (zz30-isi ISI.yillik) ----------
const saat = (x: number): string => `${sayi(x, 1)} sa`;
const ESIK = [50, 75, 90, 100] as const;
type YillikSatiri = IsiSatiri & { mx: number };

function isiVerisi(b: Bitti): { sutunlar: IsiSutunu[]; satirlar: YillikSatiri[]; ust: IsiUstDurumu } {
  const { v, P, sonuc } = b;
  const o = yillikOzet(v, sonuc);
  const sutunlar: IsiSutunu[] = P.map((x, i) => ({ k: `p${i}`, ad: x.ad, alt: x.tur === 'hafta' ? 'hafta' : 'ay', uzun: x.uzun }));
  const satirlar: YillikSatiri[] = v.gruplar.map((g) => {
    const h: Record<string, IsiHucresi> = {}; let mx = 0;
    (sonuc.grup[g] ?? []).forEach((x, i) => {
      if (!(x.kap > 0)) { if (x.yuk > 0) hucreKoy(h, `p${i}`, { kd: 4, sm: 'alert', v: '!', etiket: 'kapasite yok, yük var' }); return; }
      const pct = x.yuk / x.kap * 100; mx = Math.max(mx, pct);
      hucreKoy(h, `p${i}`, {
        v: `${Math.round(pct)}`, kd: x.e > 0.5 ? 4 : oranKademesi(pct, ESIK), sm: x.e > 0.5 ? 'alert' : x.o > 0.5 ? 'clock' : undefined,
        etiket: `%${Math.round(pct)} dolu (${saat(x.yuk)} / ${saat(x.kap)})${x.o > 0.5 ? `, ${saat(x.o)} ek mesai` : ''}${x.e > 0.5 ? `, ${saat(x.e)} karşılanamıyor` : ''}`,
      });
    });
    return { k: g, ad: grupAdi(g), alt: v.sinir[g] === 'kisi' ? 'kişi sınırlı' : 'tezgâh sınırlı', simge: 'layers' as const, ton: mx >= 100 ? 'hata' as const : mx >= 90 ? 'uyari' as const : '' as const, h, mx };
  }).sort((p, q) => q.mx - p.mx);
  const en = satirlar[0];
  const esik = en ? Math.min(4, oranKademesi(en.mx, ESIK) ?? 0) : 0;
  const blok = en ? sutunlar.filter((c) => (en.h[c.k]?.kd ?? -1) >= esik) : [];
  const ilk = blok[0]; const sonB = blok[blok.length - 1];
  const metin = `${en ? `En sıcak blok ${en.ad}, ${ilk ? `${ilk.ad}${sonB && blok.length > 1 ? `–${sonB.ad}` : ''}` : ''}: en çok %${Math.round(en.mx)} dolu. ` : ''}`
    + `${o.acil > 0.5 ? `${saat(o.acil)} yük karşılanamıyor` : 'Bütün yük karşılanıyor'}${o.mesai > 0.5 ? `, ${saat(o.mesai)} ek mesai gerekiyor` : ''}.`;
  return { sutunlar, satirlar, ust: { ton: o.acil > 0.5 ? 'hata' : o.mesai > 0.5 ? 'uyari' : 'tamam', simge: 'chart', metin } };
}

// Hücre açılımı (ISI.yillik.acilim; isAcilim): neden, "Kapasite varsayımları" sihirbazı Kapasite adımından (geri sınırlı), ya da yeniden çöz.
function YillikAcilim({ r, ck, b, varsayim, yok, coz, kapat, son, bitti }: {
  r: IsiSatiri; ck: string; b: Bitti; varsayim: SihirbazTanimi | null; yok: boolean; coz: () => void; kapat: () => void;
  son: ReactNode; bitti: (m: string) => void;
}) {
  const [form, formYaz] = useState(varsayim !== null);
  const [no, noYaz] = useState(0);
  const c = r.h[ck] ?? {};
  const P = b.P[Number(ck.slice(1))];
  const yer = P?.uzun ?? P?.ad ?? '';
  const kd = c.kd ?? 0;
  let govde: ReactNode;
  if (varsayim && form) {
    govde = <Sihirbaz key={no} tanim={{ ...varsayim, ad: 'Kapasite varsayımları' }} acilis={{ deg: {}, adim: 1, geriSiniri: true }} vazgec={kapat}
      bitti={(m) => { formYaz(false); bitti(m); }} />;
  } else {
    govde = (
      <>
        {son}
        {varsayim
          ? <Dugme tur={son ? 'ikincil' : 'birincil'} simge="edit" onClick={() => { formYaz(true); noYaz(no + 1); }}>{son ? 'Yeniden düzenle' : 'Kapasite varsayımları'}</Dugme>
          : <IzinYok />}
      </>
    );
  }
  return (
    <Acilim baslik={`${r.ad} · ${yer}`} simge="chart" ton={kd >= 4 ? 'hata' : kd >= 3 ? 'uyari' : ''} kapat={kapat}
      neden={`${r.ad} ${yer}: ${c.etiket ?? ''}. ${kd >= 3 ? 'Kapasite sınırı ve ek mesai sınırı varsayımlardan gelir.' : 'Kapasite yetiyor.'}`}
      form={govde}
      secenekler={[{ ad: 'Yıllık planı yeniden çöz', etki: 'Son varsayımlarla bütün dönemleri yeniden hesaplar.', simge: 'cpu', yap: yok ? undefined : coz, pasif: yok }]} />
  );
}
// ---------- Kapasite varsayımları (eski SADE.yillik varsayim formu; açılımda Kapasite adımından açılır) ----------
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
  const bedelsiz = bedelsizGruplar(D, v.gruplar);
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
  const hw = P.map((p, t) => ({ p, t })).filter((x) => x.p.tur === 'hafta' && x.p.b <= ufukGunu());
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
          ) : bedelsiz.length < v.gruplar.length
            ? <p><Simge ad="check" boyut="k" /> Hiçbir grupta yatırım bedelini karşılayacak kadar kapasite açığı yok.</p>
            : <p><Simge ad="alert" boyut="k" /> Genel gider (tezgâh bedeli) girilmediği için yatırım denenmedi.</p>}
          {bedelsiz.length > 0 && bedelsiz.length < v.gruplar.length && (
            <p><Simge ad="alert" boyut="k" /> {bedelsiz.join(', ')} grubunda tezgâh bedeli bilinmediği için yatırım denenmedi.</p>
          )}
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

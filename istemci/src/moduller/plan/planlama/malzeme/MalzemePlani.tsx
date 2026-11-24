import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DurumKutusu, Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { kaynakKur, stokOku, type StokKaynagi } from './kaynak.ts';
import {
  BAGSIZ, KAYNAKLAR, TEDARIKCISIZ, alimPlani, bitenler, dagilim,
  grafikKaynaklari, grafikSutunlari, gunYaz, kovaAdi, kovaBasi, kovala, malzemePlani, motorGirdisi, ozet, planIslemleri, sayiYaz, tabanMs, tahsisEt,
  tedarikciAdi, tlKisa, tlYaz,
  type DagilimHucresi, type DagilimTuru, type GrafikTuru, type Kirilim,
} from './kurallar.ts';
import type { IsiUstDurumu } from '../ortak/isi/kurallar.ts';
import { malzemeListesi } from './liste.ts';
import { gelisGunleri, nabizMetni, ufukOzeti, STOK_UFKU } from './matris.ts';
import { gunlukTuketim } from './toplu-talep.ts';
import { MalzemeListesi } from './MalzemeListesi.tsx';
import { OneCekme } from './OneCekme.tsx';
import { useEmirNo, type EmirNo } from '../ortak/emir-no.ts';
import { TopluPlan, useAcikTalepler } from './TopluPlan.tsx';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { simdiSaati } from '../motor/kurallar.ts';
import { AcikEmirMalzemeleri } from '../../mrp/Mrp.tsx';
import './malzeme.css';

// Malzeme ihtiyacı ve satın alma (P4, malzplan), Kokpit dilinde (3537 a, 3666): üç görünüm. Matris asıl görünümdür: satır malzeme, sütun gün, plana göre
// günlük tüketim; eksik gün ve sipariş gelen gün işaretlidir, satırdan talep açılır (TopluPlan.tsx). Liste malzeme başına tek satırdır, açılımında neden,
// açık siparişler ve termin vardır; Bütçe sayaçlar, grafik, dağılım ve öne çekmedir. Son seçilen görünüm tarayıcıda hatırlanır. Yeni sipariş satın almanındır
// (222 a); malzeme başına tedarik termini Liste açılımında girilir, kayıt Satın Alma'nındır (533 a, 534 1 a). Tutarı finans.maliyet-oku olan görür (223 a).

// Eski ekranın ortak dönem düğmesi (zq-olcek OLCEK). Bütün görünümlerde ortak olması iskelet isteğidir; o gelene kadar görünüme özgü.
const OLCEK: readonly [Kirilim, string, string][] = [['gun', 'Gün', 'Günlük'], ['hafta', 'Hafta', 'Haftalık'], ['ay', 'Ay', 'Aylık'], ['yil', 'Yıl', 'Yıllık']];
const GRAFIKLER: readonly [GrafikTuru, string][] = [['butce', 'Alım bütçesi'], ['ihtiyac', 'İhtiyaç']];
const DAGILIMLAR: readonly [DagilimTuru, string][] = [['malzeme', 'Malzeme'], ['siparis', 'Sipariş'], ['tedarikci', 'Tedarikçi']];
type Gorunum = 'matris' | 'liste' | 'butce';
const GORUNUMLER: readonly [Gorunum, string][] = [['matris', 'Matris'], ['liste', 'Liste'], ['butce', 'Bütçe']];
const GORUNUM_ANAHTARI = 'tmi.malzplan.gorunum';
function gorunumOku(): Gorunum {
  try {
    const g = localStorage.getItem(GORUNUM_ANAHTARI);
    return g === 'liste' || g === 'butce' ? g : 'matris';
  } catch { return 'matris'; }
}
const SAYFA_ADI = 'Malzeme ihtiyacı ve satın alma';

// Eski ekranın tablo kipi (00-baslangic kip): 768 altında tablo kart kipindedir. Malzeme listesi yedi sütundur, 1024 altında kart kipine geçer.
function useDar(esik = 768): boolean {
  const olc = (): boolean => typeof window !== 'undefined' && window.innerWidth < esik;
  const [dar, darYaz] = useState(olc);
  useEffect(() => {
    const d = (): void => { darYaz(olc()); };
    window.addEventListener('resize', d);
    return () => { window.removeEventListener('resize', d); };
  }, [esik]);
  return dar;
}

function Segment<A extends string>({ etiket, secenekler, secili, sec, sinif = 'tc-pyz-seg' }: {
  etiket: string; secenekler: readonly (readonly [A, string, ...string[]])[]; secili: A; sec: (a: A) => void; sinif?: string;
}) {
  return (
    <div className={sinif} role="group" aria-label={etiket}>
      {secenekler.map(([k, ad]) => <button key={k} type="button" aria-pressed={secili === k} onClick={() => { sec(k); }}>{ad}</button>)}
    </div>
  );
}

const Baslik = ({ simge, ad, ek }: { simge: SimgeAdi; ad: string; ek?: string }) => (
  <span className="tc-pyz-baslik"><Simge ad={simge} boyut="k" />{ad}{ek && <span className="tc-pyz-kucuk">{ek}</span>}</span>
);

export function MalzemePlani({ depo, calisma, yetki, yenile, sec, git }: PlanlamaEkranOzellikleri) {
  const emirNo = useEmirNo(depo.receteRotaKaydi, depo.durum?.emirler);
  return <MalzemePlaniGorunumu calisma={calisma} emirNo={emirNo} emirler={depo.durum?.emirler ?? depo.receteRotaKaydi} maliyetOku={yetki.maliyetOku} calismaSurumu={depo.calismaSurumu} terminYazar={yetki.planYaz} yenile={yenile}
    goster={(j) => { sec({ siparis: j, adim: null, tezgah: null }); git('kokpit'); }} />;
}

// Satın Alma'nın sayfası (546 a) aynı görünümü daraltılmış çalışmayla çizer: emirler çalışmayla gelir, tutar ve öne çekme yoktur.
// goster yoksa (Satın Alma) Kokpit düğmeleri çizilmez: orada Kokpit yoktur. Plan Kokpit'te kurulur (3282-1 a), emir orada seçilir (3537 a).
export function MalzemePlaniGorunumu({ calisma, emirler, maliyetOku, calismaSurumu, terminYazar, yenile, goster, emirNo = (j) => j, talepler: verilen }: {
  calisma: PlanlamaCalismasi | null; emirler: unknown; maliyetOku: boolean; calismaSurumu: number | null; terminYazar: boolean; yenile: () => void;
  goster?: (siparis: string) => void; emirNo?: EmirNo;
  // Testler için: açık talepler. Verilmezse satın almanın termin takibinden okunur.
  talepler?: ReadonlyMap<string, number> | null;
}) {
  const [stok, stokYaz] = useState<StokKaynagi | null | undefined>(undefined);
  const [kirilim, kirilimYaz] = useState<Kirilim>('gun');
  const [gor, gorYaz] = useState<GrafikTuru>('butce');
  const [dag, dagYaz] = useState<DagilimTuru>('malzeme');
  const [ayrinti, ayrintiYaz] = useState<string | null>(null);
  const [gorunum, gorunumYaz] = useState<Gorunum>(gorunumOku);
  // Matristeki satırın ayrıntısı Liste açılımındadır (neden, açık siparişler, termin, Kokpit'te aç).
  const ayrintiAc = (kod: string): void => { gorunumSec('liste'); ayrintiYaz(kod); };
  const gorunumSec = (g: Gorunum): void => {
    gorunumYaz(g);
    try { localStorage.setItem(GORUNUM_ANAHTARI, g); } catch { /* depo kapalı: yalnız bu açılışta geçerli */ }
  };
  const talepler = useAcikTalepler(verilen);
  const dar = useDar();
  const listeKart = useDar(1024);
  const talepAcar = useYetki().herhangi('satin-alma.talep-ac');
  useEffect(() => {
    let bitti = false;
    void stokOku().then((s) => { if (!bitti) stokYaz(s); });
    return () => { bitti = true; };
  }, []);

  const D = calisma?.D ?? null;
  const taban = D?.meta?.baslangic ? tabanMs(D.meta.baslangic) : null;
  const hesap = useMemo(() => {
    if (!calisma || !D || taban === null || stok === undefined) return null;
    const islemler = planIslemleri(calisma.plan);
    if (calisma.plan === null || islemler.length === 0) return null;
    const k = kaynakKur(D, taban, stok);
    const biten = bitenler(emirler, D);
    const g = motorGirdisi({ D, malzemeler: k.malzemeler, alimlar: k.alimlar, islemler, biten, simdi: simdiSaati(calisma, Date.now()), taban });
    const t = tahsisEt(g, taban);
    return { g, k, plan: malzemePlani(g, taban, t), alim: alimPlani(g, taban, t) };
  }, [calisma, D, taban, stok, emirler]);

  // Çalışma kaydı ya da plan yokken de sayfa başlığıyla çizilir; plan Kokpit'te kurulur (3282-1 a), bağlantısı plan şeridindedir.
  const planYok = (
    <div className="tc-pyz">
      <Basliklik ust={null} />
      <div className="tc-pyz-yok">
        <Simge ad="grid" boyut="k" />
        <span><b>Önce plan kurulmalı.</b> Plan kurulunca malzemenin ne zaman gerektiği ve ne zaman sipariş verilmesi gerektiği burada görünür.</span>
      </div>
    </div>
  );
  if (!calisma || !D || planIslemleri(calisma.plan).length === 0) return planYok;
  if (taban === null) return <div className="tc-pyz"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı." /></div>;
  if (stok === undefined) return <div className="tc-pyz"><DurumKutusu durum="yukleniyor" /></div>;
  if (!hesap) return planYok;

  const fg = maliyetOku;
  const { g, k, plan, alim } = hesap;
  const kov = kovala(plan.satirlar, taban, kirilim, g.simdi);
  const oz = ozet(plan);
  const mats = new Map(k.malzemeler.map((m) => [m.kod, m]));
  const miktar = (q: number, kod: string): string => `${sayiYaz(q, q < 10 ? 1 : 0)} ${mats.get(kod)?.birim ?? ''}`.trim();
  const kutu = (x: { kalem: number; tutar: number | null }): string => (fg ? tlYaz(x.tutar) : `${x.kalem} kalem`);
  const kirilimAdi = OLCEK.find((o) => o[0] === kirilim)?.[2] ?? '';

  const notlar = [
    gor === 'butce'
      ? 'Alım bütçesi parayı çıkış gününe koyar: yeni alım en geç sipariş verme gününe, açık sipariş teslim gününe. Stoktan karşılanan alım değildir.'
      : 'İhtiyaç malzemenin gerektiği güne (ilk işlemin başlangıcı) konur, kaynağına göre bölünür.',
    fg ? 'Tutar birim fiyat × miktar.' : 'Tutarı maliyet görme yetkisi olan görür; burada miktar ve kalem sayısı var.',
    plan.fiyatsiz.length ? `Birim fiyatı olmayan malzeme: ${plan.fiyatsiz.join(', ')}.` : '',
    plan.plansiz ? `Plana alınmamış ${plan.plansiz} sipariş dahil değil.` : 'Bütün siparişler planda.',
    k.nereden === 'sahip' ? 'Stok ve açık satın alma siparişleri stoktan okundu.' : '',
    k.kartsiz.length ? `Stokta kartı bulunamayan malzeme: ${k.kartsiz.join(', ')} (stoğu yok sayıldı).` : '',
    k.baglanamayan ? `Plandaki bir malzemeye bağlanamayan ${k.baglanamayan} açık sipariş satırı dahil değil.` : '',
  ].filter(Boolean).join(' ');

  const kpi: [SimgeAdi, string, string, string, string?][] = [
    ['box', 'Toplam ihtiyaç', kutu(oz.toplam), 'planlı siparişlerin malzemesi'],
    ['check', 'Stoktan', kutu(oz.stok), 'eldeki stok'],
    ['truck', 'Açık siparişler', kutu(oz.acik), oz.stoga.kalem ? `işe bağlı kısım; ayrıca stoğa ${kutu(oz.stoga)}` : 'verilmiş satın alma, işe bağlı'],
    ['lira', 'Yeni alım', kutu(oz.yeni), 'verilmesi gereken sipariş', 'uyari'],
    ['alert', 'Geciken alım', String(oz.gecikenMalzeme), 'en geç sipariş günü geçmiş malzeme', oz.gecikenMalzeme ? 'hata' : 'tamam'],
  ];

  const fiyat = (kod: string, q: number): number | null => { const f = mats.get(kod)?.birimFiyat; return typeof f === 'number' ? f * q : null; };
  const malzemeAdi = (kod: string): string => mats.get(kod)?.ad ?? '';
  // Stok sahibi okunamadıysa ya da kartı yoksa (kartsiz) stok bilinmiyor; sıfır uydurulmaz.
  const stokMiktari = (kod: string): number | null => (k.nereden === 'sahip' && !k.kartsiz.includes(kod) ? (mats.get(kod)?.stok ?? null) : null);
  const malzemeTedarikcisi = (kod: string): string | null => { const t = mats.get(kod)?.tedarikci; return typeof t === 'string' && t !== '' ? tedarikciAdi(D, t) : null; };
  const liste = malzemeListesi(alim, plan.satirlar, g.simdi);
  const bugunGunu = kovaBasi(taban, 'gun', g.simdi);
  const ufuk = ufukOzeti(gunlukTuketim({
    satirlar: plan.satirlar, taban, simdi: g.simdi, bas: bugunGunu, bit: bugunGunu + (STOK_UFKU - 1) * 24, stok: stokMiktari, talep: (kod) => talepler?.get(kod) ?? 0,
  }).satirlar);
  const gecen = liste.filter((x) => x.durum === 'gecti').length;
  const ust: IsiUstDurumu = {
    ton: ufuk.eksikMalzeme === 0 ? 'tamam' : gecen > 0 ? 'hata' : 'uyari', simge: ufuk.eksikMalzeme === 0 ? 'check' : 'alert',
    metin: nabizMetni(ufuk.eksikMalzeme, ufuk.ilkEksikGunu === null ? null : gunYaz(taban, ufuk.ilkEksikGunu), gecen),
  };
  const alimlarKodla = new Map<string, typeof alim>();
  for (const r of alim) alimlarKodla.set(r.kod, [...(alimlarKodla.get(r.kod) ?? []), r]);
  const listeKodla = new Map(liste.map((x) => [x.kod, x]));
  const etkin: Gorunum = gorunum;
  const secici = <Segment etiket="Görünüm" secenekler={GORUNUMLER} secili={etkin} sec={gorunumSec} />;
  const butce = (
    <div className="tc-pyz-kartlar">
      <div className="tc-pyz-serit">{secici}</div>
      <Kart baslikEki={<Baslik simge="box" ad="Alım bütçesi ve ihtiyaç" ek="plandan" />}>
        <div className="tc-pyz-ust">
          <span className="tc-pyz-kucuk">Kırılım: <b>{kirilimAdi}</b></span>
          <Segment etiket="Kırılım" secenekler={OLCEK} secili={kirilim} sec={kirilimYaz} sinif="tc-pyz-olcek" />
          <Segment etiket="Grafik" secenekler={GRAFIKLER} secili={gor} sec={gorYaz} />
        </div>
        <div className="tc-pyz-kpi">
          {kpi.map(([sm, ad, d, alt, ton]) => (
            <div key={ad} data-ton={ton}><small><Simge ad={sm} boyut="k" />{ad}</small><b className="mono">{d}</b><span>{alt}</span></div>
          ))}
        </div>
        <Grafik sutunlar={grafikSutunlari(plan, kov, gor, fg)} kaynaklar={grafikKaynaklari(gor)} ad={(kv, uzun) => kovaAdi(taban, kirilim, kv, uzun)}
          bicim={fg ? tlKisa : (n) => sayiYaz(n, 0)} etiket={`${gor === 'butce' ? 'Alım bütçesi' : 'Malzeme ihtiyacı'}, ${kirilimAdi.toLocaleLowerCase('tr-TR')}`} />
        <p className="tc-pyz-kucuk">{notlar}</p>
      </Kart>
      <Kart baslikEki={<Baslik simge="grid" ad="Dağılım ve toplam" />}>
        <DagilimTablosu d={dagilim(plan, kov, gor, dag, fg)} tur={dag} sec={dagYaz} fg={fg} dar={dar}
          ad={(i) => kovaAdi(taban, kirilim, kov.basi[i] ?? 0, true)} malzemeAdi={malzemeAdi}
          tedarikci={(t) => tedarikciAdi(D, t)} miktar={miktar} emirNo={emirNo} />
      </Kart>
      <OneCekme surum={calismaSurumu} malzemeAdi={malzemeAdi} dar={dar} />
    </div>
  );
  const matris = (
    <div className="tc-pyz-kartlar">
      <div className="tc-pyz-serit">{secici}</div>
      <TopluPlan satirlar={plan.satirlar} taban={taban} simdi={g.simdi} dar={dar} orta={listeKart} stok={stokMiktari} malzemeAdi={malzemeAdi}
        birim={(kod) => mats.get(kod)?.birim ?? ''} kart={(kod) => stok?.kartlar?.get(kod) ?? null} emirNo={emirNo}
        durum={(kod) => listeKodla.get(kod)?.durum ?? null} gelisler={(kod) => gelisGunleri(alimlarKodla.get(kod) ?? [], taban)}
        siparisGunu={(kod) => listeKodla.get(kod)?.enGecSiparis ?? null} ayrinti={ayrintiAc} talepAcar={talepAcar} talepler={talepler} />
      <AcikEmirMalzemeleri />
    </div>
  );
  return (
    <div className="tc-pyz">
      <Basliklik ust={ust} />
      {k.nereden === 'belge' && <p className="tc-pyz-kucuk" data-ton="uyari">Stok ya da açık satın alma siparişleri okunamadı (yetki yok ya da uç yanıt vermedi); planın kendi kopyası kullanılıyor.</p>}
      {etkin === 'butce' ? butce : etkin === 'matris' ? matris : (
        <MalzemeListesi satirlar={liste} plan={plan.satirlar} D={D} taban={taban} simdi={g.simdi} dar={listeKart} fg={fg} malzemeAdi={malzemeAdi}
          birim={(kod) => mats.get(kod)?.birim ?? ''} kartKodu={(kod) => stok?.kartlar?.get(kod)?.kod ?? null} malzemeTedarikcisi={malzemeTedarikcisi}
          tedarikci={(t) => tedarikciAdi(D, t)} fiyat={fiyat} stok={stokMiktari} emirNo={emirNo} talepler={talepler} talepAcar={talepAcar}
          terminYazar={terminYazar} yenile={yenile} goster={goster} gorunum={secici} ilkAcik={ayrinti} />
      )}
    </div>
  );
}

// Sayfa başlığı ve nabız (Kokpit'in durum satırı gibi): en sıcak satır. Plan durumu (yok, eski) plan şeridindedir; sayfa yinelemez.
function Basliklik({ ust }: { ust: IsiUstDurumu | null }) {
  return (
    <header className="tc-pyz-bas">
      <h2><Simge ad="box" boyut="k" />{SAYFA_ADI}</h2>
      {ust && <p className="tc-pyz-nabiz" data-ton={ust.ton} role="status"><Simge ad={ust.simge} boyut="k" /><span>{ust.metin}</span></p>}
    </header>
  );
}

interface GrafikOzellikleri {
  sutunlar: ReturnType<typeof grafikSutunlari>;
  kaynaklar: ReturnType<typeof grafikKaynaklari>;
  ad: (kova: number, uzun: boolean) => string;
  bicim: (n: number) => string;
  etiket: string;
}

const kaynakAdi = (k: (typeof KAYNAKLAR)[number]['anahtar']): string => KAYNAKLAR.find((x) => x.anahtar === k)?.baslik ?? k;
// Yığılmış dilimler arasındaki boşluk (eski: 2 px, sütun 160 px): görünüm kutusunun 100 biriminde.
const DILIM_ARASI = 1.25;

// Eski ekranın sütun grafiği (zt mpGrafik): sütun başına bir kova, üstte toplam, altta kova adı; gösterge toplamlarla.
function Grafik({ sutunlar, kaynaklar, ad, bicim, etiket }: GrafikOzellikleri) {
  const enB = Math.max(1e-9, ...sutunlar.map((s) => s.toplam));
  return (
    <>
      <div className="tc-pyz-grafik" role="img" aria-label={etiket}>
        <div className="tc-pyz-sutunlar">
          {sutunlar.map((s) => {
            let y = 100;
            return (
              <div key={s.kova} className="tc-pyz-sut" title={`${ad(s.kova, true)}: ${kaynaklar.map((k) => `${kaynakAdi(k)} ${bicim(s.degerler[k])}`).join(', ')}`}>
                <b className="mono">{s.toplam > 0 ? bicim(s.toplam) : ''}</b>
                <svg className="tc-pyz-cubuk" viewBox="0 0 1 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  {kaynaklar.map((k) => {
                    const h = (s.degerler[k] / enB) * 100;
                    if (h <= 0) return null;
                    const dilim = Math.max(1, h - (y < 100 ? DILIM_ARASI : 0));
                    y -= h;
                    return <rect key={k} data-kaynak={k} x="0" y={y} width="1" height={dilim} />;
                  })}
                </svg>
                <small data-ton={s.hemen ? 'hata' : undefined}>{ad(s.kova, false)}</small>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="tc-pyz-lejl">
        {kaynaklar.map((k) => (
          <li key={k} data-kaynak={k}><i /><span>{kaynakAdi(k)}</span><b className="mono">{bicim(sutunlar.reduce((a, s) => a + s.degerler[k], 0))}</b></li>
        ))}
      </ul>
    </>
  );
}

const Td = ({ b, sinif, children }: { b: string; sinif?: string; children: ReactNode }) => <td data-baslik={b} className={sinif}>{children}</td>;

interface DagilimOzellikleri {
  d: ReturnType<typeof dagilim>;
  tur: DagilimTuru;
  sec: (t: DagilimTuru) => void;
  fg: boolean;
  dar: boolean;
  ad: (i: number) => string;
  malzemeAdi: (kod: string) => string;
  tedarikci: (t: string) => string;
  miktar: (q: number, kod: string) => string;
  emirNo: EmirNo;
}

// Eski ekranın dağılım tablosu (zt mpDagilim): malzeme, sipariş ya da tedarikçiye göre, kova sütunlarıyla; tutar görene toplam satırı.
function DagilimTablosu({ d, tur, sec, fg, dar, ad, malzemeAdi, tedarikci, miktar, emirNo }: DagilimOzellikleri) {
  const hucre = (h: DagilimHucresi | undefined, kod: string | null): ReactNode => {
    if (!h || h.adet === 0) return <span className="tc-pyz-bos">·</span>;
    const q = kod === null ? '' : miktar(h.miktar, kod);
    if (!fg) return q || String(h.adet);
    return <>{h.tutar === null ? <span data-ton="uyari">fiyat yok</span> : tlYaz(h.tutar)}{q && <><br /><small>{q}</small></>}</>;
  };
  const satirAdi = (a: string): ReactNode => {
    if (a === BAGSIZ || a === TEDARIKCISIZ || a === 'Stok') return a;
    if (tur === 'malzeme') return <><b className="mono">{a}</b> <span className="tc-pyz-kucuk">{malzemeAdi(a)}</span></>;
    if (tur === 'tedarikci') return tedarikci(a);
    return <b className="mono">{emirNo(a)}</b>;
  };
  const kolonAdi = tur === 'malzeme' ? 'Malzeme' : tur === 'siparis' ? 'Sipariş' : 'Tedarikçi';
  return (
    <>
      <div className="tc-pyz-sira"><Segment etiket="Dağılım" secenekler={DAGILIMLAR} secili={tur} sec={sec} /></div>
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo tc-pyz-tablo" aria-label="Malzeme dağılımı">
          <thead><tr>
            <th>{kolonAdi}</th>
            {d.kovalar.map((i, n) => <th key={i} className="tc-pyz-num">{n === 0 && d.hemen ? 'Hemen · ' : ''}{ad(i)}</th>)}
            <th className="tc-pyz-num">Toplam</th>
          </tr></thead>
          <tbody>
            {d.satirlar.length === 0 && <tr><td colSpan={d.kovalar.length + 2} className="tc-pyz-kucuk">Bu planda satın alınacak malzeme yok: ihtiyaç stoktan ve açık siparişlerden karşılanıyor ya da işlerin malzemesi tanımlı değil.</td></tr>}
            {d.satirlar.map((s) => (
              <tr key={s.anahtar}>
                <Td b="">{satirAdi(s.anahtar)}</Td>
                {d.kovalar.map((i) => <Td key={i} b={ad(i)} sinif="tc-pyz-num">{hucre(s.hucreler.get(i), s.kod)}</Td>)}
                <Td b="Toplam" sinif="tc-pyz-num"><b>{hucre(s.toplam, s.kod)}</b></Td>
              </tr>
            ))}
            {fg && (
              <tr className="tc-pyz-top">
                <Td b=""><b>Toplam</b></Td>
                {d.kovalar.map((i) => <Td key={i} b={ad(i)} sinif="tc-pyz-num"><b>{hucre(d.toplamlar.get(i), null)}</b></Td>)}
                <Td b="Toplam" sinif="tc-pyz-num"><b>{hucre(d.genel, null)}</b></Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

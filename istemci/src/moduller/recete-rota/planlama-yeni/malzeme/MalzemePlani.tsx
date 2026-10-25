import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DurumKutusu, Kart, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { kaynakKur, stokOku, type StokKaynagi } from './kaynak.ts';
import {
  BAGSIZ, DURUM_ADI, DURUM_TONU, KAYNAKLAR, TEDARIKCISIZ, alimPlani, alimSayaclari, alimTablolari, bitenler, calismaSimdisi, dagilim,
  grafikKaynaklari, grafikSutunlari, gunYaz, kovaAdi, kovala, malzemePlani, motorGirdisi, ozet, planIslemleri, sayiYaz, tabanMs, tahsisEt,
  malzemeIsisi, tedarikciAdi, terminAyari, tlKisa, tlYaz,
  type AlimPlaniSatiri, type DagilimHucresi, type DagilimTuru, type GrafikTuru, type Kirilim, type TerminAyari,
} from './kurallar.ts';
import { Acilim, BosHarita, IsiIzgarasi, IsiSayfasi, IzinYok, Lejant, type IsiSecimi, type LejantOgesi } from '../ortak/isi/index.ts';
import { OneCekme } from './OneCekme.tsx';
import './malzeme.css';

// Malzeme satın alma planı (P4, malzplan). Düzen, araçlar ve akış bugünkü eski sayfanındır (TASARIM KORUMA): başta satın alma planı
// (zv-termin), sonra malzeme planı ve dağılım (zt-malzeme-plan), sonra öne çekme (zz7-malzeme-one); renk, yazı, düğme ve kart görünüşü
// ortaktır. Ekran yalnız okur: satın alma termini ve yeni sipariş satın almanındır (222 a). Tutarı finans.maliyet-oku olan görür (223 a).

// Eski ekranın ortak dönem düğmesi (zq-olcek OLCEK). Bütün görünümlerde ortak olması iskelet isteğidir; o gelene kadar görünüme özgü.
const OLCEK: readonly [Kirilim, string, string][] = [['gun', 'Gün', 'Günlük'], ['hafta', 'Hafta', 'Haftalık'], ['ay', 'Ay', 'Aylık'], ['yil', 'Yıl', 'Yıllık']];
const GRAFIKLER: readonly [GrafikTuru, string][] = [['butce', 'Alım bütçesi'], ['ihtiyac', 'İhtiyaç']];
const DAGILIMLAR: readonly [DagilimTuru, string][] = [['malzeme', 'Malzeme'], ['siparis', 'Sipariş'], ['tedarikci', 'Tedarikçi']];
// Isı haritası katmanı (zz30-isi ISI.malzplan; başlık zz25-sade-plan SADE.malzplan).
const SAYFA_ADI = 'Malzeme satın alma planı';
const ISI_ADI = 'Malzeme × gün, stok yetiyor mu';
const LEJANT: readonly LejantOgesi[] = [
  { tur: 'kd', kd: 1, ad: 'Son sipariş günü' }, { tur: 'kd', kd: 2, ad: 'Eksik' }, { tur: 'kd', kd: 4, ad: 'İşi geciktirir' },
  { tur: 'iyi', ad: 'Zamanında geliş' }, { tur: 'is', ad: 'Yolda' }, { tur: 'tahmin', ad: 'Tahmini geliş' }, { tur: 'bayrak', ad: 'Plan istiyor (miktar)' },
];

// Eski ekranın tablo kipi (00-baslangic kip): 768 altında tablo kart kipindedir.
function useDar(): boolean {
  const olc = (): boolean => typeof window !== 'undefined' && window.innerWidth < 768;
  const [dar, darYaz] = useState(olc);
  useEffect(() => {
    const d = (): void => { darYaz(olc()); };
    window.addEventListener('resize', d);
    return () => { window.removeEventListener('resize', d); };
  }, []);
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

export function MalzemePlani({ depo, calisma, yetki }: PlanlamaEkranOzellikleri) {
  const [stok, stokYaz] = useState<StokKaynagi | null | undefined>(undefined);
  const [kirilim, kirilimYaz] = useState<Kirilim>('gun');
  const [gor, gorYaz] = useState<GrafikTuru>('butce');
  const [dag, dagYaz] = useState<DagilimTuru>('malzeme');
  const [secim, secYaz] = useState<IsiSecimi | null>(null);
  const dar = useDar();
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
    const biten = bitenler(depo.durum?.emirler ?? depo.receteRotaKaydi, D);
    const g = motorGirdisi({ D, malzemeler: k.malzemeler, alimlar: k.alimlar, islemler, biten, simdi: calismaSimdisi(calisma), taban });
    const t = tahsisEt(g, taban);
    const A = terminAyari(D);
    return { g, k, A, plan: malzemePlani(g, taban, t), alim: alimPlani(g, taban, t, A) };
  }, [calisma, D, taban, stok, depo.durum, depo.receteRotaKaydi]);

  if (!calisma || !D) return <div className="tc-pyz"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok." /></div>;
  if (taban === null) return <div className="tc-pyz"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı." /></div>;
  if (stok === undefined) return <div className="tc-pyz"><DurumKutusu durum="yukleniyor" /></div>;
  if (!hesap) {
    return (
      <div className="tc-pyz">
        <IsiSayfasi simge="box" baslik={SAYFA_ADI} tum={<Kart baslikEki={<Baslik simge="box" ad="Malzeme planı" />}><p className="tc-pyz-kucuk">Önce plan kurulmalı.</p></Kart>}>
          <BosHarita metin="Plan kurulunca malzemenin ne zaman gerektiği ve ne zaman sipariş verilmesi gerektiği burada görünür." />
        </IsiSayfasi>
      </div>
    );
  }

  const fg = yetki.maliyetOku;
  const { g, k, A, plan, alim } = hesap;
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
    ['truck', 'Açık siparişler', kutu(oz.acik), 'verilmiş satın alma; işe bağlanmayan kısım stoğa'],
    ['lira', 'Yeni alım', kutu(oz.yeni), 'verilmesi gereken sipariş', 'uyari'],
    ['alert', 'Geciken alım', String(oz.gecikenMalzeme), 'en geç sipariş günü geçmiş malzeme', oz.gecikenMalzeme ? 'hata' : 'tamam'],
  ];

  const fiyat = (kod: string, q: number): number | null => { const f = mats.get(kod)?.birimFiyat; return typeof f === 'number' ? f * q : null; };
  const malzemeAdi = (kod: string): string => mats.get(kod)?.ad ?? '';
  const isi = malzemeIsisi(alim, taban, g.simdi, miktar, malzemeAdi, fg ? fiyat : undefined);
  const tum = (
    <div className="tc-pyz-kartlar">
      <AlimPlani l={alim} fg={fg} dar={dar} taban={taban} simdi={g.simdi} A={A} fiyat={fiyat} malzemeAdi={(kod) => mats.get(kod)?.ad ?? ''}
        malzemeTedarikcisi={(kod) => { const t = mats.get(kod)?.tedarikci; return typeof t === 'string' && t !== '' ? tedarikciAdi(D, t) : null; }}
        miktar={miktar} tedarikci={(t) => tedarikciAdi(D, t)} />
      <Kart baslikEki={<Baslik simge="box" ad="Malzeme planı" ek="plandan; alım ve bütçe için" />}>
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
        <p className="tc-pyz-kucuk">
          {k.nereden === 'belge' && <span data-ton="uyari">Stok ya da açık satın alma siparişleri okunamadı (yetki yok ya da uç yanıt vermedi); planın kendi kopyası kullanılıyor. </span>}
          {notlar}
        </p>
      </Kart>
      <Kart baslikEki={<Baslik simge="grid" ad="Dağılım ve toplam" />}>
        <DagilimTablosu d={dagilim(plan, kov, gor, dag, fg)} tur={dag} sec={dagYaz} fg={fg} dar={dar}
          ad={(i) => kovaAdi(taban, kirilim, kov.basi[i] ?? 0, true)} malzemeAdi={(kod) => mats.get(kod)?.ad ?? ''}
          tedarikci={(t) => tedarikciAdi(D, t)} miktar={miktar} />
      </Kart>
      <OneCekme surum={depo.calismaSurumu} malzemeAdi={malzemeAdi} dar={dar} />
    </div>
  );
  return (
    <div className="tc-pyz">
      <IsiSayfasi simge="box" baslik={SAYFA_ADI} alt={ISI_ADI} ust={isi.ust} tum={tum}>
        <Lejant ogeler={LEJANT} />
        <IsiIzgarasi etiket={ISI_ADI} satirAd="Malzeme" genis="gun" sutunlar={isi.sutunlar} satirlar={isi.satirlar} secim={secim} sec={secYaz} gizliAd="karşılananlar"
          acilim={(x, _s, kapat) => {
            const r = x.r;
            const neden = r.src === null
              ? `${r.kod} için sipariş verilmedi; plan ${gunYaz(taban, r.gerekli)} günü ${miktar(Math.ceil(r.miktar), r.kod)} istiyor.${r.siparisGun !== null ? ` Zamanında gelmesi için en geç ${gunYaz(taban, r.siparisGun)} sipariş verilmeli.` : ''}`
              : `${r.kod} ${x.d.toLocaleLowerCase('tr-TR')}: plan ${gunYaz(taban, r.gerekli)} istiyor, geliş ${gunYaz(taban, r.etkin)}${r.tm !== 'termin' ? ' (tedarikçi tarih vermedi)' : ''}.`;
            return (
              <Acilim baslik={`${r.kod} · ${x.d}`} simge="box" ton={x.ton === 'tamam' ? '' : x.ton} neden={neden} kapat={kapat}
                bilgi={[['Gerekli', gunYaz(taban, r.gerekli)], ['Geliş', gunYaz(taban, r.etkin)], ['Miktar', miktar(Math.ceil(r.miktar), r.kod)], ['Bağlı siparişler', r.isler.join(', ')]]}
                // Sipariş ve geliş tarihi formu satın almanındır (222 a): eski sayfanın yetkisiz hali.
                form={<IzinYok />}
                // Çizelgede siparişi seçmek planlama motoru görünümünün işidir; o gelene kadar seçenek görünür, basılmaz.
                secenekler={r.isler[0] ? [{ ad: `${r.isler[0]} çizelgede`, etki: 'Bu malzemeyi bekleyen siparişin adımlarını gösterir.', simge: 'gantt', pasif: true }] : []} />
            );
          }} />
      </IsiSayfasi>
    </div>
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
}

// Eski ekranın dağılım tablosu (zt mpDagilim): malzeme, sipariş ya da tedarikçiye göre, kova sütunlarıyla; tutar görene toplam satırı.
function DagilimTablosu({ d, tur, sec, fg, dar, ad, malzemeAdi, tedarikci, miktar }: DagilimOzellikleri) {
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
    return <b className="mono">{a}</b>;
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
            {d.satirlar.length === 0 && <tr><td colSpan={d.kovalar.length + 2} className="tc-pyz-kucuk">Bu görünümde satır yok.</td></tr>}
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

interface AlimPlaniOzellikleri {
  l: AlimPlaniSatiri[];
  fg: boolean;
  dar: boolean;
  taban: number;
  simdi: number;
  A: TerminAyari;
  fiyat: (kod: string, q: number) => number | null;
  malzemeAdi: (kod: string) => string;
  malzemeTedarikcisi: (kod: string) => string | null;
  miktar: (q: number, kod: string) => string;
  tedarikci: (t: string) => string;
}

// Bugünkü eski sayfanın satın alma planı (zv-termin mpSatinalmaPlani): dört sayaç, verilecek siparişler ve açık siparişler. Seçim, tedarikçi
// seçimi, termin girişi ve "Sipariş ver" yoktur (222 a): satın almada girilir.
function AlimPlani({ l, fg, dar, taban, simdi, A, fiyat, malzemeAdi, malzemeTedarikcisi, miktar, tedarikci }: AlimPlaniOzellikleri) {
  const { yeni, acik } = alimTablolari(l);
  const say = alimSayaclari(l, simdi);
  const tarih = (t: number | null): ReactNode => (t === null || !Number.isFinite(t) ? '—' : <span className="mono">{gunYaz(taban, t)}</span>);
  const malzeme = (kod: string): ReactNode => <><b className="mono">{kod}</b> <span className="tc-pyz-kucuk">{malzemeAdi(kod)}</span></>;
  const durum = (r: AlimPlaniSatiri): ReactNode => <Rozet ton={DURUM_TONU[r.durum]}>{DURUM_ADI[r.durum]}</Rozet>;
  const satirTonu = (r: AlimPlaniSatiri): 'hata' | undefined => (DURUM_TONU[r.durum] === 'hata' ? 'hata' : undefined);
  const kpi: [SimgeAdi, string, string, string, string?][] = [
    ['lira', 'Sipariş verilmeli', String(say.verilmeli), `${say.gunuGecti} tanesinin günü geçti`, say.verilmeli ? 'uyari' : 'tamam'],
    ['clock', 'Termin bekleniyor', String(say.bekleniyor), `${say.yokSayildi} tanesi bir hafta içinde gerekiyor`, say.yokSayildi ? 'hata' : undefined],
    ['alert', 'Siparişi geciktirir', String(say.geciktirir), 'termin en geç günden sonra', say.geciktirir ? 'hata' : 'tamam'],
    ['check', 'Karşılıyor', String(say.karsiliyor), 'termin planı tutuyor'],
  ];
  const sutunY = fg ? 9 : 8;
  const sutunA = fg ? 10 : 9;
  return (
    <Kart baslikEki={<Baslik simge="truck" ad="Satın alma planı" ek="üretim planına göre" />}>
      <div className="tc-pyz-kpi">
        {kpi.map(([sm, ad, d, alt, ton]) => (
          <div key={ad} data-ton={ton}><small><Simge ad={sm} boyut="k" />{ad}</small><b className="mono">{d}</b><span>{alt}</span></div>
        ))}
      </div>
      <h3 className="tc-pyz-alt"><Simge ad="lira" boyut="k" />Verilecek siparişler</h3>
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo tc-pyz-sa" aria-label="Verilecek siparişler">
          <thead><tr>
            <th>Malzeme</th><th>Durum</th><th className="tc-pyz-num">Miktar</th>{fg && <th className="tc-pyz-num">Tutar</th>}
            <th>En geç sipariş</th><th>Gerekli geliş</th><th>Referans termin</th><th>Tedarikçi</th><th>Siparişler</th>
          </tr></thead>
          <tbody>
            {yeni.length === 0 && <tr><td colSpan={sutunY} className="tc-pyz-kucuk">Verilecek sipariş yok: ihtiyaç stoktan ve açık siparişlerden karşılanıyor.</td></tr>}
            {yeni.map((r) => {
              const q = Math.ceil(r.miktar);
              const t = r.tedarikci === null ? malzemeTedarikcisi(r.kod) : tedarikci(r.tedarikci);
              return (
                <tr key={`y-${r.kod}-${r.isler.join('-')}`} data-ton={satirTonu(r)}>
                  <Td b="Malzeme">{malzeme(r.kod)}</Td>
                  <Td b="Durum">{durum(r)}</Td>
                  <Td b="Miktar" sinif="tc-pyz-num">{miktar(q, r.kod)}</Td>
                  {fg && <Td b="Tutar" sinif="tc-pyz-num">{tlYaz(fiyat(r.kod, q))}</Td>}
                  <Td b="En geç sipariş">
                    {r.siparisGun === null ? '—' : <>{tarih(r.siparisGun)}{r.siparisGun < simdi && <small className="tc-pyz-not">geçti</small>}</>}
                  </Td>
                  <Td b="Gerekli geliş">{tarih(r.gerekli)}</Td>
                  <Td b="Referans termin">{r.etkin === null ? <span className="tc-pyz-kucuk">tedarik süresi yok</span> : tarih(r.etkin)}</Td>
                  <Td b="Tedarikçi">{t ?? '—'}</Td>
                  <Td b="Siparişler"><span className="mono">{r.isler.join(', ')}</span></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 className="tc-pyz-alt"><Simge ad="truck" boyut="k" />Açık siparişler</h3>
      <div className="tc-tablo-kap" data-kip={dar ? 'kart' : undefined}>
        <table className="tc-tablo tc-pyz-sa" aria-label="Açık siparişler">
          <thead><tr>
            <th>Malzeme</th><th>Durum</th><th>Sipariş</th><th className="tc-pyz-num">Miktar</th>{fg && <th className="tc-pyz-num">Tutar</th>}
            <th>Gerekli geliş</th><th>En geç</th><th>Termin</th><th>Planda geliş</th><th>Siparişler</th>
          </tr></thead>
          <tbody>
            {acik.length === 0 && <tr><td colSpan={sutunA} className="tc-pyz-kucuk">Açık satın alma siparişi yok.</td></tr>}
            {acik.map((r) => (
              <tr key={`a-${String(r.src)}`} data-ton={satirTonu(r)}>
                <Td b="Malzeme">{malzeme(r.kod)}</Td>
                <Td b="Durum">{durum(r)}</Td>
                <Td b="Sipariş">
                  <span className="mono">{r.no ?? '—'}</span>
                  <small className="tc-pyz-not">{[r.tedarikci === null ? '' : tedarikci(r.tedarikci), r.verildi === null ? '' : gunYaz(taban, r.verildi)].filter(Boolean).join(' · ')}</small>
                </Td>
                <Td b="Miktar" sinif="tc-pyz-num">{miktar(r.miktar, r.kod)}</Td>
                {fg && <Td b="Tutar" sinif="tc-pyz-num">{tlYaz(fiyat(r.kod, r.miktar))}</Td>}
                <Td b="Gerekli geliş">{tarih(r.gerekli)}</Td>
                <Td b="En geç">{tarih(r.enGec)}</Td>
                <Td b="Termin">
                  {r.tm === 'termin' ? tarih(r.soz) : <span className="tc-pyz-kucuk">Satın alma girer</span>}
                  {r.ref !== null && <small className="tc-pyz-not">{`referans ${gunYaz(taban, r.ref)}`}</small>}
                </Td>
                <Td b="Planda geliş">
                  {tarih(r.etkin)}<small className="tc-pyz-not">{r.tm === 'termin' ? 'termin + tedarikçi gecikmesi' : 'referans terminden'}</small>
                </Td>
                <Td b="Siparişler"><span className="mono">{r.isler.join(', ')}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tc-pyz-kucuk">
        {`Sipariş termin olmadan verilebilir; termin gelene kadar geliş tedarik süresi × katsayısından (malzemenin kendi katsayısı, yoksa genel ${sayiYaz(A.katMal, 2)}) tahmin edilir. `}
        {`İhtiyacına ${sayiYaz(A.esik, 0)} gün kalmış ve termini girilmemiş sipariş yok sayılır: plan gelişi bugünden tam tedarik süresi olarak alır ve uyarır. `}
        En geç sipariş: siparişin terminini kaçırmadan verilebileceği son gün (tedarik süresi düşülmüş).
      </p>
    </Kart>
  );
}

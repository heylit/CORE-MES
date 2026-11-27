import { Fragment, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge, Tablo, type Sutun } from '../../../ortak/arayuz/index.ts';
import type { TabloGrupSecenegi } from '../../../ortak/arayuz/Tablo.tsx';
import type { Siralama } from '../../../ortak/veri/liste-durumu.ts';
import { useGrupSecimi } from '../../../ortak/veri/tablo-tercihi.ts';
import { ayrintiyiBirlestir, useKartSatirlari } from '../merkez/kart-satirlari.ts';
import { fmtDate, tsDate } from '../merkez/util.ts';
import { TalepCizimleri } from './Cizimler.tsx';
import { IslenenMalzeme } from './IslenenMalzeme.tsx';

// 3437-2: kalemin daraltılmış kabul sınırı tek satırda; sınırsız kalemde (kartın sınırı) satır yok.
const kabulOzeti = (k: NonNullable<Talebim['kalemler'][number]['kabul']>): string => (k.yalnizAyni ? 'yalnız aynı malzeme' : [
  k.kaliteler === null ? null : k.kaliteler.length === 0 ? 'kalite yalnız istenen' : `kalite muadili ${k.kaliteler.join(', ')}`,
  k.durumlar === null ? null : k.durumlar.length === 0 ? 'durum yalnız istenen' : `durum muadili ${k.durumlar.join(', ')}`,
  k.payMm === null ? null : `ölçü en çok +${k.payMm.toLocaleString('tr-TR')} mm`,
  k.sartliKabul ? 'şartlı muadil kabul' : null,
].filter(Boolean).join(' · '));
import { ADIMLAR, ADIM_SIRASI, DURUM, KAYNAK, SURE, anahtarlar, cagri, gunYaz, karsilikYaz } from './ortak.ts';
import { SartliAlternatifler, bekleyenSartli } from './SartliAlternatifler.tsx';
import './talep.css';

const SON = 10;
export const HEPSI = 500;

export type DurumSuzgeci = 'acik' | 'satin' | 'onay' | 'siparis' | 'hepsi';
const SUZGECLER: readonly [DurumSuzgeci, string][] = [['acik', 'Açık'], ['satin', 'Satın almada'], ['onay', 'Onayda'], ['siparis', 'Sipariş verildi'], ['hepsi', 'Hepsi']];
// Süzgeç talep edenin gördüğü sade duruma göredir; satın almanın iç aşamaları (teklif, değerlendirme) "Satın almada"dır.
export function suzgeceUyar(t: Talebim, s: DurumSuzgeci): boolean {
  switch (s) {
    case 'acik': return t.durum !== 'teslim_alindi' && t.durum !== 'iptal';
    case 'satin': return t.durum === 'taslak' || t.durum === 'teklif_isteniyor' || t.durum === 'degerlendirme';
    case 'onay': return t.durum === 'onayda';
    case 'siparis': return t.durum === 'siparis_verildi';
    case 'hepsi': return true;
  }
}

// 3121: kartın kalite, durum, işlem ve ölçüsü ayrı sütunlarda; dar ekranda sütunlar gizlenir, değerler kalem adının altında etiketli satırdır.
type Ozellik = NonNullable<Talebim['kalemler'][number]['malzeme']>;
type OzellikAlani = 'kalite' | 'durum' | 'islem' | 'olcu' | 'aciklama';
const OZELLIKLER: readonly [OzellikAlani, string][] = [['kalite', 'Kalite'], ['durum', 'Durum'], ['islem', 'İşlem'], ['olcu', 'Ölçü'], ['aciklama', 'Açıklama']];
// 3133: malzeme kartının föyündeki ayrıntılar kalem hücresinde açılır.
function KartAyrintisi({ m }: { m: Ozellik | null }) {
  useKartSatirlari(m?.kart); // hazır olunca yeniden çizilir
  const satirlar = m ? ayrintiyiBirlestir(m.ayrinti, m.kart) : [];
  if (!satirlar.length) return null;
  return (
    <details className="sa-talep-ayrinti">
      <summary><Simge ad="list" boyut="k" /> Kart ayrıntısı</summary>
      <dl>
        {satirlar.map((x) => <Fragment key={x.ad}><dt>{x.ad}</dt><dd>{x.deger}</dd></Fragment>)}
      </dl>
    </details>
  );
}

// 3711: siparişli kalemin termin notu (düz yazı): istenen gün farklıysa gösterilir, sipariş istenenden sonraysa kaç gün geç olduğu yazılır.
const gunNo = (g: string) => Math.round(Date.parse(`${g.slice(0, 10)}T00:00:00Z`) / 86400000);
type TerminKalemi = Talebim['kalemler'][number];
function terminNotlari(x: TerminKalemi): string[] {
  if (!x.siparisTermini || !x.ihtiyacTarihi || x.ihtiyacTarihi.slice(0, 10) === x.siparisTermini.slice(0, 10)) return [];
  const fark = gunNo(x.siparisTermini) - gunNo(x.ihtiyacTarihi);
  return [`istenen ${gunYaz(x.ihtiyacTarihi)}`, ...(fark > 0 ? [`${String(fark)} gün geç`] : [])];
}
const enGecPay = (x: TerminKalemi): string | undefined => ((x.siparisPayAdedi ?? 1) > 1 ? 'Birden çok firmaya bölünmüş; en geç payın günü' : undefined);

// 3710: talebin açıldığı gün, öteki satın alma listeleriyle aynı biçimde. Kayıt zamanı (timestamptz) yerel güne çevrilir; gunYaz tarihin
// ilk on harfini aldığından gece yarısı sonrası açılan talebi bir gün önceye yazardı.
const talepGunu = (zaman: string) => fmtDate(tsDate(Date.parse(zaman)));

export type Duzenleme = 'duzenle' | 'guncelle';
// 3748-2: kalem tablosu ortak tablodur: sayı sağda, malzeme kartının bütün kalemlerde boş alanları gizli, dar kapta kayıt kartı.
type Kalem = Talebim['kalemler'][number];
const miktarYaz = (m: string) => { const n = Number(m); return Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : m; };
const ozellikSutunu = ([k, b]: readonly [OzellikAlani, string]): Sutun<Kalem> => ({ anahtar: k, baslik: b, bossaGizle: true, hucre: (x) => x.malzeme?.[k] ?? null });
function KalemTablosu({ t }: { t: Talebim }) {
  const sutunlar: Sutun<Kalem>[] = [
    {
      anahtar: 'kalem', baslik: 'Kalem', kartTamSatir: true, csv: (x) => x.ad,
      hucre: (x) => (
        <div className="sa-talep-kalem-hucre">
          <span>{x.ad}</span>
          <IslenenMalzeme uygulanan={x.uygulanan} kod={x.uygulananKod} ad={x.uygulananAd} revizyon={x.uygulananRevizyon} adet={x.miktar === null ? null : `${miktarYaz(x.miktar)} ${x.birim}`} fasonAdim={x.fasonAdim} />
          {!x.uygulanan && x.fasonAdim && <span className="sa-talep-not">Fason: {x.fasonAdim}</span>}
          {x.aciklama && <span className="sa-talep-not">{x.aciklama}</span>}
          {x.kabul && <span className="sa-talep-not">Kabul sınırı: {kabulOzeti(x.kabul)}</span>}
          <KartAyrintisi m={x.malzeme ?? null} />
          <SartliAlternatifler talepId={t.id} kalem={x} />
        </div>
      ),
    },
    ...OZELLIKLER.map(ozellikSutunu),
    {
      anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, csv: (x) => (x.miktar === null ? null : `${x.miktar} ${x.birim}`),
      hucre: (x) => (x.miktar === null ? null : (
        <span className="sa-talep-kalem-hucre">
          <span>{`${miktarYaz(x.miktar)} ${x.birim}`}</span>
          {x.karsilik && <span className="sa-talep-not">{karsilikYaz(x.karsilik)}</span>}
        </span>
      )),
    },
    {
      anahtar: 'termin', baslik: 'Termin', kirilmaz: true, bossaGizle: true, csv: (x) => x.siparisTermini ?? x.ihtiyacTarihi ?? null,
      hucre: (x) => (x.siparisTermini ? (
        <span className="sa-talep-kalem-hucre">
          <span title={enGecPay(x)}>{gunYaz(x.siparisTermini)}</span>
          <span className="sa-talep-not">{['sipariş', ...terminNotlari(x)].join(' · ')}</span>
        </span>
      ) : x.ihtiyacTarihi ? gunYaz(x.ihtiyacTarihi) : null),
    },
    { anahtar: 'emir', baslik: 'Üretim emri', kirilmaz: true, bossaGizle: true, hucre: (x) => x.uretimEmriNo ?? null },
  ];
  return <Tablo etiket={`${t.no} kalemleri`} sutunlar={sutunlar} satirlar={t.kalemler} satirAnahtari={(x) => x.id ?? `${x.ad}:${x.miktar ?? ''}`} />;
}

// 3797: Taleplerim sayfası tek tablodur: başlıklı sütunlar, durum süzgeci, Görünüm'de gruplama; satır açılınca kalemler,
// çizim ve düzenleme satırın altında. Telefonda kayıt kartı, dokununca açılır.
const TABLO = 'taleplerim';
const bugunNo = () => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
const kalanGun = (t: Talebim) => (t.ihtiyacTarihi && t.durum !== 'teslim_alindi' && t.durum !== 'iptal' ? gunNo(t.ihtiyacTarihi) - bugunNo() : null);
const DURUM_SIRASI = (t: Talebim) => ADIM_SIRASI[t.durum] ?? 9;
const terminGrubu = (t: Talebim) => {
  const k = kalanGun(t);
  return k === null ? 'Termin yok' : k < 0 ? 'Gecikmiş' : k <= 7 ? 'Bu hafta' : 'Sonra';
};
const TERMIN_GRUPLARI = ['Gecikmiş', 'Bu hafta', 'Sonra', 'Termin yok'];
const GRUPLAR: readonly TabloGrupSecenegi<Talebim>[] = [
  { anahtar: 'durum', baslik: 'Durum', yol: (t) => [DURUM[t.durum].metin] },
  { anahtar: 'emir', baslik: 'Üretim emri', yol: (t) => [t.uretimEmriNo ? `Emir ${t.uretimEmriNo}` : 'Emirsiz'] },
  { anahtar: 'termin', baslik: 'İstenen termin', yol: (t) => [terminGrubu(t)] },
];
const GRUP_SIRASI: Record<string, (t: Talebim) => number | string> = {
  durum: DURUM_SIRASI,
  emir: (t) => (t.uretimEmriNo ? `0${t.uretimEmriNo}` : '1'),
  termin: (t) => TERMIN_GRUPLARI.indexOf(terminGrubu(t)),
};
const SIRALAMA: Record<string, (t: Talebim) => number | string> = {
  no: (t) => t.no, baslik: (t) => t.baslik.toLocaleLowerCase('tr'), durum: DURUM_SIRASI,
  termin: (t) => t.ihtiyacTarihi ?? '9999', kalem: (t) => t.kalemler.length, emir: (t) => t.uretimEmriNo ?? '', tarih: (t) => t.olusturma,
};
const karsilastir = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0);

function DurumHucresi({ t }: { t: Talebim }) {
  const d = DURUM[t.durum];
  const bekleyen = t.kalemler.filter((k) => k.kartBekliyor).length;
  const sartli = bekleyenSartli(t);
  const sira = ADIM_SIRASI[t.durum];
  return (
    <span className="sa-talep-durum">
      <span className="sa-talep-rozetler">
        <Rozet ton={d.ton}>{d.metin}</Rozet>
        {t.kaynak !== 'elle' && <Rozet ton="uyari" gorunum="cizgi">{KAYNAK[t.kaynak].metin}</Rozet>}
      </span>
      <span className="sa-talep-durum-alt">
        {sira !== null && (
          <span className="sa-talep-ilerleme" role="img" aria-label={`İlerleme: ${String(Math.min(sira + 1, ADIMLAR.length))} / ${String(ADIMLAR.length)} adım, ${d.metin}`}>
            {ADIMLAR.map((a, i) => <span key={a} title={a} data-durum={i < sira ? 'bitti' : i === sira ? 'simdi' : undefined} />)}
          </span>
        )}
        {bekleyen > 0 && <span className="sa-talep-uyari">{bekleyen} kart bekliyor</span>}
        {sartli > 0 && <span className="sa-talep-uyari">{sartli > 1 ? `${String(sartli)} alternatif` : 'Alternatif'} onayınızda</span>}
      </span>
    </span>
  );
}

function TerminHucresi({ t }: { t: Talebim }) {
  if (!t.ihtiyacTarihi) return null;
  const k = kalanGun(t);
  return (
    <span className="sa-talep-kalem-hucre">
      <span>{gunYaz(t.ihtiyacTarihi)}</span>
      {k !== null && <span className={k < 0 ? 'sa-talep-gecikti' : 'sa-talep-not'}>{k < 0 ? `${String(-k)} gün gecikti` : k === 0 ? 'bugün' : `${String(k)} gün`}</span>}
    </span>
  );
}

function TalepAyrintisi({ t, duzenle }: { t: Talebim; duzenle: ((t: Talebim, kip: Duzenleme) => void) | undefined }) {
  return (
    <div className="sa-talep-acik">
      {t.guncellemeGrubu && (
        <p className="sa-talep-not">
          <Simge ad="layers" boyut="k" /> {t.guncellemeGrubu.find((x) => x.kok)?.id === t.id ? 'Güncellemeleri' : 'Güncelleme grubu'}:{' '}
          {t.guncellemeGrubu.filter((x) => x.id !== t.id).map((x) => `${x.no}${x.kok ? ' (ilk talep)' : ''} ${DURUM[x.durum].metin.toLocaleLowerCase('tr-TR')}`).join(', ')}
        </p>
      )}
      <div className="sa-talep-kalem-tablo"><KalemTablosu t={t} /></div>
      <div className="sa-talep-cizim-blok"><TalepCizimleri talepId={t.id} yazabilir={t.duzenlenebilir === true} /></div>
      {t.duzenlenebilir && duzenle && (
        <div className="sa-talep-duzenle"><Dugme simge="edit" onClick={() => duzenle(t, 'duzenle')}>Düzenle</Dugme></div>
      )}
      {t.guncellenebilir && duzenle && (
        <div className="sa-talep-duzenle">
          <span className="sa-talep-not">Teklif toplanıyor: talep değişmez, değişiklik yeni bir güncelleme talebiyle gider; satın alma ikisini birlikte görür.</span>
          <Dugme simge="layers" onClick={() => duzenle(t, 'guncelle')}>Güncelleme talebi aç</Dugme>
        </div>
      )}
    </div>
  );
}

function TalepTablosu({ talepler, yukleniyor, arac, duzenle }: {
  talepler: readonly Talebim[]; yukleniyor: boolean; arac: Parameters<typeof Tablo<Talebim>>[0]['arac'];
  duzenle: ((t: Talebim, kip: Duzenleme) => void) | undefined;
}) {
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  const [grupTercihi] = useGrupSecimi(TABLO);
  const grup = grupTercihi ?? 'durum';
  const satirlar = useMemo(() => {
    const anahtar = siralama ? SIRALAMA[siralama.alan] : undefined;
    const grupAnahtari = GRUP_SIRASI[grup];
    return [...talepler].sort((a, b) => (grupAnahtari ? karsilastir(grupAnahtari(a), grupAnahtari(b)) : 0)
      || (anahtar && siralama ? karsilastir(anahtar(a), anahtar(b)) * (siralama.yon === 'artan' ? 1 : -1) : karsilastir(b.no, a.no)));
  }, [talepler, siralama, grup]);
  const sutunlar: Sutun<Talebim>[] = [
    { anahtar: 'no', baslik: 'No', mono: true, kirilmaz: true, sabit: 'sol', sirala: true, kartta: false, hucre: (t) => t.no },
    {
      anahtar: 'baslik', baslik: 'Talep', kes: true, sirala: true, csv: (t) => t.baslik,
      hucre: (t) => (
        <span className="sa-talep-baslik">
          <b>{t.baslik}</b>
          <small>{[t.no, t.kalemler.map((x) => x.ad).join(', ')].join(' · ')}</small>
        </span>
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', sirala: true, kartRozet: true, csv: (t) => DURUM[t.durum].metin, hucre: (t) => <DurumHucresi t={t} /> },
    { anahtar: 'termin', baslik: 'İstenen termin', kirilmaz: true, sirala: true, kartta: true, csv: (t) => t.ihtiyacTarihi, hucre: (t) => <TerminHucresi t={t} /> },
    { anahtar: 'kalem', baslik: 'Kalem', hizala: 'sag', sirala: true, kartta: true, hucre: (t) => t.kalemler.length },
    { anahtar: 'emir', baslik: 'Üretim emri', mono: true, kirilmaz: true, sirala: true, bossaGizle: true, kartta: true, hucre: (t) => t.uretimEmriNo },
    { anahtar: 'tarih', baslik: 'Talep tarihi', kirilmaz: true, sirala: true, csv: (t) => t.olusturma.slice(0, 10), hucre: (t) => talepGunu(t.olusturma) },
  ];
  return (
    <div className="sa-taleplerim">
    <Tablo
      etiket="Taleplerim" kip="kayit" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(t) => t.id} yukleniyor={yukleniyor}
      siralama={siralama} siralamaDegistir={siralamaYaz} bosMesaj="Bu süzgeçle talep yok."
      serit={(t) => (t.durum === 'iptal' ? 'pasif' : (kalanGun(t) ?? 0) < 0 ? 'hata' : t.kalemler.some((k) => k.kartBekliyor) || bekleyenSartli(t) > 0 ? 'uyari' : null)}
      ayrinti={(t) => <TalepAyrintisi t={t} duzenle={duzenle} />}
      arac={arac && { ...arac, gorunum: { anahtar: TABLO, gruplar: GRUPLAR, varsayilanGrup: 'durum' } }}
    />
    </div>
  );
}

// Ana sayfadaki kısa liste (son on talep); Taleplerim sayfası tablodur (TalepTablosu).
function Satir({ t }: { t: Talebim }) {
  const d = DURUM[t.durum];
  const bekleyen = t.kalemler.filter((k) => k.kartBekliyor).length;
  const sartli = bekleyenSartli(t);
  return (
    <li className="sa-talep-satir">
      <div className="sa-talep-satir-ust">
        <span className="sa-talep-no">{t.no}</span>
        <Rozet ton={d.ton}>{d.metin}</Rozet>
        {t.kaynak !== 'elle' && <Rozet ton="uyari" gorunum="cizgi">{KAYNAK[t.kaynak].metin}</Rozet>}
        {bekleyen > 0 && <Rozet ton="uyari">{bekleyen} kalem kart bekliyor</Rozet>}
        {sartli > 0 && <span className="sa-talep-rozet-sar"><Rozet ton="uyari">{sartli > 1 ? `${String(sartli)} alternatif` : 'Alternatif'} onayınızda</Rozet></span>}
      </div>
      <div><b>{t.baslik}</b></div>
      <div className="sa-talep-not">
        {t.kalemler.map((x) => `${x.ad}${x.miktar === null ? '' : ` ${x.miktar} ${x.birim}`}${x.karsilik ? ` (${karsilikYaz(x.karsilik)})` : ''}`).join(', ')}
        {` · talep ${talepGunu(t.olusturma)}`}
        {t.ihtiyacTarihi && <> · istenen {gunYaz(t.ihtiyacTarihi)}</>}
        {t.uretimEmriNo && <> · üretim emri {t.uretimEmriNo}</>}
      </div>
    </li>
  );
}

// Kişinin kendi talepleri ve durumu (kart #375); fiyat, teklif ve tedarikçi sunucudan zaten gelmez. Ana sayfada son on talep;
// Taleplerim sayfasında (898 a) arama, durum süzgeci, ilerleme ve kalem ayrıntısıyla.
// 2871-1 a: `duzenle` verilirse teklif istenmemiş kendi talebinin ayrıntısında "Düzenle" çıkar; 2876: teklif toplanırken "Güncelleme talebi aç".
export function Taleplerim({ tam = false, suzgec, suzgecYaz, duzenle }: {
  tam?: boolean; suzgec?: DurumSuzgeci; suzgecYaz?: (s: DurumSuzgeci) => void; duzenle?: (t: Talebim, kip: Duzenleme) => void;
} = {}) {
  const [hepsi, hepsiYaz] = useState(false);
  const [ara, araYaz] = useState('');
  const [yerelSuzgec, yerelSuzgecYaz] = useState<DurumSuzgeci>('acik');
  const durum = suzgec ?? yerelSuzgec;
  const durumYaz = suzgecYaz ?? yerelSuzgecYaz;
  const sinir = tam || hepsi ? HEPSI : SON;
  const liste = useQuery({
    queryKey: anahtarlar.taleplerim(sinir),
    queryFn: () => cagri.get('/satin-alma-taleplerim', { sorgu: { sinir }, ...SURE }),
    placeholderData: keepPreviousData,
  });
  const metin = ara.trim().toLocaleLowerCase('tr');
  const gorunen = (liste.data?.talepler ?? []).filter((t) => !tam || (suzgeceUyar(t, durum)
    && (metin === '' || [t.no, t.baslik, t.uretimEmriNo ?? '', ...t.kalemler.map((x) => x.ad)].join(' ').toLocaleLowerCase('tr').includes(metin))));
  const say = (s: DurumSuzgeci) => (liste.data?.talepler ?? []).filter((t) => suzgeceUyar(t, s)).length;
  if (tam) {
    if (liste.isError) return <DurumKutusu durum="hata" mesaj="Talepler okunamadı." yenile={() => void liste.refetch()} />;
    if (liste.data && liste.data.talepler.length === 0) return <DurumKutusu durum="bos" mesaj="Henüz talebiniz yok." />;
    return (
      <TalepTablosu
        talepler={gorunen} yukleniyor={liste.isPending} duzenle={duzenle}
        arac={{
          arama: { deger: ara, degistir: araYaz, yerTutucu: 'Talep no, kalem ya da emir no' },
          suzgec: {
            etiket: 'Durum', secili: durum, sec: (d) => durumYaz(d as DurumSuzgeci),
            secenekler: SUZGECLER.map(([a, b]) => ({ deger: a, baslik: liste.data ? `${b} ${String(say(a))}` : b })),
          },
          csv: { ad: 'taleplerim' },
        }}
      />
    );
  }
  return (
    <Kart baslik="Taleplerim" sag={!tam && liste.data && liste.data.toplam > SON
      ? <Dugme simge="list" onClick={() => hepsiYaz((h) => !h)}>{hepsi ? 'Son 10' : `Tümü (${liste.data.toplam})`}</Dugme> : undefined}>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj="Talepler okunamadı." yenile={() => void liste.refetch()} />
          : liste.data.talepler.length === 0 ? <DurumKutusu durum="bos" mesaj="Henüz talebiniz yok." />
            : gorunen.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu süzgeçle talep yok." />
              : <ul className="sa-talep-liste">{gorunen.map((t) => <Satir key={t.id} t={t} />)}</ul>}
    </Kart>
  );
}

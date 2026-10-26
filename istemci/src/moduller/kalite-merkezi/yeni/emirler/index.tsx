import { useEffect, useState } from 'react';
import { DurumKutusu, Dugme, Rozet, SayfaBasligi, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { trd, YOK } from '../bicim.ts';
import { Ekler } from '../Ekler.tsx';
import { KayitListesi } from '../KayitListesi.tsx';
import type { EkranOzellikleri, KmGorunum, KmSayaci } from '../sekmeler.ts';
import type { Emir } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { emirAranan, emirBaglari, emirSirasi, izlenebilirlik, retSayisi, type IzSatiri } from './hesap.ts';
import './emirler.css';

const durumTonu = (d?: string) => (d === 'Kapalı' ? 'tamam' : 'bilgi');
const sonucTonu = (s?: string) => (s === 'Kabul' || s === 'Kapalı' ? 'tamam' : s === 'Ret' || s === 'Açık' ? 'hata' : 'uyari');
const IZ_GORUNUMU: Record<IzSatiri['kol'], KmGorunum> = { lot: 'lot-kabul', insp: 'muayeneler', ncr: 'uygunsuzluklar' };

// Uygulamanın ikinci menüsünde iş emri sayacı yoktur (navCounts).
export const IsEmirleriSayaci: KmSayaci = null;

function EmirSayfasi({ veri, yetki, emir, geri, git }: {
  veri: KmVerisi; yetki: KmYetkisi; emir: Emir; geri: () => void; git: EkranOzellikleri['git'];
}) {
  const b = emirBaglari(veri, emir.no);
  const sup = emir.tedarikci ? veri.sup.find((s) => s._id === emir.tedarikci) : undefined;
  const satirlar = izlenebilirlik(b);
  const sutunlar: Sutun<IzSatiri>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (r) => trd(r.tarih), kirilmaz: true },
    { anahtar: 'no', baslik: 'Kayıt', hucre: (r) => r.no ?? '', mono: true },
    { anahtar: 'tur', baslik: 'Tür', hucre: (r) => r.tur },
    { anahtar: 'durum', baslik: 'Sonuç / durum', hucre: (r) => <Rozet ton={sonucTonu(r.durum)}>{r.durum || YOK}</Rozet> },
    { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (r) => r.ayrinti },
  ];
  const alt = [
    `Parça ${emir.parcaNo ?? ''} ${emir.parcaAdi ?? ''}`.trim(),
    `miktar ${emir.miktar ?? YOK}`,
    `termin ${trd(emir.termin)}`,
    sup ? sup.ad : emir.musteri ? '' : emir.firmaAd ?? '',
    emir.musteri ?? '',
  ].filter(Boolean).join(' | ');
  return (
    <div className="tc-km2-emir">
      <Dugme simge="chev-left" onClick={geri}>İş emirleri ve siparişler</Dugme>
      <SayfaBasligi
        baslik={`${emir.no ?? ''} ${emir.tip ?? ''}`.trim()} simge="clipboard-check"
        alt={<>{alt} <Rozet ton={durumTonu(emir.durum)}>{emir.durum ?? YOK}</Rozet></>}
        birincil={yetki.yaz ? {
          etiket: 'Lot kabul', simge: 'plus',
          yap: () => { git('lot-kabul', { ac: 'yeni', on: { parcaNo: emir.parcaNo ?? '', parcaAdi: emir.parcaAdi ?? '', tedarikci: emir.tedarikci ?? '', emir: emir.no ?? '' } }); },
        } : undefined}
      />
      {emir.parcaNo && (
        <p className="tc-km2-emir-parca">
          <Dugme simge="box" onClick={() => { git('parcalar', { parca: emir.parcaNo }); }}>Parça {emir.parcaNo}</Dugme>
        </p>
      )}
      <h3 className="tc-km2-bolum">İzlenebilirlik</h3>
      <Tablo
        etiket="İzlenebilirlik" satirlar={satirlar} sutunlar={sutunlar} satirAnahtari={(r) => `${r.kol}:${r.kimlik}`}
        satirSec={(r) => { git(IZ_GORUNUMU[r.kol], { ac: r.kimlik }); }}
        bosMesaj='Bu numaraya bağlı lot, muayene veya NCR yok. Kayıtlarda "İş emri / sipariş" alanına bu numarayı yazın.'
      />
      <div className="tc-km2-ekler">
        <Ekler
          veri={veri} yetki={yetki} kol="emir" kimlik={emir._id} eskiKimlikler={emir.eskiKimlikler} no={emir.no} parcaNo={emir.parcaNo}
          tur="Uygunluk sertifikası (CoC)"
        />
      </div>
    </div>
  );
}

const ESKI_SUTUNLAR: Sutun<Emir>[] = [
  { anahtar: 'no', baslik: 'Numara', hucre: (e) => <><span className="tc-km2-kod">{e.no ?? YOK}</span><span className="tc-km2-iki">{e.tip}</span></>, kirilmaz: true },
  { anahtar: 'parca', baslik: 'Parça', hucre: (e) => <>{e.parcaNo}<span className="tc-km2-iki">{e.parcaAdi}</span></> },
  { anahtar: 'termin', baslik: 'Termin', hucre: (e) => trd(e.termin), kirilmaz: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <Rozet ton={durumTonu(e.durum)}>{e.durum ?? YOK}</Rozet> },
];

// 592 B1 c: liste Üretim emirleri, Satın alma ve Siparişler'den gelir; burada eklenmez, düzenlenmez, CSV ile aktarılmaz.
export function IsEmirleri({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const [secili, seciliYaz] = useState<string | null>(null);

  // Geçiş bir kez işlenir: başka görünümden gelen "aç" isteği sayfayı açar.
  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    if (gecis.ac && gecis.ac !== 'yeni') seciliYaz(gecis.ac);
  }, [gecis]);

  const emir = secili ? veri.emir.find((x) => x._id === secili) : undefined;

  const sutunlar: Sutun<Emir>[] = [
    { anahtar: 'no', baslik: 'Numara', hucre: (e) => <><span className="tc-km2-kod">{e.no}</span><span className="tc-km2-iki">{e.tip}</span></>, kirilmaz: true },
    { anahtar: 'parca', baslik: 'Parça', hucre: (e) => <>{e.parcaNo || YOK}<span className="tc-km2-iki">{e.parcaAdi}</span></> },
    { anahtar: 'miktar', baslik: 'Miktar', hucre: (e) => e.miktar ?? YOK, hizala: 'sag', mono: true },
    { anahtar: 'termin', baslik: 'Termin', hucre: (e) => trd(e.termin), kirilmaz: true },
    {
      anahtar: 'bagli', baslik: 'Bağlı kayıtlar', hucre: (e) => {
        const b = emirBaglari(veri, e.no);
        const ret = retSayisi(b);
        return <>{`${b.lot.length} lot, ${b.insp.length} muayene, ${b.ncr.length} NCR`}{ret > 0 && <> <Rozet ton="hata">{`${ret} ret`}</Rozet></>}</>;
      },
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <Rozet ton={durumTonu(e.durum)}>{e.durum ?? YOK}</Rozet> },
  ];

  if (emir) return <EmirSayfasi veri={veri} yetki={yetki} emir={emir} git={git} geri={() => { seciliYaz(null); }} />;

  const eskiler = veri.eskiEmir ?? [];
  return (
    <div className="tc-km2-emirler">
      <SayfaBasligi
        baslik="İş emirleri ve siparişler" simge="clipboard-check"
        alt="Üretim emirleri, satın alma ve müşteri siparişlerinden gelir. Lot, muayene ve uygunsuzluklar bunlara bağlanır; izlenebilirlik zinciri buradan kurulur."
      />
      {veri.emirKaynagiHatasi
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(veri.emirKaynagiHatasi, 'İş emri ve siparişler alınamadı.')} />
        : (
          <KayitListesi<Emir>
            etiket="İş emirleri ve siparişler"
            satirlar={emirSirasi(veri.emir)}
            sutunlar={sutunlar}
            ara={emirAranan}
            aramaYeri="Numara, parça, müşteri ara"
            suzgec={{
              etiket: 'Durum', ilk: 'Açık', uyar: (e, d) => e.durum === d,
              secenekler: [{ deger: 'Açık', baslik: 'Açık' }, { deger: 'Kapalı', baslik: 'Kapalı' }, { deger: '', baslik: 'Tümü' }],
            }}
            ac={(e) => { seciliYaz(e._id); }}
            bos="Açık iş emri ya da sipariş yok. İş emirleri Üretim emirleri'nde, siparişler Satın alma ve Siparişler'de açılır."
          />
        )}
      {eskiler.length > 0 && (
        <>
          <h3 className="tc-km2-bolum">Eşleşmeyen eski kayıtlar</h3>
          <p className="tc-km2-emir-parca">Bu kayıtlar Kalite Merkezi'nde elle açılmıştı ve sahibinde karşılığı yok. Salt okunurdur; silinmeleri ayrı karardır.</p>
          <Tablo etiket="Eşleşmeyen eski kayıtlar" satirlar={eskiler} sutunlar={ESKI_SUTUNLAR} satirAnahtari={(e) => e._id} />
        </>
      )}
    </div>
  );
}

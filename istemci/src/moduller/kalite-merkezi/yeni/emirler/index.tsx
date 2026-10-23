import { useEffect, useRef, useState } from 'react';
import {
  Dugme, OnayPenceresi, Rozet, SayfaBasligi, Tablo, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { trd, YOK } from '../bicim.ts';
import { Ekler } from '../Ekler.tsx';
import { KayitListesi } from '../KayitListesi.tsx';
import type { EkranOzellikleri, KmGorunum, KmSayaci } from '../sekmeler.ts';
import type { Emir } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { EmirFormu } from './EmirFormu.tsx';
import {
  emirAranan, emirBaglari, emirCsvAyristir, emirSirasi, izlenebilirlik, retSayisi, type IzSatiri,
} from './hesap.ts';
import './emirler.css';

const durumTonu = (d?: string) => (d === 'Kapalı' ? 'tamam' : 'bilgi');
const sonucTonu = (s?: string) => (s === 'Kabul' || s === 'Kapalı' ? 'tamam' : s === 'Ret' || s === 'Açık' ? 'hata' : 'uyari');
const IZ_GORUNUMU: Record<IzSatiri['kol'], KmGorunum> = { lot: 'lot-kabul', insp: 'muayeneler', ncr: 'uygunsuzluklar' };

// Uygulamanın ikinci menüsünde iş emri sayacı yoktur (navCounts).
export const IsEmirleriSayaci: KmSayaci = null;

type Form = { kayit: Emir | null } | null;

function EmirSayfasi({ veri, yetki, emir, geri, git, duzenle }: {
  veri: KmVerisi; yetki: KmYetkisi; emir: Emir; geri: () => void; git: EkranOzellikleri['git']; duzenle: () => void;
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
    sup ? sup.ad : '',
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
        eylemler={yetki.yaz ? [{ anahtar: 'duzenle', baslik: 'Düzenle', simge: 'edit', sec: duzenle }] : []}
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
        <Ekler veri={veri} yetki={yetki} kol="emir" kimlik={emir._id} no={emir.no} parcaNo={emir.parcaNo} tur="Uygunluk sertifikası (CoC)" />
      </div>
    </div>
  );
}

export function IsEmirleri({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState<string | null>(null);
  const [form, formYaz] = useState<Form>(null);
  const [aktarim, aktarimYaz] = useState<{ kayitlar: Partial<Emir>[]; atlanan: number } | null>(null);
  const [aktariliyor, aktariliyorYaz] = useState(false);
  const dosya = useRef<HTMLInputElement>(null);
  const yaz = yetki.yaz;

  // Geçiş bir kez işlenir: başka görünümden gelen "aç" isteği sayfayı açar, "yeni" formu açar.
  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    if (gecis.ac === 'yeni') { if (yaz) formYaz({ kayit: null }); } else if (gecis.ac) seciliYaz(gecis.ac);
  }, [gecis, yaz]);

  const emir = secili ? veri.emir.find((x) => x._id === secili) : undefined;

  const aktar = async (f: File) => {
    const sonuc = emirCsvAyristir(await f.text(), veri.emir);
    if ('hata' in sonuc) { bildir('hata', sonuc.hata); return; }
    aktarimYaz(sonuc);
  };
  const aktarimiOnayla = async () => {
    if (!aktarim) return;
    aktariliyorYaz(true);
    let n = 0;
    try {
      for (const k of aktarim.kayitlar) { await komut.kaydet('emir', k); n++; }
      bildir('tamam', `${n} kayıt aktarıldı`);
    } catch {
      bildir('hata', `${n} kayıt aktarıldı; kalanlar kaydedilemedi.`);
    } finally {
      aktariliyorYaz(false);
      aktarimYaz(null);
    }
  };

  const sutunlar: Sutun<Emir>[] = [
    { anahtar: 'no', baslik: 'Numara', hucre: (e) => <><span className="tc-km2-kod">{e.no}</span><span className="tc-km2-iki">{e.tip}</span></>, kirilmaz: true },
    { anahtar: 'parca', baslik: 'Parça', hucre: (e) => <>{e.parcaNo}<span className="tc-km2-iki">{e.parcaAdi}</span></> },
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

  const formu = form && <EmirFormu veri={veri} yetki={yetki} kayit={form.kayit} kapat={() => { formYaz(null); }} />;

  if (emir) {
    return (
      <>
        <EmirSayfasi veri={veri} yetki={yetki} emir={emir} git={git} geri={() => { seciliYaz(null); }} duzenle={() => { formYaz({ kayit: emir }); }} />
        {formu}
      </>
    );
  }

  return (
    <div className="tc-km2-emirler">
      <SayfaBasligi
        baslik="İş emirleri ve siparişler" simge="clipboard-check"
        alt="Lot, muayene ve uygunsuzlukların bağlandığı iş emri ve siparişler. İzlenebilirlik zinciri buradan kurulur."
        birincil={yaz ? { etiket: 'Ekle', simge: 'plus', yap: () => { formYaz({ kayit: null }); } } : undefined}
        eylemler={yaz ? [{ anahtar: 'csv', baslik: "CSV'den aktar", simge: 'upload', sec: () => { dosya.current?.click(); } }] : []}
      />
      <input
        ref={dosya} type="file" accept=".csv,.txt" hidden aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void aktar(f); }}
      />
      <KayitListesi<Emir>
        etiket="İş emirleri ve siparişler"
        satirlar={emirSirasi(veri.emir)}
        sutunlar={sutunlar}
        arsivli
        ara={emirAranan}
        aramaYeri="Numara, parça, müşteri ara"
        suzgec={{
          etiket: 'Durum', ilk: 'Açık', uyar: (e, d) => e.durum === d,
          secenekler: [{ deger: 'Açık', baslik: 'Açık' }, { deger: 'Kapalı', baslik: 'Kapalı' }, { deger: '', baslik: 'Tümü' }],
        }}
        ac={(e) => { seciliYaz(e._id); }}
        bos="ERP'den iş emri ve sipariş listesini CSV olarak aktarabilir ya da tek tek ekleyebilirsiniz."
      />
      {formu}
      <OnayPenceresi
        acik={aktarim !== null} baslik="İçe aktar" onayMetni="Aktar" yukleniyor={aktariliyor}
        onayla={() => { void aktarimiOnayla(); }} vazgec={() => { aktarimYaz(null); }}
      >
        {aktarim && <p>{`${aktarim.kayitlar.length} yeni kayıt aktarılacak${aktarim.atlanan ? `, ${aktarim.atlanan} satır atlandı (boş veya zaten var)` : ''}.`}</p>}
      </OnayPenceresi>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KmGirisBekleyenCevabi, KmGirisKaydi, KmGirisKayitlariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Dugme, Girdi, Rozet, SayfaBasligi, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { YOK, zamanKisa } from '../bicim.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { GkkFormu } from './GkkFormu.tsx';
import { DURUM_ADI, DURUM_TONU, GIRIS_KAYITLARI_ANAHTARI, GKK_TURU_ADI, girisAraniyor, gkkSonucu, miktarMetni, sonucMetni } from './ortak.ts';
import './giris.css';

// Bekleyen sayısı sunucudan gelir (Bugün ve Üretim Terminali ile aynı sorgu); KmVerisi'nde olmadığından menü sayacı yoktur.
export const GirisKontroluSayaci: KmSayaci = null;

type SekmeAdi = 'bekleyen' | 'karar' | 'yapilan';
const YOKLAMA_MS = 15_000;
const GUN_MS = 86_400_000;
const VARSAYILAN_GUN = 30;

const ORTAK_SUTUNLAR: Sutun<KmGirisKaydi>[] = [
  {
    anahtar: 'malKabul', baslik: 'Mal kabul', kirilmaz: true,
    hucre: (k) => <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{k.malKabulNo}</b><small>{zamanKisa(k.zaman)}</small></span>,
    csv: (k) => k.malKabulNo,
  },
  {
    anahtar: 'malzeme', baslik: 'Malzeme',
    hucre: (k) => <span className="tc-km-gkk-hucre"><b>{k.malzemeKod ?? `#${String(k.malzemeId)}`}</b><small>{k.malzemeAd ?? ''}</small></span>,
    csv: (k) => `${k.malzemeKod ?? ''} ${k.malzemeAd ?? ''}`.trim(),
  },
  { anahtar: 'lot', baslik: 'Lot', mono: true, kirilmaz: true, hucre: (k) => k.partiEtiketi ?? YOK },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi', hucre: (k) => k.tedarikciAdi ?? YOK },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (k) => `${miktarMetni(k.miktar)} ${k.birim ?? ''}`.trim() },
];
const BEKLEYEN_SUTUNLARI: Sutun<KmGirisKaydi>[] = [
  ...ORTAK_SUTUNLAR,
  { anahtar: 'sertifika', baslik: 'Sertifika', hucre: (k) => (k.sertifikaVar ? <Rozet ton="tamam">Var</Rozet> : <Rozet ton="uyari">Yok</Rozet>), csv: (k) => (k.sertifikaVar ? 'Var' : 'Yok') },
  { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <Rozet ton={DURUM_TONU[k.durum]}>{DURUM_ADI[k.durum]}</Rozet>, csv: (k) => DURUM_ADI[k.durum] },
];
const KARAR_SUTUNLARI: Sutun<KmGirisKaydi>[] = [
  ...ORTAK_SUTUNLAR,
  { anahtar: 'hatali', baslik: 'Hatalı', hizala: 'sag', hucre: (k) => miktarMetni(k.hataliMiktar) },
  { anahtar: 'gkk', baslik: 'GKK', hucre: (k) => <span className="tc-km-gkk-hucre"><span>{k.gkkKisiAd ?? YOK}</span><small>{zamanKisa(k.gkkZaman)}</small></span>, csv: (k) => k.gkkKisiAd ?? '' },
];
const SONUC_TONU = { kabul: 'tamam', kismi: 'uyari', sartli: 'uyari', ret: 'hata' } as const;
const YAPILAN_SUTUNLARI: Sutun<KmGirisKaydi>[] = [
  {
    anahtar: 'gkkNo', baslik: 'GKK no', kirilmaz: true,
    hucre: (k) => <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{k.gkkNo ?? YOK}</b><small>{GKK_TURU_ADI[k.gkkTuru]}</small></span>,
    csv: (k) => k.gkkNo ?? '',
  },
  ...ORTAK_SUTUNLAR,
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (k) => <Rozet ton={SONUC_TONU[gkkSonucu(k) ?? 'kabul']}>{sonucMetni(k)}</Rozet>, csv: (k) => sonucMetni(k) },
  { anahtar: 'ncr', baslik: 'NCR', mono: true, kirilmaz: true, hucre: (k) => k.ncrNo ?? YOK },
  { anahtar: 'gkk', baslik: 'GKK', hucre: (k) => <span className="tc-km-gkk-hucre"><span>{k.gkkKisiAd ?? YOK}</span><small>{zamanKisa(k.gkkZaman)}</small></span>, csv: (k) => k.gkkKisiAd ?? '' },
];

// 3117: giriş kalite kontrolü listesi. Satın alma lotları (kartı GKK isteyen) üç sekmede: GKK bekleyen, hatalısı kararı bekleyen,
// kapanan. Satır mal kabul satırına bağlı GKK formunu açar. Liste ve form GKK uçlarının yetkisindedir (kalite-merkezi.onayla).
export function GirisKontrolu({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const [sekme, sekmeYaz] = useState<SekmeAdi>('bekleyen');
  const [arama, aramaYaz] = useState('');
  const [baslangic, baslangicYaz] = useState(() => tesisGunu(Date.now() - (VARSAYILAN_GUN - 1) * GUN_MS));
  const [bitis, bitisYaz] = useState(() => tesisGunu(Date.now()));
  const [acik, acikYaz] = useState<number | null>(null);

  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    const id = Number(gecis.ac);
    if (Number.isInteger(id) && id > 0) acikYaz(id);
  }, [gecis]);

  const bekleyenler = useQuery({
    queryKey: GIRIS_ANAHTARI, queryFn: () => api.get<KmGirisBekleyenCevabi>('/kalite-merkezi/giris/bekleyenler'),
    refetchInterval: YOKLAMA_MS, enabled: yetki.onayla,
  });
  const aralikGecerli = baslangic !== '' && bitis !== '' && baslangic <= bitis;
  const yapilanlar = useQuery({
    queryKey: [...GIRIS_KAYITLARI_ANAHTARI, baslangic, bitis],
    queryFn: () => api.get<KmGirisKayitlariCevabi>(`/kalite-merkezi/giris/kayitlar?baslangic=${baslangic}&bitis=${bitis}`),
    enabled: yetki.onayla && sekme === 'yapilan' && aralikGecerli,
  });

  if (!yetki.onayla) {
    return (
      <div className="tc-km-gkk">
        <SayfaBasligi baslik="Giriş kontrolü (GKK)" simge="clipboard-check" />
        <DurumKutusu durum="bos" mesaj="GKK onay yetkisiyle yapılır">
          <p>Satın alma lotlarının giriş kalite kontrolünü kalite onay yetkisi olan kişi verir.</p>
        </DurumKutusu>
      </div>
    );
  }

  const muayeneAc = yetki.yaz
    ? (k: KmGirisKaydi) => {
      git('muayeneler', {
        ac: 'yeni',
        on: { tur: 'Giriş', parcaNo: k.malzemeKod ?? '', parcaAdi: k.malzemeAd ?? '', lot: k.partiEtiketi ?? '', tedarikci: k.tedarikciAdi ?? '', miktar: Number(k.miktar) },
      });
    }
    : null;
  if (acik !== null) {
    return (
      <div className="tc-km-gkk">
        <SayfaBasligi baslik="Giriş kontrolü (GKK)" simge="clipboard-check" />
        <GkkFormu id={acik} ncrler={veri.ncr} muayeneAc={muayeneAc} kapat={() => { acikYaz(null); }} />
      </div>
    );
  }

  const tum = bekleyenler.data?.kayitlar ?? [];
  const gkkBekleyen = tum.filter((k) => k.durum === 'gkk_bekliyor');
  const kararBekleyen = tum.filter((k) => k.durum === 'karar_bekliyor');
  const kaynak = sekme === 'bekleyen' ? gkkBekleyen : sekme === 'karar' ? kararBekleyen : (yapilanlar.data?.kayitlar ?? []);
  const satirlar = kaynak.filter((k) => girisAraniyor(k, arama));
  const sorgu = sekme === 'yapilan' ? yapilanlar : bekleyenler;
  const sutunlar = sekme === 'bekleyen' ? BEKLEYEN_SUTUNLARI : sekme === 'karar' ? KARAR_SUTUNLARI : YAPILAN_SUTUNLARI;
  const bosMesaj = arama.trim()
    ? 'Aramaya uyan kayıt yok'
    : sekme === 'bekleyen' ? 'Bekleyen GKK yok' : sekme === 'karar' ? 'Kararı bekleyen hatalı lot yok' : 'Bu aralıkta yapılan GKK yok';

  return (
    <div className="tc-km-gkk">
      <SayfaBasligi
        baslik="Giriş kontrolü (GKK)" simge="clipboard-check"
        alt={`${String(gkkBekleyen.length)} GKK bekliyor, ${String(kararBekleyen.length)} karar bekliyor`}
      />
      <p className="tc-km-gkk-soluk">Kartı GKK isteyen satın alma lotları. Fason dönüşlerinin GKK'sı üretim emrindeki GKK adımında yapılır.</p>
      <Sekmeler
        etiket="GKK listesi" secili={sekme} sec={sekmeYaz}
        sekmeler={[
          { anahtar: 'bekleyen', baslik: 'Bekleyen', simge: 'clock', sayi: gkkBekleyen.length },
          { anahtar: 'karar', baslik: 'Karar bekleyen', simge: 'alert', sayi: kararBekleyen.length },
          { anahtar: 'yapilan', baslik: 'Yapılan', simge: 'check' },
        ]}
      />
      {sekme === 'yapilan' && (
        <div className="tc-km-gkk-aralik">
          <Girdi etiket="Başlangıç" type="date" value={baslangic} max={bitis} onChange={(e) => { baslangicYaz(e.target.value); }} />
          <Girdi etiket="Bitiş" type="date" value={bitis} min={baslangic} onChange={(e) => { bitisYaz(e.target.value); }}
            hata={aralikGecerli ? undefined : 'Başlangıç bitişten sonra olamaz.'} />
        </div>
      )}
      {sorgu.isError
        ? <DurumKutusu durum="hata" hata={sorgu.error} yenile={() => { void sorgu.refetch(); }} />
        : (
          <Tablo
            etiket={sekme === 'bekleyen' ? 'Bekleyen GKK' : sekme === 'karar' ? 'Karar bekleyen' : 'Yapılan GKK'}
            sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(k) => k.malKabulSatirId}
            satirSec={(k) => { acikYaz(k.malKabulSatirId); }}
            yukleniyor={sorgu.isPending && (sekme !== 'yapilan' || aralikGecerli)} bosMesaj={bosMesaj}
            bosEylem={sekme === 'bekleyen' && !arama.trim() && !bekleyenler.isPending
              ? <Dugme tur="ikincil" onClick={() => { sekmeYaz('yapilan'); }}>Yapılanlara bak</Dugme> : undefined}
            arac={{
              arama: { deger: arama, degistir: aramaYaz, etiket: 'GKK ara', yerTutucu: 'GKK no, mal kabul, malzeme, lot, tedarikçi, sipariş' },
              csv: { ad: `gkk-${sekme}` },
            }}
          />
        )}
      {sekme === 'yapilan' && yapilanlar.data?.sinirda && (
        <p className="tc-km-gkk-soluk">İlk {String(yapilanlar.data.kayitlar.length)} kayıt gösteriliyor; aralığı daraltın.</p>
      )}
    </div>
  );
}

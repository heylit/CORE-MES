import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  KmFasonGkkKarari, KmFasonGkkSatiri, KmGirisBekleyenCevabi, KmGirisKaydi, KmGirisKayitlariCevabi, KmKaynaktaMuayeneSatiri,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Dugme, Girdi, Rozet, SayfaBasligi, Sekmeler, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { YOK, zamanKisa } from '../bicim.ts';
import { GIRIS_ANAHTARI } from '../bugun/GirisKarari.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { FasonKarari } from './FasonKarari.tsx';
import { GkkFormu } from './GkkFormu.tsx';
import { KaynaktaMuayene } from './KaynaktaMuayene.tsx';
import { LotEtiketiDugmesi } from './LotEtiketiDugmesi.tsx';
import {
  DURUM_ADI, DURUM_TONU, GIRIS_KAYITLARI_ANAHTARI, GKK_TURU_ADI, bekleyenAnahtari, fasonAraniyor, girisAraniyor, gkkSonucu, miktarMetni, muayeneAraniyor,
  sonucMetni, type BekleyenSatir,
} from './ortak.ts';
import './giris.css';

// Bekleyen sayısı sunucudan gelir (Bugün ve Üretim Terminali ile aynı sorgu); KmVerisi'nde olmadığından menü sayacı yoktur.
export const GirisKontroluSayaci: KmSayaci = null;

type SekmeAdi = 'bekleyen' | 'karar' | 'kaynakta' | 'yapilan';
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
// 3809: Bekleyen iki kaynağı tek tabloda gösterir. Fason satırının kimliği emir ve OP'dir; lotu ve sertifikası yoktur, miktarı
// "bekleyen / gelen" adettir. Fason dönüşü karantinada karar bekliyor olsa da hatalı lot kararı değildir: yalnız burada görünür.
const fasonMiktari = (f: KmFasonGkkSatiri): string =>
  f.bekleyenAdet === null ? `${miktarMetni(f.bekleyen)} ${f.birim ?? ''}`.trim() : `${String(f.bekleyenAdet)} / ${String(f.gelenAdet ?? 0)} adet`;
const BEKLEYEN_SUTUNLARI: Sutun<BekleyenSatir>[] = [
  {
    anahtar: 'kimlik', baslik: 'Kayıt', kirilmaz: true,
    hucre: (s) => (s.tur === 'fason'
      ? <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{s.f.emirNo} · OP {s.f.opNo}</b><small>{s.f.malKabulNo ?? ''} {zamanKisa(s.f.sonZaman)}</small></span>
      : <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{s.k.malKabulNo}</b><small>{zamanKisa(s.k.zaman)}</small></span>),
    csv: (s) => (s.tur === 'fason' ? `${s.f.emirNo} OP ${String(s.f.opNo)}` : s.k.malKabulNo),
  },
  {
    anahtar: 'kaynak', baslik: 'Kaynak', kartRozet: true,
    hucre: (s) => (s.tur === 'fason' ? <Rozet ton="bilgi">Fason dönüşü</Rozet> : <Rozet>Satın alma</Rozet>),
    csv: (s) => (s.tur === 'fason' ? 'Fason dönüşü' : 'Satın alma'),
  },
  {
    anahtar: 'malzeme', baslik: 'Malzeme', kartta: true,
    hucre: (s) => (s.tur === 'fason'
      ? <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-kod">{s.f.parcaNo}</b><small>{s.f.parcaAd}</small></span>
      : <span className="tc-km-gkk-hucre"><b>{s.k.malzemeKod ?? `#${String(s.k.malzemeId)}`}</b><small>{s.k.malzemeAd ?? ''}</small></span>),
    csv: (s) => (s.tur === 'fason' ? `${s.f.parcaNo} ${s.f.parcaAd}` : `${s.k.malzemeKod ?? ''} ${s.k.malzemeAd ?? ''}`.trim()),
  },
  { anahtar: 'lot', baslik: 'Lot', mono: true, kirilmaz: true, hucre: (s) => (s.tur === 'fason' ? YOK : s.k.partiEtiketi ?? YOK) },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi / firma', hucre: (s) => (s.tur === 'fason' ? s.f.firmaAdi : s.k.tedarikciAdi) ?? YOK },
  {
    anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, kartta: true,
    hucre: (s) => (s.tur === 'fason' ? fasonMiktari(s.f) : `${miktarMetni(s.k.miktar)} ${s.k.birim ?? ''}`.trim()),
  },
  {
    anahtar: 'sertifika', baslik: 'Sertifika',
    hucre: (s) => (s.tur === 'fason' ? YOK : s.k.sertifikaVar ? <Rozet ton="tamam">Var</Rozet> : <Rozet ton="uyari">Yok</Rozet>),
    csv: (s) => (s.tur === 'fason' ? '' : s.k.sertifikaVar ? 'Var' : 'Yok'),
  },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (s) => (s.tur === 'fason' ? <Rozet ton="uyari">GKK bekliyor</Rozet> : <Rozet ton={DURUM_TONU[s.k.durum]}>{DURUM_ADI[s.k.durum]}</Rozet>),
    csv: (s) => (s.tur === 'fason' ? 'GKK bekliyor' : DURUM_ADI[s.k.durum]),
  },
];
const KAYNAKTA_SUTUNLARI: Sutun<KmKaynaktaMuayeneSatiri>[] = [
  {
    anahtar: 'emir', baslik: 'Emir', kirilmaz: true,
    hucre: (m) => <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{m.emirNo} · OP {m.opNo}</b><small>{zamanKisa(m.ilkGidis)}</small></span>,
    csv: (m) => `${m.emirNo} OP ${String(m.opNo)}`,
  },
  { anahtar: 'parca', baslik: 'Parça', kartta: true, hucre: (m) => <span className="tc-km-gkk-hucre"><b>{m.parcaNo}</b><small>{m.parcaAd}</small></span>, csv: (m) => `${m.parcaNo} ${m.parcaAd}` },
  { anahtar: 'firma', baslik: 'Firma', kartta: true, hucre: (m) => m.firmaAdi ?? YOK },
  { anahtar: 'gonderilen', baslik: 'Gönderilen', hizala: 'sag', kirilmaz: true, hucre: (m) => `${String(m.gonderilen)} adet` },
  { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', kirilmaz: true, hucre: (m) => (m.sureSaat === null ? YOK : `${m.sureSaat} sa`) },
  {
    anahtar: 'durum', baslik: 'Belgeler',
    hucre: (m) => (m.zorunlu.length === 0
      ? <Rozet>Zorunlu yok</Rozet>
      : m.eksik.length > 0 ? <Rozet ton="uyari">{`${String(m.zorunlu.length - m.eksik.length)} / ${String(m.zorunlu.length)} belge`}</Rozet>
        : <Rozet ton="tamam">Belgeler tamam</Rozet>),
    csv: (m) => (m.eksik.length > 0 ? `Eksik: ${m.eksik.join(', ')}` : 'Tamam'),
  },
];
const FASON_SONUC: Record<KmFasonGkkKarari['sonuc'], { ad: string; ton: 'tamam' | 'uyari' | 'hata' }> = {
  serbest: { ad: 'Serbest', ton: 'tamam' }, sartli: { ad: 'Şartlı', ton: 'uyari' }, red: { ad: 'Red', ton: 'hata' },
};
const FASON_YAPILAN_SUTUNLARI: Sutun<KmFasonGkkKarari>[] = [
  { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (k) => `${k.emirNo ?? YOK} · OP ${String(k.opNo)}` },
  { anahtar: 'durum', baslik: 'Sonuç', hucre: (k) => <Rozet ton={FASON_SONUC[k.sonuc].ton}>{FASON_SONUC[k.sonuc].ad}</Rozet>, csv: (k) => FASON_SONUC[k.sonuc].ad },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, kartta: true, hucre: (k) => miktarMetni(k.miktar) },
  { anahtar: 'kisi', baslik: 'GKK', kartta: true, hucre: (k) => <span className="tc-km-gkk-hucre"><span>{k.kisiAd ?? YOK}</span><small>{zamanKisa(k.zaman)}</small></span>, csv: (k) => k.kisiAd ?? '' },
];
const GKK_NO_SUTUNU: Sutun<KmGirisKaydi> = {
  anahtar: 'gkkNo', baslik: 'GKK no', kirilmaz: true,
  hucre: (k) => <span className="tc-km-gkk-hucre"><b className="tc-km-gkk-mono">{k.gkkNo ?? YOK}</b><small>{GKK_TURU_ADI[k.gkkTuru]}</small></span>,
  csv: (k) => k.gkkNo ?? '',
};
const KARAR_SUTUNLARI: Sutun<KmGirisKaydi>[] = [
  GKK_NO_SUTUNU,
  ...ORTAK_SUTUNLAR,
  { anahtar: 'hatali', baslik: 'Hatalı', hizala: 'sag', hucre: (k) => miktarMetni(k.hataliMiktar) },
  { anahtar: 'gkk', baslik: 'GKK', hucre: (k) => <span className="tc-km-gkk-hucre"><span>{k.gkkKisiAd ?? YOK}</span><small>{zamanKisa(k.gkkZaman)}</small></span>, csv: (k) => k.gkkKisiAd ?? '' },
];
const SONUC_TONU = { kabul: 'tamam', kismi: 'uyari', sartli: 'uyari', ret: 'hata' } as const;
const YAPILAN_SUTUNLARI: Sutun<KmGirisKaydi>[] = [
  GKK_NO_SUTUNU,
  ...ORTAK_SUTUNLAR,
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (k) => <Rozet ton={SONUC_TONU[gkkSonucu(k) ?? 'kabul']}>{sonucMetni(k)}</Rozet>, csv: (k) => sonucMetni(k) },
  { anahtar: 'ncr', baslik: 'NCR', mono: true, kirilmaz: true, hucre: (k) => k.ncrNo ?? YOK },
  { anahtar: 'gkk', baslik: 'GKK', hucre: (k) => <span className="tc-km-gkk-hucre"><span>{k.gkkKisiAd ?? YOK}</span><small>{zamanKisa(k.gkkZaman)}</small></span>, csv: (k) => k.gkkKisiAd ?? '' },
  // 3713: etiket güncel GKK sonucunu taşır; yalnız kapanan GKK'da (sonuç kesin) basılır.
  { anahtar: 'etiket', baslik: 'Etiket', sabit: 'sag', csv: false, hucre: (k) => <LotEtiketiDugmesi partiId={k.partiId} lotNo={k.partiEtiketi} ikon /> },
];

// 3117: giriş kalite kontrolü listesi. Satın alma lotları (kartı GKK isteyen) üç sekmede: GKK bekleyen, hatalısı kararı bekleyen,
// kapanan. Satır mal kabul satırına bağlı GKK formunu açar. Liste ve form GKK uçlarının yetkisindedir (kalite-merkezi.onayla).
export function GirisKontrolu({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const [sekme, sekmeYaz] = useState<SekmeAdi>('bekleyen');
  const [arama, aramaYaz] = useState('');
  const [baslangic, baslangicYaz] = useState(() => tesisGunu(Date.now() - (VARSAYILAN_GUN - 1) * GUN_MS));
  const [bitis, bitisYaz] = useState(() => tesisGunu(Date.now()));
  const [acik, acikYaz] = useState<number | null>(null);
  const [fasonAcik, fasonAcikYaz] = useState<KmFasonGkkSatiri | null>(null);
  const [muayeneAcik, muayeneAcikYaz] = useState<KmKaynaktaMuayeneSatiri | null>(null);

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
        <GkkFormu id={acik} ncrler={veri.ncr} sablonlar={veri.tpl} muayeneAc={muayeneAc} kapat={() => { acikYaz(null); }} />
      </div>
    );
  }

  const tum = bekleyenler.data?.kayitlar ?? [];
  const fason = bekleyenler.data?.fason ?? [];
  const kaynakta = bekleyenler.data?.kaynakta ?? [];
  const gkkBekleyen = tum.filter((k) => k.durum === 'gkk_bekliyor');
  const kararBekleyen = tum.filter((k) => k.durum === 'karar_bekliyor');
  const bekleyenSatirlari: BekleyenSatir[] = [
    ...fason.filter((f) => fasonAraniyor(f, arama)).map((f) => ({ tur: 'fason' as const, f })),
    ...gkkBekleyen.filter((k) => girisAraniyor(k, arama)).map((k) => ({ tur: 'satin_alma' as const, k })),
  ];
  const kayitKaynagi = sekme === 'karar' ? kararBekleyen : (yapilanlar.data?.kayitlar ?? []);
  const satirlar = kayitKaynagi.filter((k) => girisAraniyor(k, arama));
  const muayeneSatirlari = kaynakta.filter((m) => muayeneAraniyor(m, arama));
  const fasonYapilan = sekme === 'yapilan' ? (yapilanlar.data?.fason ?? []).filter((k) => !arama.trim() || `${k.emirNo ?? ''} OP ${String(k.opNo)}`.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR'))) : [];
  const sorgu = sekme === 'yapilan' ? yapilanlar : bekleyenler;
  const sutunlar = sekme === 'karar' ? KARAR_SUTUNLARI : YAPILAN_SUTUNLARI;
  const bosMesaj = arama.trim()
    ? 'Aramaya uyan kayıt yok'
    : sekme === 'bekleyen' ? 'Bekleyen GKK yok' : sekme === 'karar' ? 'Kararı bekleyen hatalı lot yok'
      : sekme === 'kaynakta' ? 'Bekleyen kaynağında muayene yok'
        : fasonYapilan.length > 0 ? 'Bu aralıkta mal kabul GKK\'sı yok; fason dönüşü kararları aşağıda.' : 'Bu aralıkta yapılan GKK yok';
  const yukleniyor = sorgu.isPending && (sekme !== 'yapilan' || aralikGecerli);
  const arac = (etiket: string, yerTutucu: string) => ({ arama: { deger: arama, degistir: aramaYaz, etiket, yerTutucu }, csv: { ad: `gkk-${sekme}` } });

  return (
    <div className="tc-km-gkk">
      <SayfaBasligi
        baslik="Giriş kontrolü (GKK)" simge="clipboard-check"
        alt={`${String(gkkBekleyen.length + fason.length)} GKK bekliyor, ${String(kararBekleyen.length)} karar bekliyor, ${String(kaynakta.length)} kaynağında muayene`}
      />
      <p className="tc-km-gkk-soluk">Kartı GKK isteyen satın alma lotları ve fason dönüşleri. Fason kararı emrin GKK adımını, muayene onayı muayene adımını kapatır.</p>
      <Sekmeler
        etiket="GKK listesi" secili={sekme} sec={sekmeYaz}
        sekmeler={[
          { anahtar: 'bekleyen', baslik: 'Bekleyen', simge: 'clock', sayi: gkkBekleyen.length + fason.length },
          { anahtar: 'karar', baslik: 'Karar bekleyen', simge: 'alert', sayi: kararBekleyen.length },
          { anahtar: 'kaynakta', baslik: 'Kaynağında muayene', simge: 'clipboard-check', sayi: kaynakta.length },
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
        : sekme === 'bekleyen'
          ? (
            <Tablo
              etiket="Bekleyen GKK" sutunlar={BEKLEYEN_SUTUNLARI} satirlar={bekleyenSatirlari} satirAnahtari={bekleyenAnahtari}
              satirSec={(x) => { if (x.tur === 'fason') fasonAcikYaz(x.f); else acikYaz(x.k.malKabulSatirId); }}
              yukleniyor={yukleniyor} bosMesaj={bosMesaj}
              bosEylem={!arama.trim() && !bekleyenler.isPending
                ? <Dugme tur="ikincil" onClick={() => { sekmeYaz('yapilan'); }}>Yapılanlara bak</Dugme> : undefined}
              arac={arac('GKK ara', 'Mal kabul, emir, malzeme, lot, tedarikçi, firma')}
            />
          )
          : sekme === 'kaynakta'
            ? (
              <Tablo
                etiket="Kaynağında muayene" sutunlar={KAYNAKTA_SUTUNLARI} satirlar={muayeneSatirlari} satirAnahtari={(m) => m.muayeneIsEmriId}
                satirSec={muayeneAcikYaz} yukleniyor={yukleniyor} bosMesaj={bosMesaj}
                arac={arac('Muayene ara', 'Emir, OP, parça, firma')}
              />
            )
            : (
              <Tablo
                etiket={sekme === 'karar' ? 'Karar bekleyen' : 'Yapılan GKK'}
                sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(k) => k.malKabulSatirId}
                satirSec={(k) => { acikYaz(k.malKabulSatirId); }}
                yukleniyor={yukleniyor} bosMesaj={bosMesaj}
                arac={arac('GKK ara', 'GKK no, mal kabul, malzeme, lot, tedarikçi, sipariş')}
              />
            )}
      {sekme === 'yapilan' && fasonYapilan.length > 0 && <h3 className="tc-km-gkk-bolum">Fason dönüşü kararları</h3>}
      {sekme === 'yapilan' && fasonYapilan.length > 0 && (
        <Tablo etiket="Fason dönüşü kararları" sutunlar={FASON_YAPILAN_SUTUNLARI} satirlar={fasonYapilan}
          satirAnahtari={(k) => `${String(k.uretimEmriId)}-${String(k.opNo)}-${k.zaman}-${k.sonuc}-${k.miktar}`} bosMesaj="" />
      )}
      {fasonAcik !== null && <FasonKarari satir={fasonAcik} kapat={() => { fasonAcikYaz(null); }} />}
      {muayeneAcik !== null && <KaynaktaMuayene satir={muayeneAcik} kapat={() => { muayeneAcikYaz(null); }} />}
      {sekme === 'yapilan' && yapilanlar.data?.sinirda && (
        <p className="tc-km-gkk-soluk">İlk {String(yapilanlar.data.kayitlar.length)} kayıt gösteriliyor; aralığı daraltın.</p>
      )}
    </div>
  );
}

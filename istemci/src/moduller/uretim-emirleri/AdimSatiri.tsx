import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdimDurumuCevabi, AdimliEmirCevabi, IsEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { MenuOgesi, RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { STATU, adimDurumuUcu } from './adim-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from './gorunum.ts';
import { useSmartesRozetleri, type SmartesAdimBilgisi, type SmartesEmirBilgisi } from './SmartesRozeti.tsx';
import { YerPenceresi, degisimEngeli, fasonMu } from './UretimYerleri.tsx';

// Emrin adım verisinin tek okuyucusu (3039, 3581): adım tablosu, emir sayfasının özet kutusu ve başlık rozeti aynı sorguları paylaşır.
// Statüyü sunucu türetir (Adım Durumu); satırın sağındaki bilgi artık tabloda durur, burada yalnız satıra özel menü, iç/fason penceresi
// ve SmartES bilgisi hazırlanır. Statü okunamazsa (yetki ya da iş emri yok) tablo satırın kendi durum rozetini (`yedek`) gösterir.
export interface AdimSatirBilgisi {
  isEmri: IsEmri | null;
  // Üretim yeri seçimi (iç/fason); yetkisiz ya da iş emri yoksa boş.
  menu: MenuOgesi[];
  smartes: SmartesAdimBilgisi | null;
}

export interface AdimSatirEki {
  satir: (opNo: number) => AdimSatirBilgisi;
  // Özet kutusundaki "Şu an" için: adımın statüsü ve elle yazdıysa kişi; okunamazsa null.
  statu: (opNo: number) => { ad: string; ton: RozetTonu; kisi: string | null } | null;
  pencere: React.ReactNode;
  // 3346: emrin SmartES gönderim durumu (başlık rozeti); okuma yetkisi yoksa `gorunur` false.
  smartes: { gorunur: boolean; bilgi: SmartesEmirBilgisi | null; hata: boolean };
  // Statü ve hazırlık okunabiliyor mu (Adım Durumu sayfası yetkisi ya da emir okuma); tablo buna göre çizilir.
  durumOkur: boolean;
  adimliOkur: boolean;
  durum: { isPending: boolean; isError: boolean; data: AdimDurumuCevabi | undefined; refetch: () => void };
  adimli: { data: AdimliEmirCevabi | undefined };
}

// malzemeNo: emir sayfası verir (malzemesiz emirde iş emri okunmaz); Adım Durumu sayfası vermez, emir listesinden seçilen emir okunur.
export function useAdimSatirEki(emirId: number, malzemeNo?: number | null): AdimSatirEki {
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const adimliOkur = ADIMLI_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  const durumOkur = adimliOkur || islemler.includes('sayfa.adim-durumu');
  const yerYazar = islemler.includes('uretim-emirleri.duzenle');
  const [secili, seciliYaz] = useState<IsEmri | null>(null);
  const smartes = useSmartesRozetleri(emirId > 0 ? [emirId] : [], adimliOkur && emirId > 0);
  const smartesEmri = smartes.emir(emirId);
  const durum = useQuery({
    queryKey: anahtarlar.adimDurumu(emirId),
    queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(emirId)),
    enabled: durumOkur && emirId > 0,
  });
  const adimli = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
    enabled: adimliOkur && malzemeNo !== null && emirId > 0,
  });
  const satir = (opNo: number): AdimSatirBilgisi => {
    const is = adimli.data?.emir.isEmirleri.find((x) => x.opNo === opNo) ?? null;
    const engel = is ? degisimEngeli(is) : null;
    const menu: MenuOgesi[] = is && yerYazar ? [{
      anahtar: 'yer', simge: 'truck' as const, sec: () => { seciliYaz(is); },
      baslik: is.fasonFirmasiz === true ? 'Fason firma seç' : fasonMu(is) ? 'Nerede yapılır: değiştir' : 'Fasona al',
      pasif: engel !== null, pasifNedeni: engel ?? undefined,
    }] : [];
    return { isEmri: is, menu, smartes: smartesEmri?.adimlar.find((x) => x.opNo === opNo) ?? null };
  };
  const statu: AdimSatirEki['statu'] = (opNo) => {
    const a = durum.data?.adimlar.find((x) => x.opNo === opNo) ?? null;
    if (!a) return null;
    // Elle yazılan statü sistemin türettiğinin önüne geçer.
    const g = STATU[a.elle?.statu ?? a.sistemStatusu];
    return { ad: g.ad, ton: g.ton, kisi: a.elle?.kisiAdi ?? null };
  };
  const pencere = secili && adimli.data
    ? <YerPenceresi emirId={emirId} surum={adimli.data.emir.surum} adim={secili} kapat={() => { seciliYaz(null); }} />
    : null;
  return {
    satir, statu, pencere, smartes: { gorunur: adimliOkur, bilgi: smartesEmri, hata: smartes.hata }, durumOkur, adimliOkur,
    durum: { isPending: durum.isPending, isError: durum.isError, data: durum.data, refetch: () => { void durum.refetch(); } },
    adimli: { data: adimli.data },
  };
}

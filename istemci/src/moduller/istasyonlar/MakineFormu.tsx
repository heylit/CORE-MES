import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BaglantiTuru, IstasyonlarCevabi, MakineDurumlariCevabi, SurumluMakine, MakineGovdesi, MakinelerCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { DurumKutusu, Girdi, IsaretKutusu, OnayPenceresi, Secim, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { csvIndir } from './csv.ts';
import { BAGLANTI_ADLARI, BAGLANTI_SECENEKLERI, MAKINE_DURUM_ADLARI } from './etiketler.ts';
import { durumSutunu } from './durumSutunu.tsx';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { KisiPaneli } from './KisiPaneli.tsx';
import { ListeAraclari, aramayaUyar } from './ListeAraclari.tsx';
import { MakineDurumRozeti, MakineDurumuPaneli } from './MakineDurumuPaneli.tsx';
import { useKayitIslemleri } from './kayitIslemleri.ts';

export function MakineFormu({ kayit, kapat }: { kayit: SurumluMakine | null; kapat: () => void }) {
  const [kod, kodYaz] = useState(kayit?.kod ?? '');
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [tur, turYaz] = useState(kayit?.tur ?? '');
  const [markaModel, markaModelYaz] = useState(kayit?.markaModel ?? '');
  const [seriNo, seriNoYaz] = useState(kayit?.seriNo ?? '');
  const [istasyonId, istasyonIdYaz] = useState(kayit?.istasyonId === null || kayit === null ? '' : String(kayit.istasyonId));
  const [baglantiTuru, baglantiTuruYaz] = useState<BaglantiTuru | ''>(kayit?.baglantiTuru ?? '');
  const [baglantiAdresi, baglantiAdresiYaz] = useState(kayit?.baglantiAdresi ?? '');
  const [aktif, aktifYaz] = useState(kayit?.aktif ?? true);
  const [silOnayi, silOnayiYaz] = useState(false);
  const { kaydet, sil, hata, mesgul } = useKayitIslemleri('/makineler', kapat);
  const istasyonlar = useQuery({
    queryKey: anahtarlar.istasyonlar,
    queryFn: () => api.get<IstasyonlarCevabi>('/istasyonlar?pasifler=true'),
  });
  const secenekler = (istasyonlar.data?.istasyonlar ?? []).map((i) => ({
    deger: String(i.id),
    baslik: `${i.kod} - ${i.ad}${i.aktif ? '' : ' (pasif)'}`,
  }));
  const govde: MakineGovdesi = {
    kod, ad, tur, markaModel, seriNo, aktif, baglantiAdresi,
    istasyonId: istasyonId === '' ? null : Number(istasyonId),
    baglantiTuru: baglantiTuru === '' ? null : baglantiTuru,
  };

  return (
    <>
      <KayitPenceresi
        baslik={kayit ? 'Makine düzenle' : 'Yeni makine'}
        kapat={kapat}
        kaydet={() => kaydet.mutate({ kayit, govde })}
        sil={kayit ? () => silOnayiYaz(true) : undefined}
        mesgul={mesgul}
        hata={hata}
        ek={kayit ? <><MakineDurumuPaneli makineId={kayit.id} /><KisiPaneli tur="makine" hedefId={kayit.id} /></> : undefined}
      >
        <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} ipucu="Büyük harfe çevrilir." />
        <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required />
        <Girdi etiket="Tür" value={tur} onChange={(o) => turYaz(o.target.value)} />
        <Girdi etiket="Marka / model" value={markaModel} onChange={(o) => markaModelYaz(o.target.value)} />
        <Girdi etiket="Seri no" value={seriNo} onChange={(o) => seriNoYaz(o.target.value)} />
        <Secim
          etiket="İstasyon"
          bosSecenek="İstasyonsuz"
          secenekler={secenekler}
          value={istasyonId}
          onChange={(o) => istasyonIdYaz(o.target.value)}
        />
        <Secim
          etiket="Bağlantı türü"
          bosSecenek="Yok"
          secenekler={BAGLANTI_SECENEKLERI}
          value={baglantiTuru}
          onChange={(o) => {
            const yeni = o.target.value as BaglantiTuru | '';
            baglantiTuruYaz(yeni);
            if (yeni === '') baglantiAdresiYaz('');
          }}
        />
        <Girdi
          etiket="Bağlantı adresi"
          value={baglantiAdresi}
          onChange={(o) => baglantiAdresiYaz(o.target.value)}
          disabled={baglantiTuru === ''}
          ipucu="Yalnız bağlantı türü seçiliyken girilir."
        />
        <IsaretKutusu etiket="Aktif" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} />
      </KayitPenceresi>
      <OnayPenceresi
        acik={silOnayi}
        baslik="Makine silinsin mi?"
        onayMetni="Sil"
        tehlikeli
        yukleniyor={sil.isPending}
        vazgec={() => silOnayiYaz(false)}
        onayla={() => { silOnayiYaz(false); if (kayit) sil.mutate(kayit.id); }}
      >
        <p>Makine kaydı kalıcı olarak silinir. Kullanılan makineyi silmek yerine pasife alın.</p>
      </OnayPenceresi>
    </>
  );
}


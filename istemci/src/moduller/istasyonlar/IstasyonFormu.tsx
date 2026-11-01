import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  IsMerkezleriCevabi, KapasiteKaynagi, KisiSecenekleriCevabi, SurumluIstasyon, IstasyonGovdesi,
  IstasyonTipi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { Girdi, IsaretKutusu, OnayPenceresi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KAPASITE_KAYNAGI_SECENEKLERI, TIP_SECENEKLERI } from './etiketler.ts';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { KisiPaneli } from './KisiPaneli.tsx';
import { PlanAyariOzeti } from './PlanAyariOzeti.tsx';
import { useKayitIslemleri } from './kayitIslemleri.ts';

export function IstasyonFormu({ kayit, kapat }: { kayit: SurumluIstasyon | null; kapat: () => void }) {
  const [kod, kodYaz] = useState(kayit?.kod ?? '');
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [isMerkeziId, isMerkeziIdYaz] = useState(kayit ? String(kayit.isMerkeziId) : '');
  const [tip, tipYaz] = useState<IstasyonTipi>(kayit?.tip ?? 'talasli');
  const [sorumluKisiId, sorumluKisiIdYaz] = useState(kayit?.sorumluKisiId == null ? '' : String(kayit.sorumluKisiId));
  const [kapasiteKaynagi, kapasiteKaynagiYaz] = useState<KapasiteKaynagi | ''>(kayit?.kapasiteKaynagi ?? '');
  const [aktif, aktifYaz] = useState(kayit?.aktif ?? true);
  const [uretimAlani, uretimAlaniYaz] = useState(kayit?.uretimAlani ?? false);
  const [silOnayi, silOnayiYaz] = useState(false);
  const { kaydet, sil, hata, mesgul } = useKayitIslemleri('/istasyonlar', kapat);
  const kisiler = useQuery({
    queryKey: anahtarlar.kisiSecenekleri,
    queryFn: () => api.get<KisiSecenekleriCevabi>('/kisi-secenekleri'),
  });
  // Yeni sorumlu yalnız aktif kişilerden seçilir; kayıtta duran pasif sorumlu korunur.
  const sorumluSecenekleri = (kisiler.data?.kisiler ?? [])
    .filter((k) => k.aktif || k.id === kayit?.sorumluKisiId)
    .map((k) => ({ deger: String(k.id), baslik: `${k.ad}${k.aktif ? '' : ' (pasif)'}` }));
  const merkezler = useQuery({
    queryKey: anahtarlar.isMerkezleri,
    queryFn: () => api.get<IsMerkezleriCevabi>('/is-merkezleri?pasifler=true'),
  });
  const secenekler = (merkezler.data?.isMerkezleri ?? []).map((m) => ({
    deger: String(m.id),
    baslik: `${m.kod} - ${m.ad}${m.aktif ? '' : ' (pasif)'}`,
  }));
  // Kapasite kaynağını bugün ekran zorunlu tutar (IK4; sunucu bağlamada zorunlu kılacak).
  const govde: IstasyonGovdesi | null = isMerkeziId === '' || kapasiteKaynagi === '' ? null : {
    kod, ad, isMerkeziId: Number(isMerkeziId), tip, aktif, kapasiteKaynagi, uretimAlani,
    sorumluKisiId: sorumluKisiId === '' ? null : Number(sorumluKisiId),
  };

  return (
    <>
      <KayitPenceresi
        baslik={kayit ? 'İstasyon düzenle' : 'Yeni istasyon'}
        kapat={kapat}
        kaydet={() => { if (govde) kaydet.mutate({ kayit, govde }); }}
        sil={kayit ? () => silOnayiYaz(true) : undefined}
        mesgul={mesgul}
        hata={hata}
        ek={kayit ? <><PlanAyariOzeti istasyonId={kayit.id} /><KisiPaneli tur="istasyon" hedefId={kayit.id} /></> : undefined}
      >
        <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} ipucu="Büyük harfe çevrilir." />
        <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required />
        <Secim
          etiket="İş merkezi"
          required
          bosSecenek="Seçiniz"
          secenekler={secenekler}
          value={isMerkeziId}
          onChange={(o) => isMerkeziIdYaz(o.target.value)}
        />
        <Secim etiket="Tip" secenekler={TIP_SECENEKLERI} value={tip} onChange={(o) => tipYaz(o.target.value as IstasyonTipi)} />
        <Secim
          etiket="Kapasite kaynağı"
          required
          bosSecenek="Seçiniz"
          secenekler={KAPASITE_KAYNAGI_SECENEKLERI}
          value={kapasiteKaynagi}
          onChange={(o) => kapasiteKaynagiYaz(o.target.value as KapasiteKaynagi | '')}
          ipucu="Makine saati ya da istasyondaki kişilerin saati."
        />
        <Secim
          etiket="Sorumlu"
          bosSecenek="Yok"
          secenekler={sorumluSecenekleri}
          value={sorumluKisiId}
          onChange={(o) => sorumluKisiIdYaz(o.target.value)}
          ipucu="Bilgi alanıdır, yetki vermez."
        />
        <IsaretKutusu etiket="Aktif" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} />
        {/* Stok yalnız işaretli istasyonda üretim alanı konumu açar (SH5 b). */}
        <IsaretKutusu etiket="Üretim alanı" checked={uretimAlani} onChange={(o) => uretimAlaniYaz(o.target.checked)} />
        {kayit && <div className="tc-form-tam"><GecmisDugmesi kayitlar={[{ tablo: 'istasyon', anahtar: { id: kayit.id } }]} /></div>}
      </KayitPenceresi>
      <OnayPenceresi
        acik={silOnayi}
        baslik="İstasyon silinsin mi?"
        onayMetni="Sil"
        tehlikeli
        yukleniyor={sil.isPending}
        vazgec={() => silOnayiYaz(false)}
        onayla={() => { silOnayiYaz(false); if (kayit) sil.mutate(kayit.id); }}
      >
        <p>Makinesi, kişisi ya da ekibi olan istasyon silinemez; onu pasife alın.</p>
      </OnayPenceresi>
    </>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IsMerkeziGovdesi, SurumluIsMerkezi, IsMerkezleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { CokSatir, DurumKutusu, Girdi, IsaretKutusu, OnayPenceresi, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { csvIndir } from './csv.ts';
import { durumSutunu } from './durumSutunu.tsx';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { ListeAraclari, aramayaUyar } from './ListeAraclari.tsx';
import { useKayitIslemleri } from './kayitIslemleri.ts';

export function IsMerkeziFormu({ kayit, kapat }: { kayit: SurumluIsMerkezi | null; kapat: () => void }) {
  const [kod, kodYaz] = useState(kayit?.kod ?? '');
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [aciklama, aciklamaYaz] = useState(kayit?.aciklama ?? '');
  const [aktif, aktifYaz] = useState(kayit?.aktif ?? true);
  const [silOnayi, silOnayiYaz] = useState(false);
  const { kaydet, sil, hata, mesgul } = useKayitIslemleri('/is-merkezleri', kapat);
  const govde: IsMerkeziGovdesi = { kod, ad, aciklama, aktif };

  return (
    <>
      <KayitPenceresi
        baslik={kayit ? 'İş merkezi düzenle' : 'Yeni iş merkezi'}
        kapat={kapat}
        kaydet={() => kaydet.mutate({ kayit, govde })}
        sil={kayit ? () => silOnayiYaz(true) : undefined}
        mesgul={mesgul}
        hata={hata}
      >
        <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} ipucu="Büyük harfe çevrilir." />
        <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required />
        <div className="tc-form-tam">
          <CokSatir etiket="Açıklama" value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
        </div>
        <IsaretKutusu etiket="Aktif" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} />
        {kayit && <div className="tc-form-tam"><GecmisDugmesi kayitlar={[{ tablo: 'is_merkezi', anahtar: { id: kayit.id } }]} /></div>}
      </KayitPenceresi>
      <OnayPenceresi
        acik={silOnayi}
        baslik="İş merkezi silinsin mi?"
        onayMetni="Sil"
        tehlikeli
        yukleniyor={sil.isPending}
        vazgec={() => silOnayiYaz(false)}
        onayla={() => { silOnayiYaz(false); if (kayit) sil.mutate(kayit.id); }}
      >
        <p>İçinde istasyon olan ya da kişi kısıtında geçen iş merkezi silinemez; onu pasife alın.</p>
      </OnayPenceresi>
    </>
  );
}

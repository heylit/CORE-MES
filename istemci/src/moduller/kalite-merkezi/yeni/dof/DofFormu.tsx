import { useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { AdimliForm, type FormVerisi, type KmAdim, type KmAlan } from '../AdimliForm.tsx';
import { Ekler } from '../Ekler.tsx';
import { ayEkle, bugun } from '../kurallar.ts';
import { D8, KAPALI } from '../sabitler.ts';
import type { Dof, Ncr } from '../tipler.ts';
import { siradakiNo, useKmKomutu, yeniKimlik, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { DofBelgesi } from './DofBelgesi.tsx';
import {
  DOF_DURUMLARI, DOF_TURLERI, dofSorunlari, ETKINLIKLER, kapamaYetkisiGerekir, kapanisHatasi, kayitGovdesi, KOK_NEDEN_YONTEMLERI,
} from './dof-kurallari.ts';

export function dofAlanlari(veri: KmVerisi, yetki: KmYetkisi, rec: Dof | null): KmAlan[] {
  // Kapama kalite mühendisinindir: yetkisi olmayana "Kapalı" seçeneği gösterilmez.
  const durumlar = yetki.kapat || rec?.durum === KAPALI ? DOF_DURUMLARI : DOF_DURUMLARI.filter((d) => d !== KAPALI);
  return [
    { k: 'no', etiket: 'DÖF no', zorunlu: true, varsayilan: () => siradakiNo(veri.capa, 'DOF') },
    { k: 'ncrRef', etiket: 'İlgili NCR', tur: 'secim', secenekler: [['', '—'], ...veri.ncr.map((n) => [n._id, `${n.no ?? ''} ${n.parcaNo ?? ''}`] as const)] },
    { k: 'acilis', etiket: 'Açılış', tur: 'tarih', zorunlu: true, varsayilan: bugun },
    { k: 'termin', etiket: 'Termin', tur: 'tarih', zorunlu: true, varsayilan: () => ayEkle(bugun(), 1) },
    { k: 'baslik', etiket: 'Problem başlığı', zorunlu: true, genis: 'yarim' },
    { k: 'sorumlu', etiket: 'Sorumlu', zorunlu: true, liste: 'kisi' },
    { k: 'tur', etiket: 'Tür', tur: 'secim', secenekler: DOF_TURLERI, varsayilan: DOF_TURLERI[0] },
    { k: 'yontem', etiket: 'Kök neden yöntemi', tur: 'secim', secenekler: KOK_NEDEN_YONTEMLERI, varsayilan: KOK_NEDEN_YONTEMLERI[0] },
    {
      k: 'adim', etiket: 'Tamamlanan 8D adımı', tur: 'secim', genis: 'yarim', varsayilan: 0,
      secenekler: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [i, i ? `D${i}: ${D8[i - 1] ?? ''}` : 'Başlanmadı'] as const),
    },
    { k: 'durum', etiket: 'Durum', tur: 'secim', secenekler: durumlar, varsayilan: DOF_DURUMLARI[0] },
    { k: 'kokNeden', etiket: 'Kök neden: oluşma ve kaçma nedeni', tur: 'cokSatir', genis: 'tam' },
    { k: 'aksiyon', etiket: 'Kalıcı aksiyonlar', tur: 'cokSatir', genis: 'tam' },
    { k: 'etkinlik', etiket: 'Etkinlik doğrulaması', tur: 'secim', genis: 'yarim', secenekler: ETKINLIKLER, varsayilan: ETKINLIKLER[0] },
    { k: 'etkinlikKanit', etiket: 'Doğrulama kanıtı (veri, süre, numune)', genis: 'yarim' },
  ];
}

interface Ozellikler {
  veri: KmVerisi;
  yetki: KmYetkisi;
  rec: Dof | null;
  on?: Record<string, unknown>;
  kapat: () => void;
}

// DÖF / 8D kaydı (uygulamadaki openCapa): üç adım, ekler üçüncü adımda; NCR'den açılınca NCR "DÖF açıldı" olur.
export function DofFormu({ veri, yetki, rec, on, kapat }: Ozellikler) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [rid] = useState(() => rec?._id ?? yeniKimlik('capa'));

  const adimlar: KmAdim[] = [
    { baslik: 'Problem', alanlar: ['no', 'ncrRef', 'acilis', 'termin', 'baslik', 'sorumlu', 'tur'], ipucu: 'İlgili NCR seçilirse kayıtlar birbirine bağlanır.' },
    {
      baslik: 'Kök neden', alanlar: ['yontem', 'kokNeden'],
      ipucu: 'Oluşma nedenini (neden oldu) ve kaçma nedenini (neden yakalanmadı) ayrı ayrı yazın. "Operatör hatası" kök neden değildir.',
    },
    {
      baslik: 'Aksiyon ve doğrulama', alanlar: ['aksiyon', 'adim', 'etkinlik', 'etkinlikKanit', 'durum'], ipucu: 'Kapatmak için: 8 adım tamam, kök neden dolu, etkinlik "Etkin".',
      icerik: (d) => <Ekler veri={veri} yetki={yetki} kol="capa" kimlik={rid} no={String(d.no ?? rec?.no ?? '')} />,
    },
  ];

  const kaydet = async (d: FormVerisi) => {
    const kayit = kayitGovdesi({ ...(rec ?? {}), ...d, _id: rid } as Dof, bugun());
    if (kapamaYetkisiGerekir(kayit, rec) && !yetki.kapat) { bildir('hata', 'DÖF kapama kalite mühendisi yetkisi ister.'); return; }
    const hata = kapanisHatasi(kayit);
    if (hata) { bildir('hata', hata); return; }
    await komut.kaydet('capa', kayit);
    if (!rec && kayit.ncrRef) {
      const n: Ncr | undefined = veri.ncr.find((x) => x._id === kayit.ncrRef);
      if (n && n.durum !== KAPALI) await komut.kaydet('ncr', { ...n, durum: 'DÖF açıldı' });
    }
    bildir('tamam', rec ? 'DÖF güncellendi' : 'DÖF açıldı');
    kapat();
  };

  return (
    <AdimliForm
      baslik={rec ? `${rec.no ?? ''} düzenle` : 'DÖF / 8D aç'}
      alanlar={dofAlanlari(veri, yetki, rec)}
      ilk={rec ?? (on ? { ...on } : null)}
      adimlar={adimlar}
      kaydet={kaydet}
      denetle={(d) => dofSorunlari(d).map((s) => ({ metin: s.metin, adim: 2 }))}
      onizleme={(d) => <DofBelgesi veri={veri} c={d} />}
      gecmis={rec ? { kol: 'capa', kimlik: rec._id } : null}
      taslak="capa"
      kapat={kapat}
    />
  );
}

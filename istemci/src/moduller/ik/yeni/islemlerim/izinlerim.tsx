import { useState } from 'react';
import {
  DurumKutusu, Dugme, SayfaBasligi, SayiKarti, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { IzinCipi } from '../ortak/DurumCipi.tsx';
import type { Izin } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { IzinTalebi } from './izin-talebi.tsx';
import { gunMetni, IZIN_BEKLIYOR, IZIN_IPTAL, kisininIzinleri, sayi, sayiMetni } from './kurallar.ts';
import {
  BagliDegil, bugun, izinBakiyesi, Not, useYaz,
} from './parcalar.tsx';

// İzinlerim (app.js viewMyLeaves): bakiye, izin geçmişi, talep ve bekleyen talebi geri çekme.
export function Izinlerim(o: IkEkranOzellikleri) {
  const [talep, talepYaz] = useState(false);
  const komut = useIkKomutu();
  const yaz = useYaz();
  const e = o.ben;
  const kendi = e ? kisininIzinleri(o.depo.tur('leave'), e.id) : [];
  useSayfaKomutlari('ik-izinlerim', e && o.yetki.izinTalep
    ? [{ anahtar: 'izin', baslik: 'İzin talep et', simge: 'plus', aciklama: null, sozcukler: ['izin', 'talep'], calistir: () => { talepYaz(true); } }]
    : null);
  if (!e) return <BagliDegil baslik="İzinlerim" simge="flag" />;

  const bakiye = o.motor ? izinBakiyesi(o.motor, e) : null;
  const geriCek = (l: Izin) => yaz(() => komut.kaydet({ ...l, durum: IZIN_IPTAL, karar: bugun() }), 'Talebiniz geri çekildi.', 'Talep geri çekilemedi.');
  const sutunlar: Sutun<Izin>[] = [
    { anahtar: 'tur', baslik: 'İzin türü', hucre: (l) => l.tur },
    { anahtar: 'tarih', baslik: 'Tarihler', hucre: (l) => `${tarih(l.baslangic)} – ${tarih(l.bitis)}`, kirilmaz: true },
    { anahtar: 'gun', baslik: 'Gün', hucre: (l) => (l.gun == null ? null : sayiMetni(sayi(l.gun))), hizala: 'sag', mono: true },
    { anahtar: 'durum', baslik: 'Durum', hucre: (l) => <IzinCipi durum={l.durum} />, csv: (l) => l.durum ?? '' },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (l) => l.aciklama ?? '' },
    {
      anahtar: 'islem', baslik: '', csv: false,
      hucre: (l) => (o.yetki.izinTalep && l.durum === IZIN_BEKLIYOR
        ? <Dugme disabled={komut.calisiyor} onClick={() => { void geriCek(l); }}>Talebi geri çek</Dugme>
        : null),
    },
  ];

  const alt = bakiye
    ? `Kalan yıllık izniniz ${sayiMetni(bakiye.kalan)} gün.${bakiye.next ? ` ${tarih(gunMetni(bakiye.next))} tarihinde ${bakiye.nextDays} gün daha hak edeceksiniz.` : ''}`
    : undefined;
  return (
    <>
      <SayfaBasligi
        baslik="İzinlerim" simge="flag" alt={alt}
        birincil={o.yetki.izinTalep ? { etiket: 'İzin talep et', simge: 'plus', yap: () => { talepYaz(true); } } : undefined}
      />
      {!bakiye ? <DurumKutusu durum="yukleniyor" mesaj="Hesap motoru hazırlanıyor" /> : (
        <div className="tc-ikm-sayilar">
          <SayiKarti baslik="Hak edilen" simge="check" sayi={bakiye.hak} />
          <SayiKarti baslik="Kullanılan" simge="gantt" sayi={bakiye.used + bakiye.onceki} />
          <SayiKarti baslik="Onay bekleyen" simge="clock" sayi={bakiye.pending} />
          <SayiKarti baslik="Kalan" simge="user" sayi={bakiye.kalan} />
        </div>
      )}
      <Tablo
        etiket="İzin geçmişim" sutunlar={sutunlar} satirlar={kendi} satirAnahtari={(l) => l.id}
        bosMesaj="Henüz izin kaydınız yok. İzin talep et düğmesiyle ilk talebinizi oluşturabilirsiniz."
      />
      <Not>
        Yıllık izin hak edişi İş Kanunu md. 53’e göre hizmet sürenize göre hesaplanır. Talebiniz yöneticinizin veya insan kaynaklarının
        onayından sonra kesinleşir.
      </Not>
      {talep && o.yetki.izinTalep && <IzinTalebi acik kapat={() => { talepYaz(false); }} personel={e} kendiIzinleri={kendi} motor={o.motor} />}
    </>
  );
}

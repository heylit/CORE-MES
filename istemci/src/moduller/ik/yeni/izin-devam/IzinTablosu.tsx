import { useState } from 'react';
import { Dugme, Tablo, useBildirim, type Sutun, type TabloAraci } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { IzinCipi } from '../ortak/DurumCipi.tsx';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Izin } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { IzinBelgesi } from './IzinBelgesi.tsx';
import { IzinFormu } from './IzinFormu.tsx';
import { sayi, sayiYaz } from './kurallar.ts';
import './izin-devam.css';

export interface IzinTablosuOzellikleri { o: IkEkranOzellikleri; izinler: readonly Izin[]; kisiSutunu: boolean; arac?: TabloAraci<Izin> }

// Izin listesi (Izinler > Talepler ve kisi sayfasi): satir duzenlemeyi acar, bekleyen talepte onay ve ret, her satirda izin formu yazdirma.
export function IzinTablosu({ o, izinler, kisiSutunu, arac }: IzinTablosuOzellikleri) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [duzenle, duzenleYaz] = useState<Izin | null>(null);
  const [belge, belgeYaz] = useState<Izin | null>(null);
  const personel = (id: string | undefined) => o.depo.tur('emp').find((p) => p.id === id) ?? null;
  const departman = (id: string | undefined) => o.depo.tur('dept').find((d) => d.id === id)?.ad;

  const karar = async (l: Izin, durum: 'Onaylandı' | 'Reddedildi') => {
    try {
      await komut.kaydet({ ...l, durum });
      bildir('tamam', durum === 'Onaylandı' ? 'İzin onaylandı.' : 'İzin reddedildi.');
    } catch (h) { bildir('hata', hataIletisi(h, 'İzin kararı kaydedilemedi.')); }
  };

  const sutunlar: Sutun<Izin>[] = [
    ...(kisiSutunu ? [{
      anahtar: 'kisi', baslik: 'Çalışan',
      hucre: (l: Izin) => { const p = personel(l.empId); return p ? <KisiHucresi personel={p} alt={departman(p.departmanId)} /> : '—'; },
      csv: (l: Izin) => { const p = personel(l.empId); return p ? adSoyad(p) : ''; },
    }] : []),
    { anahtar: 'tur', baslik: 'İzin türü', hucre: (l) => l.tur ?? '—' },
    { anahtar: 'tarihler', baslik: 'Tarihler', kirilmaz: true, hucre: (l) => `${tarih(l.baslangic)} – ${tarih(l.bitis)}` },
    { anahtar: 'gun', baslik: 'Gün', hizala: 'sag', hucre: (l) => sayiYaz(sayi(l.gun)), csv: (l) => sayi(l.gun) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (l) => <IzinCipi durum={l.durum} />, csv: (l) => l.durum ?? '' },
    { anahtar: 'talep', baslik: 'Talep', kirilmaz: true, hucre: (l) => (l.talepTarihi ? tarih(l.talepTarihi) : '') },
    {
      anahtar: 'eylem', baslik: 'İşlem', hizala: 'sag', csv: false,
      hucre: (l) => (
        <span className="tc-iki-eylemler">
          <Dugme simge="printer" onClick={(e) => { e.stopPropagation(); belgeYaz(l); }} title="İzin formunu yazdır">Form</Dugme>
          {l.durum === 'Beklemede' && o.yetki.izinOnay && (
            <>
              <Dugme disabled={komut.calisiyor} onClick={(e) => { e.stopPropagation(); void karar(l, 'Reddedildi'); }}>Reddet</Dugme>
              <Dugme tur="birincil" disabled={komut.calisiyor} onClick={(e) => { e.stopPropagation(); void karar(l, 'Onaylandı'); }}>Onayla</Dugme>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Tablo
        etiket="İzin kayıtları" sutunlar={sutunlar} satirlar={izinler} satirAnahtari={(l) => l.id} bosMesaj="Kayıt yok." arac={arac}
        satirSec={o.yetki.izinYaz ? (l) => { duzenleYaz(l); } : undefined}
      />
      <IzinFormu o={o} acik={duzenle !== null} kayit={duzenle} onDolu={{}} kapat={() => { duzenleYaz(null); }} />
      {belge && <IzinBelgesi o={o} izin={belge} kapat={() => { belgeYaz(null); }} />}
    </>
  );
}

import { useQuery } from '@tanstack/react-query';
import type { IkGirisKartlariCevabi } from '#paylasilan/sozlesme/ik.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Pencere } from '../../../../ortak/arayuz/index.ts';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { hataIletisi, api } from '../../../../ortak/veri/api.ts';
import type { IkDeposu } from '../veri.ts';
import { adSoyadMetni, uzunTarih } from './kurallar.ts';

type Satir = IkGirisKartlariCevabi['kartlar'][number];

// 1925 a: kapsamdaki personelin etkin giriş kartları; numara yalnız son dört hanesiyle. Kart verme ve kaldırma kişi sayfasındadır.
export function GirisKartlari({ acik, kapat, depo, sec }: { acik: boolean; kapat: () => void; depo: IkDeposu; sec: (personel: string) => void }) {
  const veri = useQuery({ queryKey: ['ik', 'yeni', 'giris-kartlari'], queryFn: () => api.get<IkGirisKartlariCevabi>('/ik/giris-kartlari'), enabled: acik });
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'personel', baslik: 'Çalışan', hucre: (k) => adSoyadMetni(depo.tur('emp').find((p) => p.id === k.personel)) || k.personel },
    { anahtar: 'kart', baslik: 'Kart', mono: true, hucre: (k) => `••••${k.kartSon4}` },
    { anahtar: 'verildi', baslik: 'Verildi', kirilmaz: true, hucre: (k) => uzunTarih(tesisGunu(new Date(k.kaydedildi))) },
  ];
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Giriş kartları" tur="tam" alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      {veri.isPending && <DurumKutusu durum="yukleniyor" />}
      {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Kartlar alınamadı')} yenile={() => { void veri.refetch(); }} />}
      {veri.data && (
        <Tablo
          etiket="Giriş kartları" sutunlar={sutunlar} satirlar={veri.data.kartlar} satirAnahtari={(k) => String(k.kisiId)}
          satirSec={(k) => { kapat(); sec(k.personel); }} bosMesaj="Kartı olan personel yok. Kart, kişi sayfasından ya da yeni personel formundan verilir."
        />
      )}
    </Pencere>
  );
}

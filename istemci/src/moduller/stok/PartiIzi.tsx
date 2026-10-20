import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PartiIziCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, Pencere, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { miktarMetni } from './gorunum.ts';
import { hataMetni } from './ortak.tsx';

type Sevk = PartiIziCevabi['sevkler'][number];
const SEVK_DURUMU: Record<Sevk['durum'], string> = { havuzda: 'Havuzda', planlandi: 'Planlandı', yolda: 'Yolda', tamamlandi: 'Teslim edildi' };
const GUN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const SEVK_SUTUNLARI: Sutun<Sevk>[] = [
  { anahtar: 'gun', baslik: 'Gün', hucre: (x) => GUN.format(new Date(`${x.gun}T00:00:00Z`)) },
  { anahtar: 'is', baslik: 'Sevk işi', mono: true, hucre: (x) => `#${x.isId}` },
  { anahtar: 'emir', baslik: 'Emir', mono: true, hucre: (x) => <Link to={`/uretim-emirleri/${x.emirId}`}>#{x.emirId}</Link> },
  { anahtar: 'musteri', baslik: 'Müşteri', hucre: (x) => x.firmaAdi ?? '—' },
  { anahtar: 'adet', baslik: 'Adet', hucre: (x) => miktarMetni(x.adet) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (x) => SEVK_DURUMU[x.durum] },
];

// Ileri iz (bulgu 40): partinin girdiği ya da çıktığı emirler ve o emirlerin sevk edildiği müşteri.
export function PartiIziPenceresi({ partiId, lotNo, kapat }: { partiId: number; lotNo: string; kapat: () => void }) {
  const iz = useQuery({ queryKey: [...anahtarlar.hepsi, 'parti-izi', partiId], queryFn: () => api.get<PartiIziCevabi>(`/stok/partiler/${partiId}/iz`) });
  return (
    <Pencere acik kapat={kapat} baslik={`${lotNo} izi`} tur="yan">
      {iz.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(iz.error)} yenile={() => void iz.refetch()} /> : (
        <>
          <Kart baslik="Üretim emirleri">
            {iz.data && iz.data.emirler.length === 0
              ? <p>Bu parti bir üretim emrine bağlı değil.</p>
              : <p>{iz.data?.emirler.map((id, i) => <span key={id}>{i > 0 && ', '}<Link to={`/uretim-emirleri/${id}`}>#{id}</Link></span>)}</p>}
          </Kart>
          <Kart baslik="Sevkler">
            <Tablo etiket="Sevkler" sutunlar={SEVK_SUTUNLARI} satirlar={iz.data?.sevkler ?? []} satirAnahtari={(x) => `${x.isId}-${x.emirId}`}
              mesgul={iz.isPending} bosMesaj="Bu partinin emirleri için sevk yok." />
          </Kart>
        </>
      )}
    </Pencere>
  );
}

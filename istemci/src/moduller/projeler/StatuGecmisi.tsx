import type { StatuKaydi } from '#paylasilan/sozlesme/projeler.ts';
import { Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { StatuCipi } from './StatuPenceresi.tsx';

const SUTUNLAR: Sutun<StatuKaydi>[] = [
  { anahtar: 'an', baslik: 'Zaman', mono: true, kirilmaz: true, hucre: (k) => tarihSaatMetni(k.an) },
  { anahtar: 'statu', baslik: 'Statü', hucre: (k) => <StatuCipi statu={k} />, csv: (k) => k.ad },
  { anahtar: 'not', baslik: 'Not', hucre: (k) => k.not ?? '—' },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (k) => k.kisiAd ?? '—' },
];

// Geçmiş yalnız eklenir; düzeltme yeni statü kaydıyla yapılır.
export function StatuGecmisi({ gecmis }: { gecmis: readonly StatuKaydi[] }) {
  return (
    <Kart baslik="Statü geçmişi" simge="clock">
      <Tablo etiket="Statü geçmişi" sutunlar={SUTUNLAR} satirlar={gecmis} satirAnahtari={(k) => k.id} bosMesaj="Statü henüz yazılmadı" />
    </Kart>
  );
}

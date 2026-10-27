import { useQuery } from '@tanstack/react-query';
import type { SiparisCarpaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';
import { useCarpanGorur } from './yazma.ts';

type Kayit = SiparisCarpaniCevabi['gecmis'][number];

const carpanMetni = (c: number): string => `×${c.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

const SUTUNLAR: Sutun<Kayit>[] = [
  { anahtar: 'carpan', baslik: 'Çarpan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => carpanMetni(k.carpan) },
  { anahtar: 'gerekce', baslik: 'Gerekçe', hucre: (k) => k.gerekce },
  { anahtar: 'kisi', baslik: 'Kişi', hucre: (k) => k.kisiAdi ?? `Kişi ${k.kisiId}` },
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, kirilmaz: true, hucre: (k) => zamanMetni(k.zaman) },
];

// 815 (699/3 a): plana yalnız emrin önceliği girer; siparişe çarpan verilmez. Eski kayıtlar silinmez, yalnız geçmiş olarak okunur.
// Geçmişi olmayan siparişte kart çizilmez.
export function SiparisCarpani({ siparis }: { siparis: SiparisAyrintisi }) {
  const gorur = useCarpanGorur();
  const sorgu = useQuery({
    queryKey: anahtarlar.siparisCarpani(siparis.id),
    queryFn: () => api.get<SiparisCarpaniCevabi>(`/plan/siparisler/${siparis.id}/carpan`),
    enabled: gorur,
  });
  if (!gorur) return null;
  if (sorgu.isError) {
    return (
      <Kart baslik="Öncelik çarpanı geçmişi">
        <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Çarpan geçmişi alınamadı')} yenile={() => { void sorgu.refetch(); }} />
      </Kart>
    );
  }
  const gecmis = sorgu.data?.gecmis ?? [];
  if (gecmis.length === 0) return null;
  return (
    <Kart baslik="Öncelik çarpanı geçmişi">
      <p className="tc-sp-ipucu">Plan sırasına yalnız üretim emrinin önceliği girer; bu çarpanlar artık plana girmez.</p>
      <Tablo etiket="Çarpan geçmişi" sutunlar={SUTUNLAR} satirlar={gecmis} satirAnahtari={(k) => `${k.zaman}-${k.kisiId}`} />
    </Kart>
  );
}

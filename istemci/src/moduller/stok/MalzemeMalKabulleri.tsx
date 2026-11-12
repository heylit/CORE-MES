import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MalKabulSatirlariCevabi, MalKabulSatirOzeti } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { DurumKutusu, Kart, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, MAL_KABUL_TURU, zamanMetni } from './gorunum.ts';
import { irsaliyeAdresi } from './IrsaliyeBelgesi.tsx';
import { hataMetni } from './ortak.tsx';

// 3082: irsaliye malzemeye bağlanmaz (3081 a); malzemenin mal kabulleri üzerinden dolaylı ulaşılır. Talep siparişe,
// sipariş mal kabule gider; mal kabul satırı siparişi ve irsaliyeyi taşır. Kopya yok, bağ yok.
const SON = 5;

const SUTUNLAR: Sutun<MalKabulSatirOzeti>[] = [
  { anahtar: 'belge', baslik: 'Mal kabul', mono: true, sabit: 'sol', hucre: (s) => <Link to={`/stok/mal-kabul/${s.malKabulId}`}>{s.belgeNo}</Link>, csv: (s) => s.belgeNo },
  { anahtar: 'zaman', baslik: 'Tarih', kirilmaz: true, hucre: (s) => zamanMetni(s.zaman) },
  { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (s) => s.lotNo ?? '—' },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (s) => birimliMiktar(s.sayilanMiktar, s.birim) },
  { anahtar: 'tur', baslik: 'Tür', hucre: (s) => MAL_KABUL_TURU[s.tur] },
  { anahtar: 'siparis', baslik: 'Sipariş', mono: true, hucre: (s) => s.siparisNo ?? '—' },
  { anahtar: 'irsaliye', baslik: 'İrsaliye', mono: true, csv: (s) => s.irsaliyeNo ?? '', hucre: (s) => (
    <span className="tc-stok-irsaliye-hucre">{s.irsaliyeNo ?? '—'}{s.irsaliyeBelgeleri.map((b) => (
      <a key={b.id} href={irsaliyeAdresi(s.malKabulId, b.id)} target="_blank" rel="noopener" aria-label={`${b.ad} belgesini aç`} title={b.ad}><Simge ad="file" boyut="k" /></a>
    ))}</span>
  ) },
];

export function MalzemeMalKabulleri({ malzemeId }: { malzemeId: number }) {
  const l = useQuery({
    queryKey: [...anahtarlar.hepsi, 'liste', 'mal-kabul-satirlari', 'malzeme', malzemeId],
    queryFn: () => api.get<MalKabulSatirlariCevabi>(`/stok/mal-kabul-satirlari?malzemeId=${malzemeId}&sirala=zaman&yon=azalan&sayfaBoyu=${SON}`),
  });
  if (l.isError) return <Kart baslik="Mal kabuller ve irsaliyeler"><DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} /></Kart>;
  if (l.data && l.data.satirlar.length === 0) return null;
  return (
    <Kart baslik="Mal kabuller ve irsaliyeler" sag={<Link to="/stok/mal-kabul?sekme=yapilanlar">Tümü</Link>}>
      <Tablo etiket="Mal kabuller ve irsaliyeler" kip="kaydir" sutunlar={SUTUNLAR} satirlar={l.data?.satirlar ?? []} satirAnahtari={(s) => s.id} mesgul={l.isPending} />
    </Kart>
  );
}

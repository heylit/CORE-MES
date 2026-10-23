import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PartiIziCevabi, RefakatCiktisi, RefakatPartisi, RefakatSevki } from '#paylasilan/sozlesme/stok.ts';
import { DurumKutusu, Kart, Pencere, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, miktarMetni, zamanMetni } from './gorunum.ts';
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

const kartDurumu = (k: RefakatPartisi): string =>
  (k.durum === 'iptal' ? 'İptal' : k.birlestigi ? `${k.birlestigi.etiket} kartına birleşti` : k.partiId === null ? 'Lot bekliyor' : 'Açık');
const KART_SUTUNLARI: Sutun<RefakatPartisi>[] = [
  { anahtar: 'kart', baslik: 'Kart', mono: true, hucre: (k) => k.etiket },
  { anahtar: 'emir', baslik: 'Emir', mono: true, hucre: (k) => <Link to={`/uretim-emirleri/${k.uretimEmriId}`}>{k.emirNo ?? `#${k.uretimEmriId}`}</Link> },
  { anahtar: 'ust', baslik: 'Üst kart', mono: true, hucre: (k) => k.ust?.etiket ?? '—' },
  { anahtar: 'verilen', baslik: 'Verilen', hucre: (k) => birimliMiktar(k.verilen, k.birim) },
  { anahtar: 'durum', baslik: 'Durum', hucre: kartDurumu },
];
const malzemeAdi = (x: { malzemeId: number; malzemeKod: string | null; malzemeAd: string | null }): string => x.malzemeAd ?? x.malzemeKod ?? `Kart ${x.malzemeId}`;
const ciktiSutunlari = (etiket: (id: number) => string): Sutun<RefakatCiktisi>[] => [
  { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (c) => <Link to={`/stok/hareketler?partiId=${c.partiId}`}>{c.lotNo}</Link> },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: malzemeAdi },
  { anahtar: 'kart', baslik: 'Kart', mono: true, hucre: (c) => etiket(c.refakatPartisiId) },
  { anahtar: 'eldeki', baslik: 'Elde', hucre: (c) => birimliMiktar(c.eldeki, c.birim) },
];
const CIKIS_SUTUNLARI: Sutun<RefakatSevki>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => zamanMetni(x.zaman) },
  { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (x) => x.lotNo },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: malzemeAdi },
  { anahtar: 'miktar', baslik: 'Miktar', hucre: (x) => birimliMiktar(x.miktar, x.birim) },
  { anahtar: 'emir', baslik: 'Emir', mono: true, hucre: (x) => x.emirNo ?? '—' },
];

// İleri iz (bulgu 40, refakat kartı Dal 9): partinin girdiği ya da çıktığı emirler ve sevk işleri; lotun refakat kartları, kartlarla
// üretilen partiler ve eldekileri, bu partilerden yapılmış sevk çıkışları. Lot okutulan her yerden açılır.
export function PartiIziPenceresi({ partiId, lotNo, kapat }: { partiId: number; lotNo: string; kapat: () => void }) {
  const iz = useQuery({ queryKey: [...anahtarlar.hepsi, 'parti-izi', partiId], queryFn: () => api.get<PartiIziCevabi>(`/stok/partiler/${partiId}/iz`) });
  const kartlar = iz.data?.kartlar ?? [];
  const etiket = (id: number): string => kartlar.find((k) => k.id === id)?.etiket ?? `RP:${id}`;
  return (
    <Pencere acik kapat={kapat} baslik={`${lotNo} izi`} tur="yan">
      {iz.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(iz.error)} yenile={() => void iz.refetch()} /> : (
        <>
          <Kart baslik="Refakat kartları">
            <Tablo etiket="Refakat kartları" sutunlar={KART_SUTUNLARI} satirlar={kartlar} satirAnahtari={(k) => k.id}
              mesgul={iz.isPending} bosMesaj="Bu lotla açılmış refakat kartı yok." />
          </Kart>
          <Kart baslik="Üretilen partiler">
            <Tablo etiket="Üretilen partiler" sutunlar={ciktiSutunlari(etiket)} satirlar={iz.data?.ciktilar ?? []} satirAnahtari={(c) => c.partiId}
              mesgul={iz.isPending} bosMesaj="Bu lotun kartlarıyla sayılmış parça yok." />
          </Kart>
          <Kart baslik="Sevk çıkışları">
            <Tablo etiket="Sevk çıkışları" sutunlar={CIKIS_SUTUNLARI} satirlar={iz.data?.sevkCikislari ?? []} satirAnahtari={(x) => x.hareketId}
              mesgul={iz.isPending} bosMesaj="Bu lotun kartlarıyla üretilen partilerden sevk çıkışı yok." />
          </Kart>
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

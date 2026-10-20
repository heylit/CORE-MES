import { useQuery } from '@tanstack/react-query';
import type { StokYokIstegi, StokYokIstekleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { DurumKutusu, Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './talep/ortak.ts';

const zaman = (z: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(z));
const malzeme = (x: StokYokIstegi) => [x.malzemeKodu, x.malzemeAdi].filter((p) => p !== null).join(' · ') || '—';

const SUTUNLAR: Sutun<StokYokIstegi>[] = [
  { anahtar: 'no', baslik: 'İstek no', mono: true, kirilmaz: true, hucre: (x) => x.no },
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: malzeme },
  { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (x) => `${Number(x.miktar).toLocaleString('tr-TR')}${x.birim === null ? '' : ` ${x.birim}`}` },
  { anahtar: 'emir', baslik: 'Emir no', mono: true, kirilmaz: true, hucre: (x) => x.emirNo ?? '' },
  { anahtar: 'acilma', baslik: 'Açılış', kirilmaz: true, hucre: (x) => zaman(x.acilma) },
];

// İş kutusu kartı (kart #435): stokta karşılanamayan malzeme istekleri, en eski üstte. Salt okunur; satırdan talep açılmaz.
// Yalnız satın alma yazıcısı görür; boş liste de kartı çizer (kullanıcı "istek yok"u görsün, kart kaybolmuş sanılmasın).
export function StokYokKarti() {
  const gorur = useOturum().data?.islemler.includes('satin-alma.yaz') ?? false;
  const liste = useQuery({
    queryKey: anahtarlar.stokYokIstekleri, queryFn: () => api.get<StokYokIstekleriCevabi>('/satin-alma-stok-yok-istekleri'), enabled: gorur,
  });
  if (!gorur) return null;
  return (
    <Kart baslik="Stokta olmayan malzeme istekleri">
      {liste.isError ? <DurumKutusu durum="hata" yenile={() => void liste.refetch()} />
        : <Tablo etiket="Stokta olmayan malzeme istekleri" sutunlar={SUTUNLAR} satirlar={liste.data?.istekler ?? []} satirAnahtari={(x) => x.id} mesgul={liste.isPending} bosMesaj="Stokta olmayan istek yok." />}
    </Kart>
  );
}

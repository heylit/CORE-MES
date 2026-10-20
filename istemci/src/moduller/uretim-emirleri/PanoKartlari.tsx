import { useQuery } from '@tanstack/react-query';
import type { OzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { SayiKarti } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Dört kart tek istekle beslenir: aynı anahtar, tek çağrı.
function useOzet() {
  return useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/uretim-emirleri/ozet') });
}

function ozetKarti(alan: Exclude<keyof OzetCevabi, 'asamalar'>, baslik: string, simge: SimgeAdi, altMetin: string, yol?: string) {
  return function OzetKarti() {
    const ozet = useOzet();
    return <SayiKarti baslik={baslik} simge={simge} sayi={ozet.data?.[alan]} altMetin={altMetin} yol={yol} hata={ozet.isError} />;
  };
}

// Emirler Reçete ve Rota'da açılır ve plana alınır; salt okunur liste /uretim-emirleri'dedir. Operatör ekranı Arkon'dadır; kişinin kartları bağlantısızdır.
export const Planlanacak = ozetKarti('planlanacak', 'Planlanacak emirler', 'flag', 'Taslak, plana alınmayı bekliyor', '/uretim-emirleri');
export const AcikEmirler = ozetKarti('acik', 'Açık emirler', 'list', 'Serbest ve üretimde', '/uretim-emirleri');
export const Kuyrugum = ozetKarti('kuyrugum', 'Kuyruğumdaki işler', 'layers', 'Size atanmış, bitmemiş iş emirleri');
export const BugunUrettigim = ozetKarti('bugunSaglam', 'Bugün ürettiğim', 'check', 'Bugün saydığınız sağlam parça');

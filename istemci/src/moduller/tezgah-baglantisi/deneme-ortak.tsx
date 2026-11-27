import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { DENEME_PENCERELERI, type DenemePenceresi } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import { DurumKutusu, Sekmeler } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { YOK } from './gosterim.ts';

// Deneme bölümleri (kart 3811) yalnız okur; sonuçlar hiçbir modüle yazılmaz. Bu not her bölümün başında aynıdır.
export const GOLGE_NOTU = 'Gölge mod: tezgâh verisiyle hesaplanır, yalnız burada gösterilir. Üretim emrine, duruşa, stoka ve OEE modülüne hiçbir şey yazılmaz.';

const PENCERE_ADI: Record<DenemePenceresi, string> = { bugun: 'Bugün', dun: 'Dün', 'yedi-gun': 'Son 7 gün' };

export function usePencere(): [DenemePenceresi, (p: DenemePenceresi) => void] {
  const [arama, aramaYaz] = useSearchParams();
  const p = arama.get('pencere');
  const secili = (DENEME_PENCERELERI as readonly string[]).includes(p ?? '') ? (p as DenemePenceresi) : 'bugun';
  return [secili, (yeni) => aramaYaz((a) => { a.set('pencere', yeni); return a; }, { replace: true })];
}

export function PencereSecimi({ secili, sec }: { secili: DenemePenceresi; sec: (p: DenemePenceresi) => void }) {
  return <Sekmeler etiket="Pencere" sekmeler={DENEME_PENCERELERI.map((a) => ({ anahtar: a, baslik: PENCERE_ADI[a] }))} secili={secili} sec={sec} />;
}

export function useDeneme<T>(bolum: string, pencere: DenemePenceresi) {
  return useQuery({
    queryKey: ['tezgah-baglantisi', 'deneme', bolum, pencere],
    queryFn: () => api.get<T>(`/tezgah-baglantisi/deneme/${bolum}?pencere=${pencere}`),
  });
}

export function SorguDurumu({ sorgu, baslik }: { sorgu: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; baslik: string }) {
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, `${baslik} alınamadı`)} yenile={() => { void sorgu.refetch(); }} />;
  return null;
}

// Bölümün hesaplayamadığı kısımlar: veri uydurulmaz, nedeni yazar.
export function Eksikler({ eksikler }: { eksikler: readonly string[] }) {
  if (eksikler.length === 0) return null;
  return (
    <ul className="tc-tzb-eksikler" aria-label="Veri yok">
      {eksikler.map((e) => <li key={e}>Veri yok: {e}</li>)}
    </ul>
  );
}

export const makineMetni = (m: { kod: string } | null, cihaz: string): string => (m === null ? `${cihaz} (eşlenmedi)` : `${m.kod} · ${cihaz}`);

const TAM = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const ORAN = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
export const adetMetni = (n: number | null): string => (n === null ? YOK : TAM.format(n));
export const oranMetni = (n: number | null): string => (n === null ? YOK : `%${ORAN.format(n * 100)}`);
export const yuzdeFarkMetni = (n: number | null): string => (n === null ? YOK : `${n > 0 ? '+' : ''}%${ORAN.format(n)}`);
export function sureMetni(sn: number | null): string {
  if (sn === null) return YOK;
  if (sn < 60) return `${TAM.format(sn)} sn`;
  const dk = Math.round(sn / 60);
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
}

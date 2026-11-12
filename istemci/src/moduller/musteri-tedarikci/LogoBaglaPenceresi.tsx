import { useQuery } from '@tanstack/react-query';
import type { FirmaAyrintiCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Pencere } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { LogoCariArama } from './LogoCariArama.tsx';

// Firma ayrıntısı ve liste satırı aynı pencereyi açar. Bağlama kartın sürümüyle gider; kart ayrıntı sorgusundan okunur
// (ayrıntı açıksa önbellekten gelir, liste satırında yoksa bir kez okunur).
export function LogoBaglaPenceresi({ id, kapat }: { id: number; kapat: () => void }) {
  const ayrinti = useQuery({
    queryKey: anahtarlar.ayrinti(id),
    queryFn: () => api.get<FirmaAyrintiCevabi>(`/musteri-tedarikci/firmalar/${id}`),
  });
  const firma = ayrinti.data?.firma;
  return (
    <Pencere acik kapat={kapat} baslik={firma ? `Logo'ya bağla: ${firma.ad}` : "Logo'ya bağla"} alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
      {ayrinti.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Firma alınamadı')} yenile={() => { void ayrinti.refetch(); }} />
      )}
      {firma && (
        <>
          <p className="tc-mt-yok">Bağlama yalnız Logo cari kodunu ve kaydını yazar; firmanın öteki bilgileri değişmez.</p>
          <LogoCariArama hedef={firma} baglandi={kapat} />
        </>
      )}
    </Pencere>
  );
}

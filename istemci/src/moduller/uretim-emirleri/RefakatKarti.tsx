import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Kart } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { refakatBelgesi } from './refakat.ts';
import './uretim-emirleri.css';

// 100x150 mm refakat kartı: önizleme ile baskı aynı belgedir; "Yazdır" yalnız çerçevedeki kartı basar.
export function RefakatKarti() {
  const { id } = useParams();
  const emirId = Number(id);
  const yonlendir = useNavigate();
  const cerceve = useRef<HTMLIFrameElement>(null);
  const kart = useQuery({
    queryKey: anahtarlar.refakat(emirId),
    queryFn: () => api.get<RefakatKartiCevabi>(`/adimli-emirler/${emirId}/refakat-karti`),
  });
  const belge = useMemo(() => (kart.data ? refakatBelgesi(kart.data, new Date()) : null), [kart.data]);

  return (
    <Kart
      baslik={kart.data ? `Refakat kartı · ${kart.data.emirNo}` : 'Refakat kartı'}
      sag={(
        <div className="tc-emir-ust">
          <Dugme simge="back" onClick={() => { void yonlendir(`/uretim-emirleri/${emirId}`); }}>Emre dön</Dugme>
          <Dugme tur="birincil" simge="tag" disabled={belge === null} onClick={() => cerceve.current?.contentWindow?.print()}>Yazdır</Dugme>
        </div>
      )}
    >
      {kart.isPending && <DurumKutusu durum="yukleniyor" />}
      {kart.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(kart.error, 'Refakat kartı alınamadı.')} yenile={() => { void kart.refetch(); }} />}
      {belge !== null && (
        <>
          <p className="tc-emir-not">100x150 mm etiket. Kart parçayla birlikte dolaşır; QR yalnız emir kimliğini taşır.</p>
          <div className="tc-refakat">
            <iframe ref={cerceve} title="Refakat kartı önizleme" className="tc-refakat-cerceve" srcDoc={belge} />
          </div>
        </>
      )}
    </Kart>
  );
}

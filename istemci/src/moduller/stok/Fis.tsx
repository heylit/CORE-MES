import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { FisAyrintiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CIKIS_NEDENI, zamanMetni } from './gorunum.ts';
import { HareketTablosu } from './Hareketler.tsx';
import { SayfaBasi, hataMetni } from './ortak.tsx';
import { Qr } from './Qr.tsx';
import './stok.css';

// Teslim fişi: değişmez; yazdırınca yalnız fiş basılır (QR fiş numarasını taşır).
export function Fis() {
  const id = Number(useParams().id);
  const f = useQuery({ queryKey: anahtarlar.ayrinti('fis', id), queryFn: () => api.get<FisAyrintiCevabi>(`/stok/fisler/${id}`) });
  if (f.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (f.isError) return <DurumKutusu durum="hata" mesaj={hataMetni(f.error)} yenile={() => void f.refetch()} />;
  const x = f.data.fis;
  return (
    <section className="tc-stok tc-stok-yazdir">
      <SayfaBasi baslik={`Teslim fişi ${x.no}`} alt={`${zamanMetni(x.zaman)} · ${x.kisiAd ?? '—'}`} sag={<Dugme simge="download" onClick={() => window.print()}>Yazdır</Dugme>} />
      <Kart>
        <div className="tc-stok-fis-bas">
          <div className="tc-stok-form">
            <p><strong>Teslim yeri:</strong> {x.hedefKonumKod ?? `Stoktan düşüldü · ${x.cikisNedeni ? CIKIS_NEDENI[x.cikisNedeni] : ''}`}</p>
            {x.uretimEmriId !== null && <p><strong>Üretim emri:</strong> {x.emirNo ?? `#${x.uretimEmriId}`}</p>}
            {x.aciklama && <p><strong>İş emri / not:</strong> {x.aciklama}</p>}
          </div>
          <Qr metin={`FIS:${x.no}`} />
        </div>
        <HareketTablosu satirlar={f.data.hareketler} />
        <div className="tc-stok-imza"><span>Teslim eden: ____________________</span><span>Teslim alan: ____________________</span></div>
      </Kart>
    </section>
  );
}

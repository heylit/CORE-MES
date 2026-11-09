import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { Rozet } from '../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { Tablo } from '../../../ortak/arayuz/Tablo.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { DUZELTME_YERI, durumu, ozet, type VeriSagligiKategorisi } from './kurallar.ts';

// Veri sağlığı (782): plana giden verinin kaynağında boş olan yerler ve motorun o boşlukta bugün ne varsaydığı. Yalnız okur; düzeltme
// verinin sahibi ekranda yapılır.
export const VERI_SAGLIGI_YOLU = '/plan/veri-sagligi';

export function VeriSagligi() {
  const q = useQuery({ queryKey: ['plan', 'veri-sagligi'], queryFn: () => api.get<VeriSagligiCevabi>(VERI_SAGLIGI_YOLU) });
  const yenile = () => { void q.refetch(); };
  return (
    <div>
      <SayfaBasligi baslik="Veri sağlığı" simge="alert" alt="Planın kaynakta bulamadığı veriler ve motorun yerine koyduğu varsayımlar."
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" mesaj="Veri sağlığı alınamadı" hata={q.error} yenile={yenile} />
          : <Rapor c={q.data} />}
    </div>
  );
}

function Rapor({ c }: { c: VeriSagligiCevabi }) {
  const eksikler = c.kategoriler.filter((k) => (k.sayi ?? 0) > 0);
  return (
    <>
      <p role="status">{ozet(c)}</p>
      {c.malzemeKesildi && <p role="alert">Malzeme listesi üst sınırda kesildi; sınırın ötesindeki kartlar plana hiç gelmiyor ve sayılamadı.</p>}
      <Tablo<VeriSagligiKategorisi>
        etiket="Veri sağlığı"
        satirlar={c.kategoriler}
        satirAnahtari={(k) => k.anahtar}
        sutunlar={[
          { anahtar: 'baslik', baslik: 'Konu', hucre: (k) => k.baslik },
          { anahtar: 'durum', baslik: 'Durum', kirilmaz: true, hucre: (k) => { const d = durumu(k); return <Rozet ton={d.ton}>{d.metin}</Rozet>; }, csv: (k) => durumu(k).metin },
          { anahtar: 'etki', baslik: 'Planda ne olur', hucre: (k) => k.etki },
          { anahtar: 'yer', baslik: 'Nerede düzeltilir', hucre: (k) => { const y = DUZELTME_YERI[k.anahtar]; return y ? <Link to={y.yol}>{y.ad}</Link> : '—'; }, csv: (k) => DUZELTME_YERI[k.anahtar]?.ad ?? '' },
        ]}
      />
      {eksikler.map((k) => (
        <Kart key={k.anahtar} baslik={k.baslik} simge="list" baslikEki={<Rozet ton="uyari">{durumu(k).metin}</Rozet>}>
          <ul>
            {k.ornekler.map((o) => <li key={`${o.kod}|${o.ad}`}><span className="mono">{o.kod}</span> {o.ad}</li>)}
          </ul>
          {(k.sayi ?? 0) > k.ornekler.length && <p>{`İlk ${String(k.ornekler.length)} kayıt gösteriliyor.`}</p>}
        </Kart>
      ))}
    </>
  );
}

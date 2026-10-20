import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Kart, Rozet } from '../../../ortak/arayuz/index.ts';
import { DURUM, SURE, anahtarlar, cagri } from './ortak.ts';
import './talep.css';

const SON = 10;
const HEPSI = 500;
const gun = (t: string | null) => (t === null ? null : new Date(`${t.slice(0, 10)}T00:00:00`).toLocaleDateString('tr-TR'));

function Satir({ t }: { t: Talebim }) {
  const d = DURUM[t.durum];
  const bekleyen = t.kalemler.filter((k) => k.kartBekliyor).length;
  return (
    <li className="sa-talep-satir">
      <div className="sa-talep-satir-ust">
        <span className="sa-talep-no">{t.no}</span>
        <Rozet ton={d.ton}>{d.metin}</Rozet>
        {bekleyen > 0 && <Rozet ton="uyari">{bekleyen} kalem kart bekliyor</Rozet>}
      </div>
      <div><b>{t.baslik}</b></div>
      <div className="sa-talep-not">
        {t.kalemler.map((k) => `${k.ad}${k.miktar === null ? '' : ` ${k.miktar} ${k.birim}`}`).join(', ')}
        {t.ihtiyacTarihi && <> · istenen {gun(t.ihtiyacTarihi)}</>}
        {t.uretimEmriNo && <> · üretim emri {t.uretimEmriNo}</>}
      </div>
    </li>
  );
}

// Kişinin kendi talepleri ve durumu (kart #375); fiyat, teklif ve tedarikçi sunucudan zaten gelmez.
export function Taleplerim() {
  const [hepsi, hepsiYaz] = useState(false);
  const sinir = hepsi ? HEPSI : SON;
  const liste = useQuery({
    queryKey: anahtarlar.taleplerim(sinir),
    queryFn: () => cagri.get('/satin-alma-taleplerim', { sorgu: { sinir }, ...SURE }),
    placeholderData: keepPreviousData,
  });
  return (
    <Kart baslik="Taleplerim" sag={liste.data && liste.data.toplam > SON
      ? <Dugme simge="list" onClick={() => hepsiYaz((h) => !h)}>{hepsi ? 'Son 10' : `Tümü (${liste.data.toplam})`}</Dugme> : undefined}>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj="Talepler okunamadı." yenile={() => void liste.refetch()} />
          : liste.data.talepler.length === 0 ? <DurumKutusu durum="bos" mesaj="Henüz talebiniz yok." />
            : <ul className="sa-talep-liste">{liste.data.talepler.map((t) => <Satir key={t.id} t={t} />)}</ul>}
    </Kart>
  );
}

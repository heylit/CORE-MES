import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Talep, TalepPanosuCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Kart } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TalepKarti } from './TalepKarti.tsx';
import { TalepPenceresi } from './TalepPenceresi.tsx';
import { useIslemVar } from './yazma.ts';
import './idari-isler.css';

const SUTUNLAR = [
  { anahtar: 'yeni', baslik: 'Yeni', bos: 'Yeni talep yok.' },
  { anahtar: 'yapiliyor', baslik: 'Yapılıyor', bos: 'Üzerinde çalışılan talep yok.' },
  { anahtar: 'kapanan', baslik: 'Kapandı (son 7 gün)', bos: 'Son 7 günde kapanan talep yok.' },
] as const;

// Tesis talepleri panosu: üç sütun; kart ayrıntıyı ve işlemleri açar.
export function Talepler() {
  const gezin = useNavigate();
  const acabilir = useIslemVar('idari-isler.talep-ac');
  const [secili, seciliYaz] = useState<Talep | null>(null);
  const pano = useQuery({ queryKey: anahtarlar.pano, queryFn: () => api.get<TalepPanosuCevabi>('/idari-isler/talepler/pano') });

  return (
    <section className="tc-ii">
      <Kart
        baslik="Tesis talepleri"
        sag={(
          <span className="tc-ii-dugmeler">
            {acabilir && <Dugme tur="birincil" simge="plus" onClick={() => { void gezin('/idari-isler/talep-ac'); }}>Talep aç</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void pano.refetch(); }} yukleniyor={pano.isFetching} />
          </span>
        )}
      >
        {pano.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(pano.error, 'Talepler alınamadı')} yenile={() => { void pano.refetch(); }} />
        ) : pano.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : (
          <div className="tc-ii-pano">
            {SUTUNLAR.map((s) => {
              const sutun = pano.data[s.anahtar];
              return (
                <section key={s.anahtar} className="tc-ii-sutun" aria-label={s.baslik}>
                  <h3 className="tc-ii-sutun-baslik">{s.baslik} <span className="tc-ii-sayi mono">{sutun.toplam}</span></h3>
                  {sutun.talepler.length === 0
                    ? <p className="tc-ii-soluk">{s.bos}</p>
                    : sutun.talepler.map((t) => <TalepKarti key={t.id} talep={t} sec={() => seciliYaz(t)} />)}
                  {sutun.toplam > sutun.talepler.length && <p className="tc-ii-soluk">İlk {sutun.talepler.length} talep gösteriliyor.</p>}
                </section>
              );
            })}
          </div>
        )}
      </Kart>
      <TalepPenceresi talep={secili} kapat={() => seciliYaz(null)} />
    </section>
  );
}

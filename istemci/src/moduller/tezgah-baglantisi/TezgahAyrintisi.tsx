import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { DurumKutusu, Kart, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM, YOK, saatMetni } from './gosterim.ts';
import './tezgah-baglantisi.css';

// Keşif ekranı: tezgahın yayınladığı bütün öğeler, geldiği adla ve ham değerle.
export function TezgahAyrintisi() {
  const [secilen, secilenYaz] = useState<string | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.durum, queryFn: () => api.get<TezgahBaglantisiDurumCevabi>('/tezgah-baglantisi/durum') });
  const tezgahlar = liste.data?.tezgahlar ?? [];
  const cihazAdi = secilen ?? tezgahlar[0]?.cihazAdi ?? null;
  const ayrinti = useQuery({
    queryKey: anahtarlar.tezgah(cihazAdi ?? ''),
    queryFn: () => api.get<TezgahAyrintisiCevabi>(`/tezgah-baglantisi/tezgahlar/${encodeURIComponent(cihazAdi ?? '')}`),
    enabled: cihazAdi !== null,
  });
  const a = ayrinti.data;

  return (
    <Kart baslik="Tezgah ayrıntısı">
      <div className="tc-tzb">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Tezgahlar alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && tezgahlar.length === 0 && <p role="status" className="tc-tzb-not">Henüz okunmuş tezgah yok.</p>}
        {tezgahlar.length > 0 && (
          <div className="tc-tzb-iki">
            <ul className="tc-tzb-liste" aria-label="Tezgahlar">
              {tezgahlar.map((t) => (
                <li key={t.cihazAdi}>
                  <button type="button" className="tc-tzb-sec" aria-pressed={t.cihazAdi === cihazAdi} onClick={() => secilenYaz(t.cihazAdi)}>
                    <span className="tc-tzb-kod">{t.cihazAdi}</span><Rozet ton={DURUM[t.durum].ton}>{DURUM[t.durum].metin}</Rozet>
                  </button>
                </li>
              ))}
            </ul>
            <section className="tc-tzb" aria-label={cihazAdi ?? undefined}>
              {ayrinti.isPending && <DurumKutusu durum="yukleniyor" />}
              {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Tezgah ayrıntısı alınamadı')} yenile={() => { void ayrinti.refetch(); }} />}
              {a && (
                <>
                  <p className="tc-tzb-not">
                    Tezgahın yayınladığı bütün öğeler, geldiği adla. Son okuma {saatMetni(a.okundu)}{a.eski && <span className="tc-tzb-eski"> · eski okuma</span>}.
                  </p>
                  <table className="tc-tzb-ogeler">
                    <thead><tr><th scope="col">Öğe</th><th scope="col" className="tc-tzb-genis">Bileşen</th><th scope="col">Değer</th><th scope="col" className="tc-tzb-genis">Zaman</th></tr></thead>
                    <tbody>
                      {a.ogeler.map((o, i) => (
                        <tr key={`${o.tur}-${o.ad ?? ''}-${o.bilesen ?? ''}-${i}`}>
                          <td className="tc-tzb-mono">{o.tur}{o.ad !== null && o.ad !== o.tur && <span className="tc-tzb-alt">{o.ad}</span>}</td>
                          <td className="tc-tzb-genis">{o.bilesen ?? YOK}</td>
                          <td className="tc-tzb-mono">{o.deger ?? YOK}</td>
                          <td className="tc-tzb-genis">{o.zaman ?? YOK}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </Kart>
  );
}

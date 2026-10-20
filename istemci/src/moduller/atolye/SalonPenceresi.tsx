import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SalonGovdesi, SalonOzeti } from '#paylasilan/sozlesme/atolye.ts';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Yeni fabrika bölümü: ölçü ve hücre boyu. Sunucu fabrika planında öbür bölümlerin yanına koyar; içi ve yeri düzenleyicide.
export function SalonPenceresi({ acik, kapat, eklendi }: { acik: boolean; kapat: () => void; eklendi: (s: SalonOzeti) => void }) {
  const istemci = useQueryClient();
  const [kod, kodYaz] = useState('');
  const [ad, adYaz] = useState('');
  const [genislik, genislikYaz] = useState('40');
  const [derinlik, derinlikYaz] = useState('24');
  const [hucre, hucreYaz] = useState('4');
  const ekle = useMutation({
    mutationFn: (govde: SalonGovdesi) => api.post<SalonOzeti>('/atolye/salonlar', govde),
    onSuccess: (s) => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.salonlar });
      void istemci.invalidateQueries({ queryKey: anahtarlar.fabrika });
      eklendi(s);
    },
  });
  const gonder = () => ekle.mutate({ kod, ad, genislik: Number(genislik), derinlik: Number(derinlik), hucreBoyu: Number(hucre) });
  return (
    <Pencere
      acik={acik}
      kapat={kapat}
      baslik="Yeni fabrika bölümü"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={ekle.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={ekle.isPending} onClick={gonder}>Ekle</Dugme>
        </>
      )}
    >
      <form className="tc-atolye-form" onSubmit={(o) => { o.preventDefault(); gonder(); }}>
        <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} required maxLength={24} ipucu="Büyük harfe çevrilir (ör. TORNA)." />
        <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required maxLength={120} />
        <div className="tc-atolye-ozellik-uclu">
          <Girdi etiket="Genişlik (m)" type="number" inputMode="decimal" min={5} max={500} value={genislik} onChange={(o) => genislikYaz(o.target.value)} required />
          <Girdi etiket="Derinlik (m)" type="number" inputMode="decimal" min={5} max={500} value={derinlik} onChange={(o) => derinlikYaz(o.target.value)} required />
          <Girdi etiket="Hücre boyu (m)" type="number" inputMode="decimal" min={1} max={50} value={hucre} onChange={(o) => hucreYaz(o.target.value)} required />
        </div>
        {ekle.isError && <p className="tc-atolye-hata" role="alert">{hataIletisi(ekle.error, 'Bölüm eklenemedi.')}</p>}
      </form>
    </Pencere>
  );
}

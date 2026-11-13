import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KoduDegisenKonum, RafKodGecisiListesiCevabi, RafKodlamaDurumuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, OnayPenceresi, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { KodDegisimPenceresi } from './Etiketler.tsx';
import { hataMetni, korumaliPost, useIslem } from './ortak.tsx';

export const RAF_KODLAMA_ANAHTARI = ['stok', 'raf-kodlama'] as const;

export const useRafKodlamasi = () =>
  useQuery({ queryKey: RAF_KODLAMA_ANAHTARI, queryFn: () => api.get<RafKodlamaDurumuCevabi>('/stok/raf-kodlama') });

// 3177 b: güncellemeyle raf gözleri sıra numaralı koda kendiliğinden geçti; eski etiketler okunmaz. Uyarı stok tanımı olan kişide
// etiketler basılana kadar durur: liste sunucuda saklıdır, "Etiketleri bas" onu "Konum kodu değişti" penceresinde açar, "Basıldı"
// uyarıyı herkes için kaldırır; geri getiren yol olmadığı için onay ister. Kodu harf olmayan raf eski adresinde kalır; uyarı onları adıyla söyler.
export function RafKodGecisiUyarisi() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const tanimlar = useIslem('stok.raf-yaz');
  const durum = useRafKodlamasi();
  const [liste, listeYaz] = useState<KoduDegisenKonum[] | null>(null);
  const [onay, onayYaz] = useState(false);
  const ac = useMutation({
    mutationFn: () => api.get<RafKodGecisiListesiCevabi>('/stok/raf-kodlama/gecis'),
    onSuccess: (c) => listeYaz(c.degisenler),
    onError: (h) => bildir('hata', hataMetni(h)),
  });
  const basildi = useMutation({
    mutationFn: () => korumaliPost<RafKodlamaDurumuCevabi>('/stok/raf-kodlama/gecis/basildi', {}),
    onSuccess: (c) => { istemci.setQueryData(RAF_KODLAMA_ANAHTARI, c); bildir('tamam', 'Uyarı kaldırıldı.'); },
    onError: (h) => bildir('hata', hataMetni(h)),
  });
  const g = durum.data?.gecis;
  if (!tanimlar || !g || g.basildi || (g.degisenSayisi === 0 && g.eskiKodluRaflar.length === 0 && g.atlanan.length === 0 && g.pasifStoklu.length === 0)) return null;
  return (
    <div className="tc-stok-kod-gecisi" role="alert">
      <Simge ad="alert" boyut="k" />
      <div className="tc-stok-kod-gecisi-metin">
        {g.degisenSayisi > 0 && <p>Raf gözlerinin kodu A1, A2, A3 düzenine geçti: {g.degisenSayisi} gözün kodu değişti{g.stokluSayisi > 0 ? `, ${g.stokluSayisi} gözde stok var` : ''}. Eski etiketler okunmaz; yenilerini basıp yapıştırın. Stok yerinde kaldı.</p>}
        {g.atlanan.length > 0 && <p>Şu gözler geçemedi, eski kodunda kaldı: <span className="mono">{g.atlanan.join(', ')}</span>. Bu kod başka bir konumda kullanılıyor; o konumun kodunu değiştirip Stok &gt; Ayarlar'da "Haritadan eşle" deyin.</p>}
        {g.pasifStoklu.length > 0 && <p>Pasif raftaki şu gözlerde stok var, göz açık kaldı: <span className="mono">{g.pasifStoklu.join(', ')}</span>. Stoğu taşıyınca göz kapanır.</p>}
        {g.eskiKodluRaflar.length > 0 && <p>Kodu harf olmayan raflar eski kodda kaldı: <span className="mono">{g.eskiKodluRaflar.join(', ')}</span>. Fabrika Haritası'nda kodunu harfe çevirin.</p>}
      </div>
      <span className="tc-stok-kod-gecisi-dugmeler">
        {g.degisenSayisi > 0 && <Dugme tur="birincil" simge="tag" yukleniyor={ac.isPending} onClick={() => ac.mutate()}>Etiketleri bas</Dugme>}
        <Dugme simge="check" onClick={() => onayYaz(true)}>Basıldı</Dugme>
      </span>
      <OnayPenceresi acik={onay} baslik="Uyarı kaldırılsın mı?" onayMetni="Basıldı, kaldır" yukleniyor={basildi.isPending} onayla={() => basildi.mutate()} vazgec={() => onayYaz(false)}>
        <p>Uyarı herkes için kalkar ve geri gelmez. Yeni etiketler basılıp yapıştırıldıysa onaylayın.</p>
      </OnayPenceresi>
      {liste && liste.length > 0 && <KodDegisimPenceresi degisenler={liste} kapat={() => listeYaz(null)} />}
    </div>
  );
}

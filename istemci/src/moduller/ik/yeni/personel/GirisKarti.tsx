import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GirisKartiCevabi, GirisKartiVerGovdesi } from '#paylasilan/sozlesme/ik.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, OnayPenceresi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { uzunTarih } from './kurallar.ts';
import { Bolum, Not, Tanimlar } from './parcalar.tsx';

const anahtar = (kisiId: number) => ['ik', 'yeni', 'giris-karti', kisiId] as const;

// 1902 b, 1903 b: personel giriş kartını yalnız İK verir; kart istasyonda PIN'siz giriş açar (1897 b). Numara geri gösterilmez, yalnız son
// dört hane. Okuyucu klavye gibi yazıp Enter'a basar: alan odaktayken okutmak formu gönderir.
export function GirisKarti({ kisiId }: { kisiId: number }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const veri = useQuery({ queryKey: anahtar(kisiId), queryFn: () => api.get<GirisKartiCevabi>(`/ik/giris-karti/${String(kisiId)}`) });
  const [kartNo, kartNoYaz] = useState('');
  const [sor, sorYaz] = useState(false);
  const komut = useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde: GirisKartiVerGovdesi | { surum: number } }) => api.post<GirisKartiCevabi>(yol, govde),
    onSuccess: (c) => { istemci.setQueryData(anahtar(kisiId), c); sorYaz(false); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Kart kaydedilemedi.')); void veri.refetch(); },
    onSettled: () => kartNoYaz(''),
  });

  if (veri.isPending) return <Bolum baslik="Giriş kartı"><DurumKutusu durum="yukleniyor" /></Bolum>;
  if (veri.isError) return <Bolum baslik="Giriş kartı"><DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} /></Bolum>;
  const { kart } = veri.data;

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (kartNo.trim() === '' || komut.isPending) return;
    komut.mutate({ yol: `/ik/giris-karti/${String(kisiId)}`, govde: { kartNo } });
  };

  if (kart) {
    return (
      <Bolum baslik="Giriş kartı" eylem={<Dugme simge="x" onClick={() => { sorYaz(true); }}>Kartı kaldır</Dugme>}>
        <Tanimlar satirlar={[{ etiket: 'Kart', deger: `••••${kart.kartSon4}` }, { etiket: 'Verildi', deger: uzunTarih(tesisGunu(new Date(kart.kaydedildi))) }]} />
        <OnayPenceresi acik={sor} baslik="Giriş kartı kaldırılsın mı?" onayMetni="Kaldır" tehlikeli yukleniyor={komut.isPending}
          vazgec={() => { sorYaz(false); }}
          onayla={() => { komut.mutate({ yol: `/ik/giris-karti/${String(kisiId)}/kaldir`, govde: { surum: kart.surum } }); }}>
          Kişi bu kartla istasyonda giremez. Kayıp kart için önce kaldırın, sonra yeni kart verin.
        </OnayPenceresi>
      </Bolum>
    );
  }
  return (
    <Bolum baslik="Giriş kartı">
      <form onSubmit={gonder}>
        <Girdi etiket="Kart" maxLength={64} autoComplete="off" value={kartNo} onChange={(o) => { kartNoYaz(o.target.value); }}
          ipucu="Alana tıklayıp kartı okuyucuya okutun. Kişi istasyonda bu kartla PIN'siz girer." />
        <Dugme tur="birincil" type="submit" simge="id-card" disabled={kartNo.trim() === ''} yukleniyor={komut.isPending}>Kartı ver</Dugme>
      </form>
    </Bolum>
  );
}

export function GirisKartiYok() {
  return <Bolum baslik="Giriş kartı"><Not>Kart, kişinin TMI kullanıcısına verilir. Önce İş bölümünde TMI kullanıcısını bağlayın.</Not></Bolum>;
}

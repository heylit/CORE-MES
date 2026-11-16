import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Proje, ProjeGuncelleGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, OnayPenceresi } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3302 c: proje silinmez; iptal, düzenleme komutuyla yalnız durumu değiştirir. Bütçe gönderilmez, sunucu var olanı korur (PRJ-16).
export function ProjeIptal({ proje }: { proje: Proje }) {
  const istemci = useQueryClient();
  const [acik, acikYaz] = useState(false);
  const komut = useMutation({
    mutationFn: () => api.post<Proje>(`/projeler/${proje.id}/guncelle`, {
      ad: proje.ad, firmaId: proje.firmaId, baslangic: proje.baslangic, bitis: proje.bitis, aciklama: proje.aciklama,
      durum: 'iptal', surum: proje.surum,
    } satisfies ProjeGuncelleGovdesi),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      acikYaz(false);
    },
  });
  const kapat = () => { komut.reset(); acikYaz(false); };
  return (
    <>
      <Dugme tur="tehlike" simge="stop" onClick={() => { acikYaz(true); }}>Projeyi iptal et</Dugme>
      <OnayPenceresi
        acik={acik} baslik="Projeyi iptal et" onayMetni="İptal et" tehlikeli yukleniyor={komut.isPending}
        onayla={() => { komut.mutate(); }} vazgec={kapat}
      >
        <p><strong>{proje.kod}</strong> · {proje.ad}</p>
        <p>Proje silinmez; emirler, görevler ve kayıtlar olduğu gibi kalır. İptal edilen projede görev ve kilometre taşı yazılmaz,
          proje aktif listeden kalkar. Gerekçe yazılarak Düzenle'den yeniden açılabilir.</p>
        {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Proje iptal edilemedi')}</p>}
      </OnayPenceresi>
    </>
  );
}

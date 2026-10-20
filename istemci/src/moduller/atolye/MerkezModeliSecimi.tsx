// İstasyonun Çizim Merkezi modeli (kart #921): seçim hemen kaydedilir (bağ Çizim Merkezi'ndedir, yerleşim kaydını beklemez).
// Kütüphane modelinden önce gösterilir; dosya türünden ölçeklenip ayak izine sığdırılır.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MerkezModeli } from '#paylasilan/sozlesme/atolye.ts';
import { Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { merkezModeliBagla, useMerkezModelleri } from './veri.ts';

export function MerkezModeliSecimi({ istasyonId, mevcut, degisti }: {
  istasyonId: number;
  mevcut: MerkezModeli | null;
  degisti: (m: MerkezModeli | null) => void;
}) {
  const [isleniyor, isleniyorYaz] = useState(false);
  const sorgu = useMerkezModelleri();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const belgeler = sorgu.data?.belgeler ?? [];
  // Bağlı model seçicide yoksa (yayından kalktı) yine adıyla görünür.
  const secenekler = [
    { deger: '', baslik: 'Yok' },
    ...(mevcut && !belgeler.some((b) => b.id === mevcut.belgeId) ? [{ deger: String(mevcut.belgeId), baslik: `${mevcut.ad} · Rev ${mevcut.harf}` }] : []),
    ...belgeler.map((b) => ({ deger: String(b.id), baslik: `${b.ad} · Rev ${b.harf}` })),
  ];

  const sec = async (deger: string) => {
    isleniyorYaz(true);
    try {
      const c = await merkezModeliBagla(istasyonId, deger === '' ? null : Number(deger), mevcut?.belgeId ?? null);
      degisti(c.merkezModeli);
      bildir('tamam', c.merkezModeli ? 'Çizim Merkezi modeli bağlandı.' : 'Çizim Merkezi modeli kaldırıldı.');
      void istemci.invalidateQueries({ queryKey: anahtarlar.fabrika });
      void istemci.invalidateQueries({ queryKey: anahtarlar.yerlesimler });
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Model bağlanamadı.'));
    } finally {
      isleniyorYaz(false);
    }
  };

  return (
    <Secim
      etiket="Çizim Merkezi modeli"
      ipucu={sorgu.isError ? hataIletisi(sorgu.error, 'Çizimler okunamadı.') : 'Seçim hemen kaydedilir; kütüphane modelinden önce gösterilir.'}
      secenekler={secenekler}
      value={mevcut ? String(mevcut.belgeId) : ''}
      disabled={isleniyor || sorgu.isPending}
      onChange={(o) => { void sec(o.target.value); }}
    />
  );
}

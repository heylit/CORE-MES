import { useState } from 'react';
import { DurumKutusu, SayfaBasligi } from '../../../../ortak/arayuz/index.ts';
import { SiparisKarti } from '../kartlar/index.ts';
import { SecimGrubu } from '../kartlar/parcalar.tsx';
import { useSiparisKaynagi } from './veri.ts';
import './siparisler.css';

type Sekme = 'acik' | 'sevk';
const sonra = (a: number | null, b: number | null) => (a ?? 9e15) - (b ?? 9e15);

// Prototipin viewOrders'ı: Açık ve Sevk edilen. Kayıt Siparişler modülündedir; burada yalnız izlenir (212 a).
export function Siparisler() {
  const { ozetler, durum, yenile } = useSiparisKaynagi();
  const [sekme, sekmeYaz] = useState<Sekme>('acik');
  const baslik = <SayfaBasligi baslik="Siparişler" simge="box" alt="Üretim ve teslim takibi" />;
  if (durum === 'yukleniyor') return <>{baslik}<DurumKutusu durum="yukleniyor" /></>;
  if (durum === 'izin-yok') return <>{baslik}<DurumKutusu durum="bos" mesaj="Siparişleri görme iznin yok." /></>;
  if (durum === 'hata' || ozetler === null) return <>{baslik}<DurumKutusu durum="hata" mesaj="Siparişler alınamadı." yenile={yenile} /></>;

  const acik = ozetler.filter((o) => o.durum !== 'sevk').sort((a, b) => sonra(a.teslim, b.teslim));
  const sevk = ozetler.filter((o) => o.durum === 'sevk').sort((a, b) => (b.teslim ?? 0) - (a.teslim ?? 0));
  const liste = sekme === 'acik' ? acik : sevk;
  return (
    <>
      {baslik}
      <div className="tc-mi-arac">
        <SecimGrubu<Sekme>
          etiket="Sipariş listesi" secili={sekme} sec={sekmeYaz}
          secenekler={[{ anahtar: 'acik', baslik: 'Açık', sayi: acik.length }, { anahtar: 'sevk', baslik: 'Sevk edilen', sayi: sevk.length }]}
        />
      </div>
      {ozetler.length === 0
        ? <DurumKutusu durum="bos" mesaj="Henüz sipariş yok. Siparişler, Siparişler modülünde açılır ve onaylanınca burada görünür." />
        : liste.length === 0
          ? <p className="tc-mi-bos-kucuk">Bu listede sipariş yok.</p>
          : <div className="tc-mi-siparis-izgara">{liste.map((o) => <SiparisKarti key={o.id} siparis={o} />)}</div>}
    </>
  );
}

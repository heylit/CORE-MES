import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { DurumKutusu, SayfaBasligi, Sekmeler } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { Sartnameler } from './Sartnameler.tsx';
import { TalimatSablonlari } from './TalimatSablonlari.tsx';
import { useSablonlar, useSartnameler } from './veri.ts';

type Sekme = 'sartname' | 'talimat';

// Şartname ve talimatlar (989 a, prototip Main): şartname ne istendiğini, talimat nasıl yapılacağını söyler. İki kütüphane tek sayfada iki
// sekmedir; şablon talimata kopyalanır, bağ kurulmaz. Okuma oturumla açıktır; yazma rota.sartname-yaz, yayın rota.sartname-yayinla,
// şablon rota.talimat-yaz ister.
export function SartnameTalimat(o: EkranOzellikleri) {
  const [sorgu] = useSearchParams();
  // Genel aramanın komutu (kart #1241): `?yeni=sartname` ya da `?yeni=talimat` o sekmenin yeni kayıt penceresini açar; yetki düğmeninkidir.
  const istenen = sorgu.get('yeni');
  const acilis: Sekme | null = istenen === 'sartname' && o.yetki.sartnameYaz ? 'sartname' : istenen === 'talimat' && o.yetki.talimatYaz ? 'talimat' : null;
  const [sekme, setSekme] = useState<Sekme>(acilis ?? 'sartname');
  const [yeni, setYeni] = useState<Sekme | null>(acilis);
  const sartnameler = useSartnameler();
  const sablonlar = useSablonlar();
  const yazabilir = sekme === 'sartname' ? o.yetki.sartnameYaz : o.yetki.talimatYaz;

  return (
    <div className="tc-st" data-parca="R1">
      <SayfaBasligi baslik="Şartname ve talimatlar"
        alt="Şartname ne istendiğini, talimat nasıl yapılacağını söyler. Rota adımı ikisini de alır."
        {...(yazabilir ? { birincil: { etiket: sekme === 'sartname' ? 'Yeni şartname' : 'Yeni şablon', simge: 'plus' as const, yap: () => { setYeni(sekme); } } } : {})} />
      <Sekmeler etiket="Kütüphane" secili={sekme} sec={setSekme} sekmeler={[
        { anahtar: 'sartname', baslik: 'Şartnameler', simge: 'clipboard-check', ...(sartnameler.data ? { sayi: sartnameler.data.sartnameler.length } : {}) },
        { anahtar: 'talimat', baslik: 'Talimat şablonları', simge: 'list', ...(sablonlar.data ? { sayi: sablonlar.data.sablonlar.length } : {}) },
      ]} />
      {sartnameler.isPending && <DurumKutusu durum="yukleniyor" />}
      {sartnameler.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(sartnameler.error, 'Şartnameler alınamadı.')} yenile={() => { void sartnameler.refetch(); }} />
      )}
      {sartnameler.data && sekme === 'sartname' && (
        <Sartnameler veri={sartnameler.data} yazabilir={o.yetki.sartnameYaz} yayinlayabilir={o.yetki.sartnameYayinla}
          yeniAcik={yeni === 'sartname'} yeniKapat={() => { setYeni(null); }} />
      )}
      {sartnameler.data && sekme === 'talimat' && (
        <TalimatSablonlari yazabilir={o.yetki.talimatYaz} sartnameler={sartnameler.data.sartnameler}
          yeniAcik={yeni === 'talimat'} yeniKapat={() => { setYeni(null); }} />
      )}
    </div>
  );
}

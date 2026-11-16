import { useState } from 'react';
import { SayfaBasligi, Sekmeler } from '../../ortak/arayuz/index.ts';
import { LogoCariGecisi } from '../musteri-tedarikci/disari.ts';
import { TUR_ADLARI as LOGO_TUR_ADLARI } from './LogoGonderimi.tsx';
import { LogoMalzemeGecisi } from './LogoMalzemeGecisi.tsx';
import './malzemeler.css';

// Logo geçişi (3068): geçişin başında Logo'daki kullanılan kayıtları CORE'a almak ya da bağlamak için tek sayfa. Sekmenin içeriği
// ve yazmaları kaydın sahibi modüldedir (malzemeler; cariler müşteri-tedarikçide, 3343); bu dosya yalnız çerçevedir. Logo'ya bir şey yazılmaz.
type SekmeAdi = 'malzemeler' | 'cariler';

export function LogoGecisi() {
  const [sekme, sekmeYaz] = useState<SekmeAdi>('malzemeler');
  return (
    <section className="tc-lg-sayfa">
      <SayfaBasligi baslik="Logo geçişi" simge="download" alt="Gereken Logo kayıtlarını CORE'a alın ya da bağlayın; Logo'ya yazılmaz." />
      <Sekmeler<SekmeAdi>
        etiket="Logo geçişi"
        sekmeler={[{ anahtar: 'malzemeler', baslik: 'Malzemeler', simge: 'tag' }, { anahtar: 'cariler', baslik: 'Cariler', simge: 'building' }]}
        secili={sekme}
        sec={sekmeYaz}
      />
      {sekme === 'malzemeler' ? <LogoMalzemeGecisi turAdlari={LOGO_TUR_ADLARI} /> : <LogoCariGecisi />}
    </section>
  );
}

import { useState } from 'react';
import { Kart, SayfaBasligi, Sekmeler } from '../../ortak/arayuz/index.ts';
import { TUR_ADLARI as LOGO_TUR_ADLARI } from './LogoGonderimi.tsx';
import { LogoMalzemeGecisi } from './LogoMalzemeGecisi.tsx';
import './malzemeler.css';

// Logo geçişi (3068): geçişin başında Logo'daki kullanılan kayıtları CORE'a almak ya da bağlamak için tek sayfa. Sekmenin içeriği
// ve yazmaları kaydın sahibi modüldedir (malzemeler, sonra müşteri-tedarikçi); bu dosya yalnız çerçevedir. Logo'ya bir şey yazılmaz.
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
      {sekme === 'malzemeler'
        ? <LogoMalzemeGecisi turAdlari={LOGO_TUR_ADLARI} />
        : (
          <Kart>
            <p className="tc-lg-sayfa-not">
              Cari geçişi sonraki adımda gelir: Logo carileri CORE'daki müşteri ve tedarikçilerle yan yana listelenecek, seçerek toplu bağlanıp alınacak.
              Şimdilik tek cari için Müşteriler ve Tedarikçiler'deki "Logo'dan ara" kullanılır.
            </p>
          </Kart>
        )}
    </section>
  );
}

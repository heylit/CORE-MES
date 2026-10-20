import { useEffect } from 'react';
import { bildirimiKapat, useBaglanti } from '../veri/baglanti.ts';
import { Simge } from './Simge.tsx';
import './baglanti-seridi.css';

export const GERI_GELDI_SURESI_MS = 4000;

const sayiMetni = (n: number): string => `${String(n)} kaydın`;

// Kullanıcı iki şeyi bilmeli: şu an sunucuya ulaşılıyor mu ve kopukken gönderdiği kayıt sunucuya vardı mı. Şerit kabuğun en
// üstünde, sayfanın akışındadır: menüyü aşağı iter, üstüne binmez; ekranı kapatmaz. Belirsiz kayıt varken kendiliğinden
// kapanmaz: okunmadan kaybolan uyarı aynı kaydın ikinci kez girilmesine yol açar.
export function BaglantiSeridi() {
  const { kopuk, bilinmeyenYazma, geriGeldi } = useBaglanti();

  useEffect(() => {
    if (!geriGeldi || bilinmeyenYazma > 0) return undefined;
    const zamanlayici = setTimeout(bildirimiKapat, GERI_GELDI_SURESI_MS);
    return () => { clearTimeout(zamanlayici); };
  }, [geriGeldi, bilinmeyenYazma]);

  if (!kopuk && !geriGeldi && bilinmeyenYazma === 0) return null;

  let mesaj: string;
  if (kopuk) {
    mesaj = bilinmeyenYazma > 0
      ? `Sunucuya ulaşılamıyor, yeniden deneniyor. ${sayiMetni(bilinmeyenYazma)} sunucuya ulaşıp ulaşmadığı bilinmiyor.`
      : 'Sunucuya ulaşılamıyor (güncelleme ya da bağlantı kesintisi). Yeniden deneniyor; çalışmaya devam edebilirsiniz.';
  } else if (bilinmeyenYazma > 0) {
    mesaj = `Bağlantı geri geldi. Kopukken gönderilen ${sayiMetni(bilinmeyenYazma)} durumunu yeniden girmeden önce ekranda denetleyin.`;
  } else {
    mesaj = 'Bağlantı geri geldi. Ekrandaki bilgiler yenilendi.';
  }
  const ton = kopuk ? 'kopuk' : bilinmeyenYazma > 0 ? 'belirsiz' : 'tamam';

  return (
    <div className={`tc-baglanti-seridi tc-baglanti-seridi-${ton}`} role={kopuk ? 'alert' : 'status'}>
      <Simge ad={ton === 'tamam' ? 'check' : 'alert'} />
      <p className="tc-baglanti-seridi-mesaj">{mesaj}</p>
      {!kopuk && (
        <button type="button" className="tc-baglanti-seridi-kapat" onClick={bildirimiKapat} aria-label="Bağlantı uyarısını kapat">
          <Simge ad="x" boyut="k" />
        </button>
      )}
    </div>
  );
}

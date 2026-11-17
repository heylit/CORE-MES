import { Simge } from './Simge.tsx';
import './kilitli-deger.css';

// 3401-1 a: yetkisiz kişiye para alanı sunucudan gelmez; yerinde her ekranda aynı kilit, aynı metin ve gereken yetkinin adı çizilir.
// Gereken yetki ikinci satırda yazılıdır (üzerine gelme gerektirmez, dokunmatikte de okunur). Sıfır ya da tire gösterilmez.
export function KilitliDeger({ yetki }: { yetki: string }) {
  return (
    <span className="tc-kilitli" aria-label={`Yetkiniz yok: ${yetki}`}>
      <Simge ad="lock" boyut="k" />
      <b>Yetkiniz yok</b>
      <small>{yetki}</small>
    </span>
  );
}

// Tabloda yetkisiz sütun çizilmez; tablonun üstünde bu tek satır durur.
export function KilitliSutunNotu({ ne, yetki }: { ne: string; yetki: string }) {
  return (
    <p className="tc-kilitli-not">
      <Simge ad="lock" boyut="k" />
      <span>{ne} yetkinizde değil ({yetki})</span>
    </p>
  );
}

// Gereken yetkilerin ekrandaki adları: kilidin altında yazılır.
export const YETKI_ADI = {
  satinAlmaFiyati: 'Satın alma fiyatlarını görür',
  maliyet: 'Maliyet görür',
  siparisFiyati: 'Sipariş fiyatını görür',
} as const;

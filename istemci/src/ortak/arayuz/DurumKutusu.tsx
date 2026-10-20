import type { ReactNode } from 'react';
import { Dugme } from './Dugme.tsx';
import './durum-kutusu.css';

interface Ozellikler {
  durum: 'yukleniyor' | 'bos' | 'hata';
  mesaj?: string;
  yenile?: () => void;
  children?: ReactNode;
}

// Veri yokken "yok" der; sıfır ya da boş değer göstermez.
export function DurumKutusu({ durum, mesaj, yenile, children }: Ozellikler) {
  const metin = mesaj ?? (durum === 'yukleniyor' ? 'Yükleniyor' : durum === 'bos' ? 'Kayıt yok' : 'Veri alınamadı');
  return (
    <div className={`tc-durum tc-durum-${durum}`} role={durum === 'hata' ? 'alert' : 'status'}>
      <p>{metin}</p>
      {children}
      {durum === 'hata' && yenile && <Dugme onClick={yenile}>Yeniden dene</Dugme>}
    </div>
  );
}

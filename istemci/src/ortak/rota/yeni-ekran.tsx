import type { ReactNode } from 'react';
import type { Islem } from '#paylasilan/islemler.ts';
import { DurumKutusu } from '../arayuz/DurumKutusu.tsx';
import { useYetki } from '../veri/yetki.ts';

// TS geçişinde yeni ekran eski çerçevenin yanında ikinci yolda (`<kök>/yeni/*`) açılır ve alıma kadar yalnız yöneticide görünür.
// Bu işlem yetki matrisinde yalnız yöneticide kalanlardandır; kapı değişecekse yalnız bu sabit değişir.
export const YENI_EKRAN_ISLEMI: Islem = 'kisiler.rol-yonet';
export const YENI_EKRAN_ILETISI = 'Bu ekran hazırlanıyor';

export function YeniEkranKapisi({ children }: { children?: ReactNode }) {
  const yetki = useYetki();
  if (!yetki.hazir) return <DurumKutusu durum="yukleniyor" />;
  if (!yetki.var(YENI_EKRAN_ISLEMI)) return <DurumKutusu durum="bos" mesaj={YENI_EKRAN_ILETISI} />;
  return <>{children}</>;
}

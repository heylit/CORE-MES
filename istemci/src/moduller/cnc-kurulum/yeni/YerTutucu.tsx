import { DurumKutusu } from '../../../ortak/arayuz/index.ts';

// Parça yazarının dolduracağı görünümün yeri; iskelet her görünümü bununla açar.
export function YerTutucu({ ad }: { ad: string }) {
  return <div className="tc-cy-yer"><DurumKutusu durum="bos" mesaj={`${ad} görünümü hazırlanıyor.`} /></div>;
}

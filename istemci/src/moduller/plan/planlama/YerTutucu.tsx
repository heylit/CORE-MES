import { DurumKutusu } from '../../../ortak/arayuz/index.ts';

// Parça yazarının dolduracağı görünümün yeri; iskelet her görünümü bununla açar. Parça teslim edilince kendi klasöründen kalkar.
export function YerTutucu({ ad }: { ad: string }) {
  return <div className="tc-py-yer"><DurumKutusu durum="bos" mesaj={`${ad} hazırlanıyor.`} /></div>;
}

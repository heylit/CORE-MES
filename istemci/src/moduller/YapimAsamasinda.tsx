import { DurumKutusu, Kart } from '../ortak/arayuz/index.ts';

export function YapimAsamasinda({ baslik }: { baslik: string }) {
  return (
    <Kart baslik={baslik}>
      <DurumKutusu durum="bos" mesaj="Bu sayfa henüz yapım aşamasında" />
    </Kart>
  );
}

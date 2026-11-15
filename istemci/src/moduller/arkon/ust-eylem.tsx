import { useEffect } from 'react';
import { useHesapMaddesiDurumu, type UstEylem, type UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { useVardiyaOzetiAcilabilir, vardiyaOzetiniAc } from './yeni/operator/vardiya-ozeti-istegi.ts';

const VARDIYA_OZETI = 'vardiya-ozeti';

// Görünür düğmesi yoktur: madde Hesap menüsündedir, terminal açık değilken gizlenir (3298).
function VardiyaOzetiEylemi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const acilabilir = useVardiyaOzetiAcilabilir();
  useHesapMaddesiDurumu(VARDIYA_OZETI, !acilabilir);
  useEffect(() => { if (acmaIstegi > 0) vardiyaOzetiniAc(); }, [acmaIstegi]);
  return null;
}

export const ustEylemler: readonly UstEylem[] = [{
  anahtar: VARDIYA_OZETI, sira: 60, islem: 'sayfa.uretim-terminali', yer: 'hesap',
  hesapMaddesi: { baslik: 'Vardiya özeti ve devir', simge: 'chart' }, dugme: VardiyaOzetiEylemi,
}];

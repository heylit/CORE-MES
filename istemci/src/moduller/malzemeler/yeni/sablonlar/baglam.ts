import { useMemo } from 'react';
import { useOturum } from '../../../../ortak/veri/oturum.ts';
import { useKuralBaglami, type KuralBaglami } from '../kurallar/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useBirimSistemi } from '../tercihler.ts';
import type { Sablon } from '../tipler.ts';

// Şablonlar ve Kılavuz kart listesine bakmaz (özet ve örnek ayrıştırma yalnız tanımları okur): kartlar istenmez.
export function useM4Baglami(o: EkranOzellikleri, sablonlar?: readonly Sablon[]): KuralBaglami {
  const oturum = useOturum();
  const [birim] = useBirimSistemi();
  const k = oturum.data;
  // Bağlam kişi nesnesi değişince yeniden kurulur; her çizimde yeni nesne vermemek için saklanır.
  const kisi = useMemo(() => (k ? { id: k.id, ad: k.ad } : BOS_KISI), [k]);
  return useKuralBaglami({ ortam: o.ortam, kartlar: undefined, sablonlar, kisi, birim, yetki: o.yetki });
}

const BOS_KISI = { id: 0, ad: '' };

import { createElement } from 'react';
import type { Gorev, Kayit, Onay, SiparisOzeti, Toplanti } from '../tipler.ts';
import { YerTutucu } from '../yer-tutucu.tsx';

// M2 yer tutucusu (PARCA-SOZLESMESI): M2 bu dosyayı yeniden yazar; DuyuruKarti M1'indir.
export { DuyuruKarti } from './DuyuruKarti.tsx';
export function GorevSatiri({ gorev }: { gorev: Kayit<Gorev>; siparissiz?: boolean }) { return createElement(YerTutucu, { baslik: gorev.title }); }
export function OnayKarti({ onay }: { onay: Kayit<Onay>; iletide?: boolean; tam?: boolean }) { return createElement(YerTutucu, { baslik: onay.title }); }
export function ToplantiKarti({ toplanti }: { toplanti: Kayit<Toplanti>; iletide?: boolean }) { return createElement(YerTutucu, { baslik: toplanti.title }); }
export function ToplantiSatiri({ toplanti }: { toplanti: Kayit<Toplanti> }) { return createElement(YerTutucu, { baslik: toplanti.title }); }
export function SiparisKarti({ siparis }: { siparis: SiparisOzeti; kisa?: boolean }) { return createElement(YerTutucu, { baslik: `#${siparis.no}` }); }

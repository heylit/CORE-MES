import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MerkezEkrani } from '../ekran/MerkezEkrani.tsx';
import { merkeziBagla, type BaglamaSecenegi } from './bagla.ts';

// Yalnız testler için: satın almacının ortak parçalı ekranı (2412-2) uygulamada SatinAlma.tsx'in portalıyla #sa-ekran'a çizilir;
// merkezi doğrudan bağlayan testler aynı yeri aynı parçayla doldurur.
const ekran = () => createElement(MemoryRouter, null, createElement(MerkezEkrani));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

export function ekranliBagla(kok: HTMLElement, secenek: BaglamaSecenegi): () => void {
  const kapat = merkeziBagla(kok, secenek);
  const yer = kok.querySelector<HTMLElement>('#sa-ekran')!;
  const kokR = createRoot(yer);
  act(() => { kokR.render(ekran()); });
  return () => { act(() => { kokR.unmount(); }); kapat(); };
}

// Merkezin #main'ini çizen testler için: ortak parçalı ekranı ayrı bir kaba çizer ve kabı döner.
let acik: { kok: Root; kap: HTMLElement } | null = null;
export function ekranCiz(): HTMLElement {
  ekranKaldir();
  const kap = document.createElement('div');
  document.body.append(kap);
  const kok = createRoot(kap);
  act(() => { kok.render(ekran()); });
  acik = { kok, kap };
  return kap;
}
export function ekranKaldir(): void {
  if (!acik) return;
  const { kok, kap } = acik;
  acik = null;
  act(() => { kok.unmount(); });
  kap.remove();
}

export const talepSatiri = (kok: ParentNode, id: string) => kok.querySelector<HTMLElement>(`tr[data-satir="${id}"]`);
export const sekme = (kok: ParentNode, anahtar: string) => kok.querySelector<HTMLElement>(`[role="tab"][data-sekme="${anahtar}"]`);

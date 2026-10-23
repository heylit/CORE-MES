import { createElement, Fragment, type ReactNode } from 'react';
import type { Islem } from '#paylasilan/islemler.ts';
import { useOturum } from './oturum.ts';

export interface Yetki {
  // Oturum gelmeden karar verilmez: yüklenirken gizlemek ile "yetkisiz" demek ayrı durumlardır.
  hazir: boolean;
  var: (islem: Islem) => boolean;
  herhangi: (...islemler: readonly Islem[]) => boolean;
}

// Ekran yalnız gizler; asıl denetim sunucudadır. Oturum yoksa ya da alınamadıysa hiçbir işlem yoktur.
export function yetkiKur(islemler: readonly string[] | null | undefined, hazir = true): Yetki {
  const kume = new Set(islemler ?? []);
  return {
    hazir,
    var: (islem) => kume.has(islem),
    herhangi: (...liste) => liste.some((islem) => kume.has(islem)),
  };
}

export function useYetki(): Yetki {
  const oturum = useOturum();
  return yetkiKur(oturum.data?.islemler, !oturum.isPending);
}

interface YetkiliOzellikleri {
  // Dizi verilirse herhangi biri yeter.
  islem: Islem | readonly Islem[];
  yoksa?: ReactNode;
  children?: ReactNode;
}

export function Yetkili({ islem, yoksa = null, children }: YetkiliOzellikleri) {
  const yetki = useYetki();
  const izinli = typeof islem === 'string' ? yetki.var(islem) : yetki.herhangi(...islem);
  return createElement(Fragment, null, izinli ? children : yoksa);
}

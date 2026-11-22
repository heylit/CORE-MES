import { useCallback, useEffect, useState } from 'react';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';

// Sayfanın açılış okumaları: bir yol okunur; etkin değilse okunmaz (yetki yoksa uç 403 verirdi). Hata iletisi gösterilir, sayı uydurulmaz.
export type Okuma<T> = { durum: 'bekliyor' } | { durum: 'yok' } | { durum: 'hata'; ileti: string } | { durum: 'tamam'; veri: T };
export function useOku<T>(yol: string, etkin: boolean, hataMetni: string): { okuma: Okuma<T>; yenile: () => void; koy: (v: T) => void } {
  const [okuma, setOkuma] = useState<Okuma<T>>(etkin ? { durum: 'bekliyor' } : { durum: 'yok' });
  const [sayac, setSayac] = useState(0);
  useEffect(() => {
    if (!etkin) { setOkuma({ durum: 'yok' }); return undefined; }
    let canli = true;
    api.get<T>(yol).then(
      (veri) => { if (canli) setOkuma({ durum: 'tamam', veri }); },
      (h: unknown) => { if (canli) setOkuma({ durum: 'hata', ileti: hataIletisi(h, hataMetni) }); },
    );
    return () => { canli = false; };
  }, [yol, etkin, hataMetni, sayac]);
  const yenile = useCallback(() => { setSayac((x) => x + 1); }, []);
  const koy = useCallback((veri: T) => { setOkuma({ durum: 'tamam', veri }); }, []);
  return { okuma, yenile, koy };
}

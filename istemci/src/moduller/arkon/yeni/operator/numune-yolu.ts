import { useEffect, useState } from 'react';
import { kaliteIstasyonuOku, numuneTeslimi } from '../../../../../../arkon/web/src/data/numune.ts';
import type { ArkonBaglami } from '../veri/baglam.ts';
import type { NumuneYolu } from './kurallar.ts';

// 3718 a: bekleyen numunenin gittiği kalite istasyonu ve teslim alınışı; ikisi de sunucunun isteğe yazdığı alanlardır. İstek eşitlenince
// (kalite teslim aldı, sunucu istasyonu yazdı) yeniden okunur. İstek yoksa ya da okunamazsa null: "Şimdi" kartı bugünkü gibi kalır.
export function useNumuneYolu(depo: ArkonBaglami['depo'], istekId: string | null | undefined): NumuneYolu | null {
  const [yol, yolYaz] = useState<NumuneYolu | null>(null);
  useEffect(() => {
    if (!istekId) { yolYaz(null); return undefined; }
    let iptal = false;
    const oku = async () => {
      const r = (await depo.DB.get('requests', istekId).catch(() => null)) as object | null | undefined;
      if (iptal) return;
      const t = r ? numuneTeslimi(r) : null;
      yolYaz(r ? { istasyon: kaliteIstasyonuOku(r), teslim: t ? { at: t.at, kisi: t.kisi } : null } : null);
    };
    void oku();
    const kapat = depo.Bus.on((m) => { if (m.type === '$merged' && m.store === 'requests') void oku(); });
    return () => { iptal = true; kapat(); };
  }, [depo, istekId]);
  return yol;
}

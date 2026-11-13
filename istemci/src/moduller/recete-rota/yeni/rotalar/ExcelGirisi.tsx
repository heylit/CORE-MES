import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExcelPenceresi } from '../../../../ortak/excel/ExcelPenceresi.tsx';
import { anahtarlar, type RrDurumu } from '../veri.ts';
import { rotaKaynagi, rotaTanimi, rotaYaz } from './excel.ts';

// Excel ile rota adımları (2627): "Diğer rota işlemleri" menüsünden, yalnız rota yazabilene (rota.revizyon-yaz) açılır. Tanım ve kaynak pencere
// açılınca bir kez kurulur: önizlemenin karşılaştırdığı adımlar ile sunucuya giden revizyon dayanağı aynı veriden gelir (arka planda
// yenilenen veri dayanağı sessizce ilerletmez; değişmişse sunucu 409 ile reddeder).
export function RotaExcelPenceresi({ durum, kapat }: { durum: RrDurumu; kapat: () => void }) {
  const istemci = useQueryClient();
  const [{ tanim, kaynak }] = useState(() => ({ tanim: rotaTanimi(durum), kaynak: rotaKaynagi(durum) }));
  return (
    <ExcelPenceresi
      tanim={tanim}
      kapat={kapat}
      yaz={async (satirlar, istekKimligi) => {
        const sonuc = await rotaYaz(satirlar, istekKimligi, kaynak);
        await istemci.invalidateQueries({ queryKey: anahtarlar.veri });
        return sonuc;
      }}
    />
  );
}

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KisiOzeti } from '#paylasilan/sozlesme/kisiler.ts';
import { Menu } from '../../ortak/arayuz/index.ts';
import { ExcelPenceresi } from '../../ortak/excel/ExcelPenceresi.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { kisiTanimi, kisiYaz } from './excel.ts';

// Excel ile toplu giriş (2627): Personel'in ⋯ menüsünde, yalnız kisiler.yaz olana.
export function KisiExcelMenusu({ kisiler }: { kisiler: readonly KisiOzeti[] | undefined }) {
  const [acik, acikYaz] = useState(false);
  const istemci = useQueryClient();
  const tanim = useMemo(() => (!acik || kisiler === undefined ? null : kisiTanimi(kisiler)), [acik, kisiler]);
  return (
    <>
      <Menu etiket="Personel: diğer işlemler" ipucu="Diğer işlemler" ogeler={[{ anahtar: 'excel', baslik: 'Excel ile toplu giriş', simge: 'file', sec: () => acikYaz(true) }]} />
      {acik && (
        <ExcelPenceresi
          tanim={tanim}
          kapat={() => acikYaz(false)}
          yaz={async (satirlar, istekKimligi) => {
            const sonuc = await kisiYaz(satirlar, istekKimligi);
            await istemci.invalidateQueries({ queryKey: anahtarlar.kisiler });
            return sonuc;
          }}
        />
      )}
    </>
  );
}

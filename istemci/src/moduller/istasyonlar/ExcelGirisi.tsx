import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Menu } from '../../ortak/arayuz/index.ts';
import { ExcelPenceresi } from '../../ortak/excel/ExcelPenceresi.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { tesisTanimi, tesisYaz, yetkinlikTanimi, yetkinlikYaz } from './excel.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

// Excel ile toplu giriş (2627): bölümün ⋯ menüsünde, yalnız yazma yetkisi olana (Arayüz 1). Tesis dosyası iş merkezi, istasyon ve makineyi birlikte taşır.
export function ExcelMenusu({ tur, v, bolum }: { tur: 'tesis' | 'yetkinlik'; v: TesisVerisi; bolum: string }) {
  const [acik, acikYaz] = useState(false);
  const istemci = useQueryClient();
  const tanim = useMemo(() => (!acik || v.yukleniyor ? null : tur === 'tesis' ? tesisTanimi(v) : yetkinlikTanimi(v)), [acik, tur, v]);
  return (
    <>
      <Menu etiket={`${bolum}: diğer işlemler`} ipucu="Diğer işlemler" ogeler={[{ anahtar: 'excel', baslik: 'Excel ile toplu giriş', simge: 'file', sec: () => acikYaz(true) }]} />
      {acik && (
        <ExcelPenceresi
          tanim={tanim}
          kapat={() => acikYaz(false)}
          yaz={async (satirlar, istekKimligi) => {
            const sonuc = tur === 'tesis' ? await tesisYaz(satirlar, istekKimligi) : await yetkinlikYaz(satirlar);
            await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
            return sonuc;
          }}
        />
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Menu } from '../../../../ortak/arayuz/index.ts';
import { ExcelPenceresi } from '../../../../ortak/excel/ExcelPenceresi.tsx';
import { api } from '../../../../ortak/veri/api.ts';
import { anahtarlar, type RrDurumu } from '../veri.ts';
import { emirKaynagi, emirTanimi, emirYaz } from './excel.ts';

// Excel ile toplu emir (2627): emir bölümünün ⋯ menüsünde, yalnız emri rotadan açabilene (rota.emre-kopyala). Proje listesi emir
// açma seçeneklerinden okunur; seçenekler üründen bağımsızdır, sipariş satırları burada kullanılmaz.
export function EmirExcelMenusu({ durum }: { durum: RrDurumu }) {
  const [acik, acikYaz] = useState(false);
  const istemci = useQueryClient();
  const ilkUrun = (durum.items ?? []).find((i) => i.type === 'mamul' || i.type === 'yari')?.id;
  const secenekler = useQuery({
    queryKey: [...anahtarlar.veri, 'excel-acilis', ilkUrun ?? ''],
    queryFn: () => api.get<AcilisSecenekleri>(`/adimli-emirler/acilis-secenekleri?malzemeNo=${String(ilkUrun)}`),
    enabled: acik && ilkUrun !== undefined,
  });
  const hazir = !acik || ilkUrun === undefined ? null : secenekler.data ?? null;
  // Üretilen kart yoksa seçenek istenmez; tanım boş ürün listesi ve kılavuzdaki açıklamayla kurulur (pencere beklemede kalmaz).
  const bekliyor = acik && ilkUrun !== undefined && hazir === null && !secenekler.isError;
  const tanim = useMemo(() => (bekliyor ? null : emirTanimi(durum, hazir)), [durum, hazir, bekliyor]);
  return (
    <>
      <Menu etiket="Üretim emirleri: diğer işlemler" ipucu="Diğer işlemler" ogeler={[{ anahtar: 'excel', baslik: 'Excel ile toplu emir', simge: 'file', sec: () => acikYaz(true) }]} />
      {acik && (
        <ExcelPenceresi
          tanim={tanim}
          kapat={() => acikYaz(false)}
          yaz={async (satirlar, istekKimligi) => {
            const sonuc = await emirYaz(satirlar, istekKimligi, emirKaynagi(durum, hazir));
            await istemci.invalidateQueries({ queryKey: anahtarlar.veri });
            return sonuc;
          }}
        />
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Menu } from '../../../../ortak/arayuz/index.ts';
import { ExcelPenceresi } from '../../../../ortak/excel/ExcelPenceresi.tsx';
import { api } from '../../../../ortak/veri/api.ts';
import { anahtarlar, type RrDurumu } from '../veri.ts';
import { emirGuncelleTanimi, emirGuncelleYaz, emirKaynagi, emirTanimi, emirYaz } from './excel.ts';

// Excel ile toplu emir (2627): emir bölümünün ⋯ menüsünde, yalnız emri rotadan açabilene (rota.emre-kopyala). Proje listesi emir
// açma seçeneklerinden okunur; seçenekler üründen bağımsızdır, sipariş satırları burada kullanılmaz. Açık emirleri güncelleme (2704 a)
// yalnız emri değiştirebilene (uretim-emirleri.yaz).
export type ExcelPenceresiTuru = 'yeni' | 'guncelle';

// Menü dışarıda çizilebilir (Üretim Emirleri, 3003 a): o zaman `acilis` seçilen pencereyle gelir, pencere kapanınca `kapandi` çağrılır;
// kaynak verisi yalnız pencere açılınca okunur.
export function EmirExcelMenusu({ durum, acabilir, guncelleyebilir, acilis, kapandi }: {
  durum: RrDurumu; acabilir: boolean; guncelleyebilir: boolean; acilis?: ExcelPenceresiTuru; kapandi?: () => void;
}) {
  const [pencere, pencereYaz0] = useState<ExcelPenceresiTuru | null>(acilis ?? null);
  const pencereYaz = (p: ExcelPenceresiTuru | null) => { pencereYaz0(p); if (p === null) kapandi?.(); };
  const acik = pencere === 'yeni';
  const acikYaz = (v: boolean) => { pencereYaz(v ? 'yeni' : null); };
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
      {acilis === undefined && <ExcelMenusu acabilir={acabilir} guncelleyebilir={guncelleyebilir} sec={pencereYaz} />}
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
      {pencere === 'guncelle' && <GuncellePenceresi durum={durum} kapat={() => { pencereYaz(null); }} />}
    </>
  );
}

export function ExcelMenusu({ acabilir, guncelleyebilir, sec }: { acabilir: boolean; guncelleyebilir: boolean; sec: (p: ExcelPenceresiTuru) => void }) {
  return (
    <Menu etiket="Üretim emirleri: diğer işlemler" ipucu="Diğer işlemler" ogeler={[
      ...(acabilir ? [{ anahtar: 'excel', baslik: 'Excel ile toplu emir', simge: 'file' as const, sec: () => { sec('yeni'); } }] : []),
      ...(guncelleyebilir ? [{ anahtar: 'excel-guncelle', baslik: 'Excel ile açık emirleri güncelle', simge: 'edit' as const, sec: () => { sec('guncelle'); } }] : []),
    ]} />
  );
}

function GuncellePenceresi({ durum, kapat }: { durum: RrDurumu; kapat: () => void }) {
  const istemci = useQueryClient();
  const tanim = useMemo(() => emirGuncelleTanimi(durum), [durum]);
  return (
    <ExcelPenceresi
      tanim={tanim}
      kapat={kapat}
      yaz={async (satirlar, istekKimligi) => {
        const sonuc = await emirGuncelleYaz(satirlar, istekKimligi);
        await istemci.invalidateQueries({ queryKey: anahtarlar.veri });
        return sonuc;
      }}
    />
  );
}

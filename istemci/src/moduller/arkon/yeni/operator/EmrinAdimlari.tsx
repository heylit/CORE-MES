import { useEffect, useState } from 'react';
import type { AdimDurumuTerminalCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { tarihMetni } from '../../../../ortak/veri/zaman-metni.ts';
import { ADIM_STATUSU } from '../../../uretim-emirleri/disari.ts';

// Emrin adımları (2893-3 b): operatör emrin bütün adımlarının son durumunu okur; ilk adım üstte, kendi adımı işaretli. Elle yazılan
// statü "Elle" işaretiyle görünür; kişi, gerekçe ve geçmiş terminale gelmez. Operatör statü yazmaz. Okunamazsa bölüm çizilmez.
export function useEmrinAdimlari(emirId: number | null, yenidenSor: unknown): AdimDurumuTerminalCevabi | null {
  const [v, vYaz] = useState<AdimDurumuTerminalCevabi | null>(null);
  useEffect(() => {
    vYaz(null);
    if (emirId === null) return;
    let canli = true;
    api.get<AdimDurumuTerminalCevabi>(`/adimli-emirler/${String(emirId)}/adim-durumu/terminal`).then((c) => { if (canli) vYaz(c); }).catch(() => undefined);
    return () => { canli = false; };
  }, [emirId, yenidenSor]);
  return v;
}

// 2893-3 b: adımı bekleten talep ve sipariş numarası ile beklenen teslim; fiyat ve tedarikçi gelmez.
const tedarikMetni = (t: AdimDurumuTerminalCevabi['adimlar'][number]['tedarik'][number]): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo}`
  : `Sipariş ${t.siparisNo ?? t.talepNo}${t.termin === null ? '' : ` · termin ${tarihMetni(t.termin)}`}`;

export function EmrinAdimlari({ v, isEmriId }: { v: AdimDurumuTerminalCevabi | null; isEmriId: number | null }) {
  if (v === null || v.adimlar.length === 0) return null;
  return (
    <section className="tc-ay1-adim-durumu" aria-label="Emrin adımları">
      <h3><Simge ad="route" boyut="k" />Emrin adımları · son durum</h3>
      <ol>
        {v.adimlar.map((a) => {
          const g = ADIM_STATUSU[a.statu];
          return (
            <li key={a.isEmriId} aria-current={a.isEmriId === isEmriId ? 'step' : undefined}>
              <span className="tc-ay1-adim-op">OP {a.opNo}</span>
              <span className="tc-ay1-adim-ad">
                {a.ad}{a.isEmriId === isEmriId ? ' · bu adım' : ''}{a.elle ? <em>Elle</em> : null}
                {a.tedarik.length > 0 ? <small>{a.tedarik.map(tedarikMetni).join(' · ')}</small> : null}
              </span>
              <span className="tc-ay1-hz-cip" data-ton={g.ton === 'bilgi' ? 'tamam' : g.ton} data-sakin="" title={a.nedenler.join(', ') || undefined}>
                <Simge ad={g.simge} boyut="k" /><span>{g.ad}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

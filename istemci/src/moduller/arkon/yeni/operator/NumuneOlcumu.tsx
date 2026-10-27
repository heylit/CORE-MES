import { useEffect, useState } from 'react';
import { KaliteFormu, type OlcumYazici } from '../../../kalite-merkezi/disari.ts';
import { DurumKutusu, Pencere } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useArkon } from '../veri/baglam.ts';
import type { KaliteNumunesi } from './tipler.ts';

// 798: terminalin "Ölç"ü ortak kalite formunu açar (Kalite Merkezi'ndeki resim, balonlar ve emrin ölçümleri). Ölçü numuneyle Arkon ucuna
// gider; üretim emri ve numune sunucuda istekten çözülür, sunucu aynı işlemde Kalite Merkezi'ne yazar (kaynak kişinin rolü).
// Kalite Merkezi numunesi olmayan (eski) istekte form yoktur.
export const kmNumunesi = (r: KaliteNumunesi): number | null => {
  const n = (r as { kmNumune?: unknown }).kmNumune;
  return typeof n === 'number' ? n : null;
};

// Cihazın kendi kaynak kimliği değildir: sunucunun yaydığı değişiklik iletisi bu cihaza da gelir, liste ölçülen sayıyla tazelenir.
const FORM_KAYNAGI = 'kalite-formu';
export const numuneOlcumYazici = (kimlik: string): OlcumYazici => (g) => api.post(`/arkon/numuneler/${encodeURIComponent(kimlik)}/olcum`, {
  olcumler: g.olcumler, ...(g.parcaSayisi === undefined ? {} : { parcaSayisi: g.parcaSayisi }), kaynak: FORM_KAYNAGI,
});

const sayiAlani = (kayit: unknown, ...yol: string[]): number | null => {
  let d: unknown = kayit;
  for (const a of yol) d = d !== null && typeof d === 'object' ? (d as Record<string, unknown>)[a] : undefined;
  return typeof d === 'number' && Number.isSafeInteger(d) && d > 0 ? d : null;
};

export function NumuneOlcumu({ r, yazabilir, kapat }: { r: KaliteNumunesi; yazabilir: boolean; kapat: () => void }) {
  const { depo } = useArkon();
  const [paket, paketYaz] = useState<unknown>(undefined);
  useEffect(() => {
    let gecerli = true;
    void depo.DB.get('pkgs', r.pkgId).then((p) => { if (gecerli) paketYaz(p ?? null); });
    return () => { gecerli = false; };
  }, [depo, r.pkgId]);
  const malzemeNo = sayiAlani(paket, 'malzemeNo');
  const emirId = sayiAlani(paket, 'tmi', 'emirId');
  const numune = kmNumunesi(r);
  return (
    <Pencere acik kapat={kapat} baslik={`Ölç · ${r.no}`} tur="tam">
      {paket === undefined ? <DurumKutusu durum="yukleniyor" />
        : malzemeNo !== null && emirId !== null && numune !== null
          ? <KaliteFormu malzemeNo={malzemeNo} uretimEmriId={emirId} numuneId={numune} yaz={numuneOlcumYazici(r.id)} yazabilir={yazabilir} />
          : <DurumKutusu durum="bos" mesaj="Bu numunenin parçası Kalite Merkezi'ne bağlı değil." />}
    </Pencere>
  );
}

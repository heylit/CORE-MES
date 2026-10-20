import { useMemo, useState } from 'react';
import { Dugme, DurumKutusu, Secim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DepoYazimiBaglami } from './depo-yazimi.ts';
import type { DepoYazimi } from './depo-yazimi.ts';
import { DepoGorunumu } from './DepoGorunumu.tsx';
import type { DepoSecimi } from './DepoGorunumu.tsx';
import { useFabrika, useGozKalemleri } from './veri.ts';
import { YerlesimDuzenleyici } from './YerlesimDuzenleyici.tsx';
import './atolye.css';

// Haritanın depo görünümü başka sayfada (Stok Merkezi > Depo, kart #1304): raf, bölme ve göz aynı veriden, aynı bileşenle
// çizilir; raf ekleme ve düzenleme haritanın yerleşim düzenleyicisiyle yapılır. Böylece iki sayfada ayrı raf kaydı olmaz.
interface Ozellikler {
  // Gösterilecek bölümler (stok deposu olanlar); null bütün bölümler.
  salonIdler: readonly number[] | null;
  // Harita yetkisi olmayan kişinin raf ve göz kalemi yazımı (sayfanın kendi uçları); null ise yalnız harita yetkisiyle yazılır.
  depoYazimi: DepoYazimi | null;
}

export function DepoPaneli({ salonIdler, depoYazimi }: Ozellikler) {
  const haritaYazar = useOturum().data?.islemler.includes('atolye.yaz') === true;
  const yazim = haritaYazar ? null : depoYazimi;
  const yazabilir = haritaYazar || yazim !== null;
  const fabrika = useFabrika();
  const bolumler = useMemo(
    () => (fabrika.data?.bolumler ?? []).filter((b) => salonIdler === null || salonIdler.includes(b.salon.id)),
    [fabrika.data, salonIdler],
  );
  const [secilen, secilenYaz] = useState<number | null>(null);
  const salonId = bolumler.some((b) => b.salon.id === secilen) ? secilen : bolumler[0]?.salon.id ?? null;
  const bolum = bolumler.find((b) => b.salon.id === salonId);
  const gozKalemleri = useGozKalemleri(salonId);
  const [secim, secimYaz] = useState<DepoSecimi | null>(null);
  const [duzenleyici, duzenleyiciYaz] = useState(false);

  if (fabrika.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(fabrika.error, 'Fabrika Haritası alınamadı')} yenile={() => void fabrika.refetch()} />;
  if (fabrika.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!bolum) return <DurumKutusu durum="bos" mesaj="Haritada depo bölümü yok." />;

  return (
    <DepoYazimiBaglami.Provider value={yazim}>
      <div className="tc-atolye-depo-paneli">
        <div className="tc-atolye-depo-paneli-ust">
          {bolumler.length > 1 && (
            <Secim
              etiket="Bölüm"
              secenekler={bolumler.map((b) => ({ deger: String(b.salon.id), baslik: `${b.salon.kod} · ${b.salon.ad}` }))}
              value={String(bolum.salon.id)}
              onChange={(o) => { secilenYaz(Number(o.target.value)); secimYaz(null); }}
            />
          )}
          {yazabilir && <Dugme simge="plus" onClick={() => duzenleyiciYaz(true)}>Raf ekle ve düzenle</Dugme>}
        </div>
        <DepoGorunumu
          raflar={bolum.raflar}
          gozKalemleri={gozKalemleri.data?.kalemler}
          hata={gozKalemleri.isError ? hataIletisi(gozKalemleri.error, 'Göz kalemleri alınamadı') : null}
          yenile={() => { void gozKalemleri.refetch(); }}
          yazabilir={yazabilir}
          secim={secim}
          secimYaz={secimYaz}
          ucBoyut={null}
        />
        {duzenleyici && (
          <YerlesimDuzenleyici
            salonId={bolum.salon.id}
            bolumler={fabrika.data.bolumler}
            kapat={() => duzenleyiciYaz(false)}
            kaydedildi={() => duzenleyiciYaz(false)}
          />
        )}
      </div>
    </DepoYazimiBaglami.Provider>
  );
}

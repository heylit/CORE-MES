import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import type { EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { KodOkuyucu, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

type Emir = EmirlerCevabi['emirler'][number];
// Sözleşmedeki ACIK_EMIR_DURUMLARI ile aynı; istemci sözleşmeyi yalnız tip olarak ithal eder.
const ACIK: readonly Emir['durum'][] = ['planli', 'basladi'];

// Sarf ve üretim girişi açık bir emre bağlanır; kimlik elle yazılmaz, emir no ve parçayla seçilir (#680).
export function EmirSecici({ deger, degistir, ipucu, zorunlu = false, suzgec }: {
  deger: string; degistir: (v: string) => void; ipucu?: string; zorunlu?: boolean; suzgec?: (e: Emir) => boolean;
}) {
  const e = useQuery({ queryKey: [...anahtarlar.hepsi, 'acik-emirler'], queryFn: () => api.get<EmirlerCevabi>('/uretim-emirleri') });
  const acik = (e.data?.emirler ?? []).filter((x) => ACIK.includes(x.durum) && (suzgec?.(x) ?? true));
  const not = e.isError ? 'Emirler alınamadı.' : e.isPending ? 'Emirler yükleniyor…' : acik.length === 0 ? 'Açık üretim emri yok.' : ipucu;
  return (
    <Secim etiket="Üretim emri" value={deger} onChange={(x) => degistir(x.target.value)} bosSecenek={zorunlu ? 'Seçin' : 'Emre bağlama'} required={zorunlu}
      secenekler={acik.map((x) => ({ deger: String(x.id), baslik: `${x.emirNo} · ${x.parcaNo} ${x.parcaAd} · ${x.adet} adet` }))} {...(not ? { ipucu: not } : {})} />
  );
}

type OkutmaDurumu = { tur: 'secildi'; emirNo: string; deger: string } | { tur: 'hata'; ileti: string; deger: string };

// Emir etiketi ortak okuyucuyla okutulur (kamera, el okuyucu, ABD klavye ayracı düzeltmesi, tablet odağı): kimlik biçimi (UE:4512) doğrudan,
// numara biçimi (UE-004512) açık emir listesinden eşlenir. Okutulamazsa liste yedek kalır. Sonuç yalnız emir hâlâ o iken gösterilir:
// listeden başka emir seçilince ya da temizlenince okutma ipucu eskimez.
export function EmirOkutSecici({ deger, degistir, etiketAd = 'Emir etiketini okutun' }: { deger: string; degistir: (v: string) => void; etiketAd?: string }) {
  const [durum, setDurum] = useState<OkutmaDurumu | null>(null);
  const e = useQuery({ queryKey: [...anahtarlar.hepsi, 'acik-emirler'], queryFn: () => api.get<EmirlerCevabi>('/uretim-emirleri') });
  const coz = (kod: string) => {
    const t = kodTuru(kod);
    if (t.tur !== 'uretim-emri') { setDurum({ tur: 'hata', ileti: 'Bu kod bir üretim emri etiketi değil. Aşağıdan seçin.', deger }); return; }
    const acik = (e.data?.emirler ?? []).filter((x) => ACIK.includes(x.durum));
    const bulunan = acik.find((x) => (t.bicim === 'kimlik' ? String(x.id) === t.deger : x.emirNo.toUpperCase() === t.deger));
    if (!bulunan) { setDurum({ tur: 'hata', ileti: e.data ? 'Bu emir açık emirler arasında yok. Aşağıdan seçin.' : 'Emirler yüklenemedi; aşağıdan seçin.', deger }); return; }
    degistir(String(bulunan.id));
    setDurum({ tur: 'secildi', emirNo: bulunan.emirNo, deger: String(bulunan.id) });
  };
  const gecerli = durum !== null && durum.deger === deger ? durum : null;
  return (
    <>
      <p className="tc-stok-not"><strong>{etiketAd}</strong></p>
      <KodOkuyucu sik dokunmatikteOdakYok okundu={coz}
        ipucu={gecerli?.tur === 'secildi' ? `Emir seçildi: ${gecerli.emirNo}` : 'Emrin etiketindeki kodu okutun; okutamazsanız aşağıdan seçin.'} />
      {gecerli?.tur === 'hata' && <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">{gecerli.ileti}</p>}
      <EmirSecici deger={deger} degistir={degistir} zorunlu />
    </>
  );
}

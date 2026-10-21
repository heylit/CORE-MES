import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CagriEkibi, DurusNedeni, DurusNedeniGuncelleGovdesi, DurusNedeniOlusturGovdesi, HurdaNedeni,
  HurdaNedeniGuncelleGovdesi, HurdaNedeniOlusturGovdesi, Kategori,
} from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { Dugme, Girdi, IsaretKutusu, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { SIMGELER, type SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SIMGE_ADLARI } from './simge-adlari.ts';

export const EKIP_ADLARI: Record<CagriEkibi, string> = { bakim: 'Bakım', kalite: 'Kalite', malzeme: 'Malzeme', amir: 'Amir', ayarci: 'Ayarcı' };
export const KATEGORI_ADLARI: Record<Kategori, string> = { plansiz: 'Plansız', planli: 'Planlı' };

const EKIPLER = (Object.keys(EKIP_ADLARI) as CagriEkibi[]).map((deger) => ({ deger, baslik: EKIP_ADLARI[deger] }));
const KATEGORILER = (Object.keys(KATEGORI_ADLARI) as Kategori[]).map((deger) => ({ deger, baslik: KATEGORI_ADLARI[deger] }));
const SIMGE_SECENEKLERI = (Object.keys(SIMGELER) as SimgeAdi[])
  .map((deger) => ({ deger, baslik: SIMGE_ADLARI[deger] }))
  .sort((a, b) => a.baslik.localeCompare(b.baslik, 'tr'));

interface Ortak<N> {
  neden: N | null;
  onerilenKod: string;
  kapat: () => void;
}

function useKaydet<G, N>(yol: string, anahtar: readonly string[], kapat: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: (govde: G) => api.post<N>(yol, govde),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtar });
      bildir('tamam', 'Kaydedildi');
      kapat();
    },
  });
}

function FormAltlik({ formKimligi, kapat, bekliyor }: { formKimligi: string; kapat: () => void; bekliyor: boolean }) {
  return (
    <>
      <Dugme onClick={kapat}>Vazgeç</Dugme>
      <Dugme tur="birincil" type="submit" form={formKimligi} yukleniyor={bekliyor}>Kaydet</Dugme>
    </>
  );
}

export function DurusNedeniFormu({ neden, onerilenKod, kapat }: Ortak<DurusNedeni>) {
  const [kod, kodYaz] = useState(neden?.kod ?? onerilenKod);
  const [ad, adYaz] = useState(neden?.ad ?? '');
  const [simge, simgeYaz] = useState(neden?.simge ?? '');
  const [kategori, kategoriYaz] = useState<Kategori>(neden?.kategori ?? 'plansiz');
  const [ekip, ekipYaz] = useState<string>(neden?.cagriEkibi ?? '');
  const [gecikme, gecikmeYaz] = useState(neden?.cagriGecikmeDk === null || neden === null ? '' : String(neden.cagriGecikmeDk));
  const [aktif, aktifYaz] = useState(neden?.aktif ?? true);
  const yol = neden === null ? '/durus-nedenleri' : `/durus-nedenleri/${neden.id}/guncelle`;
  const kaydet = useKaydet<DurusNedeniOlusturGovdesi | DurusNedeniGuncelleGovdesi, DurusNedeni>(yol, anahtarlar.durus, kapat);
  const planli = kategori === 'planli';

  // Kapalı kutuda eski sayı durursa ekip yeniden seçildiğinde fark edilmeden geri gelir.
  const ekipSec = (yeni: string) => {
    ekipYaz(yeni);
    if (yeni === '') gecikmeYaz('');
  };

  // Planlıda çağrı alanları gizlenir; değerleri durursa plansıza dönünce fark edilmeden geri gelir.
  const kategoriSec = (yeni: Kategori) => {
    kategoriYaz(yeni);
    if (yeni === 'planli') { ekipYaz(''); gecikmeYaz(''); }
  };

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    // Sunucu çağrı ekibi ile gecikmenin yalnız biri dolu gelmesini reddeder; planlıda ikisi de null gider.
    const cagriYok = planli || ekip === '';
    const govde = {
      kod, ad, simge: simge === '' ? null : simge, kategori,
      cagriEkibi: cagriYok ? null : (ekip as CagriEkibi),
      cagriGecikmeDk: cagriYok || gecikme === '' ? null : Number(gecikme),
    };
    kaydet.mutate(neden === null ? govde : { ...govde, aktif, surum: neden.surum });
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={neden === null ? 'Yeni duruş nedeni' : 'Duruş nedenini düzenle'}
      alt={<FormAltlik formKimligi="durus-formu" kapat={kapat} bekliyor={kaydet.isPending} />}
    >
      <form id="durus-formu" className="tc-form" onSubmit={gonder}>
        <Girdi etiket="Kod" required maxLength={12} value={kod} onChange={(o) => kodYaz(o.target.value)} ipucu="Büyük harf, rakam ve tire; en çok 12 karakter." />
        <Girdi etiket="Ad" required maxLength={80} value={ad} onChange={(o) => adYaz(o.target.value)} />
        <Secim etiket="Kategori" secenekler={KATEGORILER} value={kategori} onChange={(o) => kategoriSec(o.target.value as Kategori)} />
        <Secim etiket="Simge" secenekler={SIMGE_SECENEKLERI} bosSecenek="Yok" value={simge} onChange={(o) => simgeYaz(o.target.value)} />
        {!planli && (
          <>
            <Secim etiket="Çağrı ekibi" secenekler={EKIPLER} bosSecenek="Çağrı yok" value={ekip} onChange={(o) => ekipSec(o.target.value)} />
            <Girdi
              etiket="Çağrı gecikmesi (dk)" type="number" min={0} max={1440} inputMode="numeric"
              value={gecikme} onChange={(o) => gecikmeYaz(o.target.value)} disabled={ekip === ''}
              ipucu="Ekip seçilince girilir."
            />
          </>
        )}
        {neden !== null && (
          <div className="tc-form-tam"><IsaretKutusu etiket="Aktif (operatör listesinde görünür)" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} /></div>
        )}
        {kaydet.isError && <p className="tc-form-tam" role="alert">{hataIletisi(kaydet.error, 'Kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}

export function HurdaNedeniFormu({ neden, onerilenKod, kapat }: Ortak<HurdaNedeni>) {
  const [kod, kodYaz] = useState(neden?.kod ?? onerilenKod);
  const [ad, adYaz] = useState(neden?.ad ?? '');
  const [aktif, aktifYaz] = useState(neden?.aktif ?? true);
  const yol = neden === null ? '/hurda-nedenleri' : `/hurda-nedenleri/${neden.id}/guncelle`;
  const kaydet = useKaydet<HurdaNedeniOlusturGovdesi | HurdaNedeniGuncelleGovdesi, HurdaNedeni>(yol, anahtarlar.hurda, kapat);

  const gonder = (o: FormEvent) => {
    o.preventDefault();
    kaydet.mutate(neden === null ? { kod, ad } : { kod, ad, aktif, surum: neden.surum });
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={neden === null ? 'Yeni hurda nedeni' : 'Hurda nedenini düzenle'}
      alt={<FormAltlik formKimligi="hurda-formu" kapat={kapat} bekliyor={kaydet.isPending} />}
    >
      <form id="hurda-formu" className="tc-form" onSubmit={gonder}>
        <Girdi etiket="Kod" required maxLength={12} value={kod} onChange={(o) => kodYaz(o.target.value)} ipucu="Büyük harf, rakam ve tire; en çok 12 karakter." />
        <Girdi etiket="Ad" required maxLength={80} value={ad} onChange={(o) => adYaz(o.target.value)} />
        {neden !== null && (
          <div className="tc-form-tam"><IsaretKutusu etiket="Aktif (operatör listesinde görünür)" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} /></div>
        )}
        {kaydet.isError && <p className="tc-form-tam" role="alert">{hataIletisi(kaydet.error, 'Kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}

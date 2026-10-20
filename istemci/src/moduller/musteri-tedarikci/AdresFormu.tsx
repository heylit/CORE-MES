import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Adres, AdresEkleGovdesi, AdresGuncelleGovdesi, AdresTuru, FirmaAyrintiCevabi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Girdi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { FormPenceresi } from './FormPenceresi.tsx';
import { KonumGirisi } from './KonumGirisi.tsx';
import { ADRES_TURU_SECENEKLERI, adresTuruMu } from './gorunum.ts';
import { koordinatiDenetle } from './koordinat.ts';
import { cevabiYaz, eskiyseYenile, useKorumaliEkleme } from './yazma.ts';

interface Degerler {
  tur: AdresTuru;
  ad: string;
  adres: string;
  ilce: string;
  il: string;
  postaKodu: string;
  enlem: string;
  boylam: string;
}

const metin = (d: string | null | undefined): string => d ?? '';
const bosYap = (m: string): string | null => (m.trim() === '' ? null : m.trim());

function dogrula(d: Degerler): AlanHatalari {
  const hata: AlanHatalari = {};
  if (d.ad.trim() === '') hata['ad'] = 'Adresin adı boş olamaz.';
  const k = koordinatiDenetle(d.enlem, d.boylam);
  if (k.enlem) hata['enlem'] = k.enlem;
  if (k.boylam) hata['boylam'] = k.boylam;
  return hata;
}

interface Ozellikler {
  firmaId: number;
  // Adres yazması kartın sürümünü artırır ve karttaki sürüme bağlıdır.
  kartSurumu: number;
  // null: yeni adres.
  adres: Adres | null;
  kapat: () => void;
}

export function AdresFormu({ firmaId, kartSurumu, adres, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  const [acilisSurumu] = useState(kartSurumu);

  const form = useForm<Degerler, FirmaAyrintiCevabi>({
    ilk: {
      tur: adres?.tur ?? 'teslim',
      ad: metin(adres?.ad),
      adres: metin(adres?.adres),
      ilce: metin(adres?.ilce),
      il: metin(adres?.il),
      postaKodu: metin(adres?.postaKodu),
      enlem: adres?.enlem == null ? '' : String(adres.enlem),
      boylam: adres?.boylam == null ? '' : String(adres.boylam),
    },
    dogrula,
    hataIletisi: 'Adres kaydedilemedi.',
    kaydet: (d) => {
      const k = koordinatiDenetle(d.enlem, d.boylam);
      const govde = {
        tur: d.tur,
        ad: d.ad.trim(),
        adres: bosYap(d.adres),
        ilce: bosYap(d.ilce),
        il: bosYap(d.il),
        postaKodu: bosYap(d.postaKodu),
        enlem: k.deger?.enlem ?? null,
        boylam: k.deger?.boylam ?? null,
        surum: acilisSurumu,
      };
      const yol = `/musteri-tedarikci/firmalar/${firmaId}/adresler`;
      if (adres === null) return ekle<FirmaAyrintiCevabi>(`${yol}/ekle`, govde satisfies AdresEkleGovdesi);
      return api.post<FirmaAyrintiCevabi>(`${yol}/${adres.id}/guncelle`, govde satisfies AdresGuncelleGovdesi);
    },
    basarili: (cevap) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', adres === null ? 'Adres eklendi.' : 'Adres güncellendi.');
      kapat();
    },
    hatada: (hata) => eskiyseYenile(istemci, firmaId, hata),
  });

  const d = form.degerler;
  return (
    <FormPenceresi baslik={adres === null ? 'Adres ekle' : `Düzenle: ${adres.ad}`} kimlik="tc-mt-adres-form" kapat={kapat} form={form}>
      <div className="tc-mt-ikili">
        <Secim
          etiket="Adres türü"
          secenekler={ADRES_TURU_SECENEKLERI}
          value={d.tur}
          onChange={(o) => { if (adresTuruMu(o.target.value)) form.degistir({ tur: o.target.value }); }}
        />
        <Girdi etiket="Ad" required autoComplete="off" {...form.alan('ad')} />
      </div>
      <Girdi etiket="Adres" autoComplete="off" {...form.alan('adres')} />
      <div className="tc-mt-uclu">
        <Girdi etiket="İlçe" autoComplete="off" {...form.alan('ilce')} />
        <Girdi etiket="İl" autoComplete="off" {...form.alan('il')} />
        <Girdi etiket="Posta kodu" autoComplete="off" {...form.alan('postaKodu')} />
      </div>
      <KonumGirisi
        enlem={d.enlem}
        boylam={d.boylam}
        degistir={form.degistir}
        enlemHata={form.hata('enlem')}
        boylamHata={form.hata('boylam')}
      />
    </FormPenceresi>
  );
}

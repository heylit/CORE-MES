import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Firma, FirmaCevabi, FirmaEkleGovdesi, FirmaGuncelleGovdesi, FirmaTuru, MusteriSinifi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Girdi, IsaretKutusu, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { FormPenceresi } from './FormPenceresi.tsx';
import { KonumGirisi } from './KonumGirisi.tsx';
import { SINIF_SECENEKLERI, TUR_SECENEKLERI, sinifMi, turMu } from './gorunum.ts';
import { koordinatiDenetle } from './koordinat.ts';
import { cevabiYaz, eskiyseYenile, useKorumaliEkleme } from './yazma.ts';

interface Degerler {
  kod: string;
  ad: string;
  tur: FirmaTuru;
  musteriSinifi: MusteriSinifi | '';
  fason: boolean;
  ulkeKodu: string;
  vergiNo: string;
  vergiDairesi: string;
  paraBirimi: string;
  vadeGunu: string;
  telefon: string;
  ePosta: string;
  adres: string;
  ilce: string;
  il: string;
  postaKodu: string;
  enlem: string;
  boylam: string;
}

const metin = (d: string | null): string => d ?? '';
const bosYap = (m: string): string | null => (m.trim() === '' ? null : m.trim());

function ilkDegerler(firma: Firma | null, varsayilanTur: FirmaTuru, varsayilanFason: boolean): Degerler {
  return {
    kod: metin(firma?.kod ?? null),
    ad: firma?.ad ?? '',
    tur: firma?.tur ?? varsayilanTur,
    musteriSinifi: firma?.musteriSinifi ?? '',
    fason: firma?.fason ?? varsayilanFason,
    ulkeKodu: firma?.ulkeKodu ?? 'TR',
    vergiNo: metin(firma?.vergiNo ?? null),
    vergiDairesi: metin(firma?.vergiDairesi ?? null),
    paraBirimi: firma?.paraBirimi ?? 'TRY',
    vadeGunu: firma?.vadeGunu == null ? '' : String(firma.vadeGunu),
    telefon: metin(firma?.telefon ?? null),
    ePosta: metin(firma?.ePosta ?? null),
    adres: metin(firma?.adres ?? null),
    ilce: metin(firma?.ilce ?? null),
    il: metin(firma?.il ?? null),
    postaKodu: metin(firma?.postaKodu ?? null),
    enlem: firma?.enlem == null ? '' : String(firma.enlem),
    boylam: firma?.boylam == null ? '' : String(firma.boylam),
  };
}

function dogrula(d: Degerler): AlanHatalari {
  const hata: AlanHatalari = {};
  if (d.ad.trim() === '') hata['ad'] = 'Firma adı boş olamaz.';
  if (!/^[A-Za-z]{2}$/.test(d.ulkeKodu.trim())) hata['ulkeKodu'] = 'Ülke kodu iki harftir (TR gibi).';
  if (!/^[A-Za-z]{3}$/.test(d.paraBirimi.trim())) hata['paraBirimi'] = 'Para birimi üç harfli koddur (TRY gibi).';
  const vade = d.vadeGunu.trim();
  if (vade !== '' && (!/^\d+$/.test(vade) || Number(vade) > 365)) hata['vadeGunu'] = 'Vade günü 0 ile 365 arasındadır.';
  const eposta = d.ePosta.trim();
  if (eposta !== '' && !/^[^@\s]+@[^@\s]+$/.test(eposta)) hata['ePosta'] = 'E-posta biçimi geçersiz.';
  const k = koordinatiDenetle(d.enlem, d.boylam);
  if (k.enlem) hata['enlem'] = k.enlem;
  if (k.boylam) hata['boylam'] = k.boylam;
  return hata;
}

interface Ozellikler {
  // null: yeni firma.
  firma: Firma | null;
  // Yeni firmada menüden gelen tür öneri olarak seçili başlar.
  varsayilanTur?: FirmaTuru;
  varsayilanFason?: boolean;
  kapat: () => void;
  kaydedildi: (firma: Firma) => void;
}

export function FirmaFormu({ firma, varsayilanTur = 'musteri', varsayilanFason = false, kapat, kaydedildi }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  // Form açıldığındaki sürüm: sonradan yenilenen kart, başkasının değişikliğini görmeden ezmesin.
  const [acilisSurumu] = useState(firma?.surum ?? null);

  const form = useForm<Degerler, FirmaCevabi>({
    ilk: ilkDegerler(firma, varsayilanTur, varsayilanFason),
    dogrula,
    hataIletisi: 'Firma kaydedilemedi.',
    kaydet: (d) => {
      const k = koordinatiDenetle(d.enlem, d.boylam);
      const govde = {
        kod: bosYap(d.kod),
        ad: d.ad.trim(),
        tur: d.tur,
        fason: d.fason,
        ulkeKodu: d.ulkeKodu.trim().toUpperCase(),
        vergiNo: bosYap(d.vergiNo),
        vergiDairesi: bosYap(d.vergiDairesi),
        paraBirimi: d.paraBirimi.trim().toUpperCase(),
        vadeGunu: d.vadeGunu.trim() === '' ? null : Number(d.vadeGunu),
        adres: bosYap(d.adres),
        ilce: bosYap(d.ilce),
        il: bosYap(d.il),
        postaKodu: bosYap(d.postaKodu),
        enlem: k.deger?.enlem ?? null,
        boylam: k.deger?.boylam ?? null,
        telefon: bosYap(d.telefon),
        ePosta: bosYap(d.ePosta),
        // Logo alanını ekran yazmaz; kart olduğu gibi geri gönderilir ki güncelleme onu silmesin.
        logoCariKodu: firma?.logoCariKodu ?? null,
        // Tedarikçide plan bedeli yoktur; sınıf boş gider.
        musteriSinifi: d.tur === 'tedarikci' || d.musteriSinifi === '' ? null : d.musteriSinifi,
      } satisfies FirmaEkleGovdesi;
      if (firma === null || acilisSurumu === null) return ekle<FirmaCevabi>('/musteri-tedarikci/firmalar/ekle', govde);
      return api.post<FirmaCevabi>(
        `/musteri-tedarikci/firmalar/${firma.id}/guncelle`,
        { ...govde, surum: acilisSurumu } satisfies FirmaGuncelleGovdesi,
      );
    },
    basarili: (cevap) => {
      cevabiYaz(istemci, cevap);
      bildir('tamam', firma === null ? 'Firma eklendi.' : 'Firma güncellendi.');
      kaydedildi(cevap.firma);
    },
    hatada: (hata) => { if (firma !== null) eskiyseYenile(istemci, firma.id, hata); },
  });

  const d = form.degerler;
  return (
    <FormPenceresi baslik={firma === null ? 'Yeni firma' : `Düzenle: ${firma.ad}`} kimlik="tc-mt-firma-form" kapat={kapat} form={form}>
      <section className="tc-mt-bolum" aria-label="Firma kartı">
        <div className="tc-mt-ikili">
          <Girdi etiket="Kod" autoComplete="off" {...form.alan('kod')} />
          <Secim
            etiket="Tür"
            secenekler={TUR_SECENEKLERI}
            value={d.tur}
            onChange={(o) => { if (turMu(o.target.value)) form.degistir({ tur: o.target.value }); }}
          />
        </div>
        <Girdi etiket="Ad" required autoComplete="off" {...form.alan('ad')} />
        {d.tur !== 'tedarikci' && (
          <Secim
            etiket="Müşteri sınıfı"
            ipucu="Plan bedeli sınıfın çarpanıyla çarpılır; sınıfsız müşteri 1 sayılır."
            secenekler={SINIF_SECENEKLERI}
            bosSecenek="Sınıfsız"
            value={d.musteriSinifi}
            onChange={(o) => { const s = o.target.value; form.degistir({ musteriSinifi: sinifMi(s) ? s : '' }); }}
          />
        )}
        <IsaretKutusu etiket="Fason firma" checked={d.fason} onChange={(o) => form.degistir({ fason: o.target.checked })} />
        <div className="tc-mt-ikili">
          <Girdi etiket="Vergi no" autoComplete="off" {...form.alan('vergiNo')} />
          <Girdi etiket="Vergi dairesi" autoComplete="off" {...form.alan('vergiDairesi')} />
        </div>
        <div className="tc-mt-uclu">
          <Girdi etiket="Ülke kodu" maxLength={2} autoComplete="off" {...form.alan('ulkeKodu')} />
          <Girdi etiket="Para birimi" maxLength={3} autoComplete="off" {...form.alan('paraBirimi')} />
          <Girdi etiket="Vade günü" inputMode="numeric" autoComplete="off" {...form.alan('vadeGunu')} />
        </div>
        <div className="tc-mt-ikili">
          <Girdi etiket="Telefon" type="tel" autoComplete="off" {...form.alan('telefon')} />
          <Girdi etiket="E-posta" type="email" autoComplete="off" {...form.alan('ePosta')} />
        </div>
      </section>
      <section className="tc-mt-bolum" aria-label="Merkez adresi">
        <h3 className="tc-mt-bolum-baslik">Merkez adresi</h3>
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
      </section>
    </FormPenceresi>
  );
}

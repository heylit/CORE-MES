import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Firma, FirmaCevabi, FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, FormPenceresi, Girdi, IsaretKutusu, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { FIRMA_TUR_ADI } from './kurallar.ts';

// Firma kartı formu (prototipte "Yeni firma" / "Firmayı düzenle" çekmecesi). Kart musteri-tedarikci'nindir (#1164); form
// finansta kalır (203 a, T9 istisnası) ve onun uçlarına yazar. Logo'ya gönderilmiş kartta kod ve Logo cari kodu değişmez.

// Sözleşmenin tür listesi değer olarak ithal edilmez (istemci paylaşılanı yalnız tip olarak alır); sıra sözleşmedekidir.
const FIRMA_TURLERI = ['musteri', 'tedarikci', 'ikisi'] as const satisfies readonly FirmaTuru[];

const METIN_ALANLARI = [
  ['kod', 'Kod', 40], ['ad', 'Ad', 200], ['ulkeKodu', 'Ülke kodu', 2], ['vergiNo', 'Vergi no', 30], ['vergiDairesi', 'Vergi dairesi', 100],
  ['paraBirimi', 'Varsayılan para birimi', 3], ['vadeGunu', 'Varsayılan vade (gün)', 3], ['adres', 'Adres', 500], ['ilce', 'İlçe', 100], ['il', 'İl', 100],
  ['postaKodu', 'Posta kodu', 20], ['telefon', 'Telefon', 40], ['ePosta', 'E-posta', 200], ['logoCariKodu', 'Logo cari kodu', 40],
] as const;
type MetinAdi = (typeof METIN_ALANLARI)[number][0];
export type FirmaDegerleri = Record<MetinAdi, string> & { tur: FirmaTuru; fason: boolean };

const metin = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : String(v));
export function firmaIlkDegerleri(f: Firma | null): FirmaDegerleri {
  const d = { tur: f?.tur ?? 'musteri', fason: f?.fason ?? false } as FirmaDegerleri;
  for (const [ad] of METIN_ALANLARI) d[ad] = metin(f ? f[ad] : ad === 'ulkeKodu' ? 'TR' : ad === 'paraBirimi' ? 'TRY' : null);
  return d;
}
export const logoKilitli = (f: Firma | null): boolean => !!f?.logoKayitNo;

// Gönderilen gövde prototipteki gibidir: kilitli alan kartın kendi değeriyle gider.
export function firmaGovdesi(d: FirmaDegerleri, f: Firma | null): Record<string, unknown> {
  const kilit = logoKilitli(f);
  const govde: Record<string, unknown> = { tur: d.tur, fason: d.fason };
  for (const [ad] of METIN_ALANLARI) {
    if (kilit && (ad === 'kod' || ad === 'logoCariKodu')) { govde[ad] = f![ad]; continue; }
    govde[ad] = ad === 'vadeGunu' ? (d.vadeGunu.trim() === '' ? null : Number(d.vadeGunu)) : d[ad];
  }
  return govde;
}

export function FirmaFormu({ firma, kapat, kaydedildi, yenile }: {
  firma: Firma | null;
  kapat: () => void;
  kaydedildi: (f: Firma) => void;
  yenile?: () => Promise<Firma | null>;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // Sürüm çakışmasında kart kendiliğinden yeniden okunur ve form yeni kayıtla açılır (prototipteki gibi); ileti formda kalır.
  const [yenilendi, yenilendiYaz] = useState(false);
  // Kimlik pencere açılırken üretilir: aynı pencereden yeniden gönderim ikinci firma açmaz; reddedilen istekte de yenilenmez.
  const [istekKimligi] = useState(yeniIstekKimligi);
  const form = useForm<FirmaDegerleri, FirmaCevabi>({
    ilk: firmaIlkDegerleri(firma),
    hataIletisi: 'Firma kaydedilemedi.',
    dogrula: (d): Record<string, string> => (d.ad.trim() ? {} : { ad: 'Firma adı boş olamaz.' }),
    kaydet: async (d) => {
      const govde = firmaGovdesi(d, firma);
      const cevap = firma
        ? await api.post<FirmaCevabi>(`/musteri-tedarikci/firmalar/${firma.id}/guncelle`, { ...govde, surum: firma.surum })
        : await tekrarKorumaliGonder(
          (deneme) => api.post<FirmaCevabi>('/musteri-tedarikci/firmalar/ekle', govde, { istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}) }),
          { istekKimligi },
        );
      await istemci.invalidateQueries({ queryKey: ['finans'] });
      return cevap;
    },
    basarili: (c) => { bildir('tamam', firma ? 'Firma güncellendi.' : 'Firma açıldı.'); kaydedildi(c.firma); },
    hatada: (h) => {
      if (!(h instanceof ApiHatasi) || h.govde.kod !== 'CAKISMA' || h.govde.alan || !yenile) return;
      void yenile().then((f) => { if (f) { form.sifirla(firmaIlkDegerleri(f)); yenilendiYaz(true); } });
    },
  });
  const kilit = logoKilitli(firma);
  const d = form.degerler;

  return (
    <FormPenceresi acik kapat={kapat} baslik={firma ? 'Firmayı düzenle' : 'Yeni firma'} form={form}>
      <div className="tc-fk-form">
        {yenilendi && form.genelHata === null && (
          <p className="tc-fk-not" data-ton="risk" role="alert">Bu kart siz düzenlerken başka biri tarafından değiştirildi. Kart yenilendi; değişikliğinizi yeniden girin.</p>
        )}
        <div className="tc-fk-cipler" role="radiogroup" aria-label="Tür">
          {FIRMA_TURLERI.map((t) => (
            <Dugme key={t} role="radio" aria-checked={d.tur === t} aria-pressed={d.tur === t} onClick={() => form.degistir({ tur: t })}>{FIRMA_TUR_ADI[t]}</Dugme>
          ))}
        </div>
        <IsaretKutusu etiket="Fason firma (dışarıda iş yaptırılan tedarikçi)" checked={d.fason} onChange={(o) => form.degistir({ fason: o.target.checked })} />
        {METIN_ALANLARI.map(([ad, etiket, uzunluk]) => (
          <Girdi
            key={ad} etiket={etiket} required={ad === 'ad'} autoComplete="off"
            {...(ad === 'vadeGunu' ? { type: 'number', min: 0, max: 365, step: 1, inputMode: 'numeric' as const } : { maxLength: uzunluk })}
            disabled={kilit && (ad === 'kod' || ad === 'logoCariKodu')}
            {...form.alan(ad)}
          />
        ))}
        {kilit && <p className="tc-fk-not">Logo'ya gönderildiği için kod ve Logo cari kodu değiştirilemez.</p>}
      </div>
    </FormPenceresi>
  );
}

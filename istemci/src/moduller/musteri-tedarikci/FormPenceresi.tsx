import type { ReactNode } from 'react';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import type { FormDurumu } from '../../ortak/veri/form.ts';
import { ESKI_SURUM_ILETISI } from './yazma.ts';

interface Ozellikler {
  baslik: string;
  kimlik: string;
  kapat: () => void;
  form: Pick<FormDurumu<object>, 'gonder' | 'gonderiliyor' | 'genelHata' | 'eskiSurum'>;
  children: ReactNode;
}

// Firma ve adres formlarının ortak çerçevesi: Kaydet / Vazgeç ve genel hata (sürüm çakışması dahil).
export function FormPenceresi({ baslik, kimlik, kapat, form, children }: Ozellikler) {
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={baslik}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={form.gonderiliyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={form.gonderiliyor}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-mt-form" onSubmit={form.gonder} noValidate>
        {form.genelHata !== null && (
          <p className="tc-mt-hata" role="alert">{form.eskiSurum ? ESKI_SURUM_ILETISI : form.genelHata}</p>
        )}
        {children}
      </form>
    </Pencere>
  );
}

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { FormDurumu } from '../veri/form.ts';
import { Dugme } from './Dugme.tsx';
import { OnayPenceresi } from './OnayPenceresi.tsx';
import { Pencere } from './Pencere.tsx';
import './form-penceresi.css';

interface Ozellikler<D extends object> {
  acik: boolean;
  kapat: () => void;
  baslik: string;
  form: FormDurumu<D>;
  kaydetMetni?: string;
  // Kayıt başkasınca değişince (sürüm çakışması) gösterilen "Kaydı yenile" düğmesinin işi: ekran kaydı yeniden okur ve
  // `form.sifirla(yeni)` çağırır. Verilmezse düğme çizilmez, ileti kalır.
  yenile?: () => void;
  // Verilmezse form, pencere açıldığındaki değerleriyle karşılaştırılır.
  kirli?: boolean;
  children: ReactNode;
}

const ayni = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Yan pencerede form: Kaydet ve Vazgeç altta, sunucu hatası üstte. Kaydedilmemiş değişiklik varken kapatma
// (Vazgeç, Esc, kapatma düğmesi, perde) önce sorar; gönderim sürerken pencere kapanmaz.
export function FormPenceresi<D extends object>({
  acik, kapat, baslik, form, kaydetMetni = 'Kaydet', yenile, kirli, children,
}: Ozellikler<D>) {
  const kimlik = useId();
  const [acilis, acilisYaz] = useState<D | null>(null);
  const [soruyor, soruyorYaz] = useState(false);

  // Açılıştaki değer, pencere her açıldığında yeniden alınır; ekran açmadan önce `form.sifirla(kayit)` çağırmış olabilir.
  useEffect(() => {
    if (acik) acilisYaz(form.degerler);
    else { acilisYaz(null); soruyorYaz(false); }
  // Yalnız açılış anı okunur; sonraki değişiklik kirliliği belirler.
  }, [acik]);

  const degisti = kirli ?? (acilis !== null && !ayni(acilis, form.degerler));
  const kapatmayiIste = () => {
    if (form.gonderiliyor) return;
    if (degisti) soruyorYaz(true);
    else kapat();
  };

  return (
    <>
      <Pencere
        acik={acik} kapat={kapatmayiIste} baslik={baslik} tur="yan"
        alt={(
          <>
            <Dugme onClick={kapatmayiIste} disabled={form.gonderiliyor}>Vazgeç</Dugme>
            <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={form.gonderiliyor}>{kaydetMetni}</Dugme>
          </>
        )}
      >
        {form.genelHata !== null && (
          <div className="tc-fpencere-hata" role="alert">
            <p>{form.genelHata}</p>
            {form.eskiSurum && yenile && <Dugme simge="rotate" onClick={yenile}>Kaydı yenile</Dugme>}
          </div>
        )}
        <form id={kimlik} className="tc-fpencere-form" aria-label={baslik} noValidate onSubmit={form.gonder}>
          {children}
        </form>
      </Pencere>
      <OnayPenceresi
        acik={acik && soruyor} baslik="Kaydedilmemiş değişiklikler" onayMetni="Kaydetmeden çık" tehlikeli
        onayla={() => { soruyorYaz(false); kapat(); }} vazgec={() => { soruyorYaz(false); }}
      >
        <p>Yaptığınız değişiklikler kaydedilmedi. Çıkarsanız silinir.</p>
      </OnayPenceresi>
    </>
  );
}

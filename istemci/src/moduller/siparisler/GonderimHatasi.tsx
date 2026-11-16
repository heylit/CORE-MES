import type { FormDurumu } from '../../ortak/veri/form.ts';
import { ESKI_SURUM_ILETISI } from './yazma.ts';

// Gönderim düğmesinin hemen üstünde: uzun formda alan hatası ekranın dışında kalabilir, ya da sunucunun bağladığı alan o kipte çizilmiyor
// olabilir (planlı sürümde termin tarihi). İletiler burada da yazılır; ilk hatalı alana ayrıca gidilir (useHataOdagi).
// etiket: alan yolundan kalemin adı (aynı ileti birden çok kalemde çıkınca hangisi olduğu okunur); null ise ileti yalın yazılır.
export function GonderimHatasi<D extends object>({ form, etiket }: { form: FormDurumu<D>; etiket?: (yol: string) => string | null }) {
  const iletiler = [...new Set(Object.entries(form.hatalar).map(([yol, ileti]) => {
    const ad = etiket?.(yol) ?? null;
    return ad === null ? ileti : `${ad}: ${ileti}`;
  }))];
  if (form.genelHata === null && iletiler.length === 0) return null;
  return (
    <div className="tc-sp-hata" role="alert">
      {form.genelHata !== null && <p>{form.eskiSurum ? ESKI_SURUM_ILETISI : form.genelHata}</p>}
      {iletiler.length > 0 && (
        <>
          <p>{`Kaydedilmedi: ${String(Object.keys(form.hatalar).length)} alanda eksik ya da hatalı değer var.`}</p>
          <ul>{iletiler.map((i) => <li key={i}>{i}</li>)}</ul>
        </>
      )}
    </div>
  );
}

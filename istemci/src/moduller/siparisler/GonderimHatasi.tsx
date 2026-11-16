import type { FormDurumu } from '../../ortak/veri/form.ts';
import { ESKI_SURUM_ILETISI } from './yazma.ts';

// Gönderim düğmesinin hemen üstünde: uzun formda alan hatası ekranın dışında kalabilir, ya da sunucunun bağladığı alan o kipte çizilmiyor
// olabilir (planlı sürümde termin tarihi). İletiler burada da yazılır; ilk hatalı alana ayrıca gidilir (useHataOdagi).
export function GonderimHatasi<D extends object>({ form }: { form: FormDurumu<D> }) {
  const iletiler = [...new Set(Object.values(form.hatalar))];
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

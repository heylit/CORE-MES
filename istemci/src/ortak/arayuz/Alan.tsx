import {
  useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import './alan.css';

interface AlanOzellikleri {
  etiket: string;
  ipucu?: string;
  hata?: string;
}

interface Baglanti {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

// Etiket, ipucu ve hata tek yerde bağlanır: ekran okuyucu hatayı alanla birlikte okur.
function Alan({ etiket, ipucu, hata, zorunlu, children }: AlanOzellikleri & {
  zorunlu?: boolean;
  children: (baglanti: Baglanti) => ReactNode;
}) {
  const id = useId();
  const altKimlik = `${id}-alt`;
  return (
    <div className={`tc-alan${hata ? ' tc-alan-hatali' : ''}`}>
      <label className="tc-alan-etiket" htmlFor={id}>
        {etiket}
        {zorunlu && <span className="tc-alan-zorunlu" aria-hidden="true"> *</span>}
      </label>
      {children({ id, 'aria-describedby': hata || ipucu ? altKimlik : undefined, 'aria-invalid': hata ? true : undefined })}
      {(hata || ipucu) && (
        <p id={altKimlik} className="tc-alan-alt" role={hata ? 'alert' : undefined}>{hata ?? ipucu}</p>
      )}
    </div>
  );
}

export function Girdi({ etiket, ipucu, hata, className, ...geri }: AlanOzellikleri & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Alan etiket={etiket} ipucu={ipucu} hata={hata} zorunlu={geri.required}>
      {(b) => <input {...geri} {...b} className={['tc-alan-kutu', className].filter(Boolean).join(' ')} />}
    </Alan>
  );
}

export function CokSatir({ etiket, ipucu, hata, rows = 3, ...geri }: AlanOzellikleri & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Alan etiket={etiket} ipucu={ipucu} hata={hata} zorunlu={geri.required}>
      {(b) => <textarea {...geri} {...b} rows={rows} className="tc-alan-kutu tc-alan-cok" />}
    </Alan>
  );
}

export interface Secenek {
  deger: string;
  baslik: string;
}

export function Secim({
  etiket, ipucu, hata, secenekler, bosSecenek, ...geri
}: AlanOzellikleri & SelectHTMLAttributes<HTMLSelectElement> & {
  secenekler: readonly Secenek[];
  // Verilirse değeri boş olan ilk seçenek olarak gösterilir ("Seçiniz").
  bosSecenek?: string;
}) {
  return (
    <Alan etiket={etiket} ipucu={ipucu} hata={hata} zorunlu={geri.required}>
      {(b) => (
        <select {...geri} {...b} className="tc-alan-kutu">
          {bosSecenek !== undefined && <option value="">{bosSecenek}</option>}
          {secenekler.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
        </select>
      )}
    </Alan>
  );
}

export function IsaretKutusu({ etiket, ...geri }: { etiket: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className="tc-isaret">
      <input {...geri} type="checkbox" />
      <span>{etiket}</span>
    </label>
  );
}

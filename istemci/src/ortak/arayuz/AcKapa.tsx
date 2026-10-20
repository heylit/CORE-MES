import type { ButtonHTMLAttributes } from 'react';
import './ac-kapa.css';

interface Ozellikler extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'onClick' | 'onChange' | 'children'> {
  // Ekran okuyucunun okuduğu ad; görünen başlığı ekran kendi yazar.
  etiket: string;
  acik: boolean;
  degistir: (acik: boolean) => void;
}

// Durum yalnız renkle anlatılmaz: yanında yazısı da durur.
export function AcKapa({ etiket, acik, degistir, className, ...geri }: Ozellikler) {
  return (
    <button
      {...geri}
      type="button"
      role="switch"
      aria-checked={acik}
      aria-label={etiket}
      className={['tc-ackapa', className].filter(Boolean).join(' ')}
      onClick={() => degistir(!acik)}
    >
      <span className="tc-ackapa-ray" aria-hidden="true"><span className="tc-ackapa-top" /></span>
      <span className="tc-ackapa-durum">{acik ? 'Açık' : 'Kapalı'}</span>
    </button>
  );
}

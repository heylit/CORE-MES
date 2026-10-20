import { useState } from 'react';
import { Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem } from '../../ortak/rota/ust-eylemler.ts';
import { ZiyaretcilerimPenceresi } from './Ziyaretcilerim.tsx';

function ZiyaretcilerimDugmesi() {
  const [acik, acikYaz] = useState(false);
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-nz-ust-eylem" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label="Ziyaretçilerim" title="Ziyaretçilerim">
        <Simge ad="users" />
        <span className="tc-kabuk-dugme-ad" aria-hidden="true">Ziyaretçi</span>
      </button>
      {acik && <ZiyaretcilerimPenceresi kapat={() => acikYaz(false)} />}
    </>
  );
}

// Her çalışanın üst çubuğunda (217 a): yalnız oturum ister, ev sahibi sunucuda oturumdan alınır; Nizamiye sayfası açılmaz.
export const ustEylemler: readonly UstEylem[] = [
  { anahtar: 'ziyaretcilerim', sira: 80, islem: 'oturum', dugme: ZiyaretcilerimDugmesi },
];

import { useState } from 'react';
import { Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem } from '../../ortak/rota/ust-eylemler.ts';
import { GeriBildirimPenceresi } from './GeriBildirimPenceresi.tsx';
import './profil.css';

function GeriBildirimDugmesi() {
  const [acik, acikYaz] = useState(false);
  return (
    <>
      <button type="button" className="tc-kabuk-tema" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label="Şikayet, istek ve öneri" title="Şikayet, istek ve öneri">
        <Simge ad="edit" />
        <span className="tc-kabuk-dugme-ad" aria-hidden="true">Öneri</span>
      </button>
      {acik && <GeriBildirimPenceresi kapat={() => acikYaz(false)} />}
    </>
  );
}

// Her çalışanın üst çubuğunda: gönderme yalnız oturum ister, kişi sunucuda oturumdan alınır.
export const ustEylemler: readonly UstEylem[] = [{ anahtar: 'geri-bildirim', sira: 90, islem: 'oturum', dugme: GeriBildirimDugmesi }];

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Simge } from '../../ortak/arayuz/index.ts';

interface Ozellikler {
  baslik: string;
  alt?: string;
  // Belge numarası ve durum rozeti başlığın yanında durur.
  ek?: ReactNode;
  geriYol: string;
  geriMetni: string;
  islemler?: ReactNode;
}

// Ayrıntı ve form sayfalarının ortak üst bölümü (prototipte `head`): geri bağlantısı, başlık, belge numarası, işlem düğmeleri.
export function SayfaBasligi({ baslik, alt, ek, geriYol, geriMetni, islemler }: Ozellikler) {
  return (
    <header className="tc-sp-ust">
      <Link to={geriYol} className="tc-sp-geri"><Simge ad="back" boyut="k" />{geriMetni}</Link>
      <div className="tc-sp-ust-satir">
        <div className="tc-sp-ust-metin">
          <h1 className="tc-sp-baslik">{baslik}</h1>
          {ek && <div className="tc-sp-ek">{ek}</div>}
          {alt && <p className="tc-sp-alt">{alt}</p>}
        </div>
        {islemler && <div className="tc-sp-islemler">{islemler}</div>}
      </div>
    </header>
  );
}

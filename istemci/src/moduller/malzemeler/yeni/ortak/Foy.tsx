import type { ReactNode } from 'react';
import { KilitliDeger, YETKI_ADI } from '../../../../ortak/arayuz/KilitliDeger.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import type { FoyKgFiyati, FoyVerisi } from '../kurallar/index.ts';
import { kgFiyatiEkle, kgFiyatiSatirlari } from '../kurallar/index.ts';
import './foy.css';

// kgFiyati: undefined, fiyatı okuyamayan rol (satır çizilmez); null, okuyabilen rolde fiyatı bilinmeyen kart ("—").
// kunye: başlıkta koddan önce (kart penceresinde tür ve kategori).
// kgFiyatiKilitli: kg fiyatını görmeyen rolde föyün altında kilit çizilir (3401-1 a).
export function Foy({ veri, kgFiyati, kunye, kgFiyatiKilitli = false }: { veri: FoyVerisi; kgFiyati?: FoyKgFiyati | null; kunye?: ReactNode; kgFiyatiKilitli?: boolean }) {
  if (veri.bos) return <p className="tc-foy-bos">Föy, seçimlerini yaptıkça burada oluşur.</p>;
  const v = kgFiyati === undefined ? veri : kgFiyatiEkle(veri, kgFiyatiSatirlari(veri, kgFiyati));
  const kisa = v.bolumler.length === 1 && v.bolumler[0]?.baslik === '';
  return (
    <article className={kisa ? 'tc-foy tc-foy-kisa' : 'tc-foy'} aria-label={`Föy: ${v.kod}`}>
      <header className="tc-foy-bas" data-tur={v.tur} {...(v.tur === 'hammadde' && v.aile ? { 'data-aile': v.aile } : {})}>
        {kunye && <div className="tc-foy-kunye">{kunye}</div>}
        <div className="tc-foy-kod">{v.kod}</div>
        <h3 className="tc-foy-ad">{v.ad}</h3>
      </header>
      {v.agirliklar.length > 0 && (
        <div className="tc-foy-agirlik">
          {v.agirliklar.map((a) => (
            <div key={a.ad}><small>{a.ad}</small><b>{a.deger}</b></div>
          ))}
        </div>
      )}
      {v.bolumler.map((b, i) => (
        <section key={`${b.baslik}-${String(i)}`} className="tc-foy-bolum" aria-label={b.baslik || undefined}>
          {b.baslik && <h4>{b.baslik}</h4>}
          <dl>
            {b.satirlar.map((s, j) => (
              <div key={`${s.ad}-${String(j)}`} className="tc-foy-satir">
                <dt>{s.ad}</dt>
                <dd>{s.deger}{s.degisti && <> <Rozet ton="uyari">{kisa ? 'Değişti' : 'Değiştirildi'}</Rozet></>}</dd>
              </div>
            ))}
          </dl>
          {b.not && <p className="tc-foy-not">{b.not}</p>}
        </section>
      ))}
      {kgFiyatiKilitli && v.tur === 'hammadde' && (
        <section className="tc-foy-bolum" aria-label="Fiyat">
          <dl><div className="tc-foy-satir"><dt>Birim fiyat</dt><dd><KilitliDeger yetki={YETKI_ADI.satinAlmaFiyati} /></dd></div></dl>
        </section>
      )}
    </article>
  );
}

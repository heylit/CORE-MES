import type { ReactNode } from 'react';
import { AcKapa } from '../../../../ortak/arayuz/index.ts';
import type { Ton } from './tipler.ts';

// Eski ekranın küçük denetimleri (kurallar.ts Sw, Seg, Num): hazırlık, istasyon düzenleyici ve operatör aynı biçimi kullanır.

export function Anahtar({ acik, degistir, baslik, aciklama, kilitli }: {
  acik: boolean; degistir: (v: boolean) => void; baslik: string; aciklama?: string; kilitli?: boolean;
}) {
  return (
    <div className="tc-ay2-anahtar">
      <AcKapa etiket={baslik} acik={!!acik} degistir={degistir} disabled={kilitli} />
      <div><b>{baslik}</b>{aciklama ? <small>{aciklama}</small> : null}</div>
    </div>
  );
}

export function Bolmeli<K extends string>({ deger, secenekler, degistir, etiket, kilitli, ipucu }: {
  deger: K; secenekler: readonly (readonly [K, string])[]; degistir: (k: K) => void; etiket: string; kilitli?: boolean; ipucu?: string;
}) {
  return (
    <div className="tc-ay2-bolmeli" role="group" aria-label={etiket}>
      {secenekler.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={deger === k} disabled={kilitli} title={ipucu} onClick={() => degistir(k)}>{l}</button>
      ))}
    </div>
  );
}

// Değer sınırlara kıstırılır, boş ya da sayı olmayan giriş 0 sayılır (eski Num ile aynı).
export function Sayi({ deger, degistir, enaz = 0, encok = 100000, ek, etiket, genis, kilitli }: {
  deger: number; degistir: (n: number) => void; enaz?: number; encok?: number; ek?: string; etiket: string; genis?: boolean; kilitli?: boolean;
}) {
  return (
    <span className="tc-ay2-sayi" data-genis={genis ? '' : undefined}>
      <input
        type="number" inputMode="decimal" min={enaz} max={encok} value={deger} aria-label={etiket} disabled={kilitli}
        onChange={(e) => degistir(Math.max(enaz, Math.min(encok, +e.target.value || 0)))}
      />
      {ek ? <em>{ek}</em> : null}
    </span>
  );
}

// Eski "chip": renkli nokta ve metin; renk tek başına anlam taşımaz.
export function Cip({ ton, children }: { ton: Ton; children: ReactNode }) {
  return <span className="tc-ay2-cip" data-ton={ton}><i aria-hidden="true" />{children}</span>;
}

// Kart başlığı (rch): simge, başlık, açıklama ve sağda isteğe bağlı sayaç.
export function KartBasligi({ simge, ton, baslik, aciklama, sag }: {
  simge: ReactNode; ton: Ton; baslik: string; aciklama?: string; sag?: ReactNode;
}) {
  return (
    <div className="tc-ay2-kb">
      <span className="tc-ay2-kb-simge" data-ton={ton}>{simge}</span>
      <div><b>{baslik}</b>{aciklama ? <small>{aciklama}</small> : null}</div>
      {sag ? <span className="tc-ay2-ust-yazi tc-ay2-sag">{sag}</span> : null}
    </div>
  );
}

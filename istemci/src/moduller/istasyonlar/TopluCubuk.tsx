import type { ReactNode } from 'react';
import { Dugme } from '../../ortak/arayuz/index.ts';

// Seçili satırların işlemleri (kart #1296): komut hepsini ya da hiçbirini yazar; ret iletisi burada, reddedilen satır listede işaretlidir.
export function TopluCubuk({ sayi, temizle, ret, children }: { sayi: number; temizle: () => void; ret: string | null; children: ReactNode }) {
  if (sayi === 0 && ret === null) return null;
  return (
    <div className="tc-ist-toplu" role="region" aria-label="Toplu işlem">
      <div className="tc-ist-toplu-satir">
        <b className="tc-ist-toplu-sayi">{sayi} seçili</b>
        {sayi > 0 && children}
        <Dugme simge="x" className="tc-ist-toplu-kaldir" onClick={temizle}>Seçimi kaldır</Dugme>
      </div>
      {ret && <p className="tc-ist-hata" role="alert">{ret} Hiçbir kayıt değişmedi.</p>}
    </div>
  );
}

// Satır seçimi: görünenlerin hepsini seçen başlık kutusu ve satır kutusu.
export function SecimKutusu({ etiket, secili, degistir, kismen }: { etiket: string; secili: boolean; degistir: (secili: boolean) => void; kismen?: boolean }) {
  return (
    <input
      type="checkbox" className="tc-ist-sec" aria-label={etiket} checked={secili}
      ref={(o) => { if (o) o.indeterminate = kismen ?? false; }} onChange={(o) => degistir(o.target.checked)}
    />
  );
}

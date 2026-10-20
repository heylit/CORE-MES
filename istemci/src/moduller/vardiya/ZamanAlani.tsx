import { useEffect, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { saatOku, tarihMetni, tarihOku, zamanMetni, zamanOku } from './gosterim.ts';

type Ortak = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

interface Cekirdek {
  deger: string;
  bicimle: (deger: string) => string;
  oku: (metin: string) => string | null;
  degistir: (deger: string) => void;
  // Boş bırakmak anlamlıysa (isteğe bağlı alan) boş değer uygulanır; değilse boşaltılan alan kayıtlı değere döner.
  bosOlabilir: boolean;
}

// Yazılan metin taslaktır: ara değer (örnek "29.10.2026 0:00") uygulanmaz. Odak çıkınca ve Enter'da tamamlanmış değer
// üst bileşene verilir ve biçimlenir; geçersiz ya da boşaltılmış taslak bırakılıp ekranda görünen değer kayıtla aynı kalır.
function useTaslak({ deger, bicimle, oku, degistir, bosOlabilir }: Cekirdek) {
  const [metin, metinYaz] = useState(bicimle(deger));
  const [gecersiz, gecersizYaz] = useState(false);
  useEffect(() => { metinYaz(bicimle(deger)); }, [deger, bicimle]);
  const bitir = () => {
    if (metin.trim() === '') {
      if (bosOlabilir) { if (deger !== '') degistir(''); metinYaz(''); } else metinYaz(bicimle(deger));
      return;
    }
    const v = oku(metin);
    if (v === null) { gecersizYaz(true); metinYaz(bicimle(deger)); return; }
    if (v !== deger) degistir(v);
    metinYaz(bicimle(v));
  };
  return {
    metin,
    gecersiz,
    degisti: (m: string) => { metinYaz(m); gecersizYaz(false); },
    bitti: bitir,
    tus: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') bitir(); },
  };
}

const kimlik = (d: string) => d;
const tarihBicimle = (d: string) => (d === '' ? '' : tarihMetni(d));

export function SaatGirdisi({ deger, degistir, bosOlabilir = false, className, ...geri }: Ortak & { deger: string; degistir: (s: string) => void; bosOlabilir?: boolean }) {
  const t = useTaslak({ deger, bicimle: kimlik, oku: saatOku, degistir, bosOlabilir });
  return (
    <input {...geri} className={['tc-alan-kutu tc-vr-saat', className].filter(Boolean).join(' ')} type="text" inputMode="numeric" placeholder="SS:DD" maxLength={5}
      autoComplete="off" aria-invalid={t.gecersiz ? true : undefined} value={t.metin} onChange={(e) => t.degisti(e.target.value)} onBlur={t.bitti} onKeyDown={t.tus} />
  );
}

export function TarihGirdisi({ deger, degistir, bosOlabilir = false, className, ...geri }: Ortak & { deger: string; degistir: (iso: string) => void; bosOlabilir?: boolean }) {
  const t = useTaslak({ deger, bicimle: tarihBicimle, oku: tarihOku, degistir, bosOlabilir });
  return (
    <input {...geri} className={['tc-alan-kutu tc-vr-tarih', className].filter(Boolean).join(' ')} type="text" inputMode="numeric" placeholder="GG.AA.YYYY" maxLength={10}
      autoComplete="off" aria-invalid={t.gecersiz ? true : undefined} value={t.metin} onChange={(e) => t.degisti(e.target.value)} onBlur={t.bitti} onKeyDown={t.tus} />
  );
}

// Değer 'YYYY-MM-DDTHH:mm' (yerel saat) ya da boştur.
export function ZamanGirdisi({ etiket, deger, degistir, ipucu, required, bosOlabilir = false }: { etiket: string; deger: string; degistir: (yerel: string) => void; ipucu?: string; required?: boolean; bosOlabilir?: boolean }) {
  const t = useTaslak({ deger, bicimle: zamanMetni, oku: zamanOku, degistir, bosOlabilir });
  const alt = t.gecersiz ? { hata: 'GG.AA.YYYY SS:DD biçiminde yaz (örnek 29.10.2026 08:00).' } : ipucu !== undefined ? { ipucu } : {};
  return (
    <Girdi etiket={etiket} type="text" inputMode="numeric" placeholder="GG.AA.YYYY SS:DD" maxLength={16} autoComplete="off" value={t.metin}
      {...(required === undefined ? {} : { required })} {...alt} onChange={(e) => t.degisti(e.target.value)} onBlur={t.bitti} onKeyDown={t.tus} />
  );
}

import { useEffect, useRef } from 'react';
import { kodTuru, okutmaDuzelt, type Komut } from '#paylasilan/kod-sozlugu.ts';
import type { OkutmaTonu } from './okutma-geribildirimi.ts';

// Komut barkodu (1909, 1912): ekrandaki düğmenin basılı karşılığı. Okuyucu komutu çağıran ekrana verir; ekran yaptığını
// (`KomutSonucu`) ya da bu ekranda o komutun olmadığını (`null`) söyler.
export interface KomutSonucu { ton: OkutmaTonu; metin: string }
export type KomutIsleyici = (k: Komut) => KomutSonucu | null;
export const KOMUT_YOK = 'Bu ekranda bu komut yok';

// El okuyucu bir kodu insanın yazamayacağı hızda yazar. Onay penceresi açıkken odak düğmededir: okuyucunun sonundaki Enter
// odaktaki düğmeye (Vazgeç) basardı. Hızlı gelen ve Enter ile biten dizi okutma sayılır; Enter yutulur, dizi komutsa işlenir.
// Elle yazılan tuşa dokunulmaz.
export const TUS_ARASI_MS = 60;
const EN_AZ_KARAKTER = 3;

export function useOkuyucuKomutu(etkin: boolean, isle: (k: Komut) => boolean): void {
  const son = useRef(isle);
  useEffect(() => { son.current = isle; });
  useEffect(() => {
    if (!etkin) return;
    let dizi = '';
    let sonZaman = -Infinity;
    const tus = (o: KeyboardEvent) => {
      if (o.ctrlKey || o.altKey || o.metaKey) return;
      const simdi = o.timeStamp || performance.now();
      const hizli = simdi - sonZaman <= TUS_ARASI_MS;
      sonZaman = simdi;
      if (o.key === 'Enter') {
        const okutma = hizli && dizi.length >= EN_AZ_KARAKTER ? dizi : null;
        dizi = '';
        if (okutma === null) return;
        o.preventDefault();
        o.stopPropagation();
        const k = kodTuru(okutmaDuzelt(okutma));
        if (k.tur === 'komut') son.current(k.komut);
        return;
      }
      if (o.key.length !== 1) return;
      dizi = hizli ? dizi + o.key : o.key;
    };
    window.addEventListener('keydown', tus, true);
    return () => window.removeEventListener('keydown', tus, true);
  }, [etkin]);
}

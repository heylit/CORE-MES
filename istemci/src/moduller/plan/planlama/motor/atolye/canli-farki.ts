import { useEffect, useRef, useState } from 'react';
import type { CanliFarkiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { api } from '../../../../../ortak/veri/api.ts';
import { BEKLEME_MS } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { canliFarkOzeti, type CanliFark } from './kurallar.ts';

// Çalışma ile canlı planın farkı sunucudan okunur (506 a): sunucu kayıtlı çalışmayı kıyaslar. Açılışta hemen, sonra çalışma ya da canlı sürüm
// değişince kaydın yazılmasını bekleyip (kayıt beklemesi artı bir saniye) yeniden okunur. Okunamazsa ya da henüz okunmadıysa null (bilinmiyor).
export const FARK_BEKLEME_MS = BEKLEME_MS + 1000;

export function useCanliFarki(c: PlanlamaCalismasi | null, canliSurum: number | null): CanliFark | null {
  const [f, setF] = useState<CanliFark | null>(null);
  const ilk = useRef(true);
  useEffect(() => {
    let gecerli = true;
    const oku = () => {
      api.get<CanliFarkiCevabi>('/plan/planlama-calismasi/canli-farki')
        .then((r) => { if (gecerli) setF(canliFarkOzeti(r)); }, () => undefined);
    };
    const t = setTimeout(oku, ilk.current ? 0 : FARK_BEKLEME_MS);
    ilk.current = false;
    return () => { gecerli = false; clearTimeout(t); };
  }, [c, canliSurum]);
  return f;
}

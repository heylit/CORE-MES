import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import * as K from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { useSihirbaz } from './baglam.ts';

// Prototipte `onayBadge`: onay durumu rengi Rozet tonuna eşlenir (envanter 12.9).
const TON: Record<ReturnType<typeof K.onayDurum>, RozetTonu> = { taslak: 'pasif', onayda: 'uyari', aktif: 'tamam', pasif: 'pasif' };

export function OnayRozeti({ x }: { x: KartKaydi }) {
  const { b } = useSihirbaz();
  const k = K.onayDurum(x, b);
  return <Rozet ton={TON[k]}>{S.ONAY[k].ad}</Rozet>;
}

import type { SayfaTanimi } from '../sayfa-tanimi.ts';

// Ana menüde gizli: aynı ekran Vardiya ikinci menüsünde "Günlük mesai" (/vardiya/mesai) olarak açılır. Sayfa durur,
// çünkü `sayfa.mesai` işlemi bu kayıttan gelir; o madde ve `GET /gunluk-mesai` ucu bu işlemle görünür.
export const MESAI_SAYFALARI = [
  { yol: '/mesai', islem: 'sayfa.mesai', baslik: 'Günlük Mesai', simge: 'coffee', grup: 'Planlama', sira: 40, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];

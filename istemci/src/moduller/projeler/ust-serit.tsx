import type { UstSerit } from '../../ortak/rota/ust-seritler.ts';
import { HazirlikSeridi } from './HazirlikSeridi.tsx';

// 3396-3 a: görev yapabilen herkes için sınanır; uç yalnız kişinin kendi geciken hazırlık görevlerini verir.
export const ustSeritler: UstSerit[] = [{ anahtar: 'hazirlik-gecikmesi', sira: 5, islem: 'projeler.gorev-isle', serit: HazirlikSeridi }];

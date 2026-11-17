import type { UstSerit } from '../../ortak/rota/ust-seritler.ts';
import { HazirlikSeridi } from './HazirlikSeridi.tsx';

// 3396-3 a: giriş yapan herkes için sınanır; uç yalnız kişinin kendi geciken hazırlık görevlerini verir.
export const ustSeritler: UstSerit[] = [{ anahtar: 'hazirlik-gecikmesi', sira: 5, islem: 'oturum', serit: HazirlikSeridi }];

import type { UstSerit } from '../../ortak/rota/ust-seritler.ts';
import { KademeSeridi } from './Kademe.tsx';

// 3405 a: giriş yapan herkes için sınanır; uç yalnız kişinin kendi geciken işlerini ve kaynağını okuyabildiklerini verir.
export const ustSeritler: UstSerit[] = [{ anahtar: 'kademe-gecikmesi', sira: 5, islem: 'oturum', serit: KademeSeridi }];

import type { UstSerit } from '../../ortak/rota/ust-seritler.ts';
import { KurFaizSeridi } from './KurFaizSeridi.tsx';

// 952 a: giriş yapan herkes görür (salt okunur); güncelleme finans.kur-yaz ister, yetki uçtadır.
export const ustSeritler: UstSerit[] = [{ anahtar: 'kur-faiz', sira: 10, islem: 'oturum', serit: KurFaizSeridi }];

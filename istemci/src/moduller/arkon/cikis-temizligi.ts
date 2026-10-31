import { cikistaCalistir } from '../../ortak/veri/oturum.ts';
import { yerelVeriyiTemizle } from '../../../../arkon/web/src/data/yerel-temizlik.ts';

// Çıkışta Arkon'un cihazdaki verisi silinir, gönderilmemiş kayıt kuyruğu kalır (karar 102 a). Yeni ekran da aynı depoyu kullanır
// (yeni/veri/depo.ts). Çıkış Arkon sayfası hiç açılmadan da yapılabilir: kanca modül yüklenince kurulur, rotalar.tsx açılışta yükler.
export const arkonCikisTemizligi = (): Promise<void> => yerelVeriyiTemizle(window.localStorage, window.indexedDB);
cikistaCalistir(arkonCikisTemizligi);

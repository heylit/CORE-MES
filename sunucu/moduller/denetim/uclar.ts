import { uc } from '#cekirdek/uc.ts';
import {
  degisiklikIcerigiCevabi, degisiklikListesiCevabi, degisiklikListesiSorgusu, degisiklikSecenekleriCevabi,
  kayitIcerigiCevabi, kayitIdParametresi, kayitListesiCevabi, kayitListesiSorgusu, suzgecSecenekleriCevabi,
} from '#paylasilan/sozlesme/denetim.ts';
import * as servis from './servis.ts';

// Okuma yalnız; deftere yazan uç katmanıdır (`denetimYaz`). Gövde ayrı işlemle ayrı uçtadır (kart #48).
export const uclar = [
  uc({
    yontem: 'GET', yol: '/denetim-kayitlari', yetki: 'denetim.oku', sorgu: kayitListesiSorgusu, cevap: kayitListesiCevabi,
    isle: ({ db, sorgu }) => servis.kayitListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/denetim-kayitlari/suzgecler', yetki: 'denetim.oku', cevap: suzgecSecenekleriCevabi,
    isle: ({ db }) => servis.suzgecSecenekleri(db),
  }),
  uc({
    yontem: 'GET', yol: '/denetim-kayitlari/:id/govde', yetki: 'denetim.govde-oku', parametre: kayitIdParametresi, cevap: kayitIcerigiCevabi,
    isle: ({ db, parametre }) => servis.kayitIcerigi(db, parametre.id),
  }),
  // Eski/yeni değer defteri (392 a): liste kayıt listesiyle, değerler kayıt gövdesiyle aynı yetkidedir; yeni işlem yok.
  uc({
    yontem: 'GET', yol: '/denetim-degisiklikleri', yetki: 'denetim.oku', sorgu: degisiklikListesiSorgusu, cevap: degisiklikListesiCevabi,
    isle: ({ db, sorgu }) => servis.degisiklikListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/denetim-degisiklikleri/suzgecler', yetki: 'denetim.oku', cevap: degisiklikSecenekleriCevabi,
    isle: ({ db }) => servis.degisiklikSecenekleri(db),
  }),
  uc({
    yontem: 'GET', yol: '/denetim-degisiklikleri/:id/icerik', yetki: 'denetim.govde-oku', parametre: kayitIdParametresi, cevap: degisiklikIcerigiCevabi,
    isle: ({ db, parametre }) => servis.degisiklikIcerigi(db, parametre.id),
  }),
];

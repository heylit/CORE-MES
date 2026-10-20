import { uc } from '#cekirdek/uc.ts';
import {
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
];

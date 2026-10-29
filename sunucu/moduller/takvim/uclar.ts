import { uc } from '#cekirdek/uc.ts';
import { takvimCevabi, takvimSorgusu } from '#paylasilan/sozlesme/takvim.ts';
import { takvim } from './servis.ts';

export const uclar = [
  // Takvim (891 a): kaynak modüllerin tarihleri tek okumada; her kaynak ayrıca kendi okuma yetkisini ister (1163 a).
  uc({
    yontem: 'GET',
    yol: '/takvim',
    yetki: 'takvim.oku',
    sorgu: takvimSorgusu,
    cevap: takvimCevabi,
    isle: ({ db, kullanici, sorgu }) => takvim(db, kullanici, sorgu),
  }),
];

import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { uc } from '#cekirdek/uc.ts';
import { takvimCevabi, takvimGecikenCevabi, takvimSorgusu } from '#paylasilan/sozlesme/takvim.ts';
import { gecikenler, takvim } from './servis.ts';

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
  // Pencereden eski gecikmeler (1816): özet, gündem ve kanbanın "Geciken"i bunları da sayar; kaynak yetkileri aynıdır.
  uc({
    yontem: 'GET',
    yol: '/takvim/gecikenler',
    yetki: 'takvim.oku',
    cevap: takvimGecikenCevabi,
    isle: ({ db, kullanici }) => gecikenler(db, kullanici, tesisGunu(Date.now())),
  }),
];

import { uc } from '#cekirdek/uc.ts';
import {
  benCevabi, fasonTahminCevabi, malzemeIhtiyaciCevabi, malzemeIhtiyaciSorgusu, fasonTahminSorgusu, kayitlarCevabi, receteRotaDurumCevabi, silCevabi, silGovdesi, statulerCevabi, statuTanimiCevabi, statuTanimiKaydetGovdesi,
  statuTanimiParametresi, statuTanimiSilGovdesi, yazCevabi, yazGovdesi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { ben, durum, fasonTahminleri, malzemeIhtiyaci, kayitlar, komutlaSil, komutlaYaz, statuler, statuTanimiKaydet, statuTanimiSil } from './servis.ts';

// Çerçevedeki prototipin yerel deposu bu uçlara gelir (istemci/src/moduller/recete-rota/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/recete-rota/ben',
    yetki: OKUMA,
    cevap: benCevabi,
    isle: ({ kullanici }) => ben(kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/kayitlar',
    yetki: OKUMA,
    cevap: kayitlarCevabi,
    isle: ({ db, kullanici }) => kayitlar(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/durum',
    yetki: OKUMA,
    cevap: receteRotaDurumCevabi,
    isle: ({ db, kullanici }) => durum(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/statuler',
    yetki: OKUMA,
    cevap: statulerCevabi,
    isle: ({ db }) => statuler(db),
  }),
  // Termini girilmemiş fason adımın plan süresi: satın almanın geçmiş teslimat tahmini (kullanıcı kararı 16.10.2026). Satın alma
  // okuma yetkisi istenmez: dönen yalnız gün sayısıdır, firma ya da fiyat bilgisi taşımaz.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/fason-tahminleri',
    yetki: OKUMA,
    sorgu: fasonTahminSorgusu,
    cevap: fasonTahminCevabi,
    isle: ({ db, sorgu }) => fasonTahminleri(db, sorgu.s),
  }),
  // Emir malzeme ihtiyacı (2486-8, 461 b): emir okuma yetkisini servis ister.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/malzeme-ihtiyaci',
    yetki: OKUMA,
    sorgu: malzemeIhtiyaciSorgusu,
    cevap: malzemeIhtiyaciCevabi,
    isle: ({ db, kullanici, sorgu }) => malzemeIhtiyaci(db, kullanici, sorgu.emir),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/kayitlar/yaz',
    yetki: 'recete-rota.yaz',
    // Ana durum kaydı bu uçtan yazılmaz (komutlaYaz). Kayıt yüzlerce KB olabilir: gövde deftere girmez, anahtar ve beklenen sürüm girer
    // (CNC Kurulum Motoru ile aynı kalıp; uygulama.test listesine eklenir).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ anahtar: g.anahtar, bicim: g.bicim, beklenenSurum: g.beklenenSurum }),
    govde: yazGovdesi,
    cevap: yazCevabi,
    isle: ({ db, kullanici, govde, gunluk }) => komutlaYaz(db, kullanici, govde, gunluk),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/kayitlar/sil',
    yetki: 'recete-rota.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, govde }) => komutlaSil(db, govde.anahtar, govde.beklenenSurum),
  }),
  // Elle tanımlanan statü (geçiş planı adım 4): ekleme, değişiklik ve silme tabloya komutla gider.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/statu-tanimlari/:id/kaydet',
    yetki: 'recete-rota.yaz',
    parametre: statuTanimiParametresi,
    govde: statuTanimiKaydetGovdesi,
    cevap: statuTanimiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => statuTanimiKaydet(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/statu-tanimlari/:id/sil',
    yetki: 'recete-rota.yaz',
    parametre: statuTanimiParametresi,
    govde: statuTanimiSilGovdesi,
    cevap: statuTanimiCevabi,
    isle: ({ db, parametre, govde }) => statuTanimiSil(db, parametre.id, govde.beklenenSurum),
  }),
];

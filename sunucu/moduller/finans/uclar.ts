import { uc } from '#cekirdek/uc.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { firmaCevabi, firmaDurumGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { kimlikParametresi, tedarikciAlacagiCevabi, tedarikciAlacagiDurumGovdesi, tedarikciAlacaklariCevabi } from '#paylasilan/sozlesme/finans.ts';
import * as genelGider from './genel-gider/servis.ts';
import * as servis from './servis.ts';
import { maliyetKaldir } from './maliyet-kaldir/servis.ts';
import { saatlikMaliyetler } from './saatlik-maliyet/servis.ts';
import { z as zod } from 'zod';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  satisSevkleriCevabi, satisSevkleriSorgusu, satisSiparisleriCevabi, satisSiparisleriSorgusu, ayarCevabi, ayarGuncelleGovdesi, belgeCevabi, belgeDuzeltGovdesi, belgeEkleGovdesi, belgeListesiCevabi, butceGovdesi, butceListesiCevabi,
  cekCevabi, cekDuzeltGovdesi, cekEkleGovdesi, cekListesiCevabi, cekSonucGovdesi, cekTarihGovdesi, ciroGovdesi, dagilimListesiCevabi, dagitGovdesi,
  duzenliOdemeGovdesi, duzenliOdemeGuncelleGovdesi, duzenliOdemeListesiCevabi, duzenliOdemeSemasi, duzenliOdendiGovdesi, esitleGovdesi,
  aylikSeriCevabi, aylikSeriSorgusu, beklenenOdemelerCevabi, beklenenTahsilatlarCevabi, esitlemeListesiCevabi, finansListeSorgusu, finansOzetiCevabi, hesapCevabi, hesapEkleGovdesi, hesapGuncelleGovdesi, hesapListesiCevabi, iptalGovdesi, kapanisGovdesi,
  kapanisListesiCevabi, faizEkleGovdesi, faizListesiCevabi, genelGiderOraniEkleGovdesi, genelGiderOraniListesiCevabi, genelGiderOnerisiSorgusu, genelGiderOnerisiCevabi, genelGiderBelgedenEkleGovdesi, kdvOraniEkleGovdesi, kdvOraniKapatGovdesi, kdvOraniListesiCevabi, kurFaizAraligiCevabi, kurFaizAraligiSorgusu, kurFaizOzetiCevabi, kurFaizTopluCevabi, kurFaizTopluGovdesi, kurGovdesi, kurGuncelleGovdesi, kurListesiCevabi, kurCiftiGovdesi, kurCiftiGuncelleGovdesi, kurCiftiListesiCevabi, oranAraligiCevabi, oranEkleGovdesi, oranListesiCevabi, oranOzetiCevabi, oranTopluCevabi, oranTopluGovdesi,
  mahsupCevabi, mahsupEkleGovdesi, mahsupListesiCevabi, odemeCevabi, odemeEkleGovdesi, odemeListesiCevabi, oneriDurumuGovdesi, oneriListesiCevabi,
  maliyetCevabi, maliyetKaldirCevabi, maliyetKaldirGovdesi, maliyetKaldirParametresi, maliyetListesiCevabi, saatlikMaliyetListesiCevabi, saatlikMaliyetTuruParametresi, maliyetTuruParametresi, maliyetYazGovdesi, amortismanCevabi, sabitKiymetCevabi, sabitKiymetEkleGovdesi, sabitKiymetGuncelleGovdesi, sabitKiymetListesiCevabi, sabitKiymetPasifGovdesi, makineIdParametresi, makineSabitKiymetleriCevabi,
  skorListesiCevabi, vergiBeyaniGovdesi, vergiBeyaniSorgusu, vergiBeyanlariCevabi, topluAktarCevabi, topluAktarGovdesi, virmanEkleGovdesi, virmanListesiCevabi, virmanSemasi,
} from '#paylasilan/sozlesme/finans.ts';
import type { ListeAdi } from './sorgular.ts';

// Firma kartı musteri-tedarikci modülündedir (kart #1164). Aktiflik geçişi burada kalır: pasife almayı finansın açık kayıtları
// engeller (FNS-60) ve akışı üstteki modül başlatır (ADR 0006). Yetki kartı yazma yetkisidir.
const firmaUclari = [
  uc({
    yontem: 'POST',
    yol: '/finans/firmalar/:id/pasif',
    yetki: 'musteri-tedarikci.yaz',
    parametre: kimlikParametresi,
    govde: firmaDurumGovdesi,
    cevap: firmaCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({
      firma: await servis.firmaDurumuDegistir(db, kullanici, parametre.id, govde.surum, 'pasif'),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/finans/firmalar/:id/aktif',
    yetki: 'musteri-tedarikci.yaz',
    parametre: kimlikParametresi,
    govde: firmaDurumGovdesi,
    cevap: firmaCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({
      firma: await servis.firmaDurumuDegistir(db, kullanici, parametre.id, govde.surum, 'aktif'),
    }),
  }),
];


// =====================================================================
// Para kayıtları uçları. Okuma finans.oku; günlük kayıt finans.yaz; iptal, geri alma, tanım ve ayar kendi eylemiyle (3165 a: finans.yonet sekiz eyleme bölündü).
// =====================================================================

const oku = (yol: string, ad: ListeAdi, cevap: zod.ZodTypeAny) => uc({
  yontem: 'GET', yol, yetki: 'finans.oku', sorgu: finansListeSorgusu, cevap,
  isle: ({ db, sorgu }) => servis.listele(db, ad, sorgu),
});
const surumGovdesi = zod.object({ surum: zod.number().int().min(1) });
const anahtarCevap = zod.object({}).passthrough();

export const paraUclari = [
  oku('/finans/belgeler', 'belge', belgeListesiCevabi),
  oku('/finans/odemeler', 'odeme', odemeListesiCevabi),
  oku('/finans/dagitimlar', 'dagilim', dagilimListesiCevabi),
  oku('/finans/mahsuplar', 'mahsup', mahsupListesiCevabi),
  oku('/finans/cekler', 'cek', cekListesiCevabi),
  oku('/finans/hesaplar', 'hesap', hesapListesiCevabi),
  oku('/finans/virmanlar', 'virman', virmanListesiCevabi),
  oku('/finans/kurlar', 'kur', kurListesiCevabi),
  oku('/finans/kdv-oranlari', 'kdv', kdvOraniListesiCevabi),
  oku('/finans/faizler', 'faiz', faizListesiCevabi),
  oku('/finans/kur-ciftleri', 'kurCifti', kurCiftiListesiCevabi),
  oku('/finans/oranlar', 'oran', oranListesiCevabi),
  oku('/finans/duzenli-odemeler', 'duzenli', duzenliOdemeListesiCevabi),
  oku('/finans/butce', 'butce', butceListesiCevabi),
  oku('/finans/bakiye-esitlemeleri', 'esitleme', esitlemeListesiCevabi),
  oku('/finans/oneri-durumlari', 'oneri', oneriListesiCevabi),
  oku('/finans/kapanis', 'kapanis', kapanisListesiCevabi),
  oku('/finans/skorlar', 'skor', skorListesiCevabi),
  uc({ yontem: 'GET', yol: '/finans/sabit-kiymetler', yetki: 'finans.oku', sorgu: finansListeSorgusu, cevap: sabitKiymetListesiCevabi,
    isle: ({ db, sorgu }) => servis.sabitKiymetleriListele(db, sorgu) }),
  // Malzemeler demirbaş kartı (1596, 1599 a): fiyat ve amortisman yalnız finansı okuyana.
  uc({ yontem: 'GET', yol: '/finans/sabit-kiymetler/makine/:makineId', yetki: 'finans.oku', parametre: makineIdParametresi, cevap: makineSabitKiymetleriCevabi,
    isle: async ({ db, parametre }) => ({ sabitKiymetler: await servis.makineSabitKiymetleri(db, parametre.makineId) }) }),
  uc({ yontem: 'GET', yol: '/finans/amortisman', yetki: 'finans.oku', cevap: amortismanCevabi, isle: ({ db }) => servis.amortismanAylari(db) }),
  // 952 a: ortak kur ve faiz şeridi her sayfadadır; giriş yapan herkes okur (yalnız kur, faiz ve giren kişi; finans rakamı yok).
  uc({ yontem: 'GET', yol: '/finans/kur-ozeti', yetki: 'oturum', cevap: kurFaizOzetiCevabi, isle: ({ db }) => servis.kurFaizOzeti(db, tesisGunu(new Date())) }),
  // 1089 a: şeridin kur grafiği ve toplu yükleme önizlemesi; şerit gibi giriş yapan herkes okur (yalnız kur ve faiz).
  uc({ yontem: 'GET', yol: '/finans/kur-faiz-araligi', yetki: 'oturum', sorgu: kurFaizAraligiSorgusu, cevap: kurFaizAraligiCevabi,
    isle: ({ db, sorgu }) => servis.kurFaizAraligi(db, sorgu.baslangic, sorgu.bitis) }),
  // Kart 2238: kur ve faiz matrisi; şerit gibi giriş yapan herkes okur (952 a).
  uc({ yontem: 'GET', yol: '/finans/oran-ozeti', yetki: 'oturum', cevap: oranOzetiCevabi, isle: ({ db }) => servis.oranOzeti(db, tesisGunu(new Date())) }),
  uc({ yontem: 'GET', yol: '/finans/oran-araligi', yetki: 'oturum', sorgu: kurFaizAraligiSorgusu, cevap: oranAraligiCevabi,
    isle: ({ db, sorgu }) => servis.oranAraligi(db, sorgu.baslangic, sorgu.bitis) }),
  uc({ yontem: 'GET', yol: '/finans/ayar', yetki: 'finans.oku', cevap: ayarCevabi, isle: async ({ db }) => ({ ayar: await servis.ayarOku(db) as zod.output<typeof ayarCevabi>['ayar'] }) }),
  uc({ yontem: 'GET', yol: '/finans/aylik-seri', yetki: 'finans.oku', sorgu: aylikSeriSorgusu, cevap: aylikSeriCevabi,
    isle: ({ db, sorgu }) => servis.aylikSeri(db, tesisGunu(new Date()), sorgu.ay) }),
  uc({ yontem: 'GET', yol: '/finans/ozet', yetki: 'finans.oku', cevap: finansOzetiCevabi, isle: ({ db }) => servis.panoOzeti(db) }),
  // Kart #1124: faturası gelmemiş satın alma siparişlerinin ödeme planı, vadeye göre.
  uc({ yontem: 'GET', yol: '/finans/beklenen-odemeler', yetki: 'finans.oku', cevap: beklenenOdemelerCevabi, isle: ({ db }) => servis.beklenenOdemeler(db) }),
  // 2540: kalanı kapatılmış siparişte aşan avansın tedarikçi alacağı; okuma finans.oku, durum finans.yaz (tekrar korumalı, sürümlü, tam denetim).
  uc({ yontem: 'GET', yol: '/finans/tedarikci-alacaklari', yetki: 'finans.oku', cevap: tedarikciAlacaklariCevabi, isle: ({ db }) => servis.tedarikciAlacaklari(db) }),
  uc({ yontem: 'POST', yol: '/finans/tedarikci-alacaklari/:id/durum', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: tedarikciAlacagiDurumGovdesi,
    cevap: tedarikciAlacagiCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.tedarikciAlacagiDurumYaz(db, kullanici, parametre.id, govde) }),
  // 2132c: onaylı satış siparişlerinin faturalanmamış kalanı, vadeye göre.
  uc({ yontem: 'GET', yol: '/finans/beklenen-tahsilatlar', yetki: 'finans.oku', cevap: beklenenTahsilatlarCevabi, isle: ({ db }) => servis.beklenenTahsilatlar(db) }),
  // Sayaç oturumla açılır; finans.oku yoksa sayılar null döner (rakam sızmaz).
  uc({
    yontem: 'GET', yol: '/finans/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi,
    isle: async ({ db, kullanici }) => {
      if (!kullanici.islemler.includes('finans.oku')) return { firmalar: null, cekler: null };
      return servis.menuSayaclari(db);
    },
  }),

  // ---- belge ----
  uc({ yontem: 'POST', yol: '/finans/belgeler/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: belgeEkleGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, govde }) => ({ belge: await servis.belgeEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/belgeler/:id/duzelt', yetki: 'finans.yaz', parametre: kimlikParametresi, govde: belgeDuzeltGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ belge: await servis.belgeDuzelt(db, kullanici, parametre.id, govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/belgeler/:id/iptal', yetki: 'finans.iptal', parametre: kimlikParametresi, govde: iptalGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ belge: await servis.belgeIptal(db, kullanici, parametre.id, govde.surum, govde.neden, denetimEki) }) }),

  // ---- ödeme, dağıtım, mahsup ----
  uc({ yontem: 'POST', yol: '/finans/odemeler/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: odemeEkleGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, govde }) => ({ odeme: await servis.odemeEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/odemeler/:id/dagit', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: dagitGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ odeme: await servis.odemeDagit(db, kullanici, parametre.id, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/odemeler/:id/iptal', yetki: 'finans.iptal', parametre: kimlikParametresi, govde: iptalGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ odeme: await servis.odemeIptal(db, kullanici, parametre.id, govde.surum, govde.neden, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/dagitimlar/:id/iptal', yetki: 'finans.iptal', parametre: kimlikParametresi, govde: zod.object({}), cevap: zod.object({ belge: belgeCevabi.shape.belge, odeme: odemeCevabi.shape.odeme }),
    isle: ({ db, kullanici, parametre, denetimEki }) => servis.dagilimIptalEt(db, kullanici, parametre.id, denetimEki) }),
  uc({ yontem: 'POST', yol: '/finans/mahsuplar/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: mahsupEkleGovdesi, cevap: mahsupCevabi,
    isle: async ({ db, kullanici, govde }) => ({ mahsup: await servis.mahsupEkle(db, kullanici, govde) as zod.output<typeof mahsupCevabi>['mahsup'] }) }),
  uc({ yontem: 'POST', yol: '/finans/mahsuplar/:id/iptal', yetki: 'finans.iptal', parametre: kimlikParametresi, govde: surumGovdesi, cevap: mahsupCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ mahsup: await servis.mahsupIptalEt(db, kullanici, parametre.id, govde.surum, denetimEki) as zod.output<typeof mahsupCevabi>['mahsup'] }) }),

  // ---- çek ve senet ----
  uc({ yontem: 'POST', yol: '/finans/cekler/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: cekEkleGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, govde }) => ({ cek: await servis.cekEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/duzelt', yetki: 'finans.yaz', parametre: kimlikParametresi, govde: cekDuzeltGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekDuzelt(db, kullanici, parametre.id, govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/tahsile-ver', yetki: 'finans.yaz', parametre: kimlikParametresi, govde: surumGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'tahsile-ver', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/tahsil', yetki: 'finans.yaz', parametre: kimlikParametresi, govde: cekSonucGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'tahsil', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/odendi', yetki: 'finans.yaz', parametre: kimlikParametresi, govde: cekSonucGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'odendi', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/ciro', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: ciroGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'ciro', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/karsiliksiz', yetki: 'finans.cek-yonet', parametre: kimlikParametresi, govde: cekTarihGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'karsiliksiz', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/geri-al', yetki: 'finans.cek-yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'geri-al', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/iptal', yetki: 'finans.cek-yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'iptal', govde, denetimEki) }) }),

  // ---- hesap, virman ----
  uc({ yontem: 'POST', yol: '/finans/hesaplar/ekle', yetki: 'finans.hesap-yonet', govde: hesapEkleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, govde }) => ({ hesap: await servis.hesapEkle(db, kullanici, govde) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/guncelle', yetki: 'finans.hesap-yonet', parametre: kimlikParametresi, govde: hesapGuncelleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ hesap: await servis.hesapGuncelle(db, kullanici, parametre.id, govde, denetimEki) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/pasif', yetki: 'finans.hesap-yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapDurumu(db, kullanici, parametre.id, govde.surum, false) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/aktif', yetki: 'finans.hesap-yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapDurumu(db, kullanici, parametre.id, govde.surum, true) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/esitle', yetki: 'finans.hesap-yonet', tekrarKorumali: true, parametre: kimlikParametresi, govde: esitleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapEsitle(db, kullanici, parametre.id, govde) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/virmanlar/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: virmanEkleGovdesi, cevap: zod.object({ virman: virmanSemasi }),
    isle: async ({ db, kullanici, govde }) => ({ virman: await servis.virmanEkle(db, kullanici, govde) as zod.output<typeof virmanSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/virmanlar/:id/iptal', yetki: 'finans.iptal', parametre: kimlikParametresi, govde: surumGovdesi, cevap: zod.object({ virman: virmanSemasi }),
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ virman: await servis.virmanIptal(db, kullanici, parametre.id, govde.surum, denetimEki) as zod.output<typeof virmanSemasi> }) }),

  // ---- tanımlar ve ayar ----
  uc({ yontem: 'POST', yol: '/finans/kurlar/ekle', yetki: 'finans.kur-yaz', govde: kurGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kurEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kurlar/guncelle', yetki: 'finans.kur-yaz', govde: kurGuncelleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde, denetimEki }) => servis.kurGuncelle(db, kullanici, govde, denetimEki) }),
  uc({ yontem: 'POST', yol: '/finans/faizler/ekle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: faizEkleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.faizEkle(db, kullanici, govde) }),
  // 1087 a: toplu yükleme tek tek girişle aynı işlemdir (muhasebe ve satın alma).
  uc({ yontem: 'POST', yol: '/finans/kur-ciftleri/ekle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: kurCiftiGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kurCiftiEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kur-ciftleri/guncelle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: kurCiftiGuncelleGovdesi, cevap: anahtarCevap,
    isle: ({ db, kullanici, govde, denetimEki }) => servis.kurCiftiGuncelle(db, kullanici, govde, denetimEki) }),
  uc({ yontem: 'POST', yol: '/finans/oranlar/ekle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: oranEkleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.oranEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/oranlar/toplu-yukle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: oranTopluGovdesi, cevap: oranTopluCevabi,
    isle: ({ db, kullanici, govde }) => servis.oranTopluYukle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kur-faiz/toplu-yukle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: kurFaizTopluGovdesi, cevap: kurFaizTopluCevabi,
    isle: ({ db, kullanici, govde }) => servis.kurFaizTopluYukle(db, kullanici, govde) }),
  // 260 a: satış formundaki sipariş seçimi; fatura yazanın yetkisiyle (sipariş no ve durumu, tutar yok).
  uc({ yontem: 'GET', yol: '/finans/satis-siparisleri', yetki: 'finans.yaz', sorgu: satisSiparisleriSorgusu, cevap: satisSiparisleriCevabi,
    isle: ({ db, sorgu }) => servis.satisSiparisleri(db, sorgu.firmaId) }),
  uc({ yontem: 'GET', yol: '/finans/satis-sevkleri', yetki: 'finans.yaz', sorgu: satisSevkleriSorgusu, cevap: satisSevkleriCevabi,
    isle: ({ db, sorgu }) => servis.satisSevkleriOku(db, sorgu.siparisId) }),
  // Genel gider oranı maliyet tanımıdır: birim maliyetlerle aynı yetkiler (okuma finans.maliyet-oku, yazma finans.oran-yaz).
  uc({ yontem: 'GET', yol: '/finans/genel-gider-oranlari', yetki: 'finans.maliyet-oku', sorgu: finansListeSorgusu, cevap: genelGiderOraniListesiCevabi,
    isle: ({ db, sorgu }) => servis.listele(db, 'genelGider', sorgu) }),
  uc({ yontem: 'POST', yol: '/finans/genel-gider-oranlari/ekle', yetki: 'finans.oran-yaz', govde: genelGiderOraniEkleGovdesi, cevap: anahtarCevap,
    isle: ({ db, kullanici, govde }) => servis.genelGiderOraniEkle(db, kullanici, govde) }),
  // 2594 b: belgelerden bileşenli öneri ve kayıt; tutarlar sunucuda hesaplanır.
  uc({ yontem: 'GET', yol: '/finans/genel-gider-oranlari/oneri', yetki: 'finans.maliyet-oku', sorgu: genelGiderOnerisiSorgusu, cevap: genelGiderOnerisiCevabi,
    isle: ({ db, sorgu }) => genelGider.genelGiderOnerisi(db, sorgu.ay) }),
  uc({ yontem: 'POST', yol: '/finans/genel-gider-oranlari/belgeden-ekle', yetki: 'finans.oran-yaz', tekrarKorumali: true, govde: genelGiderBelgedenEkleGovdesi, cevap: anahtarCevap,
    isle: ({ db, kullanici, govde }) => genelGider.belgeSatiriKaydet(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/sabit-kiymetler/ekle', yetki: 'finans.sabit-kiymet', tekrarKorumali: true, govde: sabitKiymetEkleGovdesi, cevap: sabitKiymetCevabi,
    isle: async ({ db, kullanici, govde }) => ({ sabitKiymet: await servis.sabitKiymetEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/sabit-kiymetler/:id/guncelle', yetki: 'finans.sabit-kiymet', parametre: kimlikParametresi, govde: sabitKiymetGuncelleGovdesi, cevap: sabitKiymetCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ sabitKiymet: await servis.sabitKiymetGuncelle(db, kullanici, parametre.id, govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/sabit-kiymetler/:id/pasif', yetki: 'finans.sabit-kiymet', parametre: kimlikParametresi, govde: sabitKiymetPasifGovdesi, cevap: sabitKiymetCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ sabitKiymet: await servis.sabitKiymetPasif(db, kullanici, parametre.id, govde, denetimEki) }) }),
  uc({ yontem: 'GET', yol: '/finans/maliyetler/:tur', yetki: 'finans.maliyet-oku', parametre: maliyetTuruParametresi, sorgu: finansListeSorgusu, cevap: maliyetListesiCevabi,
    isle: ({ db, parametre, sorgu }) => servis.maliyetleriListele(db, parametre.tur, sorgu) }),
  uc({ yontem: 'POST', yol: '/finans/maliyetler/:tur/yaz', yetki: 'finans.maliyet-yaz', parametre: maliyetTuruParametresi, govde: maliyetYazGovdesi, cevap: maliyetCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ maliyet: await servis.maliyetYaz(db, kullanici, parametre.tur, govde) }) }),
  // 2593 (2589 b): istasyon saatlik maliyeti Finans sayfasında; kaynak listesi adlarıyla, maliyeti yoksa null. Kişi türü yok (2598 c).
  uc({ yontem: 'GET', yol: '/finans/saatlik-maliyetler/:tur', yetki: 'finans.maliyet-oku', parametre: saatlikMaliyetTuruParametresi, cevap: saatlikMaliyetListesiCevabi,
    isle: async ({ db, parametre }) => ({ satirlar: await saatlikMaliyetler(db, parametre.tur) }) }),
  // 2574: kaldırılan maliyet yeniden bilinmiyordur; yetki yazmayla aynı. Silinen değer denetim ekindedir.
  uc({ yontem: 'POST', yol: '/finans/maliyetler/:tur/:anahtar/kaldir', yetki: 'finans.maliyet-yaz', tekrarKorumali: true, parametre: maliyetKaldirParametresi, govde: maliyetKaldirGovdesi, cevap: maliyetKaldirCevabi,
    isle: async ({ db, parametre, govde, denetimEki }) => ({ kaldirilan: await maliyetKaldir(db, parametre.tur, parametre.anahtar, govde.surum, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/kdv-oranlari/ekle', yetki: 'finans.oran-yaz', govde: kdvOraniEkleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kdvOraniEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kdv-oranlari/kapat', yetki: 'finans.oran-yaz', govde: kdvOraniKapatGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kdvOraniKapat(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/ekle', yetki: 'finans.duzenli-odeme', tekrarKorumali: true, govde: duzenliOdemeGovdesi, cevap: zod.object({ duzenli: duzenliOdemeSemasi }),
    isle: async ({ db, kullanici, govde }) => ({ duzenli: await servis.duzenliEkle(db, kullanici, govde) as zod.output<typeof duzenliOdemeSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/:id/guncelle', yetki: 'finans.duzenli-odeme', parametre: kimlikParametresi, govde: duzenliOdemeGuncelleGovdesi, cevap: zod.object({ duzenli: duzenliOdemeSemasi }),
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ duzenli: await servis.duzenliGuncelle(db, kullanici, parametre.id, govde, denetimEki) as zod.output<typeof duzenliOdemeSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/:id/odendi', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: duzenliOdendiGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ belge: await servis.duzenliOdendi(db, kullanici, parametre.id, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/butce/belirle', yetki: 'finans.ayar', govde: butceGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.butceBelirle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/ayar/guncelle', yetki: 'finans.ayar', govde: ayarGuncelleGovdesi, cevap: ayarCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => ({ ayar: await servis.ayarGuncelle(db, kullanici, govde, denetimEki) as zod.output<typeof ayarCevabi>['ayar'] }) }),
  uc({ yontem: 'POST', yol: '/finans/toplu-ice-aktar', yetki: 'finans.ayar', tekrarKorumali: true, denetim: 'govdesiz', govde: topluAktarGovdesi, cevap: topluAktarCevabi,
    isle: ({ db, kullanici, govde }) => servis.topluAktar(db, kullanici, govde) }),

  // ---- danışman ve süreç ----
  uc({ yontem: 'POST', yol: '/finans/oneriler/durum', yetki: 'finans.yaz', govde: oneriDurumuGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.oneriDurumu(db, kullanici, govde) }),
  // Vergi beyanı (1846): okuma finans.oku, işaret ayrı işlem; zaman ve kişi sunucudan.
  uc({ yontem: 'GET', yol: '/finans/vergi-beyanlari', yetki: 'finans.oku', sorgu: vergiBeyaniSorgusu, cevap: vergiBeyanlariCevabi,
    isle: ({ db, sorgu }) => servis.vergiBeyanlari(db, sorgu.baslangic, sorgu.bitis) }),
  uc({ yontem: 'POST', yol: '/finans/vergi-beyani/isaretle', yetki: 'finans.beyan-yaz', tekrarKorumali: true, govde: vergiBeyaniGovdesi, cevap: vergiBeyaniGovdesi,
    isle: ({ db, kullanici, govde }) => servis.vergiBeyaniIsaretle(db, kullanici, govde, tesisGunu(new Date())) }),
  uc({ yontem: 'POST', yol: '/finans/kapanis/isaretle', yetki: 'finans.yaz', govde: kapanisGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kapanisIsaretle(db, kullanici, govde) }),
];

export const uclar = [...firmaUclari, ...paraUclari];

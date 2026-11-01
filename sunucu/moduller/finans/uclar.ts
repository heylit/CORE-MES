import { uc } from '#cekirdek/uc.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { firmaCevabi, firmaDurumGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { kimlikParametresi } from '#paylasilan/sozlesme/finans.ts';
import * as servis from './servis.ts';
import { z as zod } from 'zod';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  satisSevkleriCevabi, satisSevkleriSorgusu, satisSiparisleriCevabi, satisSiparisleriSorgusu, ayarCevabi, ayarGuncelleGovdesi, belgeCevabi, belgeDuzeltGovdesi, belgeEkleGovdesi, belgeListesiCevabi, butceGovdesi, butceListesiCevabi,
  cekCevabi, cekDuzeltGovdesi, cekEkleGovdesi, cekListesiCevabi, cekSonucGovdesi, cekTarihGovdesi, ciroGovdesi, dagilimListesiCevabi, dagitGovdesi,
  duzenliOdemeGovdesi, duzenliOdemeGuncelleGovdesi, duzenliOdemeListesiCevabi, duzenliOdemeSemasi, duzenliOdendiGovdesi, esitleGovdesi,
  aylikSeriCevabi, aylikSeriSorgusu, beklenenOdemelerCevabi, esitlemeListesiCevabi, finansListeSorgusu, finansOzetiCevabi, hesapCevabi, hesapEkleGovdesi, hesapGuncelleGovdesi, hesapListesiCevabi, iptalGovdesi, kapanisGovdesi,
  kapanisListesiCevabi, faizEkleGovdesi, faizListesiCevabi, genelGiderOraniEkleGovdesi, genelGiderOraniListesiCevabi, kdvOraniEkleGovdesi, kdvOraniKapatGovdesi, kdvOraniListesiCevabi, kurFaizAraligiCevabi, kurFaizAraligiSorgusu, kurFaizOzetiCevabi, kurFaizTopluCevabi, kurFaizTopluGovdesi, kurGovdesi, kurGuncelleGovdesi, kurListesiCevabi,
  mahsupCevabi, mahsupEkleGovdesi, mahsupListesiCevabi, odemeCevabi, odemeEkleGovdesi, odemeListesiCevabi, oneriDurumuGovdesi, oneriListesiCevabi,
  maliyetCevabi, maliyetListesiCevabi, maliyetTuruParametresi, maliyetYazGovdesi, amortismanCevabi, sabitKiymetCevabi, sabitKiymetEkleGovdesi, sabitKiymetListesiCevabi, sabitKiymetPasifGovdesi,
  skorListesiCevabi, topluAktarCevabi, topluAktarGovdesi, virmanEkleGovdesi, virmanListesiCevabi, virmanSemasi,
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
// Para kayıtları uçları. Okuma finans.oku; günlük kayıt finans.yaz; iptal, geri alma, tanım ve ayar finans.yonet.
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
  oku('/finans/duzenli-odemeler', 'duzenli', duzenliOdemeListesiCevabi),
  oku('/finans/butce', 'butce', butceListesiCevabi),
  oku('/finans/bakiye-esitlemeleri', 'esitleme', esitlemeListesiCevabi),
  oku('/finans/oneri-durumlari', 'oneri', oneriListesiCevabi),
  oku('/finans/kapanis', 'kapanis', kapanisListesiCevabi),
  oku('/finans/skorlar', 'skor', skorListesiCevabi),
  uc({ yontem: 'GET', yol: '/finans/sabit-kiymetler', yetki: 'finans.oku', sorgu: finansListeSorgusu, cevap: sabitKiymetListesiCevabi,
    isle: ({ db, sorgu }) => servis.sabitKiymetleriListele(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/finans/amortisman', yetki: 'finans.oku', cevap: amortismanCevabi, isle: ({ db }) => servis.amortismanAylari(db) }),
  // 952 a: ortak kur ve faiz şeridi her sayfadadır; giriş yapan herkes okur (yalnız kur, faiz ve giren kişi; finans rakamı yok).
  uc({ yontem: 'GET', yol: '/finans/kur-ozeti', yetki: 'oturum', cevap: kurFaizOzetiCevabi, isle: ({ db }) => servis.kurFaizOzeti(db, tesisGunu(new Date())) }),
  // 1089 a: şeridin kur grafiği ve toplu yükleme önizlemesi; şerit gibi giriş yapan herkes okur (yalnız kur ve faiz).
  uc({ yontem: 'GET', yol: '/finans/kur-faiz-araligi', yetki: 'oturum', sorgu: kurFaizAraligiSorgusu, cevap: kurFaizAraligiCevabi,
    isle: ({ db, sorgu }) => servis.kurFaizAraligi(db, sorgu.baslangic, sorgu.bitis) }),
  uc({ yontem: 'GET', yol: '/finans/ayar', yetki: 'finans.oku', cevap: ayarCevabi, isle: async ({ db }) => ({ ayar: await servis.ayarOku(db) as zod.output<typeof ayarCevabi>['ayar'] }) }),
  uc({ yontem: 'GET', yol: '/finans/aylik-seri', yetki: 'finans.oku', sorgu: aylikSeriSorgusu, cevap: aylikSeriCevabi,
    isle: ({ db, sorgu }) => servis.aylikSeri(db, tesisGunu(new Date()), sorgu.ay) }),
  uc({ yontem: 'GET', yol: '/finans/ozet', yetki: 'finans.oku', cevap: finansOzetiCevabi, isle: ({ db }) => servis.panoOzeti(db) }),
  // Kart #1124: faturası gelmemiş satın alma siparişlerinin ödeme planı, vadeye göre.
  uc({ yontem: 'GET', yol: '/finans/beklenen-odemeler', yetki: 'finans.oku', cevap: beklenenOdemelerCevabi, isle: ({ db }) => servis.beklenenOdemeler(db) }),
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
  uc({ yontem: 'POST', yol: '/finans/belgeler/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: iptalGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ belge: await servis.belgeIptal(db, kullanici, parametre.id, govde.surum, govde.neden, denetimEki) }) }),

  // ---- ödeme, dağıtım, mahsup ----
  uc({ yontem: 'POST', yol: '/finans/odemeler/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: odemeEkleGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, govde }) => ({ odeme: await servis.odemeEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/odemeler/:id/dagit', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: dagitGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ odeme: await servis.odemeDagit(db, kullanici, parametre.id, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/odemeler/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: iptalGovdesi, cevap: odemeCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ odeme: await servis.odemeIptal(db, kullanici, parametre.id, govde.surum, govde.neden, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/dagitimlar/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: zod.object({}), cevap: zod.object({ belge: belgeCevabi.shape.belge, odeme: odemeCevabi.shape.odeme }),
    isle: ({ db, kullanici, parametre, denetimEki }) => servis.dagilimIptalEt(db, kullanici, parametre.id, denetimEki) }),
  uc({ yontem: 'POST', yol: '/finans/mahsuplar/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: mahsupEkleGovdesi, cevap: mahsupCevabi,
    isle: async ({ db, kullanici, govde }) => ({ mahsup: await servis.mahsupEkle(db, kullanici, govde) as zod.output<typeof mahsupCevabi>['mahsup'] }) }),
  uc({ yontem: 'POST', yol: '/finans/mahsuplar/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: mahsupCevabi,
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
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/karsiliksiz', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: cekTarihGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'karsiliksiz', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/geri-al', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'geri-al', govde, denetimEki) }) }),
  uc({ yontem: 'POST', yol: '/finans/cekler/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: cekCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ cek: await servis.cekKomutu(db, kullanici, parametre.id, 'iptal', govde, denetimEki) }) }),

  // ---- hesap, virman ----
  uc({ yontem: 'POST', yol: '/finans/hesaplar/ekle', yetki: 'finans.yonet', govde: hesapEkleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, govde }) => ({ hesap: await servis.hesapEkle(db, kullanici, govde) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/guncelle', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: hesapGuncelleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ hesap: await servis.hesapGuncelle(db, kullanici, parametre.id, govde, denetimEki) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/pasif', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapDurumu(db, kullanici, parametre.id, govde.surum, false) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/aktif', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapDurumu(db, kullanici, parametre.id, govde.surum, true) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/hesaplar/:id/esitle', yetki: 'finans.yonet', tekrarKorumali: true, parametre: kimlikParametresi, govde: esitleGovdesi, cevap: hesapCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ hesap: await servis.hesapEsitle(db, kullanici, parametre.id, govde) as zod.output<typeof hesapCevabi>['hesap'] }) }),
  uc({ yontem: 'POST', yol: '/finans/virmanlar/ekle', yetki: 'finans.yaz', tekrarKorumali: true, govde: virmanEkleGovdesi, cevap: zod.object({ virman: virmanSemasi }),
    isle: async ({ db, kullanici, govde }) => ({ virman: await servis.virmanEkle(db, kullanici, govde) as zod.output<typeof virmanSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/virmanlar/:id/iptal', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: surumGovdesi, cevap: zod.object({ virman: virmanSemasi }),
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ virman: await servis.virmanIptal(db, kullanici, parametre.id, govde.surum, denetimEki) as zod.output<typeof virmanSemasi> }) }),

  // ---- tanımlar ve ayar ----
  uc({ yontem: 'POST', yol: '/finans/kurlar/ekle', yetki: 'finans.kur-yaz', govde: kurGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kurEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kurlar/guncelle', yetki: 'finans.kur-yaz', govde: kurGuncelleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde, denetimEki }) => servis.kurGuncelle(db, kullanici, govde, denetimEki) }),
  uc({ yontem: 'POST', yol: '/finans/faizler/ekle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: faizEkleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.faizEkle(db, kullanici, govde) }),
  // 1087 a: toplu yükleme tek tek girişle aynı işlemdir (muhasebe ve satın alma).
  uc({ yontem: 'POST', yol: '/finans/kur-faiz/toplu-yukle', yetki: 'finans.kur-yaz', tekrarKorumali: true, govde: kurFaizTopluGovdesi, cevap: kurFaizTopluCevabi,
    isle: ({ db, kullanici, govde }) => servis.kurFaizTopluYukle(db, kullanici, govde) }),
  // 260 a: satış formundaki sipariş seçimi; fatura yazanın yetkisiyle (sipariş no ve durumu, tutar yok).
  uc({ yontem: 'GET', yol: '/finans/satis-siparisleri', yetki: 'finans.yaz', sorgu: satisSiparisleriSorgusu, cevap: satisSiparisleriCevabi,
    isle: ({ db, sorgu }) => servis.satisSiparisleri(db, sorgu.firmaId) }),
  uc({ yontem: 'GET', yol: '/finans/satis-sevkleri', yetki: 'finans.yaz', sorgu: satisSevkleriSorgusu, cevap: satisSevkleriCevabi,
    isle: ({ db, sorgu }) => servis.satisSevkleriOku(db, sorgu.siparisId) }),
  // Genel gider oranı maliyet tanımıdır: birim maliyetlerle aynı yetkiler (okuma finans.maliyet-oku, yazma finans.yonet).
  uc({ yontem: 'GET', yol: '/finans/genel-gider-oranlari', yetki: 'finans.maliyet-oku', sorgu: finansListeSorgusu, cevap: genelGiderOraniListesiCevabi,
    isle: ({ db, sorgu }) => servis.listele(db, 'genelGider', sorgu) }),
  uc({ yontem: 'POST', yol: '/finans/genel-gider-oranlari/ekle', yetki: 'finans.yonet', govde: genelGiderOraniEkleGovdesi, cevap: anahtarCevap,
    isle: ({ db, kullanici, govde }) => servis.genelGiderOraniEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/sabit-kiymetler/ekle', yetki: 'finans.yonet', tekrarKorumali: true, govde: sabitKiymetEkleGovdesi, cevap: sabitKiymetCevabi,
    isle: async ({ db, kullanici, govde }) => ({ sabitKiymet: await servis.sabitKiymetEkle(db, kullanici, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/sabit-kiymetler/:id/pasif', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: sabitKiymetPasifGovdesi, cevap: sabitKiymetCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ sabitKiymet: await servis.sabitKiymetPasif(db, kullanici, parametre.id, govde, denetimEki) }) }),
  uc({ yontem: 'GET', yol: '/finans/maliyetler/:tur', yetki: 'finans.maliyet-oku', parametre: maliyetTuruParametresi, sorgu: finansListeSorgusu, cevap: maliyetListesiCevabi,
    isle: ({ db, parametre, sorgu }) => servis.maliyetleriListele(db, parametre.tur, sorgu) }),
  uc({ yontem: 'POST', yol: '/finans/maliyetler/:tur/yaz', yetki: 'finans.yonet', parametre: maliyetTuruParametresi, govde: maliyetYazGovdesi, cevap: maliyetCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ maliyet: await servis.maliyetYaz(db, kullanici, parametre.tur, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/kdv-oranlari/ekle', yetki: 'finans.yonet', govde: kdvOraniEkleGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kdvOraniEkle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kdv-oranlari/kapat', yetki: 'finans.yonet', govde: kdvOraniKapatGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kdvOraniKapat(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/ekle', yetki: 'finans.yonet', tekrarKorumali: true, govde: duzenliOdemeGovdesi, cevap: zod.object({ duzenli: duzenliOdemeSemasi }),
    isle: async ({ db, kullanici, govde }) => ({ duzenli: await servis.duzenliEkle(db, kullanici, govde) as zod.output<typeof duzenliOdemeSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/:id/guncelle', yetki: 'finans.yonet', parametre: kimlikParametresi, govde: duzenliOdemeGuncelleGovdesi, cevap: zod.object({ duzenli: duzenliOdemeSemasi }),
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ duzenli: await servis.duzenliGuncelle(db, kullanici, parametre.id, govde, denetimEki) as zod.output<typeof duzenliOdemeSemasi> }) }),
  uc({ yontem: 'POST', yol: '/finans/duzenli-odemeler/:id/odendi', yetki: 'finans.yaz', tekrarKorumali: true, parametre: kimlikParametresi, govde: duzenliOdendiGovdesi, cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ belge: await servis.duzenliOdendi(db, kullanici, parametre.id, govde) }) }),
  uc({ yontem: 'POST', yol: '/finans/butce/belirle', yetki: 'finans.yonet', govde: butceGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.butceBelirle(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/ayar/guncelle', yetki: 'finans.yonet', govde: ayarGuncelleGovdesi, cevap: ayarCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => ({ ayar: await servis.ayarGuncelle(db, kullanici, govde, denetimEki) as zod.output<typeof ayarCevabi>['ayar'] }) }),
  uc({ yontem: 'POST', yol: '/finans/toplu-ice-aktar', yetki: 'finans.yonet', tekrarKorumali: true, denetim: 'govdesiz', govde: topluAktarGovdesi, cevap: topluAktarCevabi,
    isle: ({ db, kullanici, govde }) => servis.topluAktar(db, kullanici, govde) }),

  // ---- danışman ve süreç ----
  uc({ yontem: 'POST', yol: '/finans/oneriler/durum', yetki: 'finans.yaz', govde: oneriDurumuGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.oneriDurumu(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/finans/kapanis/isaretle', yetki: 'finans.yaz', govde: kapanisGovdesi, cevap: anahtarCevap, isle: ({ db, kullanici, govde }) => servis.kapanisIsaretle(db, kullanici, govde) }),
];

export const uclar = [...firmaUclari, ...paraUclari];

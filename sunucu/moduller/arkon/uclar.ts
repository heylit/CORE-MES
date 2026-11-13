import { ikiliCevap, ikiliCevapYaDaBos, uc } from '#cekirdek/uc.ts';
import {
  anomaliCevabi, anomaliIstatistikCevabi, eksikIslerCevabi, eksikIslerimCevabi, anomaliOlaylariCevabi, anomaliIstatistikSorgusu, operatorOzetiCevabi, operatorOzetiSorgusu, arkonBenCevabi, arkonKisilerCevabi, arkonMalzemelerCevabi, malzemeAramaSorgusu, belgeCevabi, belgeParametresi, belgeSilGovdesi, belgeYazCevabi, belgeYazGovdesi,
  belgelerCevabi, depoParametresi, dosyaParametresi, dosyaParcasiCevabi, dosyaParcasiGovdesi,
  eksikDosyaCevabi, eksikDosyaGovdesi, iletiGovdesi, iletiSorgusu, iletilerCevabi, kayitEkleCevabi, kayitEkleGovdesi, makineDevralGovdesi, calismaDevralGovdesi,
  kayitParametresi, kayitSorgusu, kayitlarCevabi, islerimCevabi, makineAyrimlariCevabi, makineAyrimlariSorgusu, planSiralaCevabi, planSiraSurumuCevabi, arkonOzetiCevabi, planSiralaGovdesi, tamamCevabi, kendiSayimParametresi, yansimaParametresi, yansimaSorgusu, yansimaYenidenCevabi, yansimalarCevabi,
  kuyrukPlanaDonCevabi, kuyrukPlanaDonGovdesi, kuyrukSiralaCevabi, kuyrukSiralaGovdesi,
  hazirlikMaddeleriCevabi, hazirlikMaddeleriSorgusu, hazirlikMaddesiEkleGovdesi, hazirlikMaddesiIsaretleGovdesi, hazirlikMaddesiParametresi,
  numuneOlcumuGovdesi, numuneParametresi, merkezBelgeParametresi, merkezBelgeSorgusu, refakatKartlariCevabi, refakatKartlariSorgusu, sonOlaylarCevabi, sonOlaylarSorgusu, merkezBelgelerCevabi, merkezEkleCevabi, merkezKontrolCevabi, merkezKontrolSorgusu,
} from '#paylasilan/sozlesme/arkon.ts';
import { anomaliOlaylari } from './anomali-zaman.ts';
import { eksikIsler, eksikIslerim } from './eksik-is/servis.ts';
import * as servis from './servis.ts';
import { goruntuSorgusu } from './pdf-goruntu/kurallar.ts';
import { pdfGoruntusu } from './pdf-goruntu/servis.ts';

// Okuma ve yazma uçları Arkon'u açan üç sayfadan birini ister (Arkon rolü olan her TMI rolünde var; rol dağılımı testi). Yazma için
// kullanıcının yazılı onayı (17.10.2026, ADR 0007 madde 2): oturumu olan ama bu sayfaları görmeyen kişi yazamasın.
// Arkon rolü (hangi rol) her uçta servis katmanında denetlenir: rolü olmayan 403 alır. Arkon'un kendi sayfa yetkileri Arkon arayüzünde uygulanır.
// Üretim Terminali ve Kuyruk Arkon'u ayrı TMI sayfası olarak açar ve verisini bu uçlardan okur ve yazar: o sayfayı gören, Arkon MES sayfası olmadan da çalışır (#722).
const ARKON_SAYFASI = { biri: ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk'] } as const;
// Fabrika Haritası "Son hareketler" (#1122): haritayı gören de okur; veri kapsamı serviste uygulanır.
const SON_OLAY_OKUMA = { biri: [...ARKON_SAYFASI.biri, 'sayfa.atolye'] } as const;
// Anomali panosunu görenler: hazırlık, planlama ve yönetici (kart #1149 kararı).
// Amir de okur (2421-4 a): eksik işi sahada kapatan odur; kişi adları yine arkon.anomali-kisi ister.
const ANOMALI_OKUMA = { biri: ['arkon.hazirlik', 'arkon.planlama', 'arkon.amir', 'arkon.yonetici'] } as const;
// İş emrine özel hazırlık maddesi (2227-1 b): Arkon rolüne değil işleme bağlıdır. Hazırlık ve yönetici yazar, planlama da okur.
const HAZIRLIK_MADDESI_OKUMA = { biri: ['arkon.hazirlik', 'arkon.planlama', 'arkon.yonetici'] } as const;
const HAZIRLIK_MADDESI_YAZMA = { biri: ['arkon.hazirlik', 'arkon.yonetici'] } as const;
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/arkon/son-olaylar',
    yetki: SON_OLAY_OKUMA,
    sorgu: sonOlaylarSorgusu,
    cevap: sonOlaylarCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.sonOlaylar(db, kullanici, sorgu.sonraId ?? null, sorgu.sayi),
  }),
  // TMI ekranı (#243): Arkon rolü değil, ayrı işlem ister.
  uc({
    yontem: 'GET',
    yol: '/arkon/tmi-yansimalari',
    yetki: 'arkon.yansima-oku',
    sorgu: yansimaSorgusu,
    cevap: yansimalarCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.yansimaListesi(db, kullanici, sorgu),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/tmi-yansimalari/:id/yeniden-dene',
    yetki: 'arkon.yansima-yeniden',
    parametre: yansimaParametresi,
    cevap: yansimaYenidenCevabi,
    isle: ({ db, kullanici, parametre, gunluk }) => servis.yansimaYenidenDene(db, kullanici, parametre.id, gunluk),
  }),
  // Kişinin kendi reddedilen sayımı (3167 b): kayıt yazma uçlarının sayfa yetkisi; Arkon rolü, kapsam ve sahiplik serviste denetlenir.
  uc({
    yontem: 'POST',
    yol: '/arkon/kayitlar/counts/:cid/yeniden-dene',
    yetki: ARKON_SAYFASI,
    parametre: kendiSayimParametresi,
    cevap: yansimaYenidenCevabi,
    isle: ({ db, kullanici, parametre, gunluk }) => servis.kendiSayiminiYenidenDene(db, kullanici, parametre.cid, gunluk),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/ben',
    yetki: ARKON_SAYFASI,
    cevap: arkonBenCevabi,
    isle: async ({ db, kullanici }) => ({ kisi: await servis.ben(db, kullanici) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/kisiler',
    yetki: ARKON_SAYFASI,
    cevap: arkonKisilerCevabi,
    isle: async ({ db, kullanici }) => ({ kisiler: await servis.kisiler(db, kullanici) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/malzemeler',
    yetki: ARKON_SAYFASI,
    sorgu: malzemeAramaSorgusu,
    cevap: arkonMalzemelerCevabi,
    isle: async ({ db, kullanici, sorgu }) => ({ malzemeler: await servis.malzemeler(db, kullanici, sorgu.ara ?? null) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/belgeler/:depo',
    yetki: ARKON_SAYFASI,
    parametre: depoParametresi,
    cevap: belgelerCevabi,
    isle: async ({ db, kullanici, parametre }) => ({ belgeler: await servis.belgeler(db, kullanici, parametre.depo) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/belgeler/:depo/:kimlik',
    yetki: ARKON_SAYFASI,
    parametre: belgeParametresi,
    cevap: belgeCevabi,
    isle: async ({ db, kullanici, parametre }) => ({
      belge: await servis.belge(db, kullanici, parametre.depo, parametre.kimlik),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/belgeler/:depo/:kimlik/yaz',
    yetki: ARKON_SAYFASI,
    parametre: belgeParametresi,
    govde: belgeYazGovdesi,
    cevap: belgeYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.belgeYaz(db, kullanici, parametre.depo, parametre.kimlik, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/numuneler/:kimlik/olcum',
    yetki: ARKON_SAYFASI,
    parametre: numuneParametresi,
    govde: numuneOlcumuGovdesi,
    cevap: tamamCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.numuneOlcumuYaz(db, kullanici, parametre.kimlik, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/belgeler/:depo/:kimlik/sil',
    yetki: ARKON_SAYFASI,
    parametre: belgeParametresi,
    govde: belgeSilGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await servis.belgeSil(db, kullanici, parametre.depo, parametre.kimlik, govde);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/kayitlar/:tur/ekle',
    yetki: ARKON_SAYFASI,
    parametre: kayitParametresi,
    govde: kayitEkleGovdesi,
    cevap: kayitEkleCevabi,
    isle: ({ db, kullanici, parametre, govde, gunluk }) => servis.kayitEkle(db, kullanici, parametre.tur, govde.satirlar, govde.kaynak, gunluk),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/makine-devral',
    yetki: ARKON_SAYFASI,
    govde: makineDevralGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, govde }) => {
      await servis.makineDevralOnayla(db, kullanici, govde);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/calisma-devral',
    yetki: ARKON_SAYFASI,
    govde: calismaDevralGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, govde }) => {
      await servis.calismaDevralOnayla(db, kullanici, govde);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/kayitlar/:tur',
    yetki: ARKON_SAYFASI,
    parametre: kayitParametresi,
    sorgu: kayitSorgusu,
    cevap: kayitlarCevabi,
    isle: async ({ db, kullanici, parametre, sorgu }) => {
      // Okuma anı sorgudan önce alınır: sorgu sürerken varan kayıt bir sonraki artımlı okumada da gelir (ekran cid ile tekler).
      const okumaAni = Date.now();
      const satirlar = await servis.kayitlar(db, kullanici, parametre.tur, sorgu);
      return { satirlar, okumaAni, ...(satirlar.length >= (sorgu.sinir ?? servis.VARSAYILAN_KAYIT_SINIRI) ? { kesildi: true } : {}) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/dosyalar/eksikler',
    yetki: ARKON_SAYFASI,
    denetim: 'govdesiz',
    govde: eksikDosyaGovdesi,
    cevap: eksikDosyaCevabi,
    isle: async ({ db, kullanici, govde }) => ({ eksikler: await servis.eksikDosyalar(db, kullanici, govde.ozetler) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/dosyalar/:ozet/parca',
    yetki: ARKON_SAYFASI,
    denetim: 'govdesiz',
    parametre: dosyaParametresi,
    govde: dosyaParcasiGovdesi,
    cevap: dosyaParcasiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({
      tamam: await servis.dosyaParcasi(db, kullanici, parametre.ozet, govde),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/dosyalar/:ozet',
    yetki: ARKON_SAYFASI,
    parametre: dosyaParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.dosya(db, kullanici, parametre.ozet),
  }),
  // ADR 0032: PDF sayfasının sunucuda hazırlanmış renkli görüntüsü. Okuma kuralı dosyanınkiyle aynıdır; görüntü henüz yoksa boş döner,
  // tablet kendisi çizer.
  uc({
    yontem: 'GET',
    yol: '/arkon/dosyalar/:ozet/goruntu',
    yetki: ARKON_SAYFASI,
    parametre: dosyaParametresi,
    sorgu: goruntuSorgusu,
    cevap: ikiliCevapYaDaBos,
    isle: ({ db, kullanici, parametre, sorgu }) => pdfGoruntusu(db, kullanici, parametre.ozet, sorgu.sayfa, sorgu.imza),
  }),
  // Terminal paketin dosyalarını açılmadan önce arka planda cihaza indirir (726 a); kişinin açmadığı dosya indirme denetimine
  // yazılmaz (730 a). Okuma kuralı yukarıdaki uçla aynıdır; kişinin açtığı dosya o uçtan gelir ve deftere yazılır.
  uc({
    yontem: 'GET',
    yol: '/arkon/dosyalar/:ozet/arka-plan',
    yetki: ARKON_SAYFASI,
    kendiligindenYuklenir: true,
    parametre: dosyaParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.dosya(db, kullanici, parametre.ozet),
  }),
  // Çizim Merkezi seçicisi (#800): okuma ucu sayfa yetkisiyle açılır, paket düzenleme rolü servis katmanında denetlenir.
  uc({
    yontem: 'GET',
    yol: '/arkon/cizim-merkezi/belgeler',
    yetki: ARKON_SAYFASI,
    sorgu: merkezBelgeSorgusu,
    cevap: merkezBelgelerCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.merkezBelgeleri(db, kullanici, sorgu.ara === undefined || sorgu.ara === '' ? null : sorgu.ara, sorgu.malzeme ?? null),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/cizim-merkezi/kontrol',
    yetki: ARKON_SAYFASI,
    sorgu: merkezKontrolSorgusu,
    cevap: merkezKontrolCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.merkezKontrol(db, kullanici, sorgu.dosyalar),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/cizim-merkezi/belgeler/:belgeId/ekle',
    yetki: ARKON_SAYFASI,
    parametre: merkezBelgeParametresi,
    cevap: merkezEkleCevabi,
    isle: ({ db, kullanici, parametre }) => servis.merkezdenDosyaEkle(db, kullanici, parametre.belgeId),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/iletiler',
    yetki: ARKON_SAYFASI,
    sorgu: iletiSorgusu,
    cevap: iletilerCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.iletiler(db, kullanici, sorgu.son, sorgu.kaynak),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/iletiler',
    yetki: ARKON_SAYFASI,
    // Cevabı kaybolan iletinin yinelemesi (çağrı, numune isteği) ikinci kez yayımlanmasın; kimlik uygulamanın ileti kimliğidir.
    tekrarKorumali: true,
    govde: iletiGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, govde }) => {
      await servis.iletiGonder(db, kullanici, govde.ileti, govde.kaynak);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/ozet',
    yetki: ARKON_SAYFASI,
    cevap: arkonOzetiCevabi,
    isle: ({ db, kullanici }) => servis.arkonOzeti(db, kullanici),
  }),
  // Üretim anomalisi (kart #1149): hazırlık sayfasının panosu; eşikler Ayarlar'dadır.
  uc({
    yontem: 'GET',
    yol: '/arkon/anomaliler',
    yetki: ANOMALI_OKUMA,
    cevap: anomaliCevabi,
    isle: ({ db, kullanici }) => servis.anomaliler(db, kullanici),
  }),
  // Zaman olayları (kart 764): geç giriş, geç teslim, sonraki işe etki, teslim riski; 15 dakikalık işin yazdığı kayıtlardan, kapsamla süzülü.
  uc({
    yontem: 'GET',
    yol: '/arkon/anomali-olaylari',
    yetki: ANOMALI_OKUMA,
    cevap: anomaliOlaylariCevabi,
    isle: ({ db, kullanici }) => anomaliOlaylari(db, kullanici),
  }),
  // Eksik iş (kart 2421 c): plandan bağımsız eksik, geride ya da geciken iş; 15 dakikalık işin yazdığı kayıtlardan, kapsamla süzülü.
  uc({
    yontem: 'GET',
    yol: '/arkon/eksik-isler',
    yetki: ANOMALI_OKUMA,
    cevap: eksikIslerCevabi,
    isle: ({ db, kullanici }) => eksikIsler(db, kullanici),
  }),
  // Terminalde "Girilmemiş işlerim" (2421 c): kişi yalnız kendi tezgahlarının ve işlerinin açık eksiklerini görür.
  uc({
    yontem: 'GET',
    yol: '/arkon/eksik-islerim',
    yetki: ARKON_SAYFASI,
    cevap: eksikIslerimCevabi,
    isle: ({ db, kullanici }) => eksikIslerim(db, kullanici),
  }),
  // Gün, hafta, ay istatistiği (kart #1306): kaydedilmiş günlerden; kişi kırılımı yalnız arkon.anomali-kisi ile.
  uc({
    yontem: 'GET',
    yol: '/arkon/anomali-istatistik',
    yetki: ANOMALI_OKUMA,
    sorgu: anomaliIstatistikSorgusu,
    cevap: anomaliIstatistikCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.anomaliIstatistigi(db, kullanici, sorgu),
  }),
  // Operatör Özetim (kart #1295): Arkon operatörü kendini, amiri kendi iş merkezindekileri görür; rol ve kapsam serviste.
  uc({
    yontem: 'GET',
    yol: '/arkon/operator-ozeti',
    yetki: ARKON_SAYFASI,
    sorgu: operatorOzetiSorgusu,
    cevap: operatorOzetiCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.operatorOzeti(db, kullanici, sorgu),
  }),
  // Terminalin makine seçicisi (393 d): ayrılmış makineyi başlatmadan önce gösterir; son söz başlatma komutundadır.
  uc({
    yontem: 'GET',
    yol: '/arkon/makine-ayrimlari',
    yetki: ARKON_SAYFASI,
    sorgu: makineAyrimlariSorgusu,
    cevap: makineAyrimlariCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.makineAyrimlari(db, kullanici, sorgu.emirId),
  }),
  // 2125-1 b: çarkın "İşlerim" şeridi; kişi yalnız kendi çalışan işlerini okur.
  uc({
    yontem: 'GET',
    yol: '/arkon/islerim',
    yetki: ARKON_SAYFASI,
    cevap: islerimCevabi,
    isle: ({ db, kullanici }) => servis.islerim(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/refakat-kartlari',
    yetki: ARKON_SAYFASI,
    sorgu: refakatKartlariSorgusu,
    cevap: refakatKartlariCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.refakatKartlari(db, kullanici, sorgu.istasyon, sorgu.emirler),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/plan-sira/surum',
    yetki: ARKON_SAYFASI,
    cevap: planSiraSurumuCevabi,
    isle: ({ db, kullanici }) => servis.planSiraSurumu(db, kullanici),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/plan-sira/sirala',
    yetki: ARKON_SAYFASI,
    govde: planSiralaGovdesi,
    cevap: planSiralaCevabi,
    isle: ({ db, kullanici, govde }) => servis.planSirasiYaz(db, kullanici, govde),
  }),
  // Üretim Hazırlık kuyruk sırası (kart 527, 522 2 a): Arkon rolü değil, ayrı işlem ister; plan değişmez.
  uc({
    yontem: 'POST',
    yol: '/arkon/kuyruk-sira/sirala',
    yetki: 'arkon.kuyruk-sirala',
    govde: kuyrukSiralaGovdesi,
    cevap: kuyrukSiralaCevabi,
    isle: ({ db, kullanici, govde }) => servis.kuyrukSirasiYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/kuyruk-sira/plana-don',
    yetki: 'arkon.kuyruk-sirala',
    govde: kuyrukPlanaDonGovdesi,
    cevap: kuyrukPlanaDonCevabi,
    isle: ({ db, kullanici, govde }) => servis.kuyrukPlanaDon(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/hazirlik-maddeleri',
    yetki: HAZIRLIK_MADDESI_OKUMA,
    sorgu: hazirlikMaddeleriSorgusu,
    cevap: hazirlikMaddeleriCevabi,
    isle: ({ db, sorgu }) => servis.hazirlikMaddeleriListesi(db, sorgu.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/hazirlik-maddeleri',
    yetki: HAZIRLIK_MADDESI_YAZMA,
    govde: hazirlikMaddesiEkleGovdesi,
    cevap: hazirlikMaddeleriCevabi,
    isle: ({ db, kullanici, govde }) => servis.hazirlikMaddesiEkle(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/arkon/hazirlik-maddeleri/:id/isaretle',
    yetki: HAZIRLIK_MADDESI_YAZMA,
    parametre: hazirlikMaddesiParametresi,
    govde: hazirlikMaddesiIsaretleGovdesi,
    cevap: hazirlikMaddeleriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.hazirlikMaddesiIsaretle(db, kullanici, parametre.id, govde.olay),
  }),
];

// Terminalin 3B montaj sahnesi (3209 a, 3213): işin görünürlüğü ve iş-talimat-sahne bağı serviste denetlenir; model listesi ucu yoktur.
import { isEmriSahneParametresi, isEmriSahnesiCevabi } from '#paylasilan/sozlesme/rota.ts';
uclar.push(
  uc({
    yontem: 'GET',
    yol: '/arkon/is-emirleri/:isEmriId/sahne',
    yetki: ARKON_SAYFASI,
    parametre: isEmriSahneParametresi,
    cevap: isEmriSahnesiCevabi,
    isle: ({ db, kullanici, parametre }) => servis.isEmriSahnesi(db, kullanici, parametre.isEmriId),
  }),
  uc({
    yontem: 'GET',
    yol: '/arkon/is-emirleri/:isEmriId/sahne-modeli',
    yetki: ARKON_SAYFASI,
    parametre: isEmriSahneParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.isEmriSahneModeli(db, kullanici, parametre.isEmriId),
  }),
);

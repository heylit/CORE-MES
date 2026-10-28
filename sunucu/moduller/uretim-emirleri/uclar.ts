import { uc } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import {
  ADIMLI_OKUMA_ISLEMLERI, adimCevabi, adimParametresi, adimTamamlaGovdesi, emirAyrintiCevabi, emirCevabi,
  emirParametresi, izlemeListeCevabi, bitenEmirlerCevabi, bitenEmirlerSorgusu, adimliBitenlerCevabi, adimliBitenlerSorgusu,
  emirlerSorgusu,
  adimKaynagiGovdesi, uretimYeriGovdesi, fasonFirmalariCevabi, adimliEmirCevabi, adimliIptalGovdesi, adimliListeCevabi, adimliListeSorgusu, adimliOzetCevabi, fasonGidisGovdesi, siradakiFasonCevabi,
  asimlarCevabi, fasonHareketiCevabi, isEmriParametresi, oncelikGovdesi, ozetCevabi, partiBirlestirGovdesi, partiBolCevabi, partiBolGovdesi, planaAlGovdesi,
  birlesmePlaniGovdesi, ekAdimGovdesi, ekAdimKaldirGovdesi, hazirlikCevabi, hazirlikMuafiyetiGovdesi, refakatKartiCevabi, katilimCevabi, rotasizAdimDuzenleGovdesi, rotasizAdimEkleGovdesi, rotasizAdimSilGovdesi, rotasizEmirCevabi, rotasizEmirGovdesi, acilisSecenekleriCevabi, acilisSecenekleriSorgusu, makineDevralGovdesi, durusDagilimiCevabi, sonOlaylarCevabi, sonOlaylarSorgusu, gunlukUretimCevabi, panelSorgusu, sureOzetiCevabi,
  hataliCevabi, hataliGovdesi, hataliListeCevabi, hataliListeSorgusu, reworkAdimiGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { aramaUclari } from './arama/uclar.ts';
import * as isEmri from './is-emri-servis.ts';
import { hataliKaydet, hataliKayitlari } from './hatali-parca.ts';
import { hazirlik, muafiyetVer } from './hazirlik.ts';
import {
  adimTamamla, anaSayfaOzeti, asimlar, durusDagilimi, emirAyar, emirAyrintisi, emirDuraklat, katil, katilimAyril, katilimDuraklat, katilimlar, makineDevral, sonOlaylar,
  izlemeListesi, bitenEmirler, gunlukUretim, isEmriSureOzeti,
} from './servis.ts';

const ADIMLI_OKUMA = { biri: ADIMLI_OKUMA_ISLEMLERI } as const;
// 288 a: ana sayfa sayılarını planı gören de okur; emir listesi ve ayrıntısı ADIMLI_OKUMA'da kalır.
const ADIMLI_OZET_OKUMA = { biri: [...ADIMLI_OKUMA_ISLEMLERI, 'plan.oku'] } as const;
// Katılımları ve emrin ayrıntısını terminaldeki kişi de listeyi okuyan da görür.
const KATILIM_OKUMA = { biri: [...ADIMLI_OKUMA_ISLEMLERI, 'terminal.uret'] } as const;
// Açık emir listesini Stok'un emir seçicisi ve Fabrika Haritası da okur; terminal listeyi kullanmaz, emirle işi olmayan rol okumaz.
const LISTE_OKUMA = { biri: [...ADIMLI_OKUMA_ISLEMLERI, 'sayfa.stok', 'sayfa.atolye'] } as const;

const emirUclari = [
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri',
    yetki: LISTE_OKUMA,
    sorgu: emirlerSorgusu,
    cevap: izlemeListeCevabi,
    isle: ({ db, sorgu }) => izlemeListesi(db, sorgu.durum, sorgu.istasyonsuz === '1', sorgu.kapsam === 'hepsi'),
  }),
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/bitenler',
    yetki: ADIMLI_OKUMA,
    sorgu: bitenEmirlerSorgusu,
    cevap: bitenEmirlerCevabi,
    isle: ({ db, sorgu }) => bitenEmirler(db, { durum: sorgu.durum ?? null, ara: sorgu.ara ?? null }, sorgu.istasyonsuz === '1', sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/:id',
    yetki: KATILIM_OKUMA,
    parametre: emirParametresi,
    cevap: emirAyrintiCevabi,
    isle: ({ db, parametre }) => emirAyrintisi(db, parametre.id),
  }),
  // Ayar sıradaki işin ayarını başlatır; başlatma kapatır.
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/ayar',
    yetki: 'terminal.uret',
    parametre: emirParametresi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre }) => emirAyar(db, kullanici.id, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/makine-devral',
    yetki: 'terminal.uret',
    parametre: emirParametresi,
    govde: makineDevralGovdesi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre, govde }) => makineDevral(db, kullanici.id, parametre.id, govde.kullanimId),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/duraklat',
    yetki: 'terminal.uret',
    tekrarKorumali: true,
    parametre: emirParametresi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre }) => emirDuraklat(db, kullanici.id, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/adimlar/:adimId/tamamla',
    yetki: 'terminal.uret',
    parametre: adimParametresi,
    govde: adimTamamlaGovdesi,
    cevap: adimCevabi,
    isle: ({ db, kullanici, parametre, govde }) => adimTamamla(db, kullanici.id, parametre.id, parametre.adimId, govde.tamam),
  }),
];

// İş emirli üretim emri (UE19). Yeni emir ve "emirlere uygula" rotanındır (ADR 0006: rota bu modülü çağırır, tersi değil).

const katilimUclari = [
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/:id/katilimlar',
    yetki: KATILIM_OKUMA,
    parametre: emirParametresi,
    cevap: katilimCevabi,
    isle: ({ db, parametre }) => katilimlar(db, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/katil',
    yetki: 'terminal.uret',
    parametre: emirParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katil(db, kullanici.id, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/katilim/duraklat',
    yetki: 'terminal.uret',
    parametre: emirParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katilimDuraklat(db, kullanici.id, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/katilim/ayril',
    yetki: 'terminal.uret',
    parametre: emirParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katilimAyril(db, kullanici.id, parametre.id),
  }),
];

const adimliUclar = [
  // Ana sayfa sayıları oturumla açılır; iş emirli liste sayıları yalnız listeyi okuyabilene verilir.
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/ozet',
    yetki: 'oturum',
    cevap: ozetCevabi,
    isle: ({ db, kullanici }) => anaSayfaOzeti(db, kullanici.id, ADIMLI_OKUMA.biri.some((i) => islemVarMi(kullanici, i))),
  }),
  // Yönetici paneli serileri: emir listesini okuyan görür.
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/gunluk-uretim',
    yetki: ADIMLI_OKUMA,
    sorgu: panelSorgusu(30),
    cevap: gunlukUretimCevabi,
    isle: ({ db, sorgu }) => gunlukUretim(db, sorgu.gun),
  }),
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/durus-dagilimi',
    yetki: ADIMLI_OKUMA,
    sorgu: panelSorgusu(14),
    cevap: durusDagilimiCevabi,
    isle: ({ db, sorgu }) => durusDagilimi(db, sorgu.gun),
  }),
  uc({
    yontem: 'GET',
    yol: '/uretim-emirleri/son-olaylar',
    yetki: ADIMLI_OKUMA,
    sorgu: sonOlaylarSorgusu,
    cevap: sonOlaylarCevabi,
    isle: ({ db, sorgu }) => sonOlaylar(db, sorgu.sonra ?? null, sorgu.sayi),
  }),
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler',
    yetki: ADIMLI_OKUMA,
    sorgu: adimliListeSorgusu,
    cevap: adimliListeCevabi,
    isle: ({ db, sorgu }) => isEmri.adimliListe(db, sorgu.arsiv, sorgu.projeId ?? null, sorgu.kapsam === 'hepsi'),
  }),
  // Ana sayfa kartları: listeyi okuyabilen ve planı gören sayılarını okur.
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/ozet',
    yetki: ADIMLI_OZET_OKUMA,
    cevap: adimliOzetCevabi,
    isle: ({ db }) => isEmri.adimliOzet(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/bitenler',
    yetki: ADIMLI_OKUMA,
    sorgu: adimliBitenlerSorgusu,
    cevap: adimliBitenlerCevabi,
    isle: ({ db, sorgu }) => isEmri.adimliBitenler(db, { durum: sorgu.durum ?? null, ara: sorgu.ara ?? null }, sorgu),
  }),
  // Adımı fasona alacak kişi firmayı seçer: emri yazan görür, müşteri ve tedarikçi yetkisi gerekmez.
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/fason-firmalari',
    yetki: 'uretim-emirleri.yaz',
    cevap: fasonFirmalariCevabi,
    isle: async ({ db }) => ({ firmalar: await isEmri.fasonFirmalari(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id',
    yetki: ADIMLI_OKUMA,
    parametre: emirParametresi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, parametre }) => ({ emir: await isEmri.adimliAyrinti(db, parametre.id) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id/refakat-karti',
    yetki: ADIMLI_OKUMA,
    parametre: emirParametresi,
    cevap: refakatKartiCevabi,
    isle: ({ db, parametre }) => isEmri.refakatKarti(db, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/sure-ozeti',
    yetki: ADIMLI_OKUMA,
    parametre: isEmriParametresi,
    cevap: sureOzetiCevabi,
    isle: ({ db, parametre }) => isEmriSureOzeti(db, parametre.isEmriId, parametre.id),
  }),
  // Hazırlık durdurucuları (120-122 a, denetim #14): okuma emri görene; muafiyet yalnız müdüre (264 a).
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id/hazirlik',
    yetki: ADIMLI_OKUMA,
    parametre: emirParametresi,
    cevap: hazirlikCevabi,
    isle: ({ db, parametre }) => hazirlik(db, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/hazirlik-muafiyeti',
    yetki: 'uretim-emirleri.hazirlik-muaf',
    parametre: emirParametresi,
    govde: hazirlikMuafiyetiGovdesi,
    cevap: hazirlikCevabi,
    isle: ({ db, kullanici, parametre, govde }) => muafiyetVer(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/plana-al',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: planaAlGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.planaAl(db, kullanici, parametre.id, govde.surum);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/iptal',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: adimliIptalGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.adimliIptal(db, kullanici, parametre.id, govde.surum);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // 163 a: başlamamış emrin önceliği senaryo açmadan değişir; eski ve yeni değer kim ve ne zamanla kayda girer.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/oncelik',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: oncelikGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.oncelikDegistir(db, kullanici, parametre.id, govde.oncelik, govde.surum);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // Açılmış emirde başlamamış adım içeriye ya da fasona alınır (rota değişmez); kim ve ne zaman kaydedilir.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/uretim-yeri',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: uretimYeriGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.uretimYeriDegistir(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/adim-kaynagi',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: adimKaynagiGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.adimKaynagi(db, kullanici, parametre.id, govde.opNo, govde.kaynak, govde.surum);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // Bölme yinelenirse parti iki kez bölünür: istek kimliği zorunludur.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/bol',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: partiBolGovdesi,
    cevap: partiBolCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      const { altEmirId } = await isEmri.partiyiBol(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id), altEmirId };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/birlestir',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: partiBirlestirGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.partileriBirlestir(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // Ek adım yinelenirse kola iki adım girer: istek kimliği zorunludur (UE-PB4).
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/ek-adim',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: ekAdimGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.ekAdimEkle(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/ek-adim-kaldir',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: ekAdimKaldirGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.ekAdimKaldir(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // E-1, 224: emir açma ekranlarının proje ve sipariş satırı seçenekleri; açma işlemlerinden biri yeter, servis yeniden denetler.
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/acilis-secenekleri',
    yetki: { biri: ['uretim-emirleri.yaz', 'rota.emre-kopyala'] },
    sorgu: acilisSecenekleriSorgusu,
    cevap: acilisSecenekleriCevabi,
    isle: ({ db, kullanici, sorgu }) => isEmri.acilisSecenekleri(db, kullanici, sorgu.malzemeNo, sorgu.emirTuru),
  }),
  // Rotasız emir (B13): "Rotasız üretim emri" ayarı açıkken malzemeli emir rotasız, adımsız açılır; yinelenirse iki emir açılır.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/rotasiz',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    govde: rotasizEmirGovdesi,
    cevap: rotasizEmirCevabi,
    isle: ({ db, kullanici, govde }) => isEmri.rotasizEmirAc(db, kullanici, govde),
  }),
  // Rotasız emrin adımları (UE-RA-1..3). Ekleme yinelenirse iki adım girer: istek kimliği zorunludur.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/adim-ekle',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: rotasizAdimEkleGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.rotasizAdimEkle(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/adim-duzenle',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: rotasizAdimDuzenleGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.rotasizAdimDuzenle(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/adim-sil',
    yetki: 'uretim-emirleri.yaz',
    parametre: emirParametresi,
    govde: rotasizAdimSilGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.rotasizAdimSil(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // Plan kaldırma kola adım kopyalar; yinelenirse ikinci kez kopyalamasın diye istek kimliği zorunludur (UE-PB8).
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/birlesme-plani',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: birlesmePlaniGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.birlesmePlani(db, kullanici, parametre.id, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
  // Okutulan emrin sıradaki fason iş emri (kart #97): Malzeme · Teslim panelindeki "Fasona gönder" bölümü; yalnız gönderebilen okur.
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id/siradaki-fason',
    yetki: 'uretim-emirleri.fason',
    parametre: emirParametresi,
    cevap: siradakiFasonCevabi,
    isle: async ({ db, parametre }) => ({ fason: await isEmri.siradakiFason(db, parametre.id) }),
  }),
  // Fason gidiş ve dönüş yinelenirse adet iki kez sayılır: istek kimliği zorunludur.
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/fason-gidis',
    yetki: 'uretim-emirleri.fason',
    tekrarKorumali: true,
    parametre: isEmriParametresi,
    govde: fasonGidisGovdesi,
    cevap: fasonHareketiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      const { hareketId } = await isEmri.fasonGidis(db, kullanici, parametre.id, parametre.isEmriId, govde.adet);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id), hareketId };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/fason-tamamla',
    yetki: 'uretim-emirleri.fason',
    tekrarKorumali: true,
    parametre: isEmriParametresi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre }) => {
      await isEmri.fasonTamamla(db, kullanici, parametre.id, parametre.isEmriId);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
];

// Paralel adım (kart 639): adımı yolda taşıyan komutlar, eski emir uçlarıyla aynı işlem ve kurallarla. Yolda adım verildiği için
// emrin birden çok açık adımı olsa da komut belirsiz kalmaz. Başlatma, sayım, devam, durdurma ve bitirme terminal (Arkon) yolundadır.
const adimKomutUclari = [
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/ayar',
    yetki: 'terminal.uret',
    parametre: isEmriParametresi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre }) => emirAyar(db, kullanici.id, parametre.id, parametre.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/makine-devral',
    yetki: 'terminal.uret',
    parametre: isEmriParametresi,
    govde: makineDevralGovdesi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre, govde }) => makineDevral(db, kullanici.id, parametre.id, govde.kullanimId, parametre.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/duraklat',
    yetki: 'terminal.uret',
    tekrarKorumali: true,
    parametre: isEmriParametresi,
    cevap: emirCevabi,
    isle: ({ db, kullanici, parametre }) => emirDuraklat(db, kullanici.id, parametre.id, parametre.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/katil',
    yetki: 'terminal.uret',
    parametre: isEmriParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katil(db, kullanici.id, parametre.id, parametre.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/katilim/duraklat',
    yetki: 'terminal.uret',
    parametre: isEmriParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katilimDuraklat(db, kullanici.id, parametre.id, parametre.isEmriId),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/katilim/ayril',
    yetki: 'terminal.uret',
    parametre: isEmriParametresi,
    cevap: katilimCevabi,
    isle: ({ db, kullanici, parametre }) => katilimAyril(db, kullanici.id, parametre.id, parametre.isEmriId),
  }),
  // 647 a: sayım aşımı izi; katılımı gören okur.
  uc({
    yontem: 'GET',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/asimlar',
    yetki: KATILIM_OKUMA,
    parametre: isEmriParametresi,
    cevap: asimlarCevabi,
    isle: ({ db, parametre }) => asimlar(db, parametre.id, parametre.isEmriId),
  }),
];

// Hatalı parça (1033 a, 1034): operatör nedeni ve adedi verir, kol (ya da emre adım) aynı işlemde açılır; yinelenirse iki kol açılırdı.
// Kayıtları emri okuyan ve Kalite Merkezi okur; rework adımını kalite kararından sonra planlama doldurur.
const hataliUclari = [
  uc({
    yontem: 'POST',
    yol: '/uretim-emirleri/:id/hatali',
    yetki: 'terminal.uret',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: hataliGovdesi,
    cevap: hataliCevabi,
    isle: ({ db, kullanici, parametre, govde }) => hataliKaydet(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/hatali-parcalar',
    yetki: { biri: [...ADIMLI_OKUMA_ISLEMLERI, 'kalite-merkezi.oku'] },
    sorgu: hataliListeSorgusu,
    cevap: hataliListeCevabi,
    isle: async ({ db, sorgu }) => ({ kayitlar: await hataliKayitlari(db, { acik: sorgu.acik === '1', emirId: sorgu.emirId ?? null }) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/adimli-emirler/:id/is-emirleri/:isEmriId/rework-adimi',
    yetki: 'uretim-emirleri.yaz',
    tekrarKorumali: true,
    parametre: isEmriParametresi,
    govde: reworkAdimiGovdesi,
    cevap: adimliEmirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await isEmri.reworkAdimiYaz(db, kullanici, parametre.id, parametre.isEmriId, govde);
      return { emir: await isEmri.adimliAyrinti(db, parametre.id) };
    },
  }),
];

export const uclar = [...aramaUclari, ...emirUclari, ...adimliUclar, ...katilimUclari, ...adimKomutUclari, ...hataliUclari];

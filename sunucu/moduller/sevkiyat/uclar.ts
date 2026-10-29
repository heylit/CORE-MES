import { fileURLToPath } from 'node:url';
import { haritaDiziniOku } from '#cekirdek/ayar.ts';
import { uc } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kayitAramaCevapSemasi, kayitAramaSorguSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, type KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import {
  aracCevabi, aracGovdesi, aracGuncelleGovdesi, araclarCevabi, aramaCevabi, aramaSorgusu, bekleyenBolCevabi, bekleyenBolGovdesi, bekleyenKaldirCevabi, bekleyenlerCevabi, dagitGovdesi, gunPlaniCevabi, haritaCevabi, idParametresi, isCevabi,
  isDurumuGovdesi, isGovdesi, isGuncelleGovdesi, kaydetGovdesi, firmaAramaCevabi, firmaAramaSorgusu, noktaCevabi, noktaGovdesi, noktaGuncelleGovdesi, noktalarCevabi, onayGovdesi, ozetCevabi, tarihParametresi, tekRotaCevabi, tekRotaSorgusu,
  trafikCevabi, trafikSorgusu, urunSevkleriCevabi, urunSevkleriSorgusu, elleKalemGovdesi, kalemCevabi, serbestBirakCevabi, serbestBirakGovdesi, tasimaGovdesi,
  tumIslerCevabi, tumIslerSorgusu,
} from '#paylasilan/sozlesme/sevkiyat.ts';
import type { Arac, GunPlaniCevabi, KalemKaynagi, TumIsAsamasi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { aracMaliyetsiz, gunPlaniMaliyetsiz, korunanOranlar, MALIYET_OKUMA, SERBEST_BIRAKMA_ISLEMLERI, tekRotaMaliyetsiz } from './kurallar.ts';
import * as servis from './servis.ts';
import type { HaritaKaynagi } from './servis.ts';
import * as tumIsler from './tum-isler.ts';

// Maliyet işlemi uçta değil alan düzeyinde denetlenir: ekran herkese açılır, rakam yalnız yetkiliye gider (180, 200 a).
const maliyetGorur = (k: Kullanici): boolean => islemVarMi(k, MALIYET_OKUMA);
const arac = (k: Kullanici, a: Arac): Arac => (maliyetGorur(k) ? a : aracMaliyetsiz(a));
const yazan = (k: Kullanici): tumIsler.Yazan => ({ kisiId: k.id, yetkili: (islem) => islemVarMi(k, islem) });
const plan = async (k: Kullanici, p: Promise<GunPlaniCevabi>): Promise<GunPlaniCevabi> => (maliyetGorur(k) ? p : gunPlaniMaliyetsiz(await p));

const KAYNAK_ADI: Record<KalemKaynagi, string> = { urun: 'Ürün', fason: 'Fason gidişi', 'fason-donus': 'Fason dönüşü', alim: 'Alım', elle: 'Elle iş' };
const ASAMA_ADI: Record<TumIsAsamasi, string> = {
  hazir: 'Hazır', 'hazir-degil': 'Hazır değil', bekliyor: 'Hazır olunca', havuzda: 'Havuzda', planlandi: 'Planlandı', yolda: 'Yolda', depoda: 'Depoda',
  tamamlandi: 'Tamamlandı',
};
// Sonuç Tüm işler'i o emirle süzülmüş açar; karar bekleyen kalem "Serbest bırakılacak", gerisi "Sevkiyattaki" görünümündedir.
const aramaSonucu = (r: TumIsSatiri & { emirNo: string }): KayitAramaSonucu => {
  const aday = r.asama === 'hazir' || r.asama === 'hazir-degil';
  const gun = r.is?.tarih ?? r.istenenTarih;
  return {
    anahtar: r.anahtar,
    baslik: r.emirNo,
    aciklama: [KAYNAK_ADI[r.kaynak], r.opNo === null ? null : `OP ${String(r.opNo)}`, ASAMA_ADI[r.asama], gun === null ? null : gun.split('-').reverse().join('.')]
      .filter((p) => p !== null).join(' · '),
    yol: `/sevkiyat/tum-isler?ara=${encodeURIComponent(r.emirNo)}&gorunum=${aday ? 'karar' : 'sevkiyat'}`,
  };
};

// Harita kaynağı parametredir ki test küçük bir yol ağıyla, dosyasız koşsun; üretimde paket dizininden okunur.
export function sevkiyatUclari(kaynak: HaritaKaynagi) {
  return [
    // ---------- noktalar ----------
    uc({ yontem: 'GET', yol: '/sevkiyat/noktalar', yetki: 'sevkiyat.oku', cevap: noktalarCevabi, isle: ({ db }) => servis.noktalariListele(db) }),
    // Noktayı bağlamak için firma seçimi: yalnız ad, kod, tür ve il (finans rakamı yok); nokta tanımlayan görür.
    uc({
      yontem: 'GET', yol: '/sevkiyat/firmalar', yetki: 'sevkiyat.tanim-yaz', sorgu: firmaAramaSorgusu, cevap: firmaAramaCevabi,
      isle: async ({ db, sorgu }) => ({ firmalar: await servis.firmaSecenekleri(db, sorgu.metin) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/noktalar/ekle', yetki: 'sevkiyat.tanim-yaz', tekrarKorumali: true, govde: noktaGovdesi, cevap: noktaCevabi,
      isle: async ({ db, govde }) => ({ nokta: await servis.noktaEkle(db, govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/noktalar/:id/guncelle', yetki: 'sevkiyat.tanim-yaz', parametre: idParametresi, govde: noktaGuncelleGovdesi, cevap: noktaCevabi,
      isle: async ({ db, parametre, govde }) => ({ nokta: await servis.noktaGuncelle(db, parametre.id, govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/noktalar/:id/pasiflestir', yetki: 'sevkiyat.tanim-yaz', parametre: idParametresi, cevap: noktaCevabi,
      isle: async ({ db, parametre }) => ({ nokta: await servis.noktaPasiflestir(db, parametre.id) }),
    }),

    // ---------- araçlar ----------
    uc({ yontem: 'GET', yol: '/sevkiyat/araclar', yetki: 'sevkiyat.oku', cevap: araclarCevabi, isle: async ({ db, kullanici }) => ({
        araclar: (await servis.araclariListele(db)).map((a) => arac(kullanici, a)), ornekMaliyetler: maliyetGorur(kullanici) ? servis.ORNEK_MALIYETLER : null,
      }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/araclar/ekle', yetki: 'sevkiyat.tanim-yaz', tekrarKorumali: true, govde: aracGovdesi, cevap: aracCevabi,
      isle: async ({ db, govde, kullanici }) => ({ arac: arac(kullanici, await servis.aracEkle(db, maliyetGorur(kullanici) ? govde : korunanOranlar(govde, null))) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/araclar/:id/guncelle', yetki: 'sevkiyat.tanim-yaz', parametre: idParametresi, govde: aracGuncelleGovdesi, cevap: aracCevabi,
      isle: async ({ db, parametre, govde, kullanici }) => ({ arac: arac(kullanici, await servis.aracGuncelle(db, parametre.id, govde, !maliyetGorur(kullanici))) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/araclar/:id/pasiflestir', yetki: 'sevkiyat.tanim-yaz', parametre: idParametresi, cevap: aracCevabi,
      isle: async ({ db, parametre, kullanici }) => ({ arac: arac(kullanici, await servis.aracPasiflestir(db, parametre.id)) }),
    }),

    // ---------- bekleme listesi (kart #1310) ----------
    // Okutulan ürünün sevkleri (kart #96): Malzeme · Teslim panelindeki Sevk bölümü okur; durumu iş durum ucu değiştirir.
    uc({ yontem: 'GET', yol: '/sevkiyat/urun-sevkleri', yetki: 'sevkiyat.oku', sorgu: urunSevkleriSorgusu, cevap: urunSevkleriCevabi, isle: async ({ db, sorgu }) => ({ sevkler: await servis.urunSevkleri(db, sorgu) }) }),
    uc({ yontem: 'GET', yol: '/sevkiyat/bekleyenler', yetki: 'sevkiyat.oku', cevap: bekleyenlerCevabi, isle: async ({ db }) => ({ bekleyenler: await servis.bekleyenleriListele(db) }) }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/bekleyenler/:id/ise-cevir', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, govde: isGovdesi, cevap: isCevabi,
      isle: async ({ db, parametre, govde }) => ({ is: await servis.bekleyeniIseCevir(db, parametre.id, govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/bekleyenler/:id/bol', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, govde: bekleyenBolGovdesi, cevap: bekleyenBolCevabi,
      isle: ({ db, parametre, govde }) => servis.bekleyeniBol(db, parametre.id, govde),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/bekleyenler/:id/kaldir', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, cevap: bekleyenKaldirCevabi,
      isle: ({ db, parametre, kullanici }) => servis.bekleyeniKaldir(db, parametre.id, kullanici.id),
    }),

    // ---------- Tüm işler (960) ----------
    // Kalemi sahibi modülün yazma işlemi ya da sevkiyat serbest bırakır (941 c); uç listeyle açılır, kalem başına denetim serviste.
    uc({
      yontem: 'GET', yol: '/sevkiyat/tum-isler', yetki: { biri: ['sevkiyat.oku', ...SERBEST_BIRAKMA_ISLEMLERI] }, sorgu: tumIslerSorgusu, cevap: tumIslerCevabi,
      isle: async ({ db, sorgu }) => ({ satirlar: await tumIsler.tumIsler(db, sorgu) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/tum-isler/serbest-birak', yetki: { biri: SERBEST_BIRAKMA_ISLEMLERI }, tekrarKorumali: true, govde: serbestBirakGovdesi, cevap: serbestBirakCevabi,
      isle: async ({ db, govde, kullanici }) => ({ kalemIdleri: await tumIsler.serbestBirak(db, yazan(kullanici), govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/tum-isler/elle', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, govde: elleKalemGovdesi, cevap: serbestBirakCevabi,
      isle: async ({ db, govde, kullanici }) => ({ kalemIdleri: await tumIsler.elleKalemAc(db, yazan(kullanici), govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/kalemler/:id/tasima', yetki: 'sevkiyat.is-yaz', parametre: idParametresi, govde: tasimaGovdesi, cevap: kalemCevabi,
      isle: async ({ db, parametre, govde, kullanici }) => ({ satir: await tumIsler.tasimaDegistir(db, kullanici.id, parametre.id, govde.tasima) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/:id/tetikle', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, cevap: tumIslerCevabi,
      isle: async ({ db, parametre, kullanici }) => ({ satirlar: await tumIsler.isTetikle(db, kullanici.id, parametre.id) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/:id/tetigi-geri-al', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, cevap: tumIslerCevabi,
      isle: async ({ db, parametre }) => ({ satirlar: await tumIsler.isTetiginiGeriAl(db, parametre.id) }),
    }),

    // ---------- işler ----------
    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/ekle', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, govde: isGovdesi, cevap: isCevabi,
      isle: async ({ db, govde }) => ({ is: await servis.isEkle(db, govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/:id/guncelle', yetki: 'sevkiyat.is-yaz', parametre: idParametresi, govde: isGuncelleGovdesi, cevap: isCevabi,
      isle: async ({ db, parametre, govde }) => ({ is: await servis.isGuncelle(db, parametre.id, govde) }),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/:id/iptal-et', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, cevap: isCevabi,
      isle: async ({ db, parametre }) => ({ is: await servis.isIptalEt(db, parametre.id) }),
    }),

    uc({
      yontem: 'POST', yol: '/sevkiyat/isler/:id/durum', yetki: 'sevkiyat.is-yaz', tekrarKorumali: true, parametre: idParametresi, govde: isDurumuGovdesi, cevap: isCevabi,
      isle: ({ db, parametre, govde, kullanici }) => servis.isDurumuDegistir(db, parametre.id, govde, kullanici.id),
    }),

    uc({ yontem: 'GET', yol: '/sevkiyat/ozet', yetki: 'sevkiyat.oku', cevap: ozetCevabi, isle: ({ db }) => servis.ozet(db) }),

    // ---------- gün planı ----------
    uc({
      yontem: 'GET', yol: '/sevkiyat/planlar/:tarih', yetki: 'sevkiyat.oku', parametre: tarihParametresi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, kullanici }) => plan(kullanici, servis.gunPlani(db, parametre.tarih, kaynak)),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/planlar/:tarih/dagit', yetki: 'sevkiyat.plan-yaz', parametre: tarihParametresi, govde: dagitGovdesi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, govde, kullanici }) => plan(kullanici, servis.dagit(db, parametre.tarih, govde, 'dagit', kaynak)),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/planlar/:tarih/yerlestir', yetki: 'sevkiyat.plan-yaz', parametre: tarihParametresi, govde: dagitGovdesi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, govde, kullanici }) => plan(kullanici, servis.dagit(db, parametre.tarih, govde, 'yerlestir', kaynak)),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/planlar/:tarih/kaydet', yetki: 'sevkiyat.plan-yaz', parametre: tarihParametresi, govde: kaydetGovdesi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, govde, kullanici }) => plan(kullanici, servis.kaydet(db, parametre.tarih, govde, kaynak)),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/planlar/:tarih/onayla', yetki: 'sevkiyat.onayla', tekrarKorumali: true, parametre: tarihParametresi, govde: onayGovdesi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, govde, kullanici }) => plan(kullanici, servis.onayla(db, parametre.tarih, govde.surum, kaynak, kullanici.id)),
    }),
    uc({
      yontem: 'POST', yol: '/sevkiyat/planlar/:tarih/onayi-kaldir', yetki: 'sevkiyat.onayla', tekrarKorumali: true, parametre: tarihParametresi, govde: onayGovdesi, cevap: gunPlaniCevabi,
      isle: ({ db, parametre, govde, kullanici }) => plan(kullanici, servis.onayiKaldir(db, parametre.tarih, govde.surum, kaynak, kullanici.id)),
    }),

    // ---------- tek rota, harita, trafik, arama ----------
    uc({
      yontem: 'GET', yol: '/sevkiyat/tek-rota', yetki: 'sevkiyat.oku', sorgu: tekRotaSorgusu, cevap: tekRotaCevabi,
      isle: async ({ db, sorgu, kullanici }) => (maliyetGorur(kullanici) ? servis.tekRota(db, sorgu, kaynak) : tekRotaMaliyetsiz(await servis.tekRota(db, sorgu, kaynak))),
    }),
    // Harita büyük (borç 7) ve yetkiye göre değişmez: tarayıcı etiketle sorar, değişmediyse gövde yeniden gitmez.
    uc({ yontem: 'GET', yol: '/sevkiyat/harita', yetki: 'sevkiyat.oku', onbellek: 'etag', cevap: haritaCevabi, isle: async () => ({ harita: await servis.harita(kaynak) }) }),
    uc({
      yontem: 'GET', yol: '/sevkiyat/trafik', yetki: 'sevkiyat.oku', sorgu: trafikSorgusu, cevap: trafikCevabi,
      isle: ({ sorgu }) => servis.trafik(kaynak, sorgu.tarih, sorgu.dakika),
    }),
    // Üst çubuktaki genel aramanın sevkiyat kaynağı (932 a): emir numarasıyla o emrin sevk kalemleri. Sonuç Tüm işler'i açtığı için yetkisi onunkidir.
    uc({
      yontem: 'GET', yol: '/sevkiyat/ara', yetki: { biri: ['sevkiyat.oku', ...SERBEST_BIRAKMA_ISLEMLERI] }, sorgu: kayitAramaSorguSemasi, cevap: kayitAramaCevapSemasi,
      isle: async ({ db, sorgu }) => ({
        sonuclar: (await tumIsler.emirSevkAramasi(db, sorgu.q, KAYIT_ARAMA_EN_COK_SONUC))
          .filter((r): r is TumIsSatiri & { emirNo: string } => r.emirNo !== null).map(aramaSonucu),
      }),
    }),
    uc({
      yontem: 'GET', yol: '/sevkiyat/arama', yetki: 'sevkiyat.oku', sorgu: aramaSorgusu, cevap: aramaCevabi,
      isle: ({ db, sorgu }) => servis.adresAra(db, sorgu.metin, kaynak),
    }),
  ];
}

// Depodaki Ankara paketi varsayılandır ki `git pull` sonrası `.env` gerekmesin; başka bölge için değişken paketin yerini alır.
export const DEPODAKI_PAKET = fileURLToPath(new URL('./harita-paketi/', import.meta.url));

export const uclar = sevkiyatUclari(servis.dosyadanHaritaKaynagi(haritaDiziniOku() ?? DEPODAKI_PAKET));

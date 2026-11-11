import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Islem } from '#paylasilan/islemler.ts';

// Onaylı rol x işlem matrisi: yetki testlerinin tek beklentisi. Rol göçleri bunu veritabanına yazar, `kurulum/yetki-matrisi.md`
// okunur hâlidir; üçünün aynı olduğunu `araclar/yetki-matrisi.test.ts` ölçer. Testler rol işlem listesini kendileri tutmaz,
// buradan alır: matris değişince yalnız bu dosya, göç ve belge değişir. Matris yalnız kullanıcı kararıyla değişir.

export interface BeklenenRol {
  readonly ad: string;
  readonly islemler: readonly Islem[];
}

// Bayraklı rol satır taşımaz, kayıtlı her işlemi alır.
export const YONETICI_ROLU = { kod: 'yonetici', ad: 'Sistem Yöneticisi' } as const;

export const ROL_MATRISI = {
  bakim: {
    ad: 'Bakım',
    islemler: [
      'arkon.bakim', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac',
      'ik.bordro-gordum', 'ik.izin-talep', 'istasyonlar.makine-durumu', 'mesaj.oku', 'mesaj.yaz', 'plan.oku', 'saat.oku',
      'saat.uyari-ustlen', 'satin-alma.talep-ac', 'sayfa.arkon', 'sayfa.cnc-kurulum', 'sayfa.idari-isler', 'sayfa.ik-islemlerim',
      'sayfa.istasyonlar', 'sayfa.mesaj', 'sayfa.ortak-dosyalar', 'sayfa.profil', 'sayfa.stok', 'sayfa.taleplerim', 'stok.istek',
    ],
  },
  cam: {
    ad: 'CAM',
    islemler: [
      'arkon.hazirlik', 'arkon.kuyruk-sirala', 'belge-merkezi.oku', 'belge-merkezi.yaz', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir',
      'cnc-kurulum.yaz', 'geometri.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep',
      'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'plan.oku', 'projeler.oku', 'recete-rota.oku', 'rota.talimat-yaz', 'satin-alma.talep-ac',
      'sayfa.adim-durumu', 'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizimler', 'sayfa.cnc-kurulum', 'sayfa.emirler', 'sayfa.geometri', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.malzemeler', 'sayfa.mesaj', 'sayfa.ortak-dosyalar', 'sayfa.profil',
      'sayfa.projeler', 'sayfa.recete-rota', 'sayfa.rota', 'sayfa.sevkiyat', 'sayfa.taleplerim', 'sayfa.uretim-emirleri', 'sevkiyat.oku',
      'stok.istek',
    ],
  },
  depo: {
    ad: 'Depo',
    islemler: [
      'akis.kart-oku', 'etiket-merkezi.bas', 'etiket-merkezi.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac',
      'ik.bordro-gordum', 'ik.izin-talep', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku', 'projeler.oku',
      'satin-alma.talep-ac', 'sayfa.atolye', 'sayfa.etiket-merkezi', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.malzemeler',
      'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.ortak-dosyalar', 'sayfa.profil', 'sayfa.projeler', 'sayfa.sevkiyat',
      'sayfa.siparisler', 'sayfa.stok', 'sayfa.taleplerim', 'sayfa.uretim-terminali', 'sevkiyat.is-yaz', 'sevkiyat.oku', 'sevkiyat.onayla',
      'sevkiyat.plan-yaz', 'sevkiyat.tanim-yaz', 'siparisler.oku', 'stok.cikis', 'stok.giris', 'stok.istek', 'stok.malzeme-fisi-gonder',
      'stok.sayim', 'stok.tanim', 'stok.toplama', 'stok.transfer', 'uretim-emirleri.fason',
    ],
  },
  genel_mudur: {
    ad: 'Genel Müdür',
    islemler: [
      'arkon.amir', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'belge-merkezi.oku', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir',
      'cnc-kurulum.yaz', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim.oku', 'etiket-merkezi.bas', 'etiket-merkezi.oku',
      'etiket-merkezi.sablon-yaz', 'etiket-merkezi.yazici-yaz', 'finans.maliyet-oku', 'finans.oku', 'idari-isler.arac-talebi-ac',
      'idari-isler.oku', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay',
      'istasyonlar.makine-durumu', 'istasyonlar.yaz', 'kalite-merkezi.oku', 'kalite-merkezi.onayla', 'kisiler.oku', 'malzemeler.onayla',
      'malzemeler.tanim-yaz', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku', 'nizamiye.kart-yonet', 'nizamiye.oku',
      'oee.oku', 'pano.sirket-ozeti', 'plan.bedel-ayari', 'plan.canliya-al', 'plan.kilitle', 'plan.motor-ayari', 'plan.oku',
      'plan.planlama-oku', 'plan.studyo', 'plan.yaz', 'portal.finans', 'portal.kalite', 'portal.oku', 'portal.satinalma', 'portal.satis',
      'portal.yaz', 'profil.geri-bildirim-kategori-yaz', 'profil.geri-bildirim-oku', 'profil.geri-bildirim-yanitla', 'projeler.gorev-yaz',
      'projeler.oku', 'projeler.statu-ayar', 'projeler.statu-yaz', 'projeler.yaz', 'recete-rota.oku', 'recete-rota.yaz',
      'rota.emre-kopyala', 'rota.onayla', 'saat.uyari-ustlen', 'satin-alma.oku', 'satin-alma.onayla', 'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis',
      'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizelge', 'sayfa.cizimler', 'sayfa.cnc-kurulum', 'sayfa.denetim', 'sayfa.denetim-hazirlik',
      'sayfa.durus-nedenleri', 'sayfa.emirler', 'sayfa.etiket-merkezi', 'sayfa.finans', 'sayfa.geri-bildirim', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kalibrasyon', 'sayfa.kalite-merkezi', 'sayfa.kuyruk', 'sayfa.malzemeler',
      'sayfa.matris', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.nizamiye', 'sayfa.oee', 'sayfa.ortak-dosyalar',
      'sayfa.personel', 'sayfa.plan', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.recete-rota', 'sayfa.rota',
      'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.smartes', 'sayfa.stok', 'sayfa.taleplerim', 'sayfa.terminal',
      'sayfa.uretim-emirleri', 'sayfa.uretim-terminali', 'sayfa.vardiya', 'sevkiyat.oku', 'siparisler.fiyat-oku',
      'siparisler.iskonto-onayla', 'siparisler.maliyet-oku', 'siparisler.oku', 'siparisler.onayla', 'siparisler.termin-dene',
      'siparisler.termin-onayla', 'siparisler.yaz', 'stok.cikis', 'stok.eksi-onayla', 'stok.geri-al', 'stok.giris', 'stok.istek',
      'stok.sayim', 'stok.sayim-onayla', 'stok.skt-onayla', 'stok.statu-degistir', 'stok.tanim', 'stok.toplama', 'stok.transfer',
      'terminal.uret', 'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.fason', 'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.kapanis-oku',
      'uretim-emirleri.kapanis-onay', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.gecmis-yaz', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
  genel_mudur_yardimcisi: {
    ad: 'Genel Müdür Yardımcısı',
    islemler: [
      'arkon.amir', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'belge-merkezi.oku', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir',
      'cnc-kurulum.yaz', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim.oku', 'etiket-merkezi.bas', 'etiket-merkezi.oku',
      'etiket-merkezi.sablon-yaz', 'etiket-merkezi.yazici-yaz', 'finans.maliyet-oku', 'finans.oku', 'idari-isler.arac-talebi-ac',
      'idari-isler.oku', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay',
      'istasyonlar.makine-durumu', 'istasyonlar.yaz', 'kalite-merkezi.oku', 'kalite-merkezi.onayla', 'kisiler.oku', 'malzemeler.onayla',
      'malzemeler.tanim-yaz', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku', 'nizamiye.kart-yonet', 'nizamiye.oku',
      'oee.oku', 'pano.sirket-ozeti', 'plan.bedel-ayari', 'plan.canliya-al', 'plan.kilitle', 'plan.motor-ayari', 'plan.oku',
      'plan.planlama-oku', 'plan.studyo', 'plan.yaz', 'portal.finans', 'portal.kalite', 'portal.oku', 'portal.satinalma', 'portal.satis',
      'portal.yaz', 'profil.geri-bildirim-kategori-yaz', 'profil.geri-bildirim-oku', 'profil.geri-bildirim-yanitla', 'projeler.gorev-yaz',
      'projeler.oku', 'projeler.statu-ayar', 'projeler.statu-yaz', 'projeler.yaz', 'recete-rota.oku', 'recete-rota.yaz',
      'rota.emre-kopyala', 'rota.onayla', 'saat.uyari-ustlen', 'satin-alma.oku', 'satin-alma.onayla', 'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis',
      'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizelge', 'sayfa.cizimler', 'sayfa.cnc-kurulum', 'sayfa.denetim', 'sayfa.denetim-hazirlik',
      'sayfa.durus-nedenleri', 'sayfa.emirler', 'sayfa.etiket-merkezi', 'sayfa.finans', 'sayfa.geri-bildirim', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kalibrasyon', 'sayfa.kalite-merkezi', 'sayfa.kuyruk', 'sayfa.malzemeler',
      'sayfa.matris', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.nizamiye', 'sayfa.oee', 'sayfa.ortak-dosyalar',
      'sayfa.personel', 'sayfa.plan', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.recete-rota', 'sayfa.rota',
      'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.smartes', 'sayfa.stok', 'sayfa.taleplerim', 'sayfa.terminal',
      'sayfa.uretim-emirleri', 'sayfa.uretim-terminali', 'sayfa.vardiya', 'sevkiyat.oku', 'siparisler.fiyat-oku',
      'siparisler.iskonto-onayla', 'siparisler.maliyet-oku', 'siparisler.oku', 'siparisler.onayla', 'siparisler.termin-dene',
      'siparisler.termin-onayla', 'siparisler.yaz', 'stok.cikis', 'stok.eksi-onayla', 'stok.geri-al', 'stok.giris', 'stok.istek',
      'stok.sayim', 'stok.sayim-onayla', 'stok.skt-onayla', 'stok.statu-degistir', 'stok.tanim', 'stok.toplama', 'stok.transfer',
      'terminal.uret', 'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.fason', 'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.kapanis-oku',
      'uretim-emirleri.kapanis-onay', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.gecmis-yaz', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
  guvenlik_gorevlisi: {
    ad: 'Güvenlik Görevlisi',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz', 'nizamiye.oku',
      'nizamiye.yaz', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.mesaj', 'sayfa.nizamiye', 'sayfa.ortak-dosyalar', 'sayfa.profil',
    ],
  },
  idari_isler: {
    ad: 'İdari İşler',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.filo-yaz', 'idari-isler.kontrol-yaz', 'idari-isler.oku', 'idari-isler.talep-ac',
      'idari-isler.talep-yonet', 'idari-isler.yemek-yaz', 'idari-isler.zimmet-yaz', 'ik.bordro-gordum', 'ik.izin-talep', 'kisiler.oku',
      'mesaj.oku', 'mesaj.yaz', 'nizamiye.kart-yonet', 'nizamiye.oku', 'nizamiye.yaz', 'satin-alma.talep-ac', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.nizamiye', 'sayfa.ortak-dosyalar', 'sayfa.personel', 'sayfa.profil',
      'sayfa.sevkiyat', 'sayfa.taleplerim', 'sayfa.vardiya', 'sevkiyat.oku', 'stok.istek',
    ],
  },
  insan_kaynaklari: {
    ad: 'İnsan Kaynakları',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.ayar-yaz', 'ik.bordro-gordum', 'ik.bordro-kesinlestir',
      'ik.bordro-kilit-ac', 'ik.devam-onay', 'ik.devam-yaz', 'ik.egitim-yaz', 'ik.hesap-ac', 'ik.ise-alim-yaz', 'ik.izin-onay',
      'ik.izin-talep', 'ik.izin-yaz', 'ik.oku', 'ik.ozel-veri-oku', 'ik.performans-yaz', 'ik.personel-yaz', 'ik.pozisyon-onay',
      'ik.ucret-yaz', 'kisiler.oku', 'kisiler.yaz', 'mesaj.oku', 'mesaj.yaz', 'nizamiye.pdks-aktar', 'profil.geri-bildirim-kategori-yaz',
      'profil.geri-bildirim-oku', 'profil.geri-bildirim-yanitla', 'satin-alma.talep-ac', 'sayfa.geri-bildirim', 'sayfa.idari-isler',
      'sayfa.ik', 'sayfa.ik-islemlerim', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.ortak-dosyalar', 'sayfa.personel', 'sayfa.profil',
      'sayfa.sevkiyat', 'sayfa.taleplerim', 'sayfa.vardiya', 'sevkiyat.oku', 'stok.istek', 'vardiya.tanim-yaz',
    ],
  },
  kalite: {
    ad: 'Kalite',
    islemler: [
      'arkon.kalite', 'belge-merkezi.oku', 'belge-merkezi.yayinla', 'cnc-kurulum.oku', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz',
      'etiket-merkezi.bas', 'etiket-merkezi.oku', 'geometri.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum',
      'ik.izin-talep', 'kalibrasyon.yaz', 'kalite-merkezi.oku', 'kalite-merkezi.onayla', 'kalite-merkezi.yaz', 'malzemeler.onayla',
      'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku', 'plan.oku', 'portal.kalite', 'portal.oku', 'portal.yaz',
      'projeler.oku', 'recete-rota.oku', 'rota.sartname-yayinla', 'rota.sartname-yaz', 'saat.uyari-ustlen', 'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizimler',
      'sayfa.cnc-kurulum', 'sayfa.denetim-hazirlik', 'sayfa.emirler', 'sayfa.etiket-merkezi', 'sayfa.geometri', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.kalibrasyon', 'sayfa.kalite-merkezi', 'sayfa.malzemeler', 'sayfa.mesaj', 'sayfa.musteri-tedarikci',
      'sayfa.ortak-dosyalar', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.recete-rota', 'sayfa.rota', 'sayfa.sevkiyat',
      'sayfa.siparisler', 'sayfa.stok', 'sayfa.taleplerim', 'sayfa.terminal', 'sayfa.uretim-emirleri', 'sayfa.uretim-terminali',
      'sevkiyat.oku', 'siparisler.oku', 'stok.istek', 'terminal.uret', 'uretim-emirleri.kapanis-kalite', 'uretim-emirleri.kapanis-oku',
    ],
  },
  markalama_gorevlisi: {
    ad: 'Markalama Görevlisi',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'markalama.seri-ver', 'markalama.tanim-yaz',
      'mesaj.oku', 'mesaj.yaz', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.markalama', 'sayfa.mesaj', 'sayfa.ortak-dosyalar',
      'sayfa.profil', 'stok.istek',
    ],
  },
  mudur: {
    ad: 'Müdür',
    islemler: [
      'arkon.amir', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'belge-merkezi.oku', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir',
      'cnc-kurulum.yaz', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim.oku', 'durus-nedenleri.yaz', 'etiket-merkezi.bas',
      'etiket-merkezi.oku', 'etiket-merkezi.sablon-yaz', 'etiket-merkezi.yazici-yaz', 'finans.maliyet-oku', 'finans.oku',
      'idari-isler.arac-talebi-ac', 'idari-isler.oku', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay',
      'ik.izin-talep', 'ik.pozisyon-onay', 'istasyonlar.makine-durumu', 'istasyonlar.yaz', 'kalite-merkezi.oku', 'kalite-merkezi.onayla',
      'kisiler.oku', 'malzemeler.onayla', 'malzemeler.tanim-yaz', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku',
      'nizamiye.kart-yonet', 'nizamiye.oku', 'oee.oku', 'pano.sirket-ozeti', 'plan.bedel-ayari', 'plan.canliya-al', 'plan.kilitle',
      'plan.motor-ayari', 'plan.oku', 'plan.planlama-oku', 'plan.studyo', 'plan.yaz', 'portal.finans', 'portal.kalite', 'portal.oku',
      'portal.satinalma', 'portal.satis', 'portal.yaz', 'profil.geri-bildirim-kategori-yaz', 'profil.geri-bildirim-oku',
      'profil.geri-bildirim-yanitla', 'projeler.gorev-yaz', 'projeler.oku', 'projeler.statu-ayar', 'projeler.statu-yaz', 'projeler.yaz',
      'recete-rota.oku', 'recete-rota.yaz', 'rota.emre-kopyala', 'rota.onayla', 'saat.uyari-ustlen', 'satin-alma.oku', 'satin-alma.onayla',
      'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis', 'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizelge', 'sayfa.cizimler', 'sayfa.cnc-kurulum',
      'sayfa.denetim', 'sayfa.denetim-hazirlik', 'sayfa.durus-nedenleri', 'sayfa.emirler', 'sayfa.etiket-merkezi', 'sayfa.finans',
      'sayfa.geri-bildirim', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kalibrasyon', 'sayfa.kalite-merkezi',
      'sayfa.kuyruk', 'sayfa.malzemeler', 'sayfa.matris', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.nizamiye',
      'sayfa.oee', 'sayfa.ortak-dosyalar', 'sayfa.personel', 'sayfa.plan', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler',
      'sayfa.recete-rota', 'sayfa.rota', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.smartes', 'sayfa.stok',
      'sayfa.taleplerim', 'sayfa.terminal', 'sayfa.uretim-emirleri', 'sayfa.uretim-terminali', 'sayfa.vardiya', 'sevkiyat.oku',
      'siparisler.fiyat-oku', 'siparisler.iskonto-onayla', 'siparisler.maliyet-oku', 'siparisler.oku', 'siparisler.onayla',
      'siparisler.termin-dene', 'siparisler.termin-onayla', 'siparisler.yaz', 'stok.cikis', 'stok.eksi-onayla', 'stok.geri-al',
      'stok.giris', 'stok.istek', 'stok.sayim', 'stok.sayim-onayla', 'stok.skt-onayla', 'stok.statu-degistir', 'stok.tanim', 'stok.toplama',
      'stok.transfer', 'terminal.uret', 'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.fason', 'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.kapanis-oku',
      'uretim-emirleri.kapanis-onay', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.gecmis-yaz', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
  muhasebe_finans: {
    ad: 'Muhasebe ve Finans',
    islemler: [
      'finans.beyan-yaz', 'finans.kur-yaz', 'finans.maliyet-oku', 'finans.oku', 'finans.yaz', 'finans.yonet', 'idari-isler.arac-talebi-ac',
      'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku',
      'musteri-tedarikci.yaz', 'portal.finans', 'portal.oku', 'portal.yaz', 'projeler.oku', 'satin-alma.fatura-bagla', 'satin-alma.oku',
      'sayfa.adim-durumu', 'sayfa.emirler', 'sayfa.finans', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.mesaj', 'sayfa.musteri-tedarikci',
      'sayfa.ortak-dosyalar', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler',
      'sayfa.stok', 'sayfa.uretim-emirleri', 'sevkiyat.oku', 'siparisler.fiyat-oku', 'siparisler.oku', 'siparisler.yaz', 'stok.istek',
    ],
  },
  operator: {
    ad: 'Operatör',
    islemler: [
      'arkon.operator', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz',
      'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.kuyruk', 'sayfa.mesaj', 'sayfa.ortak-dosyalar', 'sayfa.profil', 'sayfa.terminal',
      'sayfa.uretim-terminali', 'stok.istek', 'terminal.uret', 'uretim-emirleri.ara-istasyon',
    ],
  },
  planlama_muduru: {
    ad: 'Planlama Müdürü',
    islemler: [
      'arkon.kuyruk-sirala', 'arkon.planlama', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'atolye.yaz', 'belge-merkezi.oku',
      'belge-merkezi.yayinla', 'belge-merkezi.yaz', 'cnc-kurulum.oku', 'cnc-kurulum.yaz', 'denetim-hazirlik.oku', 'etiket-merkezi.bas',
      'etiket-merkezi.oku', 'geometri.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay',
      'ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay', 'kisiler.oku', 'malzemeler.tanim-yaz', 'malzemeler.yaz', 'mesaj.oku',
      'mesaj.yaz', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz', 'oee.oku', 'plan.bedel-ayari', 'plan.canliya-al', 'plan.kilitle',
      'plan.motor-ayari', 'plan.oku', 'plan.planlama-oku', 'plan.studyo', 'plan.yaz', 'portal.oku', 'projeler.gorev-yaz', 'projeler.oku',
      'projeler.statu-yaz', 'projeler.yaz', 'recete-rota.oku', 'recete-rota.yaz', 'rota.emre-kopyala', 'rota.onayla', 'rota.sartname-yayinla', 'rota.sartname-yaz', 'rota.talimat-yaz',
      'rota.yaz', 'saat.uyari-ustlen', 'satin-alma.oku', 'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis', 'sayfa.arkon', 'sayfa.atolye',
      'sayfa.cizelge', 'sayfa.cizimler', 'sayfa.cnc-kurulum', 'sayfa.denetim-hazirlik', 'sayfa.durus-nedenleri', 'sayfa.emirler',
      'sayfa.etiket-merkezi', 'sayfa.finans', 'sayfa.geometri', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.istasyonlar',
      'sayfa.kuyruk', 'sayfa.malzemeler', 'sayfa.matris', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.oee',
      'sayfa.ortak-dosyalar', 'sayfa.personel', 'sayfa.plan', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.recete-rota',
      'sayfa.rota', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.smartes', 'sayfa.stok', 'sayfa.taleplerim',
      'sayfa.terminal', 'sayfa.uretim-emirleri', 'sayfa.vardiya', 'sevkiyat.is-yaz', 'sevkiyat.oku', 'sevkiyat.plan-yaz', 'siparisler.oku',
      'siparisler.termin-dene', 'siparisler.termin-onayla', 'siparisler.yaz', 'stok.istek', 'stok.toplama', 'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.fason',
      'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.kapanis-oku', 'uretim-emirleri.kapanis-onay', 'uretim-emirleri.yaz',
      'vardiya.durus-yaz', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
  planlama_proje: {
    ad: 'Planlama ve Proje',
    islemler: [
      'arkon.kuyruk-sirala', 'arkon.planlama', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'atolye.yaz', 'belge-merkezi.oku',
      'belge-merkezi.yayinla', 'belge-merkezi.yaz', 'cnc-kurulum.oku', 'cnc-kurulum.yaz', 'denetim-hazirlik.oku', 'durus-nedenleri.yaz',
      'etiket-merkezi.bas', 'etiket-merkezi.oku', 'geometri.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum',
      'ik.izin-talep', 'kisiler.oku', 'malzemeler.tanim-yaz', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku',
      'musteri-tedarikci.yaz', 'oee.oku', 'plan.canliya-al', 'plan.kilitle', 'plan.motor-ayari', 'plan.oku', 'plan.planlama-oku',
      'plan.studyo', 'plan.yaz', 'portal.oku', 'projeler.gorev-yaz', 'projeler.oku', 'projeler.statu-yaz', 'projeler.yaz',
      'recete-rota.oku', 'recete-rota.yaz', 'rota.emre-kopyala', 'rota.sartname-yayinla', 'rota.sartname-yaz', 'rota.talimat-yaz', 'rota.yaz', 'saat.uyari-ustlen', 'satin-alma.oku',
      'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis', 'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizelge', 'sayfa.cizimler', 'sayfa.cnc-kurulum',
      'sayfa.denetim-hazirlik', 'sayfa.durus-nedenleri', 'sayfa.emirler', 'sayfa.etiket-merkezi', 'sayfa.finans', 'sayfa.geometri',
      'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kuyruk', 'sayfa.malzemeler', 'sayfa.matris', 'sayfa.mesai',
      'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.oee', 'sayfa.ortak-dosyalar', 'sayfa.plan', 'sayfa.portal', 'sayfa.profil',
      'sayfa.projeler', 'sayfa.recete-rota', 'sayfa.rota', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.smartes',
      'sayfa.stok', 'sayfa.taleplerim', 'sayfa.terminal', 'sayfa.uretim-emirleri', 'sayfa.vardiya', 'sevkiyat.is-yaz', 'sevkiyat.oku',
      'sevkiyat.plan-yaz', 'siparisler.oku', 'siparisler.termin-onayla', 'siparisler.yaz', 'stok.istek', 'stok.toplama',
      'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.fason', 'uretim-emirleri.kapanis-oku', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.tanim-yaz',
      'vardiya.yaz',
    ],
  },
  satin_alma: {
    ad: 'Satın Alma',
    islemler: [
      'finans.kur-yaz', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'malzemeler.yaz',
      'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz', 'portal.oku', 'portal.satinalma', 'portal.yaz',
      'projeler.oku', 'satin-alma.ayar', 'satin-alma.fatura-bagla', 'satin-alma.oku', 'satin-alma.talep-ac', 'satin-alma.yaz',
      'sayfa.finans', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.malzemeler', 'sayfa.mesaj', 'sayfa.musteri-tedarikci',
      'sayfa.ortak-dosyalar', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.stok',
      'sayfa.taleplerim', 'sevkiyat.oku', 'stok.istek', 'uretim-emirleri.fason',
    ],
  },
  satin_alma_muduru: {
    ad: 'Satın Alma Müdürü',
    islemler: [
      'finans.kur-yaz', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay',
      'ik.izin-talep', 'ik.pozisyon-onay', 'kisiler.oku', 'logo.siparis-duzelt', 'malzemeler.yaz', 'mesaj.oku', 'mesaj.yaz', 'musteri-tedarikci.oku',
      'musteri-tedarikci.yaz', 'portal.oku', 'portal.satinalma', 'portal.yaz', 'projeler.oku', 'satin-alma.ayar',
      'satin-alma.fatura-bagla', 'satin-alma.oku', 'satin-alma.onayla', 'satin-alma.talep-ac', 'satin-alma.yaz', 'sayfa.finans',
      'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.malzemeler', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.ortak-dosyalar',
      'sayfa.personel', 'sayfa.portal', 'sayfa.profil', 'sayfa.projeler', 'sayfa.satin-alma', 'sayfa.sevkiyat', 'sayfa.stok',
      'sayfa.taleplerim', 'sevkiyat.oku', 'stok.istek', 'uretim-emirleri.fason',
    ],
  },
  satis: {
    ad: 'Satış',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz',
      'musteri-tedarikci.oku', 'musteri-tedarikci.yaz', 'portal.oku', 'portal.satis', 'portal.yaz', 'projeler.oku', 'sayfa.idari-isler',
      'sayfa.ik-islemlerim', 'sayfa.mesaj', 'sayfa.musteri-tedarikci', 'sayfa.ortak-dosyalar', 'sayfa.portal', 'sayfa.profil',
      'sayfa.siparisler', 'sevkiyat.oku', 'siparisler.fiyat-oku', 'siparisler.oku', 'siparisler.termin-dene', 'siparisler.termin-onayla',
      'siparisler.yaz', 'stok.istek',
    ],
  },
  sevkiyat: {
    ad: 'Sevkiyat',
    islemler: [
      'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'mesaj.oku', 'mesaj.yaz',
      'musteri-tedarikci.oku', 'portal.oku', 'portal.yaz', 'projeler.oku', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.mesaj',
      'sayfa.ortak-dosyalar', 'sayfa.portal', 'sayfa.profil', 'sayfa.sevkiyat', 'sayfa.siparisler', 'sayfa.stok', 'sevkiyat.is-yaz',
      'sevkiyat.oku', 'sevkiyat.onayla', 'sevkiyat.plan-yaz', 'sevkiyat.tanim-yaz', 'siparisler.oku', 'stok.istek',
    ],
  },
  uretim_muduru: {
    ad: 'Üretim Müdürü',
    islemler: [
      'arkon.amir', 'arkon.yansima-oku', 'arkon.yansima-yeniden', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.oku',
      'cnc-kurulum.takim-degistir', 'cnc-kurulum.yaz', 'etiket-merkezi.bas', 'etiket-merkezi.oku', 'idari-isler.arac-talebi-ac',
      'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.devam-onay', 'ik.izin-onay', 'ik.izin-talep', 'ik.pozisyon-onay',
      'istasyonlar.makine-durumu', 'istasyonlar.yaz', 'kalite-merkezi.oku', 'kisiler.oku', 'mesaj.oku', 'mesaj.yaz', 'oee.oku', 'plan.oku',
      'plan.planlama-oku', 'recete-rota.oku', 'rota.emre-kopyala', 'saat.oku', 'saat.uyari-ustlen', 'satin-alma.talep-ac', 'sayfa.adim-durumu', 'sayfa.akis',
      'sayfa.arkon', 'sayfa.atolye', 'sayfa.cizelge', 'sayfa.cnc-kurulum', 'sayfa.durus-nedenleri', 'sayfa.emirler', 'sayfa.etiket-merkezi',
      'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kalibrasyon', 'sayfa.kalite-merkezi', 'sayfa.kuyruk',
      'sayfa.malzemeler', 'sayfa.matris', 'sayfa.mesai', 'sayfa.mesaj', 'sayfa.oee', 'sayfa.ortak-dosyalar', 'sayfa.personel', 'sayfa.plan',
      'sayfa.profil', 'sayfa.recete-rota', 'sayfa.rota', 'sayfa.smartes', 'sayfa.stok', 'sayfa.taleplerim', 'sayfa.terminal',
      'sayfa.uretim-emirleri', 'sayfa.uretim-terminali', 'sayfa.vardiya', 'stok.istek', 'terminal.uret', 'uretim-emirleri.adim-durumu-yaz', 'uretim-emirleri.ara-istasyon',
      'uretim-emirleri.fason', 'uretim-emirleri.hazirlik-muaf', 'uretim-emirleri.kapanis-oku', 'uretim-emirleri.kapanis-onay',
      'uretim-emirleri.sayim-duzelt', 'uretim-emirleri.yaz', 'vardiya.durus-yaz', 'vardiya.gecmis-yaz', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
  vardiya_sorumlusu: {
    ad: 'Vardiya Sorumlusu',
    islemler: [
      'arkon.amir', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir', 'etiket-merkezi.bas',
      'etiket-merkezi.oku', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep',
      'istasyonlar.makine-durumu', 'mesaj.oku', 'mesaj.yaz', 'plan.oku', 'saat.oku', 'saat.uyari-ustlen', 'sayfa.arkon',
      'sayfa.cnc-kurulum', 'sayfa.etiket-merkezi', 'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.istasyonlar', 'sayfa.kuyruk',
      'sayfa.mesaj', 'sayfa.ortak-dosyalar', 'sayfa.profil', 'sayfa.terminal', 'sayfa.uretim-terminali', 'sayfa.vardiya', 'stok.istek',
      'terminal.uret', 'uretim-emirleri.ara-istasyon', 'uretim-emirleri.sayim-duzelt', 'vardiya.tanim-yaz', 'vardiya.yaz',
    ],
  },
} as const satisfies Record<string, BeklenenRol>;

export type RolKodu = keyof typeof ROL_MATRISI | typeof YONETICI_ROLU.kod;

// Hiçbir role verilmez; yalnız bayraklı yönetici yapar.
export const YALNIZ_YONETICIDE: readonly Islem[] = [
  'arkon.yonetici', 'denetim.govde-oku', 'guvenlik.oku', 'guvenlik.yonet', 'kisiler.parola-degistir', 'kisiler.rol-yonet',
  'logo.birim-seti-yaz', 'mesaj.yonet', 'oturum.ortak-cihaz', 'saglik.ayrinti-oku', 'sayfa.guvenlik', 'smartes.esleme-yaz',
];

export const ROL_KODLARI: readonly RolKodu[] = [YONETICI_ROLU.kod, ...(Object.keys(ROL_MATRISI) as (keyof typeof ROL_MATRISI)[])];

export const rolKoduMu = (deger: string): deger is RolKodu => (ROL_KODLARI as readonly string[]).includes(deger);

// O rolle giren kişinin girişte alacağı işlemler, sıralı ve kopya.
export function rolunIslemleri(kod: RolKodu): Islem[] {
  return kod === YONETICI_ROLU.kod ? [...ISLEMLER].sort() : [...ROL_MATRISI[kod].islemler].sort();
}

// Birden çok rolün birleşimi: kişinin yetkisi rollerinin birleşimidir.
export function rollerinIslemleri(...kodlar: RolKodu[]): Islem[] {
  return [...new Set(kodlar.flatMap(rolunIslemleri))].sort();
}

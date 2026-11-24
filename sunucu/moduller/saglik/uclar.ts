import { ayarOku, pgVeriDiziniOku } from '#cekirdek/ayar.ts';
import type { Ayar } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import { uc } from '#cekirdek/uc.ts';
import { isDurumlari } from '#cekirdek/zamanlayici.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import { varsayilanGunlukDizini } from '#cekirdek/gunluk-dosyasi.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { ayrintiCevabi, disBaglantilarCevabi, ekranHatalariCevabi, ekranHatalariSorgusu, ekranHatasiGovdesi, ekranHatasiYazildiCevabi, veritabaniCevabi, gunlukCevabi, gunlukSorgusu, kapanmaAyrintisiSemasi, kapanmaParametresi, kapanmalarCevabi, metriklerCevabi, saatOzetiSemasi, saatlikCevabi, saatlikSorgusu, saglikCevabi, suAnCevabi, yukCevabi, yukSorgusu } from '#paylasilan/sozlesme/saglik.ts';
import type { SaatOzeti } from '#paylasilan/sozlesme/saglik.ts';
import { disBaglantilar, SUREC_DIS_BAGLANTI_KAYNAGI } from './dis-baglanti.ts';
import type { DisBaglantiKaynagi } from './dis-baglanti.ts';
import { ekranHatalariListesi, ekranHatasiKaydet } from './ekran-hatasi.ts';
import { veritabaniTopla } from './veritabani.ts';
import { gunlukOku } from './gunluk-okuyucu.ts';
import { kapanmaAyrintisi, kapanmalarListesi } from './kapanma.ts';
import { YOKLAMA_SURE_SINIRI_MS, saatlikBaslangic } from './kurallar.ts';
import { metrikSaatleriOku } from './sorgular.ts';
import { SUREC_SU_AN_KAYNAGI, SU_AN_UCU_ADRESI, suAnTopla } from './su-an.ts';
import type { SuAnKaynagi } from './su-an.ts';
import { surecYuku } from './yuk.ts';
import type { YukToplayici } from './yuk.ts';
import type { YedekBilgisi } from './kurallar.ts';
import {
  ayrintiTopla, gitCommitOku, olayDongusuOlceri, onbellekliOkuyucu, onbellekliOtomatikAcilis, saglikliMi, surecMetrikleri, surecYedegi,
  zamanlayiciGoreviSorgula,
} from './servis.ts';
import type { MetrikToplayici } from './servis.ts';
import type { DiskDizinleri, DiskOkuyucu, GitOkuyucu } from './servis.ts';
import type { GorevSorgusu } from './kurallar.ts';
import { calisanYayinOku, yedekOrtaminiKur } from '../ayarlar/disari.ts';

export interface SaglikKaynagi {
  ayarOku: () => Pick<Ayar, 'commit' | 'ortam'>;
  gitOku: GitOkuyucu;
  // Verilmezse süreçte başlatılmış zamanlayıcınınki.
  isDurumlari?: () => readonly IsDurumu[];
  // Verilmezse yedek klasörü Sistem Ayarları'ndan ya da TMIV2_YEDEK_DIZINI'nden, veritabanı klasörü TMIV2_PG_VERI_DIZINI'nden.
  diskDizinleri?: (db: Db) => Promise<DiskDizinleri>;
  diskOku?: DiskOkuyucu;
  // Verilmezse yedek klasöründeki en yeni yedek dosyası (Sistem Ayarları'ndaki yedek listesiyle aynı kaynak).
  yedekOku?: (db: Db) => Promise<YedekBilgisi>;
  // Verilmezse otomatik açılış okunmaz (null); süreç kaynağında yalnız Windows'ta Görev Zamanlayıcı sorgulanır.
  gorevSorgula?: (gorevAdi: string) => Promise<GorevSorgusu>;
  // Verilmezse güncelleyicinin yazdığı çalışan sürüm dosyasından (Sistem Ayarları > Güncelleme ile aynı kaynak).
  yayinOku?: () => Promise<string | null>;
  // Verilmezse süreçte dakikalık işin doldurduğu toplayıcı.
  metrikler?: Pick<MetrikToplayici, 'dakikalar'>;
  // Verilmezse TMIV2-GUNLUK klasörü (depo klasörünün yanında).
  gunlukDizini?: () => string;
  // Şu an, yük ve dış bağlantı kaynakları (3668 B); verilmezse süreçtekiler.
  suAn?: Omit<SuAnKaynagi, 'acilis'>;
  yuk?: Pick<YukToplayici, 'oku' | 'sunucuAcilis'>;
  disBaglanti?: DisBaglantiKaynagi;
}

async function surecDiskDizinleri(db: Db): Promise<DiskDizinleri> {
  return { yedek: (await yedekOrtaminiKur(db)).dizin, veritabani: pgVeriDiziniOku() };
}

const SUREC_KAYNAGI: SaglikKaynagi = {
  ayarOku, gitOku: () => gitCommitOku(),
  ...(process.platform === 'win32' ? { gorevSorgula: (ad: string) => zamanlayiciGoreviSorgula(ad) } : {}),
};

// Süre sınırı parametredir ki test kısa bir sınırla asılı veritabanını sınayabilsin.
export function saglikUclari(yoklamaSureSiniriMs: number, kaynak: SaglikKaynagi = SUREC_KAYNAGI) {
  const gitOkuyucu = onbellekliOkuyucu(kaynak.gitOku);
  const olayDongusu = olayDongusuOlceri();
  const otomatikAcilisOku = kaynak.gorevSorgula === undefined ? undefined : onbellekliOtomatikAcilis(kaynak.gorevSorgula);
  // Ortam süreç ömründe değişmez. İlk istekte okunur, modül yüklenirken değil: uç listesini çıkaran
  // araç bu dosyayı ortam değişkenleri olmadan yükler.
  let ayar: Pick<Ayar, 'commit' | 'ortam'> | undefined;
  return [
    uc({
      yontem: 'GET',
      yol: '/saglik',
      yetki: 'acik',
      txDisi: true,
      cevap: saglikCevabi,
      isle: async ({ db, istek }) => {
        if (await saglikliMi(db, yoklamaSureSiniriMs)) return { durum: 'ok' as const };
        istek.durumKoduYaz(503);
        return { durum: 'hata' as const };
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/saglik/ayrinti',
      yetki: 'saglik.ayrinti-oku',
      txDisi: true,
      cevap: ayrintiCevabi,
      isle: ({ db }) => {
        ayar ??= kaynak.ayarOku();
        return ayrintiTopla(db, {
          gitOkuyucu,
          ortamCommit: ayar.commit,
          ortam: ayar.ortam,
          calismaSuresiSn: Math.floor(process.uptime()),
          isDurumlari: kaynak.isDurumlari ?? isDurumlari,
          yoklamaSureSiniriMs,
          diskDizinleri: () => (kaynak.diskDizinleri ?? surecDiskDizinleri)(db),
          ...(kaynak.diskOku === undefined ? {} : { diskOku: kaynak.diskOku }),
          yedekOku: () => (kaynak.yedekOku ?? surecYedegi)(db),
          olayDongusu,
          yayinOku: kaynak.yayinOku ?? (() => calisanYayinOku()),
          ...(otomatikAcilisOku === undefined ? {} : { otomatikAcilisOku }),
        });
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/saglik/metrikler',
      yetki: 'saglik.ayrinti-oku',
      txDisi: true,
      cevap: metriklerCevabi,
      isle: () => ({ dakikalar: (kaynak.metrikler ?? surecMetrikleri).dakikalar() }),
    }),
    // Sistem durumu grafiklerinin 24 saat, 7 gün ve 13 ay görünümü (1664): dakikalık işin yazdığı saatlik özetler.
    uc({
      yontem: 'GET',
      yol: '/saglik/metrikler/saatlik',
      yetki: 'saglik.ayrinti-oku',
      sorgu: saatlikSorgusu,
      cevap: saatlikCevabi,
      // Sözleşme değişmeden önce yazılmış (biçimi uymayan) satır bütün grafiği düşürmesin: o saat boş kalır.
      isle: async ({ db, sorgu }) => ({
        saatler: (await metrikSaatleriOku<SaatOzeti>(db, saatlikBaslangic(sorgu.aralik, new Date()))).filter((s) => saatOzetiSemasi.safeParse(s).success),
      }),
    }),
    // Ekran hataları (3668 C): her oturum kendi ekranının hatasını bildirir (kişi oturumdan alınır); okumak ayrıntı işlemini ister.
    // İstemci aynı hatayı dakikada en çok bir kez yollar; sunucu kişi başına dakikada 20 istekle sınırlar ve aynı hatayı tek satırda sayar.
    // Denetim gövdesizdir: kalıcı defter bu uçtan şişmez (3668 C, Risk S1).
    uc({
      yontem: 'POST',
      yol: '/saglik/ekran-hatalari',
      yetki: 'oturum',
      sahiplik: 'yok',
      denetim: 'govdesiz',
      govde: ekranHatasiGovdesi,
      cevap: ekranHatasiYazildiCevabi,
      isle: async ({ db, kullanici, govde }) => {
        await ekranHatasiKaydet(db, kullanici.id, govde);
        return { kaydedildi: true as const };
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/saglik/ekran-hatalari',
      yetki: 'saglik.ayrinti-oku',
      sorgu: ekranHatalariSorgusu,
      cevap: ekranHatalariCevabi,
      isle: ({ db, sorgu }) => ekranHatalariListesi(db, sorgu.donem, new Date()),
    }),
    uc({
      yontem: 'GET',
      yol: '/saglik/veritabani',
      yetki: 'saglik.ayrinti-oku',
      cevap: veritabaniCevabi,
      isle: ({ db }) => veritabaniTopla(db),
    }),
    // Kapanmalar (3668 A1): sunucu düşüp yeniden açılınca yazılan kayıtlar, en yeniden eskiye (90 gün).
    uc({
      yontem: 'GET',
      yol: '/saglik/kapanmalar',
      yetki: 'saglik.ayrinti-oku',
      cevap: kapanmalarCevabi,
      isle: async ({ db }) => ({ kapanmalar: await kapanmalarListesi(db, new Date()) }),
    }),
    uc({
      yontem: 'GET',
      yol: '/saglik/kapanmalar/:id',
      yetki: 'saglik.ayrinti-oku',
      parametre: kapanmaParametresi,
      cevap: kapanmaAyrintisiSemasi,
      isle: async ({ db, parametre }) => {
        const k = await kapanmaAyrintisi(db, parametre.id);
        if (k === null) throw bulunamadi('Kapanma kaydı bulunamadı.');
        return k;
      },
    }),
    // Günlük (3668 A2): bugünkü ve önceki günün dosyası ekrandan okunur; sondan, sayfalı, en çok 500 satır.
    uc({
      yontem: 'GET',
      yol: '/saglik/gunluk',
      yetki: 'saglik.ayrinti-oku',
      txDisi: true,
      sorgu: gunlukSorgusu,
      cevap: gunlukCevabi,
      isle: ({ sorgu }) => gunlukOku((kaynak.gunlukDizini ?? varsayilanGunlukDizini)(), sorgu),
    }),
    // Şu an (3668 B1): süren istekler, hesaplar, oturumlar, veritabanı bağlantıları ve kilit beklemeleri; ekran 5 saniyede bir ister.
    uc({
      yontem: 'GET',
      yol: SU_AN_UCU_ADRESI,
      yetki: 'saglik.ayrinti-oku',
      cevap: suAnCevabi,
      isle: ({ db }) => suAnTopla(db, { ...(kaynak.suAn ?? SUREC_SU_AN_KAYNAGI), acilis: () => (kaynak.yuk ?? surecYuku).sunucuAcilis() }),
    }),
    // Yük ve davranış (3668 B2): tekrar eden denemeler, en meşgul uçlar, takılma anları, ekran başına yenileme yükü.
    uc({
      yontem: 'GET',
      yol: '/saglik/yuk',
      yetki: 'saglik.ayrinti-oku',
      txDisi: true,
      sorgu: yukSorgusu,
      cevap: yukCevabi,
      isle: ({ sorgu }) => (kaynak.yuk ?? surecYuku).oku(sorgu.donem),
    }),
    // Dış bağlantılar (3668 B3): yalnız modüllerin `disari.ts` ile bildirdiği durum.
    uc({
      yontem: 'GET',
      yol: '/saglik/dis-baglantilar',
      yetki: 'saglik.ayrinti-oku',
      txDisi: true,
      cevap: disBaglantilarCevabi,
      isle: () => ({ baglantilar: disBaglantilar(kaynak.disBaglanti ?? SUREC_DIS_BAGLANTI_KAYNAGI) }),
    }),
  ];
}

export const uclar = saglikUclari(YOKLAMA_SURE_SINIRI_MS);

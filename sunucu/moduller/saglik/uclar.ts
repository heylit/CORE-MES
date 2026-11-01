import { ayarOku, pgVeriDiziniOku } from '#cekirdek/ayar.ts';
import type { Ayar } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import { uc } from '#cekirdek/uc.ts';
import { isDurumlari } from '#cekirdek/zamanlayici.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import { ayrintiCevabi, metriklerCevabi, saglikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { YOKLAMA_SURE_SINIRI_MS } from './kurallar.ts';
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
  ];
}

export const uclar = saglikUclari(YOKLAMA_SURE_SINIRI_MS);

import { ayarOku, pgVeriDiziniOku } from '#cekirdek/ayar.ts';
import type { Ayar } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import { uc } from '#cekirdek/uc.ts';
import { isDurumlari } from '#cekirdek/zamanlayici.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import { ayrintiCevabi, saglikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { YOKLAMA_SURE_SINIRI_MS } from './kurallar.ts';
import type { YedekBilgisi } from './kurallar.ts';
import { ayrintiTopla, gitCommitOku, olayDongusuOlceri, onbellekliOkuyucu, saglikliMi, surecYedegi } from './servis.ts';
import type { DiskDizinleri, DiskOkuyucu, GitOkuyucu } from './servis.ts';
import { yedekOrtaminiKur } from '../ayarlar/disari.ts';

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
}

async function surecDiskDizinleri(db: Db): Promise<DiskDizinleri> {
  return { yedek: (await yedekOrtaminiKur(db)).dizin, veritabani: pgVeriDiziniOku() };
}

const SUREC_KAYNAGI: SaglikKaynagi = { ayarOku, gitOku: () => gitCommitOku() };

// Süre sınırı parametredir ki test kısa bir sınırla asılı veritabanını sınayabilsin.
export function saglikUclari(yoklamaSureSiniriMs: number, kaynak: SaglikKaynagi = SUREC_KAYNAGI) {
  const gitOkuyucu = onbellekliOkuyucu(kaynak.gitOku);
  const olayDongusu = olayDongusuOlceri();
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
        });
      },
    }),
  ];
}

export const uclar = saglikUclari(YOKLAMA_SURE_SINIRI_MS);

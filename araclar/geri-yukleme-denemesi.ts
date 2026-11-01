import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ayarOku } from '#cekirdek/ayar.ts';
import type { Db } from '#cekirdek/db.ts';
import type { GeriYuklemeDenemesi } from '#paylasilan/sozlesme/saglik.ts';
import { DENEME_KAYDI_DOSYASI, denemeSatiri } from '../sunucu/moduller/saglik/disari.ts';

// Geri yükleme denemesi (1670, 1743 a): yedek asıl veritabanına dokunmadan ayrı deneme veritabanına yüklenir, sayılar okunur ve
// sonuç yedek klasöründeki kayda bir satır olarak eklenir; sunucu son satırı Sistem durumunda gösterir. Deneme veritabanı bir kez
// açılır (kurulum/yedek.md); araç veritabanı açmaz, kaldırmaz: uygulama ve göç kullanıcısında CREATEDB yoktur.
export const DENEME_DEGISKENI = 'TMIV2_PG_DENEME_DATABASE';

// Deneme yüklemesi hedefin bütün şemasını siler: asıl, test ya da eski sistemin veritabanı hedef olamaz.
export function denemeVeritabani(env: NodeJS.ProcessEnv): string {
  const ad = env[DENEME_DEGISKENI]?.trim() ?? '';
  if (ad === '') throw new Error(`Deneme veritabanı tanımlı değil: .env dosyasına ${DENEME_DEGISKENI} yazın (kurulum/yedek.md).`);
  const ayar = ayarOku(env);
  const ayni = (b: string | null): boolean => b !== null && b.toLowerCase() === ad.toLowerCase();
  if (ayni(ayar.pg.veritabani)) throw new Error(`${DENEME_DEGISKENI} asıl veritabanıyla (TMIV2_PG_DATABASE) aynı olamaz; hiçbir şey değişmedi.`);
  if (ayni(ayar.pgTestVeritabani)) throw new Error(`${DENEME_DEGISKENI} test veritabanıyla (TMIV2_PG_TEST_DATABASE) aynı olamaz; hiçbir şey değişmedi.`);
  // Eski sistemin veritabanı adlarını çekirdek ayar denetimi reddeder; aynı kural burada da geçsin diye ad onunla denetlenir.
  ayarOku({ ...env, TMIV2_PG_DATABASE: ad });
  return ad;
}

export async function denemeSayilari(db: Pick<Db, 'tek'>): Promise<{ kisiSayisi: number; gocSayisi: number }> {
  const satir = await db.tek<{ kisi: number; goc: number }>(
    'SELECT (SELECT count(*) FROM kisi)::int AS kisi, (SELECT count(*) FROM goc_kaydi)::int AS goc',
  );
  return { kisiSayisi: satir?.kisi ?? 0, gocSayisi: satir?.goc ?? 0 };
}

export interface DenemeAdimlari {
  yukle: () => Promise<void>;
  say: () => Promise<{ kisiSayisi: number; gocSayisi: number }>;
  simdi: () => Date;
}

// Hata deneme sonucudur, araç hatası değil: kayda "başarısız" olarak yazılır ki ekranda görünsün.
export async function denemeYap(yedek: string, a: DenemeAdimlari): Promise<GeriYuklemeDenemesi> {
  const baslama = a.simdi();
  const sure = (): number => Math.round((a.simdi().getTime() - baslama.getTime()) / 100) / 10;
  try {
    await a.yukle();
    const sayilar = await a.say();
    // Boş yedek de yüklenir ama geri dönülecek veri değildir: göç kaydı yoksa yedek bu sistemin değildir.
    if (sayilar.gocSayisi === 0) {
      return { zaman: baslama.toISOString(), yedek: path.basename(yedek), sonuc: 'basarisiz', sureSn: sure(), ...sayilar, hata: 'Yüklenen veritabanında göç kaydı yok.' };
    }
    return { zaman: baslama.toISOString(), yedek: path.basename(yedek), sonuc: 'basarili', sureSn: sure(), ...sayilar, hata: null };
  } catch (hata) {
    const ileti = (hata instanceof Error ? hata.message : String(hata)).replace(/[\r\n]+/g, ' ').slice(0, 300);
    return { zaman: baslama.toISOString(), yedek: path.basename(yedek), sonuc: 'basarisiz', sureSn: sure(), kisiSayisi: null, gocSayisi: null, hata: ileti };
  }
}

export async function denemeKaydiYaz(yedekDizini: string, d: GeriYuklemeDenemesi): Promise<string> {
  await mkdir(yedekDizini, { recursive: true });
  const dosya = path.join(yedekDizini, DENEME_KAYDI_DOSYASI);
  await appendFile(dosya, denemeSatiri(d));
  return dosya;
}

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { robotAyariOku } from './ayar.ts';
import { OKUYUCU, gunSonuDenetle } from './degismezler.ts';
import { gunleriKos } from './gun-dongusu.ts';
import { KosuKaydi } from './kayit.ts';
import { senaryolariKesfet } from './kesif.ts';
import { kesifKur, kesifModeli, playwrightSurucusu } from './kesif-kipi.ts';
import { modelKoprusuKur } from './model.ts';
import { DOSYA, adimSatiriOku } from './sozlesme.ts';
import { yorumIstemi } from './yorum.ts';
import { oturumDosyasi } from '../yollar.ts';
import type { RolIstemcisi } from './senaryo.ts';
import type { Hesap } from '../hesaplar.ts';
import type { AdimSatiri } from './sozlesme.ts';

const DEPO_KOKU = fileURLToPath(new URL('../../', import.meta.url));

function taban(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: DEPO_KOKU, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Koşu tek test: günler sırayla, her gün senaryolar aynı anda. Süre gün ve senaryo sayısına bağlıdır; sınır yok.
test('test robotu', async ({ playwright, browser, baseURL }) => {
  test.setTimeout(0);
  const ayar = robotAyariOku(process.env, DEPO_KOKU);
  const senaryolar = await senaryolariKesfet(process.env['TMIV2_ROBOT_SENARYO']);
  const roller = [...new Set(senaryolar.flatMap((s) => s.roller))];
  const kosuId = `${new Date().toISOString().replace(/[:.]/g, '-')}-t${String(ayar.tohum)}`;
  const kayit = new KosuKaydi({
    kok: ayar.sonucKlasoru, kosuId, taban: taban(), tohum: ayar.tohum, gunSayisi: ayar.gunSayisi,
    roller, senaryolar: senaryolar.map((s) => s.ad), model: { kip: ayar.model.kip, ustSinir: ayar.model.ustSinir },
  });
  console.log(`Koşu klasörü: ${kayit.klasor}`);

  const baglamlar = new Map<Hesap, APIRequestContext>();
  // Gün sonu değişmezlerini okuyan hesap senaryo süzgecinden bağımsız açılır; yoksa denetim "bağlanmamış" kalır.
  for (const h of new Set([...roller, OKUYUCU])) baglamlar.set(h, await playwright.request.newContext({ baseURL, storageState: oturumDosyasi(h) }));
  const istemci = (h: Hesap): RolIstemcisi => ({
    async istek(yontem, yol, govde) {
      const baglam = baglamlar.get(h);
      if (baglam === undefined) throw new Error(`${h} senaryonun rol listesinde yok`);
      const c = await baglam.fetch(yol, {
        method: yontem,
        ...(govde === undefined ? {} : { data: govde }),
        ...(yontem === 'GET' ? {} : { headers: { 'istek-kimligi': randomUUID() } }),
        failOnStatusCode: false,
      });
      const metin = await c.text();
      let veri: unknown = metin;
      try { veri = JSON.parse(metin); } catch { /* düz metin cevap olduğu gibi kalır */ }
      return { durum: c.status(), govde: veri };
    },
  });

  const kesif = kesifKur({ kayit, model: kesifModeli(ayar.model, kayit), surucu: playwrightSurucusu(browser, baseURL ?? ''), roller, tohum: ayar.tohum });
  try {
    await gunleriKos({
      kayit, senaryolar, istemci, tohum: ayar.tohum, gunSayisi: ayar.gunSayisi, esZamanli: ayar.esZamanli,
      gunSonu: async (gun) => { await gunSonuDenetle({ kayit, istemci, gun }); await kesif.tur(gun); },
    });
    kayit.bitir('bitti');
  } catch (hata) {
    kayit.bitir('durdu', hata instanceof Error ? hata.message : String(hata));
    throw hata;
  } finally {
    for (const b of baglamlar.values()) await b.dispose();
  }

  const model = modelKoprusuKur(ayar.model, { cagriSayildi: () => { kayit.modelCagrisi(); } });
  if (model.kip !== 'kapali') {
    const adimlar = readFileSync(join(kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((s) => s !== '')
      .map(adimSatiriOku).filter((a): a is AdimSatiri => typeof a !== 'string');
    const cevap = await model.sor(yorumIstemi(kayit.ozet, adimlar));
    kayit.yorumYaz('metin' in cevap ? cevap.metin : `Yorum alınamadı: ${cevap.hata}\n`);
  }
  console.log(`Geçti ${String(kayit.ozet.sayac.gecti)}, düştü ${String(kayit.ozet.sayac.dustu)}, ara sıra ${String(kayit.ozet.sayac['ara-sira'])}, bağlanmamış ${String(kayit.ozet.sayac.baglanmamis)}`);
});

// Uç envanteri ile yetki denemesi (kart 2273, 2325): her plan ucu kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
// Pilot yönetici hesabıyla koşarken yetki farkı görünmez; bu tablo "yapamayan yapamıyor mu"yu ölçer. Uç ya da işlemi değişirse kırmızıya döner.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { PLAN_ISLEMLERI } from '#paylasilan/islemler/plan.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

const PLAN_OKUR = { biri: ['plan.oku', 'plan.yaz'] } as const;
const PLAN_BEDELI_OKUR = { biri: ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku'] } as const;
const KAYNAK_OKUR = { biri: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'] } as const;
const KAYIT_YAZAR = { biri: ['recete-rota.yaz', 'plan.yaz'] } as const;
// Motor yerleşimi ve uyarıları bugün bir sayfa işlemiyle (sayfa.recete-rota) açılır; plan okuma işlemi (plan.oku) bu iki uca girmez.
// Bugünkü davranış olarak belgelenir; sayfa işleminden veri işlemine geçiş canlı sonrası ayrı kartla yapılır (2320, Güvenlik). O kart
// yetkiyi değiştirince bu iki satır da değişir.
const MOTOR_GORUNUMU_OKUR = { biri: ['sayfa.recete-rota', 'plan.yaz'] } as const;

const BEKLENEN: BeklenenYetkiler = {
  'GET /plan': PLAN_OKUR,
  'GET /plan/motor-yerlesimi': MOTOR_GORUNUMU_OKUR,
  'GET /plan/motor-uyarilari': MOTOR_GORUNUMU_OKUR,
  'GET /plan/canli-yerlesim': PLAN_OKUR,
  'GET /plan/canliya-alma-gecmisi': PLAN_OKUR,
  'GET /plan/veri-sagligi': { biri: ['plan.oku', 'plan.yaz', 'plan.planlama-oku'] } as const,
  'GET /plan/plan-sagligi': 'plan.planlama-oku',
  'GET /plan/analiz': 'plan.planlama-oku',
  'GET /plan/mrp-ihtiyaci': 'plan.planlama-oku',
  'GET /plan/grup-saat-maliyetleri': 'finans.maliyet-oku',
  'GET /plan/mesai-maliyeti': 'finans.maliyet-oku',
  'GET /plan/mesai-saat-degerleri': 'finans.maliyet-oku',
  'GET /plan/mesai-grup-sirasi': 'plan.planlama-oku',
  'GET /plan/surum': 'oturum',
  'GET /plan/menu-sayaclari': 'oturum',
  'POST /plan/yerlestir': 'plan.yaz',
  'POST /plan/is-emirleri/:id/tasi': 'plan.yaz',
  'POST /plan/is-emirleri/:id/kaldir': 'plan.yaz',
  'POST /plan/is-emirleri/:id/kilitle': 'plan.kilitle',
  'POST /plan/is-emirleri/:id/kilidi-ac': 'plan.kilitle',
  'POST /plan/is-emirleri/:id/dondurmayi-kaldir': 'plan.kilitle',
  'POST /plan/kuyruk/sirala': 'plan.yaz',
  'POST /plan/kuyruk/plan-sirasina-don': 'plan.yaz',
  'GET /plan/onizle': { biri: ['rota.emre-kopyala', 'plan.yaz'] } as const,
  'POST /plan/dondur': 'plan.kilitle',
  'POST /plan/dondurmayi-kaldir': 'plan.kilitle',
  'POST /plan/elle-siralari-sil': 'plan.yaz',
  'POST /plan/ayar': 'plan.yaz',
  'GET /plan/bedel-ayari': PLAN_BEDELI_OKUR,
  'POST /plan/bedel-ayari': 'plan.bedel-ayari',
  'GET /plan/motor-ayarlari': { biri: ['plan.oku', 'plan.yaz', 'plan.planlama-oku', 'plan.motor-ayari'] } as const,
  'POST /plan/motor-ayarlari': 'plan.motor-ayari',
  'POST /plan/senaryolar/:id/motor-ayari-guncelle': 'plan.yaz',
  'POST /plan/senaryolar/:id/motor-kurali': 'plan.yaz',
  'GET /plan/siparisler/:id/carpan': PLAN_BEDELI_OKUR,
  'POST /plan/kuyruklari-yaz': 'plan.yaz',
  'GET /plan/senaryolar': PLAN_OKUR,
  'POST /plan/senaryolar': 'plan.studyo',
  'POST /plan/senaryolar/:id/cogalt': 'plan.studyo',
  'POST /plan/senaryolar/:id/bilgi': 'plan.studyo',
  'POST /plan/senaryolar/:id/degisiklikler/:degisiklikId/kaldir': 'plan.studyo',
  'POST /plan/senaryolar/:id/degisiklikleri-at': 'plan.studyo',
  'POST /plan/senaryolar/:id/canliyi-al': 'plan.studyo',
  'POST /plan/senaryolar/:id/hizli': 'plan.studyo',
  'POST /plan/senaryolar/:id/onaya-gonder': 'plan.studyo',
  'POST /plan/senaryolar/:id/onaydan-cek': 'plan.studyo',
  'POST /plan/senaryolar/:id/geri-gonder': 'plan.canliya-al',
  'POST /plan/senaryolar/:id/canliya-al': 'plan.canliya-al',
  'GET /plan/musteri-secenekleri': 'plan.canliya-al',
  'POST /plan/senaryolar/:id/ek-mesai': 'plan.yaz',
  'POST /plan/senaryolar/:id/vazgec': 'plan.studyo',
  'GET /plan/planlama-kaynagi': KAYNAK_OKUR,
  'GET /plan/planlanabilirlik': KAYNAK_OKUR,
  'GET /plan/planlanabilirlik/rotalar': KAYNAK_OKUR,
  'GET /plan/planlama-kapasitesi': KAYNAK_OKUR,
  'GET /plan/satin-alma-eki': KAYNAK_OKUR,
  'GET /plan/planlama-kayitlari': KAYNAK_OKUR,
  // Uç iki işlemden birini ister; çalışma anahtarına plan.yaz, ötekilere recete-rota.yaz gerektiğini servis ayırır
  // (planlama-kaydi-yetki.test.ts).
  'POST /plan/planlama-kayitlari/yaz': KAYIT_YAZAR,
  'POST /plan/planlama-kayitlari/sil': KAYIT_YAZAR,
  'GET /plan/degisiklik-defteri': 'plan.planlama-oku',
  'GET /plan/planlama-calismasi': 'plan.planlama-oku',
  'POST /plan/planlama-calismasi/olustur': 'plan.yaz',
  // 2316: çalışmayı şu an kimin düzenlediği; yalnız okur, planlama sayfasını gören okur.
  'GET /plan/planlama-calismasi/duzenleyen': 'plan.planlama-oku',
  'GET /plan/planlama-calismasi/satin-alma': { biri: ['satin-alma.oku', 'satin-alma.yaz', 'plan.planlama-oku'] } as const,
  // Uç kapısı plan.planlama-oku; işleyici canlı planı okuma yetkisini (GET /plan'ınki) ayrıca arar (506 a). İki aşamalı olduğundan
  // envanter denemesinin dışında, aşağıdaki ayrı testte denenir.
  'GET /plan/planlama-calismasi/canli-farki': 'plan.planlama-oku',
  'GET /plan/projeler/:projeId/plan-gerceklesen': { biri: ['sayfa.projeler', 'projeler.oku'] } as const,
  'GET /plan/planlama-calismasi/taban-ve-canli': PLAN_OKUR,
  'POST /plan/planlama-calismasi/taslak-yaz': 'plan.yaz',
  // Uç recete-rota.yaz ister; taslağı okuma yetkisi (plan okuma) işleyicide ayrıca aranır.
  'POST /plan/planlama-calismasi/taslaktan-yaz': 'recete-rota.yaz',
  'POST /plan/planlama-calismasi/geri-al': 'recete-rota.yaz',
  'POST /plan/planlama-calismasi/is-tasi': 'plan.yaz',
  'GET /plan/planlama-calismasi/is-tasi-onizlemesi': 'plan.yaz',
  'POST /plan/planlama-calismasi/plana-al': 'plan.yaz',
  'GET /plan/planlama-calismasi/plana-al-onizlemesi': 'plan.yaz',
  'POST /plan/planlama-calismasi/olay-ekle': 'plan.yaz',
  'POST /plan/planlama-calismasi/ek-mesai-ekle': 'plan.yaz',
  // Değerlendirme ve yıllık çözüm kayıt yazmaz; planlama sayfasını gören başlatır.
  'POST /plan/planlama-degerlendirmesi': 'plan.planlama-oku',
  'GET /plan/planlama-degerlendirmesi/:is': 'plan.planlama-oku',
  'POST /plan/yillik-plan/coz': 'plan.planlama-oku',
  'GET /plan/yillik-plan/coz/:is': 'plan.planlama-oku',
};

const CANLI_FARKI = '/plan/planlama-calismasi/canli-farki';
const BEKLENEN_TEK_ASAMALI: BeklenenYetkiler = Object.fromEntries(Object.entries(BEKLENEN).filter(([ad]) => ad !== `GET ${CANLI_FARKI}`));

describe('plan uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('plan_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar: uclar.filter((u) => u.yol !== CANLI_FARKI), beklenen: BEKLENEN_TEK_ASAMALI, islemler: PLAN_ISLEMLERI,
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });

  test('canlı farkı: kapı plan.planlama-oku, işleyici plan okumayı da ister', async () => {
    assert.equal(uclar.filter((u) => u.yol === CANLI_FARKI).length, 1);
    const cerezAl = rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur });
    const durum = async (islemler: readonly string[] | null): Promise<number> => (await app.inject({
      method: 'GET', url: `/api${CANLI_FARKI}`, headers: islemler === null ? {} : { cookie: await cerezAl(islemler) },
    })).statusCode;
    assert.equal(await durum(null), 401);
    for (const islem of PLAN_ISLEMLERI) assert.equal(await durum([islem]), 403, islem);
    assert.notEqual(await durum(['plan.planlama-oku', 'plan.oku']), 403);
    assert.notEqual(await durum(['plan.planlama-oku', 'plan.yaz']), 403);
    assert.equal(await durum(['plan.oku', 'plan.yaz', 'plan.kilitle', 'plan.studyo']), 403);
  });
});

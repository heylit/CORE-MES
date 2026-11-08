// Yalnız testte kullanılır: modülün uç envanterindeki her ucu kimliksiz, istediği işlemle ve başka işlemlerle dener (kart 2273).
// Elle yazılan uç listesi yeni ucu kaçırır; envanter kaçırmaz. Beklenen tablo modülün testindedir: ucun istediği işlem
// değişirse ya da yeni uç gelirse test kırmızıya döner ve değişiklik gözden geçirmede görünür.
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Db, Veritabani } from './db.ts';
import { ucEnvanteri } from './uc.ts';
import type { Uc, UcYetkisi } from './uc.ts';

// Verilen işlemlerin tam olarak kendisine sahip bir kişinin oturum çerezi ('ad=deger').
export type CerezAl = (islemler: readonly string[]) => Promise<string>;

// kisiler/disari.ts yoneticiOlustur imzası. Çekirdek modül ithal edemez (sinir kuralı b): çağıran test verir.
export type KisiOlustur = (db: Db, girdi: { ad: string; kullaniciAdi: string; parola: string }) => Promise<number>;

// Beklenen tablo `${yontem} ${yol}` -> yetki; ucEnvanteri'nin verdiği biçimdir.
export type BeklenenYetkiler = Readonly<Record<string, UcYetkisi>>;

export interface YetkiDenemesi {
  // Uçların kayıtlı olduğu uygulama (uygulamaKur ya da uclariKaydet ile kurulmuş).
  uygulama: FastifyInstance;
  uclar: readonly Uc[];
  beklenen: BeklenenYetkiler;
  cerezAl: CerezAl;
  // Modülün sayfa ve veri işlemleri. Uçlarda geçen başka modül işlemleri de ayrıca denenir.
  islemler: readonly string[];
  // Yol parametresinin denemedeki değeri (örn. tarih: '2026-10-08'); verilmeyen parametre var olmayan kayıt numarası alır.
  parametre?: Readonly<Record<string, string>>;
}

const YOK_KAYIT = '999999';
const PAROLA = 'yetki-denemesi-1';

const yetkiIslemleri = (yetki: UcYetkisi): readonly string[] =>
  typeof yetki === 'object' ? yetki.biri : yetki === 'acik' || yetki === 'oturum' ? [] : [yetki];

// Oturumlu her kişi 'oturum' ucuna girer; işlemli uçta tek işlemli kişi yalnız o işlem listedeyse girer.
const girerMi = (yetki: UcYetkisi, islem: string): boolean => yetki === 'oturum' || yetkiIslemleri(yetki).includes(islem);

const yolDoldur = (yol: string, parametre: Readonly<Record<string, string>>): string =>
  yol.replace(/:([A-Za-z0-9_]+)/g, (_, ad: string) => parametre[ad] ?? YOK_KAYIT);

// Uygulamayı yalnız çerez ve istek kimliğiyle çağırır. Gövde gönderilmez: yetki gövde doğrulamasından önce denetlenir; yetkili
// istek doğrulama, bulunamadı ya da çakışma ile döner, yetkisiz istek 401 ya da 403 ile döner.
async function durumKodu(uygulama: FastifyInstance, yontem: Uc['yontem'], yol: string, cerez: string | null): Promise<number> {
  const cevap = await uygulama.inject({
    method: yontem, url: `/api${yol}`,
    headers: { ...(cerez === null ? {} : { cookie: cerez }), ...(yontem === 'GET' ? {} : { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }) },
  });
  return cevap.statusCode;
}

// Bulunan sapmaların listesi; boşsa her uç beklenen işlemi ister ve yalnız onunla geçer. Testte `assert.deepEqual(.., [])`.
export async function uclarinYetkisiniDene(deneme: YetkiDenemesi): Promise<string[]> {
  const sapmalar: string[] = [];
  const envanter = ucEnvanteri(deneme.uclar);
  const bulunan = new Map(envanter.map((u) => [`${u.yontem} ${u.yol}`, u.yetki]));
  for (const [ad, yetki] of bulunan) {
    if (!(ad in deneme.beklenen)) sapmalar.push(`${ad}: beklenen tabloda yok (yetki ${JSON.stringify(yetki)})`);
    else if (JSON.stringify(deneme.beklenen[ad]) !== JSON.stringify(yetki)) {
      sapmalar.push(`${ad}: yetki ${JSON.stringify(yetki)}, beklenen ${JSON.stringify(deneme.beklenen[ad])}`);
    }
  }
  for (const ad of Object.keys(deneme.beklenen)) if (!bulunan.has(ad)) sapmalar.push(`${ad}: uç yok`);

  const islemler = [...new Set([...deneme.islemler, ...envanter.flatMap((u) => yetkiIslemleri(u.yetki))])].sort();
  const cerezler = new Map<string, string>();
  for (const islem of islemler) cerezler.set(islem, await deneme.cerezAl([islem]));
  const parametre = deneme.parametre ?? {};

  for (const u of envanter) {
    // Açık uç kimlik istemez; denenecek yetki yoktur.
    if (u.yetki === 'acik') continue;
    const ad = `${u.yontem} ${u.yol}`;
    const yol = yolDoldur(u.yol, parametre);
    const kimliksiz = await durumKodu(deneme.uygulama, u.yontem, yol, null);
    if (kimliksiz !== 401) sapmalar.push(`${ad} kimliksiz -> ${kimliksiz}, beklenen 401`);
    for (const [islem, cerez] of cerezler) {
      const durum = await durumKodu(deneme.uygulama, u.yontem, yol, cerez);
      if (girerMi(u.yetki, islem)) {
        if (durum === 401 || durum === 403) sapmalar.push(`${ad} ${islem} -> ${durum}, yetki geçmeliydi`);
      } else if (durum !== 403) sapmalar.push(`${ad} ${islem} -> ${durum}, beklenen 403`);
    }
  }
  return sapmalar;
}

// Gerçek giriş akışıyla çerez: kişi açılır, yalnız verilen işlemleri taşıyan yeni role geçirilir, /api/oturum/giris ile girer.
// `giris` oturum modülünün kayıtlı olduğu uygulamadır (uygulamaKur); denenen uçlar başka bir uygulamada olabilir.
export function rolluGiris(secenek: { giris: FastifyInstance; vt: Veritabani; kisiOlustur: KisiOlustur }): CerezAl {
  const { giris, vt, kisiOlustur } = secenek;
  return async (islemler) => {
    const kullaniciAdi = `yd${randomBytes(5).toString('hex')}`;
    const rol = `rol_${kullaniciAdi}`;
    const id = await vt.tx((db) => kisiOlustur(db, { ad: 'Yetki Denemesi', kullaniciAdi, parola: PAROLA }));
    await vt.tx(async (db) => {
      await db.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [rol]);
      for (const islem of islemler) {
        await db.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [rol, islem]);
      }
      await db.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rol]);
    });
    const cevap = await giris.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    if (cevap.statusCode !== 200) throw new Error(`Yetki denemesi girişi başarısız (${cevap.statusCode}): ${cevap.body}`);
    const cerez = String(cevap.headers['set-cookie'] ?? '').split(';')[0] ?? '';
    if (cerez === '') throw new Error('Yetki denemesi girişi çerez vermedi.');
    return cerez;
  };
}

// Örnek kayıt sahibi modüllerin örnek verisinden kurulur: ürün, operasyon, rota ve emir bu modülün durum okumasıyla (servis.durum)
// İstasyonlar, Malzemeler, Rota ve Üretim emirleri örneklerinin kimlikleriyle gelir. Ekran kaydı açılışta sahiplerinden aynı biçimde
// okur; planlama sayfası rotayı ve emri kayıttan okuduğu için kimlikler tesisle (istasyon, makine) eşleşmek zorundadır. Tezgâh, kişi
// ve takvim kayda yazılmaz (bagliDilimleriAyikla). Gerçek ürün, müşteri ya da kişi adı yoktur.
import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ANAHTAR_ONEKI } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { kayitGetir } from './sorgular.ts';
import { durum, yaz } from './servis.ts';

const KAYDEDEN = 'ornek.planlama';

// Durum okuması yalnız bu koşuda bu işlemlerle yapılır; hesabın rolleri değişmez (rota örneğindeki gibi).
const OKUMA: readonly Islem[] = ['sayfa.malzemeler', 'sayfa.istasyonlar', 'kisiler.oku', 'sayfa.rota', 'sayfa.stok', ...ADIMLI_OKUMA_ISLEMLERI];

// Kayıt, ekranın sahiplerinden okuyup yazacağı hâldir: ürünler, operasyon tanımları, yürürlükteki rotalar ve revizyonlar, emirler.
export function ornekBelge(d: DurumCevabi, gun: string, an: Date): Record<string, unknown> {
  const items = d.items ?? [];
  const mamul = items.find((m) => m.type === 'mamul' && d.routes?.[m.id] !== undefined);
  return {
    version: 7,
    ornek: true,
    name: 'Ornek atolye',
    items,
    opdefs: d.opdefs ?? [],
    routes: d.routes ?? {},
    routeRevs: d.routeRevs ?? [],
    orders: d.emirler?.orders ?? [],
    opStatus: d.emirler?.opStatus ?? {},
    opProg: d.emirler?.opProg ?? {},
    settings: { orderItem: mamul?.id ?? null, orderQty: 50, start: gun, due: null, useStock: true },
    moves: [], assign: {}, qorder: {}, frozen: {}, splitManual: {}, statusStock: {}, statusCards: [], gercekSure: {},
    savedAt: an.getTime(),
  };
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'recete-rota',
  gerekir: ['kisiler', 'malzemeler', 'istasyonlar', 'rota', 'uretim-emirleri', 'stok', 'vardiya'],
  // Yalnız ana durum anahtarına bakılır: kayıt (örnek ya da gerçek) varsa üstüne yazılmaz.
  yukluMu: async (db) => (await kayitGetir(db, ANAHTAR_ONEKI)) !== null,
  yukle: async (db, baglam) => {
    const kisiId = await kisiNoKullaniciAdindan(db, KAYDEDEN);
    const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
    if (kullanici === null) throw new Error(`Recete ve rota ornek verisi ${KAYDEDEN} hesabini bulamadi (kisiler ornek verisi once yuklenmeli).`);
    if ((await kayitGetir(db, ANAHTAR_ONEKI)) !== null) return;
    const okuyan: Kullanici = { ...kullanici, islemler: [...new Set([...kullanici.islemler, ...OKUMA])] };
    const d = await durum(db, okuyan);
    if (d.routes === null || Object.keys(d.routes).length === 0) throw new Error('Recete ve rota ornek verisi yururlukte rota bulamadi (rota ornek verisi once yuklenmeli).');
    await yaz(db, kullanici, { anahtar: ANAHTAR_ONEKI, bicim: 'json', deger: ornekBelge(d, baglam.gun, baglam.an), beklenenSurum: null });
  },
});

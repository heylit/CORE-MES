import type { Db } from '#cekirdek/db.ts';
import { dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import {
  ACIK_TAKIP_EN_COK, KADEME_KAYNAKLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, kaynakKademeleri,
  type AcikTakiplerCevabi, type GecikenlerimCevabi, type KademeAyarDegistirGovdesi, type KademeAyarlariCevabi, type KademeKaynagi, type KademeKaynagiTanimi,
  type KademeTakipSatiri,
} from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { kisiAdlari, kisilerinIslemleri, rolSecenekleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import { bildirilecekKademe, gerekenKademeler, kademeAliciKumeleri, kademeAyarHatasi, kademeBildirimMetni, type KademeAliciTuru, type KademeKurali } from './kurallar.ts';
import { bildirimGonder, bildirimKapat, yalnizKisilerAlicilari } from './servis.ts';
import * as sk from './sorgular/kademe/sorgular.ts';
import { gecerliAyarlar, type GecerliAyar } from './kademe-ayar.ts';


// 3405 a: kademeli uyarı bütün sistem için tek motordur. Her kaynak (hazırlık görevi, satın alma onayı, kalibrasyon vadesi...) açık
// kayıtlarını bir okuyucuyla verir; okuyucuyu kablolama kaydeder (bildirim kaynak modülü ithal etmez). Motor gereken kademeyi hesaplar,
// deftere yazar ve yalnız en yüksek yeni kademeyi bildirir. Kaynağın artık vermediği kayıt kapanmıştır: kademe bildirimleri kapanır.

export interface KademeKaydi {
  // Kaynak içinde tekil; dönemi taşır (vade, beklenen teslim, onaya giriş): yeni dönem yeni kayıttır, defter onu yeniden bildirir.
  kayit: string;
  // E-postaya giren tek kayıt bilgisi (Risk K3): kayıt numarası. Tutar, firma adı, serbest metin girmez.
  no: string;
  // Uygulama içi metin (görev adı olabilir); e-postaya girmez.
  baslik: string;
  // Kaydın ekranı: kaynak yolu ya da altı.
  yol: `/${string}`;
  // Son gün sayacında son gün; bekleme sayacında beklemenin başladığı tesis günü.
  sonGun?: string | null;
  baslangic?: string | null;
  // 3418 a: beklemenin başladığı an (ISO). Saat birimli ayar bunu sayar; vermeyen kaynakta başlangıç gününün başı sayılır.
  baslangicAni?: string | null;
  // 3588: kaydı açan ya da sorumlu kişi. K2-K3 önce ona gider; kişi yoksa, yetkisizse ya da kaynağı okuyamıyorsa yapanlara düşer.
  sahip?: number | null;
  // K2-K3 alıcıları (işi yapacak kişiler). Boşsa kayıt K1-K3'e girmez, gecikince yine yukarı çıkar.
  yapanlar: readonly number[];
  // K4 alıcıları (kontrol eden, sorumlu rol); K5'te devralanlarla birlikte.
  yoneticiler: readonly number[];
  devralanlar?: readonly number[];
  // Kayda bağlı alıcı kalmazsa alacaklar; verilmezse kademe yöneticileri (bildirim.kademe-yonet).
  yedekler?: readonly number[];
}
export type KademeOkuyucusu = (db: Db) => Promise<readonly KademeKaydi[]>;

const okuyucular = new Map<KademeKaynagi, KademeOkuyucusu>();
export function kademeKaynagiKaydet(kaynak: KademeKaynagi, okuyucu: KademeOkuyucusu | null): void {
  if (okuyucu === null) okuyucular.delete(kaynak);
  else okuyucular.set(kaynak, okuyucu);
}

// İş günü hafta içi eksi resmi tatildir (İK). Bağ kablolamadadır; bağlı değilse yalnız hafta sonu sayılmaz.
export type TatilCozucusu = (db: Db, bas: string, bit: string) => Promise<readonly string[]>;
let tatilCozucusu: TatilCozucusu | null = null;
export const kademeTatilCozucusuKaydet = (c: TatilCozucusu | null): void => { tatilCozucusu = c; };

// Kaynağın eski motordaki türleri (2432): aynı kayıt kimliğiyle açık kalan hatırlatma, kayıt kapanınca kapanır (Risk K5: eşleme).
const ESKI_TURLER: Partial<Record<KademeKaynagi, readonly BildirimTuru[]>> = {
  'satin-alma.talep-onay': ['satin-alma.hatirlatma-onay-bekliyor'],
  'satin-alma.siparis-verilmedi': ['satin-alma.hatirlatma-siparis-bekliyor'],
  'satin-alma.teklif-cevapsiz': ['satin-alma.hatirlatma-teklif-cevapsiz'],
  'satin-alma.teslim': ['satin-alma.hatirlatma-teslim-yaklasiyor', 'satin-alma.hatirlatma-teslim-gecikti', 'satin-alma.hatirlatma-teslim-gecikti-yonetici'],
};
// Devret kademesindeki kayıtların sabah özeti (3396 a): yalnız hazırlık görevinde vardır.
const OZETLER: Partial<Record<KademeKaynagi, { tur: BildirimTuru; baslik: string; yol: `/${string}` }>> = {
  'projeler.hazirlik': { tur: 'projeler.hazirlik-ozet', baslik: 'Geciken hazırlık görevleri', yol: '/projeler' },
};
const OZET_SAATI = 8;

// --- Motor ---

const GUN_MS = 86_400_000;
const gunEkle = (t: string, g: number): string => new Date(Date.parse(`${t}T00:00:00Z`) + g * GUN_MS).toISOString().slice(0, 10);
const tekil = (l: readonly (readonly number[])[]): number[] => [...new Set(l.flat())];

async function kademeBildirimleriniKapat(db: Db, kaynak: KademeKaynagi, kayit: string): Promise<void> {
  for (const k of kaynakKademeleri(kaynak)) await bildirimKapat(db, { tur: kademeTuru(kaynak, k), kaynakKimlik: `${kayit}:k${String(k)}` });
  for (const tur of ESKI_TURLER[kaynak] ?? []) await bildirimKapat(db, { tur, kaynakKimlik: kayit });
}

const kuralOf = (kaynak: KademeKaynagi, a: GecerliAyar): KademeKurali => ({ sayac: KADEME_KAYNAKLARI[kaynak].sayac, k2Gun: a.k2Gun, k3Gun: a.k3Gun, k4Gun: a.k4Gun, k5Gun: a.k5Gun,
  k3Birim: a.k3Birim });

export interface IlerlemeSonucu { yazilan: number; bildirilen: number; kapanan: number; hatali: KademeKaynagi[] }

export async function kademeleriIlerlet(db: Db, simdi: Date = new Date()): Promise<IlerlemeSonucu> {
  const bugun = tesisGunu(simdi);
  const saat = Number(tesisSaati(simdi).slice(11, 13));
  const ayarlar = await gecerliAyarlar(db);
  const tatiller = new Set(tatilCozucusu === null ? [] : await tatilCozucusu(db, gunEkle(bugun, -400), gunEkle(bugun, 62)));
  const sonuc: IlerlemeSonucu = { yazilan: 0, bildirilen: 0, kapanan: 0, hatali: [] };
  let kademeYoneticileri: number[] | null = null;
  const yedekler = async (): Promise<number[]> => {
    kademeYoneticileri ??= [...await kisilerinIslemleri(db)].filter(([, i]) => i.includes('bildirim.kademe-yonet')).map(([k]) => k);
    return kademeYoneticileri;
  };
  for (const kaynak of KADEME_KAYNAK_ANAHTARLARI) {
    const ayar = ayarlar.get(kaynak);
    const okuyucu = okuyucular.get(kaynak);
    // Kablosuz kaynakta hiçbir şey yapılmaz: kapatma da (Risk K4).
    if (ayar === undefined || okuyucu === undefined) continue;
    const takipte = new Set((await sk.takipKayitlari(db, kaynak)).map((r) => r.kayit));
    if (!ayar.acik) {
      for (const kayit of takipte) await kademeBildirimleriniKapat(db, kaynak, kayit);
      sonuc.kapanan += takipte.size;
      await sk.kaynakTakibiniSil(db, kaynak);
      continue;
    }
    const okunan = await sk.kaynakKorumali(db, () => okuyucu(db));
    if (!okunan.tamam) { sonuc.hatali.push(kaynak); continue; }
    const kural = kuralOf(kaynak, ayar);
    const ilk = !(await sk.baslangicVarMi(db, kaynak));
    const defter = await sk.defterKademeleri(db, kaynak);
    const rolKisileri = ayar.yoneticiRolId === null ? [] : await rollerdekiKisiler(db, [ayar.yoneticiRolId]);
    const bildirenKademeler: readonly number[] = kaynakKademeleri(kaynak);
    const acikKalan = new Set<string>();
    for (const r of okunan.deger) {
      const { kademeler, gecikme } = gerekenKademeler(
        { sonGun: r.sonGun ?? null, baslangic: r.baslangic ?? null, baslangicAni: r.baslangicAni ?? null, yapanVar: r.yapanlar.length > 0 }, kural, bugun, tatiller,
        simdi.getTime());
      const yazilmis = defter.get(r.kayit) ?? new Set<number>();
      const { yeni, bildirilecek } = bildirilecekKademe(kademeler, yazilmis);
      const ustler = tekil([r.yoneticiler, rolKisileri]);
      for (const k of yeni.sort((a, b) => a - b)) {
        const bildir = !ilk && k === bildirilecek && bildirenKademeler.includes(k);
        const kademe = k as 2 | 3 | 4 | 5;
        const tur = kademeTuru(kaynak, kademe);
        // Aday kümeleri sırayla denenir; etkin alıcısı (türü alan) olan ilk küme kazanır, hiçbirinde yoksa defter "ulaşmadı" yazar (Risk G1).
        const gruplar: { alici: KademeAliciTuru; kisiler: number[] }[] = [];
        if (bildir) {
          const adaylar = { sahip: r.sahip ?? null, yapanlar: r.yapanlar, ustler, devralanlar: r.devralanlar ?? [], yedekler: r.yedekler ?? await yedekler() };
          for (const kume of kademeAliciKumeleri(k, adaylar)) {
            const secilen = new Set<number>();
            for (const a of kume) {
              const etkin = (await yalnizKisilerAlicilari(db, tur, a.kisiler)).filter((id) => !secilen.has(id));
              etkin.forEach((id) => secilen.add(id));
              if (etkin.length > 0) gruplar.push({ alici: a.tur, kisiler: etkin });
            }
            if (gruplar.length > 0) break;
          }
        }
        const alici = gruplar.reduce((t, g) => t + g.kisiler.length, 0);
        if (!(await sk.defterYaz(db, kaynak, r.kayit, k, bildir && alici > 0, alici))) continue;
        sonuc.yazilan += 1;
        if (!bildir || alici === 0) continue;
        const sahipAdi = r.sahip === null || r.sahip === undefined ? null : (await kisiAdlari(db, [r.sahip])).get(r.sahip) ?? null;
        for (const g of gruplar) {
          const m = kademeBildirimMetni({ kademe, alici: g.alici, no: r.no, kaynakAdi: KADEME_KAYNAKLARI[kaynak].ad, baslik: r.baslik, gecikmeGun: gecikme, sahipAdi });
          await bildirimGonder(db, {
            tur, baslik: m.baslik, metin: m.metin, yol: r.yol, kaynakKimlik: `${r.kayit}:k${String(k)}`, kisiler: g.kisiler, yalnizKisiler: true,
            eposta: gecikme === null ? { kayitNo: r.no } : { kayitNo: r.no, gecikmeGunu: gecikme }, epostaYok: k < ayar.epostaKademe,
          });
        }
        sonuc.bildirilen += 1;
      }
      // Takip yalnız yaklaşan ve geciken kayıttır; süresi uzayan kayıt takipten düşer, açık kademe bildirimleri kapanır.
      const simdiki = Math.max(0, ...kademeler);
      if (simdiki < 2) continue;
      acikKalan.add(r.kayit);
      await sk.takipYaz(db, {
        kaynak, kayit: r.kayit, no: r.no, baslik: r.baslik.slice(0, 200), yol: r.yol, son_gun: r.sonGun ?? null, baslangic: r.baslangic ?? null,
        kademe: simdiki, gecikme_gun: gecikme, yapanlar: [...r.yapanlar], ustler: tekil([ustler, r.devralanlar ?? []]),
      });
    }
    const kapanan = [...takipte].filter((k) => !acikKalan.has(k));
    for (const kayit of kapanan) await kademeBildirimleriniKapat(db, kaynak, kayit);
    await sk.takipSil(db, kaynak, kapanan);
    sonuc.kapanan += kapanan.length;
    if (ilk) await sk.baslangicYaz(db, kaynak);
    await gunlukOzet(db, kaynak, bugun, saat);
  }
  return sonuc;
}

async function gunlukOzet(db: Db, kaynak: KademeKaynagi, bugun: string, saat: number): Promise<void> {
  const ozet = OZETLER[kaynak];
  if (ozet === undefined || saat < OZET_SAATI) return;
  const sayi = (await sk.tumTakipler(db, [kaynak])).filter((t) => t.kademe === 5).length;
  if (sayi === 0 || !(await sk.ozetYaz(db, kaynak, bugun, sayi))) return;
  await bildirimGonder(db, { tur: ozet.tur, baslik: ozet.baslik, metin: `${String(sayi)} kayıt devret kademesinde.`, yol: ozet.yol, kaynakKimlik: `ozet:${bugun}` });
}

// --- Ayar ekranı, Açık takipler, Gecikenlerim ---

export async function kademeAyarlari(db: Db): Promise<KademeAyarlariCevabi> {
  const ayarlar = await gecerliAyarlar(db);
  const sayilar = new Map((await sk.kaynakSayilari(db)).map((s) => [s.kaynak, s]));
  const adlar = await kisiAdlari(db, [...ayarlar.values()].flatMap((a) => (a.degistirenId === null ? [] : [a.degistirenId])));
  return {
    kaynaklar: KADEME_KAYNAK_ANAHTARLARI.map((kaynak) => {
      const t: KademeKaynagiTanimi = KADEME_KAYNAKLARI[kaynak];
      const a = ayarlar.get(kaynak) as GecerliAyar;
      const s = sayilar.get(kaynak);
      const bagli = okuyucular.has(kaynak);
      return {
        kaynak, ad: t.ad, grup: t.grup, sayac: t.sayac, asama: t.asama, para: t.para === true, acik: a.acik, k2Gun: a.k2Gun, k3Gun: a.k3Gun, k4Gun: a.k4Gun,
        k5Gun: a.k5Gun, k3Birim: a.k3Birim, epostaKademe: a.epostaKademe, serit: a.serit, kapatilamaz: a.kapatilamaz, yoneticiRolId: a.yoneticiRolId, varsayilan: a.varsayilan,
        surum: a.surum, degistiren: a.degistirenId === null ? null : adlar.get(a.degistirenId) ?? null, degisti: a.degisti,
        takipte: bagli ? s?.takipte ?? 0 : null, gecikti: bagli ? s?.gecikti ?? 0 : null,
      };
    }),
    roller: (await rolSecenekleri(db)).map((r) => ({ id: r.id, ad: r.ad })),
  };
}

const AYAR_KISITLARI = {
  bildirim_kademe_ayari_rol: { ileti: 'Rol bulunamadı.', alan: 'yoneticiRolId' },
  bildirim_kademe_ayari_sira: { ileti: 'Devret, Yöneticide kademesinden sonra gelmelidir.', alan: 'k5Gun' },
} as const;
export async function kademeAyariYaz(db: Db, kullanici: Kullanici, kaynak: KademeKaynagi, g: KademeAyarDegistirGovdesi): Promise<KademeAyarlariCevabi> {
  const hata = kademeAyarHatasi(KADEME_KAYNAKLARI[kaynak].sayac, g);
  if (hata !== null) throw dogrulama(hata.mesaj, hata.alan);
  const { surum, ...yazim } = g;
  if ((await kisitKorumali(AYAR_KISITLARI, () => sk.ayarYaz(db, kaynak, yazim, surum, kullanici.id))) === null) throw eskiSurum();
  return kademeAyarlari(db);
}

const satir = (t: sk.TakipSatiri): KademeTakipSatiri => ({
  kaynak: t.kaynak as KademeKaynagi, kayit: t.kayit, no: t.no, baslik: t.baslik, yol: t.yol, sonGun: t.son_gun, baslangic: t.baslangic, kademe: t.kademe,
  gecikmeGun: t.gecikme_gun,
});

// Risk K2: satır yalnız kaynağı okuyabilene döner (alıcı listesi kayıt anındadır; rolü sonradan değişen görmesin).
const okuyabilir = (kullanici: Kullanici, kaynak: string): boolean =>
  Object.hasOwn(KADEME_KAYNAKLARI, kaynak) && (KADEME_KAYNAKLARI[kaynak as KademeKaynagi].okumaIslemleri as readonly Islem[]).some((i) => kullanici.islemler.includes(i));

// Kişinin Gecikti ve sonrasındaki kayıtları: yaptığı iş ya da Yöneticide kademesinden beri üstü olduğu iş.
export async function gecikenlerim(db: Db, kullanici: Kullanici): Promise<GecikenlerimCevabi> {
  const ayarlar = await gecerliAyarlar(db);
  const kayitlar = (await sk.kisininTakipleri(db, kullanici.id, 3))
    .filter((t) => okuyabilir(kullanici, t.kaynak) && ayarlar.get(t.kaynak as KademeKaynagi)?.acik === true);
  return { kayitlar: kayitlar.map(satir) };
}

// Kırmızı şerit: Gecikenlerim'in şeritli kaynaklardaki kısmı (kapatılamaz; kayıt bitince kalkar).
export async function seridim(db: Db, kullanici: Kullanici): Promise<GecikenlerimCevabi> {
  const ayarlar = await gecerliAyarlar(db);
  const { kayitlar } = await gecikenlerim(db, kullanici);
  return { kayitlar: kayitlar.filter((t) => ayarlar.get(t.kaynak)?.serit === true) };
}

export async function acikTakipler(db: Db, kullanici: Kullanici): Promise<AcikTakiplerCevabi> {
  const ayarlar = await gecerliAyarlar(db);
  const kaynaklar = KADEME_KAYNAK_ANAHTARLARI.filter((k) => ayarlar.get(k)?.acik === true && okuyabilir(kullanici, k));
  const satirlar = await sk.tumTakipler(db, kaynaklar);
  // İşin kimde olduğu: yapanlar; K4 ve sonrasında üstler de (alıcılarla aynı kural).
  const kimler = (t: sk.TakipSatiri): number[] => [...new Set([...t.yapanlar, ...(t.kademe >= 4 ? t.ustler : [])])];
  const adlar = await kisiAdlari(db, satirlar.flatMap(kimler));
  return {
    kayitlar: satirlar.map((t) => ({ ...satir(t), kimde: kimler(t).flatMap((id) => adlar.get(id) ?? []) })),
    kesik: satirlar.length >= ACIK_TAKIP_EN_COK,
  };
}

// Kaydın kademe geçmişi (defter): kaynak modül kendi ekranında gösterir (Proje > Hazırlık yan paneli).
export async function kayitKademeGecmisi(db: Db, kaynak: KademeKaynagi, kayit: string): Promise<{ kademe: number; an: string; bildirildi: boolean; aliciSayisi: number }[]> {
  return (await sk.kayitDefteri(db, kaynak, kayit)).map((k) => ({ kademe: k.kademe, an: k.an, bildirildi: k.bildirildi, aliciSayisi: k.alici_sayisi }));
}

// Kayıtların defterdeki en yüksek kademesi (kaynak modülün listesinde rozet).
export async function enYuksekKademeler(db: Db, kaynak: KademeKaynagi, kayitlar: readonly string[]): Promise<Map<string, number>> {
  if (kayitlar.length === 0) return new Map();
  return new Map((await sk.enYuksekKademeler(db, kaynak, kayitlar)).map((r) => [r.kayit, r.kademe]));
}

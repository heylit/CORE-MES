import { randomBytes } from 'node:crypto';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { isBekliyor, type IsBekliyor } from '#cekirdek/zamanlayici.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { tesisGunBasi, tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { BILDIRIM_TUR_ANAHTARLARI, BILDIRIM_TURLERI, turSinifi, type BildirimOnemi, type BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import {
  EPOSTA_KONULARI, turKonusu, type EpostaDefterSatiri, type EpostaDenemeCevabi, type EpostaDurumuCevabi, type EpostaKonusu, type EpostaSablonDegistirGovdesi,
  type EpostaSablonlariCevabi, type EpostaSablonu, type EpostaSimgesi, type EpostaSinamaCevabi, type EpostaSonucu, type EpostaTabloAlani,
  type EpostaTetikleyiciDegistirGovdesi, type EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { varsayilanDeger, type AyarAnahtari, type AyarDegeri } from '#paylasilan/ayarlar.ts';
import { kisiAdlari, kisiSecenekleri, kisilerinIslemleri, rolSecenekleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import {
  VARSAYILAN_SABLONLAR, bildirimAcikMi, bilinmeyenYerTutucular, epostaKur, kayitBaglantisi, kisiEpostaAlir, olmayanKimlikler,
  sessizMi, sonrakiDenemeDk, turKapatilamaz, varsayilanTetikleyici, type EpostaDegerleri, type EpostaTetikleyicisi,
} from './kurallar.ts';
import { disKipMi, epostaKipi } from './kurallar.ts';
import { ortamPostaAyari, postaGonder, iletiKur, izinliAdresMi, type HatAc, type PostaAyari } from './posta.ts';
import { simgePng } from './posta-simgeleri.ts';
import * as s from './sorgular.ts';

// Kişinin iş e-postası İK'dadır; İK bu modülü ithal ettiği için adres kablolamada verilir (döngü olmasın). Bağlı değilse e-posta gitmez.
export type EpostaAdresCozucusu = (db: Db, kisiIdleri: readonly number[]) => Promise<Map<number, string>>;
let adresCozucusu: EpostaAdresCozucusu | null = null;
export const epostaAdresCozucusuKaydet = (c: EpostaAdresCozucusu | null): void => { adresCozucusu = c; };

// Sistem ayarı ayarlar modülündedir; bildirim alt katta olduğu için okuyucu kablolamada verilir. Bağlı değilse e-posta kapalı sayılır,
// diğer ayarlar tanımın varsayılanıyla okunur.
export type AyarOkuyucusu = <A extends AyarAnahtari>(db: Db, anahtar: A) => Promise<AyarDegeri<A>>;
let ayarOkuyucusu: AyarOkuyucusu | null = null;
export const epostaAyarOkuyucusuKaydet = (o: AyarOkuyucusu | null): void => { ayarOkuyucusu = o; };
function sistemAyariOku<A extends AyarAnahtari>(db: Db, anahtar: A): Promise<AyarDegeri<A>> {
  if (ayarOkuyucusu !== null) return ayarOkuyucusu(db, anahtar);
  return Promise.resolve(anahtar === 'bildirim.eposta' ? false as AyarDegeri<A> : varsayilanDeger(anahtar));
}

// Üreten modülün isteğe bağlı e-posta alanları; verilmezse e-postada o satır yazılmaz.
export interface EpostaEki { kayitNo?: string; gecikmeGunu?: number; istasyon?: string }

const SAAT_MS = 3_600_000;
const GUN_MS = 24 * SAAT_MS;
const saatSayisi = (an: number): number => Number(tesisSaati(an).slice(11, 13));
// Tesis saatiyle bir sonraki "saat:00" anı (şimdi ya da sonra).
function sonrakiSaat(an: number, saat: number): number {
  const bugun = tesisGunBasi(tesisGunu(an)) + saat * SAAT_MS;
  return bugun > an ? bugun : tesisGunBasi(tesisGunu(an + GUN_MS)) + saat * SAAT_MS;
}

// BIL-49: bildirim başlığının ":" sonrası belge numarasıysa kayıt no olur; metin ve başka serbest alan e-postaya girmez (ADR 0015 md 6).
export function basliktanKayitNo(baslik: string): string | null {
  const parca = baslik.slice(baslik.lastIndexOf(':') + 1).trim();
  return baslik.includes(':') && /^[A-Z0-9][A-Z0-9./-]{1,39}$/i.test(parca) && /\d/.test(parca) ? parca : null;
}

// Seçili kipin adresi (kurum içi sunucu ve yerel aktarıcı kurum içi adresi, dış servis dış adresi kullanır); yoksa null.
// Hiç adres yoksa ayar okunmaz: posta kurulmamış sistemde her bildirim fazladan sorgu atmaz.
async function postaAyari(db: Db): Promise<PostaAyari | null> {
  if (ortamPostaAyari(false) === null && ortamPostaAyari(true) === null) return null;
  return ortamPostaAyari(disKipMi(await sistemAyariOku(db, 'bildirim.eposta-kipi')));
}

export async function epostaKanaliAcik(db: Db): Promise<boolean> {
  return await postaAyari(db) !== null && await sistemAyariOku(db, 'bildirim.eposta');
}

async function tetikleyici(db: Db, tur: BildirimTuru): Promise<EpostaTetikleyicisi> {
  const t = await s.epostaTetikleyicisi(db, tur);
  return t === null ? varsayilanTetikleyici(tur) : t;
}

// bildirimGonder'in transaction'ında: yeni açılan bildirim satırlarının e-postası kuyruğa yazılır. Ortam değişkeni yoksa kuyruk
// tutulmaz (posta sunucusu olmayan kurulumda birikmesin); ayar kapalıysa kuyruk birikir, gönderilmez (ADR 0015 md 5).
export async function epostaKuyrugaAl(
  db: Db, olay: { tur: BildirimTuru; baslik: string; yol: string | null; eposta?: EpostaEki | undefined; kapatilamaz?: boolean | undefined; epostaYok?: boolean | undefined },
  yazilan: readonly { kisiId: number; id: number; yeni: boolean }[], islemler: ReadonlyMap<number, readonly string[]>,
): Promise<void> {
  if (olay.epostaYok === true || await postaAyari(db) === null) return;
  const yeniler = yazilan.filter((y) => y.yeni);
  if (yeniler.length === 0) return;
  const t = await tetikleyici(db, olay.tur);
  if (!t.eposta) return;
  const tercih = new Map((await s.epostaTercihleri(db, olay.tur, yeniler.map((y) => y.kisiId))).map((r) => [r.kisiId, r.eposta]));
  const zorunlu = olay.kapatilamaz ?? turKapatilamaz(olay.tur);
  const alanlar = yeniler.filter((y) => kisiEpostaAlir(true, islemler.get(y.kisiId) ?? [], tercih.get(y.kisiId), zorunlu));
  const ozet = t.zaman === 'ozet';
  const ozetZamani = ozet ? new Date(sonrakiSaat(Date.now(), await sistemAyariOku(db, 'bildirim.eposta-ozet-saati') ?? 7)).toISOString() : null;
  const ortak = {
    tur: olay.tur, onem: BILDIRIM_TURLERI[olay.tur].onem, baslik: BILDIRIM_TURLERI[olay.tur].baslik,
    kayitNo: olay.eposta?.kayitNo ?? basliktanKayitNo(olay.baslik), yol: olay.yol,
    gecikmeGunu: olay.eposta?.gecikmeGunu ?? null, istasyon: olay.eposta?.istasyon ?? null,
  };
  const satirlar: s.YeniEposta[] = alanlar.map((y) => ({ ...ortak, kisiId: y.kisiId, bildirimId: y.id, kademe: 0, ozet, zamani: ozetZamani }));
  // Kademe: kaynak bildirimlerden biri yeter; zamanı gelince hâlâ açıksa kademe alıcılarına gider.
  const kaynak = yeniler[0];
  if (t.yukseltGun !== null && kaynak !== undefined) {
    satirlar.push({
      ...ortak, kisiId: null, bildirimId: kaynak.id, kademe: 1, ozet: false, zamani: new Date(Date.now() + t.yukseltGun * GUN_MS).toISOString(),
    });
  }
  await s.epostaKuyrugaYaz(db, satirlar);
}

// --- Gönderim turu (iş, transaction dışı) --------------------------------------------------------------------------------

interface Sablon { simge: EpostaSimgesi; konuKalibi: string; govde: string; tabloAlanlari: EpostaTabloAlani[] }
async function sablonOku(db: Db, konu: EpostaKonusu): Promise<Sablon> {
  const r = await s.epostaSablonu(db, konu);
  return r === null ? VARSAYILAN_SABLONLAR[konu] : r as Sablon;
}

interface GonderimAyarlari { gonderenAdi: string; uygulamaAdresi: string; gunlukEnCok: number | null; sessizBas: number | null; sessizBit: number | null; ozetSaati: number | null }
async function gonderimAyarlari(db: Db): Promise<GonderimAyarlari> {
  return {
    gonderenAdi: await sistemAyariOku(db, 'bildirim.eposta-gonderen-adi'),
    uygulamaAdresi: await sistemAyariOku(db, 'bildirim.eposta-uygulama-adresi'),
    gunlukEnCok: await sistemAyariOku(db, 'bildirim.eposta-gunluk-en-cok'),
    sessizBas: await sistemAyariOku(db, 'bildirim.eposta-sessiz-baslangic'),
    sessizBit: await sistemAyariOku(db, 'bildirim.eposta-sessiz-bitis'),
    ozetSaati: await sistemAyariOku(db, 'bildirim.eposta-ozet-saati'),
  };
}

const tarihMetni = (iso: string): string => { const t = tesisSaati(Date.parse(iso)); return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)} ${t.slice(11)}`; };

function degerler(q: s.KuyrukSatiri, aliciAdi: string | null, uygulamaAdresi: string): EpostaDegerleri {
  return {
    alici_adi: aliciAdi, olay: q.baslik, kayit_no: q.kayitNo, tarih: tarihMetni(q.olayZamani),
    gecikme_gunu: q.gecikmeGunu === null ? null : String(q.gecikmeGunu), istasyon: q.istasyon, kayit_baglantisi: kayitBaglantisi(uygulamaAdresi, q.yol),
  };
}

export interface EpostaTuruSonucu { gonderilen: number; hata: number; atlanan: number; ertelenen: number }
type Sonuc = { durum: EpostaSonucu; neden: string | null; kalici: boolean };

async function tekGonder(ayar: PostaAyari, alici: string, aliciAdi: string | null, gonderenAdi: string, sablon: Sablon, g: Parameters<typeof epostaKur>[0], ac: HatAc | undefined): Promise<Sonuc> {
  const govde = epostaKur(g);
  const ileti = iletiKur(ayar.gonderen, {
    alici, aliciAdi, gonderenAdi, konu: govde.konu, metin: govde.metin, html: govde.html, simgePng: simgePng(sablon.simge),
  }, new Date(), randomBytes(9).toString('hex'));
  const r = await postaGonder(ayar, ileti, alici, ac);
  return r.tamam ? { durum: 'gonderildi', neden: null, kalici: true } : { durum: 'gonderilemedi', neden: r.neden, kalici: r.kalici };
}

const SIRA_SINIRI = 50;

// Dakikada bir: zamanı gelen kademe beklemeleri kişi satırlarına açılır, sonra kişi satırları gönderilir. Sessiz saatte acil olmayan
// satır bitişe, günlük sınırı aşan özet saatine ertelenir. Geçici hata 3 denemeye dek yeniden denenir (BIL-48).
export async function epostaTuru(vt: Veritabani, gunluk: Gunluk, ac?: HatAc, simdi: () => number = Date.now): Promise<EpostaTuruSonucu | IsBekliyor> {
  const ayar = await vt.tx((db) => postaAyari(db));
  if (ayar === null) return isBekliyor('E-posta kapalı (seçili kipin posta sunucusu ortam ayarında yok)');
  if (!(await vt.tx((db) => sistemAyariOku(db, 'bildirim.eposta')))) return isBekliyor('E-posta gönderimi Sistem Ayarları\'nda kapalı');
  const sonuc: EpostaTuruSonucu = { gonderilen: 0, hata: 0, atlanan: 0, ertelenen: 0 };
  await vt.tx((db) => kademeleriAc(db));
  for (const ozet of [false, true]) {
    const hazirlik = await vt.tx(async (db) => {
      const sira = await s.epostaSiradakiler(db, ozet, SIRA_SINIRI, false);
      const kisiler = [...new Set(sira.map((q) => q.kisiId as number))];
      const adresler = adresCozucusu === null ? new Map<number, string>() : await adresCozucusu(db, kisiler);
      const adlar = await kisiAdlari(db, kisiler);
      const sablonlar = new Map<EpostaKonusu, Sablon>();
      for (const k of new Set(sira.map((q) => turKonusu(q.tur)))) sablonlar.set(k, await sablonOku(db, k));
      const tetikler = new Map<string, EpostaTetikleyicisi>();
      for (const tur of new Set(sira.map((q) => q.tur))) {
        if ((BILDIRIM_TUR_ANAHTARLARI as readonly string[]).includes(tur)) tetikler.set(tur, await tetikleyici(db, tur as BildirimTuru));
      }
      const gunBasi = new Date(tesisGunBasi(tesisGunu(simdi()))).toISOString();
      return { sira, adresler, adlar, sablonlar, tetikler, ayarlar: await gonderimAyarlari(db), bugun: await s.epostaBugunGidenler(db, kisiler, gunBasi) };
    });
    const { ayarlar } = hazirlik;
    const saat = saatSayisi(simdi());
    const defter: s.YeniDefterSatiri[] = [];
    const silinecek: number[] = [];
    const sonra: (() => Promise<void>)[] = [];
    const isle = (q: s.KuyrukSatiri, r: Sonuc) => {
      defter.push({ kisiId: q.kisiId, tur: q.tur, baslik: q.baslik, kayitNo: q.kayitNo, sonuc: r.durum, neden: r.neden });
      if (r.durum === 'gonderildi') sonuc.gonderilen += 1; else if (r.durum === 'atlandi') sonuc.atlanan += 1; else sonuc.hata += 1;
    };
    // Özet: kişi başına tek e-posta, satırlar tablo olarak.
    const gruplar = new Map<number, s.KuyrukSatiri[]>();
    for (const q of hazirlik.sira) gruplar.set(q.kisiId as number, [...(gruplar.get(q.kisiId as number) ?? []), q]);
    for (const [kisiId, satirlar] of gruplar) {
      const adres = hazirlik.adresler.get(kisiId);
      const ad = hazirlik.adlar.get(kisiId) ?? null;
      // Kaynak bildirimi kapanmış tekrar satırı gönderilmez, düşer.
      const gidecek = satirlar.filter((q) => q.tekrarNo === 0 || q.kaynak === null || bildirimAcikMi(q.kaynak));
      silinecek.push(...satirlar.filter((q) => !gidecek.includes(q)).map((q) => q.id));
      if (adres === undefined || !izinliAdresMi(adres, ayar.alanAdlari)) {
        for (const q of gidecek) { isle(q, { durum: 'atlandi', neden: adres === undefined ? 'İK\'da iş e-postası yok' : 'Adres izinli alan adında değil', kalici: true }); silinecek.push(q.id); }
        continue;
      }
      const acil = (q: s.KuyrukSatiri) => q.onem === 'acil';
      const beklet = gidecek.filter((q) => !acil(q) && sessizMi(saat, ayarlar.sessizBas, ayarlar.sessizBit));
      for (const q of beklet) {
        sonuc.ertelenen += 1;
        sonra.push(() => vt.tx((db) => s.epostaErtele(db, q.id, new Date(sonrakiSaat(simdi(), ayarlar.sessizBit ?? 0)).toISOString(), q.deneme, q.ozet)));
      }
      let kalan = gidecek.filter((q) => !beklet.includes(q));
      const bugun = hazirlik.bugun.get(kisiId) ?? 0;
      if (!ozet && ayarlar.gunlukEnCok !== null && bugun + kalan.length > ayarlar.gunlukEnCok) {
        const sigan = Math.max(0, ayarlar.gunlukEnCok - bugun);
        for (const q of kalan.slice(sigan)) {
          sonuc.ertelenen += 1;
          sonra.push(() => vt.tx((db) => s.epostaErtele(db, q.id, new Date(sonrakiSaat(simdi(), ayarlar.ozetSaati ?? 7)).toISOString(), 0, true)));
        }
        kalan = kalan.slice(0, sigan);
      }
      if (kalan.length === 0) continue;
      const parcalar = ozet ? [kalan] : kalan.map((q) => [q]);
      for (const parca of parcalar) {
        const ilk = parca[0] as s.KuyrukSatiri;
        const konu = ozet ? 'genel' : turKonusu(ilk.tur);
        const sablon = hazirlik.sablonlar.get(konu) ?? VARSAYILAN_SABLONLAR[konu];
        const g = ozet ? ozetGirdisi(parca, ad, ayarlar.uygulamaAdresi) : {
          sablon, degerler: degerler(ilk, ad, ayarlar.uygulamaAdresi), baslik: ilk.baslik, onem: ilk.onem, simgeVar: true,
        };
        const r = await tekGonder(ayar, adres, ad, ayarlar.gonderenAdi, ozet ? VARSAYILAN_SABLONLAR.genel : sablon, g, ac);
        for (const q of parca) {
          if (r.durum !== 'gonderildi' && !r.kalici) {
            const dk = sonrakiDenemeDk(q.deneme + 1);
            if (dk !== null) {
              sonra.push(() => vt.tx((db) => s.epostaErtele(db, q.id, new Date(simdi() + dk * 60_000).toISOString(), q.deneme + 1, q.ozet)));
              continue;
            }
          }
          isle(q, r);
          const t = hazirlik.tetikler.get(q.tur);
          const tekrarVar = r.durum === 'gonderildi' && !ozet && q.kademe === 0 && t?.tekrarGun != null && t.tekrarEnCok != null && q.tekrarNo < t.tekrarEnCok && q.bildirimId !== null;
          if (tekrarVar) sonra.push(() => vt.tx((db) => s.epostaTekrarla(db, q.id, new Date(simdi() + (t.tekrarGun ?? 1) * GUN_MS).toISOString())));
          else silinecek.push(q.id);
        }
      }
    }
    await vt.tx(async (db) => { await s.epostaDefterineYaz(db, defter); await s.epostaKuyruktanSil(db, silinecek); });
    for (const is of sonra) await is();
  }
  if (sonuc.hata > 0) gunluk.uyar(`E-posta: ${String(sonuc.hata)} ileti gönderilemedi`);
  return sonuc;
}

// Özet e-postası: konu ve gövde sabittir; her satır olay ve kayıt no olarak tabloya yazılır.
function ozetGirdisi(satirlar: readonly s.KuyrukSatiri[], ad: string | null, uygulamaAdresi: string): Parameters<typeof epostaKur>[0] {
  const liste = satirlar.map((q) => `- ${q.baslik}${q.kayitNo === null ? '' : ` · ${q.kayitNo}`}`).join('\n');
  return {
    sablon: { konuKalibi: `[CORE MES] Günlük özet · ${String(satirlar.length)} bildirim`, govde: `Merhaba {alici_adi},\n\nBekleyen bildirimlerin:\n\n${liste}\n\nAyrıntıyı uygulamada görebilirsin.`, tabloAlanlari: [] },
    degerler: { alici_adi: ad, olay: 'Günlük özet', kayit_no: null, tarih: tarihMetni(new Date().toISOString()), gecikme_gunu: null, istasyon: null, kayit_baglantisi: kayitBaglantisi(uygulamaAdresi, '/bildirimler') },
    baslik: 'Günlük özet', onem: 'bilgi', simgeVar: true,
  };
}

// Kademe beklemesi: kaynak bildirim hâlâ açıksa türün kademe rollerindeki ve kişilerindeki kişilere hemen gidecek satır açılır.
async function kademeleriAc(db: Db): Promise<void> {
  const bekleyenler = await s.epostaSiradakiler(db, false, SIRA_SINIRI, true);
  const islemler = await kisilerinIslemleri(db);
  for (const q of bekleyenler) {
    const t = (BILDIRIM_TUR_ANAHTARLARI as readonly string[]).includes(q.tur) ? await tetikleyici(db, q.tur as BildirimTuru) : null;
    if (t !== null && q.kaynak !== null && bildirimAcikMi(q.kaynak)) {
      const adaylar = [...new Set([...await rollerdekiKisiler(db, t.yukseltRolIdleri), ...t.yukseltKisiIdleri])];
      const tercih = new Map((await s.epostaTercihleri(db, q.tur, adaylar)).map((r) => [r.kisiId, r.eposta]));
      // Etkin girişli olmayan (pasif, çıkmış) kişi kademede de almaz.
      const kisiler = adaylar.filter((k) => islemler.has(k) && kisiEpostaAlir(true, islemler.get(k) ?? [], tercih.get(k), turKapatilamaz(q.tur as BildirimTuru)));
      await s.epostaKuyrugaYaz(db, kisiler.map((kisiId) => ({
        kisiId, bildirimId: null, tur: q.tur, onem: q.onem, baslik: q.baslik, kayitNo: q.kayitNo, yol: q.yol, gecikmeGunu: q.gecikmeGunu,
        istasyon: q.istasyon, kademe: 1 as const, ozet: false, zamani: null,
      })));
    }
  }
  await s.epostaKuyruktanSil(db, bekleyenler.map((q) => q.id));
}

// --- Yönetim uçları --------------------------------------------------------------------------------------------------------

export async function epostaDurumu(db: Db): Promise<EpostaDurumuCevabi> {
  const ayar = await postaAyari(db);
  let epostasizKisi: number | null = null;
  if (adresCozucusu !== null) {
    const girisli = [...(await kisilerinIslemleri(db)).keys()];
    const adresler = await adresCozucusu(db, girisli);
    epostasizKisi = girisli.filter((k) => { const a = adresler.get(k); return a === undefined || (ayar !== null && !izinliAdresMi(a, ayar.alanAdlari)); }).length;
  }
  return {
    ortam: ayar === null ? 'tanimsiz' : 'hazir',
    ayarAcik: await sistemAyariOku(db, 'bildirim.eposta'),
    kip: epostaKipi(await sistemAyariOku(db, 'bildirim.eposta-kipi')),
    adres: ayar === null ? null : `${ayar.sunucu.includes(':') ? `[${ayar.sunucu}]` : ayar.sunucu}:${String(ayar.kapi)}`,
    guvenlik: ayar?.guvenlik ?? null,
    alanAdlari: ayar?.alanAdlari ?? [],
    gonderen: ayar?.gonderen ?? null,
    epostasizKisi,
    ...await s.epostaSayaclari(db),
  };
}

export async function epostaSablonlari(db: Db): Promise<EpostaSablonlariCevabi> {
  const kayitli = new Map((await s.epostaSablonlari(db)).map((r) => [r.konu, r]));
  return {
    satirlar: EPOSTA_KONULARI.map((konu): EpostaSablonu => {
      const r = kayitli.get(konu);
      const v = VARSAYILAN_SABLONLAR[konu];
      return r === undefined
        ? { konu, ...v, surum: null, degistirildi: null }
        : { konu, simge: r.simge as EpostaSimgesi, konuKalibi: r.konuKalibi, govde: r.govde, tabloAlanlari: r.tabloAlanlari as EpostaTabloAlani[], surum: r.surum, degistirildi: r.degistirildi };
    }),
  };
}

export async function epostaSablonuYaz(db: Db, kullanici: Kullanici, konu: EpostaKonusu, g: EpostaSablonDegistirGovdesi): Promise<EpostaSablonlariCevabi> {
  for (const [alan, metin] of [['konuKalibi', g.konuKalibi], ['govde', g.govde]] as const) {
    const bilinmeyen = bilinmeyenYerTutucular(metin);
    if (bilinmeyen.length > 0) throw dogrulama(`Bilinmeyen yer tutucu: ${bilinmeyen.map((b) => `{${b}}`).join(', ')}`, alan);
  }
  const yazildi = await s.epostaSablonuYaz(db, konu, { simge: g.simge, konuKalibi: g.konuKalibi, govde: g.govde, tabloAlanlari: g.tabloAlanlari }, g.surum, g.varsayilan === true, kullanici.id);
  if (!yazildi) throw eskiSurum();
  return epostaSablonlari(db);
}

export async function epostaTetikleyicileri(db: Db): Promise<EpostaTetikleyicileriCevabi> {
  const kayitli = new Map((await s.epostaTetikleyicileri(db)).map((r) => [r.tur, r]));
  const girisli = await kisilerinIslemleri(db);
  return {
    satirlar: BILDIRIM_TUR_ANAHTARLARI.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const r = kayitli.get(tur);
      const a = r ?? varsayilanTetikleyici(tur);
      return {
        tur, baslik: t.baslik, onem: t.onem, sinif: turSinifi(tur), konu: turKonusu(tur), eposta: a.eposta, zaman: a.zaman,
        tekrarGun: a.tekrarGun, tekrarEnCok: a.tekrarEnCok, yukseltGun: a.yukseltGun, yukseltRolIdleri: a.yukseltRolIdleri,
        yukseltKisiIdleri: a.yukseltKisiIdleri, surum: r?.surum ?? null,
      };
    }),
    roller: (await rolSecenekleri(db)).map(({ id, ad }) => ({ id, ad })),
    kisiler: (await kisiSecenekleri(db)).filter((k) => girisli.has(k.id)).map(({ id, ad }) => ({ id, ad })),
  };
}

export async function epostaTetikleyicisiYaz(db: Db, kullanici: Kullanici, tur: BildirimTuru, g: EpostaTetikleyiciDegistirGovdesi): Promise<EpostaTetikleyicileriCevabi> {
  const rolYok = olmayanKimlikler(g.yukseltRolIdleri, (await rolSecenekleri(db)).map((r) => r.id));
  if (rolYok.length > 0) throw dogrulama(`Rol bulunamadı: ${rolYok.join(', ')}`, 'yukseltRolIdleri');
  const girisli = await kisilerinIslemleri(db);
  const kisiYok = g.yukseltKisiIdleri.filter((k) => !girisli.has(k));
  if (kisiYok.length > 0) throw dogrulama(`Kişi bulunamadı ya da girişi yok: ${kisiYok.join(', ')}`, 'yukseltKisiIdleri');
  const yazildi = await s.epostaTetikleyiciYaz(db, tur, {
    eposta: g.eposta, zaman: g.zaman, tekrarGun: g.tekrarGun, tekrarEnCok: g.tekrarEnCok, yukseltGun: g.yukseltGun,
    yukseltRolIdleri: g.yukseltRolIdleri, yukseltKisiIdleri: g.yukseltKisiIdleri,
  }, g.surum, kullanici.id);
  if (!yazildi) throw eskiSurum();
  return epostaTetikleyicileri(db);
}

export function epostaDefteri(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; sonuc?: EpostaSonucu | undefined }): Promise<SayfaliListe<EpostaDefterSatiri>> {
  const sonuc = sorgu.sonuc ?? null;
  return sayfaliListe(sorgu, {
    say: () => s.epostaDefterSayisi(db, sonuc),
    satirlar: async (dilim) => {
      const r = await s.epostaDefteri(db, sonuc, dilim);
      const adlar = await kisiAdlari(db, r.flatMap((x) => (x.kisiId === null ? [] : [x.kisiId])));
      return r.map((x) => ({ ...x, sonuc: x.sonuc as EpostaSonucu, kisiAdi: x.kisiId === null ? null : adlar.get(x.kisiId) ?? null }));
    },
  });
}

// Deneme e-postası yalnız isteyen kişinin kendi iş adresine gider; sonuç deftere yazılır. Ayar kapalı olsa da gider (kurulum sınaması).
export async function epostaDenemesi(db: Db, kullanici: Kullanici, konu: EpostaKonusu | undefined, ac?: HatAc): Promise<EpostaDenemeCevabi> {
  const ayar = await postaAyari(db);
  const kayit = (r: { sonuc: EpostaSonucu; neden: string | null }) =>
    s.epostaDefterineYaz(db, [{ kisiId: kullanici.id, tur: 'bildirim.deneme', baslik: 'Deneme e-postası', kayitNo: null, sonuc: r.sonuc, neden: r.neden }]).then(() => r);
  if (ayar === null) return { sonuc: 'atlandi', neden: 'Posta sunucusu ortam ayarında tanımlı değil' };
  const adres = adresCozucusu === null ? undefined : (await adresCozucusu(db, [kullanici.id])).get(kullanici.id);
  if (adres === undefined) return kayit({ sonuc: 'atlandi', neden: 'İK\'da iş e-postanız yok' });
  if (!izinliAdresMi(adres, ayar.alanAdlari)) return kayit({ sonuc: 'atlandi', neden: 'İş e-postanız izinli alan adında değil' });
  const k = konu ?? 'genel';
  const sablon = await sablonOku(db, k);
  const ayarlar = await gonderimAyarlari(db);
  const onem: BildirimOnemi = 'bilgi';
  const r = await tekGonder(ayar, adres, kullanici.ad, ayarlar.gonderenAdi, sablon, {
    sablon, baslik: 'Deneme e-postası', onem, simgeVar: true,
    degerler: {
      alici_adi: kullanici.ad, olay: 'Deneme e-postası', kayit_no: 'ORN-0001', tarih: tarihMetni(new Date().toISOString()), gecikme_gunu: '0',
      istasyon: null, kayit_baglantisi: kayitBaglantisi(ayarlar.uygulamaAdresi, '/ayarlar'),
    },
  }, ac);
  return kayit({ sonuc: r.durum, neden: r.neden });
}

// Bağlantı sınaması: yalnız karşılama ve EHLO (ileti gönderilmez). Neden metni adresi taşımaz.
export async function epostaSinamasi(db: Db, ac?: HatAc): Promise<EpostaSinamaCevabi> {
  const ayar = await postaAyari(db);
  if (ayar === null) return { tamam: false, neden: 'Posta sunucusu ortam ayarında tanımlı değil' };
  const r = await postaGonder(ayar, '', '', ac, true);
  return r.tamam ? { tamam: true, neden: null } : { tamam: false, neden: r.neden };
}


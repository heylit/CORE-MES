import { senaryo } from '../senaryo.ts';
import type { SenaryoBaglami } from '../senaryo.ts';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { Hesap } from '../../hesaplar.ts';

// S1 üretim akışı (akış A): sipariş -> malzeme ve rota -> emir ve iş emirleri -> plan -> Arkon sayımı -> ilk parça -> stok girişi -> sevk.
// Gövdeler sunucu/akis-sagligi.test.ts'deki kanıtlı akıştan; burada göçün verdiği örnek hesaplarla, HTTP üzerinden koşar.
// Satış hesabı yok: siparişi planlama açar, fiyatı ve onayı müdür verir (siparisler.yaz ve siparisler.onayla rol matrisinde).
const PLANLAMA: Hesap = 'ornek.planlama';
const MUDUR: Hesap = 'ornek.mudur';
const KALITE: Hesap = 'ornek.kalite';
const OPERATOR: Hesap = 'ornek.operator1';
const DEPO: Hesap = 'ornek.depo';

type Kayit = Record<string, unknown>;

const KOPYA = 3;

const nesne = (d: unknown): Kayit | null => (typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Kayit) : null);

export function alan(d: unknown, ...yol: (string | number)[]): unknown {
  let x = d;
  for (const a of yol) {
    if (typeof a === 'number') x = Array.isArray(x) ? x[a] : undefined;
    else x = nesne(x)?.[a];
  }
  return x;
}

// Cevap beklenen biçimde değilse senaryo o kopyada durur; çatı bunu "senaryo" adımı düştü diye kaydeder.
export function sayi(d: unknown, ...yol: (string | number)[]): number {
  const x = alan(d, ...yol);
  if (typeof x !== 'number') throw new Error(`Cevapta ${yol.join('.')} sayı değil: ${JSON.stringify(x) ?? 'yok'}`);
  return x;
}

export function liste(d: unknown, ...yol: (string | number)[]): unknown[] {
  const x = alan(d, ...yol);
  if (!Array.isArray(x)) throw new Error(`Cevapta ${yol.join('.')} liste değil`);
  return x;
}

// Gün ve kopya koda girer: ayrı rastgele akışlar aynı heceyi ve sırayı üretebilir; benzersiz alanlar (nokta adı, kart kimliği) çakışmasın.
export const kod = (b: Pick<SenaryoBaglami, 'rastgele' | 'gun' | 'kopya'>, tur: string): string =>
  b.rastgele.kod(`${tur}${String(b.gun)}k${String(b.kopya)}`);

// Tarih alanları günlere yayılır; saat ileri alınmaz (ay-benzetimi Aşama 1).
export function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

export type KartTuru = 'hammadde' | 'mamul';

// Malzeme sihirbazının zorunlu alanları: hammaddede aile, kalite ve ölçü; mamulde ad ve operasyonlar.
export function kartGovdesi(tur: KartTuru, kimlik: string, kod: string, ad: string, durum: string, surum: number | null): Kayit {
  const ozel = tur === 'hammadde'
    ? { grade: 'S235', form: 'cubuk', dims: { d: 50, l: 6000 } }
    : { g: { ad }, ops: [{ no: 10, kod: 'TRN', ad: 'Torna (CNC)' }, { no: 20, kod: 'FRZ', ad: 'Freze (CNC)' }] };
  return {
    kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad, birim: 'adet' }, onay: { durum }, ...ozel },
    ozet: { stok_kodu: kod, tur, onay_durumu: durum, benzersiz_anahtar: `${tur}|benzetim|${kimlik}`, mukerrer_gerekcesi: null },
    surum,
  };
}

export interface RotaMakinesi { makineId: number; istasyonId: number; istasyonKod: string }

export function rotaAdimi(opNo: number, operasyonTipiId: number, ad: string, makineId: number, giren: number | null): Kayit {
  return {
    opNo, operasyonTipiId, ad, kaynak: { tur: 'makine', id: makineId }, ayarSuresiDk: 30, birimSureDk: 3,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: giren === null ? [] : [{ malzemeId: giren, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
  };
}

export function siparisGovdesi(firmaId: number, musteriSiparisNo: string, bugun: string, termin: string, malzemeNo: number, adet: number, birimFiyat: string | null): Kayit {
  return {
    firmaId, musteriSiparisNo, siparisTarihi: bugun, termin, kdvOrani: '20', odemeKosulu: null, aciklama: null,
    satirlar: [{ malzemeNo, miktar: String(adet), birimFiyat, termin: null, aciklama: null }],
  };
}

// Bir tezgâhta aynı anda tek iş çalışır (Arkon "makine dolu"); örnek verideki tezgâhlarda örnek emirler açık kalır. Bu yüzden koşu
// kendi tezgâhlarını bir kez açar: her kopyaya bir torna ve bir freze. Operatöre yetkinlik verilir, var olanlar korunur.
const TEZGAH_KURULUMU = new WeakMap<object, Promise<RotaMakinesi[][] | null>>();

export function yetkinlikBirlesimi(yetkinlikler: unknown, kisiId: number, yeniler: readonly number[]): number[] {
  const kayit = Array.isArray(alan(yetkinlikler, 'yetkinlikler'))
    ? liste(yetkinlikler, 'yetkinlikler').find((y) => alan(y, 'kisiId') === kisiId)
    : undefined;
  const eski = alan(kayit, 'istasyonIdleri');
  const var_ = Array.isArray(eski) ? eski.filter((x): x is number => typeof x === 'number') : [];
  return [...new Set([...var_, ...yeniler])].sort((x, y) => x - y);
}

async function tezgahlariKur(b: SenaryoBaglami, kopyaSayisi: number): Promise<RotaMakinesi[][] | null> {
  const r = b.rastgele;
  const im = await b.bekle(MUDUR, 'iş merkezi aç', 'POST', '/api/is-merkezleri', 200, { kod: kod(b, 'im'), ad: kod(b, 'merkez'), aciklama: null });
  if (im === null) return null;
  const ciftler: RotaMakinesi[][] = [];
  for (let k = 0; k < kopyaSayisi; k += 1) {
    const cift: RotaMakinesi[] = [];
    for (const tur of ['torna', 'freze']) {
      const ist = await b.bekle(MUDUR, `${tur} istasyonu aç`, 'POST', '/api/istasyonlar', 200,
        { kod: kod(b, 'ist'), ad: kod(b, tur), isMerkeziId: sayi(im, 'id'), tip: 'talasli', uretimAlani: true });
      if (ist === null) return null;
      const mak = await b.bekle(MUDUR, `${tur} tezgâhı aç`, 'POST', '/api/makineler', 200, { kod: kod(b, 'mak'), ad: kod(b, 'tezgah'), istasyonId: sayi(ist, 'id') });
      if (mak === null) return null;
      cift.push({ makineId: sayi(mak, 'id'), istasyonId: sayi(ist, 'id'), istasyonKod: String(alan(ist, 'kod')) });
    }
    ciftler.push(cift);
  }
  // ADR 0018: plan sunucu motoruyla dizilir; motor vardiyası tanımsız tezgâha yer vermez. Müdür koşunun iş merkezine her gün bir vardiya açar.
  const vardiyaAdi = kod(b, 'vardiya');
  const vardiya = await b.bekle(MUDUR, 'vardiya aç', 'POST', '/api/vardiyalar', 200, { ad: vardiyaAdi, baslangic: '08:00', bitis: '18:00', molalar: [], aktif: true });
  if (vardiya === null) return null;
  const vardiyaId = sayi(liste(vardiya, 'vardiyalar').find((v) => alan(v, 'ad') === vardiyaAdi), 'id');
  for (let gun = 1; gun <= 7; gun += 1) {
    if (await b.bekle(MUDUR, 'iş merkezinin haftasını kur', 'POST', '/api/vardiya-matrisi/degistir', 200, { isMerkeziId: sayi(im, 'id'), gun, vardiyaId, acik: true }) === null) return null;
  }
  if (!(await planlamaKaydi(b))) return null;
  const oturum = await b.bekle(OPERATOR, 'operatör oturumu', 'GET', '/api/oturum', 200);
  const yetkinlik = await b.bekle(MUDUR, 'yetkinlikleri oku', 'GET', '/api/kisi-yetkinlikleri', 200);
  if (oturum === null || yetkinlik === null) return null;
  const kisiId = sayi(oturum, 'kullanici', 'id');
  const istasyonIdleri = yetkinlikBirlesimi(yetkinlik, kisiId, ciftler.flat().map((t) => t.istasyonId));
  if (await b.bekle(MUDUR, 'operatöre yetkinlik ver', 'POST', `/api/kisi-yetkinlikleri/${String(kisiId)}/belirle`, 200, { istasyonIdleri }) === null) return null;
  return ciftler;
}

async function tezgahCifti(b: SenaryoBaglami, kopyaSayisi: number): Promise<RotaMakinesi[] | null> {
  let kurulum = TEZGAH_KURULUMU.get(b.rol);
  if (kurulum === undefined) {
    kurulum = tezgahlariKur(b, kopyaSayisi);
    TEZGAH_KURULUMU.set(b.rol, kurulum);
  }
  const ciftler = await kurulum;
  return ciftler?.[(b.kopya - 1) % ciftler.length] ?? null;
}

// Sunucu motoru planlama sayfasının çalışma kaydı olmadan plan kurmaz (ADR 0018). Kayıt yoksa planlamacı boş çalışmayı bir kez kaydeder;
// varsa (örnek veri, önceki koşu ya da sayfa) üstüne yazılmaz: 409 doğru davranıştır.
export const PLANLAMA_KAYDI = 'recete-rota-motoru-v1:planlama';
export function bosPlanlamaCalismasi(bugun: string): Kayit {
  return {
    surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Benzetim', baslangic: bugun }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  };
}
async function planlamaKaydi(b: SenaryoBaglami): Promise<boolean> {
  const yol = '/api/plan/planlama-kayitlari/yaz';
  return b.adim(PLANLAMA, 'planlama çalışmasını kaydet', async () => {
    const c = await b.rol(PLANLAMA).istek('POST', yol, { anahtar: PLANLAMA_KAYDI, bicim: 'json', beklenenSurum: null, deger: bosPlanlamaCalismasi(new Date().toISOString().slice(0, 10)) });
    const ortak = { yontem: 'POST', yol, beklenen: '200 ya da 409', gelen: String(c.durum) };
    if (c.durum === 200) return ortak;
    if (c.durum === 409) return { ...ortak, ileti: 'Çalışma kaydı zaten var; üstüne yazılmadı.' };
    return { ...ortak, sonuc: 'dustu', ileti: JSON.stringify(c.govde) };
  });
}

// Arkon kayıt ucu reddi 200 ile döner; reddedilen satır varsa adım düşer.
async function arkonKaydi(b: SenaryoBaglami, ad: string, tur: 'events' | 'counts', satir: Kayit): Promise<boolean> {
  const yol = `/api/arkon/kayitlar/${tur}/ekle`;
  return b.adim(OPERATOR, ad, async () => {
    const c = await b.rol(OPERATOR).istek('POST', yol, { satirlar: [satir], kaynak: 'y1' });
    const ortak = { yontem: 'POST', yol, beklenen: '200, reddedilen boş', gelen: String(c.durum) };
    const red = alan(c.govde, 'reddedilen');
    if (c.durum !== 200) return { ...ortak, sonuc: 'dustu', ileti: JSON.stringify(c.govde) };
    if (!Array.isArray(red) || red.length > 0) return { ...ortak, gelen: '200, reddedildi', sonuc: 'dustu', ileti: JSON.stringify(red) };
    return ortak;
  });
}

// Kartı planlama yazar ve onaya gönderir, kalite onaylar; kart numarası aramadan okunur.
async function kartAc(b: SenaryoBaglami, tur: KartTuru): Promise<number | null> {
  const kimlik = kod(b, 'kart').toLowerCase();
  const ad = kod(b, tur === 'mamul' ? 'parca' : 'cubuk');
  const yol = `/api/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
  // Stok kodunu sunucu verir; istemci yalnız öneki (tür-grup) gönderir.
  const taslak = await b.bekle(PLANLAMA, `${tur} kartı taslak`, 'POST', yol, 200, kartGovdesi(tur, kimlik, tur === 'mamul' ? 'MM-BNZ-00001' : 'HM-BNZ-00001', ad, 'taslak', null));
  if (taslak === null) return null;
  const stokKodu = String(alan(taslak, 'stok_kodu'));
  const onayda = await b.bekle(PLANLAMA, `${tur} kartı onaya gönder`, 'POST', yol, 200, kartGovdesi(tur, kimlik, stokKodu, ad, 'onayda', sayi(taslak, 'surum')));
  if (onayda === null) return null;
  if (await b.bekle(KALITE, `${tur} kartını onayla`, 'POST', yol, 200, kartGovdesi(tur, kimlik, stokKodu, ad, 'aktif', sayi(onayda, 'surum'))) === null) return null;
  const arama = await b.bekle(PLANLAMA, `${tur} kartını ara`, 'GET', `/api/malzemeler/ara?q=${encodeURIComponent(stokKodu)}`, 200);
  if (arama === null) return null;
  const bulunan = liste(arama, 'sonuclar').find((s) => `${String(alan(s, 'baslik'))} `.startsWith(`${stokKodu} `));
  const no = Number(alan(bulunan, 'anahtar'));
  if (!Number.isInteger(no) || no <= 0) throw new Error(`${kod} aramada bulunamadı`);
  return no;
}

// Planlama sayfasının "Planı kur"u (ADR 0018): emrin yerleşmemiş işleri rotadaki makinelerin kuyruğuna yazılır, saati sunucu motoru verir.
// Plan ortaktır: aynı gün öteki kopyalar da kuyruk yazar ve canlıya alır. Bayat sürümle yazım ya da canlıya alma 409 alır; bu doğru
// davranıştır, kayda geçer ama düşmüş sayılmaz. Asıl eşzamanlı yazma sınaması S4'tedir.
async function plandaYerlestir(b: SenaryoBaglami, emirId: number): Promise<boolean> {
  const canli = await b.bekle(PLANLAMA, 'planı oku', 'GET', '/api/plan', 200);
  if (canli === null) return false;
  const kuyruk = new Map<number, Kayit[]>();
  for (const y of liste(canli, 'yerlesmemis')) {
    if (alan(y, 'uretimEmriId') !== emirId || alan(y, 'kaynak', 'tur') !== 'makine') continue;
    const m = sayi(y, 'kaynak', 'id');
    kuyruk.set(m, [...(kuyruk.get(m) ?? []), { emirNo: alan(y, 'emirNo'), opNo: alan(y, 'opNo'), dondurulmus: false }]);
  }
  const baslangic = new Date(Date.now() + 3_600_000).toISOString();
  const kuyrukYolu = '/api/plan/kuyruklari-yaz';
  let taslakId: number | null = null;
  const yazildi = await b.adim(PLANLAMA, 'emrin işlerini kuyruğa yaz', async () => {
    const c = await b.rol(PLANLAMA).istek('POST', kuyrukYolu, {
      kuyruklar: [...kuyruk].map(([id, isler]) => ({ kaynak: { tur: 'makine', id }, baslangic, isler })), planSurumu: alan(canli, 'surum'),
    });
    const ortak = { yontem: 'POST', yol: kuyrukYolu, beklenen: '200 ya da eski sürüm 409', gelen: String(c.durum) };
    if (c.durum === 200) { taslakId = sayi(c.govde, 'taslak'); return ortak; }
    if (c.durum === 409 && alan(c.govde, 'ayrinti', 'neden') === ESKI_SURUM_NEDENI) return { ...ortak, ileti: 'Aynı anda başka kopya planı değiştirdi (sürüm denetimi).' };
    return { ...ortak, sonuc: 'dustu', ileti: JSON.stringify(c.govde) };
  });
  if (!yazildi || taslakId === null) return false;
  const plan = await b.bekle(PLANLAMA, 'plan taslağını oku', 'GET', `/api/plan?taslak=${String(taslakId)}`, 200);
  if (plan === null) return false;
  const yerlesen = liste(plan, 'yerlesimler').filter((y) => alan(y, 'uretimEmriId') === emirId).length;
  if (!(await b.adim(PLANLAMA, 'emrin iki işi planda', () => Promise.resolve(
    { beklenen: '2', gelen: String(yerlesen), ...(yerlesen === 2 ? {} : { sonuc: 'dustu' as const }) })))) return false;
  const surum = alan(plan, 'taslak', 'surum');
  const yol = `/api/plan/senaryolar/${String(taslakId)}/canliya-al`;
  return b.adim(PLANLAMA, 'planı canlıya al', async () => {
    const c = await b.rol(PLANLAMA).istek('POST', yol, { surum, cakismalariKabul: true });
    const ortak = { yontem: 'POST', yol, beklenen: '200 ya da 409', gelen: String(c.durum) };
    if (c.durum === 200) return ortak;
    if (c.durum === 409) return { ...ortak, ileti: 'Aynı anda başka kopya planı değiştirdi (sürüm denetimi).' };
    return { ...ortak, sonuc: 'dustu', ileti: JSON.stringify(c.govde) };
  });
}

export async function uretimAkisi(b: SenaryoBaglami, bugun: string): Promise<void> {
  const r = b.rastgele;
  const adet = r.aralik(5, 40);
  const termin = gunEkle(bugun, 20 + b.gun);

  const firma = await b.bekle(PLANLAMA, 'müşteri firma aç', 'POST', '/api/musteri-tedarikci/firmalar/ekle', 200, { ad: kod(b, 'firma'), tur: 'musteri' });
  if (firma === null) return;
  const firmaId = sayi(firma, 'firma', 'id');

  const mamulNo = await kartAc(b, 'mamul');
  if (mamulNo === null) return;
  const hammaddeNo = await kartAc(b, 'hammadde');
  if (hammaddeNo === null) return;

  const tezgah = await tezgahCifti(b, KOPYA);
  if (tezgah === null) return;
  const secenek = await b.bekle(PLANLAMA, 'rota seçenekleri', 'GET', '/api/rota/secenekler', 200);
  if (secenek === null) return;
  const tip = (k: string): number => {
    const t = liste(secenek, 'operasyonTipleri').find((x) => alan(x, 'kod') === k);
    return sayi(t, 'id');
  };

  const rev = await b.bekle(PLANLAMA, 'rota taslağı aç', 'POST', `/api/rota/urunler/${String(mamulNo)}/taslak-ac`, 200, { kaynak: { tur: 'kart' } });
  if (rev === null) return;
  const revId = sayi(rev, 'id');
  const revOku = await b.bekle(PLANLAMA, 'rota taslağını oku', 'GET', `/api/rota/revizyonlar/${String(revId)}`, 200);
  if (revOku === null) return;
  const kayit = await b.bekle(PLANLAMA, 'rotayı kaydet', 'POST', `/api/rota/revizyonlar/${String(revId)}/kaydet`, 200, {
    surum: sayi(revOku, 'revizyon', 'surum'), aciklama: kod(b, 'rota'),
    adimlar: [rotaAdimi(10, tip('TRN'), 'Tornalama', tezgah[0]?.makineId ?? 0, hammaddeNo),
      rotaAdimi(20, tip('FRZ'), 'Frezeleme', tezgah[1]?.makineId ?? 0, null)],
  });
  if (kayit === null) return;
  const gonder = await b.bekle(PLANLAMA, 'rotayı onaya gönder', 'POST', `/api/rota/revizyonlar/${String(revId)}/onaya-gonder`, 200, { surum: sayi(kayit, 'surum') });
  if (gonder === null) return;
  if (await b.bekle(MUDUR, 'rotayı onayla, yürürlüğe al', 'POST', `/api/rota/revizyonlar/${String(revId)}/onayla`, 200,
    { surum: sayi(gonder, 'surum'), yururlugeAl: true }) === null) return;

  const msNo = kod(b, 'ms');
  const sip = await b.bekle(PLANLAMA, 'satış siparişi aç', 'POST', '/api/siparisler/ekle', 200, siparisGovdesi(firmaId, msNo, bugun, termin, mamulNo, adet, null));
  if (sip === null) return;
  const sipId = sayi(sip, 'id');
  const fiyat = String(r.aralik(50, 900));
  const gu = await b.bekle(MUDUR, 'sipariş fiyatını gir', 'POST', `/api/siparisler/${String(sipId)}/guncelle`, 200,
    { ...siparisGovdesi(firmaId, msNo, bugun, termin, mamulNo, adet, fiyat), surum: sayi(sip, 'surum') });
  if (gu === null) return;
  if (await b.bekle(MUDUR, 'siparişi onayla', 'POST', `/api/siparisler/${String(sipId)}/onayla`, 200, { surum: sayi(gu, 'surum') }) === null) return;
  const sipOku = await b.bekle(PLANLAMA, 'siparişi oku', 'GET', `/api/siparisler/${String(sipId)}`, 200);
  if (sipOku === null) return;
  const sipSatir = sayi(sipOku, 'satirlar', 0, 'id');

  const proje = await b.bekle(PLANLAMA, 'siparişten proje aç', 'POST', `/api/projeler/siparisten/${String(sipId)}/ac`, 200,
    { kod: kod(b, 'p').replace(/-/g, '.'), ad: kod(b, 'proje'), baslangic: bugun, bitis: termin, aciklama: null });
  if (proje === null) return;

  const emir = await b.bekle(PLANLAMA, 'rotadan üretim emri aç', 'POST', `/api/rota/revizyonlar/${String(revId)}/emre-kopyala`, 200,
    { adet, teslim: termin, projeId: sayi(proje, 'id'), siparisSatiriId: sipSatir, stoktanRezerve: false });
  if (emir === null) return;
  const emirId = sayi(emir, 'uretimEmriId');
  const emirOku = await b.bekle(PLANLAMA, 'emri ve iş emirlerini oku', 'GET', `/api/adimli-emirler/${String(emirId)}`, 200);
  if (emirOku === null) return;
  const isEmirleri = liste(emirOku, 'emir', 'isEmirleri').slice().sort((x, y) => sayi(x, 'sira') - sayi(y, 'sira')).map((x) => sayi(x, 'id'));
  if (isEmirleri.length !== 2) throw new Error(`İki iş emri bekleniyordu, ${String(isEmirleri.length)} geldi`);

  // Hammadde: depo siparişsiz kabul eder ("diğer"), emre sarf eder. Satın alma akışı S2'dedir.
  const kabul = await b.bekle(DEPO, 'hammadde kabul', 'POST', '/api/stok/mal-kabul', 200, {
    tur: 'diger', irsaliyeNo: kod(b, 'irs').slice(0, 30),
    satirlar: [{ malzemeId: hammaddeNo, miktar: String(adet), parti: { tedarikciPartiNo: kod(b, 'tp').slice(0, 30), dokumNo: null, sertifikaNo: null } }],
  });
  if (kabul === null) return;
  const hm = await b.bekle(DEPO, 'hammadde bakiyesi', 'GET', `/api/stok/malzemeler/${String(hammaddeNo)}`, 200);
  const hmParti = await b.bekle(DEPO, 'hammadde partisi', 'GET', `/api/stok/partiler?malzemeId=${String(hammaddeNo)}`, 200);
  if (hm === null || hmParti === null) return;
  const konum = liste(hm, 'bakiyeler').find((x) => Number(alan(x, 'miktar')) > 0);
  if (await b.bekle(DEPO, 'hammaddeyi emre sarf et', 'POST', '/api/stok/cikis', 200, {
    malzemeId: hammaddeNo, konumId: sayi(konum, 'konumId'), partiId: sayi(hmParti, 'satirlar', 0, 'id'), miktar: String(adet),
    cikisNedeni: 'uretime_sarf', uretimEmriId: emirId, aciklama: null,
  }) === null) return;

  if (!(await plandaYerlestir(b, emirId))) return;

  for (const [i, ie] of isEmirleri.entries()) {
    const machine = tezgah[i]?.istasyonKod;
    const pkgId = `tmi-ie-${String(ie)}`;
    const op = `iş emri ${String(i + 1)}`;
    if (!(await arkonKaydi(b, `${op}: başlat`, 'events', { cid: kod(b, 'cid'), pkgId, state: 'running', machine }))) return;
    if (!(await arkonKaydi(b, `${op}: sağlam sayım`, 'counts', { cid: kod(b, 'cid'), pkgId, kind: 'good', delta: adet, machine }))) return;
    if (!(await arkonKaydi(b, `${op}: bitir`, 'events', { cid: kod(b, 'cid'), pkgId, state: 'done', machine }))) return;
    // İlk adımın sağlamı ilk parça onayına kadar sonraki adıma geçmez; kararı kalite verir.
    if (i === 0 && await b.bekle(KALITE, 'ilk parça onayı', 'POST', `/api/kalite-merkezi/ilk-parca/${String(emirId)}/karar`, 200, { karar: 'onay' }) === null) return;
  }

  const bitti = await b.adim(MUDUR, 'emir bitti mi', async () => {
    const yol = `/api/adimli-emirler/${String(emirId)}`;
    const c = await b.rol(MUDUR).istek('GET', yol);
    const durum = String(alan(c.govde, 'emir', 'durum'));
    return { yontem: 'GET', yol, beklenen: 'bitti', gelen: durum, ...(durum === 'bitti' ? {} : { sonuc: 'dustu' as const }) };
  }, { tekrarlanabilir: true });
  if (!bitti) return;

  // Stok girişi emrin bitişiyle kendiliğinden yazılır; depo partiyi emre bağlı ve tam adetle görür.
  const parti = await b.adim(DEPO, 'mamul stok girişini gör', async () => {
    const yol = `/api/stok/partiler?malzemeId=${String(mamulNo)}`;
    const c = await b.rol(DEPO).istek('GET', yol);
    const p = liste(c.govde, 'satirlar').find((x) => alan(x, 'uretimEmriId') === emirId);
    const eldeki = Number(alan(p, 'eldeki'));
    return { yontem: 'GET', yol, beklenen: String(adet), gelen: String(eldeki), ...(eldeki === adet ? {} : { sonuc: 'dustu' as const }) };
  }, { tekrarlanabilir: true });
  if (!parti) return;

  const bek = await b.bekle(DEPO, 'sevk bekleyenleri oku', 'GET', '/api/sevkiyat/bekleyenler', 200);
  if (bek === null) return;
  const bekleyen = liste(bek, 'bekleyenler').find((x) => alan(x, 'uretimEmriId') === emirId);
  if (bekleyen === undefined) throw new Error('Biten emir sevk bekleyenlerinde yok');
  const nokta = await b.bekle(DEPO, 'teslim noktası aç', 'POST', '/api/sevkiyat/noktalar/ekle', 200, {
    ad: kod(b, 'nokta'), tur: 'musteri', enlem: 39.9 + r.sayi() / 10, boylam: 32.8 + r.sayi() / 10, adres: null, durakSuresiDakika: 15, firmaId,
  });
  if (nokta === null) return;
  const is = await b.bekle(DEPO, 'sevkiyat işine çevir', 'POST', `/api/sevkiyat/bekleyenler/${String(sayi(bekleyen, 'id'))}/ise-cevir`, 200, {
    tarih: bugun, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: sayi(nokta, 'nokta', 'id'), agirlikKilogram: adet, paletSayisi: 1,
    durakSuresiDakika: null, alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: kod(b, 'irs'), aciklama: null, sabitAracId: null,
  });
  if (is === null) return;
  if (await b.bekle(DEPO, 'teslim edildi', 'POST', `/api/sevkiyat/isler/${String(sayi(is, 'is', 'id'))}/durum`, 200,
    { durum: 'tamamlandi', tarih: bugun, not: null }) === null) return;

  await b.adim(DEPO, 'sevk sonrası stok sıfır', async () => {
    const yol = `/api/stok/malzemeler/${String(mamulNo)}`;
    const c = await b.rol(DEPO).istek('GET', yol);
    const toplam = Number(alan(c.govde, 'satir', 'toplam'));
    return { yontem: 'GET', yol, beklenen: '0', gelen: String(toplam), ...(toplam === 0 ? {} : { sonuc: 'dustu' as const }) };
  }, { tekrarlanabilir: true });
}

export default senaryo({
  ad: 'uretim',
  roller: [PLANLAMA, MUDUR, KALITE, OPERATOR, DEPO],
  kopya: KOPYA,
  async kos(b) {
    await uretimAkisi(b, new Date().toISOString().slice(0, 10));
  },
});

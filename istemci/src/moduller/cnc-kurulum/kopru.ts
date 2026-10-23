import type {
  EmirSecCevabi, EmirlerCevabi, HazirlikCevabi, KurulumTamamCevabi, SilCevabi, StokDusCevabi, StokDusGovdesi, StokKartiBaglaCevabi,
  StokKartlariCevabi, TakimOlaylariCevabi, TakimOlaylariGovdesi, YazCevabi,
} from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { stepOkuyucuYukle } from './prototip.ts';

// Çerçevedeki köprünün istekleri (kanal "cnc-kurulum") TMI uçlarına çevrilir. Kural ve yetki sunucudadır; burası yalnız taşır ve
// yalnız bilinen istek türlerini geçirir.
export type KopruIsleyici = (tip: string, veri: unknown) => Promise<unknown>;

// Model aktarımı toplu aktarım sayfasında başlar: çerçeve modeli üretir, kabuk yükler. Verilmezse bu istekler bilinmeyen sayılır.
export interface ModelKoprusu {
  modelGeldi?: (model: { makineId: string; no: string | null; ad: string; glb: Uint8Array }) => Promise<unknown>;
  // Toplu aktarımda hata hangi makinenin olduğunu taşır; çerçevedeki düğmeden gelende makine yoktur.
  modelHatasi?: (ileti: string, makineId: string | null) => Promise<unknown>;
  // Yalnız toplu aktarım sayfası verir: çerçeve açılınca makine listesini yollar.
  listeGeldi?: (makineler: { makineId: string; no: string | null; ad: string }[]) => Promise<unknown>;
  // Yalnız ana sayfa verir: çerçevedeki düğme toplu aktarım sayfasını prototipte seçili makineyle açtırır.
  topluAc?: (makineId: string | null) => Promise<unknown>;
}
const STEP_HATASI = 'STEP okuyucu yüklenemedi.';
export interface KopruHatasi { hata: string; durum: number }

type Nesne = Record<string, unknown>;
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Nesne : {});
const metin = (v: unknown, alan: string): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`Geçersiz ${alan}.`);
  return v;
};
const surum = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

// Sözleşmedeki DURUM_ANAHTARI ile aynı; istemci sözleşmeyi değer olarak ithal etmez.
const DURUM_ANAHTARI = 'cnc-kurulum-motoru.v1';
const yetkiYok = (): ApiHatasi => new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu kayıt yalnız hazırlık onayıyla yazılamaz.' });

// Onaylayıcı yalnız hazırlık onay alanlarını gönderir (bütün durum yüzlerce KB'dir); öteki kayıtlar yazılmaz, sunucu da almazdı.
function hazirlikGovdesi(v: Nesne): { hazirlik: Nesne; beklenenSurum: number | null } {
  if (v['anahtar'] !== DURUM_ANAHTARI || v['bicim'] === 'metin') throw yetkiYok();
  const hazirlik = nesne(nesne(v['deger'])['prep']);
  const secilen: Nesne = {};
  for (const alan of ['done', 'fin', 'at']) if (hazirlik[alan] !== undefined) secilen[alan] = hazirlik[alan];
  return { hazirlik: secilen, beklenenSurum: surum(v['beklenenSurum']) };
}

// Sunucudaki onay izinin eşi (sunucu/moduller/cnc-kurulum/kurallar.ts): adım onayları ve son onay, anahtar sırasından bağımsız.
const sirali = (d: unknown): unknown => (Array.isArray(d) ? d.map(sirali)
  : d !== null && typeof d === 'object' ? Object.fromEntries(Object.keys(d).sort().map((k) => [k, sirali((d as Nesne)[k])])) : d);
function onayIzi(durum: unknown): string {
  const h = nesne(nesne(durum)['prep']);
  const done = Object.entries(nesne(h['done'])).filter(([, d]) => d !== null && d !== undefined && d !== false);
  const fin = h['fin'] !== null && typeof h['fin'] === 'object' && !Array.isArray(h['fin']) ? h['fin'] : null;
  return JSON.stringify(sirali({ done: Object.fromEntries(done), fin }));
}
const ayristir = (metinDeger: string | undefined): unknown => {
  try { return metinDeger === undefined ? null : JSON.parse(metinDeger) as unknown; } catch { return null; }
};

// Prototip takım değişimini ve kullanım düzeltmesini yalnız kendi aşınma kaydında (`wear[tezgâh][cep]`) yapar. Köprü, açılışta
// sunucu sayacıyla okunan tezgâhın kaydını son gönderilenle karşılaştırır: aynı takımda başlangıç (`since`) yenilenip kullanım
// sıfırlandıysa değişim, başlangıç aynı kalıp kullanım değiştiyse düzeltmedir. Düzeltme fark olarak gider: arada üretimden gelen
// sayım silinmez. Cepte takım değiştiyse yük değişimidir (kurulum tamamda yazılır), olay değildir. Örnek veri (`demo`) ve elle
// üretim kaydının değiştirdiği kullanım (311 a: adet yalnız Üretim Terminali'nden) sunucuya gitmez. Yalnız açılıştaki tezgâh:
// öteki tezgâhların sayacı sunucuda yoktur.
type TakimOlayi = TakimOlaylariGovdesi['olaylar'][number];
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
function asinmaKaydi(durum: unknown, tezgah: string): Nesne {
  return nesne(nesne(nesne(durum)['wear'])[tezgah]);
}
// Elle üretim kaydının eklenen ya da geri alınan satırlarının değiştirdiği cepler (satır zamanıyla tanınır, `d` cep başına kullanım).
function uretimCepleri(onceki: unknown, yeni: unknown): Set<string> {
  const satirlar = (d: unknown): Nesne[] => {
    const l = nesne(d)['wearLog'];
    return Array.isArray(l) ? l.map(nesne) : [];
  };
  const eski = satirlar(onceki), yeniler = satirlar(yeni);
  const zamanlar = (l: Nesne[]): Set<unknown> => new Set(l.map((r) => r['ts']));
  const eskiZaman = zamanlar(eski), yeniZaman = zamanlar(yeniler);
  const degisen = [...yeniler.filter((r) => !eskiZaman.has(r['ts'])), ...eski.filter((r) => !yeniZaman.has(r['ts']))];
  return new Set(degisen.flatMap((r) => Object.keys(nesne(r['d']))));
}
export function takimOlaylariniBul(onceki: unknown, yeni: unknown, tezgah: string | null): TakimOlayi[] {
  if (tezgah === null || nesne(yeni)['machine'] !== tezgah) return [];
  const eski = asinmaKaydi(onceki, tezgah);
  const elleUretim = uretimCepleri(onceki, yeni);
  const olaylar: TakimOlayi[] = [];
  for (const [anahtar, deger] of Object.entries(asinmaKaydi(yeni, tezgah))) {
    const cep = Number(anahtar), y = nesne(deger), o = nesne(eski[anahtar]);
    const used = sayi(y['used']), parts = sayi(y['parts']);
    if (!Number.isInteger(cep) || typeof y['id'] !== 'string' || y['id'] === '' || o['id'] !== y['id'] || used === null || parts === null) continue;
    if (y['demo'] !== undefined) continue;
    if (typeof y['since'] === 'number' && y['since'] !== o['since'] && used === 0 && parts === 0) {
      olaylar.push({ tur: 'degisim', cep, takimKimligi: y['id'] });
      continue;
    }
    const oUsed = sayi(o['used']), oParts = sayi(o['parts']);
    if (elleUretim.has(anahtar) || oUsed === null || oParts === null || (used === oUsed && parts === oParts)) continue;
    olaylar.push({ tur: 'duzeltme', cep, takimKimligi: y['id'], farkDk: used - oUsed, farkAdet: parts - oParts });
  }
  return olaylar;
}

// Stok kartına bağlı kütüphane kalemi (163 b) okurken stoğun kullanılabilir miktarıyla ve `tmiStok` işaretiyle gelir. Prototip
// adedi takım değişiminde, uç setinde ve elle azaltmada düşürür: köprü son gönderilenle karşılaştırır, azalan adet stoktan düşer
// (164 b). Artış stoğa girmez (giriş Stok ekranından; sonraki açılışta stoğun miktarı gelir). Bağ ya da kart değiştiyse fark yoktur.
const KUTUPHANE_KIMLIGI = /^[A-Za-z0-9_.-]{1,64}$/;
function stokluKalemler(durum: unknown): Map<string, { malzemeId: unknown; qty: number }> {
  const sonuc = new Map<string, { malzemeId: unknown; qty: number }>();
  for (const [kimlik, deger] of Object.entries(nesne(nesne(durum)['inv']))) {
    const k = nesne(deger), bag = nesne(k['tmiStok']);
    if (typeof bag['malzemeId'] === 'number' && typeof k['qty'] === 'number' && Number.isFinite(k['qty'])) sonuc.set(kimlik, { malzemeId: bag['malzemeId'], qty: k['qty'] });
  }
  return sonuc;
}
export function stokDususleriniBul(onceki: unknown, yeni: unknown): StokDusGovdesi[] {
  const eski = stokluKalemler(onceki);
  const dusus: StokDusGovdesi[] = [];
  for (const [kimlik, y] of stokluKalemler(yeni)) {
    const o = eski.get(kimlik);
    if (o === undefined || o.malzemeId !== y.malzemeId || !KUTUPHANE_KIMLIGI.test(kimlik)) continue;
    const miktar = Math.round(o.qty - y.qty);
    if (miktar >= 1) dusus.push({ kimlik, miktar: Math.min(miktar, 10000) });
  }
  return dusus;
}

// Yazma işlemi olmayan hazırlık onaylayıcısının kaydı onay ucuna gider; sunucu yalnız onay alanlarını alır. Genel kayıt ucu
// onayları değiştiren durumu reddeder (kart #1583): yazabilen kişinin onayı önce kendi onay ucuna, sonra bütün durum kayıt
// ucuna gider. ilkDurum, açılışta okunan durum kaydıdır (onayların değişip değişmediği ona göre anlaşılır). Emir seçilince
// sunucu kurulumu değiştirir: yenile çerçeveyi yeni kayıtlarla yeniden kurar. Takım değiştirebilen kişinin değişim ve
// düzeltmesi takım ucuna gider (yazma işlemi olmasa da); yoksa yalnız açık sekmede kalır. Stoktan düşebilen kişinin bağlı
// kalemdeki azalışı stok ucuna gider; yoksa yalnız açık sekmede kalır. Kalem stok kartına bağlanınca çerçeve Kütüphane'de
// yeniden kurulur (adet stoktan gelir).
export function kopruKur(
  model?: ModelKoprusu, yalnizHazirlik = false, ilkDurum?: string, yenile?: (gorunum?: string) => void, takimDegistirebilir = false,
  stokDusebilir = false,
): KopruIsleyici {
  const ilk = ayristir(ilkDurum);
  let sonOnay = onayIzi(ilk);
  let sonAsinma = ilk;
  let sonStok = ilk;
  const tezgah = typeof nesne(ilk)['machine'] === 'string' ? nesne(ilk)['machine'] as string : null;
  // Durum yazıldıktan sonra olaylar kuyruğa girer: reddedilen durumun (eski sürüm, büyük kayıt) olayı yazılmaz, sonraki yazımda
  // gider. Kuyruk istek kimliğiyle gider (uç tekrar korumalı: fark iki kez yazılmaz); ağ ya da sunucu hatasında kuyrukta kalır ve
  // sonraki yazımda yeniden denenir, durum yazımının cevabı yine döner (çerçeve sürümü kaybetmez). Uç olayı reddederse (4xx)
  // olay bırakılır: aynı olay her kayıtta yeniden gidip kuyruğu tıkamaz.
  const bekleyen: { olaylar: TakimOlayi[]; kimlik: string }[] = [];
  async function takimOlaylariniYaz(olaylar: TakimOlayi[], deger: unknown): Promise<void> {
    if (olaylar.length > 0) bekleyen.push({ olaylar, kimlik: yeniIstekKimligi() });
    sonAsinma = deger;
    for (let oge = bekleyen[0]; oge !== undefined; oge = bekleyen[0]) {
      try {
        await api.post<TakimOlaylariCevabi>('/cnc-kurulum/takimlar/olaylar', { olaylar: oge.olaylar }, { istekKimligi: oge.kimlik });
      } catch (e) {
        if (!(e instanceof ApiHatasi) || e.durum < 400 || e.durum >= 500) return;
      }
      bekleyen.shift();
    }
  }
  // Takım olaylarının kuyruğuyla aynı kural: durum yazılınca gider, ağ ve sunucu hatasında kalır, uç reddederse (yetersiz stok,
  // bağı kalkmış kalem) bırakılır. Stok çıkışı tekrar korumalıdır: aynı düşüş iki kez yazılmaz.
  const bekleyenDusus: { govde: StokDusGovdesi; kimlik: string }[] = [];
  async function stokDususleriniYaz(dusus: StokDusGovdesi[], deger: unknown): Promise<void> {
    for (const govde of dusus) bekleyenDusus.push({ govde, kimlik: yeniIstekKimligi() });
    sonStok = deger;
    for (let oge = bekleyenDusus[0]; oge !== undefined; oge = bekleyenDusus[0]) {
      try {
        await api.post<StokDusCevabi>('/cnc-kurulum/takimlar/stok-dus', oge.govde, { istekKimligi: oge.kimlik });
      } catch (e) {
        if (!(e instanceof ApiHatasi) || e.durum < 400 || e.durum >= 500) return;
      }
      bekleyenDusus.shift();
    }
  }
  async function durumuYaz(v: Nesne): Promise<YazCevabi> {
    if (yalnizHazirlik) return api.post<YazCevabi>('/cnc-kurulum/hazirlik/onayla', hazirlikGovdesi(v));
    const anahtar = metin(v['anahtar'], 'anahtar');
    const bicim = v['bicim'] === 'metin' ? 'metin' : 'json';
    let beklenenSurum = surum(v['beklenenSurum']);
    const durumMu = anahtar === DURUM_ANAHTARI && bicim === 'json';
    const iz = durumMu ? onayIzi(v['deger']) : sonOnay;
    if (durumMu && beklenenSurum !== null && iz !== sonOnay) {
      beklenenSurum = (await api.post<YazCevabi>('/cnc-kurulum/hazirlik/yazar-onayla', hazirlikGovdesi(v))).kayit.surum;
      sonOnay = iz;
    }
    const cevap = await api.post<YazCevabi>('/cnc-kurulum/kayitlar/yaz', { anahtar, bicim, deger: v['deger'] ?? null, beklenenSurum });
    if (durumMu) sonOnay = iz;
    return cevap;
  }
  return async (tip, veri) => {
    const v = nesne(veri);
    switch (tip) {
      case 'kayit-yaz': {
        const olaylar = takimDegistirebilir && v['anahtar'] === DURUM_ANAHTARI && v['bicim'] !== 'metin'
          ? takimOlaylariniBul(sonAsinma, v['deger'], tezgah) : null;
        const dusus = stokDusebilir && !yalnizHazirlik && v['anahtar'] === DURUM_ANAHTARI && v['bicim'] !== 'metin' ? stokDususleriniBul(sonStok, v['deger']) : null;
        const cevap = await durumuYaz(v);
        if (olaylar !== null) await takimOlaylariniYaz(olaylar, v['deger']);
        if (dusus !== null) await stokDususleriniYaz(dusus, v['deger']);
        return cevap;
      }
      case 'stok-kartlari': {
        const sorgu = new URLSearchParams({ sayfa: String(typeof v['sayfa'] === 'number' && Number.isInteger(v['sayfa']) && v['sayfa'] > 0 ? v['sayfa'] : 1) });
        if (typeof v['metin'] === 'string' && v['metin'].trim() !== '') sorgu.set('metin', v['metin'].trim().slice(0, 100));
        return api.get<StokKartlariCevabi>(`/cnc-kurulum/takimlar/stok-kartlari?${sorgu.toString()}`);
      }
      case 'stok-karti-bagla': {
        const kimlik = metin(v['kimlik'], 'kütüphane kimliği');
        if (!KUTUPHANE_KIMLIGI.test(kimlik)) throw new Error('Geçersiz kütüphane kimliği.');
        const malzemeId = v['malzemeId'] === null ? null : v['malzemeId'];
        if (malzemeId !== null && (typeof malzemeId !== 'number' || !Number.isInteger(malzemeId) || malzemeId < 1)) throw new Error('Geçersiz stok kartı.');
        const cevap = await api.post<StokKartiBaglaCevabi>('/cnc-kurulum/takimlar/stok-karti', { kimlik, malzemeId });
        // Yanıt çerçeveye gittikten sonra yeniden kurulur: adet ve bağ okumayla gelir.
        setTimeout(() => { yenile?.('lib'); }, 0);
        return cevap;
      }
      case 'kayit-sil': {
        const beklenen = surum(v['beklenenSurum']);
        if (beklenen === null) throw new Error('Geçersiz sürüm.');
        return api.post<SilCevabi>('/cnc-kurulum/kayitlar/sil', { anahtar: metin(v['anahtar'], 'anahtar'), beklenenSurum: beklenen });
      }
      case 'emir-sec': {
        if (yalnizHazirlik) throw yetkiYok();
        if (typeof v['isEmriId'] !== 'number' || !Number.isInteger(v['isEmriId'])) throw new Error('Geçersiz iş emri.');
        const cevap = await api.post<EmirSecCevabi>('/cnc-kurulum/emir-sec', { isEmriId: v['isEmriId'], beklenenSurum: surum(v['beklenenSurum']) });
        // Yanıt çerçeveye gittikten sonra yeniden kurulur.
        setTimeout(() => { yenile?.(); }, 0);
        return cevap;
      }
      case 'kurulum-tamam': {
        if (yalnizHazirlik) throw yetkiYok();
        const beklenen = surum(v['beklenenSurum']);
        if (beklenen === null) throw new Error('Geçersiz sürüm.');
        return api.post<KurulumTamamCevabi>('/cnc-kurulum/kurulum-tamam', { beklenenSurum: beklenen });
      }
      case 'step-okuyucu':
        // Çerçeve STEP açılınca ister (açılışta değil); yükleme hatası anlaşılır iletiyle çerçeveye döner.
        try { return await stepOkuyucuYukle(); } catch { throw new Error(STEP_HATASI); }
      case 'emirler':
        return api.get<EmirlerCevabi>('/cnc-kurulum/emirler');
      case 'hazirlik':
        return api.get<HazirlikCevabi>('/cnc-kurulum/hazirlik');
      case 'model-aktar': {
        if (!model?.modelGeldi) break;
        if (!(v['glb'] instanceof Uint8Array) || v['glb'].length === 0) throw new Error('Geçersiz model.');
        const no = typeof v['no'] === 'string' && v['no'] !== '' ? v['no'] : null;
        return model.modelGeldi({ makineId: metin(v['makineId'], 'makine'), no, ad: metin(v['ad'], 'ad'), glb: v['glb'] });
      }
      case 'model-hatasi':
        if (!model?.modelHatasi) break;
        return model.modelHatasi(typeof v['ileti'] === 'string' ? v['ileti'] : 'Model üretilemedi.', typeof v['makineId'] === 'string' ? v['makineId'] : null);
      case 'makine-listesi': {
        if (!model?.listeGeldi) break;
        if (!Array.isArray(v['makineler'])) throw new Error('Geçersiz makine listesi.');
        const liste = (v['makineler'] as unknown[]).map((x) => {
          const m = nesne(x);
          return { makineId: metin(m['makineId'], 'makine'), no: typeof m['no'] === 'string' && m['no'] !== '' ? m['no'] : null, ad: metin(m['ad'], 'ad') };
        });
        return model.listeGeldi(liste);
      }
      case 'toplu-ac':
        if (!model?.topluAc) break;
        return model.topluAc(typeof v['makineId'] === 'string' && v['makineId'] !== '' ? v['makineId'] : null);
      default:
        break;
    }
    throw new Error(`Bilinmeyen istek: ${tip}`);
  };
}

// Sunucu iletisi ve durum kodu çerçeveye taşınır (köprü çatışmayı ve büyük kaydı durum koduyla ayırır); ağ hatasının tarayıcı
// metni gösterilmez.
export function kopruHatasi(hata: unknown): KopruHatasi {
  if (hata instanceof ApiHatasi) return { hata: hata.sunucuIletisi ?? 'İşlem yapılamadı.', durum: hata.durum };
  if (hata instanceof Error && /^(Geçersiz|Bilinmeyen)/.test(hata.message)) return { hata: hata.message, durum: 400 };
  if (hata instanceof Error && hata.message === STEP_HATASI) return { hata: hata.message, durum: 503 };
  return { hata: 'Sunucuya ulaşılamadı. Bağlantıyı denetleyip yeniden deneyin.', durum: 0 };
}

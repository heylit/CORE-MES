import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { AdimliEmirAyrintisi, AdimliEmirCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';

// Emir komutları (kart #1185): prototipin emir eylemleri sahibi modüllerin VAR OLAN uçlarına gider. Emir yalnız yürürlükteki rota
// revizyonundan açılır: prototip revizyon seçmez, köprü ürünün yürürlükteki revizyonunu kendisi okur. Emrin sürümü ekranın yüklediği
// değerdir (girdi `surum`): yazmadan önce okunsaydı arada başka yerde yapılan değişiklik ezilirdi. Kural, yetki ve sürüm denetimi
// sahibindedir (uç reddederse iletisi çerçeveye taşınır).
// Bölme, kol ve geri katma kuralları Üretim Emirleri'nindir: köprü yalnız prototipin adım sırasını sahibinin adımına (sıra, op numarası)
// çevirir, uygunluğa sahibinin ucu karar verir.
type Nesne = Record<string, unknown>;
type Adim = AdimliEmirAyrintisi['isEmirleri'][number];
export interface EmirHazirKomut { yol: string; govde: Nesne; tekrarKorumali?: boolean }
export interface EmirKomutu { hazirla: (girdi: Nesne) => Promise<EmirHazirKomut> }

const sirala = <T extends { sira: number }>(l: readonly T[]): T[] => [...l].sort((a, b) => a.sira - b.sira);
const siradaki = (d: AdimliEmirAyrintisi, sira: number): Adim | undefined => d.isEmirleri.find((a) => a.sira === sira);

const hata = (durum: number, mesaj: string): ApiHatasi => new ApiHatasi(durum, { kod: durum === 404 ? 'BULUNAMADI' : 'GECERSIZ', mesaj });
const kimlik = (v: unknown, alan: string): number => {
  const sayi = typeof v === 'string' && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : v;
  if (typeof sayi !== 'number' || !Number.isInteger(sayi) || sayi <= 0 || sayi > 2_147_483_647) throw new Error(`Geçersiz ${alan}.`);
  return sayi;
};
const tarih = (v: unknown, alan: string): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`Geçersiz ${alan}.`);
  return v;
};
const pozitifAdet = (v: unknown, alan: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`Geçersiz ${alan}: tam sayı olmalı.`);
  return v;
};
const ekranSurumu = (girdi: Nesne): number => {
  const v = girdi['surum'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw hata(422, 'Emrin ekrandaki sürümü bilinmiyor; ekranı yenileyin.');
  return v;
};
// Süre ondalık metindir; boş alan null (sıfır uydurulmaz).
const sure = (v: unknown, alan: string): string | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{1,6}(\.\d{1,4})?$/.test(v)) throw new Error(`Geçersiz ${alan}: sıfır ya da pozitif sayı olmalı.`);
  return v;
};
const adimAdi = (v: unknown): string => {
  if (typeof v !== 'string' || v.trim() === '') throw hata(422, 'Adım adı zorunlu.');
  return v.trim();
};
// Kola konan rework, tamir ya da ek adım (185 a, 191 a). Ekran yeri adım sırasıyla verir (sonra: o sıradaki adımdan sonra, null: kolun başı);
// aynı yere konan ikinci ek öncekinin arkasına girer. Op numarası komşuların arasından önerilir (PartiPaneli onerilenOpNo); arada yer
// yoksa ekran OP numaralarını açmadığı için burada reddedilir.
const EK_TURLERI = ['rework', 'tamir', 'ek'];
function kolaEkAdimlar(v: unknown, d: AdimliEmirAyrintisi, bolunenSira: number, birlesmeOpNo: number | null): Nesne[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error('Geçersiz ek adımlar.');
  const sirali = sirala(d.isEmirleri);
  const birlesme = birlesmeOpNo === null ? undefined : sirali.find((a) => a.opNo === birlesmeOpNo);
  const kol = sirali.filter((a) => a.sira >= bolunenSira && (birlesme === undefined || a.sira < birlesme.sira));
  const taban = sirali.filter((a) => a.sira < bolunenSira).at(-1)?.opNo ?? 0;
  const oplar = kol.map((a) => a.opNo);
  const sonEk = new Map<number | null, number>();
  return v.map((e: unknown, i) => {
    const g = (typeof e === 'object' && e !== null ? e : {}) as Nesne;
    const tur = g['tur'];
    if (typeof tur !== 'string' || !EK_TURLERI.includes(tur)) throw new Error(`Geçersiz ek adım ${String(i + 1)} türü.`);
    let yer: number | null = null;
    if (g['sonra'] !== null && g['sonra'] !== undefined) {
      const a = kol.find((x) => x.sira === pozitifAdet(g['sonra'], 'ek adım yeri'));
      if (a === undefined) throw hata(422, `Ek adım ${String(i + 1)} kolun adımlarından birinin arkasına konmalı.`);
      yer = a.opNo;
    }
    const onceki = sonEk.get(yer) ?? yer;
    const alt = onceki ?? taban;
    const sonraki = oplar.filter((o) => o > alt).sort((a, b) => a - b)[0] ?? birlesmeOpNo ?? alt + 20;
    const opNo = Math.floor((alt + sonraki) / 2);
    if (opNo <= alt) throw hata(422, `Ek adım ${String(i + 1)} için OP ${String(alt)} ile OP ${String(sonraki)} arasında boş numara yok.`);
    sonEk.set(yer, opNo);
    oplar.push(opNo);
    const aciklama = typeof g['aciklama'] === 'string' ? g['aciklama'].trim() : '';
    return {
      oncekiOpNo: onceki, opNo, tur, ad: adimAdi(g['ad']), operasyonTipiId: kimlik(g['operasyonTipiId'], 'operasyon'), kaynak: null,
      ayarSuresiDk: sure(g['ayarSuresiDk'], 'hazırlık süresi'), birimSureDk: sure(g['birimSureDk'], 'birim süre'), terminGun: null, aciklama: aciklama === '' ? null : aciklama,
    };
  });
}

// Hatalı parçanın rework adımı (1034): kaynak iç (makine ya da kişi) ya da fason firmadır; iç kaynakta süre, fasonda termin günü gider
// (boş termin sahibinde 7 gündür). Kaynak seçilmezse adım atanmamış kalır.
const KAYNAK_TURLERI = ['makine', 'kisi', 'fason'];
function reworkKaynagi(v: unknown): { tur: string; id: number } | null {
  if (v === null || v === undefined) return null;
  const g = (typeof v === 'object' ? v : {}) as Nesne;
  if (typeof g['tur'] !== 'string' || !KAYNAK_TURLERI.includes(g['tur'])) throw new Error('Geçersiz kaynak türü.');
  return { tur: g['tur'], id: kimlik(g['id'], 'kaynak') };
}
const terminGunu = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 365) throw hata(422, 'Termin 1-365 gün olmalı.');
  return n;
};

// Düğüm yolu "0.1.2" biçimindedir; biçim ve varlık sahibinin ucunda denetlenir, burada yalnız dizi ve metin olduğu.
const dugumYollari = (v: unknown): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) throw new Error('Geçersiz stoktan düğüm listesi.');
  return v;
};

const emirOku = async (id: number): Promise<AdimliEmirAyrintisi> => (await api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(id)}`)).emir;

export const EMIR_KOMUTLARI: Readonly<Record<string, EmirKomutu>> = {
  // Üretim emri aç: ürünün yürürlükteki revizyonundan (POST /rota/revizyonlar/:id/emre-kopyala). Yürürlükte rota yoksa açılmaz;
  // ekran açıkça rotasız isterse emir malzemeli ve adımsız açılır (POST /adimli-emirler/rotasiz, ayara bağlı), adımları sonra eklenir.
  'emir-ac': {
    hazirla: async (girdi) => {
      const urunId = kimlik(girdi['itemId'], 'ürün');
      const emirTuru = typeof girdi['tur'] === 'string' && girdi['tur'] !== '' ? girdi['tur'] : undefined;
      const adet = pozitifAdet(girdi['qty'], 'miktar');
      const oncelik = girdi['priority'] === undefined ? undefined : pozitifAdet(girdi['priority'], 'öncelik');
      // Proje ve satır köprünün seçim penceresinden gelir (224); ekran bunları göndermez.
      const baglam = {
        ...(girdi['projeId'] === undefined ? {} : { projeId: kimlik(girdi['projeId'], 'proje') }),
        ...(girdi['siparisSatiriId'] === undefined ? {} : { siparisSatiriId: kimlik(girdi['siparisSatiriId'], 'sipariş satırı') }),
      };
      if (girdi['rotasiz'] === true) {
        const aciklama = typeof girdi['note'] === 'string' && girdi['note'].trim() !== '' ? girdi['note'].trim() : null;
        return {
          yol: '/adimli-emirler/rotasiz',
          govde: {
            malzemeNo: urunId, adet, teslim: tarih(girdi['due'], 'teslim'), baslangic: tarih(girdi['start'], 'başlangıç'), aciklama,
            ...(oncelik === undefined ? {} : { oncelik }), ...(emirTuru === undefined ? {} : { emirTuru }), ...(girdi['taslak'] === true ? { taslak: true } : {}), ...baglam,
          },
          tekrarKorumali: true,
        };
      }
      const rotalar = await api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${String(urunId)}`);
      const yururlukte = rotalar.revizyonlar.find((r) => r.durum === 'yururlukte');
      if (yururlukte === undefined) throw hata(422, 'Ürünün yürürlükte rotası yok; emir yalnız yürürlükteki rotadan açılır.');
      const not = typeof girdi['note'] === 'string' && girdi['note'].trim() !== '' ? girdi['note'].trim() : null;
      return {
        yol: `/rota/revizyonlar/${String(yururlukte.id)}/emre-kopyala`,
        govde: {
          adet, teslim: tarih(girdi['due'], 'teslim'), baslangic: tarih(girdi['start'], 'başlangıç'), aciklama: not,
          ...(oncelik === undefined ? {} : { oncelik }), ...(girdi['taslak'] === true ? { taslak: true } : {}),
          ...(girdi['rezerve'] === true ? { stoktanRezerve: true } : {}), ...(emirTuru === undefined ? {} : { emirTuru }), ...baglam,
          // 1476-F: tek emir çok katmanlı reçetenin tamamını taşır; stoktan karşılanacak düğümler emre girmez (1483 a).
          ...(girdi['cokKatmanli'] === true ? { cokKatmanli: true, stoktanDugumler: dugumYollari(girdi['stoktanDugumler']) } : {}),
        },
        tekrarKorumali: true,
      };
    },
  },
  'emir-serbest': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      return { yol: `/adimli-emirler/${String(id)}/plana-al`, govde: { surum: ekranSurumu(girdi) } };
    },
  },
  // Rotayı güncelle (kullanıcı kararı 15.10.2026): emir açıldıktan sonra rotaya eklenen adım, emrin iş emirlerine yürürlükteki revizyondan
  // eklenir (POST /rota/emirler/:id/yururlukteki-rotayi-uygula). Başlamış ya da bitmiş adım değişmez; yeni adım onların önüne düşüyorsa
  // sahibi reddeder. Kendiliğinden yapılmaz, emir başına düğmeyle.
  'emir-rota-guncelle': {
    hazirla: async (girdi) => ({ yol: `/rota/emirler/${String(kimlik(girdi['id'], 'emir'))}/yururlukteki-rotayi-uygula`, govde: {}, tekrarKorumali: true }),
  },
  'emir-iptal': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      return { yol: `/adimli-emirler/${String(id)}/iptal`, govde: { surum: ekranSurumu(girdi) } };
    },
  },
  // Rotasız emrin adımları (kullanıcı kararı 2026-10-14): adımlar emrin kendisindedir, burada eklenir, düzenlenir, silinir. Kaynak
  // atanmaz (plan ve terminal adim-kaynagi ile atar); yer, op numarası ve durum kuralları sahibindedir.
  'emir-adim-ekle': {
    hazirla: async (girdi) => ({
      yol: `/adimli-emirler/${String(kimlik(girdi['id'], 'emir'))}/adim-ekle`,
      govde: {
        oncekiOpNo: girdi['oncekiOpNo'] === null || girdi['oncekiOpNo'] === undefined ? null : kimlik(girdi['oncekiOpNo'], 'önceki adım'),
        opNo: kimlik(girdi['opNo'], 'op numarası'), ad: adimAdi(girdi['ad']), operasyonTipiId: kimlik(girdi['operasyonTipiId'], 'operasyon'), kaynak: null,
        ayarSuresiDk: sure(girdi['ayarSuresiDk'], 'hazırlık süresi'), birimSureDk: sure(girdi['birimSureDk'], 'birim süre'), terminGun: null, surum: ekranSurumu(girdi),
      },
      tekrarKorumali: true,
    }),
  },
  'emir-adim-duzenle': {
    hazirla: async (girdi) => ({
      yol: `/adimli-emirler/${String(kimlik(girdi['id'], 'emir'))}/adim-duzenle`,
      govde: {
        opNo: kimlik(girdi['opNo'], 'op numarası'), ad: adimAdi(girdi['ad']), operasyonTipiId: kimlik(girdi['operasyonTipiId'], 'operasyon'),
        ayarSuresiDk: sure(girdi['ayarSuresiDk'], 'hazırlık süresi'), birimSureDk: sure(girdi['birimSureDk'], 'birim süre'), surum: ekranSurumu(girdi),
      },
    }),
  },
  'emir-adim-sil': {
    hazirla: async (girdi) => ({
      yol: `/adimli-emirler/${String(kimlik(girdi['id'], 'emir'))}/adim-sil`,
      govde: { opNo: kimlik(girdi['opNo'], 'op numarası'), surum: ekranSurumu(girdi) },
    }),
  },
  // Parti bölme: adet ayrılır; kolN/kolM verilirse kol ayrılma adımından (kolN. adımdan sonra) katılma adımına (kolM. adım) yürür.
  // Verilmezse bölünebilen ilk adımdan bütün rota yeni partiye geçer.
  'emir-bol': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const adet = pozitifAdet(girdi['adet'], 'adet');
      const d = await emirOku(id);
      const kol = girdi['kolN'] !== undefined && girdi['kolN'] !== null;
      // Kolsuz parti emrin bulunduğu adımdan (bitmemiş ilk adım) ayrılır; bitmemiş adım yoksa son adım gider ve sahibi reddeder.
      const sirali = sirala(d.isEmirleri);
      const adimSira = kol ? pozitifAdet(girdi['kolN'], 'ayrılma adımı') + 1 : (sirali.find((a) => a.durum !== 'tamam') ?? sirali.at(-1))?.sira;
      if (adimSira === undefined) throw hata(422, 'Emrin adımı yok; önce adım ekleyin.');
      let birlesmeOpNo: number | null = null;
      if (kol) {
        const katilma = siradaki(d, pozitifAdet(girdi['kolM'], 'katılma adımı'));
        if (katilma === undefined) throw hata(422, 'Kolun katılma adımı bu emirde yok.');
        birlesmeOpNo = katilma.opNo;
      }
      const ekAdimlar = kolaEkAdimlar(girdi['ekAdimlar'], d, adimSira, birlesmeOpNo);
      return {
        yol: `/adimli-emirler/${String(id)}/bol`, govde: { adimSira, adet, surum: ekranSurumu(girdi), birlesmeOpNo, ...(ekAdimlar.length ? { ekAdimlar } : {}) },
        tekrarKorumali: true,
      };
    },
  },
  // Kolun katılma adımını değiştirir (null: birleşme planı kalkar). Adım ana emrin adımıdır (op numarası ana emrin iş emrinden gelir).
  'emir-katilma': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const d = await emirOku(id);
      const ustId = d.parti?.ustEmirId ?? null;
      if (ustId === null) throw hata(422, 'Bu emir bir alt emir değil.');
      let birlesmeOpNo: number | null = null;
      if (girdi['m'] !== null && girdi['m'] !== undefined) {
        const adim = siradaki(await emirOku(ustId), pozitifAdet(girdi['m'], 'katılma adımı'));
        if (adim === undefined) throw hata(422, 'Katılma adımı ana emirde yok.');
        birlesmeOpNo = adim.opNo;
      }
      return { yol: `/adimli-emirler/${String(id)}/birlesme-plani`, govde: { birlesmeOpNo, surum: ekranSurumu(girdi) }, tekrarKorumali: true };
    },
  },
  // 1034: kalite "rework" dedikten sonra planlama kolun bekleyen rework adımını doldurur (Üretim Emirleri). Şartnamesi ayrı komutla
  // sabitlenir (Rota); ekran ikisini art arda gönderir, ikincisi ilkinin döndürdüğü emir sürümüyle.
  'emir-rework-adimi': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const isEmriId = kimlik(girdi['isEmriId'], 'iş emri');
      const kaynak = reworkKaynagi(girdi['kaynak']);
      const fason = kaynak?.tur === 'fason';
      const aciklama = typeof girdi['aciklama'] === 'string' ? girdi['aciklama'].trim() : '';
      return {
        yol: `/adimli-emirler/${String(id)}/is-emirleri/${String(isEmriId)}/rework-adimi`,
        govde: {
          ad: adimAdi(girdi['ad']), operasyonTipiId: kimlik(girdi['operasyonTipiId'], 'operasyon'), kaynak,
          ayarSuresiDk: fason ? null : sure(girdi['ayarSuresiDk'], 'hazırlık süresi'), birimSureDk: fason ? null : sure(girdi['birimSureDk'], 'birim süre'),
          terminGun: fason ? terminGunu(girdi['terminGun']) : null, aciklama: aciklama === '' ? null : aciklama, surum: ekranSurumu(girdi),
        },
        tekrarKorumali: true,
      };
    },
  },
  'emir-rework-sartname': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const isEmriId = kimlik(girdi['isEmriId'], 'iş emri');
      const liste = girdi['sartnameler'];
      if (!Array.isArray(liste)) throw new Error('Geçersiz şartname listesi.');
      const sartnameler = liste.map((x: unknown) => {
        const g = (typeof x === 'object' && x !== null ? x : {}) as Nesne;
        const degerler = g['degerler'];
        if (typeof degerler !== 'object' || degerler === null || Array.isArray(degerler)) throw new Error('Geçersiz şartname değerleri.');
        return { sartnameId: kimlik(g['sartnameId'], 'şartname'), degerler };
      });
      return { yol: `/rota/emirler/${String(id)}/is-emirleri/${String(isEmriId)}/sartnameler`, govde: { surum: ekranSurumu(girdi), sartnameler }, tekrarKorumali: true };
    },
  },
  // Alt emri ana emre geri katar: kaynak alt emir kapanır, adedi ana emre geçer. Hedefin sürümü yazmadan önce okunur: ekran ana emrin
  // sürümünü komuta koymaz.
  'emir-birlestir': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const d = await emirOku(id);
      const ustId = d.parti?.ustEmirId ?? null;
      if (ustId === null) throw hata(422, 'Bu emir bir alt emir değil.');
      const hedef = await emirOku(ustId);
      return {
        yol: `/adimli-emirler/${String(hedef.id)}/birlestir`, govde: { kaynakEmirId: d.id, surum: hedef.surum, kaynakSurum: ekranSurumu(girdi) }, tekrarKorumali: true,
      };
    },
  },
};

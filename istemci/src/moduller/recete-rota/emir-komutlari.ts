import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { AdimliEmirAyrintisi, AdimliEmirCevabi, AdimliEmirOzeti, AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';

// Emir komutları (kart #1185): prototipin emir eylemleri sahibi modüllerin VAR OLAN uçlarına gider. Emir yalnız yürürlükteki rota
// revizyonundan açılır: prototip revizyon seçmez, köprü ürünün yürürlükteki revizyonunu kendisi okur. Emrin sürümü ekranın yüklediği
// değerdir (girdi `surum`): yazmadan önce okunsaydı arada başka yerde yapılan değişiklik ezilirdi. Kural, yetki ve sürüm denetimi
// sahibindedir (uç reddederse iletisi çerçeveye taşınır).
// Parti kuralları (bolunebilirAdimlar, birlesmeAdaylari, birlesmeHedefleri) rota ekranındaki PartiPaneli'nin kurallarıdır; burada kopya,
// çünkü bir modül ötekinin ekran kodunu ithal etmez. Sunucu aynı kuralı uygular; fark çıkarsa sunucunun reddi geçerlidir.
type Nesne = Record<string, unknown>;
type Adim = AdimliEmirAyrintisi['isEmirleri'][number];
export interface EmirHazirKomut { yol: string; govde: Nesne; tekrarKorumali?: boolean }
export interface EmirKomutu { hazirla: (girdi: Nesne) => Promise<EmirHazirKomut> }

const ACIK = ['taslak', 'planli', 'basladi'];
const sirala = <T extends { sira: number }>(l: readonly T[]): T[] => [...l].sort((a, b) => a.sira - b.sira);
const turu = (a: { tur?: string | undefined }): string => a.tur ?? 'rota';

// Bölünen adım ve sonrakiler başlamamışsa her adımdan bölünür; önceki adımların bitmesi gerekmez.
export function bolunebilirAdimlar(d: AdimliEmirAyrintisi): Adim[] {
  if (!ACIK.includes(d.durum) || d.arsiv) return [];
  const sirali = sirala(d.isEmirleri);
  return sirali.filter((_a, i) => sirali.slice(i).every((x) => x.durum === 'bekliyor'));
}

// Kolun planlı birleşme adımı: bölünen adımdan sonra gelen ve başlamamış adımlar.
export const birlesmeAdaylari = (d: AdimliEmirAyrintisi, adimSira: number): Adim[] => bolunebilirAdimlar(d).filter((a) => a.sira > adimSira);

// Alt parti üst emrine ya da aynı adımdan bölünmüş kardeşine birleşir; kendi alt partisi açıksa birleşmez. Kalan adımlar rotadan gelmeli ve
// bekliyor olmalı; iki taraf aynı op numarasında beklemeli.
export function birlesmeHedefleri(d: AdimliEmirAyrintisi, emirler: readonly AdimliEmirOzeti[]): AdimliEmirOzeti[] {
  const p = d.parti;
  if (!p || p.ustEmirId === null || p.altEmirIdleri.length > 0 || !ACIK.includes(d.durum) || d.arsiv) return [];
  const kalan = sirala(d.isEmirleri).filter((a) => a.durum !== 'tamam');
  const ilk = kalan[0];
  if (ilk === undefined || kalan.some((a) => a.durum !== 'bekliyor' || turu(a) !== 'rota')) return [];
  return emirler.filter((e) => e.id !== d.id && ACIK.includes(e.durum) && !e.arsiv
    && (e.id === p.ustEmirId || (e.parti?.ustEmirId === p.ustEmirId && e.parti.bolunmeSira === p.bolunmeSira))
    && (e.durum === 'taslak') === (d.durum === 'taslak')
    && e.siradaki?.durum === 'bekliyor' && e.siradaki.opNo === ilk.opNo);
}

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
      const adaylar = bolunebilirAdimlar(d);
      const kol = girdi['kolN'] !== undefined && girdi['kolN'] !== null;
      const adim = kol ? adaylar.find((a) => a.sira === pozitifAdet(girdi['kolN'], 'ayrılma adımı') + 1) : adaylar[0];
      if (adim === undefined) throw hata(422, 'Bu emir bu adımdan bölünemez: bölünen adım ve sonrası başlamamış olmalı.');
      let birlesmeOpNo: number | null = null;
      if (kol) {
        const katilma = birlesmeAdaylari(d, adim.sira).find((a) => a.sira === pozitifAdet(girdi['kolM'], 'katılma adımı'));
        if (katilma === undefined) throw hata(422, 'Kolun katılma adımı bölünen adımdan sonra gelen, başlamamış bir adım olmalı.');
        birlesmeOpNo = katilma.opNo;
      }
      const ekAdimlar = kolaEkAdimlar(girdi['ekAdimlar'], d, adim.sira, birlesmeOpNo);
      return {
        yol: `/adimli-emirler/${String(id)}/bol`, govde: { adimSira: adim.sira, adet, surum: ekranSurumu(girdi), birlesmeOpNo, ...(ekAdimlar.length ? { ekAdimlar } : {}) },
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
        const ana = await emirOku(ustId);
        const adim = birlesmeAdaylari(ana, 0).find((a) => a.sira === pozitifAdet(girdi['m'], 'katılma adımı'));
        if (adim === undefined) throw hata(422, 'Katılma adımı ana emirde başlamamış bir adım olmalı.');
        birlesmeOpNo = adim.opNo;
      }
      return { yol: `/adimli-emirler/${String(id)}/birlesme-plani`, govde: { birlesmeOpNo, surum: ekranSurumu(girdi) }, tekrarKorumali: true };
    },
  },
  // Alt emri ana emre (ya da aynı adımdan bölünmüş kardeşine) geri katar: kaynak alt emir kapanır, adedi hedefe geçer.
  'emir-birlestir': {
    hazirla: async (girdi) => {
      const id = kimlik(girdi['id'], 'emir');
      const d = await emirOku(id);
      const liste = (await api.get<AdimliListeCevabi>('/adimli-emirler')).emirler;
      const hedefler = birlesmeHedefleri(d, liste);
      const hedef = hedefler.find((e) => e.id === d.parti?.ustEmirId) ?? hedefler[0];
      if (hedef === undefined) throw hata(422, 'Bu alt emir şu an geri katılamaz: kalan adımları başlamamış ve ana emirle aynı adımda bekliyor olmalı.');
      return {
        yol: `/adimli-emirler/${String(hedef.id)}/birlestir`, govde: { kaynakEmirId: d.id, surum: hedef.surum, kaynakSurum: ekranSurumu(girdi) }, tekrarKorumali: true,
      };
    },
  },
};

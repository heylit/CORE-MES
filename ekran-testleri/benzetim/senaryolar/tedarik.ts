import { randomUUID } from 'node:crypto';
import { senaryo } from '../senaryo.ts';
import type { Rastgele } from '../tohum.ts';
import type { AdimCiktisi, SenaryoBaglami } from '../senaryo.ts';
import type { Hesap } from '../../hesaplar.ts';

// Akış C (S2): talep -> satın alma teklif ve karar -> müdür onayı ya da reddi -> sipariş -> mal kabul -> stok hareketi.
// Teklif, karar ve sipariş satın almacının hesabıyla girilir; yetkisi yetmeyen adım reddedilir ve bulgu olur, yöneticiye geçilmez.
// Dört göz kuralı kararı vereni onaydan dışlar: karar satın almacının, onay müdürün olduğu için kural işler.
// Uç yolları ve gövdeler `npm run harita -- --modul satin-alma` ve `--modul stok` çıktısından ve paylasilan/sozlesme'den okunmuştur.
const TALEP_EDEN = 'ornek.depo';
const SATIN_ALMA = 'ornek.satinalma';
const ONAYLAYAN = 'ornek.mudur';
const DEPO = 'ornek.depo';

type Yontem = 'GET' | 'POST';
type Nesne = Record<string, unknown>;

const kisa = (d: unknown): string => {
  const m = typeof d === 'string' ? d : JSON.stringify(d) ?? String(d);
  return m.length > 300 ? `${m.slice(0, 300)}...` : m;
};
const nesneMi = (d: unknown): d is Nesne => typeof d === 'object' && d !== null && !Array.isArray(d);
function nesne(d: unknown, ad: string): Nesne {
  if (!nesneMi(d)) throw new Error(`${ad} nesne değil: ${kisa(d)}`);
  return d;
}
function dizi(d: unknown, ad: string): unknown[] {
  if (!Array.isArray(d)) throw new Error(`${ad} dizi değil: ${kisa(d)}`);
  return d;
}
function metin(d: unknown, ad: string): string {
  if (typeof d !== 'string') throw new Error(`${ad} metin değil: ${kisa(d)}`);
  return d;
}
function tamSayi(d: unknown, ad: string): number {
  if (typeof d !== 'number' || !Number.isInteger(d)) throw new Error(`${ad} tam sayı değil: ${kisa(d)}`);
  return d;
}
function esit(gelen: unknown, beklenen: unknown, ad: string): void {
  if (gelen !== beklenen) throw new Error(`${ad}: beklenen ${kisa(beklenen)}, gelen ${kisa(gelen)}`);
}

// Talep satın almanın sözleşmesindeki bütün (talepSemasi); senaryo yalnız okuduğu alanları denetler, gerisini geri gönderir.
export type Talep = Nesne & { id: string; durum: string; surum: number };
export function talepOku(d: unknown): Talep {
  const t = nesne(d, 'talep');
  metin(t['id'], 'talep.id');
  metin(t['durum'], 'talep.durum');
  tamSayi(t['surum'], 'talep.surum');
  dizi(t['kalemler'], 'talep.kalemler');
  dizi(t['onaylar'], 'talep.onaylar');
  return t as Talep;
}

// Kayıt gövdesi: sunucunun verdiği alanlar (no, ad, tarihler) atılır; sürüm beklenen sürüm olarak kalır.
const SUNUCU_ALANLARI = ['no', 'talepEdenAdi', 'acanKisiId', 'olusturma', 'guncelleme'] as const;
export function kayitGovdesi(t: Talep, degisen: Nesne = {}): Nesne {
  const g: Nesne = { ...t };
  for (const a of SUNUCU_ALANLARI) delete g[a];
  return { ...g, ...degisen };
}

export interface Kart { no: number; kod: string; birim: string }
// Talepte seçilebilen aktif, birimli kart; liste boşsa örnek veri yüklenmemiştir.
export function kartSec(d: unknown, r: Rastgele): Kart {
  const liste = dizi(nesne(d, 'malzeme seçenekleri')['malzemeler'], 'malzemeler').filter(nesneMi)
    .filter((m) => typeof m['no'] === 'number' && typeof m['birim'] === 'string' && m['birim'].trim() !== '');
  if (liste.length === 0) throw new Error('Talepte seçilecek aktif, birimli malzeme kartı yok (örnek veri yüklü mü?)');
  const m = r.sec(liste);
  return { no: m['no'] as number, kod: String(m['kod']), birim: m['birim'] as string };
}

const kalemIdleri = (t: Talep): string[] => dizi(t['kalemler'], 'talep.kalemler').map((k, i) => metin(nesne(k, `kalem ${String(i)}`)['id'], 'kalem.id'));
const fiyat = (r: Rastgele): string => `${String(r.aralik(5, 900))}.${String(r.aralik(0, 99)).padStart(2, '0')}`;

// Teklif sözleşmesi (teklifSemasi): tedarikçi kartsız, adı uydurma; her kaleme fiyat verilir.
export function teklifKur(t: Talep, r: Rastgele, bugun: string): Nesne {
  return {
    id: randomUUID(), firmaId: null, tedarikciAdi: r.kod('tedarikci'), teklifTarihi: bugun, gecerlilik: null, paraBirimi: 'TRY', kur: null,
    iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: r.aralik(1, 30), vadeGun: 30,
    avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0,
    fiyatlar: kalemIdleri(t).map((kalemId) => ({ kalemId, birimFiyat: fiyat(r) })),
  };
}
export function kararKur(teklifId: string, kararVeren: number, bugun: string): Nesne {
  return { mod: 'tek', teklifId, bolunme: [], gerekce: 'Tek teklif', kararVerenKisiId: kararVeren, kararTarihi: bugun, ogrenilenler: '', sabitKurlar: [], siparisler: [] };
}
// Onay ve ret yalnız eklenir; kişi ve zaman sunucunundur.
export function onayEkle(t: Talep, sonuc: 'onay' | 'ret', notlar: string): Nesne {
  const onay = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc, dortGozsuz: false, notlar };
  return kayitGovdesi(t, { onaylar: [...dizi(t['onaylar'], 'talep.onaylar'), onay], ...(sonuc === 'ret' ? { durum: 'degerlendirme' } : {}) });
}
export function siparisEkle(t: Talep, siparisNo: string, bugun: string): Nesne {
  const karar = nesne(t['karar'], 'talep.karar');
  const teklifId = metin(karar['teklifId'], 'karar.teklifId');
  return kayitGovdesi(t, { durum: 'siparis_verildi', karar: { ...karar, siparisler: [{ teklifId, siparisNo, siparisTarihi: bugun, beklenenTeslim: null }] } });
}

export function talepBul(acilis: unknown, id: string): Talep {
  const t = dizi(nesne(acilis, 'açılış')['talepler'], 'talepler').find((x) => nesneMi(x) && x['id'] === id);
  if (t === undefined) throw new Error(`Talep açılışta yok: ${id}`);
  return talepOku(t);
}
export function siparisSatirIdsi(t: Talep): number {
  const siparisler = dizi(nesne(t['karar'], 'talep.karar')['siparisler'], 'karar.siparisler');
  esit(siparisler.length, 1, 'sipariş sayısı');
  const satirlar = dizi(nesne(siparisler[0], 'sipariş')['satirlar'], 'sipariş.satirlar');
  esit(satirlar.length, 1, 'sipariş satırı sayısı');
  return tamSayi(nesne(satirlar[0], 'sipariş satırı')['id'], 'sipariş satırı.id');
}
export interface AcikSatir { id: number; malzemeId: number; kalanMiktar: string }
export function acikSatirBul(d: unknown, satirId: number): AcikSatir {
  const s = dizi(nesne(d, 'açık sipariş satırları')['satirlar'], 'satirlar').find((x) => nesneMi(x) && x['id'] === satirId);
  if (s === undefined) throw new Error(`Sipariş satırı mal kabul listesinde yok: ${String(satirId)}`);
  const n = nesne(s, 'açık satır');
  return { id: satirId, malzemeId: tamSayi(n['malzemeId'], 'açık satır.malzemeId'), kalanMiktar: metin(n['kalanMiktar'], 'açık satır.kalanMiktar') };
}
export function talepNoAcikMi(d: unknown, talepNo: string): boolean {
  return dizi(nesne(d, 'açık sipariş satırları')['satirlar'], 'satirlar').some((x) => nesneMi(x) && x['talepNo'] === talepNo);
}
export function girisHareketiDenetle(d: unknown, hareketId: number, miktar: string): void {
  const h = dizi(nesne(d, 'hareketler')['satirlar'], 'satirlar').find((x) => nesneMi(x) && x['id'] === hareketId);
  if (h === undefined) throw new Error(`Mal kabulün hareketi listede yok: ${String(hareketId)}`);
  const n = nesne(h, 'hareket');
  esit(n['tur'], 'giris', 'hareket türü');
  esit(n['girisKaynagi'], 'mal_kabul', 'giriş kaynağı');
  esit(Number(n['miktar']), Number(miktar), 'hareket miktarı');
}
export function talebimDurumu(d: unknown, id: string): string {
  const t = dizi(nesne(d, 'taleplerim')['talepler'], 'talepler').find((x) => nesneMi(x) && x['id'] === id);
  if (t === undefined) throw new Error(`Talep "Taleplerim"de yok: ${id}`);
  return metin(nesne(t, 'talebim')['durum'], 'talebim.durum');
}

// İkinci kopya reddedilen talep yolunu yürür: her gün iki yol da koşar.
export const retYoluMu = (kopya: number): boolean => kopya % 2 === 0;

// Tek adım: istek, durum kodu ve gövde denetimi aynı satırda. Okuma bir kez yeniden denenir, yazma denenmez.
async function cagir<T>(b: SenaryoBaglami, rol: Hesap, ad: string, yontem: Yontem, yol: string, govde: unknown,
  coz: (g: unknown) => T, beklenen = 200): Promise<T | null> {
  const kutu: { deger: T | null } = { deger: null };
  const gecti = await b.adim(rol, ad, async (): Promise<AdimCiktisi> => {
    const c = await b.rol(rol).istek(yontem, yol, govde);
    const ortak = { yontem, yol, beklenen: String(beklenen), gelen: String(c.durum) };
    if (c.durum !== beklenen) return { ...ortak, sonuc: 'dustu', ileti: kisa(c.govde) };
    try {
      kutu.deger = coz(c.govde);
      return ortak;
    } catch (hata) {
      return { ...ortak, sonuc: 'dustu', ileti: hata instanceof Error ? hata.message : String(hata) };
    }
  }, { tekrarlanabilir: yontem === 'GET' });
  return gecti ? kutu.deger : null;
}

const kaydetYolu = (id: string): string => `/api/satin-alma-talepleri/${id}/kaydet`;

export default senaryo({
  ad: 'tedarik',
  roller: [TALEP_EDEN, SATIN_ALMA, ONAYLAYAN],
  kopya: 2,
  async kos(b) {
    const r = b.rastgele;
    const bugun = new Date().toISOString().slice(0, 10);
    const ret = retYoluMu(b.kopya);

    const kart = await cagir(b, TALEP_EDEN, 'malzeme kartı seç', 'GET', '/api/satin-alma-malzeme-secenekleri?tur=malzeme', undefined, (g) => kartSec(g, r));
    if (kart === null) return;
    const talepId = randomUUID();
    const miktar = String(r.aralik(1, 40));
    const acilan = await cagir(b, TALEP_EDEN, 'talep aç', 'POST', '/api/satin-alma-talepleri/hizli-ac', {
      id: talepId, tur: 'malzeme', ihtiyacTarihi: null, aciklama: r.kod('talep'),
      kalemler: [{ malzemeNo: kart.no, ad: '', birim: '', miktar, aciklama: '' }],
    }, (g) => {
      const t = nesne(g, 'talebim');
      esit(t['id'], talepId, 'talep kimliği');
      esit(t['durum'], 'taslak', 'açılış durumu');
      return metin(t['no'], 'talep no');
    });
    if (acilan === null) return;
    const talepNo = acilan;

    const ilk = await cagir(b, SATIN_ALMA, 'talebi iş kutusunda bul', 'GET', '/api/satin-alma-acilis', undefined, (g) => ({
      talep: talepBul(g, talepId), kisiId: tamSayi(nesne(nesne(g, 'açılış')['kullanici'], 'kullanici')['id'], 'kullanici.id'),
    }));
    if (ilk === null) return;
    const teklif = teklifKur(ilk.talep, r, bugun);
    const degerlendirmede = await cagir(b, SATIN_ALMA, 'teklif gir', 'POST', kaydetYolu(talepId),
      kayitGovdesi(ilk.talep, { durum: 'degerlendirme', teklifler: [teklif] }), (g) => {
        const t = talepOku(g);
        esit(t.durum, 'degerlendirme', 'durum');
        return t;
      });
    if (degerlendirmede === null) return;
    const onayda = await cagir(b, SATIN_ALMA, 'karar ver, onaya gönder', 'POST', kaydetYolu(talepId),
      kayitGovdesi(degerlendirmede, { durum: 'onayda', karar: kararKur(String(teklif['id']), ilk.kisiId, bugun) }), (g) => {
        const t = talepOku(g);
        esit(t.durum, 'onayda', 'durum');
        return t;
      });
    if (onayda === null) return;

    const onayGorulen = await cagir(b, ONAYLAYAN, 'onay bekleyen talebi aç', 'GET', '/api/satin-alma-acilis', undefined, (g) => {
      const t = talepBul(g, talepId);
      esit(t.durum, 'onayda', 'durum');
      return t;
    });
    if (onayGorulen === null) return;

    if (ret) {
      const reddedilen = await cagir(b, ONAYLAYAN, 'talebi reddet', 'POST', kaydetYolu(talepId), onayEkle(onayGorulen, 'ret', r.kod('ret')), (g) => {
        const t = talepOku(g);
        esit(t.durum, 'degerlendirme', 'retten sonra durum');
        esit(nesne(dizi(t['onaylar'], 'onaylar').at(-1), 'son onay')['sonuc'], 'ret', 'son onay');
        return t;
      });
      if (reddedilen === null) return;
      // Reddedilen karar siparişe dönmez (B-002): değerlendirmeden siparişe geçiş de yoktur.
      const sipariseGecmez = await cagir(b, SATIN_ALMA, 'reddedilen talep siparişe geçmez', 'POST', kaydetYolu(talepId),
        siparisEkle(reddedilen, r.kod('siparis'), bugun), () => true, 422);
      if (sipariseGecmez === null) return;
      const iptal = await cagir(b, SATIN_ALMA, 'reddedilen talebi iptal et', 'POST', kaydetYolu(talepId),
        kayitGovdesi(reddedilen, { durum: 'iptal', iptalNedeni: 'Onayda reddedildi' }), (g) => {
          const t = talepOku(g);
          esit(t.durum, 'iptal', 'durum');
          return t;
        });
      if (iptal === null) return;
      await cagir(b, TALEP_EDEN, 'talep eden iptali görür', 'GET', '/api/satin-alma-taleplerim?sinir=500', undefined, (g) => {
        esit(talebimDurumu(g, talepId), 'iptal', 'talebim durumu');
      });
      await cagir(b, DEPO, 'iptal talep mal kabulde yok', 'GET', '/api/stok/acik-siparis-satirlari', undefined, (g) => {
        if (talepNoAcikMi(g, talepNo)) throw new Error(`İptal edilen talebin sipariş satırı mal kabulde açık: ${talepNo}`);
      });
      return;
    }

    const onayli = await cagir(b, ONAYLAYAN, 'talebi onayla', 'POST', kaydetYolu(talepId), onayEkle(onayGorulen, 'onay', ''), (g) => {
      const t = talepOku(g);
      esit(t.durum, 'onayda', 'onaydan sonra durum');
      esit(nesne(dizi(t['onaylar'], 'onaylar').at(-1), 'son onay')['sonuc'], 'onay', 'son onay');
      return t;
    });
    if (onayli === null) return;
    const siparisli = await cagir(b, SATIN_ALMA, 'sipariş ver', 'POST', kaydetYolu(talepId), siparisEkle(onayli, r.kod('siparis'), bugun), (g) => {
      const t = talepOku(g);
      esit(t.durum, 'siparis_verildi', 'durum');
      return siparisSatirIdsi(t);
    });
    if (siparisli === null) return;

    const satir = await cagir(b, DEPO, 'açık sipariş satırını bul', 'GET', '/api/stok/acik-siparis-satirlari', undefined, (g) => {
      const s = acikSatirBul(g, siparisli);
      esit(s.malzemeId, kart.no, 'satırın kartı');
      esit(Number(s.kalanMiktar), Number(miktar), 'kalan miktar');
      return s;
    });
    if (satir === null) return;
    const hareketId = await cagir(b, DEPO, 'mal kabul', 'POST', '/api/stok/mal-kabul', {
      tur: 'satin_alma', irsaliyeNo: r.kod('irs').slice(0, 30),
      satirlar: [{ malzemeId: satir.malzemeId, miktar: satir.kalanMiktar, siparisSatirId: satir.id }],
    }, (g) => {
      const idler = dizi(nesne(g, 'mal kabul')['hareketIdler'], 'hareketIdler');
      esit(idler.length, 1, 'hareket sayısı');
      return tamSayi(idler[0], 'hareket id');
    });
    if (hareketId === null) return;
    await cagir(b, DEPO, 'stok hareketini gör', 'GET', `/api/stok/hareketler?malzemeId=${String(satir.malzemeId)}&tur=giris&sirala=zaman&yon=azalan&sayfaBoyu=200`,
      undefined, (g) => { girisHareketiDenetle(g, hareketId, satir.kalanMiktar); });
    await cagir(b, SATIN_ALMA, 'talep teslim alındı', 'GET', '/api/satin-alma-acilis', undefined, (g) => {
      const t = talepBul(g, talepId);
      esit(t.durum, 'teslim_alindi', 'durum');
      esit(nesne(dizi(nesne(t['karar'], 'karar')['siparisler'], 'siparisler')[0], 'sipariş')['teslimDurumu'], 'tamam', 'teslim durumu');
    });
  },
});

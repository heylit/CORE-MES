import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { senaryo } from '../senaryo.ts';
import type { Rastgele } from '../tohum.ts';
import type { SenaryoBaglami } from '../senaryo.ts';
import type { Hesap } from '../../hesaplar.ts';

// S3, akış D: firma, teklif, sipariş, satış faturası ve masraf, tahsilat ve ödeme, rapor okuma.
// Her adım işi yapan rolle atılır: teklif ve sipariş satış, firma ve para kaydı muhasebe; sipariş onayı ve eşiği aşan iskonto
// müdür. Satış rolü firma yazamaz (yalnız musteri-tedarikci.oku), firmayı muhasebe açar.
export const SATIS: Hesap = 'ornek.satis';
export const FINANS: Hesap = 'ornek.muhasebe';
export const MUDUR: Hesap = 'ornek.mudur';

// Eşiği aşan iskonto müdür onayına düşer (siparisler sözleşmesi ISKONTO_ONAY_ESIGI = 10).
export const ONAYSIZ_ISKONTO = '5';
export const ONAYLI_ISKONTO = '15';
export const MASRAF_KATEGORILERI = ['mal_alimi', 'kira', 'enerji', 'lojistik', 'pazarlama', 'diger_gider'] as const;

type Kayit = Record<string, unknown>;
const kayit = (d: unknown): Kayit => (typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Kayit) : {});
const sayiAl = (d: unknown, alan: string): number | null => { const v = kayit(d)[alan]; return typeof v === 'number' ? v : null; };
const metinAl = (d: unknown, alan: string): string | null => { const v = kayit(d)[alan]; return typeof v === 'string' ? v : null; };
const satirlar = (d: unknown): Kayit[] => { const v = kayit(d)['satirlar']; return Array.isArray(v) ? v.map(kayit) : []; };

export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10);
}

// Para kuruş tamsayısıyla hesaplanır: kayan nokta toplamı kuruş kaydırmasın.
export const kurus = (metin: string): number => Math.round(Number(metin) * 100);
export const tlSayi = (k: number): number => k / 100;

export function fiyatMetni(r: Rastgele, enAz: number, enCok: number): string {
  return `${String(r.aralik(enAz, enCok))}.${String(r.aralik(0, 99)).padStart(2, '0')}`;
}

// Belge tarihinde geçerli, sıfırdan büyük oranlar (FNS-1); geçerli oran yoksa null.
export function gecerliKdvOranlari(liste: unknown, bugun: string): number[] {
  return satirlar(liste)
    .filter((s) => {
      const bas = metinAl(s, 'gecerlilikBaslangic');
      const bit = metinAl(s, 'gecerlilikBitis');
      return bas !== null && bas <= bugun && (bit === null || bugun < bit);
    })
    .map((s) => Number(metinAl(s, 'oran')))
    .filter((o) => Number.isFinite(o) && o > 0);
}

// Tahsilat ve ödeme aktif TRY hesabından; banka kasadan önce gelir.
export function hesapSec(liste: unknown): number | null {
  const aktif = satirlar(liste).filter((s) => s['aktif'] === true && s['paraBirimi'] === 'TRY');
  const sec = aktif.find((s) => s['tur'] === 'banka') ?? aktif[0];
  return sec === undefined ? null : sayiAl(sec, 'id');
}

export function malzemeNolari(liste: unknown): number[] {
  return satirlar(liste).map((s) => sayiAl(s, 'no')).filter((n): n is number => n !== null);
}

export function firmaGovdesi(r: Rastgele, tur: 'musteri' | 'tedarikci'): Kayit {
  return { ad: r.kod(tur === 'musteri' ? 'mus' : 'ted'), tur, vadeGunu: r.aralik(0, 90) };
}

export function teklifGovdesi(r: Rastgele, firmaId: number, malzemeler: readonly number[]): Kayit {
  const adet = Math.min(malzemeler.length, r.aralik(1, 3));
  const secilen = [...new Set(Array.from({ length: adet }, () => r.sec(malzemeler)))];
  return {
    firmaId,
    baslik: r.kod('teklif'),
    satirlar: secilen.map((malzemeNo) => ({ malzemeNo, tanim: r.kod('kalem'), miktar: String(r.aralik(1, 200)) })),
  };
}

// Talep satırının her biri için birim fiyat (TKL-04); satır kimlikleri teklifin cevabından okunur.
export function surumGovdesi(r: Rastgele, teklif: unknown, iskontoOrani: string): Kayit | null {
  const surum = sayiAl(teklif, 'surum');
  const idler = satirlar(teklif).map((s) => sayiAl(s, 'id'));
  if (surum === null || idler.length === 0 || idler.some((i) => i === null)) return null;
  return { surum, iskontoOrani, fiyatlar: idler.map((satirId) => ({ satirId, birimFiyat: fiyatMetni(r, 50, 5000) })) };
}

export function satisFaturasiGovdesi(a: { firmaId: number; siparisId: number; bugun: string; vadeGun: number; araToplam: string; kdv: number }): Kayit {
  return {
    yon: 'gelir', tur: 'fatura', kategori: 'urun_satisi', firmaId: a.firmaId, siparisId: a.siparisId,
    belgeTarihi: a.bugun, vade: gunEkle(a.bugun, a.vadeGun), tutar: tlSayi(kurus(a.araToplam)), kdvOrani: a.kdv,
  };
}

export function masrafGovdesi(r: Rastgele, a: { firmaId: number; bugun: string; kdv: number }): Kayit {
  return {
    yon: 'gider', tur: 'fatura', kategori: r.sec(MASRAF_KATEGORILERI), firmaId: a.firmaId,
    belgeTarihi: a.bugun, vade: gunEkle(a.bugun, r.aralik(0, 60)), tutar: Number(fiyatMetni(r, 500, 20000)), kdvOrani: a.kdv,
  };
}

// Belge toplamının `yuzde`si kadar ödeme, tamamı o belgeye dağıtılır (aynı para birimi).
export function odemeGovdesi(a: { yon: 'gelir' | 'gider'; firmaId: number; hesapId: number; bugun: string; belgeId: number; toplam: string; yuzde: number }): Kayit {
  const tutar = tlSayi(Math.max(1, Math.round((kurus(a.toplam) * a.yuzde) / 100)));
  return {
    yon: a.yon, firmaId: a.firmaId, tarih: a.bugun, yontem: 'banka', hesapId: a.hesapId, tutar,
    dagitimlar: [{ belgeId: a.belgeId, belgeTutari: tutar }],
  };
}

// KDV hariç tutar + KDV = toplam; KDV yuvarlaması bir kuruş oynayabilir. Tutmayan toplam bulgu metni döner.
export function toplamHatasi(belge: unknown, tutar: number, kdv: number): string | null {
  const toplam = metinAl(belge, 'toplam');
  if (toplam === null) return 'belgede toplam yok';
  const beklenen = Math.round(tutar * 100) + Math.round(tutar * kdv);
  return Math.abs(kurus(toplam) - beklenen) <= 1 ? null : `toplam ${toplam}, beklenen ${(beklenen / 100).toFixed(2)} (tutar ${tutar.toFixed(2)}, KDV %${String(kdv)})`;
}

export function dagitimHatasi(odeme: unknown, tutar: number): string | null {
  const dagitilan = metinAl(odeme, 'dagitilan');
  if (dagitilan === null) return 'ödemede dağıtılan yok';
  return kurus(dagitilan) === Math.round(tutar * 100) ? null : `dağıtılan ${dagitilan}, beklenen ${tutar.toFixed(2)}`;
}

const API = '/api';

// Akış zinciri: adım düşerse sonraki adım atılmaz (null döner); beklenen alan cevapta yoksa ayrı adım olarak düşer.
async function alanGerekli<T>(b: SenaryoBaglami, rol: Hesap, ad: string, deger: T | null, ileti: string): Promise<T | null> {
  if (deger !== null) return deger;
  await b.adim(rol, ad, () => Promise.resolve({ sonuc: 'dustu', ileti }));
  return null;
}

async function denetle(b: SenaryoBaglami, rol: Hesap, ad: string, hata: string | null): Promise<boolean> {
  return b.adim(rol, ad, () => Promise.resolve(hata === null ? {} : { sonuc: 'dustu', ileti: hata }));
}

interface Ortak { bugun: string; kdv: number; hesapId: number; malzemeler: number[] }

async function ortakVeri(b: SenaryoBaglami, bugun: string): Promise<Ortak | null> {
  const [kdvListe, hesaplar, secenek] = await Promise.all([
    b.bekle(FINANS, 'KDV oranlarını oku', 'GET', `${API}/finans/kdv-oranlari?sayfaBoyu=200`, 200),
    b.bekle(FINANS, 'kasa ve bankaları oku', 'GET', `${API}/finans/hesaplar?sayfaBoyu=200`, 200),
    b.bekle(SATIS, 'satılabilir malzemeleri oku', 'GET', `${API}/siparisler/malzeme-secenekleri`, 200),
  ]);
  if (kdvListe === null || hesaplar === null || secenek === null) return null;
  const oranlar = gecerliKdvOranlari(kdvListe, bugun);
  const kdv = await alanGerekli(b, FINANS, 'geçerli KDV oranı', oranlar.length === 0 ? null : b.rastgele.sec(oranlar), `${bugun} günü geçerli KDV oranı yok`);
  const hesapId = await alanGerekli(b, FINANS, 'tahsilat hesabı', hesapSec(hesaplar), 'aktif TRY kasa ya da banka hesabı yok (finans örnek verisi yüklü mü?)');
  const bulunan = malzemeNolari(secenek);
  const malzemeler = await alanGerekli(b, SATIS, 'satılabilir malzeme', bulunan.length === 0 ? null : bulunan, 'satılabilir malzeme yok (örnek veri yüklü mü?)');
  if (kdv === null || hesapId === null || malzemeler === null) return null;
  return { bugun, kdv, hesapId, malzemeler };
}

async function firmaAc(b: SenaryoBaglami, tur: 'musteri' | 'tedarikci'): Promise<number | null> {
  const ad = tur === 'musteri' ? 'müşteri aç' : 'tedarikçi aç';
  const c = await b.bekle(FINANS, ad, 'POST', `${API}/musteri-tedarikci/firmalar/ekle`, 200, firmaGovdesi(b.rastgele, tur));
  if (c === null) return null;
  return alanGerekli(b, FINANS, `${ad}: kimlik`, sayiAl(kayit(c)['firma'], 'id'), 'cevapta firma.id yok');
}

// Teklif -> sürüm -> (gerekirse müdür iskonto onayı) -> kabul -> sipariş -> müdür onayı. Reddedilen teklif yolu da koşar.
async function satis(b: SenaryoBaglami, o: Ortak, musteriId: number): Promise<{ siparisId: number; araToplam: string } | null> {
  const r = b.rastgele;
  const teklif = await b.bekle(SATIS, 'teklif aç', 'POST', `${API}/siparisler/teklifler/ekle`, 200, teklifGovdesi(r, musteriId, o.malzemeler));
  if (teklif === null) return null;
  const teklifId = await alanGerekli(b, SATIS, 'teklif aç: kimlik', sayiAl(teklif, 'id'), 'cevapta teklif id yok');
  if (teklifId === null) return null;
  const yol = `${API}/siparisler/teklifler/${String(teklifId)}`;

  const onayli = r.sayi() < 0.3;
  const surumG = await alanGerekli(b, SATIS, 'teklif sürümü', surumGovdesi(r, teklif, onayli ? ONAYLI_ISKONTO : ONAYSIZ_ISKONTO),
    'teklif cevabında sürüm ya da satır kimliği yok');
  if (surumG === null) return null;
  let t = await b.bekle(SATIS, onayli ? 'teklif sürümü ver (eşik üstü iskonto)' : 'teklif sürümü ver', 'POST', `${yol}/surum-ver`, 200, surumG);
  if (t === null) return null;
  const beklenenDurum = onayli ? 'onay-bekliyor' : 'verildi';
  if (!(await denetle(b, SATIS, 'teklif sürümü: durum', metinAl(t, 'durum') === beklenenDurum ? null : `durum ${String(metinAl(t, 'durum'))}, beklenen ${beklenenDurum}`))) return null;

  if (r.sayi() < 0.2) {
    await b.bekle(SATIS, 'teklifi reddet', 'POST', `${yol}/reddet`, 200, { surum: sayiAl(t, 'surum'), not: r.kod('red') });
    return null;
  }
  if (onayli) {
    t = await b.bekle(MUDUR, 'iskontoyu onayla', 'POST', `${yol}/iskonto-onayla`, 200, { surum: sayiAl(t, 'surum') });
    if (t === null) return null;
  }
  t = await b.bekle(SATIS, 'teklifi kabul et', 'POST', `${yol}/kabul`, 200, { surum: sayiAl(t, 'surum'), surumNo: sayiAl(t, 'sonSurumNo') ?? 1 });
  if (t === null) return null;
  const donusum = await b.bekle(SATIS, 'teklifi siparişe dönüştür', 'POST', `${yol}/siparise-donustur`, 200, {
    surum: sayiAl(t, 'surum'), siparisTarihi: o.bugun, termin: gunEkle(o.bugun, r.aralik(14, 60)), kdvOrani: String(o.kdv),
  });
  const siparisId = await alanGerekli(b, SATIS, 'siparişe dönüştür: kimlik', sayiAl(donusum, 'siparisId'), 'cevapta siparisId yok');
  if (donusum === null || siparisId === null) return null;

  const sYol = `${API}/siparisler/${String(siparisId)}`;
  const siparis = await b.bekle(MUDUR, 'siparişi oku', 'GET', sYol, 200);
  if (siparis === null) return null;
  const onay = await b.bekle(MUDUR, 'siparişi onayla', 'POST', `${sYol}/onayla`, 200, { surum: sayiAl(siparis, 'surum') });
  if (onay === null) return null;
  if (!(await denetle(b, MUDUR, 'sipariş onayı: durum', metinAl(onay, 'durum') === 'onayli' ? null : `durum ${String(metinAl(onay, 'durum'))}`))) return null;
  const araToplam = await alanGerekli(b, FINANS, 'sipariş tutarı', metinAl(onay, 'araToplam'), 'onaylı siparişte araToplam null (fiyat görmeyen ya da fiyatsız kalem)');
  return araToplam === null ? null : { siparisId, araToplam };
}

async function belgeAc(b: SenaryoBaglami, ad: string, govde: Kayit, kdv: number): Promise<{ id: number; toplam: string } | null> {
  const c = await b.bekle(FINANS, ad, 'POST', `${API}/finans/belgeler/ekle`, 200, govde);
  if (c === null) return null;
  const belge = kayit(c)['belge'];
  const id = sayiAl(belge, 'id');
  const toplam = metinAl(belge, 'toplam');
  if (!(await denetle(b, FINANS, `${ad}: toplam`, id === null ? 'cevapta belge.id yok' : toplamHatasi(belge, govde['tutar'] as number, kdv)))) return null;
  return id === null || toplam === null ? null : { id, toplam };
}

async function ode(b: SenaryoBaglami, ad: string, govde: Kayit): Promise<void> {
  const c = await b.bekle(FINANS, ad, 'POST', `${API}/finans/odemeler/ekle`, 200, govde);
  if (c !== null) await denetle(b, FINANS, `${ad}: dağıtım`, dagitimHatasi(kayit(c)['odeme'], govde['tutar'] as number));
}

async function tahsilat(b: SenaryoBaglami, o: Ortak, musteriId: number, s: { siparisId: number; araToplam: string }): Promise<void> {
  const r = b.rastgele;
  // İz bütünlüğü: onaylanan sipariş finansın satış faturası seçiminde görünür (FNS-66).
  const liste = await b.bekle(FINANS, 'faturalanacak siparişleri oku', 'GET', `${API}/finans/satis-siparisleri?firmaId=${String(musteriId)}`, 200);
  if (liste === null) return;
  const siparisler = kayit(liste)['siparisler'];
  const listede = Array.isArray(siparisler) && siparisler.some((x) => sayiAl(x, 'id') === s.siparisId);
  if (!(await denetle(b, FINANS, 'sipariş faturalanabilir listede', listede ? null : `sipariş ${String(s.siparisId)} listede yok`))) return;
  const fatura = await belgeAc(b, 'satış faturası kes', satisFaturasiGovdesi({ firmaId: musteriId, siparisId: s.siparisId, bugun: o.bugun, vadeGun: r.aralik(0, 90), araToplam: s.araToplam, kdv: o.kdv }), o.kdv);
  if (fatura === null) return;
  await ode(b, 'tahsilat al', odemeGovdesi({ yon: 'gelir', firmaId: musteriId, hesapId: o.hesapId, bugun: o.bugun, belgeId: fatura.id, toplam: fatura.toplam, yuzde: r.sec([40, 60, 100]) }));
}

async function masraf(b: SenaryoBaglami, o: Ortak, tedarikciId: number): Promise<void> {
  const r = b.rastgele;
  const belge = await belgeAc(b, 'masraf faturası gir', masrafGovdesi(r, { firmaId: tedarikciId, bugun: o.bugun, kdv: o.kdv }), o.kdv);
  if (belge === null) return;
  await ode(b, 'tedarikçiye öde', odemeGovdesi({ yon: 'gider', firmaId: tedarikciId, hesapId: o.hesapId, bugun: o.bugun, belgeId: belge.id, toplam: belge.toplam, yuzde: 100 }));
}

async function rapor(b: SenaryoBaglami): Promise<void> {
  await Promise.all([
    b.bekle(FINANS, 'finans özetini oku', 'GET', `${API}/finans/ozet`, 200),
    b.bekle(FINANS, 'aylık gelir-gideri oku', 'GET', `${API}/finans/aylik-seri`, 200),
    b.bekle(FINANS, 'belgeleri oku', 'GET', `${API}/finans/belgeler`, 200),
    b.bekle(MUDUR, 'satış özetini oku', 'GET', `${API}/siparisler/ozet`, 200),
  ]);
}

export default senaryo({
  ad: 'finans',
  roller: [SATIS, FINANS, MUDUR],
  kopya: 2,
  async kos(b) {
    const o = await ortakVeri(b, tesisGunu(Date.now()));
    if (o === null) return;
    const musteriId = await firmaAc(b, 'musteri');
    const tedarikciId = await firmaAc(b, 'tedarikci');
    await Promise.all([
      (async () => {
        if (musteriId === null) return;
        const s = await satis(b, o, musteriId);
        if (s !== null) await tahsilat(b, o, musteriId, s);
      })(),
      tedarikciId === null ? Promise.resolve() : masraf(b, o, tedarikciId),
    ]);
    await rapor(b);
  },
});

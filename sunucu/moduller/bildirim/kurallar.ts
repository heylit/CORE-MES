import type { Islem } from '#paylasilan/islemler.ts';
import {
  BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TURLERI, bildirimTuruMu, type BildirimKanali, type BildirimOnemi, type BildirimTuru, type BildirimTuruTanimi, type YayinTuru,
  type BildirimSinifi,
} from '#paylasilan/sozlesme/bildirim.ts';
import {
  EPOSTA_KIPLERI, EPOSTA_TABLO_ADLARI, bilinmeyenYerTutucular, sablonDoldur, type EpostaDegerleri, type EpostaKipi, type EpostaKonusu, type EpostaSimgesi, type EpostaTabloAlani, type EpostaZamani,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';

// BIL-1: mesaj kanalı kapalıdır (223 a Mesaj kanalını dördüncü aşamaya koydu). E-posta kanalı burada kapalı yazılır; açıklığı ortam
// değişkeni ve `bildirim.eposta` ayarıyla sunucuda hesaplanır (3397, ADR 0015 md 5).
export const ACIK_KANALLAR: Record<BildirimKanali, boolean> = { mesaj: false, eposta: false };

// BIL-6: gönderilen yol türün ekranı ya da onun altıdır; başka ekrana giden bildirim alıcıya açılmayan sayfa gösterebilirdi.
export const yolTureUyar = (tur: BildirimTuru, yol: string | null | undefined): boolean => {
  if (yol === null || yol === undefined) return true;
  const kok = BILDIRIM_TURLERI[tur].yol;
  return yol === kok || yol.startsWith(`${kok}/`);
};

export const kaynakModulu = (tur: BildirimTuru): string => tur.slice(0, tur.indexOf('.'));

// BIL-2: operatörde e-posta seçeneği çıkmaz (221). Operatör, Arkon operatör işlemini taşıyıp rol yönetmeyen kişidir:
// yönetici bütün işlemleri aldığı için yalnız `arkon.operator` ona bakmak yöneticiyi de operatör sayardı.
export const epostaSecilebilir = (islemler: readonly string[]): boolean =>
  !islemler.includes('arkon.operator') || islemler.includes('kisiler.rol-yonet');

// BIL-3: alıcı, olay türünün işlemlerinden birini taşıyan ya da çağıranın adıyla verdiği etkin girişli kişidir; tetikleyen
// kişi (talebi kendisi onaylayacak olan da) kendi eylemi için bildirim almaz. Gönderim anında yeniden sınanır: pasif ya da
// girişsiz kişi haritada yoktur, düşer.
// BIL-10 (760 c, 761 b): türde alıcı seçimi varsa (`ayarli` null değil) işlem kuralı yerine seçilen kişiler geçer; yönetici her
// işlemi taşısa da seçilmediyse almaz. Adıyla verilen kayda bağlı kişi iki durumda da alır. 2453: `yalnizKisiler` ile alıcı, adıyla
// verilenlerle türü alanların kesişimidir (alıcı başına zamanlanan hatırlatma gibi); kişi listesi verilmezse geliştirici hatasıdır.
export function alicilariSec(
  tur: BildirimTuru,
  kisiIslemleri: ReadonlyMap<number, readonly Islem[]>,
  ek: {
    kisiler?: readonly number[] | undefined; haric?: number | null | undefined; ayarli?: readonly number[] | null | undefined;
    yalnizKisiler?: boolean | undefined;
  },
): number[] {
  if (ek.yalnizKisiler === true && ek.kisiler === undefined) throw new Error(`Yalnız kişilere bildirim kişi listesi ister: ${tur}`);
  const islemler: readonly Islem[] = BILDIRIM_TURLERI[tur].alanIslemler;
  const ayarli = ek.ayarli === null || ek.ayarli === undefined ? null : new Set(ek.ayarli);
  const adlilar = new Set(ek.kisiler ?? []);
  const secilen: number[] = [];
  for (const [kisiId, sahip] of kisiIslemleri) {
    if (kisiId === ek.haric) continue;
    const turAlir = ayarli === null ? sahip.some((i) => islemler.includes(i)) : ayarli.has(kisiId);
    // 2453: yalnız kişiler istenince liste yalnız daraltır; türü almayan kişi adıyla verilse de almaz.
    if (ek.yalnizKisiler === true ? adlilar.has(kisiId) && turAlir : adlilar.has(kisiId) || turAlir) secilen.push(kisiId);
  }
  return secilen.sort((a, b) => a - b);
}

// BIL-4: tekil anahtar tür ve kaynak kimliğinden kurulur; kimlik yoksa her olay ayrı satırdır.
export const tekilAnahtar = (tur: BildirimTuru, kaynakKimlik: string | null | undefined): string | null =>
  kaynakKimlik === null || kaynakKimlik === undefined || kaynakKimlik === '' ? null : `${tur}:${kaynakKimlik}`;

// BIL-5: başlık boş olamaz ve kısaltılır; metin isteğe bağlıdır. Sınır aşımı olayı düşürmez (üreten modülün hatası kişinin
// haberini engellemesin), kesilir.
export function metniHazirla(baslik: string, metin: string | null | undefined): { baslik: string; metin: string | null } {
  const b = baslik.trim();
  if (b === '') throw new Error('Bildirim başlığı boş olamaz.');
  const m = metin?.trim() ?? '';
  return {
    baslik: b.length > BILDIRIM_BASLIK_EN_COK ? `${b.slice(0, BILDIRIM_BASLIK_EN_COK - 1)}…` : b,
    metin: m === '' ? null : m.length > BILDIRIM_METIN_EN_COK ? `${m.slice(0, BILDIRIM_METIN_EN_COK - 1)}…` : m,
  };
}

// BIL-8: yönlendirmeye ve alıcı ayarına yalnız var olan rol ya da etkin girişli kişi yazılır; olmayan kimlik sessizce
// düşürülmez, reddedilir.
export const olmayanKimlikler = (secilen: readonly number[], varOlan: readonly number[]): number[] => {
  const kume = new Set(varOlan);
  return secilen.filter((r) => !kume.has(r));
};

export const TERCIH_ILETILERI = {
  turYok: 'Bu bildirim size gelmiyor; tercihi kaydedilemez.',
  epostaYok: 'E-posta bildirimi sizin için seçilemez.',
  kapatilamaz: 'Bu bildirimin e-postası kapatılamaz: geciken hazırlık görevi kademesidir.',
} as const;

// alinabilen: kişinin tercih listesindeki türler (tercihler okumasıyla aynı kaynak).
export function tercihHatasi(
  alinabilen: readonly string[], epostaVar: boolean, govde: { tur: string; eposta: boolean },
): { mesaj: string; alan: 'tur' | 'eposta' } | null {
  if (!alinabilen.includes(govde.tur)) return { mesaj: TERCIH_ILETILERI.turYok, alan: 'tur' };
  if (govde.eposta && !epostaVar) return { mesaj: TERCIH_ILETILERI.epostaYok, alan: 'eposta' };
  if (!govde.eposta && epostaVar && bildirimTuruMu(govde.tur) && turKapatilamaz(govde.tur)) return { mesaj: TERCIH_ILETILERI.kapatilamaz, alan: 'eposta' };
  return null;
}

// BIL-11 (2147): elle yayının önemi türünden gelir; önem listesi (zil rengi, "uyarı ve acil" süzgeci) değişmez.
export const YAYIN_ONEMI: Record<YayinTuru, BildirimOnemi> = { uyari: 'uyari', acil: 'acil', duyuru: 'bilgi', bilgi: 'bilgi' };
// Elle yayının satır türü; otomatik türlerin kataloğunda yoktur (tercih ve alıcı ayarına girmez, yayının kendi hedefi geçer).
export const YAYIN_SATIR_TURU = 'bildirim.yayin';
export const yayinKaydi = (yayinId: number): string => `yayin:${yayinId}`;

// BIL-12: yayın zamanı boşsa ya da geçmişteyse hemen yayınlanır; en çok 90 gün ileri. Bitiş yayın zamanından sonradır.
export const YAYIN_ILERI_EN_COK_GUN = 90;
export function yayinZamaniHatasi(
  simdiMs: number, yayinZamani: string | null, bitis: string | null,
): { mesaj: string; alan: 'yayinZamani' | 'bitis' } | null {
  const yayinMs = yayinZamani === null ? simdiMs : Math.max(simdiMs, Date.parse(yayinZamani));
  if (yayinMs - simdiMs > YAYIN_ILERI_EN_COK_GUN * 86_400_000) return { mesaj: `Yayın zamanı en çok ${YAYIN_ILERI_EN_COK_GUN} gün ileri olabilir.`, alan: 'yayinZamani' };
  if (bitis !== null && Date.parse(bitis) <= yayinMs) return { mesaj: 'Bitiş yayın zamanından sonra olmalı.', alan: 'bitis' };
  return null;
}
export const hemenMi = (simdiMs: number, yayinZamani: string | null): boolean => yayinZamani === null || Date.parse(yayinZamani) <= simdiMs;

// BIL-13: alıcı yayın anında etkin ve girişli adaylardır, kimlik sırasıyla ve tekil; yazan kendi yayınını almaz (BIL-3 gibi).
export function yayinAlicilari(adaylar: readonly number[], girisli: ReadonlySet<number>, yazanId: number): number[] {
  return [...new Set(adaylar)].filter((k) => girisli.has(k) && k !== yazanId).sort((a, b) => a - b);
}

// BIL-14: yayının raporunu yazanı ve `bildirim.yayin-oku` taşıyan görür; geri çekmek yalnız yazanındır.
export const yayiniGorurMu = (kullanici: { id: number; islemler: readonly string[] }, yazanId: number): boolean =>
  kullanici.id === yazanId || kullanici.islemler.includes('bildirim.yayin-oku');

// BIL-15 (2147-3 a): onay isteyen bildirim onaylanmadan arşive kaldırılamaz; "Okudum, anladım" denene dek ortada kalır.
export const ONAY_ILETILERI = {
  onayIstemiyor: 'Bu bildirim onay istemiyor.',
  onaysizArsiv: 'Onay isteyen bildirim "Okudum, anladım" denmeden arşive kaldırılamaz.',
  geriCekilmis: 'Yayın zaten geri çekildi.',
  yazanDegil: 'Yayını yalnız yazan geri çekebilir.',
} as const;

// BIL-16 (2147-3 a): otomatik bildirimden yalnız acil olanı ortada çıkar ve onay istemez; tür ayarlanmadıysa bu geçer.
export const otomatikOrtadaMi = (onem: BildirimOnemi): boolean => onem === 'acil';

export interface Gosterim { ortada: boolean; onayIstenir: boolean }
type GosterimTanimi = Pick<BildirimTuruTanimi, 'onem' | 'onayIstenir'>;
// BIL-17 (2147 Y4): türün Bildirim yönetimi'ndeki gösterimi varsayılanın yerine geçer; onay varsayılanını tür tanımı verir (3303-2 a).
export const varsayilanGosterim = (t: GosterimTanimi): Gosterim => ({ ortada: otomatikOrtadaMi(t.onem), onayIstenir: t.onayIstenir === true });
export const otomatikGosterim = (t: GosterimTanimi, ayar: Gosterim | null): Gosterim => ayar ?? varsayilanGosterim(t);
export const varsayilanMi = (t: GosterimTanimi, g: Gosterim): boolean => {
  const v = varsayilanGosterim(t);
  return v.ortada === g.ortada && v.onayIstenir === g.onayIstenir;
};

// 3396-3: e-postası kişi tercihinden kapatılamayan tür (hazırlık kademeleri).
export const turKapatilamaz = (tur: BildirimTuru): boolean => (BILDIRIM_TURLERI[tur] as BildirimTuruTanimi).kapatilamaz === true;

// --- E-posta kanalı (ADR 0015, 3397) ---------------------------------------------------------------------------------

// BIL-40: konu başına varsayılan şablon. Gövdede yalnız izinli yer tutucular; müşteri, tedarikçi, fiyat, parça no ve serbest metin yok.
export const VARSAYILAN_SABLONLAR: Record<EpostaKonusu, { simge: EpostaSimgesi; konuKalibi: string; govde: string; tabloAlanlari: EpostaTabloAlani[] }> = {
  'satin-alma': { simge: 'cart', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı ve işlemi uygulamada görebilirsin.', tabloAlanlari: ['kayit_no', 'olay', 'tarih'] },
  proje: { simge: 'clipboard-check', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı ve işlemi uygulamada görebilirsin.', tabloAlanlari: ['kayit_no', 'olay', 'tarih', 'gecikme_gunu'] },
  satis: { simge: 'tag', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı ve işlemi uygulamada görebilirsin.', tabloAlanlari: ['kayit_no', 'olay', 'tarih'] },
  planlama: { simge: 'calendar', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı uygulamada görebilirsin.', tabloAlanlari: ['kayit_no', 'olay', 'tarih', 'gecikme_gunu', 'istasyon'] },
  uretim: { simge: 'route', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı uygulamada görebilirsin.', tabloAlanlari: ['kayit_no', 'olay', 'tarih', 'istasyon'] },
  genel: { simge: 'bell', konuKalibi: '[CORE MES] {olay}', govde: 'Merhaba {alici_adi},\n\n{olay}.\n\nAyrıntıyı uygulamada görebilirsin.', tabloAlanlari: ['olay', 'tarih'] },
};

// BIL-41: yer tutucu sınaması ve doldurma sözleşmededir (ekranın canlı ön izlemesi de aynısını kullanır).
export { bilinmeyenYerTutucular, sablonDoldur, type EpostaDegerleri };

// BIL-50: kayıtlı kip listede yoksa kurum içi sayılır; dış servise yalnız açık seçimle çıkılır.
export function epostaKipi(deger: string): EpostaKipi {
  return (EPOSTA_KIPLERI as readonly string[]).includes(deger) ? deger as EpostaKipi : 'kurum-ici';
}
export const disKipMi = (deger: string): boolean => epostaKipi(deger) === 'dis-servis';

// BIL-42: uygulama adresi yalnız http(s) kök adresidir; değilse e-postada bağlantı olmaz. Yol bildirimin uygulama içi yoludur.
export function kayitBaglantisi(uygulamaAdresi: string, yol: string | null): string | null {
  const kok = uygulamaAdresi.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-z0-9.\-[\]:]+$/i.test(kok)) return null;
  return `${kok}${yol ?? '/'}`;
}

const kacis = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// E-postada tasarım değişkeni yoktur: posta programı CSS değişkeni okumaz, renk satır içi yazılır.
const ONEM_RENGI: Record<BildirimOnemi, { serit: string; zemin: string }> = {
  bilgi: { serit: '#2456c9', zemin: '#e3ebfb' }, uyari: { serit: '#b45f06', zemin: '#fbe9d3' }, acil: { serit: '#c62f45', zemin: '#f9e0e4' },
};

export interface EpostaGovdesi { konu: string; metin: string; html: string }
export interface EpostaGirdisi {
  sablon: { konuKalibi: string; govde: string; tabloAlanlari: readonly EpostaTabloAlani[] };
  degerler: EpostaDegerleri;
  baslik: string;
  onem: BildirimOnemi;
  simgeVar: boolean;
}

// BIL-43: e-postanın konusu, düz metni ve HTML'i. Tablo yalnız seçili ve değeri olan alanlardan kurulur; HTML'de her değer kaçışlanır.
export function epostaKur(g: EpostaGirdisi): EpostaGovdesi {
  const konu = sablonDoldur(g.sablon.konuKalibi, g.degerler).replace(/\s*·\s*$/, '').trim() || g.baslik;
  const govde = sablonDoldur(g.sablon.govde, g.degerler).trim();
  const satirlar = g.sablon.tabloAlanlari.flatMap((a) => {
    const d = g.degerler[a];
    return d === null || d === '' ? [] : [[EPOSTA_TABLO_ADLARI[a], d] as const];
  });
  const baglanti = g.degerler.kayit_baglantisi;
  const alt = 'Bu e-posta CORE MES tarafından kurum içi posta sunucusundan gönderildi. Almak istemiyorsan Profil > Bildirim tercihleri\'nden kapatabilirsin.';
  const metin = [govde, '', ...satirlar.map(([a, d]) => `${a}: ${d}`), ...(baglanti === null ? [] : ['', `Kayda git: ${baglanti}`]), '', '--', alt].join('\n');
  const r = ONEM_RENGI[g.onem];
  const tablo = satirlar.length === 0 ? '' : `<table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e3dfd6;border-collapse:collapse;margin:12px 0;width:100%">${
    satirlar.map(([a, d]) => `<tr><td style="padding:7px 10px;border-bottom:1px solid #eeeeee;color:#6d685d;width:40%;font-size:13px">${kacis(a)}</td><td style="padding:7px 10px;border-bottom:1px solid #eeeeee;color:#1c1a14;font-size:13px">${kacis(d)}</td></tr>`).join('')}</table>`;
  const simge = g.simgeVar ? `<td style="width:56px;vertical-align:middle"><img src="cid:simge" width="44" height="44" alt="" style="display:block;border-radius:10px;background:${r.zemin}"></td>` : '';
  const dugme = baglanti === null ? '' : `<p style="margin:16px 0 0"><a href="${kacis(baglanti)}" style="display:inline-block;background:#1c1a14;color:#f6c400;border:2px solid #f6c400;padding:10px 16px;border-radius:8px;font-weight:bold;text-decoration:none">Kayda git</a></p>`;
  const paragraflar = govde.split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px">${kacis(p).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:16px;background:#f1eee7">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:6px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#1c1a14">`
    + `<tr><td style="height:6px;background:${r.serit};border-radius:6px 6px 0 0"></td></tr><tr><td style="padding:20px 22px">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>${simge}<td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold">${kacis(g.baslik)}</div>`
    + `<div style="font-size:12px;color:#6d685d">${kacis([g.degerler.kayit_no, g.degerler.tarih].filter((x) => x !== null && x !== '').join(' · '))}</div></td></tr></table>`
    + `${paragraflar}${tablo}${dugme}</td></tr><tr><td style="padding:12px 22px;background:#f3f1ec;color:#6d685d;font-size:12.5px;border-radius:0 0 6px 6px">${kacis(alt)}</td></tr></table></body></html>`;
  return { konu, metin, html };
}

// BIL-44: sessiz saatler tesis saatiyle; başlangıç bitişten büyükse gece yarısını aşar. Biri boşsa ya da eşitse sessiz saat yok.
export function sessizMi(saat: number, bas: number | null, bit: number | null): boolean {
  if (bas === null || bit === null || bas === bit) return false;
  return bas < bit ? saat >= bas && saat < bit : saat >= bas || saat < bit;
}

// BIL-45: türün e-posta ayarı; satır yoksa kod varsayılanı (türün e-posta varsayılanı, hemen, tekrar ve kademe yok).
export interface EpostaTetikleyicisi {
  eposta: boolean; zaman: EpostaZamani; tekrarGun: number | null; tekrarEnCok: number | null;
  yukseltGun: number | null; yukseltRolIdleri: number[]; yukseltKisiIdleri: number[];
}
export const varsayilanTetikleyici = (tur: BildirimTuru): EpostaTetikleyicisi => ({
  eposta: BILDIRIM_TURLERI[tur].varsayilan.eposta, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null,
  yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [],
});

// BIL-46: kişi e-postayı alır mı: tür açık, kişi e-posta seçebilen (operatör değil, BIL-2) ve kendi tercihinde kapatmamış.
export const kisiEpostaAlir = (turAcik: boolean, islemler: readonly string[], tercih: boolean | undefined): boolean =>
  turAcik && epostaSecilebilir(islemler) && tercih !== false;

// BIL-47: tekrar ve kademe kaynak bildirim açıkken sürer: görev ve hatırlatma yapılana, bilgi okunana dek; arşivlenen kapanmıştır.
export const bildirimAcikMi = (b: { sinif: BildirimSinifi; okundu: string | null; arsivlendi: string | null; yapildi: string | null }): boolean =>
  b.arsivlendi === null && (b.sinif === 'bilgi' ? b.okundu === null : b.yapildi === null);

// BIL-48: geçici hatada en çok 3 deneme; aralık 5, 15 dakika. Kalıcı hata ya da son deneme deftere "gönderilemedi" yazılır.
export const EPOSTA_DENEME_EN_COK = 3;
export const sonrakiDenemeDk = (deneme: number): number | null => (deneme >= EPOSTA_DENEME_EN_COK ? null : [5, 15][deneme - 1] ?? 15);

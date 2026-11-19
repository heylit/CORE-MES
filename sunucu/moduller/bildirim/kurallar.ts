import type { Islem } from '#paylasilan/islemler.ts';
import {
  KADEME_ADLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, kaynakKademeleri, type KademeBirimi, type KademeSayaci,
} from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import {
  BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TURLERI, type BildirimOnemi, type BildirimTuru, type BildirimTuruTanimi, type YayinTuru,
  type BildirimSinifi,
} from '#paylasilan/sozlesme/bildirim.ts';
import {
  EPOSTA_KIPLERI, EPOSTA_TABLO_ADLARI, bilinmeyenYerTutucular, onayEylemiYolu, sablonDoldur, type EpostaDegerleri, type EpostaKipi, type EpostaKonusu, type EpostaSimgesi, type EpostaTabloAlani, type EpostaZamani,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';

// BIL-6: gönderilen yol türün ekranı ya da onun altıdır; başka ekrana giden bildirim alıcıya açılmayan sayfa gösterebilirdi.
// Sorgu ekranı değiştirmez (`/malzemeler?kart=` aynı ekranda kaydı açar); denetim yolun sorgusuz kısmına bakar (3431).
export const yolTureUyar = (tur: BildirimTuru, yol: string | null | undefined): boolean => {
  if (yol === null || yol === undefined) return true;
  const kok = BILDIRIM_TURLERI[tur].yol;
  const ekran = yol.split('?')[0] ?? '';
  return ekran === kok || ekran.startsWith(`${kok}/`);
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
// 3431 a: kademeli uyarının basamağı (K2-K5) ve 3397 tetikleyicisinin yükseltmesi e-postada görünür.
export interface EpostaKademesi { no: number; toplam: number; ad: string }
export interface EpostaGirdisi {
  sablon: { konuKalibi: string; govde: string; tabloAlanlari: readonly EpostaTabloAlani[] };
  degerler: EpostaDegerleri;
  baslik: string;
  onem: BildirimOnemi;
  simgeVar: boolean;
  // Üst bilgideki ad (Sistem Ayarları > gönderen adı); verilmezse CORE MES.
  gonderenAdi?: string | undefined;
  // Onay türünde Onayla (ve türde ret varsa Reddet) düğmesi; bağlantı yoksa düğme yok.
  onay?: { reddet: boolean } | null | undefined;
  kademe?: EpostaKademesi | null | undefined;
  // Yükseltme cümlesi: "2 gün içinde kapanmazsa ... de alır" ya da "yükseltildi".
  yukseltme?: string | null | undefined;
}

// 3431 a: kaynak türden kademe basamağı; kademeli uyarı türü değilse null.
const KADEME_BASAMAKLARI: ReadonlyMap<string, 2 | 3 | 4 | 5> = new Map(
  KADEME_KAYNAK_ANAHTARLARI.flatMap((k) => kaynakKademeleri(k).map((n) => [kademeTuru(k, n) as string, n] as const)),
);
export function turKademesi(tur: string): EpostaKademesi | null {
  const n = KADEME_BASAMAKLARI.get(tur);
  return n === undefined ? null : { no: n, toplam: 5, ad: KADEME_ADLARI[n] };
}

const ONEM_ADI: Record<BildirimOnemi, string> = { bilgi: 'Bilgi', uyari: 'Uyarı', acil: 'Acil' };

// BIL-51 (3431 a): konu satırının başında önem (yalnız acil), onay ve kademe etiketi. Bilgi ve uyarıda etiket yok: her e-postada
// "[UYARI]" görmek önemi değersizleştirir.
export function konuEtiketi(g: Pick<EpostaGirdisi, 'onem' | 'onay' | 'kademe'>): string | null {
  const parca = [g.onem === 'acil' ? 'ACİL' : null, g.onay ? 'Onay' : null, g.kademe ? `Kademe ${String(g.kademe.no)}/${String(g.kademe.toplam)}` : null]
    .filter((x): x is string => x !== null);
  return parca.length === 0 ? null : `[${parca.join(' · ')}]`;
}

// BIL-43: e-postanın konusu, düz metni ve HTML'i. Tablo yalnız seçili ve değeri olan alanlardan kurulur; HTML'de her değer kaçışlanır.
// 3431 a: ortak üst bilgi (gönderen adı, önem), kademe göstergesi, yükseltme cümlesi, onay düğmeleri. Düğmeler yalnız uygulamadaki
// kaydı açar; adres onay vermez (iletilen e-posta yetki taşımaz).
export function epostaKur(g: EpostaGirdisi): EpostaGovdesi {
  const etiket = konuEtiketi(g);
  const sablonKonusu = sablonDoldur(g.sablon.konuKalibi, g.degerler).replace(/\s*·\s*$/, '').trim() || g.baslik;
  const konu = etiket === null ? sablonKonusu : `${etiket} ${sablonKonusu}`;
  const govde = sablonDoldur(g.sablon.govde, g.degerler).trim();
  const satirlar = g.sablon.tabloAlanlari.flatMap((a) => {
    const d = g.degerler[a];
    return d === null || d === '' ? [] : [[EPOSTA_TABLO_ADLARI[a], d] as const];
  });
  const baglanti = g.degerler.kayit_baglantisi;
  const onay = g.onay && baglanti !== null ? g.onay : null;
  const ad = g.gonderenAdi?.trim() || 'CORE MES';
  const kademeMetni = g.kademe ? `Kademe ${String(g.kademe.no)} / ${String(g.kademe.toplam)}: ${g.kademe.ad}` : null;
  const altlar = [
    `Bu e-posta ${ad === 'CORE MES' ? 'CORE MES' : `CORE MES tarafından ${ad} adına`} gönderildi.`,
    ...(onay !== null ? ['Düğmeler CORE MES\'te bu kaydı açar; onay girişle ve kendi yetkinle verilir. Bu e-postayı iletmek kimseye onay yetkisi vermez.'] : []),
    'Bu e-postayı kimin alacağını sistem yöneticin belirler.',
  ];
  const metin = [
    govde, '', ...[kademeMetni, g.yukseltme ?? null].filter((x): x is string => x !== null && x !== ''), ...satirlar.map(([a, d]) => `${a}: ${d}`),
    ...(baglanti === null ? [] : onay !== null
      ? ['', `Onayla: ${onayEylemiYolu(baglanti, 'onayla')}`, ...(onay.reddet ? [`Reddet: ${onayEylemiYolu(baglanti, 'reddet')}`] : []), `Kaydı aç: ${baglanti}`]
      : ['', `Kayda git: ${baglanti}`]),
    '', '--', ...altlar,
  ].join('\n');
  const r = ONEM_RENGI[g.onem];
  const tablo = satirlar.length === 0 ? '' : `<table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid #e3dfd6;border-collapse:collapse;margin:12px 0;width:100%">${
    satirlar.map(([a, d]) => `<tr><td style="padding:7px 10px;border-bottom:1px solid #eeeeee;color:#6d685d;width:40%;font-size:13px">${kacis(a)}</td><td style="padding:7px 10px;border-bottom:1px solid #eeeeee;color:#1c1a14;font-size:13px">${kacis(d)}</td></tr>`).join('')}</table>`;
  const simge = g.simgeVar ? `<td style="width:56px;vertical-align:middle"><img src="cid:simge" width="44" height="44" alt="" style="display:block;border-radius:10px;background:${r.zemin}"></td>` : '';
  const dugmeStili = (zemin: string, yazi: string, kenar: string) =>
    `display:inline-block;background:${zemin};color:${yazi};border:2px solid ${kenar};padding:10px 16px;border-radius:8px;font-weight:bold;text-decoration:none;margin:0 8px 8px 0`;
  const dugme = baglanti === null ? '' : onay !== null
    ? `<p style="margin:16px 0 0"><a href="${kacis(onayEylemiYolu(baglanti, 'onayla'))}" style="${dugmeStili('#1f7a4a', '#ffffff', '#1f7a4a')}">Onayla</a>`
      + (onay.reddet ? `<a href="${kacis(onayEylemiYolu(baglanti, 'reddet'))}" style="${dugmeStili('#ffffff', '#c62f45', '#c62f45')}">Reddet</a>` : '')
      + `<a href="${kacis(baglanti)}" style="${dugmeStili('#ffffff', '#1c1a14', '#1c1a14')}">Kaydı aç</a></p>`
    : `<p style="margin:16px 0 0"><a href="${kacis(baglanti)}" style="${dugmeStili('#1c1a14', '#f6c400', '#f6c400')}">Kayda git</a></p>`;
  const kademeCubugu = g.kademe ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 2px"><tr>${
    Array.from({ length: g.kademe.toplam }, (_, i) => `<td style="height:6px;padding:0 2px"><div style="height:6px;border-radius:3px;background:${i < (g.kademe?.no ?? 0) ? r.serit : '#e3dfd6'}"></div></td>`).join('')
  }</tr></table><div style="font-size:12px;color:#6d685d;margin-bottom:8px">${kacis(kademeMetni ?? '')}</div>` : '';
  const yukseltme = g.yukseltme ? `<div style="font-size:12.5px;color:#6d685d;margin:0 0 10px">${kacis(g.yukseltme)}</div>` : '';
  const paragraflar = govde.split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px">${kacis(p).replace(/\n/g, '<br>')}</p>`).join('');
  const ust = `<tr><td style="padding:10px 22px;background:#1c1a14;border-radius:6px 6px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>`
    + `<td style="color:#ffffff;font-weight:bold;font-size:14px">${kacis(ad)}</td>`
    + `<td style="text-align:right"><span style="display:inline-block;background:${r.zemin};color:${r.serit};font-size:12px;font-weight:bold;padding:2px 8px;border-radius:999px">${ONEM_ADI[g.onem]}</span></td></tr></table></td></tr>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:16px;background:#f1eee7">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;border-radius:6px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#1c1a14">`
    + `${ust}<tr><td style="height:6px;background:${r.serit}"></td></tr><tr><td style="padding:20px 22px">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>${simge}<td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold">${kacis(g.baslik)}</div>`
    + `<div style="font-size:12px;color:#6d685d">${kacis([g.degerler.kayit_no, g.degerler.tarih].filter((x) => x !== null && x !== '').join(' · '))}</div></td></tr></table>`
    + `${kademeCubugu}${yukseltme}${paragraflar}${tablo}${dugme}</td></tr><tr><td style="padding:12px 22px;background:#f3f1ec;color:#6d685d;font-size:12.5px;border-radius:0 0 6px 6px">${altlar.map(kacis).join('<br>')}</td></tr></table></body></html>`;
  return { konu, metin, html };
}

// BIL-52 (3431 a): yükseltme cümlesi. İlk alıcıya "kapanmazsa kime gideceği", yükseltmeyle alana "neden aldığı" yazılır. Kişi adı yazılmaz,
// yalnız rol adı; yalnız kişi seçilmişse "yöneticiler" denir.
export function yukseltmeCumlesi(kademe: number, yukseltGun: number | null, rolAdlari: readonly string[], kisiVar: boolean): string | null {
  if (yukseltGun === null) return null;
  const gun = `${String(yukseltGun)} gün`;
  if (kademe === 1) return `Bu kayıt ${gun}dür kapanmadığı için sana da gönderildi.`;
  if (rolAdlari.length === 0 && !kisiVar) return null;
  const kime = rolAdlari.length === 0 ? 'yöneticiler' : rolAdlari.length === 1 ? `${rolAdlari[0] ?? ''} rolü` : `${rolAdlari.join(', ')} rolleri`;
  return `${gun} içinde kapanmazsa ${kime} de alır.`;
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

// BIL-46: kişi e-postayı alır mı: tür açık ve kişi e-posta seçebilen (operatör değil, BIL-2). Kişi tercihi yoktur (3435-1).
export const kisiEpostaAlir = (turAcik: boolean, islemler: readonly string[]): boolean => turAcik && epostaSecilebilir(islemler);

// BIL-47: tekrar ve kademe kaynak bildirim açıkken sürer: görev ve hatırlatma yapılana, bilgi okunana dek; arşivlenen kapanmıştır.
export const bildirimAcikMi = (b: { sinif: BildirimSinifi; okundu: string | null; arsivlendi: string | null; yapildi: string | null }): boolean =>
  b.arsivlendi === null && (b.sinif === 'bilgi' ? b.okundu === null : b.yapildi === null);

// BIL-48: geçici hatada en çok 3 deneme; aralık 5, 15 dakika. Kalıcı hata ya da son deneme deftere "gönderilemedi" yazılır.
export const EPOSTA_DENEME_EN_COK = 3;
export const sonrakiDenemeDk = (deneme: number): number | null => (deneme >= EPOSTA_DENEME_EN_COK ? null : [5, 15][deneme - 1] ?? 15);

// --- Kademeli uyarı (3405) ----------------------------------------------------------------------------------------------

// Kaynağın geçerli ayarı: satırı olmayan kaynakta katalog varsayılanı. Sayaç kaynağın tanımındadır, ayarla değişmez.
export interface KademeKurali {
  sayac: KademeSayaci;
  k2Gun: number | null;
  k3Gun: number | null;
  k4Gun: number | null;
  k5Gun: number | null;
  // 3418 a: bekleme sayacında k3Gun saat olabilir; verilmezse gündür.
  k3Birim?: KademeBirimi;
}

const tarihEkle = (t: string, g: number): string => new Date(Date.parse(`${t}T00:00:00Z`) + g * 86_400_000).toISOString().slice(0, 10);

// bas'tan bit'e kadar (bas hariç, bit dahil) iş günü: hafta sonu ve resmi tatil sayılmaz; bit öndeyse eksi.
export function isGunuFarki(bas: string, bit: string, tatiller: ReadonlySet<string>): number {
  if (bas === bit) return 0;
  const yon = bit > bas ? 1 : -1;
  let sayi = 0;
  for (let t = tarihEkle(bas, yon); ; t = tarihEkle(t, yon)) {
    const gun = new Date(`${t}T00:00:00Z`).getUTCDay();
    if (gun !== 0 && gun !== 6 && !tatiller.has(t)) sayi += 1;
    if (t === bit) return yon * sayi;
  }
}

const isGunuMu = (t: string, tatiller: ReadonlySet<string>): boolean => {
  const gun = new Date(`${t}T00:00:00Z`).getUTCDay();
  return gun !== 0 && gun !== 6 && !tatiller.has(t);
};

// 3418 a: bas anından bit anına iş günlerinde geçen süre (saat). Gün, tesis takvim günüdür; hafta sonu ve resmi tatil sayılmaz,
// iş günündeki mesai dışı saatler sayılır. `esik` verilirse sürenin o saate ulaştığı tesis günü de döner (ulaşmadıysa null).
export function isSaatiFarki(bas: number, bit: number, tatiller: ReadonlySet<string>, esik: number | null = null): { saat: number; esikGunu: string | null } {
  let ms = 0;
  let esikGunu: string | null = null;
  if (bit <= bas) return { saat: 0, esikGunu: null };
  const son = tesisGunu(bit);
  for (let t = tesisGunu(bas); t <= son; t = tarihEkle(t, 1)) {
    if (!isGunuMu(t, tatiller)) continue;
    const pay = Math.min(bit, tesisGunBasi(tarihEkle(t, 1))) - Math.max(bas, tesisGunBasi(t));
    if (pay <= 0) continue;
    ms += pay;
    if (esik !== null && esikGunu === null && ms >= esik * 3_600_000) esikGunu = t;
  }
  return { saat: ms / 3_600_000, esikGunu };
}

// Kaydın bugün ulaşması gereken kademeler ve gecikme günü (iş günü; gecikmenin ilk günü 1). 3396'nın kuralıdır:
// son gün sayacında K2 son güne en çok `k2Gun` iş günü kala, K3 son gün geçince; bekleme sayacında K3 `k3Gun` iş günü bekleyince.
// Saat biriminde K3, başlangıç anından iş günlerinde `k3Gun` saat geçince; gecikmenin ilk günü sınırın aşıldığı gündür.
// K4 ve K5 gecikmenin `k4Gun`'üncü ve `k5Gun`'üncü iş gününde. Yapanı olmayan kayıt K1-K3'e girmez ama gecikince yukarı çıkar:
// atanmamış iş de yapılmamış iştir. Tarihi olmayan kayıt hiçbir kademeye girmez (sıfır uydurulmaz).
export function gerekenKademeler(
  kayit: { sonGun: string | null; baslangic: string | null; baslangicAni?: string | null; yapanVar: boolean }, kural: KademeKurali, bugun: string,
  tatiller: ReadonlySet<string>, simdi: number = tesisGunBasi(bugun),
): { kademeler: number[]; gecikme: number | null } {
  const l: number[] = [];
  if (kayit.yapanVar) l.push(1);
  let gecikme: number | null = null;
  if (kural.sayac === 'son-gun') {
    if (kayit.sonGun === null) return { kademeler: l, gecikme: null };
    if (kayit.yapanVar && kural.k2Gun !== null && isGunuFarki(bugun, kayit.sonGun, tatiller) <= kural.k2Gun) l.push(2);
    if (bugun > kayit.sonGun) gecikme = Math.max(0, isGunuFarki(kayit.sonGun, bugun, tatiller));
  } else {
    if (kayit.baslangic === null || kural.k3Gun === null) return { kademeler: l, gecikme: null };
    if (kural.k3Birim === 'saat') {
      // Anı vermeyen kaynakta bekleme başlangıç gününün başından sayılır.
      const ani = kayit.baslangicAni ?? null;
      const an = ani === null ? tesisGunBasi(kayit.baslangic) : Date.parse(ani);
      const { esikGunu } = isSaatiFarki(an, simdi, tatiller, kural.k3Gun);
      if (esikGunu !== null) gecikme = Math.max(0, isGunuFarki(esikGunu, bugun, tatiller)) + 1;
    } else {
      const bekleme = Math.max(0, isGunuFarki(kayit.baslangic, bugun, tatiller));
      if (bekleme >= kural.k3Gun) gecikme = bekleme - kural.k3Gun + 1;
    }
  }
  if (gecikme === null) return { kademeler: l, gecikme: null };
  if (kayit.yapanVar) l.push(3);
  if (kural.k4Gun !== null && gecikme >= Math.max(1, kural.k4Gun)) l.push(4);
  if (kural.k5Gun !== null && gecikme >= Math.max(1, kural.k5Gun)) l.push(5);
  return { kademeler: l, gecikme };
}

// Kesintiden sonra yalnız en yüksek yeni kademe bildirilir; aradakiler bildirimsiz deftere girer. K1 hiç bildirilmez (atama zili ayrıdır).
export function bildirilecekKademe(gereken: readonly number[], yazilmis: ReadonlySet<number>): { yeni: number[]; bildirilecek: number | null } {
  const yeni = gereken.filter((k) => !yazilmis.has(k));
  const en = yeni.length === 0 ? null : Math.max(...yeni);
  return { yeni, bildirilecek: en === null || en === 1 ? null : en };
}

// Ayar yazımı: günlerin anlamı sayaca göre değişir. Sırası bozuk gün (K5, K4'ten önce) reddedilir; ekran da aynı denetimi yapar.
export function kademeAyarHatasi(
  sayac: KademeSayaci, g: { acik: boolean; k2Gun: number | null; k3Gun: number | null; k4Gun: number | null; k5Gun: number | null; k3Birim?: KademeBirimi },
): { mesaj: string; alan: string } | null {
  if (sayac === 'son-gun' && g.k3Birim === 'saat') return { mesaj: 'Saat birimi yalnız bekleme süresi sayılan kaynakta seçilir.', alan: 'k3Birim' };
  if (sayac === 'bekleme' && g.k3Birim === 'saat' && g.k3Gun !== null && g.k3Gun < 1) return { mesaj: 'Gecikti için en az 1 saat gerekir.', alan: 'k3Gun' };
  if (sayac === 'bekleme' && g.k2Gun !== null) return { mesaj: 'Bu kaynakta Yaklaşıyor kademesi yoktur.', alan: 'k2Gun' };
  if (sayac === 'son-gun' && g.k3Gun !== null) return { mesaj: 'Bu kaynakta Gecikti son gün geçince başlar; gün yazılmaz.', alan: 'k3Gun' };
  if (sayac === 'bekleme' && g.acik && g.k3Gun === null) return { mesaj: 'Gecikti için bekleme günü gerekir.', alan: 'k3Gun' };
  if (g.k4Gun !== null && g.k5Gun !== null && g.k5Gun <= g.k4Gun) return { mesaj: 'Devret, Yöneticide kademesinden sonra gelmelidir.', alan: 'k5Gun' };
  return null;
}

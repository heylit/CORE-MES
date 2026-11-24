import type { Db } from '#cekirdek/db.ts';
import { gecersiz } from '#cekirdek/hata.ts';
import type { LogoBelirsizKontrolCevabi, LogoKontrolluGonderCevabi } from '#paylasilan/sozlesme/logo.ts';
import { talepNoSayiKimligiyle } from '../satin-alma/disari.ts';
import { logoSiraBelgeleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu } from '../siparisler/disari.ts';
import { baglanacakBelge } from './elle-bag.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS, baglamaUyumu, kontrolEdilebilirMi, KONTROL_ARAMA_TURU, kontrolKarari, kontrolSinifi, type LogoBelgeBulgusuHam } from './kurallar.ts';
import { BEKLEME_NEDENLERI, BELGE_ARAMA_GUN, LOGO_BELGE_ARAMA_KAPALI, logoBelgeAramasiAcik } from './servis.ts';
import type { TxAcan } from './servis.ts';
import * as s from './sorgular.ts';

// 3626: sonucu bilinmeyen belgeyi önce Logo'da arayıp gönderme. İki adım, kart #3626 kararı "önce Logo'da kontrol":
// (1) kontrol (GET, transaction dışı): belgeyi tam numarasıyla arar, kararı kişinin süreç belleğinde tutar, hiçbir şey yazmaz;
// (2) gönderme (POST): bellekteki kararı uygular, köprüye gitmez. Bulunduysa belge gönderilmez ve Logo kaydına eşlenir; yoksa sıraya girer.
// Kontrol yapılamıyorsa (arama kapalı, yardımcı yanıtsız, sonuç sınıra dayandı, numara birden çok, kayıt iptal, başka belgeye bağlı) belgeye dokunulmaz.

// Onaydaki ikinci arama transaction içinde koşar: yardımcı geç kalırsa işlem sunucu hatasıyla düşmesin, kullanıcı yeniden denesin.
const YENIDEN_ARAMA_SURESI_MS = 8_000;
const KARAR_OMRU_MS = 2 * 60_000;
interface Karar { zaman: number; karar: 'bulundu' | 'yok'; kayitNo: string | null }
const kararlar = new Map<string, Karar>();
const anahtar = (kisiId: number, belge: string, no: number): string => `${String(kisiId)}:${belge}:${String(no)}`;
export function kararlariSifirla(): void {
  kararlar.clear();
}

export interface KontrolIstegi { belge: string; no: number; islem: 'gonder' | 'pasif' }

const yapilamadi = (ileti: string): LogoBelirsizKontrolCevabi => ({ karar: 'yapilamadi', ileti, logoKayitNo: null });

const SINIF_ILETISI = {
  kendiliginden: "Bu belge kendiliğinden yeniden denenir: her turda önce Logo'da var mı okunur. Yaklaşık 5 dakika bekleyin.",
  yok: "Bu belge türünde Logo'da numarayla kontrol yolu yok. Logo'da bakın; belge oradaysa belgenin kendi ekranından \"Logo'da ara\" ile bağlayın.",
} as const;

// Belgenin Logo'ya gönderilen numarası: talepte talep numarası, satışta Siparişler'in Logo sırasındaki (sürümlü) numara. Satışta CORE cari kodu da döner.
interface BelgeKimligi { no: string; cariKodu: string | null; siraTuru: 'teklif' | 'siparis' | null }
async function belgeKimligi(db: Db, belge: string, no: number): Promise<BelgeKimligi | null> {
  if (belge === 'talep') {
    const n = await talepNoSayiKimligiyle(db, no);
    return n === null ? null : { no: n, cariKodu: null, siraTuru: null };
  }
  const siraTuru = belge === 'siparisler-teklifi' ? 'teklif' : 'siparis';
  const belgeId = (await logoSiraBelgeleri(db, siraTuru, [no]))[0]?.belgeId;
  if (belgeId === undefined) return null;
  const b = await baglanacakBelge(db, siraTuru === 'teklif' ? 'teklif' : 'satis-siparisi', belgeId);
  return b.no === null ? null : { no: b.no, cariKodu: b.cariKodu, siraTuru };
}

// Son denemenin cevabı gelmemiş olabilir: Logo isteği hâlâ işliyorsa belge "yok" görünür ve onayla çift kayıt olur. Tur de aynı süreyi bekler.
async function uygunSatir(db: Db, g: KontrolIstegi, simdi: Date): Promise<{ satir: s.GidenSatiri } | { ileti: string }> {
  const satir = await s.gidenSatiri(db, g.belge as s.BelgeTuru, g.no, g.islem);
  if (satir === null) return { ileti: 'Belge giden kutusunda yok.' };
  if (kontrolEdilebilirMi({ belgeTuru: g.belge, islem: g.islem, sonSonuc: satir.sonSonuc, sonHata: satir.sonHata })) {
    const kalan = satir.sonDeneme === null ? 0 : satir.sonDeneme.getTime() + BELIRSIZ_BEKLEME_MS - simdi.getTime();
    if (kalan > 0) return { ileti: `Son deneme yeni; Logo hâlâ işliyor olabilir. ${String(Math.ceil(kalan / 60_000))} dakika sonra yeniden kontrol edin.` };
    return { satir };
  }
  const sinif = kontrolSinifi(g.belge);
  if (sinif !== 'ara' && (satir.sonSonuc === 'belirsiz' || satir.sonSonuc === 'reddedildi')) return { ileti: SINIF_ILETISI[sinif === 'yok' ? 'yok' : 'kendiliginden'] };
  return { ileti: 'Belgenin sonucu belirsiz değil; kontrol gerekmez.' };
}

export async function logoKontrol(
  vt: TxAcan, kopru: KopruIstemcisi | null, kisiId: number, g: KontrolIstegi, saat: () => Date = () => new Date(),
): Promise<LogoBelirsizKontrolCevabi> {
  if (!s.belgeTuruMu(g.belge)) throw gecersiz(`Bilinmeyen belge türü: ${g.belge}`);
  kararlar.delete(anahtar(kisiId, g.belge, g.no));
  const on = await vt.tx(async (db) => {
    const u = await uygunSatir(db, g, saat());
    if ('ileti' in u) return yapilamadi(u.ileti);
    if (!(await logoBelgeAramasiAcik(db))) return yapilamadi(LOGO_BELGE_ARAMA_KAPALI);
    const gun = 86_400_000;
    if (u.satir.sonDeneme !== null && saat().getTime() - u.satir.sonDeneme.getTime() > BELGE_ARAMA_GUN * gun) {
      return yapilamadi(`Belge ${String(BELGE_ARAMA_GUN)} günden eski; Logo araması bu kadar geriye bakmaz. Logo'da elle bakın.`);
    }
    const k = await belgeKimligi(db, g.belge, g.no);
    return k === null ? yapilamadi('Belgenin numarası bulunamadı; kontrol yapılamadı.') : k;
  });
  if ('karar' in on) return on;
  if (kopru === null) return yapilamadi(BEKLEME_NEDENLERI['ortam-degiskeni-yok']);
  const tur = KONTROL_ARAMA_TURU[g.belge];
  if (tur === undefined) return yapilamadi(SINIF_ILETISI.yok);
  // Yalnız GET; köprü cevabı transaction dışında beklenir.
  const r = await kopru.belgeAra(tur, on.no, BELGE_ARAMA_GUN);
  if (r.tur !== 'basarili') return yapilamadi(`Logo yardımcısına sorulamadı: ${r.ileti}`);
  const k = kontrolKarari(on.no, r.veri);
  if (k.karar === 'yapilamadi') return k.ileti === undefined ? yapilamadi('Kontrol yapılamadı.') : yapilamadi(k.ileti);
  if (k.karar === 'yok') {
    kararlar.set(anahtar(kisiId, g.belge, g.no), { zaman: saat().getTime(), karar: 'yok', kayitNo: null });
    return { karar: 'yok', ileti: "Logo'da bu numaralı belge yok; gönderilebilir.", logoKayitNo: null };
  }
  return vt.tx(async (db) => bulunduKarari(db, kisiId, g, on, k.bulgu, saat()));
}

async function bulunduKarari(db: Db, kisiId: number, g: KontrolIstegi, k: BelgeKimligi, bulgu: LogoBelgeBulgusuHam, simdi: Date): Promise<LogoBelirsizKontrolCevabi> {
  const kayitNo = String(bulgu.logoKayitNo);
  if (k.siraTuru === null) {
    return yapilamadi(`Logo'da var (kayıt ${kayitNo}). Talep fişi satırları Logo satırlarıyla eşlenemediği için belge bağlanmadı ve gönderilmedi; Logo'da kontrol edin.`);
  }
  const baska = (await s.logoKaydinaGidenler(db, g.belge, [kayitNo])).find((x) => x.belgeNo !== g.no);
  const neden = baglamaUyumu(k.siraTuru === 'teklif' ? 'teklif' : 'satis-siparisi', { cariKodu: k.cariKodu, projeKodu: null },
    { iptal: bulgu.iptal, cariKodu: bulgu.cariKodu, projeKodu: bulgu.projeKodu, baskaBagli: baska !== undefined });
  if (neden !== null) return yapilamadi(`Logo'da var (kayıt ${kayitNo}) ama bu belgeyle eşlenemedi: ${neden}`);
  kararlar.set(anahtar(kisiId, g.belge, g.no), { zaman: simdi.getTime(), karar: 'bulundu', kayitNo });
  return { karar: 'bulundu', ileti: `Logo'da var (kayıt ${kayitNo}); gönderilmez, belge bu kayda eşlenir.`, logoKayitNo: kayitNo };
}

export async function logoKontrolluGonder(db: Db, kopru: KopruIstemcisi | null, kisiId: number, g: KontrolIstegi, simdi: Date, aramaSuresiMs = YENIDEN_ARAMA_SURESI_MS): Promise<LogoKontrolluGonderCevabi> {
  if (!s.belgeTuruMu(g.belge)) throw gecersiz(`Bilinmeyen belge türü: ${g.belge}`);
  const a = anahtar(kisiId, g.belge, g.no);
  const karar = kararlar.get(a);
  kararlar.delete(a);
  const degisti = (ileti: string): LogoKontrolluGonderCevabi => ({ sonuc: 'degisti', ileti, logoKayitNo: null });
  if (karar === undefined || simdi.getTime() - karar.zaman > KARAR_OMRU_MS) return degisti('Kontrol sonucu eski ya da yok; yeniden kontrol edin. Belgeye dokunulmadı.');
  const u = await uygunSatir(db, g, simdi);
  if ('ileti' in u) return degisti(`${u.ileti} Belgeye dokunulmadı.`);
  if (karar.karar === 'yok') {
    // Kontrolden sonra Logo'ya elle giriş olabilir; göndermeden hemen önce yeniden aranır. Emin olunamazsa belgeye dokunulmaz.
    const k = await belgeKimligi(db, g.belge, g.no);
    const tur = KONTROL_ARAMA_TURU[g.belge];
    if (k === null || tur === undefined) return degisti('Belgenin numarası bulunamadı; gönderilmedi. Belgeye dokunulmadı.');
    if (kopru === null) return degisti(`${BEKLEME_NEDENLERI['ortam-degiskeni-yok']} Gönderilmedi. Belgeye dokunulmadı.`);
    let sayac: NodeJS.Timeout | undefined;
    const r = await Promise.race([
      kopru.belgeAra(tur, k.no, BELGE_ARAMA_GUN),
      new Promise<null>((coz) => { sayac = setTimeout(() => { coz(null); }, aramaSuresiMs); }),
    ]).finally(() => { clearTimeout(sayac); });
    if (r === null) return degisti("Logo yanıt vermedi; gönderilmedi. Biraz sonra yeniden kontrol edip deneyin. Belgeye dokunulmadı.");
    if (r.tur !== 'basarili') return degisti(`Gönderme öncesi Logo'ya yeniden sorulamadı (${r.ileti}); gönderilmedi. Belgeye dokunulmadı.`);
    const son = kontrolKarari(k.no, r.veri);
    if (son.karar === 'bulundu') return degisti(`Logo'da bu arada belge çıktı (kayıt ${String(son.bulgu.logoKayitNo)}); gönderilmedi. Yeniden kontrol edin. Belgeye dokunulmadı.`);
    if (son.karar !== 'yok') return degisti(`Gönderme öncesi yeniden kontrol yapılamadı; gönderilmedi. ${son.ileti ?? ''} Belgeye dokunulmadı.`.replace('  ', ' '));
    return (await s.belirsizYenidenAc(db, g.belge as s.BelgeTuru, g.no, simdi, g.islem))
      ? { sonuc: 'gonderime-alindi', ileti: "Logo'da yok; gönderime alındı. İlk turda gider.", logoKayitNo: null }
      : degisti('Belge arada değişti. Belgeye dokunulmadı.');
  }
  const kayitNo = karar.kayitNo;
  if (kayitNo === null) return degisti('Kontrol sonucu eksik; yeniden kontrol edin.');
  const sira = g.belge === 'siparisler-teklifi' ? 'teklif' : g.belge === 'siparisler-siparisi' ? 'siparis' : null;
  if (sira === null) return degisti('Bu belge türü Logo kaydına eşlenemez. Belgeye dokunulmadı.');
  const baska = (await s.logoKaydinaGidenler(db, g.belge, [kayitNo])).find((x) => x.belgeNo !== g.no);
  if (baska !== undefined) return degisti("Logo kaydı bu arada başka bir CORE belgesine bağlandı. Belgeye dokunulmadı.");
  if (sira === 'teklif') await satisTeklifiLogoSonucu(db, g.no, { kayitNo, satirlar: [] });
  else await satisSiparisiLogoSonucu(db, g.no, { kayitNo, satirlar: [] });
  await s.denemeYaz(db, g.belge as s.BelgeTuru, g.no, { zaman: simdi, sonuc: 'zaten-vardi', hata: null, logoKayitNo: kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true }, g.islem);
  return { sonuc: 'eslendi', ileti: `Logo'da var (kayıt ${kayitNo}); eşlendi, gönderilmedi.`, logoKayitNo: kayitNo };
}

import type { Db } from '#cekirdek/db.ts';
import type { EkranHatalariCevabi, EkranHatasiDonemi, EkranHatasiGovdesi } from '#paylasilan/sozlesme/saglik.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { EKRAN_HATASI_HIZ_PENCERESI_MS, ekranHatasiHizAsildiMi, ekranHatasiParmagi } from './kurallar.ts';
import { ekranHatalariOku, ekranHatasiSayisi, ekranHatasiSonAni, ekranHatasiYaz, suresiGecenEkranHatalariniSil } from './sorgular.ts';

export const EKRAN_HATASI_SAKLAMA_GUN = 90;
const GUN_MS = 86_400_000;
const DONEM_MS: Record<EkranHatasiDonemi, number> = { '24s': GUN_MS, '7g': 7 * GUN_MS, '90g': EKRAN_HATASI_SAKLAMA_GUN * GUN_MS };
const LISTE_EN_COK = 100;

// Kişi başına istek anları (bellekte; yeniden başlatmada sıfırlanır). Sınır kötü niyete değil, her saniye yenilenen bir ekranın
// defteri ve tabloyu doldurmasına karşıdır.
const istekAnlari = new Map<number, number[]>();

export function ekranHatasiHiziniDene(kisiId: number, simdi: number): void {
  const yeni = (istekAnlari.get(kisiId) ?? []).filter((a) => simdi - a < EKRAN_HATASI_HIZ_PENCERESI_MS);
  if (ekranHatasiHizAsildiMi(yeni, simdi)) {
    istekAnlari.set(kisiId, yeni);
    throw new UygulamaHatasi('COK_ISTEK', 'Çok sık ekran hatası bildirimi; biraz sonra yeniden denenir.');
  }
  yeni.push(simdi);
  istekAnlari.set(kisiId, yeni);
  if (istekAnlari.size > 1000) for (const [k, v] of istekAnlari) if (v.every((a) => simdi - a >= EKRAN_HATASI_HIZ_PENCERESI_MS)) istekAnlari.delete(k);
}

export const ekranHatasiHiziniSifirla = (): void => istekAnlari.clear();

// Kişi istemciden gelmez: oturumdaki kişi yazılır. Aynı hata (sayfa + ileti + yığının ilk satırı) tek satırda sayılır.
export async function ekranHatasiKaydet(db: Db, kisiId: number, g: EkranHatasiGovdesi): Promise<void> {
  ekranHatasiHiziniDene(kisiId, Date.now());
  const sayfa = g.sayfa.split(/[?#]/, 1)[0] ?? '';
  await ekranHatasiYaz(db, { parmakIzi: ekranHatasiParmagi(sayfa, g.hata, g.yigin), sayfa, hata: g.hata, yigin: g.yigin, surum: g.surum, kisiId });
}

export async function ekranHatalariListesi(db: Db, donem: EkranHatasiDonemi, simdi: Date): Promise<EkranHatalariCevabi> {
  const satirlar = await ekranHatalariOku(db, new Date(simdi.getTime() - DONEM_MS[donem]), LISTE_EN_COK);
  const son24Saat = await ekranHatasiSayisi(db, new Date(simdi.getTime() - DONEM_MS['24s']));
  const toplam = donem === '24s' ? son24Saat : await ekranHatasiSayisi(db, new Date(simdi.getTime() - DONEM_MS[donem]));
  const sonBildirim = await ekranHatasiSonAni(db);
  return { donem, son24Saat, toplam, enCok: LISTE_EN_COK, sonBildirim: sonBildirim?.toISOString() ?? null, satirlar: satirlar.map((s) => ({ ...s, ilkAn: s.ilkAn.toISOString(), sonAn: s.sonAn.toISOString() })) };
}

export const ekranHatasiTemizligi = (db: Db, simdi: Date): Promise<number> => suresiGecenEkranHatalariniSil(db, simdi, EKRAN_HATASI_SAKLAMA_GUN);

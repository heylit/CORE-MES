import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { COKUS_KLASORU } from '#cekirdek/cokus-raporu.ts';
import type { Db } from '#cekirdek/db.ts';
import { SUREN_ISTEKLER_DOSYASI, type SurenIstekDosyasi } from '#cekirdek/suren-istekler-dosyasi.ts';
import type { AcilisBaglami } from '#cekirdek/surec.ts';
import { metrikDakikasiSemasi } from '#paylasilan/sozlesme/saglik.ts';
import type { KapanmaAyrintisi, KapanmaHataSatiri, KapanmaNedeni, KapanmaSatiri, KapanmaSurenIstegi, MetrikDakikasi } from '#paylasilan/sozlesme/saglik.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { gunlukOku } from './gunluk-okuyucu.ts';
import {
  KAPANMA_HATA_SATIRI_EN_COK, KAPANMA_ONCESI_DAKIKA, KAPANMA_SAKLAMA_GUN, bekciSatiriCoz, cokusRaporunuYorumla, kapanmaBildirimMetni, kapanmaNedeniBelirle,
  sonKapanisiBul,
} from './kurallar.ts';
import type { BekciSatiri, CokusRaporuOzeti } from './kurallar.ts';
import { kapanmaEkle, kapanmaOku, kapanmalariListele, metrikDakikalariOku, suresiGecenKapanmalariSil } from './sorgular.ts';
import type { KapanmaSatiriHam } from './sorgular.ts';

// Önceki kapanışın kaydı (kart 3668, A1): sunucu bekçi altında yeniden açılınca bir kez çalışır. Kaynaklar: bekçi günlüğü, Node tanı raporu,
// süren istekler dosyası, sunucu günlüğü ve dakikalık ölçüm. Bekçi satırı yoksa (ilk açılış, bekçisiz açılış) kayıt yazılmaz.
export const BEKCI_GUNLUGU = 'bekci.log';
export const ARSIV_KLASORU = 'arsiv';
const BEKCI_OKUMA_BAYT = 256 * 1024;
const RAPOR_PENCERESI_MS = 15 * 60_000;
const ONCE_MS = KAPANMA_ONCESI_DAKIKA * 60_000;
const GUN_MS = 86_400_000;

async function sonBayt(yol: string, en: number): Promise<string> {
  let f;
  try { f = await open(yol, 'r'); } catch { return ''; }
  try {
    const boy = (await f.stat()).size;
    const okunacak = Math.min(en, boy);
    const b = Buffer.alloc(okunacak);
    await f.read(b, 0, okunacak, boy - okunacak);
    return b.toString('utf8');
  } finally { await f.close(); }
}

export async function bekciSatirlariniOku(dizin: string): Promise<BekciSatiri[]> {
  const metin = await sonBayt(path.join(dizin, BEKCI_GUNLUGU), BEKCI_OKUMA_BAYT);
  return metin.split('\n').map(bekciSatiriCoz).filter((s): s is BekciSatiri => s !== null);
}

interface BulunanRapor { dosya: string; ozet: CokusRaporuOzeti }

async function cokusRaporuBul(dizin: string, kapandi: Date, acilis: Date): Promise<BulunanRapor | null> {
  const klasor = path.join(dizin, COKUS_KLASORU);
  let adlar: string[];
  try { adlar = await readdir(klasor); } catch { return null; }
  let enYeni: { dosya: string; ozet: CokusRaporuOzeti; an: number } | null = null;
  for (const ad of adlar.filter((a) => a.endsWith('.json'))) {
    const dosya = path.join(klasor, ad);
    try {
      const ozet = cokusRaporunuYorumla(JSON.parse(await readFile(dosya, 'utf8')) as unknown);
      if (ozet === null) continue;
      const an = ozet.an?.getTime() ?? (await stat(dosya)).mtimeMs;
      // Kapanıştan 15 dakika öncesi ile açılış arası; eski rapor başka kapanışındır.
      if (an < kapandi.getTime() - RAPOR_PENCERESI_MS || an > acilis.getTime()) continue;
      if (enYeni === null || an > enYeni.an) enYeni = { dosya, ozet, an };
    } catch { /* bozuk rapor atlanır */ }
  }
  return enYeni;
}

async function surenIstekleriOku(dizin: string, kapandi: Date): Promise<KapanmaSurenIstegi[]> {
  try {
    const d = JSON.parse(await readFile(path.join(dizin, SUREN_ISTEKLER_DOSYASI), 'utf8')) as SurenIstekDosyasi;
    if (!Array.isArray(d.istekler)) return [];
    return d.istekler.flatMap((i) => {
      const bas = Date.parse(i.baslangic);
      if (typeof i.yontem !== 'string' || typeof i.adres !== 'string' || Number.isNaN(bas)) return [];
      return [{ yontem: i.yontem, adres: i.adres, kisiId: Number.isInteger(i.kisiId) ? i.kisiId : null, sureSn: Math.max(0, Math.round((kapandi.getTime() - bas) / 1000)) }];
    });
  } catch { return []; }
}

async function arsivle(dizin: string, dosya: string, ad: string): Promise<void> {
  try {
    const hedef = path.join(dizin, COKUS_KLASORU, ARSIV_KLASORU);
    await mkdir(hedef, { recursive: true });
    await rename(dosya, path.join(hedef, ad));
  } catch { /* arşivlenemeyen dosya yerinde kalır; sonraki kapanış onu yeni kapanışa bağlamaz (zaman penceresi) */ }
}

export async function sonHataSatirlari(dizin: string, kapandi: Date): Promise<KapanmaHataSatiri[]> {
  const c = await gunlukOku(dizin, { duzey: 'hata', bitis: new Date(kapandi.getTime() + 5000).toISOString(), adet: KAPANMA_HATA_SATIRI_EN_COK });
  return c.satirlar.map((s) => ({ zaman: s.zaman, duzey: s.duzey, ileti: s.ileti, hataKodu: s.hataKodu, hata: s.hata })).reverse();
}

async function ekrandanYenidenBaslatildiMi(dizin: string, kapandi: Date): Promise<boolean> {
  const c = await gunlukOku(dizin, {
    duzey: 'bilgi', uc: '/sunucu-sureci/yeniden-baslat', baslangic: new Date(kapandi.getTime() - 2 * 60_000).toISOString(), bitis: new Date(kapandi.getTime() + 5000).toISOString(), adet: 1,
  });
  return c.satirlar.some((s) => s.yontem === 'POST' && s.durum !== null && s.durum < 300);
}

export async function kapanmayiKaydet(db: Db, b: Pick<AcilisBaglami, 'gunlukDizini' | 'acilis'>): Promise<number | null> {
  const kapanis = sonKapanisiBul(await bekciSatirlariniOku(b.gunlukDizini), b.acilis);
  if (kapanis === null) return null;
  const rapor = await cokusRaporuBul(b.gunlukDizini, kapanis.kapandiAn, b.acilis);
  const karar = kapanmaNedeniBelirle({
    bekci: kapanis, rapor: rapor?.ozet ?? null, ekrandanYenidenBaslatma: await ekrandanYenidenBaslatildiMi(b.gunlukDizini, kapanis.kapandiAn),
  });
  const dakikalar = (await metrikDakikalariOku<MetrikDakikasi>(db, new Date(kapanis.kapandiAn.getTime() - ONCE_MS), new Date(kapanis.kapandiAn.getTime() + 1)));
  const sonDakika = dakikalar[dakikalar.length - 1];
  const kapaliSn = Math.max(0, Math.round((b.acilis.getTime() - kapanis.kapandiAn.getTime()) / 1000));
  const id = await kapanmaEkle(db, {
    kapandiAn: kapanis.kapandiAn, acildiAn: b.acilis, kapaliSn, cikisKodu: kapanis.cikisKodu, sinyal: kapanis.sinyal, neden: karar.neden, kanit: karar.kanit,
    yigin: rapor?.ozet.yigin ?? null,
    hataSatirlari: await sonHataSatirlari(b.gunlukDizini, kapanis.kapandiAn),
    surenIstekler: await surenIstekleriOku(b.gunlukDizini, kapanis.kapandiAn),
    bellek: rapor?.ozet.bellek ?? (sonDakika === undefined ? null : { rssBayt: sonDakika.bellek.rssBayt, yiginBayt: sonDakika.bellek.yiginBayt }),
    dakikalar,
  });
  // Dosyalar kayıt yazıldıktan sonra arşivlenir: yazılamayan kayıt tanı kanıtını da yitirmesin.
  const damga = String(kapanis.kapandiAn.getTime());
  if (rapor !== null) await arsivle(b.gunlukDizini, rapor.dosya, `cokus-${damga}.json`);
  await arsivle(b.gunlukDizini, path.join(b.gunlukDizini, SUREN_ISTEKLER_DOSYASI), `suren-istekler-${damga}.json`);
  if (id !== null) {
    await bildirimGonder(db, {
      tur: 'saglik.sunucu-kapandi', baslik: 'Sunucu kapandı',
      metin: kapanmaBildirimMetni(kapanis.kapandiAn, kapaliSn, karar.neden, TESIS_SAAT_DILIMI), yol: `/ayarlar?sistem=kapanmalar&kayit=${String(id)}`, kaynakKimlik: String(id),
    });
  }
  return id;
}

// Açılış kancası: ana.ts dinlemeye başlayınca çalışır. Planlı güncelleme de kapanma sayılır (neden "güncelleme").
export async function kapanmaAcilisKancasi(b: AcilisBaglami): Promise<void> {
  await b.vt.tx((db) => kapanmayiKaydet(db, b));
}

const sat = (h: KapanmaSatiriHam): KapanmaSatiri => ({
  id: h.id, kapandiAn: h.kapandiAn.toISOString(), acildiAn: h.acildiAn.toISOString(), kapaliSn: h.kapaliSn, cikisKodu: h.cikisKodu, sinyal: h.sinyal, neden: h.neden as KapanmaNedeni,
});

export async function kapanmalarListesi(db: Db, simdi: Date): Promise<KapanmaSatiri[]> {
  return (await kapanmalariListele(db, new Date(simdi.getTime() - KAPANMA_SAKLAMA_GUN * GUN_MS), 500)).map(sat);
}

// Jsonb sütunları yazılırken sözleşme biçimindedir.
export async function kapanmaAyrintisi(db: Db, id: number): Promise<KapanmaAyrintisi | null> {
  const h = await kapanmaOku(db, id);
  if (h === null) return null;
  return {
    ...sat(h), kanit: h.kanit, yigin: h.yigin, hataSatirlari: h.hataSatirlari as KapanmaHataSatiri[], surenIstekler: h.surenIstekler as KapanmaSurenIstegi[],
    bellek: h.bellek as KapanmaAyrintisi['bellek'], // Sözleşme değişmeden önce yazılmış dakika bütün kaydı düşürmesin: o dakika atlanır.
    dakikalar: (Array.isArray(h.dakikalar) ? h.dakikalar : []).filter((d) => metrikDakikasiSemasi.safeParse(d).success) as MetrikDakikasi[],
  };
}

// Süresi geçen kayıt ve arşiv dosyaları silinir (90 gün).
export async function kapanmaTemizligi(db: Db, dizin: string, simdi: Date): Promise<{ kayit: number; dosya: number }> {
  const kayit = await suresiGecenKapanmalariSil(db, simdi, KAPANMA_SAKLAMA_GUN);
  let dosya = 0;
  const klasor = path.join(dizin, COKUS_KLASORU, ARSIV_KLASORU);
  let adlar: string[] = [];
  try { adlar = await readdir(klasor); } catch { /* arşiv yok */ }
  for (const ad of adlar) {
    try {
      const yol = path.join(klasor, ad);
      if (simdi.getTime() - (await stat(yol)).mtimeMs > KAPANMA_SAKLAMA_GUN * GUN_MS) { await rm(yol); dosya += 1; }
    } catch { /* silinemeyen dosya sonraki turda */ }
  }
  return { kayit, dosya };
}

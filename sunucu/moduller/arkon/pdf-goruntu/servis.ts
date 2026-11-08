// Sunucunun PDF sayfa görüntüsü (ADR 0032, kart 2339-S): zamanlayıcı turu yayındaki paketlerin PDF'lerini ayrı süreçte görüntüye çevirir;
// tablet hazır görüntüyü okuma ucundan alır, yoksa bugünkü gibi kendisi çizer (TeknikResim.tsx hazirGoruntu).
import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { modulDeposuTutamagi } from '../../dosya/disari.ts';
import { dosya } from '../servis.ts';
import { goruntuAyari, goruntuIsleri, ILETILER, PDF_AZAMI_BAYT, TUR_BASINA_KAYNAK } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import { goruntuSureci, type GoruntuSureci } from './surec.ts';

const DOSYALAR = modulDeposuTutamagi('arkon');
const DEPO_KAYDI = 'depo';

async function kaynakBaytlari(db: Db, ozet: string): Promise<Uint8Array | null> {
  const c = await DOSYALAR.dosyaAkisi(db, DEPO_KAYDI, ozet);
  if (c === null || c.boyut > PDF_AZAMI_BAYT) return null;
  const parcalar: Buffer[] = [];
  for await (const p of c.akis(db)) parcalar.push(p);
  return new Uint8Array(Buffer.concat(parcalar));
}

const anahtar = (kaynak: string, sayfa: number, imza: string): string => `${kaynak}#${String(sayfa)}#${imza}`;

// Bir tur: yetim görüntüler silinir, eksik görüntüsü olan en çok TUR_BASINA_KAYNAK kaynak işlenir. Çizim transaction dışında beklenir.
export async function goruntuTuru(vt: Veritabani, gunluk: Gunluk, surec: GoruntuSureci = goruntuSureci()): Promise<number> {
  const bekleyenler = await vt.tx(async (db) => {
    const kaynaklar = await sorgular.yayindakiPdfler(db);
    const ozetler = [...new Set(kaynaklar.map((k) => k.ozet))];
    await sorgular.yetimleriSil(db, ozetler);
    const var0 = new Set((await sorgular.varOlanImzalar(db, ozetler)).map((r) => anahtar(r.kaynak, r.sayfa, r.imza)));
    const sonuc: { ozet: string; sayfa: number; res: number; isler: ReturnType<typeof goruntuIsleri> }[] = [];
    const gorulen = new Set<string>();
    for (const k of kaynaklar) {
      const a = goruntuAyari(k.ayar);
      const isler = goruntuIsleri(a).filter((i) => !var0.has(anahtar(k.ozet, k.sayfa, i.imza)) && !gorulen.has(anahtar(k.ozet, k.sayfa, i.imza)));
      for (const i of isler) gorulen.add(anahtar(k.ozet, k.sayfa, i.imza));
      if (isler.length > 0) sonuc.push({ ozet: k.ozet, sayfa: k.sayfa, res: a.res, isler });
      if (sonuc.length >= TUR_BASINA_KAYNAK) break;
    }
    return sonuc;
  });
  for (const b of bekleyenler) {
    const veri = await vt.tx((db) => kaynakBaytlari(db, b.ozet));
    // Dosya depoda yoksa ya da sınırı aşıyorsa yazılmaz: dosya sonra gelirse tur yeniden dener; sınır aşımı tabletin işidir.
    if (veri === null) continue;
    const yanit = await surec.hazirla({ veri, sayfa: b.sayfa, res: b.res, isler: b.isler });
    await vt.tx(async (db) => {
      if (yanit.tamam) {
        const uretilen = new Set<string>();
        for (const g of yanit.goruntuler) {
          uretilen.add(g.imza);
          await sorgular.goruntuYaz(db, b.ozet, b.sayfa, g.imza, { genislik: g.genislik, yukseklik: g.yukseklik, png: Buffer.from(g.png), sureMs: yanit.sureMs });
        }
        // Sayfa ekrandan küçükse tablet sığan görüntüyü ayrıca çizmez; o imza "gerekmez" diye kapanır, her turda yeniden sorulmaz.
        for (const i of b.isler) if (!uretilen.has(i.imza)) await sorgular.goruntuYaz(db, b.ozet, b.sayfa, i.imza, { hata: 'Bu boy gerekmez.' });
      } else {
        if (!yanit.kalici) gunluk.uyar(`PDF görüntüsü hazırlanamadı (${b.ozet.slice(0, 12)}): ${yanit.hata}`);
        // Geçici hata da bir kez yazılır: aynı dosya her turda süreci yeniden düşürmesin. Tablet kendi yoluyla çizer.
        for (const i of b.isler) await sorgular.goruntuYaz(db, b.ozet, b.sayfa, i.imza, { hata: yanit.hata.slice(0, 200) });
      }
    });
  }
  return bekleyenler.length;
}

// Okuma: kişi kaynak dosyayı okuyabiliyorsa (Arkon'un dosya kuralı, servis.ts dosya) hazır görüntü verilir; yoksa boş döner ve tablet kendisi çizer.
// Telefon profili çizim almaz (1354 a): PDF'in türetilmiş görüntüsü de verilmez.
export async function pdfGoruntusu(db: Db, kullanici: Kullanici, ozet: string, sayfa: number, imza: string): Promise<IkiliCevap | null> {
  if (kullanici.cihazProfili === 'telefon') throw yetkiYok(ILETILER.telefon);
  await dosya(db, kullanici, ozet);
  const g = await sorgular.goruntu(db, ozet, sayfa, imza);
  if (g === null) return null;
  const png = g.png;
  return { tur: 'image/png', ad: `${ozet.slice(0, 12)}-${String(sayfa)}-${imza}.png`, boyut: png.length, akis: async function* () { yield png; } };
}

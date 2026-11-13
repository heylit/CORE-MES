import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { satirdaReddet } from '#cekirdek/toplu.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import { kaydetGovdesi, type RotaAdimTopluCevabi, type RotaAdimTopluGirdisi } from '#paylasilan/sozlesme/rota.ts';
import { ONAYDAKI_ROTA, ROTA_DEGISTI, TASLAK_AC, YENI_ADIM_EKSIK, excelAdimiUygula, excelDayanagiTutar, excelYeniAdimi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { icerikYazimlari } from './ortak.ts';
import { kaydet, taslakAc } from './revizyon.ts';

type Satir = RotaAdimTopluGirdisi['satirlar'][number];
type Yazim = ReturnType<typeof icerikYazimlari>[number] | NonNullable<ReturnType<typeof excelYeniAdimi>>;

const sayi = (x: number | string | null): number | null => (x === null ? null : Number(x));

// Okunan taslak adımı kaydet gövdesine çevrilir: sayısal sütunlar veritabanından metin gelebilir. bolumsuz: hazırlık toplamı Excel'den
// geldi (ya da adım yeni); bölüm alanları gönderilmez, kaydet bölümü kayıtlı işarete göre yeniden kurar (1310 a).
function gonderilecek(a: Yazim, bolumsuz: boolean): Record<string, unknown> {
  const { hazirlikDk, ayar, ayarDk, ...geri } = a;
  return {
    ...geri,
    ...(bolumsuz ? {} : { hazirlikDk: sayi(hazirlikDk), ayar, ayarDk: sayi(ayarDk) }),
    ayarSuresiDk: sayi(a.ayarSuresiDk), birimSureDk: sayi(a.birimSureDk), islemSuresiDk: sayi(a.islemSuresiDk), degisimSuresiDk: sayi(a.degisimSuresiDk),
    firePayiYuzde: Number(a.firePayiYuzde),
    adaylar: a.adaylar.map((x) => ({
      kaynak: x.kaynak, ayarSuresiDk: sayi(x.ayarSuresiDk), birimSureDk: sayi(x.birimSureDk), islemSuresiDk: sayi(x.islemSuresiDk), degisimSuresiDk: sayi(x.degisimSuresiDk),
    })),
    bilesenler: a.bilesenler.map((b) => ({ malzemeId: b.malzemeId, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
    yanUrunler: a.yanUrunler.map((y) => ({ malzemeId: y.malzemeId, miktar: Number(y.miktar) })),
    birlesen: [...a.birlesen],
  };
}

// Ürünün yazılacak taslağı: önizlemenin dayandığı revizyon (açık taslak ya da yürürlükteki, sürümüyle) hâlâ o değilse 409.
async function taslakBul(db: Db, kullanici: Kullanici, urunId: number, dayanak: Satir['dayanak']): Promise<{ id: number; surum: number; aciklama: string | null }> {
  const acik = await s.acikRevizyon(db, urunId);
  if (acik !== null && acik.durum !== 'taslak') throw gecersiz(ONAYDAKI_ROTA);
  if (acik !== null) {
    const r = await s.revizyonKilitle(db, acik.id);
    if (r === null) throw gecersiz('Taslak bulunamadı.');
    if (!excelDayanagiTutar(dayanak, { id: acik.id, surum: r.surum })) throw cakisma(ROTA_DEGISTI);
    return { id: acik.id, surum: r.surum, aciklama: r.aciklama };
  }
  const yururlukte = await s.yururluktekiRevizyonId(db, urunId);
  const kaynak = yururlukte === null ? null : await s.revizyonKilitle(db, yururlukte);
  if (!excelDayanagiTutar(dayanak, yururlukte === null || kaynak === null ? null : { id: yururlukte, surum: kaynak.surum })) throw cakisma(ROTA_DEGISTI);
  // Açık taslağı olmayan üründe Excel taslak açar: taslak açma ayrı eylemdir (3165 a). Uç tek transaction'dır, red hiçbir şey yazmaz.
  if (!islemVarMi(kullanici, TASLAK_AC)) throw yetkiYok('Bu üründe açık taslak yok; taslak açma yetkiniz olmadığı için Excel yazamaz.');
  const id = (await taslakAc(db, kullanici, urunId, yururlukte === null ? { tur: 'bos' } : { tur: 'revizyon', revizyonId: yururlukte })).id;
  const r = await s.revizyonKilitle(db, id);
  if (r === null) throw gecersiz('Taslak bulunamadı.');
  return { id, surum: r.surum, aciklama: r.aciklama };
}

// Excel ile rota adımları (2627): ürün başına taslak bulunur ya da açılır, satırlar adımlara işlenir ve taslak sayfanın kaydet
// komutuyla (aynı denetimler) yazılır. Hazırlık bölümü gelmeyen adımda kaydet eski bölümü korur. Uç tek transaction'dır.
export async function rotaAdimlariToplu(db: Db, kullanici: Kullanici, g: RotaAdimTopluGirdisi): Promise<RotaAdimTopluCevabi> {
  const urunler = new Map<number, Satir[]>();
  for (const x of g.satirlar) urunler.set(x.urunId, [...(urunler.get(x.urunId) ?? []), x]);
  const sira = (x: Satir) => g.satirlar.indexOf(x);
  let eklenen = 0;
  let guncellenen = 0;
  for (const [urunId, satirlar] of urunler) {
    const ilk = satirlar[0]!;
    const { id, surum, aciklama } = await satirdaReddet(sira(ilk), ilk.satir, () => taslakBul(db, kullanici, urunId, ilk.dayanak));
    const yazimlar: Yazim[] = icerikYazimlari(await s.icerikOku(db, id));
    const kaynakSatiri = new Map<number, Satir>();
    const bolumsuz = new Set<number>();
    for (const x of satirlar) {
      await satirdaReddet(sira(x), x.satir, () => {
        if (x.opNo === null) {
          const yeni = excelYeniAdimi(x);
          if (yeni === null) throw gecersiz(YENI_ADIM_EKSIK);
          yazimlar.push(yeni);
          kaynakSatiri.set(yazimlar.length - 1, x);
          bolumsuz.add(yazimlar.length - 1);
          eklenen += 1;
          return Promise.resolve();
        }
        const yer = yazimlar.findIndex((a) => a.opNo === x.opNo);
        const hedef = yazimlar[yer];
        if (hedef === undefined) throw gecersiz(`OP ${String(x.opNo)} bu ürünün taslağında yok.`);
        const sonuc = excelAdimiUygula(hedef, x);
        if ('hata' in sonuc) throw gecersiz(sonuc.hata);
        if (sonuc.hazirlikDegisti) bolumsuz.add(yer);
        kaynakSatiri.set(yer, x);
        guncellenen += 1;
        return Promise.resolve();
      });
    }
    const govde = kaydetGovdesi.safeParse({ surum, aciklama, adimlar: yazimlar.map((a, i) => gonderilecek(a, bolumsuz.has(i))) });
    if (!govde.success) {
      const sorun = govde.error.issues[0];
      const yer = typeof sorun?.path[1] === 'number' ? sorun.path[1] : null;
      const x = (yer === null ? undefined : kaynakSatiri.get(yer)) ?? ilk;
      await satirdaReddet(sira(x), x.satir, () => { throw dogrulama(sorun?.message ?? 'Adım geçersiz.', sorun?.path.join('.')); });
      continue;
    }
    try {
      await kaydet(db, kullanici, id, govde.data);
    } catch (hata) {
      // Kaydetin reddi adımı alanıyla söyler (adimlar.<i>...): satır o adımı getiren Excel satırıdır, yoksa ürünün ilk satırı.
      const yer = hata instanceof UygulamaHatasi ? /^adimlar\.(\d+)/.exec(hata.alan ?? '')?.[1] : undefined;
      const x = (yer === undefined ? undefined : kaynakSatiri.get(Number(yer))) ?? ilk;
      await satirdaReddet(sira(x), x.satir, () => { throw hata; });
    }
  }
  return { eklenen, guncellenen, taslaklar: urunler.size };
}

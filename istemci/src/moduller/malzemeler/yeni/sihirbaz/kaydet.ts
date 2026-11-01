import { useState } from 'react';
import * as K from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KartKaydi } from '../tipler.ts';
import { kayitHatasi, useKartKaydet, useReceteRotaKopyasi } from '../veri.ts';
import type { SihirbazAdimi } from './AdimCubugu.tsx';
import type { Sihirbaz } from './baglam.ts';
import { kopyala, RECETE_KAYNAGI, receteKaynagi, type Taslak } from './durum.ts';

// Prototipteki yeni kimlik biçimi ('m' kart, 't' şablon): sunucu kendi kimliğini dönerse o geçerlidir.
export function yeniKimlik(on: string, ek = ''): string {
  return on + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ek;
}

// Odak, adım çizildikten sonra verilir (prototipte setTimeout ile).
export function odakla(id: string, kaydir = false): void {
  window.setTimeout(() => {
    const e = document.getElementById(id);
    if (!e) return;
    if (kaydir) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else e.focus();
  }, 80);
}

export interface Kaydetme { calistir: () => Promise<void>; suruyor: boolean; ilerleme: string | null }

// Prototipte `saveItem` ve `saveVariants`. Denetim sırası ve iletiler prototipteki gibidir; son söz sunucunundur
// (kod, kategori, mükerrer gerekçesi ve sürüm uçta yeniden denetlenir).
export function useKaydet(s: Sihirbaz, adimlar: readonly SihirbazAdimi[]): Kaydetme {
  const kaydet = useKartKaydet();
  const kopyaIste = useReceteRotaKopyasi();
  const [ilerleme, ilerlemeYaz] = useState<string | null>(null);
  const { taslak: D, b, kartlar, adimaGec, bildir, secimYaz, degistir, sonaKoy } = s;
  const son = adimlar.length - 1;
  const ticariAdimi = () => (K.isGen(D, b) ? Math.max(1, adimlar.findIndex((a) => a.ozel === 'ticari' || a.ozel === 'alis')) : 5);

  const gonder = async (kayit: KartKaydi) => {
    const c = await kaydet.mutateAsync({ kayit, ozet: K.kartOzeti(kayit, b) });
    return { id: c.id || String(kayit.id), kod: c.stok_kodu || kayit.com.kod };
  };
  // Kart kaydedildikten sonra gider: kopya isteği başarısızsa kart yine kayıtlıdır, kullanıcı Reçete ve Rota'da kopyalayabilir.
  const receteRotaIste = async (kimlik: string, kaynak: { no: number; ad: string }) => {
    try {
      const c = await kopyaIste.mutateAsync({ kimlik, kaynakUrunId: kaynak.no });
      degistir((d) => { delete d[RECETE_KAYNAGI]; });
      bildir(c.durum === 'acildi'
        ? `${kaynak.ad} reçete ve rotası Reçete ve Rota'da taslak olarak açıldı.`
        : `Kart onaylanınca ${kaynak.ad} reçete ve rotası Reçete ve Rota'da taslak olarak açılacak.`, 'tamam');
    } catch (e) {
      bildir(`Kart kaydedildi; reçete ve rota kopyası istenemedi: ${kayitHatasi(e).ileti}`, 'hata');
    }
  };
  const hata = (e: unknown) => {
    const h = kayitHatasi(e);
    if (h.kod === 'kategori-yok') {
      const kat = D.g.kat;
      secimYaz({ katUyari: { mesaj: h.ileti, tur: D.tur, kat: typeof kat === 'string' ? kat : undefined } });
    }
    bildir(h.ileti, 'hata');
    return h.ileti;
  };

  const tekKart = async () => {
    const n = K.isGen(D, b) ? son : 3;
    for (let i = 0; i < n; i += 1) {
      if (!K.stepOk(i, D, b)) {
        bildir(`Önce ${(adimlar[i]?.ad ?? '').toLocaleLowerCase('tr')} adımını tamamla.`);
        adimaGec(i);
        return;
      }
    }
    const dupAyni = D.id ? [] : K.benzerKartlar(D, undefined, b).filter((r) => r.seviye === 'ayni');
    if (dupAyni.length && D._dupOk && !String(D._dupNeden ?? '').trim()) {
      bildir('Mükerrer kaydetmek için gerekçe yaz.');
      adimaGec(son);
      odakla('tc-my-mukerrer-neden');
      return;
    }
    const ilk = dupAyni[0];
    if (ilk && !D._dupOk) {
      bildir(`Aynı kart katalogda var: ${ilk.x.com.kod}. Farklı bir malzemeyse özetteki onay kutusunu işaretle.`);
      adimaGec(son);
      odakla('tc-my-mukerrer', true);
      return;
    }
    const kod = K.finalKod(D, b);
    if (kartlar.some((x) => x.kimlik !== D.id && x.kayit.com.kod === kod)) {
      bildir(`${kod} kodu katalogda zaten var${D._dupOk ? '; farklı malzeme olarak kaydetmek için ticari bilgilerde farklı bir kod yaz' : ''}. Kodu değiştir.`);
      adimaGec(ticariAdimi());
      odakla('tc-my-kod');
      return;
    }
    if (K.birimIstenir(D, b)) {
      bildir('Bu kartın birimi yok; stok birimini seçip kaydedin.');
      adimaGec(ticariAdimi());
      odakla('tc-my-stok-birimi');
      return;
    }

    let item: Taslak = kopyala(D);
    const kaynak = receteKaynagi(D);
    delete item[RECETE_KAYNAGI];
    item.id = D.id ?? yeniKimlik('m');
    item.com.kod = kod;
    item.com.ad = K.finalAd(D, b);
    // Ekranda görünen birim karta yazılır; birimi boş eski kart da böylece birimini alır.
    item.com.birim = K.finalBirim(item, b);
    item.updatedAt = Date.now();
    delete item.vmode;
    delete item.vsel;
    const onceki = D.id ? kartlar.find((x) => x.kimlik === D.id)?.kayit ?? null : null;
    item = K.kodlariSabitle(item, b);

    if (onceki && b.genel.onayAkisi && K.onayDurum(onceki, b) === 'aktif') {
      const f = K.diffItems(onceki, item, b);
      if (!f.length && !K.birimFarki(onceki, item, b) && !K.talepVar(onceki, b)) {
        bildir('Kartta değişiklik yok.');
        return;
      }
      const t = K.talepOlustur(onceki, item, b);
      try {
        const c = await gonder(t);
        const zaman = t.talep?.t ?? Date.now();
        degistir((d) => { d.talepGonderildi = zaman; });
        secimYaz({ sonKayit: c.id });
        bildir(`Değişiklik talebi gönderildi (${String(t.talep?.farklar.length ?? 0)} alan). ${c.kod} onaylanana kadar mevcut hâliyle kullanımda.`, 'tamam');
        if (kaynak) await receteRotaIste(c.id, kaynak);
      } catch (e) {
        hata(e);
      }
      return;
    }

    item = K.onayAta(K.withRev(item, onceki, b), onceki, b);
    if (item._dupOk && dupAyni.length) {
      item.mukerrerOnay = {
        by: b.kisi.id, byAd: b.kisi.ad, t: Date.now(), kartlar: dupAyni.map((r) => r.x.com.kod), neden: String(item._dupNeden ?? '').trim(),
      };
    }
    delete item._dupOk;
    delete item._dupNeden;
    if (!item.mukerrerOnay && onceki?.mukerrerOnay) item.mukerrerOnay = onceki.mukerrerOnay;
    try {
      const c = await gonder(item);
      degistir((d) => {
        d.id = c.id;
        d.com.kod = c.kod;
        d.rev = item.rev;
        d.onay = item.onay;
        delete d._dupOk;
      });
      secimYaz({ sonKayit: c.id });
      if (D.fam && D.grade) sonaKoy(D.fam, K.clsKeyFor(D, b), D.grade);
      bildir(`${c.kod} kaydedildi${K.onayDurum(item, b) === 'onayda' ? '; onaya gönderildi' : ''}.`, 'tamam');
      if (kaynak) await receteRotaIste(c.id, kaynak);
    } catch (e) {
      hata(e);
    }
  };

  const varyantlar = async () => {
    for (let i = 0; i < 2; i += 1) {
      if (!K.stepOk(i, D, b)) {
        bildir(`Önce ${(adimlar[i]?.ad ?? '').toLocaleLowerCase('tr')} adımını tamamla.`);
        adimaGec(i);
        return;
      }
    }
    const vs = K.variantList(D, b).filter((v) => !K.dimsErr(v, b)).slice(0, S.VMAX);
    if (!vs.length) {
      bildir('Kaydedilecek geçerli varyant yok.');
      adimaGec(2);
      return;
    }
    const varOlan = new Set(kartlar.map((x) => x.kayit.com.kod));
    let ok = 0;
    let skip = 0;
    let basarisiz: unknown = null;
    for (const [i, vd] of vs.entries()) {
      ilerlemeYaz(`${String(i + 1)} / ${String(vs.length)}`);
      const kod = K.variantKod(D, vd, [...varOlan], b);
      if (varOlan.has(kod) || K.benzerKartlar(vd, undefined, b).some((r) => r.seviye === 'ayni')) {
        skip += 1;
        continue;
      }
      let item: Taslak = kopyala(vd);
      delete item[RECETE_KAYNAGI];
      delete item.vmode;
      delete item.vsel;
      item.id = yeniKimlik('m', String(i));
      item.com.kod = kod;
      item.com.ad = K.variantAd(D, vd, b);
      item.com.birim = K.finalBirim(item, b);
      item.kodManual = true;
      item.adManual = true;
      item.updatedAt = Date.now();
      item = K.onayAta(K.withRev(K.kodlariSabitle(item, b), null, b), null, b);
      try {
        const c = await gonder(item);
        ok += 1;
        varOlan.add(c.kod);
      } catch (e) {
        basarisiz = e;
        break;
      }
    }
    secimYaz({ cokluKayit: { ok, skip } });
    if (basarisiz !== null) {
      const ileti = kayitHatasi(basarisiz).ileti;
      bildir(`${ileti} ${String(ok)} varyant kaydedilebildi.`, 'hata');
    } else {
      bildir(`${String(ok)} varyant kaydedildi${b.genel.onayAkisi && ok ? ' ve onaya gönderildi' : ''}${skip ? `, ${String(skip)} tanesi katalogda zaten olduğu için atlandı` : ''}.`, 'tamam');
    }
  };

  const calistir = async () => {
    if (kaydet.isPending) return;
    try {
      // Varyant modu yalnız yeni kartta: düzenlenen kart tek kart olarak kaydedilir.
      if (!D.id && K.variantList(D, b).length) await varyantlar();
      else await tekKart();
    } finally {
      ilerlemeYaz(null);
    }
  };

  return { calistir, suruyor: kaydet.isPending || kopyaIste.isPending || ilerleme !== null, ilerleme };
}

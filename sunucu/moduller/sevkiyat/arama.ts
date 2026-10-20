// Adres arama: semt, cadde, işyeri adları (dış veri paketi) ve kayıtlı noktalar; koordinat ve harita bağlantısından konum.
// Saf: dizin ve noktalar parametredir.

// Dış veri paketinin arama dosyası (alan adları dosya biçimidir).
export interface AramaVerisi {
  bbox: [number, number, number, number]; q: number; cats: string[]; ctx: string[];
  // [ad, boylam*q, enlem*q, kategori sırası, bağlam sırası (-1 yok)]
  items: [string, number, number, number, number][];
}

export interface AramaSonucu {
  ad: string; boylam: number; enlem: number; kategori: string; baglam: string | null;
  tur: 'yer' | 'koordinat' | 'nokta'; noktaId: number | null;
}

export interface ArananNokta { id: number; ad: string; adres: string | null; boylam: number; enlem: number }

// Türkçe duyarsız sadeleştirme: büyük/küçük harf, şapka ve Türkçe harfler.
export function sadelestir(metin: string): string {
  return metin.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface AramaDizini { veri: AramaVerisi; adlar: string[]; kelimeler: string[][]; baglamKelimeleri: string[][] }
export function aramaDiziniKur(veri: AramaVerisi): AramaDizini {
  const adlar = veri.items.map((x) => sadelestir(x[0]));
  return { veri, adlar, kelimeler: adlar.map((a) => a.split(' ')), baglamKelimeleri: veri.ctx.map((baglam) => sadelestir(baglam).split(' ')) };
}

// Harita sınırı: [batı, güney, doğu, kuzey]. Sayı çiftinin sırası sınıra düşen yorumla çözülür; sınır yoksa enlem önce.
export type Sinir = readonly [number, number, number, number];
const sinirIcinde = (sinir: Sinir | null, enlem: number, boylam: number) =>
  sinir !== null && boylam >= sinir[0] && boylam <= sinir[2] && enlem >= sinir[1] && enlem <= sinir[3];

function ciftOku(birinci: string, ikinci: string, boylamOnce: boolean, sinir: Sinir | null): { boylam: number; enlem: number } | null {
  let x = parseFloat(birinci.replace(',', '.')), y = parseFloat(ikinci.replace(',', '.'));
  if (boylamOnce) [x, y] = [y, x];
  if (sinirIcinde(sinir, x, y)) return { enlem: x, boylam: y };
  if (sinirIcinde(sinir, y, x)) return { enlem: y, boylam: x };
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 90 && Math.abs(y) <= 180 ? { enlem: x, boylam: y } : null;
}

// "39.97, 32.75", Google (@enlem,boylam; !3d..!4d..; q=..) ve Yandex (ll=boylam,enlem; pt=..) biçimleri.
// Kısa bağlantılar (goo.gl, maps.app.goo.gl) ağa çıkmadan çözülemez: 'kisa' döner.
export function konumCoz(metin: string, sinir: Sinir | null = null): { boylam: number; enlem: number } | 'kisa' | null {
  const temizMetin = metin.trim(); if (!temizMetin) return null;
  if (/goo\.gl|maps\.app\.goo|yandex\.[a-z.]+\/-\//i.test(temizMetin)) return 'kisa';
  const sayi = '(-?\\d{1,3}(?:[.,]\\d+)?)';
  let eslesme = temizMetin.match(new RegExp(`!3d${sayi}!4d${sayi}`));
  if (eslesme) return ciftOku(eslesme[1]!, eslesme[2]!, false, sinir);
  eslesme = temizMetin.match(new RegExp(`[?&](?:ll|pt|whatshere%5Bpoint%5D)=${sayi}(?:,|%2C)${sayi}`, 'i'));
  if (eslesme && /yandex/i.test(temizMetin)) return ciftOku(eslesme[1]!, eslesme[2]!, true, sinir);
  eslesme = temizMetin.match(new RegExp(`@${sayi},${sayi}`)) ?? temizMetin.match(new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=${sayi}(?:,|%2C)\\s*${sayi}`, 'i'));
  if (eslesme) return ciftOku(eslesme[1]!, eslesme[2]!, false, sinir);
  eslesme = temizMetin.match(/^\s*(-?\d{1,3}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/) ?? temizMetin.match(/^\s*(-?\d{1,3},\d+)\s*[; ]\s*(-?\d{1,3},\d+)\s*$/);
  if (eslesme) return ciftOku(eslesme[1]!, eslesme[2]!, false, sinir);
  return null;
}

export const ARAMA_SINIRI = 8;

// Kayıtlı noktalar önce; sonra adı (bağlamla birlikte) bütün kelimelerin önekiyle eşleşen yerler, puana göre.
export function ara(
  dizin: AramaDizini | null, noktalar: readonly ArananNokta[], metin: string, enCok = ARAMA_SINIRI, haritaSiniri: Sinir | null = dizin?.veri.bbox ?? null,
): AramaSonucu[] {
  const konum = konumCoz(metin, haritaSiniri);
  if (konum && konum !== 'kisa') return [{ ad: `${konum.enlem.toFixed(5)}, ${konum.boylam.toFixed(5)}`, boylam: konum.boylam, enlem: konum.enlem, kategori: 'Koordinat', baglam: null, tur: 'koordinat', noktaId: null }];
  const parcalar = sadelestir(metin).split(' ').filter(Boolean); if (!parcalar.length) return [];
  const sonuc: { sonucOgesi: AramaSonucu; puan: number }[] = [];
  for (const nokta of noktalar) {
    const kelimeler = sadelestir(nokta.ad + ' ' + (nokta.adres ?? '')).split(' ');
    if (parcalar.every((parca) => kelimeler.some((kayit) => kayit.startsWith(parca)))) sonuc.push({ sonucOgesi: { ad: nokta.ad, boylam: nokta.boylam, enlem: nokta.enlem, kategori: 'Kayıtlı nokta', baglam: nokta.adres, tur: 'nokta', noktaId: nokta.id }, puan: 1000 });
  }
  if (dizin) {
    const veri = dizin.veri, [bati, guney] = veri.bbox, olcek = veri.q, tam = parcalar.join(' ');
    for (let i = 0; i < veri.items.length; i++) {
      const kelimeler = dizin.kelimeler[i]!, kayit = veri.items[i]!, baglamKelimeleri = kayit[4] >= 0 ? dizin.baglamKelimeleri[kayit[4]]! : [];
      let adda = 0, uygun = true;
      for (const parca of parcalar) { if (kelimeler.some((y) => y.startsWith(parca))) adda++; else if (!baglamKelimeleri.some((y) => y.startsWith(parca))) { uygun = false; break; } }
      if (!uygun || !adda) continue;
      const ad = dizin.adlar[i]!;
      let puan = adda * 10 + (ad === tam ? 60 : ad.startsWith(tam) ? 30 : 0) + (kayit[3] === 0 ? 25 : kayit[3] === 1 ? 4 : 8) - ad.length * 0.15;
      if (kelimeler.some((y) => parcalar.includes(y))) puan += 5;
      sonuc.push({ sonucOgesi: { ad: kayit[0], boylam: kayit[1] / olcek + bati, enlem: kayit[2] / olcek + guney, kategori: veri.cats[kayit[3]]!, baglam: kayit[4] >= 0 ? veri.ctx[kayit[4]]! : null, tur: 'yer', noktaId: null }, puan });
    }
  }
  sonuc.sort((a, b) => b.puan - a.puan);
  const gorulen = new Set<string>(), cikti: AramaSonucu[] = [];
  for (const { sonucOgesi } of sonuc) {
    const anahtar = sonucOgesi.ad + '|' + (sonucOgesi.baglam ?? '') + '|' + sonucOgesi.tur; if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar); cikti.push(sonucOgesi); if (cikti.length >= enCok) break;
  }
  return cikti;
}

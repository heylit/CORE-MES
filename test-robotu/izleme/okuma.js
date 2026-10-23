import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { DOSYA, SONUCLAR, adimSatiriOku, kosuOzetiOku } from '../../ekran-testleri/benzetim/sozlesme.ts';

// İzleme yalnız koşu klasörlerini okur (ADR 0019 madde 5); bu dosyadaki hiçbir işlev yazmaz, ağa ya da veritabanına gitmez.

export const KOSU_KIMLIGI = /^[A-Za-z0-9_-]+$/;

// Robotla aynı kök: ayar boşsa işletim sisteminin geçici klasörü (ekran-testleri/benzetim/ayar.ts).
export function sonucKokuOku(env) {
  const ham = env.TMIV2_ROBOT_SONUC?.trim();
  return resolve(ham === undefined || ham === '' ? join(tmpdir(), 'tmiv2-robot') : ham);
}

export function portOku(env) {
  const ham = env.TMIV2_ROBOT_IZLEME_PORT?.trim();
  if (ham === undefined || ham === '') return 4200;
  if (!/^\d+$/.test(ham) || Number(ham) < 1 || Number(ham) > 65535) throw new Error(`TMIV2_ROBOT_IZLEME_PORT geçersiz: "${ham}"`);
  return Number(ham);
}

const metinOku = (yol) => {
  try {
    return readFileSync(yol, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

function klasorYolu(kok, kosuId) {
  if (!KOSU_KIMLIGI.test(kosuId)) return null;
  return join(kok, kosuId);
}

// Bozuk özet listeden düşürülmez: hangi klasörün neden okunamadığı görünür.
export function kosulariListele(kok) {
  let girdiler;
  try {
    girdiler = readdirSync(kok, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const liste = [];
  for (const g of girdiler) {
    if (!g.isDirectory() || !KOSU_KIMLIGI.test(g.name)) continue;
    const metin = metinOku(join(kok, g.name, DOSYA.ozet));
    if (metin === null) continue;
    const ozet = kosuOzetiOku(metin);
    liste.push(typeof ozet === 'string' ? { kosuId: g.name, hata: ozet } : { kosuId: g.name, ozet });
  }
  const zaman = (k) => k.ozet?.baslangic ?? '';
  return liste.sort((a, b) => zaman(b).localeCompare(zaman(a)) || b.kosuId.localeCompare(a.kosuId));
}

export function ozetOku(kok, kosuId) {
  const klasor = klasorYolu(kok, kosuId);
  if (klasor === null) return null;
  const metin = metinOku(join(klasor, DOSYA.ozet));
  if (metin === null) return null;
  return kosuOzetiOku(metin);
}

// Robot satırı tek appendFileSync ile ekler; satır sonu gelmemiş son parça yazılmakta olan satırdır, bozuk sayılmaz.
export function adimlariAyikla(metin) {
  const parcalar = metin.split('\n');
  const yarim = parcalar.pop();
  const adimlar = [];
  const bozuk = [];
  parcalar.forEach((satir, i) => {
    if (satir.trim() === '') return;
    const a = adimSatiriOku(satir);
    if (typeof a === 'string') bozuk.push({ satir: i + 1, neden: a });
    else adimlar.push(a);
  });
  return { adimlar, bozuk, yazilmakta: yarim !== undefined && yarim !== '' };
}

export function adimlariOku(kok, kosuId) {
  const klasor = klasorYolu(kok, kosuId);
  if (klasor === null) return null;
  const metin = metinOku(join(klasor, DOSYA.adimlar));
  if (metin === null) return null;
  return adimlariAyikla(metin);
}

export function yorumOku(kok, kosuId) {
  const klasor = klasorYolu(kok, kosuId);
  return klasor === null ? null : metinOku(join(klasor, DOSYA.yorum));
}

const icinde = (dis, ic) => {
  const g = relative(dis, ic);
  return g !== '' && !g.startsWith('..') && !isAbsolute(g);
};

// Ek yolu satırdan gelir ve başka süreç yazar: sözleşme denetimine ek olarak sürücü harfi, ters eğik çizgi ve bağlantı
// (symlink) ile koşu klasörü dışına çıkış da reddedilir. Dönen yol yalnız koşunun ekler klasöründeki düz dosyadır.
export function ekYolu(kok, kosuId, ek) {
  const klasor = klasorYolu(kok, kosuId);
  if (klasor === null || typeof ek !== 'string' || ek === '') return null;
  if (ek.includes('\\') || ek.includes('\0') || isAbsolute(ek) || /^[A-Za-z]:/.test(ek) || ek.split('/').includes('..')) return null;
  const ekler = join(klasor, DOSYA.ekler);
  const aday = resolve(klasor, ek);
  if (!icinde(ekler, aday)) return null;
  let gercek;
  let gercekEkler;
  try {
    gercek = realpathSync(aday);
    gercekEkler = realpathSync(ekler);
  } catch {
    return null;
  }
  if (!icinde(gercekEkler, gercek) || !statSync(gercek).isFile()) return null;
  return gercek;
}

const ICERIK_TURLERI = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8' };

// Bilinmeyen tür indirilir, tarayıcıda açılmaz: iz dosyası (zip) ya da html ekin sayfada çalışması istenmez.
export function ekTuru(yol) {
  const uzanti = /\.([A-Za-z0-9]+)$/.exec(yol)?.[1]?.toLowerCase() ?? '';
  return ICERIK_TURLERI[uzanti] ?? 'application/octet-stream';
}

// Rol başına son adım: canlı ekranın satırları.
export function rolBasinaSon(adimlar) {
  const son = new Map();
  for (const a of adimlar) son.set(a.rol, a);
  return [...son.values()].sort((x, y) => x.rol.localeCompare(y.rol));
}

export function suzgec(adimlar, { sonuc, rol, senaryo, gun } = {}) {
  return adimlar
    .map((a, sira) => ({ sira, ...a }))
    .filter((a) => (sonuc ? a.sonuc === sonuc : true) && (rol ? a.rol === rol : true)
      && (senaryo ? a.senaryo === senaryo : true) && (gun === undefined ? true : a.gun === gun));
}

const ucAnahtari = (a) => (a.yol === null ? null : `${a.yontem ?? ''} ${a.yol}`.trim());
export const adimAnahtari = (a) => `${a.senaryo} / ${a.adim}`;

// Yüzdelik en yakın sıra yöntemiyle; veri yoksa null (sıfır uydurulmaz).
export function yuzdelik(sureler, oran) {
  if (sureler.length === 0) return null;
  const sirali = [...sureler].sort((a, b) => a - b);
  return sirali[Math.min(sirali.length - 1, Math.max(0, Math.ceil(oran * sirali.length) - 1))];
}

export function ucSureleri(adimlar) {
  const uclar = new Map();
  for (const a of adimlar) {
    const anahtar = ucAnahtari(a);
    if (anahtar === null) continue;
    uclar.set(anahtar, [...(uclar.get(anahtar) ?? []), a.sureMs]);
  }
  return [...uclar.entries()]
    .map(([uc, sureler]) => ({ uc, adet: sureler.length, p50: yuzdelik(sureler, 0.5), p95: yuzdelik(sureler, 0.95) }))
    .sort((a, b) => b.p95 - a.p95 || a.uc.localeCompare(b.uc));
}

const sonucSayaci = (adimlar) => Object.fromEntries(SONUCLAR.map((s) => [s, adimlar.filter((a) => a.sonuc === s).length]));

// Eğilim: koşular eskiden yeniye. "Yeni düşen" önceki koşuda hiç düşmeyip bu koşuda düşen adımdır; "yavaşlayan uç"
// p95'i önceki koşuya göre en az `oran` kat ve `enAzMs` artan uçtur. Önceki koşuda olmayan adım ve uç kıyaslanmaz.
export function egilim(kosular, { oran = 1.5, enAzMs = 200, enCok = 20 } = {}) {
  const sirali = [...kosular].sort((a, b) => a.ozet.baslangic.localeCompare(b.ozet.baslangic));
  let onceki = null;
  return sirali.map(({ ozet, adimlar }) => {
    const dusen = new Set(adimlar.filter((a) => a.sonuc === 'dustu').map(adimAnahtari));
    const gorulen = new Set(adimlar.map(adimAnahtari));
    const uclar = ucSureleri(adimlar);
    const satir = {
      kosuId: ozet.kosuId,
      baslangic: ozet.baslangic,
      taban: ozet.taban,
      sayac: sonucSayaci(adimlar),
      p95: yuzdelik(adimlar.filter((a) => a.yol !== null).map((a) => a.sureMs), 0.95),
      yeniDusen: onceki === null ? [] : [...dusen].filter((k) => onceki.gorulen.has(k) && !onceki.dusen.has(k)).sort().slice(0, enCok),
      duzelen: onceki === null ? [] : [...onceki.dusen].filter((k) => gorulen.has(k) && !dusen.has(k)).sort().slice(0, enCok),
      yavaslayan: onceki === null ? [] : uclar.flatMap((u) => {
        const o = onceki.uclar.get(u.uc);
        if (o === undefined || o.p95 === null || u.p95 === null) return [];
        return u.p95 >= o.p95 * oran && u.p95 - o.p95 >= enAzMs ? [{ uc: u.uc, onceki: o.p95, simdi: u.p95 }] : [];
      }).slice(0, enCok),
    };
    onceki = { dusen, gorulen, uclar: new Map(uclar.map((u) => [u.uc, u])) };
    return satir;
  });
}

// Ara sıra düşenler bütün koşular boyunca toplanır: tek koşuda bir kez görülen gürültüdür, tekrarlayan kırılganlık ya da yarıştır.
export function araSiraDusenler(kosular) {
  const toplam = new Map();
  for (const { ozet, adimlar } of kosular) {
    for (const a of adimlar) {
      if (a.sonuc !== 'ara-sira') continue;
      const k = adimAnahtari(a);
      const t = toplam.get(k) ?? { adim: k, adet: 0, kosular: new Set(), roller: new Set(), son: null };
      t.adet += 1;
      t.kosular.add(ozet.kosuId);
      t.roller.add(a.rol);
      if (t.son === null || a.zaman > t.son.zaman) t.son = { kosuId: ozet.kosuId, zaman: a.zaman, gun: a.gun, ileti: a.ileti };
      toplam.set(k, t);
    }
  }
  return [...toplam.values()]
    .map((t) => ({ ...t, kosuSayisi: t.kosular.size, kosular: undefined, roller: [...t.roller].sort() }))
    .sort((a, b) => b.kosuSayisi - a.kosuSayisi || b.adet - a.adet || a.adim.localeCompare(b.adim));
}

// Eğilim ve ara sıra ekranı için okunabilen son koşular. Bozuk özetli ya da adımı okunamayan koşu atlanır; listede hatasıyla görünür.
export function sonKosular(kok, enCok = 20) {
  return kosulariListele(kok)
    .filter((k) => k.ozet !== undefined)
    .slice(0, enCok)
    .flatMap((k) => {
      const okunan = adimlariOku(kok, k.kosuId);
      return okunan === null ? [] : [{ ozet: k.ozet, adimlar: okunan.adimlar }];
    });
}

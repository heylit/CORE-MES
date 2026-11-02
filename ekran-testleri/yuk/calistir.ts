import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ayarOku } from './ayar.ts';
import type { YukAyari } from './ayar.ts';
import { Istemci, YUK_HESAP_DOSYASI, YUK_KLASORU, hazirla, hedefiDenetle, hesaplariSec, istasyonlariKesfet, senaryoOku } from './hazirla.ts';
import type { YukHesaplari } from './hazirla.ts';
import { ozetle, sunucuOzeti, tabloMetni } from './olcum.ts';
import type { Ornek, SunucuOlcusu } from './olcum.ts';
import { profilMetni, profilOzeti } from './profil-ozet.ts';
import type { CpuProfili } from './profil-ozet.ts';
import { govdeDoldur, yolDoldur } from './sablon.ts';
import type { Istasyon, SablonBaglami } from './sablon.ts';
import { adresDenetle, agirlikliSec, dusunmeSuresiMs, profilDagit, tohumluUretec, yolKalibi } from './senaryo.ts';
import type { Profil } from './senaryo.ts';
import { sunucuAc, sunucuKapat } from './sunucu-ac.ts';

// Yük koşusu (ADR 0025 ertelenenler, kart 1669): sentetik kişiler gerçek ekranların yokladığı uçları ve açtığı sayfaları
// aynı anda çağırır; her uç için p50/p95/p99 ve hata sayısı, sunucu için olay döngüsü, vt bağlantısı ve bellek yazılır.
// Varsayılan yalnız okumadır; --yazma senaryodaki yazma seçeneklerini de koşar (kart 1875).

const SUNUCU_OLCUM_ARALIGI_MS = 10_000;
// Sunucu aynı cihazdan (adresten) eşzamanlı girişi 429 ile reddeder; koşunun bütün kişileri tek adresten gelir. Giriş
// bu yüzden sıralıdır ve 429'da kısa bekleyip yeniden dener; eşzamanlı giriş yükü bu koşuda ölçülmez.
const GIRIS_ES_ZAMANLI = 1;
const GIRIS_DENEME = 5;

const bekle = (ms: number): Promise<void> => new Promise((coz) => { setTimeout(coz, Math.max(0, ms)); });

function yaz(ileti: string): void {
  process.stdout.write(`${ileti}\n`);
}

// Rol izinleri bilinmeden senaryo yazılır: profilin ilk kişisiyle her yol bir kez denenir, 2xx dönmeyen yol çıkarılır ve raporda söylenir.
async function yollariSuz(profil: Profil, istemci: Istemci, baglam: () => SablonBaglami): Promise<{ profil: Profil; cikan: string[] }> {
  const cikan: string[] = [];
  const gecer = async (yol: string): Promise<boolean> => {
    const c = await istemci.istek('GET', yolDoldur(yol, baglam()));
    const tamam = c.durum !== null && c.durum >= 200 && c.durum < 300;
    if (!tamam) cikan.push(`${profil.ad} ${yol} (${String(c.durum)})`);
    return tamam;
  };
  const yoklamalar = [];
  for (const y of profil.yoklamalar) if (await gecer(y.yol)) yoklamalar.push(y);
  const sayfalar = [];
  for (const s of profil.sayfalar) if (await gecer(s.yol)) sayfalar.push(s);
  return { profil: { ...profil, yoklamalar, sayfalar }, cikan };
}

// Kişiye özgü bağlam: kaynak adı ve (senaryo istiyorsa) profil içinde sırayla dağıtılan istasyon.
function baglamUret(kaynak: string, istasyon: Istasyon | null): () => SablonBaglami {
  return () => ({ simdiMs: Date.now(), kaynak, istasyon, uuid: randomUUID });
}

// --sunucu-ac ile sunucuyu koşu açar ve iş bitince (hata da olsa) SIGINT ile kapatır; --profil ise kapanışta profili özetler.
async function sunucuyla(ayar: YukAyari, is: () => Promise<void>): Promise<void> {
  if (!ayar.sunucuAc) {
    await is();
    return;
  }
  const adres = adresDenetle(process.env.TMIV2_YUK_ADRESI);
  if (!adres.tamam) throw new Error(adres.neden);
  const profilKlasoru = ayar.profil && ayar.komut === 'kos' ? join(YUK_KLASORU, `profil-${new Date().toISOString().replace(/[:.]/g, '-')}`) : null;
  const acik = await sunucuAc(adres.kok, profilKlasoru, yaz);
  try {
    await is();
  } finally {
    const dosya = await sunucuKapat(acik);
    if (profilKlasoru !== null) {
      if (dosya === null) yaz('CPU profili yazılmadı.');
      else {
        yaz('');
        yaz(profilMetni(profilOzeti(JSON.parse(readFileSync(dosya, 'utf8')) as CpuProfili)));
        yaz(`Profil dosyası: ${dosya}`);
      }
    }
  }
}

async function kos(ayar: YukAyari): Promise<void> {
  const senaryo = senaryoOku(ayar);
  if (!existsSync(YUK_HESAP_DOSYASI)) throw new Error('Yük kişileri yok: önce `npm run yuk -- hazirla` (aynı --kisi, --senaryo ve --karma ile).');
  const hesaplar = JSON.parse(readFileSync(YUK_HESAP_DOSYASI, 'utf8')) as YukHesaplari;
  const kisiler = hesaplariSec(hesaplar, profilDagit(ayar.kisi, senaryo.profiller));
  await sunucuyla(ayar, () => olc(ayar, senaryo.profiller, senaryo.istasyonlar, hesaplar.parola, kisiler));
}

async function olc(
  ayar: YukAyari, profilListesi: readonly Profil[], istasyonKaynagi: 'kesfet' | readonly Istasyon[], parola: string,
  kisiler: ReadonlyArray<{ kullaniciAdi: string; profil: string }>,
): Promise<void> {
  const { yonetici, kok } = await hedefiDenetle(ayar);
  const profiller = new Map(profilListesi.map((p) => [p.ad, p]));
  const istasyonlar = istasyonKaynagi === 'kesfet' ? await istasyonlariKesfet(yonetici) : istasyonKaynagi;
  if (istasyonKaynagi === 'kesfet') yaz(`İstasyon: ${String(istasyonlar.length)} (başlamış emri olan).`);
  const ornekler: Ornek[] = [];

  yaz(`Giriş: ${String(kisiler.length)} kişi, aynı anda ${String(GIRIS_ES_ZAMANLI)}.`);
  const istemciler: Array<{ istemci: Istemci; profil: string; baglam: () => SablonBaglami }> = [];
  const profilSirasi = new Map<string, number>();
  let sira = 0;
  const girisIscisi = async (): Promise<void> => {
    while (sira < kisiler.length) {
      const k = kisiler[sira];
      sira += 1;
      if (k === undefined) continue;
      const istemci = new Istemci(kok);
      let c = await istemci.gir(k.kullaniciAdi, parola);
      for (let deneme = 1; c.durum === 429 && deneme < GIRIS_DENEME; deneme += 1) {
        await bekle(200 * deneme);
        c = await istemci.gir(k.kullaniciAdi, parola);
      }
      ornekler.push({ kalip: 'POST /oturum/giris', durum: c.durum, sureMs: c.sureMs });
      if (c.durum !== 200) continue;
      const no = profilSirasi.get(k.profil) ?? 0;
      profilSirasi.set(k.profil, no + 1);
      const istasyon = istasyonlar.length === 0 ? null : (istasyonlar[no % istasyonlar.length] ?? null);
      istemciler.push({ istemci, profil: k.profil, baglam: baglamUret(k.kullaniciAdi, istasyon) });
    }
  };
  await Promise.all(Array.from({ length: GIRIS_ES_ZAMANLI }, girisIscisi));
  if (istemciler.length === 0) throw new Error('Hiçbir kişi giremedi.');

  const suzulmus = new Map<string, Profil>();
  const cikanlar: string[] = [];
  for (const [ad, profil] of profiller) {
    const ilk = istemciler.find((i) => i.profil === ad);
    if (ilk === undefined) continue;
    const s = await yollariSuz(profil, ilk.istemci, ilk.baglam);
    suzulmus.set(ad, s.profil);
    cikanlar.push(...s.cikan);
  }
  for (const c of cikanlar) yaz(`Senaryodan çıktı (yetki ya da yol yok): ${c}`);

  const girisOrnekleri = ornekler.splice(0);
  const sunucu: SunucuOlcusu[] = [];
  const baslangic = performance.now();
  const bitis = baslangic + (ayar.isinmaSn + ayar.sureSn) * 1000;
  const olcumBaslangici = baslangic + ayar.isinmaSn * 1000;
  const kaydet = (o: Ornek, an: number): void => { if (an >= olcumBaslangici) ornekler.push(o); };

  // Yazma, kişinin okuma döngüsünden bağımsız akar: ekranda kayıt girmek yoklamayı durdurmaz.
  const yazan = async (istemci: Istemci, profil: Profil, baglam: () => SablonBaglami, r: () => number): Promise<void> => {
    const yazma = profil.yazma;
    if (!ayar.yazma || yazma === undefined) return;
    await bekle(r() * ayar.isinmaSn * 1000 + dusunmeSuresiMs(yazma.ortalamaSn, r()));
    while (performance.now() < bitis) {
      const secim = agirlikliSec(yazma.secenekler, r());
      if (secim === null) return;
      const an = performance.now();
      const b = baglam();
      const yol = yolDoldur(secim.yol, b);
      const c = await istemci.istek('POST', yol, govdeDoldur(secim.govde ?? {}, b));
      kaydet({ kalip: yolKalibi('POST', yol), durum: c.durum, sureMs: c.sureMs }, an);
      await bekle(Math.min(dusunmeSuresiMs(yazma.ortalamaSn, r()), bitis - performance.now()));
    }
  };

  const sanalKisi = async (istemci: Istemci, profil: Profil, no: number, baglam: () => SablonBaglami): Promise<void> => {
    const r = tohumluUretec(ayar.tohum * 100_003 + no);
    const yazmaIsi = yazan(istemci, profil, baglam, tohumluUretec(ayar.tohum * 100_003 + no + 50_000_017));
    // Isınmada kişiler sırayla gelir: 1000 kişinin aynı milisaniyede başlaması gerçekte olmaz.
    await bekle(r() * ayar.isinmaSn * 1000);
    const sonraki = profil.yoklamalar.map((y) => performance.now() + r() * y.aralikSn * 1000);
    let sayfaZamani = performance.now() + dusunmeSuresiMs(profil.dusunmeSn, r());
    while (performance.now() < bitis) {
      const enYakin = Math.min(sayfaZamani, ...sonraki);
      await bekle(enYakin - performance.now());
      if (performance.now() >= bitis) break;
      const an = performance.now();
      const yoklamaSira = sonraki.findIndex((t) => t <= an);
      const yoklama = yoklamaSira >= 0 ? profil.yoklamalar[yoklamaSira] : undefined;
      if (yoklama !== undefined) {
        sonraki[yoklamaSira] = an + yoklama.aralikSn * 1000;
        const yol = yolDoldur(yoklama.yol, baglam());
        const c = await istemci.istek('GET', yol);
        kaydet({ kalip: yolKalibi('GET', yol), durum: c.durum, sureMs: c.sureMs }, an);
        continue;
      }
      sayfaZamani = an + dusunmeSuresiMs(profil.dusunmeSn, r());
      const sayfa = agirlikliSec(profil.sayfalar, r());
      if (sayfa === null) continue;
      const yol = yolDoldur(sayfa.yol, baglam());
      const c = await istemci.istek('GET', yol);
      kaydet({ kalip: yolKalibi('GET', yol), durum: c.durum, sureMs: c.sureMs }, an);
    }
    await yazmaIsi;
  };

  const sunucuyuIzle = async (): Promise<void> => {
    while (performance.now() < bitis) {
      const c = await yonetici.istek('GET', '/saglik/ayrinti');
      const g = c.durum === 200 ? (c.govde as { olayDongusuGecikmeMs?: number | null; vtBaglantiSayisi?: number | null; bellek?: { rssBayt: number } }) : null;
      sunucu.push({ an: Date.now(), olayDongusuMs: g?.olayDongusuGecikmeMs ?? null, vtBaglanti: g?.vtBaglantiSayisi ?? null, rssBayt: g?.bellek?.rssBayt ?? null });
      await bekle(SUNUCU_OLCUM_ARALIGI_MS);
    }
  };

  yaz(`Koşu: ${String(istemciler.length)} kişi, ısınma ${String(ayar.isinmaSn)} sn, ölçüm ${String(ayar.sureSn)} sn, tohum ${String(ayar.tohum)}, ` +
    `${ayar.yazma ? 'yazma dahil' : 'yalnız okuma'}, karma ${karmaMetni(istemciler)}.`);
  await Promise.all([
    ...istemciler.map((i, no) => {
      const profil = suzulmus.get(i.profil);
      return profil === undefined ? Promise.resolve() : sanalKisi(i.istemci, profil, no, i.baglam);
    }),
    sunucuyuIzle(),
  ]);

  const giris = ozetle(girisOrnekleri, 0);
  const ozet = ozetle(ornekler, ayar.sureSn);
  const sunucuSonucu = sunucuOzeti(sunucu);
  yaz('');
  yaz(tabloMetni(giris));
  yaz('');
  yaz(tabloMetni(ozet));
  yaz('');
  yaz(`Sunucu: olay döngüsü en çok ${String(sunucuSonucu.enCokOlayDongusuMs ?? '-')} ms, vt bağlantısı en çok ${String(sunucuSonucu.enCokVtBaglanti ?? '-')}, ` +
    `bellek en çok ${sunucuSonucu.enCokRssBayt === null ? '-' : `${String(Math.round(sunucuSonucu.enCokRssBayt / 1024 ** 2))} MB`} (${String(sunucuSonucu.olcumSayisi)} ölçüm).`);
  mkdirSync(YUK_KLASORU, { recursive: true, mode: 0o700 });
  const dosya = join(YUK_KLASORU, `sonuc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(dosya, JSON.stringify({ ayar: { ...ayar, karma: ayar.karma === null ? null : Object.fromEntries(ayar.karma) }, istasyonSayisi: istasyonlar.length, cikanlar, giris, ozet, sunucu: sunucuSonucu, sunucuOlcumleri: sunucu }, null, 2), { mode: 0o600 });
  yaz(`Sonuç dosyası: ${dosya}`);
}

const karmaMetni = (l: ReadonlyArray<{ profil: string }>): string => {
  const say = new Map<string, number>();
  for (const { profil } of l) say.set(profil, (say.get(profil) ?? 0) + 1);
  return [...say].map(([ad, n]) => `${ad}=${String(n)}`).join(',');
};

try {
  const ayar = ayarOku(process.argv.slice(2), process.env);
  if (ayar.komut === 'hazirla') await sunucuyla(ayar, () => hazirla(ayar));
  else if (ayar.komut === 'profil-ozet') yaz(profilMetni(profilOzeti(JSON.parse(readFileSync(ayar.dosya ?? '', 'utf8')) as CpuProfili)));
  else await kos(ayar);
} catch (hata) {
  process.stderr.write(`${hata instanceof Error ? hata.message : String(hata)}\n`);
  process.exitCode = 1;
}

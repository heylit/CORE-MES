import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Istemci, YUK_HESAP_DOSYASI, YUK_KLASORU, hazirla, hedefiDenetle, senaryoOku } from './hazirla.ts';
import type { YukHesaplari } from './hazirla.ts';
import { ozetle, sunucuOzeti, tabloMetni } from './olcum.ts';
import type { Ornek, SunucuOlcusu } from './olcum.ts';
import { agirlikliSec, dusunmeSuresiMs, sayiOku, tohumluUretec, yolKalibi } from './senaryo.ts';
import type { Profil } from './senaryo.ts';

// Yük koşusu (ADR 0025 ertelenenler, kart 1669): sentetik kişiler gerçek ekranların yokladığı uçları ve açtığı sayfaları
// aynı anda çağırır; her uç için p50/p95/p99 ve hata sayısı, sunucu için olay döngüsü, vt bağlantısı ve bellek yazılır.
// Yalnız okuma yapar: yazma uçlarının yükü bu koşunun ölçtüğü şey değildir.

const ayar = {
  kisi: sayiOku(process.env.TMIV2_YUK_KISI, 1000, 'TMIV2_YUK_KISI', 1, 5000),
  sureSn: sayiOku(process.env.TMIV2_YUK_SURE_SN, 300, 'TMIV2_YUK_SURE_SN', 10, 86_400),
  isinmaSn: sayiOku(process.env.TMIV2_YUK_ISINMA_SN, 60, 'TMIV2_YUK_ISINMA_SN', 0, 3600),
  tohum: sayiOku(process.env.TMIV2_YUK_TOHUM, 1, 'TMIV2_YUK_TOHUM', 0, 2 ** 31),
};

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
async function yollariSuz(profil: Profil, istemci: Istemci): Promise<{ profil: Profil; cikan: string[] }> {
  const cikan: string[] = [];
  const gecer = async (yol: string): Promise<boolean> => {
    const c = await istemci.istek('GET', yol);
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

async function kos(): Promise<void> {
  const { yonetici, kok } = await hedefiDenetle();
  if (!existsSync(YUK_HESAP_DOSYASI)) throw new Error('Yük kişileri yok: önce `npm run yuk -- hazirla`.');
  const hesaplar = JSON.parse(readFileSync(YUK_HESAP_DOSYASI, 'utf8')) as YukHesaplari;
  if (hesaplar.kisiler.length < ayar.kisi) throw new Error(`Hazır kişi ${String(hesaplar.kisiler.length)}, istenen ${String(ayar.kisi)}: yeniden hazırlayın.`);
  const kisiler = hesaplar.kisiler.slice(0, ayar.kisi);
  const profiller = new Map(senaryoOku().map((p) => [p.ad, p]));
  const ornekler: Ornek[] = [];

  yaz(`Giriş: ${String(kisiler.length)} kişi, aynı anda ${String(GIRIS_ES_ZAMANLI)}.`);
  const istemciler: Array<{ istemci: Istemci; profil: string }> = [];
  let sira = 0;
  const girisIscisi = async (): Promise<void> => {
    while (sira < kisiler.length) {
      const k = kisiler[sira];
      sira += 1;
      if (k === undefined) continue;
      const istemci = new Istemci(kok);
      let c = await istemci.gir(k.kullaniciAdi, hesaplar.parola);
      for (let deneme = 1; c.durum === 429 && deneme < GIRIS_DENEME; deneme += 1) {
        await bekle(200 * deneme);
        c = await istemci.gir(k.kullaniciAdi, hesaplar.parola);
      }
      ornekler.push({ kalip: 'POST /oturum/giris', durum: c.durum, sureMs: c.sureMs });
      if (c.durum === 200) istemciler.push({ istemci, profil: k.profil });
    }
  };
  await Promise.all(Array.from({ length: GIRIS_ES_ZAMANLI }, girisIscisi));
  if (istemciler.length === 0) throw new Error('Hiçbir kişi giremedi.');

  const suzulmus = new Map<string, Profil>();
  const cikanlar: string[] = [];
  for (const [ad, profil] of profiller) {
    const ilk = istemciler.find((i) => i.profil === ad);
    if (ilk === undefined) continue;
    const s = await yollariSuz(profil, ilk.istemci);
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

  const sanalKisi = async (istemci: Istemci, profil: Profil, no: number): Promise<void> => {
    const r = tohumluUretec(ayar.tohum * 100_003 + no);
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
        const c = await istemci.istek('GET', yoklama.yol);
        kaydet({ kalip: yolKalibi('GET', yoklama.yol), durum: c.durum, sureMs: c.sureMs }, an);
        continue;
      }
      sayfaZamani = an + dusunmeSuresiMs(profil.dusunmeSn, r());
      const sayfa = agirlikliSec(profil.sayfalar, r());
      if (sayfa === null) continue;
      const c = await istemci.istek('GET', sayfa.yol);
      kaydet({ kalip: yolKalibi('GET', sayfa.yol), durum: c.durum, sureMs: c.sureMs }, an);
    }
  };

  const sunucuyuIzle = async (): Promise<void> => {
    while (performance.now() < bitis) {
      const c = await yonetici.istek('GET', '/saglik/ayrinti');
      const g = c.durum === 200 ? (c.govde as { olayDongusuGecikmeMs?: number | null; vtBaglantiSayisi?: number | null; bellek?: { rssBayt: number } }) : null;
      sunucu.push({ an: Date.now(), olayDongusuMs: g?.olayDongusuGecikmeMs ?? null, vtBaglanti: g?.vtBaglantiSayisi ?? null, rssBayt: g?.bellek?.rssBayt ?? null });
      await bekle(SUNUCU_OLCUM_ARALIGI_MS);
    }
  };

  yaz(`Koşu: ${String(istemciler.length)} kişi, ısınma ${String(ayar.isinmaSn)} sn, ölçüm ${String(ayar.sureSn)} sn, tohum ${String(ayar.tohum)}.`);
  await Promise.all([
    ...istemciler.map((i, no) => {
      const profil = suzulmus.get(i.profil);
      return profil === undefined ? Promise.resolve() : sanalKisi(i.istemci, profil, no);
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
  writeFileSync(dosya, JSON.stringify({ ayar, cikanlar, giris, ozet, sunucu: sunucuSonucu, sunucuOlcumleri: sunucu }, null, 2), { mode: 0o600 });
  yaz(`Sonuç dosyası: ${dosya}`);
}

try {
  if (process.argv[2] === 'hazirla') await hazirla(ayar.kisi);
  else await kos();
} catch (hata) {
  process.stderr.write(`${hata instanceof Error ? hata.message : String(hata)}\n`);
  process.exitCode = 1;
}

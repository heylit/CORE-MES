import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { uptime } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kurumIciMi } from '#cekirdek/kurum-ici.ts';
import { ACILIS_PAYI_MS, GUNCELLEME_ISARETI, gunlukDosyasi, guncellemeSuruyorMu } from './bekci.ts';
import { GOC_KIMLIGI, ortamiYukle } from './ortam.ts';

// Dış bekçi (`npm run dis-bekci`, kart 1665, karar 1672 a): sunucudan ve bekçiden bağımsız, Görev Zamanlayıcı'nın dakikada bir
// açtığı tek turluk yoklama. Uygulama, bekçi ya da vekil düşünce uygulama içi uyarı da düşer; bu araç sağlık ucuna dışarıdan
// bakar ve arızayı Windows olay günlüğüne yazar, bilgi işlemin izleme aracı oradan alır (1618 a). Paket yoktur.

const kok = fileURLToPath(new URL('../', import.meta.url));

export const OLAY_KAYNAGI = 'TMIV2';
// Sunucunun kendi hata olayı 100, güvenlik alarmı 200'dür (sunucu/cekirdek/olay-gunlugu.ts); dış bekçi ayrı süzülsün diye 300 ve 301.
export const ARIZA_OLAY_KIMLIGI = '300';
export const DUZELDI_OLAY_KIMLIGI = '301';
export const YOKLAMA_SURESI_MS = 10_000;
// Bekçinin yeniden açması (5-60 sn) ve kısa takılma arıza sayılmasın: art arda bu kadar turda (dakikada bir) bozuksa yazılır.
export const ARIZA_ESIGI = 3;
// Süren arıza unutulmasın, olay günlüğü de dolmasın.
export const HATIRLATMA_MS = 60 * 60_000;
const METIN_EN_COK = 800;

export type Sonuc = { tur: 'ok' } | { tur: 'vt-yok' } | { tur: 'beklenmeyen'; durum: number } | { tur: 'cevapsiz'; neden: string };

export interface Hedef { ad: 'sunucu' | 'vekil'; adres: string }

export interface Durum {
  ardArda: number;
  // Olay günlüğüne arıza yazıldıysa ilk arızalı turun zamanı (ms); düzelince null.
  arizaBaslangici: number | null;
  sonOlay: number | null;
  sonNeden: string | null;
}

export const BOS_DURUM: Durum = { ardArda: 0, arizaBaslangici: null, sonOlay: null, sonNeden: null };

export interface Olay { tur: 'ERROR' | 'INFORMATION'; kimlik: string; metin: string }

export function sonucCoz(durum: number | null, neden: string | null): Sonuc {
  if (durum === null) return { tur: 'cevapsiz', neden: neden ?? 'bilinmiyor' };
  if (durum === 200) return { tur: 'ok' };
  // Sağlık ucu veritabanına ulaşamayınca 503 döner (sunucu/moduller/saglik/uclar.ts).
  if (durum === 503) return { tur: 'vt-yok' };
  return { tur: 'beklenmeyen', durum };
}

function sonucMetni(h: Hedef, s: Sonuc): string | null {
  const ad = h.ad === 'sunucu' ? 'Sunucu' : 'Vekil üzerinden sunucu';
  switch (s.tur) {
    case 'ok': return null;
    case 'vt-yok': return `${ad} açık ama veritabanına ulaşamıyor (503).`;
    case 'beklenmeyen': return `${ad} sağlık ucuna beklenmeyen cevap verdi (${String(s.durum)}).`;
    case 'cevapsiz': return `${ad} cevap vermiyor (${s.neden}).`;
  }
}

const dakika = (ms: number): number => Math.max(1, Math.round(ms / 60_000));

// Saf karar: yeni durum ve yazılacak olay. Olay yalnız arıza eşiği aşılınca, arızanın nedeni değişince, saatte bir hatırlatmada
// ve düzelince yazılır.
export function karar(onceki: Durum, sonuclar: ReadonlyArray<{ hedef: Hedef; sonuc: Sonuc }>, simdi: number): { durum: Durum; olay: Olay | null } {
  const nedenler = sonuclar.map((s) => sonucMetni(s.hedef, s.sonuc)).filter((m): m is string => m !== null);
  if (nedenler.length === 0) {
    const durum = { ...BOS_DURUM };
    if (onceki.arizaBaslangici === null) return { durum, olay: null };
    return {
      durum,
      olay: { tur: 'INFORMATION', kimlik: DUZELDI_OLAY_KIMLIGI, metin: `TMIV2 dış bekçi: sunucu yeniden cevap veriyor; arıza yaklaşık ${String(dakika(simdi - onceki.arizaBaslangici))} dk sürdü.` },
    };
  }
  const neden = nedenler.join(' ');
  const ardArda = onceki.ardArda + 1;
  if (ardArda < ARIZA_ESIGI) return { durum: { ...onceki, ardArda, sonNeden: neden }, olay: null };
  const baslangic = onceki.arizaBaslangici ?? simdi - (ARIZA_ESIGI - 1) * 60_000;
  const yaz = onceki.arizaBaslangici === null || neden !== onceki.sonNeden || onceki.sonOlay === null || simdi - onceki.sonOlay >= HATIRLATMA_MS;
  const durum: Durum = { ardArda, arizaBaslangici: baslangic, sonOlay: yaz ? simdi : onceki.sonOlay, sonNeden: neden };
  if (!yaz) return { durum, olay: null };
  const sure = onceki.arizaBaslangici === null ? '' : ` Arıza yaklaşık ${String(dakika(simdi - baslangic))} dk sürüyor.`;
  return { durum, olay: { tur: 'ERROR', kimlik: ARIZA_OLAY_KIMLIGI, metin: olayMetniTemizle(`TMIV2 dış bekçi: ${neden}${sure}`) } };
}

// Tırnak ve satır sonu komut satırında bozulmasın.
export function olayMetniTemizle(metin: string): string {
  return metin.replace(/"/g, '').replace(/[\r\n]+/g, ' ').slice(0, METIN_EN_COK);
}

export function olayArgumanlari(o: Olay): string[] {
  return ['/T', o.tur, '/ID', o.kimlik, '/L', 'APPLICATION', '/SO', OLAY_KAYNAGI, '/D', o.metin];
}

// Vekil adresi yalnız ortam değişkenindedir ve kurum içi olmalıdır (CLAUDE.md kırmızı çizgi); yol, sorgu ve kimlik bilgisi taşımaz.
export function hedefleriKur(env: NodeJS.ProcessEnv): { hedefler: Hedef[] } | { hata: string } {
  const portMetni = env['TMIV2_PORT']?.trim() || '4100';
  const port = Number(portMetni);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return { hata: `TMIV2_PORT geçersiz: ${portMetni}` };
  const hedefler: Hedef[] = [{ ad: 'sunucu', adres: `http://127.0.0.1:${String(port)}/api/saglik` }];
  const vekil = env['TMIV2_DIS_BEKCI_VEKIL']?.trim() ?? '';
  if (vekil === '') return { hedefler };
  let url: URL;
  try {
    url = new URL(vekil);
  } catch {
    return { hata: 'TMIV2_DIS_BEKCI_VEKIL geçerli bir adres değil.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { hata: 'TMIV2_DIS_BEKCI_VEKIL http ya da https olmalı.' };
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return { hata: 'TMIV2_DIS_BEKCI_VEKIL yalnız şema, ad ve kapı taşır.' };
  }
  if (!kurumIciMi(url.hostname)) return { hata: 'TMIV2_DIS_BEKCI_VEKIL kurum içi olmalı (özel IP ya da tek parçalı ad).' };
  hedefler.push({ ad: 'vekil', adres: `${url.origin}/api/saglik` });
  return { hedefler };
}

export function durumOku(metin: string | null): Durum {
  if (metin === null) return { ...BOS_DURUM };
  try {
    const d = JSON.parse(metin) as Partial<Durum>;
    const sayiMi = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
    return {
      ardArda: sayiMi(d.ardArda) && d.ardArda >= 0 ? Math.floor(d.ardArda) : 0,
      arizaBaslangici: sayiMi(d.arizaBaslangici) ? d.arizaBaslangici : null,
      sonOlay: sayiMi(d.sonOlay) ? d.sonOlay : null,
      sonNeden: typeof d.sonNeden === 'string' ? d.sonNeden : null,
    };
  } catch {
    return { ...BOS_DURUM };
  }
}

async function yokla(adres: string): Promise<Sonuc> {
  try {
    const cevap = await fetch(adres, { signal: AbortSignal.timeout(YOKLAMA_SURESI_MS) });
    await cevap.arrayBuffer();
    return sonucCoz(cevap.status, null);
  } catch (hata) {
    const neden = (hata as { cause?: { code?: unknown } }).cause?.code;
    const ad = (hata as { name?: unknown }).name;
    return sonucCoz(null, typeof neden === 'string' ? neden : ad === 'TimeoutError' ? `${String(YOKLAMA_SURESI_MS / 1000)} sn içinde cevap yok` : 'bağlantı kurulamadı');
  }
}

function olayYaz(o: Olay): Promise<void> {
  return new Promise((coz, reddet) => {
    execFile('eventcreate', olayArgumanlari(o), { timeout: 10_000, windowsHide: true }, (hata) => {
      if (hata) reddet(hata);
      else coz();
    });
  });
}

function guncellemeSuruyor(env: NodeJS.ProcessEnv): boolean {
  const dizin = env['TMIV2_GUNCELLEME_DIZINI']?.trim() ?? '';
  if (dizin === '') return false;
  try {
    return guncellemeSuruyorMu(statSync(path.join(dizin, GUNCELLEME_ISARETI)).mtimeMs, Date.now());
  } catch {
    return false;
  }
}

// Çıkış kodu Görev Zamanlayıcı'nın "Son çalışma sonucu"nda görünür: 0 tur tamam (arıza olsa da yazıldı), 1 ayar hatası, 2 olay yazılamadı.
async function tekTur(): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  ortamiYukle(kok, env, undefined, GOC_KIMLIGI);
  const kurulum = hedefleriKur(env);
  if ('hata' in kurulum) {
    process.stderr.write(`${kurulum.hata}\n`);
    return 1;
  }
  // Açılışta sunucu, bekçinin açılış payı dolmadan cevap vermeyebilir; güncelleme sırasında sunucu bilerek kapalıdır.
  if (uptime() * 1000 < ACILIS_PAYI_MS || guncellemeSuruyor(env)) return 0;
  const durumDosyasi = path.join(path.dirname(gunlukDosyasi(kok)), 'dis-bekci-durum.json');
  const onceki = durumOku(existsSync(durumDosyasi) ? readFileSync(durumDosyasi, 'utf8') : null);
  const sonuclar = await Promise.all(kurulum.hedefler.map(async (hedef) => ({ hedef, sonuc: await yokla(hedef.adres) })));
  const { durum, olay } = karar(onceki, sonuclar, Date.now());
  let kod = 0;
  if (olay !== null) {
    process.stdout.write(`${new Date().toISOString()} [dış bekçi] ${olay.metin}\n`);
    try {
      await olayYaz(olay);
    } catch (hata) {
      process.stderr.write(`Olay günlüğüne yazılamadı (kaynak ${OLAY_KAYNAGI} açık mı? kurulum/gunluk.md): ${hata instanceof Error ? hata.message : String(hata)}\n`);
      kod = 2;
    }
  }
  // Olay yazılamadıysa durum ilerlemez: sonraki tur aynı olayı yeniden dener.
  if (kod === 0) {
    mkdirSync(path.dirname(durumDosyasi), { recursive: true });
    writeFileSync(durumDosyasi, JSON.stringify(durum));
  }
  return kod;
}

const dogrudanKosuyor = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  try {
    process.exitCode = await tekTur();
  } catch (hata) {
    process.stderr.write(`${hata instanceof Error ? hata.message : String(hata)}\n`);
    process.exitCode = 1;
  }
}

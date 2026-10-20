import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, modulAdi, VARSAYILAN_TABAN } from './sinir-denetimi.ts';

export const MODUL_DISI = 'çekirdek/ortak';
export const BEKLEME_GUNU = 3;

const GUN = 86_400_000;
const KOK = fileURLToPath(new URL('../', import.meta.url));

export interface DalDurumu {
  ad: string;
  worktree: string | null;
  // false: tabanla ortak atası yok; dokunduğu dosyalar okunamaz.
  ortakAta: boolean;
  dosyalar: string[];
  moduller: string[];
  yapildi: string | null;
  siradaki: string | null;
  geride: number;
  ileride: number;
  sonCommit: string;
}

export interface Kart {
  baslik: string;
  // `durum: devam` etiketinin değeri (`devam`); etiket yoksa null.
  durum: string | null;
  acik: boolean;
}

// null: kart bulunamadı. 'yok': kaynağa ulaşılamadı (gh kurulu değil, oturum yok, ağ yok).
export type KartKaynagi = (no: number) => Kart | null | 'yok';

// null: kart bilgisi atlandı; uyarılar yalnız ad kuralına bakar.
export type Kartlar = ReadonlyMap<number, Kart | null> | null;

const ISTEMCI_MODULU = /^istemci\/src\/moduller\/([^/]+)\//;
const PAYLASILAN_MODULU = /^paylasilan\/(?:sozlesme|islemler|sayfalar|ayarlar)\/([^/.]+)\.ts$/;

export function dokunulanModul(yol: string): string | null {
  // Modüller klasörünün kendi dosyası modül değildir.
  const sunucu = yol.split('/').length > 3 ? modulAdi(yol) : null;
  return sunucu ?? ISTEMCI_MODULU.exec(yol)?.[1] ?? PAYLASILAN_MODULU.exec(yol)?.[1] ?? null;
}

// Önek klasörü (`modul/23-ad`) atlanır. Ajan worktree dalı (`worktree-agent-<kimlik>`) sayılmaz:
// kimlik rastgeledir ve rakamla başlayabilir.
export function kartNo(dal: string): number | null {
  const eslesme = /^(\d+)(?:[-_]|$)/.exec(dal.split('/').pop() ?? '');
  return eslesme ? Number(eslesme[1]) : null;
}

const etiketliSatir = (govde: readonly string[], desen: RegExp): string | null =>
  govde.map((satir) => desen.exec(satir)?.[1]?.trim() ?? '').find((deger) => deger !== '') ?? null;

function dalDurumu(kok: string, taban: string, ad: string, worktree: string | null): DalDurumu {
  // Ayrılma noktası alınır, tabanın ucu değil: taban ilerlemişse onun dosyaları bu dalın dokunuşu sayılmaz.
  // Ortak atası olmayan dalda komut hata verir; tek dal bütün raporu düşürmez.
  let ayrilma: string | null = null;
  try {
    ayrilma = git(kok, ['merge-base', taban, ad])[0] ?? null;
  } catch { /* ortak ata yok */ }
  const dosyalar = ayrilma === null ? [] : git(kok, ['diff', '--name-only', '--no-renames', ayrilma, ad]).sort();
  const [geride = '0', ileride = '0'] = (git(kok, ['rev-list', '--left-right', '--count', `${taban}...${ad}`])[0] ?? '').split('\t');
  const [sonCommit = '', ...govde] = git(kok, ['log', '-1', '--format=%cI%n%B', ad]);
  const moduller = new Set(dosyalar.map((yol) => dokunulanModul(yol) ?? MODUL_DISI));
  // Kendi commit'i olmayan dalın ucu tabanın commit'idir; onun satırları bu dalın işi değildir.
  const kendiGovdesi = Number(ileride) > 0 ? govde : [];
  return {
    ad,
    worktree,
    ortakAta: ayrilma !== null,
    dosyalar,
    moduller: [...[...moduller].filter((m) => m !== MODUL_DISI).sort(), ...(moduller.has(MODUL_DISI) ? [MODUL_DISI] : [])],
    yapildi: etiketliSatir(kendiGovdesi, /^\s*Yap[ıi]ld[ıi]\s*:\s*(.+)$/),
    siradaki: etiketliSatir(kendiGovdesi, /^\s*S[ıi]radaki\s*:\s*(.+)$/),
    geride: Number(geride),
    ileride: Number(ileride),
    sonCommit,
  };
}

// Açık dal: tabana birleşmemiş yerel dal ya da bir worktree'de açık duran dal. Yalnız commit'e girmiş
// değişiklik okunur; worktree'deki commit'siz değişiklik görünmez.
export function durumTopla(kok: string, taban: string = VARSAYILAN_TABAN): DalDurumu[] {
  const worktreeler = new Map<string, string>();
  let yol: string | null = null;
  for (const satir of git(kok, ['worktree', 'list', '--porcelain'])) {
    if (satir.startsWith('worktree ')) yol = satir.slice('worktree '.length);
    else if (satir.startsWith('branch refs/heads/') && yol !== null) worktreeler.set(satir.slice('branch refs/heads/'.length), yol);
  }
  const birlesmemis = git(kok, ['for-each-ref', '--format=%(refname:short)', '--no-merged', taban, 'refs/heads']);
  return [...new Set([...birlesmemis, ...worktreeler.keys()])]
    .filter((ad) => ad !== taban)
    .sort()
    .map((ad) => dalDurumu(kok, taban, ad, worktreeler.get(ad) ?? null));
}

// Kaynak bir kez 'yok' derse kalan kartlar sorulmaz: yarım kart bilgisiyle "kart bulunamadı" uyarısı yanıltır.
export function kartlariTopla(dallar: readonly DalDurumu[], kaynak: KartKaynagi): Kartlar {
  const kartlar = new Map<number, Kart | null>();
  for (const dal of dallar) {
    const no = kartNo(dal.ad);
    if (no === null || kartlar.has(no)) continue;
    const kart = kaynak(no);
    if (kart === 'yok') return null;
    kartlar.set(no, kart);
  }
  return kartlar;
}

const gunFarki = (simdi: Date, an: string): number => (simdi.getTime() - new Date(an).getTime()) / GUN;

export function uyarilariBul(dallar: readonly DalDurumu[], kartlar: Kartlar, simdi: Date): string[] {
  const uyarilar: string[] = [];
  const dokunanlar = new Map<string, string[]>();
  for (const dal of dallar) {
    for (const dosya of dal.dosyalar) dokunanlar.set(dosya, [...(dokunanlar.get(dosya) ?? []), dal.ad]);
  }
  for (const [dosya, adlar] of [...dokunanlar].sort(([a], [b]) => a.localeCompare(b))) {
    if (adlar.length > 1) uyarilar.push(`aynı dosya: ${dosya} (${adlar.join(', ')})`);
  }
  for (const dal of dallar) {
    const no = kartNo(dal.ad);
    const kart = no === null ? null : (kartlar?.get(no) ?? null);
    const gun = gunFarki(simdi, dal.sonCommit);
    if (no !== null && kart?.durum === 'devam' && kart.acik && gun > BEKLEME_GUNU) {
      uyarilar.push(`bekleyen kart: #${no} ${dal.ad} (durum: devam, son commit ${Math.floor(gun)} gün önce)`);
    }
  }
  for (const dal of dallar) {
    const no = kartNo(dal.ad);
    if (no === null) uyarilar.push(`kartsız dal: ${dal.ad} (ad kart numarasıyla başlamıyor)`);
    else if (kartlar !== null && (kartlar.get(no) ?? null) === null) uyarilar.push(`kartsız dal: ${dal.ad} (#${no} bulunamadı)`);
  }
  return uyarilar;
}

function kartMetni(dal: DalDurumu, kartlar: Kartlar): string {
  const no = kartNo(dal.ad);
  const kart = no === null ? null : (kartlar?.get(no) ?? null);
  if (no === null || kart === null) return '';
  const durum = kart.durum === null ? 'durum etiketi yok' : `durum: ${kart.durum}`;
  return `  #${no} ${kart.baslik} [${durum}${kart.acik ? '' : ', kapalı'}]`;
}

function dalMetni(dal: DalDurumu, kartlar: Kartlar, simdi: Date, taban: string): string[] {
  const gun = Math.floor(gunFarki(simdi, dal.sonCommit));
  const satirlar: Array<[string, string | null]> = [
    ['worktree', dal.worktree],
    ['modüller', !dal.ortakAta ? 'ortak ata yok' : dal.dosyalar.length === 0 ? 'değişiklik yok' : `${dal.moduller.join(', ')} (${dal.dosyalar.length} dosya)`],
    [taban, `${dal.geride} geride, ${dal.ileride} ileride; son commit ${gun <= 0 ? 'bugün' : `${gun} gün önce`}`],
    ['Yapıldı', dal.yapildi],
    ['Sıradaki', dal.siradaki],
  ];
  const en = Math.max(...satirlar.map(([ad]) => ad.length));
  return [
    `${dal.ad}${kartMetni(dal, kartlar)}`,
    ...satirlar.flatMap(([ad, deger]) => (deger === null ? [] : [`  ${ad.padEnd(en)}  ${deger}`])),
  ];
}

export const KART_ATLANDI = 'gh yok, kart bilgisi atlandı.';

export function durumMetni(
  dallar: readonly DalDurumu[], kartlar: Kartlar, uyarilar: readonly string[], simdi: Date, taban: string = VARSAYILAN_TABAN,
): string {
  if (dallar.length === 0) return `Açık dal yok (taban ${taban}).`;
  const bolumler = [
    [`Açık dal: ${dallar.length} (taban ${taban})`],
    ...dallar.map((dal) => dalMetni(dal, kartlar, simdi, taban)),
    [`Uyarılar (${uyarilar.length})`, ...uyarilar.map((u) => `  ${u}`)],
  ];
  return [bolumler.map((b) => b.join('\n')).join('\n\n'), ...(kartlar === null ? [KART_ATLANDI] : [])].join('\n');
}

// `gh issue view --json title,labels,state` cevabı; beklenmeyen biçim null.
export function kartCoz(json: string): Kart | null {
  let veri: unknown;
  try {
    veri = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof veri !== 'object' || veri === null) return null;
  const { title, labels, state } = veri as Record<string, unknown>;
  if (typeof title !== 'string' || typeof state !== 'string' || !Array.isArray(labels)) return null;
  const adlar = labels.map((e: unknown) => (typeof e === 'object' && e !== null ? (e as Record<string, unknown>).name : null));
  const durum = adlar.map((ad) => (typeof ad === 'string' ? /^durum:\s*(\S.*)$/.exec(ad)?.[1]?.trim() : undefined)).find((d) => d !== undefined);
  return { baslik: title, durum: durum ?? null, acik: state.toUpperCase() === 'OPEN' };
}

// Depo adı verilmez: gh, çalıştığı klasörün uzak adresinden çözer. Aracın tek ağ çağrısı budur.
// komut: çağrılan program ve ön argümanları; test gerçek gh yerine kendi betiğini verir.
export function ghKartKaynagi(kok: string, komut: readonly [string, ...string[]] = ['gh']): KartKaynagi {
  const [program, ...onArgumanlar] = komut;
  return (no) => {
    const s = spawnSync(program, [...onArgumanlar, 'issue', 'view', String(no), '--json', 'title,labels,state'], {
      cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
    });
    if (s.error !== undefined) return 'yok';
    if (s.status !== 0) return /could not resolve to an? (issue|pull ?request)/i.test(s.stderr) ? null : 'yok';
    return kartCoz(s.stdout) ?? 'yok';
  };
}

export interface DurumOrtami {
  simdi: Date;
  kartKaynagi: KartKaynagi;
}

const KULLANIM = 'Kullanım: npm run durum';

// Uyarı çıkış kodunu değiştirmez: araç bilgi verir, kapı değildir.
export function durumKos(
  argumanlar: readonly string[], kok: string = KOK, ortam: DurumOrtami = { simdi: new Date(), kartKaynagi: ghKartKaynagi(kok) },
): { kod: 0 | 1; cikti: string } {
  if (argumanlar.length > 0) return { kod: 1, cikti: `Tanınmayan argüman: ${argumanlar[0] ?? ''}. ${KULLANIM}` };
  let dallar: DalDurumu[];
  try {
    dallar = durumTopla(kok);
  } catch (hata) {
    return { kod: 1, cikti: `Dallar okunamadı (taban ${VARSAYILAN_TABAN}): ${hata instanceof Error ? hata.message : String(hata)}` };
  }
  const kartlar = kartlariTopla(dallar, ortam.kartKaynagi);
  return { kod: 0, cikti: durumMetni(dallar, kartlar, uyarilariBul(dallar, kartlar, ortam.simdi), ortam.simdi) };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  const { kod, cikti } = durumKos(process.argv.slice(2));
  if (kod === 0) console.log(cikti);
  else console.error(cikti);
  process.exitCode = kod;
}

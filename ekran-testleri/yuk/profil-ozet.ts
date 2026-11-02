// CPU profili özeti (V8 .cpuprofile): örneklerin kendi süresi kategoriye, fonksiyona ve kapsayıcı modül fonksiyonuna toplanır.
// Saf hesaptır; dosyayı okuyan çağırandır.

interface Dugum {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

export interface CpuProfili { nodes: Dugum[]; samples: number[]; timeDeltas: number[] }

export interface Pay { ad: string; yuzde: number }

export interface ProfilOzeti { toplamSn: number; kategoriler: Pay[]; fonksiyonlar: Pay[]; modulFonksiyonlari: Pay[] }

const MODUL = /sunucu\/moduller\/([^/]+)\/([^/]+)/;

// Sunucu kodu modül ve çekirdek adıyla, paketler paket adıyla ayrılır: darboğazın hangi katmanda olduğu tek bakışta görünsün.
export function kategori(cerceve: Dugum['callFrame']): string {
  const { url: u, functionName: f } = cerceve;
  if (f === '(idle)') return 'bos (idle)';
  if (f === '(garbage collector)') return 'GC';
  if (f === '(program)') return 'program (V8/yerel)';
  if (/node_modules\/(pg-protocol|pg)\//.test(u)) return 'pg surucusu';
  if (/node_modules\/zod\//.test(u)) return 'zod (dogrulama)';
  if (/node_modules\/(pino|thread-stream|sonic-boom)/.test(u)) return 'pino gunluk';
  if (/node_modules\/(fastify|@fastify|find-my-way|avvio|light-my-request)/.test(u)) return 'fastify';
  const paket = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(u);
  if (paket?.[1] !== undefined) return `paket ${paket[1]}`;
  if (u === '' || u.startsWith('node:')) return f === '' ? '(anonim/yerel)' : `node ic ${(u || f).slice(0, 40)}`;
  const modul = MODUL.exec(u);
  if (modul?.[1] !== undefined) return `modul ${modul[1]}`;
  if (u.includes('sunucu/cekirdek/')) return `cekirdek ${u.split('/').pop() ?? ''}`;
  if (u.includes('paylasilan/')) return 'paylasilan';
  return `diger ${u.split('/').slice(-2).join('/')}`;
}

const ilkler = (m: ReadonlyMap<string, number>, toplam: number, sayi: number): Pay[] =>
  [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, sayi)
    .map(([ad, t]) => ({ ad, yuzde: toplam > 0 ? Math.round((1000 * t) / toplam) / 10 : 0 }));

const ekle = (m: Map<string, number>, ad: string, t: number): void => { m.set(ad, (m.get(ad) ?? 0) + t); };

export function profilOzeti(p: CpuProfili, sayi = 25): ProfilOzeti {
  const dugum = new Map(p.nodes.map((n) => [n.id, n]));
  const ust = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) ust.set(c, n.id);
  const kendi = new Map<number, number>();
  p.samples.forEach((id, i) => { kendi.set(id, (kendi.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)); });
  const toplam = [...kendi.values()].reduce((a, b) => a + b, 0);

  const kat = new Map<string, number>();
  const fon = new Map<string, number>();
  const kapsayan = new Map<string, number>();
  for (const [id, t] of kendi) {
    const n = dugum.get(id);
    if (n === undefined) continue;
    ekle(kat, kategori(n.callFrame), t);
    ekle(fon, `${n.callFrame.functionName || '(anonim)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${String(n.callFrame.lineNumber + 1)}`, t);
    // Yığında aynı modül fonksiyonu birden çok geçse de süre bir kez sayılır.
    const gorulen = new Set<string>();
    for (let c: number | undefined = id; c !== undefined; c = ust.get(c)) {
      const d = dugum.get(c);
      const m = d === undefined ? null : MODUL.exec(d.callFrame.url);
      if (d === undefined || m === null) continue;
      const ad = `${m[1] ?? ''}/${m[2] ?? ''} ${d.callFrame.functionName || '(anonim)'}`;
      if (!gorulen.has(ad)) {
        gorulen.add(ad);
        ekle(kapsayan, ad, t);
      }
    }
  }
  return {
    toplamSn: Math.round(toplam / 1e5) / 10,
    kategoriler: ilkler(kat, toplam, sayi),
    fonksiyonlar: ilkler(fon, toplam, sayi),
    modulFonksiyonlari: ilkler(kapsayan, toplam, sayi),
  };
}

export function profilMetni(o: ProfilOzeti): string {
  const blok = (baslik: string, l: readonly Pay[]): string[] => [baslik, ...l.map((x) => `${x.yuzde.toFixed(1).padStart(5)}%  ${x.ad}`)];
  return [
    `Profil: ${String(o.toplamSn)} sn örnek`,
    ...blok('-- Kategori (kendi süresi)', o.kategoriler),
    ...blok('-- Fonksiyon (kendi süresi)', o.fonksiyonlar),
    ...blok('-- Modül fonksiyonu (kapsayıcı)', o.modulFonksiyonlari),
  ].join('\n');
}

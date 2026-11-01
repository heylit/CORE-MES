// Plan motoru kıyas seti (1475 a), saf. Aynı girdide üç plan ölçülür: motorun kendi planı ('yeni'), planlama çalışmasındaki plan bugünkü
// veriyle yeniden kurulmuş hâli ('sabit', planlamacının sırası) ve alt sınır (lowerBound; hiçbir planın geçemeyeceği gecikme).
// Ölçüler motorun kendi değerlendirmesindendir (engine.betik evaluate): ekran ve sunucu aynı sayıyı görür. Bir koşunun sonucu bir önceki
// koşuyla karşılaştırılır; motor değişikliği planı kötüleştirdiyse bulgu çıkar (kalite gerilemesi).

export interface PlanOlcusu {
  // Ağırlıklı gecikme (saat x öncelik ağırlığı); motorun birinci amacı.
  agirlikliGecikme: number;
  geciken: number;
  zamaninda: number;
  // Yerleşmeyen işlem sayısı (ufuk, kaynak, malzeme).
  yerlesmeyen: number;
  ayarSaati: number;
  // Son işin bitişi, planın başından saat.
  sonBitis: number;
  // Çalışmadaki plana göre değişen iş sayısı (tezgâh, sıra ya da 8 saatten çok kayma).
  degisen: number;
  sureMs: number;
}
export interface GoruntuSonucu {
  ad: string;
  islem: number;
  siparis: number;
  motor: PlanOlcusu;
  calisma: PlanOlcusu | null;
  altSinir: number | null;
  // (motor − alt sınır) / alt sınır; alt sınır 0 ise yalnız motor da 0'sa 0, değilse null (oran tanımsız).
  bosluk: number | null;
}
export interface KiyasSonucu { zaman: string; goruntuler: GoruntuSonucu[] }

const sayi = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

// evaluate çıktısından ölçü. Motor bu alanları her plan için sayı olarak verir (boş planda 0); sayı gelmeyen alan 0 yazılır.
export function planOlcusu(e: Record<string, unknown>, yerlesmeyen: number, sureMs: number): PlanOlcusu {
  return {
    agirlikliGecikme: sayi(e['wT']), geciken: sayi(e['late']), zamaninda: sayi(e['onT']), yerlesmeyen, ayarSaati: sayi(e['suH']),
    sonBitis: sayi(e['Cmax']), degisen: sayi(e['chg']), sureMs,
  };
}

export function bosluk(motor: number, altSinir: number | null): number | null {
  if (altSinir === null) return null;
  if (altSinir <= 1e-9) return motor <= 1e-9 ? 0 : null;
  return (motor - altSinir) / altSinir;
}

export interface Tolerans {
  // Ağırlıklı gecikmede kabul edilen artış: oran ve mutlak (saat); ikisi de aşılırsa bulgu.
  gecikmeOrani: number;
  gecikmeSaat: number;
  // Çözüm süresi sınırı (sunucu 60 sn) ve önceki koşuya göre kabul edilen süre artışı oranı.
  sureSiniriMs: number;
  sureOrani: number;
}
export const VARSAYILAN_TOLERANS: Tolerans = { gecikmeOrani: 0.05, gecikmeSaat: 1, sureSiniriMs: 60_000, sureOrani: 0.5 };

export interface KiyasBulgusu { ad: string; tur: 'gecikme' | 'yerlesmeyen' | 'sure-siniri' | 'sure' | 'calismadan-kotu' | 'eksik'; metin: string }

// Önceki koşu yoksa yalnız mutlak kurallar (süre sınırı, çalışmadaki plandan kötü motor) denetlenir.
export function karsilastir(yeni: KiyasSonucu, onceki: KiyasSonucu | null, t: Tolerans = VARSAYILAN_TOLERANS): KiyasBulgusu[] {
  const out: KiyasBulgusu[] = [];
  const eski = new Map((onceki?.goruntuler ?? []).map((g) => [g.ad, g]));
  for (const g of yeni.goruntuler) {
    const m = g.motor;
    if (m.sureMs > t.sureSiniriMs) out.push({ ad: g.ad, tur: 'sure-siniri', metin: `motor ${String(Math.round(m.sureMs))} ms sürdü, sınır ${String(t.sureSiniriMs)} ms` });
    // Gecikme yalnız aynı sayıda iş yerleşmişken kıyaslanır: daha çok iş yerleştiren plan daha çok gecikme taşıyabilir.
    if (g.calisma !== null && m.yerlesmeyen > g.calisma.yerlesmeyen) {
      out.push({ ad: g.ad, tur: 'calismadan-kotu', metin: `motor ${String(m.yerlesmeyen)} işlem yerleştiremedi, çalışmadaki plan ${String(g.calisma.yerlesmeyen)}` });
    } else if (g.calisma !== null && m.yerlesmeyen === g.calisma.yerlesmeyen && m.agirlikliGecikme > g.calisma.agirlikliGecikme * (1 + t.gecikmeOrani) + t.gecikmeSaat) {
      out.push({ ad: g.ad, tur: 'calismadan-kotu', metin: `motorun ağırlıklı gecikmesi ${yuvarla(m.agirlikliGecikme)}, çalışmadaki planın ${yuvarla(g.calisma.agirlikliGecikme)}` });
    }
    if (onceki === null) continue;
    const e = eski.get(g.ad);
    if (e === undefined) continue;
    if (m.yerlesmeyen > e.motor.yerlesmeyen) out.push({ ad: g.ad, tur: 'yerlesmeyen', metin: `yerleşmeyen işlem ${String(e.motor.yerlesmeyen)} → ${String(m.yerlesmeyen)}` });
    else if (m.agirlikliGecikme > e.motor.agirlikliGecikme * (1 + t.gecikmeOrani) + t.gecikmeSaat) {
      out.push({ ad: g.ad, tur: 'gecikme', metin: `ağırlıklı gecikme ${yuvarla(e.motor.agirlikliGecikme)} → ${yuvarla(m.agirlikliGecikme)}` });
    }
    if (e.motor.sureMs > 0 && m.sureMs > e.motor.sureMs * (1 + t.sureOrani) && m.sureMs - e.motor.sureMs > 1000) {
      out.push({ ad: g.ad, tur: 'sure', metin: `motor süresi ${String(Math.round(e.motor.sureMs))} → ${String(Math.round(m.sureMs))} ms` });
    }
  }
  for (const ad of eski.keys()) if (!yeni.goruntuler.some((g) => g.ad === ad)) out.push({ ad, tur: 'eksik', metin: 'önceki koşuda vardı, bu koşuda yok' });
  return out;
}

const yuvarla = (x: number): string => (Math.round(x * 10) / 10).toLocaleString('tr-TR');

// Komut satırı için düz metin tablo: görüntü başına bir satır, ardından bulgular.
export function raporMetni(s: KiyasSonucu, bulgular: readonly KiyasBulgusu[]): string {
  const satir = (g: GoruntuSonucu) => [
    g.ad, String(g.islem), yuvarla(g.motor.agirlikliGecikme), g.calisma === null ? '-' : yuvarla(g.calisma.agirlikliGecikme),
    g.altSinir === null ? '-' : yuvarla(g.altSinir), g.bosluk === null ? '-' : `%${yuvarla(g.bosluk * 100)}`,
    `${String(g.motor.yerlesmeyen)}/${g.calisma === null ? '-' : String(g.calisma.yerlesmeyen)}`, String(g.motor.geciken), String(Math.round(g.motor.sureMs)),
  ].join('\t');
  const baslik = ['görüntü', 'işlem', 'motor gecikme', 'çalışma gecikme', 'alt sınır', 'boşluk', 'yerleşmeyen m/ç', 'geciken sipariş', 'süre ms'].join('\t');
  const b = bulgular.length === 0 ? ['Bulgu yok.'] : bulgular.map((x) => `BULGU ${x.ad} [${x.tur}]: ${x.metin}`);
  return [`Kıyas ${s.zaman}`, baslik, ...s.goruntuler.map(satir), '', ...b].join('\n');
}

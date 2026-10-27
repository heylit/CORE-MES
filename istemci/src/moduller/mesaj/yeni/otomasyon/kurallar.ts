import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { D, H, M, isoGun, sayi } from '../bicim.ts';
import {
  benimYanitim, bendenOnayBekliyor, duyuruBekliyor, duzMetin, katilimciMi, kisiAnahtari, onayDurumu, sonrakiZaman, teslimEtiketi,
} from '../kurallar.ts';
import type { Duyuru, Gorev, Kanal, Kayit, Kural, KuralTuru, Onay, SiparisOzeti, Toplanti, Zamanli } from '../tipler.ts';

export type { KuralTuru };

// Otomatik uyarı, zamanlanmış ileti ve hatırlatma kuralları (205 a: ekranda saf işlev). Saat parametredir; yazma yoktur.

interface Parametre {
  etiket: string;
  varsayilan: number | string;
}

export interface KuralTanimi {
  baslik: string;
  aciklama: string;
  parametreler: Readonly<Record<string, Parametre>>;
  simge: SimgeAdi;
  // Sipariş özeti (212 a) oluşma ve son değişiklik zamanı, üretim notu taşımaz; bu türler kurulur ama Siparişler'den
  // bu alanlar gelene kadar değerlendirilmez (838 a).
  calisir: boolean;
}

export const BEKLEYEN_TUR = 'Siparişler verisi gelince çalışır';

export const KURAL_TURLERI: Readonly<Record<KuralTuru, KuralTanimi>> = {
  order_risk: {
    baslik: 'Teslim riskteyse uyar',
    aciklama: 'Teslime belirli gün kala üretim hedefin gerisindeyse kanala uyarı gönderir.',
    parametreler: { days: { etiket: 'Teslime kaç gün kala', varsayilan: 2 }, pct: { etiket: 'Üretim yüzde kaçın altındaysa', varsayilan: 80 } },
    simge: 'alert',
    calisir: true,
  },
  order_ready: {
    baslik: 'Sipariş hazır olunca haber ver',
    aciklama: 'Üretim hedefe ulaşınca kanala “sevke hazır” mesajı gönderir.',
    parametreler: {},
    simge: 'check',
    calisir: false,
  },
  order_new: {
    baslik: 'Yeni sipariş açılınca bildir',
    aciklama: 'Sisteme yeni sipariş girildiğinde kanala bilgi verir.',
    parametreler: {},
    simge: 'plus',
    calisir: false,
  },
  prod_word: {
    baslik: 'Üretim notunda uyarı kelimesi',
    aciklama: 'Üretim girişinin notunda belirlediğin kelimeler geçerse kanala alarm verir.',
    parametreler: { words: { etiket: 'Kelimeler (virgülle)', varsayilan: 'arıza, duruş, hata, fire' } },
    simge: 'fire',
    calisir: false,
  },
  task_late: {
    baslik: 'Görev gecikince sorumluyu uyar',
    aciklama: 'Son tarihi geçen görevin sorumlusunu kanalda etiketler.',
    parametreler: {},
    simge: 'clock',
    calisir: true,
  },
  appr_wait: {
    baslik: 'Onay bekletilirse hatırlat',
    aciklama: 'Onay isteği belirli saat yanıtsız kalırsa onaylayacakları etiketler.',
    parametreler: { hours: { etiket: 'Kaç saat sonra', varsayilan: 24 } },
    simge: 'bell',
    calisir: true,
  },
  ann_unread: {
    baslik: 'Duyuru okunmazsa hatırlat',
    aciklama: 'Duyuru belirli saat sonra hâlâ okunmadıysa okumayanları etiketler.',
    parametreler: { hours: { etiket: 'Kaç saat sonra', varsayilan: 12 } },
    simge: 'flag',
    calisir: true,
  },
};

export const kuralTuruMu = (t: string): t is KuralTuru => Object.hasOwn(KURAL_TURLERI, t);

export function kuralParametresi(kural: { type: string; params?: Record<string, unknown> }, ad: string): number | string {
  const deger = kural.params?.[ad];
  if (typeof deger === 'number' || typeof deger === 'string') return deger;
  return kuralTuruMu(kural.type) ? (KURAL_TURLERI[kural.type].parametreler[ad]?.varsayilan ?? '') : '';
}

// Formdan gelen metin: sayı parametresinde boş ya da sıfır varsayılana döner (prototip `+x || v`).
export function parametreleriAyikla(tur: KuralTuru, girdi: Readonly<Record<string, string>>): Record<string, number | string> {
  const sonuc: Record<string, number | string> = {};
  for (const [ad, p] of Object.entries(KURAL_TURLERI[tur].parametreler)) {
    const x = girdi[ad] ?? '';
    sonuc[ad] = typeof p.varsayilan === 'number' ? (Number(x) || p.varsayilan) : x;
  }
  return sonuc;
}

export interface Uyari {
  kural: Kayit<Kural>;
  anahtar: string;
  metin: string;
  bahisler: string[];
  kanal?: string;
  yanit?: { id: string; by: string; text: string };
}

export interface UyariGirdisi {
  kurallar: readonly Kayit<Kural>[];
  kanallar: readonly Kayit<Kanal>[];
  siparisler: readonly SiparisOzeti[];
  gorevler: readonly Kayit<Gorev>[];
  onaylar: readonly Kayit<Onay>[];
  duyurular: readonly Kayit<Duyuru>[];
  // Duyuruyu okumayanların arandığı kişiler (prototip `knownPeople`).
  bilinenKisiler: readonly string[];
  ad: (id: string) => string;
  simdi: number;
}

const tarihKisa = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

// Prototip `evalRules`: kural başına tetiklenecek uyarılar; tekrar gönderimi `anahtar` ve tetik kaydı önler.
export function uyarilariHesapla(g: UyariGirdisi): Uyari[] {
  const out: Uyari[] = [];
  const kanalVar = (id: string) => g.kanallar.some((c) => c.id === id);
  for (const r of g.kurallar) {
    if (!r.on || !kuralTuruMu(r.type) || !KURAL_TURLERI[r.type].calisir || !kanalVar(r.cid)) continue;
    const since = (r.createdAt || 0) - D;
    if (r.type === 'order_risk') {
      for (const o of g.siparisler) {
        // Üretilen bilinmiyorsa oran hesaplanmaz; sıfır sayılıp uyarı uydurulmaz.
        if (o.durum === 'sevk' || !o.teslim || !o.hedef || o.uretilen === null) continue;
        const dl = teslimEtiketi(o.teslim, g.simdi);
        if (!dl) continue;
        const uretilen = o.uretilen;
        const pct = uretilen / o.hedef * 100;
        if (dl.diff <= Number(kuralParametresi(r, 'days')) && pct < Number(kuralParametresi(r, 'pct'))) {
          const kalan = dl.diff < 0 ? `${-dl.diff} gün gecikti` : dl.diff === 0 ? 'bugün çıkacak' : `${dl.diff} gün kaldı`;
          out.push({
            kural: r,
            anahtar: `${r.id}_${o.id}`,
            metin: `⚠️ **#${o.no} ${o.musteri}** teslime ${kalan} ama üretim %${Math.round(pct)} (${sayi(uretilen)} / ${sayi(o.hedef)} ${o.birim || 'adet'}).`,
            bahisler: [],
          });
        }
      }
    }
    if (r.type === 'task_late') {
      for (const t of g.gorevler) {
        if (t.status === 'done' || !t.due || !t.to || t.due >= g.simdi || t.due < since) continue;
        if (teslimEtiketi(t.due, g.simdi)?.c !== 'late') continue;
        out.push({
          kural: r,
          anahtar: `${r.id}_${t.id}_${isoGun(t.due)}`,
          metin: `⏰ <@${t.to}> “${t.title}” görevinin süresi geçti${t.by && t.by !== t.to ? ` (veren: ${g.ad(t.by)})` : ''}.`,
          bahisler: [t.to],
        });
      }
    }
    if (r.type === 'appr_wait') {
      const saat = Number(kuralParametresi(r, 'hours'));
      for (const a of g.onaylar) {
        const st = onayDurumu(a);
        const taban = a.last && a.last.t === 'yeniden onaya sundu' ? a.last.ts : a.createdAt;
        if (st.s !== 'wait' || taban < since || g.simdi - taban < saat * H) continue;
        const bekleyen = st.ds.filter((x) => !x.v).map((x) => x.id);
        if (bekleyen.length) {
          out.push({
            kural: r,
            anahtar: `${r.id}_${a.id}_${a.round || 1}`,
            metin: `🔔 ${bekleyen.map((u) => `<@${u}>`).join(' ')} “${a.title}” ${saat} saattir onayınızı bekliyor.`,
            bahisler: bekleyen,
          });
        }
      }
    }
    if (r.type === 'ann_unread') {
      const saat = Number(kuralParametresi(r, 'hours'));
      for (const a of g.duyurular) {
        if (a.ts < since || g.simdi - a.ts < saat * H) continue;
        const okuyan = Object.values(a.ack || {});
        const bekleyen = g.bilinenKisiler.filter((u) => u !== a.by && !okuyan.includes(u) && !u.startsWith('__'));
        if (!bekleyen.length) continue;
        out.push({
          kural: r,
          anahtar: `${r.id}_${a.id}`,
          metin: `📣 ${bekleyen.map((u) => `<@${u}>`).join(' ')} şu duyuruyu henüz okumadınız: “${duzMetin(a.text, g.ad).replace(/\*\*/g, '').slice(0, 120)}”`,
          bahisler: bekleyen,
          kanal: a.cid,
          yanit: a.mid ? { id: a.mid, by: a.by, text: a.text.slice(0, 200) } : undefined,
        });
      }
    }
  }
  return out;
}

// Tur başına en çok bu kadar uyarı iletisi gider; kalanlar sonraki turda.
export const TUR_BASINA_UYARI = 5;

// Tetik kaydı yolu belge yolu kuralına uyar (prototipteki karakter kümesi ve uzunluk).
export const tetikAnahtari = (anahtar: string): string => anahtar.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 190);

// Duyuruyu okumayanların arandığı kişiler (knownPeople): çevrimiçiler, açılan kanalların yazarları ve veride geçen herkes.
export function bilinenKisiler(g: Pick<UyariGirdisi, 'gorevler' | 'onaylar' | 'duyurular'>, ben: string, ek: readonly string[] = []): string[] {
  const s = new Set<string>([ben, ...ek]);
  for (const t of g.gorevler) { if (t.to) s.add(t.to); if (t.by) s.add(t.by); }
  for (const a of g.onaylar) { s.add(a.by); for (const x of a.approvers || []) s.add(x); }
  for (const a of g.duyurular) { s.add(a.by); for (const x of Object.values(a.ack || {})) if (x) s.add(x); }
  return [...s].filter(Boolean);
}

export const vaktiGelenler = (zamanli: readonly Kayit<Zamanli>[], simdi: number): Kayit<Zamanli>[] =>
  zamanli.filter((z) => z.status === 'bekliyor' && z.sendAt <= simdi);

// Gönderimden önce yazılan durum: tekrarlıysa sonraki zamana alınır, değilse gönderildi olur. Sunucu, zamanlayan
// adına yazmayı bu kaydın gönderim anına bakarak 5 dk açar; bu yüzden ileti bundan sonra gider.
export function gonderimSonrasi(z: Pick<Zamanli, 'sendAt' | 'repeat'>, simdi: number): Partial<Zamanli> {
  if (z.repeat && z.repeat !== 'none') return { sendAt: sonrakiZaman(z.sendAt, z.repeat, simdi), lastSent: simdi };
  return { status: 'gonderildi', sentAt: simdi };
}

export const TEKRARLAR = { none: 'Tekrar yok', daily: 'Her gün', weekdays: 'Hafta içi her gün', weekly: 'Her hafta' } as const;

export interface Hatirlatma {
  anahtar: string;
  tur: 'toplanti' | 'gorev';
  id: string;
  baslik: string;
  metin: string;
}

// Prototip `runReminders`: toplantı hatırlatma süresi içinde ya da görevin hatırlatma anından 12 saat içinde.
export function hatirlatmalar(
  g: { toplantilar: readonly Kayit<Toplanti>[]; gorevler: readonly Kayit<Gorev>[]; ben: string; simdi: number },
  baslamaMetni: (ts: number) => string,
): Hatirlatma[] {
  const out: Hatirlatma[] = [];
  for (const mt of g.toplantilar) {
    if (mt.cancelled || !katilimciMi(mt, g.ben) || benimYanitim(mt, g.ben) === 'no' || !mt.remind) continue;
    if (g.simdi >= mt.start - mt.remind * M && g.simdi < mt.start + 5 * M) {
      out.push({ anahtar: `rm:${mt.id}:${mt.start}`, tur: 'toplanti', id: mt.id, baslik: mt.title, metin: `${baslamaMetni(mt.start)}${mt.loc ? `, ${mt.loc}` : ''}` });
    }
  }
  for (const t of g.gorevler) {
    if (t.to !== g.ben || t.status === 'done' || !t.remind) continue;
    if (g.simdi >= t.remind && g.simdi < t.remind + 12 * H) {
      const son = t.due ? teslimEtiketi(t.due, g.simdi) : null;
      out.push({ anahtar: `rt:${t.id}:${t.remind}`, tur: 'gorev', id: t.id, baslik: `Hatırlatma: ${t.title}`, metin: son ? `Son tarih: ${son.t}` : 'Görev hatırlatması' });
    }
  }
  return out;
}

export type EkranBildirimi =
  | { anahtar: string; metin: string; hedef: { kanal: string } }
  | { anahtar: string; metin: string; hedef: { tur: 'onay' | 'gorev'; id: string } }
  | { anahtar: string; metin: string; hedef: { gorunum: 'bugun' } }
  | { anahtar: string; metin: string; hedef: null };

// Prototip `notifyChecks`: açılıştan sonra gelen bahis, onay isteği, onay kararı, görev ve duyuru. Aynı anahtar bir kez.
export function ekranBildirimleri(g: {
  kanallar: readonly Kayit<Kanal>[];
  onaylar: readonly Kayit<Onay>[];
  gorevler: readonly Kayit<Gorev>[];
  duyurular: readonly Kayit<Duyuru>[];
  okunan: Readonly<Record<string, number>>;
  ben: string;
  acikKanal: string | null;
  acilis: number;
  ad: (id: string) => string;
}): EkranBildirimi[] {
  const out: EkranBildirimi[] = [];
  const ilkAd = (id: string) => g.ad(id).split(' ')[0] ?? '';
  const benAnahtar = kisiAnahtari(g.ben);
  for (const c of g.kanallar) {
    if (c.id === g.acikKanal) continue;
    const m = c.mentions?.[benAnahtar];
    const lr = g.okunan[c.id] || 0;
    if (m && m > lr && m > g.acilis) out.push({ anahtar: `m${c.id}${m}`, metin: `#${c.name} kanalında senden bahsedildi.`, hedef: { kanal: c.id } });
  }
  for (const a of g.onaylar) {
    if (bendenOnayBekliyor(a, g.ben) && (a.createdAt > g.acilis || (a.last && a.last.ts > g.acilis))) {
      out.push({ anahtar: `a${a.id}${a.round || 1}`, metin: `${ilkAd(a.by)} onayını istiyor: ${a.title}`, hedef: { tur: 'onay', id: a.id } });
    }
  }
  for (const a of g.onaylar) {
    if (a.by === g.ben && a.last && a.last.by !== g.ben && a.last.ts > g.acilis) {
      out.push({ anahtar: `al${a.id}${a.last.ts}`, metin: `${ilkAd(a.last.by)} isteğini ${a.last.t}: ${a.title}`, hedef: null });
    }
  }
  for (const t of g.gorevler) {
    if (t.to === g.ben && t.by !== g.ben && t.createdAt > g.acilis) {
      out.push({ anahtar: `t${t.id}`, metin: `${ilkAd(t.by)} sana görev verdi: ${t.title}`, hedef: { tur: 'gorev', id: t.id } });
    }
  }
  for (const a of g.duyurular) {
    if (duyuruBekliyor(a, g.ben) && a.ts > g.acilis) out.push({ anahtar: `d${a.id}`, metin: `${ilkAd(a.by)} bir duyuru yaptı.`, hedef: { gorunum: 'bugun' } });
  }
  return out;
}

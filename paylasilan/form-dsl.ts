// Kalite Merkezi form tasarım dili (uygulamanın parseDSL'i): satır başına bir öğe. İstemcinin Formlar tasarımcısı ve sunucunun GKK
// şablon denetimi (3118) aynı çözücüyü kullanır.
// `# Başlık` yeni bölüm; `? Madde` kontrol maddesi; `[Tablo: A, B]` tablo; `Alan *` zorunlu kısa metin;
// `Alan | tarih|sayı|metin|seçim: A, B|çoklu: A, B`. `//` ile başlayan satır yorumdur.

export type DslAlanTuru = 'metin' | 'tarih' | 'sayi' | 'cokSatir' | 'secim' | 'isaretler';

export interface DslAlani {
  etiket: string;
  tur: DslAlanTuru;
  // Seçimde ilk seçenek boştur (uygulamanın `['', ...]` listesi); çoklu seçimde boş seçenek yoktur.
  secenekler?: readonly string[];
  zorunlu: boolean;
}

export interface DslBolumu {
  baslik: string;
  alanlar: DslAlani[];
  liste: string[];
  tablo: { sutunlar: string[] } | null;
}

const kucuk = (s: string) => s.toLocaleLowerCase('tr');

export function dslCoz(metin: unknown): DslBolumu[] {
  const bolumler: DslBolumu[] = [];
  let simdiki: DslBolumu | null = null;
  const yeni = (baslik: string): DslBolumu => {
    const b: DslBolumu = { baslik, alanlar: [], liste: [], tablo: null };
    bolumler.push(b);
    return b;
  };
  const bolum = () => simdiki ?? (simdiki = yeni(''));
  for (const ham of String(metin ?? '').split('\n')) {
    const satir = ham.trim();
    if (!satir || satir.startsWith('//')) continue;
    if (satir.startsWith('#')) { simdiki = yeni(satir.replace(/^#+\s*/, '')); continue; }
    if (satir.startsWith('?')) { bolum().liste.push(satir.slice(1).trim()); continue; }
    const tablo = /^\[\s*tablo\s*:(.*)\]$/i.exec(satir);
    if (tablo) { bolum().tablo = { sutunlar: (tablo[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) }; continue; }
    const cizgi = satir.indexOf('|');
    const ad = (cizgi >= 0 ? satir.slice(0, cizgi) : satir).trim();
    const tanim = cizgi >= 0 ? satir.slice(cizgi + 1).trim() : '';
    const zorunlu = /\*$/.test(ad);
    const etiket = ad.replace(/\*$/, '').trim();
    const t = kucuk(tanim);
    const secenekler = () => tanim.split(':').slice(1).join(':').split(',').map((s) => s.trim()).filter(Boolean);
    let alan: DslAlani = { etiket, tur: 'metin', zorunlu };
    if (t.startsWith('tarih')) alan = { ...alan, tur: 'tarih' };
    else if (t.startsWith('sayı') || t.startsWith('sayi')) alan = { ...alan, tur: 'sayi' };
    else if (t.startsWith('metin')) alan = { ...alan, tur: 'cokSatir' };
    else if (t.startsWith('seçim') || t.startsWith('secim')) alan = { ...alan, tur: 'secim', secenekler: ['', ...secenekler()] };
    else if (t.startsWith('çoklu') || t.startsWith('coklu')) alan = { ...alan, tur: 'isaretler', secenekler: secenekler() };
    bolum().alanlar.push(alan);
  }
  return bolumler;
}

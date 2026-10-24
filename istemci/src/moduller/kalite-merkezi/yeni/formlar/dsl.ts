// Form tasarım dili (uygulamanın parseDSL'i): satır başına bir öğe.
// `# Başlık` yeni bölüm; `? Madde` Evet / Hayır / UD maddesi; `[Tablo: A, B]` tablo; `Alan *` zorunlu kısa metin;
// `Alan | tarih|sayı|metin|seçim: A, B|çoklu: A, B`. `//` ile başlayan satır yorumdur.
// Kayıt gövdesi eski çerçeveyle aynı anahtarları taşır (`veri["b_a"]`, `liste["b_m"]`, `listeNot`, `tablo[b]` = `{c0, c1...}`).

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

export type ListeYaniti = 'Evet' | 'Hayır' | 'UD' | '';
export const LISTE_YANITLARI = ['Evet', 'Hayır', 'UD'] as const;

export interface FormIcerigi {
  veri: Record<string, unknown>;
  liste: Record<string, string>;
  listeNot: Record<string, string>;
  tablo: Record<string, Record<string, string>[]>;
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

export const alanAnahtari = (bolum: number, sira: number) => `${bolum}_${sira}`;

export const icerikVarMi = (bolumler: readonly DslBolumu[]) => bolumler.some((b) => b.alanlar.length > 0 || b.liste.length > 0 || b.tablo !== null);

// "Karar", "Durum" ya da "Sonuç" ile başlayan ilk dolu alan kaydın sonucudur; yoksa kontrol listesinden çıkar.
export function formSonucu(bolumler: readonly DslBolumu[], veri: Readonly<Record<string, unknown>>, liste: Readonly<Record<string, string>> | undefined): string {
  for (let b = 0; b < bolumler.length; b++) {
    const alanlar = bolumler[b]?.alanlar ?? [];
    for (let a = 0; a < alanlar.length; a++) {
      const deger = veri[alanAnahtari(b, a)];
      if (/^(karar|durum|sonuç)/i.test(alanlar[a]?.etiket ?? '') && deger) return String(deger);
    }
  }
  const yanitlar = Object.values(liste ?? {});
  if (yanitlar.includes('Hayır')) return 'Uygunsuzluk var';
  if (yanitlar.length) return 'Uygun';
  return 'Tamamlandı';
}

export type SonucTonu = 'hata' | 'tamam' | 'uyari';

// Uygulamanın resClass'ı: olumsuz sözcük önce bakılır ("Uygun değil" kötüdür).
export function sonucTonu(sonuc: unknown): SonucTonu {
  const s = typeof sonuc === 'string' ? sonuc : '';
  if (/Ret|RET|Uygunsuzluk|değil|Reddedildi|Onaylanmadı|Kritik|tekrar|Karantina|KARANTİNA/i.test(s)) return 'hata';
  if (/Kabul|KABUL|^Uygun$|Onaylandı|Onaylı|Kapatıldı|^Yetkin|Tamamlandı/.test(s)) return 'tamam';
  return 'uyari';
}

export interface FormEksigi {
  metin: string;
  // Hangi adımda düzeltilir: 0 kayıt bilgileri, n bölüm n-1.
  adim: number;
  alan?: string;
}

export interface BasAlanlari {
  tarih?: unknown;
  dolduran?: unknown;
  bolum?: unknown;
}

const dolu = (v: unknown) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '');

// Onaya göndermeden önceki eksikler: zorunlu alan, yanıtsız madde, "Hayır" yanıtının açıklaması.
export function formEksikleri(bolumler: readonly DslBolumu[], bas: BasAlanlari, icerik: FormIcerigi): FormEksigi[] {
  const eksik: FormEksigi[] = [];
  if (!dolu(bas.tarih)) eksik.push({ metin: 'Tarih boş', adim: 0, alan: 'tarih' });
  if (!dolu(bas.dolduran)) eksik.push({ metin: 'Dolduran boş', adim: 0, alan: 'dolduran' });
  bolumler.forEach((b, bi) => {
    b.alanlar.forEach((a, ai) => {
      if (a.zorunlu && !dolu(icerik.veri[alanAnahtari(bi, ai)])) eksik.push({ metin: `${a.etiket} boş`, adim: bi + 1, alan: alanAnahtari(bi, ai) });
    });
  });
  bolumler.forEach((b, bi) => {
    b.liste.forEach((m, mi) => {
      const k = alanAnahtari(bi, mi);
      const y = icerik.liste[k] ?? '';
      if (!y) eksik.push({ metin: `Yanıtsız madde: ${m}`, adim: bi + 1 });
      else if (y === 'Hayır' && !icerik.listeNot[k]) eksik.push({ metin: `"Hayır" yanıtı için açıklama yok: ${m}`, adim: bi + 1 });
    });
  });
  return eksik;
}

// Zorunlu alan ve madde sayacı ("3 / 7 zorunlu alan ve madde tamamlandı").
export function formIlerlemesi(bolumler: readonly DslBolumu[], eksikler: readonly FormEksigi[]): { tamam: number; toplam: number } {
  const zorunlu = 2 + bolumler.reduce((t, b) => t + b.alanlar.filter((a) => a.zorunlu).length, 0);
  const madde = bolumler.reduce((t, b) => t + b.liste.length, 0);
  const alanEksigi = eksikler.filter((e) => e.alan !== undefined).length;
  const maddeEksigi = eksikler.filter((e) => e.alan === undefined && e.metin.startsWith('Yanıtsız')).length;
  return { tamam: zorunlu - alanEksigi + madde - maddeEksigi, toplam: zorunlu + madde };
}

// Kaydedilen tablo satırlarından tamamen boş olanlar atılır.
export function tabloSatirlari(satirlar: readonly Record<string, string>[]): Record<string, string>[] {
  return satirlar.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v ?? '').trim()]))).filter((s) => Object.values(s).some(Boolean));
}

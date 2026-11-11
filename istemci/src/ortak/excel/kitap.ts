// Excel dosyasını yazar ve okur (exceljs, depodaki 4.4.0; yalnız pencere kullanılınca yüklenir, dış adrese gidilmez).
// Dosya sunucuya gitmez: tarayıcıda okunur, satırlar sayfanın toplu kaydet ucuna gider.
import type * as ExcelJsModulu from 'exceljs';
import {
  DOSYA_EN_BUYUK_BAYT, EVET, HAYIR, damga, metinYaz, secenekEtiketi, sutunBasligi,
  type ExcelSutunu, type ExcelTanimi, type Hucre, type SayfaSatirlari, type Deger,
} from './kurallar.ts';

type ExcelJs = typeof ExcelJsModulu;
// Paketin tip tanımında veri doğrulama yok; çalışma zamanında var (Malzemeler aynı yolu kullanır).
type Dogrulamali = { dataValidations: { add(aralik: string, kural: object): void } };
let yukleniyor: Promise<ExcelJs> | null = null;
const exceljs = (): Promise<ExcelJs> => {
  yukleniyor ??= import('exceljs').then((m) => ((m as { default?: ExcelJs }).default ?? m)).catch((e: unknown) => { yukleniyor = null; throw e; });
  return yukleniyor;
};

export class DosyaReddi extends Error {}

const LISTE_SAYFASI = 'Listeler';
const KILAVUZ_SAYFASI = 'Nasıl kullanılır';
const SONUC_BASLIGI = 'Sonuç';
const YAZI = { name: 'Arial', size: 10 } as const;
const KALIN = { ...YAZI, bold: true } as const;
// Dosyanın içindeki renkler (Excel'in kendi biçimi; ekran tasarım değişkenleri buraya ulaşmaz).
const ZORUNLU_ZEMIN = 'FFFCE8C3';
const BASLIK_ZEMIN = 'FFE6ECEE';
const HATA_YAZI = 'FFB3261E';
const ZIP_IMZASI = [0x50, 0x4b, 0x03, 0x04];

const icerir = (b: Uint8Array, metin: string): boolean => {
  const aranan = [...metin].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i + aranan.length <= b.length; i += 1) {
    for (let j = 0; j < aranan.length; j += 1) if (b[i + j] !== aranan[j]) continue outer;
    return true;
  }
  return false;
};

// Ayrıştırmadan önce: boyut, ZIP imzası, makro (Güvenlik K3). Zip'teki dosya adları sıkıştırılmaz, makro parçası adından tanınır.
export function dosyaDenetle(ad: string, b: Uint8Array): void {
  if (b.length > DOSYA_EN_BUYUK_BAYT) throw new DosyaReddi(`Dosya en çok ${String(DOSYA_EN_BUYUK_BAYT / 1024 / 1024)} MB olabilir.`);
  if (!/\.xlsx$/i.test(ad) || ZIP_IMZASI.some((x, i) => b[i] !== x)) throw new DosyaReddi('Yalnız .xlsx dosyası yüklenir (.xls, .xlsm, .csv değil).');
  if (icerir(b, 'vbaProject') || icerir(b, 'macroEnabled')) throw new DosyaReddi('Makro içeren dosya kabul edilmez.');
}

const hucreDegeri = (v: unknown): Hucre => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Hucre;
  const o = v as { richText?: { text?: string }[]; result?: unknown; text?: unknown; error?: unknown };
  if (Array.isArray(o.richText)) return o.richText.map((p) => p.text ?? '').join('');
  // Formül çalıştırılmaz: yalnız dosyada kayıtlı sonucu alınır.
  if ('formula' in o || 'sharedFormula' in o) return 'result' in o ? hucreDegeri(o.result) : null;
  if ('text' in o) return hucreDegeri(o.text);
  return null;
};

// Yalnız tanımdaki sayfalar okunur; sütun sayısı tanımla sınırlıdır. Damga başka sayfanın şablonunu ayırır.
// Eski tarayıcı (ve jsdom) File.arrayBuffer taşımaz; FileReader aynı baytları verir.
const baytlar = (dosya: Blob): Promise<ArrayBuffer> => (typeof dosya.arrayBuffer === 'function' ? dosya.arrayBuffer() : new Promise((tamam, ret) => {
  const r = new FileReader();
  r.onload = () => { tamam(r.result as ArrayBuffer); };
  r.onerror = () => { ret(r.error ?? new Error('Dosya okunamadı.')); };
  r.readAsArrayBuffer(dosya);
}));

export async function dosyaOku(t: ExcelTanimi, dosya: File): Promise<SayfaSatirlari> {
  const b = new Uint8Array(await baytlar(dosya));
  dosyaDenetle(dosya.name, b);
  const E = await exceljs();
  const wb = new E.Workbook();
  try {
    await wb.xlsx.load(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  } catch {
    throw new DosyaReddi('Dosya okunamadı. Bu sayfadan indirilen şablonla doldurulmuş bir .xlsx olmalı.');
  }
  if (wb.subject !== damga(t)) throw new DosyaReddi(`Bu dosya "${t.baslik}" şablonu değil. Şablonu bu sayfadan indirip doldurun.`);
  const sonuc: SayfaSatirlari = {};
  for (const s of t.sayfalar) {
    const ws = wb.getWorksheet(s.ad);
    if (!ws) continue;
    const satirlar: SayfaSatirlari[string] = [];
    ws.eachRow({ includeEmpty: false }, (row, no) => {
      const h: Hucre[] = [];
      for (let c = 1; c <= s.sutunlar.length + 1; c += 1) h.push(hucreDegeri(row.getCell(c).value));
      satirlar.push({ no, hucreler: h });
    });
    sonuc[s.ad] = satirlar;
  }
  return sonuc;
}

const yazilacak = (s: ExcelSutunu, d: Deger | null | undefined): ExcelJsModulu.CellValue => {
  if (d === null || d === undefined || d === '') return null;
  if (s.tur === 'evet-hayir') return d === true ? EVET : d === false ? HAYIR : null;
  if (s.tur === 'liste') { const x = s.liste?.find((y) => y.kod === d); return metinYaz(x ? secenekEtiketi(x) : String(d)); }
  if (s.tur === 'tarih' && typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T00:00:00Z`);
  if (typeof d === 'number') return d;
  return metinYaz(String(d));
};

export interface SablonSecenegi {
  // Mevcut kayıtlar dolu gelir (yalnız ekranın gösterdiği alanlar; Güvenlik K1).
  dolu?: boolean;
  // Hata dosyası: okunan satırlar olduğu gibi, sonuna Sonuç sütunu.
  sonuclar?: Record<string, { hucreler: Hucre[]; sonuc: string }[]>;
}

export async function sablonYaz(t: ExcelTanimi, secenek: SablonSecenegi = {}): Promise<ArrayBuffer> {
  const E = await exceljs();
  const wb = new E.Workbook();
  wb.subject = damga(t);
  wb.title = t.baslik;
  wb.creator = 'CORE MES';
  const k = wb.addWorksheet(KILAVUZ_SAYFASI);
  k.getColumn(1).width = 110;
  [`${t.baslik}: Excel ile toplu giriş`, '', ...t.kilavuz, '',
    'Başlığında * olan sütun yeni kayıtta zorunludur. Var olan kodlu satır güncellemedir; boş bıraktığınız hücre değişmez.',
    'Seçim sütunlarında hücredeki açılır listeden seçin. Tarih gg.aa.yyyy, ondalık virgülle yazılır.',
    'Yüklediğinizde önce önizleme görünür. Tek hatalı satır varsa hiçbir satır yazılmaz; hata dosyasını indirip düzeltin.',
    'Sayfa adlarını ve başlıkları değiştirmeyin.',
  ].forEach((m, i) => { const c = k.getCell(i + 1, 1); c.value = m; c.font = i === 0 ? { ...KALIN, size: 12 } : YAZI; c.alignment = { wrapText: true }; });

  const L = wb.addWorksheet(LISTE_SAYFASI, { state: 'hidden' });
  let listeSayisi = 0;
  // Liste adlandırılmış aralığa yazılır; doğrulama formülü yalnız adı taşır, kullanıcı metni formüle girmez (Güvenlik K2).
  const listeAdi = (baslik: string, secenekler: readonly string[]): string | null => {
    if (!secenekler.length) return null;
    listeSayisi += 1;
    const col = L.getColumn(listeSayisi);
    L.getCell(1, listeSayisi).value = metinYaz(baslik);
    secenekler.forEach((x, i) => { L.getCell(i + 2, listeSayisi).value = metinYaz(x); });
    col.width = 40;
    const ad = `liste_${String(listeSayisi)}`;
    wb.definedNames.add(`${LISTE_SAYFASI}!$${col.letter}$2:$${col.letter}$${String(secenekler.length + 1)}`, ad);
    return ad;
  };

  for (const s of t.sayfalar) {
    const ws = wb.addWorksheet(s.ad, { views: [{ state: 'frozen', ySplit: 1 }] });
    const sonuclar = secenek.sonuclar?.[s.ad];
    const sutunlar = [...s.sutunlar.map((c) => ({ baslik: sutunBasligi(c), genislik: c.genislik ?? Math.max(14, c.baslik.length + 4), zorunlu: c.zorunlu === true, not: c.not })),
      ...(sonuclar ? [{ baslik: SONUC_BASLIGI, genislik: 60, zorunlu: false, not: undefined }] : [])];
    sutunlar.forEach((c, i) => {
      const h = ws.getCell(1, i + 1);
      h.value = c.baslik;
      h.font = KALIN;
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.zorunlu ? ZORUNLU_ZEMIN : BASLIK_ZEMIN } };
      h.alignment = { vertical: 'middle', wrapText: true };
      if (c.not) h.note = c.not;
      ws.getColumn(i + 1).width = c.genislik;
    });
    ws.getRow(1).height = 30;
    const son = Math.max(500, s.kayitlar.length + 300, (sonuclar?.length ?? 0) + 300);
    s.sutunlar.forEach((c, i) => {
      const harf = ws.getColumn(i + 1).letter;
      const aralik = `${harf}2:${harf}${String(son)}`;
      if (c.tur === 'tarih') ws.getColumn(i + 1).numFmt = 'dd.mm.yyyy';
      if (c.tur === 'evet-hayir') {
        (ws as unknown as Dogrulamali).dataValidations.add(aralik, { type: 'list', allowBlank: true, formulae: [`"${EVET},${HAYIR}"`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Listede yok', error: `${EVET} ya da ${HAYIR} seçin.` });
      }
      if (c.tur === 'liste') {
        const ad = listeAdi(`${s.ad}: ${c.baslik}`, (c.liste ?? []).map(secenekEtiketi));
        // Aynı dosyada açılan kodu da kabul eden sütun uyarı verir, durdurmaz.
        if (ad) (ws as unknown as Dogrulamali).dataValidations.add(aralik, { type: 'list', allowBlank: true, formulae: [ad], showErrorMessage: true, errorStyle: c.dosyadakiSayfa ? 'warning' : 'stop', errorTitle: 'Listede yok', error: 'Bu değer listede yok; listeden seçin.' });
      }
    });
    if (sonuclar) {
      for (const r of sonuclar) {
        const row = ws.addRow([...s.sutunlar.map((_, i) => { const h = r.hucreler[i] ?? null; return typeof h === 'string' ? metinYaz(h) : h; }), metinYaz(r.sonuc)]);
        row.getCell(s.sutunlar.length + 1).font = { ...YAZI, color: { argb: HATA_YAZI } };
      }
    } else if (secenek.dolu) {
      for (const kayit of s.kayitlar) {
        const d = s.satir(kayit);
        ws.addRow(s.sutunlar.map((c) => yazilacak(c, d[c.anahtar])));
      }
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sutunlar.length } };
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function dosyaIndir(ad: string, icerik: ArrayBuffer): void {
  const blob = new Blob([icerik], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

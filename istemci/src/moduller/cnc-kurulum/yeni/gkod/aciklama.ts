// G-kod aciklamasi: satir satir Turkce anlam ve takim degisimleri (prototipin aciklama blogu).
// Emoji yerine satir turu (k) ve simge alani doner; simgeyi bilesen cizer (T4).

export const CYC_TR: Record<number, string> = { 1: 'Derin delme (eski)', 2: 'Kılavuz (eski)', 7: 'Sıfır noktası kaydırma', 8: 'Ayna (simetri)', 10: 'Döndürme', 11: 'Ölçekleme', 17: 'Kılavuz (eski, senkron)', 19: 'Çalışma düzlemi döndürme (5 eksen)', 32: 'Tolerans (yol hassasiyeti)',
    200: 'Delme', 201: 'Raybalama', 202: 'Baralama', 203: 'Üniversal delme', 204: 'Arkadan havşa', 205: 'Üniversal derin delme', 206: 'Kılavuz çekme (yüzer tutucu)', 207: 'Kılavuz çekme (senkron)', 208: 'Helisel delik frezeleme', 209: 'Kılavuz (talaş kırmalı)', 220: 'Dairesel nokta deseni', 221: 'Doğrusal nokta deseni',
    225: 'Gravür', 230: 'Satır satır yüzey frezeleme', 232: 'Yüzey frezeleme', 233: 'Yüzey frezeleme (yeni)', 240: 'Punta / merkezleme', 241: 'Tek ağızlı derin delme', 247: 'Referans noktası (preset) seçimi', 251: 'Dikdörtgen cep', 252: 'Dairesel cep', 253: 'Kanal frezeleme', 254: 'Dairesel kanal', 256: 'Dikdörtgen pim', 257: 'Dairesel pim', 262: 'Diş frezeleme', 263: 'Havşalı diş frezeleme', 264: 'Delme + diş frezeleme', 265: 'Helisel delme + diş', 267: 'Dış diş frezeleme' };
export const Q_TR: Record<number, string> = { 200: 'Emniyet mesafesi', 201: 'Derinlik', 202: 'Kademe (paso) derinliği', 203: 'Yüzey koordinatı', 204: '2. emniyet mesafesi', 205: 'Minimum kademe', 206: 'Dalma ilerlemesi', 207: 'Frezeleme ilerlemesi', 208: 'Geri çekme ilerlemesi', 210: 'Üstte bekleme (sn)', 211: 'Dipte bekleme (sn)', 212: 'Kademe azaltma', 213: 'Talaş kırma sayısı', 215: 'İşleme kapsamı (kaba/finiş)', 216: 'Merkez X', 217: 'Merkez Y', 218: '1. kenar uzunluğu', 219: '2. kenar uzunluğu', 220: 'Köşe radyüsü', 222: 'Ham çap', 223: 'Çap', 224: 'Dönme açısı', 239: 'Diş adımı', 256: 'Talaş kırma geri çekme', 335: 'Nominal çap', 338: 'Finiş kademesi', 343: 'Derinlik / çap seçimi', 351: 'Frezeleme yönü (+1 eş / −1 karşı)', 366: 'Dalma stratejisi', 367: 'Cep konumu', 368: 'Yan finiş payı', 369: 'Derinlik finiş payı', 370: 'Bindirme oranı', 385: 'Finiş ilerlemesi', 395: 'Derinlik referansı', 439: 'İlerleme referansı' };
export const M_TR: Record<number, string> = { 0: 'Program durdur', 1: 'İsteğe bağlı dur', 2: 'Program sonu', 3: 'İş mili saat yönünde', 4: 'İş mili ters yönde', 5: 'İş mili dur', 6: 'Takım değiştir', 7: 'Hava / MQL aç', 8: 'Soğutma aç', 9: 'Soğutma kapat', 13: 'İş mili + soğutma aç', 14: 'İş mili ters + soğutma', 19: 'İş mili konumlama', 30: 'Program sonu, başa dön', 89: 'Döngüyü her harekette çağır', 91: 'Tezgâh koordinatında hareket', 92: 'Tezgâh sabit noktasına göre', 98: 'Alt program çağır', 99: 'Döngüyü bu noktada çağır', 126: 'Döner eksende kısa yol', 128: '5 eksen takım ucu takibi (TCPM) aç', 129: 'TCPM kapat', 140: 'Takım ekseninde geri çekil' };
export const G_TR: Record<number, string> = { 0: 'Hızlı hareket', 1: 'Doğrusal kesme', 2: 'Dairesel (saat yönü)', 3: 'Dairesel (saat yönü tersi)', 4: 'Bekleme', 10: 'Ofset / veri girişi', 15: 'Kutupsal kapalı', 16: 'Kutupsal açık', 17: 'XY düzlemi', 18: 'ZX düzlemi', 19: 'YZ düzlemi', 20: 'Birim inç', 21: 'Birim mm', 28: 'Referans noktasına dön', 40: 'Yarıçap telafisi iptal', 41: 'Yarıçap telafisi sol', 42: 'Yarıçap telafisi sağ', 43: 'Takım boyu telafisi +', 44: 'Takım boyu telafisi −', 49: 'Boy telafisi iptal', 50: 'Devir sınırı (torna) / ölçek iptal', 53: 'Tezgâh koordinatı', 54: 'İş sıfırı 1 (G54)', 55: 'İş sıfırı 2 (G55)', 56: 'İş sıfırı 3 (G56)', 57: 'İş sıfırı 4 (G57)', 58: 'İş sıfırı 5 (G58)', 59: 'İş sıfırı 6 (G59)', 68: 'Koordinat döndürme', 69: 'Döndürme iptal', 70: 'Finiş döngüsü (torna)', 71: 'Boyuna kaba döngü (torna)', 72: 'Alın kaba döngü (torna)', 73: 'Hızlı kademeli delme', 74: 'Sol kılavuz / alın kanal', 76: 'İnce baralama / diş çekme (torna)', 80: 'Döngü iptal', 81: 'Delme döngüsü', 82: 'Dipte beklemeli delme', 83: 'Kademeli derin delme', 84: 'Kılavuz çekme', 85: 'Raybalama', 86: 'Baralama', 90: 'Mutlak ölçü', 91: 'Artışlı ölçü', 92: 'Devir sınırı / koordinat ayarı', 94: 'İlerleme mm/dk', 95: 'İlerleme mm/dev', 96: 'Sabit kesme hızı', 97: 'Sabit devir', 98: 'Döngü sonrası başlangıç seviyesine dön', 99: 'Döngü sonrası R seviyesine dön' };

export type SatirTuru = '' | 'cm' | 'pg' | 'tc' | 'cy' | 'q' | 'rp' | 'ft' | 'ar' | 'mv';
// Prototipteki on ek isaretleri: yorum, bolum, takim degisimi, dongu tanimi, dongu cagrisi.
export type AciklamaSimgesi = 'yorum' | 'bolum' | 'takim' | 'dongu' | 'calistir';
export interface Aciklama { t: string; k: SatirTuru; T?: string | null; simge?: AciklamaSimgesi }

// Takim adi: 'T5 · Ad' ve magazinde yoksa uyari; G-kod gorunumu takim eslesmesinden verir.
export type TakimMetni = (T: string) => string;

const virgul = (s: string) => s.replace('.', ',');

export function xyz(u: string): string {
  const p: string[] = [];
  u.replace(/\b(I?)([XYZABC])\s*([+-]?(?:\d*\.?\d+|Q\d+))/g, (_, i: string, a: string, v: string) => {
    p.push((i ? 'artışlı ' : '') + a + ' ' + virgul(String(+v === +v ? +v : v)));
    return _;
  });
  return p.join(' ');
}

export function explainHeid(raw: string, toolTxt: TakimMetni): Aciklama {
  const s = raw.replace(/^\s*\d+\s+/, '').trim(), cm = s.match(/;(.*)$/), u = s.replace(/;.*/, '').trim().toUpperCase();
  let m: RegExpMatchArray | null;
  if (!s) return { t: '', k: '' };
  if (!u && cm) return { t: cm[1]!.trim(), k: 'cm', simge: 'yorum' };
  if (/^\*/.test(u)) return { t: 'Bölüm: ' + s.replace(/^\*\s*-?\s*/, ''), k: 'cm', simge: 'bolum' };
  if ((m = u.match(/^BEGIN\s+PGM\s+(\S+)\s+(MM|INCH)/))) return { t: 'Program başlangıcı: ' + m[1] + ' · birim ' + (m[2] === 'MM' ? 'mm' : 'inç'), k: 'pg' };
  if (/^END\s+PGM/.test(u)) return { t: 'Program sonu', k: 'pg' };
  if (/^BLK\s+FORM\s+0\.1/.test(u)) return { t: 'Ham parça tanımı — alt köşe: ' + xyz(u.replace(/^BLK\s+FORM\s+0\.1\s+[XYZ]/, '')), k: 'pg' };
  if (/^(BLK\s+FORM\s+)?0\.2/.test(u)) return { t: 'Ham parça tanımı — üst köşe: ' + xyz(u), k: 'pg' };
  if ((m = u.match(/^TOOL\s+CALL\s+"?([^"\s]+)"?\s*([XYZ])?(.*)/))) {
    const r = m[3]!, sm = r.match(/\bS\s*([\d.]+)/), fm = r.match(/\bF\s*([\d.]+)/), dl = r.match(/\bD[LR]\s*[+-]?[\d.]+/g);
    return { t: 'TAKIM DEĞİŞİMİ → ' + toolTxt(m[1]!) + (m[2] ? ' · eksen ' + m[2] : '') + (sm ? ' · devir ' + sm[1] + ' dev/dk' : '') + (fm ? ' · F ' + fm[1] : '') + (dl ? ' · düzeltme ' + dl.join(' ') : ''), k: 'tc', T: m[1]!, simge: 'takim' };
  }
  if ((m = u.match(/^TOOL\s+DEF\s+"?([^"\s]+)/))) return { t: 'Sonraki takımı hazırla (magazin ön seçim): T' + m[1], k: 'pg' };
  if ((m = u.match(/^LBL\s+"?([^"\s]+)"?/))) return { t: m[1] === '0' ? 'Alt program / tekrar bloğu sonu' : 'Etiket ' + m[1] + ' — alt program veya tekrar bloğu başlangıcı', k: 'pg' };
  if ((m = u.match(/^CALL\s+LBL\s+"?([^"\s]+)"?(?:\s+REP\s*(\d+))?/))) return { t: 'Etiket ' + m[1] + ' bloğunu çağır' + (m[2] ? ' · ' + m[2] + ' kez tekrar' : ''), k: 'pg' };
  if ((m = u.match(/^CALL\s+PGM\s+(\S+)/))) return { t: 'Harici program çağır: ' + m[1], k: 'pg' };
  if ((m = u.match(/^CYCL\s+DEF\s+(\d+)(?:\.\d+)?/))) return { t: 'Döngü tanımı ' + m[1] + ': ' + (CYC_TR[+m[1]!] || 'işleme döngüsü'), k: 'cy', simge: 'dongu' };
  if (/^CYCL\s+CALL/.test(u)) return { t: 'Tanımlı döngüyü ' + (/PAT/.test(u) ? 'nokta tablosundaki her noktada' : 'mevcut konumda') + ' çalıştır', k: 'cy', simge: 'calistir' };
  if ((m = u.match(/^Q(\d+)\s*=\s*([+-]?[\d.]+)/))) return { t: 'Q' + m[1] + ' = ' + virgul(String(+m[2]!)) + (Q_TR[+m[1]!] ? ' · ' + Q_TR[+m[1]!] : (cm ? ' · ' + cm[1]!.trim().toLowerCase() : '')), k: 'q' };
  if (/^FN\s*\d+/.test(u)) return { t: 'Parametre hesabı / koşul (FN)', k: 'q' };
  if (/^PLANE\s+RESET/.test(u)) return { t: 'Eğik çalışma düzlemini sıfırla', k: 'cy' };
  if (/^PLANE\b/.test(u)) return { t: '5 eksen: eğik çalışma düzlemi tanımı', k: 'cy' };
  if (/^FUNCTION\s+TCPM/.test(u)) return { t: '5 eksen takım ucu takibi (TCPM) aç', k: 'cy' };
  if (/^FUNCTION\s+RESET\s+TCPM/.test(u)) return { t: 'TCPM kapat', k: 'cy' };
  if (/^STOP/.test(u)) return { t: 'Program durdur (operatör onayı)', k: 'pg' };
  const parts: string[] = [];
  let k: SatirTuru = 'mv';
  if (/^L\b|^L[XYZI]/.test(u)) { const max = /\bFMAX\b/.test(u); k = max ? 'rp' : 'ft'; parts.push((max ? 'Hızlı hareket' : 'Doğrusal kesme') + (xyz(u) ? ' → ' + xyz(u) : '')); }
  else if (/^CC\b/.test(u)) { k = 'ar'; parts.push('Daire merkezi: ' + xyz(u)); }
  else if (/^C\b|^C[XYZI]/.test(u)) { k = 'ar'; parts.push('Dairesel kesme ' + (/DR-/.test(u) ? 'saat yönünde' : 'saat yönü tersine') + ' → ' + xyz(u)); }
  else if (/^CR\b/.test(u)) { k = 'ar'; const rr2 = u.match(/\bR\s*([+-]?[\d.]+)/); parts.push('Yarıçapla yay R' + (rr2 ? virgul(String(Math.abs(+rr2[1]!))) : '') + ' ' + (/DR-/.test(u) ? 'saat yönünde' : 'saat yönü tersine') + ' → ' + xyz(u)); }
  else if (/^CT\b/.test(u)) { k = 'ar'; parts.push('Teğet yay → ' + xyz(u)); }
  else if ((m = u.match(/^RND\s+R\s*([\d.]+)/))) { k = 'ar'; parts.push('Köşe yuvarlatma R' + virgul(m[1]!)); }
  else if ((m = u.match(/^CHF\s*([\d.]+)/))) { k = 'ar'; parts.push('Köşe pahı ' + virgul(m[1]!) + ' mm'); }
  else if (/^APPR/.test(u)) { k = 'ft'; parts.push('Kontura yaklaşma → ' + xyz(u)); }
  else if (/^DEP/.test(u)) { k = 'ft'; parts.push('Konturdan uzaklaşma → ' + xyz(u)); }
  if (/\bRL\b/.test(u)) parts.push('telafi sol (RL)'); else if (/\bRR\b/.test(u)) parts.push('telafi sağ (RR)'); else if (/\bR0\b/.test(u) && /^L/.test(u)) parts.push('telafisiz (R0)');
  const f = u.match(/\bF\s*(\d[\d.]*)/);
  if (f) parts.push('F ' + f[1] + ' mm/dk');
  (u.match(/\bM\d+/g) || []).forEach((mm) => { const n = +mm.slice(1); parts.push(mm + ': ' + (M_TR[n] || 'yardımcı fonksiyon')); if (n === 6) k = 'tc'; });
  if (!parts.length) return cm ? { t: cm[1]!.trim(), k: 'cm', simge: 'yorum' } : { t: '', k: '' };
  return { t: parts.join(' · '), k };
}

export interface IsoDurumu { g?: number }

export function explainIso(raw: string, lathe: boolean, st: IsoDurumu, toolTxt: TakimMetni): Aciklama {
  const s = raw.trim(), cm = s.match(/\(([^)]*)\)/);
  let u = s.toUpperCase().replace(/\(.*?\)/g, '').replace(/;.*/, '').trim(), m: RegExpMatchArray | null, k: SatirTuru = '', tc: string | null = null;
  const parts: string[] = [];
  if (!s) return { t: '', k: '' };
  if (s === '%') return { t: 'Program başı / sonu işareti', k: 'pg' };
  if (!u && cm) return { t: cm[1]!, k: 'cm', simge: 'yorum' };
  if ((m = u.match(/^O(\d+)/))) { parts.push('Program numarası ' + m[1]); k = 'pg'; u = u.replace(/^O\d+/, ''); }
  u = u.replace(/^N\d+\s*/, '');
  const words: [string, string][] = [], re = /([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g;
  let w: RegExpExecArray | null;
  while ((w = re.exec(u))) words.push([w[1]!, w[2]!]);
  const hasM6 = words.some((x) => x[0] === 'M' && +x[1] === 6);
  let tcBas = false;
  words.forEach(([L0, v]) => {
    const n = +v;
    if (L0 === 'G') {
      parts.push('G' + v + ': ' + (G_TR[n] || 'G fonksiyonu'));
      if (n <= 3 || (n >= 73 && n <= 89)) st.g = n;
      if (n === 0) k = 'rp'; else if (n === 1) k = k || 'ft'; else if (n === 2 || n === 3) k = 'ar'; else if (n >= 73 && n <= 89 && n !== 80) k = 'cy';
    } else if (L0 === 'T') {
      if (hasM6 || lathe) {
        tc = lathe ? String(Math.floor(n / (v.length > 2 ? 100 : 1))) : String(n);
        parts.unshift('TAKIM DEĞİŞİMİ → ' + toolTxt(String(lathe && v.length > 2 ? +v.slice(0, v.length - 2) : n)));
        tcBas = true; k = 'tc';
      } else parts.push('T' + v + ' takımını hazırla');
    } else if (L0 === 'M') { if (n !== 6 || !tc) parts.push('M' + v + ': ' + (M_TR[n] || 'yardımcı fonksiyon')); }
    else if (L0 === 'S') parts.push('S ' + v + ' dev/dk');
    else if (L0 === 'F') parts.push('F ' + v);
    else if (L0 === 'H') parts.push('boy ofseti H' + v);
    else if (L0 === 'D') parts.push('çap ofseti D' + v);
    else if (L0 === 'R' && !/[IJK]/.test(u)) parts.push('R ' + v);
    else if (L0 === 'Q') parts.push('kademe Q' + v);
    else if (L0 === 'P') parts.push('P' + v);
  });
  const c: string[] = [];
  words.forEach((x) => { if ('XYZABCIJK'.indexOf(x[0]) >= 0) c.push(x[0] + ' ' + virgul(x[1])); });
  const hasMotion = words.some((x) => x[0] === 'G' && (+x[1] <= 3 || (+x[1] >= 73 && +x[1] <= 89)));
  if (c.length && !hasMotion && st.g != null && !tc) { parts.unshift((G_TR[st.g] || 'Hareket') + ' (önceki satırdan devam)'); k = st.g === 0 ? 'rp' : st.g === 1 ? 'ft' : st.g <= 3 ? 'ar' : 'cy'; }
  if (c.length) parts.push('→ ' + c.join(' '));
  if (cm) parts.push(cm[1]!);
  const sonuc: Aciklama = { t: parts.join(' · '), k: k || (c.length ? 'mv' : 'pg'), T: tc };
  if (tcBas) sonuc.simge = 'takim';
  return sonuc;
}

export interface ProgramAciklamasi { ex: Aciklama[]; tcl: number[] }

export function gExplainAll(lines: string[], heid: boolean, lathe: boolean, toolTxt: TakimMetni): ProgramAciklamasi {
  const ex: Aciklama[] = new Array<Aciklama>(lines.length), tcl: number[] = [], st: IsoDurumu = {};
  for (let i = 0; i < lines.length; i++) {
    const e = heid ? explainHeid(lines[i]!, toolTxt) : explainIso(lines[i]!, lathe, st, toolTxt);
    ex[i] = e;
    if (e.k === 'tc') tcl.push(i);
  }
  return { ex, tcl };
}

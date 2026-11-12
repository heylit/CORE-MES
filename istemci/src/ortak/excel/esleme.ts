// Kendi Excel'ini yükleyen ekranın sütun eşlemesi (3129, 3134 a): dosyadaki her sütun en çok bir alana, her alan en çok bir sütuna
// bağlanır. Başlık adı Türkçe harf ve büyük/küçük harf ayırmadan eş anlamlılarla önerilir; öneri kendiliğinden uygulanmaz, kişi onaylar.
// Saf; dosya okuma ekranın işidir.
import { tarihMetni, type Hucre } from './kurallar.ts';

export interface EslemeAlani {
  anahtar: string;
  baslik: string;
  zorunlu?: boolean;
  // Başlık anahtarına çevrilmiş biçimde de yazılabilir; karşılaştırma `baslikAnahtari` ile yapılır.
  esanlamlar: readonly string[];
}

// Sütun sırasıyla: her sütunun bağlı olduğu alan ya da null ("Kullanılmaz").
export type SutunEslemesi = readonly (string | null)[];

export const baslikAnahtari = (b: string): string => b
  .replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Aynı başlık dizisi yeniden gelince eski seçim öneri olur.
export const baslikImzasi = (basliklar: readonly string[]): string => basliklar.map(baslikAnahtari).join('|');

export function eslemeOner(basliklar: readonly string[], alanlar: readonly EslemeAlani[]): (string | null)[] {
  const sonuc: (string | null)[] = basliklar.map(() => null);
  const kullanilan = new Set<string>();
  const anahtarlar = basliklar.map(baslikAnahtari);
  // Önce alanın kendi adı, sonra eş anlamlılar sırayla: "Tedarikçi parti no" sütunu "Tedarikçi"ye düşmez.
  const adaylar = alanlar.map((a) => ({ a, adlar: [a.baslik, ...a.esanlamlar].map(baslikAnahtari) }));
  for (let tur = 0; tur < 2; tur += 1) {
    anahtarlar.forEach((b, i) => {
      if (sonuc[i] !== null || b === '') return;
      const bulunan = adaylar.find((x) => !kullanilan.has(x.a.anahtar) && (tur === 0 ? x.adlar[0] === b : x.adlar.includes(b)));
      if (bulunan) { sonuc[i] = bulunan.a.anahtar; kullanilan.add(bulunan.a.anahtar); }
    });
  }
  return sonuc;
}

// Sütuna alan bağlanır; aynı alan başka sütundaysa oradan kalkar.
export function sutunaAta(esleme: SutunEslemesi, sutun: number, alan: string | null): (string | null)[] {
  return esleme.map((x, i) => (i === sutun ? alan : alan !== null && x === alan ? null : x));
}

export const eksikZorunlular = (esleme: SutunEslemesi, alanlar: readonly EslemeAlani[]): EslemeAlani[] =>
  alanlar.filter((a) => a.zorunlu === true && !esleme.includes(a.anahtar));

export const alanSutunu = (esleme: SutunEslemesi, alan: string): number | null => {
  const i = esleme.indexOf(alan);
  return i < 0 ? null : i;
};

// Hücre ekranda ve sunucuya metin olarak gider: tarih YYYY-AA-GG, sayı noktalı ondalık, boş ''. Kayan sayının kuyruğu atılır.
export function hucreMetni(h: Hucre): string {
  if (h === null) return '';
  if (h instanceof Date) return tarihMetni(h);
  if (typeof h === 'number') return Number.isInteger(h) ? String(h) : String(Number(h.toFixed(6)));
  if (typeof h === 'boolean') return h ? 'Evet' : 'Hayır';
  return h.trim();
}

export function ilkDegerler(satirlar: readonly (readonly Hucre[])[], sutun: number, adet = 5): string[] {
  return satirlar.slice(0, adet).map((s) => hucreMetni(s[sutun] ?? null));
}

import { adresAraliktaMi, agAraliklariniCoz } from './ag-araligi.ts';

// Heidenhain makine listesi (kart 3757, ADR 0034): Sistem Ayarları'nda tek metin ayarı olarak saklanır, sunucu ve ekran aynı kuralla
// doğrular. Biçim "KOD=IP;Dnnnn,KOD=IP": kod SmartES makine koduyla aynı yazılır (karşılaştırma ekranı eşleşsin); adres yalnız kurum içi
// IPv4'tür (ad çözümlemesi yok); kapı sabit 19000'dir, yazılmaz. Sayaç isteğe bağlıdır: PLC çift kelime adresi (D ve 4'ün katı).
export const AZAMI_LSV2_MAKINESI = 32;
export const LSV2_LISTESI_EN_UZUN = 2000;

export interface Lsv2Makinesi {
  cihazAdi: string;
  adres: string;
  // PLC çift kelime adresinin bayt numarası (D10000 -> 10000); yoksa sayaç okunmaz.
  sayac: number | null;
}

const CIHAZ_ADI = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SAYAC_ADRESI = /^D(\d{1,7})$/;
const KURUM_ICI_V4 = agAraliklariniCoz('10.0.0.0/8 172.16.0.0/12 192.168.0.0/16').araliklar;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type Lsv2Alani = 'kod' | 'adres' | 'sayac';
export interface Lsv2Hatasi {
  // 0'dan başlayan satır; liste geneli hatada null.
  satir: number | null;
  alan: Lsv2Alani | null;
  ileti: string;
}

export function kodHatasi(kod: string): string | null {
  return CIHAZ_ADI.test(kod) ? null : 'Harf, rakam, nokta, tire ve alt çizgi; boş olamaz.';
}
export function adresHatasi(adres: string): string | null {
  if (!IPV4.test(adres)) return 'IP adresi yazın (ör. 10.0.0.5); ad ve kapı yazılmaz.';
  return adresAraliktaMi(adres, KURUM_ICI_V4) ? null : 'Kurum içi adres değil (10.x, 172.16-31.x, 192.168.x).';
}
export function sayacHatasi(sayac: string): string | null {
  if (sayac === '') return null;
  const e = SAYAC_ADRESI.exec(sayac);
  return e !== null && Number(e[1]) % 4 === 0 ? null : 'D ve 4\'ün katı sayı olur (ör. D10000).';
}

export interface Lsv2Satiri {
  kod: string;
  adres: string;
  sayac: string;
}

// Satırları doğrular; her satırın her alanı için ilk hata. Kod iki kez yazılırsa ikinci satır hata alır.
export function satirHatalari(satirlar: readonly Lsv2Satiri[]): Lsv2Hatasi[] {
  const hatalar: Lsv2Hatasi[] = [];
  if (satirlar.length > AZAMI_LSV2_MAKINESI) hatalar.push({ satir: null, alan: null, ileti: `En çok ${String(AZAMI_LSV2_MAKINESI)} makine yazılabilir.` });
  const adlar = new Set<string>();
  satirlar.forEach((s, satir) => {
    const kod = kodHatasi(s.kod) ?? (adlar.has(s.kod.toLowerCase()) ? 'Bu kod listede iki kez var.' : null);
    adlar.add(s.kod.toLowerCase());
    if (kod !== null) hatalar.push({ satir, alan: 'kod', ileti: kod });
    const adres = adresHatasi(s.adres);
    if (adres !== null) hatalar.push({ satir, alan: 'adres', ileti: adres });
    const sayac = sayacHatasi(s.sayac);
    if (sayac !== null) hatalar.push({ satir, alan: 'sayac', ileti: sayac });
  });
  return hatalar;
}

export function satirlariCoz(metin: string): Lsv2Satiri[] | null {
  const temiz = metin.trim();
  if (temiz === '') return [];
  const satirlar: Lsv2Satiri[] = [];
  for (const p of temiz.split(',')) {
    const esit = p.indexOf('=');
    if (esit < 0) return null;
    const parcalar = p.slice(esit + 1).split(';').map((x) => x.trim());
    if (parcalar.length > 2) return null;
    satirlar.push({ kod: p.slice(0, esit).trim(), adres: parcalar[0] ?? '', sayac: parcalar[1] ?? '' });
  }
  return satirlar;
}

export const satirlariYaz = (satirlar: readonly Lsv2Satiri[]): string =>
  satirlar.map((s) => `${s.kod.trim()}=${s.adres.trim()}${s.sayac.trim() === '' ? '' : `;${s.sayac.trim()}`}`).join(',');

// Ayar değerinin doğrulaması (sözleşme): ileti değeri ve adresi söylemez, yalnız kaçıncı makinenin hangi alanı bozuk.
export function lsv2ListesiHatasi(metin: string): string | null {
  const satirlar = satirlariCoz(metin);
  if (satirlar === null) return 'Liste "KOD=IP;Dnnnn" kayıtlarından oluşur, virgülle ayrılır.';
  const h = satirHatalari(satirlar)[0];
  if (h === undefined) return null;
  if (h.satir === null) return h.ileti;
  const alan = { kod: 'makine kodu', adres: 'IP adresi', sayac: 'sayaç adresi' }[h.alan ?? 'kod'];
  return `${String(h.satir + 1)}. makine, ${alan}: ${h.ileti}`;
}

// Geçerli listeyi makinelere çevirir; geçersiz değer (eski ya da elle yazılmış) boş liste sayılır: bağlantı açılmaz.
export function lsv2ListesiniCoz(metin: string): Lsv2Makinesi[] {
  const satirlar = satirlariCoz(metin);
  if (satirlar === null || satirHatalari(satirlar).length > 0) return [];
  return satirlar.map((s) => ({ cihazAdi: s.kod, adres: s.adres, sayac: s.sayac === '' ? null : Number(s.sayac.slice(1)) }));
}

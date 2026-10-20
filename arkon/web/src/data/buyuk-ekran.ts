// Terminal büyük ekranı (uzak mod) için saf yardımcılar.
type Dosya = { name?: string | null };
const MODEL = /\.(step|stp|p21|igs|iges|stl)$/i;

// Paketin 3B modeli: birincil dosya modelse o, değilse ilk model dosyası. Model yoksa null (alan çizilmez).
export function modelDosyasi<T extends Dosya>(dosyalar: readonly T[] | null | undefined, birincil?: string | null): T | null {
  const liste = (dosyalar ?? []).filter((d) => MODEL.test(d.name ?? ''));
  return liste.find((d) => d.name === birincil) ?? liste[0] ?? null;
}

// Duvar saati, tezgâh başından okunur: saat ve dakika.
export function saatMetni(an: number): string {
  const t = new Date(an);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

// Malzeme ve operasyon tek satırda; ikisi de yoksa satır çizilmez.
export function isSatiri(parca?: unknown, op?: unknown): string | null {
  const parcalar = [parca, op].map(metin).filter((x) => x !== '');
  return parcalar.length ? parcalar.join(' · ') : null;
}

// Üretilen malzemenin kodu (parça no) ve revizyonu. Kod adla aynıysa tekrar yazılmaz; ikisi de yoksa satır çizilmez.
// `malzemeNo` TMI'de malzeme kartının sayı kimliğidir, kod değildir: yazılmaz. Metin olmayan alan ekranı düşürmez, boş sayılır.
export function malzemeSatiri(paket: { partNo?: unknown; rev?: unknown } | null | undefined, ad?: unknown): string | null {
  if (!paket) return null;
  const kod = metin(paket.partNo);
  const rev = metin(paket.rev);
  const parcalar = [kod !== '' && kod !== metin(ad) ? kod : '', rev !== '' ? 'Rev ' + rev : ''].filter((x) => x !== '');
  return parcalar.length ? parcalar.join(' · ') : null;
}

const metin = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');

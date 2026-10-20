export const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export const saat = (dk: number): string => (dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// Tarih gün olarak gösterilir: saat dilimine çevrilmez (gün kaymasın).
export function tarihMetni(tarih: string): string {
  const [y, a, g] = tarih.split('-');
  return `${g ?? ''}.${a ?? ''}.${y ?? ''}`;
}

export const haftaGunuAdi = (tarih: string): string => GUNLER[(new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7] ?? '';

// An yerel saatle gösterilir; ertesi güne taşan aralıkta tarih de yazılır.
export function yerelGun(an: string): string {
  const t = new Date(an);
  return `${String(t.getFullYear())}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function anMetni(an: string, gun: string): string {
  const s = new Date(an).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const g = yerelGun(an);
  return g === gun ? s : `${tarihMetni(g).slice(0, 5)} ${s}`;
}

export function tarihEkle(tarih: string, gun: number): string {
  const t = new Date(`${tarih}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + gun);
  return t.toISOString().slice(0, 10);
}

// Matris hücresinde vardiya kısa adla görünür; baş harfi aynı olan vardiyalar (Gece, Gündüz) ayrışana kadar harf eklenir.
// Üç harfte de ayrışmayan adlarda (Vardiya 1, Vardiya 2) baş harfe son sözcük eklenir.
export function kisaAdlar(adlar: readonly string[], enCok = 3): string[] {
  const ust = adlar.map((a) => a.trim().toLocaleUpperCase('tr-TR'));
  const bas = ust.map((u, i) => {
    let n = 1;
    while (n < Math.min(enCok, u.length) && ust.some((d, j) => j !== i && d.startsWith(u.slice(0, n)))) n += 1;
    return u.slice(0, n);
  });
  return bas.map((k, i) => {
    if (bas.filter((x) => x === k).length === 1) return k.slice(0, 1) + k.slice(1).toLocaleLowerCase('tr-TR');
    const son = ust[i]!.split(/\s+/).at(-1) ?? '';
    return (ust[i]!.slice(0, 1) + son.slice(0, 2)).trim();
  });
}

// Tarayıcı saat ve tarih alanları cihazın yerel ayarına uyar (12 saat, ay/gün/yıl); ekran Türkçe 24 saat ve GG.AA.YYYY yazar.
// Okuyucular geçersiz metinde null döner; sunucuya yalnız doğrulanmış değer gider.
export function saatOku(metin: string): string | null {
  const e = /^(\d{1,2})[:.](\d{2})$/.exec(metin.trim());
  if (!e) return null;
  const s = Number(e[1]);
  const d = Number(e[2]);
  return s <= 23 && d <= 59 ? `${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}` : null;
}

export function tarihOku(metin: string): string | null {
  const e = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(metin.trim());
  if (!e) return null;
  const iso = `${e[3]}-${String(Number(e[2])).padStart(2, '0')}-${String(Number(e[1])).padStart(2, '0')}`;
  if (Number(e[3]) < 1900) return null;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

// Değer 'YYYY-MM-DDTHH:mm' (yerel saat) biçimindedir.
export function zamanOku(metin: string): string | null {
  const e = /^(\S+)\s+(\S+)$/.exec(metin.trim());
  const tarih = e?.[1] ? tarihOku(e[1]) : null;
  const saatDegeri = e?.[2] ? saatOku(e[2]) : null;
  return tarih !== null && saatDegeri !== null ? `${tarih}T${saatDegeri}` : null;
}

export const zamanMetni = (yerel: string): string => (yerel === '' ? '' : `${tarihMetni(yerel.slice(0, 10))} ${yerel.slice(11, 16)}`);

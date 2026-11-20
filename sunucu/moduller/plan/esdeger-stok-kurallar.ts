// 3463-1b (Risk K1): eşdeğer kartlar (aynı malzemenin farklı kartları, aynı stok birimi) stoğu birlikte sayılır, saf. Her kart önce kendi
// stoğunu kullanır; grubun artanı, eksiği olan üyelere kart numarası sırasıyla dağılır. Dönen pay kartın stoğuna eklenecek miktardır
// (artanı veren üyede eksi): toplamı sıfırdır, grubun stoğu çift sayılmaz. Sarf ve malzeme izi yine gerçek karta yazılır; bu yalnız hesaptır.
const ESIK = 1e-9;

const sayi = (m: string | undefined): number => { const n = Number(m ?? 0); return Number.isFinite(n) ? Math.max(0, n) : 0; };

export function esdegerStokPayi(
  ihtiyac: ReadonlyMap<number, number>,
  serbest: ReadonlyMap<number, string>,
  gruplar: ReadonlyMap<number, readonly number[]>,
): Map<number, number> {
  const pay = new Map<number, number>();
  const gorulen = new Set<string>();
  for (const uyeler of gruplar.values()) {
    const anahtar = [...uyeler].sort((a, b) => a - b).join(',');
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const sirali = [...uyeler].sort((a, b) => a - b);
    const artan = sirali.map((no) => ({ no, kalan: Math.max(0, sayi(serbest.get(no)) - (ihtiyac.get(no) ?? 0)) })).filter((x) => x.kalan > ESIK);
    for (const no of sirali) {
      let eksik = (ihtiyac.get(no) ?? 0) - sayi(serbest.get(no));
      for (const v of artan) {
        if (eksik <= ESIK) break;
        if (v.no === no || v.kalan <= ESIK) continue;
        const y = Math.min(v.kalan, eksik);
        v.kalan -= y;
        eksik -= y;
        pay.set(no, (pay.get(no) ?? 0) + y);
        pay.set(v.no, (pay.get(v.no) ?? 0) - y);
      }
    }
  }
  return pay;
}

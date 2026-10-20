// Ağ adresi aralığı (CIDR) listesi: ayar değeri olarak yazılır, sunucu ve ekran aynı kuralla doğrular.
// Liste virgül, boşluk ya da satır sonuyla ayrılır; önek uzunluğu yazılmayan adres tek adrestir (/32 ya da /128).

export interface AgAraligi {
  surum: 4 | 6;
  ag: bigint;
  onek: number;
}

export const AG_ARALIGI_EN_COK = 50;

const BIT = { 4: 32, 6: 128 } as const;

function ipv4Coz(metin: string): bigint | null {
  const parcalar = metin.split('.');
  if (parcalar.length !== 4) return null;
  let deger = 0n;
  for (const p of parcalar) {
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p.startsWith('0'))) return null;
    const n = Number(p);
    if (n > 255) return null;
    deger = (deger << 8n) | BigInt(n);
  }
  return deger;
}

function ipv6Coz(metin: string): bigint | null {
  let govde = metin;
  // Sonda gömülü IPv4 (::ffff:10.0.0.1) iki 16 bitlik gruba çevrilir.
  const sonNokta = govde.lastIndexOf(':');
  if (govde.includes('.') && sonNokta >= 0) {
    const v4 = ipv4Coz(govde.slice(sonNokta + 1));
    if (v4 === null) return null;
    govde = `${govde.slice(0, sonNokta + 1)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const ikiNokta = govde.split('::');
  if (ikiNokta.length > 2) return null;
  const grup = (s: string): string[] => (s === '' ? [] : s.split(':'));
  const bas = grup(ikiNokta[0] ?? '');
  const son = ikiNokta.length === 2 ? grup(ikiNokta[1] ?? '') : [];
  const eksik = 8 - bas.length - son.length;
  if (ikiNokta.length === 2 ? eksik < 1 : eksik !== 0) return null;
  const hepsi = [...bas, ...Array<string>(ikiNokta.length === 2 ? eksik : 0).fill('0'), ...son];
  let deger = 0n;
  for (const g of hepsi) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    deger = (deger << 16n) | BigInt(Number.parseInt(g, 16));
  }
  return deger;
}

// Tek adres; IPv4'ü taşıyan IPv6 biçimi (::ffff:a.b.c.d) IPv4 sayılır: sunucu bağlantı adresini bu biçimde görebilir.
export function adresCoz(metin: string): { surum: 4 | 6; deger: bigint } | null {
  const temiz = metin.trim();
  const v4 = ipv4Coz(temiz);
  if (v4 !== null) return { surum: 4, deger: v4 };
  if (!temiz.includes(':')) return null;
  const v6 = ipv6Coz(temiz);
  if (v6 === null) return null;
  if (v6 >> 32n === 0xffffn) return { surum: 4, deger: v6 & 0xffffffffn };
  return { surum: 6, deger: v6 };
}

const maske = (surum: 4 | 6, onek: number): bigint => {
  const bit = BigInt(BIT[surum]);
  return ((1n << bit) - 1n) ^ ((1n << (bit - BigInt(onek))) - 1n);
};

export function agAraliklariniCoz(metin: string): { araliklar: AgAraligi[]; hata: string | null } {
  const ogeler = metin.split(/[\s,]+/).filter((o) => o !== '');
  if (ogeler.length > AG_ARALIGI_EN_COK) return { araliklar: [], hata: `En çok ${String(AG_ARALIGI_EN_COK)} aralık yazılabilir.` };
  const araliklar: AgAraligi[] = [];
  for (const oge of ogeler) {
    const [adresMetni = '', onekMetni, fazla] = oge.split('/');
    const adres = fazla === undefined ? adresCoz(adresMetni) : null;
    if (adres === null) return { araliklar: [], hata: `"${oge}" geçerli bir adres aralığı değil (örnek: 10.30.0.0/16).` };
    const enCok = BIT[adres.surum];
    const onek = onekMetni === undefined ? enCok : /^\d{1,3}$/.test(onekMetni) ? Number(onekMetni) : Number.NaN;
    if (!(onek >= 0 && onek <= enCok)) return { araliklar: [], hata: `"${oge}" önek uzunluğu 0 ile ${String(enCok)} arasında olmalı.` };
    const m = maske(adres.surum, onek);
    if ((adres.deger & m) !== adres.deger) return { araliklar: [], hata: `"${oge}" ağ adresi değil; aralığın ilk adresiyle yazın.` };
    araliklar.push({ surum: adres.surum, ag: adres.deger, onek });
  }
  return { araliklar, hata: null };
}

export const agAraligiHatasi = (metin: string): string | null => agAraliklariniCoz(metin).hata;

export function adresAraliktaMi(adres: string, araliklar: readonly AgAraligi[]): boolean {
  const a = adresCoz(adres);
  if (a === null) return false;
  return araliklar.some((r) => r.surum === a.surum && (a.deger & maske(r.surum, r.onek)) === r.ag);
}

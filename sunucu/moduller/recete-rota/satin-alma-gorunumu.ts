// 542 a, 546 a: Satın Alma'nın malzeme satın alma planı ve fason planı sayfaları planlama çalışmasından okur, hesap ekranda kalır. Giden
// çalışma beyaz listeyle kurulur: yalnız iki hesabın okuduğu alanlar (planlama-yeni/malzeme/kurallar.ts ve maliyet/kurallar.ts fason
// bölümü). Müşteri, fiyat, tutar, maliyet, tezgâh ve personel gitmez; listede olmayan her alan düşer, belgeye sonradan eklenen alan
// kendiliğinden gitmez.

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);
const nesneler = (v: unknown): Nesne[] => (Array.isArray(v) ? v.filter(nesneMi) : []);

function sec(x: Nesne, alanlar: readonly string[]): Nesne {
  const y: Nesne = {};
  for (const a of alanlar) if (x[a] !== undefined) y[a] = x[a];
  return y;
}

const SIPARIS = ['id', 'urun', 'adet', 'termin', 'havuz'] as const;
const MALZEME = ['kod', 'ad', 'birim', 'stok', 'tedarikGun', 'muayeneGun', 'fire', 'terminKat', 'terminEk', 'tedarikci'] as const;
const SATIN_ALMA = ['kod', 'miktar', 'gelis', 'tedarikci', 'no', 'verildi', 'ref', 'src', 'tm'] as const;
const TEDARIKCI = ['id', 'ad', 'ortGecikmeGun'] as const;
const FASONCU = ['id', 'ad', 'sureGun', 'kapasite', 'terminKat', 'terminEk'] as const;
const ADIM = ['k', 'ad', 'fason', 'fasonIzin', 'bag'] as const;
const ISLEM = ['id', 'job', 'S', 'C', 'done'] as const;

function urun(u: Nesne): Nesne {
  return { id: u['id'], rota: nesneler(u['rota']).map((a) => sec(a, ADIM)) };
}

// Fason işleminde `m` fasoncunun kimliğidir ('@' ile); tezgâh işleminde tezgâhtır ve gitmez.
function islem(r: Nesne): Nesne {
  const y = sec(r, ISLEM);
  if (r['fas']) { y['fas'] = 1; y['m'] = r['m']; }
  return y;
}

function plan(p: unknown): Nesne | null {
  if (!nesneMi(p)) return null;
  const ops: Nesne = {};
  if (nesneMi(p['ops'])) for (const [id, r] of Object.entries(p['ops'])) if (nesneMi(r)) ops[id] = islem(r);
  const J: Nesne = {};
  if (nesneMi(p['J'])) for (const [id, j] of Object.entries(p['J'])) if (nesneMi(j)) J[id] = sec(j, ['C', 'T']);
  return { dataVer: p['dataVer'], ops, J };
}

function veri(D: Nesne): Nesne {
  const meta = nesneMi(D['meta']) ? D['meta'] : {};
  const terminAyar = nesneMi(D['terminAyar']) ? D['terminAyar'] : undefined;
  return {
    meta: { baslangic: meta['baslangic'] },
    siparisler: nesneler(D['siparisler']).map((s) => ({
      ...sec(s, SIPARIS),
      malzeme: nesneler(s['malzeme']).map((r) => sec(r, ['kod', 'miktar'])),
    })),
    urunler: nesneler(D['urunler']).map(urun),
    malzemeler: nesneler(D['malzemeler']).map((m) => sec(m, MALZEME)),
    satinalma: nesneler(D['satinalma']).map((p) => sec(p, SATIN_ALMA)),
    tedarikciler: nesneler(D['tedarikciler']).map((t) => sec(t, TEDARIKCI)),
    fasoncular: nesneler(D['fasoncular']).map((f) => sec(f, FASONCU)),
    // Fabrika takvimi: tahmini gelişin ilk vardiyası ve fason günleri ondan sayılır; tezgâhın kendi vardiyası gitmez.
    vardiyalar: nesneler(D['vardiyalar']).map((v) => ({ ...sec(v, ['id', 'bas', 'bit']), molalar: nesneler(v['molalar']).map((m) => sec(m, ['bas', 'bit'])) })),
    calismaGunleri: nesneMi(D['calismaGunleri']) ? D['calismaGunleri'] : {},
    tatiller: Array.isArray(D['tatiller']) ? D['tatiller'].filter((t) => typeof t === 'string') : [],
    ...(terminAyar ? { terminAyar: sec(terminAyar, ['katMal', 'ekMal', 'esik', 'katFas', 'ekFas']) } : {}),
    fasonTermin: nesneMi(D['fasonTermin']) ? D['fasonTermin'] : {},
    fasonRef: nesneMi(D['fasonRef']) ? D['fasonRef'] : {},
    opAdet: nesneMi(D['opAdet']) ? D['opAdet'] : {},
    tezgahlar: [],
    personel: [],
  };
}

// Biten iş ve adım (malzeme/kurallar.ts bitenler) Reçete ve Rota kaydının emir durumundan: yalnız kimlik ve durum.
function emirDurumu(kayit: unknown): Nesne {
  const k = nesneMi(kayit) ? kayit : {};
  const durum = nesneMi(k['opStatus']) ? k['opStatus'] : {};
  const opStatus: Nesne = {};
  for (const [a, d] of Object.entries(durum)) if (typeof d === 'string') opStatus[a] = d;
  return { orders: nesneler(k['orders']).map((o) => sec(o, ['id', 'status'])), opStatus };
}

// Fason gecikme olayı fasoncunun süresini uzatır (maliyet/kurallar.ts fasonIsleri); başka olay gitmez.
const fasonOlayi = (e: Nesne): boolean => e['tip'] === 'fason';

// `S` girdi.betik'in birleştirdiği çalışmadır (planlamaCalismasi ile aynı); `kayit` Reçete ve Rota kaydı.
export function satinAlmaCalismasi(S: Nesne, kayit: unknown): Nesne {
  return {
    surum: S['surum'],
    D: veri(nesneMi(S['D']) ? S['D'] : {}),
    dataVer: S['dataVer'],
    ...(S['simdi'] !== undefined ? { simdi: S['simdi'] } : {}),
    plan: plan(S['plan']),
    olaylar: nesneler(S['olaylar']).filter(fasonOlayi).map((e) => sec(e, ['tip', 'f', 'gun'])),
    emirDurumu: emirDurumu(kayit),
  };
}

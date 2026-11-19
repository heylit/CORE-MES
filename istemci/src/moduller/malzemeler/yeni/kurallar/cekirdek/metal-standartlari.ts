import type { Sinif, Sozluk } from './tipler.ts';

// Metal sınıflarında kimyasal kompozisyon ve mekanik dayanım standartları. Çelik, titanyum, bakır ve döküm standartları ikisini
// aynı belgede verir; alüminyum (EN 573-3 ile EN 485-2 / 755-2 ...), paslanmaz (EN 10088-1 ile -2 / -3) ve nikel (ISO 9722 ile
// ISO 6208 / 9723) ayrı belgededir. Mekanik standart ürün formuna bağlıdır; liste formun ilk değerini varsayılan sayar.
// Kaynak ve güven işaretleri araştırma belgesindedir (devir-heylit/3436/ARASTIRMA.md); emin olunmayan satırlar listeye girmedi.

type FormGrubu = 'levha' | 'cubuk' | 'kosebent' | 'boru' | 'tel' | 'blok' | 'hepsi';
interface SinifStandardi { kim: string[]; mek: Partial<Record<FormGrubu, string[]>> }

const GRUP: Record<FormGrubu, string[]> = {
    levha: ['levha', 'rulo'], cubuk: ['cubuk', 'altigen', 'lama'], kosebent: ['kosebent'], boru: ['boru', 'kutu'], tel: ['tel'], blok: ['blok', 'disk'],
    hepsi: ['levha', 'rulo', 'cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent', 'tel', 'blok', 'disk'],
};

const EN_683 = ['EN ISO 683-1', 'EN ISO 683-2', 'EN ISO 683-3', 'EN ISO 683-4'];
const ISLAH_AMS = ['AMS 6370', 'AMS 6414', 'AMS 6419', 'AMS 6431'];
const AL_AMS = ['AMS 4045', 'AMS 4037', 'AMS 4027', 'AMS 4050', 'AMS 4149', 'AMS 4202'];
const AL_MIL = ['MIL-DTL-46063', 'MIL-DTL-46192', 'MIL-DTL-46027'];
const ZIRH = ['MIL-DTL-12560', 'MIL-DTL-46100', 'MIL-DTL-32332'];

const VERI: Sozluk<SinifStandardi> = {
    karbon: {
        kim: ['EN 10025-2', 'EN 10025-3', 'EN 10025-6', 'EN 10028-2', 'EN 10028-3', 'ASTM A36/A36M', 'ASTM A572/A572M', 'ASTM A516/A516M', ...ZIRH],
        mek: {
            levha: ['EN 10025-2', 'EN 10025-3', 'EN 10025-6', 'EN 10028-2', 'EN 10028-3', 'ASTM A36/A36M', 'ASTM A572/A572M', 'ASTM A516/A516M', ...ZIRH],
            cubuk: ['EN 10025-2', 'EN 10025-3', 'ASTM A36/A36M'], kosebent: ['EN 10025-2', 'ASTM A36/A36M'],
            boru: ['EN 10210-1', 'EN 10219-1', 'EN 10216-2', 'ASTM A500/A500M', 'ASTM A106/A106M'], blok: ['EN 10250-2'],
        },
    },
    sac: {
        kim: ['EN 10130', 'EN 10111', 'EN 10149-2', 'EN 10346', 'EN 10132-4', 'ASTM A1008/A1008M', 'ASTM A1011/A1011M', 'ASTM A653/A653M'],
        mek: { levha: ['EN 10130', 'EN 10111', 'EN 10149-2', 'EN 10346', 'EN 10132-4', 'ASTM A1008/A1008M', 'ASTM A1011/A1011M', 'ASTM A653/A653M'] },
    },
    islah: {
        kim: [...EN_683, 'ASTM A29/A29M', 'SAE J403', 'SAE J404', ...ISLAH_AMS],
        mek: {
            cubuk: [...EN_683, 'EN 10277', 'ASTM A29/A29M', 'ASTM A108', 'ASTM A322', 'ASTM A434', ...ISLAH_AMS],
            levha: [...EN_683], boru: ['EN 10297-1', 'EN 10305-1', 'ASTM A519/A519M'], blok: ['EN 10250-3', 'ASTM A668/A668M'], tel: ['EN 10277'],
        },
    },
    yay: {
        kim: ['EN ISO 683-17', 'EN 10089', 'EN 10132-4', 'ASTM A295/A295M'],
        mek: { cubuk: ['EN ISO 683-17', 'EN 10089', 'ASTM A295/A295M'], levha: ['EN 10132-4'], tel: ['EN 10270-1', 'EN 10270-2', 'ASTM A228/A228M', 'ASTM A229/A229M'] },
    },
    takim: { kim: ['EN ISO 4957', 'ASTM A681', 'AMS 6514'], mek: { hepsi: ['EN ISO 4957', 'ASTM A681', 'AMS 6514'] } },
    paslanmaz: {
        kim: ['EN 10088-1', 'EN 10095', 'ISO 5832-1', 'ASTM A240/A240M', 'ASTM A276/A276M', 'ASTM A564/A564M', 'AMS 5659', 'AMS 5629', 'AMS 5732'],
        mek: {
            levha: ['EN 10088-2', 'EN 10028-7', 'EN 10095', 'ASTM A240/A240M', 'ASTM A666'],
            cubuk: ['EN 10088-3', 'EN 10272', 'EN 10095', 'ISO 5832-1', 'ASTM A276/A276M', 'ASTM A479/A479M', 'ASTM A564/A564M', 'AMS 5659', 'AMS 5629', 'AMS 5732'],
            kosebent: ['EN 10088-3', 'ASTM A276/A276M'],
            boru: ['EN 10216-5', 'EN 10217-7', 'EN 10296-2', 'EN 10297-2', 'ASTM A312/A312M', 'ASTM A269/A269M', 'ASTM A554'],
            tel: ['EN 10088-3', 'EN 10270-3', 'ASTM A580/A580M', 'ASTM A313/A313M'],
            blok: ['EN 10250-4', 'EN 10222-5', 'ASTM A182/A182M', 'ASTM A705/A705M'],
        },
    },
    aluminyum: {
        kim: ['EN 573-3', 'ASTM B209', 'ASTM B221', ...AL_AMS, ...AL_MIL],
        mek: {
            levha: ['EN 485-2', 'ASTM B209', ...AL_AMS, ...AL_MIL],
            cubuk: ['EN 755-2', 'EN 754-2', 'ASTM B221', 'ASTM B211'], kosebent: ['EN 755-2', 'ASTM B221'],
            boru: ['EN 755-2', 'EN 754-2', 'ASTM B241/B241M', 'ASTM B210'], tel: ['EN 1301-2', 'ASTM B211'],
            blok: ['EN 485-2', 'EN 586-2', 'ASTM B247', ...AL_AMS],
        },
    },
    aldokum: { kim: ['EN 1706', 'EN 1676', 'ASTM B26/B26M', 'ASTM B108/B108M', 'ASTM B85/B85M'], mek: { hepsi: ['EN 1706', 'ASTM B26/B26M', 'ASTM B108/B108M', 'ASTM B85/B85M'] } },
    bakir: {
        kim: ['CEN/TS 13388', 'EN 1652', 'EN 12163', 'EN 12164', 'EN 12165', 'EN 1057', 'EN 1982'],
        mek: {
            levha: ['EN 1652', 'EN 1654', 'EN 13599', 'ASTM B152/B152M', 'ASTM B36/B36M', 'ASTM B103/B103M', 'ASTM B194'],
            cubuk: ['EN 12163', 'EN 12164', 'EN 12167', 'EN 13601', 'ASTM B16/B16M', 'ASTM B150/B150M', 'ASTM B139/B139M', 'ASTM B196/B196M'],
            boru: ['EN 12449', 'EN 1057', 'EN 12168', 'ASTM B111/B111M'], tel: ['EN 12166'], blok: ['EN 12165', 'EN 12420', 'EN 1982', 'ASTM B124/B124M'],
        },
    },
    titanyum: {
        kim: ['ASTM B265', 'ASTM B348', 'ASTM B338', 'AMS 4911', 'AMS 4928', 'ASTM F67', 'ASTM F136', 'ASTM F1295'],
        mek: {
            levha: ['ASTM B265', 'AMS 4911'], cubuk: ['ASTM B348', 'AMS 4928', 'ASTM F67', 'ASTM F136', 'ASTM F1295'],
            boru: ['ASTM B338', 'ASTM B861'], tel: ['ASTM B863'], blok: ['ASTM B381', 'ASTM B348'],
        },
    },
    nikel: {
        kim: ['ISO 9722', 'ASTM B127', 'ASTM B168', 'ASTM B443', 'ASTM B670', 'ASTM B424', 'ASTM B575', 'ASTM B162', 'AMS 5662', 'AMS 5754', 'AMS 5667', 'AMS 5706'],
        mek: {
            levha: ['ISO 6208', 'ASTM B127', 'ASTM B168', 'ASTM B443', 'ASTM B670', 'ASTM B424', 'ASTM B575', 'ASTM B162'],
            cubuk: ['ISO 9723', 'ASTM B164', 'ASTM B166', 'ASTM B446', 'ASTM B637', 'ASTM B425', 'ASTM B574', 'ASTM B160', 'AMS 5662', 'AMS 5754', 'AMS 5667', 'AMS 5706'],
            boru: ['ASTM B163', 'ASTM B167', 'ASTM B444'], blok: ['ASTM B637', 'AMS 5662', 'AMS 5663'],
        },
    },
    // Dökme demirde kalite mekanik değerle tanımlanır; EN 1561 ve EN 1563 bileşimi üreticiye bırakır (yalnız östenitik dökümde tanımlı).
    dokme: {
        kim: ['EN 13835'],
        mek: { hepsi: ['EN 1561', 'EN 1563', 'EN 1564', 'EN 16079', 'EN 1562', 'EN 13835', 'ASTM A48/A48M', 'ASTM A536', 'ASTM A897/A897M', 'ASTM A842'] },
    },
    wha: { kim: ['ASTM B777', 'AMS-T-21014'], mek: { hepsi: ['ASTM B777', 'AMS-T-21014'] } },
    celikdokum: {
        kim: ['EN 10293', 'EN 10213', 'EN 10283', 'EN 10295', 'EN 10340', 'ASTM A27/A27M', 'ASTM A148/A148M', 'ASTM A216/A216M', 'ASTM A351/A351M', 'ASTM A743/A743M'],
        mek: { hepsi: ['EN 10293', 'EN 10213', 'EN 10283', 'EN 10295', 'EN 10340', 'ASTM A27/A27M', 'ASTM A148/A148M', 'ASTM A216/A216M', 'ASTM A351/A351M', 'ASTM A743/A743M'] },
    },
    magnezyum: {
        kim: ['ASTM B90/B90M', 'ASTM B107/B107M', 'ASTM B91', 'EN 1753', 'ASTM B94', 'ASTM B80'],
        mek: { levha: ['ASTM B90/B90M'], cubuk: ['ASTM B107/B107M'], boru: ['ASTM B107/B107M'], blok: ['ASTM B91', 'EN 1753', 'ASTM B80', 'ASTM B94'] },
    },
    cinko: { kim: ['EN 1774', 'EN 12844', 'ASTM B240', 'ASTM B86'], mek: { hepsi: ['ASTM B86'] } },
    refrakter: {
        kim: ['ASTM B386', 'ASTM B387', 'ASTM B760', 'ASTM B708', 'ASTM B365', 'ASTM B393', 'ASTM B392', 'ASTM B551', 'ASTM B550'],
        mek: {
            levha: ['ASTM B386', 'ASTM B760', 'ASTM B708', 'ASTM B393', 'ASTM B551'], cubuk: ['ASTM B387', 'ASTM B365', 'ASTM B392', 'ASTM B550'],
            tel: ['ASTM B387', 'ASTM B365', 'ASTM B392', 'ASTM B550'], boru: ['ASTM B521', 'ASTM B394', 'ASTM B523'],
        },
    },
    kobalt: {
        kim: ['ASTM F1537', 'ASTM F75', 'ASTM F90', 'ASTM F562', 'AMS 5759', 'AMS 5537', 'AMS 5844', 'AMS 5845'],
        mek: { hepsi: ['ASTM F1537', 'ASTM F75', 'ASTM F90', 'ASTM F562', 'AMS 5759', 'AMS 5537', 'AMS 5844', 'AMS 5845'] },
    },
};

// Seçim yanında görünen kısa açıklama (standardın konusu); değer kartta yalnız numara olarak saklanır.
export const STD_ACIKLAMA: Sozluk<string> = {
    'EN 573-3': 'Alüminyum dövme ürünler: kimyasal bileşim',
    'EN 485-2': 'Alüminyum levha, bant ve plaka: mekanik özellikler',
    'EN 755-2': 'Alüminyum ekstrüzyon çubuk, boru ve profil: mekanik özellikler',
    'EN 754-2': 'Alüminyum soğuk çekme çubuk ve boru: mekanik özellikler',
    'EN 586-2': 'Alüminyum dövme parça: mekanik özellikler',
    'EN 1301-2': 'Alüminyum çekme tel: mekanik özellikler',
    'EN 10088-1': 'Paslanmaz çelik listesi: kimyasal bileşim',
    'EN 10088-2': 'Paslanmaz levha ve bant: teknik teslim şartları',
    'EN 10088-3': 'Paslanmaz çubuk, filmaşin, tel ve profil: teknik teslim şartları',
    'EN ISO 683-1': 'Alaşımsız ıslah çelikleri (eski EN 10083-2)',
    'EN ISO 683-2': 'Alaşımlı ıslah çelikleri (eski EN 10083-3)',
    'EN ISO 683-3': 'Sementasyon çelikleri (eski EN 10084)',
    'EN ISO 683-4': 'Otomat çelikleri (eski EN 10087)',
    'EN 10277': 'Parlak (soğuk çekilmiş, soyulmuş) çelik ürünler',
    'ISO 9722': 'Nikel ve nikel alaşımları: bileşim ve ürün formları',
    'ISO 6208': 'Nikel alaşımı levha ve bant: mekanik özellikler',
    'ISO 9723': 'Nikel alaşımı çubuk: mekanik özellikler',
    'CEN/TS 13388': 'Bakır ve bakır alaşımları: bileşim derlemesi',
    'EN 1561': 'Lamel grafitli dökme demir (GJL)',
    'EN 1563': 'Küresel grafitli dökme demir (GJS)',
    'EN 1706': 'Alüminyum döküm: bileşim ve ayrı dökülmüş deney çubuğu değerleri',
    'ASTM B777': 'Tungsten esaslı yüksek yoğunluklu metal: sınıf, yoğunluk, sertlik',
};

// Kalitenin tablodaki eski standart adı listedeki yeni adına karşılık gelir (varsayılan seçimde kullanılır).
const ESKI_AD: Sozluk<string> = { 'EN 10083': 'EN ISO 683-1', 'EN 10083-2': 'EN ISO 683-1', 'EN 10083-3': 'EN ISO 683-2', 'EN 10084': 'EN ISO 683-3', 'EN 10087': 'EN ISO 683-4' };
export const yeniStandartAdi = (s: string): string => ESKI_AD[s] ?? s;

// Sınıfa iki seçim listesi (kimstd, mekstd: bütün formların birleşimi) ve form başına mekanik liste (mekform) yazar.
export function metalStandartlariniUygula(M: Sozluk<Sinif>): void {
    for (const [ck, v] of Object.entries(VERI)) {
        const c = M[ck];
        if (!c) continue;
        const mekform: Sozluk<string[]> = {};
        for (const [g, l] of Object.entries(v.mek) as [FormGrubu, string[]][])
            for (const f of GRUP[g]) mekform[f] = [...l];
        const birlesim: string[] = [];
        for (const l of Object.values(mekform)) for (const s of l) if (!birlesim.includes(s)) birlesim.push(s);
        c.kimstd = [...v.kim];
        c.mekstd = birlesim;
        c.mekform = mekform;
    }
}

const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
export const kimyasalStandartlari = (c: Sinif | undefined): string[] => liste(c?.kimstd);
// Form seçilmemişse ya da sınıfın form tablosu yoksa (kullanıcının eklediği sınıf) bütün mekanik liste döner.
export function mekanikStandartlari(c: Sinif | undefined, form: string | null | undefined): string[] {
    const t = c?.mekform as Sozluk<unknown> | undefined;
    if (form && t && Array.isArray(t[form])) return liste(t[form]);
    return liste(c?.mekstd);
}
export const mekanikFormaBagli = (c: Sinif | undefined, form: string | null | undefined): boolean =>
    Boolean(form && c?.mekform && Array.isArray((c.mekform as Sozluk<unknown>)[form]));
// Varsayılan: kalitenin ana standardı listede varsa o (eski ad yeni adıyla), yoksa listenin ilki.
export function varsayilanStandart(l: readonly string[], kaliteStd: string | null | undefined): string {
    const s = kaliteStd ? yeniStandartAdi(kaliteStd.replace(/\s*\(.*\)$/, '').trim()) : '';
    return (s && l.find(x => x === s || x.startsWith(s + '/'))) || l[0] || '';
}
export const STANDART_SECENEKLERI = ['kimstd', 'mekstd'] as const;
export const standartSecenegiMi = (k: string): boolean => (STANDART_SECENEKLERI as readonly string[]).includes(k);
// Ayar ekranındaki form satırları: form grubu ve kapsadığı formlar.
export const STANDART_FORM_GRUPLARI: readonly { anahtar: string; formlar: readonly string[] }[] =
    (['levha', 'cubuk', 'kosebent', 'boru', 'tel', 'blok'] as const).map(g => ({ anahtar: g, formlar: GRUP[g] }));
// Durum (temper) adlarını tanımlayan standart; kartta saklanmaz, seçili durumla birlikte gösterilir.
export const DURUM_ADI_STANDARDI: Sozluk<string> = { aluminyum: 'EN 515' };

import type { RotaKomutu } from './rota-komutlari.ts';

// Elle tanımlanan statü (geçiş planı adım 4): ekleme, değişiklik ve silme Reçete ve Rota'nın kendi tablosuna komutla gider; liste durumdan
// okunur. Burası yalnız alanları süzer ve türünü denetler; kısıt (kod en çok 5, tür, renk) ve sürüm denetimi sunucudadır.
type Nesne = Record<string, unknown>;
const gecersiz = (alan: string): Error => new Error(`Geçersiz ${alan}.`);
const kimlikYolu = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(v)) throw gecersiz('statü kimliği');
  return v;
};
const metin = (v: unknown, alan: string): string => {
  if (typeof v !== 'string') throw gecersiz(alan);
  return v;
};
const surum = (v: unknown, bosOlabilir: boolean): number | null => {
  if (bosOlabilir && (v === null || v === undefined)) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw gecersiz('sürüm');
  return v;
};

const kartGovdesi = (g: Nesne): Nesne => {
  const no = typeof g['malzemeId'] === 'string' && /^[1-9]\d{0,9}$/.test(g['malzemeId']) ? Number(g['malzemeId']) : g['malzemeId'];
  if (typeof no !== 'number' || !Number.isInteger(no) || no <= 0) throw gecersiz('kart');
  return { malzemeId: no, statu: kimlikYolu(g['statu']) };
};

export const STATU_KOMUTLARI: Readonly<Record<string, RotaKomutu>> = {
  'statu-tanimi-kaydet': {
    hafif: true,
    hazirla: (g: Nesne) => ({
      yol: `/recete-rota/statu-tanimlari/${kimlikYolu(g['id'])}/kaydet`,
      govde: { code: metin(g['code'], 'statü kodu'), name: metin(g['name'], 'statü adı'), kind: metin(g['kind'], 'statü türü'),
        color: metin(g['color'], 'renk'), beklenenSurum: surum(g['beklenenSurum'], true) },
    }),
  },
  'statu-tanimi-sil': {
    hafif: true,
    hazirla: (g: Nesne) => ({ yol: `/recete-rota/statu-tanimlari/${kimlikYolu(g['id'])}/sil`, govde: { beklenenSurum: surum(g['beklenenSurum'], false) } }),
  },
  // Statülü kart: kart, bağlı ekranda katalog numarasıdır (metin ya da sayı gelir).
  'statu-karti-ac': { hafif: true, hazirla: (g: Nesne) => ({ yol: '/recete-rota/statu-kartlari/ac', govde: kartGovdesi(g) }) },
  'statu-karti-kaldir': { hafif: true, hazirla: (g: Nesne) => ({ yol: '/recete-rota/statu-kartlari/kaldir', govde: kartGovdesi(g) }) },
};

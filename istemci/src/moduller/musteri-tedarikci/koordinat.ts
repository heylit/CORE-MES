export interface Koordinat {
  enlem: number;
  boylam: number;
}

const SAYI = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const CIFT = String.raw`${SAYI}\s*(?:,|;|\s)\s*${SAYI}`;

function gecerli(enlem: number, boylam: number): Koordinat | null {
  if (!Number.isFinite(enlem) || !Number.isFinite(boylam)) return null;
  if (enlem < -90 || enlem > 90 || boylam < -180 || boylam > 180) return null;
  return { enlem, boylam };
}

function ciftOku(m: RegExpMatchArray | null): Koordinat | null {
  if (m === null) return null;
  return gecerli(Number(m[1]), Number(m[2]));
}

function cozulmus(metin: string): string {
  try {
    return decodeURIComponent(metin);
  } catch {
    return metin;
  }
}

// Kullanıcının yapıştırdığı konumu enlem ve boylama çevirir; okunamıyorsa null. Ağa gitmez: kısa bağlantılar (maps.app.goo.gl)
// çözülmez. Desteklenen biçimler: "41.0123, 29.0456", Google "@lat,lng" / "!3dlat!4dlng" / "q|ll|query|center=lat,lng",
// OSM "mlat=..&mlon=.." ve "#map=zoom/lat/lng". Virgüllü ondalık yalnız noktalı virgülle ayrılmış çiftte okunur ("41,01; 29,04").
export function konumuAyristir(ham: string): Koordinat | null {
  const metin = cozulmus(ham.trim());
  if (metin === '') return null;

  const duz = metin.match(new RegExp(String.raw`^${CIFT}$`));
  if (duz) return ciftOku(duz);

  const virgullu = metin.match(/^(-?\d{1,3},\d+)\s*;\s*(-?\d{1,3},\d+)$/);
  if (virgullu) return gecerli(Number(virgullu[1]!.replace(',', '.')), Number(virgullu[2]!.replace(',', '.')));

  const mlat = metin.match(new RegExp(String.raw`[?&#]mlat=${SAYI}`));
  const mlon = metin.match(new RegExp(String.raw`[?&#]mlon=${SAYI}`));
  if (mlat && mlon) return gecerli(Number(mlat[1]), Number(mlon[1]));

  const imli = ciftOku(metin.match(new RegExp(String.raw`@${SAYI},${SAYI}`)));
  if (imli) return imli;

  const uc = ciftOku(metin.match(new RegExp(String.raw`!3d${SAYI}!4d${SAYI}`)));
  if (uc) return uc;

  const sorgu = ciftOku(metin.match(new RegExp(String.raw`[?&](?:q|ll|query|center|destination)=\s*${SAYI}\s*,\s*${SAYI}`)));
  if (sorgu) return sorgu;

  return ciftOku(metin.match(new RegExp(String.raw`#map=\d{1,2}/${SAYI}/${SAYI}`)));
}

export type SayiSonucu = { deger: number | null } | { hata: string };

// Kutudaki metni sayıya çevirir: boş "yok" demektir (null); virgül ondalık ayracı sayılır.
export function sayiOku(metin: string, alan: string): SayiSonucu {
  const temiz = metin.trim().replace(',', '.');
  if (temiz === '') return { deger: null };
  if (!/^-?\d+(\.\d+)?$/.test(temiz)) return { hata: `${alan} sayı olmalıdır.` };
  return { deger: Number(temiz) };
}

export interface KoordinatDenetimi {
  enlem?: string;
  boylam?: string;
  // Hata yoksa değer; ikisi de boşsa null. Hata varsa da null.
  deger: Koordinat | null;
}

// Enlem ve boylam ya birlikte verilir ya hiçbiri; sunucudaki kural ekranda da önceden gösterilir.
export function koordinatiDenetle(enlem: string, boylam: string): KoordinatDenetimi {
  const e = sayiOku(enlem, 'Enlem');
  const b = sayiOku(boylam, 'Boylam');
  const hata: { enlem?: string; boylam?: string } = {};
  if ('hata' in e) hata.enlem = e.hata;
  else if (e.deger !== null && (e.deger < -90 || e.deger > 90)) hata.enlem = 'Enlem -90 ile 90 arasındadır.';
  if ('hata' in b) hata.boylam = b.hata;
  else if (b.deger !== null && (b.deger < -180 || b.deger > 180)) hata.boylam = 'Boylam -180 ile 180 arasındadır.';
  if (hata.enlem || hata.boylam || 'hata' in e || 'hata' in b) return { ...hata, deger: null };
  if (e.deger === null && b.deger !== null) return { enlem: 'Enlem ile boylam birlikte girilir.', deger: null };
  if (b.deger === null && e.deger !== null) return { boylam: 'Enlem ile boylam birlikte girilir.', deger: null };
  if (e.deger === null || b.deger === null) return { deger: null };
  return { deger: { enlem: e.deger, boylam: b.deger } };
}

export const koordinatMetni = (enlem: number | null, boylam: number | null): string | null =>
  enlem === null || boylam === null ? null : `${enlem.toFixed(6)}, ${boylam.toFixed(6)}`;

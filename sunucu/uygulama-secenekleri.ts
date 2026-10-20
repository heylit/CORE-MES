import type { Ayar } from '#cekirdek/ayar.ts';
import type { Veritabani } from '#cekirdek/db.ts';
import type { UygulamaSecenegi } from '#cekirdek/uygulama.ts';
import { denetimYaz } from './moduller/denetim/disari.ts';
import { tekrarDeposu } from './moduller/istek-kimligi/disari.ts';
import { kimlikCozucu } from './moduller/oturum/disari.ts';

// Sunucunun gerçek kablolaması. Giriş dosyası içe aktarılınca dinlemeye geçtiği için sınanamaz; eksik parça
// (denetim yazılmaması, tekrar korumalı uçların hata vermesi) yalnız buradan ölçülür.
export function uygulamaSecenekleri(vt: Veritabani, ayar: Ayar): Required<UygulamaSecenegi> {
  return { vt, ayar, kimlik: kimlikCozucu(vt), denetle: denetimYaz, tekrar: tekrarDeposu };
}

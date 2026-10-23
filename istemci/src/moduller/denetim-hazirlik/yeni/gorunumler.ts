import type { ComponentType } from 'react';
import { SIMGELER, type SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { Ayarlar } from './ayarlar/index.tsx';
import { Bugun } from './bugun/index.tsx';
import { IcDenetim } from './ic-denetim/index.tsx';
import { Kalibrasyon } from './kalibrasyon/index.tsx';
import { Kys } from './kys/index.tsx';
import { Performans } from './performans/index.tsx';
import { Aksiyonlar, GenelBakis, HaftalikProgram, MulakatKartlari, OzDegerlendirme, Rehber, Simulasyon } from './program/index.tsx';
import { Takvim } from './takvim/index.tsx';
import type { GorunumKodu } from './tipler.ts';

// Görünüm kaydı: prototip görünüm kodu (state.view), adres parçası, başlık, bölüm ve ekran. Parçalar bu dosyaya dokunmaz (PARCA-SOZLESMESI).

export type Bolum = 'bugun' | 'denetim' | 'kys' | 'icd' | 'kalib' | 'takvim' | 'perf' | 'profil';
// Program görünümünün beş sekmesi (prototip PTABS).
export type ProgramSekmesi = 'dash' | 'deg' | 'haz' | 'rapor' | 'rehber';

export interface Gorunum {
  kod: GorunumKodu;
  yol: string;
  baslik: string;
  bolum: Bolum;
  sekme?: ProgramSekmesi;
  ekran: ComponentType;
}

export const GORUNUMLER: readonly Gorunum[] = [
  { kod: 'home', yol: 'bugun', baslik: 'Bugün', bolum: 'bugun', ekran: Bugun },
  { kod: 'dash', yol: 'genel-bakis', baslik: 'Genel bakış', bolum: 'denetim', sekme: 'dash', ekran: GenelBakis },
  { kod: 'sim', yol: 'simulasyon', baslik: 'Simülasyon', bolum: 'denetim', sekme: 'deg', ekran: Simulasyon },
  { kod: 'kontrol', yol: 'oz-degerlendirme', baslik: 'Periyodik öz değerlendirme', bolum: 'denetim', sekme: 'deg', ekran: OzDegerlendirme },
  { kod: 'hazirlik', yol: 'haftalik-program', baslik: 'Haftalık program', bolum: 'denetim', sekme: 'haz', ekran: HaftalikProgram },
  { kod: 'sorular', yol: 'mulakat-kartlari', baslik: 'Mülakat kartları', bolum: 'denetim', sekme: 'haz', ekran: MulakatKartlari },
  { kod: 'rapor', yol: 'aksiyonlar', baslik: 'Aksiyonlar ve rapor', bolum: 'denetim', sekme: 'rapor', ekran: Aksiyonlar },
  { kod: 'rehber', yol: 'rehber', baslik: 'Denetim rehberi', bolum: 'denetim', sekme: 'rehber', ekran: Rehber },
  { kod: 'kys', yol: 'kys', baslik: 'Kalite yönetim sistemi', bolum: 'kys', ekran: Kys },
  { kod: 'icd', yol: 'ic-denetim', baslik: 'İç denetim', bolum: 'icd', ekran: IcDenetim },
  { kod: 'kalib', yol: 'kalibrasyon', baslik: 'Kalibrasyon', bolum: 'kalib', ekran: Kalibrasyon },
  { kod: 'takvim', yol: 'takvim', baslik: 'Takvim', bolum: 'takvim', ekran: Takvim },
  { kod: 'perf', yol: 'performans', baslik: 'Performans', bolum: 'perf', ekran: Performans },
  { kod: 'profil', yol: 'ayarlar', baslik: 'Ayarlar ve veriler', bolum: 'profil', ekran: Ayarlar },
];

export const ACILIS_GORUNUMU: GorunumKodu = 'home';

export const gorunum = (kod: GorunumKodu): Gorunum => GORUNUMLER.find((g) => g.kod === kod) ?? (GORUNUMLER[0] as Gorunum);
export const yoldanGorunum = (yol: string | undefined): Gorunum | null => GORUNUMLER.find((g) => g.yol === yol) ?? null;

// Bölümler (prototip kenar menüsü: Bugün; Denetimler; Yönetim sistemi; Ayarlar). Bölüm seçilince açılan görünüm.
export const BOLUMLER: readonly { anahtar: Bolum; baslik: string; simge: SimgeAdi; acilis: GorunumKodu }[] = [
  { anahtar: 'bugun', baslik: 'Bugün', simge: 'home', acilis: 'home' },
  { anahtar: 'denetim', baslik: 'Denetimler', simge: 'target', acilis: 'dash' },
  { anahtar: 'kys', baslik: 'KYS', simge: 'layers', acilis: 'kys' },
  { anahtar: 'icd', baslik: 'İç denetim', simge: 'clipboard-check', acilis: 'icd' },
  { anahtar: 'kalib', baslik: 'Kalibrasyon', simge: 'ruler', acilis: 'kalib' },
  { anahtar: 'takvim', baslik: 'Takvim', simge: 'clock', acilis: 'takvim' },
  { anahtar: 'perf', baslik: 'Performans', simge: 'chart', acilis: 'perf' },
  { anahtar: 'profil', baslik: 'Ayarlar', simge: 'gear', acilis: 'profil' },
];

// Program sekmeleri ve alt sekmeleri (prototip PTABS, SUBN). Sekmeye dönülünce son açılan alt görünüm açılır (prototip lastIn).
export const PROGRAM_SEKMELERI: readonly { anahtar: ProgramSekmesi; baslik: string; gorunumler: readonly GorunumKodu[] }[] = [
  { anahtar: 'dash', baslik: 'Genel bakış', gorunumler: ['dash'] },
  { anahtar: 'deg', baslik: 'Değerlendirme', gorunumler: ['sim', 'kontrol'] },
  { anahtar: 'haz', baslik: 'Hazırlık', gorunumler: ['hazirlik', 'sorular'] },
  { anahtar: 'rapor', baslik: 'Aksiyonlar', gorunumler: ['rapor'] },
  { anahtar: 'rehber', baslik: 'Rehber', gorunumler: ['rehber'] },
];
export const ALT_BASLIK: Partial<Record<GorunumKodu, string>> = { sim: 'Simülasyon', kontrol: 'Periyodik öz değerlendirme', hazirlik: 'Haftalık program', sorular: 'Mülakat kartları' };

// Prototip simge adları (içerik ve kurallardaki `ic`) ortak simge setine çevrilir; sette olmayan ad dosya simgesine düşer.
const KARSILIK: Readonly<Record<string, SimgeAdi>> = {
  award: 'target', clip: 'clipboard-check', calcheck: 'clipboard-check', cal: 'clock', repeat: 'rotate', info: 'help', print: 'printer',
  shield: 'lock', brief: 'id-card', bulb: 'help', factory: 'building', globe: 'route', grad: 'book', link: 'route', msg: 'bell', reset: 'rotate',
  zap: 'bolt', undo: 'rotate', flip: 'rotate', chev: 'chev-right', left: 'chev-left', right: 'chev-right', copy: 'file',
};
export const prototipSimgesi = (ad: string): SimgeAdi => KARSILIK[ad] ?? (ad in SIMGELER ? (ad as SimgeAdi) : 'file');

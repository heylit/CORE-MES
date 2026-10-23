import { htype } from './takim-turu.ts';
import type { IsMalzemesi, IsoGrubu, Kalem, KesmeVerisi, Kontrol, Tezgah, TezgahTuru } from './tipler.ts';

// Prototipin varsayılan kütüphanesi (CNCDATA): tezgâhlar, malzemeler, aparatlar, takım serileri (ISO / DIN). Tezgâh değerleri
// varsayılandır; ekrandan düzenlenir (düzeltmeler durum kaydında, `mo` ve `customMachines`). Sıra ve kimlikler prototipinkidir:
// durum kaydı kalemlere kimlikle başvurur.

export const ISO: Record<IsoGrubu, string> = { P: '#3d7be0', M: '#e8c33a', K: '#d9534f', N: '#3fae5a', S: '#e38b2c', H: '#8a94a0' };
function fmtD(x: number | string | undefined): string { return String(x).replace('.', ','); }

export const MACHINES: Tezgah[] = [
  { id: 'f5a', no: 'F-01', name: '5 Eksen Freze A', code: '5 eksen · döner-devrilir tabla · konuşmalı kontrol', type: 'mill', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 15000, kind: 'm_5ax' },
  { id: 'f5b', no: 'F-02', name: '5 Eksen Freze B', code: '5 eksen · döner kafa · konuşmalı kontrol', type: 'mill', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 15000, kind: 'm_5axh' },
  { id: 'f5c', no: 'F-03', name: '5 Eksen Freze C', code: '5 eksen · döner kafa · konuşmalı kontrol', type: 'mill', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 15000, kind: 'm_5axh' },
  { id: 'f5d', no: 'F-04', name: '5 Eksen Freze D', code: '5 eksen · döner kafa · konuşmalı kontrol', type: 'mill', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 15000, kind: 'm_5axh' },
  { id: 'fgk', no: 'F-05', name: 'Gezer Kolon Freze', code: 'Gezer kolon · konuşmalı kontrol', type: 'mill', ctrl: 'heid', taper: 'HSK-A63', pockets: 30, rpm: 15000, kind: 'm_gk' },
  { id: 'yim', no: 'F-06', name: 'Yatay İşleme Merkezi', code: 'Yatay işleme merkezi · B döner tabla · palet değiştirici', type: 'mill', ctrl: 'iso', taper: 'BT40', pockets: 60, rpm: 14000, kind: 'm_hmc' },
  { id: 'tfm', no: 'T-01', name: 'Torna-Freze Merkezi', code: 'Torna-freze · B ekseni · karşı iş mili · Capto C6', type: 'millturn', ctrl: 'iso', taper: 'Capto C6', pockets: 38, rpm: 12000, spindle: 3000, kind: 'm_tf' },
  { id: 'tcy', no: 'T-02', name: 'CNC Torna Y', code: 'CNC torna · Y ekseni · canlı takımlı taret', type: 'lathe', ctrl: 'iso', taper: 'Taret', pockets: 12, rpm: 4000, live: true, liveRpm: 6000, kind: 'm_lathe' },
  { id: 'tby', no: 'T-03', name: 'Büyük CNC Torna', code: 'Büyük torna · Y ekseni + canlı takım · punta', type: 'lathe', ctrl: 'iso', taper: 'Taret', pockets: 12, rpm: 1500, spindle: 1500, live: true, liveRpm: 2500, kind: 'm_lathe' },
  { id: 'ulathe', no: 'T-04', name: 'Üniversal Torna', code: 'Konvansiyonel · elle kumanda · 4\'lü kalemlik', type: 'lathe', ctrl: 'iso', manual: true, taper: 'Taret', pockets: 4, rpm: 2000, spindle: 2000, kind: 'm_ulathe' }
];

function mat(id: string, name: string, iso: IsoGrubu, vcK: number, vcH: number, fk: number, color: number, desc: string, extra?: Partial<IsMalzemesi>): IsMalzemesi { return Object.assign({ id: id, name: name, code: 'ISO ' + iso, iso: iso, vcK: vcK, vcH: vcH, fk: fk, color: color, isoCol: ISO[iso], col: ISO[iso], kind: 'mat', desc: desc, tags: 'Vc karbür ≈ ' + vcK + ' m/dk' }, extra || {}); }
export const MATERIALS: IsMalzemesi[] = [
  mat('s235', 'S235JR (St37)', 'P', 220, 32, 1.0, 0x8d96a0, 'Yapı çeliği · ~120 HB'),
  mat('c45', 'C45 (1.0503)', 'P', 180, 26, 0.9, 0x9aa1aa, 'Islah çeliği · ~200 HB'),
  mat('42crmo4', '42CrMo4 (1.7225)', 'P', 140, 18, 0.8, 0x7d8590, 'Islah edilmiş · 28–32 HRC'),
  mat('ss304', 'Paslanmaz 304 (1.4301)', 'M', 110, 14, 0.7, 0xb9c0c7, 'Östenitik paslanmaz', { rough: 0.22 }),
  mat('gg25', 'GG25 Dökme Demir', 'K', 170, 22, 1.0, 0x5d636b, 'Gri döküm · ~200 HB', { rough: 0.7, metal: 0.4 }),
  mat('al6061', 'Alüminyum 6061-T6', 'N', 450, 90, 1.3, 0xd5dbe1, 'Genel amaçlı alüminyum', { rough: 0.25 }),
  mat('al7075', 'Alüminyum 7075-T6', 'N', 380, 75, 1.2, 0xc8ced6, 'Yüksek mukavemetli alüminyum', { rough: 0.28 }),
  mat('ti64', 'Titanyum Ti6Al4V', 'S', 55, 8, 0.6, 0x8f8a84, 'Isıl dayanımlı alaşım', { rough: 0.4 }),
  mat('hrd', 'Sertleştirilmiş Çelik', 'H', 80, 0, 0.4, 0x4f565e, '50–55 HRC', { rough: 0.45 }),
  mat('s355', 'S355J2 (St52)', 'P', 200, 30, 1.0, 0x8a93a0, 'Yapı çeliği · ~160 HB'),
  mat('16mncr5', '16MnCr5 (1.7131)', 'P', 190, 28, 0.95, 0x8f97a2, 'Sementasyon çeliği'),
  mat('34crnimo6', '34CrNiMo6 (1.6582)', 'P', 130, 16, 0.8, 0x737b86, 'Islah · 28–34 HRC'),
  mat('4340', 'AISI 4340 (1.6511)', 'P', 130, 16, 0.8, 0x6f7883, 'Savunma / havacılık · ıslah'),
  mat('2312', '1.2312 (40CrMnMoS8-6)', 'P', 150, 18, 0.85, 0x7b838e, 'Kalıp çeliği · ~30 HRC'),
  mat('2379', '1.2379 (D2) tavlı', 'P', 120, 14, 0.75, 0x6b737d, 'Soğuk iş takım çeliği'),
  mat('2344', '1.2344 (H13) tavlı', 'P', 140, 16, 0.8, 0x737b85, 'Sıcak iş takım çeliği'),
  mat('ss316', 'Paslanmaz 316L (1.4404)', 'M', 100, 13, 0.7, 0xbcc3ca, 'Östenitik · Mo alaşımlı', { rough: 0.22 }),
  mat('ss303', 'Paslanmaz 303 (1.4305)', 'M', 140, 18, 0.8, 0xb5bcc4, 'Otomat paslanmaz', { rough: 0.22 }),
  mat('174ph', '17-4PH (1.4542) · Kondisyon A', 'M', 88, 9, 0.65, 0xa9b1b9, 'Çökelme sertleşmeli · solüsyon tavlı · ≈33 HRC', { rough: 0.25, fam: '174ph', cond: 'A', hard: '≈33 HRC', age: 1, beh: { eng: 0.75, apT: 0.7, nk: 0.85, tune: 6 } }),
  mat('174ph_h1150', '17-4PH (1.4542) · H1150', 'M', 100, 11, 0.7, 0xaab2ba, 'Çökelme sertleşmeli · aşırı yaşlandırılmış · ≈28 HRC · en kolay işlenen durum', { rough: 0.25, fam: '174ph', cond: 'H1150', hard: '≈28 HRC', beh: { eng: 0.8, apT: 0.75, nk: 0.85, tune: 5 } }),
  mat('174ph_h1025', '17-4PH (1.4542) · H1025', 'M', 82, 8, 0.62, 0xa6aeb6, 'Çökelme sertleşmeli · ≈35 HRC', { rough: 0.25, fam: '174ph', cond: 'H1025', hard: '≈35 HRC', beh: { eng: 0.7, apT: 0.65, nk: 0.8, tune: 8 } }),
  mat('174ph_h900', '17-4PH (1.4542) · H900', 'M', 68, 6, 0.55, 0xa3abb3, 'Çökelme sertleşmeli · en sert durum · ≈43 HRC', { rough: 0.25, fam: '174ph', cond: 'H900', hard: '≈43 HRC', beh: { eng: 0.55, apT: 0.55, nk: 0.75, tune: 10 } }),
  mat('duplex', 'Dupleks 2205 (1.4462)', 'M', 75, 9, 0.6, 0xa4acb4, 'Dupleks paslanmaz', { rough: 0.25 }),
  mat('ggg40', 'GGG40 Küresel Grafitli', 'K', 160, 20, 0.95, 0x5a6068, 'Sfero döküm', { rough: 0.65, metal: 0.4 }),
  mat('ggg60', 'GGG60 Küresel Grafitli', 'K', 130, 16, 0.85, 0x555b63, 'Yüksek mukavemetli döküm', { rough: 0.65, metal: 0.4 }),
  mat('al5083', 'Alüminyum 5083', 'N', 420, 85, 1.25, 0xd0d6dc, 'Deniz / levha', { rough: 0.25 }),
  mat('al6082', 'Alüminyum 6082-T6', 'N', 450, 90, 1.3, 0xd3d9df, 'Genel profil / blok', { rough: 0.25 }),
  mat('al2024', 'Alüminyum 2024-T3', 'N', 380, 75, 1.2, 0xc9cfd6, 'Havacılık', { rough: 0.28 }),
  mat('pirinc', 'Pirinç CuZn39Pb3', 'N', 300, 60, 1.2, 0xc9a24a, 'Otomat pirinci', { rough: 0.3 }),
  mat('bronz', 'Bronz CuSn12', 'N', 200, 40, 1.0, 0xb07a3e, 'Yatak / burç', { rough: 0.35 }),
  mat('bakir', 'Bakır Cu-ETP', 'N', 250, 50, 0.9, 0xc8763c, 'Elektrik / elektrot', { rough: 0.3 }),
  mat('pom', 'POM (Delrin)', 'N', 350, 120, 1.4, 0xf0f0ea, 'Mühendislik plastiği', { rough: 0.6, metal: 0 }),
  mat('pa6', 'PA6 (Poliamid)', 'N', 300, 100, 1.3, 0xece6d0, 'Mühendislik plastiği', { rough: 0.6, metal: 0 }),
  mat('peek', 'PEEK', 'N', 250, 80, 1.1, 0xc9b98a, 'Yüksek performans plastik', { rough: 0.55, metal: 0 }),
  mat('in718', 'Inconel 718', 'S', 35, 5, 0.5, 0x8a8680, 'Nikel süper alaşım', { rough: 0.4 }),
  mat('tigr2', 'Titanyum Grade 2', 'S', 80, 12, 0.7, 0x948f88, 'Saf titanyum', { rough: 0.4 }),
  mat('armor', 'Zırh Çeliği (500 HB)', 'H', 70, 0, 0.45, 0x4b5259, 'Balistik çelik', { rough: 0.45 }),
  mat('2379h', '1.2379 sertleştirilmiş', 'H', 60, 0, 0.35, 0x474e56, '58–62 HRC', { rough: 0.45 })
];

const RHO: Record<string, number> = { s235: 7.85, c45: 7.85, '42crmo4': 7.85, ss304: 7.93, gg25: 7.2, al6061: 2.70, al7075: 2.81, ti64: 4.43, hrd: 7.85, s355: 7.85, '16mncr5': 7.85, '34crnimo6': 7.85, '4340': 7.85, '2312': 7.85, '2379': 7.7, '2344': 7.8, ss316: 7.98, ss303: 7.9, '174ph': 7.78, '174ph_h1150': 7.78, '174ph_h1025': 7.78, '174ph_h900': 7.78, duplex: 7.8, ggg40: 7.1, ggg60: 7.2, al5083: 2.66, al6082: 2.70, al2024: 2.78, pirinc: 8.47, bronz: 8.7, bakir: 8.93, pom: 1.41, pa6: 1.14, peek: 1.32, in718: 8.19, tigr2: 4.51, armor: 7.85, '2379h': 7.7 };
MATERIALS.forEach((m) => { m.rho = RHO[m.id]; });

function it(id: string, name: string, code: string, kind: string, tags?: string, desc?: string, x?: Partial<Kalem>): Kalem { return Object.assign({ id: id, name: name, code: code, kind: kind, tags: tags || '', desc: desc || '' }, x || {}); }
export const FIX: Record<'mill' | 'lathe', Kalem[]> = {
  mill: [
    it('vise125', 'Hassas Mengene 125 mm', 'MNG-125 · mekanik', 'f_vise', '0–160 mm açılım', 'Prizmatik parçalar için standart bağlama'),
    it('hvise160', 'Hidrolik Mengene 160 mm', 'MNG-H160', 'f_hvise', 'Sabit sıkma kuvveti', 'Seri üretimde tekrarlanabilir sıkma'),
    it('dvise', 'Çift Mengene', '2 parça / çevrim', 'f_dvise', 'Merkez sabit çene', 'Aynı çevrimde iki parça'),
    it('zp', 'Sıfır Nokta Bağlama', '4 modül · pnömatik', 'f_zp', 'Hızlı palet değişimi', 'Tekrarlanabilirlik < 0,005 mm'),
    it('zpr', 'Sıfır Nokta + Yükseltme', '5 eksen erişimi', 'f_zpr', 'Kule / yükseltici', '5 eksende çarpışmasız erişim'),
    it('mag', 'Manyetik Tabla', 'Elektro-kalıcı', 'f_mag', 'Düz çelik parçalar', 'Sadece manyetik malzemeler'),
    it('vac', 'Vakum Tabla', 'Contalı plaka', 'f_vac', 'İnce plakalar', 'Alüminyum / plastik ince parçalar'),
    it('clamp', 'Pabuç / Klemp Seti', 'T-cıvata M16 · 58 parça', 'f_clamp', 'Büyük parçalar', 'Doğrudan tabla bağlama'),
    it('custom', 'Parçaya Özel Fikstür', 'Pim + döner klemp', 'f_custom', 'Konumlama pimleri', 'Seri parça için özel aparat'),
    it('rot4', '4. Eksen Divizör + Punta', 'Ø160 · ayna', 'f_rot4', 'Silindirik işleme', 'Dönel parçalar')
  ],
  lathe: [
    it('ch3', '3 Ayaklı Hidrolik Ayna', 'Ø210 · kendinden merkezli', 'f_ch3', 'Genel tornalama', 'Yuvarlak parçalar'),
    it('ch4', '4 Ayaklı Bağımsız Ayna', 'Ø250', 'f_ch4', 'Eksantrik / kare parça', 'Her çene ayrı ayarlanır'),
    it('collet', 'Pens Aynası', 'Bar besleme', 'f_collet', 'Küçük çaplı seri', 'Bar sürücü ile'),
    it('chtail', 'Ayna + Punta', 'Uzun mil', 'f_chtail', 'L/D > 3', 'Uzun parçalarda destek'),
    it('steady', 'Ayna + Lünet', 'Gezer / sabit lünet', 'f_steady', 'L/D > 8', 'Narin millerde titreşim önleme'),
    it('face', 'Fikstür Plakası', 'Özel bağlama', 'f_face', 'Düzensiz parçalar', 'Aynaya bağlanan fikstür')
  ]
};
export const JAWS: Record<'mill' | 'lathe', Kalem[]> = {
  mill: [
    it('j_hard', 'Sert Çene (Tırtıllı)', 'Kaba işleme', 'j_hard', 'Yüksek tutuş', 'Ham malzeme bağlama'),
    it('j_soft', 'Yumuşak Çene', 'İşlenebilir alüminyum', 'j_soft', 'Parça formuna işlenir', 'İkinci operasyon / hassas'),
    it('j_par', 'Paralel Takoz Seti', '1–6 mm adımlı', 'j_par', 'Yükseklik ayarı', 'Parçayı mengenede yükseltme'),
    it('j_step', 'Kademeli Çene', 'Basamaklı', 'j_step', 'İnce parçalar', 'Düşük boyda bağlama'),
    it('j_v', 'Prizma (V) Çene', 'Yuvarlak parça', 'j_v', 'Mil / boru', 'Silindirik parça merkezleme'),
    it('j_stop', 'Pozisyon Stoperi', 'Tekrar konumlama', 'j_stop', 'Seri üretim', 'Parçayı aynı yere dayama'),
    it('j_none', 'Çenesiz / Doğrudan', 'Tablaya bağlama', 'j_none', '—', 'Klemp veya fikstür ile')
  ],
  lathe: [
    it('lj_hard', 'Sert Çene (Kademeli)', 'Kaba tornalama', 'lj_hard', 'Yüksek tutuş', 'Ham malzeme'),
    it('lj_soft', 'Yumuşak Çene', 'Çapa işlenir', 'lj_soft', 'Hassas tekrar', 'İkinci operasyon'),
    it('lj_pie', 'Pasta (Pie) Çene', 'Geniş temas', 'lj_pie', 'İnce cidarlı parça', 'Deformasyonu azaltır'),
    it('lj_in', 'İç Bağlama Çenesi', 'Ters çene', 'lj_in', 'Boru / halka', 'İçten sıkma')
  ]
};
export const ZERO: Record<'mill' | 'lathe', Kalem[]> = {
  mill: [
    it('z_probe', '3D Prob Döngüsü', 'Otomatik ölçüm', 'z_probe', 'Köşe / merkez / düzlem', 'Döngü ile preset yazılır'),
    it('z_edge', 'Kenar Bulucu', 'Mekanik Ø10', 'z_edge', 'Manuel', 'Kenar sıyırma ile X/Y'),
    it('z_dial', 'Komparatör ile Merkezleme', '0,01 mm', 'z_dial', 'Delik / mil merkezi', 'Dönen komparatör'),
    it('z_touch', 'Takımla Sıyırma', 'Touch-off', 'z_touch', 'Z sıfırı', 'Kâğıt / mastar ile'),
    it('z_pin', 'Fikstür Sıfır Pimi', 'Sabit referans', 'z_pin', 'Fikstürde tanımlı', 'Seri üretimde ölçümsüz')
  ],
  lathe: [
    it('z_arm', 'Takım Ayar Kolu', 'Otomatik takım ölçüm', 'z_arm', 'X / Z boy ofseti', 'Taret takımları için'),
    it('z_touch', 'Takımla Sıyırma', 'Touch-off', 'z_touch', 'Z sıfırı', 'Alın sıyırma ile'),
    it('z_optic', 'Optik Ön Ayar (Presetter)', 'Tezgâh dışı', 'z_optic', 'Ofset ölçümü', 'Takımlar dışarıda ölçülür'),
    it('z_probe', '3D Prob Döngüsü', 'Otomatik ölçüm', 'z_probe', 'Parça referansı', 'Prob ile iş sıfırı')
  ]
};
export const WCS: Record<Kontrol, Kalem[]> = {
  heid: [1, 2, 3, 4, 5, 6].map((n) => { return it('p' + n, 'Preset ' + n, 'TNC Preset tablosu', 'wcs', 'Satır ' + n, 'Heidenhain referans noktası'); }),
  iso: ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G54.1 P1'].map((g) => { return it(g.toLowerCase().replace(/[ .]/g, ''), g, 'İş koordinat sistemi', 'wcs', 'Ofset tablosu', 'ISO / Fanuc tipi'); })
};
export const COOL: Kalem[] = [
  it('bor5', 'Bor Yağı %5', 'Emülsiyon', 'cool', 'Dışarıdan sulu', 'Genel çelik ve döküm', { color: 0xeef3f6 }),
  it('bor8', 'Bor Yağı %8', 'Emülsiyon', 'cool', 'Dışarıdan sulu', 'Alüminyum, paslanmaz', { color: 0xe3eaee }),
  it('oil', 'Kesme Yağı (Saf)', 'Saf yağ', 'cool', 'Yüksek yağlama', 'Kılavuz, rayba, titanyum', { color: 0xd9a032, op: 0.8 }),
  it('mql', 'MQL (Minimum Yağlama)', 'Yağ buharı', 'cool', 'Kuru yakın', 'Alüminyum, temiz talaş', { mode: 'mql', color: 0xf0d27a }),
  it('air', 'Basınçlı Hava (Kuru)', 'Talaş üfleme', 'cool', 'Soğutucusuz', 'Sertleştirilmiş çelik, döküm', { mode: 'air' }),
  it('tsc', 'Takım İçinden Soğutma', 'TSC · 40 bar', 'cool', 'Derin delik', 'İçten soğutmalı matkaplar', { mode: 'tsc' })
];

export const TM: Record<string, string> = { K: 'Karbür', H: 'HSS', I: 'Uçlu', '-': '' };
function T(id: string, name: string, code: string, kind: string, d: number, z: number, tm: string, vm: number, cut?: KesmeVerisi, x?: Partial<Kalem>): Kalem {
  const o = Object.assign({ id: id, name: name, code: code, kind: kind, d: d, z: z, tm: tm, vm: vm, cut: cut || {}, isTool: true }, x || {});
  const parts = []; if (d) parts.push('Ø' + fmtD(d)); if (z) parts.push('Z' + z); if (TM[tm]) parts.push(TM[tm]);
  o.tags = o.tags || parts.join(' · '); o.desc = o.desc || ''; return o;
}
export const EMPTY: Kalem = { id: 'empty', name: 'Boş Cep', code: '—', kind: 'empty', isTool: true, d: 0, tags: 'Takım yok', desc: 'Bu cep boş kalır', cut: {} };
export const MILL: Kalem[] = [
  T('fm63', 'Alın Frezesi Ø63', 'APKT 1604 · 5 uç', 'facemill', 63, 5, 'I', 1.15, { fz: 0.15 }, { s: 22, desc: 'Yüzey kaba / finiş' }),
  T('fm50', '45° Alın Frezesi Ø50', 'SEKT 1204 · 4 uç', 'facemill45', 50, 4, 'I', 1.15, { fz: 0.18 }, { s: 22, desc: 'Yüksek ilerlemeli yüzey' }),
  T('em20', 'Parmak Freze Ø20', 'Karbür · AlTiN', 'endmill', 20, 4, 'K', 1, { fz: 0.08 }, { s: 20, coat: 'altin', desc: 'Kaba / yan frezeleme' }),
  T('em16', 'Parmak Freze Ø16', 'Karbür · AlTiN', 'endmill', 16, 4, 'K', 1, { fz: 0.07 }, { s: 16, coat: 'altin', desc: 'Cep ve kontur' }),
  T('em12', 'Parmak Freze Ø12', 'Karbür · AlTiN', 'endmill', 12, 4, 'K', 1, { fz: 0.06 }, { s: 12, coat: 'altin', desc: 'Genel amaçlı' }),
  T('em10', 'Parmak Freze Ø10', 'Karbür · AlTiN', 'endmill', 10, 4, 'K', 1, { fz: 0.05 }, { s: 10, coat: 'altin', desc: 'Kontur / finiş' }),
  T('em8', 'Parmak Freze Ø8', 'Karbür · AlTiN', 'endmill', 8, 4, 'K', 1, { fz: 0.04 }, { s: 8, coat: 'altin', desc: 'Dar cepler' }),
  T('em6', 'Parmak Freze Ø6', 'Karbür · AlTiN', 'endmill', 6, 4, 'K', 1, { fz: 0.03 }, { s: 6, coat: 'altin', desc: 'Detay işleme' }),
  T('em4', 'Parmak Freze Ø4', 'Karbür · AlTiN', 'endmill', 4, 3, 'K', 1, { fz: 0.02 }, { s: 4, coat: 'altin', desc: 'Mikro detay' }),
  T('rg16', 'Kaba Freze Ø16', 'Talaş kırıcılı', 'rougher', 16, 4, 'K', 0.9, { fz: 0.08 }, { s: 16, coat: 'altin', desc: 'Yüksek talaş kaldırma' }),
  T('al10', 'Alüminyum Frezesi Ø10', 'Z3 · parlatılmış', 'endmill', 10, 3, 'K', 1, { fz: 0.06 }, { s: 10, coat: 'bright', desc: 'Alüminyum için yüksek helis' }),
  T('cr12', 'Köşe Radyüslü Ø12 R1', 'Karbür · AlTiN', 'bullnose', 12, 4, 'K', 1, { fz: 0.06 }, { s: 12, coat: 'altin', desc: 'Dinamik frezeleme' }),
  T('bm10', 'Küresel Freze R5', 'Ø10 · TiAlN', 'ball', 10, 2, 'K', 1, { fz: 0.06 }, { s: 10, coat: 'altin', desc: '3B yüzey finiş' }),
  T('bm6', 'Küresel Freze R3', 'Ø6 · TiAlN', 'ball', 6, 2, 'K', 1, { fz: 0.04 }, { s: 6, coat: 'altin', desc: '3B detay finiş' }),
  T('ch12', 'Pah Frezesi Ø12 90°', 'Karbür', 'chamfer', 12, 4, 'K', 0.8, { fz: 0.04 }, { s: 12, coat: 'altin', desc: 'Pah kırma / çapak' }),
  T('tm16', 'Diş Frezesi M10–M16', 'Karbür · tek profil', 'threadmill', 12, 3, 'K', 0.7, { fz: 0.04 }, { s: 12, coat: 'altin', desc: 'Helisel diş frezeleme' }),
  T('ts25', 'T-Kanal Frezesi Ø25', '14 mm kanal', 'tslot', 25, 6, 'K', 0.6, { fz: 0.04 }, { s: 16, coat: 'altin', desc: 'T-kanal / yarı kanal' }),
  T('sp10', 'Punta Matkabı Ø10 90°', 'Karbür · NC punta', 'spot', 10, 2, 'K', 0.5, { fr: 0.08 }, { s: 10, coat: 'altin', desc: 'Delik başlangıcı + pah' }),
  T('dr68', 'Matkap Ø6,8 (M8)', 'Karbür · içten soğutmalı', 'drill', 6.8, 2, 'K', 0.55, { fr: 0.14 }, { s: 8, coat: 'altin', desc: 'M8 kılavuz öncesi' }),
  T('dr85', 'Matkap Ø8,5 (M10)', 'Karbür · içten soğutmalı', 'drill', 8.5, 2, 'K', 0.55, { fr: 0.17 }, { s: 10, coat: 'altin', desc: 'M10 kılavuz öncesi' }),
  T('dr102', 'Matkap Ø10,2 (M12)', 'Karbür · içten soğutmalı', 'drill', 10.2, 2, 'K', 0.55, { fr: 0.2 }, { s: 12, coat: 'altin', desc: 'M12 kılavuz öncesi' }),
  T('dr5h', 'Matkap Ø5 HSS-Co', 'DIN 338 · TiN', 'drill', 5, 2, 'H', 1, { fr: 0.08 }, { s: 5, coat: 'tin', desc: 'Genel delik' }),
  T('tpM8', 'Kılavuz M8×1,25', 'HSS-E · helis kanallı', 'tap', 8, 3, 'H', 0.5, { pitch: 1.25 }, { s: 8, coat: 'tin', desc: 'Kör delik' }),
  T('tpM10', 'Kılavuz M10×1,5', 'HSS-E · helis kanallı', 'tap', 10, 3, 'H', 0.5, { pitch: 1.5 }, { s: 10, coat: 'tin', desc: 'Kör delik' }),
  T('tpM12', 'Kılavuz M12×1,75', 'HSS-E · helis kanallı', 'tap', 12, 3, 'H', 0.5, { pitch: 1.75 }, { s: 12, coat: 'tin', desc: 'Kör delik' }),
  T('rm10', 'Rayba Ø10 H7', 'Karbür · Z6', 'reamer', 10, 6, 'K', 0.35, { fr: 0.25 }, { s: 10, coat: 'bright', desc: 'Hassas tolerans deliği' }),
  T('bh25', 'Baralama Kafası Ø20–30', 'Hassas ince işlem', 'boring', 25, 1, 'I', 1, { fr: 0.08 }, { s: 0, desc: 'Ayarlanabilir çap' }),
  T('probe', '3D Dokunmatik Prob', 'Kızılötesi · Ø6 bilye', 'probe', 6, 0, '-', 0, {}, { s: 0, tags: 'Ölçüm probu', desc: 'İş sıfırı ve ölçüm' })
];
export const LATHE: Kalem[] = [
  T('ex_r', 'Dış Çap Kaba', 'PCLNR 2525 · CNMG 120408', 'lt_ext', 0, 0, 'I', 1, { fr: 0.3 }, { ins: 'C', tags: 'CNMG 80° · R0,8', desc: 'Kaba tornalama' }),
  T('ex_f', 'Dış Çap Finiş', 'PDJNR 2525 · DNMG 110404', 'lt_ext', 0, 0, 'I', 1.15, { fr: 0.12 }, { ins: 'D', tags: 'DNMG 55° · R0,4', desc: 'Finiş / profil' }),
  T('ex_cp', 'Kopyalama', 'SVJBR 2525 · VBMT 160404', 'lt_ext', 0, 0, 'I', 1.1, { fr: 0.1 }, { ins: 'V', tags: 'VBMT 35° · R0,4', desc: 'Profil kopyalama' }),
  T('face', 'Alın Tornalama', 'PSSNR 2525 · SNMG 120408', 'lt_ext', 0, 0, 'I', 1, { fr: 0.25 }, { ins: 'S', tags: 'SNMG 90° · R0,8', desc: 'Alın / pah' }),
  T('in_r', 'İç Çap Kaba', 'S25T-PCLNR 12 · CNMG 120408', 'lt_bore', 0, 0, 'I', 0.9, { fr: 0.2 }, { ins: 'C', bar: 2.5, tags: 'Bar Ø25 · CNMG', desc: 'İç kaba tornalama' }),
  T('in_f', 'İç Çap Finiş', 'S16R-SDUCR 07 · DCMT 070204', 'lt_bore', 0, 0, 'I', 1, { fr: 0.08 }, { ins: 'D', bar: 1.6, tags: 'Bar Ø16 · DCMT', desc: 'İç finiş' }),
  T('grv', 'Kanal Açma 3 mm', 'Dış kanal · 3,0 mm uç', 'lt_groove', 0, 0, 'I', 0.6, { fr: 0.06 }, { tags: 'Genişlik 3,0', desc: 'Dış kanal' }),
  T('cut', 'Kesme 3 mm', 'Kesme bıçağı · 3,0 mm', 'lt_part', 0, 0, 'I', 0.55, { fr: 0.05 }, { tags: 'Genişlik 3,0', desc: 'Parça kesme' }),
  T('thr', 'Dış Diş Çekme', 'SER 2525 · 16ER 1,5 ISO', 'lt_thread', 0, 0, 'I', 0.6, { pitch: 1.5 }, { tags: 'Adım 1,5 · 60°', desc: 'Dış metrik diş' }),
  T('ithr', 'İç Diş Çekme', 'SNR 0016 · 16IR 1,5 ISO', 'lt_ithread', 0, 0, 'I', 0.55, { pitch: 1.5 }, { bar: 1.6, tags: 'Adım 1,5 · 60°', desc: 'İç metrik diş' }),
  T('ud20', 'U-Matkap Ø20', '2×D · WCMX 0303', 'lt_udrill', 20, 2, 'I', 0.7, { fr: 0.08 }, { desc: 'Dolu malzemede delik' }),
  T('lsp', 'Punta Matkabı Ø10', 'Eksenel tutucu · 90°', 'spot', 10, 2, 'K', 0.5, { fr: 0.08 }, { s: 10, coat: 'altin', desc: 'Merkez deliği' }),
  T('ldr', 'Matkap Ø10,2 HSS', 'Eksenel tutucu', 'drill', 10.2, 2, 'H', 1, { fr: 0.15 }, { s: 10.2, coat: 'tin', desc: 'Eksenel delik' })
];
/* =========================================================
   GENEL TAKIM KÜTÜPHANESİ — standart seriler (ISO / DIN)
   ========================================================= */
export const TOOL_CATS: { k: string; t: string; lib: 'mill' | 'lathe' }[] = [
  { k: 'tm_end', t: 'Parmak frezeler', lib: 'mill' }, { k: 'tm_form', t: 'Küresel ve form frezeler', lib: 'mill' }, { k: 'tm_ind', t: 'Uçlu frezeler', lib: 'mill' },
  { k: 'tm_hole', t: 'Delik işleme', lib: 'mill' }, { k: 'tm_thr', t: 'Diş, kanal ve özel', lib: 'mill' },
  { k: 'tl_ext', t: 'Torna · dış çap', lib: 'lathe' }, { k: 'tl_int', t: 'Torna · iç çap', lib: 'lathe' }, { k: 'tl_grv', t: 'Torna · kanal, kesme, diş, tırtıl', lib: 'lathe' }, { k: 'tl_hole', t: 'Torna · delik işleme', lib: 'lathe' }
];
const KCAT: Record<string, string> = { endmill: 'tm_end', rougher: 'tm_end', bullnose: 'tm_end', longneck: 'tm_end', ball: 'tm_form', taperball: 'tm_form', lollipop: 'tm_form', engrave: 'tm_form', barrel: 'tm_form', chamfer: 'tm_form', backchamfer: 'tm_form',
  facemill: 'tm_ind', facemill45: 'tm_ind', shoulder: 'tm_ind', hfmi: 'tm_ind', roundins: 'tm_ind', disc: 'tm_ind', longedge: 'tm_ind',
  spot: 'tm_hole', center: 'tm_hole', drill: 'tm_hole', stepdrill: 'tm_hole', idrill: 'tm_hole', csink: 'tm_hole', reamer: 'tm_hole', boring: 'tm_hole', boring2: 'tm_hole',
  tap: 'tm_thr', threadmill: 'tm_thr', tslot: 'tm_thr', keyseat: 'tm_thr', probe: 'tm_thr' };
function did(d: number): string { return String(d).replace('.', ''); }
const mseen: Record<string, 1> = {}; MILL.forEach((t) => { mseen[t.id] = 1; });
function addM(t: Kalem): void { if (mseen[t.id]) return; mseen[t.id] = 1; MILL.push(t); }
function zOf(d: number): number { return d < 4 ? 2 : d < 6 ? 3 : 4; }
[1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25].forEach((d) => { addM(T('em' + did(d), 'Parmak Freze Ø' + fmtD(d), 'Karbür · AlTiN · DIN 6527', 'endmill', d, zOf(d), 'K', 1, { fz: +(Math.max(0.006, 0.005 * d)).toFixed(3) }, { s: Math.max(3, d < 6 ? 6 : d), coat: 'altin', desc: d <= 3 ? 'Mikro işleme' : d <= 8 ? 'Detay / dar cep' : 'Kaba / kontur' })); });
[6, 8, 12, 16, 20].forEach((d) => { addM(T('al' + d, 'Alüminyum Frezesi Ø' + d, 'Z3 · parlatılmış · 45° helis', 'endmill', d, 3, 'K', 1, { fz: +(0.006 * d).toFixed(3) }, { s: d, coat: 'bright', desc: 'Alüminyum / demir dışı' })); });
[8, 10, 12, 20, 25].forEach((d) => { addM(T('rg' + d, 'Kaba Freze Ø' + d, 'Talaş kırıcılı · Z4', 'rougher', d, 4, 'K', 0.9, { fz: +(0.0075 * d).toFixed(3) }, { s: d, coat: 'altin', desc: 'Yüksek talaş kaldırma' })); });
([[6, 0.5], [8, 1], [10, 1], [16, 2], [20, 3]] as [number, number][]).forEach((a) => { addM(T('cr' + a[0], 'Köşe Radyüslü Ø' + a[0] + ' R' + fmtD(a[1]), 'Karbür · AlTiN', 'bullnose', a[0], 4, 'K', 1, { fz: +(0.006 * a[0]).toFixed(3) }, { s: a[0], coat: 'altin', desc: 'Dinamik / trokoidal frezeleme' })); });
([[3, 20], [4, 30], [6, 40], [8, 50]] as [number, number][]).forEach((a) => { addM(T('ln' + a[0], 'Uzun Boyunlu Freze Ø' + a[0] + ' L' + a[1], 'Karbür · Z2 · boyun ' + a[1] + ' mm', 'longneck', a[0], 2, 'K', 0.7, { fz: +(0.004 * a[0]).toFixed(3) }, { s: 6, ln: a[1], coat: 'altin', desc: 'Derin cep / kalıp' })); });
[8, 10, 12, 16].forEach((d) => { addM(T('hf' + d, 'Yüksek İlerleme Frezesi Ø' + d, 'Karbür · Z4 · düşük ap', 'bullnose', d, 4, 'K', 1.1, { fz: +(0.03 * d).toFixed(3) }, { s: d, coat: 'altin', desc: 'Yüksek ilerleme, düşük kesme derinliği' })); });
[6, 10, 16].forEach((d) => { addM(T('hem' + d, 'HSS-Co Parmak Freze Ø' + d, 'DIN 844 · Z4', 'endmill', d, 4, 'H', 1, { fz: +(0.004 * d).toFixed(3) }, { s: d, coat: 'tin', desc: 'Genel / konvansiyonel' })); });
[2, 3, 4, 8, 12, 16].forEach((d) => { addM(T('bm' + d, 'Küresel Freze R' + fmtD(d / 2), 'Ø' + d + ' · Z2 · TiAlN', 'ball', d, 2, 'K', 1, { fz: +(0.006 * d).toFixed(3) }, { s: Math.max(4, d), coat: 'altin', desc: '3B yüzey finiş' })); });
([[1, 3], [2, 2], [3, 1.5]] as [number, number][]).forEach((a) => { addM(T('tb' + a[0], 'Konik Küresel R' + fmtD(a[0] / 2) + ' · ' + fmtD(a[1]) + '°', 'Karbür · Z2 · kalıp', 'taperball', a[0], 2, 'K', 0.9, { fz: 0.02 }, { s: 6, coat: 'altin', desc: 'Kalıp duvarları / ince detay' })); });
[6, 10].forEach((d) => { addM(T('lp' + d, 'Lolipop (T-küre) Ø' + d, 'Karbür · alt kesme', 'lollipop', d, 4, 'K', 0.6, { fz: 0.025 }, { s: d, coat: 'altin', desc: 'Alttan kesme / 5 eksen' })); });
addM(T('br12', 'Fıçı (Segment) Freze Ø12', 'Karbür · R85 · Z4', 'barrel', 12, 4, 'K', 1, { fz: 0.08 }, { s: 12, coat: 'altin', desc: '5 eksen yüzey finiş (geniş adım)' }));
addM(T('eg02', 'Gravür Takımı 60° · 0,2', 'Karbür · tek ağız', 'engrave', 0.2, 1, 'K', 0.5, { fz: 0.01 }, { s: 6, coat: 'altin', desc: 'Yazı / işaretleme' }));
([[6, 90], [16, 90], [10, 60]] as [number, number][]).forEach((a) => { addM(T('ch' + a[0] + (a[1] === 60 ? '_60' : ''), 'Pah Frezesi Ø' + a[0] + ' ' + a[1] + '°', 'Karbür · Z4', 'chamfer', a[0], 4, 'K', 0.8, { fz: +(0.0035 * a[0]).toFixed(3) }, { s: a[0], coat: 'altin', desc: 'Pah kırma / çapak' })); });
[6, 10].forEach((d) => { addM(T('bc' + d, 'Arka Pah Frezesi Ø' + d, 'Karbür · ters pah', 'backchamfer', d, 3, 'K', 0.6, { fz: 0.02 }, { s: 6, coat: 'altin', desc: 'Delik arka kenarı çapak' })); });
[50, 63, 80, 100, 125].forEach((d) => { addM(T(d === 50 ? 'fm50' : 'fa' + d, '45° Alın Frezesi Ø' + d, 'SEKT 1204 · ' + Math.round(d / 12) + ' uç', 'facemill45', d, Math.round(d / 12), 'I', 1.15, { fz: 0.18 }, { s: 22, desc: 'Yüzey frezeleme' })); });
[40, 50, 80].forEach((d) => { addM(T('fm' + d, 'Köşe Alın Frezesi Ø' + d + ' 90°', 'APKT 1604 · ' + Math.round(d / 13) + ' uç', 'facemill', d, Math.round(d / 13), 'I', 1.15, { fz: 0.15 }, { s: d <= 40 ? 16 : 22, desc: '90° omuz / yüzey' })); });
[16, 20, 25, 32].forEach((d) => { addM(T('sh' + d, 'Uçlu Köşe Frezesi Ø' + d, 'APKT 1003 · Weldon', 'shoulder', d, d < 20 ? 2 : 3, 'I', 1.1, { fz: 0.1 }, { s: d < 20 ? 16 : d < 32 ? 20 : 32, desc: '90° omuz / cep' })); });
[25, 32, 42, 52].forEach((d) => { addM(T('hi' + d, 'Uçlu Yüksek İlerleme Ø' + d, 'LNMU 0303 · ' + (d < 40 ? 3 : 4) + ' uç', 'hfmi', d, d < 40 ? 3 : 4, 'I', 1.2, { fz: 0.8 }, { s: Math.min(32, d), desc: 'Kaba boşaltma · ap ≤ 1 mm' })); });
([[20, 10], [32, 12], [40, 16]] as [number, number][]).forEach((a) => { addM(T('rd' + a[0], 'Yuvarlak Uçlu Kopya Frezesi Ø' + a[0], 'RDMT ' + a[1] + 'T3 · ' + (a[0] < 30 ? 2 : 3) + ' uç', 'roundins', a[0], a[0] < 30 ? 2 : 3, 'I', 1.1, { fz: 0.25 }, { s: Math.min(32, a[0]), ic: a[1], desc: 'Kalıp kaba / kopya' })); });
([[80, 6], [100, 10], [125, 12]] as [number, number][]).forEach((a) => { addM(T('dk' + a[0], 'Disk Freze Ø' + a[0] + '×' + a[1], 'Kanal / yan frezeleme', 'disc', a[0], Math.round(a[0] / 9), 'I', 0.9, { fz: 0.1 }, { w: a[1], desc: 'Kanal ve yarık açma' })); });
[32, 40].forEach((d) => { addM(T('le' + d, 'Mısır Koçanı Freze Ø' + d, 'Uzun kenar · 3 sıra', 'longedge', d, 3, 'I', 0.9, { fz: 0.1 }, { s: 32, lc: d + 20, desc: 'Derin omuz / yüksek talaş' })); });
[6, 8, 12, 16].forEach((d) => { addM(T('sp' + d, 'Punta Matkabı Ø' + d + ' 90°', 'Karbür · NC punta', 'spot', d, 2, 'K', 0.5, { fr: 0.08 }, { s: d, coat: 'altin', desc: 'Delik başlangıcı + pah' })); });
([[2.5, 6.3], [3.15, 8], [4, 10]] as [number, number][]).forEach((a) => { addM(T('cd' + did(a[0]), 'Merkez Matkabı A' + fmtD(a[0]), 'DIN 333 · HSS · 60°', 'center', a[0], 2, 'H', 0.8, { fr: 0.04 }, { s: a[1], coat: 'tin', desc: 'Punta deliği' })); });
[3.3, 4.2, 5, 6, 8, 10, 12, 14, 16].forEach((d) => { addM(T('dr' + did(d), 'Matkap Ø' + fmtD(d), 'Karbür · 3×D · içten soğutmalı', 'drill', d, 2, 'K', 0.55, { fr: +(0.02 * d).toFixed(3) }, { s: Math.ceil(d < 6 ? 6 : d), ld: 3, coat: 'altin', desc: d === 3.3 ? 'M4 kılavuz öncesi' : d === 4.2 ? 'M5 kılavuz öncesi' : d === 5 ? 'M6 kılavuz öncesi' : 'Genel delik' })); });
[5, 6.8, 8.5, 10.2].forEach((d) => { addM(T('dl' + did(d), 'Uzun Matkap Ø' + fmtD(d) + ' 5×D', 'Karbür · 5×D · içten soğutmalı', 'drill', d, 2, 'K', 0.5, { fr: +(0.018 * d).toFixed(3) }, { s: Math.ceil(d < 6 ? 6 : d), ld: 5, coat: 'altin', desc: 'Derin delik' })); });
[3, 8, 10, 13].forEach((d) => { addM(T('dr' + d + 'h', 'Matkap Ø' + d + ' HSS-Co', 'DIN 338 · TiN', 'drill', d, 2, 'H', 1, { fr: +(0.015 * d).toFixed(3) }, { s: d, ld: 4, coat: 'tin', desc: 'Genel delik' })); });
[16, 20, 25, 32].forEach((d) => { addM(T('um' + d, 'Uçlu Matkap (U) Ø' + d + ' 3×D', 'WCMX · 2 uç', 'idrill', d, 2, 'I', 0.8, { fr: 0.08 }, { s: d < 20 ? 20 : 25, ld: 3, desc: 'Dolu malzeme, hızlı delik' })); });
([[6.8, 'M8'], [8.5, 'M10']] as [number, string][]).forEach((a) => { addM(T('sd' + did(a[0]), 'Kademeli Matkap Ø' + fmtD(a[0]) + ' (' + a[1] + ' + pah)', 'Karbür · 90° kademe', 'stepdrill', a[0], 2, 'K', 0.5, { fr: +(0.018 * a[0]).toFixed(3) }, { s: Math.ceil(a[0] * 1.2), d2: a[0] * 1.25, coat: 'altin', desc: 'Delik + pah tek seferde' })); });
[10, 16, 20].forEach((d) => { addM(T('cs' + d, 'Havşa Matkabı Ø' + d + ' 90°', 'HSS-Co · Z3', 'csink', d, 3, 'H', 0.6, { fr: 0.08 }, { s: Math.min(10, d), coat: 'tin', desc: 'Havşa başlı cıvata' })); });
[6, 8, 12, 16].forEach((d) => { addM(T('rm' + d, 'Rayba Ø' + d + ' H7', 'Karbür · Z6', 'reamer', d, 6, 'K', 0.35, { fr: +(0.025 * d).toFixed(3) }, { s: d, coat: 'bright', desc: 'Hassas tolerans deliği' })); });
addM(T('bh40', 'Baralama Kafası Ø30–50', 'Hassas ince işlem', 'boring', 40, 1, 'I', 1, { fr: 0.08 }, { s: 0, desc: 'Ayarlanabilir çap' }));
addM(T('bk50', 'Kaba Baralama İkiz Ø40–55', 'İki kesicili', 'boring2', 48, 2, 'I', 0.9, { fr: 0.15 }, { s: 0, desc: 'Kaba delik büyütme' }));
([[3, 0.5], [4, 0.7], [5, 0.8], [6, 1], [16, 2], [20, 2.5]] as [number, number][]).forEach((a) => { addM(T('tpM' + a[0], 'Kılavuz M' + a[0] + '×' + fmtD(a[1]), 'HSS-E · helis kanallı', 'tap', a[0], 3, 'H', 0.5, { pitch: a[1] }, { s: Math.max(4, a[0]), coat: 'tin', desc: 'Kör delik' })); });
([[6, 1], [8, 1.25]] as [number, number][]).forEach((a) => { addM(T('tf' + a[0], 'Form (Ovalama) Kılavuz M' + a[0], 'HSS-E · talaşsız', 'tap', a[0], 0, 'H', 0.7, { pitch: a[1] }, { s: a[0], coat: 'tin', desc: 'Talaşsız diş · alüminyum / yumuşak çelik' })); });
([[0.25, 13.16, 1.337], [0.5, 20.96, 1.814]] as [number, number, number][]).forEach((a) => { addM(T('tg' + did(a[0]), 'Boru Dişi Kılavuz G' + (a[0] === 0.25 ? '1/4' : '1/2'), 'HSS-E · BSP 55°', 'tap', a[1], 4, 'H', 0.5, { pitch: a[2] }, { s: Math.round(a[1]), coat: 'tin', desc: 'Silindirik boru dişi' })); });
([[4, 'M4–M6', 0.03], [8, 'M8–M10', 0.035], [16, 'M20 ve üzeri', 0.05]] as [number, string, number][]).forEach((a) => { addM(T('tm' + a[0], 'Diş Frezesi ' + a[1], 'Karbür · tek profil', 'threadmill', a[0] === 16 ? 16 : a[0] * 0.75, 3, 'K', 0.7, { fz: a[2] }, { s: a[0] === 16 ? 16 : 6, coat: 'altin', desc: 'Helisel diş frezeleme' })); });
([[12.5, 6], [21, 10], [32, 18]] as [number, number][]).forEach((a) => { addM(T('ts' + did(a[0]), 'T-Kanal Frezesi Ø' + fmtD(a[0]), a[1] + ' mm kanal', 'tslot', a[0], 6, 'K', 0.6, { fz: 0.03 }, { s: Math.min(16, Math.round(a[0] * 0.8)), coat: 'altin', desc: 'T-kanal' })); });
([[16, 3], [25, 5]] as [number, number][]).forEach((a) => { addM(T('kw' + a[0], 'Kama Kanalı Frezesi Ø' + a[0] + '×' + a[1], 'Karbür · DIN 850', 'keyseat', a[0], 6, 'K', 0.6, { fz: 0.03 }, { s: 12, coat: 'altin', desc: 'Woodruff / iç kanal' })); });
MILL.forEach((t) => { t.lib = 'mill'; t.cat = t.cat || KCAT[t.kind] || 'tm_end'; });

const lseen: Record<string, 1> = {}; LATHE.forEach((t) => { lseen[t.id] = 1; });
function addL(t: Kalem): void { if (lseen[t.id]) return; lseen[t.id] = 1; LATHE.push(t); }
function LX(id: string, name: string, code: string, ins: string, kap: number, vm: number, fr: number, tags: string, desc: string): void { addL(T(id, name, code, 'lt_ext', 0, 0, 'I', vm, { fr: fr }, { ins: ins, kap: kap, tags: tags, desc: desc })); }
LX('ex_r4', 'Dış Çap Finiş (C)', 'PCLNR 2525 · CNMG 120404', 'C', 95, 1.15, 0.15, 'CNMG 80° · R0,4', 'Genel finiş');
LX('ex_d6', 'Dış Çap Kaba (D)', 'PDJNR 2525 · DNMG 150608', 'D', 93, 1, 0.28, 'DNMG 55° · R0,8', 'Profil kaba');
LX('ex_w', 'Dış Çap Kaba (W)', 'PWLNR 2525 · WNMG 080408', 'W', 95, 1, 0.3, 'WNMG 80° trigon · R0,8', 'Ekonomik kaba / alın');
LX('ex_t', 'Dış Çap (T)', 'PTGNR 2525 · TNMG 160408', 'T', 91, 1, 0.25, 'TNMG 60° · R0,8', 'Genel tornalama');
LX('ex_s75', 'Alın / Pah 75° (S)', 'PSBNR 2525 · SNMG 120408', 'S', 75, 1, 0.3, 'SNMG 90° · R0,8', 'Ağır kaba');
LX('ex_pos', 'Dış Çap Pozitif (D)', 'SDJCR 2020 · DCMT 11T304', 'D', 93, 1.1, 0.1, 'DCMT pozitif · R0,4', 'Küçük çap / ince parça');
LX('ex_rnd', 'Yuvarlak Uçlu Kopya', 'PRGCR 2525 · RCMT 1204', 'R', 90, 1, 0.25, 'RCMT Ø12', 'Radyüs / kopya');
LX('ex_v2', 'Kopyalama Negatif (V)', 'MVJNR 2525 · VNMG 160408', 'V', 93, 1.05, 0.15, 'VNMG 35° · R0,8', 'Derin profil');
function LB(id: string, name: string, code: string, ins: string, bar: number, vm: number, fr: number, tags: string, desc: string): void { addL(T(id, name, code, 'lt_bore', 0, 0, 'I', vm, { fr: fr }, { ins: ins, bar: bar, tags: tags, desc: desc })); }
LB('in_d', 'İç Çap Kaba (D)', 'S20S-PDUNR 11 · DNMG 110408', 'D', 2.0, 0.9, 0.18, 'Bar Ø20 · DNMG', 'İç profil kaba');
LB('in_c6', 'İç Çap Küçük (C)', 'S12M-SCLCR 06 · CCMT 060204', 'C', 1.2, 1, 0.08, 'Bar Ø12 · CCMT', 'Küçük delik');
LB('in_hm', 'Karbür Baralama Barı', 'A10K-SCLCR 06 · CCMT 060204', 'C', 1.0, 1, 0.06, 'Karbür bar Ø10 · 6×D', 'Uzun ve küçük delik');
LB('in_v', 'İç Kopyalama (V)', 'S25T-SVUBR 16 · VBMT 160404', 'V', 2.5, 1, 0.1, 'Bar Ø25 · VBMT', 'İç profil');
function LG(id: string, name: string, code: string, kind: string, vm: number, cut: KesmeVerisi, x?: Partial<Kalem>): void { addL(T(id, name, code, kind, 0, 0, 'I', vm, cut, x)); }
LG('grv2', 'Kanal Açma 2 mm', 'Dış kanal · 2,0 mm uç', 'lt_groove', 0.6, { fr: 0.05 }, { tags: 'Genişlik 2,0', desc: 'Segman kanalı' });
LG('grv4', 'Kanal Açma 4 mm', 'Dış kanal · 4,0 mm uç', 'lt_groove', 0.6, { fr: 0.08 }, { tags: 'Genişlik 4,0', desc: 'Geniş kanal / kaba' });
LG('igrv3', 'İç Kanal 3 mm', 'Bar Ø20 · 3,0 mm uç', 'lt_igroove', 0.55, { fr: 0.04 }, { bar: 2.0, tags: 'Genişlik 3,0', desc: 'İç segman kanalı' });
LG('fgrv3', 'Alın Kanalı 3 mm', 'Eksenel kanal · Ø40–60', 'lt_facegroove', 0.55, { fr: 0.04 }, { tags: 'Genişlik 3,0', desc: 'Alında dairesel kanal' });
LG('cut2', 'Kesme 2 mm', 'Kesme bıçağı · 2,0 mm', 'lt_part', 0.55, { fr: 0.04 }, { tags: 'Genişlik 2,0', desc: 'Küçük çap kesme' });
LG('cut4', 'Kesme 4 mm', 'Kesme bıçağı · 4,0 mm', 'lt_part', 0.55, { fr: 0.07 }, { tags: 'Genişlik 4,0', desc: 'Büyük çap kesme' });
LG('thr2', 'Dış Diş M2,0', 'SER 2525 · 16ER 2,0 ISO', 'lt_thread', 0.6, { pitch: 2 }, { tags: 'Adım 2,0 · 60°', desc: 'Dış metrik diş' });
LG('thrA', 'Dış Diş Kısmi Profil', 'SER 2525 · 16ER A60', 'lt_thread', 0.6, { pitch: 1.5 }, { tags: 'Adım 0,5–1,5 · 60°', desc: 'Farklı adımlar için tek uç' });
LG('thrW', 'Dış Diş Whitworth', 'SER 2525 · 16ER 14W', 'lt_thread', 0.6, { pitch: 1.814 }, { tags: '14 diş/inç · 55°', desc: 'BSP boru dişi' });
LG('ithr1', 'İç Diş M1,0', 'SIR 0012 · 11IR 1,0 ISO', 'lt_ithread', 0.55, { pitch: 1 }, { bar: 1.2, tags: 'Adım 1,0 · 60°', desc: 'Küçük iç diş' });
LG('knurl', 'Tırtıl Çekme', 'Bastırma · RAA / RGE 1,0', 'lt_knurl', 0.3, { fr: 0.1 }, { tags: 'Adım 1,0', desc: 'Kavrama yüzeyi' });
[16, 25, 32, 40].forEach((d) => { addL(T('ud' + d, 'U-Matkap Ø' + d, (d < 20 ? '2×D' : '3×D') + ' · WCMX', 'lt_udrill', d, 2, 'I', 0.7, { fr: 0.08 }, { desc: 'Dolu malzemede delik' })); });
addL(T('lcd', 'Merkez Matkabı A3,15', 'Eksenel tutucu · DIN 333', 'center', 3.15, 2, 'H', 0.8, { fr: 0.04 }, { s: 8, coat: 'tin', desc: 'Punta deliği' }));
addL(T('ldr14', 'Matkap Ø14 Karbür', 'Eksenel tutucu · 3×D', 'drill', 14, 2, 'K', 0.55, { fr: 0.25 }, { s: 14, ld: 3, coat: 'altin', desc: 'Eksenel delik' }));
addL(T('ldr20', 'Matkap Ø20 HSS', 'Eksenel tutucu · MK2', 'drill', 20, 2, 'H', 1, { fr: 0.25 }, { s: 20, ld: 4, coat: 'tin', desc: 'Büyük eksenel delik' }));
LATHE.forEach((t) => {
  t.lib = 'lathe';
  if (t.cat) return;
  t.cat = t.kind === 'lt_ext' ? 'tl_ext' : (t.kind === 'lt_bore' ? 'tl_int' : (/groove|part|thread|knurl/.test(t.kind) ? 'tl_grv' : 'tl_hole'));
});

/* ---------- kesici uçlar (sarf stok) ---------- */
function IN(id: string, name: string, code: string, shape: string, ic: number, coatc: string, tags: string, desc: string): Kalem { return it(id, name, code, 'insert', tags, desc, { shape: shape, ic: ic, coat: coatc }); }
export const INSERTS: Kalem[] = [
  IN('i_cnmg8', 'CNMG 120408-PM', 'Negatif · 80° · R0,8', 'C', 1.27, 'tin', 'Çelik kaba', 'PCLNR tutucu'),
  IN('i_cnmg4', 'CNMG 120404-PF', 'Negatif · 80° · R0,4', 'C', 1.27, 'tin', 'Çelik finiş', 'PCLNR tutucu'),
  IN('i_dnmg8', 'DNMG 150608-PM', 'Negatif · 55° · R0,8', 'D', 1.27, 'tin', 'Profil kaba', 'PDJNR tutucu'),
  IN('i_dnmg4', 'DNMG 110404-PF', 'Negatif · 55° · R0,4', 'D', 0.95, 'tin', 'Profil finiş', 'PDJNR tutucu'),
  IN('i_wnmg', 'WNMG 080408-PM', 'Negatif · trigon · R0,8', 'W', 1.27, 'tin', 'Ekonomik kaba', 'PWLNR tutucu'),
  IN('i_tnmg', 'TNMG 160408-PM', 'Negatif · 60° · R0,8', 'T', 0.95, 'tin', 'Genel', 'PTGNR tutucu'),
  IN('i_snmg', 'SNMG 120408-PR', 'Negatif · 90° · R0,8', 'S', 1.27, 'tin', 'Ağır kaba / alın', 'PSSNR / PSBNR'),
  IN('i_vbmt', 'VBMT 160404-PF', 'Pozitif · 35° · R0,4', 'V', 0.95, 'tin', 'Kopya finiş', 'SVJBR tutucu'),
  IN('i_vnmg', 'VNMG 160408-PM', 'Negatif · 35° · R0,8', 'V', 0.95, 'tin', 'Derin profil', 'MVJNR tutucu'),
  IN('i_dcmt', 'DCMT 11T304-PF', 'Pozitif · 55° · R0,4', 'D', 0.95, 'tin', 'Küçük çap / iç', 'SDJCR / SDUCR'),
  IN('i_ccmt', 'CCMT 09T304-PF', 'Pozitif · 80° · R0,4', 'C', 0.95, 'tin', 'İç çap', 'SCLCR tutucu'),
  IN('i_rcmt', 'RCMT 1204M0', 'Yuvarlak Ø12', 'R', 1.2, 'tin', 'Kopya / radyüs', 'PRGCR tutucu'),
  IN('i_nmg_al', 'CCGT 09T304-AL', 'Pozitif · parlatılmış', 'C', 0.95, 'bright', 'Alüminyum', 'Keskin ağız'),
  IN('i_cer', 'CNGA 120408 Seramik', 'Sert tornalama', 'C', 1.27, 'cer', 'Sertleştirilmiş çelik', 'Kuru kesme'),
  IN('i_apkt', 'APKT 1604PDER', 'Freze · 90° omuz', 'A', 1.0, 'black', 'Köşe / alın frezesi', 'Ø40–80'),
  IN('i_apkt10', 'APKT 1003PDER', 'Freze · 90° omuz · küçük', 'A', 0.7, 'black', 'Uçlu köşe frezesi', 'Ø16–32'),
  IN('i_sekt', 'SEKT 1204AFSN', 'Freze · 45° alın', 'S', 1.27, 'black', '45° alın frezesi', 'Ø50–125'),
  IN('i_lnmu', 'LNMU 0303ZER', 'Yüksek ilerleme', 'S', 0.7, 'black', 'HFM uçlu', 'Ø25–52'),
  IN('i_rdmt', 'RDMT 10T3M0', 'Freze · yuvarlak', 'R', 1.0, 'black', 'Kopya frezesi', 'Ø20–40'),
  IN('i_wcmx', 'WCMX 030208', 'U-matkap ucu', 'W', 0.6, 'tin', 'U-matkap Ø16–25', 'İç / dış uç'),
  IN('i_16er15', '16ER 1,5 ISO', 'Dış diş · 60°', 'T', 0.95, 'tin', 'Metrik diş', 'SER tutucu'),
  IN('i_16ir15', '16IR 1,5 ISO', 'İç diş · 60°', 'T', 0.95, 'tin', 'Metrik iç diş', 'SNR tutucu'),
  IN('i_grv3', 'Kanal Ucu 3,0 mm', 'Kanal / kesme · R0,2', 'G', 1, 'tin', 'Kanal açma', 'Dış kanal tutucu'),
  IN('i_cut2', 'Kesme Ucu 2,0 mm', 'Kesme · nötr', 'G', 1, 'tin', 'Parça kesme', 'Kesme bıçağı')
];

/* ---------- torna takım tutucuları ---------- */
function LH(id: string, name: string, code: string, v: string, tags: string, desc: string): Kalem { return it(id, name, code, 'lholder', tags, desc, { v: v, shelf: 'h_lathe' }); }
export const LHOLD: Kalem[] = [
  LH('lh_vdi30r', 'VDI30 Radyal Tutucu Sağ', 'DIN 69880 · B1 · 20×20', 'vdi_rad', 'Dış kalem', 'Taret radyal'),
  LH('lh_vdi30l', 'VDI30 Radyal Tutucu Sol', 'DIN 69880 · B2 · 20×20', 'vdi_rad', 'Dış kalem', 'Taret radyal'),
  LH('lh_vdi40r', 'VDI40 Radyal Tutucu', 'DIN 69880 · B1 · 25×25', 'vdi_rad', 'Dış kalem', 'Taret radyal'),
  LH('lh_vdi30a', 'VDI30 Eksenel ER25', 'DIN 69880 · E2', 'vdi_ax', 'Matkap / kılavuz', 'Eksenel pens'),
  LH('lh_vdi40a', 'VDI40 Eksenel ER32', 'DIN 69880 · E2', 'vdi_ax', 'Matkap / kılavuz', 'Eksenel pens'),
  LH('lh_vdi30b', 'VDI30 Baralama Ø25', 'DIN 69880 · E1', 'vdi_bore', 'Baralama barı', 'Bar + redüksiyon'),
  LH('lh_vdi40b', 'VDI40 Baralama Ø32', 'DIN 69880 · E1', 'vdi_bore', 'Baralama barı', 'Bar + redüksiyon'),
  LH('lh_vdi40u', 'VDI40 U-Matkap Ø32', 'İçten soğutmalı', 'udrillh', 'U-matkap', 'Ayarlanabilir merkez'),
  LH('lh_bmt', 'BMT65 Kalem Tutucu', 'Cıvatalı taret', 'bmt', 'Dış kalem 25×25', 'Yüksek rijitlik'),
  LH('lh_bmtb', 'BMT65 Baralama Tutucu Ø40', 'Cıvatalı taret', 'bmt', 'Baralama', 'Büyük bar'),
  LH('lh_liveA', 'Canlı Takım Eksenel ER25', 'VDI / BMT · 1:1', 'live_ax', 'Freze / matkap', 'Alın delik / frezeleme'),
  LH('lh_liveR', 'Canlı Takım Radyal ER25', 'VDI / BMT · 1:1', 'live_rad', 'Freze / matkap', 'Çap delik / frezeleme'),
  LH('lh_sl3216', 'Redüksiyon Burcu Ø32 → Ø16', 'Yarıklı · soğutmalı', 'sleeve', 'Bar küçültme', 'Baralama tutucusu'),
  LH('lh_sl3220', 'Redüksiyon Burcu Ø32 → Ø20', 'Yarıklı · soğutmalı', 'sleeve', 'Bar küçültme', 'Baralama tutucusu'),
  LH('lh_sl2512', 'Redüksiyon Burcu Ø25 → Ø12', 'Yarıklı · soğutmalı', 'sleeve', 'Bar küçültme', 'Baralama tutucusu')
];

/* ---------- bağlama / ölçüm / sarf ek ---------- */
FIX.mill.push(it('cvise', '5 Eksen Merkezleyici Mengene', 'Kendinden merkezli · 125', 'f_cvise', 'Yükseltilmiş', '5 eksen erişimi, az bağlama payı'), it('tomb', 'Bağlama Kulesi (Tombstone)', '4 yüz · çoklu mengene', 'f_tomb', 'Çoklu parça', 'Yatay / döner tabla'), it('angle', 'Gönye / Açı Plakası', 'Döküm · 250×200', 'f_angle', 'Dik yüzey bağlama', '90° bağlama'), it('vblock', 'V-Blok Çifti', 'Ø5–100 · klempli', 'f_vblock', 'Mil bağlama', 'Silindirik parça frezeleme'));
FIX.lathe.push(it('ch6', '6 Ayaklı Ayna', 'Ø210 · ince cidar', 'f_ch6', 'Hassas / ince cidar', 'Deformasyon az'), it('mandrel', 'Genleşen Mandrel', 'Ø20–60', 'f_mandrel', 'İçten bağlama', 'Burç / halka dış çap işleme'), it('drive', 'Alın Tahrikli Punta', 'Punta + tahrik dişleri', 'f_drive', 'Mil boyu işleme', 'Tek bağlamada tüm çap'));
JAWS.mill.push(it('j_grip', 'Tırnaklı (Grip) Çene', '5 eksen · 3 mm tutuş', 'j_grip', 'Az bağlama payı', 'Ham malzemeyi tırnakla tutar'));
ZERO.mill.push(it('z_laser', 'Lazer Takım Ölçümü', 'Temassız · boy / çap / kırık', 'z_laser', 'Otomatik takım ofseti', 'Takım kırık kontrolü'), it('z_tset', 'Takım Ölçüm Probu (Masa)', 'Temaslı · boy / çap', 'z_tset', 'Otomatik takım ofseti', 'Tezgâh içi ölçüm'));

export const LIVE: Kalem[] = ['em8', 'em6', 'em10', 'bm6', 'dr68', 'dr85', 'sp10', 'tpM8', 'tpM10', 'ch12'].map((id) => {
  const src = MILL.find((t) => t.id === id);
  if (!src) throw new Error(`Canlı takımın kaynağı yok: ${id}`);
  return Object.assign({}, src, { id: 'lv_' + id, name: src.name + ' (canlı)', live: true, code: 'Canlı takım · ER25', lib: 'lathe', cat: 'tl_hole' });
});

function G(id: string, name: string, code: string, g: string, tags: string, desc: string): Kalem { return it(id, name, code, 'gauge', tags, desc, { g: g }); }
export const GAUGES: Kalem[] = [
  G('g_cal', 'Dijital Kumpas 0–150', '0,01 mm', 'g_cal', 'Genel ölçüm', 'Boy, çap, derinlik'),
  G('g_mic', 'Dış Çap Mikrometresi 0–25', '0,001 mm', 'g_mic', 'Hassas dış çap', 'Toleranslı çaplar'),
  G('g_mic2', 'Dış Çap Mikrometresi 25–50', '0,001 mm', 'g_mic', 'Hassas dış çap', 'Toleranslı çaplar'),
  G('g_bore', 'İç Çap Mikrometresi', '3 noktalı', 'g_bore', 'Delik çapı', 'H7 delikler'),
  G('g_dial', 'Komparatör + Manyetik Ayak', '0,01 mm', 'g_dial', 'Salgı / düzlem', 'Bağlama kontrolü'),
  G('g_height', 'Yükseklik Mihengiri', 'Dijital · 300 mm', 'g_height', 'Markalama / yükseklik', 'Pleyt üzerinde'),
  G('g_plug', 'Tampon Mastar H7', 'Geçer / Geçmez', 'g_plug', 'Delik kontrolü', 'Seri kontrol'),
  G('g_thread', 'Diş Tampon Mastarı 6H', 'M8 · M10 · M12', 'g_thread', 'Diş kontrolü', 'Geçer / geçmez'),
  G('g_rough', 'Yüzey Pürüzlülük Cihazı', 'Ra / Rz', 'g_rough', 'Yüzey kalitesi', 'Finiş kontrolü')
];
function C(id: string, name: string, code: string, mode: string, color: number, tags: string, desc: string): Kalem { return it(id, name, code, 'cons', tags, desc, { mode: mode, color: color }); }
export const CONS: Kalem[] = [
  C('c_bor', 'Bor Yağı Konsantresi', '20 L bidon', 'bottle', 0xf2f2e8, 'Soğutma sıvısı', 'Tank takviyesi'),
  C('c_kes', 'Kesme Yağı', '5 L', 'bottle', 0xd9a032, 'Saf yağ', 'Kılavuz / rayba'),
  C('c_kiz', 'Kızak Yağı', 'ISO VG 68', 'bottle', 0x6b7b2a, 'Tezgâh yağı', 'Seviye kontrolü'),
  C('c_kil', 'Kılavuz Çekme Yağı', 'Sprey', 'spray', 0x2f80ed, 'Diş açma', 'Manuel kılavuz'),
  C('c_bez', 'Temizlik Bezi / Üstübü', 'Paket', 'rag', 0xd9d2c0, 'Temizlik', 'Tabla / parça temizliği'),
  C('c_cap', 'Çapak Alma Bıçağı', 'Döner uçlu', 'deburr', 0x2f6fd0, 'Çapak', 'Kenar çapakları'),
  C('c_ege', 'Eğe Seti', 'Yassı / yarım yuvarlak', 'file', 0x333333, 'Çapak / uyum', 'Manuel düzeltme'),
  C('c_zim', 'Zımpara P120–P400', 'Tabaka', 'paper', 0xa8784a, 'Yüzey', 'Kenar kırma / parlatma'),
  C('c_pas', 'Pas Önleyici Sprey', '400 ml', 'spray', 0xe38b2c, 'Koruma', 'İşlenmiş yüzeyler'),
  C('c_eld', 'İş Eldiveni', 'Kesilmeye dayanıklı', 'glove', 0xe0702a, 'İSG', 'Talaş / keskin kenar'),
  C('c_goz', 'Koruyucu Gözlük', 'EN 166', 'glasses', 0x8fd0ff, 'İSG', 'Talaş sıçraması'),
  C('c_kal', 'Markalama Kalemi', 'Metal işaretleme', 'marker', 0xd64545, 'İşaretleme', 'Parça / takım etiketi')
];

GAUGES.push(
  G('g_cal300', 'Dijital Kumpas 0–300', '0,01 mm', 'g_cal', 'Büyük ölçüler', 'Uzun parça'),
  G('g_mic3', 'Dış Çap Mikrometresi 50–75', '0,001 mm', 'g_mic', 'Hassas dış çap', 'Toleranslı çaplar'),
  G('g_depth', 'Derinlik Mikrometresi 0–100', '0,01 mm · değişken çubuk', 'g_depth', 'Cep / kademe derinliği', 'Hassas derinlik'),
  G('g_ring', 'Halka Mastar Ø20 h6', 'Geçer / Geçmez', 'g_ring', 'Mil kontrolü', 'Seri kontrol'),
  G('g_tring', 'Diş Halka Mastarı M10 6g', 'Geçer / Geçmez', 'g_tring', 'Dış diş kontrolü', 'Cıvata / mil dişi'),
  G('g_block', 'Blok Mastar Seti 47 Parça', 'Kalite 1 · çelik', 'g_block', 'Kalibrasyon / ayar', 'Ölçü aleti kontrolü'),
  G('g_pin', 'Pim Mastar Seti 1–10 mm', '0,01 adım', 'g_pin', 'Delik ölçme', 'Hızlı delik kontrolü'),
  G('g_radius', 'Radyüs Mastarı R1–R7', 'İç / dış', 'g_radius', 'Radyüs kontrolü', 'Köşe ve kavis'),
  G('g_feeler', 'Sentil Seti 0,05–1 mm', '20 yaprak', 'g_feeler', 'Boşluk ölçme', 'Aralık / hizalama'),
  G('g_prot', 'Açı Gönyesi (İletki)', '0–180° · 5\'', 'g_prot', 'Açı kontrolü', 'Pah / eğim'),
  G('g_hard', 'Sertlik Ölçüm Cihazı', 'Rockwell HRC / HRB', 'g_hard', 'Isıl işlem kontrolü', 'Malzeme sertliği')
);
CONS.push(
  C('c_hyd', 'Hidrolik Yağ', 'ISO VG 46 · 20 L', 'bottle', 0xb3462e, 'Tezgâh yağı', 'Hidrolik ünite'),
  C('c_spn', 'İş Mili Yağı', 'ISO VG 10 · 5 L', 'bottle', 0x4a7fc0, 'Tezgâh yağı', 'Yağlama ünitesi'),
  C('c_gres', 'Gres Kartuşu', 'NLGI 2 · 400 g', 'cart', 0x3d6b38, 'Yağlama', 'Merkezi yağlama'),
  C('c_flt', 'Bor Yağı Filtresi', 'Kartuş · 25 µm', 'filter', 0xe8e2cc, 'Filtre', 'Soğutma sıvısı temizliği'),
  C('c_mist', 'Yağ Buharı Filtresi', 'Kaset · H13', 'filter', 0xd7dde3, 'Filtre', 'Buhar emici'),
  C('c_ped', 'Yağ Emici Ped', '50 adet', 'ped', 0xf4f4f0, 'Temizlik', 'Sızıntı / döküntü'),
  C('c_solv', 'Yağ Çözücü / Temizleyici', 'Sprey · 500 ml', 'spray', 0x6fbf73, 'Temizlik', 'Parça yağ alma'),
  C('c_boya', 'Markalama Boyası', 'Mavi · 450 ml', 'can', 0x2f5fd0, 'İşaretleme', 'Çizerek markalama'),
  C('c_fir', 'Tel Fırça', 'Çelik tel', 'brush', 0x9a6a3a, 'Temizlik', 'Talaş / pas'),
  C('c_kul', 'Kulak Tıkacı', 'SNR 33 dB', 'plugs', 0xe0702a, 'İSG', 'Gürültü'),
  C('c_nit', 'Nitril Eldiven', '100 adet', 'glove', 0x3a6fd8, 'İSG', 'Yağ / kimyasal'),
  C('c_pasta', 'Kesme Macunu', 'Kılavuz / rayba · 500 g', 'can', 0x8a6a2a, 'Diş açma', 'Zor malzemede kılavuz')
);

export const LOAD: Record<TezgahTuru, string[]> = {
  mill: ['fm63', 'em16', 'em10', 'em6', 'bm6', 'cr12', 'sp10', 'dr68', 'dr85', 'dr102', 'tpM8', 'tpM10', 'tpM12', 'ch12', 'rm10'],
  lathe: ['ex_r', 'ex_f', 'in_r', 'in_f', 'grv', 'cut', 'thr', 'ithr', 'ud20', 'lsp', 'ldr', 'lv_em8'],
  millturn: ['ex_r', 'ex_f', 'ex_cp', 'in_r', 'in_f', 'grv', 'cut', 'thr', 'em12', 'em8', 'bm6', 'sp10', 'dr85', 'tpM10', 'ch12']
};

/* ---------- TUTUCU KATALOĞU (magazin ihtiyacından da türetilir) ---------- */
export const TAPERS: { k: string; t: string }[] = [{ k: 'hsk', t: 'HSK-A63' }, { k: 'hsk100', t: 'HSK-A100' }, { k: 'bt40', t: 'BT40' }, { k: 'sk40', t: 'SK40' }, { k: 'bt50', t: 'BT50' }, { k: 'capto', t: 'Capto C6' }];
const HT_NAME: Record<string, string> = { shrink: 'Shrink-fit Tutucu', hyd: 'Hidrolik Mandren', weldon: 'Weldon Tutucu', mchuck: 'Güçlü Freze Mandreni', er: 'ER32 Pens Tutucu', er16: 'ER16 Pens Tutucu (ince)', er25: 'ER25 Pens Tutucu', er40: 'ER40 Pens Tutucu', arbor: 'Malafa (Kabuk Freze)', arbord: 'Disk Freze Malafası', tap: 'Senkron Kılavuz Tutucu', mt: 'Mors Konik Adaptör MK2/MK3', boringh: 'Baralama Başlığı Adaptörü' };
const HT_ORD: Record<string, number> = { shrink: 1, hyd: 2, mchuck: 3, weldon: 4, er16: 5, er25: 6, er: 7, er40: 8, arbor: 9, arbord: 10, tap: 11, mt: 12, boringh: 13, lathe: 14 };
function sized(ht: string): boolean { return ht === 'shrink' || ht === 'hyd' || ht === 'weldon' || ht === 'mchuck'; }
function tk(taper: string): string | null { return TAPERS.find((x) => x.t === taper)?.k ?? null; }
export function holderId(taper: string, ht: string, s?: number): string | null { const k = tk(taper); if (!k || !HT_NAME[ht]) return null; return 'h_' + k + '_' + ht + (sized(ht) ? '_' + String(s).replace('.', '_') : ''); }
export const HOLDERS: Kalem[] = [];
const seenH: Record<string, 1> = {};
function addHolder(tp: { k: string; t: string }, ht: string, s?: number): void {
  const id = holderId(tp.t, ht, s); if (!id || seenH[id]) return; seenH[id] = 1;
  HOLDERS.push({ id: id, name: HT_NAME[ht] + (sized(ht) ? ' Ø' + fmtD(s) : ''), code: tp.t + (sized(ht) ? ' · Ø' + fmtD(s) + ' sap' : ''), kind: 'holder', taper: tp.t, ht: ht, dia: sized(ht) ? s : 10, d: sized(ht) ? s : 0, tags: tp.t, desc: 'Takım tutucu', shelf: 'h_' + tp.k });
}
TAPERS.forEach((tp) => {
  [3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25].forEach((d) => { addHolder(tp, 'shrink', d); });
  [6, 8, 10, 12, 16, 20, 25, 32].forEach((d) => { addHolder(tp, 'hyd', d); });
  [20, 32].forEach((d) => { addHolder(tp, 'mchuck', d); });
  [6, 8, 10, 12, 16, 20, 25, 32, 40].forEach((d) => { addHolder(tp, 'weldon', d); });
  ['er16', 'er25', 'er', 'er40', 'arbor', 'arbord', 'tap', 'mt', 'boringh'].forEach((h) => { addHolder(tp, h); });
  MILL.forEach((t) => { addHolder(tp, htype(t), t.s || t.d); });
});
HOLDERS.push({ id: 'h_capto_lathe', name: 'Capto C6 Torna Adaptörü', code: 'Capto C6 · kalem tutucu', kind: 'holder', taper: 'Capto C6', ht: 'lathe', dia: 10, d: 0, tags: 'Capto C6', desc: 'Torna-frezede torna kalemi için', shelf: 'h_capto' });
HOLDERS.sort((a, b) => {
  const sa = a.shelf ?? '', sb = b.shelf ?? '';
  return sa < sb ? -1 : sa > sb ? 1 : ((HT_ORD[a.ht ?? ''] ?? 0) - (HT_ORD[b.ht ?? ''] ?? 0)) || ((a.dia ?? 0) - (b.dia ?? 0));
});
export const D = { TOOL_CATS, INSERTS, LHOLD, TAPERS, HOLDERS, holderId, ISO, MACHINES, MATERIALS, FIX, JAWS, ZERO, WCS, COOL, EMPTY, MILL, LATHE, LIVE, GAUGES, CONS, LOAD, TM };
export type CncVerisi = typeof D;

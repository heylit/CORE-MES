import type { Db } from '#cekirdek/db.ts';
import { bagimliKayit, bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kapsamdaMi, kapsamDisiysaReddet, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Kapsam } from '#cekirdek/kapsam.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  IkAlani, IkAyarCevabi, IkBen, IkBordroGirdisi, IkGecmis, IkIzinGunuCevabi, IkKayit, IkKisiVardiyasiCevabi, IkOzetiCevabi, IkPuantajCevabi, IkPuantajGunuGirdisi, IkPuantajKaydi,
  IkPuantajPlanGunu, IkPuantajYazCevabi, IkTopluCevabi, IkTuru, IkVeriCevabi, IkYazCevabi, PuantajDurumu,
} from '#paylasilan/sozlesme/ik.ts';
import { tesisGunBasi, tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { isMerkezleri, kisininIzinliIsMerkezleri } from '../istasyonlar/disari.ts';
import { kisiAdlari, kisiSecenekleri } from '../kisiler/disari.ts';
import { ayarKur, ayarParcala } from './ayar-eslesme.ts';
import { EslesmeHatasi, kur, parcala } from './eslesme.ts';
import type { Deger, Satirlar } from './eslesme.ts';
import type { Govde, IzinUcu, KuralHatasi } from './kurallar.ts';
import {
  EKIP_ALANLARI, FAZLA_MESAI_TURLERI, IS_GUNU_IZIN_TURLERI, GIZLI_AYARLAR, IK_ALANLARI, IK_YAZMA_ISLEMLERI, ILETISIM_ALANLARI, YONETICI_ALANLARI, alanlariSec, ayarDegisikligiDenetle,
  bordroKaydi, bordroKimligi, bordroOnayDenetle, boyutDenetle, bugunIzindekiler, degisiklikler, devamGorunurMu, devamOnayDenetle, devamOnayiKur, ekipKimlikleri, enErkenDonemBaslangici, etiket, govdeKimligiDenetle, ikRolu,
  iletisimDenetle, istemciAlanlariniAyikla, kimlikIbanDenetle, izinGecisiDenetle, izinGunuDenetle, izinIcerigiDegistiMi, izinIsGunu, katilimciIsMerkezleri, kayitIsMerkezi, kesinlestirmeDenetle, personelBul,
  ozelVeriDenetle, ozelVeriyiAyikla, ozelVeriyiKoru, OZEL_VERI_ISLEMI, gecmisteGizliMi, pozisyonGecisiDenetle, turDenetle, ucretDenetle, yillikMesaiSiniri,
  calismaAraligi, calismaHesabi, cikisZimmetUyarisi, fazlaTuru, izinOnayBildirimi, haftalikVardiyaPlani, puantajGunuDenetle, puantajKilidiDenetle, puantajTarihiDenetle,
} from './kurallar.ts';
import type { GunPlani, VardiyaMatrisSatiri, VardiyaTanimi } from './kurallar.ts';
import { gunMetni, motorGunu, motorKur } from '#paylasilan/ik-motor/arayuz.ts';
import { TUR_TANIMLARI } from './sema.ts';
import * as s from './sorgular.ts';

const GECMIS_SINIRI = 1000;

function firlat(h: KuralHatasi | null): void {
  if (h === null) return;
  if (h.kod === 'YETKI_YOK') throw yetkiYok(h.mesaj);
  if (h.kod === 'DOGRULAMA') throw dogrulama(h.mesaj, h.alan);
  if (h.kod === 'CAKISMA') throw cakisma(h.mesaj);
  throw gecersiz(h.mesaj);
}

export function bugun(simdi: Date = new Date()): string {
  return tesisGunu(simdi);
}

/* ---------------- kayıtlar ---------------- */

interface Kayit {
  tur: IkTuru;
  kimlik: string;
  surum: number;
  iptal: boolean;
  govde: Govde;
  ek: Record<string, Deger>;
}

function kayitKur(r: s.KayitSatiri): Kayit {
  return {
    tur: r.tur, kimlik: r.kimlik, surum: r.surum, iptal: r.iptal, ek: r.ek,
    // IK-23: kayıt zamanı sunucunun sütunlarından.
    govde: { ...kur(TUR_TANIMLARI[r.tur], r.kimlik, r.ana, r.altlar), createdAt: r.olusturma, updatedAt: r.guncelleme },
  };
}
// IK-73: özel veri yetkisi olmayan kişiye başkasının personel kartı kan grubu ve engel durumu olmadan döner.
interface Gorunum { ozelGorur: boolean; ben: { personelKimlik: string | null } }
const kayitCevabi = (k: Kayit, g: Gorunum): IkKayit => ({
  kimlik: k.kimlik, tur: k.tur, surum: k.surum, govde: k.tur === 'emp' && !g.ozelGorur && k.kimlik !== g.ben.personelKimlik ? ozelVeriyiAyikla(k.govde) : k.govde,
});

function ayrisitir(tur: IkTuru, govde: Govde): Satirlar {
  try {
    return parcala(TUR_TANIMLARI[tur], govde);
  } catch (e) {
    if (e instanceof EslesmeHatasi) throw dogrulama(e.message, e.alan);
    throw e;
  }
}

interface Durum {
  kayitlar: Kayit[];
  harita: Map<string, Kayit>;
  ben: IkBen;
  ekip: Set<string>;
  kapsam: Kapsam;
  ozelGorur: boolean;
}

const etkinler = (d: { kayitlar: Kayit[] }, tur: IkTuru): Kayit[] => d.kayitlar.filter((k) => k.tur === tur && !k.iptal);

async function durumOku(db: Db, kullanici: Kullanici): Promise<Durum> {
  const kayitlar = (await s.kayitlar(db)).map(kayitKur);
  // IK-44: güncel kesinleştirmesi onaylanmış bordro onay zamanını taşır (yalnız okuma alanı; yazmada kullanılmaz).
  const onaylar = await s.gecerliBordroOnaylari(db);
  for (const k of kayitlar) {
    const zaman = k.tur === 'pay' ? onaylar.get(k.kimlik) : undefined;
    if (zaman !== undefined) k.govde['gordum'] = zaman;
  }
  const harita = new Map(kayitlar.map((k) => [k.kimlik, k]));
  const personeller = etkinler({ kayitlar }, 'emp').map((k) => k.govde);
  // Karar 2 (08.10.2026): kişi, personel kartındaki "TMI kullanıcısı" alanıyla eşleşir (IK-25).
  const personelKimlik = personelBul(personeller, kullanici.id);
  const ekip = ekipKimlikleri(personeller, etkinler({ kayitlar }, 'dept').map((k) => k.govde), personelKimlik);
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  return {
    kayitlar, harita, kapsam, ekip, ozelGorur: kullanici.islemler.includes(OZEL_VERI_ISLEMI),
    ben: {
      kisi: { id: kullanici.id, ad: kullanici.ad },
      rol: ikRolu(kullanici.islemler, ekip.size > 0),
      personelKimlik,
      saltOkunur: !IK_YAZMA_ISLEMLERI.some((i) => kullanici.islemler.includes(i as never)),
      secenekler: { kisiler: [], isMerkezleri: [] },
    },
  };
}

/* ---------------- iş merkezi kapsamı: IK-27 ---------------- */

const bulucu = (harita: ReadonlyMap<string, Kayit>) => (kimlik: string): Govde | null => harita.get(kimlik)?.govde ?? null;

function kapsamdaGorunurMu(k: Kayit, d: Durum): boolean {
  if (k.tur === 'train') { const m = katilimciIsMerkezleri(k.govde, bulucu(d.harita)); return m.length === 0 || m.some((x) => kapsamdaMi(d.kapsam, x)); }
  return kapsamdaMi(d.kapsam, kayitIsMerkezi(k.tur, k.govde, bulucu(d.harita)));
}
function kapsamDenetle(tur: IkTuru, g: Govde, d: Durum): void {
  if (tur === 'train') { for (const m of katilimciIsMerkezleri(g, bulucu(d.harita))) kapsamDisiysaReddet(d.kapsam, m); return; }
  kapsamDisiysaReddet(d.kapsam, kayitIsMerkezi(tur, g, bulucu(d.harita)));
}

/* ---------------- okuma ---------------- */

async function gecmisCevaplari(db: Db, satirlar: readonly s.GecmisSatiri[], { harita, ozelGorur }: { harita: ReadonlyMap<string, Kayit>; ozelGorur: boolean }): Promise<IkGecmis[]> {
  const adlar = await kisiAdlari(db, satirlar.map((g) => g.kisiId));
  const coz = (v: string | null): unknown => (v === null ? null : JSON.parse(v) as unknown);
  return satirlar.map((g) => {
    const silinen = g.islem === 'sil' && g.kimlik ? harita.get(g.kimlik) : undefined;
    return {
      id: `gecmis_${g.no}`, kind: 'log', t: g.zaman, by: { id: g.kisiId, name: adlar.get(g.kisiId) ?? '', role: '' },
      op: g.islem, rk: g.tur, rid: g.kimlik ?? '', label: g.etiket,
      changes: g.alanlar.map((a) => (gecmisteGizliMi(a.alan) ? { f: a.alan, big: true, gizli: true } : a.buyuk ? { f: a.alan, big: true } : { f: a.alan, from: coz(a.onceki), to: coz(a.sonraki) })),
      // Silinen kayıt satırında durur (iptal): geri getirmek için güncel hali.
      snap: silinen && silinen.iptal ? (silinen.tur === 'emp' && !ozelGorur ? ozelVeriyiAyikla(silinen.govde) : silinen.govde) : null,
      ...(g.notu ? { note: g.notu } : {}),
    };
  });
}

async function secenekler(db: Db, d: Durum): Promise<IkBen['secenekler']> {
  if (d.ben.rol !== 'ik') return { kisiler: [], isMerkezleri: [] };
  const merkezler = (await isMerkezleri(db, { pasiflerDahil: false })).filter((m) => kapsamdaMi(d.kapsam, m.id));
  const kisiler = await kisiSecenekleri(db);
  return { kisiler, isMerkezleri: merkezler.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad })) };
}

export async function benGetir(db: Db, kullanici: Kullanici): Promise<IkBen> {
  const d = await durumOku(db, kullanici);
  return { ...d.ben, secenekler: await secenekler(db, d) };
}

async function ayarGovdesi(db: Db): Promise<{ govde: Govde | null; surum: number | null }> {
  const a = await s.ayarlariOku(db);
  return { govde: ayarKur(a), surum: a.surum };
}

// IK-21: İK kendi iş merkezi kapsamındaki kayıtları görür (IK-27); öteki kişi kendi kaydını, ekibini (süzülmüş) ve yöneticisinin adını.
export async function veriGetir(db: Db, kullanici: Kullanici): Promise<IkVeriCevabi> {
  const d = await durumOku(db, kullanici);
  const ayar = await ayarGovdesi(db);
  const ben = { ...d.ben, secenekler: await secenekler(db, d) };
  const etkin = d.kayitlar.filter((k) => !k.iptal);
  if (ben.rol === 'ik') {
    // IK-51: geçmiş de kapsamla süzülür; kayda bağlı olmayan satır (ayarlar, toplu kesinleştirme özeti) kişisel değer taşımaz.
    const gecmis = (await s.gecmis(db, GECMIS_SINIRI)).filter((g) => {
      if (g.kimlik === null) return true;
      const k = d.harita.get(g.kimlik);
      return k !== undefined && kapsamdaGorunurMu(k, d);
    });
    return { ben, kayitlar: etkin.filter((k) => kapsamdaGorunurMu(k, d)).map((k) => kayitCevabi(k, d)), ayarlar: ayar, gecmis: await gecmisCevaplari(db, gecmis, d) };
  }
  const benim = ben.personelKimlik;
  const yoneticim = benim === null ? null : (d.harita.get(benim)?.govde['yoneticiId'] ?? null);
  const gorunur = (k: Kayit): IkKayit | null => {
    const c = kayitCevabi(k, d);
    const p = typeof k.govde['empId'] === 'string' ? k.govde['empId'] : null;
    switch (k.tur) {
      case 'dept': return { ...c, govde: alanlariSec(c.govde, ['id', 'kind', 'ad', 'kod', 'yoneticiId']) };
      case 'emp':
        if (k.kimlik === benim) return c;
        if (d.ekip.has(k.kimlik)) return { ...c, govde: alanlariSec(c.govde, EKIP_ALANLARI) };
        if (k.kimlik === yoneticim) return { ...c, govde: alanlariSec(c.govde, YONETICI_ALANLARI) };
        return null;
      case 'leave': case 'perf': return p !== null && (p === benim || d.ekip.has(p)) ? c : null;
      case 'pay': return p !== null && p === benim ? c : null;
      case 'att': return devamGorunurMu(p, benim) ? c : null;
      case 'train': {
        const katilan = Array.isArray(c.govde['katilimcilar']) ? (c.govde['katilimcilar'] as unknown[]).filter((x) => x === benim || d.ekip.has(String(x))) : [];
        return katilan.length ? { ...c, govde: { ...c.govde, katilimcilar: katilan } } : null;
      }
      default: return null;
    }
  };
  const govde = ayar.govde === null ? null : Object.fromEntries(Object.entries(ayar.govde).filter(([a]) => !(GIZLI_AYARLAR as readonly string[]).includes(a)));
  return { ben, kayitlar: etkin.map(gorunur).filter((k): k is IkKayit => k !== null), ayarlar: { govde, surum: ayar.surum }, gecmis: [] };
}

export async function menuSayaclari(db: Db, kullanici: Kullanici): Promise<Record<string, number | null>> {
  const d = await durumOku(db, kullanici);
  const bekleyen = etkinler(d, 'leave').filter((k) => k.govde['durum'] === 'Beklemede');
  return {
    izin: d.ben.rol === 'ik' ? bekleyen.filter((k) => kapsamdaGorunurMu(k, d)).length : null,
    onay: kullanici.islemler.includes('ik.izin-onay') && d.ben.personelKimlik !== null ? bekleyen.filter((k) => d.ekip.has(String(k.govde['empId']))).length : null,
  };
}

// IK-53: yönetici paneli; okuyanın kapsamındaki etkin personel sayılır, ad dönmez.
export async function panoOzeti(db: Db, kullanici: Kullanici): Promise<IkOzetiCevabi> {
  const d = await durumOku(db, kullanici);
  const personel = new Set(etkinler(d, 'emp').map((k) => k.kimlik));
  const izinler = etkinler(d, 'leave').filter((k) => personel.has(String(k.govde['empId'])) && kapsamdaGorunurMu(k, d)).map((k) => k.govde);
  return bugunIzindekiler(izinler, tesisGunu(new Date()));
}

/* ---------------- yazma ---------------- */

type Uc = IzinUcu | 'iletisim';
interface YazGirdisi { tur: IkTuru; kimlik: string; govde: Govde; surum: number | null; uc: Uc }

const KISITLAR = {
  ik_personel_sicil_no_tek: { ileti: 'Bu sicil no başka bir personelde kayıtlı.', alan: 'govde.sicilNo' },
  ik_personel_tckn_tek: { ileti: 'Bu kimlik numarası başka bir personelde kayıtlı.', alan: 'govde.tckn' },
  ik_personel_kisi_id_tek: { ileti: 'Bu TMI kullanıcısı başka bir personele bağlı.', alan: 'govde.kisiId' },
  ik_personel_kisi_id_fkey: { ileti: 'TMI kullanıcısı bulunamadı.', alan: 'govde.kisiId' },
  ik_personel_is_merkezi_id_fkey: { ileti: 'İş merkezi bulunamadı.', alan: 'govde.isMerkeziId' },
  ik_pozisyon_is_merkezi_id_fkey: { ileti: 'İş merkezi bulunamadı.', alan: 'govde.isMerkeziId' },
  ik_pozisyon_ilan_kodu_tek: { ileti: 'Bu ilan kodu başka bir pozisyonda kayıtlı.', alan: 'govde.ilanKodu' },
  ik_bordro_ayda_tek: { ileti: 'Bu çalışanın bu ay için bordrosu zaten var.' },
  ik_bordro_onayi_tek: { ileti: 'Bu bordroyu zaten onayladınız; onay geri alınmaz.' },
  ik_devam_saat_eksi_degil: { ileti: 'Süre eksi olamaz.', alan: 'govde.saat' },
  ik_departman_butce_eksi_degil: { ileti: 'Bütçe eksi olamaz.', alan: 'govde.butce' },
} as const;

// Bağ alanlarının işaret ettiği kayıtlar var olmalı (yoksa sessizce boş kalırdı).
async function baglariDenetle(db: Db, tur: IkTuru, satirlar: Satirlar): Promise<void> {
  const t = TUR_TANIMLARI[tur];
  const denetle = async (bagTuru: IkTuru, v: unknown, alan: string) => {
    if (typeof v === 'string' && !(await s.varMi(db, bagTuru, v))) throw bagimliKayit(`Bağlı kayıt bulunamadı (${alan}: ${v}).`);
  };
  for (const a of t.alanlar) if (a.bag) await denetle(a.bag, satirlar.ana[a.s], a.a);
  for (const l of t.listeler) for (const al of l.alanlar) if (al.bag) for (const r of satirlar.altlar[l.tablo] ?? []) await denetle(al.bag, r[al.s], l.a);
}

async function yaz(db: Db, kullanici: Kullanici, g: YazGirdisi, d: Durum): Promise<{ kayit: Kayit; gecmis: s.GecmisSatiri; uyari: string | null }> {
  firlat(govdeKimligiDenetle(g.kimlik, g.tur, g.govde));
  firlat(boyutDenetle(g.govde));
  const yeni = istemciAlanlariniAyikla(g.tur, g.govde);
  firlat(turDenetle(g.tur, yeni));
  if (await s.kimlikBaskaTurdeMi(db, g.tur, g.kimlik)) throw gecersiz('Bu kimlik başka türde bir kayda ait.');
  const kayitliSatir = await s.kayitKilitle(db, g.tur, g.kimlik);
  const kayitli = kayitliSatir ? kayitKur(kayitliSatir) : null;
  if (!kayitli && g.surum !== null) throw bulunamadi('Kayıt bulunamadı.');
  // IK-19: var olan kayda yazan okuduğu sürümü verir.
  if (kayitli && kayitli.surum !== g.surum) throw eskiSurum();
  const onceki = kayitli && !kayitli.iptal ? kayitli.govde : null;
  const islemler = kullanici.islemler;
  const gun = bugun();
  // IK-27: eski ve yeni hali kişinin iş merkezi kapsamında olmalı.
  if (onceki) kapsamDenetle(g.tur, onceki, d);
  const ek: Record<string, Deger> = {};
  let devamUyarisi: string | null = null;
  if (g.tur === 'att') {
    const o = devamOnayiKur({ onceki, yeni, islemler, benimPersonel: d.ben.personelKimlik });
    yeni['onay'] = o.onay;
    devamUyarisi = o.uyari;
  }
  if (g.tur === 'emp' && g.uc !== 'iletisim') firlat(ucretDenetle(onceki, yeni, islemler));
  if (g.tur === 'emp') {
    firlat(kimlikIbanDenetle(onceki, yeni));
    firlat(ozelVeriDenetle(onceki, yeni, islemler));
    Object.assign(yeni, ozelVeriyiKoru(onceki, yeni, islemler));
  }
  if (g.tur === 'leave') {
    firlat(izinGecisiDenetle({
      onceki, yeni, islemler, benimPersonel: d.ben.personelKimlik, uc: g.uc === 'iletisim' ? 'kaydet' : g.uc, ekipte: d.ekip.has(String(yeni['empId'])),
    }));
    if (IS_GUNU_IZIN_TURLERI.includes(String(yeni['tur'])) && yeni['durum'] !== 'İptal' && (onceki === null || izinIcerigiDegistiMi(onceki, yeni))) {
      await izinIsGunuDenetle(db, d, yeni);
    }
    yeni['talepTarihi'] = onceki?.['talepTarihi'] ?? gun;
    const once = onceki ? String(onceki['durum']) : null;
    if (yeni['durum'] !== once && yeni['durum'] !== 'Beklemede') {
      yeni['karar'] = gun;
      if (yeni['durum'] === 'Onaylandı' || yeni['durum'] === 'Reddedildi') {
        yeni['onaylayanId'] = d.ben.personelKimlik ?? undefined;
        ek['karar_veren_kisi_id'] = kullanici.id;
      }
    } else {
      if (onceki?.['karar'] !== undefined) yeni['karar'] = onceki['karar'];
      if (onceki?.['onaylayanId'] !== undefined) yeni['onaylayanId'] = onceki['onaylayanId'];
      ek['karar_veren_kisi_id'] = kayitli?.ek['karar_veren_kisi_id'] ?? null;
    }
  }
  if (g.tur === 'job') {
    const dortGozAcik = await sistemAyariOku(db, 'ik.dort-goz');
    let gonderen = (kayitli?.ek['gonderen_kisi_id'] as number | null | undefined) ?? null;
    firlat(pozisyonGecisiDenetle({ onceki, yeni, islemler, kisiId: kullanici.id, gonderenKisiId: gonderen, dortGozAcik }));
    const once = onceki ? String(onceki['durum'] || 'Taslak') : '';
    const sonra = String(yeni['durum'] || 'Taslak');
    if (sonra === 'Onay bekliyor' && once !== 'Onay bekliyor') gonderen = kullanici.id;
    if (sonra === 'Taslak') gonderen = null;
    const acilis = sonra === 'Açık' && once !== 'Açık' && once !== 'Beklemede';
    ek['gonderen_kisi_id'] = gonderen;
    ek['onaylayan_kisi_id'] = acilis ? kullanici.id : (kayitli?.ek['onaylayan_kisi_id'] ?? null);
    ek['dort_gozsuz_onay'] = acilis ? !dortGozAcik : (kayitli?.ek['dort_gozsuz_onay'] ?? false);
  }
  const satirlar = ayrisitir(g.tur, yeni);
  await baglariDenetle(db, g.tur, satirlar);
  // Yeni halin iş merkezi bağlı kayıtlardan çözülür (personel değiştiyse yeni personelin).
  kapsamDenetle(g.tur, yeni, d);
  const satir = kayitli
    ? await kisitKorumali(KISITLAR, () => surumluGuncelle({
      guncelle: () => s.kayitGuncelle(db, g.tur, g.kimlik, kayitli.surum, satirlar, kullanici.id, ek), varMi: () => s.varMi(db, g.tur, g.kimlik),
    }))
    : await kisitKorumali(KISITLAR, () => s.kayitEkle(db, g.tur, g.kimlik, satirlar, kullanici.id, ek));
  const kayit = kayitKur(satir);
  d.harita.set(kayit.kimlik, kayit);
  const islem = !kayitli ? 'ekle' : kayitli.iptal ? 'geri' : 'guncelle';
  const gecmis = await s.gecmisYaz(db, {
    kimlik: g.kimlik, tur: g.tur, islem, etiket: etiket(g.tur, kayit.govde, adHaritasi(d)), degisiklikler: islem === 'guncelle' ? degisiklikler(onceki, kayit.govde) : [],
    notu: null, kisiId: kullanici.id,
  });
  if (g.tur === 'leave') {
    const haber = izinOnayBildirimi(onceki, kayit.govde, adHaritasi(d).get(String(kayit.govde['empId'])) ?? '');
    if (haber) await bildirimGonder(db, { tur: 'ik.izin-onay-bekliyor', ...haber, yol: '/ik-islemlerim/onaylar', kaynakKimlik: g.kimlik, haric: kullanici.id });
  }
  const uyari = g.tur === 'emp' ? cikisZimmetUyarisi(kayit.govde, await acikZimmetler(db, kayit.govde)) : devamUyarisi;
  return { kayit, gecmis, uyari };
}

function adHaritasi(d: Durum): Map<string, string> {
  return new Map(etkinler(d, 'emp').map((k) => [k.kimlik, `${String(k.govde['ad'] ?? '')} ${String(k.govde['soyad'] ?? '')}`.trim()]));
}

export async function kaydet(db: Db, kullanici: Kullanici, alan: IkAlani, kimlik: string, govde: Govde, surum: number | null, uc: IzinUcu = 'kaydet'): Promise<IkYazCevabi> {
  const d = await durumOku(db, kullanici);
  const r = await yaz(db, kullanici, { tur: IK_ALANLARI[alan].tur, kimlik, govde, surum, uc }, d);
  return { kayit: kayitCevabi(r.kayit, d), gecmis: await gecmisCevaplari(db, [r.gecmis], d), ...(r.uyari === null ? {} : { uyari: r.uyari }) };
}

export async function topluKaydet(db: Db, kullanici: Kullanici, alan: IkAlani, kayitlar: readonly { kimlik: string; govde: Govde; surum: number | null }[]): Promise<IkTopluCevabi> {
  if (new Set(kayitlar.map((k) => k.kimlik)).size !== kayitlar.length) throw dogrulama('Aynı kayıt iki kez gönderildi.', 'kayitlar');
  const d = await durumOku(db, kullanici);
  const sonuc: Kayit[] = [];
  const gecmis: s.GecmisSatiri[] = [];
  for (const k of kayitlar) {
    const r = await yaz(db, kullanici, { tur: IK_ALANLARI[alan].tur, kimlik: k.kimlik, govde: k.govde, surum: k.surum, uc: 'kaydet' }, d);
    sonuc.push(r.kayit);
    gecmis.push(r.gecmis);
  }
  return { kayitlar: sonuc.map((k) => kayitCevabi(k, d)), gecmis: await gecmisCevaplari(db, gecmis, d) };
}

// IK-18: kayıt silinmez, iptal edilir; satırında durur ve geri getirilebilir.
export async function iptalEt(db: Db, kullanici: Kullanici, alan: IkAlani, kimlik: string, surum: number): Promise<IkYazCevabi> {
  const tur = IK_ALANLARI[alan].tur;
  const d = await durumOku(db, kullanici);
  const satir = await s.kayitKilitle(db, tur, kimlik);
  if (!satir || satir.iptal) throw bulunamadi('Kayıt bulunamadı.');
  if (satir.surum !== surum) throw eskiSurum();
  const kayitli = kayitKur(satir);
  kapsamDenetle(tur, kayitli.govde, d);
  const islemler = kullanici.islemler;
  if (tur === 'leave' && kayitli.govde['durum'] === 'Onaylandı' && !islemler.includes('ik.izin-onay')) throw yetkiYok('Onaylanmış izni silmek için onay yetkisi gerekir.');
  if (tur === 'job' && ['Açık', 'Beklemede', 'Kapandı'].includes(String(kayitli.govde['durum'])) && !islemler.includes('ik.pozisyon-onay')) {
    throw yetkiYok('Onaylanmış pozisyonu silmek için onay yetkisi gerekir.');
  }
  if (tur === 'emp' && kayitli.govde['brutMaas'] !== undefined && !islemler.includes('ik.ucret-yaz')) throw yetkiYok('Ücret bilgisi olan personeli silmek için ücret yetkisi gerekir.');
  const iptal = await surumluGuncelle({ guncelle: () => s.kayitIptal(db, tur, kimlik, surum, kullanici.id), varMi: () => s.varMi(db, tur, kimlik) });
  const kayit = kayitKur(iptal);
  d.harita.set(kimlik, kayit);
  const gecmis = await s.gecmisYaz(db, { kimlik, tur, islem: 'sil', etiket: etiket(tur, kayitli.govde, adHaritasi(d)), degisiklikler: [], notu: null, kisiId: kullanici.id });
  return { kayit: kayitCevabi(kayit, d), gecmis: await gecmisCevaplari(db, [gecmis], d) };
}

export async function izinKarar(db: Db, kullanici: Kullanici, kimlik: string, karar: 'Onaylandı' | 'Reddedildi', surum: number): Promise<IkYazCevabi> {
  const satir = await s.kayitKilitle(db, 'leave', kimlik);
  if (!satir || satir.iptal) throw bulunamadi('İzin talebi bulunamadı.');
  const k = kayitKur(satir);
  return kaydet(db, kullanici, 'izinler', kimlik, { ...k.govde, durum: karar }, surum, 'karar');
}

// IK-78: onaycının devam yazma işlemi olmayabilir; kaydın içeriği okunan hâliyle kalır, yalnız onay değişir.
export async function devamOnayla(db: Db, kullanici: Kullanici, kimlik: string, durum: 'Onaylandı' | 'Beklemede', surum: number): Promise<IkYazCevabi> {
  const satir = await s.kayitKilitle(db, 'att', kimlik);
  if (!satir || satir.iptal) throw bulunamadi('Devam kaydı bulunamadı.');
  const k = kayitKur(satir);
  const d = await durumOku(db, kullanici);
  firlat(devamOnayDenetle(k.govde, d.ben.personelKimlik));
  return kaydet(db, kullanici, 'devam', kimlik, { ...k.govde, onay: durum }, surum, 'onay');
}

export async function pozisyonOnayla(db: Db, kullanici: Kullanici, kimlik: string, surum: number): Promise<IkYazCevabi> {
  const satir = await s.kayitKilitle(db, 'job', kimlik);
  if (!satir || satir.iptal) throw bulunamadi('Pozisyon bulunamadı.');
  const k = kayitKur(satir);
  if (!['Onay bekliyor', 'Kapandı'].includes(String(k.govde['durum']))) throw gecersiz('Yalnız onay bekleyen ya da kapanmış pozisyon açılır.');
  return kaydet(db, kullanici, 'pozisyonlar', kimlik, { ...k.govde, durum: 'Açık' }, surum);
}

export async function iletisimGuncelle(db: Db, kullanici: Kullanici, kimlik: string, alanlar: Partial<Record<(typeof ILETISIM_ALANLARI)[number], string>>, surum: number): Promise<IkYazCevabi> {
  const d = await durumOku(db, kullanici);
  firlat(iletisimDenetle(kimlik, d.ben.personelKimlik));
  const satir = await s.kayitKilitle(db, 'emp', kimlik);
  if (!satir || satir.iptal) throw bulunamadi('Personel kaydı bulunamadı.');
  const govde: Govde = { ...kayitKur(satir).govde };
  for (const a of ILETISIM_ALANLARI) if (alanlar[a] !== undefined) govde[a] = alanlar[a];
  // Kendi kaydının iletişimi kişi kapsamıdır (IK-14); iş merkezi kapsamı İK yazımı içindir.
  const r = await yaz(db, kullanici, { tur: 'emp', kimlik, govde, surum, uc: 'iletisim' }, { ...d, kapsam: await kisininKapsami(db, kullanici.id, async () => []) });
  return { kayit: kayitCevabi(r.kayit, d), gecmis: await gecmisCevaplari(db, [r.gecmis], d) };
}

/* ---------------- bordro: IK-15..IK-17 ---------------- */

export async function bordroKesinlestir(db: Db, kullanici: Kullanici, donem: string, girdiler: Record<string, IkBordroGirdisi>): Promise<IkTopluCevabi> {
  await s.anahtarKilitle(db, `ik-bordro-${donem}`);
  firlat(kesinlestirmeDenetle(await s.kesinlesmisVarMi(db, donem), kullanici.islemler));
  const d = await durumOku(db, kullanici);
  const ayar = await ayarGovdesi(db);
  const govdeler = d.kayitlar.filter((k) => !k.iptal).map((k) => k.govde);
  const motor = motorKur(govdeler, ayar.govde, {
    draft: (ay, personel) => (ay === donem ? girdiler[personel] ?? null : null),
    unlocked: (ay) => ay === donem,
  });
  const [yil, ay] = donem.split('-').map(Number) as [number, number];
  const donemi = motor.periodAt(`${donem}-01`);
  const donemNo = await s.parametreDonemiNo(db, donemi.id);
  const sonuc: Kayit[] = [];
  for (const [personel, girdi] of Object.entries(girdiler)) {
    const e = d.harita.get(personel);
    if (!e || e.tur !== 'emp' || e.iptal) throw bagimliKayit(`Personel kaydı bulunamadı: ${personel}.`);
    kapsamDenetle('emp', e.govde, d);
    const ad = `${String(e.govde['ad'] ?? '')} ${String(e.govde['soyad'] ?? '')}`.trim();
    if (!motor.employedInMonth(e.govde, yil, ay)) throw gecersiz(`${ad} bu ayda çalışmıyor; bordrosu kesinleşmez.`);
    const r = motor.payroll(e.govde, donem);
    if (!r) throw gecersiz(`${ad} için bordro hesaplanamadı.`);
    const govde = bordroKaydi(personel, donem, girdi, r, donemi.ad, donemi.id);
    govde['kesinlesme'] = new Date().toISOString();
    const kimlik = bordroKimligi(personel, donem);
    const satirlar = ayrisitir('pay', govde);
    const ek = { parametre_donemi_no: donemNo, kesinlestiren_kisi_id: kullanici.id };
    const kayitli = await s.kayitKilitle(db, 'pay', kimlik);
    const satir = kayitli
      ? await surumluGuncelle({ guncelle: () => s.kayitGuncelle(db, 'pay', kimlik, kayitli.surum, satirlar, kullanici.id, ek), varMi: () => s.varMi(db, 'pay', kimlik) })
      : await kisitKorumali(KISITLAR, () => s.kayitEkle(db, 'pay', kimlik, satirlar, kullanici.id, ek));
    sonuc.push(kayitKur(satir));
  }
  const gecmis = await s.gecmisYaz(db, {
    kimlik: null, tur: 'pay', islem: 'toplu', etiket: `${donem} bordrosu kesinleşti: ${sonuc.length} kayıt`, degisiklikler: [],
    notu: `Parametre dönemi ${donemi.ad}`, kisiId: kullanici.id,
  });
  return { kayitlar: sonuc.map((k) => kayitCevabi(k, d)), gecmis: await gecmisCevaplari(db, [gecmis], d) };
}

// IK-40..IK-43, IK-46: çalışan kendi kesinleşmiş bordrosunu "gördüm" diye onaylar. Bordro satırı kilitlenir: aynı anda yeniden
// kesinleşen bordronun eski sürümü onaylanmaz. Onay bordroya, tutarlara ve kesinleştirmeye dokunmaz; yalnız defterine yazılır.
export async function bordroGordum(db: Db, kullanici: Kullanici, kimlik: string, surum: number): Promise<IkYazCevabi> {
  const d = await durumOku(db, kullanici);
  const satir = await s.kayitKilitle(db, 'pay', kimlik);
  const bordro = satir ? kayitKur(satir) : null;
  const sonuc = bordroOnayDenetle({
    bordro: bordro && { empId: String(bordro.govde['empId']), surum: bordro.surum, iptal: bordro.iptal },
    benimPersonel: d.ben.personelKimlik,
    okunanSurum: surum,
    onayVar: bordro !== null && (await s.bordroOnayiVarMi(db, kimlik, bordro.surum)),
  });
  if (sonuc === 'ESKI_SURUM') throw eskiSurum();
  firlat(sonuc);
  const zaman = await kisitKorumali(KISITLAR, () => s.bordroOnayiEkle(db, kimlik, bordro!.surum, kullanici.id));
  return { kayit: kayitCevabi({ ...bordro!, govde: { ...bordro!.govde, gordum: zaman } }, d), gecmis: [] };
}

/* ---------------- ayarlar: IK-20 ---------------- */

export async function ayarKaydet(db: Db, kullanici: Kullanici, govde: Govde, surum: number | null): Promise<IkAyarCevabi> {
  if (Buffer.byteLength(JSON.stringify(govde), 'utf8') > 512 * 1024) throw gecersiz('Ayarlar çok büyük (en çok 512 KB).');
  await s.anahtarKilitle(db, 'ik-ayarlar');
  const eski = await ayarGovdesi(db);
  if (eski.surum === null && surum !== null) throw bulunamadi('Ayar kaydı bulunamadı.');
  if (eski.surum !== null && eski.surum !== surum) throw eskiSurum();
  let yazim: s.AyarYazimi;
  try {
    yazim = ayarParcala(govde);
  } catch (e) {
    if (e instanceof EslesmeHatasi) throw dogrulama(e.message, e.alan);
    throw e;
  }
  const d = { kayitlar: (await s.kayitlar(db)).map(kayitKur) };
  const govdeler = d.kayitlar.filter((k) => !k.iptal).map((k) => k.govde);
  const eskiMotor = motorKur(govdeler, eski.govde);
  const eskiDonemler = eskiMotor.periods();
  const bordrolu = new Set(await s.bordroluDonemKodlari(db));
  const kilitli = new Set(eskiDonemler.filter((p) => eskiMotor.periodStatus(p).lock !== '' || bordrolu.has(p.id)).map((p) => p.id));
  // Dönem listesi gelmezse dönemlere dokunulmaz; geldiyse kurallar yeni listeye uygulanır.
  if (yazim.donemler !== null) {
    const yeniDonemler = motorKur(govdeler, govde).periods();
    const aylar = etkinler(d, 'pay').map((k) => String(k.govde['donem']));
    firlat(ayarDegisikligiDenetle({ eskiDonemler, yeniDonemler, kilitliKimlikler: kilitli, enErkenBaslangic: enErkenDonemBaslangici(bugun(), aylar) }));
    // Hiç kaydedilmemiş ayarda varsayılan dönemler yazılır: gelen listede yoksa onlar da eklenir.
  }
  const yeniSurum = await s.ayarYaz(db, yazim, eski.surum, kullanici.id);
  if (yeniSurum === null) throw eskiSurum();
  const yeni = await ayarGovdesi(db);
  const fark = degisiklikler(eski.govde, yeni.govde);
  const gecmis = fark.length || eski.surum === null
    ? [await s.gecmisYaz(db, { kimlik: null, tur: 'ayarlar', islem: 'ayarlar', etiket: 'Ayarlar', degisiklikler: fark, notu: null, kisiId: kullanici.id })]
    : [];
  return { ayarlar: { govde: yeni.govde ?? {}, surum: yeniSurum }, gecmis: await gecmisCevaplari(db, gecmis, { harita: new Map(), ozelGorur: false }) };
}

/* ---------------- kişisel özet okumaları (kart #1322): Arkon Operatör Özetim bunları disari.ts ile okur ---------------- */
// Kişi, personel kartındaki "TMI kullanıcısı" alanıyla eşleşir (ik_personel.kisi_id); bağı olmayan kişide hepsi null döner, sıfır uydurulmaz.
// Yetki ve kapsam çağıran uçtadır: bu okumalar kimin istediğine bakmaz.

export interface FazlaMesaiOzeti {
  // IK-55: fazla mesai, hafta tatili ve resmi tatil çalışması; tarih sırasıyla.
  satirlar: { tarih: string; tur: (typeof FAZLA_MESAI_TURLERI)[number]; saat: number | null; onay: 'Onaylandı' | 'Beklemede' | null }[];
  // IK-56: bitiş gününün parametre dönemindeki yıllık sınır (saat); bilinmiyorsa null.
  yillikSinirSaat: number | null;
}

// [baslangic, bitis] günleri dahil (YYYY-AA-GG).
export async function kisininFazlaMesaisi(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<FazlaMesaiOzeti | null> {
  const no = await s.kisininPersonelNo(db, kisiId);
  if (no === null) return null;
  const satirlar = await s.personelDevamSatirlari(db, no, FAZLA_MESAI_TURLERI, baslangic, bitis);
  const motor = motorKur([], (await ayarGovdesi(db)).govde);
  return {
    satirlar: satirlar as FazlaMesaiOzeti['satirlar'],
    yillikSinirSaat: yillikMesaiSiniri(motor.settingsFor(motor.periodAt(bitis))),
  };
}

export interface KisiIzni {
  tur: string;
  baslangic: string;
  bitis: string;
  gun: number | null;
  durum: 'Beklemede' | 'Onaylandı' | 'Reddedildi' | 'İptal';
}

// [baslangic, bitis] ile kesişen izinler, her durumda (iptal edilmiş kayıt hariç); başlangıç sırasıyla.
export async function kisininIzinleri(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<KisiIzni[] | null> {
  const no = await s.kisininPersonelNo(db, kisiId);
  if (no === null) return null;
  return (await s.personelIzinSatirlari(db, no, baslangic, bitis)) as KisiIzni[];
}

// kisininIzinleri'nin toplu hâli, tek sorgu: personel kaydı olmayan kişi haritada yoktur (tekildeki null). Boş dizide sorgu atılmaz.
export async function kisilerinIzinleri(
  db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, KisiIzni[]>> {
  const tekil = [...new Set(kisiIdleri)];
  const sonuc = new Map<number, KisiIzni[]>();
  if (tekil.length === 0) return sonuc;
  for (const { kisi_id: kisiId, tur, ...izin } of await s.kisilerinIzinSatirlari(db, tekil, baslangic, bitis)) {
    const liste = sonuc.get(kisiId) ?? [];
    if (tur !== null) liste.push({ tur, ...izin } as KisiIzni);
    sonuc.set(kisiId, liste);
  }
  return sonuc;
}

export interface KalanIzin {
  // İşe giriş tarihi yoksa hak bilinmez: hakGun ve kalanGun null.
  hakGun: number | null;
  kalanGun: number | null;
  // Onaylı ve bekleyen yıllık izin günleri (işe girişten bu yana).
  kullanilanGun: number;
  bekleyenGun: number;
  sonrakiHakTarihi: string | null;
  sonrakiHakGun: number | null;
}

// Yıllık izin bakiyesi `tarih` gününe göre; hesap İK ekranının motorudur (kıdem basamakları, yaş alt sınırı, önceki kullanım).
export async function kisininKalanIzni(db: Db, kisiId: number, tarih: string): Promise<KalanIzin | null> {
  const an = motorGunu(tarih);
  if (an === null) throw gecersiz('Tarih YYYY-AA-GG olmalı.');
  const kayitlar = (await s.kayitlar(db, ['emp', 'leave'])).filter((r) => !r.iptal).map(kayitKur);
  const personeller = kayitlar.filter((k) => k.tur === 'emp').map((k) => k.govde);
  const kimlik = personelBul(personeller, kisiId);
  const personel = kimlik === null ? undefined : personeller.find((e) => e['id'] === kimlik);
  if (personel === undefined) return null;
  const izinler = kayitlar.filter((k) => k.tur === 'leave' && k.govde['empId'] === kimlik).map((k) => k.govde);
  const b = motorKur([personel, ...izinler], (await ayarGovdesi(db)).govde).leaveBalance(personel, an);
  const girisVar = motorGunu(String(personel['iseGiris'] ?? '')) !== null;
  return {
    hakGun: girisVar ? b.hak : null,
    kalanGun: girisVar ? b.kalan : null,
    kullanilanGun: b.used,
    bekleyenGun: b.pending,
    sonrakiHakTarihi: b.next ? gunMetni(b.next) : null,
    sonrakiHakGun: b.next ? b.nextDays : null,
  };
}

export interface PersonelKarti {
  ad: string;
  sicilNo: string | null;
  pozisyon: string | null;
  departman: string | null;
  yonetici: string | null;
  iseGiris: string | null;
  calismaSekli: string | null;
  telefon: string | null;
  eposta: string | null;
  adres: string | null;
  acilKisi: string | null;
  acilYakinlik: string | null;
  acilTelefon: string | null;
}

// Profil sayfası: kişinin İK'nın girdiği kartından çalışana açık alanlar. Bağ yoksa null; boş metin null döner.
export async function kisininPersonelKarti(db: Db, kisiId: number): Promise<PersonelKarti | null> {
  const r = await s.kisininPersonelKartiSatiri(db, kisiId);
  if (r === null) return null;
  const dolu = (v: string | null): string | null => (v === null || v.trim() === '' ? null : v.trim());
  return {
    ad: `${r.ad} ${r.soyad}`.trim(),
    sicilNo: dolu(r.sicil_no),
    pozisyon: dolu(r.pozisyon),
    departman: dolu(r.departman),
    yonetici: dolu(r.yonetici),
    iseGiris: dolu(r.ise_giris),
    calismaSekli: dolu(r.calisma_sekli),
    telefon: dolu(r.telefon),
    eposta: dolu(r.eposta),
    adres: dolu(r.adres),
    acilKisi: dolu(r.acil_kisi),
    acilYakinlik: dolu(r.acil_yakinlik),
    acilTelefon: dolu(r.acil_telefon),
  };
}

/* ---------------- puantaj: IK-60..IK-69 (kart #1571) ---------------- */

// Vardiya İK'yı okur (izinli kişiler), İK vardiyayı ithal edemez (ADR 0006): kişinin vardiya planı sunucu/kablolama.ts'nin bağladığı
// çözücülerden gelir (kullanıcı kararı 16.10.2026: puantajın sahibi İK, vardiya saatleri ters bağla). Bağ kurulmadıysa plan bilinmez.
interface PuantajKaynagi { tur: 'kisi'; id: number }
interface PuantajAraligiGirdisi { baslangic: string; bitis: string }
export type PuantajTakvimCozucusu = (db: Db, kaynaklar: readonly PuantajKaynagi[], aralik: PuantajAraligiGirdisi) => Promise<ReadonlyMap<string, {
  isMerkeziId: number; vardiyaId: number | null;
  gunler: readonly { tarih: string; dakika: number; kapali: { tur: 'tatil' | 'kapali'; ad: string | null } | null; izinli?: boolean | undefined }[];
} | null>>;
export type PuantajAralikCozucusu = (db: Db, kaynaklar: readonly PuantajKaynagi[], aralik: PuantajAraligiGirdisi) => Promise<ReadonlyMap<string,
  ReadonlyMap<string, { araliklar: readonly { baslangic: string; bitis: string }[]; molalar: readonly { baslangic: string; bitis: string }[] }> | null>>;
let takvimCozucu: PuantajTakvimCozucusu | null = null;
let aralikCozucu: PuantajAralikCozucusu | null = null;
export function puantajTakvimCozucusu(c: PuantajTakvimCozucusu): void { takvimCozucu = c; }
export function puantajAralikCozucusu(c: PuantajAralikCozucusu): void { aralikCozucu = c; }
// Soru 75: kişi sayfasının Vardiya bölümü vardiya tanımlarını ve iş merkezi x gün matrisini aynı ters bağla okur.
export type VardiyaTanimCozucusu = (db: Db) => Promise<readonly VardiyaTanimi[]>;
export type VardiyaMatrisCozucusu = (db: Db) => Promise<readonly VardiyaMatrisSatiri[]>;
let tanimCozucu: VardiyaTanimCozucusu | null = null;
let matrisCozucu: VardiyaMatrisCozucusu | null = null;
export function vardiyaTanimCozucusu(c: VardiyaTanimCozucusu): void { tanimCozucu = c; }
export function vardiyaMatrisCozucusu(c: VardiyaMatrisCozucusu): void { matrisCozucu = c; }
// 244 a: zimmetin sahibi İdari İşler; İdari İK'yı okuduğu için IK-74 açık zimmetleri aynı ters bağla alır. Kişiye bağlı olmayan personelin
// ya da bağ kurulmamış sürecin zimmeti bilinmez, uyarı çıkmaz.
export type AcikZimmetCozucusu = (db: Db, kisiIdleri: number[]) => Promise<ReadonlyMap<number, readonly { demirbasNo: string; markaModel: string | null }[]>>;
let zimmetCozucu: AcikZimmetCozucusu | null = null;
export function acikZimmetCozucusu(c: AcikZimmetCozucusu): void { zimmetCozucu = c; }

async function acikZimmetler(db: Db, personel: Govde): Promise<readonly { demirbasNo: string; markaModel: string | null }[]> {
  const kisiId = personel['kisiId'];
  if (typeof kisiId !== 'number' || zimmetCozucu === null || !personel['cikisTarihi']) return [];
  return (await zimmetCozucu(db, [kisiId])).get(kisiId) ?? [];
}

// Soru 55: tatil ve kapalı günler personelin bağlı olduğu kişinin vardiya takviminden okunur; bağ ya da takvim yoksa yalnız hafta sonu düşer.
async function izinIsGunuSay(db: Db, d: Durum, empId: string, baslangic: string, bitis: string): Promise<number> {
  const kisiId = d.kayitlar.find((k) => k.tur === 'emp' && k.kimlik === empId)?.govde['kisiId'];
  let tatiller: Set<string> | null = null;
  if (typeof kisiId === 'number' && takvimCozucu !== null) {
    const takvim = (await takvimCozucu(db, [{ tur: 'kisi', id: kisiId }], { baslangic, bitis })).get(`kisi:${kisiId}`) ?? null;
    if (takvim !== null) tatiller = new Set(takvim.gunler.filter((g) => g.kapali !== null).map((g) => g.tarih));
  }
  const cumartesi = (await ayarGovdesi(db)).govde?.['cumartesiIsGunu'] === true;
  return izinIsGunu(baslangic, bitis, cumartesi, tatiller);
}

async function izinIsGunuDenetle(db: Db, d: Durum, izin: Govde): Promise<void> {
  const isGunu = await izinIsGunuSay(db, d, String(izin['empId']), String(izin['baslangic']), String(izin['bitis']));
  firlat(izinGunuDenetle(Number(izin['gun']), isGunu));
}

// Soru 74: izin ekranı gün önerisini kaydın sınırıyla aynı hesaptan alır. Kişiyi göremeyen (puantajdaki kural) bulunamadı alır.
const IZIN_GUNU_AZAMI_ARALIK = 366;
export async function izinGunuGetir(db: Db, kullanici: Kullanici, personel: string, baslangic: string, bitis: string): Promise<IkIzinGunuCevabi> {
  if (bitis < baslangic) throw dogrulama('Bitiş başlangıçtan önce olamaz.', 'bitis');
  if ((Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000 >= IZIN_GUNU_AZAMI_ARALIK) {
    throw dogrulama(`İzin aralığı en çok ${IZIN_GUNU_AZAMI_ARALIK} gün olabilir.`, 'bitis');
  }
  const d = await durumOku(db, kullanici);
  gorunenPersonel(d, personel, 'Personel bulunamadı ya da izin gününü görme yetkiniz yok.');
  return { isGunu: await izinIsGunuSay(db, d, personel, baslangic, bitis) };
}

// Puantajdaki görünürlük: İK kapsamı, öteki roller yalnız kendi kaydı.
function gorunenPersonel(d: Durum, personel: string, ileti: string): Kayit {
  const k = etkinler(d, 'emp').find((x) => x.kimlik === personel);
  const gorur = k !== undefined && (d.ben.rol === 'ik' ? kapsamdaGorunurMu(k, d) : devamGorunurMu(k.kimlik, d.ben.personelKimlik));
  if (!gorur) throw bulunamadi(ileti);
  return k;
}

// Soru 75: kişinin iş merkezi ve seçili vardiyası Vardiya'nın kişi takviminden (istasyon, makine ya da ekip ataması); bugünkü atama.
export async function kisiVardiyasiGetir(db: Db, kullanici: Kullanici, personel: string): Promise<IkKisiVardiyasiCevabi> {
  const d = await durumOku(db, kullanici);
  const kisiId = gorunenPersonel(d, personel, 'Personel bulunamadı ya da vardiyasını görme yetkiniz yok.').govde['kisiId'];
  if (typeof kisiId !== 'number' || takvimCozucu === null || tanimCozucu === null || matrisCozucu === null) return { vardiya: null };
  const gun = bugun();
  const takvim = (await takvimCozucu(db, [{ tur: 'kisi', id: kisiId }], { baslangic: gun, bitis: gun })).get(`kisi:${kisiId}`) ?? null;
  const merkez = takvim === null ? undefined : (await isMerkezleri(db, { pasiflerDahil: true })).find((m) => m.id === takvim.isMerkeziId);
  if (takvim === null || merkez === undefined) return { vardiya: null };
  const vardiyalar = await tanimCozucu(db);
  return { vardiya: {
    isMerkezi: { id: merkez.id, kod: merkez.kod, ad: merkez.ad },
    secili: takvim.vardiyaId === null ? null : vardiyalar.find((v) => v.id === takvim.vardiyaId)?.ad ?? null,
    hafta: haftalikVardiyaPlani(merkez.id, takvim.vardiyaId, await matrisCozucu(db), vardiyalar),
  } };
}

interface KisiPlani { gun: IkPuantajPlanGunu & { izinli: boolean }; plan: GunPlani }

async function planlariOku(db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string): Promise<Map<number, Map<string, KisiPlani> | null>> {
  const sonuc = new Map<number, Map<string, KisiPlani> | null>();
  if (kisiIdleri.length === 0 || takvimCozucu === null || aralikCozucu === null) return sonuc;
  const kaynaklar = kisiIdleri.map((id) => ({ tur: 'kisi' as const, id }));
  const takvimler = await takvimCozucu(db, kaynaklar, { baslangic, bitis });
  const araliklar = await aralikCozucu(db, kaynaklar, { baslangic, bitis });
  for (const id of kisiIdleri) {
    const takvim = takvimler.get(`kisi:${id}`) ?? null;
    const gunAraliklari = araliklar.get(`kisi:${id}`) ?? null;
    if (takvim === null) { sonuc.set(id, null); continue; }
    const gunler = new Map<string, KisiPlani>();
    for (const g of takvim.gunler) {
      const anlar = (l: readonly { baslangic: string; bitis: string }[] | undefined) => (l ?? []).map((x) => ({ bas: Date.parse(x.baslangic), bit: Date.parse(x.bitis) }));
      const a = anlar(gunAraliklari?.get(g.tarih)?.araliklar);
      const bas = a.length ? Math.min(...a.map((x) => x.bas)) : null;
      const bit = a.length ? Math.max(...a.map((x) => x.bit)) : null;
      gunler.set(g.tarih, {
        plan: { araliklar: a, molalar: anlar(gunAraliklari?.get(g.tarih)?.molalar) },
        gun: {
          tarih: g.tarih, dakika: g.dakika, baslangic: bas === null ? null : tesisSaati(bas).slice(11, 16), bitis: bit === null ? null : tesisSaati(bit).slice(11, 16),
          kapali: g.kapali?.tur ?? null, ad: g.kapali?.ad ?? null, izinli: g.izinli === true,
        },
      });
    }
    sonuc.set(id, gunler);
  }
  return sonuc;
}

const ayinGunleri = (ay: string): string[] => {
  const [y, a] = ay.split('-').map(Number) as [number, number];
  const son = new Date(Date.UTC(y, a, 0)).getUTCDate();
  return Array.from({ length: son }, (_, i) => `${ay}-${String(i + 1).padStart(2, '0')}`);
};
const metinVeyaNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function puantajKaydi(r: s.PuantajSatiri, plan: Map<string, KisiPlani> | null, adlar: ReadonlyMap<number, string>): IkPuantajKaydi {
  let calismaDakika: number | null = null;
  let fazlaDakika: number | null = null;
  const gunPlani = plan?.get(r.tarih) ?? null;
  if (r.durum === 'calisti' && r.giris !== null && r.cikis !== null) {
    const h = calismaHesabi(calismaAraligi(tesisGunBasi(r.tarih), r.giris, r.cikis), plan === null ? null : gunPlani?.plan ?? { araliklar: [], molalar: [] });
    calismaDakika = h.calismaDakika;
    fazlaDakika = h.fazlaDakika;
  }
  return {
    tarih: r.tarih, durum: r.durum as PuantajDurumu, giris: r.giris, cikis: r.cikis, aciklama: r.aciklama, surum: r.surum,
    yazan: adlar.get(r.yazan_kisi_id) ?? '', yazildi: r.yazildi, calismaDakika, fazlaDakika,
    fazlaTuru: fazlaTuru(fazlaDakika, plan === null ? null : gunPlani?.gun ?? { dakika: 0, kapali: null, izinli: false }),
  };
}

// IK-67: İK (ik.oku) kapsamındaki personelin, öteki kişi yalnız kendi puantajını okur (IK-31 gibi; ekibininkini değil).
export async function puantajGetir(db: Db, kullanici: Kullanici, ay: string, personel: string | undefined): Promise<IkPuantajCevabi> {
  const d = await durumOku(db, kullanici);
  const gunler = ayinGunleri(ay);
  const ilk = gunler[0]!;
  const son = gunler[gunler.length - 1]!;
  let kisiler = etkinler(d, 'emp').filter((k) => {
    const giris = metinVeyaNull(k.govde['iseGiris']);
    const cikis = metinVeyaNull(k.govde['cikisTarihi']);
    return (giris === null || giris <= son) && (cikis === null || cikis >= ilk);
  });
  if (d.ben.rol === 'ik') kisiler = kisiler.filter((k) => kapsamdaGorunurMu(k, d));
  else kisiler = kisiler.filter((k) => devamGorunurMu(k.kimlik, d.ben.personelKimlik));
  if (personel !== undefined) {
    kisiler = kisiler.filter((k) => k.kimlik === personel);
    if (kisiler.length === 0) throw bulunamadi('Personel bulunamadı ya da puantajını görme yetkiniz yok.');
  }
  const kisiIdleri = new Map(kisiler.flatMap((k) => (typeof k.govde['kisiId'] === 'number' ? [[k.kimlik, k.govde['kisiId']] as const] : [])));
  const planlar = await planlariOku(db, [...new Set(kisiIdleri.values())], ilk, son);
  const satirlar = await s.puantajSatirlari(db, kisiler.map((k) => k.kimlik), ilk, son);
  const adlar = await kisiAdlari(db, satirlar.map((r) => r.yazan_kisi_id));
  const kilitli = await s.kesinlesmisPersoneller(db, ay);
  return {
    ay, gunler,
    kisiler: kisiler.map((k) => {
      const kisiId = kisiIdleri.get(k.kimlik);
      const plan = kisiId === undefined ? null : planlar.get(kisiId) ?? null;
      return {
        personel: k.kimlik, kilitli: kilitli.has(k.kimlik),
        plan: plan === null ? null : [...plan.values()].map((p) => ({
          tarih: p.gun.tarih, dakika: p.gun.dakika, baslangic: p.gun.baslangic, bitis: p.gun.bitis, kapali: p.gun.kapali, ad: p.gun.ad,
        })),
        kayitlar: satirlar.filter((r) => r.personel === k.kimlik).map((r) => puantajKaydi(r, plan, adlar)),
      };
    }),
  };
}

const PUANTAJ_KISITLARI = {
  ik_puantaj_gunde_tek: { ileti: 'Bu personelin bu güne ait puantajı başka biri tarafından girildi; sayfayı yenileyin.' },
  ik_puantaj_aciklama_bicimi: { ileti: 'Açıklama en çok 300 karakter olabilir.', alan: 'aciklama' },
} as const;

// Tek hücre de toplu seçim de tek işlemde yazılır: biri reddedilirse hiçbiri yazılmaz (uç transaction'ı).
export async function puantajYaz(db: Db, kullanici: Kullanici, gunler: readonly IkPuantajGunuGirdisi[]): Promise<IkPuantajYazCevabi> {
  if (new Set(gunler.map((g) => `${g.personel}|${g.tarih}`)).size !== gunler.length) throw dogrulama('Aynı gün iki kez gönderildi.', 'gunler');
  const d = await durumOku(db, kullanici);
  const bugunu = tesisGunu(new Date());
  const kilitler = new Map<string, Set<string>>();
  const yazilan: { personel: string; tarih: string }[] = [];
  const silinen: { personel: string; tarih: string }[] = [];
  for (const [i, g] of gunler.entries()) {
    const yer = (h: KuralHatasi | null): KuralHatasi | null => (h === null ? null : { ...h, ...(h.alan ? { alan: `gunler.${i}.${h.alan}` } : {}) });
    const e = d.harita.get(g.personel);
    if (!e || e.tur !== 'emp' || e.iptal) throw bulunamadi(`Personel bulunamadı: ${g.personel}.`);
    // IK-27: personel kişinin iş merkezi kapsamında olmalı.
    kapsamDenetle('emp', e.govde, d);
    firlat(yer(puantajGunuDenetle(g)));
    firlat(puantajTarihiDenetle(g.tarih, bugunu, metinVeyaNull(e.govde['iseGiris']), metinVeyaNull(e.govde['cikisTarihi'])));
    const ay = g.tarih.slice(0, 7);
    if (!kilitler.has(ay)) kilitler.set(ay, await s.kesinlesmisPersoneller(db, ay));
    firlat(puantajKilidiDenetle(kilitler.get(ay)!.has(g.personel), kullanici.islemler));
    const kayitli = await s.puantajKilitle(db, g.personel, g.tarih);
    // IK-66: var olan güne okunan sürümle yazılır; yeni gün sürümsüz gelir.
    if (kayitli === null && g.surum !== null) throw eskiSurum();
    if (kayitli !== null && kayitli.surum !== g.surum) throw eskiSurum();
    if (g.durum === null) {
      if (kayitli !== null) {
        if (!(await s.puantajSil(db, g.personel, g.tarih, kayitli.surum))) throw eskiSurum();
        silinen.push({ personel: g.personel, tarih: g.tarih });
      }
      continue;
    }
    const y = { personel: g.personel, tarih: g.tarih, durum: g.durum, giris: g.giris, cikis: g.cikis, aciklama: g.aciklama };
    if (kayitli === null) await kisitKorumali(PUANTAJ_KISITLARI, () => s.puantajEkle(db, y, kullanici.id));
    else if (!(await kisitKorumali(PUANTAJ_KISITLARI, () => s.puantajGuncelle(db, y, kayitli.surum, kullanici.id)))) throw eskiSurum();
    yazilan.push({ personel: g.personel, tarih: g.tarih });
  }
  const kayitlar: IkPuantajYazCevabi['kayitlar'] = [];
  for (const personel of new Set(yazilan.map((y) => y.personel))) {
    const tarihler = yazilan.filter((y) => y.personel === personel).map((y) => y.tarih).sort();
    const e = d.harita.get(personel)!;
    const kisiId = typeof e.govde['kisiId'] === 'number' ? e.govde['kisiId'] : null;
    const plan = kisiId === null ? null : (await planlariOku(db, [kisiId], tarihler[0]!, tarihler[tarihler.length - 1]!)).get(kisiId) ?? null;
    const satirlar = (await s.puantajSatirlari(db, [personel], tarihler[0]!, tarihler[tarihler.length - 1]!)).filter((r) => tarihler.includes(r.tarih));
    const adlar = await kisiAdlari(db, satirlar.map((r) => r.yazan_kisi_id));
    kayitlar.push(...satirlar.map((r) => ({ personel, ...puantajKaydi(r, plan, adlar) })));
  }
  return { kayitlar, silinen };
}


import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import { KADEME_ADLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, kaynakKademeleri, type KademeKaynagi } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { EPOSTA_KONU_ADLARI } from '#paylasilan/sozlesme/eposta-sabitleri.ts';
import type {
  BildirimAliciSatiri, BildirimAlicilariCevabi, BildirimGosterimSatiri, BildirimGosterimleriCevabi, BildirimOnemi, BildirimPushTurSatiri,
  BildirimPushTurleriCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import type {
  EpostaSablonlariCevabi, EpostaTetikleyiciDegistirGovdesi, EpostaTetikleyiciSatiri, EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import type { KademeAyarSatiri, KademeAyarlariCevabi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import {
  AcKapa, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { modulAdi } from '../bildirim/disari.ts';
import './eposta.css';

// 3435-3 a: olay başına bütün kanallar tek tabloda (satır olay, sütun kanal); satıra basınca tek panel, tek Kaydet. Yetki modeli
// değişmez: her sütun bugünkü işlemiyle okunur ve yazılır (alıcı, ekran ortası ve telefon `ayarlar.yaz`, e-posta
// `bildirim.eposta-yonet`, kademe `bildirim.kademe-yonet`); işlemi olmayanın sütunu görünmez, paneli o bölümü göstermez.
export const MATRIS_ANAHTARI = {
  alicilar: ['ayarlar', 'bildirim-alicilari'] as const,
  gosterim: ['ayarlar', 'bildirim-gosterim'] as const,
  push: ['ayarlar', 'bildirim-push-turleri'] as const,
  tetikleyiciler: ['ayarlar', 'eposta', 'tetikleyiciler'] as const,
  sablonlar: ['ayarlar', 'eposta', 'sablonlar'] as const,
  kademe: ['ayarlar', 'kademe-kaynaklari'] as const,
};

const ONEM_SIMGESI: Record<BildirimOnemi, SimgeAdi> = { bilgi: 'bell', uyari: 'alert', acil: 'alert' };
const ONEM_TONU: Record<BildirimOnemi, RozetTonu> = { bilgi: 'bilgi', uyari: 'uyari', acil: 'hata' };
const ONEM_ADI: Record<BildirimOnemi, string> = { bilgi: 'Bilgi', uyari: 'Uyarı', acil: 'Acil' };

// Kademeli uyarı türü (K2-K5) hangi kaynağın hangi basamağıdır; türün kendi ayarı yoktur, kaynağın ayarı geçer.
const KADEME_TURLERI: ReadonlyMap<string, { kaynak: KademeKaynagi; no: 2 | 3 | 4 | 5 }> = new Map(
  KADEME_KAYNAK_ANAHTARLARI.flatMap((k) => kaynakKademeleri(k).map((no) => [kademeTuru(k, no) as string, { kaynak: k, no }] as const)),
);

export interface MatrisSatiri {
  tur: string;
  baslik: string;
  onem: BildirimOnemi;
  kaynakModul: string;
  alici: BildirimAliciSatiri | null;
  gosterim: BildirimGosterimSatiri | null;
  push: BildirimPushTurSatiri | null;
  eposta: EpostaTetikleyiciSatiri | null;
  kademe: { kaynak: KademeAyarSatiri | null; no: 2 | 3 | 4 | 5 } | null;
}

// Satırlar okunabilen kaynakların birleşimidir; tür ilk okunan kaynaktan adını ve önemini alır.
export function matrisSatirlari(v: {
  alicilar?: BildirimAlicilariCevabi | undefined; gosterim?: BildirimGosterimleriCevabi | undefined; push?: BildirimPushTurleriCevabi | undefined;
  tetikleyiciler?: EpostaTetikleyicileriCevabi | undefined; kademe?: KademeAyarlariCevabi | undefined;
}): MatrisSatiri[] {
  const satirlar = new Map<string, MatrisSatiri>();
  const al = (s: { tur: string; baslik: string; onem: BildirimOnemi; kaynakModul?: string }): MatrisSatiri => {
    let m = satirlar.get(s.tur);
    if (!m) {
      const k = KADEME_TURLERI.get(s.tur);
      m = {
        tur: s.tur, baslik: s.baslik, onem: s.onem, kaynakModul: s.kaynakModul ?? s.tur.slice(0, s.tur.indexOf('.')),
        alici: null, gosterim: null, push: null, eposta: null,
        kademe: k ? { kaynak: v.kademe?.kaynaklar.find((x) => x.kaynak === k.kaynak) ?? null, no: k.no } : null,
      };
      satirlar.set(s.tur, m);
    }
    return m;
  };
  for (const s of v.gosterim?.satirlar ?? []) al(s).gosterim = s;
  for (const s of v.alicilar?.satirlar ?? []) al(s).alici = s;
  for (const s of v.push?.satirlar ?? []) al(s).push = s;
  for (const s of v.tetikleyiciler?.satirlar ?? []) al(s).eposta = s;
  return [...satirlar.values()];
}

export function aliciOzeti(m: MatrisSatiri, rolAdi: ReadonlyMap<number, string>): string {
  const a = m.alici;
  if (a === null) return 'Kayda bağlı kişi';
  if (a.surum === null) return a.varsayilanIslemler.length === 0 ? 'Kayda bağlı kişi' : `Yetkisi olanlar (${a.varsayilanIslemler.map(islemAdi).join(', ')})`;
  const roller = a.rolIdleri.map((id) => rolAdi.get(id) ?? `Rol ${String(id)}`);
  return [...roller, ...(a.kisiIdleri.length > 0 ? [`${String(a.kisiIdleri.length)} kişi`] : [])].join(', ') || 'Kimse';
}

const acikRozeti = (acik: boolean | undefined, metin = 'Açık') =>
  acik === undefined ? <span className="tc-matris-yok">—</span> : <Rozet ton={acik ? 'tamam' : 'pasif'}>{acik ? metin : 'Kapalı'}</Rozet>;

function kademeMetni(m: MatrisSatiri): string | null {
  if (m.kademe) {
    const k = m.kademe.kaynak;
    return `K${String(m.kademe.no)} ${KADEME_ADLARI[m.kademe.no]}${k === null ? '' : k.acik ? '' : ' (kaynak kapalı)'}`;
  }
  if (m.eposta?.yukseltGun != null) return `${String(m.eposta.yukseltGun)} gün sonra yükselir`;
  return null;
}

export function BildirimMatrisi() {
  const yetki = useYetki();
  const ayar = yetki.var('ayarlar.yaz');
  const eposta = yetki.var('bildirim.eposta-yonet');
  const kademeYetki = yetki.var('bildirim.kademe-yonet');
  const alicilar = useQuery({ queryKey: MATRIS_ANAHTARI.alicilar, enabled: ayar, queryFn: () => api.get<BildirimAlicilariCevabi>('/bildirimler/alicilar') });
  const gosterim = useQuery({ queryKey: MATRIS_ANAHTARI.gosterim, enabled: ayar, queryFn: () => api.get<BildirimGosterimleriCevabi>('/bildirimler/gosterim') });
  const push = useQuery({ queryKey: MATRIS_ANAHTARI.push, enabled: ayar, queryFn: () => api.get<BildirimPushTurleriCevabi>('/bildirimler/push/turler') });
  const tetik = useQuery({ queryKey: MATRIS_ANAHTARI.tetikleyiciler, enabled: eposta, queryFn: () => api.get<EpostaTetikleyicileriCevabi>('/bildirimler/eposta/tetikleyiciler') });
  const sablonlar = useQuery({ queryKey: MATRIS_ANAHTARI.sablonlar, enabled: eposta, queryFn: () => api.get<EpostaSablonlariCevabi>('/bildirimler/eposta/sablonlar') });
  const kademe = useQuery({ queryKey: MATRIS_ANAHTARI.kademe, enabled: kademeYetki, queryFn: () => api.get<KademeAyarlariCevabi>('/bildirim-kademe/kaynaklar') });
  const [arama, setArama] = useState('');
  const [modul, setModul] = useState('');
  const [acik, setAcik] = useState<string | null>(null);

  const sorgular = [ayar ? [alicilar, gosterim, push] : [], eposta ? [tetik] : [], kademeYetki ? [kademe] : []].flat();
  if (!yetki.hazir || sorgular.some((q) => q.isPending)) return <Kart baslik="Olaylar ve kanallar"><DurumKutusu durum="yukleniyor" /></Kart>;
  const hatali = sorgular.find((q) => q.isError);
  if (hatali) {
    return (
      <Kart baslik="Olaylar ve kanallar">
        <DurumKutusu durum="hata" mesaj={hataIletisi(hatali.error, 'Bildirim ayarları alınamadı.')} yenile={() => { for (const q of sorgular) void q.refetch(); }} />
      </Kart>
    );
  }
  const tumu = matrisSatirlari({ alicilar: alicilar.data, gosterim: gosterim.data, push: push.data, tetikleyiciler: tetik.data, kademe: kademe.data });
  const rolAdi = new Map((alicilar.data?.roller ?? tetik.data?.roller ?? []).map((r) => [r.id, r.ad]));
  const ozelAdi = new Map((sablonlar.data?.ozel ?? []).map((o) => [o.id, o.ad]));
  const moduller = [...new Set(tumu.map((m) => m.kaynakModul))];
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const satirlar = tumu
    .filter((m) => modul === '' || m.kaynakModul === modul)
    .filter((m) => aranan === '' || m.baslik.toLocaleLowerCase('tr').includes(aranan));
  const secili = tumu.find((m) => m.tur === acik) ?? null;
  const sutunlar: Sutun<MatrisSatiri>[] = [
    {
      anahtar: 'olay', baslik: 'Olay', kartTamSatir: true, csv: (m) => m.baslik,
      hucre: (m) => <span className="tc-eposta-olay-hucre"><Simge ad={ONEM_SIMGESI[m.onem]} boyut="k" /><span>{m.baslik}</span></span>,
    },
    { anahtar: 'zil', baslik: 'Zil', csv: () => 'Açık', hucre: () => <Rozet ton="tamam">Açık</Rozet> },
    ...(ayar ? [
      {
        anahtar: 'ortada', baslik: 'Ortada / onay', csv: (m: MatrisSatiri) => (m.gosterim ? `${m.gosterim.ortada ? 'Ortada' : '-'} ${m.gosterim.onayIstenir ? 'Onay' : ''}` : ''),
        hucre: (m: MatrisSatiri) => (m.gosterim === null ? <span className="tc-matris-yok">—</span> : (
          <span className="tc-matris-rozetler">
            {acikRozeti(m.gosterim.ortada, 'Ortada')}
            {m.gosterim.onayIstenir && <Rozet ton="uyari">Onay</Rozet>}
          </span>
        )),
      },
      { anahtar: 'telefon', baslik: 'Telefon', csv: (m: MatrisSatiri) => (m.push?.acik ? 'Açık' : 'Kapalı'), hucre: (m: MatrisSatiri) => acikRozeti(m.push?.acik) },
    ] satisfies Sutun<MatrisSatiri>[] : []),
    ...(eposta ? [
      {
        anahtar: 'eposta', baslik: 'E-posta', csv: (m: MatrisSatiri) => (m.eposta?.eposta ? (m.eposta.zaman === 'hemen' ? 'Hemen' : 'Özet') : 'Kapalı'),
        hucre: (m: MatrisSatiri) => (m.eposta === null ? <span className="tc-matris-yok">—</span> : (
          <span className="tc-matris-rozetler">
            {acikRozeti(m.eposta.eposta, m.eposta.zaman === 'hemen' ? 'Hemen' : 'Özet')}
            {m.eposta.eposta && m.eposta.sablonId !== null && <Rozet ton="bilgi" gorunum="cizgi">{ozelAdi.get(m.eposta.sablonId) ?? 'Şablon'}</Rozet>}
          </span>
        )),
      },
    ] satisfies Sutun<MatrisSatiri>[] : []),
    { anahtar: 'kademe', baslik: 'Kademe', csv: (m) => kademeMetni(m) ?? '', hucre: (m) => kademeMetni(m) ?? <span className="tc-matris-yok">—</span> },
    ...(ayar ? [{ anahtar: 'alicilar', baslik: 'Alıcılar', kartTamSatir: true, hucre: (m: MatrisSatiri) => aliciOzeti(m, rolAdi) }] satisfies Sutun<MatrisSatiri>[] : []),
  ];
  return (
    <Kart baslik="Olaylar ve kanallar">
      <p className="tc-ayar-aciklama">
        Her satır bir olaydır. Satıra dokunun: alıcılar, ekran ortası ve onay, telefon, e-posta ve şablonu tek panelde değişir. Uygulama zili
        her olayda açıktır. Kademeli uyarı türünün günleri Kademeli uyarı sekmesindeki kaynağından gelir.
      </p>
      <Tablo
        etiket="Bildirim olayları"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(m) => m.tur}
        satirSec={(m) => { setAcik(m.tur); }}
        bosMesaj="Bu süzgece uyan olay yok."
        grup={{ yol: (m) => [m.kaynakModul], baslik: (yol) => modulAdi(yol[0] ?? '') }}
        arac={{
          arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' },
          suzgec: {
            etiket: 'Modül', secili: modul, sec: setModul,
            secenekler: [{ deger: '', baslik: 'Bütün modüller' }, ...moduller.map((m) => ({ deger: m, baslik: modulAdi(m) }))],
          },
          csv: { ad: 'bildirim-olaylari' },
        }}
      />
      {secili && (
        <OlayPaneli
          key={`${secili.tur}:${String(secili.alici?.surum)}:${String(secili.gosterim?.surum)}:${String(secili.eposta?.surum)}:${String(secili.push?.acik)}`}
          satir={secili}
          roller={alicilar.data?.roller ?? []}
          kisiler={alicilar.data?.kisiler ?? []}
          epostaRolleri={tetik.data?.roller ?? []}
          epostaKisileri={tetik.data?.kisiler ?? []}
          sablonlar={sablonlar.data}
          yetki={{ ayar, eposta }}
          kapat={() => { setAcik(null); }}
        />
      )}
    </Kart>
  );
}

const sayiMi = (m: string): number | null => (/^\d{1,3}$/.test(m.trim()) ? Number(m.trim()) : null);
const ayni = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function OlayPaneli({ satir, roller, kisiler, epostaRolleri, epostaKisileri, sablonlar, yetki, kapat }: {
  satir: MatrisSatiri;
  roller: BildirimAlicilariCevabi['roller'];
  kisiler: BildirimAlicilariCevabi['kisiler'];
  epostaRolleri: EpostaTetikleyicileriCevabi['roller'];
  epostaKisileri: EpostaTetikleyicileriCevabi['kisiler'];
  sablonlar: EpostaSablonlariCevabi | undefined;
  yetki: { ayar: boolean; eposta: boolean };
  kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const a = satir.alici;
  const g = satir.gosterim;
  const e = satir.eposta;
  const [rolIdleri, setRolIdleri] = useState(a?.rolIdleri ?? []);
  const [kisiIdleri, setKisiIdleri] = useState(a?.kisiIdleri ?? []);
  const [ortada, setOrtada] = useState(g?.ortada ?? false);
  const [onay, setOnay] = useState(g?.onayIstenir ?? false);
  const [telefon, setTelefon] = useState(satir.push?.acik ?? false);
  const [epostaAcik, setEpostaAcik] = useState(e?.eposta ?? false);
  const [ozet, setOzet] = useState(e?.zaman === 'ozet');
  const [sablonId, setSablonId] = useState(e?.sablonId ?? null);
  const [tekrar, setTekrar] = useState(e?.tekrarGun != null);
  const [tekrarGun, setTekrarGun] = useState(String(e?.tekrarGun ?? 3));
  const [tekrarEnCok, setTekrarEnCok] = useState(String(e?.tekrarEnCok ?? 3));
  const [yukselt, setYukselt] = useState(e?.yukseltGun != null);
  const [yukseltGun, setYukseltGun] = useState(String(e?.yukseltGun ?? 2));
  const [yRolIdleri, setYRolIdleri] = useState(e?.yukseltRolIdleri ?? []);
  const [yKisiIdleri, setYKisiIdleri] = useState(e?.yukseltKisiIdleri ?? []);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const kisiAdi = new Map([...kisiler, ...epostaKisileri].map((k) => [k.id, k.ad]));

  const gunHatasi = (m: string, enCok: number): string | undefined => {
    const n = sayiMi(m);
    return n === null || n < 1 || n > enCok ? `1 ile ${String(enCok)} arasında olmalı.` : undefined;
  };
  const hatalar = {
    tekrarGun: epostaAcik && tekrar ? gunHatasi(tekrarGun, 60) : undefined,
    tekrarEnCok: epostaAcik && tekrar ? gunHatasi(tekrarEnCok, 10) : undefined,
    yukseltGun: epostaAcik && yukselt ? gunHatasi(yukseltGun, 60) : undefined,
    yukseltKime: epostaAcik && yukselt && yRolIdleri.length + yKisiIdleri.length === 0 ? 'En az bir rol ya da kişi seçin.' : undefined,
  };
  const gecerli = Object.values(hatalar).every((h) => h === undefined);
  const epostaGovdesi = (): EpostaTetikleyiciDegistirGovdesi => ({
    eposta: epostaAcik, zaman: ozet ? 'ozet' : 'hemen',
    tekrarGun: epostaAcik && tekrar ? sayiMi(tekrarGun) : null, tekrarEnCok: epostaAcik && tekrar ? sayiMi(tekrarEnCok) : null,
    yukseltGun: epostaAcik && yukselt ? sayiMi(yukseltGun) : null,
    yukseltRolIdleri: epostaAcik && yukselt ? yRolIdleri : [], yukseltKisiIdleri: epostaAcik && yukselt ? yKisiIdleri : [],
    sablonId, surum: e?.surum ?? null,
  });
  const degisim = {
    alici: yetki.ayar && a !== null && (!ayni(rolIdleri, a.rolIdleri) || !ayni(kisiIdleri, a.kisiIdleri)),
    gosterim: yetki.ayar && g !== null && (ortada !== g.ortada || onay !== g.onayIstenir),
    push: yetki.ayar && satir.push !== null && telefon !== satir.push.acik,
    eposta: yetki.eposta && e !== null && (() => {
      const y = epostaGovdesi();
      return y.eposta !== e.eposta || y.zaman !== e.zaman || y.tekrarGun !== e.tekrarGun || y.tekrarEnCok !== e.tekrarEnCok || y.yukseltGun !== e.yukseltGun
        || !ayni(y.yukseltRolIdleri, e.yukseltRolIdleri) || !ayni(y.yukseltKisiIdleri, e.yukseltKisiIdleri) || y.sablonId !== e.sablonId;
    })(),
  };
  const degisti = Object.values(degisim).some(Boolean);

  // Her kanal kendi ucuna kendi sürümüyle yazılır; biri kalırsa öteki geri alınmaz, kalan bölüm adıyla bildirilir.
  const kaydet = async () => {
    setKaydediliyor(true);
    const isler: { ad: string; is: () => Promise<unknown>; anahtar: readonly string[] }[] = [];
    if (degisim.alici && a) isler.push({ ad: 'Alıcılar', anahtar: MATRIS_ANAHTARI.alicilar, is: () => api.post(`/bildirimler/alicilar/${satir.tur}/degistir`, { rolIdleri, kisiIdleri, surum: a.surum }) });
    if (degisim.gosterim && g) isler.push({ ad: 'Ekran ortası', anahtar: MATRIS_ANAHTARI.gosterim, is: () => api.post(`/bildirimler/gosterim/${satir.tur}/degistir`, { ortada, onayIstenir: onay, surum: g.surum }) });
    if (degisim.push) isler.push({ ad: 'Telefon', anahtar: MATRIS_ANAHTARI.push, is: () => api.post(`/bildirimler/push/turler/${satir.tur}/degistir`, { acik: telefon }) });
    if (degisim.eposta) isler.push({ ad: 'E-posta', anahtar: MATRIS_ANAHTARI.tetikleyiciler, is: () => api.post(`/bildirimler/eposta/tetikleyiciler/${satir.tur}/degistir`, epostaGovdesi()) });
    const kalan: string[] = [];
    let ilkHata: unknown = null;
    for (const x of isler) {
      try { await x.is(); } catch (h) { kalan.push(x.ad); ilkHata ??= h; }
      void istemci.invalidateQueries({ queryKey: x.anahtar });
    }
    void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.sablonlar });
    setKaydediliyor(false);
    if (kalan.length === 0) { bildir('tamam', `${satir.baslik}: kaydedildi.`); kapat(); return; }
    bildir('hata', `${kalan.join(', ')} kaydedilemedi: ${hataIletisi(ilkHata, 'bilinmeyen hata')}`);
  };

  const eklenebilir = kisiler.filter((k) => !kisiIdleri.includes(k.id));
  const yEklenebilir = epostaKisileri.filter((k) => !yKisiIdleri.includes(k.id));
  const k = satir.kademe;
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={satir.baslik}
      tur="yan"
      alt={(
        <div className="tc-eposta-eylemler">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!degisti || !gecerli} yukleniyor={kaydediliyor} onClick={() => { void kaydet(); }}>Kaydet</Dugme>
        </div>
      )}
    >
      <div className="tc-eposta-form">
        <p className="tc-eposta-olay">
          <Rozet ton={ONEM_TONU[satir.onem]}>{ONEM_ADI[satir.onem]}</Rozet>
          <Rozet ton="pasif">{modulAdi(satir.kaynakModul)}</Rozet>
          {e && EPOSTA_KONU_ADLARI[e.konu] !== modulAdi(satir.kaynakModul) && <Rozet ton="pasif" gorunum="cizgi">{EPOSTA_KONU_ADLARI[e.konu]}</Rozet>}
        </p>
        {yetki.ayar && (
          <fieldset className="tc-eposta-grup">
            <legend>Alıcılar</legend>
            {a === null ? (
              <p className="tc-ayar-aciklama">Bu olay kayda bağlı kişiye gider (ör. görevi atanan); alıcı seçilmez.</p>
            ) : (
              <>
                <p className="tc-ayar-aciklama">
                  {rolIdleri.length + kisiIdleri.length === 0
                    ? (a.varsayilanIslemler.length === 0 ? 'Seçim yok: yalnız kayda bağlı kişi alır.' : `Seçim yok: ${a.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlar alır.`)
                    : 'Yalnız seçilenler alır; kayda bağlı kişi her durumda alır. Seçim yetki vermez.'}
                </p>
                <div className="tc-cagri-rolleri" role="group" aria-label="Alıcı rolleri">
                  {roller.map((r) => (
                    <IsaretKutusu
                      key={r.id}
                      etiket={r.ad}
                      checked={rolIdleri.includes(r.id)}
                      onChange={(o) => { setRolIdleri(o.target.checked ? [...rolIdleri, r.id].sort((x, y) => x - y) : rolIdleri.filter((x) => x !== r.id)); }}
                    />
                  ))}
                </div>
                <ul className="tc-alici-kisiler" aria-label="Alıcı kişiler">
                  {kisiIdleri.map((id) => (
                    <li key={id}>
                      <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${String(id)}`} çıkar`} onClick={() => { setKisiIdleri(kisiIdleri.filter((x) => x !== id)); }}>
                        {kisiAdi.get(id) ?? `Kişi ${String(id)}`}
                      </Dugme>
                    </li>
                  ))}
                </ul>
                <Secim
                  etiket="Kişi ekle"
                  value=""
                  bosSecenek="Kişi seçin"
                  disabled={eklenebilir.length === 0}
                  secenekler={eklenebilir.map((x) => ({ deger: String(x.id), baslik: x.ad }))}
                  onChange={(o) => { const id = Number(o.target.value); if (id > 0) setKisiIdleri([...kisiIdleri, id].sort((x, y) => x - y)); }}
                />
              </>
            )}
          </fieldset>
        )}
        <fieldset className="tc-eposta-grup">
          <legend>Kanallar</legend>
          <div className="tc-ayar">
            <div className="tc-ayar-metin">
              <p className="tc-ayar-baslik"><Simge ad="bell" boyut="k" /> Uygulama zili</p>
              <p className="tc-ayar-aciklama">Her olay Bildirim Merkezi'ne düşer.</p>
            </div>
            <Rozet ton="tamam">Her zaman</Rozet>
          </div>
          {yetki.ayar && g && (
            <div className="tc-cagri-rolleri" role="group" aria-label="Ekran ortası ve onay">
              <IsaretKutusu etiket="Ekran ortasında" checked={ortada} onChange={(o) => { setOrtada(o.target.checked); }} />
              <IsaretKutusu etiket="Okudum onayı iste" checked={onay} onChange={(o) => { setOnay(o.target.checked); }} />
            </div>
          )}
          {yetki.ayar && satir.push && (
            <div className="tc-ayar">
              <div className="tc-ayar-metin">
                <p className="tc-ayar-baslik"><Simge ad="bolt" boyut="k" /> Telefon bildirimi</p>
                <p className="tc-ayar-aciklama">Kişi cihazında bildirime izin verdiyse gider (Profilim, Telefon bildirimi).</p>
              </div>
              <AcKapa etiket="Telefon bildirimi" acik={telefon} degistir={setTelefon} />
            </div>
          )}
          {yetki.eposta && e && (
            <>
              <div className="tc-ayar">
                <div className="tc-ayar-metin">
                  <p className="tc-ayar-baslik"><Simge ad="mail" boyut="k" /> E-posta</p>
                  <p className="tc-ayar-aciklama">Operatöre e-posta gitmez.</p>
                </div>
                <AcKapa etiket="E-posta gönder" acik={epostaAcik} degistir={setEpostaAcik} />
              </div>
              {epostaAcik && (
                <>
                  <IsaretKutusu etiket="Hemen değil, günlük özette gönder" checked={ozet} onChange={(o) => { setOzet(o.target.checked); }} />
                  <Secim
                    etiket="E-posta şablonu"
                    value={sablonId === null ? '' : String(sablonId)}
                    secenekler={[
                      { deger: '', baslik: `${EPOSTA_KONU_ADLARI[e.konu]} (sistem şablonu)` },
                      ...(sablonlar?.ozel ?? []).map((o) => ({ deger: String(o.id), baslik: o.ad })),
                    ]}
                    onChange={(o) => { setSablonId(o.target.value === '' ? null : Number(o.target.value)); }}
                  />
                  <IsaretKutusu etiket="İş açık kaldıkça tekrarla" checked={tekrar} onChange={(o) => { setTekrar(o.target.checked); }} />
                  {tekrar && (
                    <div className="tc-eposta-satir">
                      <Girdi etiket="Kaç günde bir" inputMode="numeric" value={tekrarGun} hata={hatalar.tekrarGun} onChange={(o) => { setTekrarGun(o.target.value); }} />
                      <Girdi etiket="En çok kaç kez" inputMode="numeric" value={tekrarEnCok} hata={hatalar.tekrarEnCok} onChange={(o) => { setTekrarEnCok(o.target.value); }} />
                    </div>
                  )}
                  <IsaretKutusu etiket="İş açık kalırsa üst kademeye de e-posta gönder" checked={yukselt} onChange={(o) => { setYukselt(o.target.checked); }} />
                  {yukselt && (
                    <>
                      <Girdi etiket="Kaç gün sonra" inputMode="numeric" value={yukseltGun} hata={hatalar.yukseltGun} onChange={(o) => { setYukseltGun(o.target.value); }} />
                      <div className="tc-cagri-rolleri" role="group" aria-label="Üst kademe rolleri">
                        {epostaRolleri.map((r) => (
                          <IsaretKutusu
                            key={r.id}
                            etiket={r.ad}
                            checked={yRolIdleri.includes(r.id)}
                            onChange={(o) => { setYRolIdleri(o.target.checked ? [...yRolIdleri, r.id] : yRolIdleri.filter((x) => x !== r.id)); }}
                          />
                        ))}
                      </div>
                      <ul className="tc-alici-kisiler" aria-label="Üst kademe kişileri">
                        {yKisiIdleri.map((id) => (
                          <li key={id}>
                            <Dugme simge="x" aria-label={`${kisiAdi.get(id) ?? `Kişi ${String(id)}`} çıkar`} onClick={() => { setYKisiIdleri(yKisiIdleri.filter((x) => x !== id)); }}>
                              {kisiAdi.get(id) ?? `Kişi ${String(id)}`}
                            </Dugme>
                          </li>
                        ))}
                      </ul>
                      <Secim
                        etiket="Üst kademeye kişi ekle"
                        value=""
                        bosSecenek="Kişi seçin"
                        hata={hatalar.yukseltKime}
                        disabled={yEklenebilir.length === 0}
                        secenekler={yEklenebilir.map((x) => ({ deger: String(x.id), baslik: x.ad }))}
                        onChange={(o) => { const id = Number(o.target.value); if (id > 0) setYKisiIdleri([...yKisiIdleri, id]); }}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </fieldset>
        {k && (
          <fieldset className="tc-eposta-grup">
            <legend>Kademeli uyarı</legend>
            <p className="tc-ayar-aciklama">
              {`Bu olay ${k.kaynak?.ad ?? 'kaynağın'} K${String(k.no)} (${KADEME_ADLARI[k.no]}) basamağıdır.`}
              {k.kaynak && ` Kaynak ${k.kaynak.acik ? 'açık' : 'kapalı'}; e-posta K${String(k.kaynak.epostaKademe)} ve sonrasında gider.`}
              {' Günler ve yönetici rolü Kademeli uyarı sekmesinde, kaynak başına değişir.'}
            </p>
          </fieldset>
        )}
      </div>
    </Pencere>
  );
}

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
  AcKapa, Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, OnayPenceresi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
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

const ONEM_SIMGESI: Record<BildirimOnemi, SimgeAdi> = { bilgi: 'bell', uyari: 'alert', acil: 'fire' };
const ONEM_TONU: Record<BildirimOnemi, RozetTonu> = { bilgi: 'pasif', uyari: 'uyari', acil: 'hata' };
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

// Seçim yapılmamışsa alıcı varsayılandır (yetkisi olanlar ya da kayda bağlı kişi); tabloda soluk görünür.
export const aliciVarsayilanMi = (m: MatrisSatiri): boolean => m.alici === null || m.alici.surum === null || (m.alici.rolIdleri.length + m.alici.kisiIdleri.length === 0);

export function aliciOzeti(m: MatrisSatiri, rolAdi: ReadonlyMap<number, string>): string {
  const a = m.alici;
  if (a === null) return 'Kayda bağlı kişi';
  if (a.surum === null) return a.varsayilanIslemler.length === 0 ? 'Kayda bağlı kişi' : `Yetkisi olanlar (${a.varsayilanIslemler.map(islemAdi).join(', ')})`;
  const roller = a.rolIdleri.map((id) => rolAdi.get(id) ?? `Rol ${String(id)}`);
  return [...roller, ...(a.kisiIdleri.length > 0 ? [`${String(a.kisiIdleri.length)} kişi`] : [])].join(', ') || 'Kimse';
}

function kademeMetni(m: MatrisSatiri): string | null {
  if (m.kademe) {
    const k = m.kademe.kaynak;
    return `K${String(m.kademe.no)} ${KADEME_ADLARI[m.kademe.no]}${k === null ? '' : k.acik ? '' : ' (kaynak kapalı)'}`;
  }
  if (m.eposta?.yukseltGun != null) return `${String(m.eposta.yukseltGun)} gün sonra yükselir`;
  return null;
}

// 3456 a: kanallar tablodan aç-kapa ile anında yazılır; her yazım bugünkü ucuna, okunan son sürümle gider. Geri al, yazımdan
// sonra yeniden okunan sürümle eski değeri yazar.
export type Kanal = 'ortada' | 'onay' | 'telefon' | 'eposta';
export const KANAL_ADI: Record<Kanal, string> = { ortada: 'Ekran ortası', onay: 'Okudum onayı', telefon: 'Telefon', eposta: 'E-posta' };

export function kanalDegeri(m: MatrisSatiri, k: Kanal): boolean | null {
  if (k === 'ortada') return m.gosterim?.ortada ?? null;
  if (k === 'onay') return m.gosterim?.onayIstenir ?? null;
  if (k === 'telefon') return m.push?.acik ?? null;
  return m.eposta?.eposta ?? null;
}

export const epostaGovdesiAl = (e: EpostaTetikleyiciSatiri, eposta: boolean): EpostaTetikleyiciDegistirGovdesi => ({
  eposta, zaman: e.zaman, tekrarGun: e.tekrarGun, tekrarEnCok: e.tekrarEnCok, yukseltGun: e.yukseltGun,
  yukseltRolIdleri: e.yukseltRolIdleri, yukseltKisiIdleri: e.yukseltKisiIdleri, sablonId: e.sablonId, surum: e.surum,
});

export function kanalYazimi(m: MatrisSatiri, k: Kanal, deger: boolean): { anahtar: readonly string[]; is: () => Promise<unknown> } | null {
  const g = m.gosterim;
  if ((k === 'ortada' || k === 'onay') && g) {
    const govde = { ortada: k === 'ortada' ? deger : g.ortada, onayIstenir: k === 'onay' ? deger : g.onayIstenir, surum: g.surum };
    return { anahtar: MATRIS_ANAHTARI.gosterim, is: () => api.post(`/bildirimler/gosterim/${m.tur}/degistir`, govde) };
  }
  if (k === 'telefon' && m.push) return { anahtar: MATRIS_ANAHTARI.push, is: () => api.post(`/bildirimler/push/turler/${m.tur}/degistir`, { acik: deger }) };
  if (k === 'eposta' && m.eposta) {
    const govde = epostaGovdesiAl(m.eposta, deger);
    return { anahtar: MATRIS_ANAHTARI.tetikleyiciler, is: () => api.post(`/bildirimler/eposta/tetikleyiciler/${m.tur}/degistir`, govde) };
  }
  return null;
}

interface KanalIsi { tur: string; kanal: Kanal; deger: boolean }

function useKanalYazici() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [bekleyen, setBekleyen] = useState<ReadonlySet<string>>(new Set());
  const guncel = (): MatrisSatiri[] => matrisSatirlari({
    alicilar: istemci.getQueryData(MATRIS_ANAHTARI.alicilar), gosterim: istemci.getQueryData(MATRIS_ANAHTARI.gosterim),
    push: istemci.getQueryData(MATRIS_ANAHTARI.push), tetikleyiciler: istemci.getQueryData(MATRIS_ANAHTARI.tetikleyiciler),
    kademe: istemci.getQueryData(MATRIS_ANAHTARI.kademe),
  });
  const anahtar = (x: KanalIsi) => `${x.tur}:${x.kanal}`;
  const yaz = async (isler: readonly KanalIsi[], ozet: string, geriAlinabilir = true): Promise<void> => {
    setBekleyen((o) => new Set([...o, ...isler.map(anahtar)]));
    const satirlar = new Map(guncel().map((m) => [m.tur, m]));
    const yazilan: KanalIsi[] = [];
    const kalan: string[] = [];
    const dokunulan = new Set<readonly string[]>();
    let ilkHata: unknown = null;
    // Tek tek ve sırayla: aynı türün iki kanalı aynı sürümü paylaşır (ekran ortası ve onay), paralel yazım çakışır.
    for (const x of isler) {
      const m = satirlar.get(x.tur);
      const y = m ? kanalYazimi(m, x.kanal, x.deger) : null;
      if (!m || !y) continue;
      try {
        await y.is();
        yazilan.push({ ...x, deger: !x.deger });
        dokunulan.add(y.anahtar);
      } catch (h) { kalan.push(m.baslik); ilkHata ??= h; dokunulan.add(y.anahtar); }
    }
    await Promise.all([...dokunulan].map((k) => istemci.invalidateQueries({ queryKey: k })));
    setBekleyen((o) => { const y = new Set(o); for (const x of isler) y.delete(anahtar(x)); return y; });
    if (kalan.length > 0) {
      bildir('hata', `${kalan.join(', ')}: kaydedilemedi. ${hataIletisi(ilkHata, 'Bilinmeyen hata.')}`);
      return;
    }
    if (yazilan.length === 0) return;
    bildir('tamam', ozet, geriAlinabilir ? { eylem: { etiket: 'Geri al', yap: () => { void yaz(yazilan, 'Geri alındı.', false); } } } : undefined);
  };
  return { yaz, bekliyor: (tur: string, kanal: Kanal) => bekleyen.has(`${tur}:${kanal}`) };
}

// Grubun kanal anahtarı üç durumludur (hepsi, bazıları, hiç); switch rolü üç durumu taşımadığı için checkbox rolündedir.
function TopluAnahtar({ etiket, satirlar, kanal, degistir, disabled }: {
  etiket: string; satirlar: readonly MatrisSatiri[]; kanal: Kanal; degistir: (deger: boolean, hedef: readonly MatrisSatiri[]) => void; disabled: boolean;
}) {
  const olan = satirlar.filter((m) => kanalDegeri(m, kanal) !== null);
  if (olan.length === 0) return null;
  const acik = olan.filter((m) => kanalDegeri(m, kanal) === true).length;
  const durum = acik === 0 ? 'false' : acik === olan.length ? 'true' : 'mixed';
  const yeni = durum !== 'true';
  return (
    <span className="tc-matris-toplu">
      <button
        type="button" role="checkbox" aria-checked={durum} aria-label={`${etiket}: ${KANAL_ADI[kanal]}, ${String(acik)}/${String(olan.length)} açık`}
        className="tc-ackapa tc-matris-toplu-dugme" disabled={disabled}
        onClick={() => { degistir(yeni, olan.filter((m) => kanalDegeri(m, kanal) !== yeni)); }}
      >
        <span className="tc-ackapa-ray" aria-hidden="true"><span className="tc-ackapa-top" /></span>
        <span className="tc-matris-toplu-ad">{KANAL_ADI[kanal]}</span>
      </button>
      <span className="tc-matris-toplu-sayi">{`${String(acik)}/${String(olan.length)} açık`}</span>
    </span>
  );
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
  const { yaz, bekliyor } = useKanalYazici();
  const [arama, setArama] = useState('');
  const [modul, setModul] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const [topluSor, setTopluSor] = useState<{ grup: string; kanal: Kanal; hedef: readonly MatrisSatiri[] } | null>(null);

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
  const kanallar: Kanal[] = [...(ayar ? ['ortada', 'onay', 'telefon'] as const : []), ...(eposta ? ['eposta'] as const : [])];

  const tekYaz = (m: MatrisSatiri, k: Kanal, deger: boolean) => {
    void yaz([{ tur: m.tur, kanal: k, deger }], `${m.baslik}: ${KANAL_ADI[k]} ${deger ? 'açıldı' : 'kapandı'}.`);
  };
  const topluYaz = (grup: string, k: Kanal, hedef: readonly MatrisSatiri[], deger: boolean) => {
    void yaz(hedef.map((m) => ({ tur: m.tur, kanal: k, deger })), `${grup}: ${String(hedef.length)} olayda ${KANAL_ADI[k]} ${deger ? 'açıldı' : 'kapandı'}.`);
  };
  // E-posta ve okudum onayı toptan açılınca kişilere yeni yük düşer; önce kaç olayı etkilediği sorulur. Kapatma anında, Geri al ile.
  const topluDegistir = (grup: string, k: Kanal) => (deger: boolean, hedef: readonly MatrisSatiri[]) => {
    if (hedef.length === 0) return;
    if (deger && (k === 'eposta' || k === 'onay')) { setTopluSor({ grup, kanal: k, hedef }); return; }
    topluYaz(grup, k, hedef, deger);
  };

  const anahtarHucresi = (k: Kanal) => (m: MatrisSatiri) => {
    const d = kanalDegeri(m, k);
    if (d === null) return <span className="tc-matris-yok">—</span>;
    return (
      <span className="tc-matris-anahtar">
        <AcKapa etiket={`${m.baslik}: ${KANAL_ADI[k]}`} acik={d} disabled={bekliyor(m.tur, k)} degistir={(y) => { tekYaz(m, k, y); }} />
        {k === 'eposta' && m.eposta?.eposta && (
          <span className="tc-matris-alt">
            {m.eposta.zaman === 'hemen' ? 'Hemen' : 'Özet'}
            {m.eposta.sablonId !== null && ` · ${ozelAdi.get(m.eposta.sablonId) ?? 'Şablon'}`}
          </span>
        )}
      </span>
    );
  };
  const kanalCsv = (k: Kanal) => (m: MatrisSatiri) => { const d = kanalDegeri(m, k); return d === null ? '' : d ? 'Açık' : 'Kapalı'; };
  const sutunlar: Sutun<MatrisSatiri>[] = [
    {
      anahtar: 'olay', baslik: 'Olay', kartTamSatir: true, csv: (m) => m.baslik,
      hucre: (m) => {
        const km = kademeMetni(m);
        return (
          <span className="tc-eposta-olay-hucre">
            <span className={`tc-matris-onem tc-matris-onem-${m.onem}`} title={ONEM_ADI[m.onem]}><Simge ad={ONEM_SIMGESI[m.onem]} boyut="k" /></span>
            <span className="tc-matris-olay">
              <span>{m.baslik}</span>
              {km !== null && <span className="tc-matris-alt">{km}</span>}
            </span>
          </span>
        );
      },
    },
    ...kanallar.map((k): Sutun<MatrisSatiri> => ({ anahtar: k, baslik: KANAL_ADI[k], csv: kanalCsv(k), hucre: anahtarHucresi(k) })),
    ...(ayar ? [{
      anahtar: 'alicilar', baslik: 'Alıcılar', kartTamSatir: true, csv: (m: MatrisSatiri) => aliciOzeti(m, rolAdi),
      hucre: (m: MatrisSatiri) => (aliciVarsayilanMi(m) ? <span className="tc-matris-varsayilan">{`${aliciOzeti(m, rolAdi)} (varsayılan)`}</span> : aliciOzeti(m, rolAdi)),
    }] satisfies Sutun<MatrisSatiri>[] : []),
    {
      anahtar: 'ayrinti', baslik: 'Ayrıntı', csv: false,
      hucre: (m) => <Dugme simge="edit" aria-label={`${m.baslik}: ayrıntı`} onClick={() => { setAcik(m.tur); }} />,
    },
  ];
  return (
    <Kart baslik="Olaylar ve kanallar">
      <p className="tc-ayar-aciklama">
        Anahtar basınca hemen kaydedilir; birkaç saniye Geri al çıkar. Modül başlığındaki anahtar o modülün görünen bütün olaylarını değiştirir.
        Alıcılar, e-posta şablonu, tekrar ve üst kademe kalem düğmesiyle açılan paneldedir. Uygulama zili her olayda açıktır.
      </p>
      <Tablo
        etiket="Bildirim olayları"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(m) => m.tur}
        bosMesaj="Bu süzgece uyan olay yok."
        grup={{
          yol: (m) => [m.kaynakModul],
          baslik: (yol) => modulAdi(yol[0] ?? ''),
          on: (yol, grupSatirlari) => {
            const ad = modulAdi(yol[0] ?? '');
            return (
              <span className="tc-matris-toplular" role="group" aria-label={`${ad}: bütün olaylar`}>
                {kanallar.map((k) => (
                  <TopluAnahtar
                    key={k} etiket={ad} satirlar={grupSatirlari} kanal={k} degistir={topluDegistir(ad, k)}
                    disabled={grupSatirlari.some((m) => bekliyor(m.tur, k))}
                  />
                ))}
              </span>
            );
          },
        }}
        arac={{
          arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' },
          suzgec: {
            etiket: 'Modül', secili: modul, sec: setModul,
            secenekler: [{ deger: '', baslik: 'Bütün modüller' }, ...moduller.map((m) => ({ deger: m, baslik: modulAdi(m) }))],
          },
          csv: { ad: 'bildirim-olaylari' },
        }}
      />
      {topluSor && (
        <OnayPenceresi
          acik
          baslik={`${topluSor.grup}: ${KANAL_ADI[topluSor.kanal]} açılsın mı?`}
          onayMetni={`${String(topluSor.hedef.length)} olayda aç`}
          vazgec={() => { setTopluSor(null); }}
          onayla={() => { topluYaz(topluSor.grup, topluSor.kanal, topluSor.hedef, true); setTopluSor(null); }}
        >
          <p>
            {`${String(topluSor.hedef.length)} olayda ${KANAL_ADI[topluSor.kanal].toLocaleLowerCase('tr')} açılacak`}
            {topluSor.kanal === 'eposta' ? '; alıcılara e-posta gitmeye başlar.' : '; kişi onaylamadan bildirim arşive kalkmaz.'}
            {' Sonradan tek tek kapatabilirsiniz.'}
          </p>
        </OnayPenceresi>
      )}
      {secili && (
        <OlayPaneli
          key={`${secili.tur}:${String(secili.alici?.surum)}:${String(secili.eposta?.surum)}`}
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
  const e = satir.eposta;
  const [rolIdleri, setRolIdleri] = useState(a?.rolIdleri ?? []);
  const [kisiIdleri, setKisiIdleri] = useState(a?.kisiIdleri ?? []);
  // Kanalların aç-kapası tablodadır (3456 a); panel yalnız alıcıyı ve açık e-postanın ayrıntısını değiştirir.
  const epostaAcik = e?.eposta ?? false;
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
        <p className="tc-ayar-aciklama">Kanallar tablodan anında kaydedilir; burada alıcı ve e-posta ayrıntısı değişir.</p>
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
        {yetki.eposta && e && (
          <fieldset className="tc-eposta-grup">
            <legend>E-posta ayrıntısı</legend>
            {!epostaAcik && <p className="tc-ayar-aciklama">Bu olayda e-posta kapalı; tablodaki E-posta anahtarıyla açılır.</p>}
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
          </fieldset>
        )}
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

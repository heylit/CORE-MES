import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Menu, OnayPenceresi, Simge, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import type { HazirlikCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ilkParcaKarari } from '../../../../../../arkon/web/src/data/ilk-parca.ts';
import { paketleriGrupla, type GrupAdi, type PaketGrubu } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import { YOK, sayi } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI } from '../cekirdek/sabitler.ts';
import { baslamaDurumu, BASLAMA_DURUMLARI, type BaslamaDurumu, type HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import { BeklemeCipi, Cip } from './denetimler.tsx';
import { MADDE_SIRASI, hazirlikBeklenir, paketHazirligi } from './HazirlikTakibi.tsx';
import {
  PAKET_DURUMLARI, TAKIP_SUZGECLERI, calisiyorMu, geriCekilebilir, topluGeriCekilebilir, takipEmirleri,
  type AdimDilimi, type TakipSatiri, type TakipSuzgeci,
} from './kurallar.ts';
import { kmDoldurulabilir, kmPlanBagsiz } from './km-cizim.ts';
import {
  HUCRE_GORUNUMU, MADDE_SUTUNLARI, SUTUNLAR, emirHucresi, enKotuIlkParca, gizliOku, hucreOzeti, ilkParcaDurumu, planBilgisi, sorunluMu,
  type HucreDurumu, type IlkParcaDurumu, type SutunAnahtari, type SutunSecenegi,
} from './HazirlikOzeti.ts';
import { PlanCipi } from './PlanCipi.tsx';
import { topluGonderilebilir } from './toplu.ts';
import type { Pkg, Result, Ton } from './tipler.ts';

// 3111, 3606-2: Üretim Terminali Hazırlık'ın tek listesi. Emir (ya da seçilen grup) başlığı altında her adım tek satır: adım, paket,
// hazırlık (durum ve eksik maddelerin adı), üretim. Seçilenler terminale toplu gönderilir, benzer paketten ya da Kalite Merkezi'nden
// doldurulur, operatörden geri çekilir (pencereler TopluPencereler.tsx'te; yazma ve yetki öncekiyle aynı).
// Bütün maddeleri ızgarada görmek Adım Durumu sayfasındadır; burada yalnız eksik ve uyarılı maddeler adıyla görünür.
interface Ozellikler {
  paketler: readonly Pkg[];
  sonuclar: Readonly<Record<string, Result>>;
  hazirlik: ReadonlyMap<number, HazirlikCevabi>;
  // Okuma bitti mi (başarıyla ya da değil): bitmeden hücrenin yeri ayrılır, bittikten sonra veri yoksa hiçbir şey çizilmez.
  hazirlikOkundu: boolean;
  suz: TakipSuzgeci;
  suzYaz: (d: TakipSuzgeci) => void;
  // Süzgeç menüsündeki "Eksik madde" seçimi; boşsa süzülmez.
  eksikMadde: HazirlikMaddesi | '';
  grup: PaketGrubu;
  grupAdi?: GrupAdi;
  yayinlar: boolean;
  seciliId: string | null;
  // Madde çipi paketin ilgili sekmesini açar: talimat "Talimat ve adımlar", ötekiler "Terminale gönder" (maddeler orada).
  ac: (p: Pkg, sekme?: 'steps' | 'pub', tiklanan?: HTMLElement) => void;
  geriCekSor: (l: readonly Pkg[], toplu: boolean) => void;
  duzenler: boolean;
  gonderSor: (l: readonly Pkg[]) => void;
  benzerSor: (l: readonly Pkg[]) => void;
  kmDoldurSor: (l: readonly Pkg[]) => void;
  kmYenileSor: (l: readonly Pkg[]) => void;
}

const saat = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const DILIM_ADI: Readonly<Record<AdimDilimi, string>> = {
  bitti: 'Tamamlandı', calisiyor: 'Çalışıyor', durdu: 'Duraklatıldı ya da durdu', sirada: 'Sırada', taslak: 'Taslak', yok: 'Paket yok',
};
const BASLAMA_TONU: Readonly<Record<BaslamaDurumu, Ton>> = { durur: 'stop', uyari: 'hold', hazir: 'run' };
// Eksik maddeler: durduranlar önce, sonra uyarılılar, sabit madde sırasıyla.
export function eksikMaddeler(l: readonly HazirlikSatiri[]): { madde: HazirlikMaddesi; durdurur: boolean }[] {
  return l.filter((x) => x.hal === 'eksik')
    .map((x) => ({ madde: x.madde, durdurur: !x.uyarir }))
    .sort((a, b) => Number(b.durdurur) - Number(a.durdurur) || MADDE_SIRASI[a.madde] - MADDE_SIRASI[b.madde]);
}

// Satırın hazırlık durumu (null: okunamadı ya da bitmiş iş). Durur, Uyarılı ve eksik madde süzgeçleri bunu ister.
const satirDurumu = (hz: ReadonlyMap<number, HazirlikCevabi>, x: TakipSatiri): BaslamaDurumu | null => {
  const h = x.paket ? paketHazirligi(hz, x.paket) : null;
  return h ? baslamaDurumu(h) : null;
};
// 3795: "Plan bağsız" süzgeci kontrol planı dolu ama Kalite Merkezi'ne bağlı olmayan paketleri gösterir (satırdaki işaret de bu süzgeci açar).
export function ekSuzgec(hz: ReadonlyMap<number, HazirlikCevabi>, d: TakipSuzgeci, eksikMadde: HazirlikMaddesi | ''): ((x: TakipSatiri) => boolean) | null {
  const durumSart = d === 'durur' || d === 'uyari' ? (x: TakipSatiri) => satirDurumu(hz, x) === d
    : d === 'kmBagsiz' ? (x: TakipSatiri) => !!x.paket && kmPlanBagsiz(x.paket) : null;
  if (eksikMadde === '') return durumSart;
  return (x) => {
    const h = x.paket ? paketHazirligi(hz, x.paket) : null;
    return !!h && h.some((m) => m.madde === eksikMadde && m.hal === 'eksik') && (durumSart === null || durumSart(x));
  };
}

// 3816: hücre maddenin hâlini simge ve yazıyla söyler (renk tek başına anlam taşımaz). Yalnız sorunlu hücre düğmedir ve paketi
// maddenin bulunduğu sekmede açar; sorunsuz hücre odaklanmaz.
function OzetHucresi({ durum, madde, etiket, ek, yazi, bekliyor, ac }: {
  durum: HucreDurumu; madde: HazirlikMaddesi | null; etiket: string; ek?: string; yazi?: string; bekliyor?: boolean; ac?: (el: HTMLElement) => void;
}) {
  if (durum === 'yok') return bekliyor ? <span className="tc-ay2-takip-yer" aria-hidden="true" /> : yazi ? <span className="tc-ay2-takip-tek">{yazi}</span> : <span className="tc-ay2-soluk">{YOK}</span>;
  const g = HUCRE_GORUNUMU[durum];
  const ad = madde ? HAZIRLIK_MADDE_BILGISI[madde].ad : '';
  const icerik = <>{g.simge ? <Simge ad={g.simge} boyut="k" /> : null}{yazi ?? g.metin}{ek ? <small> · {ek}</small> : null}</>;
  if (sorunluMu(durum) && ac) {
    return (
      <button
        type="button" className="tc-ay2-takip-madde" data-ton={g.ton === 'stop' ? 'stop' : 'hold'}
        title={`${ad}: ${durum === 'durur' ? 'eksik, başlatmayı durdurur' : 'eksik, uyarıyla başlar'}`}
        aria-label={`${etiket}: ${ad} ${durum === 'durur' ? 'eksik' : 'uyarılı'}${ek ? `, ${ek}` : ''}, paketi aç`}
        onClick={(o) => { o.stopPropagation(); ac(o.currentTarget); }}
      >{icerik}</button>
    );
  }
  return <span className="tc-ay2-takip-hal" data-ton={g.ton} title={ad ? `${ad}: ${g.metin}` : undefined}>{icerik}</span>;
}

const MADDE_INDEKSI: ReadonlyMap<string, number> = new Map(MADDE_SUTUNLARI.map((k, i) => [k.anahtar, i]));
const GIZLI_ANAHTARI = 'tmi.hazirlik.gizli-sutunlar';
const gizliYukle = (): ReadonlySet<SutunAnahtari> => { try { return gizliOku(window.localStorage.getItem(GIZLI_ANAHTARI)); } catch { return gizliOku(null); } };

// 3820: termin riski tek dil: turuncu saat ve yazı (Arayüz tur 2, 5).
function TerminRiski({ ek }: { ek?: string }) {
  return <span className="tc-ay2-takip-hal" data-ton="hold" title="Plan bitişi terminden sonra"><Simge ad="clock" boyut="k" />Termin sonrası bitiyor{ek ? <small> · {ek}</small> : null}</span>;
}
const ILK_PARCA_GORUNUMU: Readonly<Record<Exclude<IlkParcaDurumu, null>, { simge: 'check' | 'alert' | 'clock'; metin: string; ton: 'run' | 'hold' | 'idle' }>> = {
  onay: { simge: 'check', metin: 'Onaylı', ton: 'run' },
  ret: { simge: 'alert', metin: 'Reddedildi', ton: 'hold' },
  bekliyor: { simge: 'clock', metin: 'Karar bekliyor', ton: 'idle' },
};
function IlkParcaHucresi({ durum }: { durum: IlkParcaDurumu }) {
  if (durum === null) return <span className="tc-ay2-soluk">{YOK}</span>;
  const g = ILK_PARCA_GORUNUMU[durum];
  return <span className="tc-ay2-takip-hal" data-ton={g.ton} title="İlk parça kararı Kalite Merkezi'nde verilir"><Simge ad={g.simge} boyut="k" />{g.metin}</span>;
}

// Sütun seçimi tarayıcıda kalır (kişiye özel görünüm, veri değil). Gizli sütunda sorun varsa düğme söyler; eksik gizlenip unutulmasın.
// Açılır menü: Esc ve dışarı tıklama kapatır (Esc'te odak düğmeye döner).
function SutunSecici({ gizli, gizliYaz, sorunluGizli }: { gizli: ReadonlySet<SutunAnahtari>; gizliYaz: (g: ReadonlySet<SutunAnahtari>) => void; sorunluGizli: readonly string[] }) {
  const degistir = (a: SutunAnahtari, goster: boolean) => { const y = new Set(gizli); if (goster) y.delete(a); else y.add(a); gizliYaz(y); };
  const ref = useRef<HTMLDetailsElement>(null);
  const [acik, acikYaz] = useState(false);
  useEffect(() => {
    if (!acik) return undefined;
    const kapat = () => { if (ref.current) ref.current.open = false; };
    const tik = (o: PointerEvent) => { if (o.target instanceof Node && !ref.current?.contains(o.target)) kapat(); };
    const tus = (o: KeyboardEvent) => {
      if (o.key !== 'Escape' || !(o.target instanceof Node) || !ref.current?.contains(o.target)) return;
      o.preventDefault(); kapat(); ref.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', tik);
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('pointerdown', tik); document.removeEventListener('keydown', tus); };
  }, [acik]);
  return (
    <details className="tc-ay2-takip-sutunlar" ref={ref} onToggle={(o) => acikYaz(o.currentTarget.open)}>
      <summary title={sorunluGizli.length ? `Gizli sütunda sorun var: ${sorunluGizli.join(', ')}` : undefined}>
        <Simge ad="list" boyut="k" />Sütunlar{gizli.size ? <small> · {gizli.size} gizli</small> : null}
        {sorunluGizli.length ? <span className="tc-ay2-takip-hal" data-ton="hold"><Simge ad="alert" boyut="k" />{sorunluGizli.length} sütunda sorun</span> : null}
      </summary>
      <fieldset>
        <legend className="tc-gizli-etiket">Görünen sütunlar</legend>
        <button type="button" className="tc-ay2-takip-hepsi" onClick={() => gizliYaz(gizliOku(null))}>Varsayılana dön</button>
        {SUTUNLAR.map((k) => (
          <label key={k.anahtar}>
            <input type="checkbox" checked={!gizli.has(k.anahtar)} onChange={(o) => degistir(k.anahtar, o.target.checked)} />
            <span>{k.baslik.startsWith(k.grup) ? null : <small>{k.grup}</small>} {k.baslik}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export function TakipTablosu({
  paketler, sonuclar, hazirlik, hazirlikOkundu, suz, suzYaz, eksikMadde, grup, grupAdi, yayinlar, seciliId, ac, geriCekSor, duzenler, gonderSor, benzerSor, kmDoldurSor, kmYenileSor,
}: Ozellikler) {
  const gruplar = useMemo(() => paketleriGrupla(paketler, grup, grupAdi), [paketler, grup, grupAdi]);
  const durumu = (x: TakipSatiri) => satirDurumu(hazirlik, x);
  const emirGrubu = grup === 'emir';
  const emirler = useMemo(
    () => takipEmirleri(gruplar, sonuclar, hazirlik, suz, ekSuzgec(hazirlik, suz, eksikMadde), emirGrubu),
    [gruplar, sonuclar, hazirlik, suz, eksikMadde, emirGrubu],
  );
  // Çipteki sayı o süzgeçte görünecek iş sayısıdır ("Paket yok"ta paketsiz adım sayısı).
  const sayilar = useMemo(() => new Map(TAKIP_SUZGECLERI.map(([k]) => {
    const l = takipEmirleri(gruplar, sonuclar, hazirlik, k, ekSuzgec(hazirlik, k, eksikMadde), emirGrubu).flatMap((e) => e.satirlar);
    return [k, l.filter((x) => (k === 'paketsiz' ? !x.paket : !!x.paket)).length] as const;
  })), [gruplar, sonuclar, hazirlik, eksikMadde, emirGrubu]);
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(() => new Set());
  // 3816: emir satırı tek satırdır; operasyonlar açılır. Kullanıcının açıp kapadığı hatırlanır; seçili paketin emri ve tek emirli liste açık gelir.
  const [acilan, acilanYaz] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const acikMi = (anahtar: string, satirlar: readonly TakipSatiri[]) =>
    acilan.get(anahtar) ?? (emirler.length === 1 || (seciliId !== null && satirlar.some((x) => x.paket?.id === seciliId)));
  const acKapa = (anahtar: string, on: boolean) => acilanYaz((o) => new Map(o).set(anahtar, on));
  const hepsiAcik = emirler.length > 0 && emirler.every((e) => acikMi(e.anahtar, e.satirlar));
  const hepsiniAc = (on: boolean) => acilanYaz(new Map(emirler.map((e) => [e.anahtar, on])));
  // 3820: görünen sütunlar ve operasyon satırının hücre verisi (hazırlık özeti, plan, ilk parça).
  const [gizli, gizliYaz] = useState<ReadonlySet<SutunAnahtari>>(gizliYukle);
  const gizliKaydet = (g: ReadonlySet<SutunAnahtari>) => { gizliYaz(g); try { window.localStorage.setItem(GIZLI_ANAHTARI, JSON.stringify([...g])); } catch { /* tarayıcı saklamıyorsa bu oturumda kalır */ } };
  const sutunlar = SUTUNLAR.filter((k) => !gizli.has(k.anahtar));
  const opBilgileri = (satirlar: readonly TakipSatiri[]) => satirlar.map((s) => {
    const p = s.paket;
    const h = p ? paketHazirligi(hazirlik, p) : null;
    const okundu = !!p && hazirlikOkundu && hazirlikBeklenir(p);
    return {
      s, h, hucreler: MADDE_SUTUNLARI.map((k) => hucreOzeti(p && !s.bitti ? h : [], k, okundu)),
      plan: planBilgisi(p ?? {}), ilkParca: p && !s.bitti ? ilkParcaDurumu(p, ilkParcaKarari(p)) : null,
    };
  });
  const sorunluGizli = SUTUNLAR.filter((k) => gizli.has(k.anahtar) && emirler.some((e) => opBilgileri(e.satirlar).some((x) => {
    if (x.s.bitti || !x.s.paket) return false;
    const i = MADDE_INDEKSI.get(k.anahtar);
    if (i !== undefined) return sorunluMu(x.hucreler[i]!.durum);
    return (k.anahtar === 'planBas' && x.plan.terminRiski) || (k.anahtar === 'ilkParca' && x.ilkParca === 'ret');
  }))).map((k) => k.baslik);
  // Kaydırma ipucu: sabit Durum'un altında kalan sütun sayısı (Arayüz tur 2, 6). Yana kaymayan tabloda yok.
  const kaydirRef = useRef<HTMLDivElement>(null);
  const [sagda, sagdaYaz] = useState(0);
  const sagdakiniOlc = useCallback(() => {
    const kap = kaydirRef.current;
    if (!kap || kap.scrollWidth <= kap.clientWidth + 1) { sagdaYaz(0); return; }
    const durum = kap.querySelector('thead .tc-ay2-takip-durum');
    const sinir = (durum && getComputedStyle(durum).position === 'sticky' ? durum.getBoundingClientRect().left : kap.getBoundingClientRect().right) - 4;
    sagdaYaz([...kap.querySelectorAll('thead th[data-sutun]')].filter((th) => th.getBoundingClientRect().right > sinir).length);
  }, []);
  useEffect(() => {
    sagdakiniOlc();
    const kap = kaydirRef.current;
    if (!kap || typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(sagdakiniOlc);
    g.observe(kap);
    return () => g.disconnect();
  }, [sagdakiniOlc, gizli, emirler]);
  // Seçilebilir: yayındaki başlamamış iş (geri çekme) ya da gönderilebilir iş (3362-1). Başlamış iş tek tek çekilir.
  const secilebilirMi = (p: Pkg, r: Result | null | undefined) => topluGeriCekilebilir(p, r) || topluGonderilebilir(p, r);
  const secilebilir = useMemo(() => new Set(emirler.flatMap((e) => e.satirlar.flatMap((s) => (s.paket && secilebilirMi(s.paket, s.sonuc) ? [s.paket.id] : [])))), [emirler]);
  const gecerli = [...secili].filter((id) => secilebilir.has(id));
  const isaretle = (ids: readonly string[], on: boolean) => seciliYaz((o) => { const y = new Set(o); for (const id of ids) { if (on) y.add(id); else y.delete(id); } return y; });
  const seciliPaketler = () => paketler.filter((p) => gecerli.includes(p.id));
  const sonucu = (p: Pkg) => sonuclar[p.id];
  const gonderilecek = seciliPaketler().filter((p) => topluGonderilebilir(p, sonucu(p)));
  const cekilecek = seciliPaketler().filter((p) => topluGeriCekilebilir(p, sonucu(p)));
  const doldurulacak = seciliPaketler().filter((p) => p.status === 'draft');
  const kmDoldurulacak = seciliPaketler().filter(kmDoldurulabilir);
  const kmYenilenecek = seciliPaketler().filter(kmPlanBagsiz);

  // Telefonda çubuk tek satır kalsın: tek birincil işlem görünür (gönder; gönderilecek yoksa geri çek), gerisi tek menüde.
  const cekGorunur = !gonderilecek.length && cekilecek.length > 0;
  const digerIslemler: MenuOgesi[] = [
    ...(cekilecek.length && !cekGorunur ? [{ anahtar: 'cek', baslik: `${String(cekilecek.length)} işi operatörden geri çek`, simge: 'rotate' as const, ton: 'tehlike' as const, sec: () => geriCekSor(cekilecek, true) }] : []),
    ...(duzenler && doldurulacak.length ? [{ anahtar: 'benzer', baslik: 'Benzer paketten al', simge: 'layers' as const, sec: () => benzerSor(doldurulacak) }] : []),
    ...(duzenler ? [{
      anahtar: 'km', baslik: 'Kalite Merkezi’nden doldur', simge: 'target' as const, sec: () => kmDoldurSor(kmDoldurulacak),
      pasif: !kmDoldurulacak.length, pasifNedeni: kmDoldurulacak.length ? undefined : 'Seçilenlerin hepsi dolu ya da Kalite Merkezi’ne bağlı',
    }] : []),
    ...(duzenler ? [{
      anahtar: 'kmYenile', baslik: 'Kalite Merkezi’nden yenile', simge: 'rotate' as const, sec: () => kmYenileSor(kmYenilenecek),
      pasif: !kmYenilenecek.length, pasifNedeni: kmYenilenecek.length ? undefined : 'Seçilenlerde Kalite Merkezi’ne bağsız plan yok',
    }] : []),
    { anahtar: 'kaldir', baslik: 'Seçimi kaldır', simge: 'x', sec: () => seciliYaz(new Set()) },
  ];

  return (
    <div className="tc-ay2-takip">
      <div className="tc-ay2-takip-cipler" role="group" aria-label="İş durumu">
        {TAKIP_SUZGECLERI.map(([k, l]) => {
          const n = sayilar.get(k) ?? 0;
          if (k === 'kmBagsiz' && n === 0 && suz !== k) return null;
          return (
            <button key={k} type="button" className="tc-ay2-takip-cip" aria-pressed={suz === k} data-sifir={n === 0 ? '' : undefined} data-ton={k === 'durur' && n ? 'stop' : undefined} onClick={() => suzYaz(k)}>
              {l} <span className="tc-ay2-takip-cip-sayi">{n}</span>
            </button>
          );
        })}
      </div>
      {yayinlar && gecerli.length ? (
        <div className="tc-ay2-takip-toplu" role="toolbar" aria-label="Seçilenler">
          <span role="status">{gecerli.length} iş seçili</span>
          {gonderilecek.length ? <Dugme tur="birincil" simge="next" title={`${String(gonderilecek.length)} işi terminale gönder`} onClick={() => gonderSor(gonderilecek)}>{gonderilecek.length} işi gönder</Dugme> : null}
          {cekGorunur ? <Dugme tur="tehlike" simge="rotate" title={`${String(cekilecek.length)} işi operatörden geri çek`} onClick={() => geriCekSor(cekilecek, true)}>{cekilecek.length} işi geri çek</Dugme> : null}
          <Menu etiket="Seçilenler için diğer işlemler" ipucu="Diğer işlemler" ogeler={digerIslemler} />
        </div>
      ) : null}
      {emirler.length === 0 ? <p className="tc-ay2-soluk tc-ay2-bos-satir">{paketler.length ? 'Bu durumda iş yok.' : 'Paket yok.'}</p> : null}
      <div className="tc-ay2-takip-ust">
        <SutunSecici gizli={gizli} gizliYaz={gizliKaydet} sorunluGizli={sorunluGizli} />
        {sagda > 0 ? <p className="tc-ay2-takip-sagda" aria-hidden="true"><Simge ad="chev-right" boyut="k" />Sağda {sagda} sütun daha · yana kaydır</p> : null}
        {emirler.length > 1 ? (
          <button type="button" className="tc-ay2-takip-hepsi" aria-pressed={hepsiAcik} onClick={() => hepsiniAc(!hepsiAcik)}>
            <Simge ad={hepsiAcik ? 'up' : 'down'} boyut="k" />{hepsiAcik ? 'Operasyonları kapat' : 'Bütün operasyonları aç'}
          </button>
        ) : null}
      </div>
      <div className="tc-ay2-takip-kaydir-kap" data-sagda={sagda > 0 ? '' : undefined}>
      <div className="tc-ay2-takip-kaydir" role="region" aria-label="Hazırlık tablosu, yana kaydırılır" tabIndex={0} ref={kaydirRef} onScroll={sagdakiniOlc}>
      <table className="tc-ay2-takip-tablo" aria-label="Hazırlık listesi" data-kutulu={yayinlar ? '' : undefined}>
        <thead>
          <tr>
            {yayinlar ? <th scope="col" className="tc-ay2-takip-kutu tc-ay2-takip-sabit"><span className="tc-gizli-etiket">Seç</span></th> : null}
            <th scope="col" className="tc-ay2-takip-ad tc-ay2-takip-sabit">Emir · adım</th>
            {sutunlar.map((k) => <th key={k.anahtar} scope="col" data-sutun={k.anahtar}><small>{k.grup}</small>{k.baslik}</th>)}
            <th scope="col" className="tc-ay2-takip-durum">Durum</th>
          </tr>
        </thead>
        {emirler.map((e) => {
          const emirde = e.satirlar.flatMap((s) => (s.paket && secilebilir.has(s.paket.id) ? [s.paket.id] : []));
          const secilen = emirde.filter((id) => secili.has(id)).length;
          const hepsi = emirde.length > 0 && secilen === emirde.length;
          // "Hazır" sayısı açık adımların hazırlığıdır: paketsiz ve bitmiş adım paydadadır ama hazır sayılmaz (renk tek başına anlam taşımaz).
          const acikAdim = e.satirlar.filter((s) => !s.bitti);
          const hazir = acikAdim.filter((s) => durumu(s) === 'hazir').length;
          const durur = acikAdim.filter((s) => durumu(s) === 'durur').length;
          const uyarili = acikAdim.filter((s) => durumu(s) === 'uyari').length;
          const oplar = opBilgileri(e.satirlar);
          const acikOplar = oplar.filter((x) => !x.s.bitti && x.s.paket);
          const acik = acikMi(e.anahtar, e.satirlar);
          const bagsiz = e.satirlar.filter((s) => s.paket && kmPlanBagsiz(s.paket)).length;
          const calisan = e.satirlar.filter((s) => s.sonuc && IS_DURUMLARI[s.sonuc.state] && s.durum === 'production');
          const kisiler = [...new Set(acikOplar.flatMap((x) => (x.plan.kisi ? [x.plan.kisi] : [])))];
          const basla = acikOplar.reduce<number | null>((a, x) => (x.plan.baslangic !== null && (a === null || x.plan.baslangic < a) ? x.plan.baslangic : a), null);
          const riskli = acikOplar.filter((x) => x.plan.terminRiski).length;
          const ilk = enKotuIlkParca(acikOplar.map((x) => x.ilkParca));
          const fason = e.satirlar.some((s) => s.paket?.tmi?.fasonDonusu === true);
          const govdeId = `takip-${e.anahtar}`;
          const emirHucresiCiz = (k: SutunSecenegi) => {
            const i = MADDE_INDEKSI.get(k.anahtar);
            if (i !== undefined) {
              const o = emirHucresi(acikOplar.map((x) => x.hucreler[i]!));
              const ilkOp = o.ilk === null ? null : acikOplar[o.ilk] ?? null;
              return (
                <td key={k.anahtar} data-etiket={k.baslik} data-hal={o.durum}>
                  <OzetHucresi
                    durum={o.durum} ek={o.sorunlu > 1 ? `${String(o.sorunlu)} op` : undefined} bekliyor={!hazirlikOkundu && o.durum === 'yok' && acikAdim.length > 0}
                    etiket={`${e.no} ${k.baslik}`} madde={o.madde}
                    ac={ilkOp && ilkOp.s.paket && o.madde ? (el) => ac(ilkOp.s.paket!, o.madde === 'talimat' ? 'steps' : 'pub', el) : undefined}
                  />
                </td>
              );
            }
            switch (k.anahtar) {
              case 'kisi': return <td key={k.anahtar} data-etiket={k.baslik} data-hal={kisiler.length ? 'bilgi' : 'yok'}>{kisiler.length ? <span className="tc-ay2-takip-tek" title={kisiler.join(', ')}><Simge ad="user" boyut="k" />{kisiler.length > 1 ? `${kisiler[0]!} +${String(kisiler.length - 1)}` : kisiler[0]}</span> : <span className="tc-ay2-soluk">{YOK}</span>}</td>;
              case 'planBas': return (
                <td key={k.anahtar} data-etiket={k.baslik} data-hal={riskli ? 'uyari' : basla !== null ? 'bilgi' : 'yok'}>
                  {basla !== null ? <span className="tc-ay2-takip-tek">{saat(basla)}</span> : <span className="tc-ay2-soluk">{YOK}</span>}
                  {riskli ? <TerminRiski ek={riskli > 1 ? `${String(riskli)} op` : undefined} /> : null}
                </td>
              );
              case 'fason': return <td key={k.anahtar} data-etiket={k.baslik} data-hal={fason ? 'bilgi' : 'yok'}>{fason ? <span className="tc-ay2-takip-hal" data-ton="idle"><Simge ad="truck" boyut="k" />Fason adımı var</span> : <span className="tc-ay2-soluk">{YOK}</span>}</td>;
              case 'ilkParca': return <td key={k.anahtar} data-etiket={k.baslik} data-hal={ilk === 'ret' ? 'uyari' : ilk ?? 'yok'}><IlkParcaHucresi durum={ilk} /></td>;
              case 'kontrolPlani': return (
                <td key={k.anahtar} data-etiket={k.baslik} data-hal={bagsiz ? 'uyari' : 'tamam'}>
                  {bagsiz ? (
                    <button
                      type="button" className="tc-ay2-takip-madde" data-ton="hold" title="Kontrol planı Kalite Merkezi’ne bağlı değil; bu paketleri listele"
                      aria-label={`${e.no}: ${String(bagsiz)} operasyonda kontrol planı Kalite Merkezi’ne bağlı değil, bağsız planlı paketleri listele`}
                      onClick={() => suzYaz('kmBagsiz')}
                    ><Simge ad="target" boyut="k" />Bağsız{bagsiz > 1 ? ` · ${String(bagsiz)} op` : ''}</button>
                  ) : <span className="tc-ay2-soluk">{YOK}</span>}
                </td>
              );
              case 'paket': return (
                <td key={k.anahtar} data-etiket={k.baslik}>
                  <span className="tc-ay2-takip-uretim">
                    <span className="tc-ay2-takip-serit" role="img" aria-label={e.dilimler.map((d, j) => `${String(j + 1)}. adım ${DILIM_ADI[d]}`).join(', ')}>
                      {e.dilimler.map((d, j) => <i key={j} data-dilim={d} title={`${String(j + 1)}. adım · ${DILIM_ADI[d]}`} />)}
                    </span>
                    <small>{e.biten}/{e.dilimler.length} adım tamamlandı</small>
                  </span>
                </td>
              );
              case 'rota': case 'cizim': case 'makine': case 'malzeme': case 'nc': case 'takim': case 'aparat': case 'olcu': case 'talimat': return null;
              case 'uretim': return (
                <td key={k.anahtar} data-etiket={k.baslik}>
                  {calisan.length ? <span className="tc-ay2-takip-tek">{calisan.map((s) => (s.opNo !== null ? `Op ${String(s.opNo)}` : s.ad)).join(', ')} üretimde</span> : <span className="tc-ay2-soluk">{YOK}</span>}
                </td>
              );
            }
          };
          return (
          <tbody key={e.anahtar} id={govdeId}>
            <tr className="tc-ay2-takip-emir" data-acik={acik ? '' : undefined}>
              {yayinlar ? (
                <td className="tc-ay2-takip-kutu tc-ay2-takip-sabit">
                  {emirde.length ? (
                    <label className="tc-ay2-takip-kutu-alan">
                      <input
                        type="checkbox" className="tc-ay2-takip-emir-kutu" aria-label={`${e.no} işlerinin hepsini seç`} checked={hepsi}
                        ref={(el) => { if (el) el.indeterminate = secilen > 0 && !hepsi; }} onChange={(o) => isaretle(emirde, o.target.checked)}
                      />
                    </label>
                  ) : null}
                </td>
              ) : null}
              <th scope="rowgroup" className="tc-ay2-takip-ad tc-ay2-takip-sabit" data-etiket="Emir">
                <span className="tc-ay2-takip-emir-ic">
                  <button
                    type="button" className="tc-ay2-takip-ac tc-ay2-takip-acici" aria-expanded={acik} aria-controls={govdeId}
                    aria-label={`${e.no} operasyonlarını ${acik ? 'kapat' : 'aç'}`} onClick={() => acKapa(e.anahtar, !acik)}
                  ><Simge ad={acik ? 'down' : 'chev-right'} boyut="k" /><b className="tc-ay2-mono">{e.no}</b></button>
                  {e.urun ? <span className="tc-ay2-soluk">{e.urun}</span> : null}
                  {e.rev ? <span className="tc-ay2-rev">Rev {e.rev}</span> : null}
                  {e.acil ? <Cip ton="stop">Acil</Cip> : null}
                  <BeklemeCipi neden={e.bekletme} />
                </span>
                <small className="tc-ay2-takip-emir-alt">
                  {e.termin ? <span data-risk={riskli ? '' : undefined}>{riskli ? <Simge ad="clock" boyut="k" /> : null}Termin {e.termin}</span> : null}
                  <span>{e.satirlar.length} operasyon</span>
                </small>
              </th>
              {sutunlar.map(emirHucresiCiz)}
              <td className="tc-ay2-takip-durum" data-etiket="Durum">
                {!acikAdim.length ? <Cip ton="done">Tamamlandı</Cip>
                  : !hazirlikOkundu ? <span className="tc-ay2-takip-yer" aria-hidden="true" />
                  : durur ? <Cip ton="stop">Eksik · {durur}/{acikAdim.length}</Cip>
                  : uyarili ? <Cip ton="hold">Uyarılı · {uyarili}/{acikAdim.length}</Cip>
                  : <Cip ton="run">{hazir}/{acikAdim.length} hazır</Cip>}
              </td>
            </tr>
            {acik ? oplar.map(({ s, h, hucreler, plan, ilkParca }) => {
              const p = s.paket;
              if (!p) {
                return (
                  <tr key={s.anahtar} className="tc-ay2-takip-satir" data-paketsiz="">
                    {yayinlar ? <td className="tc-ay2-takip-kutu tc-ay2-takip-sabit" /> : null}
                    <td className="tc-ay2-takip-ad tc-ay2-takip-sabit" data-etiket="Adım">{s.opNo !== null ? `Op ${String(s.opNo)} · ` : ''}{s.ad}</td>
                    {sutunlar.map((k) => (k.anahtar === 'paket'
                      ? <td key={k.anahtar} data-etiket="Paket"><Cip ton="stop">{s.bitti ? 'Paket yok · adım tamamlandı' : 'Paket yok'}</Cip></td>
                      : <td key={k.anahtar} data-hal="yok" />))}
                    <td className="tc-ay2-takip-durum" />
                  </tr>
                );
              }
              const r = s.sonuc;
              const d = PAKET_DURUMLARI[s.durum];
              const bd = h ? baslamaDurumu(h) : null;
              const emir = tmiEmirId(p);
              const toplu = yayinlar && secilebilir.has(p.id);
              const nOlcum = r ? Object.keys(r.meas || {}).length : 0;
              const nRed = r ? Object.values(r.meas || {}).filter((m) => !m.ok).length : 0;
              const acikNot = r ? (r.pins || []).filter((z) => z.status !== 'done').length : 0;
              const adi = `${p.no} Op ${String(s.opNo ?? '')}`;
              const opHucresiCiz = (k: SutunSecenegi) => {
                const i = MADDE_INDEKSI.get(k.anahtar);
                if (i !== undefined) {
                  const o = hucreler[i]!;
                  const ayni = o.emirDuzeyi && !sorunluMu(o.durum) && o.durum !== 'yok' && o.durum !== 'okunmadi';
                  return (
                    <td key={k.anahtar} data-etiket={k.baslik} data-hal={o.durum}>
                      {ayni ? <span className="tc-ay2-soluk tc-ay2-takip-tek" title="Bu madde emrin geneli için denetlenir">↑ emirle aynı</span> : (
                        <OzetHucresi
                          durum={o.durum} etiket={`${adi} ${k.baslik}`} madde={o.madde} bekliyor={!hazirlikOkundu && hazirlikBeklenir(p) && !s.bitti}
                          yazi={k.anahtar === 'makine' ? p.machine || undefined : undefined}
                          ac={o.madde ? (el) => ac(p, o.madde === 'talimat' ? 'steps' : 'pub', el) : undefined}
                        />
                      )}
                    </td>
                  );
                }
                switch (k.anahtar) {
                  case 'kisi': return <td key={k.anahtar} data-etiket={k.baslik} data-hal={plan.kisi ? 'bilgi' : 'yok'}>{plan.kisi ? <span className="tc-ay2-takip-tek"><Simge ad="user" boyut="k" />{plan.kisi}</span> : <span className="tc-ay2-soluk">{plan.kisiPlani ? 'Okunmadı' : YOK}</span>}</td>;
                  case 'planBas': return (
                    <td key={k.anahtar} data-etiket={k.baslik} data-hal={plan.terminRiski ? 'uyari' : plan.baslangic !== null ? 'bilgi' : 'yok'}>
                      {plan.baslangic !== null ? <span className="tc-ay2-takip-tek" title={plan.bitis !== null ? `Bitiş ${saat(plan.bitis)}` : undefined}>{saat(plan.baslangic)}</span> : <span className="tc-ay2-soluk">{YOK}</span>}
                      {plan.terminRiski ? <TerminRiski /> : null}
                    </td>
                  );
                  case 'fason': return <td key={k.anahtar} data-etiket={k.baslik} data-hal="yok"><span className="tc-ay2-soluk">{p.tmi?.fasonDonusu ? '↑ emirle aynı' : YOK}</span></td>;
                  case 'ilkParca': return <td key={k.anahtar} data-etiket={k.baslik} data-hal={ilkParca === 'ret' ? 'uyari' : ilkParca ?? 'yok'}><IlkParcaHucresi durum={ilkParca} /></td>;
                  case 'kontrolPlani': return (
                    <td key={k.anahtar} data-etiket={k.baslik} data-hal={kmPlanBagsiz(p) ? 'uyari' : 'tamam'}>
                      {kmPlanBagsiz(p) ? (
                        <button
                          type="button" className="tc-ay2-takip-madde" data-ton="hold" title="Kontrol planı Kalite Merkezi’ne bağlı değil; bu paketleri listele"
                          aria-label={`${adi}: kontrol planı Kalite Merkezi’ne bağlı değil, bağsız planlı paketleri listele`}
                          onClick={(o) => { o.stopPropagation(); suzYaz('kmBagsiz'); }}
                        ><Simge ad="target" boyut="k" />Plan bağsız</button>
                      ) : (p.plan || []).length ? <span className="tc-ay2-takip-tek">{(p.plan || []).length} nokta</span> : <span className="tc-ay2-soluk">{YOK}</span>}
                    </td>
                  );
                  case 'paket': return (
                    <td key={k.anahtar} data-etiket={k.baslik}>
                      <span className="tc-ay2-takip-cip-satir">
                        <Cip ton={d.ton}>{d.l.replace('Paket: ', '')}</Cip>
                        {p.dirty && p.status !== 'draft' ? <Cip ton="hold">Değişiklik var</Cip> : null}
                        <PlanCipi paket={p} />
                        {acikNot ? <Cip ton="hazard">{acikNot} not</Cip> : null}
                      </span>
                    </td>
                  );
                  case 'rota': case 'cizim': case 'makine': case 'malzeme': case 'nc': case 'takim': case 'aparat': case 'olcu': case 'talimat': return null;
                  case 'uretim': return (
                    <td key={k.anahtar} data-etiket={k.baslik} title={r ? `Son hareket ${saat(r.at)}` : undefined}>
                      <span className="tc-ay2-takip-uretim">
                        <b>{r && IS_DURUMLARI[r.state] ? IS_DURUMLARI[r.state].etiket : 'Başlamadı'}</b>
                        <small>
                          <span className="tc-ay2-mono">{r ? sayi(r.good) : YOK} / {p.target ? sayi(p.target) : YOK}</span>
                          {r && r.scrap ? <span className="tc-ay2-kirmizi tc-ay2-takip-tek"> · {sayi(r.scrap)} hurda</span> : null}
                          {nOlcum ? <span className="tc-ay2-takip-tek"> · {nOlcum}/{(p.plan || []).length} ölçüldü</span> : null}
                          {nRed ? <b className="tc-ay2-kirmizi tc-ay2-takip-tek"> · {nRed} red</b> : null}
                        </small>
                      </span>
                    </td>
                  );
                }
              };
              return (
                <tr key={s.anahtar} className="tc-ay2-takip-satir" aria-selected={seciliId === p.id} data-paket={p.id} onClick={(o) => ac(p, undefined, o.currentTarget)}>
                  {yayinlar ? (
                    <td className="tc-ay2-takip-kutu tc-ay2-takip-sabit" onClick={(o) => o.stopPropagation()}>
                      <label className="tc-ay2-takip-kutu-alan">
                        <input
                          type="checkbox" aria-label={`${adi} seç`} checked={toplu && secili.has(p.id)} disabled={!toplu}
                          title={toplu ? undefined : geriCekilebilir(p) ? 'Başlamış iş tek tek geri çekilir' : 'İş bitti'}
                          onChange={(o) => isaretle([p.id], o.target.checked)}
                        />
                      </label>
                    </td>
                  ) : null}
                  <td className="tc-ay2-takip-ad tc-ay2-takip-sabit" data-etiket="Adım">
                    <button type="button" className="tc-ay2-takip-ac" onClick={(o) => { o.stopPropagation(); ac(p, undefined, o.currentTarget); }}>
                      <b>{p.op || (s.opNo !== null ? `Op ${String(s.opNo)}` : 'Operasyon girilmedi')}</b>
                      <small className="tc-ay2-mono">{p.machine || YOK}</small>
                    </button>
                  </td>
                  {sutunlar.map(opHucresiCiz)}
                  <td className="tc-ay2-takip-durum tc-ay2-takip-islem" data-etiket="Durum">
                    <span className="tc-ay2-takip-cip-satir">
                      {bd ? (
                        <Link className="tc-ay2-takip-hazirlik" to={`/adim-durumu${emir === null ? '' : `?emir=${String(emir)}`}`} onClick={(o) => o.stopPropagation()} title="Adım Durumu'nda aç">
                          <Cip ton={BASLAMA_TONU[bd]}>{BASLAMA_DURUMLARI[bd]}</Cip>
                        </Link>
                      ) : !hazirlikOkundu && hazirlikBeklenir(p) ? <span className="tc-ay2-takip-yer" aria-hidden="true" /> : null}
                      {yayinlar && geriCekilebilir(p) ? (
                        <button
                          type="button" className="tc-ay2-arac" data-ton={calisiyorMu(r) ? 'stop' : undefined} title="Operatörden geri çek" aria-label={`${adi} operatörden geri çek`}
                          onClick={(o) => { o.stopPropagation(); geriCekSor([p], false); }}
                        ><Simge ad="rotate" /></button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              );
            }) : null}
          </tbody>
          );
        })}
      </table>
      </div>
      </div>
    </div>
  );
}

// Tek ve toplu geri çekme aynı pencereden geçer (ayrıntıdaki düğme dahil). Başlamış iş ayrıca söylenir.
export function GeriCekPenceresi({ paketler, sonuclar, mesgul, kapat, onayla }: {
  paketler: readonly Pkg[] | null; sonuclar: Readonly<Record<string, Result>>; mesgul: boolean; kapat: () => void; onayla: (l: readonly Pkg[]) => void;
}) {
  const l = (paketler ?? []).filter(geriCekilebilir);
  const calisan = l.filter((p) => calisiyorMu(sonuclar[p.id])).length;
  const ad = (p: Pkg) => `${p.no} · ${p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi')}`;
  return (
    <OnayPenceresi
      acik={paketler !== null} baslik="Operatörden geri çek" tehlikeli yukleniyor={mesgul}
      onayMetni={l.length > 1 ? `${String(l.length)} işi geri çek` : 'Geri çek'}
      onayla={() => { if (l.length) onayla(l); else kapat(); }} vazgec={kapat}
    >
      {l.length === 1 ? <p><b>{ad(l[0]!)}</b> operatör ekranından kalkar.</p> : null}
      {l.length > 1 ? (
        <>
          <p>{l.length} iş operatör ekranından kalkar:</p>
          <ul className="tc-ay2-takip-liste">{l.map((p) => <li key={p.id}>{ad(p)}</li>)}</ul>
        </>
      ) : null}
      {calisan ? <p className="tc-ay2-kirmizi tc-ay2-takip-uyari"><Simge ad="alert" boyut="k" /><span>{l.length === 1 ? 'Bu iş' : `${String(calisan)} iş`} şu an operatörde başlamış durumda; operatörün ekranından düşer.</span></p> : null}
      {l.length ? <p>Sayım, ölçüm ve gönderim geçmişi silinmez. Yeniden terminale gönderene kadar operatör göremez.</p> : <p>Geri çekilecek iş yok.</p>}
    </OnayPenceresi>
  );
}

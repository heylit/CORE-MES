import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Islem } from '#paylasilan/islemler.ts';
import type { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { KaliteDurumu } from '#paylasilan/sozlesme/stok.ts';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dugme, OnayPenceresi, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { AraDugmesi, AramaPenceresi, useAramaKisayolu } from './Arama.tsx';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BelirsizMiktarHatasi, belirsizMiktarVar, miktarMetni } from './gorunum.ts';
import { paneliAc } from './panel-olayi.ts';
import { KartOnayiPenceresi, kartOnayiBilgisi } from './KartOnayi.tsx';
import type { KartOnayi } from './KartOnayi.tsx';

// Sunucuda tekrar korumalı stok komutu (mal kabul, hareket yazan komutlar, sepet, toplama açma): tek kimlikle gider; cevabı
// yitirilen gönderim aynı kimlikle yeniden denenir, komut en çok bir kez uygulanır. Denemeler sonucu bilinmeden tükenirse
// (ağ kopuk, zaman aşımı, 5xx) komut sunucuda yazılmış olabilir: kullanıcının aynı komutu elle yeniden göndermesi de aynı
// kimliği taşır, yoksa ağ dönünce ikinci mal kabul yazılırdı. Kimlik başarıda ya da sunucunun kararıyla (4xx) bırakılır.
const sonucuBilinmeyenler = new Map<string, string>();
export async function korumaliPost<T>(yol: string, govde: unknown): Promise<T> {
  const anahtar = `${yol}\n${JSON.stringify(govde)}`;
  const istekKimligi = sonucuBilinmeyenler.get(anahtar) ?? yeniIstekKimligi();
  sonucuBilinmeyenler.set(anahtar, istekKimligi);
  try {
    const cevap = await tekrarKorumaliGonder((deneme) => api.post<T>(yol, govde, deneme), { istekKimligi });
    sonucuBilinmeyenler.delete(anahtar);
    return cevap;
  } catch (hata) {
    if (!yenidenDenenebilirMi(hata)) sonucuBilinmeyenler.delete(anahtar);
    throw hata;
  }
}

export function useIslem(islem: Islem): boolean {
  return (useOturum().data?.islemler ?? []).includes(islem);
}
// Tam stok okuması sunucudaki OKUMA ile aynıdır: sayfa.stok ya da herhangi bir stok işlemi; stok.istek tek başına açmaz (soru 93 a).
// Liste istemcide yazılır (paylasilan değeri zod taşıyabilir); eksik işlem tip denetiminde yakalanır.
const STOK_OKUMA = ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir', 'stok.eksi-onayla', 'stok.skt-onayla'] as const;
const stokOkumaTam: [Exclude<(typeof STOK_ISLEMLERI)[number], (typeof STOK_OKUMA)[number]>] extends [never] ? true : never = true;
export function useStokOkur(): boolean {
  const islemler = useOturum().data?.islemler ?? [];
  return stokOkumaTam && islemler.some((i) => (STOK_OKUMA as readonly string[]).includes(i));
}

// Stok Merkezi herkese depocu düzeniyle açılır (kart #1225): her stok ekranının altında Okut, Transfer, Malzeme istekleri çubuğu durur;
// yönetici görünümü ve mod seçimi yoktur, maddeler yetkiyle süzülür.
// Telefonda üç düğme eşit bölünür; menüdeki uzun ad 360 px'te sığmaz. Kısa ad yalnız görünen metindir, erişilebilir ad menüdekiyle aynı kalır.
// Eşik stok.css'teki telefon düzeniyle (767 px) aynıdır.
const DAR_EKRAN = '(max-width: 767px)';
const darEkranDinle = (bildir: () => void) => {
  const m = typeof window.matchMedia === 'function' ? window.matchMedia(DAR_EKRAN) : null;
  m?.addEventListener('change', bildir);
  return () => m?.removeEventListener('change', bildir);
};
const darEkranMi = () => typeof window.matchMedia === 'function' && window.matchMedia(DAR_EKRAN).matches;
function DepocuCubugu() {
  const tasi = useIslem('stok.transfer'), toplama = useIslem('stok.toplama');
  const dar = useSyncExternalStore(darEkranDinle, darEkranMi, () => false);
  return (
    <nav className="tc-stok-depocu-cubuk" aria-label="Depocu kısayolları">
      <Dugme tur="birincil" simge="scan" onClick={() => paneliAc({ sekme: 'sepet', depoSepeti: true })}>Okut</Dugme>
      {tasi && <Link to="/stok/sepet"><Dugme simge="box">Transfer</Dugme></Link>}
      {(tasi || toplama) && <Link to="/stok/hazirlik"><Dugme simge="list" aria-label="Malzeme istekleri">{dar ? 'İstekler' : 'Malzeme istekleri'}</Dugme></Link>}
    </nav>
  );
}

// Sayfa başı: önizlemedeki düzen (başlık, bir satır açıklama, sağda eylemler) ve her ekranda arama (/).
// 134 a: serbest parça rozetsizdir; karar bekleyen, şartlı ve red parça her bakiye ve teslim satırında görünür.
const KALITE_ROZETI: Record<Exclude<KaliteDurumu, 'serbest'>, { etiket: string; ton: 'uyari' | 'hata' | 'bilgi' }> = {
  karar_bekliyor: { etiket: 'Karar bekliyor', ton: 'uyari' }, sartli: { etiket: 'Şartlı', ton: 'bilgi' }, red: { etiket: 'Red', ton: 'hata' },
};
export function KaliteRozeti({ durum }: { durum: KaliteDurumu | undefined }) {
  if (durum === undefined || durum === 'serbest') return null;
  return <Rozet ton={KALITE_ROZETI[durum].ton}>{KALITE_ROZETI[durum].etiket}</Rozet>;
}

// Sabit sayfa açıklaması telefonda iki satırda kesilir (stok.css); içinde iş kuralı olduğundan "Devamı" tamamını açar.
// Düğme yalnız metin gerçekten kesildiyse çıkar. Kaydın kendi bilgisi (miktar, irsaliye no) `alt`ta kalır ve kesilmez.
function Aciklama({ metin }: { metin: ReactNode }) {
  const p = useRef<HTMLParagraphElement>(null);
  const kimlik = useId();
  const [acik, setAcik] = useState(false);
  const [kesik, setKesik] = useState(false);
  useLayoutEffect(() => {
    const e = p.current;
    if (!e || acik) return;
    const olc = () => setKesik(e.scrollHeight > e.clientHeight + 1);
    olc();
    if (typeof ResizeObserver === 'undefined') return;
    const g = new ResizeObserver(olc);
    g.observe(e);
    return () => g.disconnect();
  }, [acik, metin]);
  return (
    <>
      <p ref={p} id={kimlik} className="tc-stok-alt tc-stok-aciklama" data-acik={acik || undefined}>{metin}</p>
      {(kesik || acik) && (
        <button type="button" className="tc-stok-bag tc-stok-aciklama-dugme" aria-expanded={acik} aria-controls={kimlik} onClick={() => setAcik(!acik)}>
          {acik ? 'Kısalt' : 'Devamı'}
        </button>
      )}
    </>
  );
}

export function SayfaBasi({ baslik, alt, aciklama, sag }: { baslik: string; alt?: ReactNode; aciklama?: ReactNode; sag?: ReactNode }) {
  const [arama, setArama] = useState(false);
  useAramaKisayolu(() => setArama(true));
  return (
    <>
      <div className="tc-stok-bas">
        <div>
          <h2 className="tc-stok-baslik">{baslik}</h2>
          {alt !== undefined && <p className="tc-stok-alt">{alt}</p>}
          {aciklama !== undefined && <Aciklama metin={aciklama} />}
        </div>
        <div className="tc-stok-eylem">{sag}<AraDugmesi ac={() => setArama(true)} /></div>
      </div>
      {arama && <AramaPenceresi kapat={() => setArama(false)} />}
      <DepocuCubugu />
    </>
  );
}

// Yetersiz stokta sunucu ONAY_GEREKLI döner (DEP-02); kullanıcı onaylarsa aynı komut `eksiOnay: true` ile yinelenir (DEP-03).
// Emre giden malzemenin kartı (632 a) aynı yolla sorulur; onay `kartOnayi: true` ile yinelenir.
export function useStokKomutu<G extends object>(gonder: (govde: G) => Promise<unknown>, basarili: string, sonra?: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [onay, setOnay] = useState<{ govde: G; mevcut: string } | null>(null);
  const [kartOnayi, setKartOnayi] = useState<{ govde: G; bilgi: KartOnayi } | null>(null);
  // 2099-5 a: SKT'si geçmiş lot; onayı yalnız stok.skt-onayla taşıyan verir, öteki kişiye yalnız neden gösterilir.
  const [skt, setSkt] = useState<{ govde: G; sonKullanma: string | null } | null>(null);
  const sktOnaylayabilir = useIslem('stok.skt-onayla');
  const komut = useMutation({
    mutationFn: (govde: G) => (belirsizMiktarVar(govde) ? Promise.reject(new BelirsizMiktarHatasi()) : gonder(govde)),
    onSuccess: async () => {
      setOnay(null);
      setKartOnayi(null);
      setSkt(null);
      bildir('tamam', basarili);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      sonra?.();
    },
    onError: (hata, govde) => {
      const kart = kartOnayiBilgisi(hata);
      if (kart) { setKartOnayi({ govde, bilgi: kart }); return; }
      setKartOnayi(null);
      if (hata instanceof ApiHatasi && hata.govde.kod === 'ONAY_GEREKLI') {
        const ayrinti = (hata.govde as { ayrinti?: { mevcut?: string; sktOnayi?: boolean; sonKullanma?: string | null } }).ayrinti;
        if (ayrinti?.sktOnayi === true) { setSkt({ govde, sonKullanma: ayrinti.sonKullanma ?? null }); return; }
        setOnay({ govde, mevcut: ayrinti?.mevcut ?? '0' });
        return;
      }
      bildir('hata', hata instanceof BelirsizMiktarHatasi ? hata.message : hataIletisi(hata, 'Kaydedilemedi. Bağlantıyı kontrol edip yeniden deneyin.'));
    },
  });
  const onayPenceresi = (
    <OnayPenceresi
      acik={onay !== null}
      baslik="Yetersiz stok"
      onayMetni="Yine de yaz"
      tehlikeli
      yukleniyor={komut.isPending}
      onayla={() => { if (onay) komut.mutate({ ...onay.govde, eksiOnay: true }); }}
      vazgec={() => setOnay(null)}
    >
      <p>Mevcut: <strong>{miktarMetni(onay?.mevcut)}</strong>. Onaylarsanız bakiye eksiye düşer ve hareket "onaylı eksi" olarak işaretlenir.</p>
    </OnayPenceresi>
  );
  const kartPenceresi = (
    <KartOnayiPenceresi bilgi={kartOnayi?.bilgi ?? null} yukleniyor={komut.isPending}
      onayla={() => { if (kartOnayi) komut.mutate({ ...kartOnayi.govde, kartOnayi: true }); }} vazgec={() => setKartOnayi(null)} />
  );
  const sktPenceresi = (
    <OnayPenceresi
      acik={skt !== null}
      baslik="Son kullanma tarihi geçmiş"
      onayMetni={sktOnaylayabilir ? 'Onayla ve çıkar' : 'Tamam'}
      tehlikeli={sktOnaylayabilir}
      yukleniyor={komut.isPending}
      onayla={() => { if (skt && sktOnaylayabilir) komut.mutate({ ...skt.govde, sktOnay: true }); else setSkt(null); }}
      vazgec={() => setSkt(null)}
    >
      <p>Lotun son kullanma tarihi <strong>{skt?.sonKullanma ?? '—'}</strong>. {sktOnaylayabilir ? 'Onaylarsanız çıkış yazılır ve onay hareketle kalır.' : 'Bu çıkışı müdür onaylar.'}</p>
    </OnayPenceresi>
  );
  return { komut, onayPenceresi: <>{onayPenceresi}{kartPenceresi}{sktPenceresi}</> };
}

export const hataMetni = (hata: unknown): string =>
  (hata instanceof BelirsizMiktarHatasi ? hata.message : hataIletisi(hata, 'Veri alınamadı. Bağlantıyı kontrol edip yeniden deneyin.'));

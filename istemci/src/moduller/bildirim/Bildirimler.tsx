import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOturum } from '../../ortak/veri/oturum.ts';
import type {
  BildirimListeCevabi, BildirimListeDurumu, BildirimPushDurumuCevabi, BildirimTercihDegistirGovdesi, BildirimTercihleriCevabi, BildirimTercihSatiri,
} from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Dugme, Kart, Sayfalama, Sekmeler, Simge, useBildirim, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarayiciPushOrtami, type PushOrtami } from './cihaz.ts';
import { modulAdi, modulSimgesi, ONEM_ADI } from './gorunum.ts';
import { Hazirla } from './Hazirla.tsx';
import { BildirimSatiri, BosListe, useBildirimKomutlari } from './ortak.tsx';
import { Yayinlar } from './Yayinlar.tsx';
import './bildirim.css';

type Gorunum = 'gelen' | 'arsiv' | 'tercihler' | 'hazirla' | 'yayinlar';
// Hazırla ve Yayınlar yalnız işlemi olana görünür (2147-2 c); veri yetkisi uçlardadır.
const SEKMELER: readonly (Sekme<Gorunum> & { islemler?: readonly string[] })[] = [
  { anahtar: 'gelen', baslik: 'Gelenler', simge: 'bell' },
  { anahtar: 'arsiv', baslik: 'Arşiv', simge: 'layers' },
  { anahtar: 'tercihler', baslik: 'Tercihlerim', simge: 'gear' },
  { anahtar: 'hazirla', baslik: 'Hazırla', simge: 'plus', islemler: ['bildirim.yayinla'] },
  { anahtar: 'yayinlar', baslik: 'Yayınlar ve okunma', simge: 'eye', islemler: ['bildirim.yayinla', 'bildirim.yayin-oku'] },
];
const YOL: Record<Gorunum, string> = {
  gelen: '/profil/bildirimler', arsiv: '/profil/bildirimler/arsiv', tercihler: '/profil/bildirimler/tercihler',
  hazirla: '/profil/bildirimler/hazirla', yayinlar: '/profil/bildirimler/yayinlar',
};
const sekmeAcikMi = (s: { islemler?: readonly string[] }, islemler: readonly string[]): boolean =>
  s.islemler === undefined || s.islemler.some((i) => islemler.includes(i));

type Suzgec = Exclude<BildirimListeDurumu, 'arsiv'>;
const SUZGECLER: readonly { anahtar: Suzgec; baslik: string }[] = [
  { anahtar: 'gelen', baslik: 'Hepsi' },
  { anahtar: 'gorev', baslik: 'Görevlerim' },
  { anahtar: 'hatirlatma', baslik: 'Hatırlatmalar' },
  { anahtar: 'okunmamis', baslik: 'Okunmamış' },
  { anahtar: 'onay-bekleyen', baslik: 'Onay bekleyen' },
  { anahtar: 'onemli', baslik: 'Uyarı ve acil' },
  { anahtar: 'duyuru', baslik: 'Duyuru' },
  { anahtar: 'bilgi', baslik: 'Bilgi' },
  { anahtar: 'yapildi', baslik: 'Yapıldı' },
];
const BOS_METIN: Partial<Record<BildirimListeDurumu, string>> = {
  okunmamis: 'Okunmamış bildirim yok.', 'onay-bekleyen': 'Onay bekleyen bildirim yok.', gorev: 'Bekleyen görev yok.',
  hatirlatma: 'Bekleyen hatırlatma yok.', yapildi: 'Yapılmış görev yok.',
};

function Cerceve({ gorunum, children }: { gorunum: Gorunum; children: React.ReactNode }) {
  const git = useNavigate();
  const islemler = useOturum().data?.islemler ?? [];
  const sekmeler = SEKMELER.filter((s) => sekmeAcikMi(s, islemler)).map(({ anahtar, baslik, simge }) => ({ anahtar, baslik, simge }));
  return (
    <div className="tc-bildirim-sayfa">
      <Sekmeler etiket="Bildirimler" sekmeler={sekmeler} secili={gorunum} sec={(a) => { void git(YOL[a]); }} />
      {children}
    </div>
  );
}

function Liste({ durum, arsivde }: { durum: BildirimListeDurumu; arsivde: boolean }) {
  const [sayfa, sayfaYaz] = useState(1);
  const { arsivle } = useBildirimKomutlari();
  const liste = useQuery({
    queryKey: anahtarlar.liste(durum, sayfa),
    queryFn: () => api.get<BildirimListeCevabi>(`/bildirimler?durum=${durum}&sayfa=${sayfa}`),
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const v = liste.data;
  if (v.satirlar.length === 0) {
    return <BosListe metin={arsivde ? 'Arşiv boş.' : BOS_METIN[durum] ?? 'Bildirim yok.'} />;
  }
  return (
    <>
      <ul className="tc-bildirim-liste tc-bildirim-kutu">
        {v.satirlar.map((b) => <BildirimSatiri key={b.id} b={b} arsivle={arsivde ? undefined : () => arsivle.mutate(b.id)} />)}
      </ul>
      <Sayfalama sayfa={v.sayfa} sayfaBoyu={v.sayfaBoyu} toplam={v.toplam} satirSayisi={v.satirlar.length} degistir={sayfaYaz} />
    </>
  );
}

export function Gelenler() {
  const [suzgec, suzgecYaz] = useState<Suzgec>('gelen');
  const { tumu } = useBildirimKomutlari();
  return (
    <Cerceve gorunum="gelen">
      <div className="tc-bildirim-suzgec">
        {SUZGECLER.map((s) => (
          <button key={s.anahtar} type="button" className="tc-bildirim-cip" aria-pressed={suzgec === s.anahtar} onClick={() => suzgecYaz(s.anahtar)}>
            {s.baslik}
          </button>
        ))}
        <span className="tc-bildirim-ara" />
        <Dugme simge="check" onClick={() => tumu.mutate()} yukleniyor={tumu.isPending}>Tümünü okundu yap</Dugme>
      </div>
      <Liste key={suzgec} durum={suzgec} arsivde={false} />
      <p className="tc-bildirim-not">Satıra basınca okundu olur ve kayıt açılır. Kaldırdıklarınız Arşiv'de durur; bildirim silinmez.</p>
    </Cerceve>
  );
}

export function Arsiv() {
  return (
    <Cerceve gorunum="arsiv">
      <Liste durum="arsiv" arsivde />
    </Cerceve>
  );
}

function Anahtar({ acik, etiket, kilitli = false, degistir }: { acik: boolean; etiket: string; kilitli?: boolean; degistir?: (acik: boolean) => void }) {
  return (
    <label className="tc-bildirim-anahtar" title={etiket}>
      <input type="checkbox" role="switch" checked={acik} disabled={kilitli} aria-label={etiket} onChange={(o) => degistir?.(o.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}

function TercihSatiri({ s, epostaVar, yaz, bekliyor }: {
  s: BildirimTercihSatiri; epostaVar: boolean; yaz: (g: BildirimTercihDegistirGovdesi) => void; bekliyor: boolean;
}) {
  const govde = (ek: Partial<BildirimTercihDegistirGovdesi>): BildirimTercihDegistirGovdesi => ({ tur: s.tur, mesaj: s.mesaj, eposta: s.eposta ?? false, ...ek });
  return (
    <li className="tc-bildirim-tercih">
      <span className={`tc-bildirim-simge tc-bildirim-${s.onem}`}><Simge ad={modulSimgesi(s.kaynakModul)} /></span>
      <span className="tc-bildirim-govde">
        <span className="tc-bildirim-baslik">{s.baslik}</span>
        <span className="tc-bildirim-kaynak">{modulAdi(s.kaynakModul)} · {ONEM_ADI[s.onem]}{s.varsayilan ? ' · varsayılan' : ''}</span>
      </span>
      <span className="tc-bildirim-kanallar">
        <span className="tc-bildirim-kanal"><Simge ad="bell" boyut="k" /><span>Uygulama</span><Anahtar acik kilitli etiket={`${s.baslik}: uygulama, hep açık`} /></span>
        <span className="tc-bildirim-kanal">
          <Simge ad="users" boyut="k" /><span>Mesaj</span>
          <Anahtar acik={s.mesaj} kilitli={bekliyor} etiket={`${s.baslik}: mesaj`} degistir={(mesaj) => yaz(govde({ mesaj }))} />
        </span>
        {epostaVar && (
          <span className="tc-bildirim-kanal">
            <Simge ad="upload" boyut="k" /><span>E-posta</span>
            <Anahtar acik={s.eposta ?? false} kilitli={bekliyor} etiket={`${s.baslik}: e-posta`} degistir={(eposta) => yaz(govde({ eposta }))} />
          </span>
        )}
      </span>
    </li>
  );
}

const PUSH_ANAHTARI = ['bildirim', 'push'] as const;

// Web Push (ADR 0031): kişi bu cihazı kendisi açar ve kapatır. Sunucuda kapalıysa ya da tarayıcı desteklemiyorsa kart görünmez.
function CihazPush({ ortam }: { ortam: PushOrtami }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const durum = useQuery({ queryKey: PUSH_ANAHTARI, queryFn: () => api.get<BildirimPushDurumuCevabi>('/bildirimler/push'), enabled: ortam.destek });
  const mevcut = useQuery({ queryKey: [...PUSH_ANAHTARI, 'bu-cihaz'], queryFn: () => ortam.mevcut(), enabled: ortam.destek });
  const degistir = useMutation({
    mutationFn: async (ac: boolean): Promise<BildirimPushDurumuCevabi> => {
      if (ac) {
        const ucNokta = await ortam.aboneOl(durum.data?.acikAnahtar ?? '');
        return api.post<BildirimPushDurumuCevabi>('/bildirimler/push/abone-ol', { ucNokta });
      }
      const ucNokta = await ortam.birak();
      if (ucNokta === null) return durum.data as BildirimPushDurumuCevabi;
      return api.post<BildirimPushDurumuCevabi>('/bildirimler/push/abonelik-sil', { ucNokta });
    },
    onSuccess: (v) => {
      istemci.setQueryData(PUSH_ANAHTARI, v);
      void mevcut.refetch();
    },
    onError: (h) => {
      void mevcut.refetch();
      bildir('hata', hataIletisi(h, 'Cihaz bildirimi değiştirilemedi.'));
    },
  });
  if (!ortam.destek || durum.data?.acik !== true || durum.data.acikAnahtar === null || mevcut.isPending) return null;
  const acik = mevcut.data !== null && mevcut.data !== undefined;
  return (
    <Kart baslik="Uygulama kapalıyken">
      <ul className="tc-bildirim-liste">
        <li className="tc-bildirim-tercih">
          <span className="tc-bildirim-simge tc-bildirim-bilgi"><Simge ad="bell" /></span>
          <span className="tc-bildirim-govde">
            <span className="tc-bildirim-baslik">Bu cihaza bildir</span>
            <span className="tc-bildirim-kaynak">Görev, hatırlatma ve acil bildirimler · açık cihazınız: {durum.data.cihazSayisi}</span>
          </span>
          <span className="tc-bildirim-kanallar">
            <span className="tc-bildirim-kanal">
              <Anahtar acik={acik} kilitli={degistir.isPending} etiket="Uygulama kapalıyken bu cihaza bildir" degistir={(ac) => degistir.mutate(ac)} />
            </span>
          </span>
        </li>
      </ul>
      <p className="tc-bildirim-not">
        Bildirimin içeriği şirket dışına çıkmaz: tarayıcının bildirim servisinden yalnız &quot;yeni bildirim var&quot; sinyali geçer, ayrıntıyı cihaz
        sunucudan kendisi alır. Şirket ağı dışındayken yalnız genel bir uyarı görünür. iPhone&apos;da uygulama ana ekrana eklenmiş olmalıdır.
      </p>
    </Kart>
  );
}

export function Tercihler({ push }: { push?: PushOrtami } = {}) {
  const pushOrtami = useState(() => push ?? tarayiciPushOrtami())[0];
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const sorgu = useQuery({ queryKey: anahtarlar.tercihler, queryFn: () => api.get<BildirimTercihleriCevabi>('/bildirimler/tercihler') });
  const yaz = useMutation({
    mutationFn: (g: BildirimTercihDegistirGovdesi) => api.post<BildirimTercihleriCevabi>('/bildirimler/tercihler/degistir', g),
    onSuccess: (v) => istemci.setQueryData(anahtarlar.tercihler, v),
    onError: (h) => bildir('hata', hataIletisi(h, 'Tercih kaydedilemedi.')),
  });
  return (
    <Cerceve gorunum="tercihler">
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
        : (
          <>
          <CihazPush ortam={pushOrtami} />
          <Kart baslik="Hangi olay hangi kanaldan gelsin">
            {(!sorgu.data.kanallar.mesaj || !sorgu.data.kanallar.eposta) && (
              <p className="tc-bildirim-serit">
                <Simge ad="alert" boyut="k" />
                Mesaj ve e-posta kanalları henüz açılmadı. Seçimleriniz saklanır, kanal açılınca geçerli olur; o zamana kadar bildirimler zile gelir.
              </p>
            )}
            {sorgu.data.satirlar.length === 0 ? <BosListe metin="Yetkinize göre size gelen bir olay türü yok. Size gelen bildirimler yine zilde görünür." /> : (
              <ul className="tc-bildirim-liste">
                {sorgu.data.satirlar.map((s) => (
                  <TercihSatiri key={s.tur} s={s} epostaVar={sorgu.data.epostaSecilebilir} yaz={(g) => yaz.mutate(g)} bekliyor={yaz.isPending} />
                ))}
              </ul>
            )}
            <p className="tc-bildirim-not">Uygulama bildirimi kapatılamaz: kayıt her zaman tutulur. Değişiklik anında kaydedilir.</p>
          </Kart>
          </>
        )}
    </Cerceve>
  );
}

// Sayfa adresi oturumu olan herkese açıktır (menü sayfası değil); sekme ve veri işlemi olana açılır.
function YetkiliSekme({ gorunum, children }: { gorunum: 'hazirla' | 'yayinlar'; children: (kisiId: number | null) => React.ReactNode }) {
  const oturum = useOturum();
  const sekme = SEKMELER.find((s) => s.anahtar === gorunum);
  const acik = sekme !== undefined && sekmeAcikMi(sekme, oturum.data?.islemler ?? []);
  return (
    <Cerceve gorunum={gorunum}>
      {oturum.isPending ? <DurumKutusu durum="yukleniyor" />
        : acik ? children(oturum.data?.id ?? null)
        : <DurumKutusu durum="bos" mesaj="Bu sekme için yetkiniz yok. Yöneticiniz rol yönetiminden verebilir." />}
    </Cerceve>
  );
}

export function HazirlaSayfasi() {
  const git = useNavigate();
  return <YetkiliSekme gorunum="hazirla">{() => <Hazirla yayinlandi={(y) => { void git(`/profil/bildirimler/yayinlar?yayin=${String(y.id)}`); }} />}</YetkiliSekme>;
}

export function YayinlarSayfasi() {
  const [ara] = useSearchParams();
  const ilk = Number(ara.get('yayin'));
  return <YetkiliSekme gorunum="yayinlar">{(kisiId) => <Yayinlar kisiId={kisiId} secili={Number.isInteger(ilk) && ilk > 0 ? ilk : null} />}</YetkiliSekme>;
}

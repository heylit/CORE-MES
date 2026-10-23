import { useEffect, useMemo, useRef, type ComponentType } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Dugme, DurumKutusu, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../ortak/rota/sayfa-komutlari.ts';
import {
  GORUNUMLER, KOK, MesajSaglayici, useMesaj, type FormIstegi, type FormOzellikleri, type Gorunum,
} from './durum.tsx';
import { onayDurumu } from './kurallar.ts';
import { useOtomasyon } from './otomasyon/index.ts';
import { AyrintiSayfasi, ESKI_GORUNUM, FORMLAR, GORUNUM_TANIMLARI, eskiGorunumden } from './sekmeler.ts';
import { useSiparisOzetleri } from './siparisler/index.tsx';
import { useBen } from './veri.ts';
import './mesaj-yeni.css';

// Mesaj'ın yeni ekranı (TS geçişi, 199 b): eski çerçevenin yanında `/mesaj/yeni` yolunda, alıma kadar yalnız yöneticide.
export function MesajYeni() {
  return <YeniEkranKapisi><MesajKabugu /></YeniEkranKapisi>;
}

function MesajKabugu() {
  const { gorunum: hamGorunum, kanal } = useParams<{ gorunum?: string; kanal?: string }>();
  const ben = useBen();
  const siparisler = useSiparisOzetleri();
  const gorunum: Gorunum | null = kanal !== undefined ? 'sohbet'
    : hamGorunum === undefined ? 'bugun'
      : (GORUNUMLER as readonly string[]).includes(hamGorunum) && hamGorunum !== 'bugun' ? hamGorunum as Gorunum : null;
  if (gorunum === null) return <Navigate to={KOK} replace />;
  if (ben.isPending) return <div className="tc-my-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (ben.isError) {
    return (
      <div className="tc-my-durum">
        <DurumKutusu durum="hata" mesaj={hataIletisi(ben.error, 'Mesaj açılamadı.')} yenile={() => { void ben.refetch(); }} />
      </div>
    );
  }
  return (
    <MesajSaglayici ben={ben.data} gorunum={gorunum} acikKanal={kanal ?? null} siparisler={siparisler}>
      <MesajIcerik />
    </MesajSaglayici>
  );
}

function MesajIcerik() {
  useOtomasyon();
  const m = useMesaj();
  const { gorunum, hazir, tercihler, tercihleriGuncelle, git, sayac, yetki, formAc, form, ayrinti, kapat } = m;

  // Açılışta eski ekranla ortak son görünüme dönülür (yalnız kök yolda, bir kez); sonra her değişim tercihe yazılır.
  const acildi = useRef(false);
  useEffect(() => {
    if (!hazir || acildi.current) return;
    acildi.current = true;
    const son = eskiGorunumden(tercihler.lastView);
    if (gorunum === 'bugun' && son !== null && son !== 'bugun' && son !== 'sohbet') git({ gorunum: son });
  }, [hazir, gorunum, tercihler.lastView, git]);
  useEffect(() => {
    if (!hazir || !acildi.current || gorunum === 'sohbet') return;
    if (tercihler.lastView !== ESKI_GORUNUM[gorunum]) tercihleriGuncelle({ lastView: ESKI_GORUNUM[gorunum] });
  }, [hazir, gorunum, tercihler.lastView, tercihleriGuncelle]);

  useSayfaKomutlari('mesaj-yeni', useMesajKomutlari());

  const sekmeler = useMemo(() => GORUNUM_TANIMLARI.map((t) => {
    const n = t.sayac?.(sayac) ?? 0;
    return { anahtar: t.anahtar, baslik: n > 0 ? `${t.baslik} (${n > 99 ? '99+' : n})` : t.baslik, simge: t.simge };
  }), [sayac]);
  const tanim = GORUNUM_TANIMLARI.find((t) => t.anahtar === gorunum) ?? GORUNUM_TANIMLARI[0];
  const Ekran = tanim?.ekran;

  return (
    <div className="tc-my">
      <div className="tc-my-ust">
        <Sekmeler etiket="Mesaj bölümleri" sekmeler={sekmeler} secili={gorunum} sec={(g) => { git({ gorunum: g }); }} />
        {yetki.yaz && (
          <Dugme tur="birincil" simge="plus" onClick={() => { formAc({ tur: 'yeni' }); }}>Yeni</Dugme>
        )}
      </div>
      <div className="tc-my-govde">
        {!hazir ? <DurumKutusu durum="yukleniyor" /> : Ekran && <Ekran />}
      </div>
      {hazir && form !== null && <FormYeri istek={form} kapat={kapat} />}
      {hazir && form === null && ayrinti !== null && <AyrintiSayfasi tur={ayrinti.tur} id={ayrinti.id} kapat={kapat} />}
    </div>
  );
}

function FormYeri({ istek, kapat }: { istek: FormIstegi; kapat: () => void }) {
  // Kayıt her tür için kendi özellik tipini taşır; tür buradan seçildiği için daraltma güvenlidir.
  const Form = FORMLAR[istek.tur] as ComponentType<FormOzellikleri<FormIstegi['tur']>>;
  return <Form istek={istek} kapat={kapat} />;
}

// Ctrl K paletinin "Bu sayfa" grubu (203 a, T6): eski ekranın "Ara" penceresinin kanal, toplantı, görev ve onay grupları ve
// yeni kayıt komutları. İleti metninde arama sohbet parçasının önerisidir.
const KOMUT_SINIRI = 40;

function useMesajKomutlari(): SayfaKomutu[] | null {
  const { hazir, veri, yetki, git, formAc, ayrintiAc, ad } = useMesaj();
  if (!hazir) return null;
  const komutlar: SayfaKomutu[] = [];
  if (yetki.yaz) {
    komutlar.push(
      { anahtar: 'yeni-gorev', baslik: 'Görev ver', simge: 'clipboard-check', aciklama: 'Mesaj', sozcukler: ['görev', 'iş'], calistir: () => { formAc({ tur: 'gorev' }); } },
      { anahtar: 'yeni-onay', baslik: 'Onay iste', simge: 'check', aciklama: 'Mesaj', sozcukler: ['onay'], calistir: () => { formAc({ tur: 'onay' }); } },
      { anahtar: 'yeni-toplanti', baslik: 'Toplantı planla', simge: 'clock', aciklama: 'Mesaj', sozcukler: ['toplantı', 'davet'], calistir: () => { formAc({ tur: 'toplanti' }); } },
      { anahtar: 'yeni-duyuru', baslik: 'Duyuru yap', simge: 'bell', aciklama: 'Mesaj', sozcukler: ['duyuru'], calistir: () => { formAc({ tur: 'duyuru' }); } },
    );
  }
  for (const k of veri.kanallar.slice(0, KOMUT_SINIRI)) {
    komutlar.push({ anahtar: `kanal-${k.id}`, baslik: `#${k.name}`, simge: 'users', aciklama: k.topic || 'Kanal', sozcukler: ['kanal'], calistir: () => { git({ kanal: k.id }); } });
  }
  for (const mt of veri.toplantilar.filter((x) => !x.cancelled).slice(0, KOMUT_SINIRI)) {
    komutlar.push({ anahtar: `toplanti-${mt.id}`, baslik: mt.title, simge: 'clock', aciklama: 'Toplantı', sozcukler: ['toplantı', mt.agenda ?? ''], calistir: () => { ayrintiAc({ tur: 'toplanti', id: mt.id }); } });
  }
  for (const t of veri.gorevler.filter((x) => x.status !== 'done').slice(0, KOMUT_SINIRI)) {
    komutlar.push({ anahtar: `gorev-${t.id}`, baslik: t.title, simge: 'clipboard-check', aciklama: `Görev, ${ad(t.to)}`, sozcukler: ['görev', ad(t.to)], calistir: () => { ayrintiAc({ tur: 'gorev', id: t.id }); } });
  }
  for (const a of veri.onaylar.filter((x) => onayDurumu(x).s === 'wait').slice(0, KOMUT_SINIRI)) {
    komutlar.push({ anahtar: `onay-${a.id}`, baslik: a.title, simge: 'check', aciklama: 'Onay isteği', sozcukler: ['onay'], calistir: () => { ayrintiAc({ tur: 'onay', id: a.id }); } });
  }
  return komutlar;
}

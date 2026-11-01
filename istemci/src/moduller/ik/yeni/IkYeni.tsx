import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Dugme, Pencere, Sekmeler, type Sekme } from '../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../ortak/rota/sayfa-komutlari.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { YardimGorunumu } from './analiz/YardimGorunumu.tsx';
import { AramaPenceresi } from './arama/AramaPenceresi.tsx';
import type { AramaSayfasi } from './arama/kurallar.ts';
import { GORUNUMLER, adrestenGorunum, gorunumAdresi, type IkGorunum, type IkKoku } from './gorunumler.ts';
import { motorKur } from './motor.ts';
import { gorunumAcik } from './rol.ts';
import type { Personel } from './tipler.ts';
import { useIkDeposu } from './veri.ts';
import { useIkYetkisi } from './yetki.ts';
import './ik-yeni.css';

// TS geçişinin İK ekranı (199 b). Alıma kadar eski çerçevenin yanında `/ik/yeni` ve `/ik-islemlerim/yeni` adresindedir ve yalnız
// yöneticide açılır; gezinme ikinci menünün aynı maddeleriyle sekmelerdedir. Üstteki araçlar bugünkü ekranınkilerdir: Ara ve
// Yardım (F1); "Başka bir gözle görüntüle" 856 ile kalktı.
const SAYFA_DISI = { pdks: '/ik/pdks' } as const;

interface MenuMaddesi { anahtar: string; baslik: string; simge?: SimgeAdi; islem: Islem }

function menuMaddeleri(kok: IkKoku): readonly MenuMaddesi[] {
  const menu = IKINCI_MENULER.find((m) => m.kok === kok);
  return menu ? menu.gruplar.flatMap((g) => g.maddeler as readonly MenuMaddesi[]) : [];
}

export function IkYeni({ kok }: { kok: IkKoku }) {
  return <YeniEkranKapisi><IkEkrani kok={kok} /></YeniEkranKapisi>;
}

export function IkYeniIk() { return <IkYeni kok="/ik" />; }
export function IkYeniIslemlerim() { return <IkYeni kok="/ik-islemlerim" />; }

function IkEkrani({ kok }: { kok: IkKoku }) {
  const { gorunum: adres, kimlik } = useParams();
  const git = useNavigate();
  const genel = useYetki();
  const depo = useIkDeposu();
  const yetki = useIkYetkisi({ saltOkunur: depo.data?.ben.saltOkunur ?? true });
  const motor = useMemo(() => (depo.data ? motorKur([...depo.data.kayitlar.values()], depo.data.ayarlar) : null), [depo.data]);
  const gorunum = adrestenGorunum(kok, adres);
  const gezin = useCallback((g: IkGorunum, k?: string) => { void git(gorunumAdresi(g, k)); }, [git]);
  const [pencere, pencereYaz] = useState(false);
  const [kilavuz, kilavuzYaz] = useState<{ konu: string | null; vurgu: string } | null>(null);
  const gun = tesisGunu(Date.now());

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key !== 'F1') return;
      e.preventDefault();
      kilavuzYaz((k) => (k ? null : { konu: null, vurgu: '' }));
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, []);
  // Ctrl K kabuğun paletidir (102 a); İK'nın araması paletin "Bu sayfa" grubundan da açılır.
  useSayfaKomutlari('ik-ara', depo.data ? [{
    anahtar: 'ik-ara', baslik: 'İK\'da ara', simge: 'search', aciklama: 'Personel, aday, departman, işlem, sayfa ve kılavuz',
    sozcukler: ['personel', 'izin', 'bordro', 'aday', 'kılavuz'], calistir: () => { pencereYaz(true); },
  }] : null);

  const izinOnayVar = genel.var('ik.izin-onay');
  const acik = (anahtar: string): boolean => gorunumAcik(anahtar, { oku: yetki.oku, izinOnayVar });
  const sekmeler: Sekme<string>[] = menuMaddeleri(kok)
    .filter((m) => (Object.hasOwn(SAYFA_DISI, m.anahtar) ? genel.var(m.islem) : acik(m.anahtar)))
    .map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, ...(m.simge ? { simge: m.simge } : {}) }));
  const aramaSayfalari: AramaSayfasi[] = (['/ik', '/ik-islemlerim'] as const).flatMap((k) => menuMaddeleri(k))
    .filter((m) => !Object.hasOwn(SAYFA_DISI, m.anahtar) && Object.hasOwn(GORUNUMLER, m.anahtar) && genel.var(m.islem) && acik(m.anahtar))
    .map((m) => ({ gorunum: m.anahtar as IkGorunum, baslik: m.baslik }));

  if (depo.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (depo.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(depo.error, 'İnsan Kaynakları kayıtları okunamadı.')} yenile={() => { void depo.refetch(); }} />;
  if (gorunum === null || !acik(gorunum)) return <DurumKutusu durum="bos" mesaj="Bu görünüm bulunamadı ya da size açık değil." />;

  const d = depo.data;
  const ben = (d.al(d.ben.personelKimlik)?.kind === 'emp' ? d.al(d.ben.personelKimlik) : null) as Personel | null;
  const rol = d.ben.rol;
  const tanim = GORUNUMLER[gorunum];
  const Ekran = tanim.ekran;
  const secili = tanim.ust ?? gorunum;
  const o = { depo: d, yetki, rol, ben, kimlik: kimlik ?? null, git: gezin, motor };

  const sec = (anahtar: string) => {
    if (Object.hasOwn(SAYFA_DISI, anahtar)) { void git(SAYFA_DISI[anahtar as keyof typeof SAYFA_DISI]); return; }
    gezin(anahtar as IkGorunum);
  };

  return (
    <div className="tc-ik-yeni">
      <div className="tc-ik-ust">
        <Sekmeler etiket={kok === '/ik' ? 'İnsan Kaynakları' : 'İK İşlemlerim'} sekmeler={sekmeler} secili={secili} sec={sec} />
        <div className="tc-ik-arac">
          <Dugme simge="search" onClick={() => { pencereYaz(true); }}>Ara</Dugme>
          <Dugme simge="help" aria-keyshortcuts="F1" aria-label="Yardım ve kullanım kılavuzu (F1)" onClick={() => { kilavuzYaz({ konu: null, vurgu: '' }); }}>Yardım</Dugme>
        </div>
      </div>
      {d.ben.saltOkunur && <div className="tc-ik-serit" role="status">Bu kayıtları yalnızca görüntüleyebilirsiniz.</div>}
      <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
        <Ekran {...o} />
      </Suspense>
      <AramaPenceresi
        acik={pencere} kapat={() => { pencereYaz(false); }} o={o} sayfalar={aramaSayfalari} gun={gun}
        kilavuzAc={(konu, vurgu) => { kilavuzYaz({ konu, vurgu }); }}
      />
      <Pencere acik={kilavuz !== null} kapat={() => { kilavuzYaz(null); }} baslik="Kullanım kılavuzu" tur="yan" ust={null}>
        {kilavuz && (
          <YardimGorunumu
            key={`${kilavuz.konu ?? ''}|${kilavuz.vurgu}`} gorunum={gorunum} konu={kilavuz.konu} vurgu={kilavuz.vurgu}
            kapat={() => { kilavuzYaz(null); }} git={(g, sekme) => { gezin(g as IkGorunum, g === 'hesap' ? sekme : undefined); }}
          />
        )}
      </Pencere>
    </div>
  );
}

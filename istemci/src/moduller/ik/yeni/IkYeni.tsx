import { Suspense, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { DurumKutusu, Sekmeler, type Sekme } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import { GORUNUMLER, adrestenGorunum, gorunumAdresi, type IkGorunum, type IkKoku } from './gorunumler.ts';
import { motorKur } from './motor.ts';
import { gorunumAcik } from './rol.ts';
import type { Personel } from './tipler.ts';
import { useIkDeposu } from './veri.ts';
import { useIkYetkisi } from './yetki.ts';
import './ik-yeni.css';

// TS geçişinin İK ekranı (199 b). Alıma kadar eski çerçevenin yanında `/ik/yeni` ve `/ik-islemlerim/yeni` adresindedir ve yalnız
// yöneticide açılır; gezinme ikinci menünün aynı maddeleriyle sekmelerdedir. Alımda sekmeler kalkar, gezinmeyi ikinci menü yapar.
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

  const izinOnayVar = genel.var('ik.izin-onay');
  const acik = (anahtar: string): boolean => gorunumAcik(anahtar, { oku: yetki.oku, izinOnayVar });
  const sekmeler: Sekme<string>[] = menuMaddeleri(kok)
    .filter((m) => (Object.hasOwn(SAYFA_DISI, m.anahtar) ? genel.var(m.islem) : acik(m.anahtar)))
    .map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, ...(m.simge ? { simge: m.simge } : {}) }));

  if (depo.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (depo.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(depo.error, 'İnsan Kaynakları kayıtları okunamadı.')} yenile={() => { void depo.refetch(); }} />;
  if (gorunum === null || !acik(gorunum)) return <DurumKutusu durum="bos" mesaj="Bu görünüm bulunamadı ya da size açık değil." />;

  const d = depo.data;
  const ben = (d.al(d.ben.personelKimlik)?.kind === 'emp' ? d.al(d.ben.personelKimlik) : null) as Personel | null;
  const rol = d.ben.rol;
  const tanim = GORUNUMLER[gorunum];
  const Ekran = tanim.ekran;
  const secili = tanim.ust ?? gorunum;

  const sec = (anahtar: string) => {
    if (Object.hasOwn(SAYFA_DISI, anahtar)) { void git(SAYFA_DISI[anahtar as keyof typeof SAYFA_DISI]); return; }
    gezin(anahtar as IkGorunum);
  };

  return (
    <div className="tc-ik-yeni">
      <Sekmeler etiket={kok === '/ik' ? 'İnsan Kaynakları' : 'İK İşlemlerim'} sekmeler={sekmeler} secili={secili} sec={sec} />
      {d.ben.saltOkunur && <div className="tc-ik-serit" role="status">Bu kayıtları yalnızca görüntüleyebilirsiniz.</div>}
      <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
        <Ekran depo={d} yetki={yetki} rol={rol} ben={ben} kimlik={kimlik ?? null} git={gezin} motor={motor} />
      </Suspense>
    </div>
  );
}

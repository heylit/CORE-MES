import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IkHesapRolleriCevabi, IkIseAlCevabi, IkIseAlGovdesi } from '#paylasilan/sozlesme/ik.ts';
import { useNavigate } from 'react-router-dom';
import { FormPenceresi } from '../../../../ortak/arayuz/FormPenceresi.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme, Girdi, Pencere, Secim } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { ikSabitleri, motorKur, type IkMotoru } from '../motor.ts';
import type { Personel } from '../tipler.ts';
import { ikAnahtarlari, useIkDeposu, useIkKomutu, yeniKimlik, type IkDeposu } from '../veri.ts';
import { bolumAlanlari, YENI_PERSONEL_BOLUMLERI, type PersonelBolumu } from './alanlar.ts';
import {
  adSoyadMetni, aktifMi, bugun, cikistanSonrakiIzinler, personelDogrula, personelKayitOncesi, pozisyonTanimOnerileri, sayi, siraliDepartman,
  siraliPersonel,
} from './kurallar.ts';
import { ayar } from './motor-yuzu.ts';
import { AlanGirdisi, Not, Tanimlar, type AlanBaglami } from './parcalar.tsx';

type Degerler = Record<string, unknown>;

interface Ozellikler {
  acik: boolean;
  depo: IkDeposu;
  motor: IkMotoru | null;
  // null: yeni personel (Kimlik, İletişim, İş, Ücret bölümleri birlikte).
  kayit: Personel | null;
  bolum: PersonelBolumu | null;
  onDolu?: Partial<Personel>;
  baslik?: string;
  kapat: () => void;
  kaydedildi?: (p: Personel) => void;
}

function ilkDegerler(kayit: Personel | null, bolumler: readonly PersonelBolumu[], onDolu: Partial<Personel>, depo: IkDeposu): Degerler {
  const alanlar = bolumAlanlari(bolumler);
  if (kayit) return Object.fromEntries(alanlar.map((f) => [f.k, kayit[f.k] ?? '']));
  const d: Degerler = Object.fromEntries(alanlar.map((f) => [f.k, f.varsayilan ?? '']));
  const ims = depo.ben.secenekler.isMerkezleri;
  if (ims.length === 1 && ims[0]) d.isMerkeziId = ims[0].id;
  return { ...d, ...onDolu };
}

// Personel kartının bölüm formu (düzenleme) ya da yeni personel formu. Kayıt öncesi düzen bugünkü formla aynıdır
// (kurallar.ts personelKayitOncesi); yazma ucu ve yetki denetimi sunucudadır.
export function PersonelFormPenceresi({ acik, depo, motor, kayit, bolum, onDolu = {}, baslik, kapat, kaydedildi }: Ozellikler) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const yetki = useYetki();
  const git = useNavigate();
  // Kartla kendiliğinden açılan kişi (1878 a); elle seçilen kişi buraya girmez.
  const acilanKisi = useRef<number | null>(null);
  // 1925 a: hesap açma işlemi olan İK kullanıcısı yeni personeli tek adımda işe alır: hesap her zaman açılır, kullanıcı adı ve
  // geçici PIN sunucudan gelir; rol yalnız sunucunun verdiği (yetki dağıtmayan) rollerden, giriş kartı isteğe bağlı.
  const sorgu = useQueryClient();
  const hesapAcar = !kayit && yetki.var('ik.hesap-ac');
  const roller = useQuery({
    queryKey: ['ik', 'yeni', 'hesap-rolleri'], queryFn: () => api.get<IkHesapRolleriCevabi>('/ik/hesap-rolleri'), enabled: hesapAcar && acik,
  });
  const [rolSecimi, rolSecimiYaz] = useState<number | null>(null);
  const [kartNo, kartNoYaz] = useState('');
  const [istasyonId, istasyonIdYaz] = useState<number | null>(null);
  const iseAlim = useRef<IkIseAlCevabi | null>(null);
  const [sonuc, sonucYaz] = useState<{ p: Personel; c: IkIseAlCevabi } | null>(null);
  const varsayilanRol = roller.data?.roller.find((r) => r.kod === 'operator')?.id ?? roller.data?.roller[0]?.id ?? null;
  const rolId = rolSecimi ?? varsayilanRol;
  // 1928 a: ilk istasyon yalnız seçilen iş merkezinin aktif istasyonlarından; iş merkezi değişince eski seçim düşer.
  const merkezIstasyonlari = (merkez: unknown) => (roller.data?.istasyonlar ?? []).filter((i) => i.isMerkeziId === (Number(merkez) || null));
  const gecerliIstasyon = (merkez: unknown) => (merkezIstasyonlari(merkez).some((i) => i.id === istasyonId) ? istasyonId : null);
  const bolumler = bolum ? [bolum] : YENI_PERSONEL_BOLUMLERI;
  const alanlar = useMemo(() => bolumAlanlari(bolumler), [bolum]);
  const personeller = depo.tur('emp');
  const izinler = depo.tur('leave');
  const gun = bugun();
  const sabitler = ikSabitleri();

  const form = useForm<Degerler, Personel>({
    ilk: ilkDegerler(kayit, bolumler, onDolu, depo),
    dogrula: (d) => personelDogrula({ ...(kayit ?? { id: '', kind: 'emp' }), ...d } as Personel, alanlar.map((f) => ({ k: f.k, zorunlu: f.zorunlu, tur: f.tur === 'eposta' ? 'email' : f.tur })), personeller),
    kaydet: async (d) => {
      const veri = { ...(kayit ?? { id: yeniKimlik('emp'), kind: 'emp' as const }), ...d } as Personel;
      const yeni = personelKayitOncesi(kayit, veri, {
        gun, personeller, denemeAy: sayi(motor ? ayar(motor, 'denemeAy') : depo.ayarlar['denemeAy']) || 2, bolum,
        departmanAdi: (id) => depo.tur('dept').find((x) => x.id === id)?.ad ?? '—',
        personelAdi: (id) => adSoyadMetni(personeller.find((x) => x.id === id)),
        yakaTahmini: sabitler?.inferCollar, kademeTahmini: sabitler?.inferLevel,
      });
      iseAlim.current = null;
      if (hesapAcar) {
        if (rolId === null) throw new Error('Giriş hesabı için rol seçin.');
        const ilkIstasyon = gecerliIstasyon(yeni.isMerkeziId);
        const govde: IkIseAlGovdesi = {
          govde: yeni, rolId, ...(kartNo.trim() === '' ? {} : { kartNo }), ...(ilkIstasyon === null ? {} : { istasyonId: ilkIstasyon }),
        };
        const c = await api.post<IkIseAlCevabi>(`/ik/personel/${encodeURIComponent(yeni.id)}/ise-al`, govde);
        await sorgu.invalidateQueries({ queryKey: ikAnahtarlari.veri });
        if (c.uyari !== undefined) bildir('bilgi', c.uyari);
        iseAlim.current = c;
        return yeni;
      }
      // Sunucunun uyarısını (IK-74) komut kendisi gösterir.
      const yazilan = await komut.kaydet(yeni);
      const kisiId = yazilan?.govde['kisiId'];
      acilanKisi.current = !kayit && !yeni.kisiId && typeof kisiId === 'number' ? kisiId : null;
      return yeni;
    },
    basarili: (p) => {
      kapat();
      const c = iseAlim.current;
      if (c !== null) {
        kartNoYaz(''); istasyonIdYaz(null);
        if (c.hesap !== null) { sonucYaz({ p, c }); return; }
        bildir('tamam', 'Kaydedildi.');
        kaydedildi?.(p);
        return;
      }
      if (bolum === 'Ayrılış' && kayit && !kayit.cikisTarihi && p.cikisTarihi) {
        const sonra = cikistanSonrakiIzinler(p, izinler);
        bildir(sonra ? 'hata' : 'tamam', `Çıkış kaydedildi. Kontrol listesini tamamlayın${sonra ? `: çıkış tarihinden sonra ${sonra} izin kaydı var.` : '.'}`);
      } else if (acilanKisi.current !== null) {
        // 1878 a: kişi kartla açıldı; giriş hesabı ve rol Kişiler'in kendi penceresinde, yalnız rol yönetene.
        const kisiId = acilanKisi.current;
        if (yetki.var('kisiler.rol-yonet')) {
          bildir('tamam', 'Kaydedildi. Kişi Personel\'de açıldı.', { eylem: { etiket: 'Giriş hesabı aç', yap: () => { void git(`/personel?kisi=${kisiId}&hesap=1`); } } });
        } else bildir('tamam', 'Kaydedildi. Kişi Personel\'de açıldı; giriş hesabını Personel yöneticisi açar.');
      } else bildir('tamam', kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.');
      kaydedildi?.(p);
    },
    hataIletisi: 'Personel kaydedilemedi.',
  });

  // Pencere her açılışta kaydın güncel haliyle başlar.
  useEffect(() => { if (acik) form.sifirla(ilkDegerler(kayit, bolumler, onDolu, depo)); }, [acik]);

  const baglam: AlanBaglami = {
    sabitler, motor, personeller: siraliPersonel(personeller, gun), departmanlar: siraliDepartman(depo.tur('dept')),
    secenekler: depo.ben.secenekler, kayitKimligi: kayit?.id ?? null, kayit: { ...(kayit ?? { id: '', kind: 'emp' }), ...form.degerler } as Personel,
    aktifMi: (p) => aktifMi(p, gun),
  };

  // Pozisyon tanımları (2177-3 a): seçilen departmanınkiler ve departmansızlar önerilir; listede olmayan ad da yazılır.
  const formDepartmani = typeof form.degerler['departmanId'] === 'string' ? form.degerler['departmanId'] : '';
  const pozisyonOnerileri = pozisyonTanimOnerileri(depo.tur('title'), formDepartmani);

  // Pozisyon girilince boş yaka ve kademe tanımdan, tanım yoksa addan tahmin edilir; işe giriş girilince boş deneme bitişi önerilir.
  const degistir = (k: string, v: unknown) => {
    const yama: Degerler = { [k]: v };
    if (k === 'pozisyon' && typeof v === 'string') {
      const tanim = depo.tur('title').find((t) => t.ad === v);
      const yaka = tanim?.yakaTipi ?? (sabitler ? sabitler.inferCollar(v) : undefined);
      const kademe = tanim?.kademe ?? (sabitler ? sabitler.inferLevel(v) : undefined);
      if ('yakaTipi' in form.degerler && !form.degerler.yakaTipi && yaka) yama.yakaTipi = yaka;
      if ('kademe' in form.degerler && !form.degerler.kademe && kademe) yama.kademe = kademe;
    }
    form.degistir(yama);
  };

  const gruplar = bolumler.map((b) => ({ b, alanlar: alanlar.filter((f) => f.bolum === b) }));
  const formMerkezi = Number(form.degerler['isMerkeziId']) || null;
  const istasyonSecenekleri = merkezIstasyonlari(formMerkezi);
  const secilenIstasyon = gecerliIstasyon(formMerkezi);
  const ad = kayit ? adSoyadMetni(kayit) : '';
  return (
    <>
    <FormPenceresi
      acik={acik} kapat={kapat} form={form}
      baslik={baslik ?? (kayit ? `${ad}: ${bolum === 'Ayrılış' && !kayit.cikisTarihi ? 'işten çıkış' : bolum ?? 'düzenle'}` : 'Yeni personel')}
    >
      {gruplar.map((g) => (
        <fieldset key={g.b} className="tc-ikp-form-bolum">
          {gruplar.length > 1 && <legend>{g.b}</legend>}
          <div className="tc-ikp-form-alanlar">
            {g.alanlar.map((f) => (f.k === 'pozisyon' ? (
              <PozisyonGirdisi
                key={f.k} etiket={f.l} zorunlu={f.zorunlu} deger={form.degerler[f.k]} oneriler={pozisyonOnerileri} hata={form.hata(f.k)}
                degistir={(v) => { degistir(f.k, v); }}
              />
            ) : (
              <AlanGirdisi key={f.k} f={f} deger={form.degerler[f.k]} degistir={(v) => { degistir(f.k, v); }} hata={form.hata(f.k)} b={baglam} />
            )))}
          </div>
        </fieldset>
      ))}
      {hesapAcar && (
        <fieldset className="tc-ikp-form-bolum">
          <legend>Giriş hesabı</legend>
          <div className="tc-ikp-form-alanlar">
            <Secim
              etiket="Rol" required value={rolId === null ? '' : String(rolId)} bosSecenek={roller.data ? 'Seçiniz' : 'Yükleniyor'}
              secenekler={(roller.data?.roller ?? []).map((r) => ({ deger: String(r.id), baslik: r.ad }))}
              onChange={(o) => { rolSecimiYaz(o.target.value === '' ? null : Number(o.target.value)); }}
              ipucu="Hesap kayıtla açılır; kullanıcı adı ve geçici PIN sistemce verilir. Yetki dağıtan roller burada yoktur. Sistem Yöneticisi rolü Kişiler > Personel > Roller'den, yalnız Sistem Yöneticisi tarafından verilir."
            />
            <Secim
              etiket="İlk istasyon" value={secilenIstasyon === null ? '' : String(secilenIstasyon)}
              bosSecenek={formMerkezi === null ? 'Önce iş merkezi seçin' : 'Atama yok'} disabled={formMerkezi === null}
              secenekler={istasyonSecenekleri.map((i) => ({ deger: String(i.id), baslik: i.ad }))}
              onChange={(o) => { istasyonIdYaz(o.target.value === '' ? null : Number(o.target.value)); }}
              ipucu="İsteğe bağlı: tam (%100) atama işe giriş gününden başlar. Sonraki atamalar İstasyonlar'dadır."
            />
            <Girdi
              etiket="Giriş kartı" maxLength={64} autoComplete="off" value={kartNo} onChange={(o) => { kartNoYaz(o.target.value); }}
              // Okuyucu klavye gibi yazıp Enter'a basar: Enter formu göndermesin, kart alanda kalsın.
              onKeyDown={(o) => { if (o.key === 'Enter') o.preventDefault(); }}
              ipucu="İsteğe bağlı: alana tıklayıp kartı okutun. Kişi istasyonda bu kartla girer."
            />
          </div>
        </fieldset>
      )}
    </FormPenceresi>
    {sonuc && (
      <Pencere
        acik kapat={() => { const p = sonuc.p; sonucYaz(null); kaydedildi?.(p); }} baslik="Giriş hesabı açıldı"
        alt={<Dugme tur="birincil" onClick={() => { const p = sonuc.p; sonucYaz(null); kaydedildi?.(p); }}>Tamam</Dugme>}
      >
        <Tanimlar satirlar={[
          { etiket: 'Kullanıcı adı', deger: sonuc.c.hesap?.kullaniciAdi ?? '' },
          { etiket: 'Geçici PIN', deger: sonuc.c.hesap?.pin ?? '' },
          { etiket: 'Giriş kartı', deger: sonuc.c.kart ? `••••${sonuc.c.kart.kartSon4}` : 'Verilmedi' },
        ]} />
        <Not>PIN yalnız şimdi gösterilir; çalışana iletin. Çalışan ilk girişte kendi PIN'ini belirler.</Not>
      </Pencere>
    )}
    </>
  );
}

// Pozisyon alanı: tanım listesinden önerir (tarayıcı öneri listesi), serbest yazıyı da kabul eder; eski kayıtlar bozulmaz.
function PozisyonGirdisi({ etiket, zorunlu, deger, oneriler, hata, degistir }: {
  etiket: string; zorunlu: boolean | undefined; deger: unknown; oneriler: readonly string[]; hata: string | undefined; degistir: (v: string) => void;
}) {
  const liste = useId();
  return (
    <>
      <Girdi
        etiket={etiket} required={zorunlu} name="pozisyon" hata={hata} list={liste} autoComplete="off" value={typeof deger === 'string' ? deger : ''}
        ipucu={oneriler.length ? 'Listeden seçin ya da yazın; liste Organizasyon’daki pozisyon tanımlarından gelir.' : undefined}
        onChange={(o) => { degistir(o.target.value); }}
      />
      <datalist id={liste}>{oneriler.map((ad) => <option key={ad} value={ad} />)}</datalist>
    </>
  );
}

// Parçalar arası bileşen (sözleşme): İşe alım "İşe al" ön dolu açar; kayıttan sonrası çağıranındır.
export interface PersonelFormuOzellikleri { acik: boolean; onDolu: Partial<Personel>; kapat: () => void; kaydedildi: (p: Personel) => void }
export function PersonelFormu({ acik, onDolu, kapat, kaydedildi }: PersonelFormuOzellikleri) {
  const { data: depo } = useIkDeposu();
  const motor = useMemo(() => (depo ? motorKur([...depo.kayitlar.values()], depo.ayarlar) : null), [depo]);
  if (!depo) return null;
  return <PersonelFormPenceresi acik={acik} depo={depo} motor={motor} kayit={null} bolum={null} onDolu={onDolu} kapat={kapat} kaydedildi={kaydedildi} />;
}

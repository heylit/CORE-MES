import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CihazProfili } from '#paylasilan/kullanici.ts';
import { SAYFALAR, menudeGorunur } from '#paylasilan/sayfalar.ts';
import type {
  CihazProfiliKaydi, CihazProfilleriCevabi, KayitsizProfilCevabi, ProfilSayfalariCevabi,
} from '#paylasilan/sozlesme/oturum.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Kart, Rozet, Secim, useBildirim, type Secenek } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

export const CIHAZ_PROFILI_ANAHTARI = ['ayarlar', 'cihaz-profilleri'] as const;

export const PROFIL_ADLARI: Readonly<Record<CihazProfili, string>> = { tam: 'Tam', istasyon: 'İstasyon', telefon: 'Telefon' };
export const PROFIL_SECENEKLERI: readonly Secenek[] = (['tam', 'istasyon', 'telefon'] as const).map((p) => ({ deger: p, baslik: PROFIL_ADLARI[p] }));

const PROFIL_ACIKLAMASI: Readonly<Record<'istasyon' | 'telefon', string>> = {
  istasyon: 'Ortak cihaz: kart ve PIN ile giriş, çizimler çıkıştan sonra da cihazda kalır, 15 dk boşta kalan oturum kapanır.',
  telefon: 'Çizim, PDF ve 3B dosyaları açılmaz; talimat fotoğraf ve videoları görüntülenir. Kayıtsız cihaz bu profili alabilir.',
};

// Kart #1358 (1347 a): yetki rol ile cihaz profilinin kesişimidir, yönetici dahil. Değişiklik yalnız Tam profilli cihazdan yapılır;
// sunucu da denetler, ekran yalnız denetimi önceden gösterir.
function ProfilSayfalari({ profil, yazabilir }: { profil: CihazProfiliKaydi & { kod: 'istasyon' | 'telefon' }; yazabilir: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [secili, setSecili] = useState<readonly string[]>(profil.sayfalar ?? []);
  const kaydet = useMutation({
    mutationFn: () => api.post<ProfilSayfalariCevabi>(`/oturum/cihaz-profilleri/${profil.kod}/sayfalar`, { sayfalar: secili, surum: profil.surum }),
    onSuccess: () => { bildir('tamam', `${PROFIL_ADLARI[profil.kod]} profilinin sayfaları kaydedildi.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Profil kaydedilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: CIHAZ_PROFILI_ANAHTARI }),
  });
  const degisti = secili.length !== (profil.sayfalar ?? []).length || secili.some((s) => !(profil.sayfalar ?? []).includes(s));
  const degistir = (islem: string, acik: boolean) => {
    setSecili((once) => (acik ? [...once, islem] : once.filter((s) => s !== islem)));
  };
  return (
    <div className="tc-ayar-sayfa-satiri">
      <div className="tc-ayar">
        <div className="tc-ayar-metin">
          <p className="tc-ayar-baslik">{PROFIL_ADLARI[profil.kod]}</p>
          <p className="tc-ayar-aciklama">{PROFIL_ACIKLAMASI[profil.kod]}</p>
        </div>
        <Dugme
          tur="birincil" simge="check" disabled={!yazabilir || !degisti} yukleniyor={kaydet.isPending}
          onClick={() => { kaydet.mutate(); }} aria-label={`${PROFIL_ADLARI[profil.kod]} sayfalarını kaydet`}
        >
          Kaydet
        </Dugme>
      </div>
      <div className="tc-ayar-altlar">
        {SAYFALAR.filter(menudeGorunur).map((s) => (
          <div className="tc-ayar" key={s.islem}>
            <IsaretKutusu
              etiket={s.baslik} checked={secili.includes(s.islem)} disabled={!yazabilir || kaydet.isPending}
              onChange={(olay) => { degistir(s.islem, olay.target.checked); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CihazProfilleri({ buCihazProfili }: { buCihazProfili: CihazProfili | undefined }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = buCihazProfili === 'tam';
  const liste = useQuery({ queryKey: CIHAZ_PROFILI_ANAHTARI, queryFn: () => api.get<CihazProfilleriCevabi>('/oturum/cihaz-profilleri') });
  const kayitsiz = useMutation({
    mutationFn: (g: { kayitsizProfil: CihazProfili; surum: number }) => api.post<KayitsizProfilCevabi>('/oturum/cihaz-ayari/kayitsiz-profil', g),
    onSuccess: ({ kayitsizProfil }) => { bildir('tamam', `Kayıtsız cihazlar artık ${PROFIL_ADLARI[kayitsizProfil]} profiliyle açılır.`); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Ayar kaydedilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: CIHAZ_PROFILI_ANAHTARI }),
  });
  const veri = liste.data;
  return (
    <Kart baslik="Cihaz profilleri">
      {liste.isPending && <DurumKutusu durum="yukleniyor" />}
      {liste.isError && (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Cihaz profilleri okunamadı.')} yenile={() => { void liste.refetch(); }} />
      )}
      {veri && (
        <>
          {!yazabilir && (
            <div className="tc-ayar">
              <div className="tc-ayar-metin">
                <p className="tc-ayar-baslik"><Rozet ton="uyari">Salt okunur</Rozet></p>
                <p className="tc-ayar-aciklama">Profiller yalnız Tam profilli bir cihazdan değiştirilir.</p>
              </div>
            </div>
          )}
          <div className="tc-ayar">
            <div className="tc-ayar-metin">
              <p className="tc-ayar-baslik">Kayıtsız cihaz profili</p>
              <p className="tc-ayar-aciklama">
                Kaydı olmayan her cihaz (kişisel telefon dahil) bu profille girer. Ofis bilgisayarlarını Tam olarak kaydettikten sonra
                Telefon yapın; kaydı silinen bilgisayar da bu profile düşer.
              </p>
            </div>
            <Secim
              etiket="Kayıtsız cihaz" secenekler={PROFIL_SECENEKLERI} value={veri.ayar.kayitsizProfil} disabled={!yazabilir || kayitsiz.isPending}
              onChange={(olay) => { kayitsiz.mutate({ kayitsizProfil: olay.target.value as CihazProfili, surum: veri.ayar.surum }); }}
            />
          </div>
          {veri.profiller.map((p) => (p.kod === 'tam' ? null : (
            <ProfilSayfalari key={`${p.kod}-${String(p.surum)}`} profil={{ ...p, kod: p.kod }} yazabilir={yazabilir} />
          )))}
        </>
      )}
    </Kart>
  );
}

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { DagitCevabi, DagitGovdesi, DagitimCevabi, DagitimSatiri } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AtamaSecimi, YAPAN_IPUCU, atamaCoz, atamaDegeri, useAtamaSecenekleri } from './Atama.tsx';
import { SIKLIK_METNI, siklik, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { EksikEmirGorevleri } from './ProjeHazirlik.tsx';
import { useIstekKimligi } from './komut.ts';
import './projeler.css';

// Satırın ekranda düzenlenen hâli; atama seçicideki "k:<id>" / "r:<id>" değeridir.
interface Duzen { dahil: boolean; yapan: string; kontrol: string; planBitis: string; kanitZorunlu: boolean }
interface Ozel { anahtar: number; ad: string; yapan: string; kontrol: string; planBitis: string; kanitZorunlu: boolean }

const ilkDuzen = (s: DagitimSatiri): Duzen => ({
  dahil: true,
  yapan: atamaDegeri({ kisiId: s.yapanKisiId, rolId: s.yapanRolId }),
  kontrol: atamaDegeri({ kisiId: s.kontrolKisiId, rolId: s.kontrolRolId }),
  planBitis: s.planBitis,
  kanitZorunlu: s.kanitZorunlu,
});
const atamaAlanlari = (yapan: string, kontrol: string) => {
  const y = atamaCoz(yapan);
  const k = atamaCoz(kontrol);
  return { yapanKisiId: y.kisiId, yapanRolId: y.rolId, kontrolKisiId: k.kisiId, kontrolRolId: k.rolId };
};

function dogacakMetni(s: DagitimSatiri, emirSayisi: number | null): string {
  if (s.hazirlikMaddesi === null) return '1 proje görevi';
  if (s.dogacak === null) return 'emir bilgisi okunamadı';
  if (emirSayisi === 0) return 'emir gelince açılır';
  return s.dogacak === 0 ? 'açık görevi var' : `${String(s.dogacak)} emir görevi`;
}

const ATANMADI = 'Yapan atanmadı: kimseye bildirim gitmez; görev açılır, görev sayfasından atanır.';
const SIMDI_DEGIL = 'Şimdi değil: görevler açılmaz, emir görevleri de dağıtınca açılır; proje Görevler sayfasında dağıtılmamış görünür.';

// 3458-2 a: iş başlangıcında görevler bu ekranda dağıtılır. Şablon satırları yapan, kontrol eden, bitiş ve kanıtla düzenlenir;
// istenmeyen satır dışarıda bırakılır, bu işe özel görev eklenir. Hazırlık satırları projeye bağlı her açık emir için açılır;
// sonra gelen emirde de burada verilen atamayla doğar.
export function GorevDagit() {
  const { id: ham } = useParams();
  const projeId = Number(ham);
  const [adres, adresYaz] = useSearchParams();
  const istenen = adres.get('sablon');
  const sablonId = istenen !== null && /^[1-9]\d{0,9}$/.test(istenen) ? Number(istenen) : null;
  const yonlendir = useNavigate();
  const istemci = useQueryClient();
  const kimlik = useIstekKimligi();
  const atama = useAtamaSecenekleri();
  const maddeler = useHazirlikMaddeleri().data?.maddeler;
  const [duzen, duzenYaz] = useState<Map<number, Duzen>>(new Map());
  const [ozel, ozelYaz] = useState<Ozel[]>([]);
  const [sayac, sayacYaz] = useState(1);

  const v = useQuery({
    queryKey: [...anahtarlar.dagitim(projeId), sablonId],
    queryFn: () => api.get<DagitimCevabi>(`/projeler/${String(projeId)}/dagitim${sablonId === null ? '' : `?sablonId=${String(sablonId)}`}`),
    enabled: Number.isInteger(projeId) && projeId > 0,
  });
  // Şablon değişince satırlar yeniden şablondaki hâliyle başlar.
  useEffect(() => {
    if (v.data !== undefined) duzenYaz(new Map(v.data.satirlar.map((s) => [s.kalemId, ilkDuzen(s)])));
  }, [v.data]);

  const dagit = useMutation({
    mutationFn: (govde: DagitGovdesi) => api.post<DagitCevabi>(`/projeler/${String(projeId)}/dagit`, govde, { istekKimligi: kimlik.al() }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      void yonlendir(`/projeler/${String(projeId)}`);
    },
    onError: kimlik.hataSonrasi,
  });

  if (v.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(v.error, 'Dağıtım bilgisi alınamadı')} yenile={() => { void v.refetch(); }} />;
  if (v.data === undefined) return <DurumKutusu durum="yukleniyor" />;
  const d = v.data;
  const satirDuzeni = (s: DagitimSatiri): Duzen => duzen.get(s.kalemId) ?? ilkDuzen(s);
  const degistir = (s: DagitimSatiri, parca: Partial<Duzen>) => {
    duzenYaz((m) => new Map(m).set(s.kalemId, { ...satirDuzeni(s), ...parca }));
  };
  const ozelDegistir = (anahtar: number, parca: Partial<Ozel>) => {
    ozelYaz((l) => l.map((o) => (o.anahtar === anahtar ? { ...o, ...parca } : o)));
  };
  const ozelEkle = () => {
    ozelYaz((l) => [...l, { anahtar: sayac, ad: '', yapan: '', kontrol: '', planBitis: d.satirlar[0]?.planBitis ?? '', kanitZorunlu: false }]);
    sayacYaz((n) => n + 1);
  };

  const dahil = d.satirlar.filter((s) => satirDuzeni(s).dahil);
  const projeSayisi = dahil.filter((s) => s.hazirlikMaddesi === null).length + ozel.length;
  const hazirlikSayisi = dahil.reduce((t, s) => t + (s.hazirlikMaddesi === null ? 0 : s.dogacak ?? 0), 0);
  const secilenDagitildi = d.sablonlar.find((x) => x.id === d.sablonId)?.dagitildi === true;
  const ozelEksik = ozel.some((o) => o.ad.trim() === '' || o.planBitis === '');
  const bos = (d.sablonId === null || secilenDagitildi || dahil.length === 0) && ozel.length === 0;

  const gonder = () => {
    const sablonVar = d.sablonId !== null && !secilenDagitildi;
    dagit.mutate({
      sablonId: sablonVar ? d.sablonId : null,
      ...(sablonVar ? {
        satirlar: d.satirlar.map((s) => {
          const x = satirDuzeni(s);
          return { kalemId: s.kalemId, dahil: x.dahil, ...atamaAlanlari(x.yapan, x.kontrol), planBitis: x.planBitis, kanitZorunlu: x.kanitZorunlu };
        }),
      } : {}),
      ozel: ozel.map((o) => ({ ad: o.ad.trim(), ...atamaAlanlari(o.yapan, o.kontrol), planBitis: o.planBitis, kanitZorunlu: o.kanitZorunlu })),
    });
  };
  const sablonSecenekleri = d.sablonlar.map((x) => ({
    deger: String(x.id), baslik: `${x.ad}${x.varsayilan ? ' (varsayılan)' : ''}${x.dagitildi ? ' · dağıtıldı' : ''}`,
  }));

  return (
    <div className="tc-prj-icerik">
      <div className="tc-prj-bas">
        <Dugme simge="chev-left" onClick={() => { void yonlendir(`/projeler/${String(projeId)}`); }}>{d.proje.kod}</Dugme>
      </div>
      <div className="tc-prj-bas">
        <h2 className="tc-prj-gorev-ad">Görevleri dağıt</h2>
        <span className="tc-prj-soluk">{d.proje.kod} · {d.proje.ad}</span>
      </div>
      {!d.proje.aktif && <DurumKutusu durum="bos" mesaj="Proje kapalı: görev dağıtılmaz." />}
      {d.proje.aktif && (
        <>
          <Kart baslik="Şablon" simge="layers">
            <div className="tc-prj-icerik">
              <Secim
                etiket="Görev şablonu" value={d.sablonId === null ? '' : String(d.sablonId)} secenekler={sablonSecenekleri} bosSecenek="Şablonsuz (yalnız bu işe özel görevler)"
                onChange={(e) => { adresYaz(e.target.value === '' ? {} : { sablon: e.target.value }); }}
              />
              {d.dagitildi && <p className="tc-prj-soluk" role="note">Bu projede görev dağıtıldı. Başka bir şablon ya da bu işe özel görev eklenebilir.</p>}
              {secilenDagitildi && <p className="tc-prj-soluk" role="note">Bu şablon bu projede zaten dağıtıldı; satırları yeniden açılmaz.</p>}
              {secilenDagitildi && d.sablonId !== null && <EksikEmirGorevleri projeId={projeId} sablonId={d.sablonId} />}
              {d.emirSayisi !== null && d.satirlar.some((s) => s.hazirlikMaddesi !== null) && (
                <p className="tc-prj-soluk">
                  Projeye bağlı açık emir: {d.emirSayisi}. Emir başına görevler her emir için açılır; sonra gelen emirde de burada verilen atamayla doğar.
                </p>
              )}
            </div>
          </Kart>
          {d.sablonId !== null && !secilenDagitildi && (
            <Kart baslik="Şablonun görevleri" simge="list" sag={<span className="tc-prj-soluk">{dahil.length}/{d.satirlar.length} dağıtılacak</span>}>
              {d.satirlar.length === 0 && <p className="tc-prj-soluk">Şablonda görev yok.</p>}
              <ul className="tc-prj-dagit-liste" aria-label="Şablonun görevleri">
                {d.satirlar.map((s) => {
                  const x = satirDuzeni(s);
                  return (
                    <li key={s.kalemId} className="tc-prj-dagit-satir" data-dahil={x.dahil ? 'evet' : 'hayir'}>
                      <div className="tc-prj-dagit-bas">
                        <IsaretKutusu etiket={s.ad} checked={x.dahil} onChange={(e) => { degistir(s, { dahil: e.target.checked }); }} />
                        <Rozet ton={s.hazirlikMaddesi === null ? 'pasif' : 'bilgi'}>{SIKLIK_METNI[siklik(s.hazirlikMaddesi, maddeler)]}</Rozet>
                        <span className="tc-prj-soluk">
                          {s.hazirlikAd !== null && `${s.hazirlikAd} · `}{s.asama !== null && `${s.asama} · `}{s.adimlar.length > 0 ? `${String(s.adimlar.length)} adım · ` : ''}{dogacakMetni(s, d.emirSayisi)}
                        </span>
                      </div>
                      {x.dahil && (
                        <div className="tc-prj-dagit-alanlar">
                          <AtamaSecimi
                            etiket="Yapan" deger={x.yapan} ad={null} secenekler={atama.secenekler} hata={atama.hata} bos="Atanmadı"
                            degistir={(y) => { degistir(s, { yapan: y }); }}
                          />
                          <AtamaSecimi
                            etiket="Kontrol eden" deger={x.kontrol} ad={null} secenekler={atama.secenekler} hata={undefined} bos="Kontrol yok"
                            degistir={(y) => { degistir(s, { kontrol: y }); }}
                          />
                          {s.hazirlikMaddesi === null
                            ? <Girdi etiket="Bitiş" type="date" required value={x.planBitis} onChange={(e) => { degistir(s, { planBitis: e.target.value }); }} />
                            : <Girdi etiket="Bitiş" value="Emrin tarihine göre" disabled />}
                          <IsaretKutusu etiket="Kanıt ister" checked={x.kanitZorunlu} onChange={(e) => { degistir(s, { kanitZorunlu: e.target.checked }); }} />
                        </div>
                      )}
                      {x.dahil && x.yapan === '' && <p className="tc-prj-soluk" role="note">{ATANMADI}</p>}
                    </li>
                  );
                })}
              </ul>
            </Kart>
          )}
          <Kart baslik="Bu işe özel görevler" simge="plus">
            {ozel.length === 0 && <p className="tc-prj-soluk">Şablonda olmayan, yalnız bu işe ait görev eklenebilir.</p>}
            <ul className="tc-prj-dagit-liste" aria-label="Bu işe özel görevler">
              {ozel.map((o) => (
                <li key={o.anahtar} className="tc-prj-dagit-satir">
                  <div className="tc-prj-dagit-alanlar">
                    <Girdi etiket="Görev adı" required maxLength={200} value={o.ad} onChange={(e) => { ozelDegistir(o.anahtar, { ad: e.target.value }); }} />
                    <AtamaSecimi
                      etiket="Yapan" deger={o.yapan} ad={null} secenekler={atama.secenekler} hata={atama.hata} bos="Atanmadı" ipucu={YAPAN_IPUCU}
                      degistir={(y) => { ozelDegistir(o.anahtar, { yapan: y }); }}
                    />
                    <AtamaSecimi
                      etiket="Kontrol eden" deger={o.kontrol} ad={null} secenekler={atama.secenekler} hata={undefined} bos="Kontrol yok"
                      degistir={(y) => { ozelDegistir(o.anahtar, { kontrol: y }); }}
                    />
                    <Girdi etiket="Bitiş" type="date" required value={o.planBitis} onChange={(e) => { ozelDegistir(o.anahtar, { planBitis: e.target.value }); }} />
                    <IsaretKutusu etiket="Kanıt ister" checked={o.kanitZorunlu} onChange={(e) => { ozelDegistir(o.anahtar, { kanitZorunlu: e.target.checked }); }} />
                  </div>
                  <div className="tc-prj-gorunum tc-prj-dagit-alt">
                    <span className="tc-prj-soluk" role="note">{o.yapan === '' ? ATANMADI : ''}</span>
                    <Dugme simge="trash" aria-label={`${o.ad === '' ? 'Adsız görev' : o.ad}: kaldır`} onClick={() => { ozelYaz((l) => l.filter((z) => z.anahtar !== o.anahtar)); }}>Kaldır</Dugme>
                  </div>
                </li>
              ))}
            </ul>
            <div className="tc-prj-gorunum">
              <Dugme simge="plus" disabled={ozel.length >= 20} onClick={ozelEkle}>Bu işe özel görev ekle</Dugme>
            </div>
          </Kart>
          <div className="tc-prj-gorunum tc-prj-dagit-alt">
            <span className="tc-prj-soluk">
              {bos
                ? secilenDagitildi ? 'Bu şablon dağıtıldı: Dağıt yalnız bu işe özel görev eklenince açılır.' : 'Dağıtılacak görev yok.'
                : `${String(projeSayisi)} proje görevi${hazirlikSayisi > 0 ? `, ${String(hazirlikSayisi)} emir görevi` : ''} açılacak; atananlara bildirim gider.`}
              {!d.dagitildi && <><br />{SIMDI_DEGIL}</>}
            </span>
            <div className="tc-prj-gorunum">
              <Dugme onClick={() => { void yonlendir(`/projeler/${String(projeId)}`); }} disabled={dagit.isPending}>Şimdi değil</Dugme>
              <Dugme tur="birincil" simge="users" disabled={bos || ozelEksik} yukleniyor={dagit.isPending} onClick={gonder}>Dağıt</Dugme>
            </div>
          </div>
          {dagit.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(dagit.error, 'Görevler dağıtılamadı')}</p>}
        </>
      )}
    </div>
  );
}

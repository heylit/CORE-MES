import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { HazirlikProjesiCevabi, HazirlikProjesiGovdesi, HazirlikProjesiSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Pencere, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3396 a: emir için hazırlık projesi. Görevler seçilen projede açılır (emrin numarasındaki proje değişmez); şablonun hazırlık
// kalemleri emir ya da iş emri başına görev olur, aynı görev ikinci kez açılmaz. Yeni proje siparişle açılır (PRJ-10): Projeler'de.
export function HazirlikProjesiDugmesi({ emirId }: { emirId: number }) {
  const [acik, acikYaz] = useState(false);
  return (
    <>
      <Dugme simge="flag" onClick={() => { acikYaz(true); }}>Hazırlık projesi</Dugme>
      {acik && <HazirlikProjesiPenceresi emirId={emirId} kapat={() => { acikYaz(false); }} />}
    </>
  );
}

function HazirlikProjesiPenceresi({ emirId, kapat }: { emirId: number; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yol = `/adimli-emirler/${String(emirId)}/hazirlik-projesi`;
  const s = useQuery({ queryKey: [...anahtarlar.hazirlik(emirId), 'proje'], queryFn: () => api.get<HazirlikProjesiSecenekleri>(yol) });
  const v = s.data;
  const [proje, projeYaz] = useState<string | null>(null);
  const [sablon, sablonYaz] = useState<string | null>(null);
  const projeDeger = proje ?? (v?.emirProjeId == null ? '' : String(v.emirProjeId));
  const sablonDeger = sablon ?? String(v?.sablonlar.find((x) => x.varsayilan)?.id ?? '');
  const secili = v?.sablonlar.find((x) => String(x.id) === sablonDeger) ?? null;
  const komut = useMutation({
    mutationFn: () => api.post<HazirlikProjesiCevabi>(
      yol, { projeId: Number(projeDeger), sablonId: secili?.id ?? null } satisfies HazirlikProjesiGovdesi, { istekKimligi: yeniIstekKimligi() },
    ),
    onSuccess: async (c) => {
      bildir('tamam', c.eklenen === 0 ? 'Yeni görev doğmadı: görevler zaten açık ya da madde kapalı.' : `${String(c.eklenen)} hazırlık görevi dağıtıldı.`);
      await istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(emirId) });
      kapat();
    },
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (projeDeger !== '') komut.mutate();
  };
  const projeler = (v?.projeler ?? []).map((p) => ({
    deger: String(p.id), baslik: `${p.kod} · ${p.ad}${p.id === v?.emirProjeId ? ' (emrin projesi)' : ''}`,
  }));
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={v ? `${v.emirNo} için hazırlık` : 'Hazırlık projesi'}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending} disabled={!v || projeDeger === ''}>Kaydet ve dağıt</Dugme>
        </>
      )}
    >
      {s.isPending && <p className="tc-emir-not">Seçenekler okunuyor…</p>}
      {s.isError && <p className="tc-emir-not" role="alert">{hataIletisi(s.error, 'Seçenekler okunamadı.')}</p>}
      {v && (
        <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
          <div className="tc-form-tam">
            <Secim
              etiket="Proje"
              required
              value={projeDeger}
              bosSecenek="Proje seçin"
              secenekler={projeler}
              onChange={(e) => { projeYaz(e.target.value); }}
              ipucu="Projesiz emirde hazırlık görevi açılmaz; yeni proje siparişle Projeler sayfasında açılır."
            />
            <Link to="/projeler" className="tc-emir-not">Yeni proje aç</Link>
          </div>
          <div className="tc-form-tam">
            <Secim
              etiket="Hazırlık şablonu"
              value={sablonDeger}
              bosSecenek="Projeye uygulanmış şablonlar"
              secenekler={v.sablonlar.map((x) => ({ deger: String(x.id), baslik: `${x.ad}${x.varsayilan ? ' (varsayılan)' : ''}` }))}
              onChange={(e) => { sablonYaz(e.target.value); }}
            />
          </div>
          <p className="tc-form-tam tc-emir-not">
            Son günler emrin planına göre: başlangıç {v.baslangic === null ? 'yok (proje başlangıcı)' : tarihMetni(v.baslangic)}, teslim{' '}
            {v.teslim === null ? 'yok (proje bitişi)' : tarihMetni(v.teslim)}.
          </p>
          <p className="tc-form-tam tc-emir-not">
            <Simge ad="check" />{' '}
            {secili === null
              ? 'Projeye uygulanmış şablonların hazırlık kalemleri görev olur.'
              : secili.dogacak === 0 ? 'Bu şablonda açık hazırlık maddesi yok; görev doğmaz.'
                : <>Kaydedince en çok <b>{secili.dogacak} görev</b> doğar: {secili.ozet}. Role atananlar o roldeki herkese bildirim olarak düşer, ilk üstlenen alır.</>}
            {v.acikGorev > 0 && ` Bu emirde ${String(v.acikGorev)} hazırlık görevi zaten açık; aynısı yeniden açılmaz.`}
          </p>
          {komut.isError && <p className="tc-form-tam tc-emir-not" role="alert">{hataIletisi(komut.error, 'Görevler dağıtılamadı.')}</p>}
        </form>
      )}
    </Pencere>
  );
}

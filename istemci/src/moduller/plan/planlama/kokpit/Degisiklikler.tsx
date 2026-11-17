import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import './kokpit.css';
import { etkiSatirlari } from './ayarlar.ts';
import { BASLIK_ADI, BASLIK_NOTU, BASLIKLAR, degisiklikDokumu, type Degisiklik } from './degisiklikler.ts';
import type { SatirEtkisiYuzu } from './satir-etkisi.ts';

// Planı etkileyen değişiklikler (3317 a, 1. adım). İki parça: plan şeridinin satırındaki özet ("N değişiklik", döküm, "Gör ve uygula") ve
// şeridin altında açılan liste (üç başlık, satırda "Göster"). Veri değişiklikleri şeritteki toplu düğmeyle ya da satırdaki "Etkisini gör"
// ile tek tek kişinin taslağına uygulanır (2. adım); "Plan geride" satırında aynı düğme o emri yeniden dizer (3. adım); "Sahada oldu" yalnız gösterir.
// salt: sayfa listeyi yalnız gösterir (Motor, 3317-1b); düğme "Gör"dür, uygulama Kokpit'tedir.
export function DegisiklikOzeti({ l, acik, ac, salt = false }: { l: readonly Degisiklik[]; acik: boolean; ac: (a: boolean) => void; salt?: boolean }) {
  const ad = salt ? 'Gör' : 'Gör ve uygula';
  if (l.length === 0) return <span className="tc-pyq-dg-ozet" data-degisiklik-ozeti=""><Rozet ton="tamam">Plan güncel</Rozet></span>;
  return (
    <span className="tc-pyq-dg-ozet" data-degisiklik-ozeti="">
      <b>{l.length} değişiklik</b>
      <span className="tc-pyq-dg-dokum">{degisiklikDokumu(l)}</span>
      <button type="button" className="tc-dugme tc-pym-kucuk" aria-label={acik ? 'Değişiklikleri kapat' : salt ? 'Değişiklikleri gör' : ad} aria-expanded={acik} aria-controls="tc-pyq-dg-liste" onClick={() => { ac(!acik); }}>
        <span>{acik ? 'Kapat' : ad}</span><Simge ad={acik ? 'up' : 'down'} boyut="k" />
      </button>
    </span>
  );
}

export interface DegisikliklerOzellikleri {
  l: readonly Degisiklik[];
  // Seçili kartın emirleri ve adı: süzgeç açıkken yalnız bu emirlerin satırları görünür.
  kart: { ad: string; emirler: ReadonlySet<string> } | null;
  suzgec: boolean;
  suzgecKoy: (a: boolean) => void;
  // Satırın emrini (ve varsa işini) seçer; liste kapanır. null: sayfa yalnız gösterir, satırda düğme yoktur.
  goster: ((d: Degisiklik) => void) | null;
  // Toplu düğmenin uygulayacağı veri değişikliği sayısı; düğme yoksa (yazamayan kişi, uygulanacak yok) null.
  toplu: number | null;
  // Yalnız gösteren sayfada (Motor) listenin altındaki bağlantı: Kokpit'i açar, satırlar orada gösterilir ve düzeltilir.
  kokpiteGit?: (() => void) | null;
  // Veri değişikliği satırının etkisi ve tek başına uygulanması; yazamayan kişide ve yalnız gösteren sayfada null.
  etki?: SatirEtkisiYuzu | null;
  // Taslakta uygulanmış, ortak planda hâlâ bekleyen veri değişikliği sayısı (listede durmaz, toplu düğme sayar).
  taslakta?: number;
}

function SatirEtkisiBolumu({ e }: { e: SatirEtkisiYuzu }) {
  const d = e.durum;
  if (d.tur === 'duzen') return null;
  if (d.tur === 'hesap') return <p className="tc-pyq-dg-etki" role="status">Etkisi hesaplanıyor; plan değişmedi.</p>;
  if (d.tur === 'hata') {
    return (
      <div className="tc-pyq-dg-etki" role="alert">
        <span>{d.ileti}</span>
        <Dugme tur="ikincil" simge="x" onClick={e.vazgec}>Kapat</Dugme>
      </div>
    );
  }
  return (
    <section className="tc-pyq-dg-etki" aria-label="Etkisi">
      <dl>
        {etkiSatirlari(d.e.once, d.e.sonra).map((s) => (
          <div key={s.ad}><dt>{s.ad}</dt><dd data-yon={s.yon}>{s.once === null ? s.sonra : `${s.once} → ${s.sonra}`}</dd></div>
        ))}
      </dl>
      {e.butun
        ? <p className="tc-pyq-not">Bu değişiklik bütün planı etkiler: bütün işler yeniden dizilir ve bekleyen veri değişikliklerinin hepsi uygulanır.</p>
        : e.birlikte > 0 && <p className="tc-pyq-not">{`Aynı emirleri etkileyen ${String(e.birlikte)} değişiklik de birlikte uygulanır.`}</p>}
      <div className="tc-pyq-dg-etki-dugmeler">
        <Dugme tur="ikincil" simge="check" disabled={e.mesgul} onClick={e.uygula}>Uygula</Dugme>
        <Dugme simge="x" disabled={e.mesgul} onClick={e.vazgec}>Vazgeç</Dugme>
      </div>
    </section>
  );
}

export function Degisiklikler({ l, kart, suzgec, suzgecKoy, goster, toplu, kokpiteGit = null, etki = null, taslakta = 0 }: DegisikliklerOzellikleri) {
  const kartta = kart === null ? [] : l.filter((d) => d.emirId !== null && kart.emirler.has(d.emirId));
  const suzulu = suzgec && kart !== null && kartta.length > 0;
  const gorunen = suzulu ? kartta : l;
  return (
    <section className="tc-pyq-dg" id="tc-pyq-dg-liste" aria-label="Planı etkileyen değişiklikler">
      {kart !== null && kartta.length > 0 && (
        <p className="tc-pyq-dg-suzgec">
          {suzulu ? <><b>{kart.ad} için</b> · {kartta.length} değişiklik</> : <>{kart.ad} için {kartta.length} değişiklik var</>}
          <button type="button" className="tc-pyq-kucuk" aria-pressed={suzulu} onClick={() => { suzgecKoy(!suzulu); }}>{suzulu ? 'Tümünü göster' : `Yalnız ${kart.ad}`}</button>
        </p>
      )}
      {BASLIKLAR.map((b) => {
        const satirlar = gorunen.filter((d) => d.baslik === b);
        if (satirlar.length === 0) return null;
        return (
          <section key={b} aria-label={BASLIK_ADI[b]} data-baslik={b}>
            <h3><b>{BASLIK_ADI[b]}</b> <span>{satirlar.length} · {BASLIK_NOTU[b]}</span></h3>
            <ul>
              {satirlar.map((d) => {
                // Tek başına uygulanabilen satırın etki anahtarı: veri satırında bekleyen kimliği, yeniden dizilebilen geride satırında anahtarı.
                const ek = d.bekleyenId ?? (d.yenidenDiz === true ? d.anahtar : null);
                return (
                <li key={d.anahtar}>
                  <div className="tc-pyq-dg-ne"><b>{d.ne}</b><small>{d.alt}</small></div>
                  {goster !== null && d.emirId !== null && <Dugme className="tc-pyq-dg-dugme" tur="ikincil" simge="eye" onClick={() => { goster(d); }}>Göster</Dugme>}
                  {etki !== null && ek !== null && etki.id !== ek && (
                    <Dugme className="tc-pyq-dg-dugme" tur="ikincil" simge="clock" disabled={etki.mesgul || etki.id !== null} onClick={() => { if (d.bekleyenId !== null) etki.gor(d.bekleyenId); else etki.gorGeride(d, l); }}>Etkisini gör</Dugme>
                  )}
                  {etki !== null && etki.id !== null && etki.id === ek && <SatirEtkisiBolumu e={etki} />}
                </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="tc-pyq-not">
        {toplu !== null ? `"Planı güncelle (${String(toplu)})" yalnız "Veri değişti" satırlarının etkilediği işleri yeniden dizer${etki !== null ? '; "Etkisini gör" tek satırın planı nasıl değiştireceğini gösterir, "Uygula" taslağınıza yazar' : ''}. ` : ''}
        {taslakta > 0 ? `${String(taslakta)} veri değişikliği taslağınızda uygulandı, listede durmaz; ortak plana taslak yazılınca girer, "Planı güncelle" o zamana kadar onu da sayar. ` : ''}
        {etki !== null
          ? `"Plan geride" satırında "Etkisini gör" o emir yeniden dizilince ne olacağını gösterir (geride kalan iş şimdiden sonraya gider)${toplu === null ? '; "Uygula" taslağınıza yazar' : ''}. "Sahada oldu" satırları bilgi içindir: "Göster" ile emre gidilir.`
          : goster !== null
          ? '"Sahada oldu" ve "Plan geride" satırları bilgi içindir: "Göster" ile emre gidilir, düzeltme aşağıda elle yapılır.'
          : '"Sahada oldu" ve "Plan geride" satırları bilgi içindir; bu sayfa planı okur, emre gitmek ve düzeltmek Kokpit\'tedir.'}
      </p>
      {kokpiteGit && <Dugme className="tc-pyq-dg-dugme" tur="ikincil" simge="chev-right" data-kokpite-git="" onClick={kokpiteGit}>Kokpit'te gör ve düzelt</Dugme>}
    </section>
  );
}

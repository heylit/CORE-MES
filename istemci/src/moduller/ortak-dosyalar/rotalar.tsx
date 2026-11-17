import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { useParams } from 'react-router-dom';
import type { HazirListe } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { HAZIR_LISTE_TANIMLARI } from './HazirListeler.tsx';
import { OrtakDosyalar } from './OrtakDosyalar.tsx';

function Klasorler() { return <OrtakDosyalar gorunum="klasorler" />; }
function SonEklenenler() { return <OrtakDosyalar gorunum="son" />; }
function Arsiv() { return <OrtakDosyalar gorunum="arsiv" />; }
function Ayarlar() { return <OrtakDosyalar gorunum="ayarlar" />; }
// Hazır listeler (kart 3390): bilinmeyen liste adı klasörlere döner.
function Hazir() {
  const { liste } = useParams();
  const l = liste !== undefined && Object.hasOwn(HAZIR_LISTE_TANIMLARI, liste) ? liste as HazirListe : null;
  return l === null ? <OrtakDosyalar gorunum="klasorler" /> : <OrtakDosyalar gorunum="hazir" liste={l} />;
}

export const rotalar: ModulRotasi[] = [
  { yol: '/ortak-dosyalar', ekran: Klasorler },
  { yol: '/ortak-dosyalar/son-eklenenler', ekran: SonEklenenler },
  { yol: '/ortak-dosyalar/arsiv', ekran: Arsiv },
  { yol: '/ortak-dosyalar/ayarlar', ekran: Ayarlar },
  { yol: '/ortak-dosyalar/hazir/:liste', ekran: Hazir },
];

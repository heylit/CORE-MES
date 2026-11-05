import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { OrtakDosyalar } from './OrtakDosyalar.tsx';

function Klasorler() { return <OrtakDosyalar gorunum="klasorler" />; }
function SonEklenenler() { return <OrtakDosyalar gorunum="son" />; }
function Arsiv() { return <OrtakDosyalar gorunum="arsiv" />; }

export const rotalar: ModulRotasi[] = [
  { yol: '/ortak-dosyalar', ekran: Klasorler },
  { yol: '/ortak-dosyalar/son-eklenenler', ekran: SonEklenenler },
  { yol: '/ortak-dosyalar/arsiv', ekran: Arsiv },
];

// occt-import-js tip tanımı yayımlamaz; modülün kullandığı yüzey (ReadStepFile ve sonuç biçimi).
declare module 'occt-import-js' {
  export interface OcctAgi {
    name: string;
    color?: [number, number, number];
    attributes: { position: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } };
    index: { array: ArrayLike<number> };
  }
  export interface OcctSonucu {
    success: boolean;
    meshes: OcctAgi[];
  }
  export interface OcctAyari {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
    linearDeflection?: number;
    angularDeflection?: number;
  }
  export interface Occt {
    ReadStepFile(icerik: Uint8Array, ayar: OcctAyari | null): OcctSonucu;
  }
  export default function occtimportjs(modul?: { locateFile?: (yol: string) => string }): Promise<Occt>;
}

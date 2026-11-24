/** Campo vectorial fijo: aporta profundidad sin descargar imágenes ni interceptar gestos. */
export default function PitchBackground() {
  return <div className="stadium-background" aria-hidden="true">
    <div className="stadium-light light-violet"/><div className="stadium-light light-mint"/>
    <svg className="pitch-lines" viewBox="0 0 740 1100" fill="none">
      <rect x="40" y="40" width="660" height="1020" rx="4"/>
      <path d="M40 550H700M168 40V202H572V40M278 40V100H462V40M168 1060V898H572V1060M278 1060V1000H462V1060"/>
      <circle cx="370" cy="550" r="92"/><circle cx="370" cy="550" r="3"/>
      <path d="M293 202A92 92 0 0 0 447 202M293 898A92 92 0 0 1 447 898M329 40V20H411V40M329 1060V1080H411V1060"/>
      <circle cx="370" cy="153" r="3"/><circle cx="370" cy="947" r="3"/>
      <path d="M40 60A20 20 0 0 0 60 40M680 40A20 20 0 0 0 700 60M40 1040A20 20 0 0 1 60 1060M680 1060A20 20 0 0 1 700 1040"/>
    </svg>
  </div>;
}

import brand from '../../../desktop/brand.json';

export default function AppBrandMark({ className = '', size = 32 }: { className?: string; size?: number }) {
  const icon = brand.icon;
  return <svg width={size} height={size} viewBox="0 0 320 320" className={className}
    aria-hidden="true" focusable="false" data-app-brand="yuanxiao-c">
    <rect x="4" y="4" width="312" height="312" rx={icon.radius - 4}
      fill={icon.background} stroke={icon.border} strokeWidth="8" />
    <g transform={icon.transform} fill={icon.foreground}>
      {icon.paths.map((path, index) => <path key={index} d={path} />)}
    </g>
  </svg>;
}

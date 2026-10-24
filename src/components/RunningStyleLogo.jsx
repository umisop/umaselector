const STYLE_LOGOS = {
  fr: { src: '/assets/running-style-front-runner.png', label: 'Front Runner' },
  pc: { src: '/assets/running-style-pace-chaser.png', label: 'Pace Chaser' },
  ls: { src: '/assets/running-style-late-surger.png', label: 'Late Surger' },
  ec: { src: '/assets/running-style-end-closer.png', label: 'End Closer' },
};

/** Uses the creator-supplied running-style icon asset for consistent labels. */
export default function RunningStyleLogo({ styleId, className = '', decorative = true }) {
  const style = STYLE_LOGOS[styleId];
  if (!style) return null;
  return (
    <img
      src={style.src}
      className={`running-style-logo ${className}`.trim()}
      alt={decorative ? '' : `${style.label} icon`}
      aria-hidden={decorative ? 'true' : undefined}
      loading="lazy"
      decoding="async"
    />
  );
}

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export default function CardImage({ card, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  const rawImageUrl = card?.imageUrl ?? card?.image_url ?? card?.img ?? '';
  const candidateUrl = typeof rawImageUrl === 'string' ? rawImageUrl.trim() : '';
  const imageUrl = /^https?:\/\//i.test(candidateUrl) ? candidateUrl : '';
  const label = card?.name || 'Support Card';

  if (!imageUrl || failed) {
    return (
      <div className={`card-image-fallback ${className}`} role="img" aria-label={`Image unavailable for ${label}`}>
        <div className="fallback-card-mark"><ImageOff size={21} strokeWidth={1.5} /></div>
        <span className="fallback-card-name">{label}</span>
        <span className="fallback-card-type">{card?.type || 'Support Card'}</span>
      </div>
    );
  }

  return (
    <img
      className={`card-image ${className}`}
      src={imageUrl}
      alt={`Support card: ${label}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

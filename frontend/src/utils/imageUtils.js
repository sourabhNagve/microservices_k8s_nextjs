// utils/imageUtils.js

// ─── Initials ─────────────────────────────────────────────────────────────────

export const getInitials = (name) => {
  if (!name || typeof name !== 'string') return 'U';

  // ✅ filter(Boolean) removes empty strings caused by extra spaces e.g. "John  Doe"
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0][0].toUpperCase();
};

// ─── Avatar colours ───────────────────────────────────────────────────────────

const GRADIENT_CLASSES = [
  'from-blue-500 to-purple-600',
  'from-green-500 to-teal-600',
  'from-purple-500 to-pink-600',
  'from-orange-500 to-red-600',
  'from-indigo-500 to-blue-600',
  'from-pink-500 to-rose-600',
  'from-yellow-500 to-orange-600',
  'from-teal-500 to-cyan-600',
];

const COLOR_MAP = {
  'from-blue-500 to-purple-600':  ['#3B82F6', '#9333EA'],
  'from-green-500 to-teal-600':   ['#10B981', '#14B8A6'],
  'from-purple-500 to-pink-600':  ['#A855F7', '#EC4899'],
  'from-orange-500 to-red-600':   ['#F97316', '#DC2626'],
  'from-indigo-500 to-blue-600':  ['#6366F1', '#3B82F6'],
  'from-pink-500 to-rose-600':    ['#EC4899', '#F43F5E'],
  'from-yellow-500 to-orange-600':['#EAB308', '#F97316'],
  'from-teal-500 to-cyan-600':    ['#14B8A6', '#06B6D4'],
};

// ✅ guard against null/empty name
export const generateAvatarColors = (name) => {
  if (!name || typeof name !== 'string') return GRADIENT_CLASSES[0];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % GRADIENT_CLASSES.length;
  return GRADIENT_CLASSES[index];
};

// ─── Image URL helpers ────────────────────────────────────────────────────────

export const isValidImageUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const getSafeImageUrl = (url, fallbackUrl = null) =>
  isValidImageUrl(url) ? url : fallbackUrl;

// ─── Canvas avatar ────────────────────────────────────────────────────────────

// ✅ SSR guard — canvas doesn't exist on the server
export const createAvatarDataUrl = (name, size = 100) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;

  const ctx    = canvas.getContext('2d');
  const colors = generateAvatarColors(name);
  const [color1, color2] = COLOR_MAP[colors] ?? COLOR_MAP['from-blue-500 to-purple-600'];

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle    = 'white';
  ctx.font         = `bold ${size / 3}px Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getInitials(name), size / 2, size / 2);

  return canvas.toDataURL();
};

// ─── Image loading ────────────────────────────────────────────────────────────

export const preloadImage = (src) =>
  new Promise((resolve, reject) => {
    const img  = new window.Image(); // ✅ explicit window.Image avoids name clash with Next.js <Image>
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src    = src;
  });

export const getImageDimensions = (src) =>
  new Promise((resolve, reject) => {
    const img  = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src    = src;
  });

// ─── CDN optimisation ─────────────────────────────────────────────────────────

export const optimizeImageSrc = (src, options = {}) => {
  const { width, height, quality = 80, format = 'auto' } = options;
  if (!isValidImageUrl(src)) return src;  // ✅ reuse validator instead of duplicating check

  try {
    const url = new URL(src);
    if (width)           url.searchParams.set('w', width);
    if (height)          url.searchParams.set('h', height);
    if (quality)         url.searchParams.set('q', quality);
    if (format !== 'auto') url.searchParams.set('f', format);
    return url.toString();
  } catch {
    return src;
  }
};
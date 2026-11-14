export interface OptimizedImageResult {
  base64Data: string;
  mimeType: string;
  fileName: string;
  originalBytes: number;
  optimizedBytes: number;
  previewUrl: string;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.84;

export async function optimizeImageFile(file: File): Promise<OptimizedImageResult> {
  const originalBytes = file.size;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Nije moguće pročitati izabranu fotografiju.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Datoteka nije važeća slika.'));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      base64Data: dataUrl,
      mimeType: file.type || 'image/jpeg',
      fileName: file.name,
      originalBytes,
      optimizedBytes: originalBytes,
      previewUrl: dataUrl,
    };
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const optimizedUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64Part = optimizedUrl.split(',')[1] || '';
  const optimizedBytes = Math.ceil((base64Part.length * 3) / 4);

  return {
    base64Data: optimizedUrl,
    mimeType: 'image/jpeg',
    fileName: file.name.replace(/\.[^.]+$/, '.jpg'),
    originalBytes,
    optimizedBytes,
    previewUrl: optimizedUrl,
  };
}

export async function rotateImageDataUrl(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Rotacija slike nije uspela.'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Greška pri čitanju datoteke.'));
    reader.readAsDataURL(file);
  });
}

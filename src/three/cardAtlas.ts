import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { createDeck } from '@/game-logic';
import { ATLAS_COLS, ATLAS_ROWS, BACK_CELL, CARD_ASPECT, cardBackSvg, cardSvg } from '@/components/table/cardSvg';

let atlas: CanvasTexture | null = null;
let atlasCellWidth = 0;

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Atlas mặt bài dùng chung cho mọi lá: 52 mặt (SVG `cardSvg`) + lưng bài trong MỘT canvas/texture,
 * tạo đúng một lần. Texture hiện trống tới khi các SVG tải xong (vài chục ms).
 */
export function getCardAtlas(cellWidth = 192): CanvasTexture {
  if (atlas) return atlas;
  atlasCellWidth = cellWidth;
  const cellHeight = Math.round(cellWidth / CARD_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * cellWidth;
  canvas.height = ATLAS_ROWS * cellHeight;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.fillStyle = '#fffdf6';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  atlas = texture;

  const faces = [...createDeck().map(cardSvg), cardBackSvg()];
  void Promise.all(faces.map(loadSvg)).then((images) => {
    images.forEach((image, index) => {
      const col = index % ATLAS_COLS;
      const row = Math.floor(index / ATLAS_COLS);
      context.drawImage(image, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
    });
    texture.needsUpdate = true;
  });
  return texture;
}

export const atlasInfo = (): { cellWidth: number; back: number } => ({ cellWidth: atlasCellWidth, back: BACK_CELL });

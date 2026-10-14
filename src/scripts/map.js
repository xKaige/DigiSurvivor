const MAP_COLS = 20;
const MAP_ROWS = 15;
const TILE_SIZE = 32;

const mapData = [
  [2, 2, 2, 2, 2, 2, 2, 2, 7, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [3, 0, 3, 0, 6, 6, 0, 3, 0, 0, 3, 0, 6, 6, 0, 3, 0, 3, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 4, 0, 1, 0, 0, 4, 0, 0, 4, 0, 0, 1, 0, 4, 0, 0, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 2],
  [2, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 2],
  [2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2],
  [2, 0, 0, 5, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 5, 0, 0, 0, 0, 2],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [2, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
];

function drawMap(cx) {
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const tileType = mapData[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      cx.fillStyle = tileType === 1 ? '#1a1829' : '#221e38';
      cx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      if (tileType === 2) {
        cx.fillStyle = '#3a3254';
        cx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      } else if (tileType === 3) {
        cx.fillStyle = '#3a3254';
        cx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        cx.fillStyle = '#e63946';
        cx.fillRect(x + 10, y + 6, 12, 16);
      } else if (tileType === 4) {
        cx.fillStyle = '#5c527f';
        cx.fillRect(x + 4, y + 2, TILE_SIZE - 8, TILE_SIZE - 4);
      } else if (tileType === 5) {
        cx.fillStyle = '#ff4a4a';
        cx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
      } else if (tileType === 6) {
        cx.fillStyle = '#ff7b00';
        cx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      } else if (tileType === 7) {
        cx.fillStyle = '#8d5b4c';
        cx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}
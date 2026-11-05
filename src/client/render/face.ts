/* Procedural character portraits. `f` is the face descriptor from the server: [skin, hair, eyes, mouth, brows, accessory].
   A graphics pass can replace this with sprites (the cast, dossier and lower third all call drawFace). */
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#9c6a46', '#7a4e32', '#5a3822'], HAIR = ['#2b1d12', '#5a3a1e', '#a0642a', '#d9b45a', '#c0c0c0', '#8a2f1c', '#222', '#6b4a8c'], EYE = ['#3a2a1a', '#2f5d8c', '#3d7a4a', '#6b6b6b', '#8c5a2f'];

export function drawFace(cv: HTMLCanvasElement, f: number[], size: number) {
  const c = cv.getContext('2d'), s = size; cv.width = cv.height = s; c.clearRect(0, 0, s, s);
  c.fillStyle = HAIR[f[1]]; c.beginPath(); c.arc(s / 2, s * 0.44, s * 0.36, Math.PI, 0); c.fill();                         /* hair */
  c.fillStyle = SKIN[f[0]]; c.beginPath(); c.ellipse(s / 2, s * 0.55, s * 0.28, s * 0.33, 0, 0, 7); c.fill();               /* head */
  c.fillStyle = HAIR[f[1]]; c.fillRect(s * 0.2, s * 0.3, s * 0.6, s * 0.1);                                                  /* fringe */
  c.fillStyle = EYE[f[2]]; c.beginPath(); c.arc(s * 0.4, s * 0.55, s * 0.045, 0, 7); c.arc(s * 0.6, s * 0.55, s * 0.045, 0, 7); c.fill();
  c.strokeStyle = '#3a2418'; c.lineWidth = Math.max(1, s * 0.03); c.beginPath();
  c.moveTo(s * 0.35, s * (0.5 - f[4] * 0.012)); c.lineTo(s * 0.45, s * 0.49); c.moveTo(s * 0.55, s * 0.49); c.lineTo(s * 0.65, s * (0.5 - f[4] * 0.012)); c.stroke();   /* brows */
  c.beginPath(); const m = f[3]; if (m === 0) { c.moveTo(s * 0.42, s * 0.7); c.lineTo(s * 0.58, s * 0.7); } else if (m === 1) c.arc(s / 2, s * 0.66, s * 0.1, 0.2, Math.PI - 0.2); else if (m === 2) c.arc(s / 2, s * 0.76, s * 0.08, Math.PI + 0.3, -0.3); else if (m === 3) { c.moveTo(s * 0.42, s * 0.71); c.quadraticCurveTo(s * 0.5, s * 0.77, s * 0.58, s * 0.69); } else { c.arc(s / 2, s * 0.7, s * 0.05, 0, 7); } c.stroke();
  const a = f[5]; if (a === 1) { c.strokeStyle = '#222'; c.strokeRect(s * 0.32, s * 0.48, s * 0.15, s * 0.14); c.strokeRect(s * 0.53, s * 0.48, s * 0.15, s * 0.14); c.beginPath(); c.moveTo(s * 0.47, s * 0.54); c.lineTo(s * 0.53, s * 0.54); c.stroke(); } else if (a === 2) { c.fillStyle = HAIR[(f[1] + 2) % 8]; c.beginPath(); c.moveTo(s * 0.34, s * 0.72); c.quadraticCurveTo(s * 0.5, s * 0.86, s * 0.66, s * 0.72); c.fill(); } else if (a === 3) { c.fillStyle = '#c0392b'; c.fillRect(s * 0.2, s * 0.22, s * 0.6, s * 0.08); }
}

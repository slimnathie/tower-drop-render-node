"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BlockKind = "normal" | "gold" | "steel" | "bomb";
type Block = { x: number; y: number; width: number; colour: string; kind: BlockKind; number: number };
type FallingBlock = Block & { targetY: number; velocityX: number };

const CANVAS_W = 720;
const CANVAS_H = 820;
const BLOCK_H = 58;
const BASE_W = 330;
const COLOURS = ["#ffc536", "#ff6b45", "#27d3a2", "#5ba7ff", "#b980ff"];
const DROP_GAP = BLOCK_H * 3;
const BOMB_CHANCE = 0.14;
const BOMB_FUSE_SECONDS = 3;

const blockKind = (number: number): BlockKind =>
  number > 0 && number % 20 === 0 ? "steel" : number > 0 && number % 10 === 0 ? "gold" : "normal";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const blocksRef = useRef<Block[]>([]);
  const currentRef = useRef<Block | null>(null);
  const fallingRef = useRef<FallingBlock | null>(null);
  const directionRef = useRef(1);
  const speedRef = useRef(230);
  const wobbleLevelRef = useRef(0);
  const gameTimeRef = useRef(0);
  const bombFuseRef = useRef<number | null>(null);
  const lastBombNumberRef = useRef(-10);
  const playingRef = useRef(false);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [status, setStatus] = useState<"ready" | "playing" | "over">("ready");
  const [callout, setCallout] = useState<string | null>(null);
  const [bombWarning, setBombWarning] = useState(false);

  useEffect(() => {
    setBest(Number(localStorage.getItem("tower-drop-best") ?? 0));
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const blocks = blocksRef.current;
    const top = blocks.at(-1);
    const targetY = CANVAS_H - 105 - 4 * BLOCK_H;
    const camera = top ? Math.max(0, targetY - top.y) : 0;
    const wobbleAmount = Math.min(18, Math.max(0, wobbleLevelRef.current - 4) * 0.75);
    const towerOffset = Math.sin(gameTimeRef.current * 0.95) * wobbleAmount;

    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, "#202959");
    sky.addColorStop(0.62, "#526f96");
    sky.addColorStop(1, "#f1a65b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 16; i++) {
      const x = (i * 113 + 45) % CANVAS_W;
      const y = (i * 71 + 55) % 460;
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#17213f";
    for (let i = 0; i < 12; i++) {
      const w = 65 + ((i * 17) % 42);
      const h = 70 + ((i * 53) % 185);
      const x = i * 68 - 10;
      ctx.fillRect(x, CANVAS_H - h, w, h);
      ctx.fillStyle = "#ffd86a";
      for (let wy = CANVAS_H - h + 18; wy < CANVAS_H - 14; wy += 28) {
        ctx.fillRect(x + 12, wy, 7, 11);
        ctx.fillRect(x + 34, wy, 7, 11);
      }
      ctx.fillStyle = "#17213f";
    }

    const drawBlock = (block: Block, isMoving = false, offsetX = 0) => {
      const y = block.y + camera;
      const x = block.x + offsetX;
      ctx.fillStyle = "rgba(8, 14, 35, .25)";
      ctx.fillRect(x + 8, y + 10, block.width, BLOCK_H);
      const fill = block.kind === "gold"
        ? ctx.createLinearGradient(x, y, x + block.width, y + BLOCK_H)
        : block.kind === "steel"
          ? ctx.createLinearGradient(x, y, x, y + BLOCK_H)
          : null;
      if (fill && block.kind === "gold") {
        fill.addColorStop(0, "#fff2a5");
        fill.addColorStop(.45, "#f9bd19");
        fill.addColorStop(1, "#fff0a0");
      } else if (fill) {
        fill.addColorStop(0, "#e9f0f4");
        fill.addColorStop(.5, "#87949d");
        fill.addColorStop(1, "#cbd5da");
      }
      ctx.fillStyle = block.kind === "bomb" ? "#d92d38" : fill ?? block.colour;
      ctx.fillRect(x, y, block.width, BLOCK_H);
      ctx.fillStyle = "rgba(255,255,255,.28)";
      ctx.fillRect(x, y, block.width, 9);
      ctx.fillStyle = "rgba(0,0,0,.17)";
      ctx.fillRect(x, y + BLOCK_H - 9, block.width, 9);
      if (block.kind === "gold") {
        ctx.fillStyle = "#fff9c8";
        ctx.font = "900 22px Arial";
        ctx.textAlign = "center";
        ctx.fillText("✦ +10 ✦", x + block.width / 2, y + 37);
      } else if (block.kind === "steel") {
        ctx.fillStyle = "#36424a";
        for (let bx = x + 13; bx < x + block.width; bx += 34) {
          ctx.beginPath();
          ctx.arc(bx, y + 29, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "900 18px Arial";
        ctx.textAlign = "center";
        ctx.fillText("+10", x + block.width / 2, y + 36);
      } else if (block.kind === "bomb") {
        ctx.fillStyle = "#341019";
        ctx.font = "1000 21px Arial";
        ctx.textAlign = "center";
        ctx.fillText("BOMB", x + block.width / 2, y + 37);
        if (!fallingRef.current) {
          const fuse = Math.max(0, (bombFuseRef.current ?? gameTimeRef.current) - gameTimeRef.current);
          ctx.strokeStyle = "#2a1216";
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(x + block.width / 2, y);
          ctx.quadraticCurveTo(x + block.width / 2 + 12, y - 18, x + block.width / 2 + 4, y - 31);
          ctx.stroke();
          ctx.fillStyle = fuse < 1 ? "#fff36a" : "#ff8a29";
          ctx.beginPath();
          ctx.arc(x + block.width / 2 + 4, y - 35, 9 + Math.sin(gameTimeRef.current * 18) * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "1000 20px Arial";
          ctx.fillText(fuse.toFixed(1), x + block.width / 2, y - 48);
        }
      }
      if (!isMoving && block.width > 45) {
        ctx.fillStyle = "rgba(22,27,61,.26)";
        ctx.font = "700 18px Arial";
        ctx.textAlign = "center";
        if (block.kind === "normal") ctx.fillText(String(block.number), x + block.width / 2, y + 36);
      }
    };

    blocks.forEach((block, index) => {
      const heightFactor = blocks.length <= 1 ? 0 : index / (blocks.length - 1);
      drawBlock(block, false, towerOffset * heightFactor);
    });

    const moving = fallingRef.current ?? currentRef.current;
    if (moving) {
      const movingY = moving.y + camera;
      if (!fallingRef.current) {
        ctx.strokeStyle = "#f3cd65";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(CANVAS_W / 2, 0);
        ctx.lineTo(moving.x + moving.width / 2, movingY);
        ctx.stroke();
        ctx.fillStyle = "#ffcf39";
        ctx.fillRect(CANVAS_W / 2 - 105, 0, 210, 16);
      }
      drawBlock(moving, true);
    }
  }, []);

  const startGame = useCallback(() => {
    const base: Block = {
      x: (CANVAS_W - BASE_W) / 2,
      y: CANVAS_H - 95,
      width: BASE_W,
      colour: COLOURS[0],
      kind: "normal",
      number: 0,
    };
    blocksRef.current = [base];
    currentRef.current = {
      x: 20,
      y: base.y - DROP_GAP,
      width: BASE_W,
      colour: COLOURS[1],
      kind: "normal",
      number: 1,
    };
    fallingRef.current = null;
    directionRef.current = 1;
    speedRef.current = 230;
    wobbleLevelRef.current = 0;
    gameTimeRef.current = 0;
    playingRef.current = true;
    lastRef.current = performance.now();
    setScore(0);
    scoreRef.current = 0;
    setCallout(null);
    setBombWarning(false);
    bombFuseRef.current = null;
    lastBombNumberRef.current = -10;
    setStatus("playing");
  }, []);

  const startFromButton = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    startGame();
  }, [startGame]);

  const startFromKeyboard = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    // Pointer presses are handled immediately above. A click with detail 0 is
    // generated by keyboard activation, so buttons remain fully accessible.
    if (event.detail !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startGame();
  }, [startGame]);

  const showCallout = useCallback((message: string, duration = 800) => {
    setCallout(message);
    window.setTimeout(() => setCallout((current) => current === message ? null : current), duration);
  }, []);

  const createNextBlock = useCallback((previous: Block, number: number, allowBomb = true) => {
    const shouldBomb =
      allowBomb &&
      number >= 5 &&
      number - lastBombNumberRef.current >= 4 &&
      Math.random() < BOMB_CHANCE;
    const kind: BlockKind = shouldBomb ? "bomb" : blockKind(number);
    if (shouldBomb) {
      lastBombNumberRef.current = number;
      bombFuseRef.current = gameTimeRef.current + BOMB_FUSE_SECONDS;
    } else {
      bombFuseRef.current = null;
    }
    setBombWarning(shouldBomb);
    currentRef.current = {
      x: directionRef.current > 0 ? 18 : CANVAS_W - 18 - previous.width,
      y: previous.y - DROP_GAP,
      width: previous.width,
      colour: shouldBomb ? "#d92d38" : COLOURS[number % COLOURS.length],
      kind,
      number,
    };
    directionRef.current *= -1;
  }, []);

  const finishLanding = useCallback((moving: FallingBlock) => {
    if (!playingRef.current) return;
    const previous = blocksRef.current.at(-1)!;
    const wobbleAmount = Math.min(18, Math.max(0, wobbleLevelRef.current - 4) * 0.75);
    const previousX = previous.x + Math.sin(gameTimeRef.current * 0.95) * wobbleAmount;
    const overlapStart = Math.max(moving.x, previousX);
    const overlapEnd = Math.min(moving.x + moving.width, previousX + previous.width);
    const overlap = overlapEnd - overlapStart;
    fallingRef.current = null;

    if (overlap <= 0) {
      playingRef.current = false;
      currentRef.current = null;
      setStatus("over");
      setBest((currentBest) => {
        const nextBest = Math.max(currentBest, scoreRef.current);
        localStorage.setItem("tower-drop-best", String(nextBest));
        return nextBest;
      });
      return;
    }

    const isPerfect = Math.abs(moving.x - previousX) < 5;
    const landed: Block = {
      x: (isPerfect ? previousX : overlapStart) - Math.sin(gameTimeRef.current * 0.95) * wobbleAmount,
      y: previous.y - BLOCK_H,
      width: isPerfect ? previous.width : overlap,
      colour: moving.colour,
      kind: moving.kind,
      number: moving.number,
    };
    blocksRef.current.push(landed);
    const isBonus = moving.kind === "gold" || moving.kind === "steel";
    const earned = isBonus ? (isPerfect ? 20 : 10) : (isPerfect ? 5 : 1);
    const nextNumber = moving.number + 1;
    const nextScore = scoreRef.current + earned;
    scoreRef.current = nextScore;
    setScore(nextScore);
    showCallout(isPerfect ? `PERFECT +${earned}` : `+${earned}`);
    wobbleLevelRef.current += 1;
    if (moving.kind === "steel") wobbleLevelRef.current *= 0.5;
    speedRef.current = Math.min(500, 230 + nextNumber * 13);
    createNextBlock(landed, nextNumber);
  }, [createNextBlock, showCallout]);

  const drop = useCallback(() => {
    if (!playingRef.current || !currentRef.current || fallingRef.current) return;
    const moving = currentRef.current;
    setBombWarning(false);
    fallingRef.current = {
      ...moving,
      targetY: moving.kind === "bomb"
        ? blocksRef.current[0].y + BLOCK_H * 2
        : blocksRef.current.at(-1)!.y - BLOCK_H,
      velocityX: directionRef.current * speedRef.current * 0.42,
    };
    currentRef.current = null;
  }, []);

  useEffect(() => {
    const animate = (time: number) => {
      const delta = Math.min((time - lastRef.current) / 1000, 0.04);
      lastRef.current = time;
      gameTimeRef.current += delta;
      const moving = currentRef.current;
      if (playingRef.current && moving) {
        moving.x += directionRef.current * speedRef.current * delta;
        if (moving.x <= 18) {
          moving.x = 18;
          directionRef.current = 1;
        } else if (moving.x + moving.width >= CANVAS_W - 18) {
          moving.x = CANVAS_W - 18 - moving.width;
          directionRef.current = -1;
        }
        if (moving.kind === "bomb" && bombFuseRef.current !== null && gameTimeRef.current >= bombFuseRef.current) {
          drop();
        }
      }
      const falling = fallingRef.current;
      if (playingRef.current && falling) {
        falling.y = Math.min(falling.targetY, falling.y + 680 * delta);
        falling.x += falling.velocityX * delta;
        falling.velocityX *= Math.pow(0.36, delta);
        if (falling.kind === "bomb") {
          const wobbleAmount = Math.min(18, Math.max(0, wobbleLevelRef.current - 4) * 0.75);
          const towerOffset = Math.sin(gameTimeRef.current * 0.95) * wobbleAmount;
          const hit = blocksRef.current.some((block, index, blocks) => {
            const heightFactor = blocks.length <= 1 ? 0 : index / (blocks.length - 1);
            const blockX = block.x + towerOffset * heightFactor;
            return falling.y + BLOCK_H >= block.y &&
              falling.y <= block.y + BLOCK_H &&
              falling.x < blockX + block.width &&
              falling.x + falling.width > blockX;
          });
          if (hit) {
            const bombNumber = falling.number;
            fallingRef.current = null;
            const removable = Math.min(5, Math.max(0, blocksRef.current.length - 1));
            if (removable > 0) blocksRef.current.splice(-removable, removable);
            wobbleLevelRef.current = Math.max(0, wobbleLevelRef.current - removable);
            showCallout(`BOOM! -${removable} BLOCKS`, 1100);
            createNextBlock(blocksRef.current.at(-1)!, bombNumber, false);
          } else if (falling.y >= falling.targetY) {
            const bombNumber = falling.number;
            fallingRef.current = null;
            showCallout("SAFE MISS!", 850);
            createNextBlock(blocksRef.current.at(-1)!, bombNumber, false);
          }
        } else if (falling.y >= falling.targetY) {
          finishLanding(falling);
        }
      }
      draw();
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [createNextBlock, draw, drop, finishLanding, showCallout]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (status === "playing") drop();
      else if (status !== "over") startGame();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [drop, startGame, status]);

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Tower Drop home">
          <span className="brand-mark">TD</span>
          <span>TOWER DROP</span>
        </a>
        <div className="mini-stats" aria-label="Current game statistics">
          <span>SCORE <b>{score}</b></span>
          <span>BEST <b>{Math.max(best, score)}</b></span>
        </div>
      </header>

      <div className="content-grid">
        <section className="game-panel">
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              aria-label="Tower Drop game area"
              onPointerDown={(event) => {
                event.preventDefault();
                if (status === "playing") drop();
              }}
            />
            {callout && <div className="perfect-callout">{callout}</div>}
            {status === "playing" && bombWarning && (
              <div className="bomb-warning">DON&apos;T LET IT HIT YOUR TOWER!</div>
            )}
            {status === "ready" && (
              <div className="game-overlay">
                <p className="eyebrow">READY TO BUILD?</p>
                <h1>STACK IT<br />SKY HIGH.</h1>
                <p>Drop each swinging block onto the tower. Miss the edge and the overhang gets sliced away.</p>
                <button
                  type="button"
                  onPointerDown={startFromButton}
                  onClick={startFromKeyboard}
                >
                  START BUILDING <span>↓</span>
                </button>
                <small>Tap, click, or press space to drop</small>
              </div>
            )}
            {status === "over" && (
              <div className="game-overlay over">
                <p className="eyebrow">SHIFT OVER</p>
                <h2>TOWER<br />TOPPLED!</h2>
                <p>You scored <b>{score}</b>. Your best score is saved on this device.</p>
                <button
                  type="button"
                  className="play-again"
                  onPointerDown={startFromButton}
                  onClick={startFromKeyboard}
                >
                  PLAY AGAIN
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="game-guide">
          <div className="board-heading">
            <div>
              <p className="eyebrow">BUILDING BRIEF</p>
              <h2>HOW TO PLAY</h2>
            </div>
            <span className="trophy" aria-hidden="true">↓</span>
          </div>
          <ul className="rules">
            <li><b>TIME THE DROP</b><span>The block keeps moving sideways as it falls.</span></li>
            <li><b>PERFECT = +5</b><span>Golden tenth blocks score +10, or +20 when perfect.</span></li>
            <li><b>STEEL STEADIES</b><span>Every twentieth block halves the tower wobble.</span></li>
            <li><b>AVOID BOMBS</b><span>Make bomb boxes miss or lose up to five blocks.</span></li>
          </ul>
          <div className="how-to">
            <span className="mouse-icon" aria-hidden="true">↓</span>
            <div><b>ONE-TAP CONTROL</b><small>Time your drop. Keep it centred.</small></div>
          </div>
        </aside>
      </div>
      <footer>BUILT FOR BRAVE BUILDERS <span>•</span> HOW HIGH CAN YOU GO?</footer>
    </main>
  );
}

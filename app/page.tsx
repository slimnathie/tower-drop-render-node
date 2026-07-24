"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BlockKind = "normal" | "gold" | "steel" | "bomb";
type Block = { x: number; y: number; width: number; colour: string; kind: BlockKind; number: number };
type FallingBlock = Block & { targetY: number; velocityX: number; bombSpeed?: number };
type Level = { name: string; threshold: number; water: number; swing: number; growth: number };

const CANVAS_W = 720;
const CANVAS_H = 820;
const BLOCK_H = 58;
const BASE_W = 330;
const BOMB_SIZE = 62;
const DROP_GAP = BLOCK_H * 3;
const BOMB_CHANCE = 0.14;
const BOMB_FUSE_SECONDS = 3;
const COLOURS = ["#ffc536", "#ff6b45", "#27d3a2", "#5ba7ff", "#b980ff"];
const LEVELS: Level[] = [
  { name: "LEVEL 1", threshold: 0, water: 1, swing: 1, growth: 0 },
  { name: "LEVEL 2", threshold: 20, water: 1.5, swing: 1, growth: 10 },
  { name: "LEVEL 3", threshold: 40, water: 2, swing: 2, growth: 11 },
  { name: "LEVEL 4", threshold: 50, water: 2.5, swing: 2, growth: 12 },
  { name: "LEVEL 5", threshold: 80, water: 3, swing: 2, growth: 13 },
  { name: "LEVEL 6", threshold: 100, water: 3, swing: 3, growth: 14 },
  { name: "LEVEL 7", threshold: 150, water: 3.5, swing: 3, growth: 15 },
  { name: "LEVEL 8", threshold: 200, water: 3.5, swing: 4, growth: 16 },
  { name: "LEVEL 9", threshold: 250, water: 3.5, swing: 4, growth: 17 },
  { name: "INSANE LEVEL", threshold: 300, water: 4, swing: 5, growth: 20 },
];

const blockKind = (number: number): BlockKind =>
  number > 0 && number % 20 === 0 ? "steel" : number > 0 && number % 10 === 0 ? "gold" : "normal";
const levelForBricks = (bricks: number) => {
  let index = 0;
  LEVELS.forEach((level, candidate) => { if (bricks >= level.threshold) index = candidate; });
  return index;
};
const swingPixelsPerSecond = (levelIndex: number) =>
  210 + (LEVELS[levelIndex].swing - 1) * 85;
const bombLabel = (speed: number) => speed === 2 ? "DOUBLE SPEED" : speed === 3 ? "TRIPLE SPEED" : "INSANE SPEED";
const bombReward = (speed: number) => speed === 2 ? 2 : speed === 3 ? 3 : 10;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const blocksRef = useRef<Block[]>([]);
  const currentRef = useRef<Block | null>(null);
  const fallingRef = useRef<FallingBlock | null>(null);
  const directionRef = useRef(1);
  const wobbleLevelRef = useRef(0);
  const gameTimeRef = useRef(0);
  const playingRef = useRef(false);
  const scoreRef = useRef(0);
  const bricksLaidRef = useRef(0);
  const levelRef = useRef(0);
  const bombFuseRef = useRef<number | null>(null);
  const bombSpeedRef = useRef(2);
  const lastBombNumberRef = useRef(-10);
  const swingEdgesRef = useRef(0);
  const ropeFrayRef = useRef(0);
  const ropeCutAtRef = useRef<number | null>(null);
  const waterYRef = useRef(CANVAS_H + BLOCK_H);
  const frozenSwingsRef = useRef(0);
  const perfectStreakRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const [score, setScore] = useState(0);
  const [bricksLaid, setBricksLaid] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState<"ready" | "playing" | "over">("ready");
  const [callout, setCallout] = useState<string | null>(null);
  const [bombWarning, setBombWarning] = useState<string | null>(null);
  const [levelCard, setLevelCard] = useState<Level | null>(null);
  const [iceCount, setIceCount] = useState(0);

  useEffect(() => setBest(Number(localStorage.getItem("tower-drop-best") ?? 0)), []);

  const showCallout = useCallback((message: string, duration = 850) => {
    setCallout(message);
    window.setTimeout(() => setCallout((current) => current === message ? null : current), duration);
  }, []);

  const endGame = useCallback((message?: string) => {
    playingRef.current = false;
    currentRef.current = null;
    fallingRef.current = null;
    if (message) showCallout(message, 1300);
    setStatus("over");
    setBest((currentBest) => {
      const nextBest = Math.max(currentBest, scoreRef.current);
      localStorage.setItem("tower-drop-best", String(nextBest));
      return nextBest;
    });
  }, [showCallout]);

  const showLevel = useCallback((index: number) => {
    const next = LEVELS[index];
    setLevelCard(next);
    pauseUntilRef.current = gameTimeRef.current + 1.35;
    window.setTimeout(() => setLevelCard((shown) => shown === next ? null : shown), 1350);
  }, []);

  const updateScore = useCallback((amount: number) => {
    const nextScore = scoreRef.current + amount;
    scoreRef.current = nextScore;
    setScore(nextScore);
  }, []);

  const recordBrickLaid = useCallback(() => {
    const nextBricks = bricksLaidRef.current + 1;
    bricksLaidRef.current = nextBricks;
    setBricksLaid(nextBricks);
    const nextLevel = levelForBricks(nextBricks);
    if (nextLevel !== levelRef.current) {
      levelRef.current = nextLevel;
      setLevel(nextLevel);
      const top = blocksRef.current.at(-1);
      if (top) {
        const grownWidth = Math.min(BASE_W, top.width * (1 + LEVELS[nextLevel].growth / 100));
        top.x -= (grownWidth - top.width) / 2;
        top.width = grownWidth;
      }
      showLevel(nextLevel);
    }
  }, [showLevel]);

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
    sky.addColorStop(.62, "#526f96");
    sky.addColorStop(1, "#f1a65b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = .2;
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 16; i++) ctx.fillRect((i * 113 + 45) % CANVAS_W, (i * 71 + 55) % 460, 3, 3);
    ctx.globalAlpha = 1;

    const drawBlock = (block: Block, isMoving = false, offsetX = 0) => {
      const y = block.y + camera;
      const x = block.x + offsetX;
      if (block.kind === "bomb") {
        const cx = x + block.width / 2;
        const cy = y + BLOCK_H / 2;
        ctx.fillStyle = "rgba(8,14,35,.3)";
        ctx.beginPath(); ctx.arc(cx + 7, cy + 8, BOMB_SIZE / 2, 0, Math.PI * 2); ctx.fill();
        const bomb = ctx.createRadialGradient(cx - 12, cy - 14, 5, cx, cy, BOMB_SIZE / 2);
        bomb.addColorStop(0, "#686b75"); bomb.addColorStop(.28, "#171922"); bomb.addColorStop(1, "#030409");
        ctx.fillStyle = bomb;
        ctx.beginPath(); ctx.arc(cx, cy, BOMB_SIZE / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#131317"; ctx.lineWidth = 7; ctx.beginPath();
        ctx.moveTo(cx + 12, cy - 24); ctx.quadraticCurveTo(cx + 22, cy - 44, cx + 8, cy - 53); ctx.stroke();
        ctx.fillStyle = "#ff8a29"; ctx.beginPath(); ctx.arc(cx + 7, cy - 57, 8 + Math.sin(gameTimeRef.current * 18) * 2, 0, Math.PI * 2); ctx.fill();
        return;
      }
      ctx.fillStyle = "rgba(8,14,35,.25)"; ctx.fillRect(x + 8, y + 10, block.width, BLOCK_H);
      const fill = block.kind === "gold" ? ctx.createLinearGradient(x, y, x + block.width, y + BLOCK_H)
        : block.kind === "steel" ? ctx.createLinearGradient(x, y, x, y + BLOCK_H) : null;
      if (fill && block.kind === "gold") {
        fill.addColorStop(0, "#fff2a5"); fill.addColorStop(.45, "#f9bd19"); fill.addColorStop(1, "#fff0a0");
      } else if (fill) {
        fill.addColorStop(0, "#e9f0f4"); fill.addColorStop(.5, "#87949d"); fill.addColorStop(1, "#cbd5da");
      }
      ctx.fillStyle = fill ?? block.colour; ctx.fillRect(x, y, block.width, BLOCK_H);
      ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fillRect(x, y, block.width, 9);
      ctx.fillStyle = "rgba(0,0,0,.17)"; ctx.fillRect(x, y + BLOCK_H - 9, block.width, 9);
      ctx.textAlign = "center"; ctx.font = "900 19px Arial";
      if (block.kind === "gold") { ctx.fillStyle = "#fff9c8"; ctx.fillText("✦ +10 ✦", x + block.width / 2, y + 37); }
      else if (block.kind === "steel") { ctx.fillStyle = "#fff"; ctx.fillText("+10", x + block.width / 2, y + 36); }
      else if (!isMoving && block.width > 45) { ctx.fillStyle = "rgba(22,27,61,.26)"; ctx.fillText(String(block.number), x + block.width / 2, y + 36); }
    };

    blocks.forEach((block, index) => {
      const heightFactor = blocks.length <= 1 ? 0 : index / (blocks.length - 1);
      drawBlock(block, false, towerOffset * heightFactor);
    });

    const moving = fallingRef.current ?? currentRef.current;
    if (moving) {
      const movingY = moving.y + camera;
      if (!fallingRef.current) {
        const centre = moving.x + moving.width / 2;
        const fray = ropeFrayRef.current;
        ctx.strokeStyle = fray >= 4 ? "#b88742" : "#d5a75e";
        ctx.lineWidth = Math.max(5, 13 - fray * 1.4);
        ctx.setLineDash(fray ? [Math.max(8, 22 - fray * 3), 3 + fray] : []);
        ctx.beginPath(); ctx.moveTo(CANVAS_W / 2, 0); ctx.lineTo(centre, movingY); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < fray; i++) {
          ctx.strokeStyle = i % 2 ? "#e0bd78" : "#8e632f"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(centre - 5 + i * 2, movingY - 18 - i * 4); ctx.lineTo(centre - 14 + i * 6, movingY - 3); ctx.stroke();
        }
        ctx.fillStyle = "#ffcf39"; ctx.fillRect(CANVAS_W / 2 - 105, 0, 210, 16);
      } else if (ropeCutAtRef.current !== null && gameTimeRef.current - ropeCutAtRef.current < .42) {
        const centre = moving.x + moving.width / 2;
        ctx.strokeStyle = "#d5a75e"; ctx.lineWidth = 9; ctx.beginPath();
        ctx.moveTo(CANVAS_W / 2, 0); ctx.lineTo(centre - 5, Math.max(38, movingY - 34)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(centre, movingY); ctx.lineTo(centre, movingY - 22); ctx.stroke();
      }
      drawBlock(moving, true);
    }

    const waterY = waterYRef.current + camera;
    if (waterY < CANVAS_H) {
      const frozen = frozenSwingsRef.current > 0;
      const water = ctx.createLinearGradient(0, waterY, 0, CANVAS_H);
      water.addColorStop(0, frozen ? "rgba(201,247,255,.94)" : "rgba(59,199,238,.88)");
      water.addColorStop(1, frozen ? "rgba(112,190,231,.88)" : "rgba(14,93,180,.92)");
      ctx.fillStyle = water; ctx.fillRect(0, waterY, CANVAS_W, CANVAS_H - waterY);
      ctx.strokeStyle = frozen ? "#f5ffff" : "#8beaff"; ctx.lineWidth = frozen ? 9 : 6;
      ctx.beginPath();
      for (let x = 0; x <= CANVAS_W; x += 12) {
        const y = waterY + (frozen ? 0 : Math.sin(x * .045 + gameTimeRef.current * 3) * 5);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (frozen) {
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
        for (let x = 30; x < CANVAS_W; x += 90) { ctx.beginPath(); ctx.moveTo(x, waterY + 10); ctx.lineTo(x + 42, waterY + 36); ctx.stroke(); }
      }
    }
  }, []);

  const createNextBlock = useCallback((previous: Block, number: number, allowBomb = true) => {
    const shouldBomb = allowBomb && number >= 5 && number - lastBombNumberRef.current >= 4 && Math.random() < BOMB_CHANCE;
    const kind: BlockKind = shouldBomb ? "bomb" : blockKind(number);
    if (shouldBomb) {
      lastBombNumberRef.current = number;
      bombSpeedRef.current = [2, 3, 4][Math.floor(Math.random() * 3)];
      bombFuseRef.current = gameTimeRef.current + BOMB_FUSE_SECONDS;
      setBombWarning(bombLabel(bombSpeedRef.current));
    } else {
      bombFuseRef.current = null;
      setBombWarning(null);
    }
    const width = shouldBomb ? BOMB_SIZE : previous.width;
    currentRef.current = {
      x: directionRef.current > 0 ? 18 : CANVAS_W - 18 - width,
      y: previous.y - DROP_GAP,
      width,
      colour: COLOURS[number % COLOURS.length],
      kind,
      number,
    };
    directionRef.current *= -1;
    swingEdgesRef.current = 0;
    ropeFrayRef.current = 0;
  }, []);

  const startGame = useCallback(() => {
    const base: Block = { x: (CANVAS_W - BASE_W) / 2, y: CANVAS_H - 95, width: BASE_W, colour: COLOURS[0], kind: "normal", number: 0 };
    blocksRef.current = [base];
    currentRef.current = { x: 20, y: base.y - DROP_GAP, width: BASE_W, colour: COLOURS[1], kind: "normal", number: 1 };
    fallingRef.current = null;
    directionRef.current = 1;
    wobbleLevelRef.current = 0;
    gameTimeRef.current = 0;
    scoreRef.current = 0;
    bricksLaidRef.current = 0;
    levelRef.current = 0;
    waterYRef.current = CANVAS_H + BLOCK_H;
    frozenSwingsRef.current = 0;
    perfectStreakRef.current = 0;
    swingEdgesRef.current = 0;
    ropeFrayRef.current = 0;
    playingRef.current = true;
    lastRef.current = performance.now();
    setScore(0); setBricksLaid(0); setLevel(0); setIceCount(0); setCallout(null); setBombWarning(null); setStatus("playing");
    showLevel(0);
  }, [showLevel]);

  const finishLanding = useCallback((moving: FallingBlock) => {
    if (!playingRef.current) return;
    const previous = blocksRef.current.at(-1)!;
    const wobbleAmount = Math.min(18, Math.max(0, wobbleLevelRef.current - 4) * .75);
    const wobble = Math.sin(gameTimeRef.current * .95) * wobbleAmount;
    const previousX = previous.x + wobble;
    const overlapStart = Math.max(moving.x, previousX);
    const overlapEnd = Math.min(moving.x + moving.width, previousX + previous.width);
    const overlap = overlapEnd - overlapStart;
    fallingRef.current = null;
    if (overlap <= 0) { endGame(); return; }

    const isPerfect = Math.abs(moving.x - previousX) < 5 && Math.abs(moving.width - previous.width) < 8;
    if (isPerfect) perfectStreakRef.current += 1; else perfectStreakRef.current = 0;
    let landedWidth = isPerfect ? previous.width : overlap;
    let landedX = (isPerfect ? previousX : overlapStart) - wobble;
    const grows = isPerfect && perfectStreakRef.current > 0 && perfectStreakRef.current % 5 === 0;
    if (grows) {
      const grownWidth = Math.min(BASE_W, landedWidth * 1.12);
      landedX -= (grownWidth - landedWidth) / 2;
      landedWidth = grownWidth;
    }
    const landed: Block = { x: landedX, y: previous.y - BLOCK_H, width: landedWidth, colour: moving.colour, kind: moving.kind, number: moving.number };
    blocksRef.current.push(landed);
    recordBrickLaid();
    const isBonus = moving.kind === "gold" || moving.kind === "steel";
    const earned = isBonus ? (isPerfect ? 20 : 10) : (isPerfect ? 5 : 1);
    updateScore(earned);
    showCallout(grows ? `5 PERFECTS! BLOCKS GREW +${earned}` : isPerfect ? `PERFECT +${earned}` : `+${earned}`, grows ? 1250 : 850);
    if (isPerfect && perfectStreakRef.current >= 5) {
      frozenSwingsRef.current = 3;
      setIceCount(3);
    }
    wobbleLevelRef.current += 1;
    if (moving.kind === "steel") wobbleLevelRef.current *= .5;
    const nextNumber = moving.number + 1;
    createNextBlock(landed, nextNumber);
    if (grows && currentRef.current && currentRef.current.kind !== "bomb") {
      currentRef.current.width = landed.width;
      currentRef.current.x = Math.max(18, Math.min(CANVAS_W - 18 - landed.width, currentRef.current.x - (landed.width - moving.width) / 2));
    }
  }, [createNextBlock, endGame, recordBrickLaid, showCallout, updateScore]);

  const drop = useCallback(() => {
    if (!playingRef.current || !currentRef.current || fallingRef.current || gameTimeRef.current < pauseUntilRef.current) return;
    const moving = currentRef.current;
    setBombWarning(null);
    ropeCutAtRef.current = gameTimeRef.current;
    const speed = swingPixelsPerSecond(levelRef.current);
    fallingRef.current = {
      ...moving,
      targetY: moving.kind === "bomb" ? blocksRef.current[0].y + BLOCK_H * 2 : blocksRef.current.at(-1)!.y - BLOCK_H,
      velocityX: directionRef.current * speed * (moving.kind === "bomb" ? bombSpeedRef.current : 1) * .42,
      bombSpeed: moving.kind === "bomb" ? bombSpeedRef.current : undefined,
    };
    currentRef.current = null;
  }, []);

  const registerSwing = useCallback(() => {
    swingEdgesRef.current += 1;
    ropeFrayRef.current = Math.min(5, swingEdgesRef.current);
    if (frozenSwingsRef.current > 0) {
      frozenSwingsRef.current -= 1;
      setIceCount(frozenSwingsRef.current);
    } else {
      waterYRef.current -= BLOCK_H * (LEVELS[levelRef.current].water / 5);
      const top = blocksRef.current.at(-1);
      const camera = top ? Math.max(0, CANVAS_H - 105 - 4 * BLOCK_H - top.y) : 0;
      if (waterYRef.current + camera <= 0) endGame("THE SEA GOT YOU!");
    }
    if (swingEdgesRef.current >= 5) drop();
  }, [drop, endGame]);

  useEffect(() => {
    const animate = (time: number) => {
      const delta = Math.min((time - lastRef.current) / 1000, .04);
      lastRef.current = time;
      gameTimeRef.current += delta;
      const moving = currentRef.current;
      if (playingRef.current && moving && gameTimeRef.current >= pauseUntilRef.current) {
        const speed = swingPixelsPerSecond(levelRef.current);
        const multiplier = moving.kind === "bomb" ? bombSpeedRef.current : 1;
        moving.x += directionRef.current * speed * multiplier * delta;
        if (moving.x <= 18) { moving.x = 18; directionRef.current = 1; registerSwing(); }
        else if (moving.x + moving.width >= CANVAS_W - 18) { moving.x = CANVAS_W - 18 - moving.width; directionRef.current = -1; registerSwing(); }
        if (moving.kind === "bomb" && bombFuseRef.current !== null && gameTimeRef.current >= bombFuseRef.current) drop();
      }
      const falling = fallingRef.current;
      if (playingRef.current && falling) {
        falling.y = Math.min(falling.targetY, falling.y + 680 * delta);
        falling.x += falling.velocityX * delta;
        falling.velocityX *= Math.pow(.36, delta);
        if (falling.kind === "bomb") {
          const cx = falling.x + BOMB_SIZE / 2;
          const cy = falling.y + BLOCK_H / 2;
          let hitIndex = -1;
          for (let i = blocksRef.current.length - 1; i >= 0; i--) {
            const block = blocksRef.current[i];
            const nearestX = Math.max(block.x, Math.min(cx, block.x + block.width));
            const nearestY = Math.max(block.y, Math.min(cy, block.y + BLOCK_H));
            if ((cx - nearestX) ** 2 + (cy - nearestY) ** 2 <= (BOMB_SIZE / 2) ** 2) { hitIndex = i; break; }
          }
          if (hitIndex >= 0) {
            const block = blocksRef.current[hitIndex];
            const oldRight = block.x + block.width;
            if (cx <= block.x + block.width / 2) {
              const cut = Math.min(oldRight - 16, cx + BOMB_SIZE / 2);
              block.x = cut; block.width = oldRight - cut;
            } else {
              block.width = Math.max(16, cx - BOMB_SIZE / 2 - block.x);
            }
            const bombNumber = falling.number;
            fallingRef.current = null;
            showCallout("BOOM! BRICK CHOPPED", 1050);
            createNextBlock(blocksRef.current.at(-1)!, bombNumber, false);
          } else if (falling.y >= falling.targetY) {
            const speed = falling.bombSpeed ?? 2;
            const bombNumber = falling.number;
            fallingRef.current = null;
            updateScore(bombReward(speed));
            showCallout(`SAFE! +${bombReward(speed)}`, 950);
            createNextBlock(blocksRef.current.at(-1)!, bombNumber, false);
          }
        } else if (falling.y >= falling.targetY) finishLanding(falling);
      }
      draw();
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [createNextBlock, draw, drop, finishLanding, registerSwing, showCallout, updateScore]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (status === "playing") drop(); else if (status !== "over") startGame();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [drop, startGame, status]);

  const startFromButton = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); startGame();
  }, [startGame]);
  const startFromKeyboard = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    event.preventDefault(); event.stopPropagation(); startGame();
  }, [startGame]);

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Tower Drop home"><span className="brand-mark">TD</span><span>TOWER DROP</span></a>
        <div className="mini-stats" aria-label="Current game statistics">
          <span>SCORE <b>{score}</b></span><span>BRICKS <b>{bricksLaid}</b></span><span>LEVEL <b>{level === 9 ? "X" : level + 1}</b></span><span>BEST <b>{Math.max(best, score)}</b></span>
        </div>
      </header>
      <div className="content-grid">
        <section className="game-panel">
          <div className="canvas-wrap">
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} aria-label="Tower Drop game area"
              onPointerDown={(event) => { event.preventDefault(); if (status === "playing") drop(); }} />
            {callout && <div className="perfect-callout">{callout}</div>}
            {iceCount > 0 && <div className="ice-badge">❄ WATER FROZEN · {iceCount} SWINGS</div>}
            {status === "playing" && bombWarning && <div className="bomb-warning"><b>{bombWarning}</b><span>DON&apos;T LET IT HIT YOUR TOWER!</span></div>}
            {levelCard && status === "playing" && (
              <div className="level-card">
                <small>NEW CHALLENGE</small><strong>{levelCard.name}</strong>
                <div><span>WATER {levelCard.water}</span><span>SWING {levelCard.swing}</span><span>BRICK +{levelCard.growth}%</span></div>
              </div>
            )}
            {status === "ready" && (
              <div className="game-overlay">
                <p className="eyebrow">READY TO BUILD?</p><h1>STACK IT<br />SKY HIGH.</h1>
                <p>Drop each swinging block onto the tower. Miss the edge and the overhang gets sliced away.</p>
                <button type="button" onPointerDown={startFromButton} onClick={startFromKeyboard}>START BUILDING <span>↓</span></button>
                <small>Tap, click, or press space to drop</small>
              </div>
            )}
            {status === "over" && (
              <div className="game-overlay over">
                <p className="eyebrow">SHIFT OVER</p><h2>TOWER<br />TOPPLED!</h2>
                <p>You scored <b>{score}</b>. Your best score is saved on this device.</p>
                <button type="button" className="play-again" onPointerDown={startFromButton} onClick={startFromKeyboard}>PLAY AGAIN</button>
              </div>
            )}
          </div>
        </section>
        <aside className="game-guide">
          <div className="board-heading"><div><p className="eyebrow">BUILDING BRIEF</p><h2>HOW TO PLAY</h2></div><span className="trophy">↓</span></div>
          <ul className="rules">
            <li><b>ROPE FRAYS</b><span>Drop in time—the rope snaps automatically on its fifth swing.</span></li>
            <li><b>PERFECT STREAK</b><span>Five perfects grow both the tower top and next swinging brick, and freeze the sea.</span></li>
            <li><b>LEVEL UP</b><span>Water and swing speed increase as your bricks laid climbs.</span></li>
            <li><b>DODGE BOMBS</b><span>Safe misses earn bonuses. A hit chops the brick it touches.</span></li>
          </ul>
          <div className="how-to"><span className="mouse-icon">↓</span><div><b>ONE-TAP CONTROL</b><small>Time your drop. Keep it centred.</small></div></div>
        </aside>
      </div>
      <footer>BUILT FOR BRAVE BUILDERS <span>•</span> HOW HIGH CAN YOU GO?</footer>
    </main>
  );
}

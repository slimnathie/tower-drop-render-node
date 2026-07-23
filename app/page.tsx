"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BlockKind = "normal" | "gold" | "steel" | "bomb";
type Block = { x: number; y: number; width: number; colour: string; kind: BlockKind; number: number };
type FallingBlock = Block & {
  targetY: number;
  velocityX: number;
  ropeCutX: number;
  ropeCutY: number;
  ropeSnapped: boolean;
  bombSpeed: 1 | 2 | 3 | 4;
};

const CANVAS_W = 720;
const CANVAS_H = 820;
const BLOCK_H = 58;
const BASE_W = 330;
const COLOURS = ["#ffc536", "#ff6b45", "#27d3a2", "#5ba7ff", "#b980ff"];
const DROP_GAP = BLOCK_H * 3;
const BOMB_CHANCE = 0.14;
const BOMB_FUSE_SECONDS = 3;
const BOMB_SIZE = 76;
const MAX_ROPE_SWINGS = 5;
const PERFECT_STREAK_TARGET = 5;
const PERFECT_WIDTH_BONUS = 28;
const WATER_RISE_PER_SWING = BLOCK_H / 5;
const BASE_SWING_SPEED = 230;

const LEVELS = [
  { name: "LEVEL 1", threshold: 0, waterSpeed: 1, brickBonus: 0, swingSpeed: 1 },
  { name: "LEVEL 2", threshold: 20, waterSpeed: 1.5, brickBonus: 0.10, swingSpeed: 1 },
  { name: "LEVEL 3", threshold: 40, waterSpeed: 2, brickBonus: 0.11, swingSpeed: 2 },
  { name: "LEVEL 4", threshold: 50, waterSpeed: 2.5, brickBonus: 0.12, swingSpeed: 2 },
  { name: "LEVEL 5", threshold: 80, waterSpeed: 3, brickBonus: 0.13, swingSpeed: 2 },
  { name: "LEVEL 6", threshold: 100, waterSpeed: 3, brickBonus: 0.14, swingSpeed: 3 },
  { name: "LEVEL 7", threshold: 150, waterSpeed: 3.5, brickBonus: 0.15, swingSpeed: 3 },
  { name: "LEVEL 8", threshold: 200, waterSpeed: 3.5, brickBonus: 0.16, swingSpeed: 4 },
  { name: "LEVEL 9", threshold: 250, waterSpeed: 3.5, brickBonus: 0.17, swingSpeed: 4 },
  { name: "INSANE LEVEL", threshold: 300, waterSpeed: 4, brickBonus: 0.20, swingSpeed: 5 },
] as const;

const levelForScore = (score: number) => {
  for (let index = LEVELS.length - 1; index >= 0; index -= 1) {
    if (score >= LEVELS[index].threshold) return index;
  }
  return 0;
};

const bombSpeedDetails = {
  2: { label: "DOUBLE SPEED", bonus: 2 },
  3: { label: "TRIPLE SPEED", bonus: 3 },
  4: { label: "INSANE SPEED", bonus: 10 },
} as const;

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
  const ropeSwingsRef = useRef(0);
  const speedRef = useRef(BASE_SWING_SPEED);
  const levelRef = useRef(0);
  const wobbleLevelRef = useRef(0);
  const gameTimeRef = useRef(0);
  const bombFuseRef = useRef<number | null>(null);
  const lastBombNumberRef = useRef(-10);
  const bombSpeedRef = useRef<2 | 3 | 4>(2);
  const perfectStreakRef = useRef(0);
  const waterYRef = useRef(CANVAS_H);
  const frozenSwingsRef = useRef(0);
  const playingRef = useRef(false);
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [status, setStatus] = useState<"ready" | "playing" | "over">("ready");
  const [callout, setCallout] = useState<string | null>(null);
  const [bombWarning, setBombWarning] = useState(false);
  const [bombSpeedLabel, setBombSpeedLabel] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [frozenSwings, setFrozenSwings] = useState(0);

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

    const waterTop = waterYRef.current + camera;
    if (waterTop < CANVAS_H) {
      const isFrozen = frozenSwingsRef.current > 0;
      const water = ctx.createLinearGradient(0, waterTop, 0, CANVAS_H);
      water.addColorStop(0, isFrozen ? "rgba(220, 253, 255, .96)" : "rgba(68, 224, 255, .84)");
      water.addColorStop(.2, isFrozen ? "rgba(125, 218, 244, .9)" : "rgba(28, 151, 220, .8)");
      water.addColorStop(1, isFrozen ? "rgba(35, 112, 184, .94)" : "rgba(8, 55, 130, .92)");
      ctx.fillStyle = water;
      ctx.fillRect(0, waterTop, CANVAS_W, CANVAS_H - waterTop);
      if (isFrozen) {
        ctx.fillStyle = "rgba(235, 254, 255, .95)";
        ctx.fillRect(0, waterTop, CANVAS_W, 13);
        ctx.strokeStyle = "#75d9f1";
        ctx.lineWidth = 3;
        for (let x = 15; x < CANVAS_W; x += 46) {
          ctx.beginPath();
          ctx.moveTo(x, waterTop + 2);
          ctx.lineTo(x + 12, waterTop + 10);
          ctx.lineTo(x + 25, waterTop + 3);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = "#b9fbff";
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let x = -18; x <= CANVAS_W + 18; x += 18) {
          const waveY = waterTop + Math.sin(x * .045 + gameTimeRef.current * 3.2) * 5;
          if (x === -18) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,.62)";
      for (let bubble = 0; bubble < 7; bubble++) {
        const bx = (bubble * 113 + gameTimeRef.current * (11 + bubble)) % CANVAS_W;
        const by = waterTop + 28 + ((bubble * 47) % Math.max(30, CANVAS_H - waterTop - 30));
        ctx.beginPath();
        ctx.arc(bx, by, 3 + bubble % 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const drawBlock = (block: Block, isMoving = false, offsetX = 0) => {
      const y = block.y + camera;
      const x = block.x + offsetX;
      if (block.kind === "bomb") {
        const radius = BOMB_SIZE / 2;
        const centreX = x + radius;
        const centreY = y + radius;
        const bombFill = ctx.createRadialGradient(
          centreX - radius * .38,
          centreY - radius * .42,
          radius * .08,
          centreX,
          centreY,
          radius,
        );
        bombFill.addColorStop(0, "#66707a");
        bombFill.addColorStop(.24, "#20262b");
        bombFill.addColorStop(.72, "#090b0d");
        bombFill.addColorStop(1, "#000");
        ctx.fillStyle = "rgba(8, 14, 35, .32)";
        ctx.beginPath();
        ctx.ellipse(centreX + 7, centreY + radius + 7, radius * .8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bombFill;
        ctx.beginPath();
        ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.28)";
        ctx.beginPath();
        ctx.ellipse(centreX - 13, centreY - 15, 9, 14, -.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#15191c";
        ctx.fillRect(centreX - 10, y - 5, 20, 13);
        ctx.strokeStyle = "#30251c";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(centreX, y - 3);
        ctx.quadraticCurveTo(centreX + 14, y - 19, centreX + 6, y - 33);
        ctx.stroke();
        if (!fallingRef.current) {
          const fuse = Math.max(0, (bombFuseRef.current ?? gameTimeRef.current) - gameTimeRef.current);
          ctx.fillStyle = fuse < 1 ? "#fff36a" : "#ff7a1a";
          ctx.beginPath();
          ctx.arc(centreX + 6, y - 37, 9 + Math.sin(gameTimeRef.current * 18) * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "1000 20px Arial";
          ctx.textAlign = "center";
          ctx.fillText(fuse.toFixed(1), centreX, y - 51);
        }
        return;
      }
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
      ctx.fillStyle = fill ?? block.colour;
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
        const swings = ropeSwingsRef.current;
        const ropeStartX = CANVAS_W / 2;
        const ropeEndX = moving.x + moving.width / 2;
        const ropeEndY = movingY - (moving.kind === "bomb" ? 8 : 0);
        const ropeWidth = Math.max(5, 13 - swings * 1.65);

        ctx.lineCap = "round";
        ctx.strokeStyle = "#5c351d";
        ctx.lineWidth = ropeWidth + 4;
        ctx.beginPath();
        ctx.moveTo(ropeStartX, 0);
        ctx.lineTo(ropeEndX, ropeEndY);
        ctx.stroke();

        ctx.strokeStyle = "#c78b45";
        ctx.lineWidth = ropeWidth;
        ctx.beginPath();
        ctx.moveTo(ropeStartX, 0);
        ctx.lineTo(ropeEndX, ropeEndY);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255, 216, 142, .7)";
        ctx.lineWidth = Math.max(1.5, ropeWidth * .2);
        ctx.setLineDash([7, 9]);
        ctx.beginPath();
        ctx.moveTo(ropeStartX - 2, 0);
        ctx.lineTo(ropeEndX - 2, ropeEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        if (swings > 0) {
          const dx = ropeEndX - ropeStartX;
          const dy = ropeEndY;
          const ropeLength = Math.hypot(dx, dy) || 1;
          const normalX = -dy / ropeLength;
          const normalY = dx / ropeLength;
          ctx.strokeStyle = "#e0ae69";
          ctx.lineWidth = 2;
          for (let fibre = 0; fibre < swings * 3; fibre++) {
            const t = 0.3 + ((fibre * 0.173 + swings * 0.11) % 0.62);
            const x = ropeStartX + dx * t;
            const y = dy * t;
            const side = fibre % 2 === 0 ? 1 : -1;
            const length = 8 + swings * 3 + (fibre % 3) * 4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(
              x + normalX * side * length * .55 + dx / ropeLength * 4,
              y + normalY * side * length * .55 + dy / ropeLength * 4,
              x + normalX * side * length,
              y + normalY * side * length,
            );
            ctx.stroke();
          }
        }
        ctx.lineCap = "butt";

        ctx.fillStyle = "#ffcf39";
        ctx.fillRect(CANVAS_W / 2 - 105, 0, 210, 16);
      } else {
        const falling = fallingRef.current;
        const cutY = falling.ropeCutY + camera;
        const cutColour = falling.ropeSnapped ? "#b57b3e" : "#d09a55";
        ctx.lineCap = "round";
        ctx.strokeStyle = "#5c351d";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(CANVAS_W / 2, 0);
        ctx.lineTo(falling.ropeCutX, cutY - 11);
        ctx.stroke();
        ctx.strokeStyle = "#c78b45";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(CANVAS_W / 2, 0);
        ctx.lineTo(falling.ropeCutX, cutY - 11);
        ctx.stroke();

        ctx.strokeStyle = cutColour;
        ctx.lineWidth = 2;
        for (let fibre = -2; fibre <= 2; fibre++) {
          ctx.beginPath();
          ctx.moveTo(falling.ropeCutX + fibre * 2, cutY - 13);
          ctx.lineTo(falling.ropeCutX + fibre * 4, cutY + 2 + Math.abs(fibre) * 2);
          ctx.stroke();
        }

        const attachedX = falling.x + falling.width / 2;
        ctx.strokeStyle = "#5c351d";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(attachedX, movingY - 14);
        ctx.lineTo(attachedX, movingY);
        ctx.stroke();
        ctx.strokeStyle = "#e0ae69";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(attachedX - 3, movingY - 14);
        ctx.lineTo(attachedX - 8, movingY - 24);
        ctx.moveTo(attachedX, movingY - 14);
        ctx.lineTo(attachedX + 1, movingY - 26);
        ctx.moveTo(attachedX + 3, movingY - 14);
        ctx.lineTo(attachedX + 9, movingY - 22);
        ctx.stroke();
        ctx.lineCap = "butt";

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
    ropeSwingsRef.current = 0;
    speedRef.current = BASE_SWING_SPEED;
    levelRef.current = 0;
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
    bombSpeedRef.current = 2;
    perfectStreakRef.current = 0;
    waterYRef.current = CANVAS_H;
    frozenSwingsRef.current = 0;
    setFrozenSwings(0);
    setBombSpeedLabel(null);
    setLevel(0);
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
      const speeds = [2, 3, 4] as const;
      bombSpeedRef.current = speeds[Math.floor(Math.random() * speeds.length)];
      bombFuseRef.current = gameTimeRef.current + BOMB_FUSE_SECONDS;
      setBombSpeedLabel(bombSpeedDetails[bombSpeedRef.current].label);
    } else {
      bombFuseRef.current = null;
      setBombSpeedLabel(null);
    }
    setBombWarning(shouldBomb);
    const levelDetails = LEVELS[levelRef.current];
    const nextWidth = shouldBomb
      ? BOMB_SIZE
      : Math.min(BASE_W, previous.width * (1 + levelDetails.brickBonus));
    currentRef.current = {
      x: directionRef.current > 0 ? 18 : CANVAS_W - 18 - nextWidth,
      y: previous.y - DROP_GAP,
      width: nextWidth,
      colour: shouldBomb ? "#090b0d" : COLOURS[number % COLOURS.length],
      kind,
      number,
    };
    ropeSwingsRef.current = 0;
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
    perfectStreakRef.current = isPerfect ? perfectStreakRef.current + 1 : 0;
    const streakReward = perfectStreakRef.current === PERFECT_STREAK_TARGET;
    const freezesWater = perfectStreakRef.current >= PERFECT_STREAK_TARGET;
    const normalLandedWidth = isPerfect ? previous.width : overlap;
    const landedWidth = streakReward
      ? Math.min(BASE_W, normalLandedWidth + PERFECT_WIDTH_BONUS)
      : normalLandedWidth;
    const normalLandedX = isPerfect ? previousX : overlapStart;
    const landed: Block = {
      x: normalLandedX - (landedWidth - normalLandedWidth) / 2 -
        Math.sin(gameTimeRef.current * 0.95) * wobbleAmount,
      y: previous.y - BLOCK_H,
      width: landedWidth,
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
    const nextLevel = levelForScore(nextScore);
    const levelChanged = nextLevel !== levelRef.current;
    if (freezesWater) {
      frozenSwingsRef.current = 3;
      setFrozenSwings(3);
    }
    if (levelChanged) {
      levelRef.current = nextLevel;
      setLevel(nextLevel);
      speedRef.current = BASE_SWING_SPEED * LEVELS[nextLevel].swingSpeed;
      showCallout(`${LEVELS[nextLevel].name}!`, 1500);
    } else if (freezesWater) {
      showCallout(
        streakReward ? "5 PERFECTS! WATER FROZEN + BLOCK WIDENED" : "PERFECT! FREEZE RESET TO 3",
        1500,
      );
    } else {
      showCallout(isPerfect ? `PERFECT +${earned}` : `+${earned}`);
    }
    wobbleLevelRef.current += 1;
    if (moving.kind === "steel") wobbleLevelRef.current *= 0.5;
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
      ropeCutX: moving.x + moving.width / 2,
      ropeCutY: moving.y,
      ropeSnapped: ropeSwingsRef.current >= MAX_ROPE_SWINGS,
      bombSpeed: moving.kind === "bomb" ? bombSpeedRef.current : 1,
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
        const swingSpeed = moving.kind === "bomb"
          ? speedRef.current * bombSpeedRef.current
          : speedRef.current;
        moving.x += directionRef.current * swingSpeed * delta;
        if (moving.x <= 18) {
          moving.x = 18;
          if (directionRef.current < 0) {
            directionRef.current = 1;
            ropeSwingsRef.current += 1;
            if (frozenSwingsRef.current > 0) {
              frozenSwingsRef.current -= 1;
              setFrozenSwings(frozenSwingsRef.current);
            } else {
              waterYRef.current -= WATER_RISE_PER_SWING * LEVELS[levelRef.current].waterSpeed;
            }
          }
        } else if (moving.x + moving.width >= CANVAS_W - 18) {
          moving.x = CANVAS_W - 18 - moving.width;
          if (directionRef.current > 0) {
            directionRef.current = -1;
            ropeSwingsRef.current += 1;
            if (frozenSwingsRef.current > 0) {
              frozenSwingsRef.current -= 1;
              setFrozenSwings(frozenSwingsRef.current);
            } else {
              waterYRef.current -= WATER_RISE_PER_SWING * LEVELS[levelRef.current].waterSpeed;
            }
          }
        }
        if (ropeSwingsRef.current >= MAX_ROPE_SWINGS) {
          showCallout("ROPE SNAPPED!", 850);
          drop();
        }
        if (moving.kind === "bomb" && bombFuseRef.current !== null && gameTimeRef.current >= bombFuseRef.current) {
          drop();
        }
        const top = blocksRef.current.at(-1);
        const cameraTarget = top ? Math.max(0, CANVAS_H - 105 - 4 * BLOCK_H - top.y) : 0;
        if (waterYRef.current + cameraTarget <= 0) {
          playingRef.current = false;
          currentRef.current = null;
          setBombWarning(false);
          setBombSpeedLabel(null);
          showCallout("THE SEA TOOK THE TOWER!", 1400);
          setStatus("over");
          setBest((currentBest) => {
            const nextBest = Math.max(currentBest, scoreRef.current);
            localStorage.setItem("tower-drop-best", String(nextBest));
            return nextBest;
          });
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
          const hitIndex = blocksRef.current.findIndex((block, index, blocks) => {
            const heightFactor = blocks.length <= 1 ? 0 : index / (blocks.length - 1);
            const blockX = block.x + towerOffset * heightFactor;
            const bombCentreX = falling.x + BOMB_SIZE / 2;
            const bombCentreY = falling.y + BOMB_SIZE / 2;
            const nearestX = Math.max(blockX, Math.min(bombCentreX, blockX + block.width));
            const nearestY = Math.max(block.y, Math.min(bombCentreY, block.y + BLOCK_H));
            const dx = bombCentreX - nearestX;
            const dy = bombCentreY - nearestY;
            return falling.y + BOMB_SIZE >= block.y &&
              falling.y <= block.y + BLOCK_H &&
              dx * dx + dy * dy <= (BOMB_SIZE / 2) ** 2;
          });
          if (hitIndex >= 0) {
            const bombNumber = falling.number;
            fallingRef.current = null;
            const hitBlock = blocksRef.current[hitIndex];
            const heightFactor = blocksRef.current.length <= 1 ? 0 : hitIndex / (blocksRef.current.length - 1);
            const visualX = hitBlock.x + towerOffset * heightFactor;
            const cutStart = Math.max(visualX, falling.x);
            const cutEnd = Math.min(visualX + hitBlock.width, falling.x + BOMB_SIZE);
            const leftWidth = Math.max(0, cutStart - visualX);
            const rightWidth = Math.max(0, visualX + hitBlock.width - cutEnd);
            if (rightWidth > leftWidth) {
              hitBlock.x += hitBlock.width - rightWidth;
              hitBlock.width = rightWidth;
            } else {
              hitBlock.width = leftWidth;
            }
            showCallout("BOOM! TOWER CHOPPED!", 1300);
            setBombSpeedLabel(null);
            createNextBlock(blocksRef.current.at(-1)!, bombNumber, false);
          } else if (falling.y >= falling.targetY) {
            const bombNumber = falling.number;
            const details = bombSpeedDetails[falling.bombSpeed as 2 | 3 | 4];
            const nextScore = scoreRef.current + details.bonus;
            scoreRef.current = nextScore;
            setScore(nextScore);
            const nextLevel = levelForScore(nextScore);
            if (nextLevel !== levelRef.current) {
              levelRef.current = nextLevel;
              setLevel(nextLevel);
              speedRef.current = BASE_SWING_SPEED * LEVELS[nextLevel].swingSpeed;
              showCallout(`${LEVELS[nextLevel].name}!`, 1500);
            } else {
              showCallout(`SAFE MISS +${details.bonus}`, 1000);
            }
            fallingRef.current = null;
            setBombSpeedLabel(null);
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
          <span>LEVEL <b>{level === LEVELS.length - 1 ? "INSANE" : level + 1}</b></span>
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
            {status === "playing" && frozenSwings > 0 && (
              <div className="freeze-counter">❄ WATER FROZEN · {frozenSwings} SWING{frozenSwings === 1 ? "" : "S"}</div>
            )}
            {status === "playing" && bombWarning && (
              <div className="bomb-warning">
                <strong>{bombSpeedLabel}</strong>
                <span>DON&apos;T LET IT HIT YOUR TOWER!</span>
              </div>
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
            <li><b>WATCH THE ROPE</b><span>It frays on every swing and snaps automatically on the fifth.</span></li>
            <li><b>PERFECT = +5</b><span>Golden tenth blocks score +10, or +20 when perfect.</span></li>
            <li><b>STEEL STEADIES</b><span>Every twentieth block halves the tower wobble.</span></li>
            <li><b>AVOID BOMBS</b><span>Bombs randomly swing at 2×, 3× or 4× speed. A safe miss earns +2, +3 or +10.</span></li>
            <li><b>PERFECT STREAK</b><span>Five perfects widen the block and freeze the sea for three swings. Every further perfect resets the freeze to three.</span></li>
            <li><b>BEAT THE SEA</b><span>It starts at one brick every five swings, then rises faster at higher levels.</span></li>
            <li><b>LEVEL UP</b><span>Higher scores raise the water and swing speed, but also give you wider bricks.</span></li>
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

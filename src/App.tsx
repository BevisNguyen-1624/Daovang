import { useEffect, useRef, useCallback } from 'react'

// ── QUESTION BANK ──
// Thêm câu hỏi: copy 1 dòng, sửa q / opts / a / yp
// q   : nội dung câu hỏi
// opts: mảng 4 đáp án
// a   : index đáp án đúng (0-3)
// yp  : số Y-Point thưởng khi trả lời đúng
// Y-Point giờ gắn theo kích thước viên vàng (trong makeObjs), không theo câu hỏi
const QUESTION_BANK = [
  { q: 'Thủ đô của Việt Nam là?',                      opts: ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Huế'],                     a: 1 },
  { q: '2 × 8 + 4 = ?',                                opts: ['20', '22', '24', '26'],                                               a: 1 },
  { q: 'Việt Nam có bao nhiêu tỉnh thành?',             opts: ['58', '61', '63', '65'],                                               a: 2 },
  { q: 'Đỉnh núi cao nhất Việt Nam?',                   opts: ['Bạch Mã', 'Fansipan', 'Ngọc Linh', 'Lang Biang'],                    a: 1 },
  { q: '15 × 3 – 5 = ?',                               opts: ['30', '35', '40', '45'],                                               a: 2 },
  { q: 'Sông nào chảy qua Hà Nội?',                    opts: ['Sông Cửu Long', 'Sông Hương', 'Sông Hồng', 'Sông Mã'],               a: 2 },
  { q: '100 – 37 = ?',                                  opts: ['53', '63', '73', '83'],                                               a: 1 },
  { q: 'Quốc hoa của Việt Nam?',                        opts: ['Hoa sen', 'Hoa mai', 'Hoa đào', 'Hoa lan'],                          a: 0 },
  { q: 'Năm nào Việt Nam thống nhất đất nước?',         opts: ['1973', '1975', '1977', '1979'],                                       a: 1 },
  { q: 'Bác Hồ sinh năm nào?',                          opts: ['1889', '1890', '1891', '1892'],                                       a: 1 },
  { q: 'Đồng tiền chính thức của Việt Nam?',            opts: ['Đô la', 'Đồng', 'Yên', 'Nhân dân tệ'],                              a: 1 },
  { q: 'Ngày Quốc khánh Việt Nam?',                     opts: ['1/5', '2/9', '30/4', '19/8'],                                         a: 1 },
  { q: '(12 + 8) × 3 = ?',                              opts: ['48', '60', '72', '80'],                                               a: 1 },
  { q: 'Biển nào tiếp giáp Việt Nam ở phía Đông?',      opts: ['Biển Đông', 'Biển Tây', 'Thái Bình Dương', 'Ấn Độ Dương'],          a: 0 },
  { q: 'Tiền tố của 1000 trong hệ SI?',                 opts: ['Mega', 'Kilo', 'Giga', 'Tera'],                                       a: 1 },
]

const LIVES = 3
const OY = 160
const MIN_ROPE = 30
const EXT_SPD = 9, RET_EMPTY = 8, RET_HEAVY = 3.5
const SWING_SPD = 0.025, MAX_SWING = Math.PI * 0.42

type ObjType = 'gold' | 'diamond' | 'rock' | 'bomb'
interface Obj { id: number; t: ObjType; x: number; y: number; r: number; pts: number; sz: string; gone: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; r: number; c: string; life: number; max: number }
interface Confetti { x: number; y: number; vx: number; vy: number; rot: number; rotS: number; w: number; h: number; c: string; life: number; max: number }
interface LogEntry { time: string; player: string; q: string; ans: string; res: string; prize: string; code: string; pts: number }
interface Quiz { q: string; opts: string[]; a: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeObjs(CW: number, _CH: number, ox: number, maxRope: number): Obj[] {
  const placed: Obj[] = []
  let id = 1

  // ── Tầm với ngang của móc câu (theo arc MAX_SWING × rope) ──
  const xReach = Math.sin(MAX_SWING) * maxRope
  // Mở rộng sang 2 bên: bỏ padding cứng +40 để vùng spawn phủ đều màn hình
  const xMin = Math.max(30, ox - xReach - 10)
  const xMax = Math.min(CW - 30, ox + xReach + 10)

  const yTop = OY + 80           // sát mép trên (gần mặt đất)
  const yBot     = OY + maxRope - 30  // đáy tổng (đá/bom/vàng to)
  // Kim cương cần đủ khoảng để hook reach: giới hạn cao hơn đáy 80px
  const yBotSafe = OY + maxRope - 80  // đáy an toàn cho kim cương

  // Chia 3 vùng theo chiều sâu
  const zone1Bot = yTop + (yBot - yTop) * 0.33  // vùng trên  → vàng Nhỏ
  const zone2Bot = yTop + (yBot - yTop) * 0.66  // vùng giữa → vàng Vừa

  // tryPlace với optional xMin/xMax override để kiểm soát phân vùng ngang
  const tryPlace = (
    t: ObjType, r: number, pts: number, sz: string,
    minY: number, maxY: number,
    lx = xMin, rx = xMax,
  ): boolean => {
    const y0 = Math.max(minY, yTop), y1 = Math.min(maxY, yBot)
    if (y1 - y0 < r * 2) return false
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = lx + r + Math.random() * (rx - lx - r * 2)
      const y = y0 + r + Math.random() * (y1 - y0 - r * 2)
      if (!placed.some(o => Math.hypot(x - o.x, y - o.y) < r + o.r + 16)) {
        placed.push({ id: id++, t, x, y, r, pts, sz, gone: false })
        return true
      }
    }
    return false
  }

  // Điểm giữa ngang để chia trái/phải đối xứng
  const midX = (xMin + xMax) / 2

  // ── Vàng Nhỏ (r=20): 6 viên × 5Y — vùng trên, 3 trái + 3 phải ──
  for (let i = 0; i < 3; i++) tryPlace('gold', 20, 5, 's', yTop, zone1Bot, xMin, midX)
  for (let i = 0; i < 3; i++) tryPlace('gold', 20, 5, 's', yTop, zone1Bot, midX, xMax)

  // ── Vàng Vừa (r=36): 4 viên — vùng giữa ──
  //    Tăng từ r=30 → r=36 (~30% lớn hơn vàng Nhỏ về bán kính, ~69% về diện tích)
  const midPts = shuffle([15, 10, 10, 10])
  tryPlace('gold', 36, midPts[0], 'm', zone1Bot, zone2Bot, xMin, midX)
  tryPlace('gold', 36, midPts[1], 'm', zone1Bot, zone2Bot, midX, xMax)
  tryPlace('gold', 36, midPts[2], 'm', zone1Bot, zone2Bot, xMin, midX)
  tryPlace('gold', 36, midPts[3], 'm', zone1Bot, zone2Bot, midX, xMax)

  // ── Vàng To (r=52): 4 viên — vùng dưới ──
  //    Tăng từ r=46 → r=52 (~44% lớn hơn vàng Vừa r=36 về bán kính)
  const bigPts = shuffle([30, 30, 15, 15])
  tryPlace('gold', 52, bigPts[0], 'l', zone2Bot, yBot, xMin, midX)
  tryPlace('gold', 52, bigPts[1], 'l', zone2Bot, yBot, midX, xMax)
  tryPlace('gold', 52, bigPts[2], 'l', zone2Bot, yBot, xMin, midX)
  tryPlace('gold', 52, bigPts[3], 'l', zone2Bot, yBot, midX, xMax)

  // ── Kim cương (r=24): 2 viên — spawn trong yBotSafe để hook reach được ──
  //    Mỗi viên 1 bên trái/phải
  tryPlace('diamond', 24, 1000, 'd', zone1Bot, yBotSafe, xMin, midX)
  tryPlace('diamond', 24, 1000, 'd', zone1Bot, yBotSafe, midX, xMax)

  // ── Đá và Bom: rải đều 2 bên toàn vùng ──
  for (let i = 0; i < 4; i++) tryPlace('rock', 20 + (Math.random() * 12 | 0), 0, '', yTop, yBot, xMin, midX)
  for (let i = 0; i < 4; i++) tryPlace('rock', 20 + (Math.random() * 12 | 0), 0, '', yTop, yBot, midX, xMax)
  for (let i = 0; i < 2; i++) tryPlace('bomb', 22, 0, '', yTop + 60, yBot, xMin, midX)
  tryPlace('bomb', 22, 0, '', yTop + 60, yBot, midX, xMax)

  return placed
}

// ── BACKEND: Google Apps Script Web App (Google Sheet: Timecode - Mã YD - Số điểm) ──
const API_URL = "https://script.google.com/macros/s/AKfycbxZI-ALtptuaYpbzgu9gqJujnjLg5VSjkh2tFlSFmoBxm1TLQY-2OqTEqiDxb5058BH/exec"

interface ScoreRecord { timecode: string; maYD: string; diem: number }
interface ApiResponse<T> { success: boolean; error?: string; message?: string; data?: T }

// Ghi điểm mới lên Google Sheet (backend tự thêm Timecode)
async function saveScore(maYD: string, diem: number): Promise<ScoreRecord | null> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh CORS preflight
      body: JSON.stringify({ maYD, diem }),
    })
    const json: ApiResponse<ScoreRecord> = await res.json()
    if (!json.success) throw new Error(json.error || 'Lỗi không xác định khi lưu điểm')
    return json.data ?? null
  } catch (err) {
    console.error('[gold-game] saveScore lỗi:', err)
    return null
  }
}

// Xác thực Mã YD với Google Sheet NhanVien
interface NhanVien { maYD: string; ten: string; phongBan: string; chucDanh: string }
async function validateMaYD(maYD: string): Promise<NhanVien | { error: string } | null> {
  const url = `${API_URL}?action=validate&maYD=${encodeURIComponent(maYD.trim())}`
  // Thử tối đa 2 lần, timeout 8s mỗi lần (GAS cold start ~2-4s)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      const json: ApiResponse<NhanVien> = await res.json()
      // Kiểm tra chặt: data phải là object có field maYD (string)
      // Tránh GAS chưa deploy mới trả về { success:true, data:[...array] }
      if (!json.success) return { error: (json as any).error || 'Mã YD không tồn tại trong hệ thống' }
      if (
        !json.data ||
        Array.isArray(json.data) ||
        typeof json.data !== 'object' ||
        typeof (json.data as NhanVien).maYD !== 'string'
      ) return { error: 'Mã YD không tồn tại trong hệ thống' }
      return json.data as NhanVien
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        if (attempt === 0) continue // retry 1 lần nếu timeout
        return { error: 'Hệ thống phản hồi quá chậm. Vui lòng thử lại.' }
      }
      console.error('[gold-game] validateMaYD lỗi:', err)
      return { error: 'Không thể kết nối. Vui lòng kiểm tra mạng.' }
    }
  }
  return { error: 'Hệ thống phản hồi quá chậm. Vui lòng thử lại.' }
}

// Lấy bảng xếp hạng điểm cao nhất
async function getTopScores(limit = 10): Promise<ScoreRecord[]> {
  try {
    const res = await fetch(`${API_URL}?action=top&limit=${limit}`)
    const json: ApiResponse<ScoreRecord[]> = await res.json()
    if (!json.success) throw new Error(json.error || 'Lỗi không xác định khi lấy bảng xếp hạng')
    return json.data ?? []
  } catch (err) {
    console.error('[gold-game] getTopScores lỗi:', err)
    return []
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    gs: 'idle' as string,
    pName: '',
    maYD: '',
    lives: LIVES,
    score: 0,
    totalYPoints: 0,
    paused: false,
    ang: 0,
    angDir: 1,
    rope: MIN_ROPE,
    carried: null as Obj | null,
    shake: 0,
    redFlash: 0,
    parts: [] as Particle[],
    confetti: [] as Confetti[],
    btcLog: [] as LogEntry[],
    usedQ: [] as number[],
    gameQuizzes: [] as Quiz[],
    objs: [] as Obj[],
    ac: null as AudioContext | null,
    qObj: null as Obj | null,
    qData: null as Quiz | null,
    bgSeed: 0,
    scoreSaved: false,
  })

  const overlayRef = useRef<HTMLDivElement>(null)

  const snd = useCallback((type: string) => {
    const s = stateRef.current
    try {
      if (!s.ac) s.ac = new (window.AudioContext || (window as any).webkitAudioContext)()
      const o = s.ac.createOscillator(), g = s.ac.createGain()
      o.connect(g); g.connect(s.ac.destination)
      const t = s.ac.currentTime
      if (type === 'gold') {
        o.type = 'sine'
        o.frequency.setValueAtTime(440, t); o.frequency.linearRampToValueAtTime(900, t + .3)
        g.gain.setValueAtTime(.25, t); g.gain.linearRampToValueAtTime(0, t + .4)
        o.start(t); o.stop(t + .4)
      } else if (type === 'ok') {
        o.type = 'sine'
        ;[523, 659, 784].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * .11))
        g.gain.setValueAtTime(.2, t); g.gain.linearRampToValueAtTime(0, t + .55)
        o.start(t); o.stop(t + .55)
      } else if (type === 'fail') {
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(220, t); o.frequency.linearRampToValueAtTime(110, t + .3)
        g.gain.setValueAtTime(.15, t); g.gain.linearRampToValueAtTime(0, t + .3)
        o.start(t); o.stop(t + .3)
      } else if (type === 'boom') {
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(130, t); o.frequency.linearRampToValueAtTime(20, t + .55)
        g.gain.setValueAtTime(.3, t); g.gain.linearRampToValueAtTime(0, t + .55)
        o.start(t); o.stop(t + .55)
      }
    } catch (_) { /* silent */ }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const s = stateRef.current

    // arcTo-based rounded rect — works in all browsers (ctx.roundRect not universally available)
    function rrect(x: number, y: number, w: number, h: number, r: number,
                   tl = r, tr = r, br = r, bl = r) {
      ctx.beginPath()
      ctx.moveTo(x + tl, y)
      ctx.lineTo(x + w - tr, y)
      ctx.arcTo(x + w, y, x + w, y + tr, tr)
      ctx.lineTo(x + w, y + h - br)
      ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
      ctx.lineTo(x + bl, y + h)
      ctx.arcTo(x, y + h, x, y + h - bl, bl)
      ctx.lineTo(x, y + tl)
      ctx.arcTo(x, y, x + tl, y, tl)
      ctx.closePath()
    }

    // Full-screen canvas resolution
    const CW = canvas.width = window.innerWidth
    const CH = canvas.height = window.innerHeight
    const OX = CW / 2
    const MAX_ROPE = CH - OY - 30

    // ── BACKGROUND (geological layers) ──
    // Pre-generate random stone/mineral positions once
    // Geological layer definitions
    const GEO_LAYERS = [
      // [yStart, height, topColor, botColor, label]
      { y: 186, h: 70,  c0: '#d4956a', c1: '#c07a4f', name: 'topsoil' },
      { y: 256, h: 85,  c0: '#b8714a', c1: '#9f5a35', name: 'clay' },
      { y: 341, h: 90,  c0: '#9f5a35', c1: '#8a4520', name: 'sandstone' },
      { y: 431, h: 100, c0: '#7a3a18', c1: '#6a2e10', name: 'rock' },
      { y: 531, h: CH - 531, c0: '#5a2008', c1: '#3e1000', name: 'deep' },
    ]

    // Pre-bake pebble/mineral coords seeded per game
    const pebbles: { x: number; y: number; rx: number; ry: number; angle: number; lyr: number }[] = []
    const minerals: { x: number; y: number; r: number; c: string }[] = []
    const cracks: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; lyr: number }[] = []
    const stoneSlabs: { x: number; y: number; w: number; h: number; rot: number; c: string }[] = []

    const rng = (seed: number) => Math.abs(Math.sin(seed * 9301 + 49297) % 1)

    for (let i = 0; i < 90; i++) {
      const lyr = Math.floor(rng(i * 3) * GEO_LAYERS.length)
      const lay = GEO_LAYERS[lyr]
      pebbles.push({
        x: rng(i * 7 + 1) * CW,
        y: lay.y + rng(i * 7 + 2) * lay.h,
        rx: 4 + rng(i * 7 + 3) * 10,
        ry: 3 + rng(i * 7 + 4) * 6,
        angle: rng(i * 7 + 5) * Math.PI,
        lyr,
      })
    }
    for (let i = 0; i < 40; i++) {
      const lyr = 2 + Math.floor(rng(i * 11) * 3)
      const lay = GEO_LAYERS[Math.min(lyr, GEO_LAYERS.length - 1)]
      const palette = ['#c8a060', '#a06830', '#e8d080', '#80b8d8', '#9890d8', '#e88040']
      minerals.push({
        x: rng(i * 13 + 1) * CW,
        y: lay.y + rng(i * 13 + 2) * lay.h,
        r: 2 + rng(i * 13 + 3) * 5,
        c: palette[Math.floor(rng(i * 13 + 4) * palette.length)],
      })
    }
    for (let i = 0; i < 30; i++) {
      const lyr = 1 + Math.floor(rng(i * 17) * 4)
      const lay = GEO_LAYERS[Math.min(lyr, GEO_LAYERS.length - 1)]
      const x1 = rng(i * 17 + 1) * CW
      const y1 = lay.y + rng(i * 17 + 2) * lay.h
      cracks.push({ x1, y1, x2: x1 + (rng(i * 17 + 3) - .5) * 60, y2: y1 + rng(i * 17 + 4) * 30, x3: x1 + (rng(i * 17 + 5) - .5) * 40, y3: y1 + rng(i * 17 + 6) * 50, lyr })
    }
    for (let i = 0; i < 20; i++) {
      const lyr = 2 + Math.floor(rng(i * 23) * 3)
      const lay = GEO_LAYERS[Math.min(lyr, GEO_LAYERS.length - 1)]
      stoneSlabs.push({
        x: rng(i * 23 + 1) * CW,
        y: lay.y + rng(i * 23 + 2) * lay.h,
        w: 20 + rng(i * 23 + 3) * 50,
        h: 8 + rng(i * 23 + 4) * 20,
        rot: (rng(i * 23 + 5) - .5) * .4,
        c: `rgba(${80 + rng(i * 23 + 6) * 40 | 0},${60 + rng(i * 23 + 7) * 30 | 0},${40 + rng(i * 23 + 8) * 20 | 0},${.25 + rng(i * 23 + 9) * .25})`,
      })
    }

    function drawBG() {
      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, 185)
      sky.addColorStop(0, '#6ec6f0'); sky.addColorStop(1, '#b8e4f8')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, 185)

      // Clouds
      function cloud(cx: number, cy: number, sc: number) {
        ctx.fillStyle = 'rgba(255,255,255,.92)'
        for (const [dx, dy, r] of [[0,0,28],[-24,9,20],[24,9,20],[-11,16,16],[11,16,16]] as [number,number,number][]) {
          ctx.beginPath(); ctx.arc(cx + dx * sc, cy + dy * sc, r * sc, 0, Math.PI * 2); ctx.fill()
        }
      }
      const nc = Math.ceil(CW / 220)
      for (let i = 0; i < nc; i++) cloud(80 + i * (CW / nc), 38 + Math.sin(i * 2.3) * 18, 0.7 + Math.sin(i * 1.7) * .25)

      // Sun
      const sg = ctx.createRadialGradient(70, 42, 2, 70, 42, 32)
      sg.addColorStop(0, '#fff7a0'); sg.addColorStop(.6, '#ffd700'); sg.addColorStop(1, 'rgba(255,200,0,0)')
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(70, 42, 32, 0, Math.PI * 2); ctx.fill()

      // Platform
      const wood = ctx.createLinearGradient(0, 158, 0, 188)
      wood.addColorStop(0, '#c8863a'); wood.addColorStop(1, '#a06428')
      ctx.fillStyle = wood; ctx.fillRect(0, 158, CW, 30)
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1
      for (let x = 0; x < CW; x += 80) { ctx.beginPath(); ctx.moveTo(x, 158); ctx.lineTo(x, 188); ctx.stroke() }
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, 158, CW, 5)

      // Geological layers
      GEO_LAYERS.forEach(lay => {
        const g = ctx.createLinearGradient(0, lay.y, 0, lay.y + lay.h)
        g.addColorStop(0, lay.c0); g.addColorStop(1, lay.c1)
        ctx.fillStyle = g; ctx.fillRect(0, lay.y, CW, lay.h)
      })

      // Layer boundary lines with slight wave
      ctx.lineWidth = 1.5; ctx.setLineDash([])
      GEO_LAYERS.slice(1).forEach(lay => {
        ctx.strokeStyle = 'rgba(0,0,0,.18)'
        ctx.beginPath()
        for (let x = 0; x <= CW; x += 20) {
          const wy = lay.y + Math.sin(x * .04 + lay.y * .01) * 2.5
          x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy)
        }
        ctx.stroke()
      })

      // Stone slabs embedded in layers
      stoneSlabs.forEach(sl => {
        ctx.save(); ctx.translate(sl.x, sl.y); ctx.rotate(sl.rot)
        ctx.fillStyle = sl.c
        rrect(-sl.w / 2, -sl.h / 2, sl.w, sl.h, 3); ctx.fill()
        ctx.restore()
      })

      // Cracks / fault lines
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.2)'
      cracks.forEach(cr => {
        ctx.beginPath(); ctx.moveTo(cr.x1, cr.y1); ctx.lineTo(cr.x2, cr.y2); ctx.lineTo(cr.x3, cr.y3); ctx.stroke()
      })

      // Pebbles and stones
      pebbles.forEach(pb => {
        const lay = GEO_LAYERS[pb.lyr]
        const dark = lay.name === 'deep' || lay.name === 'rock'
        const pg = ctx.createRadialGradient(pb.x - pb.rx * .3, pb.y - pb.ry * .3, 0, pb.x, pb.y, Math.max(pb.rx, pb.ry))
        pg.addColorStop(0, dark ? '#8a7a72' : '#c8b8a8')
        pg.addColorStop(1, dark ? '#4a3a32' : '#907060')
        ctx.fillStyle = pg
        ctx.save(); ctx.translate(pb.x, pb.y); ctx.rotate(pb.angle)
        ctx.beginPath(); ctx.ellipse(0, 0, pb.rx, pb.ry, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,.12)'
        ctx.beginPath(); ctx.ellipse(-pb.rx * .25, -pb.ry * .3, pb.rx * .3, pb.ry * .2, -.3, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })

      // Mineral veins / deposits
      minerals.forEach(mn => {
        const mg = ctx.createRadialGradient(mn.x - mn.r * .3, mn.y - mn.r * .3, 0, mn.x, mn.y, mn.r * 1.5)
        mg.addColorStop(0, mn.c + 'ff'); mg.addColorStop(1, mn.c + '00')
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mn.x, mn.y, mn.r * 1.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = mn.c; ctx.beginPath(); ctx.arc(mn.x, mn.y, mn.r, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,.5)'
        ctx.beginPath(); ctx.arc(mn.x - mn.r * .3, mn.y - mn.r * .3, mn.r * .35, 0, Math.PI * 2); ctx.fill()
      })
    }

    function drawRabbit() {
      const cx = OX
      const ts = Date.now() * .003
      const bob = Math.sin(ts) * 1.5  // gentle breathing

      // ── Ears ──
      // Left ear (outer white)
      ctx.fillStyle = '#f5f5f5'
      ctx.beginPath(); ctx.ellipse(cx - 10, 30 + bob, 7, 22, -0.18, 0, Math.PI * 2); ctx.fill()
      // Left ear (inner pink)
      ctx.fillStyle = '#ffb3ba'
      ctx.beginPath(); ctx.ellipse(cx - 10, 32 + bob, 3.5, 15, -0.18, 0, Math.PI * 2); ctx.fill()
      // Right ear (outer white)
      ctx.fillStyle = '#f5f5f5'
      ctx.beginPath(); ctx.ellipse(cx + 10, 30 + bob, 7, 22, 0.18, 0, Math.PI * 2); ctx.fill()
      // Right ear (inner pink)
      ctx.fillStyle = '#ffb3ba'
      ctx.beginPath(); ctx.ellipse(cx + 10, 32 + bob, 3.5, 15, 0.18, 0, Math.PI * 2); ctx.fill()

      // ── Legs / feet ──
      ctx.fillStyle = '#3b82f6'
      rrect(cx - 14, 127, 12, 22, 4); ctx.fill()
      rrect(cx + 2, 127, 12, 22, 4); ctx.fill()
      // Shoes
      ctx.fillStyle = '#1e3a5f'
      ctx.beginPath(); ctx.ellipse(cx - 8, 150, 10, 5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(cx + 8, 150, 10, 5, 0, 0, Math.PI * 2); ctx.fill()

      // ── Tail ──
      ctx.fillStyle = '#f5f5f5'
      ctx.beginPath(); ctx.arc(cx + 18, 122, 7, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.6)'
      ctx.beginPath(); ctx.arc(cx + 16, 120, 4, 0, Math.PI * 2); ctx.fill()

      // ── Body (yellow shirt) ──
      const bodyG = ctx.createLinearGradient(cx - 16, 88, cx + 16, 130)
      bodyG.addColorStop(0, '#fbbf24'); bodyG.addColorStop(1, '#f59e0b')
      ctx.fillStyle = bodyG
      rrect(cx - 16, 88, 32, 42, 6); ctx.fill()
      // Shirt pocket
      ctx.fillStyle = 'rgba(255,255,255,.3)'
      rrect(cx + 3, 95, 9, 8, 2); ctx.fill()

      // ── Right arm (thumbs up) ──
      ctx.fillStyle = '#f5f5f5'
      ctx.save(); ctx.translate(cx + 16, 100); ctx.rotate(0.5)
      rrect(-5, 0, 10, 20, 5); ctx.fill()
      ctx.restore()
      // Thumb
      ctx.fillStyle = '#f5f5f5'
      ctx.save(); ctx.translate(cx + 26, 96); ctx.rotate(-0.5)
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 9, -0.3, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // ── Left arm (down/relaxed) ──
      ctx.fillStyle = '#f5f5f5'
      ctx.save(); ctx.translate(cx - 16, 100); ctx.rotate(-0.25)
      rrect(-5, 0, 10, 20, 5); ctx.fill()
      ctx.restore()

      // ── Head ──
      const headG = ctx.createRadialGradient(cx - 5, 66 + bob, 2, cx, 70 + bob, 18)
      headG.addColorStop(0, '#ffffff'); headG.addColorStop(1, '#e8e8e8')
      ctx.fillStyle = headG
      ctx.beginPath(); ctx.ellipse(cx, 70 + bob, 17, 16, 0, 0, Math.PI * 2); ctx.fill()

      // Rosy cheeks
      ctx.fillStyle = 'rgba(255,150,150,.45)'
      ctx.beginPath(); ctx.ellipse(cx - 10, 74 + bob, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(cx + 10, 74 + bob, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill()

      // Winking left eye (closed arc)
      ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx - 5, 69 + bob, 4, Math.PI + 0.3, 2 * Math.PI - 0.3); ctx.stroke()
      // Open right eye
      ctx.fillStyle = '#2c2c2c'
      ctx.beginPath(); ctx.arc(cx + 5, 68 + bob, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'white'
      ctx.beginPath(); ctx.arc(cx + 6, 67 + bob, 1.2, 0, Math.PI * 2); ctx.fill()

      // Nose
      ctx.fillStyle = '#ff9999'
      ctx.beginPath(); ctx.ellipse(cx, 74 + bob, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill()

      // Smile
      ctx.strokeStyle = '#cc5555'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(cx, 75 + bob, 5, 0.2, Math.PI - 0.2); ctx.stroke()

      // ── Pulley ──
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(OX, OY, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.arc(OX, OY, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#78909c'; ctx.fillRect(OX - 30, OY - 3, 60, 6)
      ctx.fillStyle = '#90a4ae'; ctx.fillRect(OX - 35, OY - 6, 6, 12); ctx.fillRect(OX + 29, OY - 6, 6, 12)
    }

    function tipPos() {
      return { x: OX + Math.sin(s.ang) * s.rope, y: OY + Math.cos(s.ang) * s.rope }
    }

    function drawClaw() {
      const { x: tx, y: ty } = tipPos()
      ctx.strokeStyle = '#d4a855'; ctx.lineWidth = 3; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(tx, ty); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,220,100,.4)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(OX - 1, OY); ctx.lineTo(tx - 1, ty); ctx.stroke()
      if (s.carried) { ctx.save(); ctx.translate(tx, ty); drawShape(s.carried, 0, 0); ctx.restore() }
      // rotate(-ang): connector pin (top) points toward pulley, V-mouth opens in drop direction
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(-s.ang)
      const hg = ctx.createLinearGradient(-10, -20, 10, 8)
      hg.addColorStop(0, '#546e7a'); hg.addColorStop(.6, '#90a4ae'); hg.addColorStop(1, '#e0e8ee')
      ctx.fillStyle = hg
      // V-mouth at top (points down toward ground), pin at bottom (toward pulley)
      ctx.beginPath()
      ctx.moveTo(0, 8);  ctx.lineTo(-13, -16); ctx.lineTo(-8, -20); ctx.lineTo(0, -9)
      ctx.lineTo(8, -20); ctx.lineTo(13, -16); ctx.lineTo(0, 8); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-8, -14); ctx.stroke()
      // Connector pin at bottom of hook (toward pulley end)
      const tg = ctx.createRadialGradient(-2, 6, 1, 0, 6, 5)
      tg.addColorStop(0, '#eceff1'); tg.addColorStop(1, '#78909c')
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(0, 6, 5, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    function drawGold(x: number, y: number, r: number) {
      // Soft glow
      const gl = ctx.createRadialGradient(x, y, r * .4, x, y, r * 2.0)
      gl.addColorStop(0, 'rgba(255,210,0,.3)'); gl.addColorStop(1, 'rgba(255,180,0,0)')
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 2.0, 0, Math.PI * 2); ctx.fill()

      // Shadow under nugget
      ctx.fillStyle = 'rgba(0,0,0,.18)'
      ctx.beginPath(); ctx.ellipse(x + r * .1, y + r * .85, r * .75, r * .22, 0, 0, Math.PI * 2); ctx.fill()

      // Nugget blob shape using bezier — irregular organic form
      const gr = ctx.createRadialGradient(x - r * .3, y - r * .35, r * .1, x + r * .1, y + r * .2, r * 1.05)
      gr.addColorStop(0,  '#fff176')
      gr.addColorStop(.2, '#ffd600')
      gr.addColorStop(.55,'#f9a800')
      gr.addColorStop(.8, '#e65100')
      gr.addColorStop(1,  '#bf360c')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.moveTo(x,          y - r * .9)
      ctx.bezierCurveTo(x + r*.7,  y - r*.95, x + r,     y - r*.3,  x + r*.95, y + r*.1)
      ctx.bezierCurveTo(x + r*.9,  y + r*.6,  x + r*.4,  y + r*.9,  x,         y + r*.82)
      ctx.bezierCurveTo(x - r*.5,  y + r*.95, x - r,     y + r*.5,  x - r*.95, y + r*.05)
      ctx.bezierCurveTo(x - r,     y - r*.45, x - r*.65, y - r*.9,  x,         y - r*.9)
      ctx.closePath(); ctx.fill()

      // Surface bumps for lumpy nugget look
      for (const [bx, by, br] of [
        [x + r*.28, y - r*.32, r*.22],
        [x - r*.22, y - r*.15, r*.18],
        [x + r*.05, y + r*.28, r*.2],
        [x - r*.35, y + r*.18, r*.16],
      ] as [number,number,number][]) {
        const bg = ctx.createRadialGradient(bx - br*.3, by - br*.3, 0, bx, by, br)
        bg.addColorStop(0, 'rgba(255,240,100,.55)'); bg.addColorStop(1, 'rgba(200,120,0,0)')
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill()
      }

      // Specular highlight
      ctx.fillStyle = 'rgba(255,255,200,.75)'
      ctx.beginPath(); ctx.ellipse(x - r*.28, y - r*.38, r*.22, r*.13, -.5, 0, Math.PI * 2); ctx.fill()
    }

    function drawDiam(x: number, y: number, r: number) {
      const ts = Date.now() * .004
      const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5)
      gl.addColorStop(0, 'rgba(80,200,255,.4)'); gl.addColorStop(1, 'rgba(80,200,255,0)')
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#b2ebf2'
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .8, y - r * .2); ctx.lineTo(x, y); ctx.lineTo(x - r * .8, y - r * .2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#4dd0e1'
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x + r * .8, y - r * .2); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x - r, y); ctx.lineTo(x - r * .8, y - r * .2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#00acc1'
      ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x + r, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x - r, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.beginPath(); ctx.ellipse(x - r * .18, y - r * .28, r * .2, r * .12, -.3, 0, Math.PI * 2); ctx.fill()
      const sa = ts * 2
      ctx.fillStyle = 'rgba(255,255,255,.9)'
      ctx.beginPath(); ctx.arc(x + Math.cos(sa) * r * .55, y + Math.sin(sa) * r * .55, 2, 0, Math.PI * 2); ctx.fill()
    }

    function drawRock(x: number, y: number, r: number, id: number) {
      const sd = (id || 1) * 7.3
      ctx.fillStyle = 'rgba(0,0,0,.18)'
      ctx.beginPath()
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = r * (.78 + Math.sin(i * sd * .6 + sd) * .22)
        const px = x + Math.cos(a) * rr + 3, py = y + Math.sin(a) * rr + 3
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      const gr = ctx.createRadialGradient(x - r * .25, y - r * .25, r * .05, x + r * .1, y + r * .15, r * 1.05)
      gr.addColorStop(0, '#b0bec5'); gr.addColorStop(.5, '#78909c'); gr.addColorStop(1, '#37474f')
      ctx.fillStyle = gr
      ctx.beginPath()
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = r * (.78 + Math.sin(i * sd * .6 + sd) * .22)
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.2)'
      ctx.beginPath(); ctx.ellipse(x - r * .25, y - r * .3, r * .35, r * .22, -.3, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.moveTo(x - r * .1, y - r * .4); ctx.lineTo(x + r * .3, y + r * .2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - r * .4, y + r * .1); ctx.lineTo(x, y + r * .4); ctx.stroke()
      ctx.font = `${r * .9}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('☠️', x, y + 2)
    }

    function drawBomb(x: number, y: number, r: number) {
      const ts = Date.now() * .006
      ctx.fillStyle = 'rgba(0,0,0,.2)'
      ctx.beginPath(); ctx.ellipse(x + 3, y + r * .9, r * .8, r * .3, 0, 0, Math.PI * 2); ctx.fill()
      const gr = ctx.createRadialGradient(x - r * .32, y - r * .32, r * .05, x + r * .1, y + r * .1, r * 1.05)
      gr.addColorStop(0, '#607d8b'); gr.addColorStop(.55, '#37474f'); gr.addColorStop(1, '#1c313a')
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.22)'
      ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .28, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(x + r * .5, y - r * .5)
      ctx.quadraticCurveTo(x + r * 1.1, y - r * 1.2, x + r * .8, y - r * 1.65); ctx.stroke()
      const sx = x + r * .8 + Math.sin(ts * 3) * 3, sy = y - r * 1.65 - Math.abs(Math.sin(ts * 5)) * 5
      ctx.fillStyle = '#ff5722'; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill()
      ctx.font = `${r * .95}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('💣', x, y + 2)
    }

    function drawShape(o: Obj, ox: number, oy: number) {
      if (o.t === 'gold') drawGold(ox, oy, o.r)
      else if (o.t === 'diamond') drawDiam(ox, oy, o.r)
      else if (o.t === 'rock') drawRock(ox, oy, o.r, o.id)
      else if (o.t === 'bomb') drawBomb(ox, oy, o.r)
    }

    function drawObjs() {
      s.objs.forEach(o => { if (o.gone) return; ctx.save(); drawShape(o, o.x, o.y); ctx.restore() })
    }

    function drawHUD() {
      ctx.fillStyle = 'rgba(255,245,220,.9)'
      rrect(0, 0, CW, 44, 0, 0, 0, 14, 14); ctx.fill()
      ctx.strokeStyle = 'rgba(200,140,40,.25)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, 44); ctx.lineTo(CW, 44); ctx.stroke()
      ctx.font = '700 13px Nunito, sans-serif'; ctx.fillStyle = '#7a4f00'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('MẠNG:', 12, 22)
      for (let i = 0; i < LIVES; i++) {
        ctx.font = '20px Arial'; ctx.fillStyle = i < s.lives ? '#e74c3c' : '#d4b896'
        ctx.fillText('♥', 72 + i * 26, 23)
      }
      ctx.fillStyle = '#b85c00'; ctx.font = '800 17px Nunito, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`🪙 ${s.totalYPoints.toLocaleString('vi-VN')} Y-Point`, CW / 2, 22)
      ctx.fillStyle = 'rgba(100,60,0,.5)'; ctx.font = '600 12px Nunito, sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(s.pName, CW - 12, 22)
    }

    function drawParticles() {
      s.parts = s.parts.filter(p => p.life > 0)
      s.parts.forEach(p => {
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life / p.max)
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore()
        p.x += p.vx; p.y += p.vy; p.vy += .22; p.life--
      })
    }

    function drawConfetti() {
      s.confetti = s.confetti.filter(c => c.life > 0)
      s.confetti.forEach(c => {
        ctx.save()
        ctx.globalAlpha = Math.min(1, c.life / 20)
        ctx.translate(c.x, c.y); ctx.rotate(c.rot)
        ctx.fillStyle = c.c
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)
        ctx.restore()
        c.x += c.vx; c.y += c.vy; c.vy += .15; c.vx *= .99
        c.rot += c.rotS; c.life--
      })
    }

    function spawnConfetti(cx: number, cy: number) {
      const colors = ['#f4d03f','#e74c3c','#2ecc71','#3498db','#9b59b6','#e67e22','#1abc9c','#ff69b4']
      for (let i = 0; i < 80; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 10
        s.confetti.push({
          x: cx, y: cy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
          rot: Math.random() * Math.PI * 2, rotS: (Math.random() - .5) * .3,
          w: 6 + Math.random() * 8, h: 4 + Math.random() * 5,
          c: colors[Math.floor(Math.random() * colors.length)],
          life: 90 + Math.random() * 40, max: 130,
        })
      }
    }

    function burst(x: number, y: number, type: string, n = 14) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6
        s.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, r: 3 + Math.random() * 5,
          c: type === 'gold' ? `hsl(${38 + Math.random() * 25},100%,${55 + Math.random() * 30}%)` :
            type === 'diamond' ? `hsl(${185 + Math.random() * 30},100%,70%)` :
              type === 'bomb' ? `hsl(${Math.random() * 30},100%,55%)` : `hsl(28,45%,55%)`,
          life: 40 + Math.random() * 20, max: 60
        })
      }
    }

    // ── GAME LOGIC ──
    function collision() {
      const { x, y } = tipPos()
      for (const o of s.objs) {
        if (o.gone) continue
        if (Math.hypot(x - o.x, y - o.y) < o.r + 9) return o
      }
      return null
    }

    function triggerRedFlash() { s.redFlash = 30 }

    function handleHit(o: Obj) {
      o.gone = true; s.carried = o; s.gs = 'retracting'
      if (o.t === 'gold' || o.t === 'diamond') { snd('gold'); burst(o.x, o.y, o.t) }
      else if (o.t === 'rock') { snd('fail'); burst(o.x, o.y, 'rock', 10); s.shake = 12; triggerRedFlash() }
      else { snd('boom'); burst(o.x, o.y, 'bomb', 22); s.shake = 22; triggerRedFlash() }
    }

    function loseLife() {
      s.lives--; s.shake = 20; snd('boom'); triggerRedFlash()
      if (s.lives <= 0) setTimeout(() => endGame(), 350)
    }

    function checkDone() {
      if (s.objs.filter(o => !o.gone && (o.t === 'gold' || o.t === 'diamond')).length === 0)
        setTimeout(() => endGame(true), 500)
    }

    function rndQ() {
      const av = s.gameQuizzes.filter((_, i) => !s.usedQ.includes(i))
      if (!av.length) s.usedQ = []
      const pool = av.length ? av : s.gameQuizzes
      const idx = s.gameQuizzes.indexOf(pool[Math.floor(Math.random() * pool.length)])
      s.usedQ.push(idx)
      return s.gameQuizzes[idx]
    }

    function doQuiz(o: Obj) {
      s.qObj = o; s.qData = rndQ(); s.paused = true
      const ov = overlayRef.current!
      ov.innerHTML = `
        <div style="background:linear-gradient(145deg,#fffdf4,#fff8e1);border:2px solid rgba(200,140,40,.5);border-radius:24px;padding:32px 28px;max-width:500px;width:93%;box-shadow:0 20px 60px rgba(0,0,0,.18),0 0 40px rgba(255,200,0,.12);color:#2c1a00;text-align:center;">
          <div style="font-size:15px;font-weight:700;color:#c47a00;margin-bottom:4px;">${o.t === 'diamond' ? '💎 Kim Cương!' : '🥇 Bắt được Vàng!'} Trả lời đúng nhận</div>
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,210,0,.15);border:1px solid rgba(200,140,40,.3);border-radius:10px;padding:6px 16px;margin-bottom:14px;"><span>🪙</span><strong style="color:#b85c00;font-size:18px;">${s.qObj!.pts.toLocaleString('vi-VN')} Y-Point</strong></div>
          <p style="font-size:19px;font-weight:700;color:#1a0800;margin-bottom:20px;line-height:1.5;">${s.qData!.q}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${s.qData!.opts.map((op, i) => `
              <button id="opt${i}" onclick="window.__answer(${i})" style="padding:12px 14px;background:rgba(255,200,0,.08);border:1.5px solid rgba(200,140,40,.3);border-radius:12px;color:#2c1a00;font-size:14px;font-family:inherit;cursor:pointer;text-align:left;display:flex;align-items:center;gap:9px;" onmouseover="this.style.background='rgba(255,200,0,.2)'" onmouseout="this.style.background='rgba(255,200,0,.08)'">
                <span style="width:26px;height:26px;border-radius:50%;background:rgba(200,140,40,.18);color:#c47a00;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">${['A', 'B', 'C', 'D'][i]}</span>${op}
              </button>`).join('')}
          </div>
        </div>
      `
      ov.style.display = 'flex'
    }

    ;(window as any).__answer = (idx: number) => {
      const qData = s.qData!
      const correct = idx === qData.a
      const btn = document.getElementById('opt' + idx)
      if (btn) {
        btn.style.background = correct ? 'rgba(46,204,113,.35)' : 'rgba(231,76,60,.35)'
        ;(btn as HTMLButtonElement).style.borderColor = correct ? '#27ae60' : '#e74c3c'
      }
      setTimeout(() => {
        overlayRef.current!.style.display = 'none'
        if (correct) {
          snd('ok')
          const yp = s.qObj!.pts   // điểm gắn theo viên vàng, không theo câu hỏi
          s.score += yp
          s.totalYPoints += yp
          s.btcLog.push({ time: new Date().toLocaleTimeString('vi'), player: s.pName, q: qData.q, ans: qData.opts[idx], res: '✅ Đúng', prize: `${yp.toLocaleString('vi-VN')} Y-Point`, code: '', pts: yp })
          spawnConfetti(CW / 2, CH / 2)
          showPrize(yp)
        } else {
          s.btcLog.push({ time: new Date().toLocaleTimeString('vi'), player: s.pName, q: qData.q, ans: qData.opts[idx] ?? '—', res: '❌ Sai', prize: '—', code: '—', pts: 0 })
          loseLife()
          s.paused = false
          if (s.gs !== 'result') { s.gs = 'swinging'; checkDone() }
        }
        s.qObj = null; s.qData = null
      }, correct ? 400 : 600)
    }

    function showPrize(yp: number) {
      s.gs = 'prize'
      const label = `${yp.toLocaleString('vi-VN')} Y-Point`
      const ov = overlayRef.current!
      ov.innerHTML = `
        <div style="background:linear-gradient(145deg,#fffdf4,#fff8e1);border:2px solid rgba(200,140,40,.5);border-radius:24px;padding:36px 30px;max-width:420px;width:93%;box-shadow:0 20px 60px rgba(0,0,0,.18);color:#2c1a00;text-align:center;">
          <div style="font-size:28px;font-weight:800;background:linear-gradient(130deg,#f4a900,#e06000);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:20px;">CHÚC MỪNG!</div>
          <div style="display:inline-flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(255,210,0,.18),rgba(255,160,0,.12));border:1.5px solid rgba(200,140,40,.4);border-radius:16px;padding:16px 28px;margin-bottom:24px;">
            <span style="font-size:32px;">🪙</span>
            <span style="font-size:30px;font-weight:900;color:#b85c00;">${label}</span>
          </div><br/>
          <button onclick="window.__closePrize()" style="padding:13px 32px;background:linear-gradient(130deg,#27ae60,#1a7a44);border:none;border-radius:12px;color:#fff;font-size:17px;font-weight:700;font-family:inherit;cursor:pointer;">🎮 Tiếp tục chơi!</button>
        </div>
      `
      burst(CW / 2, CH / 2, 'gold', 22)
      ov.style.display = 'flex'
    }

    ;(window as any).__closePrize = () => {
      overlayRef.current!.style.display = 'none'
      s.paused = false; s.gs = 'swinging'
      checkDone()
    }

    function endGame(won?: boolean) {
      s.gs = 'result'

      // ── Gửi điểm lên Google Sheet backend (Timecode - Mã YD - Số điểm) ──
      // Mã YD dùng tên người chơi (s.pName) đã nhập ở màn hình bắt đầu.
      // scoreSaved chặn gửi trùng nếu endGame() lỡ bị gọi nhiều lần trong 1 ván.
      if (!s.scoreSaved) {
        s.scoreSaved = true
        saveScore(s.maYD || s.pName, s.totalYPoints)
      }

      const wins = s.btcLog.filter(e => e.res === '✅ Đúng')
      const ov = overlayRef.current!
      ov.innerHTML = `
        <div style="background:linear-gradient(145deg,#fffdf4,#fff8e1);border:2px solid rgba(200,140,40,.5);border-radius:24px;padding:32px 28px;max-width:600px;width:93%;box-shadow:0 20px 60px rgba(0,0,0,.18);color:#2c1a00;text-align:center;">
          <h2 style="color:${s.lives <= 0 ? '#e74c3c' : '#c47a00'};font-size:28px;margin-bottom:12px;">${s.lives <= 0 ? '💔 HẾT MẠNG' : won ? '🏆 CHIẾN THẮNG!' : '🏁 KẾT THÚC!'}</h2>
          <div style="display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(255,210,0,.18),rgba(255,160,0,.12));border:1.5px solid rgba(200,140,40,.4);border-radius:16px;padding:14px 24px;margin-bottom:12px;">
            <span style="font-size:26px;">🪙</span>
            <div style="text-align:left;">
              <div style="font-size:11px;color:#9a6600;font-weight:600;letter-spacing:.5px;">TỔNG Y-POINT NHẬN ĐƯỢC</div>
              <div style="font-size:30px;font-weight:900;color:#b85c00;">${s.totalYPoints.toLocaleString('vi-VN')} Y-Point</div>
            </div>
          </div>
          <div style="color:#7a5000;margin-bottom:16px;font-size:13px;">Người chơi: <strong style="color:#1a0800;">${s.pName}</strong> &nbsp;|&nbsp; Mạng còn: ${Math.max(0, s.lives)} ❤</div>
          ${wins.length > 0 ? `
          <div style="background:rgba(200,140,40,.08);border:1px solid rgba(200,140,40,.2);border-radius:12px;padding:14px;margin:14px 0;text-align:left;max-height:200px;overflow-y:auto;">
            <strong style="color:#c47a00;font-size:14px;">📋 Chi tiết Y-Point</strong>
            <table style="width:100%;border-collapse:collapse;font-size:12px;color:#5a3a00;margin-top:10px;">
              <thead><tr><th style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.2);text-align:left;color:#c47a00;">Giờ</th><th style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.2);text-align:left;color:#c47a00;">Câu hỏi</th><th style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.2);text-align:left;color:#c47a00;">🪙 Y-Point</th></tr></thead>
              <tbody>${wins.map(e => `<tr><td style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.1);">${e.time}</td><td style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.1);max-width:180px;">${e.q}</td><td style="padding:5px 8px;border-bottom:1px solid rgba(200,140,40,.1);font-weight:700;color:#b85c00;">${e.prize}</td></tr>`).join('')}</tbody>
            </table>
            <button onclick="window.__copyLog()" style="padding:8px 16px;background:rgba(200,140,40,.15);border:1px solid rgba(200,140,40,.3);border-radius:8px;color:#c47a00;font-size:13px;font-family:inherit;cursor:pointer;margin-top:10px;">📋 Copy dữ liệu cho BTC</button>
          </div>` : `<div style="color:#a07040;margin:14px 0;font-size:14px;">Chưa có Y-Point nào được nhận</div>`}
          <button onclick="window.__resetToStart()" style="padding:13px 28px;background:linear-gradient(130deg,#f4a900,#e06000);border:none;border-radius:12px;color:#fff;font-size:17px;font-weight:800;font-family:inherit;cursor:pointer;margin-top:10px;display:block;width:100%;">🔄 Chơi lại</button>
        </div>
      `
      ov.style.display = 'flex'
    }

    ;(window as any).__copyLog = () => {
      const txt = '=== BÁO CÁO ĐÀO VÀNG ONLINE ===\n' + s.btcLog.map(e =>
        `[${e.time}] ${e.player} | ${e.q} | TL: ${e.ans} | ${e.res} | ${e.prize}`
      ).join('\n')
      navigator.clipboard.writeText(txt).then(() => alert('✅ Đã copy!')).catch(() => prompt('Copy:', txt))
    }

    ;(window as any).__resetToStart = () => {
      overlayRef.current!.style.display = 'none'
      showStart()
    }

    function showStart() {
      s.gs = 'idle'
      const ov = overlayRef.current!
      ov.innerHTML = `
        <div style="background:linear-gradient(145deg,#fffdf4,#fff8e1);border:2px solid rgba(200,140,40,.55);border-radius:28px;padding:40px 36px;max-width:420px;width:93%;box-shadow:0 32px 80px rgba(0,0,0,.15),0 0 50px rgba(255,200,0,.1);text-align:center;">
          <span style="font-size:56px;display:block;margin-bottom:6px;">⛏️</span>
          <div style="font-size:30px;font-weight:800;background:linear-gradient(130deg,#f4a900,#e06000);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px;">ĐÀO VÀNG ONLINE</div>
          <div style="color:#9a7040;font-size:13px;margin-bottom:26px;">🏅 Bắt vàng · Trả lời câu đố · Nhận Y-Point!</div>

          <label style="font-size:13px;color:#7a4f00;margin-bottom:8px;display:block;text-align:left;">🪪 Mã nhân viên (Mã YD) <span style="color:#e74c3c;">*</span></label>
          <input id="ydInp" type="text" placeholder="VD: YD12345" maxlength="20"
            style="width:100%;padding:12px 16px;background:rgba(255,255,255,.7);border:1.5px solid rgba(200,140,40,.4);border-radius:12px;color:#1a0800;font-size:16px;font-family:inherit;outline:none;margin-bottom:6px;box-sizing:border-box;text-transform:uppercase;letter-spacing:.5px;"
            onfocus="this.style.borderColor='#f4a900'" onblur="this.style.borderColor='rgba(200,140,40,.4)'"
            oninput="this.value=this.value.toUpperCase()"
            onkeydown="if(event.key==='Enter')window.__startGame()" />
          <div id="ydErr" style="color:#e74c3c;font-size:12px;min-height:18px;margin-bottom:14px;text-align:left;"></div>

          <button id="startBtn" onclick="window.__startGame()"
            style="width:100%;padding:14px;background:linear-gradient(130deg,#f4a900,#e06000);border:none;border-radius:14px;font-size:20px;font-weight:800;font-family:inherit;color:#fff;cursor:pointer;box-shadow:0 8px 28px rgba(244,169,0,.35);display:flex;align-items:center;justify-content:center;gap:10px;">
            <span id="startBtnIcon">🎮</span>
            <span id="startBtnText">BẮT ĐẦU CHƠI!</span>
          </button>
        </div>
      `
      ov.style.display = 'flex'
      // focus auto
      setTimeout(() => (document.getElementById('ydInp') as HTMLInputElement)?.focus(), 80)
    }

    ;(window as any).__startGame = async () => {
      const inp    = document.getElementById('ydInp')    as HTMLInputElement
      const errEl  = document.getElementById('ydErr')
      const btn    = document.getElementById('startBtn') as HTMLButtonElement
      const btnIcon = document.getElementById('startBtnIcon')
      const btnText = document.getElementById('startBtnText')

      const maYD = inp?.value.trim().toUpperCase() ?? ''

      // ── validate local ──
      if (!maYD) {
        if (inp)   { inp.style.borderColor = '#e74c3c'; inp.focus() }
        if (errEl) errEl.textContent = '⚠️ Vui lòng nhập Mã YD trước khi bắt đầu!'
        return
      }

      // ── loading state ──
      if (btn) btn.disabled = true
      if (btnIcon) btnIcon.textContent = '⏳'
      if (btnText) btnText.textContent = 'Đang xác thực...'
      if (errEl)   errEl.textContent = ''

      // ── gọi API validate ──
      const nvResult = await validateMaYD(maYD)

      // thất bại → reset về form, hiện lỗi cụ thể
      if (!nvResult || 'error' in nvResult) {
        const msg = nvResult && 'error' in nvResult
          ? nvResult.error
          : 'Mã YD không tồn tại trong hệ thống'
        if (inp) { inp.style.borderColor = '#e74c3c'; inp.focus(); inp.select() }
        if (errEl) errEl.innerHTML =
          '❌ <strong>' + msg + '</strong>' +
          (msg.includes('tồn tại') ? '<br><span style="font-size:11px;color:#b04040;">Vui lòng kiểm tra lại hoặc liên hệ HR.</span>' : '')
        if (btn)     btn.disabled = false
        if (btnIcon) btnIcon.textContent = '🎮'
        if (btnText) btnText.textContent = 'BẮT ĐẦU CHƠI!'
        return
      }

      const nv = nvResult
      // ── xác thực thành công ──
      s.pName = nv.ten || nv.maYD   // HUD hiện tên, log ghi maYD
      s.maYD  = nv.maYD
      overlayRef.current!.style.display = 'none'

      s.lives = LIVES; s.score = 0; s.totalYPoints = 0
      s.objs = makeObjs(CW, CH, OX, MAX_ROPE); s.parts = []; s.confetti = []; s.btcLog = []; s.usedQ = []
      s.ang = 0; s.angDir = 1; s.rope = MIN_ROPE; s.carried = null; s.paused = false; s.shake = 0; s.redFlash = 0
      s.gameQuizzes = shuffle(QUESTION_BANK).slice(0, 10)
      s.bgSeed = Date.now() | 0
      s.scoreSaved = false
      s.gs = 'swinging'
    }

    // ── MAIN LOOP ──
    let rafId: number
    function loop() {
      rafId = requestAnimationFrame(loop)  // schedule next frame first so a throw never stops the loop
      ctx.save()
      try {
        if (s.shake > .5) ctx.translate((Math.random() - .5) * s.shake, (Math.random() - .5) * s.shake)
        ctx.clearRect(-30, -30, CW + 60, CH + 60)
        drawBG()

        if (!s.paused) {
          if (s.gs === 'idle' || s.gs === 'swinging') {
            s.ang += SWING_SPD * s.angDir
            if (s.ang > MAX_SWING) { s.ang = MAX_SWING; s.angDir = -1 }
            if (s.ang < -MAX_SWING) { s.ang = -MAX_SWING; s.angDir = 1 }
          } else if (s.gs === 'extending') {
            s.rope += EXT_SPD
            const { y } = tipPos()
            if (y >= CH - 8 || s.rope >= MAX_ROPE) { s.rope = Math.min(s.rope, MAX_ROPE); s.gs = 'retracting' }
            const h = collision(); if (h) handleHit(h)
          } else if (s.gs === 'retracting') {
            const spd = s.carried && (s.carried.t === 'gold' || s.carried.t === 'diamond')
              ? (s.carried.r > 35 ? RET_HEAVY : RET_HEAVY + 1.2) : RET_EMPTY
            s.rope -= spd
            if (s.rope <= MIN_ROPE) {
              s.rope = MIN_ROPE
              const o = s.carried; s.carried = null
              if (!o) { s.gs = 'swinging' }
              else if (o.t === 'gold' || o.t === 'diamond') { s.gs = 'quiz'; doQuiz(o) }
              else { loseLife(); s.gs = s.lives > 0 ? 'swinging' : 'result' }
            }
          }
        }

        if (s.shake > .3) s.shake *= .8; else s.shake = 0

        drawObjs(); drawClaw(); drawRabbit(); drawParticles(); drawConfetti()

        // Red flash overlay
        if (s.redFlash > 0) {
          ctx.fillStyle = `rgba(200,0,0,${(s.redFlash / 30) * 0.38})`
          ctx.fillRect(0, 0, CW, CH)
          s.redFlash--
        }

        if (s.gs !== 'idle') drawHUD()
      } catch (e) {
        console.error('[gold-game] loop error:', e)
      }
      ctx.restore()
    }

    rafId = requestAnimationFrame(loop)

    const handleClick = () => { if (s.gs === 'swinging') s.gs = 'extending' }
    canvas.addEventListener('click', handleClick)
    showStart()

    return () => {
      cancelAnimationFrame(rafId)
      canvas.removeEventListener('click', handleClick)
      ;['__answer','__closePrize','__resetToStart','__copyLog','__startGame'].forEach(k => delete (window as any)[k])
    }
  }, [snd])

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#87ceeb' }}>
      <style>{`
        * { box-sizing: border-box; font-family: 'Nunito', sans-serif; }
        @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-8px); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(200,140,40,.3); border-radius: 2px; }
      `}</style>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
      />
      <div
        ref={overlayRef}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,248,220,.65)',
          backdropFilter: 'blur(10px)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60,
        }}
      />
      <p style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(100,60,0,.4)', fontSize: 12, pointerEvents: 'none', margin: 0,
        fontFamily: 'system-ui, sans-serif',
      }}>
        🖱️ Click để thả móc câu vàng
      </p>
    </div>
  )
}
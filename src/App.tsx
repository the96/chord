import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ALL_KEYS,
  transposeProgression,
  romanToChords,
  chordsToRoman,
  parseChordOcts,
  parseRomanOcts,
  octToMarker,
  shiftOctInInput,
} from './lib/chord-utils'
import { lookupChord } from './lib/guitar-chords'
import { ChordDiagram } from './components/ChordDiagram'
import { playChord, chordToMidi, createProgressionPlayer, setVolume, getVolume } from './lib/audio'
import type { ProgressionPlayer, PlayerState } from './lib/audio'
import { addHistory } from './lib/history'
import { History } from './components/History'
import type { HistoryEntry } from './lib/history'

type InputMode = 'chord' | 'degree'
type LayoutMode = 'wrap' | 'horizontal'

type AppParams = { mode: InputMode; input: string; fromKey: string; toKey: string; guitar: boolean; rep: number; bpm: number }

const DEFAULT_BPM = 120

function clampInt(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : fallback
}

function readParams(): AppParams {
  const p = new URLSearchParams(window.location.search)
  return {
    mode: p.get('mode') === 'degree' ? 'degree' : 'chord',
    input: p.get('q') ?? '',
    fromKey: ALL_KEYS.includes(p.get('from') ?? '') ? p.get('from')! : 'C',
    toKey: ALL_KEYS.includes(p.get('to') ?? '') ? p.get('to')! : 'G',
    guitar: p.get('guitar') === '1',
    rep: clampInt(Number(p.get('rep')), 1, 4, 1),
    bpm: clampInt(Number(p.get('bpm')), 40, 240, DEFAULT_BPM),
  }
}

function writeParams(state: AppParams) {
  const p = new URLSearchParams()
  if (state.mode !== 'chord') p.set('mode', state.mode)
  if (state.input) p.set('q', state.input)
  if (state.fromKey !== 'C') p.set('from', state.fromKey)
  if (state.toKey !== 'G') p.set('to', state.toKey)
  if (state.guitar) p.set('guitar', '1')
  if (state.rep !== 1) p.set('rep', String(state.rep))
  if (state.bpm !== DEFAULT_BPM) p.set('bpm', String(state.bpm))
  const qs = p.toString()
  const url = qs ? `?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

function App() {
  const init = readParams()
  const [mode, setMode] = useState<InputMode>(init.mode)
  const [input, setInput] = useState(init.input)
  const [fromKey, setFromKey] = useState(init.fromKey)
  const [toKey, setToKey] = useState(init.toKey)
  const [showDiagrams, setShowDiagrams] = useState(init.guitar)
  const [playingIdx, setPlayingIdx] = useState(-1)
  const [playerState, setPlayerState] = useState<PlayerState>('stopped')
  const playerRef = useRef<ProgressionPlayer | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pageExpanded, setPageExpanded] = useState(false)
  const [bpm, setBpm] = useState(init.bpm)
  const [muted, setMuted] = useState(false)
  const [layout, setLayout] = useState<LayoutMode>('wrap')
  const [loop, setLoop] = useState(false)
  const [repeats, setRepeats] = useState(init.rep)
  const [volume, setVolumeState] = useState(() => getVolume())

  // Refs for auto-scroll
  const chordRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    writeParams({ mode, input, fromKey, toKey, guitar: showDiagrams, rep: repeats, bpm })
  }, [mode, input, fromKey, toKey, showDiagrams, repeats, bpm])

  // Auto-scroll: position current chord near the TOP of the scroll container
  useEffect(() => {
    if (playingIdx < 0) return
    const el = chordRefs.current[playingIdx]
    const container = scrollContainerRef.current
    if (!el || !container) return

    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const offsetInContainer = elRect.top - containerRect.top + container.scrollTop
    const targetScroll = offsetInContainer - containerRect.height * 0.2
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  }, [playingIdx])

  const getResult = useCallback(() => {
    if (!input.trim()) return null
    if (mode === 'chord') {
      return {
        chords: transposeProgression(input, fromKey, toKey),
        degrees: chordsToRoman(input, fromKey),
        octs: parseChordOcts(input),
      }
    } else {
      return { chords: romanToChords(input, toKey), degrees: null, octs: parseRomanOcts(input) }
    }
  }, [input, fromKey, toKey, mode])

  const result = getResult()

  // Stop player when result changes
  useEffect(() => {
    if (playerRef.current) { playerRef.current.stop(); playerRef.current = null; setPlayerState('stopped') }
  }, [input, fromKey, toKey, mode])

  const handleSwapKeys = () => { setFromKey(toKey); setToKey(fromKey) }

  const handlePlayChord = (chordName: string, oct: number) => {
    if (muted) return
    const midis = chordToMidi(chordName, oct)
    if (midis.length) playChord(midis)
  }

  const handlePlay = () => {
    if (!result) return
    if (playerRef.current && playerState === 'paused') {
      playerRef.current.play()
      setPlayerState('playing')
      return
    }
    // New player
    playerRef.current?.stop()
    const player = createProgressionPlayer(result.chords, bpm, (idx) => {
      setPlayingIdx(idx)
      if (idx === -1) setPlayerState('stopped')
    }, { mute: muted, loop, octShifts: result.octs, repeatsPerChord: repeats })
    playerRef.current = player
    player.play()
    setPlayerState('playing')
  }

  const handleShiftOct = (chordIndex: number, delta: number) => {
    setInput(prev => shiftOctInInput(prev, mode, chordIndex, delta))
  }

  const handlePause = () => {
    playerRef.current?.pause()
    setPlayerState('paused')
  }

  const handleStop = () => {
    playerRef.current?.stop()
    playerRef.current = null
    setPlayerState('stopped')
  }

  const handleSave = () => {
    if (!input.trim()) return
    const name = window.prompt('名前（メモ）を入力', input) ?? ''
    addHistory({ name, mode, input, fromKey, toKey, guitar: showDiagrams, repeats, bpm })
  }

  const handleRestore = (entry: HistoryEntry) => {
    setMode(entry.mode); setInput(entry.input); setFromKey(entry.fromKey); setToKey(entry.toKey)
    setShowDiagrams(entry.guitar ?? false)
    setRepeats(entry.repeats ?? 1)
    setBpm(entry.bpm ?? DEFAULT_BPM)
  }

  const presets = [
    { label: 'I - V - vi - IV (カノン進行)', value: 'I V vi IV' },
    { label: 'I - IV - V - I', value: 'I IV V I' },
    { label: 'ii - V - I (ツーファイブ)', value: 'IIm7 V7 Imaj7' },
    { label: 'I - vi - IV - V (50s進行)', value: 'I vi IV V' },
    { label: 'vi - IV - I - V', value: 'vi IV I V' },
    { label: 'カノン進行フル', value: 'I V vi iii IV I IV V' },
    { label: 'IV - V - iii - vi (王道進行)', value: 'IV V iii vi' },
    { label: 'I - IV - vi - V (小室進行)', value: 'VI IV V I' },
  ]

  const layoutContainerClass = layout === 'horizontal'
    ? 'flex flex-nowrap overflow-x-auto gap-4 pb-2 items-start'
    : showDiagrams
      ? 'flex flex-wrap justify-center gap-4'
      : 'flex flex-wrap gap-3'

  const chordItemClass = (isPlaying: boolean) => {
    const base = 'cursor-pointer rounded-lg shrink-0 p-2 transition-colors'
    const highlight = isPlaying
      ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-2 ring-indigo-400'
      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
    return `${base} ${highlight}`
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className={`mx-auto px-4 py-8 transition-all ${pageExpanded ? 'max-w-full' : 'max-w-2xl'}`}>
        <h1 className="text-3xl font-bold text-center mb-2">ReKey</h1>
        <p className="text-center text-gray-500 dark:text-gray-400 mb-8">コード進行を指定のキーに変換</p>

        {/* Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-lg bg-gray-200 dark:bg-gray-800 p-1">
            <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'chord' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`} onClick={() => setMode('chord')}>コード名で入力</button>
            <button className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'degree' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`} onClick={() => setMode('degree')}>度数(ローマ数字)で入力</button>
          </div>
        </div>

        {/* Key Selection */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-5 mb-4">
          <div className="flex items-center gap-3">
            {mode === 'chord' && (
              <>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">元のキー</label>
                  <select value={fromKey} onChange={e => setFromKey(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-lg font-mono">
                    {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <button onClick={handleSwapKeys} className="mt-5 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="キーを入れ替え">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </button>
              </>
            )}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{mode === 'chord' ? '変換先のキー' : 'キー'}</label>
              <select value={toKey} onChange={e => setToKey(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-lg font-mono">
                {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-5 mb-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {mode === 'chord' ? 'コード進行 (例: C Am F G)' : '度数 (例: I V vi IV)'}
          </label>
          <div className="relative">
            <input type="text" value={input}
              onChange={e => setInput(e.target.value.replace(/[|｜]/g, ' ').replace(/ {2,}/g, ' '))}
              placeholder={mode === 'chord' ? 'C Am F G' : 'I V vi IV'}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 pr-12 text-lg font-mono placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
            {input.trim() && (
              <button onClick={handleSave} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="履歴に保存">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Presets */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">よく使うコード進行:</p>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p.value} onClick={() => { setInput(p.value); if (mode === 'chord') setMode('degree') }}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors border border-gray-200 dark:border-gray-700">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Result */}
        {result && result.chords.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400">変換結果 — Key: {toKey}</h2>
              <button onClick={() => setShowDiagrams(v => !v)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showDiagrams ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                Guitar
              </button>
            </div>

            {/* Sticky playback controls */}
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Play/Pause/Stop */}
                <div className="flex items-center gap-1">
                  {playerState === 'playing' ? (
                    <button onClick={handlePause} className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors" title="一時停止">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                    </button>
                  ) : (
                    <button onClick={handlePlay} className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors" title={playerState === 'paused' ? '再開' : '再生'}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                  )}
                  <button onClick={handleStop} disabled={playerState === 'stopped'}
                    className={`p-1.5 rounded-lg transition-colors ${playerState === 'stopped' ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`} title="停止">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                  </button>
                </div>

                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

                {/* Mute */}
                <button onClick={() => setMuted(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${muted ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  title={muted ? '音あり再生に切り替え' : '音なし再生'}>
                  {muted ? 'Mute ON' : 'Mute'}
                </button>

                {/* Loop */}
                <button onClick={() => setLoop(v => !v)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${loop ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  title={loop ? 'ループ再生OFF' : 'ループ再生ON'}>
                  Loop
                </button>

                {/* Repeats per chord */}
                <select value={repeats} onChange={e => setRepeats(Number(e.target.value))}
                  className="text-xs px-1.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 font-mono"
                  title="各コードの繰り返し回数">
                  <option value={1}>×1</option>
                  <option value={2}>×2</option>
                  <option value={3}>×3</option>
                  <option value={4}>×4</option>
                </select>

                {/* BPM */}
                <div className="flex items-center gap-1.5">
                  <input type="range" min={40} max={240} step={5} value={bpm}
                    onChange={e => setBpm(Number(e.target.value))}
                    className="w-16 h-1 accent-indigo-500" />
                  <span className="text-xs font-mono text-gray-500 w-7">{bpm}</span>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6l-4 4H4v4h4l4 4V6z" /></svg>
                  <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)}
                    onChange={e => { const v = Number(e.target.value) / 100; setVolumeState(v); setVolume(v) }}
                    className="w-14 h-1 accent-indigo-500" />
                </div>

                {/* Layout switcher */}
                <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden ml-auto">
                  {([['wrap', 'Wrap'], ['horizontal', 'Scroll']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setLayout(val)}
                      className={`text-xs px-2 py-1 transition-colors ${layout === val ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrollable chord display area */}
            <div ref={scrollContainerRef}
              className={`px-5 py-4 overflow-auto ${layout === 'horizontal' ? 'max-h-none' : 'max-h-[60vh]'}`}>
              <div className={layoutContainerClass}>
                {result.chords.map((chord, i) => {
                  const isPlaying = playingIdx === i
                  const chordData = showDiagrams ? lookupChord(chord) : null
                  const oct = result.octs[i] ?? 0
                  return (
                    <div key={i}
                      ref={el => { chordRefs.current[i] = el }}
                      className={chordItemClass(isPlaying)}
                      onClick={() => handlePlayChord(chord, oct)}>
                      {showDiagrams ? (
                        chordData ? (
                          <ChordDiagram name={chord} positions={chordData.positions} degree={result.degrees?.[i]} />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400">{chord}</span>
                            {result.degrees?.[i] && <span className="text-xs text-gray-400 font-mono">{result.degrees[i]}</span>}
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-1 px-1">
                          <span className="text-2xl font-mono font-bold text-indigo-600 dark:text-indigo-400">{chord}</span>
                          {result.degrees?.[i] && <span className="text-xs text-gray-400 font-mono">{result.degrees[i]}</span>}
                        </div>
                      )}
                      <OctControl oct={oct} onShift={delta => handleShiftOct(i, delta)} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <CopyButton text={result.chords.map((c, i) => c + octToMarker(result.octs[i] ?? 0)).join(' | ')} />
              <button onClick={handleSave}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Save
              </button>
            </div>

            {/* All keys table */}
            <div className="px-5 pb-5">
              <AllKeysTable input={input} mode={mode} fromKey={fromKey} currentToKey={toKey} onSelectKey={setToKey} />
            </div>
          </div>
        )}
      </div>

      {/* Fixed buttons - top right */}
      <div className="fixed right-4 top-4 z-30 flex gap-2">
        <button onClick={() => setPageExpanded(v => !v)}
          className="p-2.5 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          title={pageExpanded ? '通常表示' : '横幅いっぱいに表示'}>
          {pageExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 11l5 5m0 0v-4m0 4h-4" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
          )}
        </button>
        <button onClick={() => setHistoryOpen(true)}
          className="p-2.5 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          title="履歴">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
      </div>

      <History open={historyOpen} onClose={() => setHistoryOpen(false)} onRestore={handleRestore} />
    </div>
  )
}

function OctControl({ oct, onShift }: { oct: number; onShift: (delta: number) => void }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const label = oct > 0 ? `+${oct}` : oct < 0 ? `${oct}` : '±0'
  const accent = oct > 0
    ? 'text-indigo-600 dark:text-indigo-400'
    : oct < 0
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-400 dark:text-gray-500'
  return (
    <div className="flex items-center justify-center gap-0.5 mt-1" onClick={stop}>
      <button onClick={(e) => { stop(e); onShift(-1) }} disabled={oct <= -2}
        className="w-5 h-5 rounded text-xs leading-none text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
        title="オクターブ下げ">−</button>
      <span className={`text-[10px] font-mono w-7 text-center ${accent}`}>oct{label}</span>
      <button onClick={(e) => { stop(e); onShift(1) }} disabled={oct >= 2}
        className="w-5 h-5 rounded text-xs leading-none text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
        title="オクターブ上げ">+</button>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <button onClick={handleCopy} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function AllKeysTable({ input, mode, fromKey, currentToKey, onSelectKey }: {
  input: string; mode: InputMode; fromKey: string; currentToKey: string; onSelectKey: (key: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!expanded) return <button onClick={() => setExpanded(true)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">全キーで表示</button>
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">全キー一覧</h3>
        <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {ALL_KEYS.map(key => {
              const chords = mode === 'chord' ? transposeProgression(input, fromKey, key) : romanToChords(input, key)
              return (
                <tr key={key} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${key === currentToKey ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`} onClick={() => onSelectKey(key)}>
                  <td className="py-1.5 px-2 font-mono font-bold text-gray-500 w-10">{key}</td>
                  <td className="py-1.5 px-2 font-mono">{chords.join(' | ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App

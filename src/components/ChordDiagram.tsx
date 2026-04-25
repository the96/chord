import { useState } from 'react'
import type { ChordPosition } from '../lib/guitar-chords'

interface ChordDiagramProps {
  name: string
  positions: ChordPosition[]
  degree?: string
}

const STRINGS = 6
const FRETS = 5
const STRING_SPACING = 24
const FRET_SPACING = 28
const TOP_PADDING = 24
const LEFT_PADDING = 28
const DOT_RADIUS = 8
const DIAGRAM_WIDTH = LEFT_PADDING + (STRINGS - 1) * STRING_SPACING + 20
const DIAGRAM_HEIGHT = TOP_PADDING + FRETS * FRET_SPACING + 16

export function ChordDiagram({ name, positions, degree }: ChordDiagramProps) {
  const [posIdx, setPosIdx] = useState(0)
  const pos = positions[posIdx]

  const stringX = (s: number) => LEFT_PADDING + s * STRING_SPACING
  const fretY = (f: number) => TOP_PADDING + f * FRET_SPACING

  const isFirstPosition = pos.baseFret === 1

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Chord name */}
      <span className="text-lg font-mono font-bold text-indigo-600 dark:text-indigo-400">
        {name}
      </span>
      {degree && (
        <span className="text-xs text-gray-400 font-mono">{degree}</span>
      )}

      <svg
        width={DIAGRAM_WIDTH}
        height={DIAGRAM_HEIGHT}
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        className="select-none"
      >
        {/* Nut (thick top bar) or fret number */}
        {isFirstPosition ? (
          <rect
            x={stringX(0)}
            y={fretY(0) - 3}
            width={(STRINGS - 1) * STRING_SPACING}
            height={5}
            rx={1}
            className="fill-gray-800 dark:fill-gray-200"
          />
        ) : (
          <text
            x={stringX(0) - 16}
            y={fretY(0) + FRET_SPACING / 2 + 5}
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={12}
            fontFamily="monospace"
            textAnchor="middle"
          >
            {pos.baseFret}
          </text>
        )}

        {/* Fret lines (horizontal) */}
        {Array.from({ length: FRETS + 1 }, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={stringX(0)}
            y1={fretY(i)}
            x2={stringX(STRINGS - 1)}
            y2={fretY(i)}
            className="stroke-gray-300 dark:stroke-gray-600"
            strokeWidth={1}
          />
        ))}

        {/* String lines (vertical) */}
        {Array.from({ length: STRINGS }, (_, i) => (
          <line
            key={`str-${i}`}
            x1={stringX(i)}
            y1={fretY(0)}
            x2={stringX(i)}
            y2={fretY(FRETS)}
            className="stroke-gray-300 dark:stroke-gray-600"
            strokeWidth={1}
          />
        ))}

        {/* Barre */}
        {pos.barres.map((barre, i) => {
          // Find the range of strings for this barre
          const barreStrings = pos.frets
            .map((f, si) => (f === barre ? si : -1))
            .filter(si => si >= 0)
          if (barreStrings.length < 2) return null
          const minStr = Math.min(...barreStrings)
          const maxStr = Math.max(...barreStrings)
          return (
            <rect
              key={`barre-${i}`}
              x={stringX(minStr) - DOT_RADIUS}
              y={fretY(barre) - FRET_SPACING / 2 - DOT_RADIUS}
              width={(maxStr - minStr) * STRING_SPACING + DOT_RADIUS * 2}
              height={DOT_RADIUS * 2}
              rx={DOT_RADIUS}
              className="fill-gray-700 dark:fill-gray-300"
            />
          )
        })}

        {/* Finger dots, open strings, muted strings */}
        {pos.frets.map((fret, stringIdx) => {
          const x = stringX(stringIdx)
          if (fret === -1) {
            // Muted string (X)
            return (
              <text
                key={stringIdx}
                x={x}
                y={fretY(0) - 8}
                textAnchor="middle"
                fontSize={12}
                fontWeight="bold"
                className="fill-gray-400 dark:fill-gray-500"
              >
                x
              </text>
            )
          }
          if (fret === 0) {
            // Open string (O)
            return (
              <circle
                key={stringIdx}
                cx={x}
                cy={fretY(0) - 10}
                r={5}
                className="fill-none stroke-gray-500 dark:stroke-gray-400"
                strokeWidth={1.5}
              />
            )
          }
          // Pressed fret
          const y = fretY(fret) - FRET_SPACING / 2
          const isBarre = pos.barres.includes(fret)
          return (
            <g key={stringIdx}>
              {!isBarre && (
                <circle
                  cx={x}
                  cy={y}
                  r={DOT_RADIUS}
                  className="fill-gray-700 dark:fill-gray-300"
                />
              )}
              {pos.fingers[stringIdx] > 0 && (
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight="bold"
                  className={isBarre
                    ? 'fill-white dark:fill-gray-900'
                    : 'fill-white dark:fill-gray-900'
                  }
                >
                  {pos.fingers[stringIdx]}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Position selector */}
      {positions.length > 1 && (
        <div className="flex items-center gap-1">
          {positions.map((_, i) => (
            <button
              key={i}
              onClick={() => setPosIdx(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === posIdx
                  ? 'bg-indigo-500'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
              }`}
              aria-label={`Position ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import type { HistoryEntry } from '../lib/history'
import { getHistory, removeHistory, updateHistoryName, clearHistory } from '../lib/history'

interface HistoryProps {
  open: boolean
  onClose: () => void
  onRestore: (entry: HistoryEntry) => void
}

export function History({ open, onClose, onRestore }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const editRef = useRef<HTMLInputElement>(null)

  // Refresh on open
  useEffect(() => {
    if (open) setEntries(getHistory())
  }, [open])

  // Focus edit input
  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  const refresh = () => setEntries(getHistory())

  const handleDelete = (id: string) => {
    removeHistory(id)
    refresh()
  }

  const handleClearAll = () => {
    clearHistory()
    refresh()
  }

  const handleRename = (id: string, name: string) => {
    updateHistoryName(id, name)
    setEditingId(null)
    refresh()
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${h}:${m}`
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-xl z-50 transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold">履歴</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto h-[calc(100%-7rem)] px-3 py-2">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">保存された履歴はありません</p>
          ) : (
            <div className="space-y-0.5">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-1.5 rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {/* Clickable main area */}
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => { onRestore(entry); onClose() }}
                  >
                    {editingId === entry.id ? (
                      <input
                        ref={editRef}
                        defaultValue={entry.name}
                        className="w-full bg-transparent border-b border-indigo-400 text-sm font-medium outline-none"
                        onClick={e => e.stopPropagation()}
                        onBlur={e => handleRename(entry.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(entry.id, e.currentTarget.value)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate block">
                        {entry.name || entry.input}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 font-mono">
                      {entry.mode === 'chord' ? `${entry.fromKey} → ${entry.toKey}` : `Key: ${entry.toKey}`}
                      {' '}
                      <span className="text-gray-300 dark:text-gray-600">{formatDate(entry.createdAt)}</span>
                    </span>
                  </button>

                  {/* Edit name */}
                  <button
                    onClick={() => setEditingId(entry.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                    title="名前を編集"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                    title="削除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={handleClearAll}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              全て削除
            </button>
          </div>
        )}
      </div>
    </>
  )
}

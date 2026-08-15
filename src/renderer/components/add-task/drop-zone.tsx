import { transport } from '@renderer/lib/transport'
import { cn } from '@renderer/lib/utils'
import { Commands } from '@shared/protocol/commands'
import type { TorrentMeta } from '@shared/types/torrent'
import { Upload } from 'lucide-react'
import { type DragEvent, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchTorrentItem } from './batch-torrent-review'

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  }
  return btoa(chunks.join(''))
}

async function parseTorrentFile(
  file: File
): Promise<{ base64: string; meta: TorrentMeta }> {
  const base64 = await fileToBase64(file)
  const meta = (await transport.invoke(Commands.ParseTorrent, {
    base64,
  })) as TorrentMeta
  return { base64, meta }
}

export function DropZone({
  onBatchParsed,
}: {
  onBatchParsed?: (items: BatchTorrentItem[]) => void
}) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const importFiles = useCallback(
    async (files: File[]) => {
      const torrents = files.filter((f) =>
        f.name.toLowerCase().endsWith('.torrent')
      )
      if (torrents.length === 0) return

      setBusy(true)
      try {
        const items: BatchTorrentItem[] = []
        const seen = new Set<string>()
        let errorSeq = 0
        for (const file of torrents) {
          try {
            const { base64, meta } = await parseTorrentFile(file)
            if (seen.has(meta.infoHash)) continue
            seen.add(meta.infoHash)
            items.push({
              status: 'ready',
              base64,
              meta,
              displayName: meta.name,
              selectedFiles: meta.files.map((f) => f.index),
              selected: true,
            })
          } catch {
            items.push({
              status: 'error',
              fileName: file.name,
              id: `error-${errorSeq++}`,
              selected: false,
            })
          }
        }
        onBatchParsed?.(items)
      } finally {
        setBusy(false)
      }
    },
    [onBatchParsed]
  )

  const handleDrop = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault()
      setDragOver(false)
      if (busy) return
      void importFiles(Array.from(e.dataTransfer.files))
    },
    [busy, importFiles]
  )

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed transition-colors',
          dragOver ? 'border-ring bg-muted' : 'border-border hover:border-ring',
          busy && 'pointer-events-none opacity-60'
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {busy ? t('task.add.batchImporting') : t('task.add.dropTorrent')}{' '}
          <span className="font-medium text-foreground underline">
            {t('task.add.browse')}
          </span>
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".torrent"
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0) void importFiles(files)
          e.target.value = ''
        }}
      />
    </>
  )
}

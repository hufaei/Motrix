import { DirectoryPicker } from '@renderer/components/desktop-kit/directory-picker'
import { FileList } from '@renderer/components/file-list/file-list'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible'
import { Input } from '@renderer/components/ui/input'
import { formatBytes } from '@renderer/lib/format'
import { transport } from '@renderer/lib/transport'
import { cn } from '@renderer/lib/utils'
import { usePlatformServices } from '@renderer/platform/services'
import { Commands } from '@shared/protocol/commands'
import { Queries } from '@shared/protocol/queries'
import type { AddTaskFormValues } from '@shared/schemas/add-task'
import type { TorrentMeta } from '@shared/types/torrent'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

export type BatchTorrentItem =
  | {
      status: 'ready'
      base64: string
      meta: TorrentMeta
      displayName: string
      selectedFiles: number[]
      selected: boolean
    }
  | {
      status: 'error'
      fileName: string
      id: string
      selected: false
    }

interface BatchTorrentReviewProps {
  items: BatchTorrentItem[]
  onCancel: () => void
  onDone: () => void
}

function parseLimit(value: string, integer = false): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return undefined
  if (integer && !Number.isInteger(n)) return undefined
  return n
}

export function BatchTorrentReview({
  items: initialItems,
  onCancel,
  onDone,
}: BatchTorrentReviewProps) {
  const { t } = useTranslation()
  const { getValues } = useFormContext<AddTaskFormValues>()
  const platform = usePlatformServices()
  const [items, setItems] = useState<BatchTorrentItem[]>(initialItems)
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {}
    if (initialItems.length === 1) initial[0] = true
    return initial
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dlLimit, setDlLimit] = useState('')
  const [ulLimit, setUlLimit] = useState('')
  const [seedRatio, setSeedRatio] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedCount = items.filter((i) => i.selected).length
  const readyItems = items.filter((i) => i.status === 'ready')
  const allSelected =
    readyItems.length > 0 && readyItems.every((i) => i.selected)
  const someSelected = readyItems.some((i) => i.selected) && !allSelected
  const downloadableCount = items.filter(
    (i) => i.status === 'ready' && i.selected && i.selectedFiles.length > 0
  ).length

  const toggleItem = useCallback((index: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index || it.status !== 'ready') return it
        return { ...it, selected: !it.selected }
      })
    )
  }, [])

  const toggleAll = useCallback(() => {
    setItems((prev) => {
      const ready = prev.filter((it) => it.status === 'ready')
      const allSelected = ready.length > 0 && ready.every((it) => it.selected)
      return prev.map((it) =>
        it.status === 'ready' ? { ...it, selected: !allSelected } : it
      )
    })
  }, [])

  const toggleExpanded = useCallback((index: number) => {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }))
  }, [])

  const updateDisplayName = useCallback((index: number, name: string) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index && it.status === 'ready' ? { ...it, displayName: name } : it
      )
    )
  }, [])

  const updateSelectedFiles = useCallback(
    (index: number, indices: number[]) => {
      setItems((prev) =>
        prev.map((it, i) =>
          i === index && it.status === 'ready'
            ? { ...it, selectedFiles: indices }
            : it
        )
      )
    },
    []
  )

  const handleConfirm = useCallback(async () => {
    const ready = items.filter(
      (it) =>
        it.status === 'ready' && it.selected && it.selectedFiles.length > 0
    )
    if (ready.length === 0) return

    // The form backfills saveDir asynchronously after mount. If the user
    // races ahead of that, fall back to querying the default dir directly.
    let saveDir = getValues('saveDir')
    if (!saveDir) {
      try {
        const settings = (await transport.invoke(Queries.GetSettings)) as {
          app?: { defaultSaveDir?: string }
        }
        saveDir = settings?.app?.defaultSaveDir ?? ''
      } catch {
        saveDir = ''
      }
    }
    if (!saveDir) {
      platform.notify('error', 'task.add.createFailed')
      return
    }

    setSubmitting(true)
    try {
      let ok = 0
      let fail = 0
      const dl = parseLimit(dlLimit, true)
      const ul = parseLimit(ulLimit, true)
      const ratio = parseLimit(seedRatio)
      for (const it of ready) {
        if (it.status !== 'ready') continue
        try {
          await transport.invoke(Commands.CreateTask, {
            type: 'bt',
            payload: { kind: 'torrent-base64', base64: it.base64 },
            selectedFiles: it.selectedFiles,
            saveDir,
            displayName: it.displayName.trim() || it.meta.name,
            dlLimit: dl,
            ulLimit: ul,
            seedRatio: ratio,
          })
          ok++
        } catch {
          fail++
        }
      }
      platform.notify(fail > 0 ? 'warn' : 'info', 'task.add.batchDone', {
        ok,
        fail,
      })
      if (ok > 0) onDone()
    } finally {
      setSubmitting(false)
    }
  }, [items, getValues, platform, onDone, dlLimit, ulLimit, seedRatio])

  return (
    <>
      <div
        data-adaptive-content
        className="flex max-h-[calc(100vh-40px)] flex-col overflow-y-auto"
      >
        <div className="mb-16 px-4 py-2">
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium">
              {t('task.add.batchTitle', { count: selectedCount })}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleAll}
                disabled={submitting}
                aria-label={t('task.torrent.selectAll')}
              />
              <span>{t('task.torrent.selectAll')}</span>
            </div>
          </div>

          <div className="mt-2 flex min-h-0 flex-col gap-2">
            {items.map((item, index) =>
              item.status === 'error' ? (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5"
                >
                  <input type="checkbox" checked={false} disabled />
                  <span
                    className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
                    <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('task.add.batchParseFailed')}
                  </span>
                </div>
              ) : (
                <div
                  key={item.meta.infoHash}
                  className="rounded-md border border-border px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(index)}
                      disabled={submitting}
                    />
                    <Input
                      value={item.displayName}
                      onChange={(e) => updateDisplayName(index, e.target.value)}
                      placeholder={item.meta.name}
                      disabled={submitting}
                      className="h-7 min-w-0 flex-1 text-sm"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatBytes(item.meta.totalSize)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      disabled={submitting}
                      className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-150',
                          expanded[index] && 'rotate-90'
                        )}
                        aria-hidden="true"
                      />
                      {t('task.add.batchFiles', {
                        count: item.meta.files.length,
                      })}
                    </button>
                  </div>
                  {expanded[index] && (
                    <div className="mt-1.5 h-40 overflow-hidden rounded-md border border-border">
                      <FileList
                        files={item.meta.files}
                        selectedIndices={item.selectedFiles}
                        onSelectionChange={(indices) =>
                          updateSelectedFiles(index, indices)
                        }
                      />
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          <div className="mt-2 space-y-2">
            <DirectoryPicker
              name="saveDir"
              variant="compact"
              prefixLabel={t('task.add.saveTo')}
              placeholder={t('task.add.saveDirEmpty')}
            />
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent dark:hover:bg-transparent"
                  />
                }
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-150',
                    advancedOpen && 'rotate-90'
                  )}
                  aria-hidden="true"
                />
                {t('task.add.advanced')}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 ml-1.5 space-y-2 border-l-2 border-border pl-3">
                <div className="grid grid-cols-[5rem_1fr] items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t('task.add.dlLimit')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={dlLimit}
                    onChange={(e) => setDlLimit(e.target.value)}
                    placeholder="KB/s"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[5rem_1fr] items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t('task.add.ulLimit')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={ulLimit}
                    onChange={(e) => setUlLimit(e.target.value)}
                    placeholder="KB/s"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[5rem_1fr] items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t('task.add.seedRatio')}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={seedRatio}
                    onChange={(e) => setSeedRatio(e.target.value)}
                    placeholder={t('task.add.unlimited')}
                    className="h-8 text-xs"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
      <div className="fixed left-0 bottom-0 w-full shrink-0 border-t-[0.5px] border-border bg-background px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={downloadableCount === 0 || submitting}
            className="gap-2"
          >
            <span>
              {submitting
                ? t('task.add.adding')
                : `${t('common.download')} (${downloadableCount})`}
            </span>
          </Button>
        </div>
      </div>
    </>
  )
}

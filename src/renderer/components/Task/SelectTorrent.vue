<template>
  <el-upload
    class="upload-torrent"
    drag
    action="/"
    v-if="isTorrentsEmpty"
    :limit="1"
    :multiple="true"
    accept=".torrent"
    :on-change="handleChange"
    :on-exceed="handleExceed"
    :auto-upload="false"
    :show-file-list="false">
    <i class="upload-inbox-icon"><mo-icon name="inbox" width="24" height="24" /></i>
    <div class="el-upload__text">
      {{ $t('task.select-torrent') }}
      <div class="torrent-name" v-if="name">{{ name }}</div>
    </div>
  </el-upload>
  <div
    class="selective-torrent"
    v-else
  >
    <div class="torrent-toolbar">
      <span class="torrent-toolbar-icon" aria-hidden="true">
        <mo-icon name="inbox" width="16" height="16" />
      </span>
      <div class="torrent-toolbar-copy">
        <el-tooltip class="item" effect="dark" :content="toolbarTitle" placement="top">
          <span class="torrent-toolbar-title">{{ toolbarTitle }}</span>
        </el-tooltip>
        <span v-if="isBatch" class="torrent-toolbar-summary">
          <span class="torrent-count-badge">{{ batchTorrentItems.length || torrents.length }}</span>
          <span class="toolbar-summary-separator">·</span>
          <span>{{ batchTotalSize | bytesToSize }}</span>
        </span>
      </div>
      <button
        type="button"
        class="torrent-clear-button"
        :title="$t('task.delete-task')"
        :aria-label="$t('task.delete-task')"
        @click="handleTrashClick"
      >
          <mo-icon name="trash" width="14" height="14" />
      </button>
    </div>
    <el-collapse
      v-if="isBatch"
      v-model="activeBatchTorrentKeys"
      class="batch-torrent-list"
    >
      <el-collapse-item
        v-for="(torrentItem, index) in batchTorrentItems"
        :key="torrentItem.identity"
        :name="torrentItem.identity"
        :disabled="!torrentItem.valid"
        class="batch-torrent-card"
      >
        <template slot="title">
          <span
            :class="['torrent-index', { 'is-invalid': !torrentItem.valid }]"
            aria-hidden="true"
          >
            {{ torrentItem.valid ? index + 1 : '×' }}
          </span>
          <span class="batch-torrent-copy">
            <el-tooltip
              effect="dark"
              :content="torrentItem.name"
              placement="top"
            >
              <span :class="['batch-torrent-title', { 'invalid-torrent': !torrentItem.valid }]">
                {{ torrentItem.name }}
              </span>
            </el-tooltip>
            <span
              v-if="torrentItem.sourceName !== torrentItem.name"
              class="batch-torrent-source"
            >
              {{ torrentItem.sourceName }}
            </span>
          </span>
          <span v-if="torrentItem.valid" class="batch-torrent-meta">
            <span class="file-count-chip">
              <span class="file-count-glyph" aria-hidden="true"></span>
              {{ torrentItem.files.length }}
            </span>
            <span class="batch-torrent-size">{{ torrentItem.length | bytesToSize }}</span>
          </span>
        </template>
        <mo-task-files
          v-if="torrentItem.valid"
          ref="batchTorrentFileLists"
          mode="ADD"
          :files="torrentItem.files"
          :height="200"
          @selection-change="handleBatchFileSelectionChange(torrentItem, $event)"
        />
      </el-collapse-item>
    </el-collapse>
    <mo-task-files
      v-if="!isBatch"
      ref="torrentFileList"
      mode="ADD"
      :files="files"
      :height="200"
      @selection-change="handleSelectionChange"
    />
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import { remote } from 'parse-torrent'
  import TaskFiles from '@/components/TaskDetail/TaskFiles'
  import '@/components/Icons/inbox'
  import {
    EMPTY_STRING,
    NONE_SELECTED_FILES,
    SELECTED_ALL_FILES
  } from '@shared/constants'
  import {
    buildFileList,
    listTorrentFiles,
    bytesToSize,
    getAsBase64,
    getTorrentFileKey,
    removeExtensionDot
  } from '@shared/utils'

  export default {
    name: 'mo-select-torrent',
    components: {
      [TaskFiles.name]: TaskFiles
    },
    filters: {
      bytesToSize,
      removeExtensionDot
    },
    props: {
    },
    data () {
      return {
        name: EMPTY_STRING,
        currentTorrent: EMPTY_STRING,
        batchTorrentItems: [],
        activeBatchTorrentKeys: [],
        forceBatchMode: false,
        files: [],
        selectedFiles: []
      }
    },
    computed: {
      ...mapState('app', {
        torrents: state => state.addTaskTorrents
      }),
      ...mapState('preference', {
        config: state => state.config
      }),
      isTorrentsEmpty () {
        return this.torrents.length === 0
      },
      isBatch () {
        return this.torrents.length > 1 || this.forceBatchMode
      },
      toolbarTitle () {
        return this.isBatch ? this.$t('task.torrent-task') : this.name
      },
      batchTotalSize () {
        return this.batchTorrentItems.reduce((total, item) => {
          return total + (item.valid ? item.length : 0)
        }, 0)
      }
    },
    watch: {
      torrents (fileList) {
        if (fileList.length === 0) {
          this.reset()
          return
        }

        if (fileList.length > 1) {
          this.loadBatchTorrents(fileList)
          return
        }

        const file = fileList[0]
        if (!file.raw) {
          this.showInvalidSingleTorrent(file)
          return
        }

        this.$emit('loading-change', true)
        remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
          if (this.torrents !== fileList) {
            return
          }
          if (err) {
            this.showInvalidSingleTorrent(file)
            return
          }

          this.forceBatchMode = false
          console.log('[Motrix] parsed torrent: ', parsedTorrent)
          this.files = listTorrentFiles(parsedTorrent.files)
          this.$refs.torrentFileList.toggleAllSelection()

          getAsBase64(file.raw, (torrent) => {
            if (this.torrents !== fileList) {
              return
            }
            this.name = file.name
            this.currentTorrent = torrent
            this.$emit('loading-change', false)
            this.$emit('change', torrent, SELECTED_ALL_FILES)
          }, () => {
            if (this.torrents !== fileList) {
              return
            }
            this.showInvalidSingleTorrent(file)
          })
        })
      }
    },
    methods: {
      loadBatchTorrents (fileList) {
        const previousItems = this.batchTorrentItems
        const previousActiveKeys = this.activeBatchTorrentKeys
        const previousItemMap = previousItems.reduce((result, item) => {
          result[item.identity] = item
          return result
        }, {})
        const torrentItems = new Array(fileList.length)
        let loaded = 0
        this.forceBatchMode = true
        this.$emit('loading-change', true)

        const completeItem = (index, item) => {
          if (this.torrents !== fileList) {
            return
          }

          torrentItems[index] = item
          loaded += 1
          if (loaded !== fileList.length) {
            return
          }

          const seen = new Set()
          const uniqueItems = torrentItems.filter(torrentItem => {
            if (seen.has(torrentItem.identity)) {
              return false
            }
            seen.add(torrentItem.identity)
            return true
          })

          this.batchTorrentItems = uniqueItems
          const validItems = uniqueItems.filter(torrentItem => torrentItem.valid)
          if (previousItems.length === 0) {
            this.activeBatchTorrentKeys = validItems.length > 0
              ? [validItems[0].identity]
              : []
          } else {
            const validKeys = new Set(validItems.map(item => item.identity))
            const retainedKeys = previousActiveKeys.filter(key => validKeys.has(key))
            const newKeys = validItems
              .filter(item => !previousItemMap[item.identity])
              .map(item => item.identity)
            this.activeBatchTorrentKeys = [...retainedKeys, ...newKeys]
          }
          this.$nextTick(() => {
            if (this.torrents !== fileList) {
              return
            }

            this.restoreBatchFileSelections()
            this.$emit('loading-change', false)
          })
        }

        fileList.forEach((file, index) => {
          const fileKey = getTorrentFileKey(file)
          const invalidItem = {
            identity: `file:${fileKey}`,
            uid: file.uid,
            sourceName: file.name,
            name: file.name,
            length: 0,
            files: [],
            torrent: EMPTY_STRING,
            selectFile: NONE_SELECTED_FILES,
            valid: false
          }

          if (!file.raw) {
            completeItem(index, invalidItem)
            return
          }

          remote(file.raw, { timeout: 60 * 1000 }, (err, parsedTorrent) => {
            if (this.torrents !== fileList) {
              return
            }
            if (err) {
              completeItem(index, invalidItem)
              return
            }

            getAsBase64(file.raw, (torrent) => {
              const identity = parsedTorrent.infoHash
                ? `hash:${parsedTorrent.infoHash}`
                : `file:${fileKey}`
              const previousItem = previousItemMap[identity]
              const files = listTorrentFiles(parsedTorrent.files || [])
              completeItem(index, {
                identity,
                uid: file.uid,
                sourceName: file.name,
                name: parsedTorrent.name || file.name,
                length: parsedTorrent.length || files.reduce((total, item) => {
                  return total + item.length
                }, 0),
                files,
                torrent,
                selectFile: previousItem
                  ? previousItem.selectFile
                  : SELECTED_ALL_FILES,
                valid: true
              })
            }, () => {
              completeItem(index, invalidItem)
            })
          })
        })
      },
      showInvalidSingleTorrent (file = {}) {
        const identity = `file:${getTorrentFileKey(file)}`
        this.forceBatchMode = true
        this.batchTorrentItems = [{
          identity,
          uid: file.uid,
          sourceName: file.name,
          name: file.name || this.$t('task.torrent-task'),
          length: 0,
          files: [],
          torrent: EMPTY_STRING,
          selectFile: NONE_SELECTED_FILES,
          valid: false
        }]
        this.activeBatchTorrentKeys = []
        this.$emit('loading-change', false)
        this.$emit('change', EMPTY_STRING, NONE_SELECTED_FILES, [])
      },
      reset () {
        this.name = EMPTY_STRING
        this.currentTorrent = EMPTY_STRING
        this.batchTorrentItems = []
        this.activeBatchTorrentKeys = []
        this.forceBatchMode = false
        this.files = []
        if (this.$refs.torrentFileList) {
          this.$refs.torrentFileList.clearSelection()
        }
        this.$emit('loading-change', false)
        this.$emit('change', EMPTY_STRING, NONE_SELECTED_FILES, [])
      },
      handleChange (file, fileList) {
        this.$store.dispatch('app/addTaskAddTorrents', { fileList })
      },
      handleExceed (files) {
        const fileList = buildFileList(Array.from(files))
        this.$store.dispatch('app/appendTaskAddTorrents', { fileList })
      },
      handleTrashClick () {
        this.$store.dispatch('app/addTaskAddTorrents', { fileList: [] })
      },
      restoreBatchFileSelections () {
        const validItems = this.batchTorrentItems.filter(item => item.valid)
        const fileLists = this.$refs.batchTorrentFileLists || []
        const refs = Array.isArray(fileLists) ? fileLists : [fileLists]
        validItems.forEach((item, index) => {
          const fileList = refs[index]
          if (!fileList) {
            return
          }

          if (item.selectFile === SELECTED_ALL_FILES) {
            fileList.toggleSelection(item.files)
            return
          }
          if (item.selectFile === NONE_SELECTED_FILES) {
            fileList.clearSelection()
            return
          }

          const selectedIndexes = item.selectFile.split(',')
          const selectedFiles = item.files.filter(file => {
            return selectedIndexes.includes(String(file.idx))
          })
          fileList.toggleSelection(selectedFiles)
        })
        this.emitBatchChange()
      },
      handleBatchFileSelectionChange (torrentItem, selectedFileIndex) {
        torrentItem.selectFile = selectedFileIndex
        this.emitBatchChange()
      },
      emitBatchChange () {
        const torrents = this.batchTorrentItems
          .filter(item => item.valid)
          .map(item => ({
            torrent: item.torrent,
            selectFile: item.selectFile
          }))
        this.$emit(
          'change',
          EMPTY_STRING,
          SELECTED_ALL_FILES,
          torrents
        )
      },
      handleSelectionChange (val) {
        const { currentTorrent } = this
        this.$emit('change', currentTorrent, val)
      }
    }
  }
</script>

<style lang="scss">
.upload-torrent {
  width: 100%;
  .el-upload, .el-upload-dragger {
    width: 100%;
  }
  .el-upload-dragger {
    border-radius: 4px;
    padding: 24px;
    height: auto;
  }
  .upload-inbox-icon {
    display: inline-block;
    margin-bottom: 12px;
  }
  .torrent-name {
    margin-top: 4px;
    font-size: $--font-size-small;
    color: $--color-text-secondary;
    line-height: 16px;
  }
}
.selective-torrent {
  .torrent-toolbar {
    display: flex;
    align-items: center;
    min-height: 48px;
    margin-bottom: 12px;
    padding: 8px 10px;
    border: 1px solid rgba(91, 91, 250, 0.12);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(91, 91, 250, 0.075), rgba(91, 91, 250, 0.025));
  }
  .torrent-toolbar-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 30px;
    height: 30px;
    margin-right: 10px;
    color: $--color-primary;
    border-radius: 9px;
    background-color: rgba(91, 91, 250, 0.11);
  }
  .torrent-toolbar-copy {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .torrent-toolbar-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: $--color-text-primary;
    font-size: $--font-size-base;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: -0.01em;
  }
  .torrent-toolbar-summary {
    display: inline-flex;
    align-items: center;
    flex: none;
    margin-left: 10px;
    color: $--color-text-secondary;
    font-size: $--font-size-extra-small;
    line-height: 18px;
  }
  .torrent-count-badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    color: $--color-primary;
    text-align: center;
    font-weight: 600;
    border-radius: 9px;
    background-color: rgba(91, 91, 250, 0.10);
  }
  .toolbar-summary-separator {
    margin: 0 6px;
    color: $--border-color-base;
  }
  .torrent-clear-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 30px;
    height: 30px;
    margin-left: 10px;
    padding: 0;
    color: $--color-text-secondary;
    border: 0;
    border-radius: 9px;
    outline: none;
    background: transparent;
    cursor: pointer;
    transition: color 140ms ease-out, background-color 140ms ease-out, transform 100ms ease-out;
    &:hover {
      color: $--color-danger;
      background-color: rgba(245, 108, 108, 0.09);
    }
    &:active {
      transform: scale(0.92);
    }
    &:focus-visible {
      box-shadow: 0 0 0 3px rgba(91, 91, 250, 0.18);
    }
  }
  .batch-torrent-list.el-collapse {
    max-height: 420px;
    padding: 2px 3px 4px;
    border: 0;
    overflow-y: auto;
  }
  .batch-torrent-card {
    margin-bottom: 10px;
    border: 1px solid $--border-color-lighter;
    border-radius: 12px;
    overflow: hidden;
    background-color: rgba(255, 255, 255, 0.94);
    box-shadow: 0 1px 2px rgba(20, 24, 40, 0.025), 0 5px 18px rgba(20, 24, 40, 0.035);
    transition: border-color 180ms ease-out, box-shadow 180ms ease-out, transform 180ms ease-out;
    &:last-child {
      margin-bottom: 0;
    }
    &:hover:not(.is-disabled) {
      border-color: rgba(91, 91, 250, 0.26);
      box-shadow: 0 2px 4px rgba(20, 24, 40, 0.035), 0 9px 24px rgba(20, 24, 40, 0.065);
      transform: translateY(-1px);
    }
    &.is-active {
      border-color: rgba(91, 91, 250, 0.34);
      box-shadow: 0 2px 4px rgba(20, 24, 40, 0.035), 0 10px 28px rgba(91, 91, 250, 0.085);
    }
    &.is-disabled {
      background-color: $--background-color-base;
    }
    .el-collapse-item__header {
      height: 66px;
      padding: 7px 12px;
      color: $--color-text-primary;
      border: 0;
      background: transparent;
      line-height: normal;
      transition: background-color 140ms ease-out, transform 100ms ease-out;
      &:hover {
        background-color: rgba(91, 91, 250, 0.025);
      }
      &:active {
        transform: scale(0.997);
      }
    }
    .el-collapse-item__arrow {
      flex: none;
      margin: 0 3px 0 10px;
      color: $--color-text-placeholder;
      font-weight: 600;
    }
    .el-collapse-item__wrap {
      border: 0;
      background: transparent;
    }
    .el-collapse-item__content {
      padding: 0 12px 12px;
    }
    .mo-table-wrapper {
      border-radius: 9px 9px 0 0;
    }
    .file-filters {
      margin-top: 0;
      padding: 8px 3px 0;
    }
  }
  .torrent-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 28px;
    height: 28px;
    margin-right: 11px;
    color: $--color-primary;
    font-size: $--font-size-extra-small;
    font-weight: 700;
    border-radius: 9px;
    background-color: rgba(91, 91, 250, 0.10);
    &.is-invalid {
      color: $--color-danger;
      background-color: rgba(245, 108, 108, 0.09);
    }
  }
  .batch-torrent-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }
  .batch-torrent-title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: $--color-text-primary;
    font-size: $--font-size-small;
    font-weight: 600;
    line-height: 19px;
    letter-spacing: -0.005em;
  }
  .batch-torrent-source {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: $--color-text-secondary;
    font-size: 11px;
    line-height: 16px;
  }
  .batch-torrent-meta {
    display: inline-flex;
    align-items: center;
    flex: none;
    margin-left: 12px;
    color: $--color-text-secondary;
    font-size: $--font-size-extra-small;
    font-variant-numeric: tabular-nums;
    line-height: 20px;
  }
  .file-count-chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 7px;
    border-radius: 7px;
    background-color: $--background-color-base;
  }
  .file-count-glyph {
    position: relative;
    z-index: 0;
    width: 9px;
    height: 11px;
    margin-right: 5px;
    border: 1px solid currentColor;
    border-radius: 2px;
    opacity: 0.7;
    &::before {
      position: absolute;
      z-index: -1;
      top: -3px;
      left: 2px;
      width: 7px;
      height: 9px;
      border: 1px solid currentColor;
      border-radius: 2px;
      content: '';
    }
  }
  .batch-torrent-size {
    min-width: 62px;
    margin-left: 10px;
    text-align: right;
  }
  .invalid-torrent {
    color: $--color-text-secondary;
  }
}

.theme-dark .selective-torrent {
  .torrent-toolbar {
    border-color: rgba(255, 255, 255, 0.075);
    background: linear-gradient(135deg, rgba(91, 91, 250, 0.16), rgba(91, 91, 250, 0.055));
  }
  .torrent-toolbar-icon,
  .torrent-count-badge,
  .torrent-index {
    background-color: rgba(91, 91, 250, 0.22);
  }
  .torrent-toolbar-title,
  .batch-torrent-title {
    color: $--dk-font-color-base;
  }
  .toolbar-summary-separator {
    color: $--dk-border-color-base;
  }
  .torrent-clear-button {
    color: $--dk-table-text-color;
    &:hover {
      color: #ff8585;
      background-color: rgba(245, 108, 108, 0.14);
    }
  }
  .batch-torrent-card {
    border-color: rgba(255, 255, 255, 0.09);
    background-color: rgba(42, 43, 44, 0.96);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.16);
    &:hover:not(.is-disabled) {
      border-color: rgba(117, 117, 255, 0.46);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
    }
    &.is-active {
      border-color: rgba(117, 117, 255, 0.52);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
    }
    &.is-disabled {
      background-color: rgba(31, 33, 34, 0.72);
    }
    .el-collapse-item__header {
      color: $--dk-font-color-base;
      &:hover {
        background-color: rgba(255, 255, 255, 0.025);
      }
    }
    .el-collapse-item__wrap {
      background-color: transparent;
    }
    .mo-table-wrapper {
      border-color: $--dk-table-border-color;
    }
  }
  .batch-torrent-source,
  .batch-torrent-meta,
  .torrent-toolbar-summary {
    color: $--dk-table-text-color;
  }
  .file-count-chip {
    background-color: rgba(255, 255, 255, 0.065);
  }
  .torrent-index.is-invalid {
    color: #ff8585;
    background-color: rgba(245, 108, 108, 0.15);
  }
}

@media (max-width: 520px) {
  .selective-torrent {
    .torrent-toolbar-summary,
    .file-count-chip,
    .batch-torrent-source {
      display: none;
    }
    .batch-torrent-size {
      min-width: 0;
      margin-left: 8px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .selective-torrent {
    .torrent-clear-button,
    .batch-torrent-card,
    .batch-torrent-card .el-collapse-item__header {
      transition: none;
      transform: none !important;
    }
  }
}
</style>
